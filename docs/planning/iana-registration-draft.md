# IANA Markdown Variant Registration — Registered ✅

> **Registered 2026-09-24.** `mdc` is live in the [IANA Markdown Variants registry](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) (entry #13): Identifier `mdc`, Name "Markdown Checklists (MDC)", References `https://mdcspec.dev/spec/v0.1`, contact Tim Walsh. This completes the M0 milestone — the format's identity is secured the way CommonMark's late rename taught the ecosystem to do. The record below is kept for provenance.

*A registration for the `mdc` variant of `text/markdown`, plus the companion namespace actions.*

## Owner fields — settled

| # | Field | Value | Status |
|---|---|---|---|
| 1 | **Contact Information** | Tim Walsh — `spec@mdcspec.dev` (project-domain role alias, plain text, no mailto) | ✅ live — routes to the maintainer |
| 2 | **References** | `https://mdcspec.dev/spec/v0.1` | ✅ live — the site serves the current v0.1 spec at a stable path, so later v0.1 clarifications never require an IANA update (which needs IETF Review) |

Note: the RFC 7763 §6.1 variant template has **no** Author or Change-controller field — those belong to the RFC 6838 media-type template and were removed at IANA's request. Stewardship is recorded in [`GOVERNANCE.md`](../../GOVERNANCE.md) instead: the MDC project maintainers (the `mdcspec` project), currently stewarded by DireLabs, with a written graduation path to a council. The neutral `mdcspec` identity means that handoff needs no re-registration.

The identity is anchored on the neutral **`mdcspec`** namespace across all surfaces (GitHub org · `@mdcspec` npm scope · `mdcspec.dev` domain · the registration contact). See [`m0-namespace-checklist.md`](m0-namespace-checklist.md) for the ordered execution steps.

## What is being registered

[RFC 7763](https://www.rfc-editor.org/rfc/rfc7763) defines the `text/markdown` media type with a required `variant` parameter, and [RFC 7764](https://www.rfc-editor.org/rfc/rfc7764) establishes the **Markdown Variants** registry that enumerates the legal `variant` values. Registration is **First Come First Served** — no standards-track document is required, only a completed template sent to the designated list. Registering `variant=mdc` gives MDC a legitimate, citable identity in the one namespace neither Cursor's `.mdc` rules files nor Nuxt's MDC components have claimed.

Registry: <https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml>

## Registration template

Per **RFC 7763 Section 6.1** — the *Markdown variant* template. Fields: Identifier, Name, Description, Additional Parameters (optional), Fragment Identifiers (optional), References, Contact Information, Expiration Date (provisional registrations only). This registration is permanent, so no Expiration Date is given. The block below is ready to send verbatim.

> **Note (2026-09):** an earlier draft mistakenly merged this with the RFC 6838 §5.6 *media type* template — it carried "Applications that use this media type", separate Encoding/Security/Interoperability considerations, and a duplicated fragment-identifier field. IANA asked for it to be edited down to a markdown-variant registration only; that is what appears below. The substance that belonged to the media-type template (security posture, encoding, interoperability) lives in the spec itself and is reachable through References.

```
Identifier:
  mdc

Name:
  Markdown Checklists (MDC)

Description:
  A checklist-oriented variant of Markdown. Every MDC document is valid
  GitHub Flavored Markdown; MDC additionally assigns machine-readable meaning
  to GFM task-list items and to a single trailing attribute block per item
  ({#id .class @assignee key=value}), defining item states (open, done,
  cancelled), typed dependencies (needs=), gating (.gate/.optional),
  template-vs-run documents, and a canonical form suitable for deterministic,
  line-granular edits. A document is MDC if and only if its YAML frontmatter
  contains an "mdc" version key; the file extension (conventionally .mdc.md)
  is not significant. Any Markdown or GFM processor renders an MDC document
  correctly without MDC support; MDC-specific metadata degrades to visible
  literal text.

Additional Parameters:
  None.

Fragment Identifiers:
  None. MDC does not define fragment-identifier syntax or semantics beyond
  those of the underlying Markdown/HTML rendering. MDC item identifiers (the
  "#id" attribute) are an in-document addressing scheme used by MDC tooling,
  not URI fragments.

References:
  MDC Specification v0.1
  https://mdcspec.dev/spec/v0.1

Contact Information:
  Tim Walsh - spec@mdcspec.dev
```

## Submission steps

1. ✅ Submitted 2026-09-18 to `iana@iana.org`. IANA (Amanda Baber) replied 2026-09-22: the template had merged RFC 7763 §6.1 (markdown variant) with RFC 6838 §5.6 (media type) — it carried an "Applications that use this media type" field and a duplicated fragment-identifier field — and asked for it to be edited down to a markdown-variant registration only.
2. ✅ Corrected and verified (2026-09-22): the template was edited to exactly the RFC 7763 §6.1 field set (Identifier, Name, Description, Additional Parameters, Fragment Identifiers, References, Contact Information; no Expiration Date — that field is provisional-only, and this registration is permanent), and the correction was replied in-thread.
3. ✅ **Registered 2026-09-24.** IANA added `mdc` to the Markdown Variants registry (entry #13). Verified live: Identifier `mdc`, Name "Markdown Checklists (MDC)", References `https://mdcspec.dev/spec/v0.1`, contact Tim Walsh.
4. ✅ `m0-iana` checked off in [`../../checklists/mvp-build.mdc.md`](../../checklists/mvp-build.mdc.md). **M0 is complete.**

## Companion namespace actions (M0)

Not part of the IANA registration, but secured in the same milestone so the name is whole before launch — **all complete**:

- ✅ **GitHub org.** The neutral `mdcspec` org holds the repository (`github.com/mdcspec/mdc`, public), with a second admin for continuity.
- ✅ **npm scope.** The `@mdcspec` organization scope is reserved.
- ✅ **Domain.** `mdcspec.dev` is registered and serves the project site (spec at `/spec/v0.1`), with the `spec@mdcspec.dev` role alias.
- ✅ **Repository published.** The spec and conformance corpus are public, so the Published-specification URL resolves.

The only remaining M0 action is sending the template above (see Submission steps). It is tracked as `m0-iana` in [`../../checklists/mvp-build.mdc.md`](../../checklists/mvp-build.mdc.md), on which the public-launch item is blocked.
