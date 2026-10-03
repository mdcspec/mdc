# mdc-cr — MDC (Markdown Checklists) in Crystal

A third, independent implementation of [MDC](../../spec/mdc-spec-v0.1.md),
written in [Crystal](https://crystal-lang.org) and compiled via LLVM to a
single native binary. It joins the JavaScript reference (`packages/mdc`) and
the Python port (`impls/mdc-py`).

**Conformance: CONF-L2 — 82/82 corpus cases pass** (all families: parse, lint,
fmt, mutate, add, note, edit, cut), verified by the language-neutral runner at
`spec/conformance/run.py`.

The point of this implementation is **startup cost**. MDC is invoked
repeatedly inside agent loops and CI steps (`parse`, `next`, a `check`, another
`parse`, …). A native binary with near-zero startup pays nothing per
invocation, where a Node process pays its interpreter/JIT warm-up every time.

## What it is

- Crystal **standard library only** — `JSON` (the builder, for byte-precise
  model output), `Regex` (PCRE2), `File`/`Time`. No shards, no third-party deps.
- A **line-oriented parser**: task-item lines are matched by pattern, nesting
  depth is derived from leading indentation, and the trailing attribute block is
  extracted and tokenised by hand (quote-aware). This is a genuinely different
  parsing strategy from the JS reference's remark/unified pipeline — the same
  independence the Python port has.
- Single source file: [`src/mdc.cr`](src/mdc.cr).

## Build

Requires Crystal `>= 1.21` (`crystal --version` to confirm).

```sh
# from this directory
crystal build src/mdc.cr -o bin/mdc --release

# or from the repo root
crystal build impls/mdc-cr/src/mdc.cr -o impls/mdc-cr/bin/mdc --release
```

The compiled `bin/mdc` is a build artifact and is **git-ignored** (see
`.gitignore`) — build it locally; it is not committed. Release binary is ~700 KB.

## Run

```sh
bin/mdc parse checklist.mdc.md --json          # L1 document model → stdout
bin/mdc lint  checklist.mdc.md --json          # §11 findings → stdout
bin/mdc fmt   checklist.mdc.md                 # canonical form, in place
bin/mdc fmt --assign-ids checklist.mdc.md      # also generate missing ids
bin/mdc check checklist.mdc.md water --date 2026-07-26
bin/mdc add   checklist.mdc.md "Ship it" --id ship --needs ci --section Release
bin/mdc note  checklist.mdc.md ship "blocked on legal" --as ana
bin/mdc cut   template.mdc.md --out run.mdc.md --template-ref templates/x.md@5
```

Exit codes follow the contract: **0** success · **1** usage / IO / parse /
not-MDC · **2** domain refusal (on a refusal the file is left byte-untouched).
Machine output goes to stdout; human/error text to stderr.

## Conformance

From the repo root, after building:

```sh
python3 spec/conformance/run.py --cli "$PWD/impls/mdc-cr/bin/mdc"
# → MDC conformance (…/impls/mdc-cr/bin/mdc): 82/82 passed
```

`--level L1` (parse + lint) and `--family <f>` narrow the run.

## Startup performance

Measured on this machine (Apple Silicon, `aarch64-apple-darwin`), parsing the
canonical run document (`spec/corpus/canonical-run.mdc.md`) to JSON. Both tools
produce identical model output; only the per-process cost differs.

| Tool | Command | Per invocation (wall) |
|---|---|---|
| **mdc-cr (native)** | `bin/mdc parse … --json` | **~2.4 ms** (50 runs / 0.12 s) |
| Node reference | `node packages/mdc/src/cli.js parse … --json` | ~68 ms (20 runs / 1.37 s) |

A single cold invocation: **~3 ms** (Crystal) vs **~69 ms** (Node) — roughly a
**25–28x** startup advantage. The gap is almost entirely process start-up: the
actual parse is sub-millisecond for both on a document this size. That is the
whole argument for a native binary in an agent/CI inner loop — the cost that
dominates when a tool is spawned hundreds of times is the one this removes.

Reproduce:

```sh
CR=impls/mdc-cr/bin/mdc
time (for i in $(seq 50); do $CR parse spec/corpus/canonical-run.mdc.md --json >/dev/null; done)
time (for i in $(seq 20); do node packages/mdc/src/cli.js parse spec/corpus/canonical-run.mdc.md --json >/dev/null 2>&1; done)
```

## Portability notes

Things about the spec/corpus that were ambiguous or that I resolved by reading
another implementation (the Python port `impls/mdc-py/mdc.py` and the JS
reference `packages/mdc/src/*.js`), plus Crystal-specific gotchas:

- **Byte-exactness via a line model, not string normalization.** The contract
  (DET-6 and the byte-compare law) requires LF/CRLF and a leading UTF-8 BOM to
  survive untouched, and distinct fixtures assert each. The implementation reads
  the file, strips/records a BOM, splits on `\n`, and stores each line as
  `{content, ending}` where `ending` is `"\n"`, `"\r\n"`, or `""` (final line
  with no trailing newline). Every verb rewrites only `content` of the target
  line(s); `ending` and all other bytes copy through. Crystal's `File.write` of
  a UTF-8 string reproduces bytes exactly, and the BOM is carried as a literal
  `U+FEFF` char re-prepended on output.

- **`line` keys are emitted but ignored.** The runner strips every `line` key
  before comparing JSON. I emit `line` in warnings (not in items) for parity
  with the reference; it costs nothing since the runner discards it. The
  *authority* for present-empty is the fixtures: `attrs: {}`, `progress: null`
  on leaves, and `blockedBy`/`gatedBy`/`classes`/`children: []` are all built
  explicitly with the JSON builder so an empty collection is never omitted.

- **Frontmatter is parsed line-by-line, not with a YAML library.** Crystal has a
  `YAML` module, but the detection rule (`mdc:` must be a *string*; an unquoted
  `mdc: 0.1`, which YAML reads as a float, is `not-mdc`) is easier to get
  exactly right with a hand parser that tracks whether the value was quoted. I
  mirrored the Python port: a value is treated as a string if it was quoted or
  does not parse as a number (`String#to_f?(strict: true)`). Frontmatter values
  are surfaced verbatim as strings; v0 never rewrites frontmatter.

- **The trailing attribute block is found quote-aware**, per the contract's
  explicit warning (and `fmt/quote-brace-value`): scan for the opening `{` at
  brace-depth zero *and outside double quotes*, taking the last such top-level
  unquoted brace — not the textually last `{`. A brace inside a quoted value is
  ordinary text. I operate on a `Array(Char)` so indices are codepoint indices,
  matching the reference's Python/JS string semantics exactly rather than
  Crystal byte offsets.

- **`non-canonical-state` is defined operationally** as "fmt would rewrite this
  line": the lint rule compares `canonical_line(item)` against the raw source
  line. This is the cleanest reading of the spec and is what the reference does;
  it means the canonical serializer is the single source of truth for both
  `fmt` and that lint warning.

- **Lint findings sort is stable.** The contract orders findings by `(line,
  rule)`. Crystal's `Array#sort` is *not* guaranteed stable, so I sort by
  `(line, rule, original-index)` to reproduce Python's stable-sort tie-breaking
  for findings that share a line and rule (e.g. two `unknown-key` on one line).

- **`add`/`note` placement and depth** were only fully pinned by reading the
  reference: `--after` inserts after the target *and its nested block* (lines
  more indented than the target), inheriting the target's depth; `--section`
  inserts after the last non-blank line before the next heading; `note` appends
  chronologically after any existing `- note` children. These are covered by
  `add/*` and `note/chronological-append`.

- **Crystal gotcha — `out` is a reserved keyword** (used for C-binding output
  parameters), so it cannot be a local variable name. Three natural
  `out`-named locals had to be renamed. Worth flagging for anyone porting from
  Python/JS where `out` is a common accumulator name.

- **Crystal gotcha — regex literals interpolate `#{…}`.** `HEADING_RE`'s
  `#{1,6}` quantifier and the `#`/`{` in other patterns would be read as string
  interpolation inside a `/.../ ` literal, so the task/list/heading regexes are
  built with `Regex.new(%q{…})` (no interpolation in `%q`).
