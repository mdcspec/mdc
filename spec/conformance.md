# MDC Conformance — the language-neutral test contract

*How to check any implementation of MDC against the conformance corpus, in any language. The corpus under [`corpus/`](corpus/) is a set of inert fixtures; this document is the contract for **running** them, so a second implementation can earn conformance without reverse-engineering the reference tool's JavaScript. It is the operational companion to the [spec](mdc-spec-v0.1.md) §0 (corpus conventions) and §12 (conformance classes).*

The design principle, borrowed from CommonMark's `spec_tests.py` and TOML's `toml-test`: **all knowledge lives in inert data plus a thin process contract.** An implementation is driven entirely through its command-line interface; nothing in the suite depends on the implementation's language.

## The CLI contract an implementation must expose

A conformant tool provides these invocations (the reference is `mdc`; a second implementation substitutes its own command). Exit-code law throughout: **`0`** success · **`1`** usage / IO / parse / not-MDC · **`2`** domain refusal. Machine output goes to **stdout**; human/error text to **stderr**.

| Verb | Invocation | Produces |
|---|---|---|
| parse | `parse <file> --json` | the L1 document model (spec §7) as JSON on stdout |
| lint | `lint <file> --json` | the findings array (spec §11) as JSON on stdout |
| fmt | `fmt <file>` / `fmt --assign-ids <file>` | rewrites `<file>` in canonical form (spec §9) in place |
| mutations | `check`/`uncheck`/`cancel`/`claim`/`unclaim`/`start`/`unstart` `<file> <id> [flags]` | rewrite the target line in place; echo it to stdout |
| add / note / edit | `add <file> "<text>" [flags]` · `note <file> <id> "<text>" [flags]` · `edit <file> <id> [flags]` | create/annotate/amend; echo the resulting line |
| cut | `cut <template> --out <file> [--template-ref <ref>] …` | write a run document |

Full flag semantics and exit codes are in the [implementation contract](../docs/spec/implementation-contract.md).

## Running a case

Each case is a directory `corpus/<family>/<case>/` containing `input.mdc.md` and an expected artifact. To run one, in a scratch copy:

1. Copy `input.mdc.md` to a working path `$FILE` (mutating families rewrite it in place; read-only families never touch it).
2. Invoke the CLI per the family recipe below, substituting `$FILE` (the working copy) and, for `cut`, `$OUT` (a fresh output path).
3. Compare the result under the family's **compare mode** (below).

A machine-readable index of every case — its family, conformance level, argv, and compare mode — is provided at [`corpus/manifest.json`](corpus/manifest.json) so a runner can iterate without directory-shape heuristics.

### Family recipes

| Family | argv | Expected artifact | Compare mode |
|---|---|---|---|
| `parse` | `parse $FILE --json` | `expected.json` **or** `error.json` | **json-model** — or, for `error.json`, exit `1` and the error token (see below) |
| `lint` | `lint $FILE --json` | `expected.json` (ordered findings) | **json-findings** |
| `fmt` | `fmt $FILE` (or `fmt --assign-ids $FILE`) | `expected.mdc.md` | **bytes** (`$FILE` after) |
| `mutate` | the case's argv (verb, id, flags) | `expected.mdc.md` **or** `expected-error.json` `{exit:N}` | **bytes**, or **exit** (file byte-unchanged) |
| `add` / `note` / `edit` | the case's argv | `expected.mdc.md` **or** `expected-error.json` | **bytes**, or **exit** |
| `cut` | `cut $FILE --out $OUT --template-ref <ref> …` | `expected.mdc.md` | **bytes** (`$OUT`) |

The `--assign-ids` flag and every mutation flag are carried explicitly in each case's argv (in the manifest), never inferred from the case name.

## Comparison law (normative — this is what "matches" means)

A second implementation gets these for free from a JS `deepStrictEqual`/string compare; stated here so a Rust/Go/Python implementation matches exactly.

### JSON comparison (`json-model`, `json-findings`)
- **Object keys are unordered**; **arrays are ordered** (item order, `needs=` order, findings order are all significant).
- Every **`line` key is ignored at any depth** (line numbers are volatile; fixtures omit them).
- **Present-empty is distinct from absent.** `attrs: {}` (present, empty), `progress: null` (present, null for leaves), `blockedBy: []` (present, empty) are each required exactly as fixtured — an implementation that omits an empty `attrs` or a null `progress` does **not** conform.
- Numbers are compared by value; MDC's model has no floats (progress counts are integers).

### Byte comparison (`bytes`)
- Compared **byte-for-byte** after a defined newline policy: a fixture and its result must agree on line endings. LF and CRLF behaviors are asserted by **distinct fixtures** (a CRLF fixture expects CRLF output); a runner MUST NOT normalize newlines before comparing.
- A trailing newline is significant and preserved as the input had it.
- A leading UTF-8 BOM, if present in the input, is preserved in the output and is part of the compared bytes (spec DET-6).
- Unicode is compared as stored bytes. If a checkout's filesystem returns decomposed forms (NFD, e.g. some macOS setups), normalize to **NFC for the comparison only** — never rewrite stored fixtures. MDC tooling never changes the Unicode normalization of item text.

### The error token (`parse` error cases)
An `error.json` case is `{"error": "<token>"}` with token ∈ `not-mdc`, `unsupported-version`. A conformant `parse` **MUST** exit `1` and emit `{"error":"<token>"}` as JSON on stdout, so the two classes are distinguishable through the CLI (not only as an internal exception). A runner that only checks the exit code still conforms at the coarse level; matching the token is the finer check.

## Conformance classes

See spec [§12](mdc-spec-v0.1.md) for the normative statements. In brief, an implementation MAY claim:

- **L0 — Render.** Any Markdown/GFM renderer, by construction. Verified by the paste procedure in [`rendering/README.md`](rendering/README.md).
- **L1 — Parse.** Passes every `parse/` case (json-model, incl. error cases) and every `lint/` case (json-findings). This is the parser-credibility class — the one a second-language implementation targets first.
- **L2 — Mutate.** L1, plus every `fmt/`, `mutate/`, `add/`, `note/`, `edit/`, and `cut/` case (bytes/exit), holding the minimal-diff and idempotence properties.

## Bootstrapping a second implementation

The corpus (`corpus/`) is MIT-licensed precisely so it can be vendored verbatim into another implementation's test suite. A reference conformance runner that consumes only this contract + the manifest + a CLI command path — re-pointable from the JS `mdc` to any other binary — is the proof that the contract is portable; it is the concrete deliverable behind the spec's "a second-language parser is a hard gate before 1.0."
