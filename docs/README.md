# MDC — Markdown Checklists

*Index and front door for the MDC documentation set: research, vision, format sketch, and build plan for a checklist format that is always valid markdown.*

**MDC (Markdown Checklists)** is a proposed open format for checklists that live in ordinary markdown files. Every MDC document is a byte-for-byte valid [GitHub-flavored markdown](https://github.github.com/gfm/) file that renders correctly on GitHub, GitLab, VS Code, and Obsidian with zero tooling — and, for tools that opt in, it is also a parseable, mutable data structure: items carry stable IDs, assignees, due dates, typed dependencies, and verification hooks in a single trailing [Pandoc-style attribute block](https://pandoc.org/MANUAL.html#extension-attributes), and a small CLI can check, claim, and edit items with deterministic one-line diffs. `- [ ] item` with no attributes is already a complete MDC item; every feature beyond that is opt-in metadata.

Why now: two converging pressures. First, AI coding agents have made plain-text task files load-bearing infrastructure — spec-kit, Kiro, AGENTS.md, and every agent harness ad-hoc a `tasks.md`, yet no format defines what happens when an agent and a human edit the same checklist concurrently. Second, our [prior-art survey](research/prior-art-checklist-formats.md) shows a real gap: no existing format — not [GFM task lists](https://github.github.com/gfm/#task-list-items-extension-), not [todo.txt](http://todotxt.org/), not [org-mode](https://orgmode.org/), not [Obsidian Tasks](https://publish.obsidian.md/tasks/) — expresses template-vs-run, deterministic mutation, stable item IDs, or anchored recurrence while remaining renderable everywhere. MDC targets exactly that gap, with the item line as the merge unit so plain git merges and multi-agent concurrent writes stay tractable.

On the name: the format is MDC, but the canonical filename is the double extension `*.mdc.md` (the [RFC 7764](https://www.rfc-editor.org/rfc/rfc7764) variant-prefix pattern), and the authoritative signal is in-band — a file is an MDC document if and only if its YAML frontmatter contains the `mdc:` version key. We cede bare `.mdc` permanently: [Cursor mandates it](https://docs.cursor.com/context/rules) for rules files, [Nuxt's VS Code extension](https://marketplace.visualstudio.com/items?itemName=Nuxt.mdc) registers it, and GitHub Linguist assigns it no language, so bare-`.mdc` files don't even render as markdown on GitHub — fatal for a format whose pitch is "renders beautifully with zero tooling." The full dossier and the [IANA markdown-variants](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) registration path are in [the naming research](research/extension-naming-conflicts.md). A companion derived layer, [`.mddb`](spec/mddb-concept-sketch.md), is named and bounded but deliberately unspecified: a relational projection built *from* `.mdc` sources, never a second source of truth.

## The format in one file

The canonical example — a release run instantiated from a template. This exact document is the MVP's living test fixture.

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

Cut from `main` at `9f31c2a`. Everything outside frontmatter and task lines —
this paragraph, headings, notes under items — is plain markdown and round-trips
byte-for-byte through any conforming tool.

## Prepare

- [x] Freeze `main`, cut `release/2.4` branch {#branch @tim done=2026-07-24}
- [x] Bump version and add changelog entry {#bump @tim done=2026-07-24}
- [ ] All open P1 issues fixed or explicitly deferred {#triage .gate @maria due=2026-07-28}

> **Pause point** — do-confirm: the team verifies the section above aloud,
> in order, before anyone proceeds.

## Verify

- [ ] CI green on `release/2.4` {#ci needs=branch verify="npm test"}
- [ ] Smoke test on staging {#smoke .doing @maria needs=ci}
  - [ ] Login and logout
  - [ ] Checkout with a saved card
  - [ ] CSV export over 10k rows
- [x] ~~Load-test legacy PDF endpoint~~ {#pdf reason="endpoint removed in 2.4"}

## Ship

- [ ] Tag `v2.4.0` and push {#tag .gate @tim needs=smoke}
- [ ] Publish package to npm {#publish needs=tag verify="npm publish --dry-run"}
- [ ] Publish GitHub release notes {#notes .optional @sam due=2026-07-31 needs=tag}

## Follow-up

- [ ] Watch error rates for 48 hours {#watch @oncall needs=publish}
- [ ] Restore-from-backup drill {#drill @oncall repeat=done+90d}
```

Paste that into any GitHub gist and it renders as a clean checklist. Feed it to the planned `mdc` CLI and you get JSON, computed blocked/actionable state, a topological `next`, and atomic `claim` for multi-agent work. That dual reading — document to humans, database-shaped to tools — is the whole idea.

## Start here

Read in this order; each step assumes the ones before it.

1. [Landscape Map](research/landscape-map.md) — the territory and where MDC sits in it.
2. [MDC Format Sketch (v0)](spec/mdc-format-sketch.md) — the design itself: principles, syntax, conformance levels.
3. [Risks, Critiques, and Open Questions](vision/risks-critiques-open-questions.md) — the red-team view; read before getting attached.
4. [MVP Definition](planning/mvp-definition.md) — the smallest buildable slice and its milestone graph.
5. [Experiment Plan](planning/experiment-plan.md) — how we find out whether anyone wants this before building more.

Everything else is depth-on-demand via the index below.

## Doc index

### Research

Evidence-gathering with verified sources. Each carries the line "Research snapshot: 2026-07-26."

- **[Landscape Map: Where Markdown Checklists Sits](research/landscape-map.md)** — The start-here synthesis of the full territory: plain-text checklist dialects, runnable-document systems (Runme, Jupyter, Quarto, runbooks), AI-agent task formats (spec-kit, Kiro, AGENTS.md, beads, Claude Code Tasks), and markdown-as-database tooling. Ends with a positioning statement — what MDC is, is not, and sits between — plus the namespace decisions and links into every deeper doc.
- **[Prior Art: Checklist and Task Syntaxes](research/prior-art-checklist-formats.md)** — Surveys the four families of checklist/task formats (GFM/GLFM checkboxes, Obsidian/Logseq tool conventions, org-mode/todo.txt/[x]it!/TaskPaper plain-text formats, and Taskwarrior/VTODO database-backed systems) with syntax, semantics, and adoption data. Culminates in a feature-ceiling matrix and a gap analysis of ten capabilities no existing format expresses — the table that defines MDC's opening.
- **[Prior Art: Markdown as a Database](research/prior-art-markdown-databases.md)** — The markdown-as-database landscape across its two dominant architectures — index-and-query tools ([Dataview](https://github.com/blacksmithgu/obsidian-dataview), Datacore, [MarkdownDB](https://github.com/datopian/markdowndb), TiddlyWiki) and sidecar view definitions (Obsidian Bases) — plus the schema-typing axis and the Notion lock-in counterexample. Extracts eight lessons for the deferred `.mddb` companion.
- **[Extension and Naming Conflicts: The .mdc Dossier](research/extension-naming-conflicts.md)** — Verified dossier on every extension and acronym collision: Cursor's mandated `.mdc`, Nuxt's VS Code registration, GitHub Linguist's null rendering, the `.mdb`/Access dead end, the unclaimed `.mddb`. Includes a severity table, the [RFC 7763](https://www.rfc-editor.org/rfc/rfc7763)/7764 IANA variant-registry path, and the canonical decision: cede bare `.mdc`, ship `*.mdc.md` with in-band identity.
- **[Standards Adoption Lessons](research/standards-adoption-lessons.md)** — How markdown-adjacent standards win or lose ([CommonMark](https://commonmark.org/), GFM, [MDX](https://mdxjs.com/), MyST, Markdoc, [Djot](https://djot.net/), AsciiDoc, reStructuredText), distilled into ten sourced lessons — ship the full kit day one, extend the installed base, secure names before announcing — and converted into a dependency-sequenced launch checklist.

### Vision

- **[What MDC Could Unlock](vision/what-mdc-could-unlock.md)** — The vision anthology: the strongest ideas from five analytical lenses — the human-AI shared task substrate, the tooling universe, vertical use cases, community strategy, philosophical foundations — each with what it unlocks and who cares. Concludes with the beachhead recommendation: the coding-agent and spec-driven-development community.
- **[Risks, Critiques, and Open Questions](vision/risks-critiques-open-questions.md)** — The red-team ledger: seven named failure modes ([xkcd-927](https://xkcd.com/927/) dialect proliferation, GFM inertia, the Cursor collision, spec-first death, the app/merge problem, the flight from markdown task state, over-specification) rated for likelihood and severity with dodge conditions, plus the steelman narrow version that survives and the nine-item open-questions register.

### Spec

Design sketches, not specifications — nothing here is normative yet.

- **[MDC Format Sketch (v0)](spec/mdc-format-sketch.md)** — The v0 design: eleven principles, the annotated canonical example, the three-state item model, the attribute block, IDs, template-vs-run, degradation behavior, and the L0 Render / L1 Parse / L2 Mutate conformance-levels sketch. An appendix records the three competing proposals and what each contributed to or lost in the synthesis.
- **[.mddb Concept Sketch: The Markdown Database Layer](spec/mddb-concept-sketch.md)** — The deferred derived relational layer over `.mdc` sources: five data-model positions, the one-way L1 JSON contract, the rationale for MVP deferral, and the explicit trigger conditions that would activate design work.

### Planning

- **[MVP Definition](planning/mvp-definition.md)** — The smallest buildable slice: the one-sentence MVP test, an explicit non-goals table, the six components (executable spec v0.1, [remark](https://github.com/remarkjs/remark) reference parser, `mdc` CLI, agent teaching snippet, living fixtures, namespace launch actions), user stories, and success criteria. Sequencing is a dependency-ordered milestone graph (M0–M7) with no calendar timeline.
- **[Experiment Plan](planning/experiment-plan.md)** — Four falsifiable hypotheses (richer semantics are wanted; agents and humans will co-edit; graceful degradation is load-bearing; the naming decision holds), each with a cheap experiment and pre-registered success/kill signals, plus dogfooding plans that run the project on its own `.mdc` files and community probes, sequenced by dependency with a decision table.

## Current status

**MVP built; pre-launch.** This doc set grew out of [the original idea note](../IDEA.md), which remains the rawest statement of the itch being scratched. The research corpus is complete and adversarially verified, and the MVP defined here is now implemented: the executable spec and conformance corpus live in [`spec/`](../spec/mdc-spec-v0.1.md), the reference parser and `mdc` CLI in [`packages/mdc/`](../packages/mdc/), the drop-in [agent snippet](adoption/agent-snippet.md) in `docs/adoption/`, and the project's own build checklist — checked off by the real CLI — in [`checklists/mvp-build.mdc.md`](../checklists/mvp-build.mdc.md). Run the tooling from the [repo README](../README.md); the format sketch and its example are now byte-for-byte what `mdc fmt` produces. Everything remains a v0 that the experiment plan may still reshape before it is called a frozen spec.

What remains, in dependency order, is the [MVP Definition](planning/mvp-definition.md)'s M0 namespace actions — IANA `variant=mdc` registration (drafted in [iana-registration-draft.md](planning/iana-registration-draft.md)), npm scope, and domain, all secured before any public announcement per the [CommonMark renaming lesson](research/standards-adoption-lessons.md) — and then the public launch. The [open questions register](vision/risks-critiques-open-questions.md) — assignee autolink hazards, ID collisions under concurrency, `.doing` promotion pressure, killer-app sequencing — is the honest list of things we don't know yet. If you want to poke holes, start there; issues that add a failure mode we haven't named are the most valuable contribution this project can receive right now.
