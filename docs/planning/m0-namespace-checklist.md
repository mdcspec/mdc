# M0 Namespace — Execution Checklist

*The ordered, owner-actionable steps to secure MDC's identity before any public announcement: publish the spec repo, register the IANA `text/markdown; variant=mdc` variant, reserve the `@mdcspec` npm scope, and acquire a project domain. These are the three open items in [`../../checklists/mvp-build.mdc.md`](../../checklists/mvp-build.mdc.md) (`m0-iana`, `m0-npm`, `m0-domain`), on which public launch (`m7-launch`) is blocked.*

## Dependency order at a glance

```
(A) Publish spec repo ──► resolves the Published-specification URL
        │
        └──► (D) Submit IANA registration   (needs a live spec URL)

(B) Reserve @mdcspec npm scope   — independent, do any time
(C) Acquire domain               — independent; do before (D) if the IANA
                                    contact email will be a project-domain alias
```

**The one hard block: the IANA submission (D) must cite a resolving Published-specification URL, so publish the repo (A) first.** The npm scope (B) and domain (C) are independent and can be done in parallel. Doing the domain (C) before IANA (D) is recommended only so the IANA contact email can be a durable project-domain alias rather than a personal inbox (see the IANA draft, owner decision #1).

---

## (A) Publish the spec repo — do first

Unblocks the IANA Published-specification URL and gives the domain something to point at.

- [ ] Confirm the repo is release-ready: `spec/mdc-spec-v0.1.md`, the `spec/corpus/` conformance corpus, and READMEs are present and the CI corpus run is green.
- [ ] Make the repository public (or publish a docs site that serves the spec).
- [ ] Tag the spec state (e.g. `v0.1.0-alpha` or a `spec-v0.1` tag) so the eventual IANA URL can pin an immutable commit/tag rather than a moving branch.
- [ ] Capture the **stable, resolving URL** to `spec/mdc-spec-v0.1.md` (pinned to the tag). This is the value for IANA owner-decision #4.

## (B) Reserve the `@mdcspec` npm org scope — independent

The bare `mdc` package name is unrelated to this project and the `mddb` package name already belongs to MarkdownDB, so a scope is mandatory for any current or future MDC package (see [`../research/extension-naming-conflicts.md`](../research/extension-naming-conflicts.md)).

- [ ] Check availability of the org scope: <https://www.npmjs.com/org/mdcspec> (a 404 / "not found" means it is available).
- [ ] Sign in to npm and create the organization named `mdcspec` at <https://www.npmjs.com/org/create> (the free tier is sufficient to hold the scope; it enables `@mdcspec/*` package names).
- [ ] Optionally publish a placeholder `@mdcspec/mdc` (or `@mdcspec/cli`) package to hold the name, even pre-`1.0`.
- [ ] If `mdcspec` is already taken, fall back to a scope matching the chosen domain (see C) — keep the npm scope and the domain name aligned.

## (C) Evaluate and acquire a domain — independent

Naming constraint from [`../research/extension-naming-conflicts.md`](../research/extension-naming-conflicts.md): **bare "mdc" collides with Cursor's rules files and Nuxt's MDC components**, so avoid a bare-`mdc` brand domain. Prefer a `markdown-checklists`-style or `mdcspec`-style name that disambiguates. Check availability (any registrar's WHOIS/search) before committing; nothing is registered yet.

Candidate names to check (developer-facing TLDs `.dev` / `.org` preferred over `.com` for a spec project):

- [ ] `mdcspec.dev` / `mdcspec.org` — matches the npm scope exactly; strongest choice if the scope is held.
- [ ] `markdownchecklists.dev` / `markdown-checklists.dev` — spells out the disambiguating full name (the brand the naming analysis mandates using everywhere).
- [ ] `mdc-spec.dev` — hyphen keeps it readable while avoiding a bare-`mdc` label.
- [ ] `mdcformat.dev` — an alternative if `mdcspec` is taken.
- [ ] `getmdc.dev` — acquisition-friendly fallback.

Then:

- [ ] Pick the winner (align it with the npm scope from B), register it, and — if it will host the spec — point it at the published repo/docs site from A.
- [ ] If the domain will host the docs/spec, this URL can become the IANA Published-specification URL instead of the raw repo link (owner decision #4).

## (D) Submit the IANA registration — after A (and, ideally, after C)

Registers `text/markdown; variant=mdc` in the [Markdown Variants registry](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) (First-Come-First-Served under RFC 7764; no Expert Review gate). Full template and field rationale are in [`iana-registration-draft.md`](iana-registration-draft.md).

- [ ] Supply the four owner-decision values in the IANA draft: contact name + **plain-text** email (#1), Author (#2), Change controller (#3), and the resolving Published-specification URL from step A (#4).
- [ ] Confirm the Published-specification URL actually resolves in a browser (a registration citing a dead link should not be sent).
- [ ] Send the completed plain-text template block to the registry's designated contact per the [registry page](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) instructions.
- [ ] On confirmation, record the assigned entry back in [`iana-registration-draft.md`](iana-registration-draft.md) and tick `m0-iana` in the build checklist.

---

## Closing out M0

When A–D are done, tick `m0-iana`, `m0-npm`, and `m0-domain` in [`../../checklists/mvp-build.mdc.md`](../../checklists/mvp-build.mdc.md). Those three are the only remaining `needs=` edges (besides `m6-docs`) on `m7-launch`, so completing them clears M0 and unblocks public launch.
