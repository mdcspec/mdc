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
mdc claim <file> <id> --as <you>   # take an item; exit 2 => someone else has it, pick another
mdc check <file> <id>              # mark done after the work; one-line diff
mdc cancel <file> <id> --reason "…"  # skip a step, on the record (never just delete it)
mdc status <file>                  # progress, blocked, actionable at a glance
```

If a file is a **template** (`kind: template` in its frontmatter), do not check items on it — instantiate a run first: `mdc cut <template> --out <run-file> --title "…"`, then drive the run.

The golden rule: **claim before you work, check after.** Each mutation rewrites exactly one line, so your edits and a teammate's (human or agent) merge cleanly under plain git, and the git history is the audit trail. Never hand-edit an item's `[ ]`/`[x]` or its metadata when a verb does it — the verbs keep the file canonical.

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
