# MDC Specification v0.1

MDC (Markdown Checklists) is a checklist document format that is, by construction, valid GFM. This document is the normative prose for v0.1. The conformance corpus under [`spec/corpus/`](corpus/) is the executable half of the spec and is **authoritative over this prose**: where a fixture and a sentence disagree, the fixture wins. The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as in RFC 2119.

Every normative rule below cites at least one corpus case by directory name, written `[parse/minimal]`, `[lint/duplicate-id]`, `[fmt/attr-order]`, `[mutate/check]`, or a top-level fixture filename. A rule without a passing fixture is not normative.

## 0. Corpus conventions

- **C-1.** A parse case is `parse/<case>/input.mdc.md` plus exactly one of `expected.json` (the L1 model) or `error.json`. Comparators MUST deep-compare `expected.json` ignoring every `line` key at any depth; fixtures omit `line` keys entirely because they are volatile under fixture edits. Line anchoring is covered by implementation unit tests, not the corpus. `[parse/canonical-run]`
- **C-2.** `error.json` is `{ "error": "<token>" }` and asserts exit code `1` with the named error class. The tokens are `not-mdc` `[parse/no-mdc-key]` and `unsupported-version` `[parse/unsupported-version]`.
- **C-3.** A lint case is `lint/<case>/input.mdc.md` plus `expected.json`, an **ordered** array of findings: document order by line, then rule name ascending within a line. Findings in fixtures omit the `line` key (see C-1); comparators MUST ignore it. `[lint/non-canonical-state]` `[lint/multiple-ids]`
- **C-4.** A fmt case is `fmt/<case>/input.mdc.md` plus `expected.mdc.md`, compared **byte-for-byte**. The case named `fmt-assign-ids` is run with the `--assign-ids` flag; all other fmt cases run plain `fmt`. `[fmt/already-canonical]` `[fmt/fmt-assign-ids]`
- **C-5.** A mutate case is `mutate/<case>/input.mdc.md` plus `op.json` plus either `expected.mdc.md` (byte-for-byte result) or `expected-error.json` `{ "exit": N }` asserting the exit code with the input file left byte-untouched. `op.json` is `{ "verb", "id" }` plus only the keys the verb uses: `date` (check), `reason` (cancel), `as` (claim). `[mutate/check]` `[mutate/claim-conflict]`

## 1. Identity and detection

- **DET-1.** A document is an MDC document **iff** it begins with a YAML frontmatter block — a `---` fence on line 1 — whose top-level mapping contains the key `mdc` with a string value. Filenames and extensions are never consulted. `[parse/minimal]`
- **DET-2.** A file without frontmatter, or with frontmatter lacking the `mdc` key, is not an MDC document: every verb MUST exit `1` with the `not-mdc` error. `[parse/no-frontmatter]` `[parse/no-mdc-key]`
- **DET-3.** `"0.1"` is the only version this spec accepts. Any other `mdc` value MUST produce the `unsupported-version` error, exit `1`. `[parse/unsupported-version]`
- **DET-4.** Recognized frontmatter keys: `mdc` (required), `kind` (`template | run | list`, default `list`), `title`, `template`, `mode` (`read-do | do-confirm`), `started` (`YYYY-MM-DD`). Unknown frontmatter keys MUST be preserved and surfaced verbatim, never an error. `[parse/minimal]` `[parse/canonical-run]`
- **DET-5.** No verb ever rewrites frontmatter or any prose byte. Only task-item lines are ever rewritten, and only by `fmt` and mutations. `[fmt/list-markers]` `[mutate/check]`
- **DET-6.** Detection and parsing tolerate a leading UTF-8 BOM and CRLF (`\r\n`) line endings: a Windows-checkout document is an MDC document exactly as its LF twin is. A rewritten item line keeps the document's line ending; every other byte, BOM included, is preserved.

## 2. Item grammar

- **ITEM-1.** A task-item line is `<indent><marker> [<mark>] <text>[ <attribute-block>]` where `<marker>` is `-`, `*`, or `+` and `<mark>` is space, `x`, or `X`. All three markers and both `x` casings parse identically; only `-` and `[x]`/`[ ]` are canonical (see section 9), and lint flags the rest as `non-canonical-state`. `[parse/minimal]` `[parse/noncanonical-markers]` `[lint/non-canonical-state]`
- **ITEM-2.** `text` is the verbatim inline markdown between the bracket and the attribute block, trimmed of leading and trailing whitespace only: internal spacing, inline markup, and Unicode are preserved exactly. `[fmt/spacing]` `[parse/unicode-text]` `[parse/canonical-run]`
- **ITEM-3.** Only a **trailing** `{…}` block, preceded by at least one space, is metadata. Braces anywhere else in the line are ordinary text. A line whose entire text would be the block has no attribute block — an item must have text — so the braces remain text. `[parse/braces-mid-line]`
- **ITEM-4.** Nested task items are children of the nearest enclosing task item, per CommonMark list nesting; the model holds them in `children` in document order. A task nested under a *non-task* (prose) list item has no task parent — it is a top-level model item — but its canonical indentation follows its true source list depth, so `fmt` and mutations never dedent or re-parent it. `[parse/nested-children]` `[parse/deep-nesting]` `[parse/prose-nested-task]` `[fmt/child-indent]`
- **ITEM-5.** Non-task list items, headings, blockquotes, and all other prose are not part of the item model and round-trip byte-for-byte through every verb. The canonical run's pause-point blockquote and intro paragraph do not appear among its 11 top-level items. `[parse/canonical-run]`
- **ITEM-6.** `section` is the text of the nearest preceding heading at any depth, else `null`. `[parse/canonical-run]` `[parse/minimal]` `[parse/unicode-text]`

## 3. States

- **STATE-1.** Stored states are exactly three: open `- [ ] text`, done `- [x] text`, cancelled `- [x] ~~text~~`. No other bracket characters exist at any conformance level. `[parse/canonical-run]` `[canonical-run.mdc.md]`
- **STATE-2.** `[X]` parses as done; `fmt` normalizes it to `[x]`. `[parse/noncanonical-markers]` `[fmt/bracket-case]`
- **STATE-3.** Cancelled is `[x]` with a **single** `~~` span wrapping the **entire text** (attribute block outside the wrap): the text starts with `~~`, ends with `~~`, and contains no interior `~~`. The model's `text` strips the wrapping `~~` and `state` is `"cancelled"`. A done item that merely *contains* struck phrases (two or more `~~…~~` spans) stays `"done"` with its text verbatim. `[parse/cancelled-reason]` `[parse/multi-strikethrough-done]`
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
- **ATTR-3.** Classes are free-form tags; `gate`, `optional`, `doing`, `waiting` are reserved. `[parse/gate-optional]` `[parse/doing-waiting]`
- **ATTR-4.** Reserved keys (closed set): `due`, `done`, `repeat`, `needs`, `verify`, `reason`. Extension keys MUST use the `x-` prefix. Any other key parses, is surfaced verbatim in `attrs` (so `fmt` cannot destroy data), and draws lint `unknown-key` (warning). `[parse/unknown-vs-x-key]` `[lint/unknown-key]`
- **ATTR-5.** Quoted values carry embedded whitespace; there are no escapes, so a value containing `"` is unrepresentable in v0. A quoted value without whitespace is equal to its bare form. `[parse/quoted-values]` `[fmt/quote-minimization]`
- **ATTR-6.** `needs=` is a comma-separated ID list with no spaces, parsed to an array; source order is meaningful and MUST be preserved by every serialization. `[parse/needs-list]` `[fmt/attr-order]`
- **ATTR-7.** `due`, `done`, and frontmatter `started` are `YYYY-MM-DD`; violations draw lint `invalid-date` (error). `[lint/invalid-date]`
- **ATTR-8.** `repeat=` MUST match `(done|due)+<n><unit>` with unit `d|w|m`; violations draw lint `invalid-repeat` (error). Repeat is data only — nothing in v0 executes recurrence. `[lint/invalid-repeat]` `[parse/canonical-run]`
- **ATTR-9.** A trailing block that does not tokenize — unbalanced quote or brace, or empty `{}` — is **not** attributes: the braces stay in the item text (L0 safety), the parser records a document warning, and lint reports `malformed-attributes` (error). `fmt` MUST leave such lines byte-untouched. `[parse/malformed-attributes]` `[lint/malformed-attributes]` `[fmt/spacing]`

## 5. IDs

- **ID-1.** IDs are human-readable slugs, unique per file. A repeated id draws lint `duplicate-id` (error) on each occurrence after the first; references resolve to the first occurrence. `[parse/duplicate-ids]` `[lint/duplicate-id]`
- **ID-2.** IDs are required only where something references them; a bare `- [ ] item` is a complete MDC item. `[parse/minimal]`
- **ID-3.** Conforming tools MUST address items by ID — never by line number or text match. `[mutate/check]`
- **ID-4.** `fmt --assign-ids` generates an ID for each item lacking one: lowercase the text, strip inline markdown syntax, take the first three words, join with `-`, strip characters outside `[a-z0-9-]`, collapse repeated hyphens. On collision with any existing or previously generated ID, append `-2`, `-3`, …. The result is deterministic for a given input file. `[fmt/fmt-assign-ids]`

## 6. Template vs. run

- **TPL-1.** `kind: template` documents carry the reusable procedure; `kind: run` documents are instances; `kind: list` (the default) is a plain checklist. All three use identical item grammar. `[parse/canonical-template]` `[parse/canonical-run]` `[parse/minimal]`
- **TPL-2.** A run pins `template: <path>@<version>`. The `@version` token is reserved syntax with unresolved semantics: v0 tools MUST preserve it verbatim and treat it as opaque. `[parse/canonical-run]`
- **TPL-3.** Run state accrues on item lines (`done=` stamps, assignees, `.doing`, cancellations with `reason=`) and in run frontmatter (`template`, `started`); the template carries none of it — compare `#pdf` open in the template and cancelled in the run. `[parse/canonical-template]` `[parse/canonical-run]` `[canonical-template.mdc.md]` `[canonical-run.mdc.md]`
- **TPL-4.** Cutting a run from a template copies the body byte-for-byte (prose and headings round-trip), writes fresh run frontmatter (`kind: run`, the pinned `template:` reference, an optional `title` override, `started`, and the template's `mode`), and resets every item to a pristine open state — clearing assignees, `done=`/`due=`/`reason=`, the `.doing`/`.waiting` classes, and any cancellation — so a well-formed template is a no-op to reset and a dirty one is cleaned. `[cut/from-canonical-template]` `[cut/strips-run-state]`

## 7. The L1 document model

- **MODEL-1.** `parse --json` emits `{ mdc, kind, title, frontmatter, items, warnings }`. `frontmatter` holds every frontmatter key verbatim; `kind` reflects the default when absent; `title` is `null` when absent. `[parse/canonical-run]` `[parse/minimal]`
- **MODEL-2.** Each item is `{ id, text, state, assignee, classes, attrs, section, line, children, computed }`. `id` and `assignee` are top-level and are not repeated in `attrs`; `classes` likewise. `attrs` holds every parsed key; `needs` is always an array, every other value a string. `[parse/canonical-run]` `[parse/needs-list]`
- **MODEL-3.** `computed` is `{ blocked, blockedBy, gatedBy, actionable, progress }` per section 8; derived state is never stored in the file. `[parse/canonical-run]`
- **MODEL-4.** `warnings` holds parser notices `{ rule, line, message }` for exactly: `malformed-attributes`, `multiple-ids`, `multiple-assignees`. All other findings are lint's job. `[parse/malformed-attributes]` `[parse/multiple-ids-assignees]`
- **MODEL-5.** `line` values are 1-based source line numbers; corpus comparison ignores them everywhere (C-1).

## 8. Derived semantics

- **DER-1.** **blocked**: an item is blocked when any `needs=` target is non-terminal `[parse/needs-list]`, unknown (dangling — also a lint error) `[parse/dangling-needs]`, or the item is a **non-terminal** member of a `needs` cycle (a mutual deadlock; also a lint error). A terminal (done/cancelled) cycle member is not blocked, and neither is a dependent whose only unmet target has become terminal. `[parse/needs-cycle]` `[parse/terminal-cycle-pair]`
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
- **FMT-6.** Values are quoted **iff** they contain whitespace. `[fmt/quote-minimization]`
- **FMT-7.** `fmt` is idempotent, and a canonical document is a fixpoint: running `fmt` on it is byte-identity. `[fmt/already-canonical]`
- **FMT-8.** Canonical re-serialization emits the model, so duplicate ids/assignees are dropped (first wins, ATTR-2). This is lossy by design; the `multiple-ids`/`multiple-assignees` lint errors are the guard. `[lint/multiple-ids]`
- **FMT-9.** Lines with malformed attribute blocks are left byte-untouched (ATTR-9). `[fmt/spacing]`
- **FMT-10.** Note (informative): `canonical-run.mdc.md` is the canonical *example*, not canonical *form* — the sketch orders some blocks `@assignee key .class`, which FMT-5 reorders. It is normative for parsing, not for `fmt` output.

## 10. Mutations (L2)

- **MUT-1.** The v0 mutation vocabulary, preconditions, and outcomes:

  | Verb | Precondition | Effect on the target line |
  |---|---|---|
  | `check` | state open | `[ ]` → `[x]`, set `done=<date>` `[mutate/check]` |
  | `uncheck` | state done | `[x]` → `[ ]`, remove `done=` `[mutate/uncheck]` |
  | `cancel` | not cancelled | `[x]`, wrap text in `~~`, set `reason="…"`, keep all other attributes `[mutate/cancel]` |
  | `claim` | no assignee set | set `@handle` `[mutate/claim]` |

- **MUT-2.** A failed precondition or unknown id is a domain refusal: exit `2`, file byte-untouched. `[mutate/claim-conflict]`
- **MUT-3.** Every mutation is line surgery: locate the target by ID, regenerate **only that line** in canonical form (section 9) with the mutation applied, copy every other byte through. On a canonical document every mutation is a one-line, byte-deterministic diff. `[mutate/check]`
- **MUT-4.** When the target line is non-canonical, the mutation also canonicalizes that line — still exactly one changed line. `[mutate/check-noncanonical]`
- **MUT-5.** Mutations (and `fmt`) take a `<file>.lock` lockfile opened `wx` (a lock older than 10 s is stale), write to `<file>.tmp-<pid>`, and atomically rename over the original. `claim`'s check-and-set inside the lock is the atomicity guarantee; concurrency is asserted by the implementation's claim-race test, which the corpus cannot express. (Informative; the observable byte behavior is normative via `[mutate/claim]` and `[mutate/claim-conflict]`.)

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

- **LINT-2.** A finding is `{ rule, severity, line, id, message }` with `id` the item's id or `null`; messages are normative as fixtured and MUST NOT embed line numbers. Findings are ordered per C-3. A clean document yields `[]`. `[lint/clean]`
- **LINT-3.** `non-canonical-state` fires exactly when `fmt` would change the line — markers, bracket case, spacing, indent, attribute order or quoting, or dropped duplicate sigils. `[lint/non-canonical-state]` `[lint/multiple-ids]`

## 12. Conformance levels

- **L0 — Render.** Any markdown viewer conforms by construction; `spec/rendering/` holds the paste-verification fixtures and procedure. `[canonical-run.mdc.md]`
- **L1 — Parse.** Emit the section-7 model for every `parse/` case, matching under C-1/C-2, and the section-11 findings for every `lint/` case under C-3. `[parse/canonical-run]` `[lint/clean]`
- **L2 — Mutate.** Additionally pass every `fmt/` case under C-4 and every `mutate/` case under C-5, with the exit-code law: `0` success, `1` usage/IO/parse/not-MDC, `2` domain refusal. `[fmt/already-canonical]` `[mutate/check]` `[mutate/claim-conflict]`
