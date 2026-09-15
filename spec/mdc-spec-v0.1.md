# MDC Specification v0.1

MDC (Markdown Checklists) is a checklist document format that is, by construction, valid GFM. This document is the normative prose for v0.1. The conformance corpus under [`spec/corpus/`](corpus/) is the executable half of the spec and is **authoritative over this prose**: where a fixture and a sentence disagree, the fixture wins. The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as in RFC 2119.

Every normative rule below cites at least one corpus case by directory name, written `[parse/minimal]`, `[lint/duplicate-id]`, `[fmt/attr-order]`, `[mutate/check]`, or a top-level fixture filename. A rule without a passing fixture is not normative.

## 0. Corpus conventions

- **C-1.** A parse case is `parse/<case>/input.mdc.md` plus exactly one of `expected.json` (the L1 model) or `error.json`. Comparison is JSON-structural per the [conformance contract](conformance.md): **object keys unordered, arrays ordered, every `line` key ignored at any depth, and present-empty distinct from absent** (`attrs: {}`, `progress: null`, `blockedBy: []` are each required exactly as fixtured). Fixtures omit `line` keys entirely because they are volatile under fixture edits. Line anchoring is covered by implementation unit tests, not the corpus. `[parse/canonical-run]`
- **C-2.** `error.json` is `{ "error": "<token>" }` and asserts exit code `1` with the named error class. The tokens are `not-mdc` `[parse/no-mdc-key]` and `unsupported-version` `[parse/unsupported-version]`.
- **C-3.** A lint case is `lint/<case>/input.mdc.md` plus `expected.json`, an **ordered** array of findings: document order by line, then rule name ascending within a line. Findings in fixtures omit the `line` key (see C-1); comparators MUST ignore it. `[lint/non-canonical-state]` `[lint/multiple-ids]`
- **C-4.** A fmt case is `fmt/<case>/input.mdc.md` plus `expected.mdc.md`, compared **byte-for-byte** under the newline/BOM/NFC policy in the [conformance contract](conformance.md) (LF and CRLF behaviors are asserted by distinct fixtures; a runner MUST NOT normalize newlines before comparing). Each case's argv — including whether `--assign-ids` applies — is carried explicitly (in `corpus/manifest.json`), never inferred from the case name. `[fmt/already-canonical]` `[fmt/fmt-assign-ids]`
- **C-5.** A mutate case is `mutate/<case>/input.mdc.md` plus `op.json` plus either `expected.mdc.md` (byte-for-byte result) or `expected-error.json` `{ "exit": N }` asserting the exit code with the input file left byte-untouched. `op.json` is `{ "verb", "id" }` plus only the keys the verb uses: `date` (check), `reason` (cancel), `as` (claim), `from` (unclaim), and `text`/`needs`/`add-needs`/`rm-needs`/`add-class`/`rm-class`/`due` (edit). `[mutate/check]` `[mutate/claim-conflict]`

## 1. Identity and detection

- **DET-1.** A document is an MDC document **iff** it begins with a YAML frontmatter block — a `---` fence on line 1 — whose top-level mapping contains the key `mdc` with a string value. Filenames and extensions are never consulted. `[parse/minimal]`
- **DET-2.** A file without frontmatter, or with frontmatter lacking the `mdc` key, is not an MDC document: every verb MUST exit `1` with the `not-mdc` error. `[parse/no-frontmatter]` `[parse/no-mdc-key]`
- **DET-3.** `"0.1"` is the only version this spec accepts. Any other `mdc` value MUST produce the `unsupported-version` error, exit `1`. `[parse/unsupported-version]`
- **DET-4.** Recognized frontmatter keys: `mdc` (required), `kind` (`template | run | list`, default `list`), `title`, `template`, `mode` (`read-do | do-confirm`), `started` (`YYYY-MM-DD`). Unknown frontmatter keys MUST be preserved and surfaced verbatim, never an error. `[parse/minimal]` `[parse/canonical-run]`
- **DET-5.** No verb ever rewrites frontmatter or any prose byte. Only task-item lines are ever rewritten, and only by `fmt` and mutations. `[fmt/list-markers]` `[mutate/check]`
- **DET-6.** Detection and parsing tolerate a leading UTF-8 BOM and CRLF (`\r\n`) line endings: a Windows-checkout document is an MDC document exactly as its LF twin is. A rewritten item line keeps the document's line ending; every other byte, BOM included, is preserved.

## 2. Item grammar

- **ITEM-0 (CommonMark/GFM surface).** MDC parsing assumes a fixed host grammar and does not redefine it: **CommonMark list-item nesting** plus the GFM extensions **task-lists**, **strikethrough** (`~~`), and **YAML frontmatter**. The reference realizes exactly this surface (remark + `remark-gfm` + `remark-frontmatter`); a conforming implementation MUST match its observable behavior on the corners MDC depends on — CommonMark tab-indented list nesting (a tab indents one level, `[parse/tab-indented-child]`), the `~~`-vs-`~` strikethrough boundary (a single-tilde span is not a cancel wrap; STATE-3 requires a literal double-tilde wrap, `[parse/strikethrough-single-tilde]`), and slug derivation from the **raw inline-markdown source** rather than rendered plain text (`fmt --assign-ids` slugifies the source bytes, so a link contributes its target text too, `[fmt/assign-ids-inline-strip]`). GFM features beyond this surface (tables, autolinks, footnotes) are ordinary prose to MDC (ITEM-5) and carry no item semantics.
- **ITEM-1.** A task-item line is `<indent><marker> [<mark>] <text>[ <attribute-block>]` where `<marker>` is `-`, `*`, or `+` and `<mark>` is space, `x`, or `X`. All three markers and both `x` casings parse identically; only `-` and `[x]`/`[ ]` are canonical (see section 9), and lint flags the rest as `non-canonical-state`. `[parse/minimal]` `[parse/noncanonical-markers]` `[lint/non-canonical-state]`
- **ITEM-2.** `text` is the verbatim inline markdown between the bracket and the attribute block, trimmed of leading and trailing whitespace only: internal spacing, inline markup, and Unicode are preserved exactly. `[fmt/spacing]` `[parse/unicode-text]` `[parse/canonical-run]`
- **ITEM-3.** Only a **trailing** `{…}` block, preceded by at least one space, is metadata. Braces anywhere else in the line are ordinary text. A line whose entire text would be the block has no attribute block — an item must have text — so the braces remain text. `[parse/braces-mid-line]`
- **ITEM-4.** Nested task items are children of the nearest enclosing task item, per CommonMark list nesting; the model holds them in `children` in document order. A task nested under a *non-task* (prose) list item has no task parent — it is a top-level model item — but its canonical indentation follows its true source list depth, so `fmt` and mutations never dedent or re-parent it. Indentation follows CommonMark, so a tab indents one nesting level exactly as the equivalent spaces do (ITEM-0). `[parse/nested-children]` `[parse/deep-nesting]` `[parse/prose-nested-task]` `[parse/tab-indented-child]` `[fmt/child-indent]` `[fmt/prose-nested-indent]`
- **ITEM-5.** Non-task list items, headings, blockquotes, and all other prose are not part of the item model and round-trip byte-for-byte through every verb. The canonical run's pause-point blockquote and intro paragraph do not appear among its 11 top-level items. `[parse/canonical-run]`
- **ITEM-6.** `section` is the text of the nearest preceding heading at any depth, else `null`. `[parse/canonical-run]` `[parse/minimal]` `[parse/unicode-text]`

## 3. States

- **STATE-1.** Stored states are exactly three: open `- [ ] text`, done `- [x] text`, cancelled `- [x] ~~text~~`. No other bracket characters exist at any conformance level. `[parse/canonical-run]` `[canonical-run.mdc.md]`
- **STATE-2.** `[X]` parses as done; `fmt` normalizes it to `[x]`. `[parse/noncanonical-markers]` `[fmt/bracket-case]`
- **STATE-3.** Cancelled is `[x]` with a **single** `~~` span wrapping the **entire text** (attribute block outside the wrap): the text starts with `~~`, ends with `~~`, and contains no interior `~~`. The model's `text` strips the wrapping `~~` and `state` is `"cancelled"`. A done item that merely *contains* struck phrases (two or more `~~…~~` spans) stays `"done"` with its text verbatim. Canonical form re-wraps the text in a single `~~` span outside the attribute block. The wrap is a literal **double**-tilde: a single-tilde GFM strike (`~text~`) is not a cancel and leaves the item done with verbatim text. `[parse/cancelled-reason]` `[parse/multi-strikethrough-done]` `[parse/strikethrough-single-tilde]` `[fmt/cancelled-canonical]`
- **STATE-4.** A cancelled item SHOULD carry `reason="…"`; lint reports `cancelled-without-reason` (warning) otherwise. `[lint/cancelled-without-reason]` `[parse/cancelled-reason]`
- **STATE-5.** Terminal means done or cancelled. A cancelled dependency satisfies `needs=` exactly as a done one does. `[parse/cancelled-reason]` `[parse/needs-list]`
- **STATE-6.** `.doing` and `.waiting` are informational classes only: they are never bracket characters and MUST NOT affect `actionable`. `[parse/doing-waiting]`

## 4. The attribute block

- **ATTR-1.** Grammar, tokenized on whitespace outside double quotes:

  ```
  block   := "{" token (SP token)* "}"
  token   := id | class | assignee | kv
  id      := "#" slug
  class   := "." slug
  assignee:= "@" slug
  kv      := key "=" value
  value   := bare | quoted
  bare    := 1*(any char except whitespace, '"', '{', '}')
  quoted  := '"' *(any char except '"') '"'     ; no escape sequences in v0
  slug    := 1*(a-z A-Z 0-9 - _ /)
  ```

  `[parse/canonical-run]` `[parse/quoted-values]`
- **ATTR-2.** At most one id and one assignee. On repetition the **first wins**: the extras are dropped from the model, the parser records a document warning, and lint reports `multiple-ids` / `multiple-assignees` (errors). The model stores both without their sigils (`id: "ci"`, `assignee: "tim"`). `[parse/multiple-ids-assignees]` `[lint/multiple-ids]` `[lint/multiple-assignees]`
- **ATTR-2 note (informative).** An assignee is a **file-local coordination handle** — a claim marker unique within the document. MDC assigns it **no resolution and no notification semantics**: no verb looks it up, notifies it, checks it against a roster, or requires it to name a real account anywhere; `claim` only sets the string. Where an MDC document is *pasted into a host that autolinks `@` tokens* (a GitHub/GitLab issue, PR, or comment body — but not a rendered file view), a handle matching a real account will autolink and may notify. That is a property of the paste target, not of MDC. Authoring guidance (prefer role/agent slugs; fence the paste for silence) resolves [open question #1](../docs/vision/risks-critiques-open-questions.md) and lives in [`docs/adoption/mentions-and-notifications.md`](../docs/adoption/mentions-and-notifications.md).
- **ATTR-3.** Classes are free-form tags; `gate`, `optional`, `doing`, `waiting` are reserved. `[parse/gate-optional]` `[parse/doing-waiting]`
- **ATTR-4.** Reserved keys (closed set): `due`, `done`, `repeat`, `needs`, `verify`, `reason`. Extension keys MUST use the `x-` prefix. Any other key parses, is surfaced verbatim in `attrs` (so `fmt` cannot destroy data), and draws lint `unknown-key` (warning). `[parse/unknown-vs-x-key]` `[lint/unknown-key]`
- **ATTR-5.** Quoted values carry embedded whitespace; there are no escapes, so a value containing `"` is unrepresentable in v0. A quoted value with neither whitespace nor a brace is equal to its bare form; a value containing a brace has no bare form (ATTR-1) and so is representable only quoted. `[parse/quoted-values]` `[fmt/quote-minimization]` `[fmt/quote-brace-value]`
- **ATTR-6.** `needs=` is a comma-separated ID list with no spaces, parsed to an array; source order is meaningful and MUST be preserved by every serialization. `[parse/needs-list]` `[fmt/attr-order]`
- **ATTR-6a.** A `needs=` target containing `#` is a **cross-file reference** of the form `<path>#<id>` (path relative to the referencing document). A local id can never contain `#` (not a slug char, ATTR-1), so `#` is the unambiguous discriminator. Cross-file references are **reserved syntax, opaque to v0**: preserved verbatim in `attrs.needs`, but excluded from v0 dependency semantics (DER-1) — they are neither blocking edges nor `dangling-needs` local ids; lint surfaces each as `unresolved-cross-file-ref` (warning). Resolution — following the path and reading the external item's state — is a `.mddb`/tooling concern, out of scope for the format. `[parse/cross-file-needs]` `[lint/unresolved-cross-file-ref]`
- **ATTR-7.** `due`, `done`, and frontmatter `started` are `YYYY-MM-DD`; violations draw lint `invalid-date` (error). `[lint/invalid-date]`
- **ATTR-8.** `repeat=` MUST match `(done|due)+<n><unit>` with unit `d|w|m`; violations draw lint `invalid-repeat` (error). Repeat is data only — nothing in v0 executes recurrence. `[lint/invalid-repeat]` `[parse/canonical-run]`
- **ATTR-9.** A trailing block that does not tokenize — unbalanced quote or brace, or empty `{}` — is **not** attributes: the braces stay in the item text (L0 safety), the parser records a document warning, and lint reports `malformed-attributes` (error). `fmt` MUST leave such lines byte-untouched. `[parse/malformed-attributes]` `[lint/malformed-attributes]` `[fmt/spacing]`

## 5. IDs

- **ID-1.** IDs are human-readable slugs, unique per file. A repeated id draws lint `duplicate-id` (error) on each occurrence after the first; references resolve to the first occurrence. `[parse/duplicate-ids]` `[lint/duplicate-id]`
- **ID-2.** IDs are required only where something references them; a bare `- [ ] item` is a complete MDC item. `[parse/minimal]`
- **ID-3.** Conforming tools MUST address items by ID — never by line number or text match. `[mutate/check]`
- **ID-4.** `fmt --assign-ids` generates an ID for each item lacking one: lowercase the text, strip inline markdown syntax, take the first three words, join with `-`, strip characters outside `[a-z0-9-]`, collapse repeated hyphens. Slugification operates on the **raw inline-markdown source** of the text, not its rendered plain form: markup punctuation drops out as out-of-range characters, but a link contributes its target text too (`[docs](https://x)` → `docshttpsx`). On collision with any existing or previously generated ID, append `-2`, `-3`, …. The result is deterministic for a given input file. `[fmt/fmt-assign-ids]` `[fmt/assign-ids-inline-strip]`

## 6. Template vs. run

- **TPL-1.** `kind: template` documents carry the reusable procedure; `kind: run` documents are instances; `kind: list` (the default) is a plain checklist. All three use identical item grammar. `[parse/canonical-template]` `[parse/canonical-run]` `[parse/minimal]`
- **TPL-2.** A run pins `template: <path>@<version>`, where `<version>` is the token after the **final** `@`. The token is **opaque to v0 tools**: they MUST preserve it verbatim and MUST NOT resolve it. Its blessed interpretation is a **git commit-ish** (tag, branch, or SHA) resolvable in the repository holding the template — deliberately *not* a content hash (an opaque identifier, rejected on the same grounds as opaque item ids) and *not* a mandatory frontmatter counter (per-file increment machinery with its own merge problem). A run MAY be unpinned (bare path, no `@version`) but SHOULD pin one; lint warns `unpinned-template` otherwise (LINT-1). `[parse/canonical-run]` `[lint/unpinned-template]`
- **TPL-3.** Run state accrues on item lines (`done=` stamps, assignees, `.doing`, cancellations with `reason=`) and in run frontmatter (`template`, `started`); the template carries none of it — compare `#pdf` open in the template and cancelled in the run. `[parse/canonical-template]` `[parse/canonical-run]` `[canonical-template.mdc.md]` `[canonical-run.mdc.md]`
- **TPL-4.** Cutting a run from a template copies the body byte-for-byte (prose and headings round-trip), writes fresh run frontmatter (`kind: run`, the pinned `template:` reference, an optional `title` override, `started`, and the template's `mode`), and resets every item to a pristine open state — clearing assignees, `done=`/`due=`/`reason=`, the `.doing`/`.waiting` classes, and any cancellation — so a well-formed template is a no-op to reset and a dirty one is cleaned. `[cut/from-canonical-template]` `[cut/strips-run-state]`

## 7. The L1 document model

- **MODEL-1.** `parse --json` emits `{ mdc, kind, title, frontmatter, items, warnings }`. `frontmatter` holds every frontmatter key verbatim; `kind` reflects the default when absent; `title` is `null` when absent. `[parse/canonical-run]` `[parse/minimal]`
- **MODEL-2.** Each item is `{ id, text, state, assignee, classes, attrs, section, line, children, computed }`. `id` and `assignee` are top-level and are not repeated in `attrs`; `classes` likewise. `attrs` holds every parsed key; `needs` is always an array, every other value a string. `[parse/canonical-run]` `[parse/needs-list]`
- **MODEL-3.** `computed` is `{ blocked, blockedBy, gatedBy, actionable, progress }` per section 8; derived state is never stored in the file. `[parse/canonical-run]`
- **MODEL-4.** `warnings` holds parser notices `{ rule, line, message }` for exactly: `malformed-attributes`, `multiple-ids`, `multiple-assignees`. All other findings are lint's job. `[parse/malformed-attributes]` `[parse/multiple-ids-assignees]`
- **MODEL-5.** `line` values are 1-based source line numbers; corpus comparison ignores them everywhere (C-1).

## 8. Derived semantics

- **DER-1.** **blocked**: an item is blocked when any *local* `needs=` target is non-terminal `[parse/needs-list]`, unknown (dangling — also a lint error) `[parse/dangling-needs]`, or the item is a **non-terminal** member of a `needs` cycle (a mutual deadlock; also a lint error). A terminal (done/cancelled) cycle member is not blocked, and neither is a dependent whose only unmet target has become terminal. Cross-file targets (ATTR-6a) are excluded entirely: v0 cannot read the external item's state, so such a target is never a blocking edge and never dangling — an item whose only unmet `needs=` is cross-file is actionable. `[parse/needs-cycle]` `[parse/terminal-cycle-pair]` `[parse/cross-file-needs]`
- **DER-2.** `blockedBy` lists exactly the blocking targets, in `needs=` source order. `[parse/needs-list]`
- **DER-3.** **gates**: for each `.gate` item G, every item after G in document order (by line) that is not `.optional` has G in `gatedBy` — G's id, or the string `"<line N>"` when G has no id — until G is terminal. Gates apply document-wide regardless of nesting and regardless of the gated item's own state (a terminal item still reports `gatedBy`). A gate item is gated only by earlier gates. `[parse/gate-optional]` `[parse/gate-anonymous]` `[parse/canonical-run]`
- **DER-4.** Children inherit `blocked`/`blockedBy`/`gatedBy` from their parent (set union) — **except** that an `.optional` item is exempt from gating entirely: its `gatedBy` is always empty, whether the gate applies directly or through a gated parent. `[parse/canonical-run]` `[parse/optional-gated-child]`
- **DER-5.** **actionable** = `state == "open"` ∧ not blocked ∧ `gatedBy` empty ∧ every **direct** child terminal. `.doing`/`.waiting` have no effect. `[parse/gate-optional]` `[parse/doing-waiting]` `[parse/nested-children]` `[parse/deep-nesting]`
- **DER-6.** **progress** is `null` for leaf items; for parents, `{ done, total }` over direct **and transitive** children with cancelled items excluded from both numerator and denominator. `[parse/nested-children]` `[parse/deep-nesting]` `[parse/canonical-run]`
- **DER-7.** **next** is the actionable items in document order; in the canonical run that is exactly `#triage`. `[parse/canonical-run]`

## 9. Canonical form

- **FMT-1.** Canonical marker is `-`; `*` and `+` task items are rewritten. `[fmt/list-markers]`
- **FMT-2.** Canonical done bracket is `[x]`. `[fmt/bracket-case]`
- **FMT-3.** Child indent is exactly 2 spaces per nesting depth. `[fmt/child-indent]`
- **FMT-4.** Exactly one space separates marker, bracket, text, and block; item text itself is untouched (ITEM-2). `[fmt/spacing]`
- **FMT-5.** Canonical block order: `{#id .class-a .class-b @assignee key=value}` — id, classes alphabetical, assignee, keys alphabetical; single spaces; `needs` values comma-joined in source order (never sorted). `[fmt/attr-order]`
- **FMT-6.** A value is quoted **iff** it contains whitespace or a brace (`{`/`}`), or is the empty string; otherwise it is bare. (A brace cannot appear in a bare value at all — ATTR-1 — so a braced value is representable only quoted, and a round-trip keeps the quotes.) `[fmt/quote-minimization]` `[fmt/quote-brace-value]`
- **FMT-7.** `fmt` is idempotent, and a canonical document is a fixpoint: running `fmt` on it is byte-identity. `[fmt/already-canonical]`
- **FMT-8.** Canonical re-serialization emits the model, so duplicate ids/assignees are dropped (first wins, ATTR-2). This is lossy by design; the `multiple-ids`/`multiple-assignees` lint errors are the guard. `[fmt/drop-duplicate-sigils]` `[lint/multiple-ids]`
- **FMT-9.** Lines with malformed attribute blocks are left byte-untouched (ATTR-9). `[fmt/spacing]`
- **FMT-10.** Note (informative): `canonical-run.mdc.md` is the canonical *example*, not canonical *form* — the sketch orders some blocks `@assignee key .class`, which FMT-5 reorders. It is normative for parsing, not for `fmt` output.

## 10. Mutations (L2)

- **MUT-1.** The v0 mutation vocabulary, preconditions, and outcomes:

  | Verb | Precondition | Effect on the target line |
  |---|---|---|
  | `check` | state open | `[ ]` → `[x]`, set `done=<date>`, clear `.doing`/`.waiting` `[mutate/check]` `[mutate/check-clears-doing]` |
  | `uncheck` | state done | `[x]` → `[ ]`, remove `done=` `[mutate/uncheck]` |
  | `cancel` | not cancelled | `[x]`, wrap text in `~~`, set `reason="…"`, clear `.doing`/`.waiting`, keep other attributes `[mutate/cancel]` |
  | `claim` | no assignee set | set `@handle` `[mutate/claim]` |
  | `unclaim` | assignee set (and `--from` matches, if given) | clear `@assignee` `[mutate/unclaim]` |
  | `start` | state open, not already `.doing` | add `.doing` class `[mutate/start]` |
  | `unstart` | item is `.doing` | remove `.doing` class `[mutate/unstart]` |
  | `edit` | id exists, ≥1 field flag | amend text / `needs` / classes / `due` `[mutate/edit-add-needs]` `[mutate/edit-text]` |

- **MUT-2.** A failed precondition or unknown id is a domain refusal: exit `2`, file byte-untouched. `[mutate/claim-conflict]` `[mutate/start-terminal-refused]` `[mutate/unclaim-from-mismatch]`
- **MUT-3.** Every mutation is line surgery: locate the target by ID, regenerate **only that line** in canonical form (section 9) with the mutation applied, copy every other byte through. On a canonical document every mutation is a one-line, byte-deterministic diff. `[mutate/check]`
- **MUT-4.** When the target line is non-canonical, the mutation also canonicalizes that line — still exactly one changed line. `[mutate/check-noncanonical]`
- **MUT-5.** Mutations (and `fmt`) take a `<file>.lock` lockfile opened `wx` (a lock older than 10 s is stale), write to `<file>.tmp-<pid>`, and atomically rename over the original. `claim`'s check-and-set inside the lock is the atomicity guarantee; concurrency is asserted by the implementation's claim-race test, which the corpus cannot express. (Informative; the observable byte behavior is normative via `[mutate/claim]` and `[mutate/claim-conflict]`.)
- **MUT-6.** `add` *creates* rather than rewrites: it inserts a new **open** item in canonical form (section 9) and echoes the resulting canonical line to stdout (uniform with the other mutations; the new id is the `#…` token in it). Placement is end-of-document by default, or `--after <id>` (as the target's next sibling, past its whole subtree, at the target's depth) or `--section <heading>` (at the end of that heading's section, top level); the two are mutually exclusive. Placement is significant because `.gate` and document order are semantic — a blind append can trap an item behind a later gate. `--id` sets the id and refuses (**exit 2**) on collision; when omitted, the id is generated from the item text exactly as `fmt --assign-ids` does (ID-4). An unknown `--after`/`--section` target also refuses **exit 2**. `needs` and `class` are comma-separated lists, `as` sets the assignee, `due` is a date. The insertion preserves the document's line ending and leaves every existing byte untouched — so `fmt` is a no-op and `lint` is clean immediately after. Empty text, a malformed slug, a bad `--due`, or both placement flags is a usage error (**exit 1**). `[add/append-basic]` `[add/generated-id]` `[add/after-sibling]` `[add/into-section]`
- **MUT-7.** `start`/`unstart` toggle the informational `.doing` class (STATE-6 — never affects `actionable`), distinguishing "actively working" from merely claimed; the model already carried `.doing`, these expose it. `unclaim` is the inverse of `claim`: `--from <handle>` guards against releasing another agent's claim (refuse **exit 2** on mismatch) and is omitted to release unconditionally. All three regenerate exactly the target line in canonical form, one-line diff. `[mutate/start]` `[mutate/unstart]` `[mutate/unclaim]`
- **MUT-8a.** `edit` amends an existing item's metadata in one canonical-line rewrite: `--text` replaces the item text; `--needs` replaces the dependency list, or `--add-needs`/`--rm-needs` edit it incrementally (mutually exclusive with `--needs`); `--add-class`/`--rm-class` add/remove classes; `--due` sets the date. It deliberately **cannot** change state (`check`/`uncheck`/`cancel`), assignee (`claim`/`unclaim`), the `.doing`/`.waiting` soft classes (`start`/`unstart`), or the id — renaming an id would orphan every `needs=` reference to it. A soft-class edit, conflicting needs flags, or no field at all is a usage error (**exit 1**); an unknown id refuses (**exit 2**). Echoes the resulting line. `[mutate/edit-add-needs]` `[mutate/edit-text]` `[mutate/edit-soft-class-refused]`
- **MUT-8.** `note` attaches a durable annotation to an item as a nested prose bullet — `  - note @<author> <date>: <message>`, indented one level below the item (2 spaces × the item's depth + 1). A note is an ordinary GFM non-task list item (ITEM-5): it renders, diffs per line, and is **invisible to the item model** — it never affects state, progress, or any derived semantics. `--as` sets the author (omitted → no `@author`); `--date` the stamp (default today). New notes append after the item's existing notes, so a note log reads top-to-bottom in write order. Unknown id refuses **exit 2**; an empty or multi-line message is **exit 1**. Because each note is its own line, notes on different items never conflict and a same-item concurrent-note conflict resolves by keeping both lines; structured *querying* of notes is out of scope for v0 (a `.mddb` concern) — they are read in-file. `[note/basic]` `[note/chronological-append]`

## 11. Lint

- **LINT-1.** The v0 rule set is closed:

  | Rule | Severity | Fixture |
  |---|---|---|
  | `duplicate-id` | error | `[lint/duplicate-id]` |
  | `dangling-needs` | error | `[lint/dangling-needs]` |
  | `needs-cycle` | error, one finding per member | `[lint/needs-cycle]` |
  | `malformed-attributes` | error | `[lint/malformed-attributes]` |
  | `multiple-ids` | error | `[lint/multiple-ids]` |
  | `multiple-assignees` | error | `[lint/multiple-assignees]` |
  | `invalid-date` | error | `[lint/invalid-date]` |
  | `invalid-repeat` | error | `[lint/invalid-repeat]` |
  | `unknown-key` | warning | `[lint/unknown-key]` |
  | `non-canonical-state` | warning | `[lint/non-canonical-state]` |
  | `cancelled-without-reason` | warning | `[lint/cancelled-without-reason]` |
  | `unpinned-template` | warning | `[lint/unpinned-template]` |
  | `unresolved-cross-file-ref` | warning | `[lint/unresolved-cross-file-ref]` |

- **LINT-2.** A finding is `{ rule, severity, line, id, message }` with `id` the item's id or `null`; messages are normative as fixtured and MUST NOT embed line numbers. Findings are ordered per C-3. A clean document yields `[]`. `[lint/clean]`
- **LINT-3.** `non-canonical-state` fires exactly when `fmt` would change the line — markers, bracket case, spacing, indent, attribute order or quoting, or dropped duplicate sigils. `[lint/non-canonical-state]` `[lint/multiple-ids]`

## 12. Conformance classes

An implementation MAY claim one of three conformance classes. Each is defined by the corpus it MUST pass, driven and compared per the language-neutral [conformance contract](conformance.md); the exit-code law (`0` success, `1` usage/IO/parse/not-MDC, `2` domain refusal) holds throughout.

- **CONF-L0 — Renderer (by construction).** A Markdown/GFM renderer conforms with no MDC support: it MUST render every open item as an unchecked box, every done item as a checked box, and a cancelled item as a checked box with struck-through text, and MUST NOT let any attribute block break rendering. Verified by the paste procedure and fixtures in [`rendering/README.md`](rendering/README.md). `[canonical-run.mdc.md]`
- **CONF-L1 — Parser.** An L1 implementation MUST, for every `parse/` case, emit the §7 model that matches `expected.json` under the C-1 JSON comparison law (and exit `1` with the named error token for every `error.json` case); and MUST, for every `lint/` case, emit the §11 findings matching `expected.json` under C-3. This is the parser-credibility class a second-language implementation targets first. `[parse/canonical-run]` `[parse/no-mdc-key]` `[lint/clean]`
- **CONF-L2 — Mutator.** An L2 implementation MUST be L1-conformant and additionally pass, byte-for-byte (C-4) or by asserted exit code, every `fmt/` case, every `mutate/` case (C-5), and every `add/`, `note/`, `edit/`, and `cut/` case — preserving the minimal-diff property (each mutation changes exactly the target line; `add`/`note` insert exactly one line) and `fmt` idempotence. `[fmt/already-canonical]` `[mutate/check]` `[mutate/claim-conflict]` `[mutate/edit-add-needs]` `[add/append-basic]` `[note/basic]` `[cut/from-canonical-template]`
