'use strict';

/**
 * Thin adapter between Repomix and skill-brain.
 * Repomix excels at file packing; skill-brain handles metadata extraction.
 * This bridge adopts: file collection, security pre-check, token counting, remote packing.
 *
 * Gracefully degrades if repomix is not installed.
 */

let repomix;
try {
  repomix = require('repomix');
} catch {
  repomix = null;
}

/**
 * Collect project files respecting .gitignore and maxFileSize.
 * Falls back to returning null if repomix not available (caller uses own walker).
 * @param {string} projectPath
 * @param {{ ignore?: string[], include?: string[], maxFileSize?: number }} options
 * @returns {Promise<string[]|null>} Array of file paths, or null if repomix unavailable
 */
async function collectProjectFiles(projectPath, options = {}) {
  if (!repomix) return null;
  try {
    const { collectFiles } = repomix;
    if (!collectFiles) return null;
    return await collectFiles(projectPath, {
      ignore: { useGitignore: true, customPatterns: options.ignore || [] },
      include: options.include || ['**/*'],
    });
  } catch {
    return null;
  }
}

/**
 * Pack a project into structured XML output with token counts.
 * @param {string} projectPath
 * @param {{ removeComments?: boolean }} options
 * @returns {Promise<{files: object[], totalTokens: number, tokensByFile: Map<string,number>}|null>}
 */
async function packForIndex(projectPath, options = {}) {
  if (!repomix) return null;
  try {
    const { pack } = repomix;
    if (!pack) return null;
    const result = await pack(projectPath, {
      output: { style: 'xml', removeComments: options.removeComments ?? false },
      tokenCount: { encoding: 'cl100k_base' },
    });
    return result;
  } catch {
    return null;
  }
}

/**
 * Run Secretlint security pre-check on the project.
 * @param {string} projectPath
 * @returns {Promise<{passed: boolean, issues: Array<{file: string, message: string}>}>}
 */
async function securityPreCheck(projectPath) {
  if (!repomix) return { passed: true, issues: [], note: 'repomix not installed' };
  try {
    // Repomix exposes runSecurityCheck in its core module
    const { runSecurityCheck } = require('repomix/dist/core/security/securityCheck.js');
    if (!runSecurityCheck) return { passed: true, issues: [] };
    const result = await runSecurityCheck(projectPath);
    return {
      passed: !result || result.length === 0,
      issues: Array.isArray(result) ? result : [],
    };
  } catch {
    return { passed: true, issues: [] };
  }
}

/**
 * Pack a remote GitHub repository for indexing.
 * @param {string} url - GitHub repository URL
 * @returns {Promise<{files: object[], totalTokens: number}|null>}
 */
async function packRemote(url) {
  if (!repomix) return null;
  try {
    const { packFromRemote } = repomix;
    if (!packFromRemote) return null;
    return await packFromRemote(url, {
      output: { style: 'xml' },
      tokenCount: { encoding: 'cl100k_base' },
    });
  } catch {
    return null;
  }
}

/**
 * Check if repomix is available.
 * @returns {boolean}
 */
function isAvailable() {
  return repomix !== null;
}

module.exports = { collectProjectFiles, packForIndex, securityPreCheck, packRemote, isAvailable };
