# Dogfood findings — v0.1.0-alpha.1

*An agent (the format's intended primary user) drove MDC through a full multi-agent coordination scenario in a fresh directory: authoring a dependency-laden checklist, querying the graph, racing two agents for a claim, driving items to done, and cutting a run from a template. This records what worked, what was missing, and the resulting [V2 gameplan](v2-cli-ergonomics-gameplan.md).*

## Verdict

The queryable, mutable task graph **is** a real ergonomic win over plain markdown — but the shipped verb set covers *executing a known plan*, not *managing an evolving one*. For agent project management, which is inherently about change and communication, that is the decisive gap.

## What genuinely helped (value prop validated)

- **`next` as dependency-aware "what can I do now."** On a 9-item graph with gates and `needs=` edges, `next` returned exactly the one actionable item and expanded correctly as items were checked. This offloads the dependency reasoning an agent otherwise does by hand every turn — and does inconsistently.
- **Atomic `claim`.** A second agent racing for the same item got a clean `exit 2` refusal. A real mutex over shared work is the single strongest reason to choose MDC over a shared `TODO.md`.
- **One-line-diff mutations.** `check` touched exactly one line (`- [x] … @agent-a done=…`), so parallel agents on branches merge cleanly.
- **L1 model → trivial reporting.** A done/ready/blocked-by-what standup view was ~6 lines of JS over `parse --json`, because `computed.blockedBy` exposes the dependency chain directly. Reliable against the model; impossible against raw markdown.
- **`template → run`.** `cut` produced a clean, lint-passing, version-pinned run. A capability plain markdown lacks.

## Where the wall was (ranked)

1. **No `add`.** The one operation an agent-PM needs most — record discovered work — does not exist. The workaround (hand-append raw markdown → `fmt --assign-ids` → re-read to learn the generated id) violates the "never hand-edit" contract and cedes id choice to the tool.
2. **No in-progress verb.** No `start`/`doing`, yet the format *has* `.doing` and `status` *reports* it. Ownership (`claim`) and active-work are conflated. The model is ahead of the verbs.
3. **No `unclaim`/reassign.** `claim` is one-way; release and handoff force hand-editing.
4. **No note/comment.** The communication use case has no home — `reason=` is cancel-only. MDC is a coordination substrate, not yet a communication medium.
5. **No query/filter.** `next --as <me>`, "what's on @tim's plate," "what did agent-a do" all require hand-rolled JSON crunching.

Minor: no installed `mdc` bin (agents invoke `node …/cli.js`); hand-authored blocks land non-canonical often enough that "always `fmt` after writing" is a de-facto rule.

## Non-findings (checked, not broken)

- The `next --as` "exit 0 on error" I first suspected was `head` masking the real code — `mdc` exits `1` correctly on the unknown flag.
- Frontmatter/prose round-trips untouched through every verb, as designed.

## Conclusion

For executing a defined plan across agents, MDC already beats plain markdown. For managing and communicating around an evolving plan it is ~60% there: the graph is excellent, but an agent repeatedly reaches for `add`, `note`, and `unclaim` and falls back to hand-editing — exactly what the format is designed to prevent. Closing that verb gap is what keeps the primary user inside the tool. The [V2 gameplan](v2-cli-ergonomics-gameplan.md) sequences it, `add` first.

## Round 2 — re-dogfood against the fixed tool

After the V2 verbs and the round-1 fixes shipped, the same two-agent protocol (fresh Claude + Codex, identical harness, this time with the **updated** `AGENTS.md`) was re-run.

**Fixes validated.** Every round-1 convergent finding was gone from both critiques, with explicit confirmation: mutations echo their line ("as promised"), `check` auto-clears `.doing`, `status`/`report` no longer disagree, and both agents *used* `add --after`/`--section` to place follow-ups correctly ("`--after` solved document placement"). Both drove clean, canonical, coordinated boards from the snippet alone. The re-run confirmed the fixes under an independent, non-Claude tool.

**New convergent finding — no way to edit an existing item.** With the round-1 friction cleared, both agents independently hit the *next* layer and named it their single biggest gap and only genuine hand-edit temptation: there was no verb to amend an existing item's `needs=`/text. It even caused a correctness failure — an item that could not get its `needs=` recorded showed as "Ready" in `next`/`report` while a note beneath it said it was blocked, i.e. the tool's own authoritative view contradicted reality. Resolved by the **`edit` verb** (MUT-8a): `edit <id> --add-needs/--rm-needs/--needs/--text/--add-class/--rm-class/--due`, one canonical-line rewrite, echoing the result. Also fixed the self-introduced `add`-echo inconsistency (both agents caught `add` printing only `#id` against the "every mutation echoes its line" promise) — `add` now echoes its line too.

**Still deliberately open** (design decisions, not omissions): mutation verbs (`check`/`start`) don't enforce ownership — "claim before you work" stays advisory, and gates/`needs` shape `next` without stopping an out-of-order `check`. Both are documented in `AGENTS.md` as the intended (mechanical, graph-advisory) model.
