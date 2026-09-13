# Standardization Roadmap — making `.mdc` its own standard

*How MDC (Markdown Checklists) crosses from "a tool with a spec" to "a format others independently implement and cite." Synthesized from a five-stream research pass (standardization mechanics · conformance portability · governance & licensing · adoption & open-source timing · M0 namespace). Sequencing only — no dates, per project convention; each phase gates the next.*

## The core finding that reframes the goal

**No comparable format became a standard by way of a standards body.** CommonMark, GFM, MDX, Markdoc, TOML, and YAML front matter are all *de-facto* standards — none is an RFC/ISO/W3C standard. What actually confers legitimacy, in order of load-bearing weight:

1. A credible **reference implementation** others test against (universal).
2. **Adoption by a high-traffic platform or framework** (the single strongest source; the least controllable).
3. A **versioned, executable conformance suite** (the rigor tier — turns "conformant" into a checkable claim).
4. A **formal prose spec + grammar** (necessary for citation; usually *describes* running code).
5. A **standards-body registration** (IANA variant / RFC) — the *least* load-bearing. "A name-reservation, not a credential": GFM's registration confers nothing on GitHub's authority over GFM.

The two axes that decide everything are **rigor** (does conformance mean something?) and **adoption** (does anyone render/consume it?). A format can win on adoption with near-zero rigor (YAML front matter); it cannot win on rigor alone.

## Where MDC stands: over-invested in rigor, under-invested in what confers legitimacy

MDC is, unusually, **already past the rigor bar that took CommonMark and TOML years to build — before going public.**

| Legitimacy artifact | MDC status |
|---|---|
| Reference implementation | ✅ `@mdcspec/mdc`, ~350 tests |
| Versioned prose spec + RFC-2119 language | ✅ `mdc-spec-v0.1.md`, 73 rules — stronger than MDX (no spec) or Markdoc (perpetual draft) |
| Executable conformance corpus | ✅✅ **best-in-class for a pre-public format** — declared authoritative over the prose, every rule fixture-backed; on par with TOML's `toml-test` |
| Formal grammar (attribute block) | ✅ ABNF-style; item-line grammar delegated to CommonMark (see gap G7) |
| L0 graceful degradation ("just Markdown") | ✅ the adoption hook — MDC's equivalent of YAML front matter's `---` |
| **Corpus portability** (runnable by any language) | ⚠️ fixtures are neutral, but the *runner* is JS-coupled — the contract lives in `corpus.js`, not in data |
| **Second independent implementation** | ❌ **the single biggest credibility gap** — one impl, and it's the reference |
| **Public governance + venue** | ❌ nothing public yet |
| **Adoption** | ❌ zero — not public |

MDC has built the hardest-to-fake artifact and is missing the cheap-but-decisive ones: a second implementation, public governance, and being public at all.

## The roadmap

### Phase 0 — Pre-public hygiene *(private; cheap; do first — these are irreversible-after-fork or bottleneck-forever if skipped)*

1. **Neutral GitHub org, never a personal repo, + a second admin from day one.** This is the mechanical difference between TOML's clean BDFL→team handoff and Markdown's Gruber bottleneck; the second admin is bus-factor insurance. Handoff later becomes "add a maintainer," not "transfer a personal account."
2. **License split, committed before the first public fork** (relicensing after needs every contributor's consent): `LICENSE` = **MIT** (reference code **+ conformance corpus** — the corpus must be trivially vendorable into other implementations); `LICENSE-docs` = **CC BY 4.0** (spec prose). Deliberately *not* CommonMark's CC BY-**SA** — its ShareAlike copyleft adds friction for independent implementers, the exact opposite of the goal. Matches SemVer's proven CC BY + the TOML/Keep-a-Changelog MIT cohort.
3. **`GOVERNANCE.md` + `CONTRIBUTING.md` at v0.1** (resolves open question #6): honest single-maintainer **BDFL now**, bound to "the conformance corpus is the arbiter, not the maintainer's opinion"; a written **evidence-gated graduation trigger** (→ 3–5 seat implementers' council when a second conforming implementation ships *or* 3+ orgs run MDC tooling); a sunset/dormancy clause; and a **closed-by-default change policy** (attribute-key set closed at six, grammar frozen to GFM's two states, every normative change needs a fixture, standing filter *"would todo.txt have added this?"*).
4. **IANA change-controller = the org / a role contact, not a personal email** (RFC 6838 permits it) — lets a future council inherit the registration with no re-registration. Fixes a latent personal bottleneck in the M0 draft for free.

### Phase 1 — Make the rigor portable, then go public *quietly* + file IANA *(unblocks the MVP itself)*

The corpus is executable **only by the JS harness** today — the invocation contract lives in `corpus.js` and is inconsistent across the seven families. Lifting it into data is the highest-leverage single investment toward a second implementation.

5. **Write a language-neutral conformance contract** (`spec/conformance.md`), specifying per family — in terms of the **CLI**, so `corpus.js` becomes *an* implementation of it, not *the* definition — the input(s), exact argv (or stdin), expected artifact, and pass condition. Model on `toml-test`'s interface section.
6. **Unify case metadata into one schema:** replace the `op.json`-array / `op.json`-object / `args.json`-semantic-object trichotomy with a single canonical-argv `cmd.json` (with `$FILE`/`$OUT`/`$TEMPLATE` placeholders + explicit `{"exit": N}`). Define argv forms for the four families currently driven by in-process JS calls (`parse`/`lint`/`fmt`/`cut`) so every family is CLI-drivable.
7. **Add a machine-readable manifest** (`spec/corpus/manifest.json`): `{path, family, level, argv, compare}` per case, replacing directory-name-substring logic (the `--assign-ids` hack) and version-scoping cases to `mdc: "0.1"` (the `toml-test` per-version pattern).
8. **Pin comparison semantics** the reference gets for free from `deepStrictEqual`/JS string equality but a Rust/Go/Python implementer must be told: JSON comparison law (unordered keys, ordered arrays, `line` ignored at any depth, present-empty vs absent is significant) and byte-comparison law (newline policy, trailing-newline, BOM region, **NFC-for-comparison-only**; pin `.gitattributes` so Git doesn't mangle goldens).
9. **Fix error observability:** the `not-mdc` vs `unsupported-version` tokens are only visible as JS exception codes today; either demote to exit-code-only or emit `{"error":"<token>"}` on stdout with exit 1 so a second implementation can distinguish them.
10. **Reframe §12 as a formal conformance clause** — named classes (L0 renderer / L1 parser / L2 mutator) each with per-class RFC-2119 MUSTs against the corpus. Add a spec-linter that fails if any `[family/case]` citation is missing a fixture or any fixture is uncited (mechanically enforcing "a rule without a passing fixture is not normative").
11. **Publish the repo publicly and *quietly*** at `0.1` (explicitly **not** 1.0): spec + corpus + CLI under the Phase-0 licenses, at a stable spec URL (mirror `spec.commonmark.org`/`toml.io/en/v1.0.0`).
12. **File the IANA `text/markdown; variant=mdc` registration simultaneously**, referencing the public URL. The bar is low ("any level of documentation is sufficient"), it's First-Come-First-Served, and it plants a first-come flag no `.mdc` squatter holds — but treat it as a **footnote, not a milestone**. *(Verify the exact RFC citation for the FCFS procedure/template — 7763 vs 7764 — against the RFCs at submission; the research surfaced a discrepancy.)*

**Why now, quietly:** IANA needs a public spec URL, so **staying fully private caps the MVP itself** — "too late" is a self-imposed ceiling, not a neutral wait. And the risk is bounded: every artifact (CLI, parser, corpus, IANA entry) has standalone value, so this "fails cheap." Gate to enter Phase 1's publish step: the two-independent-agent proof (**already met** — Claude + Codex drove the tool from the snippet alone) and a green corpus.

### Phase 2 — Prove implementability *(the decisive credibility gap)*

13. ~~**Write a second-language conformance runner**~~ — **shipped** (`spec/conformance/run.py`): a stdlib-only Python runner consuming only the manifest + fixtures + CLI contract, re-pointable at any binary via `--cli` (the `toml-test -decoder` model). The contract is proven portable.
14. **A second implementation exists and passes full CONF-L2 (79/79)** — `impls/mdc-py/` is a from-scratch, stdlib-only, line-oriented Python implementation (no CommonMark/YAML library) that passes **all 79 conformance cases** — L1 parse+lint *and* L2 fmt/mutate/add/note/edit/cut — via `run.py`, **written without consulting the JS reference at either level** (spec + contract + corpus were sufficient throughout — a strong signal on the G7 concern). The entire format is now implemented twice, in two languages and two parsing strategies, against one portable corpus. This validates the conformance infrastructure end-to-end and clears the risk register's technical "a second-language parser before 1.0 / implementable twice" gate for the whole format. *Caveat on the governance trigger:* it is a **second-language reference implementation authored within the project**, not a genuinely third-party one — so the Phase-0 governance graduation still awaits an *external* implementer (or 3+ orgs). One spec-clarity finding it surfaced: the trailing-attribute-block finder must be **quote-aware** (scan for the last top-level *unquoted* `{`), or a braced quoted value like `{x-path="a{b}c" #b}` mis-splits — pinned by `fmt/quote-brace-value`, worth making explicit in prose for a third implementer.
15. **Pin the CommonMark surface** (gap G7): declare the normative CommonMark version + GFM extensions MDC assumes, and add adversarial fixtures for the corners MDC actually depends on (tab-indented children, lazy continuation, `~~` tokenization boundaries, inline-markdown stripping in slug generation) — where two CommonMark libraries diverge. *(The Python impl being line-oriented rather than CommonMark-library-based means this gap is not yet exercised by two divergent CommonMark parsers — still worth pinning.)*
16. **Stand up an implementations registry** (wiki), keyed to the highest spec version each passes. Even two entries flips perception from "a tool" to "a format."

### Phase 3 — Earn adoption *(the *loud* launch — a distribution channel, not a spec post)*

Specs follow platforms. The public announcement is the platform, not the prose.

17. **Ship an MCP server** wrapping the verbs (`claim`/`next`/`check`/`add`/`edit`) — assessed as the **single highest-leverage adoption anchor**: MCP is now *the* agent-tooling substrate, so any agent host drives MDC's atomic `claim` and dependency-aware `next` with zero bespoke integration. This is "an agent runtime reads and writes it early" made concrete.
18. **Place the AGENTS.md snippet** in the ecosystem directories (the free channel the dogfood already validated). **This pairing — MCP server + AGENTS.md snippet — is the loud launch.**
19. **Convert one anchor:** an agent framework shipping MDC as its task-state format; later an Obsidian Tasks lossless importer (+ governance seat), a VS Code preview, and a GitHub Linguist entry *earned after* in-the-wild files justify it.

### Phase 4 — Stability + governance handoff *(after adoption, never before)*

20. **Commit a stability strategy explicitly** in the spec: TOML's frozen `1.0.0` *or* CommonMark's perpetual, carefully-versioned `0.x`. Downstream adopters need a target that won't move; the second implementation is the gate to declare it.
21. **BDFL → implementers' council → neutral foundation**, on the graduation trigger — exactly the order MCP and AGENTS.md followed (both handed to the Linux Foundation only *after* explosive adoption). Governance follows adoption; it does not manufacture it.

## Decisions this roadmap needs from the owner

1. **License split** — recommended MIT (code + corpus) + CC BY 4.0 (spec). *(Phase 0.)*
2. **GitHub org name + a second admin** — the org holds the repo, npm scope, domain, and IANA change-controller role. *(Phase 0.)*
3. **IANA owner fields** — contact name/role-email (plain text, no mailto), Author, Change controller (recommend "the MDC project maintainers"), and the public spec URL. *(Phase 1; see `iana-registration-draft.md`.)*
4. **Stability strategy** — frozen-1.0 vs perpetual-0.x. *(Can defer to Phase 4, but state the intent early.)*

## How this maps to existing plans

- **Resolves open question #6** (governance/sunset) via Phase 0 #3; touches #8 (killer-app sequencing → the Phase 3 loud launch leads with the agent shared-task-file, MCP-delivered).
- **Completes M0** (namespace) as Phase 1 #11–12; **M7** (public launch) is the Phase 3 loud launch.
- **Discharges the risk register's hard gate** — "a second-language parser before any 1.0" — as Phase 2 #14, now with a concrete portable-harness path (#13) to make it bootstrappable.
