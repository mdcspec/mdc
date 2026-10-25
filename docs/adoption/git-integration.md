# Git integration: the MDC merge driver

MDC's core move is that **every mutation rewrites exactly one line**. That keeps diffs small and legible, and it means two workers editing the *same* file never clobber each other: writes are lock-serialized and `claim` is atomic (the loser gets exit code `2`).

Across **separate branches or worktrees**, git still does the merging, and git merges by line. One-line changes to *different* items usually merge fine, with one sharp edge: when two of those changed lines are **immediately adjacent**, git's 3-way merge flags a conflict even though the edits are independent. That conflict is never lossy (both one-line changes are kept; you delete the markers), but it is noise. The merge driver removes it.

## Install it

In the repository that holds your `.mdc.md` files:

```bash
mdc merge-install
```

That does two things:

1. Registers a git merge driver named `mdc` (`git config merge.mdc.driver "mdc merge-driver %O %A %B"`).
2. Adds `*.mdc.md merge=mdc` to `.gitattributes`.

Commit the `.gitattributes` change so collaborators pick up the same rule. Each collaborator runs `mdc merge-install` once (the `merge.mdc.driver` config is local to each clone; the `.gitattributes` line is shared). The `mdc` CLI must be on `PATH` during merges.

## What it does, precisely

The driver keys the 3-way merge on item **id** instead of line position:

- Concurrent edits to **different** items (claim, check, start, edit, and so on), adjacent or not, resolve **automatically and cleanly**.
- A genuine conflict (the **same** item edited incompatibly on both sides) is left for you to resolve, exactly as git would.
- Anything structural that it cannot prove independent (an item added, removed, or reordered; a heading, note, or frontmatter line changed on one side; an id added or dropped) is **handed back to git's standard merge** untouched.

It is conservative by construction: it only auto-resolves the cases it can prove safe, and defers to git's normal behavior everywhere else. It never produces a result git's own merge would not, except to turn a spurious adjacent-line conflict into the obvious keep-both resolution. It cannot silently corrupt a board.

Without the driver installed, nothing breaks: you just get occasional one-line conflicts on adjacent edits, which you resolve by keeping both lines.

## Ignoring transient artifacts

A mutation briefly writes two sibling files next to the target: `<file>.lock` (held during the write) and `<file>.tmp-<pid>` (the atomic-replace staging file). Both are removed on success, but a process killed mid-write can leave one behind, where it shows up as untracked in `git status`. Ignore them:

```gitignore
# MDC transient mutation artifacts
*.mdc.md.lock
*.mdc.md.tmp-*
```
