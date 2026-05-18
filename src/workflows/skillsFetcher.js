'use strict';

/**
 * skillsFetcher.js
 *
 * On-demand skill fetcher from skills.sh / vercel-labs/agent-skills.
 * Converts SKILL.md format (YAML frontmatter + markdown body) to skill-brain JSON.
 * Caches results locally in skills/prebuilt/fetched/{techName}.json.
 *
 * Usage:
 *   skill-brain fetch [--stack=nextjs,react,tailwind] [--path=.]
 *
 * No network calls happen during normal skill-brain operation.
 * Only triggered by explicit `skill-brain fetch` command.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const FETCHED_DIR = path.join(__dirname, '../../skills/prebuilt/fetched');

// Map of tech name → GitHub raw content directory URL (vercel-labs/agent-skills)
// These are well-known, stable open-source skill collections
const REMOTE_SOURCES = {
  nextjs: {
    repo: 'vercel-labs/agent-skills',
    dir: 'nextjs',
    domain: 'Next.js App Router',
    tags: ['nextjs', 'react', 'app-router'],
  },
  react: {
    repo: 'vercel-labs/agent-skills',
    dir: 'react',
    domain: 'React.js / TypeScript',
    tags: ['react', 'jsx', 'hooks'],
  },
  tailwind: {
    repo: 'vercel-labs/agent-skills',
    dir: 'tailwind',
    domain: 'shadcn/ui + Tailwind',
    tags: ['tailwind', 'css', 'styling'],
  },
  shadcn: {
    repo: 'vercel-labs/agent-skills',
    dir: 'shadcn-ui',
    domain: 'shadcn/ui + Tailwind',
    tags: ['shadcn', 'radix', 'components'],
  },
  vercel: {
    repo: 'vercel-labs/agent-skills',
    dir: 'vercel',
    domain: 'CI/CD Pipelines',
    tags: ['vercel', 'deployment', 'edge'],
  },
};

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Fetch a URL and return the body as a string.
 * @param {string} url
 * @returns {Promise<string>}
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'skill-brain-fetcher/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetchUrl(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * List files in a GitHub repo directory via the GitHub API.
 * @param {string} repo  - e.g. 'vercel-labs/agent-skills'
 * @param {string} dir   - e.g. 'nextjs'
 * @returns {Promise<string[]>} Array of .md filenames
 */
async function listGitHubDir(repo, dir) {
  const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${dir}`;
  try {
    const body = await fetchUrl(url);
    const files = JSON.parse(body);
    return files
      .filter(f => f.type === 'file' && f.name.endsWith('.md'))
      .map(f => ({ name: f.name, downloadUrl: f.download_url }));
  } catch (e) {
    return [];
  }
}

/**
 * Parse a SKILL.md file (YAML frontmatter + markdown body) into skill-brain JSON.
 *
 * SKILL.md format:
 * ---
 * name: My Skill Name
 * description: When to use this skill
 * tags: [react, hooks]
 * ---
 * Skill content here...
 *
 * @param {string} content   - Raw .md file content
 * @param {string} filename  - Used for id generation
 * @param {object} defaults  - Default domain/tags/category from source config
 * @returns {object|null} skill-brain skill object, or null if unparseable
 */
function parseMdSkill(content, filename, defaults = {}) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  let meta = {};
  let body = content;

  if (frontmatterMatch) {
    // Simple YAML key: value parser (no full YAML lib needed)
    const yamlLines = frontmatterMatch[1].split('\n');
    for (const line of yamlLines) {
      const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (!m) continue;
      const [, key, val] = m;
      // Handle array syntax: [a, b] or - a
      if (val.startsWith('[') && val.endsWith(']')) {
        meta[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        meta[key] = val.trim().replace(/^['"]|['"]$/g, '');
      }
    }
    body = frontmatterMatch[2].trim();
  }

  const name = meta.name || meta.title || filename.replace(/\.md$/, '').replace(/-/g, ' ');
  if (!name) return null;

  // Generate a stable id from filename
  const id = 'remote-' + filename
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const tags = Array.isArray(meta.tags) ? meta.tags
    : meta.tags ? meta.tags.split(',').map(s => s.trim())
    : defaults.tags || [];

  return {
    id,
    name,
    description: meta.description || meta.desc || `${name} skill from skills.sh`,
    category: meta.category || 'pattern',
    domain: meta.domain || defaults.domain || 'Web Development',
    severity: meta.severity || 'medium',
    tags,
    template: body,
    source: 'remote',
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Cache fetched skills to disk.
 * @param {object[]} skills
 * @param {string} techName
 * @returns {string} output path
 */
function cacheRemoteSkills(skills, techName) {
  if (!fs.existsSync(FETCHED_DIR)) fs.mkdirSync(FETCHED_DIR, { recursive: true });
  const outputPath = path.join(FETCHED_DIR, `${techName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ skills, fetchedAt: new Date().toISOString() }, null, 2), 'utf8');
  return outputPath;
}

/**
 * Fetch skills for a single tech name from the remote source.
 * @param {string} techName
 * @returns {Promise<object[]>} Array of skill-brain skill objects
 */
async function fetchSkillsForTech(techName) {
  const source = REMOTE_SOURCES[techName];
  if (!source) {
    throw new Error(`Unknown tech "${techName}". Available: ${Object.keys(REMOTE_SOURCES).join(', ')}`);
  }

  const files = await listGitHubDir(source.repo, source.dir);
  if (!files.length) {
    // Fallback: try direct known skill file
    const fallbackUrl = `${GITHUB_RAW_BASE}/${source.repo}/main/${source.dir}/.skill.md`;
    try {
      const content = await fetchUrl(fallbackUrl);
      const skill = parseMdSkill(content, `${techName}.md`, source);
      return skill ? [skill] : [];
    } catch { return []; }
  }

  const skills = [];
  for (const file of files) {
    try {
      const content = await fetchUrl(file.downloadUrl);
      const skill = parseMdSkill(content, file.name, source);
      if (skill) skills.push(skill);
    } catch { /* skip individual failed files */ }
  }
  return skills;
}

/**
 * Main fetch entry point: fetch skills for one or more tech names.
 * @param {string[]} techNames  - e.g. ['nextjs', 'react', 'tailwind']
 * @param {object} opts
 * @param {Function} [opts.onProgress]  - Called with (techName, status, count)
 * @returns {Promise<{fetched: object, errors: object}>}
 *   fetched: { techName: { skills, outputPath, count } }
 *   errors:  { techName: errorMessage }
 */
async function fetchSkillsForStack(techNames, opts = {}) {
  const { onProgress = () => {} } = opts;
  const fetched = {};
  const errors  = {};

  const available = Object.keys(REMOTE_SOURCES);
  const targets = techNames
    .map(n => n.toLowerCase().trim())
    .filter(n => {
      if (!available.includes(n)) {
        errors[n] = `Unknown tech (available: ${available.join(', ')})`;
        return false;
      }
      return true;
    });

  for (const tech of targets) {
    onProgress(tech, 'fetching', 0);
    try {
      const skills = await fetchSkillsForTech(tech);
      const outputPath = cacheRemoteSkills(skills, tech);
      fetched[tech] = { skills, outputPath, count: skills.length };
      onProgress(tech, 'done', skills.length);
    } catch (e) {
      errors[tech] = e.message;
      onProgress(tech, 'error', 0);
    }
  }

  return { fetched, errors };
}

/**
 * Auto-detect stack from package.json and fetch relevant remote skills.
 * @param {string} projectRoot
 * @returns {Promise<{fetched, errors}>}
 */
async function fetchSkillsForProject(projectRoot, opts = {}) {
  const { detectStack } = require('./skillsInitializer');
  const stackInfo = detectStack(projectRoot);

  const techMap = {
    hasNextjs:  'nextjs',
    hasReact:   'react',
    hasTailwind: 'tailwind',
    hasShadcn:  'shadcn',
  };

  const techNames = Object.entries(techMap)
    .filter(([key]) => stackInfo[key])
    .map(([, tech]) => tech);

  if (!techNames.length) {
    return { fetched: {}, errors: { _: 'No matching remote skills for detected stack' } };
  }

  return fetchSkillsForStack(techNames, opts);
}

/**
 * List available remote skill sources.
 * @returns {object[]}
 */
function listRemoteSources() {
  return Object.entries(REMOTE_SOURCES).map(([tech, src]) => ({
    tech,
    repo: src.repo,
    dir: src.dir,
    domain: src.domain,
  }));
}

module.exports = {
  fetchSkillsForStack,
  fetchSkillsForProject,
  fetchSkillsForTech,
  parseMdSkill,
  cacheRemoteSkills,
  listRemoteSources,
};
