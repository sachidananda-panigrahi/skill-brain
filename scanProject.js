const fs = require('fs');
const path = require('path');
const { loadSkills, saveSkills, loadCommonSkills, saveCommonSkills, loadProjectSkills, saveProjectSkills } = require('./skillEngine');

// Simple CLI args
const args = process.argv.slice(2);
const projectPathArg = args.find(a => a.startsWith('--path='));

// Only run CLI logic if called directly
if (require.main === module) {
  if (!projectPathArg) {
    console.error('Usage: node scanProject.js --path=/absolute/path/to/project');
    process.exit(1);
  }
  const projectPath = projectPathArg.split('=')[1];
  if (!fs.existsSync(projectPath)) {
    console.error('Project path does not exist:', projectPath);
    process.exit(1);
  }

  console.log(`🔍 Scanning project: ${projectPath}`);

  (async () => {
    const scan = scanProject(projectPath);
    console.log('Scan result:', JSON.stringify(scan, null, 2));

    const { commonSkills, projectSkills } = generateSkillsFromScan(scan);
    
    // Save common skills
    const existingCommon = loadCommonSkills();
    let commonAdded = 0;
    let commonUpdated = 0;
    commonSkills.forEach(skill => {
      const existingIdx = existingCommon.findIndex(s => s.id === skill.id);
      if (existingIdx === -1) {
        existingCommon.push(skill);
        commonAdded++;
      } else {
        existingCommon[existingIdx] = { ...existingCommon[existingIdx], ...skill };
        commonUpdated++;
      }
    });
    saveCommonSkills(existingCommon);

    // Save project skills
    const projectName = scan.name;
    const existingProject = loadProjectSkills(projectName);
    let projectAdded = 0;
    let projectUpdated = 0;
    projectSkills.forEach(skill => {
      const existingIdx = existingProject.findIndex(s => s.id === skill.id);
      if (existingIdx === -1) {
        existingProject.push(skill);
        projectAdded++;
      } else {
        existingProject[existingIdx] = { ...existingProject[existingIdx], ...skill };
        projectUpdated++;
      }
    });
    saveProjectSkills(projectName, existingProject);

    console.log(`✅ Scan complete for project: ${projectName}`);
    console.log(`Common: ${commonAdded} added, ${commonUpdated} updated.`);
    console.log(`Project: ${projectAdded} added, ${projectUpdated} updated.`);
  })();
}

// ---------- Scan logic ----------
function scanProject(rootPath) {
  const result = {
    name: path.basename(rootPath),
    type: 'unknown',
    framework: [],
    dependencies: [],
    devDependencies: [],
    commonImports: [],   // top 5 imports found in source files
    patterns: [],         // {name, description}
    antiPatterns: []      // {name, description, count}
  };

  // 1. Read package.json
  const pkgPath = path.join(rootPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      result.name = pkg.name || result.name;
      result.dependencies = Object.keys(pkg.dependencies || {});
      result.devDependencies = Object.keys(pkg.devDependencies || {});

      // Heuristic framework & library detection
      const allDeps = [...result.dependencies, ...result.devDependencies];
      
      const frameworkMap = {
        'react': 'React',
        'next': 'Next.js',
        'vue': 'Vue',
        'express': 'Express',
        'fastify': 'Fastify',
        'angular': 'Angular',
        'svelte': 'Svelte',
        'nuxt': 'Nuxt.js',
        'remix-run': 'Remix'
      };
      
      Object.entries(frameworkMap).forEach(([dep, label]) => {
        if (allDeps.some(d => d.includes(dep))) result.framework.push(label);
      });

      if (allDeps.includes('typescript') || fs.existsSync(path.join(rootPath, 'tsconfig.json'))) {
        result.framework.push('TypeScript');
      }

      // UI Architecture & Tooling detection
      result.architecture = {
        uiLibraries: [],
        stateManagement: [],
        styling: [],
        testing: [],
        tooling: [],
        forms: []
      };

      const uiLibs = {
        'mui': 'Material UI',
        'antd': 'Ant Design',
        'tailwindcss': 'Tailwind CSS',
        'bootstrap': 'Bootstrap',
        'chakra-ui': 'Chakra UI',
        'shadcn': 'shadcn/ui'
      };
      Object.entries(uiLibs).forEach(([dep, label]) => {
        if (allDeps.some(d => d.includes(dep))) result.architecture.uiLibraries.push(label);
      });

      const stateMgmt = {
        'redux': 'Redux',
        'zustand': 'Zustand',
        'jotai': 'Jotai',
        'recoil': 'Recoil',
        'mobx': 'MobX',
        'react-query': 'TanStack Query',
        'swr': 'SWR'
      };
      Object.entries(stateMgmt).forEach(([dep, label]) => {
        if (allDeps.some(d => d.includes(dep))) result.architecture.stateManagement.push(label);
      });

      const styling = {
        'styled-components': 'Styled Components',
        'emotion': 'Emotion',
        'sass': 'Sass',
        'less': 'Less',
        'vanilla-extract': 'Vanilla Extract'
      };
      Object.entries(styling).forEach(([dep, label]) => {
        if (allDeps.some(d => d.includes(dep))) result.architecture.styling.push(label);
      });

      const testing = {
        'jest': 'Jest',
        'vitest': 'Vitest',
        'cypress': 'Cypress',
        'playwright': 'Playwright',
        'testing-library': 'Testing Library'
      };
      Object.entries(testing).forEach(([dep, label]) => {
        if (allDeps.some(d => d.includes(dep))) result.architecture.testing.push(label);
      });

      const forms = {
        'react-hook-form': 'React Hook Form',
        'formik': 'Formik',
        'zod': 'Zod',
        'yup': 'Yup'
      };
      Object.entries(forms).forEach(([dep, label]) => {
        if (allDeps.some(d => d.includes(dep))) result.architecture.forms.push(label);
      });

    } catch (e) { console.error('Error reading package.json:', e.message); }
  }

  // 2. Scan source files for patterns and imports
  const srcDir = path.join(rootPath, 'src');
  const targetDir = fs.existsSync(srcDir) ? srcDir : rootPath;

  const importCounts = {};
  const detectedPatterns = new Set();
  const detectedAntiPatterns = {};

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const skipDirs = ['node_modules', '.git', 'dist', '.next', 'coverage', 'build', 'out'];
        if (!skipDirs.includes(entry.name)) {
          // Folder structure patterns
          if (['atoms', 'molecules', 'organisms'].includes(entry.name)) detectedPatterns.add('Atomic Design');
          if (entry.name === 'hooks') detectedPatterns.add('Custom Hooks Pattern');
          if (entry.name === 'services' || entry.name === 'api') detectedPatterns.add('Service Layer Pattern');
          if (entry.name === 'context' || entry.name === 'store') detectedPatterns.add('Centralized State Pattern');
          if (entry.name === 'features' || entry.name === 'modules') detectedPatterns.add('Feature-based Architecture');
          
          walk(full);
        }
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
        // Skip the scanner itself if we are in root
        if (entry.name === 'scanProject.js' || entry.name === 'test_e2e.js') continue;

        const content = fs.readFileSync(full, 'utf8');
        
        // Import analysis
        const imports = content.match(/(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g);
        if (imports) {
          imports.forEach(imp => {
            const mod = imp.match(/['"]([^'"]+)['"]/)?.[1];
            if (mod && !mod.startsWith('.') && !mod.startsWith('/')) {
              importCounts[mod] = (importCounts[mod] || 0) + 1;
            }
          });
        }

        // Code patterns detection
        if (/\buseContext\s*\(|\bcreateContext\s*\(/.test(content)) detectedPatterns.add('React Context API');
        if (/\buseReducer\s*\(/.test(content)) detectedPatterns.add('Reducer Pattern');
        if (/\bforwardRef\s*\(/.test(content)) detectedPatterns.add('Ref Forwarding');
        if (/\bcreateSelector\s*\(/.test(content)) detectedPatterns.add('Memoized Selectors (Reselect)');
        if (/\bmemo\s*\(/.test(content)) detectedPatterns.add('Component Memoization');
        if (/\buseEffect\s*\(/.test(content)) detectedPatterns.add('Side Effect Management');
        if (/\.(get|post|put|delete|patch)\s*\(|axios\b|\bfetch\s*\(/.test(content)) detectedPatterns.add('REST API Integration');
        
        // Advanced "Senior Architect" patterns
        if (/\bSuspense\b|\blazy\s*\(/.test(content)) detectedPatterns.add('Code Splitting & Lazy Loading');
        if (/aria-|role=|tabIndex=/.test(content)) detectedPatterns.add('Accessibility (A11y) Focus');
        if (/\buseCallback\s*\(|\buseMemo\s*\(/.test(content)) detectedPatterns.add('Performance Optimization (Memoization)');
        if (/\bErrorBoundaries\b|\bErrorBoundary\b/.test(content)) detectedPatterns.add('Error Boundary Pattern');
        if (/\bJWT\b|\btoken\b|localStorage\.setItem\(['"]token/.test(content)) detectedPatterns.add('Token-based Authentication');
        if (/\bvalidate\s*\(|\bparse\s*\(|Zod|Yup/.test(content)) detectedPatterns.add('Schema-based Validation');

        // Anti-pattern detection
        if (/\bvar\s+\w+/.test(content)) {
          detectedAntiPatterns['Use of var'] = (detectedAntiPatterns['Use of var'] || 0) + 1;
        }
        if (/\s==\s/.test(content)) {
          detectedAntiPatterns['Loose Equality (==)'] = (detectedAntiPatterns['Loose Equality (==)'] || 0) + 1;
        }
        if (/\!important/.test(content)) {
          detectedAntiPatterns['Use of !important'] = (detectedAntiPatterns['Use of !important'] || 0) + 1;
        }
        if (/font-size:\s*\d+px/.test(content)) {
          detectedAntiPatterns['Absolute Font Sizes (px)'] = (detectedAntiPatterns['Absolute Font Sizes (px)'] || 0) + 1;
        }
        if (/<img\s+((?!alt=).)*?>/.test(content)) {
          detectedAntiPatterns['Missing Image alt Attribute'] = (detectedAntiPatterns['Missing Image alt Attribute'] || 0) + 1;
        }
        if (/key=\{index\}/.test(content)) {
          detectedAntiPatterns['Index as React Key'] = (detectedAntiPatterns['Index as React Key'] || 0) + 1;
        }
        if (/\.readFileSync\(|\.writeFileSync\(|\.execSync\(/.test(content)) {
          detectedAntiPatterns['Synchronous API Usage'] = (detectedAntiPatterns['Synchronous API Usage'] || 0) + 1;
        }
        if (/<a\s+href=/.test(content) && result.framework.includes('Next.js')) {
          detectedAntiPatterns['Native <a> Tag in Next.js'] = (detectedAntiPatterns['Native <a> Tag in Next.js'] || 0) + 1;
        }
        if (/\bconsole\.log\(/.test(content)) {
          detectedAntiPatterns['Console Logs in Production Code'] = (detectedAntiPatterns['Console Logs in Production Code'] || 0) + 1;
        }
        if (/style=\{\{/.test(content) || (entry.name.endsWith('.html') && /style=['"]/.test(content))) {
          detectedAntiPatterns['Inline Styles Usage'] = (detectedAntiPatterns['Inline Styles Usage'] || 0) + 1;
        }
        if (/\b(API_KEY|SECRET|PASSWORD|TOKEN)\b\s*[:=]\s*['"][a-zA-Z0-9\-_]{16,}['"]/.test(content)) {
          detectedAntiPatterns['Potential Hardcoded Secrets'] = (detectedAntiPatterns['Potential Hardcoded Secrets'] || 0) + 1;
        }

        // Security & Vulnerability Detection
        if (/\beval\s*\(/.test(content)) {
          detectedAntiPatterns['Use of eval()'] = (detectedAntiPatterns['Use of eval()'] || 0) + 1;
        }
        if (/dangerouslySetInnerHTML/.test(content) || /\.innerHTML\s*=/.test(content)) {
          detectedAntiPatterns['Dangerous HTML Injection'] = (detectedAntiPatterns['Dangerous HTML Injection'] || 0) + 1;
        }
        if (/<a\s+[^>]*target=['"]_blank['"](?![^>]*rel=['"]noopener)/.test(content)) {
          detectedAntiPatterns['Unsafe target="_blank"'] = (detectedAntiPatterns['Unsafe target="_blank"'] || 0) + 1;
        }
        if (/http:\/\/[\w\.\/\-]+/.test(content) && !/http:\/\/localhost/.test(content)) {
          detectedAntiPatterns['Use of Unsecure HTTP Link'] = (detectedAntiPatterns['Use of Unsecure HTTP Link'] || 0) + 1;
        }
        if (/\bMath\.random\s*\(/.test(content)) {
          detectedAntiPatterns['Non-Cryptographic Randomness'] = (detectedAntiPatterns['Non-Cryptographic Randomness'] || 0) + 1;
        }

        // Performance & Memory NFRs
        if (/\bsetInterval\s*\(/.test(content) && !/\bclearInterval\s*\(/.test(content)) {
          detectedAntiPatterns['Potential Memory Leak (setInterval)'] = (detectedAntiPatterns['Potential Memory Leak (setInterval)'] || 0) + 1;
        }
        if (importCounts['moment']) {
          detectedAntiPatterns['Heavy Library Usage (moment.js)'] = (detectedAntiPatterns['Heavy Library Usage (moment.js)'] || 0) + 1;
        }
        if (importCounts['lodash'] && !importCounts['lodash-es']) {
          detectedAntiPatterns['Unoptimized Library Usage (lodash)'] = (detectedAntiPatterns['Unoptimized Library Usage (lodash)'] || 0) + 1;
        }
        if (/<img\s+[^>]*src=/.test(content) && !/<img\s+[^>]*loading=['"]lazy['"]/.test(content) && !result.framework.includes('Next.js')) {
          detectedAntiPatterns['Missing Lazy Loading for Images'] = (detectedAntiPatterns['Missing Lazy Loading for Images'] || 0) + 1;
        }

        // Accessibility (Lighthouse Score)
        if (/<button\s+((?!aria-label=|aria-labelledby=).)*?>\s*<\/button>/.test(content)) {
          detectedAntiPatterns['Empty Button without Label'] = (detectedAntiPatterns['Empty Button without Label'] || 0) + 1;
        }
        if (/<input\s+((?!id=).)*?>/.test(content) && !/<label/.test(content)) {
          detectedAntiPatterns['Input without Label/ID'] = (detectedAntiPatterns['Input without Label/ID'] || 0) + 1;
        }
      }
    }
  };
  walk(targetDir);

  result.patterns = Array.from(detectedPatterns).map(name => ({ name }));
  result.antiPatterns = Object.entries(detectedAntiPatterns).map(([name, count]) => ({ name, count }));
  
  // Sort by frequency
  result.commonImports = Object.entries(importCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15) // Increased to 15
    .map(([name]) => name);

  return result;
}

// ---------- Generate Skills ----------
function generateSkillsFromScan(scanResult) {
  const commonSkills = [];
  const projectSkills = [];

  // 1. Project context skill (High level overview)
  let contextTemplate = `This project is named "${scanResult.name}".\n`;
  if (scanResult.framework.length) contextTemplate += `Core Stack: ${scanResult.framework.join(', ')}.\n`;
  
  if (scanResult.architecture) {
    const arch = scanResult.architecture;
    if (arch.uiLibraries.length) contextTemplate += `UI Libraries: ${arch.uiLibraries.join(', ')}.\n`;
    if (arch.stateManagement.length) contextTemplate += `State Management: ${arch.stateManagement.join(', ')}.\n`;
    if (arch.styling.length) contextTemplate += `Styling: ${arch.styling.join(', ')}.\n`;
    if (arch.testing.length) contextTemplate += `Testing: ${arch.testing.join(', ')}.\n`;
    if (arch.forms.length) contextTemplate += `Forms/Validation: ${arch.forms.join(', ')}.\n`;
  }

  if (scanResult.patterns && scanResult.patterns.length) {
    contextTemplate += `Detected Patterns: ${scanResult.patterns.map(p => p.name).join(', ')}.\n`;
  }

  projectSkills.push({
    id: `project-${scanResult.name.replace(/\s+/g, '-').toLowerCase()}`,
    name: `Project: ${scanResult.name}`,
    description: 'Auto-generated project context from scan.',
    template: contextTemplate.trim(),
    parameters: []
  });

  // 2. Pattern Skills (Architecture & Design Patterns)
  if (scanResult.patterns) {
    scanResult.patterns.forEach(p => {
      projectSkills.push({
        id: `pattern-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: `Pattern: ${p.name}`,
        description: `Architectural pattern detected: ${p.name}`,
        template: `When working in this project, adhere to the "${p.name}" pattern as it is already established in the codebase.`,
        parameters: []
      });
    });
  }

  // 3. Library‑specific Skills
  scanResult.commonImports.forEach(lib => {
    const libName = lib.split('/')[0];
    // Skip generic/built-in ones for specialized skills if they are already in architecture
    projectSkills.push({
      id: `lib-${libName}`,
      name: `Library: ${libName}`,
      description: `The project frequently uses ${libName}.`,
      template: `Utilize ${libName} for related tasks. Example usage found in the project: \`import ... from '${lib}'\`.`,
      parameters: []
    });
  });

  // 4. Architect Insight Skill
  if (scanResult.architecture) {
    const insights = [];
    if (scanResult.architecture.stateManagement.includes('TanStack Query')) {
      insights.push('Use TanStack Query for server-state management, caching, and synchronization.');
    }
    if (scanResult.architecture.uiLibraries.includes('Material UI')) {
      insights.push('Follow Material UI design system and use its components for consistency.');
    }
    if (scanResult.architecture.styling.includes('Tailwind CSS')) {
      insights.push('Use utility-first CSS with Tailwind for styling components.');
    }
    
    // Pattern based insights
    const patternNames = scanResult.patterns.map(p => p.name);
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
        id: `architect-insights-${scanResult.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: `Architect Insights: ${scanResult.name}`,
        description: 'High-level architectural guidance for the project.',
        template: `Senior UI Architect Guidance for ${scanResult.name}:\n${insights.map(i => `- ${i}`).join('\n')}`,
        parameters: []
      });
    }
  }

  // 5. Anti-Pattern Enforcement Skills (Global Architect Standards)
  const antiPatternSkills = [
    {
      id: 'enforce-semantic-html',
      name: 'Enforce: Semantic HTML',
      description: 'Guidelines to avoid div-soup and improve accessibility.',
      template: 'As a Senior UI Architect, I strictly enforce semantic HTML. Avoid generic <div> containers when <header>, <main>, <footer>, <section>, or <article> are more appropriate. Always ensure <img> tags have descriptive alt attributes and interactive elements are accessible.'
    },
    {
      id: 'enforce-modern-css',
      name: 'Enforce: Modern CSS Standards',
      description: 'Guidelines for maintainable and responsive styling.',
      template: 'Avoid using !important in CSS. Favor CSS variables and utility classes. Use relative units (rem, em, %) for font-size and layout instead of absolute px units to ensure responsive behavior and user accessibility settings are respected.'
    },
    {
      id: 'enforce-clean-javascript',
      name: 'Enforce: Clean JavaScript',
      description: 'Standard JS practices for safety and readability.',
      template: 'Never use "var"; use "const" by default and "let" only when reassignment is necessary. Always use strict equality (===) and avoid loose equality (==). Prefer async/await over raw promises or callbacks for better error handling and readability.'
    },
    {
      id: 'enforce-react-best-practices',
      name: 'Enforce: React Performance & Patterns',
      description: 'Architectural rules for React development.',
      template: 'Do not use array index as a "key" prop for dynamic lists. Never mutate state directly. Keep components small and specialized. Ensure hooks have exhaustive dependency arrays. Use component composition to avoid deep prop drilling.'
    },
    {
      id: 'enforce-node-next-optimization',
      name: 'Enforce: Node.js & Next.js Optimization',
      description: 'Server-side and Next.js specific optimizations.',
      template: 'In Node.js, never use synchronous I/O methods (.*Sync) in request handlers as they block the event loop. In Next.js, always use the <Link> component for internal navigation instead of <a> tags. Leverage Server Components for data fetching where possible to reduce client-side bundle size.'
    },
    {
      id: 'enforce-security-best-practices',
      name: 'Enforce: Security Best Practices',
      description: 'Senior Architect security standards.',
      template: 'Security is non-negotiable. Never use eval(). Avoid dangerouslySetInnerHTML unless absolutely necessary and sanitized. Always add rel="noopener noreferrer" to target="_blank" links. Use HTTP-only cookies and implement CSRF protection. Regularly audit dependencies for vulnerabilities.'
    },
    {
      id: 'enforce-performance-nfrs',
      name: 'Enforce: Performance & NFRs',
      description: 'Non-functional requirements for high-performance apps.',
      template: 'Target 100% Lighthouse scores. Use modern, lightweight libraries (e.g., date-fns over moment). Optimize images using Next.js <Image> or modern formats. Implement proper cleanup in useEffect (clearInterval/removeEventListener) to prevent memory leaks. Use Web Workers for heavy computations.'
    },
    {
      id: 'enforce-accessibility-standards',
      name: 'Enforce: Universal Accessibility',
      description: 'Guidelines for 100% accessibility score.',
      template: 'Every user matters. Ensure 100% accessibility by using semantic HTML, ARIA labels for non-text elements, and ensuring high color contrast. All interactive elements must be keyboard-accessible. Test with screen readers and follow WCAG 2.1 Level AA standards.'
    }
  ];

  antiPatternSkills.forEach(skill => {
    commonSkills.push({ ...skill, parameters: [] });
  });

  // 6. Project-Specific Anti-Pattern Alerts
  if (scanResult.antiPatterns && scanResult.antiPatterns.length > 0) {
    const alerts = scanResult.antiPatterns.map(ap => `- ${ap.name} (found in ${ap.count} instances)`);
    projectSkills.push({
      id: `anti-pattern-report-${scanResult.name.replace(/\s+/g, '-').toLowerCase()}`,
      name: `Anti-Pattern Report: ${scanResult.name}`,
      description: `Detected anti-patterns in ${scanResult.name}`,
      template: `Architect Alert for ${scanResult.name}:
The following anti-patterns were detected and must be refactored to align with Senior UI Architect standards:
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
- Ensure all interactive elements have accessible labels.`,
      parameters: []
    });
  }

  return { commonSkills, projectSkills };
}

module.exports = { scanProject, generateSkillsFromScan };
