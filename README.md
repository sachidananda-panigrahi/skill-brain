# SkillBrain

[![npm version](https://img.shields.io/npm/v/skill-brain)](https://www.npmjs.com/package/skill-brain)
[![CI](https://github.com/sachidananda-panigrahi/skill-brain/actions/workflows/skill-review.yml/badge.svg)](https://github.com/sachidananda-panigrahi/skill-brain/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/sachidananda-panigrahi/skill-brain/blob/main/LICENSE)

RAG-powered skill engine for AI code assistants, exposed via **Model Context Protocol (MCP)**. Scan your codebase, index reusable coding skills, and serve them to Claude, Cursor, Continue, Cline, and Copilot Chat.

## Quick Install

```bash
# Zero install — just run
npx skill-brain start

# Global install
npm install -g skill-brain
skill-brain start
```

Open the dashboard: **http://localhost:3000/dashboard**

For full setup docs see [docs/QUICKSTART.md](docs/QUICKSTART.md).

## Features

- **TOON-weighted RAG** — TOON (Token-Oriented Object Notation) field-weighting boosts name/tag matches 3×/2× over template content for sharper search results
- **110+ default skills** — Development Workflow, Code Quality & Security, Testing & Verification, Architecture & Design, DevOps & Git, and 38 Frontend Development Guidelines (React, CSS, HTML5, global principles)
- **AST-based code analysis** — Babel parses JS/TS/JSX/TSX; Vue SFCs split into script/template/style blocks
- **Config file analysis** — .env secrets, Dockerfile root users, GitHub Actions permissions, tsconfig strict mode
- **File naming validation** — enforces PascalCase components, camelCase hooks, kebab-case utilities
- **Repomix integration** — gitignore-aware file collection, Secretlint security pre-check, token budget annotation, remote repo scanning
- **TF-IDF semantic search** — find skills by meaning, zero config required
- **Optional OpenAI embeddings** — disk-cached dense vector search (skips re-embedding unchanged skills)
- **Dual-tier storage** — global `common.json` + per-project JSON files
- **REST API** — full CRUD + search + similar skills endpoints
- **MCP support** — stdio + HTTP; auto-connects to Cursor (`.cursor/mcp.json`) and Continue (`.continue/config.json`)
- **VSCode auto-start** — MCP server starts when workspace opens (`runOn: folderOpen`)
- **Dashboard** — SPA with semantic search, project scanning, and integration guides

## Quick Start

```bash
# Install
pnpm install    # or: npm install

# Start server
npm start
# → http://localhost:3000/dashboard

# Development (auto-reload)
npm run dev

# Run E2E tests
npm test
```

## Scan a Project

**Via dashboard:** Open the dashboard → Scan Project → enter absolute path → Start Scan

**Via API:**
```bash
curl -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"path": "/absolute/path/to/your/project"}'
```

**Via CLI:**
```bash
node scanProject.js --path=/absolute/path/to/your/project
```

## Model Context Protocol (MCP)

SkillBrain is a first-class MCP server. It exposes high-level tools that make it easy for AI coding assistants (Claude, Cursor, etc.) to understand your project's architecture and enforce best practices.

### Key MCP Tools:
- `get_project_summary` — One-shot architectural overview & anti-pattern report.
- `get_enforcement_rules` — Loads all Senior UI Architect best practices into the AI's context.
- `audit_code` — Automatically retrieves relevant rules to review a specific code snippet.
- `scan_project` — Trigger a fresh scan of any directory directly from your AI chat.
- `search_skills` — Semantic search across all your saved knowledge.
- `list_skills` — List available skills scoped to a project.
- `get_skill` — Retrieve a specific skill's full content.
- `list_projects` — List all projects currently in the database.

See [docs/MCP.md](docs/MCP.md) for the full tool reference and setup guide.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Zero to searching in 5 minutes |
| [docs/VSCODE.md](docs/VSCODE.md) | VSCode auto-start, Cursor, Continue, Copilot |
| [docs/TOON.md](docs/TOON.md) | TOON format spec and field-weighting table |
| [docs/RUNNERS.md](docs/RUNNERS.md) | GitHub Actions, Docker Compose, programmatic usage |
| [docs/MCP.md](docs/MCP.md) | Full MCP tool reference |
| [docs/API.md](docs/API.md) | REST API reference |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |

### Setup
Add this to your `claude_desktop_config.json` or `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "skill-brain": {
      "command": "node",
      "args": ["/absolute/path/to/skill-brain/mcp-server.js"]
    }
  }
}
```

## Architecture

```
Browser / MCP Client
        │
        ▼ HTTP
┌──────────────────────────────────────────────┐
│             Express (index.js)               │
│  /api/health  /api/scan  /mcp  /dashboard    │
└──────┬───────────────────┬───────────────────┘
       │                   │
       ▼                   ▼
┌────────────┐    ┌─────────────────────┐
│ apiSkills  │    │   scanProject.js    │
│ (CRUD +    │    │  ┌───────────────┐  │
│  search +  │    │  │ astAnalyzer   │  │
│  similar)  │    │  │ (Babel AST)   │  │
└──────┬─────┘    │  └───────────────┘  │
       │          │  ┌───────────────┐  │
       ▼          │  │ regexFallback │  │
┌────────────┐    │  └───────────────┘  │
│ skillEngine│◄───┴─────────────────────┘
│ (JSON I/O) │
└──────┬─────┘
       │
       ▼
┌────────────┐    ┌────────────────────────────┐
│  ragIndex  │───►│  tfidf.js (TF-IDF)         │
│  (cache +  │    │  embeddings.js (OpenAI opt) │
│  search)   │    └────────────────────────────┘
└────────────┘
       │
       ▼
  skills/common.json
  skills/projects/{name}.json
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check + embeddings status |
| `GET` | `/api/skills` | List all skills (optionally `?project=`) |
| `GET` | `/api/skills/projects` | List all project names |
| `GET` | `/api/skills/search?q=&k=5` | Semantic search |
| `GET` | `/api/skills/:id/similar?k=5` | Find similar skills |
| `POST` | `/api/skills` | Create skill |
| `PUT` | `/api/skills/:id` | Update skill |
| `DELETE` | `/api/skills/:id` | Delete skill |
| `POST` | `/api/scan` | Scan a project |
| `GET` | `/mcp?project=` | MCP discovery |

All `?project=projectName` query params scope operations to that project's storage.

See [docs/API.md](docs/API.md) for full curl examples.

## Skill Schema

```json
{
  "id": "enforce-react-best-practices",
  "name": "Enforce: React Performance & Patterns",
  "description": "Architectural rules for React development.",
  "template": "Do not use array index as a key prop...",
  "parameters": [
    { "name": "componentName", "description": "Target component" }
  ]
}
```

## Optional: OpenAI Embeddings

Copy `.env.example` to `.env` and add your key:

```bash
OPENAI_API_KEY=sk-...
```

The server auto-detects the key on startup. Without it, TF-IDF semantic search runs automatically — no configuration required.

## Manual Scan Workflow

SkillBrain now uses a manual scan flow for skills extraction.

1. Start the server.
2. Trigger `POST /api/scan` (dashboard or API).
3. Search/manage generated skills through `/api/skills` and MCP tools.

## Release and Publishing

SkillBrain now publishes from GitHub Actions when you push a semantic tag.

### Publish Targets

- npm: `skill-brain`
- GitHub Packages: `@<github-owner>/skill-brain`

### One-time Setup

1. Configure npm Trusted Publishing for this repository in npm package settings:
  https://docs.npmjs.com/trusted-publishers
2. Add this GitHub repository/workflow as a trusted publisher in npm:
  `.github/workflows/release-publish.yml`
3. Ensure GitHub Actions is enabled for this repository:
  https://docs.github.com/actions
4. Keep package visibility public on npm.

### Release Steps

```bash
# 1) Update version
npm version patch

# 2) Push commit and tag
git push origin main --follow-tags
```

The release workflow validates tag format, verifies tag version equals `package.json`, runs tests, performs a dry-run publish, then publishes to npm and GitHub Packages.

### Install from GitHub Packages

```bash
npm install @<github-owner>/skill-brain --registry=https://npm.pkg.github.com
```

## What Gets Detected

### AST-based (high precision, via Babel)
- React Hooks Rule Violations (hook inside conditional/loop)
- Prop Drilling (3+ levels)
- Unused Imports
- Large Components (>200 lines)
- Excessive Nesting (>4 levels)

### Regex-based (broad coverage)
- Security: `eval()`, `dangerouslySetInnerHTML`, hardcoded secrets, unsafe `_blank` links, insecure HTTP
- Performance: heavy libraries (`moment.js`), unoptimized `lodash`, missing lazy loading, `setInterval` leaks
- Accessibility: missing `alt`, empty button labels, inputs without labels
- Code quality: `var` usage, loose equality (`==`), `console.log`, inline styles, sync I/O

## File Structure

```
skill-brain/
├── index.js            # Express server entry point
├── apiSkills.js        # REST API router (CRUD + search + similar)
├── skillEngine.js      # JSON storage abstraction
├── scanProject.js      # Project scanner (orchestrates AST + regex)
├── astAnalyzer.js      # Babel AST single-pass analyzer
├── regexFallback.js    # Regex pattern/anti-pattern detection
├── ragIndex.js         # Dirty-flag RAG cache (TF-IDF / embeddings)
├── tfidf.js            # Pure TF-IDF cosine similarity engine
├── embeddings.js       # Optional OpenAI embeddings wrapper
├── test_e2e.js         # 15 E2E tests
├── public/
│   └── dashboard.html  # SPA dashboard
├── skills/
│   ├── common.json     # Global skills
│   └── projects/       # Per-project skills
├── docs/
│   ├── API.md
│   └── ARCHITECTURE.md
└── .env.example
```

## License

[MIT](LICENSE) © [Sachidananda Panigrahi](https://github.com/sachidananda-panigrahi)
