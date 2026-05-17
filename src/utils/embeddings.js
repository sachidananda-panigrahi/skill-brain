/**
 * Optional OpenAI embeddings wrapper.
 * Returns null on any failure — caller falls back to TF-IDF automatically.
 * Never throws. Never logs the API key.
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const TIMEOUT_MS = 10_000;

function isEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * @param {string[]} texts
 * @returns {Promise<number[][]|null>}
 */
async function embed(texts) {
  if (!isEnabled() || texts.length === 0) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) return null;

    return json.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cosine similarity between two dense vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineDense(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = { isEnabled, embed, cosineDense };
