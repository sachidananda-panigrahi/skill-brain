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
    spawn(process.execPath, [path.join(ROOT, 'src/entry-points/index.js')], { stdio: 'inherit' });
    break;

  case 'mcp':
    spawn(process.execPath, [path.join(ROOT, 'src/entry-points/mcp-server.js')], { stdio: 'inherit' });
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
    spawn(process.execPath, [path.join(ROOT, 'src/workflows/reviewMode.js')], { stdio: 'inherit' });
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

  // init / generate — zero-config SKILLS.md generator for non-MCP workflow
  case 'generate':
  case 'init': {
    const targetPath = args[0] || '.';
    const flags = Object.fromEntries(
      args.filter(a => a.startsWith('--')).map(a => {
        const [k, v = 'true'] = a.slice(2).split('=');
        return [k, v];
      })
    );
    const format      = flags.format || 'md';
    const outputPath  = flags.output  || null;
    const register    = flags.register !== 'false';

    const { generateSkillsMd } = require(path.join(ROOT, 'src/workflows/skillsInitializer'));
    generateSkillsMd(path.resolve(targetPath), { outputPath, format, register })
      .then(result => {
        process.stdout.write(`Generated ${result.total} skills → ${result.outputPath}\n`);
        if (result.stack && result.stack.length) {
          process.stdout.write(`Detected stack: ${result.stack.join(', ')}\n`);
        }
        if (register) {
          process.stdout.write(`Auto-update: registered — SKILLS.md will refresh when skills change via dashboard.\n`);
        }
        process.exit(0);
      })
      .catch(e => { process.stderr.write(`Error: ${e.message}\n`); process.exit(1); });
    break;
  }

  // fetch — on-demand skill fetch from skills.sh / vercel-labs
  case 'fetch': {
    const flags = Object.fromEntries(
      args.filter(a => a.startsWith('--')).map(a => {
        const [k, v = 'true'] = a.slice(2).split('=');
        return [k, v];
      })
    );
    const { fetchSkillsForStack, fetchSkillsForProject, listRemoteSources } = require(path.join(ROOT, 'src/workflows/skillsFetcher'));

    if (flags.list) {
      const sources = listRemoteSources();
      process.stdout.write('Available remote skill sources:\n');
      sources.forEach(s => process.stdout.write(`  ${s.tech.padEnd(12)} ${s.repo}/${s.dir}  (${s.domain})\n`));
      process.exit(0);
    }

    if (flags.stack) {
      const techNames = flags.stack.split(',').map(s => s.trim());
      process.stdout.write(`Fetching skills for: ${techNames.join(', ')}...\n`);
      fetchSkillsForStack(techNames, {
        onProgress: (tech, status, count) => {
          if (status === 'done')  process.stdout.write(`  ✓ ${tech}: ${count} skills cached\n`);
          if (status === 'error') process.stdout.write(`  ✗ ${tech}: failed\n`);
        },
      }).then(({ fetched, errors }) => {
        const total = Object.values(fetched).reduce((s, v) => s + v.count, 0);
        process.stdout.write(`Done. ${total} skills fetched and cached in skills/prebuilt/fetched/\n`);
        if (Object.keys(errors).length) {
          process.stdout.write(`Errors: ${JSON.stringify(errors)}\n`);
        }
        process.exit(0);
      }).catch(e => { process.stderr.write(`Error: ${e.message}\n`); process.exit(1); });
    } else {
      // Auto-detect from project
      const projectPath = flags.path || args[0] || '.';
      process.stdout.write(`Auto-detecting stack from ${path.resolve(projectPath)}...\n`);
      fetchSkillsForProject(path.resolve(projectPath), {
        onProgress: (tech, status, count) => {
          if (status === 'done')  process.stdout.write(`  ✓ ${tech}: ${count} skills cached\n`);
          if (status === 'error') process.stdout.write(`  ✗ ${tech}: failed\n`);
        },
      }).then(({ fetched, errors }) => {
        const total = Object.values(fetched).reduce((s, v) => s + v.count, 0);
        process.stdout.write(`Done. ${total} skills fetched.\n`);
        if (Object.keys(errors).length) {
          process.stdout.write(`Errors: ${JSON.stringify(errors)}\n`);
        }
        process.exit(0);
      }).catch(e => { process.stderr.write(`Error: ${e.message}\n`); process.exit(1); });
    }
    break;
  }

  case 'export': {
    const flags = Object.fromEntries(
      args.filter(a => a.startsWith('--')).map(a => {
        const [k, v = 'true'] = a.slice(2).split('=');
        return [k, v];
      })
    );
    const format = flags.format || 'md';
    const project = flags.project || null;
    const domain = flags.domain || null;
    const outputPath = flags.output || (format === 'json' ? 'SKILLS.json' : 'SKILLS.md');

    const { loadSkills, loadCommonSkills } = require(path.join(ROOT, 'src/engines/skillEngine'));
    const { loadPrebuiltSkills } = require(path.join(ROOT, 'src/rules/prebuiltSkillsLoader'));
    const { exportToFile } = require(path.join(ROOT, 'src/utils/skillsExporter'));

    const userSkills = loadSkills(project);
    loadPrebuiltSkills().then(prebuilt => {
      const all = [...userSkills, ...prebuilt];
      const result = exportToFile(all, { outputPath: path.resolve(outputPath), format, projectName: project, domain });
      process.stdout.write(`Exported ${result.total} skills → ${result.outputPath}\n`);
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
  start                  Start the HTTP server and dashboard (port 3000)
  mcp                    Start the MCP stdio server
  scan <path>            Scan a project and index its skills
  review                 Run diff-based skill review on current git branch
  search <q>             Search indexed skills and print top 5 results
  init [path]            Generate SKILLS.md in [path] (default: cwd). Detects stack.
  generate [path]        Alias for init
  fetch [--stack=...]    Fetch skills from skills.sh / vercel-labs (requires internet)
  export                 Export full skill DB to SKILLS.md or .json
  --version              Print version

init options:
  --format=md|json       Output format (default: md)
  --output=<path>        Override output file path
  --register=false       Skip auto-update registration

fetch options:
  --stack=nextjs,react   Comma-separated tech names to fetch
  --path=<dir>           Auto-detect stack from project at <dir>
  --list                 List available remote skill sources

Examples:
  npx skill-brain start
  npx skill-brain scan ./my-app
  npx skill-brain init                          # generates SKILLS.md in current dir
  npx skill-brain init ./my-next-app            # generates SKILLS.md for that project
  npx skill-brain init --format=json            # generate SKILLS.json instead
  npx skill-brain fetch --stack=nextjs,react    # fetch from vercel-labs/agent-skills
  npx skill-brain fetch --path=./my-app         # auto-detect + fetch
  npx skill-brain fetch --list                  # show available sources
  npx skill-brain search "CSS specificity BEM"
  npx skill-brain export --format=json --output=docs/skills.json
`);
    process.exit(0);
}
