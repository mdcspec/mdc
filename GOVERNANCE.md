# MDC Governance

*How decisions about the MDC (Markdown Checklists) format are made, who holds its assets, and how stewardship will hand off as the project grows. Pre-committed at v0.1 — the honest model for a young format, with the mechanical preconditions for graduation already in place. This resolves [open question #6](docs/vision/risks-critiques-open-questions.md).*

## Model: single-maintainer, corpus-arbitrated

MDC is currently governed by a **single maintainer (BDFL model)**. This is the honest description of a young, pre-1.0 format — manufacturing a committee that does not exist would be cargo-cult governance. But the maintainer is bound, from v0.1, by three rules that the successful precedents (CommonMark, TOML) had and the cautionary one (Markdown) lacked:

1. **The conformance corpus is the arbiter, not the maintainer's opinion.** Any dispute about how MDC *behaves* is resolved by adding to or citing a fixture in [`spec/corpus/`](spec/corpus/), never by fiat. The spec states this already ("where a fixture and a sentence disagree, the fixture wins"; "a rule without a passing fixture is not normative"). This is what let CommonMark scale disagreements without a hierarchy.

2. **Everything is neutral-namespaced from the first public commit.** The repository, the `@mdcspec` npm scope, the project domain, and the IANA change-controller designation are held under the neutral **`mdcspec`** project identity — never a personal account and never a company's namespace. Handoff then becomes "add a maintainer to the org," not "transfer someone's personal or corporate assets."

3. **Change is closed-by-default** (see [Change policy](#change-policy)).

## Stewardship and asset custody

- **Current steward:** the project is stewarded by **DireLabs** (Tim Walsh) during the single-maintainer phase. DireLabs backs the project as a real, accountable entity; it does **not** own the format. The format's public identity is the neutral `mdcspec` namespace.
- **Assets held for the project, not personally:** the `mdcspec` GitHub org, the `@mdcspec` npm scope, the project domain, and the IANA change-controller role are project assets held in trust for the future council (below), not personal or corporate property. A second org admin is maintained at all times as bus-factor insurance.
- **One source of record.** The spec repository is the single normative source. The IANA registration's "Published specification" URL, the npm README, and the project domain all link back to it and never restate normative text — so MDC can never fork its own spec across surfaces (the lesson of JSON's dual ECMA-404 / RFC 8259 standardization).

## Graduation path (evidence-gated, no dates)

Stewardship converts from single-maintainer to a shared body when the evidence — not a calendar — says the format has outgrown one person:

> **Graduation trigger.** MDC converts from single-maintainer stewardship to a **3–5 seat implementers' council** when *either*
> (a) a second independent implementation ships and passes the conformance corpus (MDC's stated hard gate before 1.0), *or*
> (b) three or more distinct organizations or individuals maintain MDC-consuming tooling in production.
>
> **Council formation.** Seats are offered first to maintainers of conformance-passing implementations (the CommonMark "people who have written parsers" principle). The council inherits the `mdcspec` org, the IANA change-controller designation, the npm scope, and the domain — no re-registration is required, because those assets were never personally held.
>
> **Council mandate.** Normative changes are made by documented rough consensus, with the conformance corpus as tiebreaker; the council publishes a lightweight decision log.

## Sunset / bus-factor clause

If the maintainer becomes inactive for a sustained dormancy window with no council yet formed, the existing `mdcspec` org admins (a second admin exists from day one for exactly this) may appoint an interim steward. The neutral org namespace makes this possible without recovering any individual's personal account.

## Change policy

MDC's durability depends on resisting feature growth (see [risks and open questions](docs/vision/risks-critiques-open-questions.md), #7). Normative changes are **closed-by-default**:

- The v0 reserved attribute-key set is **closed at six** (`due done repeat needs verify reason`); extension keys use an `x-` prefix.
- The bracket grammar is frozen to GFM's two task-list states; MDC adds only the struck-through cancelled convention.
- **Every normative change requires a conformance fixture** and a spec rule that cites it. No fixture, not normative.
- The standing filter on any proposed feature: ***"would todo.txt have added this?"*** If the answer is no, it belongs above the format (in tooling) or in the deferred `.mddb` layer, not in `.mdc`.

## Versioning and stability

- The spec is versioned with [SemVer](https://semver.org/) semantics; `mdc: "0.1"` in frontmatter is the currently accepted version.
- **Stability strategy:** MDC follows CommonMark's posture — a **carefully-versioned `0.x` line** that downstream tools can depend on, with **`1.0` deliberately gated on a second independent implementation existing** (the proof the spec is implementable from its text alone). The format does not rush to 1.0; a stable 0.x is a legitimate long-term target, as CommonMark has demonstrated at planetary scale.

## Proposing changes

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: open an issue, and let the conformance corpus — not opinion — settle behavioral questions.
