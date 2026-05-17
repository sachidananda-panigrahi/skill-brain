/**
 * AST-based code analyzer using @babel/parser + @babel/traverse.
 * Single traverse pass per file for efficiency.
 * Falls back gracefully: returns { parsed: false } on any error.
 */

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const PARSE_OPTS = {
  sourceType: 'unambiguous',
  errorRecovery: true,
  plugins: [
    'jsx',
    'typescript',
    'decorators-legacy',
    'classProperties',
    'topLevelAwait'
  ]
};

const HOOK_PATTERN = /^use[A-Z]/;

const CONTROL_FLOW_TYPES = new Set([
  'IfStatement', 'ConditionalExpression', 'LogicalExpression',
  'SwitchStatement', 'SwitchCase',
  'ForStatement', 'ForInStatement', 'ForOfStatement',
  'WhileStatement', 'DoWhileStatement',
  'TryStatement', 'CatchClause'
]);

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod'
]);

/**
 * Analyze a single source file via AST.
 *
 * @param {string} filePath  Absolute path (used for diagnostics only)
 * @param {string} content   File content string
 * @returns {{
 *   parsed: boolean,
 *   imports: string[],
 *   unusedImports: string[],
 *   findings: Array<{rule:string, message:string, line:number, severity:string}>,
 *   metrics: {loc:number, maxNestingDepth:number, componentCount:number}
 * }}
 */
function analyzeFile(filePath, content) {
  let ast;
  try {
    ast = parser.parse(content, PARSE_OPTS);
  } catch {
    return { parsed: false, imports: [], unusedImports: [], findings: [], metrics: { loc: 0, maxNestingDepth: 0, componentCount: 0 } };
  }

  const findings = [];
  const importSources = [];

  // binding: { name, line, used }
  const bindings = new Map();

  let maxNestingDepth = 0;
  let componentCount = 0;
  const lines = content.split('\n');
  const loc = lines.length;

  // Nesting depth tracking per function scope
  const nestingStack = [];     // stack of { depth }
  const functionStack = [];    // stack of { startLine, name }

  // Prop drilling: per component, track JSXAttribute props that are just pass-through identifiers
  const propPassCounts = new Map(); // componentName -> Map<propName, count>

  try {
    traverse(ast, {
      // ── Import tracking ──────────────────────────────────────────────
      ImportDeclaration(path) {
        const src = path.node.source.value;
        if (!src.startsWith('.') && !src.startsWith('/')) {
          importSources.push(src);
        }
        path.node.specifiers.forEach(spec => {
          const localName = spec.local.name;
          bindings.set(localName, {
            name: localName,
            line: spec.local.loc?.start?.line ?? 0,
            used: false
          });
        });
      },

      // ── Reference tracking (mark imports used) ────────────────────────
      Identifier(path) {
        if (!path.isReferencedIdentifier()) return;
        const b = bindings.get(path.node.name);
        if (b) b.used = true;
      },

      JSXIdentifier(path) {
        const b = bindings.get(path.node.name);
        if (b) b.used = true;
      },

      // ── React component detection ─────────────────────────────────────
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path) {
        const name = getFunctionName(path);
        const isPascal = name && /^[A-Z]/.test(name);
        const startLine = path.node.loc?.start?.line ?? 0;
        const endLine = path.node.loc?.end?.line ?? 0;

        if (isPascal) {
          componentCount++;
          // Large component detection
          if (endLine - startLine > 200) {
            findings.push({
              rule: 'large-component',
              message: `Component "${name}" is ${endLine - startLine} lines (>200). Extract into smaller components.`,
              line: startLine,
              severity: 'MEDIUM'
            });
          }
          // Prop drilling initialise
          if (!propPassCounts.has(name)) propPassCounts.set(name, new Map());
        }

        functionStack.push({ startLine, name, isPascal });
        nestingStack.push({ depth: 0 });
      },

      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression:exit'() {
        functionStack.pop();
        const frame = nestingStack.pop();
        if (frame && frame.depth > maxNestingDepth) maxNestingDepth = frame.depth;
      },

      // ── Nesting depth (per function scope) ───────────────────────────
      BlockStatement(path) {
        const parentType = path.parent?.type;
        const isControlFlow =
          parentType === 'IfStatement' ||
          parentType === 'ForStatement' ||
          parentType === 'ForInStatement' ||
          parentType === 'ForOfStatement' ||
          parentType === 'WhileStatement' ||
          parentType === 'DoWhileStatement' ||
          parentType === 'TryStatement' ||
          parentType === 'CatchClause' ||
          parentType === 'SwitchCase';

        if (!isControlFlow || nestingStack.length === 0) return;
        const frame = nestingStack[nestingStack.length - 1];
        frame.depth++;
        if (frame.depth > 4) {
          const fnName = functionStack.length > 0 ? functionStack[functionStack.length - 1].name : 'unknown';
          const line = path.node.loc?.start?.line ?? 0;
          // Only one finding per function (check if we already flagged)
          const alreadyFlagged = findings.some(
            f => f.rule === 'deep-nesting' && f.message.includes(`"${fnName}"`)
          );
          if (!alreadyFlagged) {
            findings.push({
              rule: 'deep-nesting',
              message: `Function "${fnName}" has nesting depth ${frame.depth} (>4). Refactor with early returns.`,
              line,
              severity: 'MEDIUM'
            });
          }
        }
      },

      'BlockStatement:exit'(path) {
        const parentType = path.parent?.type;
        const isControlFlow =
          parentType === 'IfStatement' ||
          parentType === 'ForStatement' ||
          parentType === 'ForInStatement' ||
          parentType === 'ForOfStatement' ||
          parentType === 'WhileStatement' ||
          parentType === 'DoWhileStatement' ||
          parentType === 'TryStatement' ||
          parentType === 'CatchClause' ||
          parentType === 'SwitchCase';

        if (!isControlFlow || nestingStack.length === 0) return;
        nestingStack[nestingStack.length - 1].depth--;
      },

      // ── React Hook violation detection ────────────────────────────────
      CallExpression(path) {
        const callee = path.node.callee;
        let hookName = null;

        if (callee.type === 'Identifier' && HOOK_PATTERN.test(callee.name)) {
          hookName = callee.name;
        } else if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          HOOK_PATTERN.test(callee.property.name)
        ) {
          hookName = callee.property.name;
        }

        if (!hookName) return;

        // Walk up to find control flow ancestor before function boundary
        let current = path.parentPath;
        while (current) {
          if (FUNCTION_TYPES.has(current.node.type)) break;
          if (CONTROL_FLOW_TYPES.has(current.node.type)) {
            const line = path.node.loc?.start?.line ?? 0;
            findings.push({
              rule: 'hooks-rules',
              message: `Hook "${hookName}" called inside "${current.node.type}" — violates Rules of Hooks.`,
              line,
              severity: 'HIGH'
            });
            break;
          }
          current = current.parentPath;
        }
      },

      // ── Prop drilling detection ───────────────────────────────────────
      JSXAttribute(path) {
        if (!path.node.value) return;
        const val = path.node.value;

        // {propName} or {someObj.prop}
        let identName = null;
        if (val.type === 'JSXExpressionContainer') {
          if (val.expression.type === 'Identifier') {
            identName = val.expression.name;
          } else if (
            val.expression.type === 'MemberExpression' &&
            val.expression.object.type === 'Identifier'
          ) {
            identName = val.expression.object.name;
          }
        }

        if (!identName) return;

        // Check if this identifier is a prop of the current component (param destructure)
        // Heuristic: the name is in scope from function params
        const fn = functionStack[functionStack.length - 1];
        if (!fn || !fn.isPascal) return;

        const compName = fn.name;
        const counts = propPassCounts.get(compName);
        if (!counts) return;

        counts.set(identName, (counts.get(identName) || 0) + 1);

        // Flag once we see 3+ distinct children receiving the same prop
        if (counts.get(identName) === 3) {
          const line = path.node.loc?.start?.line ?? 0;
          findings.push({
            rule: 'prop-drilling',
            message: `Prop "${identName}" passed to 3+ children in "${compName}". Consider Context API or composition.`,
            line,
            severity: 'MEDIUM'
          });
        }
      }
    });
  } catch {
    // traverse error — still return partial results
  }

  // Unused imports
  const unusedImports = [];
  bindings.forEach(({ name, used }) => {
    if (!used) unusedImports.push(name);
  });

  if (unusedImports.length > 0) {
    findings.push({
      rule: 'unused-imports',
      message: `Unused imports: ${unusedImports.join(', ')}`,
      line: 1,
      severity: 'LOW'
    });
  }

  return {
    parsed: true,
    imports: [...new Set(importSources)],
    unusedImports,
    findings,
    metrics: { loc, maxNestingDepth, componentCount }
  };
}

function getFunctionName(path) {
  const node = path.node;
  if (node.id?.name) return node.id.name;

  const parent = path.parent;
  if (!parent) return null;

  // const Foo = () => {}  or  const Foo = function() {}
  if (parent.type === 'VariableDeclarator' && parent.id?.name) {
    return parent.id.name;
  }
  // export default function Foo() {}
  if (parent.type === 'ExportDefaultDeclaration' && node.id?.name) {
    return node.id.name;
  }
  // { key: function() {} }
  if (parent.type === 'Property' && parent.key?.name) {
    return parent.key.name;
  }
  return null;
}

module.exports = { analyzeFile };
