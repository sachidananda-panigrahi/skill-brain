/**
 * Pure TF-IDF cosine similarity engine.
 * No external dependencies. Deterministic output.
 *
 * Usage:
 *   const idx = buildIndex(docs);
 *   cosineQuery(idx, 'react performance', 5);
 *   cosineBetween(idx, 'id-a', 'id-b');
 */

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'it','its','this','that','these','those','i','you','he','she','we','they',
  'not','no','as','if','so','than','then','when','where','which','who','whom',
  'how','all','each','every','both','few','more','most','other','some','such',
  'use','using','used','can','make','making','made'
]);

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * @param {{ id: string, text: string }[]} docs
 * @returns {{ N: number, idf: Map<string,number>, vectors: Map<string, Map<string,number>>, norms: Map<string,number> }}
 */
function buildIndex(docs) {
  const N = docs.length;
  if (N === 0) return { N, idf: new Map(), vectors: new Map(), norms: new Map() };

  // Document frequency per term
  const df = new Map();
  const tokenized = docs.map(doc => {
    const tokens = tokenize(doc.text);
    const seen = new Set(tokens);
    seen.forEach(t => df.set(t, (df.get(t) || 0) + 1));
    return { id: doc.id, tokens };
  });

  // IDF: log((1+N)/(1+df)) + 1  (smooth variant)
  const idf = new Map();
  df.forEach((freq, term) => {
    idf.set(term, Math.log((1 + N) / (1 + freq)) + 1);
  });

  // TF-IDF vectors (sparse) + precomputed L2 norms
  const vectors = new Map();
  const norms = new Map();

  tokenized.forEach(({ id, tokens }) => {
    const tf = new Map();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
    const len = tokens.length || 1;

    const vec = new Map();
    tf.forEach((count, term) => {
      const weight = (count / len) * (idf.get(term) || 0);
      if (weight > 0) vec.set(term, weight);
    });

    let norm = 0;
    vec.forEach(w => { norm += w * w; });
    norms.set(id, Math.sqrt(norm));
    vectors.set(id, vec);
  });

  return { N, idf, vectors, norms };
}

/**
 * @param {{ idf: Map, vectors: Map, norms: Map }} index
 * @param {string} queryText
 * @param {number} k
 * @returns {{ id: string, score: number }[]}
 */
function cosineQuery(index, queryText, k = 5) {
  const { idf, vectors, norms } = index;
  const qTokens = tokenize(queryText);
  if (qTokens.length === 0) return [];

  // Build query TF-IDF vector
  const qTf = new Map();
  qTokens.forEach(t => qTf.set(t, (qTf.get(t) || 0) + 1));
  const qLen = qTokens.length;

  const qVec = new Map();
  qTf.forEach((count, term) => {
    const termIdf = idf.get(term) || 0;
    const weight = (count / qLen) * termIdf;
    if (weight > 0) qVec.set(term, weight);
  });

  let qNorm = 0;
  qVec.forEach(w => { qNorm += w * w; });
  qNorm = Math.sqrt(qNorm);
  if (qNorm === 0) return [];

  const scores = [];
  vectors.forEach((docVec, id) => {
    const docNorm = norms.get(id) || 0;
    if (docNorm === 0) return;

    let dot = 0;
    qVec.forEach((qWeight, term) => {
      const dWeight = docVec.get(term);
      if (dWeight !== undefined) dot += qWeight * dWeight;
    });

    if (dot > 0) {
      scores.push({ id, score: dot / (qNorm * docNorm) });
    }
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * @param {{ vectors: Map, norms: Map }} index
 * @param {string} idA
 * @param {string} idB
 * @returns {number}
 */
function cosineBetween(index, idA, idB) {
  const { vectors, norms } = index;
  const vecA = vectors.get(idA);
  const vecB = vectors.get(idB);
  if (!vecA || !vecB) return 0;

  const normA = norms.get(idA) || 0;
  const normB = norms.get(idB) || 0;
  if (normA === 0 || normB === 0) return 0;

  let dot = 0;
  vecA.forEach((w, term) => {
    const wb = vecB.get(term);
    if (wb !== undefined) dot += w * wb;
  });

  return dot / (normA * normB);
}

module.exports = { tokenize, buildIndex, cosineQuery, cosineBetween };
