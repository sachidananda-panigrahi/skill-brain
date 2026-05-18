'use strict';

/**
 * Native file-scanning bridge — replaces the former repomix adapter.
 * All operations use built-in Node.js APIs only.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', '.cache', 'coverage', '.turbo']);
const SKIP_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.pdf', '.zip', '.tar', '.gz', '.lock',
  '.mp4', '.mp3', '.wav', '.ogg', '.min.js', '.min.css']);

const SECRET_PATTERNS = [
  { re: /['"]?(sk|pk|rk)-[a-zA-Z0-9]{20,}['"]?/, name: 'API key (sk/pk/rk)' },
  { re: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key' },
  { re: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub PAT' },
  { re: /ghs_[a-zA-Z0-9]{36}/, name: 'GitHub App token' },
  { re: /xox[baprs]-[a-zA-Z0-9-]{10,}/, name: 'Slack token' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, name: 'Private key' },
  { re: /(?:password|passwd|secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*['"][^'"]{12,}['"]/i, name: 'Hardcoded credential' },
  { re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, name: 'JWT token' },
];

function walk(dir, files = [], maxDepth = 10, depth = 0) {
  if (depth > maxDepth) return files;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return files; }
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walk(full, files, maxDepth, depth + 1);
    } else {
      const ext = path.extname(full).toLowerCase();
      if (!SKIP_EXTS.has(ext) && stat.size < 500_000) files.push(full);
    }
  }
  return files;
}

async function collectProjectFiles(projectPath) {
  return walk(projectPath);
}

async function packForIndex(projectPath) {
  const files = walk(projectPath);
  const fileObjs = [];
  let totalSize = 0;
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      fileObjs.push({ path: path.relative(projectPath, f), content });
      totalSize += content.length;
    } catch { /* skip binary/unreadable */ }
  }
  return { files: fileObjs, totalTokens: Math.round(totalSize / 4) };
}

async function securityPreCheck(projectPath) {
  const issues = [];
  const files = walk(projectPath);
  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const { re, name } of SECRET_PATTERNS) {
      if (re.test(content)) {
        issues.push({ file: path.relative(projectPath, file), message: `Possible ${name} detected` });
        break;
      }
    }
  }
  return { passed: issues.length === 0, issues };
}

async function packRemote() {
  return null;
}

function isAvailable() {
  return true;
}

module.exports = { collectProjectFiles, packForIndex, securityPreCheck, packRemote, isAvailable };
