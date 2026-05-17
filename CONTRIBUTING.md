# Contributing

## Setup

```bash
git clone <repo>
cd skill-brain
pnpm install    # or: npm install
npm start       # http://localhost:3000/dashboard
npm test        # 15 E2E tests
```

## Constraints

**Stay CommonJS.** No `import`/`export`. No transpilation. The server runs directly with `node index.js`.

**800-line file cap.** If a file grows past 800 lines, extract a module. Example: `regexFallback.js` was extracted from `scanProject.js` for this reason.

**Zero mandatory config.** The server must start with `node index.js` and pass `npm test` with no env vars. Optional features (embeddings) activate only when the relevant env var is present.

**Immutable patterns.** Never mutate arrays or objects in place — use spread / `filter` / `map`. Exception: the `importCounts` and `detectedAntiPatterns` accumulators in the scanner are explicitly mutable by design (closed-over mutation, not exposed).

**No `console.log` in production paths.** Use structured errors. `console.error` is acceptable for startup diagnostics.

## Adding a New Anti-Pattern Detection

1. If it requires semantic code understanding → add a visitor in `astAnalyzer.js`
2. If it's regex-matchable → add to `runRegexFallback()` in `regexFallback.js`
3. Add the rule name to the `ruleMap` in `scanProject.js` if it comes from the AST
4. Add a refactoring note to the template in `generateSkillsFromScan` (`anti-pattern-report-*` skill)
5. Add a test assertion to `test_e2e.js`

## Adding a New API Endpoint

1. Add the route to `apiSkills.js` **before** any `/:id` catch-all route
2. Document it in `docs/API.md` with a curl example
3. Add a test to `test_e2e.js`

## Adding a New Skill Category

1. Add a new block in `generateSkillsFromScan()` in `scanProject.js`
2. Add the ID prefix to `getSkillType()` in `public/dashboard.html`
3. Update the ID conventions table in `docs/ARCHITECTURE.md`

## PR Checklist

- [ ] `npm test` passes (all 15 tests green)
- [ ] No file exceeds 800 lines
- [ ] No hardcoded secrets or credentials
- [ ] No new mandatory env vars
- [ ] New API endpoints documented in `docs/API.md`
- [ ] Commit message follows `feat:` / `fix:` / `refactor:` / `docs:` convention

## Release Checklist

Before the first release from CI, configure npm Trusted Publishing for this repository:
https://docs.npmjs.com/trusted-publishers

1. Ensure local checks pass:

```bash
pnpm install --frozen-lockfile
pnpm test
npm publish --dry-run
```

2. Bump version in `package.json`:

```bash
npm version patch   # or minor / major
```

3. Push commit and tag:

```bash
git push origin main --follow-tags
```

4. Verify workflow run in `.github/workflows/release-publish.yml` succeeds:
- Validate release tag and package version
- Publish to npm (`skill-brain`) via Trusted Publishing
- Publish to GitHub Packages (`@<owner>/skill-brain`)
