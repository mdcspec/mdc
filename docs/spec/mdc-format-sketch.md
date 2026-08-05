# MDC Format Sketch (v0)

*A working sketch — explicitly not a spec — of the MDC (Markdown Checklists) document format: its design principles, canonical example, item states, metadata syntax, conformance levels, and the alternatives we considered and rejected.*

> **Status: sketch.** Everything here is a decision record on the way to a v0.1 spec, which will ship as an executable, example-based test corpus (see [MVP definition](../planning/mvp-definition.md)). Nothing below is normative until it exists as a passing fixture.

## Identity and naming, in one paragraph

The format is **MDC — Markdown Checklists**. The canonical filename is the double extension `*.mdc.md`, following [RFC 7764](https://www.rfc-editor.org/rfc/rfc7764)'s variant-prefix pattern (`example.pandoc.markdown`). But the extension is an affordance, never the protocol: **a file is an MDC document if and only if its YAML frontmatter contains the `mdc:` version key.** A `TODO.md` with that key is exactly as valid as `release.mdc.md`. We cede the bare `.mdc` extension permanently — Cursor mandates it for rules files, Nuxt's VS Code extension registers it, and GitHub Linguist assigns it no language, so bare-`.mdc` files render as nothing on GitHub. `.mdb` is never an option (thirty years of Microsoft Access). The database companion is reserved as `.mddb` but deliberately unspecified — see the [mddb concept sketch](mddb-concept-sketch.md). We will register `text/markdown; variant=mdc` in the [IANA Markdown Variants registry](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) before any public announcement. Full collision analysis lives in [extension naming conflicts](../research/extension-naming-conflicts.md).

## Design principles

1. **Radical compatibility is the definition of validity.** Every MDC document is a byte-for-byte valid, pleasant GFM file that renders correctly on GitHub, GitLab, VS Code, and Obsidian with zero tooling. L0 conformance is guaranteed by construction, not tested after the fact.
2. **Identity is in-band.** The `mdc:` frontmatter key is the magic number. Tools dispatch on content, never filename — the only rule that survives stdin, gists, API payloads, and agent context windows.
3. **Exactly one metadata serialization.** One optional trailing attribute block per item line. No emoji dialect, no `[key:: value]`, no bare trailing tokens. Incumbent dialects ([prior art](../research/prior-art-checklist-formats.md)) are handled by importers, never as alternative syntaxes.
4. **Three conformance levels** — Render, Parse, Mutate — sketched below.
5. **Derived state is never stored.** Blocked flags, progress counts, and rollups are always computed (the Jupyter/nbdime and org-mode-cookie lesson from [standards adoption lessons](../research/standards-adoption-lessons.md)). Execution output never goes in the file.
6. **Template-vs-run is the load-bearing abstraction**, expressed entirely in frontmatter — zero new syntax.
7. **Progressive disclosure.** `- [ ] item` with no attributes is a complete, valid MDC item. Every feature is opt-in; complexity is paid only by documents that use it.
8. **Explicit semantics where incumbents are ambiguous.** Recurrence anchors are mandatory, cancelled is distinct from done, blocked is derived from typed dependencies.
9. **IDs are optional, visible, human-scale slugs** — never UUIDs (the [JEP 62](https://jupyter.org/enhancement-proposals/62-cell-id/cell-id.html) diff-noise lesson) — required only where referenced.
10. **Tooling is the product.** The spec ships as an executable test corpus with a reference parser and CLI; AI agents are the first-class consumer. See [what MDC could unlock](../vision/what-mdc-could-unlock.md).
11. **Scope discipline.** Relational needs graduate to the [.mddb layer](mddb-concept-sketch.md) rather than growing .mdc syntax. Outgrowing .mdc is graduation, not failure.

## The canonical example

Every core construct in v0 appears in this document; it ships as a living fixture alongside [the template it was cut from](#the-template-it-was-cut-from). The remaining opt-in constructs — the `.waiting` class, `x-`-prefixed extension keys, schedule-anchored `repeat=due+…`, and the HTML-comment escape hatch — are defined in the prose sections below and get fixtures of their own in the v0.1 corpus.

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

### Every construct, annotated

| Construct | Where in the example | Meaning |
| --- | --- | --- |
| `mdc: "0.1"` | frontmatter | The format signature and version. Required; the only thing that makes this an MDC document. |
| `kind: run` | frontmatter | `template \| run \| list` (default `list`). This document is an instance of a template. |
| `template: …@5` | frontmatter | The template path and version this run was cut from (runs only). The `@version` token is reserved syntax; its resolution semantics are an [open question](../vision/risks-critiques-open-questions.md). |
| `mode: do-confirm` | frontmatter | Checklist-science execution mode: `read-do` or `do-confirm` — [Degani & Wiener's distinction](../research/prior-art-checklist-formats.md#family-0-what-checklist-science-demands-of-a-format). |
| `started:` | frontmatter | Run metadata. ISO 8601. |
| Free prose | intro paragraph, headings, nested notes | Opaque to tools; round-trips byte-for-byte. |
| `- [ ]` / `- [x]` | every item | The only bracket states, strictly per [GFM §5.3](https://github.github.com/gfm/#task-list-items-extension-). |
| `{#branch @tim done=…}` | Prepare section | The trailing attribute block: ID, assignee, completion date. |
| `.gate` | `#triage`, `#tag` | Reserved class: this item must be terminal before any later item is actionable. |
| Pause-point blockquote | after Prepare | Convention, not syntax: a blockquote starting `**Pause point**`, lintable, renders as an ordinary quote ([why pause points](../research/prior-art-checklist-formats.md#family-0-what-checklist-science-demands-of-a-format)). |
| `needs=branch` | `#ci` | Typed dependency edge; blocked status is *derived* from it, never declared. |
| `verify="npm test"` | `#ci`, `#publish` | Machine-verifiability hook: exit 0 means checkable. Data in v0; execution is tool behavior. |
| `.doing` | `#smoke` | Reserved soft-state class for in-progress — never a bracket character. |
| Nested `- [ ]` children | under `#smoke` | Children belong to the parent; rollups are computed, never stored. |
| `- [x] ~~text~~ … reason=` | `#pdf` | The cancelled state: struck through, not outstanding, with a machine-readable reason — the [anti-box-ticking affordance](../research/prior-art-checklist-formats.md#family-0-what-checklist-science-demands-of-a-format). |
| `.optional` | `#notes` | Reserved class: excluded from gating. |
| `repeat=done+90d` | `#drill` | Completion-anchored recurrence; the anchor token is mandatory. |

## Item states

Stored states are exactly three:

| State | Syntax | Rendered everywhere as |
| --- | --- | --- |
| Open | `- [ ] text` | Unchecked box |
| Done | `- [x] text` | Checked box (`[X]` normalized to `[x]` by `mdc fmt`) |
| Cancelled | `- [x] ~~text~~` + recommended `reason="…"` | Checked box, struck text — visibly not-outstanding |

No other bracket characters exist at any conformance level. Under a strict reading of the GFM spec, `[-]`, `[/]`, and `[~]` are not task-list items at all and lose the checkbox on GitHub — which would violate the L0 guarantee. Cancelled items are excluded from computed rollup numerators *and* denominators, matching [GitLab's inapplicable-task semantics](https://docs.gitlab.com/ee/user/markdown/#task-lists). The `reason=` attribute is the anti-box-ticking feature the checklist literature motivates.

Soft workflow states are never brackets: in-progress is the reserved `.doing` class, human-declared external waits are `.waiting`, and **blocked is always derived** — a tool reports an item blocked while any `needs=` dependency is non-terminal.

## Metadata: the attribute block

One optional trailing block per item line, using the [Pandoc](https://pandoc.org/MANUAL.html#extension-attributes)/PHP-Markdown-Extra attribute microgrammar:

```
{#id .class @assignee key=value key="quoted value"}
```

- At most one `#id` and one `@assignee` per item; everything before the block is item text, verbatim.
- `.class` tokens are free-form tags; `.gate`, `.optional`, `.doing`, `.waiting` are reserved.
- Reserved keys in v0 (a closed set): `due`, `done`, `repeat`, `needs`, `verify`, `reason`. Extensions use `x-` prefixed keys. Dates are ISO 8601.
- `repeat=` must name its anchor: `repeat=done+90d` (completion-anchored) vs `repeat=due+1w` (schedule-anchored) — closing the ambiguity that bites org-mode and Obsidian Tasks users alike.

The brace delimiter is what makes the text/metadata boundary deterministic — required for L2 mutation — and eliminates `key:value` false-positives on prose like "ratio 16:9". HTML comments are reserved as an explicit opt-in escape hatch for tool-managed invisible metadata; conforming tools never write them unprompted.

## IDs

IDs are human-readable slugs, unique per file, author-chosen or generated by `mdc fmt --assign-ids`. They are **required only when something references them**. Duplicate IDs and dangling `needs=` references are lint errors. Conforming tools address items by ID, never by line number or text match. Cross-file references (`path#id`) are reserved syntax with resolution deferred — see [open questions](../vision/risks-critiques-open-questions.md).

## Template vs. instance

The clearest differentiation from GFM task lists and todo.txt (see the [landscape map](../research/landscape-map.md)) costs zero new syntax. A `kind: template` document is the reusable procedure; a `kind: run` document pins `template: path@version` and carries run metadata (`started`, and per-item `done=` stamps as work proceeds). One template, many runs. Cross-run history, rollups, and analytics are inherently relational and belong to [.mddb](mddb-concept-sketch.md) — never to .mdc syntax.

### The template it was cut from

The canonical run above pins `template: templates/release.mdc.md@5`. This is the companion fixture that path names — the same procedure, with everything run-specific absent:

```markdown
---
mdc: "0.1"
kind: template
title: Release
mode: do-confirm
---

# Release

## Prepare

- [ ] Freeze `main`, cut the release branch {#branch}
- [ ] Bump version and add changelog entry {#bump}
- [ ] All open P1 issues fixed or explicitly deferred {#triage .gate}

> **Pause point** — do-confirm: the team verifies the section above aloud,
> in order, before anyone proceeds.

## Verify

- [ ] CI green on the release branch {#ci needs=branch verify="npm test"}
- [ ] Smoke test on staging {#smoke needs=ci}
  - [ ] Login and logout
  - [ ] Checkout with a saved card
  - [ ] CSV export over 10k rows
- [ ] Load-test legacy PDF endpoint {#pdf}

## Ship

- [ ] Tag the release and push {#tag .gate needs=smoke}
- [ ] Publish package to npm {#publish needs=tag verify="npm publish --dry-run"}
- [ ] Publish GitHub release notes {#notes .optional needs=tag}

## Follow-up

- [ ] Watch error rates for 48 hours {#watch needs=publish}
- [ ] Restore-from-backup drill {#drill repeat=done+90d}
```

A template carries the *procedure*: item text, IDs, `.gate`/`.optional` classes, `needs=` edges, `verify=` hooks, and recurrence rules. It omits everything that belongs to a single execution: no `template:` or `started:` frontmatter, no `done=` stamps, no per-run `@assignee`s or concrete `due=` dates, no `.doing`/`.waiting` soft states, no cancelled items. Cutting a run copies the body, sets `kind: run`, pins `template: path@version`, and records `started:`; run state then accrues on the item lines as work proceeds — compare `#pdf`, open here and cancelled in the run above with a `reason=`.

### The `@version` token

The `@5` in `template: templates/release.mdc.md@5` pins the template revision a run was cut from, so later template edits never reinterpret an in-flight run. In v0 the `@<version>` token is **reserved syntax with unresolved semantics**: whether it names a git tag or ref, a frontmatter version counter (and if so, who increments it), or a content hash is deliberately undecided — tracked in the [open questions register](../vision/risks-critiques-open-questions.md). A v0 tool must preserve the token verbatim and treat it as opaque; nothing in v0 resolves it.

## Degradation in plain renderers

L0 is not a compatibility mode; it is the format. In any GFM renderer with no MDC tooling:

- Open and done items are live checkboxes; cancelled items are checked and struck through — correct at a glance.
- Attribute blocks render as literal trailing text — a readability tax we accept deliberately (see the appendix).
- Pause points render as ordinary blockquotes; frontmatter renders as a metadata table on GitHub or is hidden.
- Nothing is lost, nothing is broken, and GitHub's own progress counts remain sane because only real GFM checkboxes exist.

One known hazard: `@assignee` tokens autolink (and can notify real users) when MDC content is pasted into GitHub issue or PR bodies — feature and footgun, tracked in [risks and open questions](../vision/risks-critiques-open-questions.md).

## Conformance levels (sketch)

| Level | Name | A conforming implementation must… |
| --- | --- | --- |
| **L0** | Render | Nothing. Any markdown viewer is L0-conformant by construction; the test corpus includes GitHub/GitLab rendering fixtures proving it. |
| **L1** | Parse | Extract the document to the canonical JSON item model: frontmatter, items with state/text/id/assignee/classes/attributes, hierarchy, and computed fields (blocked, actionable, rollups). L1 is the interchange contract for all tooling and the future .mddb. |
| **L2** | Mutate | Apply the normative mutation vocabulary — `check`, `uncheck`, `cancel`, `claim`, `set-attr`, `assign-id` — such that each mutation touches exactly the target item's line. `claim` is atomic (fails if an assignee is already set). On canonical-form documents (`mdc fmt`: attribute order id, classes, assignee, then keys alphabetically), mutations are byte-deterministic across implementations, enforced by a shared cross-implementation test corpus. |

A minimal implementation is L1: parse to JSON. A full implementation is L2: the item line is the merge unit, which is what makes plain git merges and multi-agent concurrent writes tractable — the property no incumbent format specifies. The [MVP CLI](../planning/mvp-definition.md) ships `check` and `claim` as the first L2 mutations; how we validate all of this against real usage is in the [experiment plan](../planning/experiment-plan.md).

## Appendix: considered alternatives

The v0 sketch synthesizes three competing internal proposals. The scoring that drove the synthesis, in brief:

| Proposal | Adoptability | Differentiation | Mutation determinism |
| --- | --- | --- | --- |
| 1 — Radical Compatibility | **9/10** — best in field, and the only perfect graceful-degradation story | 6/10 — alone, risks the "another TODO.md convention" death mode | Weak: bare trailing tokens leave the text/metadata boundary ambiguous |
| 2 — Semantic Richness | 4/10 — lowest: six of its eight bracket states lose the checkbox on GitHub | High expressiveness, but an order-of-magnitude larger spec surface, ahead of demand | Unaddressed |
| 3 — Tooling & Agents First | Middling: machine-first excesses (4-state brackets, in-file audit log) cost it | **9/10** — highest: the novel spec surface no incumbent has | Strong: byte-deterministic L2 edits, canonical formatter, atomic `claim` |

What each contributed and why each lost as-written:

**Proposal 1 — Radical Compatibility.** No new syntax at all: metadata as bare trailing tokens (`@tim due:2026-07-28 #gate id:ci`) in the todo.txt/TaskPaper lineage. Won the backbone (best adoptability and the only perfect degradation story) and its naming verdict was adopted wholesale. Rejected on one point: bare tokens make the text/metadata boundary ambiguous (`ratio 16:9` false-positives, forced key whitelists), which is fatal to deterministic L2 mutation. The brace block won 2-of-3 across proposals; we accept its modest readability tax as the price of the format's differentiator.

**Proposal 2 — Semantic Richness.** Eight bracket states (`[/]`, `[?]`, `[>]`, `[-]`, `[~]`, `[!]`…), roles indirection, sign-offs, evidence annotations, an `.mdcl` extension. Scored lowest on adoptability: six of eight states lose the checkbox on GitHub, and an order-of-magnitude larger spec surface is the documented death mode of formats that specify ahead of demand. Its surgical grafts survived: machine-readable `reason=` on cancellation, mandatory recurrence anchors, the `mode:` key, and the discipline of documented importer fidelity.

**Proposal 3 — Tooling & Agents First.** Byte-deterministic mutations, canonical formatter, atomic `claim`, in-band signature, derived-state discipline — all adopted; this is the genuinely novel spec surface no incumbent has. Trimmed: its 4-state bracket enum (breaks GFM checkboxes), in-file append-only audit log (tail-conflict magnet; git history is the audit trail until .mddb), and frontmatter ID counters (their own merge problem).
