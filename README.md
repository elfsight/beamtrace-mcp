# Beamtrace for Cursor

Cursor plugin that connects to Beamtrace's remote MCP for read-only AI visibility insights.

Also includes [`server.json`](./server.json) for the [MCP Registry](https://modelcontextprotocol.io/registry/about) (remote-only — no npm stub).

## What's included

- **MCP**: `https://beamtrace.com/api/mcp` (OAuth; organization's website is resolved automatically)
- **Rule**: how to interpret metrics and phrase human reports

## Tools

| Tool | Purpose |
| --- | --- |
| `get_visibility` | Overall visibility score and insight |
| `list_topics` | Topic rollups |
| `list_prompts` | Prompt-level metrics and coverage gaps |
| `list_competitors` | Visibility leaderboard |
| `list_improvements` | Prioritized content improvements |

## Validate

```bash
pnpm validate
```

Pre-commit runs the same check via Lefthook (`pnpm exec lefthook install` after clone).

## Local install (dev)

```bash
ln -sf "$(pwd)" ~/.cursor/plugins/local/beamtrace
```

Reload Cursor → Customize → confirm Beamtrace loads → authenticate MCP.

## Release

Interactive bump (+ MCP publish when selected):

```bash
pnpm release
```

Pick **cursor** / **mcp registry** / **all**, then **patch** / **minor** / **major**. Cursor only bumps `.cursor-plugin/plugin.json`. MCP also runs `mcp-publisher publish`.

Non-interactive:

```bash
pnpm release -- --target cursor --bump patch --yes
pnpm release -- --target mcp --bump minor --yes
pnpm release -- --target all --bump patch --yes
```

## MCP Registry

Install [`mcp-publisher`](https://github.com/modelcontextprotocol/registry/releases) (`brew install mcp-publisher`).

Namespace `com.beamtrace/mcp` needs **domain auth** for `beamtrace.com` ([docs](https://modelcontextprotocol.io/registry/authentication)). Use `pnpm registry:login:github` only for GitHub-owned namespaces.

Keep `server.json` `version` aligned with the live MCP `serverInfo.version` when you publish (or use `pnpm release` and choose mcp/all).

```bash
pnpm registry:login:dns   # or registry:login:http
pnpm validate             # also checks server.json description ≤100 chars
pnpm release              # or: pnpm registry:validate && pnpm registry:publish
```

## Auth

After install, complete Beamtrace sign-in when Cursor prompts. You need a Beamtrace account with a website at [beamtrace.com/setup](https://beamtrace.com/setup).

Publisher: [Elfsight](https://elfsight.com).
