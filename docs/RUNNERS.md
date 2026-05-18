# Runner Examples

## SKILLS.md — Non-MCP Consumer

The easiest way to integrate SkillBrain into a project is to generate a `SKILLS.md` file, which is automatically read by multiple AI assistants:

### Supported Consumers

- **Claude Code** — Reads SKILLS.md as part of codebase context
- **Cursor** — Includes SKILLS.md in symbol indexing + composer context
- **Copilot Chat** — Reads SKILLS.md when available in repo
- **Repomix** — Bundled into project context with file annotation

### Setup

```bash
# Generate SKILLS.md (auto-detects your tech stack)
npx skill-brain init

# Skills auto-update whenever CRUD happens
# (dashboard, API, or manual edits)
```

The generated SKILLS.md includes machine-readable frontmatter:
```markdown
<!-- skill-brain:generated skill-brain:version=1.0.0 skill-brain:stack=nextjs,react,typescript -->

# SKILLS — My Project

[skill content...]
```

This metadata helps assistants understand the document's provenance and stack.

### Force Re-generation

```bash
# Manually trigger regeneration of all registered SKILLS.md files
curl -X POST http://localhost:3000/api/skills/export/markdown

# Check status of all registered files
curl http://localhost:3000/api/skills/export/status
```

---

## GitHub Actions

### Scan on push and search skills in CI

```yaml
name: skill-brain CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  skill-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      - name: Start skill-brain server
        run: node src/entry-points/index.js &
        env:
          PORT: 3000

      - name: Wait for server
        run: npx wait-on http://localhost:3000/api/health

      - name: Scan project
        run: |
          curl -s -X POST http://localhost:3000/api/scan \
            -H 'Content-Type: application/json' \
            -d '{"path": "."}' | jq '.'

      - name: Search for performance skills
        run: |
          curl -s "http://localhost:3000/api/skills/search?q=performance+LCP&k=5" | \
            jq '.results[].skill.name'

      - name: Run diff review
        run: node src/engines/scanProject.js --review=origin/main --format=json --output=.review/report
        env:
          REVIEW_BASE: origin/main
```

### Review mode with exit code

```yaml
- name: Skill review (enforces critical anti-patterns)
  run: node src/engines/scanProject.js --review=origin/main --format=json --output=.review/report
  continue-on-error: true

- name: Upload review report
  uses: actions/upload-artifact@v4
  with:
    name: skill-review
    path: .review/
```

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  skill-brain:
    image: node:20-alpine
    working_dir: /app
    command: node src/entry-points/index.js
    volumes:
      - .:/app
      - skill-data:/data
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      PORT: 3000
      MCP_HTTP_PORT: 3001
      SKILL_BRAIN_DATA: /data
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  skill-data:
```

Run:
```bash
docker-compose up -d
docker-compose logs -f skill-brain
```

## Local Development

```bash
# Install deps
pnpm install

# Start with hot reload
pnpm dev

# Or start both HTTP server and MCP server
node src/entry-points/index.js &
node bin/skill-brain.js mcp
```

## Remote Repo Scanning (Repomix)

Scan a GitHub repo without cloning:

```bash
# Via API
curl -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://github.com/org/repo"}'

# Requires repomix installed:
npm install repomix
```

## Programmatic Usage

```js
const { scanProject, generateSkillsFromScan } = require('@snpanigrahi88/skill-brain/scan');
const { search } = require('@snpanigrahi88/skill-brain/rag');

// Scan a project
const scan = scanProject('/path/to/project');
const { commonSkills, projectSkills } = generateSkillsFromScan(scan);

// Search skills
const results = await search('react hooks performance', 5);
results.forEach(r => console.log(r.skill.name, r.score));
```

## Environment Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `MCP_HTTP_PORT` | `3001` | MCP HTTP transport port |
| `OPENAI_API_KEY` | — | Enables dense embedding search |
| `SKILL_BRAIN_DATA` | `./` | Writable data directory (global npm install) |
| `REVIEW_BASE` | `origin/main` | Base branch for diff review |
