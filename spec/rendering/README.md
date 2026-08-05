# L0 rendering verification

L0 conformance ("Render") requires nothing of a markdown viewer — MDC documents are valid GFM by construction. These fixtures exist to *prove* that claim on the renderers people actually use, by manual paste-verification on GitHub and GitLab. Rerun this procedure whenever either fixture changes or a renderer materially changes its markdown pipeline.

## Fixtures

| Fixture | How to use it |
|---|---|
| `file-view.mdc.md` | Commit to a scratch repository (or gist) and open the rendered file view. Includes frontmatter, which GitHub renders as a metadata table and other renderers may show as a table, plain text, or not at all — any of those is a pass. |
| `paste-comment.md` | Paste the whole file into a **new, throwaway** issue or merge-request description/comment, preview, then discard. No frontmatter — comment bodies render `---` fences as thematic breaks, which is not what L0 is claiming. |

## What to verify

For each fixture, in each renderer:

1. Open (`[ ]`) and done (`[x]`) items render as real checkboxes; in issue/PR bodies they are interactive and the platform's task counter (e.g. "3 of 8") counts exactly these items.
2. The cancelled item renders as a **checked** box with struck-through text.
3. Attribute blocks (`{#id …}`) render as literal trailing text — a readability tax, never breakage.
4. Nested items render as a nested checklist under their parent.
5. Mid-line `{braces}` render literally.
6. Unicode text and inline markdown (`code`, **bold**, links) inside item text render normally.
7. Nothing is hidden, duplicated, or reflowed into non-list content.

Record results as a short note per renderer (renderer, date checked, pass/fail per row above, screenshots if failing) alongside this README.

## Hazards

- `@handle` tokens autolink in GitHub/GitLab issue and PR bodies and **can notify real accounts**. `file-view.mdc.md` uses the improbable handle `@mdc-nobody-example` and `paste-comment.md` contains no assignee tokens. Do not paste real MDC documents with real handles into public issue bodies during verification.
- Use a throwaway issue/MR for the paste fixture; checking boxes in a preview is harmless, but a saved comment edits real state.
