# mdc-py — a second, independent MDC implementation (CONF-L1)

A standalone Python 3 implementation of MDC (Markdown Checklists) at conformance
level **CONF-L1** (parse + lint). Standard library only — no `pip` dependencies.

Its purpose is the pre-1.0 credibility gate: proving the [MDC spec](../../spec/mdc-spec-v0.1.md)
is implementable in a second language, with a different parsing strategy, working
from the spec + corpus rather than the JavaScript reference.

## What it is

- A single file, `mdc.py`, exposing the L1 slice of the conformance CLI contract:
  - `python3 mdc.py parse <file> --json` — emits the §7 L1 document model as JSON
    on stdout (exit 0); on a non-MDC or unsupported-version document emits
    `{"error":"not-mdc"}` or `{"error":"unsupported-version"}` on stdout and exits 1.
  - `python3 mdc.py lint <file> --json` — emits the §11 findings array as JSON on stdout.
- **Different parsing strategy from the JS reference.** The reference drives a
  remark/unified CommonMark pipeline. This implementation is a hand-written,
  **line-oriented parser**: task-item lines are matched by regex, list nesting
  depth is computed from leading indentation via an explicit stack, and the
  attribute block is extracted and tokenised by hand (a small whitespace scanner
  that respects double quotes). No Markdown library is involved.

## How to run it

Directly:

```
python3 impls/mdc-py/mdc.py parse spec/corpus/parse/minimal/input.mdc.md --json
python3 impls/mdc-py/mdc.py lint  spec/corpus/lint/clean/input.mdc.md --json
```

Against the conformance corpus (run from the repo root):

```
python3 spec/conformance/run.py \
  --cli "python3 /Users/tim/Development/Experiments/mdc/impls/mdc-py/mdc.py" \
  --level L1
```

Current result: **44/44 passed** (28 parse + 16 lint). Use `--family parse` /
`--family lint` and `-v` to focus.

## Portability notes

**The JavaScript reference was not consulted for any case** — the spec prose
(`spec/mdc-spec-v0.1.md`), the implementation contract
(`docs/spec/implementation-contract.md`), and the corpus fixtures were together
sufficient to reach 44/44. The task asked that any forced consult of the JS be
recorded here; there were none.

What follows are the points where the corpus was the deciding authority over the
prose, or where a rule needed careful reading — useful spec-clarity findings for a
third implementer, but each resolvable from the spec+corpus alone:

- **`gatedBy` values carry literal source line numbers.** The runner strips every
  `line` *key* at any depth, but an anonymous gate contributes the *string value*
  `"<line N>"` (e.g. `parse/gate-anonymous` expects `"<line 5>"`). That value is
  **not** stripped, so a conforming parser must track accurate 1-based source line
  numbers (frontmatter and blank lines included) even though the `line` field
  itself is ignored. This is the one place line numbering is load-bearing at L1.

- **Gating is a document-order line scan, not a tree walk.** DER-3/DER-4 read as
  "children inherit gatedBy from their parent (union)", but because a gate applies
  to every later item by line regardless of nesting, computing each item's
  `gatedBy` directly (gates whose line precedes it, `.optional` ⇒ empty) reproduces
  every fixture — including nested children (`canonical-run` smoke's children get
  `["triage"]`) — without any explicit inheritance step. Inheritance *is* needed
  for `blocked`/`blockedBy`, which propagate parent→child as a set union
  (`canonical-run` smoke's children inherit `blockedBy: ["ci"]`).

- **`blockedBy` vs. the cycle rule.** `blockedBy` lists exactly the non-terminal /
  dangling *local* `needs=` targets in source order; cross-file (`#`-containing)
  targets are excluded entirely. The "non-terminal member of a needs cycle" clause
  (DER-1) affects only the `blocked` boolean, never `blockedBy`. In the corpus the
  cycle members already have non-terminal targets (`needs-cycle`) or are all
  terminal (`terminal-cycle-pair`), so the normal target rule alone passes both;
  the explicit cycle-membership boolean is implemented for spec-correctness on the
  untested mixed case (some members terminal, some open).

- **The trailing-block / "item must have text" edge (`parse/braces-mid-line`).**
  `- [ ] {#orphan}` has *no* attribute block — the braces are the whole text, so
  they stay as literal text and `id` is `null`. The block is recognised only when
  it is preceded by a space **and** non-empty text remains before it. A mid-line
  `{...}` (not at end of line) is likewise plain text.

- **What "does not tokenize" means for `malformed-attributes`.** A trailing
  `{...}` is malformed when: a double quote is left unbalanced, the block is empty
  (`{}`), or any whitespace-delimited token is not one of `#slug` / `.slug` /
  `@slug` / `key=value`. Malformed ⇒ braces kept in the text, one parser
  `warnings` entry, lint `malformed-attributes`, and (per FMT-9) the line is
  byte-untouched by fmt, so it must **not** also draw `non-canonical-state`.

- **`non-canonical-state` is defined as "fmt would rewrite this line" (LINT-3).**
  With no fmt at L1, this implementation renders the parsed item back to its
  canonical single-line form (canonical marker `-`, `[x]`, single spaces,
  `{#id .classes-sorted @assignee keys-sorted}`, values quoted iff they contain
  whitespace/brace/empty, `needs` comma-joined in source order, duplicate
  ids/assignees dropped) and compares bytes against the original line. Getting the
  canonical serializer exactly right is what lets `lint/clean` and the
  otherwise-canonical lines in every lint fixture come back with **no** spurious
  `non-canonical-state` finding.

- **Cancelled detection (STATE-3).** A `[x]` item is `cancelled` only when its
  entire text is a single `~~…~~` span with no interior `~~`; the model strips the
  wrapping `~~`. An item containing two or more strikethrough spans stays `done`
  with verbatim text (`parse/multi-strikethrough-done`).

- **Frontmatter is parsed without a YAML library** (Python has none in stdlib).
  A minimal `key: value` scanner over the top-level `---` block suffices for the
  corpus. Detection requires an `mdc` key whose value is a **string**; a quoted
  `mdc: "0.1"` is a string, whereas a bare numeric `mdc: 0.1` is treated as a
  number ⇒ `not-mdc`. All frontmatter values are surfaced verbatim as strings
  (e.g. `started: 2026-07-24` ⇒ `"2026-07-24"`).

- **Tasks nested under a *prose* list item are top-level model items**
  (`parse/prose-nested-task`). The nesting stack records prose (non-task) list
  items as barriers: a task whose nearest enclosing list item is prose (or none)
  has no task parent and joins `items` at top level, though its canonical
  indentation still follows true source depth.
