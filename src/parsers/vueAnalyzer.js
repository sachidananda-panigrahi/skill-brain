'use strict';

const fs = require('fs-extra');
const { analyzeWithRegex } = require('./regexFallback');

/**
 * Analyze a Vue Single File Component (.vue).
 * Splits into script/template/style blocks and runs existing analyzers on the script block.
 */
async function analyzeVue(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return { filePath, patterns: [], antiPatterns: [], imports: [] };
  }

  const scriptBlock = extractBlock(content, 'script');
  const templateBlock = extractBlock(content, 'template');
  const styleBlock = extractBlock(content, 'style');

  const isCompositionApi = scriptBlock.includes('setup()') ||
    content.includes('<script setup') ||
    scriptBlock.includes('defineComponent');

  const base = analyzeWithRegex(scriptBlock, filePath);

  base.vueInfo = {
    hasScriptSetup: content.includes('<script setup'),
    apiStyle: isCompositionApi ? 'composition' : 'options',
    hasTypescript: content.includes('lang="ts"'),
    hasStyleScoped: styleBlock.includes('scoped'),
    templateLength: templateBlock.length,
  };

  // Flag Options API as a low-severity pattern (prefer Composition API)
  if (!isCompositionApi) {
    base.antiPatterns = base.antiPatterns || [];
    base.antiPatterns.push({
      type: 'vue-options-api',
      severity: 'low',
      message: 'Consider migrating to Composition API (<script setup>) for better TypeScript support and tree-shaking.',
      file: filePath,
    });
  }

  return base;
}

function extractBlock(content, blockName) {
  const openTag = new RegExp(`<${blockName}[^>]*>`, 'i');
  const closeTag = new RegExp(`</${blockName}>`, 'i');
  const openMatch = content.match(openTag);
  if (!openMatch) return '';
  const start = openMatch.index + openMatch[0].length;
  const closeMatch = content.slice(start).match(closeTag);
  if (!closeMatch) return content.slice(start);
  return content.slice(start, start + closeMatch.index);
}

module.exports = { analyzeVue };
