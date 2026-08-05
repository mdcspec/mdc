# IANA Markdown Variant Registration — Draft

*A ready-to-submit registration for the `mdc` variant of `text/markdown`, plus the companion namespace actions. This is the M0 milestone: complete it before any public announcement, so the format's identity is secured the way CommonMark's late rename taught the ecosystem to do.*

## What is being registered

[RFC 7763](https://www.rfc-editor.org/rfc/rfc7763) defines the `text/markdown` media type with a required `variant` parameter, and [RFC 7764](https://www.rfc-editor.org/rfc/rfc7764) establishes the **Markdown Variants** registry that enumerates the legal `variant` values. Registration is **First Come First Served** — no standards-track document is required, only a completed template sent to the designated list. Registering `variant=mdc` gives MDC a legitimate, citable identity in the one namespace neither Cursor's `.mdc` rules files nor Nuxt's MDC components have claimed.

Registry: <https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml>

## Registration template

Per RFC 7764 Section 6. Bracketed fields marked TODO are for the project owner to finalize before submission.

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
  MDC Specification v0.1. [TODO: public URL once the spec repo is published;
  the source of record is spec/mdc-spec-v0.1.md in the project repository.]

Applications that use this media type:
  Checklist and task tooling, CI/release gating, ops runbooks, and AI coding
  agents that read and write shared task state in a repository.

Fragment identifier considerations:
  See "Additional information" above.

Person & email address to contact for further information:
  [TODO: maintainer name] — [TODO: contact email, written as plain text]

Intended usage:
  COMMON

Restrictions on usage:
  None.

Author:
  [TODO: maintainer / project name]

Change controller:
  [TODO: maintainer or governing body]
```

## Submission steps

1. Fill every `[TODO]` field. The published-specification URL should resolve before submission; if the spec repo is not yet public, host `spec/mdc-spec-v0.1.md` at a stable URL first.
2. Send the completed template to the registry's designated contact as described on the [Markdown Variants registry page](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) (First Come First Served; no Expert Review gate).
3. Record the assigned entry back in this file once confirmed.

## Companion namespace actions (M0)

Not part of the IANA registration, but secured in the same milestone so the name is whole before launch:

- **npm scope.** Reserve the `@mdcspec` organization scope (the `mdc` package name is unrelated; the bare `mddb` package name already belongs to MarkdownDB, so any database companion must also be scoped). Check availability: <https://www.npmjs.com/org/mdcspec>.
- **Domain.** Acquire a project domain for the spec and docs. Evaluate candidates (for example an `mdc`- or "markdown-checklists"-based name) for availability before committing; nothing is registered yet.
- **Repository.** Publish the spec repo with the conformance corpus so the published-specification URL above resolves.

These are external, owner-driven actions — they appear as open, `@`-assigned items in [`../../checklists/mvp-build.mdc.md`](../../checklists/mvp-build.mdc.md), on which the public-launch item is blocked.
