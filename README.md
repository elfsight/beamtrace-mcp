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

Pushing a `v*` tag (for example `v1.0.1`) runs [.github/workflows/publish-mcp.yml](.github/workflows/publish-mcp.yml). It logs in with HTTP domain auth, then:

```bash
node scripts/publish.mjs --target all --version "$GITHUB_REF_NAME" --yes
```

That sets `.cursor-plugin/plugin.json` and `server.json` to the tag version (`v` prefix is stripped), publishes to the MCP Registry, then commits those files to the default branch if they changed. The tag itself stays on the original commit.

Add repository secret `MCP_PRIVATE_KEY`: the 64-character hex private key used with `mcp-publisher login http` (not the PEM file).

```bash
git tag v1.0.1
git push origin v1.0.1
```

Local / interactive (install [`mcp-publisher`](https://github.com/modelcontextprotocol/registry/releases) first):

```bash
pnpm release
```

Pick **cursor** / **mcp registry** / **all**, then **patch** / **minor** / **major**, or pass `--version`. Cursor only bumps `.cursor-plugin/plugin.json`. MCP also runs `mcp-publisher publish`.

```bash
pnpm release -- --target cursor --bump patch --yes
pnpm release -- --target mcp --bump minor --yes
pnpm release -- --target all --bump patch --yes
pnpm release -- --target all --version 1.0.1 --yes
```

Namespace `com.beamtrace/mcp` needs domain auth for `beamtrace.com` ([docs](https://modelcontextprotocol.io/registry/authentication)). Local login: `pnpm registry:login:http`. Use `pnpm registry:login:github` only for GitHub-owned namespaces.

Keep `server.json` version aligned with the live MCP `serverInfo.version` when you publish.

## Auth

After install, complete Beamtrace sign-in when Cursor prompts. You need a Beamtrace account with a website at [beamtrace.com/setup](https://beamtrace.com/setup).

Publisher: [Elfsight](https://elfsight.com).
