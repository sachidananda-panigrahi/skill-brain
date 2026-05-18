'use strict';
const { spawnSync } = require('child_process');
const { readdirSync, statSync } = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (full.endsWith('.js')) files.push(full);
  }
  return files;
}

let exitCode = 0;
for (const file of walk('.')) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || `Syntax error in ${file}\n`);
    exitCode = 1;
  }
}
process.exit(exitCode);
