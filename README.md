# MDC: Markdown Checklists

**A checklist format that's always valid Markdown, and also a task graph your tools and AI agents can read and safely edit.**

`valid GitHub-Flavored Markdown` · `IANA-registered: text/markdown; variant=mdc` · `three conforming implementations` · code MIT / spec CC BY 4.0

Spec: **[mdcspec.dev/spec/v0.1](https://mdcspec.dev/spec/v0.1)** · Try it: **[mdcspec/getting-started](https://github.com/mdcspec/getting-started)**

## Example

```markdown
---
mdc: "0.1"
title: Release 2.4.0
---

- [x] Cut the release branch {#branch @tim done=2026-07-24}
- [ ] CI green on the branch {#ci needs=branch verify="npm test"}
- [ ] Smoke test on staging {#smoke .doing @maria needs=ci}
- [x] ~~Load-test legacy PDF endpoint~~ {#pdf reason="endpoint removed in 2.4"}
- [ ] Tag and publish {#tag .gate @tim needs=smoke}
```

Open that on GitHub and it renders as a normal checklist. Feed it to `mdc` and it's a queryable, mutable task graph.

## Why

- **Renders anywhere, zero tooling.** It's just GFM: real checkboxes on GitHub, GitLab, VS Code, and Obsidian. The `{…}` metadata is plain text to anything that doesn't understand it.
- **A model your tools can query.** Ids, `@assignees`, typed `needs=` dependencies, and `.gate`s, so `mdc next` answers "what's actionable right now," honoring the whole graph.
- **Edits that are safe to share.** Every change rewrites exactly one line, so humans and multiple AI agents edit the same file and merge cleanly under plain git. `claim` is atomic, so two agents can't take the same item.

A file is MDC because its frontmatter says `mdc: "0.1"`, not because of its name (conventionally `*.mdc.md`).

## Use it

The fastest start is the **[getting-started tour](https://github.com/mdcspec/getting-started)**: an example board, a drop-in `AGENTS.md`, and the core loop in 60 seconds.

The `mdc` CLI turns a file into a task graph. **Inspect** it (`parse`, `status`, `next`, `report`, `lint`), **change** it with one-line-diff mutations (`check`, `claim`, `add`, `edit`, `note`, and more), and instantiate reusable **templates** (`cut`). Exit codes are the API: `0` ok, `1` error, `2` refused. A native **[MCP server](packages/mdc-mcp/)** (`@mdcspec/mdc-mcp`) exposes every verb as a tool, so an agent host drives MDC with no shell.

```bash
git clone https://github.com/mdcspec/mdc && (cd mdc && npm install)
node packages/mdc/src/cli.js next spec/corpus/canonical-run.mdc.md
```

The full verb reference lives in the [spec](spec/mdc-spec-v0.1.md) and the [implementation contract](docs/spec/implementation-contract.md). (Node ≥ 20; `npm test` to run the suite. Not on npm yet.)

## Built to be a real standard

The spec is executable: every normative rule cites a case in the [conformance corpus](spec/corpus/), which any implementation in any language can run through a documented [CLI contract](spec/conformance.md). MDC is implemented **three times** today: the JavaScript reference, an independent Python implementation, and a Crystal one compiled to a fast native binary, all passing the full corpus ([implementations](docs/spec/implementations.md)). A third-party implementation is the open invitation, and the path to shared governance (see [GOVERNANCE.md](GOVERNANCE.md)).

## Learn more

- **[getting-started](https://github.com/mdcspec/getting-started)**: a hands-on tour.
- **[spec/mdc-spec-v0.1.md](spec/mdc-spec-v0.1.md)**: the normative, example-backed spec.
- **[spec/conformance.md](spec/conformance.md)** and **[docs/spec/implementations.md](docs/spec/implementations.md)**: how any implementation earns a conformance class, and who's done it.
- **[docs/adoption/agent-snippet.md](docs/adoption/agent-snippet.md)**: drop-in instructions to teach a coding agent to drive MDC files.
- **[docs/](docs/README.md)**: research, vision, the risk register, and the [standardization roadmap](docs/planning/standardization-roadmap.md).

## Status

Spec, reference parser and CLI, and the executable corpus are built and tested. The name is secured: registered with IANA as `text/markdown; variant=mdc`, with the `@mdcspec` namespace and `mdcspec.dev`, and the repo public under the neutral `mdcspec` org. Next milestone: the public launch (an MCP server plus agent snippet into the agent-tooling ecosystem).

## License and governance

Split so independent implementations are unencumbered: code and the conformance corpus are [MIT](LICENSE) (the corpus vendors verbatim into any test suite); the spec and docs are [CC BY 4.0](LICENSE-docs). Governance ([GOVERNANCE.md](GOVERNANCE.md)) is single-maintainer for now, bound to "the conformance corpus is the arbiter," with a written, evidence-gated path to an implementers' council. Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
