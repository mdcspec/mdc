# @mdcspec/mdc

Reference parser and CLI for **MDC (Markdown Checklists)**: a plain-text format for durable, diffable task state shared by humans and AI agents. Every MDC document is valid GitHub-Flavored Markdown; this package adds the L1 JSON model, the linter, and L2 deterministic mutations.

```bash
npm install -g @mdcspec/mdc    # the `mdc` CLI
# or run without installing:
npx @mdcspec/mdc next board.mdc.md --json
```

## The CLI

Exit codes are the contract: **`0`** success, **`1`** usage/IO/parse/not-MDC, **`2`** domain refusal (precondition failed, e.g. the item is already claimed). Branch on `2`; it means "not yours / not now," not "crash."

```bash
mdc parse  <file> --json      # the L1 model
mdc lint   <file>             # structural checks
mdc status <file>             # progress, blocked, actionable
mdc next   <file> --as <you>  # the items you can act on, in order
mdc report <file>             # standup: who's doing what, ready, blocked

mdc add    <file> "…" --needs a,b   # record new work; prints the new id
mdc claim  <file> <id> --as <you>   # take an item (exit 2 if already taken)
mdc start  <file> <id>              # mark in progress (.doing)
mdc check  <file> <id>              # mark done
mdc note   <file> <id> "…" --as <you>
mdc fmt    <file> --check           # canonical formatting

mdc cut <template> --out <run> --title "…"   # instantiate a template
```

Full verb surface: `parse lint status next report` (reads); `check uncheck cancel claim unclaim start unstart add edit note` (mutations); `fmt cut`. Every mutation rewrites exactly one line and prints the resulting canonical line, so concurrent edits merge cleanly under plain git.

## Programmatic API

```js
import { parseDocument, nextItems, check, lintDocument } from '@mdcspec/mdc';

const doc = parseDocument(fs.readFileSync('board.mdc.md', 'utf8'));
const ready = nextItems(doc);           // actionable items, in order
await check('board.mdc.md', 'tests');   // mutate on disk (atomic, locked)
```

Exposed: `parseDocument`, `statusReport`, `nextItems`, `reportData`, `computeDerived`, `flattenItems`, `lintDocument`, `formatDocument`, the mutation verbs (`check`, `uncheck`, `cancel`, `claim`, `unclaim`, `start`, `unstart`, `note`, `edit`, `addItem`), `PreconditionError`, and `cutRun`. Mutations are async, write atomically, and throw `PreconditionError` on a domain refusal.

## Conformance

This is the reference implementation at conformance class **CONF-L2**. The spec, the executable corpus, and the language-neutral run contract live in the [main repository](https://github.com/mdcspec/mdc); any implementation can earn a conformance class against the same corpus.

## License

MIT. See [LICENSE](LICENSE).
