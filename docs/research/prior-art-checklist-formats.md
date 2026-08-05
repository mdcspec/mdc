# Prior Art: Checklist and Task Syntaxes

*A survey of every significant plain-text checklist/task format — syntax, semantics, tooling, adoption — and the gap analysis showing what none of them can express, which is the opening for MDC (Markdown Checklists).*

Research snapshot: 2026-07-26

The landscape divides into four syntax families — markdown-native checkboxes, markdown-adjacent tool conventions, non-markdown plain-text formats, and database-backed task systems — preceded here by Family 0: the checklist-effectiveness literature that defines what any of them would need to encode. Each syntax family hits the same ceiling from a different direction, and the pattern of *where* they stop is the most useful design input we have. Companion surveys: [markdown-as-database prior art](./prior-art-markdown-databases.md), [extension and naming conflicts](./extension-naming-conflicts.md), [standards adoption lessons](./standards-adoption-lessons.md), and the consolidated [landscape map](./landscape-map.md).

## Family 0: What checklist science demands of a format

Before any syntax, there is the literature on why checklists work — the one body of prior art here that is not a file format, and the one the [format sketch](../spec/mdc-format-sketch.md) encodes most directly.

**The effect is real.** [Haynes et al. 2009 (NEJM)](https://www.nejm.org/doi/full/10.1056/NEJMsa0810119) piloted the 19-item WHO Surgical Safety Checklist in eight hospitals worldwide: deaths fell from 1.5% to 0.8% and inpatient complications from 11.0% to 7.0% — both cut by more than a third. The instrument's structure is not incidental to the effect: items are grouped at three fixed pause phases (before anesthesia induction, before skin incision, before the patient leaves the operating room) where the team stops and confirms aloud.

**The effect is not in the paper.** [Urbach et al. 2014 (NEJM)](https://www.nejm.org/doi/full/10.1056/NEJMsa1308261) studied Ontario hospitals after surgical safety checklists were mandated province-wide and found no significant reduction in operative mortality or complications. Same instrument class, no ceremony, no effect. The Haynes/Urbach pair is the field's central caution: a checklist that is merely *filled in* is theater, and box-ticking is the failure mode any checklist format must at least refuse to encourage.

**Checklists are engineered, iterated artifacts.** Gawande's [*Checklist Manifesto*](http://atulgawande.com/book/the-checklist-manifesto/) synthesis — drawing on Boeing's flight-test checklist practice — insists that no checklist is right the first time: it is drafted, trialed against real runs, revised, and kept deliberately short, restricted to the killer items most dangerous to skip.

**The design parameters are specified.** [Degani & Wiener's flight-deck checklist studies (NASA Contractor Report 177549, 1990)](https://ntrs.nasa.gov/citations/19910017830) formalized the two disciplines of checklist execution — running the list as a *do-list* (read an item, then do it) versus *challenge–response* verification of work already performed from memory — the distinction Gawande popularized as **read-do** vs. **do-confirm**. Their supporting parameters: short chunks of items between natural breakpoints in the workflow, unambiguous item wording, and defined points where confirmation actually happens.

None of the four syntax families below encodes any of this (see the [gap table](#gap-analysis-what-none-of-them-can-express)). MDC maps each finding to a specific format feature:

| Finding | Format feature it motivates |
|---|---|
| Read-do and do-confirm are different procedures, not styles (Degani & Wiener) | The `mode: read-do \| do-confirm` frontmatter key — a run declares its execution discipline |
| Confirmation happens at defined stopping points (Degani & Wiener; the WHO checklist's three pause phases in Haynes) | The pause-point convention: a blockquote beginning `**Pause point**`, rendering as an ordinary quote in every dumb renderer |
| Checklists must stay short and chunked between breakpoints (Gawande; Degani & Wiener) | Lintable item budgets — items-per-section and pause-point spacing are countable by `mdc lint` (science-linter rules beyond structural lint are [post-MVP](../planning/mvp-definition.md)) |
| Mandated box-ticking produces nothing (Urbach) | Machine-readable `reason=` on cancellation: the honest alternative to falsely checking an inapplicable item — the anti-box-ticking affordance |
| No checklist survives contact unrevised (Gawande) | Template-vs-run with versioned `template: path@version` references, so revision is a diff against the template; the skip-rate evidence feeding it is the [.mddb analytics charter](../spec/mddb-concept-sketch.md) |

The claim stays deliberately modest, per [risks and open questions](../vision/risks-critiques-open-questions.md): syntax cannot compel the ceremony Urbach shows is load-bearing. MDC claims only that it stops *erasing* the parameters — mode, pauses, honest states with reasons — that every format below flattens to a bare checkbox.

## Family 1: Markdown-native checkboxes

**GFM task list items** are the baseline everything else must degrade to. They are a formal *extension* in [section 5.3 of the GFM spec](https://github.github.com/gfm/) — not CommonMark core — defining exactly two states: a task list item marker is `[`, then either whitespace or `x`/`X`, then `]`. The spec's exact rule: "If the character between the brackets is a whitespace character, the checkbox is unchecked. Otherwise, the checkbox is checked." That "otherwise" is the loophole the entire Obsidian multi-state ecosystem exploits — and it is also why, on a strict reading, `[-]` or `[/]` items are not task list items at all and lose the checkbox on GitHub.

GitHub layers platform behavior on top of the syntax — clickable checkboxes, completion ratios in issue lists, [convert-task-to-issue and drag reordering](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-task-lists) — but none of it is expressed *in* the markdown. More telling: GitHub's richer proprietary ` ```[tasklist] ` fenced blocks were [retired on April 30, 2025](https://github.blog/changelog/2025-02-18-github-issues-projects-february-18th-update/) in favor of database-backed sub-issues. The largest markdown platform on earth tried rich task semantics inside markdown and moved them out to a structured backend. That retirement marks the boundary MDC's [.mddb graduation story](./prior-art-markdown-databases.md) is built around.

**GitLab Flavored Markdown** is the only major forge that extended the state set: [`[~]` marks an item "inapplicable"](https://docs.gitlab.com/user/markdown/) (GitLab 15.3+), rendering disabled and struck-through and excluded from task totals. It is the sole precedent for "cancelled is not done" semantics on a mainstream renderer — and it is forge-specific: GitHub renders `[~]` as no checkbox at all.

## Family 2: Markdown-adjacent tool conventions

**Obsidian Tasks** (~3.7M downloads, ~3.9k stars per [Obsidian Stats](https://www.obsidianstats.com/plugins/obsidian-tasks-plugin)) is the richest markdown-embedded task metadata anywhere: [emoji signifiers](https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format) appended to a standard `- [ ]` item encode five priority levels, six date types (created, scheduled, start, due, done, cancelled), completion-anchored recurrence ("every week when done"), and even dependencies via `🆔` task IDs and `⛔` blocked-by lists. Because everything rides on a plain GFM item, files still render as checkboxes everywhere — the graceful-degradation pattern MDC adopts. But it is an unversioned plugin convention with *two mutually exclusive serializations*: a settings toggle switches the same vault between the emoji dialect and **Dataview**'s [`[key:: value]` inline fields](https://blacksmithgu.github.io/obsidian-dataview/annotation/metadata-tasks/). Dataview itself — an indexer exposing implicit computed fields and a SQL-like query language over a vault — is the strongest existing prior art for the .mddb concept and is treated at length in the [markdown-databases survey](./prior-art-markdown-databases.md).

**The Obsidian theme ecosystem** built a de facto multi-state vocabulary on the GFM loophole: [Minimal, ITS, and Things themes](https://github.com/SlRvb/Obsidian--ITS-Theme/blob/main/Guide/Alternate-Checkboxes.md) style `[/]` in-progress, `[-]` cancelled, `[>]` forwarded, `[?]` question, `[!]` important, and more. It is convention-only, contradictory across ecosystems (`[-]` means *cancelled* in Obsidian but *partially checked* in org-mode; `[~]` means *inapplicable* in GitLab but *obsolete* in [x]it!), and every one of these characters silently degrades to "checked" — or to no checkbox — in strict GFM renderers.

**Logseq** transplants org-mode semantics into `.md` files: `TODO`/`DOING`/`DONE` keyword states, `[#A]` priorities, `SCHEDULED: <2024-04-28 Sun .+7d>` lines with org repeaters, and `:LOGBOOK:` drawers recording state transitions. Powerful, but nonstandard markdown that renders as literal noise elsewhere, with [documented recurrence edge-case bugs](https://discuss.logseq.com/t/how-do-recurring-scheduled-tasks-work/20879).

**TODO.md kanban conventions**: at least three competing pseudo-standards ([todomd/todo.md](https://github.com/todomd/todo.md), Hypercubed's todo-md, yigitlevent's) map sections to kanban columns with `@USERNAME` assignees and `#TAG` tags. None shipped a test suite or reference parser; none achieved network effects. This is the documented fate MDC's [MVP definition](../planning/mvp-definition.md) is engineered to avoid.

## Family 3: Non-markdown plain-text formats

**Org-mode** has the deepest native model: three checkbox states including auto-derived partial `[-]`, [statistics cookies](https://orgmode.org/manual/Checkboxes.html) `[2/4]`/`[50%]` that roll up from children, an `ORDERED` property enforcing sequential completion, and [user-definable multi-state workflows](https://orgmode.org/manual/TODO-Extensions.html) (`#+TODO: TODO FEEDBACK | DONE`). It proves rollups, blocking, and state machines are expressible in plain text — and it is ecosystem-locked to Emacs. Note the cookie lesson: org *stores* computed rollups in the file, a merge-conflict generator MDC avoids by making all derived state computed-only.

**todo.txt** ([Gina Trapani, 2006](https://github.com/todotxt/todo.txt/blob/master/README.md)) is the longest-lived line format: `x ` completion prefix, `(A)` priorities, creation/completion dates, `+project`/`@context` tokens, extensible `key:value` pairs. Deliberately minimal — no hierarchy, no states beyond open/done, no spec'd recurrence or assignees (apps bolt on `rec:` non-standardly). Its two-decade [multi-platform ecosystem](http://todotxt.org/) proves that grep-and-sort-friendly line formats endure.

**[x]it!** is the most spec-disciplined modern attempt: a [CC0 v1.1 specification](https://github.com/jotaen/xit/blob/main/Specification.md) with five fixed states (`[ ]`, `[x]`, `[@]` ongoing, `[~]` obsolete, `[?]` in question), `!` priorities, `-> 2025-W03` due dates with week/quarter granularity, and `#tag=value`. It explicitly excludes assignees, recurrence, and dependencies. At ~1.1k stars with community editor plugins, it demonstrates that a small RFC-style spec attracts tooling — and that a new extension (`.xit`) without a rendering story stays niche.

**TaskPaper** reduces the grammar to [four constructs](https://github.com/saf-dmitry/taskpaper-mode/blob/master/README.md) — `project:` lines, `- task` lines, notes, `@tag(value)` — and pushes *all* semantics into tag conventions like `@done(2018-05-11)`. Maximum flexibility, zero guaranteed interop of meaning across the apps that read it.

**Neorg's .norg** spec reserves an extended status set (`(x)` done, `(-)` pending, `(?)` clarification, `(!)` urgent) — one more datapoint that "more states than done/not-done" is a perennial community demand that markdown itself never absorbed.

## Family 4: Database-backed task systems

**Taskwarrior** models the richest semantics of any open tool — status enum, projects, priorities, due/wait/until/scheduled dates, recurrence templates, UUID dependencies, user-defined attributes — and [abandoned its plain-text data files for SQLite in v3.0](https://taskwarrior.org/news/news.20240324/) (2024), trading rsync/Syncthing compatibility and hand-editability for reliability and sync. **iCalendar VTODO** ([RFC 5545](https://icalendar.org/iCalendar-RFC-5545/3-6-2-to-do-component.html), with [RFC 9253](https://www.rfc-editor.org/rfc/rfc9253.html) typed relationships) remains the only true open *standard* for task semantics — status, due, priority, percent-complete, RRULE recurrence, attendees — and the ecosystem abandoned it anyway, because it is machine-format, not hand-authored culture. Both stories bound the design space: rich relational task state eventually leaves plain text, which is why MDC [defers relational features to .mddb](./prior-art-markdown-databases.md) rather than growing syntax, and why the [standards-adoption survey](./standards-adoption-lessons.md) treats VTODO as a death pattern, not a model.

## Feature ceiling across the field

| Capability | GFM | GLFM | Obsidian Tasks | Dataview | Logseq | org-mode | todo.txt | [x]it! | TaskPaper | Taskwarrior | VTODO |
|---|---|---|---|---|---|---|---|---|---|---|---|
| States beyond open/done | — | `[~]` | emoji dates | via fields | keywords | `[-]`, custom | — | 5 states | tag conv. | enum | 4 values |
| Priorities | — | — | 5 levels | fields | `[#A]` | `[#A]` | `(A)-(Z)` | `!` marks | tag conv. | yes | 0–9 |
| Due/scheduled dates | — | — | 6 date types | fields | SCHEDULED | timestamps | `due:` conv. | `-> date` | tag conv. | yes | DUE |
| Recurrence | — | — | yes (anchored) | — | repeaters | repeaters | `rec:` conv. | — | — | templates | RRULE |
| Dependencies | — | — | id/blocked-by | — | — | ORDERED | — | — | — | UUID deps | RFC 9253 |
| Assignees | — | — | — | fields | — | — | — | — | tag conv. | — | ATTENDEE |
| Stable item IDs | — | — | opt-in emoji | — | block refs | — | — | — | — | UUIDs | UID |
| Rollups/progress | platform | platform | queries | queries | yes | cookies (stored) | — | — | — | — | PERCENT |
| Renders on GitHub today | native | native | degrades OK | degrades OK | noise | n/a | n/a | n/a | n/a | n/a | n/a |
| Versioned spec + tests | spec, no tests | spec | no | no | no | manual | README | spec | no | docs | RFC |

("conv." = unspecified app convention; "platform" = behavior on the host site, not in the file.)

## Gap analysis: what none of them can express

The decisive table is not what each format has — it is what **no** format in the field has. Every row below is unserved by every column above:

| Unexpressed capability | Closest near-miss and why it falls short |
|---|---|
| **Template vs. run distinction** — a reusable procedural checklist with per-run instances | Nothing, anywhere in plain text. Only process SaaS (Process Street's workflow/workflow-run model) has it; no file format does. The single clearest opening for MDC — see the [format sketch](../spec/mdc-format-sketch.md). |
| **A defined degradation contract** — spec'd guarantees about rendering in tools that don't know the format | Obsidian Tasks degrades *well by accident*; no format states, tests, or versions what a dumb GFM renderer must show. |
| **One interoperable metadata layer** | Four incumbent serializations (trailing `key:value`, `@tag(value)`, emoji signifiers, `[key:: value]`) — every tool pair mutually unintelligible; files written for one degrade to noise in another. |
| **Deterministic mutation semantics** — "check item X" as a spec'd, minimal-diff, merge-safe edit | No format defines mutations at all; tools rewrite lines ad hoc. Prerequisite for git-merge tractability and multi-agent concurrent writes. |
| **Concurrency primitives** — atomic claim/assignment for parallel actors | Taskwarrior has locking via SQLite; no *text* format has any answer. |
| **Human-scale stable IDs in markdown** | Only Taskwarrior/VTODO have stable IDs — UUIDs, in non-markdown systems. Obsidian Tasks' `🆔` is opt-in plugin convention. |
| **Unambiguous recurrence anchoring** — completion-anchored vs. schedule-anchored, mandatory | Every implementation defines it differently (org `++`/`.+`, Tasks "when done", RRULE); the subtlest bug-generator in the whole field. |
| **Cancelled-with-reason as machine-readable state** | GLFM `[~]` is display-only; nothing captures *why* an item was skipped — the anti-box-ticking affordance the checklist-effectiveness literature ([Urbach 2014](https://pubmed.ncbi.nlm.nih.gov/24620866/), [Family 0](#family-0-what-checklist-science-demands-of-a-format)) directly motivates. |
| **Checklist-science metadata** — read-do vs. do-confirm mode, pause points, lintable item budgets | Zero formats encode any of the Gawande/Degani-Wiener design parameters surveyed in [Family 0](#family-0-what-checklist-science-demands-of-a-format). |
| **Versioned spec + executable conformance corpus + reference parser** | [x]it! has the spec but no corpus; GFM has the spec but tests only its own parser; everything else is a README. The [adoption-lessons doc](./standards-adoption-lessons.md) argues this, not syntax, is what decides survival. |

## Implications for MDC

Three conclusions drive the [format sketch](../spec/mdc-format-sketch.md) and [MVP](../planning/mvp-definition.md). First, the floor is non-negotiable: strict GFM `[ ]`/`[x]` only, because every multi-state bracket experiment breaks the one renderer that matters and the contradictory `[-]`/`[~]` meanings prove the vocabulary can never be reconciled. Second, the differentiators are exactly the gap rows: template-vs-run, deterministic mutation, stable IDs, anchored recurrence, and a single attribute serialization with importers for the four incumbent dialects — not more states, more emoji, or more spec surface. Third, the ceiling is real: GitHub's tasklist retirement and Taskwarrior's SQLite flight show where in-text semantics die, so relational demands graduate to the derived layer rather than growing syntax — the thesis of [what MDC could unlock](../vision/what-mdc-could-unlock.md) and the boundary examined in [risks and open questions](../vision/risks-critiques-open-questions.md).
