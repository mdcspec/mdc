# Experiment Plan

*The falsifiable hypotheses underneath the MVP, and for each one a cheap experiment with pre-registered success and kill signals — so the go/no-go decisions are made by evidence, not attachment.*

## Method

The [MVP definition](./mvp-definition.md) is a bet, and bets should be stated so they can lose. This plan decomposes the MVP into four load-bearing hypotheses. Each gets: a falsifiable statement, the null we are arguing against, the cheapest experiment that can distinguish them, and explicit signals for both outcomes. Kill signals are written down *now* because the [adoption record](../research/standards-adoption-lessons.md) shows format authors reliably reinterpret disconfirming evidence as "not enough marketing" — two prior markdown-TODO standardization attempts (todomd.org, todo-md) died exactly this way, and we have committed to not being the third by default.

Experiments are sequenced by dependency, not schedule: H4 needs no code, H3 needs only fixtures, H1 and H2 need the CLI. Instrumentation is deliberately boring — spec-repo issues, git history, and diff sizes — because those are artifacts we produce anyway.

## H1 — People want richer checklist semantics

**Hypothesis.** A population exists that hits the ceiling of plain [GFM task lists](https://github.github.com/gfm/) *routinely* — needing stable IDs, dependencies, ownership, and template-vs-run — and will pay the readability tax of the `{#id .tag @assignee key=value}` attribute block to get them.

**The null.** "GFM is good enough" is the ambient force that kills markdown supersets: [Djot](https://github.com/jgm/djot), designed by the most qualified person in the field, stalled on precisely [that verdict](https://news.ycombinator.com/item?id=33867636). The median checklist is five throwaway items in a PR description, and MDC's advantages live entirely in the tail. If the tail population is imaginary, MDC is dialect n+1.

**Experiment.** Ship the canonical example and CLI (per the [MVP definition](./mvp-definition.md)) to a handful of design partners drawn from the two candidate populations named in the [landscape map](../research/landscape-map.md): agent-workflow users with shared task files, and maintainers running recurring release/incident checklists. Then watch what they *write*, not what they say. Because of progressive disclosure, a bare `- [ ] item` is valid MDC — so the telling metric is whether attribute blocks appear in files we did not author.

**Success signals.** Attribute blocks (`needs=`, `.gate`, `@assignee`, `due=`) appear organically in partner files; spec-repo issues request *specific* reserved keys or importer mappings (evidence of real files straining against the closed set); a template gets shared between repos we don't control.

**Kill signals.** Partners keep writing plain checkboxes and never reach for metadata — meaning the format degenerates to GFM and adds nothing; or feature requests concentrate on what we have excluded by [non-goal](../vision/risks-critiques-open-questions.md) (mobile, sync, notifications), meaning we attracted the consumer market we explicitly conceded to Todoist and Apple Reminders. Either way, the "standard" framing dies and only tooling ideas survive.

## H2 — Agents and humans will co-edit checklist files

**Hypothesis.** The beachhead consumer is a coding agent mutating a checklist through the CLI while a human reviews the diff. L2's minimal-diff guarantee (each mutation touches exactly one item line) plus the atomic `claim` primitive make plain git workable as the coordination substrate for this pair — and for multiple agents.

**The null.** The sophisticated market is fleeing markdown for exactly this job: [Taskwarrior moved to SQLite](https://taskwarrior.org/docs/upgrade-3/), [beads](https://github.com/steveyegge/beads) abandoned JSONL-in-git for a SQL store over concurrent-agent merge semantics, and GitHub retired rich tasklist blocks for database-backed sub-issues (see [prior art on markdown databases](../research/prior-art-markdown-databases.md)). If they are right about the whole territory — not just the relational tail we cede to [.mddb](../spec/mddb-concept-sketch.md) — markdown task state really is write-only memory.

**Experiment.** Two instruments. First, dogfooding (below): run this project's own work through MDC files mutated by agents via the CLI, taught by the AGENTS.md-style snippet (the [agents.md](https://agents.md/) distribution pattern). Second, a synthetic concurrency harness: N branches each running the `next → claim → check` cycle against one run file, merged pairwise, measuring diff size per mutation, merge-conflict rate, and claim-collision behavior. This is deliberately the cheapest possible test of the merge-unit design in the [format sketch](../spec/mdc-format-sketch.md).

**Success signals.** An agent completes a full cycle — `parse --json`, `next`, `claim`, `check` — producing one-line diffs a human approves unedited; concurrent mutations to *different* items merge cleanly at or near 100%; `claim` collisions fail atomically rather than double-assigning; the human demonstrably reads the file (comments on it in review) rather than treating it as agent-only exhaust.

**Kill signals.** Agents rewrite whole files despite the teaching snippet (the format is not actually agent-operable at current model behavior); merge corruption on same-item edits is common enough that partners retreat to single-writer discipline, erasing the differentiation from a plain tasks.md; or humans stop reading the files entirely — which concedes the human-legibility premise and means the structured stores win the whole territory, not just the tail. If H2 dies, the honest fallback recorded in [risks](../vision/risks-critiques-open-questions.md) is MDC as a read-only projection surface for other systems' task state, not a co-edited source of truth.

## H3 — Graceful degradation is load-bearing

**Hypothesis.** Zero-tooling rendering on GitHub, GitLab, VS Code, and Obsidian — the L0 guarantee — is a decisive adoption input, not a pleasant default. This hypothesis is what justifies the strictest constraint in the spec: brackets are `[ ]`/`[x]` only, because [`[-]`/`[/]` are not task-list items under GFM](https://github.github.com/gfm/) and lose the checkbox (details in [prior art on checklist formats](../research/prior-art-checklist-formats.md)).

**The null.** Users of a niche format would tolerate a dedicated viewer; degradation is a nicety we are overpaying for with expressiveness (no in-progress bracket state, no rich inline widgets).

**Experiment.** Cheap A/B exposure: publish identical content as `example.mdc.md` (renders as pleasant markdown) and bare `example.mdc` (renders as nothing — GitHub Linguist assigns the extension [no language](https://github.com/github-linguist/linguist), verified in [extension naming conflicts](../research/extension-naming-conflicts.md)), and compare engagement when each is linked in probes. Separately, a comprehension check: show reviewers with zero MDC exposure a run file containing done, open, and cancelled (`~~struck~~`) items, and ask them to state what is outstanding. And instrument our own behavior during dogfooding: how often do we read run files through the GitHub UI versus the CLI?

**Success signals.** Cold readers interpret state correctly without training; partners cite "it's just markdown" unprompted; a meaningful share of file reads happen in dumb renderers.

**Kill signals.** Readers ask "what tool opens this?"; cancelled items are systematically misread as done; or — most interesting — nobody ever reads the files outside the CLI, in which case degradation was not load-bearing, the L0 constraint is negotiable, and pressure like promoting `.doing` to a stored bracket state (an [open question](../vision/risks-critiques-open-questions.md)) gets re-decided on real evidence rather than principle.

## H4 — The extension decision holds up in the field

**Hypothesis.** The canonical naming decision — cede bare `.mdc`, use `*.mdc.md` (the [RFC 7764](https://www.rfc-editor.org/rfc/rfc7764) variant-prefix pattern), carry identity in-band via the `mdc:` frontmatter key — avoids the [Cursor](https://docs.cursor.com/context/rules)/Nuxt collision at acceptable ongoing cost.

**The null.** The collision bites anyway: editors with the Nuxt MDC extension misclassify `*.mdc.md`; developers assume any MDC-branded file configures an AI; search remains unwinnable even with the full "Markdown Checklists" name; or in-band detection fails in practice.

**Experiment.** No code required. Place `release.mdc.md` fixtures in public repos and verify Linguist classification and rendering; open the same files in VS Code with the Nuxt MDC extension installed and record any association hijacking; run the search-collision probe ("mdc checklist", "markdown checklists") before and after the docs site exists; file the [IANA markdown variant](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) registration for `variant=mdc` and record the outcome; pipe files through stdin, gists, and agent context windows to confirm tools can dispatch on the frontmatter key alone — exercising the disambiguation rule documented in [extension naming conflicts](../research/extension-naming-conflicts.md#collision-1-bare-mdc-is-contested--in-exactly-our-niche): Cursor rules files carry `description`/`globs`/`alwaysApply` frontmatter but never an `mdc:` key, so the key by itself separates an MDC document from the closest colliding format.

**Success signals.** Fixtures render everywhere as ordinary markdown; no misclassification; the IANA registration lands (a legitimacy artifact neither Cursor nor Nuxt holds); zero "is this a Cursor rules file?" issues from early users.

**Kill signals.** Recurring Cursor-confusion issues or editor hijacking of the double extension. The extension-level decision is settled and does not reopen; a persistent kill signal here escalates to the *brand* layer — leaning harder on the full name in all public surfaces, or in the worst case renaming the brand before launch, which the [CommonMark renaming saga](https://blog.codinghorror.com/standard-flavored-markdown/) proves is cheap only before the first public artifact.

## Dogfooding: this project runs on MDC

The single-user utility test — [todo.txt](http://todotxt.org/) was worth using for its author alone, and a format that fails that test is a proposal, not a format — is answered by running this very project on its own files:

- **`PLAN.mdc.md` at the repo root**, `kind: list`, holding the project backlog with `needs=` dependencies and `.gate` items (the spec corpus gates the parser; the parser gates the CLI; the CLI gates every announcement).
- **`templates/release.mdc.md`**, instantiated as a `kind: run` file for every CLI release — making the canonical example in the [format sketch](../spec/mdc-format-sketch.md) literally our own release record, kept in the repo as living fixtures.
- **Mutation discipline**: once `check`/`claim` exist, all state changes to project checklists go through the CLI, and hand-edits are treated as bugs to explain. Until then, we hand-edit and log the friction.
- **Friction capture**: every papercut becomes a spec-repo issue labeled `dogfood`. If we — maximally motivated users — route around our own format, that is a kill signal for H1 no external evidence can outweigh.

## Community probes

All public probes wait on the pre-announcement checklist (IANA registration, npm scope, domain) per the [CommonMark lesson](../research/standards-adoption-lessons.md). Sequenced by escalating exposure:

1. **Quiet seeding.** Post the agent-teaching snippet in agent-workflow communities and reply in existing tasks.md-corruption threads with a worked example. Measures H1/H2 resonance with near-zero blast radius.
2. **Spec-repo issues as instrumentation.** Seed genuinely open questions as issues ("Should `.doing` ever become a stored state?", "Which importer mappings must be lossless?") and treat engagement as the metric: first external issue, first external PR, and — the decisive one — a named second implementer. A standard with one implementation is a tool's file format; the second-implementer ask is made explicitly and early.
3. **Show HN, drafted before it is needed.** Working title: *Show HN: Markdown Checklists — checklists agents can edit and humans can review, in plain GFM*. The demo is the whole argument: the canonical example rendering perfectly on GitHub with zero tooling, beside a terminal capture of `claim` and `check` producing one-line diffs. The measured outcome is not points but coded comment intent: the ratio of "just use tasks.md" (H1 disconfirming) to "I need this for my agents" (H2 confirming), plus any unprompted Cursor confusion (H4). The draft lives in the spec repo and ships only after dogfooding has produced at least one complete real release run — we do not demo a hypothetical.

## Decision table

| Hypothesis | Cheapest instrument | If confirmed | If killed |
| --- | --- | --- | --- |
| H1 — richer semantics wanted | Partner files, attribute-block usage | Proceed to v0.1 spec freeze | Reposition as importer/projection tooling; no standard |
| H2 — agent–human co-editing | Dogfooding + concurrency harness | Agent snippet becomes the launch demo | Fall back to read-only projection role |
| H3 — degradation load-bearing | Fixture A/B, cold-reader comprehension | Strict-GFM brackets stay non-negotiable | L0 constraint reopens; richer syntax tradeable |
| H4 — naming decision holds | Public fixtures, editor tests, IANA filing | Announce under current brand | Escalate to brand-layer rename before launch |

The MVP survives only if H1 and H2 both confirm; H3 and H4 calibrate *how* it ships rather than *whether*. What confirmation unlocks is described in [what MDC could unlock](../vision/what-mdc-could-unlock.md); what we are explicitly not testing yet — everything relational — is bounded by the [.mddb stance](../spec/mddb-concept-sketch.md).
