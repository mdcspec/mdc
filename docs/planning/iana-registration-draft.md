# IANA Markdown Variant Registration — Draft

*A ready-to-submit registration for the `mdc` variant of `text/markdown`, plus the companion namespace actions. This is the M0 milestone: complete it before any public announcement, so the format's identity is secured the way CommonMark's late rename taught the ecosystem to do.*

## Owner fields — all decided and resolved

Every owner decision is settled and filled into the template below; the Published-specification URL is live. **The template is ready to send.**

| # | Field | Value | Status |
|---|---|---|---|
| 1 | **Contact** | Tim Walsh — `spec@mdcspec.dev` (project-domain role alias, plain text, no mailto) | ✅ live — alias routes to the maintainer |
| 2 | **Author** | Tim Walsh (GitHub: `timimsms`) | ✅ decided |
| 3 | **Change controller** | The MDC project maintainers (the `mdcspec` project); currently stewarded by DireLabs, updatable to a governance council per [`GOVERNANCE.md`](../../GOVERNANCE.md) | ✅ decided — neutral project identity, not a personal or company namespace, so a future council inherits it with no re-registration |
| 4 | **Published specification URL** | `https://mdcspec.dev/spec/v0.1` | ✅ live — the project site serves the current v0.1 spec at a stable path (verified HTTP 200). Chosen over a tag-pinned GitHub URL so later v0.1 clarifications never require an IANA update (which needs IETF Review). |

The identity is anchored on the neutral **`mdcspec`** namespace across all surfaces (GitHub org · `@mdcspec` npm scope · `mdcspec.dev` domain · this IANA contact/controller). See [`m0-namespace-checklist.md`](m0-namespace-checklist.md) for the ordered execution steps and blocking relationships.

## What is being registered

[RFC 7763](https://www.rfc-editor.org/rfc/rfc7763) defines the `text/markdown` media type with a required `variant` parameter, and [RFC 7764](https://www.rfc-editor.org/rfc/rfc7764) establishes the **Markdown Variants** registry that enumerates the legal `variant` values. Registration is **First Come First Served** — no standards-track document is required, only a completed template sent to the designated list. Registering `variant=mdc` gives MDC a legitimate, citable identity in the one namespace neither Cursor's `.mdc` rules files nor Nuxt's MDC components have claimed.

Registry: <https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml>

## Registration template

Per RFC 7764 Section 6. **Every field is finalized** — the block below is ready to send verbatim.

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
  is not significant.

Additional information:
  Fragment identifiers: MDC follows the base text/markdown media type; it does
  not define fragment-identifier semantics beyond those of the underlying
  Markdown/HTML rendering. MDC item identifiers (the "#id" attribute) are an
  in-document addressing scheme used by MDC tooling, not URI fragments.

  Deprecated alias: none.

Encoding considerations:
  Same as text/markdown (RFC 7763): UTF-8; a leading UTF-8 BOM and CRLF or LF
  line endings are tolerated.

Security considerations:
  Same as text/markdown (RFC 7763). MDC adds no active content. The optional
  "verify=" attribute names a command string as data only; MDC tooling in this
  reference implementation never executes it. Consumers that choose to execute
  verify= commands, or that resolve "needs=" / "template=" references across
  files, MUST treat those strings as untrusted input.

Interoperability considerations:
  By construction, any Markdown or GFM processor renders an MDC document
  correctly without MDC support; MDC-specific metadata degrades to visible
  literal text. MDC-aware tools interoperate through the documented L1 JSON
  item model.

Published specification:
  MDC Specification v0.1.
  https://mdcspec.dev/spec/v0.1

Applications that use this media type:
  Checklist and task tooling, CI/release gating, ops runbooks, and AI coding
  agents that read and write shared task state in a repository.

Fragment identifier considerations:
  See "Additional information" above.

Person & email address to contact for further information:
  Tim Walsh — spec@mdcspec.dev

Intended usage:
  COMMON

Restrictions on usage:
  None.

Author:
  Tim Walsh (GitHub: timimsms)

Change controller:
  The MDC project maintainers (the "mdcspec" project); currently stewarded by
  DireLabs. Updatable to a formal governance body/council per GOVERNANCE.md.
```

## Submission steps

1. ✅ All owner fields are filled and the Published-specification URL is public and verified resolving — the template is ready to send verbatim.
2. **Send the completed template** to the registry's designated contact as described on the [Markdown Variants registry page](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) (First Come First Served; no Expert Review gate). *(This email send is the only remaining M0 action.)*
3. Record the assigned entry back in this file once confirmed.

## Companion namespace actions (M0)

Not part of the IANA registration, but secured in the same milestone so the name is whole before launch — **all complete**:

- ✅ **GitHub org.** The neutral `mdcspec` org holds the repository (`github.com/mdcspec/mdc`, public), with a second admin for continuity.
- ✅ **npm scope.** The `@mdcspec` organization scope is reserved.
- ✅ **Domain.** `mdcspec.dev` is registered and serves the project site (spec at `/spec/v0.1`), with the `spec@mdcspec.dev` role alias.
- ✅ **Repository published.** The spec and conformance corpus are public, so the Published-specification URL resolves.

The only remaining M0 action is sending the template above (see Submission steps). It is tracked as `m0-iana` in [`../../checklists/mvp-build.mdc.md`](../../checklists/mvp-build.mdc.md), on which the public-launch item is blocked.
