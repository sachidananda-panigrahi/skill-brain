'use strict';

const path = require('path');

// React component: PascalCase (.tsx/.jsx)
const COMPONENT_RE = /^[A-Z][a-zA-Z0-9]*\.(tsx|jsx)$/;
// Custom hook: use + camelCase (.ts/.js)
const HOOK_RE = /^use[A-Z][a-zA-Z0-9]*\.(ts|js)$/;
// Utility/service: kebab-case (.ts/.js)
const UTILITY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.(ts|js)$/;
// Test files: {name}.test.{ts,js} or {name}.spec.{ts,js}
const TEST_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
// CSS modules: {ComponentName}.module.css
const CSS_MODULE_RE = /^[A-Z][a-zA-Z0-9]*\.module\.css$/;
// Whitespace check
const WHITESPACE_RE = /\s/;

/**
 * Validate a filename against frontend naming conventions.
 * @param {string} filePath
 * @returns {{ valid: boolean, message: string }}
 */
function validate(filePath) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename);

  if (WHITESPACE_RE.test(filename)) {
    return { valid: false, message: `Filename contains whitespace: "${filename}". Use hyphens as word separators.` };
  }

  // Skip dotfiles and config files
  if (filename.startsWith('.') || filename.includes('.config.') || filename.includes('.rc.')) {
    return { valid: true, message: '' };
  }

  // Skip test files — they follow their own convention
  if (TEST_RE.test(filename)) {
    return { valid: true, message: '' };
  }

  // CSS modules
  if (filename.endsWith('.module.css')) {
    if (!CSS_MODULE_RE.test(filename)) {
      return { valid: false, message: `CSS module "${filename}" should be PascalCase: e.g. UserCard.module.css` };
    }
    return { valid: true, message: '' };
  }

  // React components (.tsx/.jsx)
  if (ext === '.tsx' || ext === '.jsx') {
    if (!COMPONENT_RE.test(filename) && !filename.startsWith('index.')) {
      return { valid: false, message: `React component "${filename}" should be PascalCase: e.g. UserCard.tsx` };
    }
    return { valid: true, message: '' };
  }

  // TypeScript/JavaScript files
  if (ext === '.ts' || ext === '.js') {
    // Custom hook
    if (filename.startsWith('use') && filename[3] === filename[3].toUpperCase()) {
      if (!HOOK_RE.test(filename)) {
        return { valid: false, message: `Hook "${filename}" should be useCamelCase: e.g. useFetch.ts` };
      }
      return { valid: true, message: '' };
    }
    // index files are fine
    if (filename.startsWith('index.')) return { valid: true, message: '' };
    // Utilities — should be kebab-case
    if (!UTILITY_RE.test(filename)) {
      return { valid: false, message: `Utility "${filename}" should be kebab-case: e.g. format-date.ts` };
    }
  }

  return { valid: true, message: '' };
}

module.exports = { validate };
