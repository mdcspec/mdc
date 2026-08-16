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
