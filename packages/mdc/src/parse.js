/**
 * Remark pipeline -> L1 document model.
 *
 * The pipeline is unified + remark-parse + remark-gfm + remark-frontmatter;
 * `remarkMdc` layers the MDC item model on top. Non-task list items and all
 * prose are not modeled — they round-trip untouched. Structure and nesting
 * come from mdast; each task item's text and attributes come from its raw
 * source line (positions are 1-based), which is what makes later line surgery
 * (`fmt`, mutations) exact.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { readFrontmatter, assertMdcDocument, stripBom } from './frontmatter.js';
import { extractAttributeBlock, parseAttributeBlock } from './attributes.js';
import { computeDerived } from './model.js';

/**
 * @typedef {Object} MdcComputed
 * @property {boolean} blocked True when any `needs=` target is non-terminal, dangling, or in a `needs` cycle; children inherit from their parent (union).
 * @property {string[]} blockedBy Ids of the `needs=` targets (or inherited sources) causing `blocked`.
 * @property {string[]} gatedBy Ids of earlier non-terminal `.gate` items (`"<line N>"` for a gate with no id).
 * @property {boolean} actionable `state == open` AND not blocked AND not gated AND all children terminal.
 * @property {{ done: number, total: number } | null} progress `null` for leaf items; for parents counts direct and transitive children, cancelled items excluded from both numerator and denominator.
 */

/**
 * @typedef {Object} MdcItem
 * @property {string | null} id
 * @property {string} text Verbatim inline markdown between the bracket and the attribute block, wrapping `~~` stripped for cancelled items.
 * @property {'open' | 'done' | 'cancelled'} state
 * @property {string | null} assignee
 * @property {string[]} classes
 * @property {Record<string, string | string[]>} attrs Reserved + `x-` keys; `needs` is always an array, everything else a string. `id`, `assignee`, and classes are top-level, never repeated here.
 * @property {string | null} section Text of the nearest preceding heading at any depth, else `null`.
 * @property {number} line 1-based source line number.
 * @property {MdcItem[]} children Nested task items in document order.
 * @property {MdcComputed} computed
 */

/**
 * @typedef {Object} MdcWarning
 * @property {'malformed-attributes' | 'multiple-ids' | 'multiple-assignees'} rule
 * @property {number} line 1-based source line number the warning anchors to.
 * @property {string} message
 */

/**
 * @typedef {Object} MdcDocument
 * @property {string} mdc
 * @property {'template' | 'run' | 'list'} kind Defaults to "list" when the frontmatter has no `kind`.
 * @property {string | null} title
 * @property {Record<string, unknown>} frontmatter All frontmatter keys verbatim.
 * @property {MdcItem[]} items Nested tree in document order.
 * @property {MdcWarning[]} warnings Document-level parse warnings (e.g. malformed attribute blocks kept as text).
 */

const ITEM_LINE_RE = /^(\s*)([-*+])\s+\[( |x|X)\]\s+(.*)$/;

/**
 * Concatenated plain text of an inline subtree (heading text for `section`).
 *
 * @param {{ value?: string, children?: object[] }} node
 * @returns {string}
 */
function inlineText(node) {
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(inlineText).join('');
  return '';
}

/**
 * Extract task items and parse warnings from an mdast tree plus the raw source.
 *
 * @param {object} tree mdast root.
 * @param {string} text Full document source.
 * @returns {{ items: MdcItem[], warnings: MdcWarning[] }}
 */
export function extractModel(tree, text) {
  const lines = text.split('\n');
  /** @type {MdcItem[]} */
  const items = [];
  /** @type {MdcWarning[]} */
  const warnings = [];
  /** @type {string | null} */
  let section = null;

  /**
   * @param {object} li mdast listItem with boolean `checked`.
   * @param {number} srcDepth 0-based source list-nesting depth of this item (the
   *   number of enclosing lists minus one), used for canonical indentation. It
   *   differs from the task-tree depth when a task is nested under a *non-task*
   *   list item, and is what stops `fmt`/mutations from dedenting such items.
   * @returns {MdcItem | null} `null` when the source line is not an item line.
   */
  function buildItem(li, srcDepth) {
    const line = li.position?.start.line ?? 0;
    const match = ITEM_LINE_RE.exec((lines[line - 1] ?? '').replace(/\r$/, ''));
    if (!match) return null;
    const { text: bare, block, malformed } = extractAttributeBlock(match[4]);
    if (malformed) {
      warnings.push({ rule: 'malformed-attributes', line, message: 'attribute block does not tokenize; kept as text' });
    }
    /** @type {string | null} */
    let id = null;
    /** @type {string | null} */
    let assignee = null;
    /** @type {string[]} */
    let classes = [];
    /** @type {Record<string, string | string[]>} */
    let attrs = {};
    if (block !== null) {
      const parsed = /** @type {import('./attributes.js').ParsedAttributes} */ (parseAttributeBlock(block));
      ({ id, assignee, classes, attrs } = parsed);
      for (const finding of parsed.findings) warnings.push({ rule: finding.rule, line, message: finding.message });
    }
    /** @type {MdcItem['state']} */
    let state = 'open';
    let itemText = bare;
    if (li.checked === true) {
      // Cancelled only when the whole text is a single strikethrough span — a
      // done item that merely *contains* struck phrases (two `~~…~~` spans) is
      // still done, never cancelled.
      if (bare.length >= 4 && bare.startsWith('~~') && bare.endsWith('~~') && !bare.slice(2, -2).includes('~~')) {
        state = 'cancelled';
        itemText = bare.slice(2, -2);
      } else {
        state = 'done';
      }
    }
    /** @type {MdcItem} */
    const item = {
      id,
      text: itemText,
      state,
      assignee,
      classes,
      attrs,
      section,
      line,
      children: [],
      computed: { blocked: false, blockedBy: [], gatedBy: [], actionable: false, progress: null },
    };
    // Internal, non-normative: source indent depth for canonical serialization.
    // Stripped from `parse --json` and from corpus comparison (see corpus.js).
    Object.defineProperty(item, '_srcDepth', { value: srcDepth, enumerable: false });
    for (const child of li.children ?? []) visit(child, item.children, srcDepth + 1);
    return item;
  }

  /**
   * @param {object} node
   * @param {MdcItem[]} bucket Where task items found at this level accumulate.
   * @param {number} listDepth 0-based nesting depth to assign to task items in
   *   the next `list` encountered; increments through every list level, whether
   *   or not the enclosing items are tasks.
   */
  function visit(node, bucket, listDepth) {
    if (node.type === 'heading') {
      section = inlineText(node);
      return;
    }
    if (node.type === 'list') {
      for (const li of node.children ?? []) {
        if (typeof li.checked === 'boolean') {
          const item = buildItem(li, listDepth);
          if (item) bucket.push(item);
        } else {
          // A non-task (prose) bullet: its nested tasks flatten into this bucket
          // for the task model, but they sit one list level deeper in the source.
          for (const child of li.children ?? []) visit(child, bucket, listDepth + 1);
        }
      }
      return;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child, bucket, listDepth);
    }
  }

  visit(tree, items, 0);
  return { items, warnings };
}

/**
 * Unified plugin: attaches the MDC transform that extracts task items and
 * builds the L1 model from the mdast tree into `file.data.mdc`.
 *
 * @this {import('unified').Processor}
 * @returns {(tree: object, file: { value?: unknown, data: Record<string, unknown> }) => void} mdast transformer.
 */
export function remarkMdc() {
  return (tree, file) => {
    file.data.mdc = extractModel(tree, String(file.value ?? ''));
  };
}

/**
 * Parse a full MDC document to the L1 model, computed fields included.
 *
 * @param {string} text Full document source.
 * @returns {MdcDocument}
 * @throws {Error} `not an MDC document (missing 'mdc' frontmatter key)` — CLI exit 1, `code: 'not-mdc'`.
 * @throws {Error} `unsupported mdc version` — CLI exit 1, `code: 'unsupported-version'`.
 */
export function parseDocument(text) {
  const src = stripBom(text);
  const fm = readFrontmatter(src);
  const header = assertMdcDocument(fm?.data ?? null);
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);
  const tree = processor.runSync(processor.parse(src));
  const { items, warnings } = extractModel(tree, src);
  /** @type {MdcDocument} */
  const doc = {
    mdc: header.mdc,
    kind: header.kind,
    title: header.title,
    frontmatter: /** @type {Record<string, unknown>} */ (fm?.data ?? {}),
    items,
    warnings,
  };
  return computeDerived(doc);
}
