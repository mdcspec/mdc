# Contributing to MDC

Thanks for your interest in Markdown Checklists (MDC). This project is small and deliberately disciplined; these are the rules that keep it that way. Governance and the stewardship/graduation model live in [`GOVERNANCE.md`](GOVERNANCE.md).

## The one rule that matters most

**The conformance corpus is the arbiter.** Any question about how MDC *behaves* — what parses, what lints, what a mutation produces — is settled by a fixture in [`spec/corpus/`](spec/corpus/), not by discussion or by what the reference implementation happens to do. If you think MDC does the wrong thing, the productive move is a failing (or proposed) fixture, not a prose argument.

Corollary from the spec: **a rule without a passing fixture is not normative**, and where a fixture and a sentence disagree, the fixture wins.

## Proposing a change

1. **Open an issue first** for anything normative (grammar, semantics, a new verb, a lint rule). Describe the behavior and, ideally, the fixture that would demonstrate it.
2. Normative changes are **closed-by-default**. Before proposing a feature, apply the project's standing filter: ***"would todo.txt have added this?"*** If not, it likely belongs in tooling above the format, or in the deferred `.mddb` layer — not in `.mdc`. The reserved attribute-key set is closed at six; the bracket grammar is frozen to GFM's two states.
3. **Every normative change ships with a corpus fixture and a spec rule that cites it.** A PR that changes behavior without a fixture will be asked to add one.

## Working in the code

- The reference implementation is **ESM JavaScript with JSDoc types** — no TypeScript, no build step. Node ≥ 20.
- Dependencies are a closed set (`unified`, `remark-*`, `yaml`). Adding one needs a documented reason.
- Run the whole suite from the repo root:
  ```
  node --test "packages/mdc/test/*.test.js"
  ```
- Keep mutations minimal-diff: an L2 verb regenerates exactly the target line in canonical form; `fmt` must remain idempotent. The corpus enforces both.
- Comments explain constraints the code cannot; match the surrounding style.

## Fixtures

- A parse case is `parse/<case>/input.mdc.md` + `expected.json` (or `error.json`); lint/fmt/mutate/cut/add/note follow the conventions in spec §0. Fixtures omit volatile `line` keys.
- Prefer adding a case to the existing family over inventing a new mechanism.

## Licensing of contributions

By contributing you agree that your contributions are licensed under the project's licenses: **MIT** for code and the conformance corpus (`LICENSE`), and **CC BY 4.0** for specification/documentation prose (`LICENSE-docs`). If organizational contributions arrive later, the project will adopt a lightweight contributor agreement / patent non-assertion (e.g. OWFa) at that point so the spec stays freely implementable; this note is the advance warning.

## Reporting security-relevant issues

MDC adds no active content, and the reference tooling never executes `verify=` command strings (it treats them as data). If you find a way the tooling could execute untrusted input or resolve references unsafely, please report it privately to the maintainer contact listed in the IANA registration rather than opening a public issue.
