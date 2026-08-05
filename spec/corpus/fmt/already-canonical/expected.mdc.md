---
mdc: "0.1"
kind: run
title: Sprint 12
started: 2026-07-20
---

# Sprint 12

## Build

- [x] Draft the plan {#plan @ana done=2026-07-21}
- [ ] Implement the API {#api .doing @ana needs=plan}
  - [ ] Write the handlers
  - [ ] Write the tests
- [x] ~~Spike on GraphQL~~ {#spike reason="out of scope"}

## Release

- [ ] Deploy to staging {#stage .gate needs=api}
- [ ] Announce internally {#announce .optional @sam due=2026-07-30}
