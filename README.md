# MDC — Markdown Checklists

**A checklist format that is always valid Markdown — and also a task graph your tools and AI agents can read and safely edit.**

`valid GitHub-Flavored Markdown` · `IANA-registered: text/markdown; variant=mdc` · `two conforming implementations` · code MIT / spec CC BY 4.0

## What it is

An MDC file is a normal GFM checklist — it renders as real checkboxes on GitHub, GitLab, VS Code, and Obsidian with **zero tooling**. The `mdc` CLI then treats the same file as structured data:

- **Renders anywhere, degrades gracefully.** Any Markdown viewer shows it correctly; MDC metadata is just trailing text to tools that don't understand it.
- **A queryable model.** `parse` emits a JSON item model with dependencies, states, and derived `blocked`/`actionable` status; `next` tells you what's ready to work.
- **Safe, concurrent edits.** Every mutation (`check`, `claim`, `add`, …) rewrites exactly one line, so humans and multiple agents edit the same file and merge cleanly under plain git. `claim` is atomic — two agents can't take the same item.

A file is MDC because its frontmatter says so (`mdc: "0.1"`), not because of its name. The conventional filename is `*.mdc.md`.

## What an MDC file looks like

Paste this into any GitHub gist and it renders as a clean checklist; feed it to `mdc` and it's a queryable, mutable task graph.

```markdown
---
mdc: "0.1"
kind: run
title: Release 2.4.0
started: 2026-07-24
---

# Release 2.4.0

- [x] Freeze `main`, cut `release/2.4` branch {#branch @tim done=2026-07-24}
- [ ] CI green on `release/2.4` {#ci needs=branch verify="npm test"}
- [ ] Smoke test on staging {#smoke .doing @maria needs=ci}
- [x] ~~Load-test legacy PDF endpoint~~ {#pdf reason="endpoint removed in 2.4"}
- [ ] Tag `v2.4.0` and push {#tag .gate @tim needs=smoke}
```

`- [ ] item` with no `{…}` block is already a complete MDC item — every attribute is opt-in. The trailing block holds an `{#id}`, `.classes`, an `@assignee`, and `key=value` metadata (`needs=`, `due=`, `done=`, `reason=`, …).

## Try it in 60 seconds

```bash
git clone https://github.com/mdcspec/mdc && cd mdc
npm install                      # fetches the parser deps (unified, remark, yaml)
alias mdc="node $PWD/packages/mdc/src/cli.js"   # optional: a short command

# inspect
mdc parse spec/corpus/canonical-run.mdc.md --json    # the L1 model
mdc next  spec/corpus/canonical-run.mdc.md           # what's actionable now

# drive it — each change is a one-line, committable diff
cp spec/corpus/canonical-run.mdc.md /tmp/release.mdc.md
mdc claim /tmp/release.mdc.md ci --as agent-a
mdc check /tmp/release.mdc.md ci
mdc report /tmp/release.mdc.md                       # a standup view
```

Node ≥ 20. Run the test suite with `npm test`. (No published npm package yet — invoke from the repo as above.)

## Use it in your own project

1. **Add a checklist.** Drop a file like `TODO.mdc.md` or `docs/release.mdc.md` in your repo with `mdc: "0.1"` frontmatter. It renders on GitHub immediately; nobody needs the CLI to read it.
2. **Drive it from the CLI** in scripts or CI — `mdc next --json` to pick work, `mdc check <id>` after, `mdc status` for progress. Exit codes are the API (below).
3. **Teach your coding agent** by pasting [`docs/adoption/agent-snippet.md`](docs/adoption/agent-snippet.md) into your repo's `AGENTS.md`. Agents then `claim` before working and `check` after, coordinating through the file with clean git history as the audit trail.

## The CLI

Exit codes are the contract: **`0` success · `1` usage/IO/parse/not-MDC · `2` domain refusal** (a lint error, `fmt --check` drift, or a mutation whose precondition failed — e.g. claiming an already-claimed item). Agents branch on `2`. Machine output goes to stdout; human text to stderr.

**Inspect** (read-only; `-` reads stdin)
| Verb | Behavior |
|---|---|
| `parse <file> --json` | the L1 document model |
| `lint <file> [--json] [--strict]` | structural findings; exit 2 on errors |
| `status <file> [--json]` | totals, progress, blocked/actionable/doing |
| `next <file> [--json] [--as <handle>]` | actionable items in order (`--as`: just one agent's) |
| `report <file> [--json]` | a standup view: done / in-progress / ready / blocked-with-cause |
| `fmt <file> [--check] [--assign-ids]` | canonical form in place; `--check` never writes |

**Change** (one-line-diff mutations; each echoes the resulting line)
| Verb | Behavior |
|---|---|
| `add <file> "<text>" [--id --needs --as --due --class] [--after \| --section]` | append/place a new open item |
| `check` / `uncheck <file> <id>` | open ↔ done (stamps/clears `done=`) |
| `cancel <file> <id> --reason "…"` | → cancelled, records the reason |
| `claim <file> <id> --as <handle>` | set assignee iff none set (atomic) |
| `unclaim <file> <id> [--from <handle>]` | release the assignee |
| `start` / `unstart <file> <id>` | mark / unmark in-progress (`.doing`) |
| `note <file> <id> "<text>" [--as]` | attach a dated note (nested prose) |
| `edit <file> <id> [--text --needs --add-needs --rm-needs --add-class --rm-class --due]` | amend an existing item |

**Instantiate**
| Verb | Behavior |
|---|---|
| `cut <template> [--out …] [--title …] [--as-version …]` | instantiate a run from a template |

## Templates and runs

A checklist can be a reusable **template** (`kind: template`) that you instantiate into a **run** (`kind: run`) each time you execute it — a release process, an incident runbook, an onboarding. `mdc cut` copies the procedure, pins `template: <path>@<version>`, records `started`, and resets every item to open:

```bash
mdc cut templates/release.mdc.md --out releases/2.4.0.mdc.md --title "Release 2.4.0" --as-version 5
```

One template, many runs; each run is an ordinary reviewable file, and its git history is the record of that execution.

## Conformance and implementations

The spec is executable: every normative rule cites a case in the [conformance corpus](spec/corpus/), and the corpus is runnable by **any** implementation in any language through a documented CLI contract ([`spec/conformance.md`](spec/conformance.md) + [`spec/corpus/manifest.json`](spec/corpus/manifest.json)).

MDC is implemented **three times** today, in three languages with three different parsing strategies, all passing the full conformance corpus:

- **`packages/mdc/`** — the JavaScript reference (remark/unified pipeline).
- **`impls/mdc-py/`** — an independent Python implementation (line-oriented, stdlib only).
- **`impls/mdc-cr/`** — a Crystal implementation compiled to a **native binary**: ~26× faster startup than the Node CLI (~2.6 ms vs ~69 ms per invocation), which matters when an agent or CI loop spawns the tool repeatedly.

A language-agnostic runner drives any binary against the corpus:

```bash
python3 spec/conformance/run.py --cli "<your mdc command>"   # every case must pass
```

Writing a third implementation? That's exactly the gate to a shared-governance future — see [GOVERNANCE.md](GOVERNANCE.md).

## Status

- ✅ **Spec v0.1, reference parser + `mdc` CLI, and the executable conformance corpus** — built, tested, dogfooded.
- ✅ **Identity secured:** registered with IANA as `text/markdown; variant=mdc` (Markdown Variants registry, 2026-09-24); `@mdcspec` npm scope and `mdcspec.dev` held; repo public under the neutral `mdcspec` org.
- ⬜ **Public launch** — the distribution push (an MCP server + the agent snippet) is the next milestone. Progress is tracked, dogfood-style, in [`checklists/mvp-build.mdc.md`](checklists/mvp-build.mdc.md) — an MDC file this repo's own CLI checks off.

## Documentation

- **[spec/mdc-spec-v0.1.md](spec/mdc-spec-v0.1.md)** — the normative, example-backed spec; every rule cites a corpus case.
- **[spec/conformance.md](spec/conformance.md)** — the language-neutral conformance contract (how any implementation earns a conformance class).
- **[docs/adoption/agent-snippet.md](docs/adoption/agent-snippet.md)** — drop-in instructions to teach a coding agent to drive MDC files.
- **[AGENTS.md](AGENTS.md)** — orientation for agents working in this repo.
- **[docs/spec/implementation-contract.md](docs/spec/implementation-contract.md)** — the mechanical contract the code implements.
- **[docs/](docs/README.md)** — research, vision, the risk register, and the [standardization roadmap](docs/planning/standardization-roadmap.md).

## License and governance

The license is split so independent implementations are unencumbered:

- **Code and the conformance corpus** (`spec/corpus/`) — [MIT](LICENSE), so the corpus can be vendored verbatim into any implementation's test suite.
- **Specification and documentation prose** — [CC BY 4.0](LICENSE-docs) (attribution-only, no ShareAlike).

Governance ([GOVERNANCE.md](GOVERNANCE.md)) is single-maintainer for now, bound to "the conformance corpus is the arbiter," with a written, evidence-gated path to an implementers' council. Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).
