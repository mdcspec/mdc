# M7 — Launch Sequencing

*The plan for MDC's public launch: which story leads, what must ship before going loud, the launch surfaces, and the pre-registered signals that tell us it worked or failed. Resolves [open question #8](../vision/risks-critiques-open-questions.md) (killer-app sequencing) and the `m7-sequencing` gate in [`../../checklists/mvp-build.mdc.md`](../../checklists/mvp-build.mdc.md). Sequencing and gates only — no dates.*

## Premise: the format is ready; this is about distribution

Everything that makes MDC credible is done: M0 complete (IANA `mdc` registered, namespace secured, repo public), spec v0.1 with an executable corpus, **three conforming implementations** (JS / Python / Crystal), a hardened MCP server, and a one-click `getting-started` repo. The remaining risk is not technical — it is the one the research names repeatedly: *specs follow platforms; a spec announced without a pulling platform is a museum piece.* So the launch is a **distribution event, not a spec announcement.**

## The decision: lead with the agent shared-task-file (OQ #8)

Two candidate lead stories were open:

1. **The agent/human shared task file** — agents `claim`/`check`/`add`/`note` through the CLI and the MCP server; a human reviews ordinary diffs.
2. **The merge-gated OSS release checklist** — a GitHub Action that gates merges on a run document's state.

**Lead with #1.** It is the right call on every axis:

- **It is the validated beachhead.** Hypothesis H2 (a coding agent mutating a checklist while a human reviews the diff) is the one with real evidence: three independent dogfood rounds, and **two different agent tools — Claude and OpenAI Codex — drove the format correctly from the `AGENTS.md` snippet alone, with no coordination.** That is a concrete, honest launch proof, not a promise.
- **It is ready now.** The CLI, the agent snippet, the 16-tool MCP server, and `getting-started` all exist. Story #2 requires a **CI merge-gate Action that is deliberately unbuilt** (an MVP non-goal) — leading with it means building the platform before launching, inverting the whole point.
- **It rides the strongest wave.** MCP and `AGENTS.md` are the agent-tooling distribution substrates right now; MDC's MCP server drops straight into them. The research ranks the MCP server as the single highest-leverage adoption anchor.

Story #2 (the release-gate Action) becomes the **first fast-follow**, not the lead — pursued if and when launch signals show demand for the procedural-checklist use case.

## Pre-launch gates (must precede going loud)

Ordered; each gates the next. The loud launch does **not** happen until all are green.

1. **Confirm the license** *(owner decision).* Recommendation stands: MIT (code + corpus) + CC BY 4.0 (spec). Permissive is what lets agent frameworks, editors, and commercial tools embed MDC and vendor the corpus — GPL would fight the launch. No change needed if confirmed.
2. **Publish to npm** *(owner greenlight — irreversible-ish).* Flip `@mdcspec/mdc` and `@mdcspec/mdc-mcp` off `private` and publish. This is the single highest-leverage pre-launch act: it turns the `getting-started` "clone the repo" step into `npx @mdcspec/mdc`, and turns the MCP server into a one-line host config. Without it, the 60-second path has friction that will cost adoption at exactly the moment attention peaks.
3. **Ship MCP install docs.** A copy-paste `mcpServers` config block for the common hosts (Claude Code/Desktop, Cursor, Windsurf) pointing at `npx -y @mdcspec/mdc-mcp`. Lives in the MCP package README and the `getting-started` repo.
4. **Update `getting-started` to the published path.** Replace the clone+alias instructions with `npx @mdcspec/mdc` and the MCP config, so the tour is genuinely one step. (It already works via clone today; this removes the friction.)
5. **Prepare the launch artifact.** A short, honest write-up with the lead demo at its center: *two independent AI agents coordinated on one shared checklist, through plain git, from a snippet — here's the file, here's the diff trail.* Links to `getting-started`, the spec, and the three-implementations conformance story. No overclaiming (heed the risk register: no surgical-checklist-science theater, no "replace your task app").

## The launch (going loud)

Lead everywhere with the **agent-coordination demo**, not the spec. Surfaces, roughly in order of fit:

- **The MCP ecosystem** — submit `@mdcspec/mdc-mcp` to the official MCP registry / server directories. This is where the beachhead audience already is.
- **The `AGENTS.md` ecosystem** — list MDC in the `AGENTS.md` / `awesome-agents`-style directories as a task-coordination tool; the snippet is already drop-in.
- **Developer communities** — a Show HN and posts in agent-tooling / coding-agent communities, centered on the two-agent demo and the "it's just Markdown that your agents can edit safely" hook.
- **The project surfaces** — the live site (`mdcspec.dev`), the main `README`, and `getting-started` are the landing targets every announcement points to.

## Instrumentation: pre-registered success and kill signals

Written down now so the go/no-go after launch is made on evidence, not attachment (the [experiment plan](experiment-plan.md) is the source; this is the launch-time subset). The format's safety net is that **every artifact has standalone value** — it fails cheap.

**Success (the bet is live):**
- Agents complete full `next → claim → check` cycles producing one-line diffs humans approve unedited; concurrent edits to different items merge cleanly; `claim` collisions fail atomically.
- Attribute blocks (`needs=`, `.gate`, `@assignee`) appear *organically* in files in repos we don't control; issues request *specific* reserved keys or importer mappings (real files straining the closed set).
- Someone starts a **third-party implementation** (the governance-graduation trigger), or an agent framework ships MDC as a task format.
- Humans demonstrably *read* the files (review comments on them), confirming the human-legibility premise.

**Kill (fail cheap, keep the tooling):**
- Agents rewrite whole files despite the snippet (not actually agent-operable at current model behavior), or same-item merge corruption pushes partners back to single-writer discipline — erasing the differentiation from a plain `tasks.md`.
- Adopters never reach for the metadata (the format degenerates to GFM and adds nothing), or feature requests concentrate on the conceded consumer-task-app territory (mobile/sync/notifications).
- Nobody reads the files outside the CLI — conceding the human-legibility premise; the honest fallback (per the risk register) is MDC as a read-only projection surface, not a co-edited source of truth.

## Fast-follows (gated on launch signal, not scheduled)

- **The CI merge-gate Action** — story #2; build it if the procedural-checklist / release-gate demand shows.
- **Importers** (Obsidian Tasks, todo.txt) — once the import-fidelity question is worth answering for a real migration.
- **Editor / renderer surfaces** — a VS Code preview; a GitHub Linguist entry *after* in-the-wild files justify it.
- **`verify=` execution** (OQ #9) — stays declarative-only until sandboxing/trust are answered.

## What explicitly stays deferred

The `.mddb` relational layer, consumer task-app features, and anything on the MVP non-goals list. The launch does not expand scope; it tests the narrow bet.
