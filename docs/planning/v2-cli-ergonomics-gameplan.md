# V2 gameplan — CLI ergonomics for the agent-PM workflow

*Follow-up plan after dogfooding v0.1.0-alpha.1 as its intended primary user (an agent coordinating a multi-agent build). Companion to the [findings](dogfood-findings.md). This plan sequences work; it sets no timelines.*

## Why this exists

Dogfooding validated the core hypothesis — a queryable, mutable task graph **is** better than plain markdown for agent coordination — but only for *executing a known plan*. `next` (dependency-aware "what can I do now"), atomic `claim` (a real mutex over shared work), one-line-diff mutations (clean parallel merges), and `template → run` all earn their place.

The wall is *managing an evolving plan*. The moment work is discovered, reassigned, marked in-progress, or discussed, the CLI has no verb and the agent falls back to hand-editing — which breaks canonical form and violates the format's own "never hand-edit state" contract. For project management — inherently about change and communication — that is the gap that matters.

The key insight shaping this plan: **the data model is already ahead of the verbs.** `.doing`/`.waiting` classes and arbitrary `x-` keys already parse, round-trip, and (for `.doing`) surface in `status`. The fix is not format redesign; it is a small set of L2 verbs that expose transitions the model already represents.

## Design principles (unchanged from v0.1)

Every new verb MUST hold the invariants that make the existing ones trustworthy:

1. **Exit-code law is the API.** `0` success · `1` usage/IO/parse/not-MDC · `2` domain refusal. Agents branch on `2`.
2. **One-line diff.** A mutation regenerates exactly the affected line(s) in canonical form; every other byte is copied through. `add` adds exactly one line; `note` rewrites exactly the target line.
3. **Canonical by construction.** New/edited lines are serialized from the model, never hand-spliced, so `fmt` is always a no-op afterward.
4. **Atomic under the lock.** Reuse `withFileLock` + `atomicReplace`; check-and-set preconditions inside the lock.
5. **Address by id, never by line or text.**
6. **The corpus is the spec.** Every new behavior needs a `mutate/` (or new-category) fixture before it is normative.

## The verb set

Ordered by leverage. `add` is first because it unblocks the others (you cannot reassign, annotate, or start a task the CLI could not create).

**Status: the V2 verb set is complete.** `add`, `start`/`unstart`, `unclaim`, `note`, and the read filters (`next --as`, `report`) have all shipped (spec MUT-6/MUT-7/MUT-8, `add/`/`note/` corpus categories, tests).

`note` (MUT-8) shipped as the **nested prose bullet** encoding (`  - note @who date: msg`), chosen for the merge story. Two honest findings from building it:
- **The clean-merge claim needed correcting.** Notes on *different* items never conflict, and each note is line-granular in diffs/blame — but two agents noting the *same* item both append at the same anchor, so git *does* conflict there. The conflict resolves trivially (keep both lines), and it is strictly better than a single-line log (intra-line contention on every note) — but it is not conflict-free. The spec (MUT-8) and code comments state this accurately.
- **Notes are write-but-not-model-queried by design.** Per the chosen encoding, a note is prose (ITEM-5) — invisible to the L1 model, so `parse`/`report` do not surface it; agents read notes in-file (they render right under the item). Structured note queries are a deliberate `.mddb` concern. If in-file reading proves insufficient for agent-to-agent consumption, a read-only note-surfacing pass (attaching notes to items in `parse --json` without changing derived semantics) is the follow-up — but it is a model change and gets its own decision.

### 1. `add` — create a discovered item  *(building now)*

```
mdc add <file> "<text>" [--id <slug>] [--needs <a,b>] [--as <handle>] [--due <date>] [--class <c,d>]
```

- Appends a new **open** item to the document body, serialized canonically. Prints the resulting id (`#<id>`) to stdout so the agent can immediately `claim`/`check`/`note` it.
- `--id` sets the id explicitly (refuse **exit 2** on collision with an existing id); omitted, the id is generated from the text via the same slugify used by `fmt --assign-ids`, with `-2`, `-3`… collision suffixing.
- `--needs` is permissive: dangling targets are lint's job, not `add`'s (the target may be added next). Cross-file `path#id` targets are allowed (they lint as `unresolved-cross-file-ref`, per OQ #3).
- Placement is **end-of-document** in this first cut. Section/relative placement (`--section <heading>`, `--after <id>`) is the immediate follow-up (see Deferred).
- Exit: `0`; `1` empty text / bad `--id` slug / bad `--due` / not-MDC; `2` id collision.

*Open decision (resolve during build):* whether an id-less `add` (no `--id`, text too short to slug) is allowed to produce an id-less item, or always mints one. Leaning: always mint, because a discovered item is almost always referenced later.

### 2. `start` / `unstart` — in-progress signal

```
mdc start   <file> <id>      # add the .doing class
mdc unstart <file> <id>      # remove it
```

- Sets/clears the reserved `.doing` class — which the model already defines (STATE-6) and `status` already reports — so "actively working" is distinguishable from "owned but not started" (`claim` alone). No state change; `.doing` never affects `actionable`.
- Precondition for `start`: state is `open` (refuse **2** on a terminal item — you cannot start what is done/cancelled). `unstart` is idempotent-safe (removing an absent class is a no-op success, or refuse 2 — resolve during build).
- Natural sibling: a `.waiting` pair (`block`/`unblock`?) — deferred until demand; `.doing` is the one dogfooding actually reached for.

### 3. `unclaim` — release / hand off ownership

```
mdc unclaim <file> <id>              # clear the assignee
mdc claim   <file> <id> --as <h> --force   # reassign in one step (optional)
```

- `claim` today is one-way; long-running coordination needs release (an agent gives up) and handoff (reassignment). `unclaim` clears `@assignee`.
- Precondition: an assignee is set (refuse **2** if already unassigned). Whether `unclaim` should require `--as <current>` to prevent an agent releasing *another* agent's claim is an **open decision** — a claim-stealing guard matters for honest multi-agent use. Leaning: `unclaim` takes optional `--from <handle>` and refuses **2** if it does not match the current owner.
- `--force` on `claim` (reassign despite an existing owner) is optional and gated behind the same ownership question.

### 4. `note` — durable annotation (the communication seam)

```
mdc note <file> <id> "<message>" [--as <handle>]
```

- Appends a structured, timestamped entry to an item — turning MDC from a coordination *substrate* into a communication *medium*, the use case the format is being evaluated for. Today the only annotation is `reason=` (cancel-only).
- **Design is the crux and is deliberately unresolved here** because it touches the format's anti-metastasis constitution (OQ #7). Candidate encodings, cheapest first:
  - `x-note="…"` single value — trivially in-grammar, but one-slot (a second note overwrites); not a log.
  - `x-log="2026-08-16 @tim: …; 2026-08-16 @ana: …"` — a delimited log in one value; in-grammar, but delimiter-fragile and unbounded line growth.
  - A sibling nested item or blockquote under the item — richer, human-legible, but expands what a "mutation" touches beyond one line and complicates the model.
  - A companion `.mdc.log`/sidecar or `.mddb` row — keeps `.mdc` clean, but the note is no longer in the diffable file.
  - This decision gets its own mini-design pass and an open-questions entry before implementation. It is the highest-value and highest-risk verb; do not ship it by reflex.

### 5. Read ergonomics — filter and report

```
mdc next   <file> --as <handle>      # actionable items for one agent
mdc report <file> [--json]           # standup view: done / in-progress / ready / blocked-by-what
```

- `next --as <handle>` filters the actionable set to a single assignee (and unassigned) — "what should *I* do next" without every agent re-implementing a JSON filter.
- `report` promotes the ~6-line `parse --json` crunch every agent currently rewrites (done-by-whom, ready, blocked-with-cause) into a primitive. Pure read over the existing L1 model; no new file bytes, so it is low-risk and can land independently of the mutation verbs.

## Sequencing

`add` → (`start`/`unclaim` in parallel — independent, both trivial state toggles) → `report`/`next --as` (independent read work, can land any time) → `note` (last: needs its own design pass). Nothing here depends on the deferred open questions except `note`, which spawns a new one.

## Deferred (named, not silently dropped)

- ~~**Placement flags** for `add` (`--section`, `--after <id>`)~~ — **shipped** after both fresh-dogfood agents hit the append-past-a-gate hazard (MUT-6, `add/after-sibling`, `add/into-section`).
- **`.waiting` verbs**, `--force` reassignment semantics — gated on the ownership-guard decision.
- **Bulk / scripted ops** (`check a,b,c`) — no dogfood signal yet; agents loop fine.
- **Installed `mdc` bin** — an ergonomics paper cut (agents invoke `node …/cli.js`); a packaging task, tracked with the M0 npm-scope work, not here.
- **`edit`/`retext`** an item's text — hand-editing text is lower-stakes than state; revisit if it recurs.

## Spec and corpus impact

Each shipped verb adds: a row to the MUT-1 table (spec §10), a `mutate/` corpus case (or a new `add/` category with its own C-rule), an entry in the CLI `USAGE` block and `AGENTS.md`/agent-snippet, and — for `note` — a new open-questions register entry recording the encoding decision. No change to detection, grammar, or derived semantics is anticipated; these verbs move existing model state, they do not extend the model.
