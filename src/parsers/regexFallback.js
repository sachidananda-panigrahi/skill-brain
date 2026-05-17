/**
 * Regex-based anti-pattern detection — fallback for files that Babel cannot parse
 * (CSS, HTML, config files) or when AST parsing fails.
 *
 * Mutates importCounts and detectedAntiPatterns in-place.
 */

/**
 * @param {string} content             File text
 * @param {string} fileName            Basename of file (e.g. 'App.tsx')
 * @param {string[]} frameworks        Detected frameworks from package.json
 * @param {Map<string,number>} importCounts         Mutated in place
 * @param {Record<string,number>} detectedAntiPatterns  Mutated in place
 */
function runRegexFallback(content, fileName, frameworks, importCounts, detectedAntiPatterns) {
  // Import analysis (also picks up require() for .js files)
  const importMatches = content.match(
    /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g
  );
  if (importMatches) {
    importMatches.forEach(imp => {
      const mod = imp.match(/['"]([^'"]+)['"]/)?.[1];
      if (mod && !mod.startsWith('.') && !mod.startsWith('/')) {
        importCounts.set(mod, (importCounts.get(mod) || 0) + 1);
      }
    });
  }

  // JS / JSX / TS anti-patterns
  if (/\bvar\s+\w+/.test(content)) {
    detectedAntiPatterns['Use of var'] = (detectedAntiPatterns['Use of var'] || 0) + 1;
  }
  if (/\s==\s/.test(content)) {
    detectedAntiPatterns['Loose Equality (==)'] = (detectedAntiPatterns['Loose Equality (==)'] || 0) + 1;
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
  if (/<a\s+href=/.test(content) && frameworks.includes('Next.js')) {
    detectedAntiPatterns['Native <a> Tag in Next.js'] = (detectedAntiPatterns['Native <a> Tag in Next.js'] || 0) + 1;
  }
  if (/\bconsole\.log\(/.test(content)) {
    detectedAntiPatterns['Console Logs in Production Code'] = (detectedAntiPatterns['Console Logs in Production Code'] || 0) + 1;
  }
  if (/style=\{\{/.test(content)) {
    detectedAntiPatterns['Inline Styles Usage'] = (detectedAntiPatterns['Inline Styles Usage'] || 0) + 1;
  }
  if (/\b(API_KEY|SECRET|PASSWORD|TOKEN)\b\s*[:=]\s*['"][a-zA-Z0-9\-_]{16,}['"]/.test(content)) {
    detectedAntiPatterns['Potential Hardcoded Secrets'] = (detectedAntiPatterns['Potential Hardcoded Secrets'] || 0) + 1;
  }
  if (/\beval\s*\(/.test(content)) {
    detectedAntiPatterns['Use of eval()'] = (detectedAntiPatterns['Use of eval()'] || 0) + 1;
  }
  if (/dangerouslySetInnerHTML/.test(content) || /\.innerHTML\s*=/.test(content)) {
    detectedAntiPatterns['Dangerous HTML Injection'] = (detectedAntiPatterns['Dangerous HTML Injection'] || 0) + 1;
  }
  if (/<a\s+[^>]*target=['"]_blank['"](?![^>]*rel=['"]noopener)/.test(content)) {
    detectedAntiPatterns['Unsafe target="_blank"'] = (detectedAntiPatterns['Unsafe target="_blank"'] || 0) + 1;
  }
  if (/http:\/\/[\w./-]+/.test(content) && !/http:\/\/localhost/.test(content)) {
    detectedAntiPatterns['Use of Unsecure HTTP Link'] = (detectedAntiPatterns['Use of Unsecure HTTP Link'] || 0) + 1;
  }
  if (/\bMath\.random\s*\(/.test(content)) {
    detectedAntiPatterns['Non-Cryptographic Randomness'] = (detectedAntiPatterns['Non-Cryptographic Randomness'] || 0) + 1;
  }
  if (/\bsetInterval\s*\(/.test(content) && !/\bclearInterval\s*\(/.test(content)) {
    detectedAntiPatterns['Potential Memory Leak (setInterval)'] = (detectedAntiPatterns['Potential Memory Leak (setInterval)'] || 0) + 1;
  }
  if (/<img\s+[^>]*src=/.test(content) && !/<img\s+[^>]*loading=['"]lazy['"]/.test(content) && !frameworks.includes('Next.js')) {
    detectedAntiPatterns['Missing Lazy Loading for Images'] = (detectedAntiPatterns['Missing Lazy Loading for Images'] || 0) + 1;
  }
  if (/<button\s+((?!aria-label=|aria-labelledby=).)*?>\s*<\/button>/.test(content)) {
    detectedAntiPatterns['Empty Button without Label'] = (detectedAntiPatterns['Empty Button without Label'] || 0) + 1;
  }
  if (/<input\s+((?!id=).)*?>/.test(content) && !/<label/.test(content)) {
    detectedAntiPatterns['Input without Label/ID'] = (detectedAntiPatterns['Input without Label/ID'] || 0) + 1;
  }

  // CSS-specific
  if (/\.css$|\.scss$|\.less$/.test(fileName)) {
    if (/!important/.test(content)) {
      detectedAntiPatterns['Use of !important'] = (detectedAntiPatterns['Use of !important'] || 0) + 1;
    }
    if (/font-size:\s*\d+px/.test(content)) {
      detectedAntiPatterns['Absolute Font Sizes (px)'] = (detectedAntiPatterns['Absolute Font Sizes (px)'] || 0) + 1;
    }
    if (/z-index:\s*9{2,}/.test(content)) {
      detectedAntiPatterns['Magic Z-Index Value'] = (detectedAntiPatterns['Magic Z-Index Value'] || 0) + 1;
    }
    if (/position:\s*fixed/.test(content) && !/will-change/.test(content)) {
      detectedAntiPatterns['Fixed Position Without will-change'] = (detectedAntiPatterns['Fixed Position Without will-change'] || 0) + 1;
    }
  }

  // HTML-specific
  if (/\.html?$/.test(fileName)) {
    if (!/<meta\s+charset=/i.test(content)) {
      detectedAntiPatterns['Missing charset Meta Tag'] = (detectedAntiPatterns['Missing charset Meta Tag'] || 0) + 1;
    }
    if (!/<meta\s+name=['"]viewport['"]/i.test(content)) {
      detectedAntiPatterns['Missing viewport Meta Tag'] = (detectedAntiPatterns['Missing viewport Meta Tag'] || 0) + 1;
    }
    if (/<div\s+onclick=/i.test(content) && !/<div\s+[^>]*onkeydown=/i.test(content)) {
      detectedAntiPatterns['div onclick Without Keyboard Handler'] = (detectedAntiPatterns['div onclick Without Keyboard Handler'] || 0) + 1;
    }
  }

  // JS safety patterns
  if (/JSON\.parse\s*\([^)]+\)/.test(content) && !/try\s*\{[\s\S]{0,200}JSON\.parse/.test(content)) {
    detectedAntiPatterns['JSON.parse Without Try-Catch'] = (detectedAntiPatterns['JSON.parse Without Try-Catch'] || 0) + 1;
  }
  if (/\bfetch\s*\(/.test(content) && !/\.catch\s*\(|try\s*\{[\s\S]{0,300}fetch/.test(content)) {
    detectedAntiPatterns['fetch Without Error Handling'] = (detectedAntiPatterns['fetch Without Error Handling'] || 0) + 1;
  }
  if (/require\s*\(/.test(content) && /async\s+function|async\s+\(|=>\s*\{/.test(content)
      && /require\s*\([^)]+\)/.test(content)) {
    detectedAntiPatterns['Synchronous require Inside Async Function'] = (detectedAntiPatterns['Synchronous require Inside Async Function'] || 0) + 1;
  }
  if (/res\.(json|send|end)\s*\(/.test(content) && !/['"]content-type['"]/i.test(content)
      && !/res\.type\s*\(/.test(content) && /\.js$/.test(fileName)) {
    detectedAntiPatterns['Missing Content-Type Header'] = (detectedAntiPatterns['Missing Content-Type Header'] || 0) + 1;
  }
  if (/process\.env\.\w+/.test(content)
      && !/process\.env\.\w+\s*\|\||process\.env\.\w+\s*\?\?|if\s*\(!?\s*process\.env/.test(content)) {
    detectedAntiPatterns['process.env Without Null Check'] = (detectedAntiPatterns['process.env Without Null Check'] || 0) + 1;
  }
}

/**
 * Detect code patterns from file content using regex.
 * Mutates detectedPatterns Set in place.
 *
 * @param {string} content
 * @param {Set<string>} detectedPatterns
 */
function runRegexPatternDetection(content, detectedPatterns) {
  if (/\buseContext\s*\(|\bcreateContext\s*\(/.test(content)) detectedPatterns.add('React Context API');
  if (/\buseReducer\s*\(/.test(content)) detectedPatterns.add('Reducer Pattern');
  if (/\bforwardRef\s*\(/.test(content)) detectedPatterns.add('Ref Forwarding');
  if (/\bcreateSelector\s*\(/.test(content)) detectedPatterns.add('Memoized Selectors (Reselect)');
  if (/\bmemo\s*\(/.test(content)) detectedPatterns.add('Component Memoization');
  if (/\buseEffect\s*\(/.test(content)) detectedPatterns.add('Side Effect Management');
  if (/\.(get|post|put|delete|patch)\s*\(|axios\b|\bfetch\s*\(/.test(content)) detectedPatterns.add('REST API Integration');
  if (/\bSuspense\b|\blazy\s*\(/.test(content)) detectedPatterns.add('Code Splitting & Lazy Loading');
  if (/aria-|role=|tabIndex=/.test(content)) detectedPatterns.add('Accessibility (A11y) Focus');
  if (/\buseCallback\s*\(|\buseMemo\s*\(/.test(content)) detectedPatterns.add('Performance Optimization (Memoization)');
  if (/\bErrorBoundaries\b|\bErrorBoundary\b/.test(content)) detectedPatterns.add('Error Boundary Pattern');
  if (/\bJWT\b|\btoken\b|localStorage\.setItem\(['"]token/.test(content)) detectedPatterns.add('Token-based Authentication');
  if (/\bvalidate\s*\(|\bparse\s*\(|Zod|Yup/.test(content)) detectedPatterns.add('Schema-based Validation');
}

module.exports = { runRegexFallback, runRegexPatternDetection };
