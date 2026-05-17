# Quickstart — Zero to Searching in 5 Minutes

## Option A: npx (no install)

```bash
# Start the server
npx skill-brain start

# Scan your project
npx skill-brain scan ./my-app

# Search indexed skills
npx skill-brain search "CSS specificity BEM"
```

Open the dashboard: http://localhost:3000/dashboard

## Option B: Global install

```bash
npm install -g skill-brain
skill-brain start
```

## Option C: Local project install

```bash
npm install skill-brain
# or
pnpm add skill-brain

# Add to package.json scripts:
# "skill-brain": "skill-brain start"
```

## Option D: Clone and run

```bash
git clone https://github.com/sachidananda-panigrahi/skill-brain.git
cd skill-brain
pnpm install
cp .env.example .env
node index.js
```

## Environment Variables

Copy `.env.example` to `.env` and set:

```bash
PORT=3000                    # HTTP server port (default: 3000)
MCP_HTTP_PORT=3001           # MCP HTTP transport port (default: 3001)
OPENAI_API_KEY=sk-...        # Optional: enables dense embedding search
SKILL_BRAIN_DATA=/path/to    # Optional: writable data dir (for global npm install)
```

## CLI Commands

```bash
skill-brain start              # Start HTTP server + dashboard
skill-brain mcp                # Start MCP stdio server
skill-brain scan <path>        # Scan and index a project
skill-brain review             # Run diff review on current git branch
skill-brain search <query>     # Search and print top 5 results
skill-brain --version          # Print version
```

## Connect to Claude

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop. skill-brain tools appear in Claude's tool list.

## Verify it works

```bash
# Check health
curl http://localhost:3000/api/health

# Search
curl "http://localhost:3000/api/skills/search?q=react+performance&k=3" | jq '.results[].skill.name'
```
