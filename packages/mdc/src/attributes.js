/**
 * Attribute-block microgrammar: parse and canonical serialization.
 *
 * Grammar (tokenized on whitespace outside double quotes):
 *   block := "{" token (SP token)* "}"
 *   token := "#"slug | "."slug | "@"slug | key "=" (bare | '"' … '"')
 * A block that does not tokenize (unbalanced quote/brace, empty "{}") is NOT
 * attributes: the braces stay part of the item text (L0 safety).
 */

/** Reserved attribute keys (closed set for v0); extensions must use an "x-" prefix. */
export const RESERVED_KEYS = ['due', 'done', 'repeat', 'needs', 'verify', 'reason'];

/** Reserved classes; all other classes are free-form tags. */
export const RESERVED_CLASSES = ['gate', 'optional', 'doing', 'waiting'];

const SLUG_RE = /^[A-Za-z0-9_/-]+$/;
const BARE_INVALID_RE = /["{}]/;

/**
 * @typedef {Object} ParsedAttributes
 * @property {string | null} id First `#slug` token; later ones are dropped (lint `multiple-ids`).
 * @property {string | null} assignee First `@slug` token; later ones are dropped (lint `multiple-assignees`).
 * @property {string[]} classes `.class` tokens in source order (canonical serialization sorts them).
 * @property {Record<string, string | string[]>} attrs Key/value tokens; `needs` is always an array (comma-split), everything else a string.
 * @property {Array<{ rule: 'multiple-ids'|'multiple-assignees', message: string }>} findings
 *   Token-level irregularities the parser surfaces as document warnings and
 *   lint reports as errors with line context.
 */

/**
 * Split block content on whitespace outside double quotes.
 *
 * @param {string} content Block interior, braces excluded.
 * @returns {string[] | null} `null` on unbalanced quotes or when no token exists.
 */
function tokenize(content) {
  /** @type {string[]} */
  const tokens = [];
  let current = '';
  let inQuote = false;
  for (const ch of content) {
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if (!inQuote && /\s/.test(ch)) {
      if (current !== '') tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (inQuote) return null;
  if (current !== '') tokens.push(current);
  return tokens.length > 0 ? tokens : null;
}

/**
 * Tokenize and parse a candidate attribute block.
 *
 * @param {string} block The block including surrounding braces, e.g. `{#ci needs=a,b}`.
 * @returns {ParsedAttributes | null} `null` when the block does not tokenize —
 *   the caller must keep the braces as item text and record a document-level
 *   warning (lint reports `malformed-attributes` at that line).
 */
export function parseAttributeBlock(block) {
  if (!block.startsWith('{') || !block.endsWith('}') || block.length < 2) return null;
  const tokens = tokenize(block.slice(1, -1));
  if (tokens === null) return null;

  /** @type {string | null} */
  let id = null;
  /** @type {string | null} */
  let assignee = null;
  /** @type {string[]} */
  const classes = [];
  /** @type {Record<string, string | string[]>} */
  const attrs = {};
  /** @type {ParsedAttributes['findings']} */
  const findings = [];

  for (const token of tokens) {
    const sigil = token[0];
    if (sigil === '#' || sigil === '.' || sigil === '@') {
      const slug = token.slice(1);
      if (!SLUG_RE.test(slug)) return null;
      if (sigil === '#') {
        if (id === null) id = slug;
        else findings.push({ rule: 'multiple-ids', message: `multiple ids; first (#${id}) wins` });
      } else if (sigil === '@') {
        if (assignee === null) assignee = slug;
        else findings.push({ rule: 'multiple-assignees', message: `multiple assignees; first (@${assignee}) wins` });
      } else if (!classes.includes(slug)) {
        classes.push(slug);
      }
      continue;
    }
    const eq = token.indexOf('=');
    if (eq <= 0) return null;
    const key = token.slice(0, eq);
    let value = token.slice(eq + 1);
    if (!SLUG_RE.test(key)) return null;
    if (value.startsWith('"')) {
      if (value.length < 2 || !value.endsWith('"') || value.slice(1, -1).includes('"')) return null;
      value = value.slice(1, -1);
    } else if (value === '' || BARE_INVALID_RE.test(value)) {
      return null;
    }
    if (key in attrs) continue;
    attrs[key] = key === 'needs' ? value.split(',') : value;
  }

  return { id, assignee, classes, attrs, findings };
}

/**
 * Split an item's text into verbatim text and a trailing candidate block.
 *
 * The block is a trailing `{…}` at end of line preceded by at least one space;
 * an item whose entire text is a block has no text, which is disallowed — the
 * braces then remain text. Candidate start braces are tried right-to-left so a
 * quoted value may itself contain braces.
 *
 * @param {string} text Item text after `"] "` (attribute block included if present).
 * @returns {{ text: string, block: string | null, malformed: boolean }} `block`
 *   includes the braces and is guaranteed to tokenize; `malformed` is true when
 *   a trailing candidate existed but none tokenized (braces stay in `text`).
 */
export function extractAttributeBlock(text) {
  const trimmed = text.trim();
  if (!trimmed.endsWith('}')) return { text: trimmed, block: null, malformed: false };
  let sawCandidate = false;
  for (let i = trimmed.lastIndexOf('{'); i > 0; i = trimmed.lastIndexOf('{', i - 1)) {
    if (!/\s/.test(trimmed[i - 1])) continue;
    sawCandidate = true;
    const candidate = trimmed.slice(i);
    if (parseAttributeBlock(candidate) !== null) {
      return { text: trimmed.slice(0, i).trimEnd(), block: candidate, malformed: false };
    }
  }
  return { text: trimmed, block: null, malformed: sawCandidate };
}

/**
 * Canonical serialization: `{#id .class-a .class-b @assignee key=value}`.
 *
 * Order: id, classes (alphabetical), assignee, keys alphabetical. Single
 * spaces. Values quoted only when they contain whitespace or a brace; `needs`
 * is comma-joined in source order (order may be meaningful to readers).
 *
 * @param {{ id?: string | null, classes?: string[], assignee?: string | null, attrs?: Record<string, string | string[]> }} parts
 * @returns {string} The canonical block including braces, or `""` when there is nothing to serialize.
 */
export function serializeAttributeBlock(parts) {
  const { id = null, classes = [], assignee = null, attrs = {} } = parts;
  /** @type {string[]} */
  const tokens = [];
  if (id !== null) tokens.push(`#${id}`);
  for (const cls of [...classes].sort()) tokens.push(`.${cls}`);
  if (assignee !== null) tokens.push(`@${assignee}`);
  for (const key of Object.keys(attrs).sort()) {
    const raw = attrs[key];
    const value = Array.isArray(raw) ? raw.join(',') : String(raw);
    const needsQuotes = value === '' || /[\s{}"]/.test(value);
    tokens.push(`${key}=${needsQuotes ? `"${value}"` : value}`);
  }
  return tokens.length > 0 ? `{${tokens.join(' ')}}` : '';
}
