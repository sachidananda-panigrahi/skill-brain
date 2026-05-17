# Architecture

## Overview

SkillBrain is a Node.js/CommonJS application (no transpilation, no bundler). It has three independent subsystems that compose at runtime:

1. **Scanner** — reads a project, extracts patterns via AST + regex, produces skill objects
2. **Storage** — reads/writes JSON files in `skills/`
3. **RAG index** — in-memory TF-IDF (or dense embedding) index, rebuilt lazily on write

---

## Data Flow

### Scan flow

```
POST /api/scan { path }
  → scanProject(path)
      → package.json  → framework/arch detection
      → walk(src/)
          for each .js/.ts/.jsx/.tsx:
            → analyzeFile(content)   [Babel AST]
                → imports, unusedImports, findings
              on parse failure:
            → runRegexFallback()     [regex]
            → runRegexPatternDetection()
          for each .css/.html:
            → runRegexFallback()
  → generateSkillsFromScan(scanResult)
      → commonSkills[]   (enforcement rules, always global)
      → projectSkills[]  (context, patterns, libs, insights, report)
  → merge with existing JSON files
  → ragIndex.markDirty(projectName)
  → ragIndex.markDirty(null)         (common invalidated too)
```

### Search flow

```
GET /api/skills/search?q=...&k=5
  → ragIndex.search(query, k, projectName)
      → ensureFresh()
          dirty or absent? → build()
              → skillEngine.loadSkills(projectName)
              → tfidf.buildIndex(docs)
              → embeddings.isEnabled()?
                  → embed(texts)   [OpenAI API]
                  on null → skip (TF-IDF only)
      → embeddings available?
          → embed([query]) → cosine over dense vectors
        else:
          → tfidf.cosineQuery(index, query, k)
  → [{skill, score}]
```

---

## AST Analyzer (`astAnalyzer.js`)

### Why Babel

| Parser | JSX | TypeScript | Install |
|--------|-----|------------|---------|
| `acorn` + plugins | fragile | community plugin only | lightweight |
| `@babel/parser` | native | native | pure JS, no native build |
| `tree-sitter` | yes | yes | **native bindings required** |

Babel was chosen: first-class JSX+TS in a single pure-JS package with `errorRecovery:true`. On any parse failure, `analyzeFile` returns `{ parsed: false }` and the scanner falls back to regex.

### Single-pass design

One `traverse` call accumulates all state:

```
ImportDeclaration   → record import sources + specifier names in bindings{}
Identifier          → mark binding.used = true  (when isReferencedIdentifier)
JSXIdentifier       → same
FunctionDeclaration / ArrowFunctionExpression
  → push to functionStack, nestingStack
  → detect PascalCase → componentCount++
  → detect endLine - startLine > 200 → large-component finding
BlockStatement      → increment nesting depth if inside control flow
                      depth > 4 → deep-nesting finding (one per function)
CallExpression      → if name matches /^use[A-Z]/:
                        walk ancestry; if control-flow node before function boundary
                        → hooks-rules finding (HIGH severity)
JSXAttribute        → if value is identifier expression:
                        count per component per prop name
                        count >= 3 → prop-drilling finding (MEDIUM)
```

After traverse: bindings with `used=false` → `unused-imports` finding.

### Prop drilling heuristic

Detecting true prop drilling requires type flow analysis (full TypeScript compiler API). The heuristic used here counts how many distinct JSXAttribute sites pass the same identifier as a value. This catches the common pattern but may miss drilling through variables or spreading props. This is documented as a heuristic caveat — the finding triggers a discussion rather than a certain violation.

---

## TF-IDF Engine (`tfidf.js`)

### Formula

```
TF(term, doc)  = count(term, doc) / len(doc)
IDF(term)      = log((1 + N) / (1 + df(term))) + 1   [smooth variant]
Weight(t, d)   = TF(t,d) × IDF(t)

cosine(q, d) = dot(q_vec, d_vec) / (|q_vec| × |d_vec|)
```

Smooth IDF ensures terms that appear in all documents still have non-zero weight (avoids log(0)). Sparse `Map<term, weight>` vectors skip zero-overlap pairs for efficiency.

### Index build

```
buildIndex(docs) → { N, idf: Map, vectors: Map<id, Map>, norms: Map<id, number> }
```

Document text = `name\n description\n template\n param names` (joined in `ragIndex.js`). Stop words removed; terms < 2 chars dropped.

---

## RAG Index (`ragIndex.js`)

### Dirty-flag lazy cache

```
cache: Map<scope, { index, embedMap, dirty, skills }>
scope = projectName || '__common__'
```

Any write through `skillEngine` calls `markDirty(scope)` via a lazy `require('./ragIndex')` inside each mutating function. This avoids the circular dependency (ragIndex requires skillEngine at top level; skillEngine cannot require ragIndex at top level).

On the next `search()` or `similar()` call, `ensureFresh()` rebuilds the index for that scope only.

### Embedding fallback chain

```
isEnabled()?         → try embed(texts)
embed() returns null → fall back to TF-IDF
TF-IDF always runs   → guaranteed results
```

`embed()` never throws. It handles network errors, timeouts (10s `AbortController`), non-200 responses, and malformed JSON by returning `null`. The API key is never logged.

---

## Storage Layout

```
skills/
├── common.json          ← global skills (enforcement rules + cross-project)
└── projects/
    ├── my-app.json
    ├── another-app.json
    └── ...
```

`loadSkills(projectName)` returns `[...common, ...project]` — common first, project appended. Both share the same ID space; if a project re-generates a common-scoped skill with the same ID, it still shows twice (callers deduplicate by preference).

---

## Route Registration Order

In `apiSkills.js`, route order matters in Express to prevent `:id` wildcards from shadowing static paths:

```
GET  /projects         ← must be before /:id
GET  /search           ← must be before /:id
GET  /
POST /
GET  /:id/similar      ← /similar suffix prevents conflict with /search
PUT  /:id
DELETE /:id
```

There is no `GET /:id` route, so `/search` cannot be shadowed. This is preserved by convention; do not add a bare `GET /:id` without moving `/search` above it.

---

## Skill ID Conventions

| Prefix | Scope | Source |
|--------|-------|--------|
| `project-{slug}` | project | scan |
| `pattern-{slug}` | project | scan |
| `lib-{name}` | project | scan |
| `architect-insights-{slug}` | project | scan |
| `enforce-{slug}` | common | scan (always) |
| `anti-pattern-report-{slug}` | project | scan |
| `{name}-{timestamp}` | common or project | manual create |

---

## Tooling Improvement Backlog (Prioritized)

### Critical / High

1. **Scan path boundary validation**
  - Problem: `/api/scan` accepts any existing path.
  - Fix: validate with `realpath`, enforce allowed roots, reject path traversal/symlink escapes.
  - Files: `index.js`, `scanProject.js`

2. **Request schema validation**
  - Problem: API accepts loose JSON for create/update/scan flows.
  - Fix: add schema validation for request bodies and query params.
  - Files: `apiSkills.js`, `index.js`

3. **Rate limiting for expensive endpoints**
  - Problem: scan/search/review endpoints are unthrottled.
  - Fix: add route-level rate limits (`/api/scan`, `/api/review`, `/api/skills/search`).
  - Files: `index.js`

### Medium

4. **RAG cache bounds**
  - Problem: in-memory cache can grow without bounds across projects.
  - Fix: add max-size/LRU policy and stale eviction.
  - Files: `ragIndex.js`

5. **Scan progress streaming**
  - Problem: long scans look stalled in dashboard.
  - Fix: add SSE progress stream for scanned file counts and stage markers.
  - Files: `index.js`, `public/dashboard.js`

### Low

6. **Split E2E test suites**
  - Problem: `test_e2e.js` is growing and harder to debug.
  - Fix: split API, scanner, and MCP integration tests into dedicated suites.
  - Files: `test_e2e.js`, new `test_api_e2e.js`, `test_scan_e2e.js`, `test_mcp_e2e.js`
