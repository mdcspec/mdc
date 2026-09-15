# @mdcspec/mdc-mcp — MDC over the Model Context Protocol

An [MCP](https://modelcontextprotocol.io) server that exposes [MDC (Markdown Checklists)](../../README.md) as tools, so any MCP host — Claude Desktop, Claude Code, Cursor, Windsurf, Zed, … — can drive shared checklist state **natively**, without shelling out: query the dependency graph, atomically claim work, check it off, add/edit discovered tasks, and leave notes for other agents.

It is a dependency-free stdio JSON-RPC server that imports the reference implementation directly, so it shares one parser, one canonical serializer, and MDC's exit-code-as-API semantics: a **domain refusal** (unknown id, an item already claimed, a failed precondition) comes back as a tool result with `isError: true` and the reason — an agent branches on it exactly as it would on the CLI's exit code `2`.

## Tools

**Read the graph** — `mdc_parse` (L1 model), `mdc_status`, `mdc_next` (`file`, optional `as` to filter to your own + unclaimed), `mdc_report` (standup view), `mdc_lint`.

**Mutate** (each rewrites one canonical line / inserts one, returned as text) — `mdc_check`, `mdc_uncheck`, `mdc_cancel`, `mdc_claim`, `mdc_unclaim`, `mdc_start`, `mdc_unstart`, `mdc_note`, `mdc_edit`, `mdc_add`, `mdc_cut`.

Every tool takes a `file` path (resolved from the host's working directory), mirroring the [CLI verbs](../../AGENTS.md).

## Configure it in an MCP host

The server command is `node <repo>/packages/mdc-mcp/src/server.js` (or the `mdc-mcp` bin once the package is installed). Add an entry to your host's MCP config, e.g.:

```json
{
  "mcpServers": {
    "mdc": {
      "command": "node",
      "args": ["/absolute/path/to/mdc/packages/mdc-mcp/src/server.js"]
    }
  }
}
```

- **Claude Code:** put this in `.mcp.json` at your project root (or `claude mcp add mdc -- node /abs/path/.../server.js`).
- **Claude Desktop:** add it under `mcpServers` in `claude_desktop_config.json`.
- **Cursor / Windsurf / Zed:** the same `mcpServers` shape in their respective MCP settings.

No install step is required — the server has no dependencies beyond the MDC reference package in this repo.

## The coordination loop, as tools

```
mdc_next(file, as="agent-a")     → the items agent-a can pick up now
mdc_claim(file, id, as="agent-a")→ atomic; isError if someone else has it
mdc_start(file, id)              → signal you're working it
mdc_note(file, id, "…", as="…")  → leave context for the other agent
mdc_check(file, id)              → done; clears .doing; one-line diff
```

Because each mutation is a one-line diff and `claim` is atomic, two agents (or an agent and a human) editing the same board merge cleanly under plain git — the same guarantee the CLI provides, now available to any MCP client.
