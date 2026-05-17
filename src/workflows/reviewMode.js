'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { analyzeFile } = require('../parsers/astAnalyzer');
const { runRegexFallback, runRegexPatternDetection } = require('../parsers/regexFallback');

// ── Git helpers ────────────────────────────────────────────────────────────────

function spawnGit(args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd: cwd || process.cwd() });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('error', err => {
      if (err.code === 'ENOENT') reject(new Error('git not found in PATH'));
      else reject(err);
    });
    proc.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `git exited ${code}`));
    });
  });
}

async function getGitDiffFiles(baseBranch) {
  const base = baseBranch || 'HEAD~1';
  const cwd = process.cwd();

  // Check git repo exists
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    console.error('[review] No .git directory found — returning empty diff');
    return [];
  }

  let changedPaths;
  try {
    const output = await spawnGit(['diff', '--name-only', '--diff-filter=ACMR', base], cwd);
    changedPaths = output.split('\n').filter(Boolean);
  } catch (err) {
    // HEAD~1 fails on repos with single commit — try staged files
    try {
      const output = await spawnGit(['diff', '--name-only', '--diff-filter=ACMR', '--cached'], cwd);
      changedPaths = output.split('\n').filter(Boolean);
    } catch {
      console.error('[review] Could not get git diff:', err.message);
      return [];
    }
  }

  const skipPatterns = /node_modules|\.next|dist\/|build\/|\.lock$|package-lock\.json/;
  const binaryExtensions = /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|pdf|zip|tar|gz)$/i;

  const files = [];
  for (const filePath of changedPaths) {
    if (skipPatterns.test(filePath)) continue;
    if (binaryExtensions.test(filePath)) continue;

    let content;
    try {
      const raw = await spawnGit(['show', `HEAD:${filePath}`], cwd);
      content = raw;
    } catch {
      // Deleted or unreadable — skip
      continue;
    }

    files.push({ path: filePath, content, status: 'modified' });
  }

  return files;
}

// ── Per-file analysis ──────────────────────────────────────────────────────────

function analyzeFilesForReview(files) {
  const fileReports = [];
  const allFindings = [];

  for (const file of files) {
    const ext = path.extname(file.path);
    const isSourceFile = /\.(js|jsx|ts|tsx|mjs)$/.test(file.path);
    const isCssHtml = /\.(css|scss|less|html)$/.test(file.path);

    const findings = [];
    const metrics = { loc: 0, maxNestingDepth: 0, componentCount: 0 };

    if (isSourceFile) {
      const ast = analyzeFile(file.path, file.content);
      if (ast.parsed) {
        metrics.loc = ast.metrics.loc || 0;
        metrics.maxNestingDepth = ast.metrics.maxNestingDepth || 0;
        metrics.componentCount = ast.metrics.componentCount || 0;
        ast.findings.forEach(f => findings.push(f));
      }

      // Regex anti-patterns on top of AST
      const importCounts = new Map();
      const antiPatterns = {};
      const detectedPatterns = new Set();
      runRegexPatternDetection(file.content, detectedPatterns);
      runRegexFallback(file.content, path.basename(file.path), [], importCounts, antiPatterns);

      Object.entries(antiPatterns).forEach(([name, count]) => {
        findings.push({
          rule: name,
          message: `${name} detected (${count} instance${count > 1 ? 's' : ''})`,
          line: null,
          severity: severityForAntiPattern(name)
        });
      });
    } else if (isCssHtml) {
      const importCounts = new Map();
      const antiPatterns = {};
      runRegexFallback(file.content, path.basename(file.path), [], importCounts, antiPatterns);

      Object.entries(antiPatterns).forEach(([name, count]) => {
        findings.push({
          rule: name,
          message: `${name} detected (${count} instance${count > 1 ? 's' : ''})`,
          line: null,
          severity: severityForAntiPattern(name)
        });
      });
    }

    if (!metrics.loc) {
      metrics.loc = file.content.split('\n').length;
    }

    const report = { path: file.path, status: file.status, metrics, findings };
    fileReports.push(report);
    allFindings.push(...findings.map(f => ({ ...f, file: file.path })));
  }

  return { filesReviewed: files.length, fileReports, allFindings };
}

function severityForAntiPattern(name) {
  const critical = ['Potential Hardcoded Secrets', 'Use of eval()', 'Dangerous HTML Injection'];
  const high = [
    'React Hooks Rule Violation', 'Unsafe target="_blank"',
    'Use of Unsecure HTTP Link', 'Non-Cryptographic Randomness',
    'Potential Memory Leak (setInterval)', 'JSON.parse Without Try-Catch',
    'fetch Without Error Handling', 'Unhandled Promise Rejection Risk',
    'Missing Content-Type Header', 'process.env Without Null Check'
  ];
  const medium = [
    'Prop Drilling (3+ levels)', 'Large Component (>200 lines)',
    'Excessive Nesting (>4 levels)', 'Synchronous API Usage',
    'Missing Lazy Loading for Images', 'Empty Button without Label',
    'Input without Label/ID', 'div onclick Without Keyboard Handler',
    'Missing charset Meta Tag', 'Missing viewport Meta Tag'
  ];

  if (critical.some(c => name.includes(c) || c.includes(name))) return 'CRITICAL';
  if (high.some(h => name.includes(h) || h.includes(name))) return 'HIGH';
  if (medium.some(m => name.includes(m) || m.includes(name))) return 'MEDIUM';
  return 'LOW';
}

// ── Report generation ──────────────────────────────────────────────────────────

async function generateReviewReport(analysis, baseBranch) {
  let skills = [];
  try {
    const { loadSkills } = require('../engines/skillEngine');
    skills = loadSkills(null);
  } catch { /* server may not be available in CLI mode */ }

  const ragIndex = (() => {
    try { return require('../engines/ragIndex'); } catch { return null; }
  })();

  const summary = { totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 };
  const recommendations = [];
  const seenSkills = new Set();

  for (const finding of analysis.allFindings) {
    summary.totalIssues++;
    const sev = finding.severity || 'LOW';
    summary[sev.toLowerCase()] = (summary[sev.toLowerCase()] || 0) + 1;

    // Map finding to a skill via RAG search
    if (ragIndex && !seenSkills.has(finding.rule)) {
      try {
        const results = await ragIndex.search(finding.rule + ' ' + (finding.message || ''), 1, null);
        if (results && results[0] && results[0].score > 0.1) {
          const skill = results[0].skill;
          seenSkills.add(finding.rule);
          const existing = recommendations.find(r => r.skillId === skill.id);
          if (existing) {
            if (!existing.affectedFiles.includes(finding.file)) {
              existing.affectedFiles.push(finding.file);
            }
          } else {
            recommendations.push({
              priority: sev,
              skillId: skill.id,
              skillName: skill.name,
              message: skill.description || skill.name,
              affectedFiles: finding.file ? [finding.file] : []
            });
          }
        }
      } catch { /* RAG unavailable */ }
    }
  }

  const ciExitCode = summary.critical > 0 || summary.high > 0 ? 2
    : summary.medium > 0 ? 1 : 0;

  return {
    meta: {
      baseBranch: baseBranch || 'HEAD~1',
      timestamp: new Date().toISOString(),
      filesReviewed: analysis.filesReviewed,
      ciExitCode
    },
    summary,
    files: analysis.fileReports,
    recommendations: recommendations
      .sort((a, b) => severityOrder(b.priority) - severityOrder(a.priority))
      .slice(0, 10),
    passed: ciExitCode === 0
  };
}

function severityOrder(s) {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[s] || 0;
}

// ── Markdown output ────────────────────────────────────────────────────────────

function generateMarkdown(report) {
  const { meta, summary, files, recommendations } = report;
  const status = report.passed ? '✅ PASSED' : summary.critical > 0 ? '🔴 FAILED' : '⚠️ WARNING';

  let md = `## Code Review Report — ${status}\n\n`;
  md += `**Base branch:** \`${meta.baseBranch}\` | `;
  md += `**Files reviewed:** ${meta.filesReviewed} | `;
  md += `**Timestamp:** ${meta.timestamp}\n\n`;

  md += `### Summary\n\n`;
  md += `| Severity | Count |\n|----------|-------|\n`;
  md += `| 🔴 Critical | ${summary.critical} |\n`;
  md += `| 🟠 High | ${summary.high} |\n`;
  md += `| 🟡 Medium | ${summary.medium} |\n`;
  md += `| 🔵 Low | ${summary.low} |\n\n`;

  const filesWithIssues = files.filter(f => f.findings.length > 0);
  if (filesWithIssues.length > 0) {
    md += `### Findings by File\n\n`;
    for (const file of filesWithIssues) {
      md += `#### \`${file.path}\`\n\n`;
      md += `| Rule | Message | Severity |\n|------|---------|----------|\n`;
      file.findings.forEach(f => {
        const sev = f.severity || 'LOW';
        const icon = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🔵' }[sev] || '🔵';
        const msg = (f.message || f.rule || '').replace(/\|/g, '\\|');
        md += `| \`${f.rule}\` | ${msg} | ${icon} ${sev} |\n`;
      });
      md += '\n';
    }
  }

  if (recommendations.length > 0) {
    md += `### Recommendations\n\n`;
    recommendations.forEach((r, i) => {
      const icon = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🔵' }[r.priority] || '🔵';
      md += `${i + 1}. ${icon} **${r.skillName}** — ${r.message}\n`;
      if (r.affectedFiles.length > 0) {
        md += `   _Affected:_ ${r.affectedFiles.map(f => `\`${f}\``).join(', ')}\n`;
      }
    });
    md += '\n';
  }

  md += `---\n_Exit code: ${meta.ciExitCode} (0=pass, 1=warnings, 2=fail)_\n`;
  return md;
}

// ── Main entry ─────────────────────────────────────────────────────────────────

async function runReview(baseBranch, format, outputPath) {
  const base = baseBranch || 'HEAD~1';
  const fmt = format || 'json';

  let files;
  try {
    files = await getGitDiffFiles(base);
  } catch (err) {
    console.error('[review] git error:', err.message);
    return 0; // non-fatal: CI still passes
  }

  if (files.length === 0) {
    console.error('[review] No changed files found for base:', base);
    const emptyReport = {
      meta: { baseBranch: base, timestamp: new Date().toISOString(), filesReviewed: 0, ciExitCode: 0 },
      summary: { totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 },
      files: [],
      recommendations: [],
      passed: true
    };
    writeOutput(emptyReport, fmt, outputPath);
    return 0;
  }

  const analysis = analyzeFilesForReview(files);
  const report = await generateReviewReport(analysis, base);

  writeOutput(report, fmt, outputPath);

  return report.meta.ciExitCode;
}

function writeOutput(report, fmt, outputPath) {
  const formats = (fmt || 'json').split(',').map(s => s.trim());

  formats.forEach(f => {
    let content;
    let fileSuffix;

    if (f === 'markdown' || f === 'md') {
      content = generateMarkdown(report);
      fileSuffix = '.md';
    } else {
      content = JSON.stringify(report, null, 2);
      fileSuffix = '.json';
    }

    if (outputPath) {
      const outFile = outputPath.endsWith(fileSuffix) ? outputPath : outputPath + fileSuffix;
      const dir = path.dirname(outFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outFile, content, 'utf8');
      console.error(`[review] Report written to ${outFile}`);
    } else {
      process.stdout.write(content + '\n');
    }
  });
}

module.exports = { runReview, getGitDiffFiles, analyzeFilesForReview, generateReviewReport, generateMarkdown };
