---
mdc: "0.1"
kind: run
title: MDC MVP Build
mode: read-do
started: 2026-07-26
---

# MDC MVP Build

This checklist runs its own project. It is a real MDC document: it renders as a
checklist on GitHub, and every completed box below was ticked by the `mdc` CLI
built in this repo — `mdc check <id> --date …` — so the git history of this file
is the build's audit trail. `mdc status checklists/mvp-build.mdc.md` reports
progress; `mdc next` shows what is actionable given the `needs=` edges.

## M0 — Namespace (external, owner actions)

- [ ] Register `text/markdown; variant=mdc` with IANA {#m0-iana @tim}
  - note @tim 2026-09-13: Registration fully drafted (all fields resolved, spec URL public + verified). Remaining: email the plain-text template to the IANA registry contact.
- [x] Secure the `@mdcspec` npm scope {#m0-npm @tim done=2026-09-13}
- [x] Secure the project domain {#m0-domain @tim done=2026-09-13}

## M1 — Spec and corpus

- [x] Executable spec v0.1 (every rule cites a corpus case) {#m1-spec done=2026-07-27}
- [x] Conformance corpus with L0 rendering fixtures {#m1-corpus done=2026-07-27 needs=m1-spec}

## M2 — Reference parser

- [x] remark plugin emitting the L1 JSON item model {#m2-parser done=2026-07-27 needs=m1-corpus}

## M3 — CLI read verbs

- [x] parse / lint / status / next {#m3-read done=2026-07-27 needs=m2-parser}

## M4 — Canonical form

- [x] fmt (idempotent) and --assign-ids {#m4-fmt done=2026-07-27 needs=m2-parser}

## M5 — L2 mutations

- [x] check / uncheck / cancel / claim — atomic, minimal-diff {#m5-mutations done=2026-07-27 needs=m3-read,m4-fmt}

## M6 — Agent snippet and docs

- [x] AGENTS.md, adoption snippet, and READMEs {#m6-docs done=2026-07-27 needs=m5-mutations}

## M7 — Public launch

- [ ] Decide killer-app sequencing: shared agent task file vs merge-gated release {#m7-sequencing .gate}
- [ ] Public announcement {#m7-launch needs=m0-iana,m0-npm,m0-domain,m6-docs}
