'use strict';

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.SKILL_BRAIN_DATA || __dirname;
const CACHE_FILE = path.join(DATA_DIR, '.embedcache.json');

/**
 * Load the embedding cache from disk.
 * @returns {Promise<Map<string, {hash: string, vec: number[]}>>}
 */
async function load() {
  try {
    const raw = await fs.readJson(CACHE_FILE);
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

/**
 * Save the embedding cache to disk.
 * @param {Map<string, {hash: string, vec: number[]}>} map
 */
async function save(map) {
  try {
    const obj = Object.fromEntries(map);
    await fs.writeJson(CACHE_FILE, obj);
  } catch {
    // Non-fatal — next run will re-embed
  }
}

/**
 * Compute a stable hash for a skill to detect changes.
 * @param {object} skill
 * @returns {string}
 */
function hashSkill(skill) {
  const content = [skill.id || '', skill.name || '', skill.template || '', skill.description || ''].join('|');
  return crypto.createHash('sha1').update(content).digest('hex');
}

module.exports = { load, save, hashSkill };
