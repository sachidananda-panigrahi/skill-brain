const fs = require('fs');
const path = require('path');
const { analyzeFile } = require('../parsers/astAnalyzer');
const { runRegexFallback, runRegexPatternDetection } = require('../parsers/regexFallback');
const { loadCommonSkills, saveCommonSkills, loadProjectSkills, saveProjectSkills } = require('./skillEngine');
const { buildEnforcementSkills } = require('../rules/skillsLibrary');
const { analyzeVue } = require('../parsers/vueAnalyzer');
const { analyzeConfig } = require('../parsers/configAnalyzer');
const { validate: validateFileName } = require('../parsers/fileNaming');
// ── Merge helper ───────────────────────────────────────────────────────────────

function mergeSkills(existing, newSkills, mode) {
  const merged = [...existing];
  let added = 0;
  let updated = 0;
  newSkills.forEach(skill => {
    const idx = merged.findIndex(s => s.id === skill.id);
    if (idx === -1) {
      merged.push(skill);
      added++;
    } else if (mode !== 'add') {
      merged[idx] = { ...merged[idx], ...skill };
      updated++;
    }
  });
  return { merged, added, updated };
}

// CLI entry point
const args = process.argv.slice(2);
const projectPathArg = args.find(a => a.startsWith('--path='));
const modeArg = args.find(a => a.startsWith('--mode='));
const reviewArg = args.find(a => a === '--review' || a.startsWith('--review='));

if (require.main === module) {
  // Review mode takes priority over scan mode
  if (reviewArg) {
    const { runReview } = require('../workflows/reviewMode');
    const baseBranch = reviewArg.includes('=') ? reviewArg.split('=')[1] : 'HEAD~1';
    const outputArg = args.find(a => a.startsWith('--output='));
    const outputPath = outputArg ? outputArg.split('=')[1] : null;
    const formatArg = args.find(a => a.startsWith('--format='));
    const format = formatArg ? formatArg.split('=')[1] : 'json';
    runReview(baseBranch, format, outputPath).then(code => process.exit(code));
  } else {
    if (!projectPathArg) {
      console.error('Usage: node src/engines/scanProject.js --path=/absolute/path/to/project [--mode=add|update]');
      console.error('       node src/engines/scanProject.js --review[=<baseBranch>] [--format=json|markdown|both] [--output=<path>]');
      process.exit(1);
    }
    const projectPath = projectPathArg.split('=')[1];
    if (!fs.existsSync(projectPath)) {
      console.error('Project path does not exist:', projectPath);
      process.exit(1);
    }

    const mode = modeArg ? modeArg.split('=')[1] : 'update';
    console.log(`Scanning project: ${projectPath} (mode=${mode})`);

    (async () => {
      const scan = scanProject(projectPath);
      const { commonSkills, projectSkills } = generateSkillsFromScan(scan);

      const existingCommon = loadCommonSkills();
      const { merged: mergedCommon, added: commonAdded, updated: commonUpdated } =
        mergeSkills(existingCommon, commonSkills, mode);
      saveCommonSkills(mergedCommon);

      const projectName = scan.name;
      const existingProject = loadProjectSkills(projectName);
      const { merged: mergedProject, added: projectAdded, updated: projectUpdated } =
        mergeSkills(existingProject, projectSkills, mode);
      saveProjectSkills(projectName, mergedProject);

      console.log(`Scan complete for project: ${projectName}`);
      console.log(`Common: ${commonAdded} added, ${commonUpdated} updated.`);
      console.log(`Project: ${projectAdded} added, ${projectUpdated} updated.`);
    })();
  }
}

// ── Scan logic ────────────────────────────────────────────────────────────────

function scanProject(rootPath) {
  const result = {
    name: path.basename(rootPath),
    type: 'unknown',
    framework: [],
    dependencies: [],
    devDependencies: [],
    commonImports: [],
    patterns: [],
    antiPatterns: [],
    architecture: {
      uiLibraries: [],
      stateManagement: [],
      styling: [],
      testing: [],
      tooling: [],
      forms: []
    }
  };

  // 1. Read package.json
  const pkgPath = path.join(rootPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      result.name = pkg.name || result.name;
      result.dependencies = Object.keys(pkg.dependencies || {});
      result.devDependencies = Object.keys(pkg.devDependencies || {});

      const allDeps = [...result.dependencies, ...result.devDependencies];

      const frameworkMap = {
        react: 'React', next: 'Next.js', vue: 'Vue', express: 'Express',
        fastify: 'Fastify', angular: 'Angular', svelte: 'Svelte',
        nuxt: 'Nuxt.js', 'remix-run': 'Remix'
      };
      Object.entries(frameworkMap).forEach(([dep, label]) => {
        if (allDeps.some(d => d.includes(dep))) result.framework.push(label);
      });
      if (allDeps.includes('typescript') || fs.existsSync(path.join(rootPath, 'tsconfig.json'))) {
        result.framework.push('TypeScript');
      }

      detectArchitecture(allDeps, result.architecture);
    } catch (e) {
      console.error('Error reading package.json:', e.message);
    }
  }

  // 2. Walk source files
  const srcDir = path.join(rootPath, 'src');
  const targetDir = fs.existsSync(srcDir) ? srcDir : rootPath;

  const importCounts = new Map();
  const detectedPatterns = new Set();
  const detectedAntiPatterns = {};

  const skipDirs = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', 'build', 'out']);

  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;

        // Folder-level pattern detection
        if (['atoms', 'molecules', 'organisms'].includes(entry.name)) detectedPatterns.add('Atomic Design');
        if (entry.name === 'hooks') detectedPatterns.add('Custom Hooks Pattern');
        if (entry.name === 'services' || entry.name === 'api') detectedPatterns.add('Service Layer Pattern');
        if (entry.name === 'context' || entry.name === 'store') detectedPatterns.add('Centralized State Pattern');
        if (entry.name === 'features' || entry.name === 'modules') detectedPatterns.add('Feature-based Architecture');
        walk(full);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name);
      const isSourceFile = /\.(js|jsx|ts|tsx|mjs)$/.test(entry.name);
      const isSelf = entry.name === 'scanProject.js' || entry.name === 'test_e2e.js';

      if (isSourceFile && !isSelf) {
        let content;
        try { content = fs.readFileSync(full, 'utf8'); }
        catch { continue; }

        // Try AST analysis first
        const ast = analyzeFile(full, content);

        if (ast.parsed) {
          // Feed AST imports into counts
          ast.imports.forEach(mod => {
            importCounts.set(mod, (importCounts.get(mod) || 0) + 1);
          });

          // Map AST findings to anti-patterns
          const ruleMap = {
            'hooks-rules': 'React Hooks Rule Violation',
            'prop-drilling': 'Prop Drilling (3+ levels)',
            'unused-imports': 'Unused Imports',
            'large-component': 'Large Component (>200 lines)',
            'deep-nesting': 'Excessive Nesting (>4 levels)'
          };
          ast.findings.forEach(({ rule }) => {
            const name = ruleMap[rule];
            if (name) detectedAntiPatterns[name] = (detectedAntiPatterns[name] || 0) + 1;
          });

          // Still run regex for patterns (AST doesn't detect all of them) and
          // security/performance anti-patterns not covered by AST
          runRegexPatternDetection(content, detectedPatterns);
          runRegexFallback(content, entry.name, result.framework, importCounts, detectedAntiPatterns);
        } else {
          // AST failed — full regex fallback
          runRegexPatternDetection(content, detectedPatterns);
          runRegexFallback(content, entry.name, result.framework, importCounts, detectedAntiPatterns);
        }
      }

      // CSS/SCSS/HTML: always regex (Babel doesn't parse them)
      if (/\.(css|scss|less|html)$/.test(entry.name)) {
        let content;
        try { content = fs.readFileSync(full, 'utf8'); }
        catch { continue; }
        runRegexFallback(content, entry.name, result.framework, importCounts, detectedAntiPatterns);
      }

      // Vue SFCs
      if (ext === '.vue') {
        analyzeVue(full).then(r => {
          (r.antiPatterns || []).forEach(ap => {
            const key = ap.type || ap.name || 'vue-issue';
            detectedAntiPatterns[key] = (detectedAntiPatterns[key] || 0) + 1;
          });
          (r.imports || []).forEach(mod => importCounts.set(mod, (importCounts.get(mod) || 0) + 1));
        }).catch(() => {});
      }

      // Config files: .env, docker-compose, Dockerfile, tsconfig, GitHub Actions
      const isConfig = entry.name.startsWith('.env') ||
        entry.name === 'docker-compose.yml' || entry.name === 'docker-compose.yaml' ||
        entry.name === 'Dockerfile' || entry.name === 'tsconfig.json';
      const isGHAWorkflow = full.includes('.github/workflows') && /\.(yml|yaml)$/.test(entry.name);

      if (isConfig || isGHAWorkflow) {
        analyzeConfig(full).then(r => {
          (r.antiPatterns || []).forEach(ap => {
            const key = ap.type || ap.name || 'config-issue';
            detectedAntiPatterns[key] = (detectedAntiPatterns[key] || 0) + 1;
          });
        }).catch(() => {});
      }

      // File naming convention check
      const fileNameCheck = validateFileName(full);
      if (!fileNameCheck.valid) {
        const key = `file-naming:${entry.name}`;
        detectedAntiPatterns[key] = (detectedAntiPatterns[key] || 0) + 1;
      }
    }
  };

  walk(targetDir);

  // Heavy-library checks require knowing final importCounts
  if (importCounts.get('moment')) {
    detectedAntiPatterns['Heavy Library Usage (moment.js)'] = (detectedAntiPatterns['Heavy Library Usage (moment.js)'] || 0) + 1;
  }
  if (importCounts.get('lodash') && !importCounts.get('lodash-es')) {
    detectedAntiPatterns['Unoptimized Library Usage (lodash)'] = (detectedAntiPatterns['Unoptimized Library Usage (lodash)'] || 0) + 1;
  }

  result.patterns = Array.from(detectedPatterns).map(name => ({ name }));
  result.antiPatterns = Object.entries(detectedAntiPatterns).map(([name, count]) => ({ name, count }));

  result.commonImports = [...importCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name]) => name);

  return result;
}

function detectArchitecture(allDeps, arch) {
  const uiLibs = {
    mui: 'Material UI', antd: 'Ant Design', tailwindcss: 'Tailwind CSS',
    bootstrap: 'Bootstrap', 'chakra-ui': 'Chakra UI', shadcn: 'shadcn/ui'
  };
  const stateMgmt = {
    redux: 'Redux', zustand: 'Zustand', jotai: 'Jotai', recoil: 'Recoil',
    mobx: 'MobX', 'react-query': 'TanStack Query', swr: 'SWR'
  };
  const styling = {
    'styled-components': 'Styled Components', emotion: 'Emotion',
    sass: 'Sass', less: 'Less', 'vanilla-extract': 'Vanilla Extract'
  };
  const testing = {
    jest: 'Jest', vitest: 'Vitest', cypress: 'Cypress',
    playwright: 'Playwright', 'testing-library': 'Testing Library'
  };
  const forms = {
    'react-hook-form': 'React Hook Form', formik: 'Formik', zod: 'Zod', yup: 'Yup'
  };

  [
    [uiLibs, arch.uiLibraries],
    [stateMgmt, arch.stateManagement],
    [styling, arch.styling],
    [testing, arch.testing],
    [forms, arch.forms]
  ].forEach(([map, target]) => {
    Object.entries(map).forEach(([dep, label]) => {
      if (allDeps.some(d => d.includes(dep))) target.push(label);
    });
  });
}

// ── Skill generation ──────────────────────────────────────────────────────────

function generateSkillsFromScan(scanResult) {
  const commonSkills = [];
  const projectSkills = [];
  const projectSlug = scanResult.name.replace(/\s+/g, '-').toLowerCase();

  // 1. Project context skill
  let contextTemplate = `This project is named "${scanResult.name}".\n`;
  if (scanResult.framework.length) contextTemplate += `Core Stack: ${scanResult.framework.join(', ')}.\n`;
  const arch = scanResult.architecture;
  if (arch) {
    if (arch.uiLibraries.length) contextTemplate += `UI Libraries: ${arch.uiLibraries.join(', ')}.\n`;
    if (arch.stateManagement.length) contextTemplate += `State Management: ${arch.stateManagement.join(', ')}.\n`;
    if (arch.styling.length) contextTemplate += `Styling: ${arch.styling.join(', ')}.\n`;
    if (arch.testing.length) contextTemplate += `Testing: ${arch.testing.join(', ')}.\n`;
    if (arch.forms.length) contextTemplate += `Forms/Validation: ${arch.forms.join(', ')}.\n`;
  }
  if (scanResult.patterns?.length) {
    contextTemplate += `Detected Patterns: ${scanResult.patterns.map(p => p.name).join(', ')}.\n`;
  }

  projectSkills.push({
    id: `project-${projectSlug}`,
    name: `Project: ${scanResult.name}`,
    description: 'Auto-generated project context from scan.',
    template: contextTemplate.trim(),
    parameters: []
  });

  // 2. Pattern skills
  (scanResult.patterns || []).forEach(p => {
    projectSkills.push({
      id: `pattern-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
      name: `Pattern: ${p.name}`,
      description: `Architectural pattern detected: ${p.name}`,
      template: `When working in this project, adhere to the "${p.name}" pattern as it is already established in the codebase.`,
      parameters: []
    });
  });

  // 3. Library skills
  scanResult.commonImports.forEach(lib => {
    const libName = lib.split('/')[0];
    projectSkills.push({
      id: `lib-${libName}`,
      name: `Library: ${libName}`,
      description: `The project frequently uses ${libName}.`,
      template: `Utilize ${libName} for related tasks. Example usage found in the project: \`import ... from '${lib}'\`.`,
      parameters: []
    });
  });

  // 4. Architect insight skill
  if (arch) {
    const insights = [];
    if (arch.stateManagement.includes('TanStack Query')) {
      insights.push('Use TanStack Query for server-state management, caching, and synchronization.');
    }
    if (arch.uiLibraries.includes('Material UI')) {
      insights.push('Follow Material UI design system and use its components for consistency.');
    }
    if (arch.styling.includes('Tailwind CSS') || arch.uiLibraries.includes('Tailwind CSS')) {
      insights.push('Use utility-first CSS with Tailwind for styling components.');
    }

    const patternNames = (scanResult.patterns || []).map(p => p.name);
    if (patternNames.includes('Atomic Design')) {
      insights.push('Organize components following Atomic Design principles (atoms, molecules, organisms).');
    }
    if (patternNames.includes('Accessibility (A11y) Focus')) {
      insights.push('Maintain high accessibility standards by using ARIA roles and semantic HTML.');
    }
    if (patternNames.includes('Performance Optimization (Memoization)')) {
      insights.push('Optimize render performance using useMemo and useCallback where appropriate.');
    }
    if (patternNames.includes('Code Splitting & Lazy Loading')) {
      insights.push('Implement code splitting for route-level components to improve initial load time.');
    }
    if (patternNames.includes('Service Layer Pattern')) {
      insights.push('Keep business logic and API calls within the service layer to separate concerns.');
    }
    if (scanResult.antiPatterns.some(ap => ap.name.includes('Security') || ap.name.includes('Unsafe'))) {
      insights.push('Prioritize security by sanitizing inputs and avoiding dangerous DOM APIs.');
    }
    if (scanResult.antiPatterns.some(ap => ap.name.includes('Performance') || ap.name.includes('Heavy'))) {
      insights.push('Optimize bundle size by replacing heavy libraries with modern alternatives.');
    }

    if (insights.length > 0) {
      projectSkills.push({
        id: `architect-insights-${projectSlug}`,
        name: `Architect Insights: ${scanResult.name}`,
        description: 'High-level architectural guidance for the project.',
        template: `Senior UI Architect Guidance for ${scanResult.name}:\n${insights.map(i => `- ${i}`).join('\n')}`,
        parameters: []
      });
    }
  }

  // 5. Global anti-pattern enforcement skills (48 skills from skillsLibrary)
  buildEnforcementSkills().forEach(skill => commonSkills.push(skill));

  // 6. Project-specific anti-pattern report
  if (scanResult.antiPatterns?.length > 0) {
    const alerts = scanResult.antiPatterns.map(ap => `- ${ap.name} (found in ${ap.count} instances)`);
    projectSkills.push({
      id: `anti-pattern-report-${projectSlug}`,
      name: `Anti-Pattern Report: ${scanResult.name}`,
      description: `Detected anti-patterns in ${scanResult.name}`,
      template: `Architect Alert for ${scanResult.name}:
The following anti-patterns were detected and must be refactored:
${alerts.join('\n')}

Refactoring guidance:
- Replace "var" with "const/let".
- Replace "==" with "===".
- Remove "!important" and fix specificity issues.
- Replace absolute "px" fonts with "rem".
- Add missing "alt" attributes to images.
- Use unique IDs instead of indices for React keys.
- Replace sync I/O with async versions.
- Remove console.log statements.
- Move inline styles to CSS modules or styled-components.
- Move hardcoded secrets to environment variables (.env).
- Replace eval() and dangerous HTML injection with safe alternatives.
- Fix unsafe target="_blank" links with rel="noopener".
- Replace heavy libraries like moment.js with date-fns or Day.js.
- Optimize lodash usage with lodash-es or tree-shakable imports.
- Use crypto.getRandomValues() instead of Math.random() for security.
- Enforce HTTPS for all external links.
- Implement lazy loading for images to improve Lighthouse scores.
- Ensure all interactive elements have accessible labels.
- Fix React Hooks Rule Violations (no hooks inside conditionals/loops).
- Eliminate prop drilling with Context API or component composition.
- Remove unused imports to reduce bundle size.
- Extract large components (>200 lines) into smaller focused components.
- Reduce nesting depth (>4) using early returns and guard clauses.`,
      parameters: []
    });
  }

  return { commonSkills, projectSkills };
}

module.exports = { scanProject, generateSkillsFromScan, mergeSkills };
