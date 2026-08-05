---
mdc: "0.1"
kind: run
template: templates/release.mdc.md@5
title: Release 2.4.0
mode: do-confirm
started: 2026-07-24
---

# Release

## Prepare

- [ ] Freeze `main`, cut the release branch {#branch}
- [ ] Bump version and add changelog entry {#bump}
- [ ] All open P1 issues fixed or explicitly deferred {#triage .gate}

> **Pause point** — do-confirm: the team verifies the section above aloud,
> in order, before anyone proceeds.

## Verify

- [ ] CI green on the release branch {#ci needs=branch verify="npm test"}
- [ ] Smoke test on staging {#smoke needs=ci}
  - [ ] Login and logout
  - [ ] Checkout with a saved card
  - [ ] CSV export over 10k rows
- [ ] Load-test legacy PDF endpoint {#pdf}

## Ship

- [ ] Tag the release and push {#tag .gate needs=smoke}
- [ ] Publish package to npm {#publish needs=tag verify="npm publish --dry-run"}
- [ ] Publish GitHub release notes {#notes .optional needs=tag}

## Follow-up

- [ ] Watch error rates for 48 hours {#watch needs=publish}
- [ ] Restore-from-backup drill {#drill repeat=done+90d}
