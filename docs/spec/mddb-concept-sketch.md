# .mddb Concept Sketch: The Markdown Database Layer

*A concept sketch — deliberately not a specification — of `.mddb`, the derived relational layer built from Markdown Checklists sources: the data-model positions we hold, its contract with [.mdc](./mdc-format-sketch.md), why it is excluded from the [MVP](../planning/mvp-definition.md), and the concrete conditions that would activate design work.*

**Status: reserved, named, constitutionally bounded — not designed.** This document exists so that when `.mddb` work begins, it begins from positions we have already argued through, and so that until then, every relational feature request against `.mdc` has a documented place to be routed instead of a syntax to grow into.

## What .mddb is, and what it can never be

`.mddb` is the tool-facing, queryable projection of a corpus of `.mdc.md` documents — a SQLite or JSONL index in the architectural lineage of [Dataview](https://blacksmithgu.github.io/obsidian-dataview/), [MarkdownDB](https://markdowndb.com/), and [TaskChampion](https://github.com/GothenburgBitFactory/taskchampion). Three constitutional constraints bound it permanently:

1. **Never hand-authored.** No one writes a `.mddb` file. It is built, and rebuilt, from markdown sources.
2. **Never the source of truth** for anything `.mdc` can express. If the index and the documents disagree, the documents win, and the index is regenerated.
3. **Never a place data "moves to."** Migration from `.mdc` to `.mddb` is not a supported operation because it is not a coherent one — the document layer is canon, the database layer is commentary. Regenerability from plain text is intended to be a conformance requirement, not a value statement.

The framing matters as much as the constraints: outgrowing a single checklist file is **graduation, not failure**. The evidence that text files have a real structural boundary is by now overwhelming — GitHub retired markdown tasklist blocks in favor of [database-backed sub-issues](https://github.blog/changelog/2025-01-13-evolving-github-issues-public-preview/), Taskwarrior abandoned its flat-file store for [SQLite in 3.0](https://taskwarrior.org/docs/upgrade-3/), and agent-issue trackers like [beads](https://github.com/steveyegge/beads) moved to database backends for the same reason. `.mddb` exists so that when our users hit that boundary, the answer is a layer above the format rather than a fork away from it. See [risks-critiques-open-questions](../vision/risks-critiques-open-questions.md) for the failure mode where the database quietly becomes the truth anyway.

## The data-model positions

Five positions, held in advance of any grammar. Each is grounded in the survey in [prior-art-markdown-databases](../research/prior-art-markdown-databases.md).

### 1. Rows are files, blocks, *and* items — not just files

Every incumbent picks one grain. [Obsidian Bases](https://help.obsidian.md/bases) and [MarkdownDB](https://www.npmjs.com/package/mddb) treat one file as one record — an architecture validated by adoption, but one that collapses for spreadsheet-shaped data, where hundreds of small records would mean hundreds of stub files. That one-file-per-record limitation was the most repeated criticism in the Bases reception, and [TiddlyWiki](https://tiddlywiki.com/) and [org-mode](https://orgmode.org/) both prove that in-document record models work.

`.mddb`'s position: the row grain is declared per table, and three grains are first-class —

- **file as row** (frontmatter fields as columns; the Bases/MarkdownDB model),
- **block or section as row** (a heading-delimited region as a record; the org-mode model),
- **item as row** (a checklist item as a record — which is exactly the `.mdc` L1 item model).

The third grain is what makes `.mddb` a companion to `.mdc` rather than a Bases clone: every `- [ ]` line with an attribute block is already a typed record with an ID, an assignee, dates, and foreign keys. `.mddb` does not need to invent a record syntax for checklist data; it needs only to consume the one `.mdc` already defines.

### 2. Frontmatter is the row, schema lives outside the content

Every successful typed-frontmatter system — [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/), [Contentlayer](https://contentlayer.dev/), Markdoc — keeps the schema out of the content files and generates validation and types from a separate definition, while the perennial Hugo/Jekyll complaint is exactly the absence of that validation. Dataview and MarkdownDB leave typing implicit and inherit the same weakness.

`.mddb`'s position: a first-class schema definition (in the sidecar or a dedicated schema file, never in the documents) with build-time validation semantics. Content files stay clean markdown; the schema is where "the `due` column is a date and `severity` is one of three strings" is declared and enforced at index-build time. For `.mdc` sources specifically, the item-level schema is largely pre-answered: the v0 reserved-key set (`due`, `done`, `repeat`, `needs`, `verify`, `reason`) plus `x-` extensions is the column vocabulary, already typed by the spec.

### 3. Relations are human-readable references in the source, foreign keys in the projection

Relations in the document layer are things a human can read and a diff can show: wiki-links between notes in the Obsidian lineage, and `needs=id` edges plus reserved `path#id` cross-file references in `.mdc`. `.mddb` resolves these into real foreign keys — join-able, integrity-checkable, dangling-reference-detectable — but never requires an opaque identifier in the source text (stable IDs stay human-scale slugs, per the `.mdc` decision).

This is also the marketing wedge the research identified: the canonical Notion-export failure mode is relations, rollups, and views silently dropped on the way out. `.mddb`'s counter-pitch is that **relations survive in git-diffable plain text**, and the database is merely the fast way to traverse them.

### 4. Views are definitions, not documents — and the query language is small

Bases validated the category shape here: plain markdown as data, plus a YAML view file (filters, formulas, properties, summaries) defining how to look at it — and the existence of independent third-party implementations of the `.base` format suggests that sidecar-view-file category may standardize with or without us. The query-language field, meanwhile, is a fragmentation warning: DQL, Bases expressions, TiddlyWiki filters, SQL-over-SQLite, and plain JavaScript all coexist, [Datacore](https://github.com/blacksmithgu/datacore)'s author abandoned his own widely adopted DSL for JavaScript, and [lowdb](https://github.com/typicode/lowdb) thrives with no query language at all.

`.mddb`'s position: specify the **data model plus a small expression grammar** (Bases-style filters and formulas are the closest thing to consensus), and treat SQL and JavaScript access as reference *bindings* over the index rather than inventing a full novel query language. Views are stored definitions in the derived layer; view *state* (sort order, collapsed groups) never touches the source documents.

### 5. Template-vs-instance is the schema/row relationship — and the reason .mddb exists

This is the load-bearing position. `.mdc` already carries the template/run distinction in frontmatter (`kind: template | run`, `template: path@version`). Read relationally, a template is a table definition: its item IDs are the columns. Each run is a row: the same IDs, filled in with states, assignees, timestamps, and reasons. "One template, many runs" is *inherently* a relational shape — a cross-run table where rows are performances and columns are the score — and it is precisely the shape a single text file cannot hold, because the runs are many files by design.

That is `.mddb`'s soul, not just its schema: the concert archive. The queryable memory of how a checklist has actually been performed — which items always get cancelled with the same `reason=`, where runs stall, how long `#smoke` really takes — is what feeds revision of the template. The prior-art sweep found "checklist-as-template with per-run instances and completion records" to be a completely unserved gap; `.mddb` is the half of the answer that `.mdc` deliberately does not attempt.

## The contract with .mdc

The entire interface between the layers is already shipped, by construction: **`.mdc`'s canonical L1 JSON item model is the interchange format `.mddb` will consume.** Every conforming parser emits it today; the [MVP](../planning/mvp-definition.md) CLI's `parse --json` is, in effect, the future index-builder's input stage. This is the deferral's insurance policy — building `.mddb` later requires no change to `.mdc`, so deferring costs us nothing in format design, only in tooling we have chosen not to build yet.

The contract runs in one direction. `.mddb` reads the item model; it never writes documents. Derived state — blocked flags, rollups, progress percentages, cross-run aggregates — lives in the index or is computed on demand, never stored in source files (the [nbdime and org-cookie lesson](../research/standards-adoption-lessons.md)). And `.mdc` syntax will be actively defended against absorbing relational features: cross-file rollups, query blocks, stored history, and high-write coordination primitives are routed here, permanently.

Naming is settled and documented in [extension-naming-conflicts](../research/extension-naming-conflicts.md): the extension is `.mddb` (verified unclaimed; the SAS/OLAP "multidimensional database" overlap is semantically friendly), `.mdb` is permanently excluded (thirty years of Microsoft Access, a Library of Congress registry entry, default Outlook attachment blocking), and any npm presence must be scoped (e.g. `@mdcspec/mddb`) because the bare [`mddb` package](https://www.npmjs.com/package/mddb) belongs to Datopian's MarkdownDB.

## Why .mddb is deferred from the MVP

Three reasons, in descending order of weight:

1. **Specifying ahead of demand is the documented death pattern.** The [standards-adoption research](../research/standards-adoption-lessons.md) is unambiguous: formats that specified relational and semantic machinery before anyone needed it (the AsciiDoc and VTODO trajectories) died of their own spec surface. `.mdc` does not yet have users; a database layer for data that does not exist would be the purest possible instance of the pattern.
2. **The category may consolidate around someone else's format.** Obsidian Bases' `.base` is simultaneously our template and our competitor, and it already has independent implementations. If the sidecar-query category standardizes on `.base` and Bases closes its one-file-per-record gap, the right `.mddb` move may be interop rather than invention. Watching costs nothing; building prematurely forecloses the cheaper option.
3. **Opportunity cost against the killer app.** Every unit of effort spent on `.mddb` before `.mdc` has users is effort the [first public proof](../planning/experiment-plan.md) — the agent/human shared task file or the merge-gated release checklist — does not get. The format survives only if one of those lands visibly; no one adopts a database layer for a checklist format nobody uses.

## Trigger conditions

`.mddb` design work activates when the **prerequisite** holds and at least one **demand trigger** fires, gated by the **build-vs-adopt check**. Sequencing is by these conditions, not by calendar.

**Prerequisite (necessary, never sufficient):**

- The L1 JSON item model is frozen and enforced by the cross-implementation test corpus. An index built on a moving interchange format would couple the layers we spent this document decoupling.

**Demand triggers (any one, evidenced by real usage rather than anticipation):**

- **Relational questions from real users.** Recurring requests that no single document can answer — cross-run duration and completion analytics, "which runs skipped this gate," rollups across a directory of checklists — appearing in issues or observed agent workflows.
- **Sustained syntax pressure on `.mdc`.** Repeated, serious proposals to grow `.mdc` attributes or blocks toward stored counts, embedded queries, or cross-file rollups. The constitutional defense routes these here; enough routed pressure is itself the demand signal.
- **The concurrency wall, measured.** Multi-agent write contention that the atomic `claim` primitive plus ordinary git merging demonstrably cannot absorb — elevated merge-conflict or lost-update rates in real multi-agent repositories. This is the same boundary GitHub, Taskwarrior, and beads each hit; reaching it in our own telemetry is the strongest possible activation signal.
- **A template/run corpus worth querying.** Enough real `template: path@version` runs exist in the wild that cross-run analytics would have data — the score has been performed often enough to justify the archive.

**Build-vs-adopt check (run at activation, before any grammar is written):**

- Re-evaluate the `.base` ecosystem. If it has consolidated as a de facto standard *and* covers multi-record-per-file and the item-as-row grain, specify `.mddb` as an interop profile over it. Only if the gap `.mddb` targets remains structurally unserved do we design an independent format — and even then, per [what-mdc-could-unlock](../vision/what-mdc-could-unlock.md), the pitch stays the same: views, schema, and relations that survive in plain text, with the database always one rebuild away from the truth.

Until a trigger fires, the whole of the `.mddb` project is this sketch, one reserved extension, one npm scope, and a standing rule about where relational complexity goes to live. That is exactly as much `.mddb` as a format with zero users should have.
