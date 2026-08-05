# Standards Adoption Lessons

*How markdown-adjacent standards win or lose — distilled from the histories of CommonMark, GFM, MDX, MyST, Markdoc, Djot, AsciiDoc, and reStructuredText into concrete lessons and a day-one launch checklist for Markdown Checklists (.mdc).*

Research snapshot: 2026-07-26

## The pattern in one paragraph

Specifications follow adoption; they do not create it. Markdown spread for a decade (2004–2014) on nothing but [Gruber's informal syntax page](https://blog.codinghorror.com/standard-flavored-markdown/) and a buggy Perl script. Every format that later succeeded did so because a platform or ecosystem *pulled* it — and every technically superior format without that pull stalled. The .mdc effort is an extension play on the largest installed base in plain-text history ([GFM task lists, shipped January 2013](https://github.blog/news-insights/product-news/task-lists-in-gfm-issues-pulls-comments/), formalized in the [2017 GFM spec](https://github.github.com/gfm/)), which means the histories below are not analogies — they are the direct precedents for what we are attempting.

## Scorecard

| Format | Outcome | Decisive factor |
| --- | --- | --- |
| CommonMark (2014) | Won the baseline | Complete day-one kit + platforms that wrote it deployed it |
| GFM (2017) | Won extensions | Strict optional superset of CommonMark; GitHub absorbed migration cost |
| MDX (2018) | Won components-in-md | React docs ecosystem pulled it; rode remark instead of building a parser |
| MyST (2020–) | Won its scientific niche | Grant funding + Jupyter Book killer app + versioned AST spec |
| Markdoc (2022) | Survives | Single-vendor credibility: "it powers Stripe's docs" |
| Djot (2022) | Stalled (~2k stars) | Best design in the field, but no platform renders it |
| AsciiDoc | Lost the mainstream | Spec written ~18 years after the implementation; standardized after the race |
| reStructuredText | Confined to Python | Learning curve + single-ecosystem coupling |

## The lessons

### 1. Ship the complete kit on day one — the spec alone is invisible

CommonMark's September 2014 launch was a two-year private effort (Atwood, Greenspan, plus GitHub, Reddit, and Stack Exchange representatives) that arrived with everything at once: a rigorously exampled spec that doubles as its test suite, C **and** JavaScript reference implementations, a live playground (the "dingus"), and a Discourse forum — all authored or coordinated by John MacFarlane ([Atwood's first-hand account](https://blog.codinghorror.com/standard-flavored-markdown/)). Nothing about that kit was optional; each artifact answered a different adopter's first question. Our [MVP definition](../planning/mvp-definition.md) applies this at minimum viable size: executable spec, one reference parser, one CLI, and the agent-teaching snippet.

### 2. Extend the installed base; never replace it

GFM's 2017 formalization is the winning template: a [strict, optional superset of CommonMark](https://github.blog/engineering/user-experience/a-formal-spec-for-github-markdown/) with an open-sourced AST-producing parser, where GitHub absorbed the migration cost (normalizing ~1% of existing user content). The counterexample is Djot: MacFarlane's own [Beyond Markdown](https://johnmacfarlane.net/beyond-markdown.html) diagnosis produced a genuinely better language — linear-time parsing, universal attributes — and [~2,000 stars, seven niche implementations](https://github.com/jgm/djot), and an HN verdict of ["cmark-gfm is good enough"](https://news.ycombinator.com/item?id=33867636). The field's most qualified designer could not move the installed base with technical merit. This is why MDC's L0 guarantee — every document is valid, pleasant GFM by construction — is the definition of validity in the [format sketch](../spec/mdc-format-sketch.md), not a compatibility mode. It is also why the bracket grammar stays strictly `[ ]`/`[x]`: exotic states like `[-]` lose the checkbox on GitHub and break the superset promise (see [prior-art on checklist formats](./prior-art-checklist-formats.md)).

### 3. A killer app is non-negotiable — specs follow platforms

GFM had GitHub. MDX had Docusaurus/Next.js/Gatsby ([about MDX](https://mdxjs.com/community/about/)). MyST had Jupyter Book. [Markdoc](https://markdoc.dev/) had Stripe's own docs. Front matter had Jekyll. Djot had nothing rendering it, and that single absence outweighed every design win. For .mdc, the platform is the developer toolchain plus the agent harness: coding agents already maintain markdown task files, and a machine-parseable checklist with deterministic mutations is what that workflow lacks. Which killer-app proof lands first is an open sequencing question tracked in [risks and open questions](../vision/risks-critiques-open-questions.md); that one must land early is not.

### 4. Ride an existing parser ecosystem

Every successful flavor shipped as an extension to existing infrastructure: GFM as a cmark fork, MDX on micromark/remark/rehype, MyST as a Sphinx parser. The npm numbers make the case bluntly — [markdown-it at ~20M weekly downloads, remark at ~8M with 300+ plugins](https://npm-compare.com/markdown-it,marked,remark,remark-parse,unified). MDX's predecessors (mdxc, markdown-component-loader, markdown-in-js) prove demand preceded the standard; the standard won by consolidating on remark rather than competing with it. Our reference parser is therefore a remark/unified plugin, per the [MVP definition](../planning/mvp-definition.md) — a second-language implementation proves spec independence later, before any 1.0.

### 5. Secure every name before you announce anything

The CommonMark renaming saga is the canonical burn: Gruber, invited in November 2012 and never replying, surfaced after the "Standard Markdown" launch to force [two renames in days under trademark threat](https://mjtsai.com/blog/2014/09/10/markdown-and-commonmark/). Never build on a name you don't control — and never announce before the domain, npm scope, and registry entries are locked. For us this converts directly into pre-announcement actions (see the checklist below) and into the extension decision itself: bare `.mdc` is [occupied by Cursor's rules files and Nuxt's MDC syntax](https://github.com/benallfree/awesome-mdc/blob/main/what-is-mdc.md), and GitHub renders it as nothing at all — so we cede it permanently and use `*.mdc.md` with in-band identity. Full collision analysis in [extension naming conflicts](./extension-naming-conflicts.md).

### 6. An unspecified convention can win — but leaves permanent ambiguity

YAML front matter became universal purely through tool adoption: [Jekyll's triple-dash block](https://jekyllrb.com/docs/front-matter/) was copied by every static site generator, Obsidian, Hugo, and now Cursor, while [CommonMark and GFM remain formally silent on it](https://commonmark.thephpleague.com/2.x/extensions/front-matter/). The win proves conventions can standardize without a committee; the cost — divergent delimiters, per-tool schema chaos, linting gaps — is exactly the gap MDC closes by specifying its frontmatter schema (`mdc:` version key as the format's magic number) and exactly one metadata serialization per item line.

### 7. Demand for plain-text tasks is proven, and so is its ceiling

[todo.txt](http://todotxt.org/) (2006) sustained a multi-platform app ecosystem for twenty years on one-task-per-line with inline metadata — proof of durable demand. But it capped out as an enthusiast format because no GitHub-scale platform rendered it. [Obsidian Tasks' emoji metadata](https://taskforge.md/blog/obsidian-tasks-guide/) is the modern pressure valve: due dates and recurrence bolted onto GFM checkboxes because no standard exists. That unclaimed "task metadata in markdown" niche is the standardizable gap, precisely as front matter was for Jekyll. Incumbent dialects are handled by importers, never as alternative syntaxes — see [prior-art on checklist formats](./prior-art-checklist-formats.md) and the broader [landscape map](./landscape-map.md).

### 8. Don't gate on 1.0; version early and keep the compatibility promise

CommonMark sits at [0.31.2 after 11+ years and has never reached 1.0](https://spec.commonmark.org/) — with zero adoption penalty. Adoption came from platform deployment and the test suite, not a version number. MDC ships v0.1 with the L0 promise stated as a guarantee, and treats 1.0 as a stability commitment earned by a second independent implementation, not a launch requirement.

### 9. Standardize before momentum is spent, and pre-commit the governance handoff

AsciiDoc was defined solely by the Asciidoctor implementation for ~18 years before the [Eclipse working group began a retroactive spec in 2019–2020](https://www.eclipse.org/org/working-groups/asciidoc/charter/) — standardization arriving after the mainstream race was lost. reStructuredText stayed [confined to the Python/Sphinx ecosystem](https://www.dewanahmed.com/markdown-asciidoc-restructuredtext/) by its learning curve. MyST shows the graduation path done right: [Sloan funding, a versioned AST spec, then official Jupyter sub-project status in 2024](https://mystmd.org/guide/background), with real numbers behind it ([~350k monthly parser downloads, 4,000+ public Jupyter Books](https://executablebooks.org/en/latest/blog/2024-05-20-jupyter-book-myst/)). MDC starts BDFL with a public spec repo and writes the graduation criteria down at v0.1.

### 10. Specify behind demand, not ahead of it

AsciiDoc's retroactive spec and Djot's speculative redesign bracket the same failure from opposite ends; the graveyard is full of formats that specified features no user was asking for. This is the constitutional argument for deferring .mddb entirely: reserve the name, define the L1 JSON contract it will consume, and build nothing until .mdc has users — the position detailed in the [mddb concept sketch](../spec/mddb-concept-sketch.md) and [what MDC could unlock](../vision/what-mdc-could-unlock.md).

## Day-one launch checklist

Sequenced by dependency, not by calendar. Everything in the first block precedes any public URL, repo flip, or post — the CommonMark lesson is that naming disputes and squatting consume launches.

**Milestone A — names locked (before anything is public)**

- [ ] Register `text/markdown; variant=mdc` in the IANA Markdown Variants registry (FCFS; neither Cursor nor Nuxt has claimed it)
- [ ] Secure the npm scope (e.g. `@mdcspec/*`) — bare `mddb` on npm belongs to MarkdownDB
- [ ] Secure the project domain
- [ ] Re-verify `.mddb` remains unclaimed in extension registries; confirm `*.mdc.md` renders as markdown on GitHub, GitLab, VS Code, and Obsidian

**Milestone B — the kit exists (before announcement)**

- [ ] Spec v0.1 published as an executable, example-based document, with GitHub/GitLab rendering fixtures proving L0 by construction
- [ ] Reference parser shipped as a remark/unified plugin emitting the canonical L1 JSON item model
- [ ] `mdc` CLI shipped: `fmt`, `lint`, `parse --json`, `status`, `check`/`uncheck`/`cancel`, atomic `claim`, `next --json`
- [ ] Canonical example shipped as living fixtures; cross-implementation test corpus repo public
- [ ] AGENTS.md-style teaching snippet published — the beachhead consumer is an agent whose human reviews the diff

**Milestone C — launch surfaces**

- [ ] Public spec repo with issue discussion open; governance and graduation criteria written down in the repo
- [ ] Compatibility promise stated verbatim in the README: "every MDC document is valid GFM"
- [ ] Early-stakeholder outreach to the tools whose users feel the pain (Obsidian Tasks, todo.txt community, agent-tool vendors) — the Atwood recruitment move
- [ ] One killer-app proof visibly working end-to-end: author, render on GitHub with zero tooling, parse, `claim`, `check`, one-line diff

**Explicitly not gating launch:** a 1.0 version number, a second-language parser, an LSP or MCP server, importers, and all of .mddb — per lessons 8 and 10 and the scope boundaries in the [experiment plan](../planning/experiment-plan.md).

## Related docs

- [Prior art: checklist formats](./prior-art-checklist-formats.md) — the incumbent dialects lessons 2 and 7 refer to
- [Prior art: markdown databases](./prior-art-markdown-databases.md) — the lineage behind the .mddb deferral
- [Extension naming conflicts](./extension-naming-conflicts.md) — the full `.mdc`/`.mdb`/`.mddb` collision record behind lesson 5
- [Landscape map](./landscape-map.md) — where every format above sits today
- [MVP definition](../planning/mvp-definition.md) and [experiment plan](../planning/experiment-plan.md) — how the checklist above becomes work
- [Docs index](../README.md)
