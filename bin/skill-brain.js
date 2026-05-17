#!/usr/bin/env node
'use strict';

/**
 * skill-brain CLI
 * Routes subcommands to existing entry points.
 *
 * Commands:
 *   skill-brain start          → start HTTP server + dashboard
 *   skill-brain mcp            → start MCP stdio server
 *   skill-brain scan <path>    → scan a project and index skills
 *   skill-brain review         → run diff review on current branch
 *   skill-brain search <query> → one-shot search, print results
 */

const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'start':
    spawn('node', [path.join(ROOT, 'src/entry-points/index.js')], { stdio: 'inherit' });
    break;

  case 'mcp':
    spawn('node', [path.join(ROOT, 'src/entry-points/mcp-server.js')], { stdio: 'inherit' });
    break;

  case 'scan': {
    const targetPath = args[0] || '.';
    const { scanProject, generateSkillsFromScan } = require(path.join(ROOT, 'src/engines/scanProject'));
    const { loadCommonSkills, saveCommonSkills, loadProjectSkills, saveProjectSkills } = require(path.join(ROOT, 'src/engines/skillEngine'));
    const ragIndex = require(path.join(ROOT, 'src/engines/ragIndex'));
    const { mergeSkills } = require(path.join(ROOT, 'src/engines/scanProject'));

    const absPath = path.resolve(targetPath);
    process.stdout.write(`Scanning ${absPath}...\n`);

    const scan = scanProject(absPath);
    const { commonSkills, projectSkills } = generateSkillsFromScan(scan);

    const existingCommon = loadCommonSkills();
    const { merged: mergedCommon, added: ca } = mergeSkills(existingCommon, commonSkills, 'update');
    saveCommonSkills(mergedCommon);

    const existingProject = loadProjectSkills(scan.name);
    const { merged: mergedProject, added: pa } = mergeSkills(existingProject, projectSkills, 'update');
    saveProjectSkills(scan.name, mergedProject);

    ragIndex.markDirty(null);
    ragIndex.markDirty(scan.name);

    process.stdout.write(`Done. Added ${pa} project skills, ${ca} common skills.\n`);
    process.exit(0);
    break;
  }

  case 'review':
    spawn('node', [path.join(ROOT, 'src/workflows/reviewMode.js')], { stdio: 'inherit' });
    break;

  case 'search': {
    const query = args.join(' ');
    if (!query) { process.stderr.write('Usage: skill-brain search <query>\n'); process.exit(1); }
    const ragIndex = require(path.join(ROOT, 'src/engines/ragIndex'));
    ragIndex.search(query, 5).then(results => {
      if (!results.length) { process.stdout.write('No results.\n'); process.exit(0); }
      results.forEach((r, i) => {
        process.stdout.write(`${i + 1}. [${r.score.toFixed(3)}] ${r.skill.id} — ${r.skill.name}\n`);
      });
      process.exit(0);
    }).catch(e => { process.stderr.write(`Error: ${e.message}\n`); process.exit(1); });
    break;
  }

  case '--version':
  case '-v': {
    const pkg = require(path.join(ROOT, 'package.json'));
    process.stdout.write(`skill-brain v${pkg.version}\n`);
    process.exit(0);
    break;
  }

  default:
    process.stdout.write(`skill-brain — RAG-powered skills engine for AI code assistants

Commands:
  start         Start the HTTP server and dashboard (port 3000)
  mcp           Start the MCP stdio server
  scan <path>   Scan a project and index its skills
  review        Run diff-based skill review on current git branch
  search <q>    Search indexed skills and print top 5 results
  --version     Print version

Examples:
  npx skill-brain start
  npx skill-brain scan ./my-app
  npx skill-brain search "CSS specificity BEM"
`);
    process.exit(0);
}
