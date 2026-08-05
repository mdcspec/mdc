---
mdc: "0.1"
kind: run
template: templates/release.mdc.md@5
title: Release 2.4.0
mode: do-confirm
started: 2026-07-24
---

# Release 2.4.0

Cut from `main` at `9f31c2a`. Everything outside frontmatter and task lines —
this paragraph, headings, notes under items — is plain markdown and round-trips
byte-for-byte through any conforming tool.

## Prepare

- [x] Freeze `main`, cut `release/2.4` branch {#branch @tim done=2026-07-24}
- [x] Bump version and add changelog entry {#bump @tim done=2026-07-24}
- [ ] All open P1 issues fixed or explicitly deferred {#triage .gate @maria due=2026-07-28}

> **Pause point** — do-confirm: the team verifies the section above aloud,
> in order, before anyone proceeds.

## Verify

- [ ] CI green on `release/2.4` {#ci needs=branch verify="npm test"}
- [ ] Smoke test on staging {#smoke .doing @maria needs=ci}
  - [ ] Login and logout
  - [ ] Checkout with a saved card
  - [ ] CSV export over 10k rows
- [x] ~~Load-test legacy PDF endpoint~~ {#pdf reason="endpoint removed in 2.4"}

## Ship

- [ ] Tag `v2.4.0` and push {#tag .gate @tim needs=smoke}
- [ ] Publish package to npm {#publish needs=tag verify="npm publish --dry-run"}
- [ ] Publish GitHub release notes {#notes .optional @sam due=2026-07-31 needs=tag}

## Follow-up

- [ ] Watch error rates for 48 hours {#watch @oncall needs=publish}
- [ ] Restore-from-backup drill {#drill @oncall repeat=done+90d}
