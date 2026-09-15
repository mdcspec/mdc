# MDC implementations

Known implementations of [MDC (Markdown Checklists)](../../spec/mdc-spec-v0.1.md), each keyed to the highest [conformance class](../../spec/conformance.md) and spec version it passes. Modeled on the CommonMark and TOML implementation lists: an entry earns its row by passing the machine-checkable conformance corpus, not by assertion.

Conformance classes (see [spec §12](../../spec/mdc-spec-v0.1.md) and the [conformance contract](../../spec/conformance.md)):

- **CONF-L0 — Render.** Any Markdown/GFM renderer, by construction.
- **CONF-L1 — Parse.** Passes every `parse/` and `lint/` case (the L1 JSON model and lint findings).
- **CONF-L2 — Mutate.** L1, plus every `fmt/`, `mutate/`, `add/`, `note/`, `edit/`, and `cut/` case, holding the minimal-diff and idempotence properties.

## Registry

| Implementation | Language | Conformance | Spec version | Notes |
| --- | --- | --- | --- | --- |
| [`@mdcspec/mdc`](../../packages/mdc/) | JavaScript (Node ≥ 20) | CONF-L2 | v0.1 | The reference parser and CLI. `remark` + `remark-gfm` + `remark-frontmatter`; the source of truth for the corpus's expected outputs. |
| [`impls/mdc-py`](../../impls/mdc-py/) | Python 3 (stdlib only) | CONF-L2 | v0.1 | Second, independent implementation — a different parsing strategy, no `pip` dependencies. The pre-1.0 credibility gate: proof the spec is implementable twice from the spec + corpus rather than from the reference code. |

## Getting listed

An implementation earns a row by passing the conformance corpus — nothing is taken on assertion. Point the language-agnostic runner at your binary:

```
python3 spec/conformance/run.py --cli "<your CLI command>"          # all cases → CONF-L2
python3 spec/conformance/run.py --cli "<your CLI command>" --level L1  # parse + lint only → CONF-L1
```

The runner ([`spec/conformance/run.py`](../../spec/conformance/run.py)) is standard-library Python and consumes only [`spec/corpus/manifest.json`](../../spec/corpus/) plus the [CLI contract](../../spec/conformance.md) — it has no knowledge of any implementation's language. `run.py` exits `0` iff every selected case passes. The highest all-green level is the class you may claim.

To add your implementation here, open a pull request that (1) shows `run.py` green against your binary at the claimed level and spec version, and (2) adds a row above. New implementations in any language are welcome; the corpus is MIT-licensed precisely so it can be vendored verbatim into your own test suite.
