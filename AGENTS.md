# AGENTS.md — working in the MDC repo

MDC (Markdown Checklists) is a checklist format that is always valid GitHub-flavored markdown, plus a reference parser and a CLI that give tools an L1 JSON model and deterministic, one-line-diff L2 mutations. This file orients an agent working in *this* repo. To teach an agent in *another* repo to consume MDC files, use [`docs/adoption/agent-snippet.md`](docs/adoption/agent-snippet.md).

## The format in ten lines

- A file is an MDC document **iff** its YAML frontmatter has an `mdc:` key (`mdc: "0.1"`). The filename (`*.mdc.md`, `TODO.md`, anything) is irrelevant — detection is in-band.
- Items are GFM task lines: `- [ ] text`, `- [x] text` (done), `- [x] ~~text~~` (cancelled). Those are the only three states.
- Optional metadata is one trailing brace block: `{#id .class @assignee key=value}`. Reserved keys: `due done repeat needs verify reason`; extension keys use an `x-` prefix.
- `needs=a,b` are typed dependencies; `blocked` is derived, never stored. `.gate` blocks everything after it until terminal; `.optional` is exempt from gating.
- `- [ ] item` with no brace block is already a complete, valid item. Everything else is opt-in.

Full detail: [`spec/mdc-spec-v0.1.md`](spec/mdc-spec-v0.1.md) (normative, example-backed) and [`docs/spec/mdc-format-sketch.md`](docs/spec/mdc-format-sketch.md) (design intent).

## The CLI

No bin is linked (the package is unpublished). Invoke it directly:

```
node packages/mdc/src/cli.js <verb> <file> [flags]
```

| Verb | Use |
|---|---|
| `parse <file> --json` | L1 model to stdout (`-` reads stdin) |
| `lint <file> [--json] [--strict]` | structural findings |
| `status <file> [--json]` | totals, progress, blocked/actionable/doing |
| `next <file> [--json]` | actionable items in document order |
| `fmt <file> [--check] [--assign-ids]` | canonical form in place; `--check` never writes |
| `add <file> "<text>" [--id <slug>] [--needs <a,b>] [--as <handle>] [--due <date>] [--class <c,d>]` | append a new open item; prints its id |
| `check <file> <id> [--date YYYY-MM-DD]` | open → done |
| `uncheck <file> <id>` | done → open |
| `cancel <file> <id> --reason "…"` | → cancelled |
| `claim <file> <id> --as <handle>` | set assignee iff none set (atomic) |
| `unclaim <file> <id> [--from <handle>]` | release the assignee (`--from` guards the owner) |
| `start <file> <id>` / `unstart <file> <id>` | mark / unmark in-progress (`.doing`) |
| `cut <template> [--out …] [--title …] [--as-version …]` | instantiate a `kind: run` from a `kind: template` |

**Exit codes are the API: `0` success · `1` usage/IO/parse/not-MDC · `2` domain refusal** (lint error, `fmt --check` drift, mutation precondition failed — e.g. claiming an already-claimed item). Branch on `2`. Machine output goes to stdout; errors and human text go to stderr.

## Conventions when an MDC file is shared work

- Before doing an item's work, `claim <id> --as <your-handle>`. If it exits `2`, someone else owns it — pick another via `next --json`.
- After the work, `check <id>`. Each mutation rewrites exactly one line, so concurrent edits to different items merge cleanly under plain git.
- Skip a step with `cancel <id> --reason "…"`, never by deleting it — the reason is the audit record.
- Never hand-edit an item's state where the CLI has a verb for it; the verbs keep the file canonical and the diff minimal.

## Repo layout

- `spec/` — the executable spec (`mdc-spec-v0.1.md`) and its conformance `corpus/` (parse, lint, fmt, mutate cases). The corpus *is* the spec; a behavior change needs a corpus case.
- `packages/mdc/` — the reference parser and CLI (`src/`) and tests (`test/`).
- `docs/` — research, vision, format sketch, the [implementation contract](docs/spec/implementation-contract.md) (mechanical source of truth), and planning.
- `checklists/mvp-build.mdc.md` — this project's own build checklist, an MDC document mutated by the real CLI.

## Building and testing

- **Do not run `npm install`.** Dependencies are already present in `node_modules`, the set is closed by contract (`unified`, `remark-*`, `yaml`), and this machine's npm cache is on an unmounted volume, so installs fail.
- Run the suite from the repo root: `node --test "packages/mdc/test/*.test.js"`.
- Code is ESM JavaScript with JSDoc types — no TypeScript, no build step. Comments only for constraints the code cannot express.
