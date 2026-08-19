# Beamtrace for Cursor

Cursor plugin that connects to the Beamtrace remote MCP server for read-only AI visibility insights.

## What you get

- **MCP**: `https://beamtrace.com/api/mcp` (OAuth)
- **Rule**: how to interpret metrics and phrase human reports

## Tools

| Tool | Purpose |
| --- | --- |
| `get_visibility` | Overall visibility score and insight |
| `list_topics` | Topic rollups |
| `list_prompts` | Prompt-level metrics and coverage gaps |
| `list_competitors` | Visibility leaderboard |
| `list_improvements` | Prioritized content improvements |

## Auth

After install, complete Beamtrace sign-in when Cursor prompts. You need a Beamtrace account with a website at [beamtrace.com/setup](https://beamtrace.com/setup).

## Local test

From this marketplace repo:

```bash
ln -sf "$(pwd)/plugins/cursor" ~/.cursor/plugins/local/beamtrace
```

Then reload Cursor and authenticate the Beamtrace MCP server.
