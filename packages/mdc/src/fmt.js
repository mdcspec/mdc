/**
 * Canonical form. Only task-item lines are ever rewritten; frontmatter and all
 * prose bytes are preserved exactly. Canonical item line:
 * `<indent>- [<mark>] <text>[ <attribute-block>]` — marker `-`, `[x]` lowercase,
 * child indent exactly 2 spaces per depth, one space between all parts,
 * attribute block serialized canonically.
 */
import { serializeAttributeBlock } from './attributes.js';
import { parseDocument } from './parse.js';
import { flattenItems } from './model.js';

/** @typedef {import('./parse.js').MdcItem} MdcItem */

/**
 * Produce the canonical form of a document.
 *
 * Total over any input: a non-MDC document (or unsupported version) is
 * returned unchanged, which keeps the corpus-wide idempotence property
 * runnable over every fixture — the CLI asserts MDC-ness separately so
 * `fmt` still exits 1 on such input. Lines whose attribute block is
 * malformed are left byte-untouched (FMT-9): rewriting them would fold the
 * braces into the text and destroy the reader's chance to fix the block.
 *
 * @param {string} text Full document source.
 * @param {{ assignIds?: boolean }} [options] `assignIds` generates slugs for
 *   items lacking an ID (deterministic; collisions suffixed `-2`, `-3`, …).
 * @returns {{ text: string, changed: boolean }} Canonical text and whether it
 *   differs from the input (`fmt --check` exits 2 when `changed`).
 */
export function formatDocument(text, options = {}) {
  /** @type {import('./parse.js').MdcDocument} */
  let doc;
  try {
    doc = parseDocument(text);
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err)?.code;
    if (code === 'not-mdc' || code === 'unsupported-version') {
      return { text, changed: false };
    }
    throw err;
  }

  const lines = text.split('\n');
  const flat = flattenItems(doc);
  const malformedLines = new Set(
    doc.warnings.filter((w) => w.rule === 'malformed-attributes').map((w) => w.line),
  );
  if (options.assignIds === true) assignIds(flat, malformedLines);
  for (const { item, depth } of flat) {
    if (malformedLines.has(item.line)) continue;
    // Re-attach the line's original CR so a CRLF document stays CRLF and the
    // rewrite touches only the intended bytes.
    const cr = (lines[item.line - 1] ?? '').endsWith('\r') ? '\r' : '';
    lines[item.line - 1] = serializeItemLine(item, depth) + cr;
  }
  const result = lines.join('\n');
  return { text: result, changed: result !== text };
}

/**
 * Assign a deterministic slug id to every item that lacks one, in document
 * order. Collisions with any existing or previously generated id append
 * `-2`, `-3`, …. Items on malformed-attribute lines are skipped — their
 * lines cannot be rewritten.
 *
 * @param {Array<{ item: MdcItem, depth: number }>} flat Items in document order.
 * @param {Set<number>} malformedLines
 */
function assignIds(flat, malformedLines) {
  /** @type {Set<string>} */
  const used = new Set();
  for (const { item } of flat) {
    if (item.id !== null) used.add(item.id);
  }
  for (const { item } of flat) {
    if (item.id !== null || malformedLines.has(item.line)) continue;
    const base = slugify(item.text) || 'item';
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    item.id = slug;
  }
}

/**
 * Serialize one item back to its canonical source line (no trailing newline).
 * Shared by `fmt`, by every mutation when it regenerates the target line, and
 * by lint's `non-canonical-state` comparison.
 *
 * @param {MdcItem} item Cancelled items are re-wrapped in `~~` outside the attribute block.
 * @param {number} depth Task-tree nesting depth; used only as a fallback when the
 *   item carries no `_srcDepth` (its true source list depth, which is what keeps
 *   tasks nested under non-task bullets from being dedented).
 * @returns {string}
 */
export function serializeItemLine(item, depth) {
  const srcDepth = /** @type {{ _srcDepth?: number }} */ (item)._srcDepth;
  const indent = '  '.repeat(typeof srcDepth === 'number' ? srcDepth : depth);
  const mark = item.state === 'open' ? ' ' : 'x';
  const text = item.state === 'cancelled' ? `~~${item.text}~~` : item.text;
  const block = serializeAttributeBlock({
    id: item.id,
    classes: item.classes,
    assignee: item.assignee,
    attrs: item.attrs,
  });
  return `${indent}- [${mark}] ${text}${block === '' ? '' : ` ${block}`}`;
}

/**
 * Base slug for `--assign-ids`: lowercase the text, strip inline markdown
 * syntax, take the first three words, join with `-`, strip chars outside
 * `[a-z0-9-]`, collapse repeats. Collision suffixing is the caller's job.
 *
 * @param {string} text Item text.
 * @returns {string}
 */
export function slugify(text) {
  const words = text
    .toLowerCase()
    .replace(/[`*_~[\]()!#>]/g, '')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 3);
  return words
    .join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
