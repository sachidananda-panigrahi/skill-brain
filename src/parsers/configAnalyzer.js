'use strict';

const fs = require('fs-extra');
const path = require('path');

/**
 * Analyze config files: .env, docker-compose.yml, Dockerfile, GitHub Actions, tsconfig.json.
 * Returns { patterns, antiPatterns } in the same shape as other analyzers.
 */
async function analyzeConfig(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return { filePath, patterns: [], antiPatterns: [] };
  }

  const basename = path.basename(filePath);
  const antiPatterns = [];

  if (basename.startsWith('.env')) {
    _checkEnv(content, filePath, antiPatterns);
  } else if (basename === 'docker-compose.yml' || basename === 'docker-compose.yaml') {
    _checkDockerCompose(content, filePath, antiPatterns);
  } else if (basename === 'Dockerfile') {
    _checkDockerfile(content, filePath, antiPatterns);
  } else if (filePath.includes('.github/workflows') && (basename.endsWith('.yml') || basename.endsWith('.yaml'))) {
    _checkGithubActions(content, filePath, antiPatterns);
  } else if (basename === 'tsconfig.json') {
    _checkTsconfig(content, filePath, antiPatterns);
  }

  return { filePath, patterns: [], antiPatterns };
}

function _checkEnv(content, filePath, out) {
  const secretPatterns = [
    { re: /^\s*\w*(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|AUTH)\w*\s*=\s*\S+/im, label: 'hardcoded secret-like value' },
    { re: /sk-[a-zA-Z0-9]{20,}/,  label: 'OpenAI API key pattern' },
    { re: /AKIA[0-9A-Z]{16}/,     label: 'AWS access key pattern' },
    { re: /ghp_[a-zA-Z0-9]{36}/, label: 'GitHub personal access token' },
  ];
  for (const { re, label } of secretPatterns) {
    if (re.test(content)) {
      out.push({ type: 'env-secret', severity: 'critical', message: `Potential ${label} in ${filePath}. Never commit real secrets — use .env.example with placeholder values.`, file: filePath });
    }
  }
}

function _checkDockerCompose(content, filePath, out) {
  if (/user:\s*root/i.test(content)) {
    out.push({ type: 'docker-root-user', severity: 'high', message: 'docker-compose service runs as root. Add a non-root user for security.', file: filePath });
  }
  if (!/healthcheck:/i.test(content)) {
    out.push({ type: 'docker-no-healthcheck', severity: 'medium', message: 'docker-compose service has no healthcheck. Add a healthcheck for production services.', file: filePath });
  }
}

function _checkDockerfile(content, filePath, out) {
  if (/^USER root/im.test(content) || !/^USER /im.test(content)) {
    out.push({ type: 'dockerfile-root', severity: 'high', message: 'Dockerfile does not set a non-root USER. Add: USER node (or appropriate non-root user).', file: filePath });
  }
  if (!/^HEALTHCHECK/im.test(content)) {
    out.push({ type: 'dockerfile-no-healthcheck', severity: 'medium', message: 'Dockerfile missing HEALTHCHECK instruction.', file: filePath });
  }
  if (/ADD http/i.test(content)) {
    out.push({ type: 'dockerfile-add-url', severity: 'high', message: 'Dockerfile uses ADD with a URL. Use RUN curl/wget + verify checksum instead.', file: filePath });
  }
}

function _checkGithubActions(content, filePath, out) {
  if (!/^permissions:/im.test(content)) {
    out.push({ type: 'gha-no-permissions', severity: 'medium', message: `GitHub Actions workflow ${path.basename(filePath)} has no top-level permissions block. Add permissions: to restrict token scope.`, file: filePath });
  }
  if (/pull_request_target:/i.test(content)) {
    out.push({ type: 'gha-pull-request-target', severity: 'critical', message: `pull_request_target in ${path.basename(filePath)} can execute untrusted code with write permissions. Review carefully.`, file: filePath });
  }
  // Check for pinned action versions (SHA or tag)
  const uses = content.match(/uses:\s*[^\s@]+@[^\s]+/g) || [];
  const unpinned = uses.filter(u => !u.includes('@v') && !/[a-f0-9]{40}/.test(u));
  if (unpinned.length > 0) {
    out.push({ type: 'gha-unpinned-action', severity: 'low', message: `Actions in ${path.basename(filePath)} may not be pinned to a tag or SHA. Consider pinning for supply chain security.`, file: filePath });
  }
}

function _checkTsconfig(content, filePath, out) {
  let json;
  try { json = JSON.parse(content.replace(/\/\/[^\n]*/g, '')); } catch { return; }
  const opts = json.compilerOptions || {};
  if (opts.strict === false) {
    out.push({ type: 'tsconfig-strict-off', severity: 'high', message: 'tsconfig.json has strict: false. Enable strict mode for better type safety.', file: filePath });
  }
  if (opts.noImplicitAny === false) {
    out.push({ type: 'tsconfig-no-implicit-any-off', severity: 'medium', message: 'tsconfig.json has noImplicitAny: false. Enable for safer code.', file: filePath });
  }
}

module.exports = { analyzeConfig };
