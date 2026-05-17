# API Reference

Base URL: `http://localhost:3000`

All request/response bodies are JSON. All endpoints that accept `?project=` scope to that project's storage; omit it to operate on global (`common.json`).

---

## Health

### `GET /api/health`

```bash
curl http://localhost:3000/api/health
```

**Response 200:**
```json
{
  "status": "ok",
  "uptime": 42.1,
  "embeddingsEnabled": false,
  "mcpServerPath": "/path/to/skill-brain/mcp-server.js"
}
```

---

## Skills

### `GET /api/skills`

List all skills. Without `?project=`, returns global skills only.

```bash
# Global skills
curl http://localhost:3000/api/skills

# Project-scoped (global + project merged)
curl "http://localhost:3000/api/skills?project=my-app"
```

**Response 200:** `Skill[]`

---

### `GET /api/skills/projects`

```bash
curl http://localhost:3000/api/skills/projects
```

**Response 200:** `string[]` — list of project names

---

### `GET /api/skills/search`

Semantic skill search using TF-IDF (or OpenAI embeddings if enabled).

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `q` | yes | — | Search query |
| `k` | no | 5 | Max results (1–50) |
| `project` | no | — | Scope to project |

```bash
curl "http://localhost:3000/api/skills/search?q=react+performance&k=5"
curl "http://localhost:3000/api/skills/search?q=accessibility+aria&k=3&project=my-app"
```

**Response 200:**
```json
{
  "query": "react performance",
  "k": 5,
  "results": [
    {
      "skill": { "id": "enforce-react-best-practices", "name": "...", "template": "..." },
      "score": 0.8241
    }
  ]
}
```

**Response 400** (missing `q`):
```json
{ "error": "Query parameter \"q\" is required" }
```

---

### `GET /api/skills/:id/similar`

Find skills similar to the given skill id.

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `k` | no | 5 | Max results (1–50) |
| `project` | no | — | Scope to project |

```bash
curl "http://localhost:3000/api/skills/enforce-react-best-practices/similar?k=3"
```

**Response 200:**
```json
{
  "id": "enforce-react-best-practices",
  "k": 3,
  "results": [
    {
      "skill": { "id": "enforce-performance-nfrs", "name": "...", "template": "..." },
      "score": 0.7123
    }
  ]
}
```

**Response 404** (skill not in scope):
```json
{ "error": "Skill \"ghost-id\" not found" }
```

---

### `POST /api/skills`

Create a skill.

```bash
curl -X POST http://localhost:3000/api/skills \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Use Zustand for state",
    "description": "Prefer Zustand over Redux for simple state",
    "template": "When managing {{stateType}} state, use Zustand stores.",
    "parameters": [{ "name": "stateType", "description": "Type of state (UI/server)" }]
  }'

# Add to a project
curl -X POST "http://localhost:3000/api/skills?project=my-app" \
  -H 'Content-Type: application/json' \
  -d '{ "name": "...", "template": "..." }'
```

**Body fields:**

| Field | Required | Type |
|-------|----------|------|
| `name` | yes | string |
| `template` | yes | string |
| `description` | no | string |
| `parameters` | no | `[{name, description}]` |
| `id` | no | string (auto-generated if omitted) |

**Response 201:** Created skill object

**Response 400:** `{ "error": "name and template are required" }`

---

### `PUT /api/skills/:id`

Update a skill by id.

```bash
curl -X PUT "http://localhost:3000/api/skills/my-skill-id" \
  -H 'Content-Type: application/json' \
  -d '{ "description": "Updated description" }'
```

**Response 200:** Updated skill object
**Response 404:** `{ "error": "Skill not found" }`

---

### `DELETE /api/skills/:id`

```bash
curl -X DELETE "http://localhost:3000/api/skills/my-skill-id"
curl -X DELETE "http://localhost:3000/api/skills/my-skill-id?project=my-app"
```

**Response 200:** `{ "message": "Deleted" }`
**Response 404:** `{ "error": "Skill not found" }`

---

## Scan

### `POST /api/scan`

Scan a project directory and auto-generate skills.

```bash
curl -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{ "path": "/Users/name/projects/my-app" }'
```

**Response 200:**
```json
{
  "message": "Scan complete for my-app. Added 12 project skills, 0 common skills.",
  "projectName": "my-app",
  "totalProject": 14,
  "totalCommon": 8
}
```

**Response 400:** `{ "error": "Invalid project path" }`

---

## MCP Integration

SkillBrain supports the **Model Context Protocol (MCP)** in two ways:

### 1. Stdio Server (Recommended for IDEs)

Use `mcp-server.js` with tools like Claude Desktop, Cursor, Zed, or Continue.

**Config Example:**
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

**Exposed Tools:**
See [docs/MCP.md](MCP.md) for a detailed reference of all MCP tools.

- `get_project_summary(project)`: Returns a comprehensive architectural overview.
- `get_enforcement_rules()`: Retrieve all Senior UI Architect enforcement rules.
- `audit_code(code, project?, filePath?)`: Provides context for auditing code.
- `scan_project(path, mode?)`: Scans a local project directory.
- `search_skills(query, k?, project?)`: Semantic search for relevant skills.
- `list_skills(project?, type?)`: List available skills.
- `get_skill(id, project?)`: Get full content of a specific skill.
- `list_projects()`: List all scanned projects.

### 2. HTTP MCP Discovery

Returns all skills in MCP capabilities format for tools that prefer HTTP discovery.

### `GET /mcp`

```bash
curl "http://localhost:3000/mcp"
curl "http://localhost:3000/mcp?project=my-app"
```

**Response 200:**
```json
{
  "capabilities": {
    "skills": [ ... ]
  }
}
```

### 3. HTTP MCP JSON-RPC

For tools supporting JSON-RPC over HTTP.

### `POST /mcp`

Supports standard MCP methods like `tools/list` and `tools/call`.

---

## Prebuilt Skills (Senior UI Architect Best Practices)

Curated skills from GitHub repositories and OWASP standards for Senior UI Architect competencies across 12 domains.

### `GET /api/skills/prebuilt/all`

List all prebuilt skills from GitHub best practices sources.

```bash
curl http://localhost:3000/api/skills/prebuilt/all
```

**Response 200:**
```json
{
  "count": 42,
  "skills": [
    {
      "id": "architect-ui-architecture",
      "name": "UI Architecture: Layered Slot-Based Shells",
      "domain": "UI Architecture",
      "category": "architecture",
      "severity": "high",
      "source": "GitHub: module-federation, shadcn/ui",
      "template": "..."
    }
  ]
}
```

### `GET /api/skills/prebuilt/competencies`

Get Senior UI Architect competency set (12 domains).

```bash
curl http://localhost:3000/api/skills/prebuilt/competencies
```

**Response 200:**
```json
{
  "UI Architecture": [ { ...skills } ],
  "Design Systems": [ { ...skills } ],
  "AI-Augmented Engineering": [ { ...skills } ],
  "Micro-Frontend / Monorepo": [ { ...skills } ],
  "React.js / TypeScript": [ { ...skills } ],
  "Performance Optimisation": [ { ...skills } ],
  "Team Leadership": [ { ...skills } ],
  "CI/CD Pipelines": [ { ...skills } ],
  "RESTful & GraphQL APIs": [ { ...skills } ],
  "SSR / Next.js": [ { ...skills } ],
  "Agile / Scrum": [ { ...skills } ],
  "UX & Wireframing": [ { ...skills } ]
}
```

### `GET /api/skills/prebuilt/domain/:domain`

Get skills for a specific domain.

```bash
curl "http://localhost:3000/api/skills/prebuilt/domain/React.js%20%2F%20TypeScript"
```

**Response 200:**
```json
{
  "domain": "React.js / TypeScript",
  "count": 4,
  "skills": [ { ...skills } ]
}
```

### `GET /api/skills/prebuilt/severity/:severity`

Get skills by severity level (critical, high, medium, low).

```bash
curl "http://localhost:3000/api/skills/prebuilt/severity/critical"
```

### `GET /api/skills/prebuilt/search?q=...`

Search prebuilt skills by keyword.

```bash
curl "http://localhost:3000/api/skills/prebuilt/search?q=lighthouse%20performance"
```

### `GET /api/skills/prebuilt/lighthouse`

Get Lighthouse and Core Web Vitals enforcement skills.

```bash
curl "http://localhost:3000/api/skills/prebuilt/lighthouse"
```

**Response 200:**
```json
{
  "count": 6,
  "skills": [
    {
      "id": "perf-lighthouse-core-vitals",
      "name": "Performance: Google Core Web Vitals & Lighthouse",
      "description": "Achieve 100% Lighthouse score by optimizing Core Web Vitals"
    }
  ]
}
```

### `GET /api/skills/prebuilt/security-nfr`

Get security and non-functional requirement (NFR) enforcement skills.

```bash
curl "http://localhost:3000/api/skills/prebuilt/security-nfr"
```

---

## Anti-Pattern Detection

### `POST /api/skills/anti-patterns/detect`

Detect architectural, performance, security, and code quality anti-patterns in code.

```bash
curl -X POST http://localhost:3000/api/skills/anti-patterns/detect \
  -H 'Content-Type: application/json' \
  -d '{
    "code": "fetch(url).then(r => r.json()).then(data => {...})",
    "fileType": "jsx",
    "domain": "performance"
  }'
```

**Request body:**

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `code` | yes | string | Source code to analyze |
| `fileType` | no | string | html, css, js, jsx, ts, tsx (default: js) |
| `domain` | no | string | Filter by domain (performance, security, etc.) |

**Response 200:**
```json
{
  "summary": {
    "total": 2,
    "critical": 0,
    "high": 2,
    "medium": 0,
    "low": 0
  },
  "violations": [
    {
      "id": "js-missing-abort-controller",
      "name": "Fetch without AbortController (memory leak risk)",
      "severity": "high",
      "domain": "performance",
      "line": 1,
      "fix": "Use AbortController: const abort = new AbortController(); fetch(url, { signal: abort.signal })"
    }
  ]
}
```

---

## Lighthouse Validation

### `POST /api/skills/lighthouse/validate`

Validate a Lighthouse report against 100% compliance targets.

```bash
curl -X POST http://localhost:3000/api/skills/lighthouse/validate \
  -H 'Content-Type: application/json' \
  -d '{ "report": { "lighthouseVersion": "11.0.0", ... } }'
```

**Request body:**

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `report` | yes | object | Parsed Lighthouse JSON report |

**Response 200:**
```json
{
  "version": "11.0.0",
  "url": "https://example.com",
  "scores": {
    "performance": { "name": "Performance", "score": 95, "target": 100 },
    "accessibility": { "name": "Accessibility", "score": 100, "target": 100 }
  },
  "vitals": {
    "CLS": { "value": 0.12, "threshold": 0.1, "passed": false },
    "LCP": { "value": 2100, "threshold": 2500, "passed": true }
  },
  "violations": [
    { "metric": "CLS", "value": 0.12, "threshold": 0.1 }
  ]
}
```

### `POST /api/skills/lighthouse/improvement-plan`

Generate prioritized improvement plan from Lighthouse violations.

```bash
curl -X POST http://localhost:3000/api/skills/lighthouse/improvement-plan \
  -H 'Content-Type: application/json' \
  -d '{ "report": { "lighthouseVersion": "11.0.0", ... } }'
```

**Response 200:**
```json
{
  "critical": [
    {
      "type": "metric",
      "metric": "CLS",
      "current": 0.12,
      "target": 0.1,
      "gap": 0.02,
      "fix": "Improve Cumulative Layout Shift to ≤ 0.1"
    }
  ],
  "high": [
    {
      "type": "audit",
      "title": "Largest Contentful Paint element",
      "description": "...",
      "details": [ { ...audit details } ]
    }
  ]
}
```

---

## Skill Coverage Report

### `POST /api/skills/coverage/report`

Generate skill coverage report comparing detected vs. available skills.

```bash
curl -X POST http://localhost:3000/api/skills/coverage/report \
  -H 'Content-Type: application/json' \
  -d '{
    "detectedSkills": [
      { "id": "react-hooks-rules", "domain": "React.js / TypeScript" },
      { "id": "perf-lighthouse-core-vitals", "domain": "Performance Optimisation" }
    ]
  }'
```

**Response 200:**
```json
{
  "timestamp": "2026-05-17T10:30:00Z",
  "coverage": {
    "total": 42,
    "detected": 2,
    "percentage": 5
  },
  "domains": {
    "React.js / TypeScript": {
      "total": 4,
      "detected": 1,
      "percentage": 25,
      "coverage": "PARTIAL"
    }
  },
  "gaps": [
    {
      "domain": "Performance Optimisation",
      "missing": 5,
      "skills": [
        { "id": "perf-memory-leaks", "name": "Performance: Memory Leak Prevention", "severity": "high" }
      ]
    }
  ]
}
```

---
