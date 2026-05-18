# Quickstart — Zero to Searching in 5 Minutes

## The Non-MCP Path (Recommended for Most Users)

Generate a `SKILLS.md` file in your project that works with Claude Code, Cursor, Copilot Chat, and Repomix:

```bash
# Auto-detects your tech stack and generates SKILLS.md
npx skill-brain init

# SKILLS.md now appears in your project root
cat SKILLS.md
```

That's it. Your AI assistants now have access to your skill library. The file updates automatically when you run CRUD operations on skills.

### Fetch Additional Skills (Optional)

```bash
# Fetch skills from vercel-labs/agent-skills for your stack
npx skill-brain fetch --stack=nextjs,react

# Or auto-detect and fetch
npx skill-brain fetch --path=./my-app
```

Fetched skills are cached locally in `skills/prebuilt/fetched/` — no network calls during normal operation.

---

## The MCP Path (For IDE Integration)

If you want the full server + MCP integration:

### Option A: npx (no install)

```bash
# Start the server
npx skill-brain start

# Scan your project (optional, for local indexing)
npx skill-brain scan ./my-app

# Search indexed skills
npx skill-brain search "CSS specificity BEM"
```

Open the dashboard: http://localhost:3000/dashboard

### Option B: Global install

```bash
npm install -g @snpanigrahi88/skill-brain
skill-brain start
```

### Option C: Local project install

```bash
npm install @snpanigrahi88/skill-brain
# or
pnpm add @snpanigrahi88/skill-brain

# Add to package.json scripts:
# "skill-brain": "skill-brain start"
```

### Option D: Clone and run

```bash
git clone https://github.com/sachidananda-panigrahi/skill-brain.git
cd skill-brain
pnpm install
cp .env.example .env
node src/entry-points/index.js
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
# Skills generation (no-config)
skill-brain init [path]        # Generate SKILLS.md for a project (auto-detects stack)
skill-brain fetch [stack]      # Fetch additional skills from vercel-labs/agent-skills
skill-brain generate [path]    # Alias for init

# Server & MCP
skill-brain start              # Start HTTP server + dashboard
skill-brain mcp                # Start MCP stdio server

# Scanning & search
skill-brain scan <path>        # Scan and index a project
skill-brain review             # Run diff review on current git branch
skill-brain search <query>     # Search and print top 5 results

# Utility
skill-brain --version          # Print version
```

## Connect to Claude

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop. skill-brain tools appear in Claude's tool list.

## Verify it works

```bash
# Check health
curl http://localhost:3000/api/health

# Search
curl "http://localhost:3000/api/skills/search?q=react+performance&k=3" | jq '.results[].skill.name'
```
