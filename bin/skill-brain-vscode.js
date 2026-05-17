#!/usr/bin/env node
'use strict';

/**
 * VSCode auto-start wrapper for the MCP server.
 * - Outputs the exact strings that .vscode/tasks.json problemMatcher watches.
 * - Checks if the MCP port is already in use — skips spawn if server running.
 * - Idempotent: safe to run multiple times (VSCode runOn: folderOpen).
 */

const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const MCP_PORT = parseInt(process.env.MCP_HTTP_PORT || process.env.MCP_PORT || '3001', 10);
const ROOT = path.join(__dirname, '..');

function portInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port);
  });
}

async function main() {
  process.stdout.write('SkillBrain MCP starting\n');

  const inUse = await portInUse(MCP_PORT);
  if (inUse) {
    process.stdout.write(`SkillBrain MCP ready (reused existing on :${MCP_PORT})\n`);
    return;
  }

  const child = spawn('node', [path.join(ROOT, 'src/entry-points/mcp-server.js')], {
    stdio: 'inherit',
    env: { ...process.env, MCP_HTTP_PORT: String(MCP_PORT) },
  });

  child.on('spawn', () => {
    process.stdout.write(`SkillBrain MCP ready on :${MCP_PORT}\n`);
  });

  child.on('error', e => {
    process.stderr.write(`ERROR ${e.message}\n`);
    process.exit(1);
  });

  child.on('exit', code => {
    if (code !== 0) process.stderr.write(`ERROR MCP server exited with code ${code}\n`);
  });
}

main().catch(e => {
  process.stderr.write(`ERROR ${e.message}\n`);
  process.exit(1);
});
