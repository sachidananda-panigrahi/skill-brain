/**
 * RAG index — dirty-flag lazy cache with TF-IDF + optional embeddings.
 *
 * Public API:
 *   markDirty(projectName?)
 *   search(query, k, projectName?) → Promise<[{skill, score}]>
 *   similar(skillId, k, projectName?) → Promise<[{skill, score}]>
 *
 * Circular dep note: skillEngine is required lazily inside build() so that
 * skillEngine can require ragIndex at module level without a cycle.
 */

const { buildIndex, cosineQuery, cosineBetween } = require('./tfidf');
const { isEnabled, embed, cosineDense } = require('../utils/embeddings');
const { toWeightedText } = require('../utils/toon');
const embedCache = require('../utils/embedCache');

const COMMON_SCOPE = '__common__';

// Cache: scope → { index, embedMap, dirty }
const cache = new Map();

function scopeKey(projectName) {
  return projectName || COMMON_SCOPE;
}

function markDirty(projectName) {
  const key = scopeKey(projectName);
  const entry = cache.get(key);
  if (entry) {
    entry.dirty = true;
  } else {
    cache.set(key, { index: null, embedMap: null, dirty: true });
  }
}

/**
 * Build (or rebuild) the index for the given scope.
 * @param {string|null} projectName
 */
async function build(projectName) {
  const { loadSkills } = require('./skillEngine');
  const skills = loadSkills(projectName);

  // TOON field-weighted text: name×3, tags×2, description×2, template×1
  const docs = skills.map(s => ({
    id: s.id,
    text: toWeightedText(s)
  }));

  const index = buildIndex(docs);
  let embedMap = null;

  if (isEnabled() && docs.length > 0) {
    const diskCache = await embedCache.load();
    const toEmbed = [];
    const toEmbedIdx = [];

    // Only embed skills that changed (cache miss or hash mismatch)
    docs.forEach((d, i) => {
      const skill = skills[i];
      const hash = embedCache.hashSkill(skill);
      const cached = diskCache.get(d.id);
      if (cached && cached.hash === hash) {
        // Cache hit — reuse stored vector
      } else {
        toEmbed.push(d.text);
        toEmbedIdx.push(i);
      }
    });

    // Embed only the changed/new skills
    if (toEmbed.length > 0) {
      const newVecs = await embed(toEmbed);
      if (newVecs && newVecs.length === toEmbed.length) {
        toEmbedIdx.forEach((skillIdx, j) => {
          const skill = skills[skillIdx];
          diskCache.set(skill.id, { hash: embedCache.hashSkill(skill), vec: newVecs[j] });
        });
        await embedCache.save(diskCache);
      }
    }

    // Build embedMap from cache (covers all skills now)
    embedMap = new Map();
    docs.forEach(d => {
      const cached = diskCache.get(d.id);
      if (cached?.vec) embedMap.set(d.id, cached.vec);
    });
    if (embedMap.size === 0) embedMap = null;
  }

  const key = scopeKey(projectName);
  cache.set(key, { index, embedMap, dirty: false, skills });
}

async function ensureFresh(projectName) {
  const key = scopeKey(projectName);
  const entry = cache.get(key);
  if (!entry || entry.dirty || !entry.index) {
    await build(projectName);
  }
}

/**
 * Semantic search across skills.
 * @param {string} query
 * @param {number} k
 * @param {string|null} projectName
 * @returns {Promise<Array<{skill: object, score: number}>>}
 */
async function search(query, k = 5, projectName = null) {
  await ensureFresh(projectName);
  const { index, embedMap, skills } = cache.get(scopeKey(projectName));
  const skillMap = new Map((skills || []).map(s => [s.id, s]));

  let ranked;

  if (embedMap) {
    // Dense embedding search
    const qVec = await embed([query]);
    if (qVec && qVec[0]) {
      const qEmbed = qVec[0];
      const scores = [];
      embedMap.forEach((vec, id) => {
        scores.push({ id, score: cosineDense(qEmbed, vec) });
      });
      ranked = scores
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    } else {
      ranked = cosineQuery(index, query, k);
    }
  } else {
    ranked = cosineQuery(index, query, k);
  }

  return ranked
    .filter(r => skillMap.has(r.id))
    .map(r => ({ skill: skillMap.get(r.id), score: parseFloat(r.score.toFixed(4)) }));
}

/**
 * Find skills similar to a given skill id.
 * @param {string} skillId
 * @param {number} k
 * @param {string|null} projectName
 * @returns {Promise<Array<{skill: object, score: number}>>}
 */
async function similar(skillId, k = 5, projectName = null) {
  await ensureFresh(projectName);
  const { index, embedMap, skills } = cache.get(scopeKey(projectName));
  const skillMap = new Map((skills || []).map(s => [s.id, s]));

  if (!skillMap.has(skillId)) return null;

  let ranked;

  if (embedMap && embedMap.has(skillId)) {
    const sourceVec = embedMap.get(skillId);
    const scores = [];
    embedMap.forEach((vec, id) => {
      if (id === skillId) return;
      scores.push({ id, score: cosineDense(sourceVec, vec) });
    });
    ranked = scores.sort((a, b) => b.score - a.score).slice(0, k);
  } else {
    const allIds = Array.from(index.vectors?.keys() || []).filter(id => id !== skillId);
    const scores = allIds.map(id => ({
      id,
      score: cosineBetween(index, skillId, id)
    }));
    ranked = scores.sort((a, b) => b.score - a.score).slice(0, k);
  }

  return ranked
    .filter(r => skillMap.has(r.id))
    .map(r => ({ skill: skillMap.get(r.id), score: parseFloat(r.score.toFixed(4)) }));
}

/**
 * Search restricted to skills with strong matches in a specific TOON section.
 * @param {string} query
 * @param {'name'|'tags'|'description'|'template'} section
 * @param {number} k
 * @param {string|null} projectName
 * @returns {Promise<Array<{skill: object, score: number}>>}
 */
async function searchBySection(query, section, k = 5, projectName = null) {
  const { sections: toonSections } = require('../utils/toon');
  const results = await search(query, k * 3, projectName);

  const q = query.toLowerCase();
  return results
    .filter(r => {
      const s = r.skill;
      const fieldMap = {
        name: s.name || '',
        tags: Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
        description: s.description || '',
        template: s.template || '',
      };
      const field = fieldMap[section] || '';
      return field.toLowerCase().includes(q) || r.score > 0.3;
    })
    .slice(0, k);
}

module.exports = { markDirty, search, similar, searchBySection };
