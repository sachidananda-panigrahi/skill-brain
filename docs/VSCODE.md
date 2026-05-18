# VSCode Integration

skill-brain integrates with VSCode so the MCP server starts automatically and AI tools (Cursor, Continue, Cline, Copilot) connect without any manual steps.

## Auto-Start Setup

The workspace includes a task configured with `runOn: folderOpen`. When you open the workspace:

1. VSCode prompts: **"Allow automatic tasks in this folder?"**
2. Click **Allow**
3. The MCP server starts silently in a dedicated terminal panel named **"SkillBrain: Auto-Start MCP Server"**
4. All subsequent workspace opens start the server automatically — no prompts

### Verify it's running

Open the Terminal panel → find the tab named **SkillBrain: Auto-Start MCP Server**.
You should see:
```
SkillBrain MCP starting
SkillBrain MCP ready on :3001
```

If the server is already running (e.g., you open the folder twice), you'll see:
```
SkillBrain MCP ready (reused existing on :3001)
```

### Re-allow auto tasks

If you accidentally denied the prompt: `Ctrl+Shift+P` → **"Tasks: Manage Automatic Tasks in Folder"** → Allow.

## Start the HTTP Dashboard

`Ctrl+Shift+P` → **"Tasks: Run Task"** → **"SkillBrain: Start HTTP Dashboard"**

Then open: http://localhost:3000/dashboard

## Cursor MCP Integration

`.cursor/mcp.json` is auto-detected by Cursor. Verify:

1. Open Cursor Settings → **MCP**
2. You should see **skill-brain** listed as a connected server
3. In any chat, type `@skill-brain` to query skills

## Continue / Cline

The `.continue/config.json` configures HTTP transport:

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

Make sure the HTTP server is running (`skill-brain start`) before using Continue.

## GitHub Copilot Chat

Copilot can use skill-brain via the HTTP MCP endpoint. Add to VS Code settings:

```json
{
  "github.copilot.chat.mcpServers": {
    "skill-brain": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Debugging

Use the launch configurations in `.vscode/launch.json`:

- **Debug: HTTP Server** — Debug the dashboard server with breakpoints
- **Debug: MCP Server (stdio)** — Debug MCP tool handlers
- **Debug: Scan Project** — Step through the project scanner
- **Debug: CLI** — Debug a CLI command

Set breakpoints in `src/entry-points/mcp-server.js` or `src/engines/ragIndex.js`, then press **F5**.

## REST Client Testing

Install the **REST Client** extension (recommended in `.vscode/extensions.json`), then open `.vscode/skill-brain.http` and click **Send Request** on any endpoint.

## Available Tasks

| Task | Description |
|------|-------------|
| SkillBrain: Auto-Start MCP Server | Auto-starts on folder open |
| SkillBrain: Start HTTP Dashboard | Start the web UI |
| SkillBrain: Run E2E Tests | Run all integration tests |
| SkillBrain: Scan Current Project | Index the current workspace |

Run any task via `Ctrl+Shift+P` → **"Tasks: Run Task"**.
