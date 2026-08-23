# Implementation Contract (v0)

*The engineering decision record that bridges the [format sketch](mdc-format-sketch.md) and the MVP code: every ambiguity an implementer would otherwise resolve ad hoc is pinned here. The [MVP definition](../planning/mvp-definition.md) says what to build; this says exactly how the pieces must behave so the corpus, parser, and CLI agree byte-for-byte.*

> Precedence: where this document and the [format sketch](mdc-format-sketch.md) conflict, the sketch's *intent* wins but this document's *mechanics* win — file an issue rather than silently diverging. The spec corpus (`spec/corpus/`) is authoritative over both once a fixture exists.

## Toolchain

- **Language:** Plain ESM JavaScript with JSDoc type annotations. No TypeScript, no build step. Node `>= 20`.
- **Tests:** `node:test` (built-in). No test-framework dependencies.
- **Dependencies (closed set):** `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `yaml`. Nothing else without a documented reason in this file.
- **Package:** `packages/mdc/` — npm name `@mdcspec/mdc`, `"private": true` for now, `"type": "module"`, `"bin": { "mdc": "./src/cli.js" }`, version `0.1.0`. Root `package.json` is a private workspace container.

## Repo layout

```
packages/mdc/
  package.json
  src/
    frontmatter.js   # in-band detection, YAML parse of the frontmatter block
    attributes.js    # attribute-block microgrammar: parse + canonical serialize
    parse.js         # remark pipeline -> L1 document model (exports remarkMdc plugin + parseDocument)
    model.js         # derived computation: blocked / actionable / gates / rollups / next
    lint.js          # lint rules over the parsed model + raw lines
    fmt.js           # canonical form; --assign-ids slug generation
    mutate.js        # L2 line-surgery mutations + atomic write + lockfile
    cli.js           # verb dispatch, flags, exit codes (has #!/usr/bin/env node shebang)
  test/
    parse.test.js    # runs corpus parse/ and lint/ cases
    fmt.test.js      # runs corpus fmt/ cases + idempotence property
    mutate.test.js   # runs corpus mutate/ cases + minimal-diff property + claim race
    cli.test.js      # spawns the real CLI; exit codes, --json shapes, stdin
    corpus.js        # shared fixture-discovery + comparison helpers
spec/
  mdc-spec-v0.1.md   # executable spec: every normative rule cites a corpus case by name
  corpus/
    canonical-run.mdc.md
    canonical-template.mdc.md
    parse/<case>/input.mdc.md + expected.json
    lint/<case>/input.mdc.md + expected.json          # array of findings
    fmt/<case>/input.mdc.md + expected.mdc.md
    mutate/<case>/input.mdc.md + op.json + expected.mdc.md
  rendering/         # L0 fixtures + instructions for manual GitHub/GitLab paste-verification
checklists/
  mvp-build.mdc.md   # dogfood: this project's own build checklist, mutated by the real CLI
```

## In-band detection

A document is MDC iff it begins with a YAML frontmatter block (`---` fence on line 1) whose mapping contains the key `mdc` with a string value. Detection tolerates a leading UTF-8 BOM and CRLF line endings. `mdc: "0.1"` is the only version accepted; another string value → `unsupported-version` error naming both versions. A file without the key is **not an MDC document** (exit `1`, `not an MDC document (missing 'mdc' frontmatter key)`); a present-but-non-string value (e.g. unquoted `mdc: 0.1`, which YAML reads as a number) gets a distinct `not-mdc` message telling the author to quote it. Frontmatter is parsed with `yaml`, surfaced verbatim in the model, and **never rewritten** by any verb in v0 — `fmt` and all mutations preserve frontmatter and all prose bytes exactly; only task-item lines are ever rewritten.

Recognized frontmatter keys: `mdc` (required), `kind` (`template | run | list`, default `list`), `title`, `template`, `mode` (`read-do | do-confirm`), `started`. Unknown keys are preserved and surfaced, never an error.

## Attribute-block microgrammar

An item line's attribute block is a trailing `{…}` at end of line, preceded by at least one space (or the whole text is the block — disallowed: an item must have text). Grammar, tokenized on whitespace outside double quotes:

```
block   := "{" token (SP token)* "}"
token   := id | class | assignee | kv
id      := "#" slug          # at most one; second+ = lint "multiple-ids", first wins
class   := "." slug          # free-form; reserved: gate, optional, doing, waiting
assignee:= "@" slug          # at most one; second+ = lint "multiple-assignees", first wins
kv      := key "=" value
key     := slug              # reserved (closed set): due, done, repeat, needs, verify, reason
                             # extensions MUST use "x-" prefix; any other key = lint "unknown-key" (warning)
value   := bare | quoted
bare    := 1*(any char except whitespace, '"', '{', '}')
quoted  := '"' *(any char except '"') '"'    # no escape sequences in v0
slug    := 1*(a-z A-Z 0-9 - _ /)             # needs= values may also contain "," and cross-file refs "." "#"; template paths "." "@"
```

- `needs=` value is a comma-separated ID list, no spaces (`needs=a,b`). Parsed to an array. A target containing `#` is a cross-file reference (`path#id`): opaque to v0 — preserved verbatim, excluded from blocked/dangling (never a blocking edge, never `dangling-needs`), lint warns `unresolved-cross-file-ref`.
- Dates (`due`, `done`, `started`) are `YYYY-MM-DD`; violations → lint `invalid-date` (error).
- `repeat=` must match `(done|due)\+<n><unit>` with unit `d|w|m`; else lint `invalid-repeat` (error). Data only — nothing executes recurrence.
- A block that does not tokenize (unbalanced quote/brace, empty `{}`) is **not** treated as attributes: the braces stay part of the item text (L0 safety), the parser records a document-level warning, and lint reports `malformed-attributes` (error) at that line.

**Canonical serialization** (used by `fmt` and by every mutation when it rewrites a line): `{#id .class-a .class-b @assignee key=value}` — order: id, classes (alphabetical), assignee, then keys alphabetical; single spaces; a value is quoted iff it contains whitespace or a brace (`{`/`}`) or is empty, else bare (a value containing `"` is unrepresentable in v0); `needs` list comma-joined in source order (not sorted — order may be meaningful to readers).

## Item grammar and states

An item line is: `<indent>- [<mark>] <text>[ <attribute-block>]` where `<mark>` is space, `x`, or `X`. Canonical: marker `-` (fmt normalizes `*` and `+` task items to `-`), `[X]` → `[x]`, child indent exactly 2 spaces per nesting depth, one space between all parts. States:

| State | Stored as | Notes |
|---|---|---|
| open | `- [ ] text` | |
| done | `- [x] text` | `done=YYYY-MM-DD` stamp recommended, written by `mdc check` |
| cancelled | `- [x] ~~text~~` | `~~` wraps the entire text (attrs outside); `reason="…"` recommended |

`text` in the L1 model is the verbatim inline markdown between the bracket and the attribute block, with the wrapping `~~` stripped for cancelled items. Terminal = done or cancelled.

## L1 JSON document model

`mdc parse --json` emits exactly this shape (stable key order not required; `line` keys are 1-based source line numbers):

```json
{
  "mdc": "0.1",
  "kind": "run",
  "title": "Release 2.4.0",
  "frontmatter": { "mdc": "0.1", "kind": "run", "…": "all keys verbatim" },
  "items": [
    {
      "id": "ci",
      "text": "CI green on `release/2.4`",
      "state": "open",
      "assignee": null,
      "classes": [],
      "attrs": { "needs": ["branch"], "verify": "npm test" },
      "section": "Verify",
      "line": 21,
      "children": [],
      "computed": {
        "blocked": true,
        "blockedBy": ["branch"],
        "gatedBy": [],
        "actionable": false,
        "progress": null
      }
    }
  ],
  "warnings": []
}
```

- `items` is the nested tree in document order; `children` holds nested task items. Non-task list items and all prose are not in the model (they round-trip untouched).
- `attrs` holds reserved + `x-` keys; `needs` is always an array; everything else a string. `id`, `assignee` are top-level (not repeated in `attrs`); `classes` likewise.
- `section` is the text of the nearest preceding heading at any depth, else `null`.
- `progress` is `null` for leaf items; for parents: `{ "done": n, "total": m }` counting **direct and transitive** children, excluding cancelled items from both numerator and denominator.
- Corpus comparison ignores the `line` key everywhere (it is volatile under fixture edits); unit tests cover line anchoring separately.

## Derived semantics (computed, never stored)

- **blocked**: any *local* `needs=` target is non-terminal, dangling (unknown ID → also lint error), or the item is a **non-terminal** member of a `needs` cycle (deadlock; cycle → lint `needs-cycle` error). A terminal cycle member — and a dependent whose only unmet target has become terminal — is not blocked. Cross-file targets (`path#id`) are excluded: never a blocking edge, so an item whose only unmet need is cross-file is actionable.
- **gates**: for each `.gate` item G, every item *after* G in document order (by line) that is not `.optional` is gated (`gatedBy` includes G's id or `"<line N>"` if G has no id) until G is terminal. Gates apply document-wide regardless of nesting. A gate item itself is gated only by *earlier* gates.
- **parent/child**: children inherit `blocked`/`gatedBy` from their parent (union), **except** an `.optional` item is exempt from gating entirely — its `gatedBy` is always empty, direct or inherited. A parent with at least one non-terminal child is not actionable — its children are the work.
- **actionable**: `state == open` ∧ not blocked ∧ not gated ∧ all children terminal. `.doing` / `.waiting` are informational only and do not affect actionability.
- **next**: actionable items in document order. `mdc next --json` emits the full ordered array (agents pick); `mdc next` human form shows the first with the rest summarized.

## Lint rules (closed set for v0)

`duplicate-id`, `dangling-needs`, `needs-cycle`, `malformed-attributes`, `multiple-ids`, `multiple-assignees`, `invalid-date`, `invalid-repeat`, `unknown-key` (warning), `non-canonical-state` (warning: `[X]`, `*`/`+` markers, non-canonical attribute order/spacing — i.e. "fmt would change this line"), `cancelled-without-reason` (warning), `unpinned-template` (warning: a `kind: run` whose `template:` value has no `@version` suffix — token after the final `@` — so it may drift when the template changes), `unresolved-cross-file-ref` (warning: a `needs=` target of the form `path#id` — opaque to v0, not resolved). Findings JSON: `[{ "rule", "severity": "error"|"warning", "line", "id": null|"…", "message" }]`.

## CLI contract

`mdc <verb> <file> [flags]`. Read verbs (`parse`, `lint`, `status`, `next`, `fmt --check`) accept `-` for stdin; mutations and `fmt` (in-place) require a real path. Global flag `--json` where noted.

| Verb | Behavior | Exit codes |
|---|---|---|
| `parse --json` | L1 model to stdout | 0; 1 on error/not-MDC |
| `lint [--json]` | findings report | 0 clean (warnings allowed unless `--strict`); 2 findings with severity error; 1 error |
| `status [--json]` | totals, progress (cancelled excluded), blocked/actionable/doing lists, per-section rollup | 0; 1 |
| `next [--json] [--as <handle>]` | ordered actionable items; `--as` keeps only that handle's own + unclaimed items | 0 (even if empty); 1 |
| `report [--json]` | standup buckets (done / in-progress / ready / blocked-with-cause / cancelled) + per-assignee load | 0; 1 |
| `fmt [--check] [--assign-ids]` | canonical form in place; `--check` exits without writing | 0 unchanged/success; 2 `--check` found drift; 1 error |
| `add "<text>" […flags] [--after <id> \| --section <heading>]` | new open item, canonical, placed at end / after an item / in a section; echoes its line | 0; 2 `--id` collision or unknown `--after`/`--section`; 1 empty text / bad slug / bad date / both placement flags / not-MDC |
| `check <id> [--date YYYY-MM-DD]` | open → done, writes `done=` stamp (default: today), clears `.doing`/`.waiting` | 0; 2 unknown id or already terminal; 1 |
| `uncheck <id>` | done → open, removes `done=` | 0; 2 unknown id or not done; 1 |
| `cancel <id> --reason "…"` | any non-cancelled → cancelled, wraps `~~`, writes `reason=`, clears `.doing`/`.waiting` | 0; 2 unknown id or already cancelled; 1 |
| `claim <id> --as <handle>` | sets `@handle` **iff no assignee set** | 0; 2 unknown id or assignee already set; 1 |
| `note <id> "<text>" [--as <handle>] [--date <date>]` | append a nested prose note `  - note @who date: text` under the item; invisible to the model | 0; 2 unknown id; 1 empty/multiline text or bad flag |
| `edit <id> [--text …] [--needs a,b \| --add-needs x --rm-needs y] [--add-class c] [--rm-class c] [--due <date>]` | amend an existing item's text/needs/classes/due (not state, assignee, `.doing`, or id) | 0; 2 unknown id; 1 no field, conflicting needs flags, soft-class edit, or bad slug/date |
| `unclaim <id> [--from <handle>]` | clears `@assignee`; `--from` refuses on owner mismatch | 0; 2 unknown id, no assignee, or `--from` mismatch; 1 |
| `start <id>` / `unstart <id>` | add / remove the `.doing` class (informational; STATE-6) | 0; 2 unknown id, not open / already `.doing` (start), or not `.doing` (unstart); 1 |
| `cut <template> [--out <file>] [--title …] [--as-version <v>] [--date …]` | instantiate a run from a template; to `--out` or stdout | 0; 2 `--out` exists (no overwrite); 1 not-MDC / not a template |

Exit-code law: `0` success · `1` usage / IO / parse / not-MDC errors · `2` domain refusal (lint errors, `fmt --check` drift, mutation precondition failed, `cut --out` would overwrite). Agents branch on `2`. Errors go to stderr; machine output to stdout only.

Every mutating verb (`add`/`check`/`uncheck`/`cancel`/`claim`/`unclaim`/`start`/`unstart`/`note`) echoes the resulting canonical line to stdout on success, so a caller sees the exact change without a follow-up read. For `add`, the new item's id is the `#…` token in that line. Nothing is written to stdout on a refusal or error.

## Cut algorithm (template → run)

`cut` reads a `kind: template` (not stdin — it needs the source path for the `template:` reference) and emits a `kind: run`:

1. Parse the source; refuse a non-template with exit 1.
2. Write fresh run frontmatter in canonical order — `mdc`, `kind: run`, `template: <ref>`, `title` (override or the template's), `mode` (from the template if present), `started` (`--date` or today) — preserving any extra template keys. `<ref>` is the source path relative to `--out`'s directory (or as given when writing to stdout), with `@<version>` appended when `--as-version` is passed. Frontmatter is serialized with the `yaml` library so `mdc` stays a quoted string.
3. Copy the body byte-for-byte; on each item line, reset to a pristine open state (clear assignee, `done=`/`due=`/`reason=`, `.doing`/`.waiting`, un-cancel) and re-serialize canonically, preserving the line ending. A well-formed template's item lines are unchanged.
4. With `--out`, write with `wx` (exit 2 rather than overwrite); otherwise stdout. The template is never modified.

## Mutation algorithm (L2)

Every mutation is line surgery — never a full re-serialize:

0. Resolve the path with `realpathSync` so the lock, tmp, and rename all act on the real inode — a mutation through a symlink writes the real document and leaves the link a link. (Missing file → ENOENT → exit 1.)
1. Acquire lockfile `<file>.lock` with `wx`, writing a unique ownership token (pid + time + nonce). A lock older than 10 s is stale and is reaped by **rename** (not unlink) so exactly one contender wins the takeover; two parallel unlinks could otherwise both proceed to `wx`-create. All mutations, including `fmt`, take the lock.
2. Read the file, parse, locate the target item by ID (never by text or line number).
3. Regenerate **only that item's line** in canonical form with the mutation applied, re-attaching that line's original CR so a CRLF document stays CRLF. All other bytes are copied through untouched.
4. Re-verify lock ownership, then write to `<file>.tmp-<pid>`, restore the target's file mode, and atomically `rename` over the original; the tmp is unlinked on any failure after it is created. Release the lock only while it is still ours (never unlink a rival's lock that legitimately reaped ours).

Consequences: on canonical-form documents every mutation is a one-line diff and byte-deterministic; on a non-canonical target line the mutation also canonicalizes that line (still one line — documented behavior, covered by a corpus case). `claim`'s check-and-set inside the lock is the atomicity guarantee; the race test spawns ≥5 concurrent `claim` processes and asserts exactly one exit 0, rest exit 2, including a variant that plants a stale lock all contenders must reap.

## Slug generation (`fmt --assign-ids`)

For each item lacking an ID: lowercase the text, strip inline markdown syntax, take the first three words, join with `-`, strip chars outside `[a-z0-9-]`, collapse repeats. On collision with any existing or previously generated ID in the file, append `-2`, `-3`, …. Deterministic — same input file always yields the same IDs.

## Testing requirements (CI = `npm test` at root)

1. **Corpus runner**: every `spec/corpus/` case executes; parse cases deep-equal ignoring `line`; fmt/mutate cases byte-equal.
2. **Idempotence property**: `fmt(fmt(x)) === fmt(x)` for every corpus document.
3. **Minimal-diff property**: every mutate case changes exactly one line vs input (assert via line-array diff).
4. **Round-trip property**: for every corpus document, all bytes outside rewritten item lines are unchanged after any verb.
5. **Claim race**: concurrent-process test as above.
6. **CLI black-box**: `cli.test.js` spawns the real binary; asserts exit codes and JSON shapes, not internals.

## Style

Code comments follow repo norms: only for constraints the code can't express. No timeline language anywhere. The CLI's `--help` text is part of the agent-facing API — keep it accurate and terse.
