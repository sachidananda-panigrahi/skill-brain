#!/usr/bin/env node
'use strict';

/**
 * MCP stdio server — exposes SkillBrain skills as MCP tools.
 *
 * Usage in claude.json / .cursor/mcp.json / zed settings:
 *   {
 *     "command": "node",
 *     "args": ["/absolute/path/to/skill-brain/bin/skill-brain.js", "mcp"]
 *   }
 *
 * Or with a repo-local relative path:
 *   { "command": "node", "args": ["bin/skill-brain.js", "mcp"] }
 */

const readline = require('readline');
const { loadSkills, loadAllProjectNames, loadCommonSkills, saveCommonSkills, saveProjectSkills, loadProjectSkills } = require('../engines/skillEngine');
const ragIndex = require('../engines/ragIndex');
const { scanProject, generateSkillsFromScan, mergeSkills } = require('../engines/scanProject');
const fs = require('fs-extra');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, terminal: false });

// ── MCP helpers ────────────────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_skills',
    description: 'Semantic search for relevant coding skills, best practices, and enforcement rules. Returns ranked matches.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Natural language search query (e.g. "react performance hooks")' },
        k: { type: 'number', description: 'Maximum results (1–20, default 5)' },
        project: { type: 'string', description: 'Scope to a specific project name (optional)' }
      }
    }
  },
  {
    name: 'get_project_summary',
    description: 'Get a comprehensive architectural overview, detected patterns, and anti-pattern reports for a project.',
    inputSchema: {
      type: 'object',
      required: ['project'],
      properties: {
        project: { type: 'string', description: 'Name of the project to summarize' }
      }
    }
  },
  {
    name: 'get_enforcement_rules',
    description: 'Retrieve all Senior UI Architect enforcement rules and best practices (global).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'audit_code',
    description: 'Provide relevant architectural skills and best practices for auditing a code snippet.',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: 'The code snippet to audit' },
        project: { type: 'string', description: 'Project context (optional)' },
        filePath: { type: 'string', description: 'Path to the file being audited (optional)' }
      }
    }
  },
  {
    name: 'scan_project',
    description: 'Scan a local project directory to extract tech stack, patterns, and anti-patterns. Updates the skill database.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Absolute path to the project directory' },
        mode: { type: 'string', enum: ['add', 'update'], description: 'Merge mode: "add" only new, "update" existing too (default: update)' }
      }
    }
  },
  {
    name: 'list_skills',
    description: 'List all available skills. Optionally scope to a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name to scope results (optional)' },
        type: { type: 'string', description: 'Filter by type prefix: enforce, project, lib, pattern, architect, anti-pattern' }
      }
    }
  },
  {
    name: 'get_skill',
    description: 'Get the full content of a specific skill by ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Skill ID (e.g. "enforce-react-best-practices")' },
        project: { type: 'string', description: 'Project scope (optional)' }
      }
    }
  },
  {
    name: 'list_projects',
    description: 'List all scanned project names.',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ── Tool handlers ──────────────────────────────────────────────────────────────

async function handleToolCall(name, args) {
  switch (name) {
    case 'search_skills': {
      const { query, k = 5, project = null } = args;
      if (!query) throw new Error('query is required');
      const results = await ragIndex.search(query, Math.min(k, 20), project || null);
      if (!results.length) return { content: [{ type: 'text', text: 'No matching skills found.' }] };
      const text = results.map((r, i) =>
        `${i + 1}. [${r.skill.id}] ${r.skill.name} (${(r.score * 100).toFixed(1)}% match)\n` +
        `   ${r.skill.description || ''}\n` +
        `   Template:\n${r.skill.template || ''}`
      ).join('\n\n');
      return { content: [{ type: 'text', text }] };
    }

    case 'get_project_summary': {
      const { project } = args;
      const skills = loadProjectSkills(project);
      if (!skills.length) return { content: [{ type: 'text', text: `Project "${project}" not found or has no skills.` }] };

      const summaryParts = [];
      const context = skills.find(s => s.id.startsWith('project-'));
      if (context) summaryParts.push(`### Project Context\n${context.template}`);

      const insights = skills.find(s => s.id.startsWith('architect-insights-'));
      if (insights) summaryParts.push(`### Architect Insights\n${insights.template}`);

      const antiPatternReport = skills.find(s => s.id.startsWith('anti-pattern-report-'));
      if (antiPatternReport) summaryParts.push(`### Anti-Pattern Report\n${antiPatternReport.template}`);

      const patterns = skills.filter(s => s.id.startsWith('pattern-'));
      if (patterns.length) {
        summaryParts.push(`### Key Patterns\n${patterns.map(p => `- ${p.name}`).join('\n')}`);
      }

      return { content: [{ type: 'text', text: summaryParts.join('\n\n') || 'No summary available.' }] };
    }

    case 'get_enforcement_rules': {
      const common = loadCommonSkills();
      const enforce = common.filter(s => s.id.startsWith('enforce-'));
      const text = enforce.map(s => `## ${s.name}\n${s.template}`).join('\n\n');
      return { content: [{ type: 'text', text: text || 'No enforcement rules found.' }] };
    }

    case 'audit_code': {
      const { code, project = null, filePath = '' } = args;
      const query = `Audit code${filePath ? ' in ' + filePath : ''}: ${code.substring(0, 200)}`;
      const results = await ragIndex.search(query, 8, project);

      const text = [
        'To audit this code, use the following Senior UI Architect rules and patterns:',
        '',
        ...results.map(r => `### ${r.skill.name} (Match: ${(r.score * 100).toFixed(1)}%)\n${r.skill.template}\n`)
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }

    case 'scan_project': {
      const { path: projectPath, mode = 'update' } = args;
      if (!fs.existsSync(projectPath)) throw new Error(`Path does not exist: ${projectPath}`);

      const scan = scanProject(projectPath);
      const { commonSkills, projectSkills } = generateSkillsFromScan(scan);

      const existingCommon = loadCommonSkills();
      const { merged: mergedCommon, added: commonAdded, updated: commonUpdated } = mergeSkills(existingCommon, commonSkills, mode);
      saveCommonSkills(mergedCommon);

      const projectName = scan.name;
      const existingProject = loadProjectSkills(projectName);
      const { merged: mergedProject, added: projectAdded, updated: projectUpdated } = mergeSkills(existingProject, projectSkills, mode);
      saveProjectSkills(projectName, mergedProject);

      return {
        content: [{
          type: 'text',
          text: `Scan complete for ${projectName}.\n- Common skills: ${commonAdded} added, ${commonUpdated} updated.\n- Project skills: ${projectAdded} added, ${projectUpdated} updated.`
        }]
      };
    }

    case 'list_skills': {
      const { project = null, type = '' } = args;
      let skills = loadSkills(project);
      if (type) skills = skills.filter(s => s.id.startsWith(type));
      const text = skills.map(s => `• [${s.id}] ${s.name}${s.description ? ' — ' + s.description : ''}`).join('\n');
      return { content: [{ type: 'text', text: text || 'No skills found.' }] };
    }

    case 'get_skill': {
      const { id, project = null } = args;
      const skills = loadSkills(project);
      const skill = skills.find(s => s.id === id);
      if (!skill) throw new Error(`Skill "${id}" not found`);
      const text = [
        `# ${skill.name}`,
        skill.description ? `**Description:** ${skill.description}` : '',
        '',
        '## Template',
        skill.template || '(empty)',
        skill.parameters?.length ? '\n## Parameters\n' + skill.parameters.map(p => `- **${p.name}**: ${p.description}`).join('\n') : ''
      ].filter(Boolean).join('\n');
      return { content: [{ type: 'text', text }] };
    }

    case 'list_projects': {
      const names = loadAllProjectNames();
      return { content: [{ type: 'text', text: names.length ? names.join('\n') : '(no projects scanned yet)' }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Message router ─────────────────────────────────────────────────────────────

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'skill-brain', version: '2.0.0' }
      });
      break;

    case 'notifications/initialized':
      break;

    case 'tools/list':
      sendResult(id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const { name, arguments: args = {} } = params;
      try {
        const result = await handleToolCall(name, args);
        sendResult(id, result);
      } catch (err) {
        sendError(id, -32603, err.message);
      }
      break;
    }

    case 'resources/list':
      sendResult(id, { resources: [] });
      break;

    case 'prompts/list':
      sendResult(id, { prompts: [] });
      break;

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

rl.on('line', async line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  await handleMessage(msg);
});

process.stderr.write('[skill-brain mcp] server ready\n');
