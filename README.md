# Beamtrace MCP clients

Distribution packages for Beamtrace's remote MCP across agent platforms. Based on [cursor/plugin-template](https://github.com/cursor/plugin-template).

## Packages

| Package | Path | Contents |
| --- | --- | --- |
| `beamtrace` | `plugins/cursor` | Cursor Marketplace plugin: remote MCP + rules |
| MCP Registry | `server.json` | Official registry metadata (remote only — no npm stub) |

More platform stubs (Claude, VS Code, …) can land under `plugins/` later.

## Validate (Cursor marketplace layout)

```bash
pnpm validate
```

Pre-commit runs the same check via Lefthook when hooks are installed (`npx lefthook install` after `git init`).

## MCP Registry (remote server)

Beamtrace MCP is already hosted at `https://beamtrace.com/api/mcp`. The [MCP Registry](https://modelcontextprotocol.io/registry/about) supports **remote-only** entries via `remotes` — you do **not** need an npm/PyPI stub. See [Publishing Remote Servers](https://modelcontextprotocol.io/registry/remote-servers) and the npm-oriented [quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx) (skip package publish; use `server.json` + `mcp-publisher`).

Install the publisher CLI ([releases](https://github.com/modelcontextprotocol/registry/releases) or `brew install mcp-publisher`).

Namespace `com.beamtrace/mcp` requires **domain auth** (DNS TXT on `beamtrace.com` apex, or HTTP `/.well-known/mcp-registry-auth`). See [Authentication](https://modelcontextprotocol.io/registry/authentication).

```bash
# once: prove domain ownership (DNS or HTTP), then:
pnpm registry:login:dns   # or registry:login:http
pnpm registry:validate
pnpm registry:publish
```

If you prefer GitHub auth instead, change `name` in `server.json` to `io.github.<org>/mcp` and use `pnpm registry:login:github`.

Align `server.json` `version` with product MCP `serverInfo.version` when you ship a public protocol change.

## Local install (Cursor, dev)

```bash
ln -sf "$(pwd)/plugins/cursor" ~/.cursor/plugins/local/beamtrace
```

Reload Cursor → Customize → confirm Beamtrace loads → authenticate MCP.
