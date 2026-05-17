/**
 * Anti-Pattern Detection Engine
 * Identifies architectural, performance, security, and code quality anti-patterns
 * across HTML, CSS, JavaScript, React, and Next.js code.
 */

const antiPatternRules = {
  // HTML Anti-Patterns
  html: [
    {
      id: 'html-missing-dimensions',
      name: 'Missing width/height on images (CLS risk)',
      pattern: /<img[^>]*(?<!width)[^>]*(?<!height)[^>]*>/i,
      severity: 'critical',
      domain: 'performance',
      fix: 'Always set explicit width and height attributes: <img src="..." width="400" height="300" />'
    },
    {
      id: 'html-missing-alt-text',
      name: 'Missing alt text on images (accessibility)',
      pattern: /<img[^>]*(?<!alt)[^>]*>/i,
      severity: 'high',
      domain: 'accessibility',
      fix: 'Add descriptive alt text: <img src="..." alt="User dashboard showing metrics" />'
    },
    {
      id: 'html-invalid-heading-hierarchy',
      name: 'Skipped heading levels (accessibility)',
      pattern: /(<h1>.*?<h3>)|(<h2>.*?<h4>)/is,
      severity: 'medium',
      domain: 'accessibility',
      fix: 'Use proper heading hierarchy: h1 → h2 → h3, do not skip levels'
    },
    {
      id: 'html-async-blocking-css',
      name: 'Render-blocking CSS (LCP issue)',
      pattern: /<link[^>]*rel=["\']stylesheet["\'][^>]*>/i,
      severity: 'high',
      domain: 'performance',
      fix: 'Inline critical CSS, defer non-critical: <link rel="preload" as="style" href="...">'
    }
  ],

  // CSS Anti-Patterns
  css: [
    {
      id: 'css-missing-font-display',
      name: 'Web font without font-display: swap',
      pattern: /@font-face\s*{[^}]*(?!font-display)/is,
      severity: 'high',
      domain: 'performance',
      fix: 'Add font-display: swap to all @font-face declarations'
    },
    {
      id: 'css-layout-thrashing',
      name: 'Potential layout thrashing (triggering reflows)',
      pattern: /(\.style\.(width|height|left|top|margin|padding)|document\.documentElement\.style)/,
      severity: 'medium',
      domain: 'performance',
      fix: 'Use transform/opacity for animations instead of width/height/position'
    },
    {
      id: 'css-no-vendor-prefixes',
      name: 'Missing vendor prefixes for browser compatibility',
      pattern: /(display:\s*flex|transform:|background:.*gradient)/i,
      severity: 'low',
      domain: 'compatibility',
      fix: 'Use autoprefixer or add -webkit-, -moz-, -ms- prefixes'
    }
  ],

  // JavaScript Anti-Patterns
  javascript: [
    {
      id: 'js-missing-abort-controller',
      name: 'Fetch without AbortController (memory leak risk)',
      pattern: /fetch\s*\([^)]*\)\s*\.then/,
      severity: 'high',
      domain: 'performance',
      fix: 'Use AbortController: const abort = new AbortController(); fetch(url, { signal: abort.signal })'
    },
    {
      id: 'js-global-event-listener',
      name: 'Event listener without cleanup (memory leak)',
      pattern: /window\.addEventListener|document\.addEventListener/,
      severity: 'high',
      domain: 'performance',
      fix: 'Remove listeners in cleanup: window.removeEventListener(...) or use AbortController'
    },
    {
      id: 'js-no-error-handling',
      name: 'Promise without .catch() (unhandled rejection)',
      pattern: /\.then\s*\([^)]*\)(?!\s*\.catch)/,
      severity: 'high',
      domain: 'reliability',
      fix: 'Always add .catch() handler or use try/catch with async/await'
    },
    {
      id: 'js-eval-usage',
      name: 'Use of eval() (security risk)',
      pattern: /eval\s*\(/,
      severity: 'critical',
      domain: 'security',
      fix: 'Never use eval(). Use JSON.parse, Function constructor, or other safe alternatives'
    },
    {
      id: 'js-hardcoded-secrets',
      name: 'Hardcoded API keys or secrets',
      pattern: /(api_key|apiKey|password|secret|token|auth)\s*[:=]\s*["\'][\w\-]{20,}["\']|sk-[\w]{20,}|pk_live_[\w]{20,}/i,
      severity: 'critical',
      domain: 'security',
      fix: 'Move secrets to environment variables. Use .env files with .env.example templates'
    }
  ],

  // React Anti-Patterns
  react: [
    {
      id: 'react-missing-dependency-array',
      name: 'useEffect without dependency array',
      pattern: /useEffect\s*\(\s*\([^)]*\)\s*=>\s*{[^}]*},\s*(?!\[)/,
      severity: 'high',
      domain: 'correctness',
      fix: 'Add dependency array: useEffect(() => { /* effect */ }, [dependencies])'
    },
    {
      id: 'react-missing-cleanup',
      name: 'useEffect without cleanup function',
      pattern: /useEffect\s*\(\s*\([^)]*\)\s*=>\s*{(?!.*?return\s*\(\s*\)\s*=>)/,
      severity: 'high',
      domain: 'performance',
      fix: 'Return cleanup function: useEffect(() => { /* setup */ return () => { /* cleanup */ } }, [])'
    },
    {
      id: 'react-deep-prop-drilling',
      name: 'Prop drilling through 3+ levels',
      pattern: /props\.([\w]+).*props\.([\w]+).*props\.([\w]+)/,
      severity: 'medium',
      domain: 'maintainability',
      fix: 'Use Context API, Zustand, or composition (passing components as children)'
    },
    {
      id: 'react-dangerously-set-html',
      name: 'dangerouslySetInnerHTML without sanitization',
      pattern: /dangerouslySetInnerHTML/,
      severity: 'critical',
      domain: 'security',
      fix: 'Use DOMPurify: dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userHTML) }}'
    },
    {
      id: 'react-unnecessary-memo',
      name: 'Over-memoization (React.memo on every component)',
      pattern: /React\.memo|useMemo|useCallback/,
      severity: 'low',
      domain: 'performance',
      fix: 'Profile first with React DevTools Profiler before memoizing'
    },
    {
      id: 'react-inline-function',
      name: 'Inline function in event handler (causes re-renders)',
      pattern: /onClick\s*=\s*{\s*\(\)\s*=>\s*}/,
      severity: 'medium',
      domain: 'performance',
      fix: 'Define handler outside JSX or use useCallback to memoize'
    }
  ],

  // Next.js Anti-Patterns
  nextjs: [
    {
      id: 'nextjs-img-not-optimized',
      name: 'Using <img> instead of <Image> component',
      pattern: /<img\s+src=/,
      severity: 'high',
      domain: 'performance',
      fix: 'Use Next.js <Image /> component for automatic optimization'
    },
    {
      id: 'nextjs-missing-key-prop',
      name: 'List items without key prop',
      pattern: /\.map\s*\([^)]*\)\s*=>\s*<[^>]*(?<!key)[^>]*>/,
      severity: 'high',
      domain: 'correctness',
      fix: 'Add key prop: array.map(item => <Component key={item.id} />)'
    },
    {
      id: 'nextjs-client-side-only-fetch',
      name: 'Data fetching in useEffect (CSR instead of SSR)',
      pattern: /useEffect\s*\([^)]*\)\s*=>\s*{[^}]*fetch/is,
      severity: 'high',
      domain: 'performance',
      fix: 'Move data fetching to Server Component or use getServerSideProps'
    },
    {
      id: 'nextjs-no-key-css-layout',
      name: 'No key in layout causing hydration mismatch',
      pattern: /export\s+default\s+function\s+RootLayout[^{]*{(?!.*?key)/is,
      severity: 'high',
      domain: 'correctness',
      fix: 'Ensure stable keys in layout structures for hydration'
    }
  ],

  // Performance Anti-Patterns
  performance: [
    {
      id: 'perf-large-monolithic-bundle',
      name: 'Large monolithic JavaScript bundle',
      pattern: /import\s+\*\s+as|import\s+\{[\s\S]*?\}\s+from/,
      severity: 'high',
      domain: 'performance',
      fix: 'Use code splitting: React.lazy, dynamic imports, route-based splitting'
    },
    {
      id: 'perf-no-lazy-loading-images',
      name: 'Images without loading="lazy" attribute',
      pattern: /<img[^>]*(?<!loading)[^>]*>/i,
      severity: 'high',
      domain: 'performance',
      fix: 'Add loading="lazy" to below-the-fold images: <img src="..." loading="lazy" />'
    },
    {
      id: 'perf-third-party-blocking',
      name: 'Synchronous third-party scripts blocking render',
      pattern: /<script\s+src="https:\/\/[^"]*[^>]*>/,
      severity: 'high',
      domain: 'performance',
      fix: 'Use async/defer: <script src="..." async></script> or defer'
    }
  ],

  // Security Anti-Patterns
  security: [
    {
      id: 'sec-no-csp-header',
      name: 'Missing Content Security Policy header',
      pattern: /\/^(?!.*Content-Security-Policy)/,
      severity: 'high',
      domain: 'security',
      fix: 'Add CSP header in middleware: response.headers.set("Content-Security-Policy", "default-src \'self\'")'
    },
    {
      id: 'sec-xss-vulnerability',
      name: 'Potential XSS vulnerability (innerHTML with user input)',
      pattern: /\.innerHTML\s*=|\.insertAdjacentHTML\s*\(/,
      severity: 'critical',
      domain: 'security',
      fix: 'Use textContent or sanitize with DOMPurify before HTML insertion'
    },
    {
      id: 'sec-sql-injection',
      name: 'Potential SQL injection (string concatenation)',
      pattern: /SELECT.*\+|query\s*\(\s*[`\'].*\$|query\s*\(\s*[`\'].*\+/i,
      severity: 'critical',
      domain: 'security',
      fix: 'Use parameterized queries: query("SELECT * FROM users WHERE id = ?", [id])'
    }
  ]
};

/**
 * Check code for anti-patterns
 * @param {string} code - Code to analyze
 * @param {string} fileType - File type (html, css, js, jsx, tsx, ts)
 * @param {string} domain - Optional domain filter
 * @returns {Array} Array of detected anti-patterns with locations and fixes
 */
function detectAntiPatterns(code, fileType, domain = null) {
  const results = [];
  const extensionMap = {
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'css',
    sass: 'css',
    js: 'javascript',
    jsx: 'react',
    ts: 'javascript',
    tsx: 'react',
    nextjs: 'nextjs'
  };

  const category = extensionMap[fileType] || 'javascript';

  // Build rule sets - include JavaScript rules for React files too
  const ruleSets = [
    antiPatternRules[category],
    antiPatternRules.performance,
    antiPatternRules.security
  ];

  // For React/JSX/TSX files, also include JavaScript rules (fetch, events, etc)
  if ((fileType === 'jsx' || fileType === 'tsx' || fileType === 'nextjs') && antiPatternRules.javascript) {
    ruleSets.push(antiPatternRules.javascript);
  }

  const filteredRuleSets = ruleSets.filter(Boolean);

  const lines = code.split('\n');

  filteredRuleSets.forEach(ruleSet => {
    if (!Array.isArray(ruleSet)) return;

    ruleSet.forEach(rule => {
      // Skip if domain filter applied and doesn't match
      if (domain && rule.domain !== domain) return;

      try {
        // Convert pattern to global pattern if needed
        let globalPattern = rule.pattern;
        const patternStr = rule.pattern.toString();
        if (!patternStr.includes('g')) {
          // Create a global version of the pattern
          const flags = rule.pattern.flags + 'g';
          globalPattern = new RegExp(rule.pattern.source, flags);
        }

        const matches = code.matchAll(globalPattern);
        for (const match of matches) {
          const lineNumber = code.substring(0, match.index).split('\n').length;
          results.push({
            id: rule.id,
            name: rule.name,
            severity: rule.severity,
            domain: rule.domain,
            line: lineNumber,
            match: match[0],
            fix: rule.fix
          });
        }
      } catch (e) {
        // Invalid regex, skip
      }
    });
  });

  return results.sort((a, b) => a.line - b.line);
}

module.exports = {
  antiPatternRules,
  detectAntiPatterns
};
