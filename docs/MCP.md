# Model Context Protocol (MCP) Reference

SkillBrain is a first-class MCP server that exposes high-level tools to AI coding assistants (Claude Desktop, Cursor, Cline, Roo Code, Zed, etc.).

By connecting SkillBrain to your AI tool, you enable it to:
- **Understand your project's architecture** in one shot.
- **Enforce Senior UI Architect rules** automatically.
- **Audit your code** against project-specific patterns and anti-patterns.
- **Discover available libraries** and how they are used in your codebase.

---

## Setup

### Claude Desktop
Add this to your `claude_desktop_config.json` (usually in `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "skill-brain": {
      "command": "node",
      "args": ["/absolute/path/to/skill-brain/bin/skill-brain.js", "mcp"]
    }
  }
}
```

### Cursor (auto-connect via workspace config)
The `.cursor/mcp.json` file in this repo is auto-detected when you open the workspace in Cursor:
```json
{
  "mcpServers": {
    "skill-brain": {
      "command": "node",
      "args": ["bin/skill-brain.js", "mcp"]
    }
  }
}
```
Verify: **Cursor Settings → MCP** → skill-brain should be listed.

For global Cursor config (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "skill-brain": {
      "command": "node",
      "args": ["/absolute/path/to/skill-brain/bin/skill-brain.js", "mcp"]
    }
  }
}
```

### Continue / Cline (HTTP transport)
The `.continue/config.json` in this repo configures HTTP transport automatically:
```json
{
  "mcpServers": [
    {
      "name": "skill-brain",
      "transport": "http",
      "url": "http://localhost:3000/mcp"
    }
  ]
}
```
Requires the HTTP server to be running: `skill-brain start`

### GitHub Copilot Chat
Add to VS Code `settings.json`:
```json
{
  "github.copilot.chat.mcpServers": {
    "skill-brain": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Zed
Add to your `settings.json`:
```json
{
  "context_servers": [
    {
      "name": "skill-brain",
      "command": "node",
      "args": ["/absolute/path/to/skill-brain/bin/skill-brain.js", "mcp"]
    }
  ]
}
```

---

## Tool Reference

### `search_skills`
Semantic search for relevant coding skills, best practices, and enforcement rules. Uses TF-IDF or OpenAI embeddings if enabled.

**Arguments:**
- `query` (string, required): Natural language search query (e.g., "react performance hooks").
- `k` (number, optional): Maximum results to return (1–20, default: 5).
- `project` (string, optional): Scope search to a specific project name.

---

### `get_project_summary`
Get a comprehensive architectural overview, detected patterns, and anti-pattern reports for a project. This is the best tool for "onboarding" the AI to a new codebase.

**Arguments:**
- `project` (string, required): Name of the project to summarize.

**Returns:**
A structured markdown summary containing:
- Project Context (frameworks, core dependencies)
- Architect Insights (custom hooks, service layers, patterns)
- Anti-Pattern Report (detected violations of best practices)
- Key Patterns (list of identified architectural patterns)

---

### `get_enforcement_rules`
Retrieve all global Senior UI Architect enforcement rules and best practices. These apply across all projects.

**Arguments:** None.

**Returns:**
A concatenated list of all `enforce-` prefixed skills from the common database.

---

### `audit_code`
Provide relevant architectural skills and best practices for auditing a specific code snippet.

**Arguments:**
- `code` (string, required): The code snippet to audit.
- `project` (string, optional): Project context for more relevant patterns.
- `filePath` (string, optional): Path to the file being audited (helps with context).

**Example Usage:**
"Audit this code for any Senior UI Architect violations: `const [state, setState] = useState(); useEffect(() => { ... })`"

---

### `scan_project`
Scan a local project directory to extract tech stack, patterns, and anti-patterns. Updates the skill database immediately.

**Arguments:**
- `path` (string, required): Absolute path to the project directory.
- `mode` (string, optional): Merge mode: `"add"` (only new) or `"update"` (overwrite existing). Default: `"update"`.

---

### `list_skills`
List all available skills, optionally filtered by project or type.

**Arguments:**
- `project` (string, optional): Project name to scope results.
- `type` (string, optional): Filter by type prefix (e.g., `enforce`, `project`, `lib`, `pattern`, `architect`, `anti-pattern`).

---

### `get_skill`
Get the full content (template and parameters) of a specific skill by its ID.

**Arguments:**
- `id` (string, required): Skill ID (e.g., `enforce-react-best-practices`).
- `project` (string, optional): Project scope where the skill resides.

---

### `list_projects`
List all projects that have been scanned and have saved skills.

**Arguments:** None.

---

## Example Workflows

### 1. Project Initialization
When starting work on a new project:
1. `list_projects` to check if it's already in the database.
2. If not, `scan_project(path: "/Users/me/dev/my-app")`.
3. `get_project_summary(project: "my-app")` to load the architecture into your current chat context.

### 2. Targeted Code Review
When working on a complex component:
1. `audit_code(code: "...", project: "my-app", filePath: "src/App.tsx")`.
2. The AI will receive the most relevant best practices and can point out specific improvements based on your project's history.

### 3. Enforcing Global Standards
To ensure you aren't introducing common anti-patterns:
1. `get_enforcement_rules()`
2. Tell the AI: "Review my current changes against these enforcement rules."

---

## Client Smoke Verification Matrix

Use this matrix for configuration and endpoint smoke checks.

| Client | MCP check |
|--------|-----------|
| VS Code Copilot | Optional via Continue MCP config |
| Claude Code | Validate `mcp-server.js` command in config |
| Cursor | Validate MCP command config |
| Windsurf | Validate MCP server registration |
| Zed | Validate `context_servers` entry |
| Cline / Roo Code | Validate MCP server entry |
| Aider | Not native MCP |
| JetBrains AI Assistant | Validate MCP plugin config (if used) |
| Continue extension | Validate `mcpServers` and tool listing |

Recommended smoke endpoints:

```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/skills/search?q=react&k=5"
```
