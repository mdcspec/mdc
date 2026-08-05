# Extension and Naming Conflicts: The `.mdc` Dossier

*Verified facts on every extension and acronym collision relevant to Markdown Checklists, a severity assessment of each, the alternatives we evaluated, the RFC 7763/7764 registry angle, and the canonical naming decision with full rationale.*

Research snapshot: 2026-07-26

This document is the naming counterpart to the [landscape map](landscape-map.md). The adoption dynamics that make naming decisions live-or-die are covered in [standards adoption lessons](standards-adoption-lessons.md); the format the name attaches to is sketched in the [MDC format sketch](../spec/mdc-format-sketch.md).

## The decision, up front

**The format is "MDC — Markdown Checklists." The canonical filename is the double extension `*.mdc.md`. The authoritative format signal is in-band: a file is an MDC document if and only if its YAML frontmatter contains the `mdc:` version key.** Bare `.mdc` is ceded permanently. `.mdb` is excluded permanently. The database companion is reserved as `.mddb`. We register `text/markdown; variant=mdc` in the IANA Markdown Variants registry before any public announcement. The rest of this document is the evidence.

## Collision 1: bare `.mdc` is contested — in exactly our niche

Bare `.mdc` is not squatted by dead legacy formats. It is actively claimed by two current developer tools, and — decisively — unsupported by GitHub itself.

**Cursor.** [Cursor's official rules documentation](https://cursor.com/docs/context/rules) states that project rules "must use the `.mdc` extension" and that "a plain `.md` file in `.cursor/rules` is ignored by the rules system" (verified against the live docs, July 2026). Cursor engineer Michael Feldstein confirmed the acronym expansion — "It means 'Markdown Cursor', we just needed a unique extension so we could use the custom editor" — in an [April 2025 GitHub comment](https://github.com/neondatabase-labs/ai-rules/pull/1#issuecomment-2781098100), quoted on the [official forum](https://forum.cursor.com/t/what-is-a-mdc-file/50417). The ecosystem is large: [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) has ~37,800 stars and 500+ rules, and [sanjeed5/awesome-cursor-rules-mdc](https://github.com/sanjeed5/awesome-cursor-rules-mdc) (3,500+ stars) curates `.mdc` files specifically. Notably, Cursor's format has no official spec, schema, or linter — users [complain about this on the forum](https://forum.cursor.com/t/documentation-page-schema-undocumented-for-rules/151461), and a small single-maintainer project ([benallfree/awesome-mdc](https://github.com/benallfree/awesome-mdc/blob/main/what-is-mdc.md)) is already trying to reposition Cursor-style `.mdc` as a "tool-agnostic standard" for AI rule files. Two important nuances from verification: no other AI editor actually reads `.mdc` (Cline, Windsurf, and Copilot all use their own conventions; the genuine cross-editor standard is AGENTS.md, which Cursor also reads), and Cursor's claim is de facto, not formal.

**The structural near-miss.** The collision is more than a shared name: Cursor's `.mdc` rules files are themselves YAML frontmatter over a markdown body. Their schema (verified against the [live rules docs](https://cursor.com/docs/context/rules) and the major community collections, July 2026) uses the keys `description`, `globs`, and `alwaysApply` — and no version key of any kind. So a Cursor rules file and an MDC document both open with a `---` frontmatter block and look, at a glance, like the same species of file; this is what makes the collision practically confusing rather than merely nominal. It is also exactly where in-band identity earns its keep: an MDC document is identified by the `mdc:` frontmatter key, which no Cursor rules file carries. A tool that dispatches on that key disambiguates the two formats deterministically — no filename, directory, or editor-mode heuristic required — even against the closest colliding format in existence. Field validation of this rule is [experiment H4](../planning/experiment-plan.md#h4--the-extension-decision-holds-up-in-the-field).

**Nuxt.** Our initial research recorded Nuxt MDC ("MarkDown Components") as an acronym-only collision that operates on `.md` files. Adversarial verification **refuted** that framing: Nuxt's official VS Code extension ([marketplace ID `Nuxt.mdc`](https://marketplace.visualstudio.com/items?itemName=Nuxt.mdc), ~299K installs) explicitly registers `"extensions": [".mdc"]` for its MDC language mode — verified in the [extension's package.json](https://github.com/nuxt-content/vscode-mdc) — and that registration persists in the current build even though the [@nuxtjs/mdc module](https://nuxt.com/modules/mdc) itself is deprecated in favor of the Comark rebrand. So on any machine with that extension installed, a bare `.mdc` file opens in Nuxt's MDC language mode. The collision is not fading at the editor-tooling level.

**GitHub.** The fatal fact: [GitHub Linguist's languages.yml](https://raw.githubusercontent.com/github/linguist/master/lib/linguist/languages.yml) contains no entry for `.mdc`. Verified behaviorally: GitHub's blob viewer returns `language: null` **and** `renderedFileInfo: null` for real `.mdc` files — no syntax highlighting *and no rendered markdown view at all*. The one Linguist PR proposing `.mdc` ([#7326](https://github.com/github-linguist/linguist/pull/7326), for Cursor rules) was closed unmerged in July 2025 for failing Linguist's demonstrated-usage requirements. A format whose entire pitch is "renders beautifully on GitHub with zero tooling" cannot choose the one spelling of its name that GitHub refuses to render.

**Legacy claims.** [File-extension databases](https://fileinfo.com/extension/mdc) list MidiCo karaoke audio, IBM Cognos PowerPlay cube data, Marc's Disk Cruncher Amiga images, a compressed 3D game-model format, Merkaartor documents, Minolta camera RAW, and Pfeiffer Quadstar instrument data. All are desktop/hardware formats with no developer-toolchain footprint; all verified low-relevance.

**The acronym.** "MDC" is additionally claimed by Google's Material Components — [codelabs named MDC-101 through MDC-112](https://developers.google.com/codelabs/mdc-101-web) and the pervasive `mdc-` CSS prefix — though MDC-Web was archived on GitHub in January 2025 and the brand is legacy. Three-way acronym crowding (Cursor, Nuxt, Google) is real but survivable; see the decision rationale below.

## Collision 2: `.mdb` is dead on arrival

The original [idea note](../../IDEA.md) floated `.mdb` for the markdown-database companion. Verification confirms this must never happen:

- `.mdb` was Microsoft Access's primary format from Access 1.0 (1992) through Access 2003, with a [Library of Congress preservation registry entry](https://www.loc.gov/preservation/digital/formats/fdd/fdd000462.shtml) and an enormous legacy installed base.
- `.mdb` is on [Outlook's default blocked-attachment list](https://support.microsoft.com/en-us/office/blocked-attachments-in-outlook-434752e1-02d3-4e90-9124-8b81e49a8519) alongside `.mda`/`.mde`/`.mdt`/`.mdw`/`.mdz` — the receiving Outlook strips the file. A database file that cannot be emailed by default is disqualified outright.
- The acronym space is further crowded by MongoDB's stock ticker, the Solaris Modular Debugger, and Java Message Driven Beans ([Wikipedia's MDB disambiguation](https://en.wikipedia.org/wiki/MDB)).

## Collision 3: the neighborhood — `.mddb`, `.mdx` orbit, and checklist extensions

- **`.mddb` is verified unclaimed** as a file extension ([file.org has no verified program for it](https://file.org/extension/mddb)). The acronym MDDB means "multidimensional database" in SAS/OLAP jargon — a conceptual overlap that is semantically *friendly* to "markdown database." One caveat: the `mddb` package name on npm belongs to MarkdownDB, so any npm presence must use a scope (e.g. `@mdcspec/*`). See the [mddb concept sketch](../spec/mddb-concept-sketch.md).
- **`.mdxl` and `.mdcv`** (the idea note's spreadsheet candidates) are unclaimed but orbit [`.mdx`, which is heavily overloaded](https://www.filesuffix.com/en/extension/mdx) — MDict dictionaries, Daemon Tools disc images, Warcraft 3 models — and collide in name with Microsoft's MDX OLAP query language, which is maximally confusing next to a database product. Avoided.
- **Nearby checklist extensions:** `.taskpaper` is claimed by TaskPaper's multi-app ecosystem; `.ckl` is claimed by [DISA STIG compliance checklists](http://en.filedict.com/ckl-disa-stig-checklist-17742/). Verified-unclaimed bare-extension alternatives were `.mdcl` ([file.org: no verified programs](https://file.org/extension/mdcl)), `.cklst`, and `.checklist` — all rejected, because *any* bare extension forfeits GitHub/GitLab/editor rendering until a Linguist entry is earned through demonstrated usage, which recreates the exact problem that disqualifies bare `.mdc`.

## Severity assessment

| Name/extension | Claimant(s) | Severity | Our position |
|---|---|---|---|
| bare `.mdc` | Cursor rules (mandated), Nuxt/Comark VS Code extension (registered), no Linguist entry | **Fatal** for a render-first format | Cede permanently |
| `.mdb` | Microsoft Access (30 yrs), Outlook attachment blocking | **Fatal** | Never use |
| "MDC" acronym | Cursor ("Markdown Cursor"), Nuxt ("Markdown Components"), Google Material | Moderate | Accept; always spell out "Markdown Checklists" |
| `.mdc` legacy desktop uses | Karaoke, Cognos, Amiga, RAW, etc. | Negligible | Irrelevant either way |
| `.mddb` | None (extension); SAS/OLAP acronym only | Low, semantically friendly | Reserve for the database layer |
| `mddb` on npm | MarkdownDB project | Moderate (npm only) | Use a scope (`@mdcspec/*`) |
| `.mdxl` / `.mdcv` | None, but `.mdx`-adjacent | Moderate (inherited confusion) | Avoid |
| `.mdcl` / `.cklst` / `.checklist` | None | Low collision, but zero rendering support | Rejected as bare extensions |
| `*.mdc.md` double extension | None; matches `*.md` everywhere | **None** — full markdown rendering retained | **Canonical** |

## The standards angle: RFC 7763/7764

Two IETF documents give us a formal identity that no collider has claimed:

- [RFC 7763](https://www.rfc-editor.org/rfc/rfc7763.html) registered the `text/markdown` media type with a `variant` parameter.
- [RFC 7764](https://datatracker.ietf.org/doc/html/rfc7764) created the [IANA Markdown Variants registry](https://www.iana.org/assignments/markdown-variants/markdown-variants.xhtml) — currently 12 entries (GFM, CommonMark, Pandoc, Quarto, MyST, …), First-Come-First-Served, with "any level of documentation" sufficient and only "Standard", "Common", and "Markdown" reserved.

RFC 7764's file-storage guidance is direct precedent for our filename: markdown files "should have an appropriate file extension ending in `.md` or `.markdown`", with the variant recorded "as the prefix to the file extension" — its own example is `example.pandoc.markdown`. Our `checklist.mdc.md` is that pattern applied verbatim. Registering `variant=mdc` is a launch-gating action in the [MVP definition](../planning/mvp-definition.md): the CommonMark project's forced day-four rename (Standard Markdown → CommonMark, after John Gruber objected) is the standing lesson that identity assets get secured *before* announcement, not after.

## The decision and its rationale

1. **Cede bare `.mdc`, permanently and explicitly.** Contesting it is unwinnable (Cursor mandates it; Nuxt's extension registers it) and worthless even if won (GitHub renders it as nothing). Ceding is not retreat — it is our radical-compatibility principle applied to the filename itself.
2. **Keep the brand "MDC — Markdown Checklists."** MDX proved a real spec plus a toolchain can win an overloaded acronym ([MDX's own history](https://mdxjs.com/community/about/)); the caveat — MDX's collisions were in unrelated domains, while Cursor sits in ours — is exactly why we fight only at the acronym level (survivable) and never at the extension level (where the real conflict lives). All documentation uses the full name for search disambiguation.
3. **Canonical filename `*.mdc.md`.** RFC 7764's variant-prefix pattern, and the only option that keeps rendering, diffing, and mobile preview free on every markdown-aware surface from day one.
4. **Identity is in-band.** The required `mdc:` frontmatter key is the format's magic number; `TODO.md` with that key is exactly as valid as `release.mdc.md`. The extension is an affordance, never the protocol — the only detection rule that survives stdin, gists, and agent context windows. Details in the [format sketch](../spec/mdc-format-sketch.md).
5. **`.mddb` reserved, `.mdb` banned, npm scoped.** See the [mddb concept sketch](../spec/mddb-concept-sketch.md) for the deferral stance.
6. **Register `text/markdown; variant=mdc` before announcement.** Minimal cost, durable foothold, and neither Cursor nor Nuxt has touched the registry.

Residual risks of this decision — including Cursor-user confusion over the `mdc` name and the single-maintainer effort to standardize Cursor-style `.mdc` — are tracked in [risks, critiques, and open questions](../vision/risks-critiques-open-questions.md).

## Adversarial verification verdicts

Every load-bearing claim above went through adversarial verification against primary sources. Summary:

| Claim | Verdict | Key correction or nuance |
|---|---|---|
| Cursor requires `.mdc` and ignores `.md` in `.cursor/rules` | CONFIRMED | No other AI editor reads `.mdc`; the cross-editor standard is AGENTS.md (which Cursor also reads) |
| A Cursor engineer says MDC = "Markdown Cursor"; no official spec/schema/linter exists | CONFIRMED | Statement made in an Apr 2025 GitHub comment (quoted into the forum); the engineer added he'd be "happy to rebrand" |
| Cursor's `.mdc` ecosystem is large; a community effort positions it as tool-agnostic | CONFIRMED | Verified figures: ~37,800 stars, 500+ rules; the "standard" push is one maintainer, 132 stars, no multi-tool adoption |
| Nuxt MDC claims the acronym but not the `.mdc` extension | **REFUTED** | Nuxt's VS Code extension (~299K installs) explicitly registers `.mdc`; persists under the Comark rebrand |
| Google Material MDC triples the acronym collision | CONFIRMED | MDC-Web archived Jan 2025; legacy docs/codelabs still dominate search |
| Legacy desktop `.mdc` claims are all low-relevance | CONFIRMED | Add Minolta RAW and Pfeiffer Quadstar; equally low-relevance |
| Linguist assigns `.mdc` no language | CONFIRMED | Worse than claimed: `renderedFileInfo` is also null (no markdown rendering at all); the one Linguist PR was rejected |
| `.mdb` = Access, and Outlook blocks it by default | CONFIRMED | Blocking is receipt-side stripping in desktop Outlook, outright blocking in OWA; net effect identical |
| `.mddb` is unclaimed; MDDB is a SAS/OLAP acronym | CONFIRMED | Conceptual overlap only; SAS uses different extensions; npm name taken by MarkdownDB |
| CommonMark shipped spec + tooling on day one after two private years | CONFIRMED | Launched as "Standard Markdown," forcibly renamed to CommonMark within days — the pre-announcement-registration lesson |

Full verdict evidence lives with the research corpus; the adoption-strategy consequences are drawn out in [standards adoption lessons](standards-adoption-lessons.md) and the prior-art surveys of [checklist formats](prior-art-checklist-formats.md) and [markdown databases](prior-art-markdown-databases.md).
