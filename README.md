# MDC — Markdown Checklists

MDC is a checklist format that is **always valid GitHub-flavored markdown** — every MDC file renders as a normal checklist on GitHub, GitLab, VS Code, and Obsidian with zero tooling. On top of that, a reference parser exposes an **L1 JSON model** of the items, and a CLI applies **L2 mutations** — `check`, `claim`, `cancel` — as deterministic, one-line-diff edits that both humans and AI agents can make safely and concurrently. A file is MDC because its frontmatter says so (`mdc: "0.1"`), not because of its name; the canonical filename is `*.mdc.md`.

This repository is the MVP: an executable spec with a conformance corpus, the reference parser, and the `mdc` CLI. It targets the gap our [research](docs/README.md) surfaced — no existing format gives repos a durable, diffable, human-and-agent-shared task state — while never breaking the "renders anywhere" guarantee.

> **Status:** MVP built and tested; pre-launch. The namespace actions (IANA `text/markdown; variant=mdc` registration, npm scope, domain) and the public launch are the remaining milestones — tracked, dogfood-style, in [`checklists/mvp-build.mdc.md`](checklists/mvp-build.mdc.md), an MDC file this repo's own CLI checks off.

## Quickstart

No published binary yet — invoke the CLI through Node from the repo root (dependencies are already vendored in `node_modules`; do not run `npm install`).

```
# see the machine model of the flagship example
node packages/mdc/src/cli.js parse spec/corpus/canonical-run.mdc.md --json

# what is actionable right now, respecting needs= and .gate edges?
node packages/mdc/src/cli.js next spec/corpus/canonical-run.mdc.md

# take an item, then complete it — each is a one-line diff you can commit
cp spec/corpus/canonical-run.mdc.md /tmp/release.mdc.md
node packages/mdc/src/cli.js claim /tmp/release.mdc.md ci --as agent-a
node packages/mdc/src/cli.js check /tmp/release.mdc.md ci --date 2026-07-27

# progress, and a canonical-form check
node packages/mdc/src/cli.js status /tmp/release.mdc.md
node packages/mdc/src/cli.js fmt   /tmp/release.mdc.md --check   # exit 0 = already canonical
```

Run the test suite with `node --test "packages/mdc/test/*.test.js"`.

## What an MDC document looks like

Paste this into any GitHub gist and it renders as a clean checklist; feed it to `mdc` and it is a queryable, mutable task graph.

```markdown
---
mdc: "0.1"
kind: run
template: templates/release.mdc.md@5
title: Release 2.4.0
mode: do-confirm
started: 2026-07-24
---

# Release 2.4.0

## Prepare

- [x] Freeze `main`, cut `release/2.4` branch {#branch @tim done=2026-07-24}
- [ ] All open P1 issues fixed or explicitly deferred {#triage .gate @maria due=2026-07-28}

## Verify

- [ ] CI green on `release/2.4` {#ci needs=branch verify="npm test"}
- [ ] Smoke test on staging {#smoke .doing @maria needs=ci}
- [x] ~~Load-test legacy PDF endpoint~~ {#pdf reason="endpoint removed in 2.4"}

## Ship

- [ ] Tag `v2.4.0` and push {#tag .gate @tim needs=smoke}
```

`- [ ] item` with no brace block is already a complete MDC item — every attribute is opt-in.

## The CLI

Exit codes are the contract: **`0` success · `1` usage/IO/parse/not-MDC · `2` domain refusal** (lint error, `fmt --check` drift, or a mutation whose precondition failed — e.g. claiming an already-claimed item). Agents branch on `2`.

| Verb | Behavior |
|---|---|
| `parse <file> --json` | L1 document model to stdout (`-` = stdin) |
| `lint <file> [--json] [--strict]` | structural findings; exit 2 on errors |
| `status <file> [--json]` | totals, progress, blocked/actionable/doing |
| `next <file> [--json]` | actionable items in document order |
| `fmt <file> [--check] [--assign-ids]` | canonical form in place; `--check` never writes |
| `check <file> <id> [--date …]` | open → done, stamps `done=` |
| `uncheck <file> <id>` | done → open |
| `cancel <file> <id> --reason "…"` | → cancelled, records the reason |
| `claim <file> <id> --as <handle>` | set assignee iff none set (atomic) |
| `cut <template> [--out …] [--title …] [--as-version …]` | instantiate a run from a template |

## Templates and runs

MDC's headline difference from a plain task list is that a checklist can be a reusable **template** (`kind: template`) that you instantiate into a **run** (`kind: run`) each time you execute it. `mdc cut` does the instantiation — copy the procedure, stamp a fresh run, start clean:

```
node packages/mdc/src/cli.js cut templates/release.mdc.md \
  --out releases/2.4.0.mdc.md --title "Release 2.4.0" --as-version 5
```

The new run pins `template: templates/release.mdc.md@5`, records `started`, and resets every item to open — no assignees, no `done=` stamps carried over. One template, many runs; each run is an ordinary reviewable file in the repo, and its git history is the record of that execution.

## Documentation

- **[docs/README.md](docs/README.md)** — the research and design set: prior art, naming, adoption strategy, vision, and the risk register.
- **[spec/mdc-spec-v0.1.md](spec/mdc-spec-v0.1.md)** — the normative, example-backed spec; every rule cites a corpus case.
- **[docs/spec/mdc-format-sketch.md](docs/spec/mdc-format-sketch.md)** · **[docs/spec/implementation-contract.md](docs/spec/implementation-contract.md)** — design intent and the mechanical contract the code implements.
- **[docs/adoption/agent-snippet.md](docs/adoption/agent-snippet.md)** — drop-in instructions to teach a coding agent to drive MDC files in any repo.
- **[AGENTS.md](AGENTS.md)** — orientation for agents working in this repo.
- **[docs/planning/mvp-definition.md](docs/planning/mvp-definition.md)** · **[docs/planning/iana-registration-draft.md](docs/planning/iana-registration-draft.md)** — the MVP scope and the namespace launch actions.
- **[docs/planning/standardization-roadmap.md](docs/planning/standardization-roadmap.md)** — the path from "a tool with a spec" to a de-facto standard.

## License and governance

The license is split so independent implementations are unencumbered:

- **Code and the conformance corpus** (`spec/corpus/`) — [MIT](LICENSE), so the corpus can be vendored verbatim into any implementation's test suite.
- **Specification and documentation prose** — [CC BY 4.0](LICENSE-docs) (attribution-only, no ShareAlike).

Governance ([GOVERNANCE.md](GOVERNANCE.md)) is single-maintainer for now, bound to "the conformance corpus is the arbiter," with a written, evidence-gated path to an implementers' council. Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).
