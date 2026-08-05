/**
 * Lint rules over the parsed model + raw lines. Closed rule set for v0.
 * Findings are ordered by line, then rule name ascending within a line (C-3).
 */
import { RESERVED_KEYS } from './attributes.js';
import { flattenItems, needsCycleMembers } from './model.js';
import { serializeItemLine } from './fmt.js';

/** @typedef {import('./parse.js').MdcDocument} MdcDocument */

/**
 * @typedef {'duplicate-id' | 'dangling-needs' | 'needs-cycle' | 'malformed-attributes'
 *         | 'multiple-ids' | 'multiple-assignees' | 'invalid-date' | 'invalid-repeat'
 *         | 'unknown-key' | 'non-canonical-state' | 'cancelled-without-reason'} LintRule
 */

/**
 * @typedef {Object} LintFinding
 * @property {LintRule} rule
 * @property {'error' | 'warning'} severity `unknown-key`, `non-canonical-state`, and `cancelled-without-reason` are warnings; the rest are errors.
 * @property {number} line 1-based source line number.
 * @property {string | null} id Id of the item the finding is on, when it has one.
 * @property {string} message
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REPEAT_RE = /^(done|due)\+\d+[dwm]$/;

/**
 * Run every lint rule.
 *
 * `non-canonical-state` fires exactly where `fmt` would change a line; lines
 * whose attribute block is malformed are exempt because `fmt` leaves them
 * byte-untouched (FMT-9).
 *
 * @param {MdcDocument} doc Parsed document (its `warnings` feed `malformed-attributes` and `multiple-*`).
 * @param {string} text Raw source, for line-level rules the model cannot see.
 * @returns {LintFinding[]} Findings ordered by line, then rule name.
 */
export function lintDocument(doc, text) {
  const lines = text.split('\n');
  const flat = flattenItems(doc);
  const cycleMembers = needsCycleMembers(doc);
  /** @type {Set<string>} */
  const knownIds = new Set();
  for (const { item } of flat) {
    if (item.id !== null) knownIds.add(item.id);
  }

  /** @type {LintFinding[]} */
  const findings = [];
  /**
   * @param {LintRule} rule
   * @param {'error' | 'warning'} severity
   * @param {number} line
   * @param {string | null} id
   * @param {string} message
   */
  const add = (rule, severity, line, id, message) => findings.push({ rule, severity, line, id, message });

  const started = doc.frontmatter.started;
  if (started !== undefined) {
    const value = typeof started === 'string' ? started : String(started);
    if (!DATE_RE.test(value)) {
      const startedLine = lines.findIndex((l, i) => i > 0 && /^started:/.test(l)) + 1;
      add('invalid-date', 'error', startedLine > 0 ? startedLine : 1, null,
        `invalid date "${value}" for started; expected YYYY-MM-DD`);
    }
  }

  /** @type {Set<string>} */
  const seenIds = new Set();
  const malformedLines = new Set(
    doc.warnings.filter((w) => w.rule === 'malformed-attributes').map((w) => w.line),
  );

  for (const { item, depth } of flat) {
    const { line, id, attrs } = item;
    for (const warning of doc.warnings) {
      if (warning.line !== line) continue;
      add(warning.rule, 'error', line, id, warning.message);
    }
    if (id !== null) {
      if (seenIds.has(id)) add('duplicate-id', 'error', line, id, `duplicate id "${id}"`);
      seenIds.add(id);
    }
    if (Array.isArray(attrs.needs)) {
      for (const target of attrs.needs) {
        if (!knownIds.has(target)) {
          add('dangling-needs', 'error', line, id, `needs references unknown id "${target}"`);
        }
      }
    }
    if (cycleMembers.has(item)) add('needs-cycle', 'error', line, id, 'item is in a needs cycle');
    for (const key of ['done', 'due']) {
      const value = attrs[key];
      if (typeof value === 'string' && !DATE_RE.test(value)) {
        add('invalid-date', 'error', line, id, `invalid date "${value}" for ${key}; expected YYYY-MM-DD`);
      }
    }
    if (typeof attrs.repeat === 'string' && !REPEAT_RE.test(attrs.repeat)) {
      add('invalid-repeat', 'error', line, id, `invalid repeat "${attrs.repeat}"; expected (done|due)+<n><d|w|m>`);
    }
    for (const key of Object.keys(attrs)) {
      if (!RESERVED_KEYS.includes(key) && !key.startsWith('x-')) {
        add('unknown-key', 'warning', line, id, `unknown key "${key}"; extension keys must use the x- prefix`);
      }
    }
    if (item.state === 'cancelled' && typeof attrs.reason !== 'string') {
      add('cancelled-without-reason', 'warning', line, id, 'cancelled item has no reason=');
    }
    if (!malformedLines.has(line) && serializeItemLine(item, depth) !== (lines[line - 1] ?? '')) {
      add('non-canonical-state', 'warning', line, id, 'not in canonical form; fmt would rewrite this line');
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}
