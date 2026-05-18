'use strict';

/**
 * skillsInitializer.js
 *
 * Zero-config SKILLS.md generator for projects that don't use the MCP server.
 *
 * Usage:
 *   skill-brain init [path]          — generates SKILLS.md in target project
 *   skill-brain generate [path]      — alias
 *
 * What it does:
 *   1. Detect the project's tech stack from package.json + components.json
 *   2. Select the relevant prebuilt skill files for that stack
 *   3. Load + deduplicate skills from those files
 *   4. Write a focused SKILLS.md to the project root
 *   5. Register the output path so skill-brain auto-regenerates on CRUD changes
 */

const fs = require('fs');
const path = require('path');
const { skillToMarkdown } = require('../utils/skillsExporter');

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'General';
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

const PREBUILT_DIR = path.join(__dirname, '../../skills/prebuilt');
const CONFIG_PATH  = path.join(__dirname, '../../skills/config.json');

// Map of stack detection keys → relevant skill file names
const STACK_SKILL_MAP = {
  always:           ['code-quality-security.json', 'web-accessibility-a11y.json'],
  hasReact:         ['react-best-practices.json', 'react-advanced.json', 'react-19-patterns.json'],
  hasTypescript:    ['typescript-strict-patterns.json'],
  hasNextjs:        ['nextjs-app-router.json', 'nextjs-performance.json'],
  hasTailwind:      ['shadcn-tailwind-ui.json'],
  hasShadcn:        ['shadcn-tailwind-ui.json'],
  hasZustand:       ['state-management-modern.json'],
  hasTanstackQuery: ['state-management-modern.json'],
  hasJotai:         ['state-management-modern.json'],
  hasVite:          ['vite-build-tooling.json'],
  hasVitest:        ['web-testing-modern.json'],
  hasPlaywright:    ['web-testing-modern.json'],
  hasJest:          ['testing-verification.json'],
  hasNodeApi:       ['nodejs-api-patterns.json'],
};

/**
 * Detect the project's tech stack from package.json and optional config files.
 * @param {string} projectRoot - Absolute path to project root
 * @returns {object} stackInfo
 */
function detectStack(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* no package.json */ }

  const deps = {
    ...((pkg.dependencies) || {}),
    ...((pkg.devDependencies) || {}),
    ...((pkg.peerDependencies) || {}),
  };
  const has = (name) => name in deps;
  const hasAny = (...names) => names.some(n => has(n));

  // Detect shadcn by components.json presence (more reliable than package check)
  const hasShadcnConfig = fs.existsSync(path.join(projectRoot, 'components.json'));

  return {
    name:             pkg.name || path.basename(projectRoot),
    version:          pkg.version || '0.0.0',
    hasReact:         hasAny('react', 'react-dom'),
    hasNextjs:        has('next'),
    hasTypescript:    hasAny('typescript', '@types/react', '@types/node'),
    hasTailwind:      hasAny('tailwindcss', '@tailwindcss/vite', '@tailwindcss/postcss'),
    hasShadcn:        hasShadcnConfig || has('@shadcn/ui'),
    hasZustand:       has('zustand'),
    hasTanstackQuery: hasAny('@tanstack/react-query', '@tanstack/query-core'),
    hasJotai:         has('jotai'),
    hasVite:          has('vite') && !has('next'), // Next.js uses its own bundler
    hasVitest:        has('vitest'),
    hasPlaywright:    hasAny('@playwright/test', 'playwright'),
    hasJest:          hasAny('jest', '@jest/core'),
    hasNodeApi:       hasAny('express', 'fastify', 'hono', 'koa'),
  };
}

/**
 * Select relevant skill file names based on detected stack.
 * @param {object} stackInfo
 * @returns {string[]} Deduplicated list of file names
 */
function selectSkillFiles(stackInfo) {
  const selected = new Set();

  // Always include
  for (const f of STACK_SKILL_MAP.always) selected.add(f);

  // Conditionally include based on stack
  for (const [key, files] of Object.entries(STACK_SKILL_MAP)) {
    if (key === 'always') continue;
    if (stackInfo[key]) {
      for (const f of files) selected.add(f);
    }
  }

  return [...selected];
}

/**
 * Load skills from a list of prebuilt file names. Deduplicates by id.
 * @param {string[]} fileNames
 * @returns {object[]} skills
 */
function loadSkillsFromFiles(fileNames) {
  const seen = new Set();
  const skills = [];

  for (const filename of fileNames) {
    const filePath = path.join(PREBUILT_DIR, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const content = JSON.parse(raw);
      const arr = Array.isArray(content) ? content
        : Array.isArray(content.skills) ? content.skills
        : [];
      for (const s of arr) {
        if (s.id && !seen.has(s.id)) {
          seen.add(s.id);
          skills.push(s);
        }
      }
    } catch { /* skip malformed file */ }
  }

  return skills;
}

/**
 * Format skills as a project-specific SKILLS.md.
 * @param {object[]} skills
 * @param {object} stackInfo
 * @param {string} version - skill-brain version
 * @returns {string}
 */
function toProjectSkillsMd(skills, stackInfo, version) {
  const detectedStack = buildStackLabel(stackInfo);
  const stackKeys = Object.keys(stackInfo).filter(k => k.startsWith('has') && stackInfo[k]).map(k => k.slice(3).toLowerCase());
  const metaComment = `<!-- skill-brain:generated skill-brain:version=${version} skill-brain:stack=${stackKeys.join(',')} -->`;

  const lines = [];
  lines.push(metaComment);
  lines.push(`# Web UI Skills — ${stackInfo.name}`);
  lines.push('');
  lines.push(`> Auto-generated by [skill-brain](https://github.com/snpanigrahi88/skill-brain) on ${new Date().toISOString().split('T')[0]}.`);
  lines.push(`> Provides coding standards and patterns for AI assistants (Claude Code, Cursor, Copilot Chat, Repomix).`);
  lines.push(`> Detected stack: **${detectedStack}**`);
  lines.push(`> Refresh: \`npx skill-brain init\``);
  lines.push('');

  if (!skills.length) {
    lines.push('_No skills matched the detected stack._');
    return lines.join('\n');
  }

  // Table of contents grouped by domain
  const grouped = groupBy(skills, 'domain');
  const domains = Object.keys(grouped).sort();

  lines.push('## Table of Contents');
  lines.push('');
  for (const d of domains) {
    const anchor = d.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`- [${d}](#${anchor}) — ${grouped[d].length} skills`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const d of domains) {
    lines.push(`## ${d}`);
    lines.push('');
    for (const skill of grouped[d]) {
      lines.push(skillToMarkdown(skill));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Build a human-readable stack label.
 */
function buildStackLabel(stackInfo) {
  const parts = [];
  if (stackInfo.hasNextjs)        parts.push('Next.js');
  else if (stackInfo.hasReact)    parts.push('React');
  if (stackInfo.hasTypescript)    parts.push('TypeScript');
  if (stackInfo.hasTailwind)      parts.push('Tailwind CSS');
  if (stackInfo.hasShadcn)        parts.push('shadcn/ui');
  if (stackInfo.hasTanstackQuery) parts.push('TanStack Query');
  if (stackInfo.hasZustand)       parts.push('Zustand');
  if (stackInfo.hasJotai)         parts.push('Jotai');
  if (stackInfo.hasVite)          parts.push('Vite');
  if (stackInfo.hasVitest)        parts.push('Vitest');
  if (stackInfo.hasPlaywright)    parts.push('Playwright');
  if (stackInfo.hasNodeApi)       parts.push('Node API');
  return parts.length ? parts.join(', ') : 'Generic Web';
}

/**
 * Load or initialize skills/config.json.
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch { /* corrupt config */ }
  return { skillsMdPaths: [] };
}

/**
 * Save skills/config.json.
 */
function saveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

/**
 * Register an output path so skill-brain auto-regenerates it on CRUD changes.
 * @param {string} projectRoot
 * @param {string} outputPath
 */
function registerSkillsMdPath(projectRoot, outputPath) {
  const config = loadConfig();
  config.skillsMdPaths = config.skillsMdPaths || [];

  // Remove stale entry for same projectRoot, then add fresh one
  config.skillsMdPaths = config.skillsMdPaths.filter(e => e.projectRoot !== projectRoot);
  config.skillsMdPaths.push({
    projectRoot,
    outputPath,
    registeredAt: new Date().toISOString(),
  });

  saveConfig(config);
}

/**
 * Regenerate all registered SKILLS.md paths. Called after CRUD changes.
 * Non-blocking — errors are swallowed so saves are never blocked.
 */
async function regenerateAll() {
  const config = loadConfig();
  const entries = config.skillsMdPaths || [];

  for (const entry of entries) {
    try {
      // Re-run init for the registered project root, skip re-registering
      await generateSkillsMd(entry.projectRoot, {
        outputPath: entry.outputPath,
        register: false,
      });
    } catch { /* non-fatal — don't block saves */ }
  }
}

/**
 * Main entry point: detect stack → select skills → generate SKILLS.md.
 *
 * @param {string} targetDir - Absolute path to the target project
 * @param {object} options
 * @param {string} [options.outputPath]   - Override output file path
 * @param {'md'|'json'} [options.format]  - Output format (default 'md')
 * @param {boolean} [options.register]    - Register for auto-update (default true)
 * @returns {Promise<{outputPath: string, total: number, stack: string[], stackInfo: object}>}
 */
async function generateSkillsMd(targetDir, options = {}) {
  const {
    outputPath: customOutput,
    format = 'md',
    register = true,
  } = options;

  const absTarget = path.resolve(targetDir);
  const stackInfo = detectStack(absTarget);
  const fileNames = selectSkillFiles(stackInfo);
  const skills    = loadSkillsFromFiles(fileNames);

  // Determine output path
  const ext = format === 'json' ? 'SKILLS.json' : 'SKILLS.md';
  const outputPath = customOutput ? path.resolve(customOutput) : path.join(absTarget, ext);

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Get version from package.json
  let version = '1.0.0';
  try {
    const pkgRaw = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
    version = JSON.parse(pkgRaw).version || version;
  } catch { /* ok */ }

  // Generate content
  let content;
  if (format === 'json') {
    content = JSON.stringify({
      generated: new Date().toISOString(),
      version,
      stack: buildStackLabel(stackInfo),
      total: skills.length,
      skills,
    }, null, 2);
  } else {
    content = toProjectSkillsMd(skills, stackInfo, version);
  }

  fs.writeFileSync(outputPath, content, 'utf8');

  // Update AGENTS.md with @SKILLS.md reference
  const agentsMdPath = path.join(absTarget, 'AGENTS.md');
  const relSkillsPath = path.relative(absTarget, outputPath);
  const importLine = `@${relSkillsPath}`;
  try {
    if (fs.existsSync(agentsMdPath)) {
      const existing = fs.readFileSync(agentsMdPath, 'utf8');
      if (!existing.includes(importLine)) {
        fs.writeFileSync(agentsMdPath, existing.trimEnd() + '\n' + importLine + '\n', 'utf8');
      }
    } else {
      fs.writeFileSync(agentsMdPath, `# Agent Skills\n\n${importLine}\n`, 'utf8');
    }
  } catch { /* non-fatal */ }

  // Register for auto-update
  if (register) {
    registerSkillsMdPath(absTarget, outputPath);
  }

  const stackKeys = Object.keys(stackInfo)
    .filter(k => k.startsWith('has') && stackInfo[k])
    .map(k => k.slice(3));

  return { outputPath, total: skills.length, stack: stackKeys, stackInfo };
}

module.exports = {
  detectStack,
  selectSkillFiles,
  loadSkillsFromFiles,
  generateSkillsMd,
  regenerateAll,
  registerSkillsMdPath,
};
