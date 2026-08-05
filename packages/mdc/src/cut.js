/**
 * `cut`: instantiate a `kind: run` document from a `kind: template`.
 *
 * The template carries the *procedure* — item text, ids, `.gate`/`.optional`
 * classes, `needs=` edges, `verify=` hooks, recurrence rules. A run is one
 * execution of it. Cutting copies the template body verbatim (prose and
 * headings round-trip byte-for-byte), strips any run-only state from item
 * lines so the run starts clean, and writes fresh run frontmatter: `kind: run`,
 * the pinned `template:` reference, an optional `title` override, and `started`.
 * Cross-run history and rollups are relational and out of scope — a run is just
 * a document (see the .mddb concept sketch).
 */
import { stringify as yamlStringify } from 'yaml';
import { parseDocument } from './parse.js';
import { flattenItems } from './model.js';
import { serializeItemLine } from './fmt.js';
import { readFrontmatter, stripBom } from './frontmatter.js';

/** Attributes and classes that belong to a single execution, cleared on cut. */
const RUN_ONLY_ATTRS = ['done', 'reason', 'due'];
const RUN_ONLY_CLASSES = ['doing', 'waiting'];

/**
 * @param {string} message
 * @param {number} exitCode
 * @returns {Error & { exitCode: number }}
 */
function cutError(message, exitCode) {
  const err = /** @type {Error & { exitCode: number }} */ (new Error(message));
  err.exitCode = exitCode;
  return err;
}

/**
 * Produce the text of a run cut from a template.
 *
 * @param {string} templateText Full source of a `kind: template` document.
 * @param {Object} options
 * @param {string} options.templateRef Value for the run's `template:` key (e.g. `templates/release.mdc.md@5`).
 * @param {string} options.started Run start date, `YYYY-MM-DD`.
 * @param {string} [options.title] Title override; defaults to the template's title.
 * @returns {string} The run document text.
 * @throws {Error} exit 1 when the source is not MDC or not a template.
 */
export function cutRun(templateText, options) {
  const src = stripBom(templateText);
  const doc = parseDocument(src);
  if (doc.kind !== 'template') {
    throw cutError(
      `cut: source is not a template (kind: ${doc.kind}); cut instantiates a run from a 'kind: template' document`,
      1,
    );
  }
  const fm = /** @type {import('./frontmatter.js').FrontmatterBlock} */ (readFrontmatter(src));

  // Fresh run frontmatter, canonical key order, extra template keys preserved.
  const title = options.title ?? doc.title ?? undefined;
  /** @type {Record<string, unknown>} */
  const out = { mdc: '0.1', kind: 'run', template: options.templateRef };
  if (title !== undefined && title !== null) out.title = title;
  if (typeof doc.frontmatter.mode === 'string') out.mode = doc.frontmatter.mode;
  out.started = options.started;
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    if (!(key in out) && key !== 'kind' && key !== 'title') out[key] = value;
  }
  const frontmatter = `---\n${yamlStringify(out)}---`;

  // Copy the body (everything after the closing fence); rewrite only item lines,
  // stripping run-only state so the run starts pristine and canonical.
  const bodyLines = src.split('\n').slice(fm.endLine);
  for (const { item, depth } of flattenItems(doc)) {
    item.state = 'open';
    item.assignee = null;
    item.classes = item.classes.filter((cls) => !RUN_ONLY_CLASSES.includes(cls));
    for (const key of RUN_ONLY_ATTRS) delete item.attrs[key];
    const bodyIndex = item.line - fm.endLine - 1;
    const cr = (bodyLines[bodyIndex] ?? '').endsWith('\r') ? '\r' : '';
    bodyLines[bodyIndex] = serializeItemLine(item, depth) + cr;
  }
  return `${frontmatter}\n${bodyLines.join('\n')}`;
}
