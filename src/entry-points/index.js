'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const port = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors());

// ── JSON body parser for all remaining routes ──────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Static files ───────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../../public')));
app.use('/skills', express.static(path.join(__dirname, '../../skills')));
app.use('/docs', express.static(path.join(__dirname, '../../docs')));

// ── Root redirect ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/dashboard/overview');
});

// ── Dashboard routes ───────────────────────────────────────────────────────────
app.get(['/dashboard', '/dashboard/:section'], (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'dashboard.html'));
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const { isEnabled } = require('../utils/embeddings');
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    embeddingsEnabled: isEnabled(),
    serverRoot: __dirname,
    mcpServerPath: path.join(__dirname, './mcp-server.js')
  });
});

// ── Skills REST API ─────────────────────────────────────────────────────────────
const apiSkillsRouter = require('../api/apiSkills');
app.use('/api/skills', apiSkillsRouter);

// ── Docs API ───────────────────────────────────────────────────────────────────
const apiDocsRouter = require('../api/apiDocs');
app.use('/api/docs', apiDocsRouter);

// ── Scan endpoint ───────────────────────────────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  const { path: projectPath, url: remoteUrl } = req.body;

  // Remote repo scan — not supported; clone locally first then scan the path
  if (remoteUrl && !projectPath) {
    return res.status(400).json({ error: 'Remote URL scan is not supported. Clone the repo locally and provide the path instead.' });
  }

  if (!projectPath || !fs.existsSync(projectPath)) {
    return res.status(400).json({ error: 'Invalid project path' });
  }

  const { scanProject, generateSkillsFromScan, mergeSkills } = require('../engines/scanProject');
  const { loadCommonSkills, saveCommonSkills, loadProjectSkills, saveProjectSkills } = require('../engines/skillEngine');
  const ragIndex = require('../engines/ragIndex');
  const repomixBridge = require('../workflows/repomixBridge');

  try {
    // Security pre-check: block if secrets detected
    const secCheck = await repomixBridge.securityPreCheck(projectPath);
    if (!secCheck.passed) {
      return res.status(400).json({
        error: 'secrets_detected',
        message: 'Potential secrets found in project. Resolve before indexing.',
        issues: secCheck.issues
      });
    }

    const scan = scanProject(projectPath);
    const { commonSkills, projectSkills } = generateSkillsFromScan(scan);

    // Token budget annotation (non-blocking — repomix optional)
    let tokenBudget = null;
    const packed = await repomixBridge.packForIndex(projectPath).catch(() => null);
    if (packed) tokenBudget = { total: packed.totalTokens };

    const existingCommon = loadCommonSkills();
    const { merged: mergedCommon, added: commonAdded } = mergeSkills(existingCommon, commonSkills, 'update');
    saveCommonSkills(mergedCommon);

    const projectName = scan.name;
    const existingProject = loadProjectSkills(projectName);
    const { merged: mergedProject, added: projectAdded } = mergeSkills(existingProject, projectSkills, 'update');
    saveProjectSkills(projectName, mergedProject);

    ragIndex.markDirty(null);
    ragIndex.markDirty(projectName);

    res.json({
      message: `Scan complete for ${projectName}. Added ${projectAdded} project skills, ${commonAdded} common skills.`,
      projectName,
      totalProject: mergedProject.length,
      totalCommon: mergedCommon.length,
      ...(tokenBudget ? { tokenBudget } : {})
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Code review endpoint ────────────────────────────────────────────────────────
app.post('/api/review', async (req, res) => {
  const { baseBranch } = req.body;
  const { getGitDiffFiles, analyzeFilesForReview, generateReviewReport } = require('../workflows/reviewMode');
  try {
    const files = await getGitDiffFiles(baseBranch || 'HEAD~1');
    const analysis = analyzeFilesForReview(files);
    const report = await generateReviewReport(analysis, baseBranch || 'HEAD~1');
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MCP discovery endpoint (GET) ───────────────────────────────────────────────
app.get('/mcp', (req, res) => {
  const { loadSkills } = require('../engines/skillEngine');
  const { project } = req.query;
  const skills = loadSkills(project);
  res.json({
    capabilities: {
      skills,
      tools: skills.map(s => ({
        name: s.id,
        description: s.description || s.name,
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(
            (s.parameters || []).map(p => [p.name, { type: 'string', description: p.description }])
          )
        }
      }))
    }
  });
});

// ── MCP JSON-RPC 2.0 endpoint (POST) ───────────────────────────────────────────
// Implements the Model Context Protocol over HTTP for tools that prefer HTTP MCP
// (vs the stdio server in mcp-server.js for Claude Code / Cursor / Zed).
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params = {} } = req.body || {};
  const { loadSkills } = require('../engines/skillEngine');
  const ragIndex = require('../engines/ragIndex');

  const reply = result => res.json({ jsonrpc: '2.0', id, result });
  const replyErr = (code, message) => res.json({ jsonrpc: '2.0', id, error: { code, message } });

  const project = params.project || null;

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'skill-brain', version: '2.0.0' }
      });

    case 'tools/list': {
      const skills = loadSkills(project);
      return reply({
        tools: skills.map(s => ({
          name: s.id,
          description: s.description || s.name,
          inputSchema: {
            type: 'object',
            properties: Object.fromEntries(
              (s.parameters || []).map(p => [p.name, { type: 'string', description: p.description }])
            ),
            required: (s.parameters || []).map(p => p.name)
          }
        }))
      });
    }

    case 'tools/call': {
      const { name, arguments: args = {} } = params;
      if (name === 'search_skills') {
        const { query, k = 5, project: proj = null } = args;
        if (!query) return replyErr(-32602, 'query is required');
        try {
          const results = await ragIndex.search(query, Math.min(k, 20), proj);
          const text = results.length
            ? results.map((r, i) => `${i + 1}. [${r.skill.id}] ${r.skill.name} (${(r.score * 100).toFixed(1)}%)\n${r.skill.description || ''}\n${r.skill.template || ''}`).join('\n\n')
            : 'No matching skills found.';
          return reply({ content: [{ type: 'text', text }] });
        } catch (err) { return replyErr(-32603, err.message); }
      }
      const skills = loadSkills(project);
      const skill = skills.find(s => s.id === name);
      if (!skill) return replyErr(-32602, `Unknown tool: ${name}`);
      let rendered = skill.template || '';
      for (const [k, v] of Object.entries(args)) rendered = rendered.replaceAll(`{{${k}}}`, v);
      return reply({ content: [{ type: 'text', text: rendered }] });
    }

    case 'resources/list': return reply({ resources: [] });
    case 'prompts/list': return reply({ prompts: [] });
    default:
      return id !== undefined ? replyErr(-32601, `Method not found: ${method}`) : res.end();
  }
});

// ── Start ───────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Dashboard available at http://localhost:${port}/dashboard`);
  console.log(`MCP (HTTP):   POST http://localhost:${port}/mcp  (JSON-RPC 2.0)`);
  console.log(`MCP (stdio):  node ${__dirname}/mcp-server.js`);
});
