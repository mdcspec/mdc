# mdc-py — a second, independent MDC implementation (CONF-L2)

A standalone Python 3 implementation of MDC (Markdown Checklists) at conformance
level **CONF-L2** (parse + lint + fmt + mutate + add + note + edit + cut).
Standard library only — no `pip` dependencies.

Its purpose is the pre-1.0 credibility gate: proving the [MDC spec](../../spec/mdc-spec-v0.1.md)
is implementable twice — a second language, a different parsing strategy, working
from the spec + corpus rather than the JavaScript reference.

## What it is

- A single file, `mdc.py`, exposing the full conformance CLI contract:
  - `parse <file> --json` — emits the §7 L1 document model as JSON on stdout
    (exit 0); on a non-MDC / unsupported-version document emits
    `{"error":"not-mdc"}` or `{"error":"unsupported-version"}` and exits 1.
  - `lint <file> --json` — emits the §11 findings array as JSON on stdout.
  - `fmt [--assign-ids] <file>` — rewrites `<file>` in place to canonical form
    (§9); idempotent; malformed-attribute lines left byte-untouched (FMT-9).
  - `check`/`uncheck`/`cancel`/`claim`/`unclaim`/`start`/`unstart` `<file> <id> [flags]`
    — rewrite exactly the target line in canonical form, echo it to stdout (§10).
  - `add <file> "<text>" [--id --needs --as --due --class] [--after <id> | --section <heading>]`.
  - `note <file> <id> "<text>" [--as --date]` — append a nested prose note bullet.
  - `edit <file> <id> [--text --needs --add-needs --rm-needs --add-class --rm-class --due]`.
  - `cut <template> --out <file> --template-ref <ref> [--title --date]`.
- Exit-code law: `0` success · `1` usage / IO / parse / not-MDC · `2` domain
  refusal. On a refusal, the target file is left byte-untouched.
- **Different parsing strategy from the JS reference.** The reference drives a
  remark/unified CommonMark pipeline. This implementation is a hand-written,
  **line-oriented parser**: task-item lines are matched by regex, list nesting
  depth is computed from leading indentation via an explicit stack, and the
  attribute block is extracted and tokenised by hand (a small whitespace scanner
  that respects double quotes). No Markdown library is involved. Mutations are
  line surgery — parse, locate the item by id, regenerate only that line, copy
  every other byte through (endings and BOM preserved).

## How to run it

Directly:

```
python3 impls/mdc-py/mdc.py parse spec/corpus/parse/minimal/input.mdc.md --json
python3 impls/mdc-py/mdc.py lint  spec/corpus/lint/clean/input.mdc.md --json
```

Against the full conformance corpus (run from the repo root):

```
python3 spec/conformance/run.py \
  --cli "python3 /Users/tim/Development/Experiments/mdc/impls/mdc-py/mdc.py"
```

Current result: **79/79 passed** (44 L1: 28 parse + 16 lint; 35 L2: 18 fmt +
15 mutate + 4 add + 2 note + 2 cut). Use `--level L1` / `--level L2`,
`--family fmt` / `--family mutate` / `--family add` / `--family note` /
`--family cut`, and `-v` to focus.

## Portability notes

**The JavaScript reference was not consulted for any case, at either level** —
the spec prose (`spec/mdc-spec-v0.1.md`), the implementation contract
(`docs/spec/implementation-contract.md`), and the corpus fixtures were together
sufficient to reach 79/79. The task asked that any forced consult of the JS be
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

### Additional findings from the L2 buildout (fmt / mutate / add / note / cut)

- **The trailing-block finder must be quote-aware, and yet still catch malformed
  blocks.** `fmt/quote-brace-value` (`{x-path="a{b}c" #b}`) has a `{` *inside* a
  quoted value; a naive "last `{`" scan mis-splits it. The block opener is instead
  found by scanning left-to-right, tracking double-quote state and brace depth, and
  taking the last top-level (`depth 0`, unquoted) `{` — provided the text ends with
  `}`, that `{` is preceded by a space, and non-empty text remains before it. But
  the *malformed* cases (`{#broken verify="npm test}`, unbalanced quote) still need
  detecting: because the opening `{` is recorded at top level *before* the stray
  quote opens, the candidate block is found and then fails to tokenize → malformed.
  The two behaviours are reconciled by requiring the whole text to end with `}`
  before looking for an opener.

- **Canonical value quoting is by content, not by how it was written**
  (FMT-6). A value is quoted iff it contains whitespace or a `{`/`}` (or is empty);
  otherwise bare. So `verify="npm-test"` minimizes to `verify=npm-test`
  (`fmt/quote-minimization`), `reason="obsolete"` to `reason=obsolete`
  (`fmt/cancelled-canonical`), while `x-note="two words"` and `x-path="a{b}c"` stay
  quoted. `needs` is comma-joined in **source order** (never sorted), e.g.
  `needs=beta,alpha` in `fmt/attr-order`.

- **Canonical indent depth counts *all* enclosing list items, prose included**
  (FMT-3 + ITEM-4). The same nesting stack used for parsing yields the depth: a
  task under a prose bullet is depth 1 → indented 2 spaces (`fmt/prose-nested-indent`),
  even though it is a top-level *model* item. `fmt/child-indent` normalizes
  4-/8-/3-space source indents to 2·depth.

- **Slug generation (ID-4), shared by `fmt --assign-ids` and `add`'s generated id.**
  lowercase → take the first three whitespace words → join with `-` → strip every
  char outside `[a-z0-9-]` → collapse repeated `-`. The final strip is what removes
  inline-markdown residue (`*README*` → `readme`) and punctuation (`CI/CD` →
  `cicd`, giving `fix-the-cicd`). Collisions against any existing **or**
  previously-generated id get `-2`, `-3`, …; existing ids anywhere in the file are
  reserved before generation starts, so `Ship it` becomes `ship-it-2` next to an
  existing `#ship-it` (`fmt/fmt-assign-ids`).

- **`check`/`cancel` clear the soft `.doing`/`.waiting` classes; `check`/`cancel`
  stamp `done=`/`reason=`** (MUT-1). Because every mutation re-serialises the target
  line from the parsed model, a non-canonical target is *also* canonicalised in the
  same one-line diff (`mutate/check-noncanonical`) — no separate fmt pass needed.

- **Refusal vs. usage exit codes.** Domain refusals are exit **2** and leave the
  file byte-untouched: unknown id, `claim` on an already-assigned item, `start` on
  a terminal item, `unclaim --from` owner mismatch, `add --id` collision, unknown
  `--after`/`--section` target, `cut --out` already exists. Usage errors are exit
  **1**: `edit` with a soft-class flag / no field / conflicting `--needs` +
  `--add/rm-needs`, `add` empty text / bad slug / bad date / both placement flags,
  `note` empty-or-multiline message, `cut` on a non-`template` document. All
  validation runs *before* any write, so a refused command never touches bytes.

- **`add` placement semantics** (MUT-6). Default is end-of-document; `--after <id>`
  inserts as the target's next sibling *past its whole subtree* (scan forward while
  indent exceeds the target's) at the target's depth; `--section <heading>` inserts
  at the end of that heading's section (after its last non-blank line, before the
  next heading) at top level. The new line is one inserted line; every existing
  byte is preserved, so `fmt`/`lint` are clean immediately after.

- **`note` indent is `2·(depth+1)` spaces** — one level below the item
  (`  - note @who date: message`). New notes append after the item's existing note
  lines, read top-to-bottom in write order (`note/chronological-append`). Without
  `--as` there is no `@author`; `--date` defaults to today.

- **`cut` frontmatter is emitted in a fixed order** — `mdc`, `kind: run`,
  `template: <ref>`, `title`, `mode` (only if the template had one), `started`,
  then any extra template keys — with `mdc` quoted (`mdc: "0.1"`) and every other
  value bare. `--template-ref` is written verbatim (path-independent). The body is
  copied line-for-line; each item line is reset to a pristine open state (state
  open, no assignee, drop `done=`/`due=`/`reason=` and `.doing`/`.waiting`,
  un-cancel) and re-serialised canonically — so a well-formed template's item lines
  are unchanged (`cut/from-canonical-template`) and a dirty one is cleaned
  (`cut/strips-run-state`). Frontmatter is written with a hand-rolled serializer,
  not a YAML library; this is sufficient for every value shape in the corpus but is
  the most likely place a richer document (values needing YAML quoting/escaping)
  would need hardening.
