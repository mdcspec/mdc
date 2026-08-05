---
mdc: "0.1"
kind: list
title: L0 rendering fixture (file view)
---

# L0 rendering fixture (file view)

Everything in this file is plain GFM. An MDC-unaware renderer must show live
checkboxes, struck-through cancelled items, and attribute blocks as literal
trailing text — nothing hidden, nothing broken.

## States

- [ ] Open item with an attribute block {#open due=2026-08-01}
- [x] Done item {#done done=2026-07-20}
- [x] ~~Cancelled item, struck through~~ {#gone reason="scope cut"}

## Structure

- [ ] Parent with children {#parent}
  - [ ] Child one
  - [x] Child two {done=2026-07-19}
- [ ] Mid-line {braces} are plain text; only the trailing block is metadata {#braces x-note="literal trailing text"}
- [ ] Assignee token renders as plain text in file view {#owner @mdc-nobody-example}

## Text fidelity

- [ ] Unicode: Übersetzung prüfen — 中文文案 🚀 {#i18n}
- [ ] Inline markdown: `code`, **bold**, [a link](https://example.com) {#inline}
