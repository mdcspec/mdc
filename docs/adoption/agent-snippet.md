# Working with MDC checklists (drop-in agent instructions)

*Copy this into your repo's `AGENTS.md` (or equivalent) to teach a coding agent to read and drive MDC checklist files. It is written to be pasted verbatim.*

---

## MDC checklists

Some task/checklist files in this repo are **MDC** documents: ordinary GitHub-flavored markdown that also carries machine-readable task state. A file is MDC **iff** its YAML frontmatter contains an `mdc:` key — the filename does not matter. Detect it by reading the first frontmatter block; if you see `mdc: "0.1"`, treat it as MDC.

### Reading one

- Items are task lines: `- [ ] open`, `- [x] done`, `- [x] ~~cancelled~~`.
- An optional trailing brace block holds metadata: `{#id .class @assignee key=value}`. Useful keys: `needs=a,b` (dependencies), `due=YYYY-MM-DD`, `done=YYYY-MM-DD`, `reason="…"`. Classes `.gate` (blocks later items until done) and `.optional` (never blocks) shape ordering.
- An item is **actionable** when it is open, its `needs=` are all done/cancelled, and no earlier `.gate` is still open. Do not infer this by eye — ask the CLI.

### Driving it with the `mdc` CLI

Exit codes are the contract: **`0` success · `1` error/not-MDC · `2` refusal** (precondition failed — e.g. the item is already claimed or already done). Always branch on `2`; it means "not yours / not now," not "crash."

```
mdc next  <file> --json            # actionable item ids, in order — pick from here
mdc next  <file> --as <you>        # …just the ones you can act on (yours + unclaimed)
mdc report <file>                  # standup: who's doing what, what's ready, what's blocked
mdc add   <file> "…" --needs a,b   # record newly-discovered work; prints the new id
mdc claim <file> <id> --as <you>   # take an item; exit 2 => someone else has it, pick another
mdc start <file> <id>              # signal you're actively working on it (adds .doing)
mdc check <file> <id>              # mark done after the work; one-line diff
mdc note  <file> <id> "…" --as <you>  # leave a durable note on an item (renders under it)
mdc unclaim <file> <id> --from <you>  # hand an item back if you can't finish it
mdc cancel <file> <id> --reason "…"  # skip a step, on the record (never just delete it)
mdc status <file>                  # progress, blocked, actionable at a glance
```

When you discover work that is not yet on the list, `add` it rather than hand-editing the file — that keeps the line canonical and mints an id you can immediately `claim`/`check`. Pass `--id <slug>` to choose the id yourself, or let it generate one from the text.

The `--as <you>` handle is a **file-local coordination label** (use your agent/role slug, e.g. `agent-a`); MDC never resolves or notifies it. Note that if someone later pastes the raw file into a GitHub/GitLab issue or PR body, a handle matching a real account autolinks and may ping it — so prefer role/agent slugs over people's usernames.

If a file is a **template** (`kind: template` in its frontmatter), do not check items on it — instantiate a run first: `mdc cut <template> --out <run-file> --title "…"`, then drive the run.

Every mutation **prints the resulting canonical line to stdout**, so you can see exactly what changed without a follow-up read. `check`/`cancel` also clear the `.doing` marker automatically (a finished item is no longer in progress).

Other verbs you have: `uncheck <id>` (undo a check), `unstart <id>` (clear `.doing`), `unclaim <id> [--from <you>]` (release/hand back an item), `report` (a standup view), and read-only `parse`/`lint`/`fmt` for the model, structural checks, and canonical formatting. `add` also takes `--as <handle>`, `--due <date>`, and `--class <c,d>`.

The golden rule: **claim before you work, check after.** Each mutation rewrites exactly one line, so your edits and a teammate's (human or agent) merge cleanly under plain git, and the git history is the audit trail. Never hand-edit an item's `[ ]`/`[x]` or its metadata when a verb does it — the verbs keep the file canonical.

Note: `.gate` and `needs=` shape what `next` shows you, but they do not *stop* you from checking an out-of-order item — the graph is advisory. Consult `next`/`report` before acting rather than relying on the tool to refuse. "Actionable" means dependency-ready and gate-clear; it does not mean unclaimed, so filter with `next --as <you>` to see what is actually yours to pick up.

### A complete example

`release.mdc.md`:

```markdown
---
mdc: "0.1"
---

- [x] Cut the release branch {#branch done=2026-07-26}
- [ ] Run the test suite {#tests needs=branch}
- [ ] Publish the package {#publish needs=tests}
```

A worked session:

```
$ mdc next release.mdc.md --json
[ { "id": "tests", ... } ]              # only #tests is actionable (#publish needs it)

$ mdc claim release.mdc.md tests --as agent-a
$ echo $?                                # 0 — it's yours
# …run the tests…
$ mdc check release.mdc.md tests --date 2026-07-26
$ mdc next release.mdc.md --json
[ { "id": "publish", ... } ]            # checking #tests unblocked #publish
```

If a second agent had raced you: `mdc claim release.mdc.md tests --as agent-b` would exit `2`, and it would move to the next actionable item instead.
