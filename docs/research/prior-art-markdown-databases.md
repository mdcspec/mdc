# Prior Art: Markdown as a Database

*A survey of the tools and formats that already treat markdown corpora as queryable databases — their architectures, query and schema mechanisms, and the lessons that bound the [.mddb companion concept](../spec/mddb-concept-sketch.md).*

Research snapshot: 2026-07-26

## Why this survey exists

Markdown Checklists ([format sketch](../spec/mdc-format-sketch.md)) deliberately defers all relational features — cross-run history, cross-file queries, rollup analytics, high-concurrency writes — to a future `.mddb` layer. That deferral is only safe if we understand what already exists in the "markdown as database" space, because the space is crowded, rapidly maturing, and has produced two clear architectural patterns plus a set of well-documented failure modes. This doc maps that terrain. Companion surveys cover [checklist formats specifically](./prior-art-checklist-formats.md), [the extension-naming collisions](./extension-naming-conflicts.md), and [what standards efforts here can teach us](./standards-adoption-lessons.md); the [landscape map](./landscape-map.md) positions everything on one canvas.

## Pattern one: index-and-query

The dominant architecture scans a folder of plain `.md` files, extracts structure (YAML frontmatter, tags, links, GFM task checkboxes, inline fields), builds an external index, and exposes a query layer over it. The markdown corpus itself is **schemaless** in every one of these systems; structure is emergent from convention, and the "database-ness" lives entirely outside the files.

**[Obsidian Dataview](https://github.com/blacksmithgu/obsidian-dataview)** is the canonical example. It indexes frontmatter, inline `Key:: Value` fields, tags, tasks, and implicit file metadata, then offers four query modes: DQL (a SQL-inspired pipeline language — `TABLE time-played, rating FROM "games" SORT rating desc`), inline expressions, a full JavaScript API, and inline JS. Its `TASK` query type aggregates every checkbox in a vault into one live interactive list — the most direct prior art for querying MDC items across files. Standard queries are read-only and sandboxed, and there is no schema or validation layer at all.

**[Datacore](https://github.com/blacksmithgu/datacore/blob/master/docs/docs/quickstart.md)**, Dataview's successor by the same author, is a cautionary sequel: it **abandons the custom DSL** in favor of React/JSX views with typed object selectors (`@page and #game` inside `dc.useQuery`), claims up to 100x faster indexing, and adds WYSIWYG-editable tables that write back to source files. The declarative non-JS query language was still unfinished at the time of this snapshot — a strong signal that building a good non-programmer query language is the hard part, not the index.

**[MarkdownDB](https://markdowndb.com/)** compiles a markdown folder into SQLite (`npx mddb ./blog` → `markdown.db` with `files`, `file_tags`, `links`, and `tasks` tables — checkboxes are first-class rows) with a JS query API. It is both design prior art for a derived index and a hard naming constraint: `mddb` on [npm](https://www.npmjs.com/package/mddb) belongs to this project, which is why any npm presence for our companion must live under a scope (see [extension-naming-conflicts](./extension-naming-conflicts.md)).

A long tail converges on the same shape: [mdquery](https://github.com/eristoddle/mdquery) (SQL over SQLite FTS5, with an MCP server for AI agents), MDQL, yshavit's mdq (jq-style element selection), and [mdxdb](https://github.com/ai-primitives/mdxdb) (MDX documents as JSON-LD collections with vector search — and roughly one GitHub star, illustrating how many builders and how few winners this space has). The newest common denominator across these is **agent access via MCP**, which validates MDC's agents-first stance.

**[TiddlyWiki](https://tiddlywiki.com/static/Filters.html)** is the longest-lived instance of the pattern, and the notable outlier on granularity: "tiddlers" (atomic units with standard plus arbitrary fields) live many-per-file, queried with a terse bracket-pipeline filter notation. It is existence proof for a **multiple-records-per-file** data model — directly relevant to `.mddb`'s record-granularity question, since MDC items are themselves sub-file records.

## Pattern two: the sidecar view definition — Obsidian Bases

**[Obsidian Bases](https://github.com/obsidianmd/obsidian-help/blob/master/en/Bases/Bases%20syntax.md)** (2025) is the most important recent development for the `.mddb` idea. A `.base` file is not markdown — it is pure YAML with top-level keys `filters`, `formulas`, `properties`, `summaries`, and `views`. Filters compose recursively with `and`/`or`/`not` blocks around an expression language (`file.hasTag("book")`, `price > 5`, `&&`, `||`, `!`); formulas are string expressions with functions and date arithmetic (`date + "1M"`); views carry per-view filters, sort, `groupBy`, and built-in aggregations (Sum, Average, Min/Max, Median, Earliest/Latest). The notes remain plain markdown with frontmatter; the sidecar stores only queries and views.

Two facts about Bases matter more than its syntax:

1. **It is escaping its host application.** [mdbasequery](https://github.com/intellectronica/mdbasequery) is a third-party TypeScript CLI/library implementing Bases-compatible filters, formulas, views, and summaries over any markdown vault, with JSON/YAML/CSV output. A well-specified sidecar format is becoming a de facto standard without its vendor's involvement — exactly the trajectory `.mddb` would want, and exactly why our stance is to **watch `.base` for consolidation** before specifying anything (interop may beat invention).
2. **Its reception identified the architectural gap.** The [Hacker News discussion](https://news.ycombinator.com/item?id=44945532) praised the plain-text portability ("data exists first, views emerge second") but repeatedly flagged the one-markdown-file-per-row model as the core limitation: tracking a few hundred small records means a few hundred tiny files. A future `.mddb` that handles sub-file records — checklist items as rows — is differentiated where Bases structurally cannot follow.

**Org-mode** made the opposite architectural choice decades earlier and proves it works: [column view](https://orgmode.org/manual/Column-View.html) overlays an editable tabular UI onto outline properties, and [`#+TBLFM:` formula lines](https://orgmode.org/manual/The-Spreadsheet.html) turn tables into spreadsheets — view and computation definitions living **inside** the document as plain text. Sidecar vs. in-document is a genuine open design axis, not a settled question.

## The schema axis: where typing lives

The index-and-query tools are uniformly schemaless. The strongest typed prior art comes from developer content tooling, and it converges on one answer: **schema lives outside the content files.**

- **[Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)** define a Zod schema per collection in a config file, validate every entry's frontmatter at build time, fail the build loudly on mismatch, and generate TypeScript types for queries. Contentlayer pioneered this "markdown corpus → type-safe JSON" model and then [became unmaintained](https://dub.co/blog/content-collections) after its sponsor was acquired — an adoption-risk lesson (vendor-neutral governance) as much as a design one. Content Collections is its community successor.
- **Hugo and Jekyll conspicuously lack native frontmatter validation** — a [long-standing community complaint](https://discourse.gohugo.io/t/how-to-validate-frontmatter/54085) served only by third-party scripts. The absence is felt; typed frontmatter is a demanded feature, not a nicety.
- **[Markdoc](https://markdoc.dev/)** (Stripe) shows a third location: typed, validated `{% tag %}` structures embedded inline in the markdown, with the schema in TypeScript — schema-validated inline extension of CommonMark at the scale of all of Stripe's docs. This is the closest industrial precedent for MDC's own typed attribute block.

For `.mddb`, the implication is direct: if it ever specifies anything, a first-class schema definition with build-time-style validation belongs in the design from day one, because the schemaless incumbents (Dataview, MarkdownDB) leave typing implicit and the typed systems that succeeded all made validation loud.

## The counterexample: Notion

Notion is the UX target and the lock-in anti-pattern in one product. Its databases offer typed properties, views, filters, relations, rollups, and formulas — and its exports emit only CSV plus markdown pages, [silently dropping all of it](https://raccoon.page/blog/notion-export-limitations/): relations flatten to name-plus-URL text, formulas, rollups, views, comments, and history vanish, and size limits break large exports outright. The connective tissue that makes a Notion database more than a spreadsheet does not survive leaving Notion. This is the marketing wedge a plain-text derived layer exists to attack: **views, schema, and relations that survive in git-diffable text.**

At the other extreme, **[lowdb](https://www.npmjs.com/package/lowdb)** sets the developer-experience bar with no query language at all — a JSON file manipulated with plain JavaScript. Together with Datacore's DSL abandonment, it argues that a future `.mddb` should specify a **data model plus at most a small expression grammar** (Bases-style filters are the closest thing to consensus) and treat SQL and native-language bindings as reference implementations, never invent a full novel query language.

## Lessons extracted for .mddb

1. **The derived-index architecture is validated.** Dataview, MarkdownDB, mdquery, and TaskChampion-style stores all put database-ness in a disposable projection over authoritative text. `.mddb` as a derived, tool-facing layer built from `.mdc.md` sources — never hand-authored, never the source of truth — sits squarely in this proven lineage.
2. **The L1 JSON item model is the load-bearing contract.** Every indexer in this survey had to invent its own extraction model. MDC ships one canonically; `.mddb` consumes it later without any change to `.mdc`. This is why deferral is cheap.
3. **Sub-file records are the open gap.** Bases' file-per-row model is its most-criticized limit; TiddlyWiki and org-mode prove in-document records work. Checklist items as rows is the differentiation `.mddb` would bring — and a reason not to assume `.base` compatibility forecloses the concept.
4. **Do not invent a query language.** The field's fragmentation (DQL, Bases expressions, TiddlyWiki filters, SQL, JSX, lodash) plus Datacore's retreat to JavaScript says the DSL is where these projects go to die. Data model first; bindings as implementations.
5. **Schema out-of-band, validation loud, types generated** — the Astro/Contentlayer/Markdoc consensus, against the Dataview/MarkdownDB schemaless default.
6. **Agents are the new common consumer.** MCP servers are a headline feature of the newest tools; plain text is the most LLM-legible database substrate. This tailwind is shared with `.mdc` itself.
7. **Naming is constrained, not blocked.** `mddb` on npm is MarkdownDB's; `.mdb` is Microsoft Access's, permanently. The `.mddb` extension itself is verified unclaimed. Details and decisions in [extension-naming-conflicts](./extension-naming-conflicts.md).
8. **Sequence tooling before prose, and watch the incumbent.** Formats here win by shipping working tools (mdbasequery made `.base` portable; Contentlayer died of governance, not design). Combined with the [standards-adoption lessons](./standards-adoption-lessons.md), this supports the project's stance: reserve the name, pin the contract, defer the design until `.mdc` has users — and re-evaluate against `.base` when that day comes. The concrete commitments and boundaries live in the [mddb concept sketch](../spec/mddb-concept-sketch.md); what stays out of `.mdc` scope meanwhile is pinned in the [MVP definition](../planning/mvp-definition.md).
