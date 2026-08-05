/**
 * In-band MDC detection and YAML parsing of the leading frontmatter block.
 *
 * A document is MDC iff it begins with a YAML frontmatter block ("---" fence
 * on line 1) whose mapping contains the key `mdc` with a string value.
 * Frontmatter is surfaced verbatim in the model and never rewritten in v0.
 */
import { parse as parseYaml } from 'yaml';

/**
 * @typedef {Object} FrontmatterBlock
 * @property {Record<string, unknown>} data Parsed YAML mapping, all keys verbatim (unknown keys preserved, never an error).
 * @property {string} raw Source bytes of the block, both "---" fences included.
 * @property {number} endLine 1-based line number of the closing "---" fence.
 */

/**
 * @param {string} message
 * @param {'not-mdc' | 'unsupported-version'} code
 * @returns {Error & { code: string, exitCode: number }}
 */
function mdcError(message, code) {
  const err = /** @type {Error & { code: string, exitCode: number }} */ (new Error(message));
  err.code = code;
  err.exitCode = 1;
  return err;
}

/**
 * Strip a single leading UTF-8 BOM. Notepad and some PowerShell redirects
 * prepend U+FEFF; it is an encoding artifact, not document content, and would
 * otherwise push the "---" off column 0 and defeat in-band detection. Write
 * paths never see this — only item lines are rewritten, and the BOM sits on
 * line 1.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Locate and YAML-parse the frontmatter block at the top of a document.
 *
 * Tolerant of CRLF and a leading BOM: the fence check and YAML parse strip a
 * trailing "\r" per line, so a Windows-checkout document is detected exactly
 * like a LF one. The raw source is never rewritten (only item lines are), so
 * the original bytes survive untouched on write paths.
 *
 * @param {string} text Full document source.
 * @returns {FrontmatterBlock | null} `null` when line 1 is not a "---" fence,
 *   the block never closes, or its YAML is not a mapping — the document may
 *   still be markdown, but it cannot be MDC.
 */
export function readFrontmatter(text) {
  const lines = stripBom(text).split('\n');
  const bare = (/** @type {string} */ line) => line.replace(/\r$/, '');
  if (bare(lines[0] ?? '') !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (bare(lines[i]) !== '---') continue;
    let data;
    try {
      data = parseYaml(lines.slice(1, i).map(bare).join('\n'));
    } catch {
      return null;
    }
    if (data === null || data === undefined) data = {};
    if (typeof data !== 'object' || Array.isArray(data)) return null;
    return {
      data: /** @type {Record<string, unknown>} */ (data),
      raw: lines.slice(0, i + 1).join('\n'),
      endLine: i + 1,
    };
  }
  return null;
}

/**
 * Enforce the in-band signature on a parsed frontmatter mapping.
 *
 * @param {Record<string, unknown> | null | undefined} data Parsed frontmatter
 *   mapping, or `null`/`undefined` when the document has no frontmatter.
 * @returns {{ mdc: string, kind: 'template'|'run'|'list', title: string|null }}
 *   Normalized header fields; `kind` defaults to "list" when absent.
 * @throws {Error} `not an MDC document (missing 'mdc' frontmatter key)` when
 *   the `mdc` key is absent, or a variant naming the key when it is present but
 *   not a string (e.g. unquoted `mdc: 0.1`, which YAML reads as a number) —
 *   every CLI verb exits 1.
 * @throws {Error} `unsupported mdc version …` when `mdc` is a string other than
 *   "0.1" — CLI exit 1.
 */
export function assertMdcDocument(data) {
  if (!data || !('mdc' in data)) {
    throw mdcError("not an MDC document (missing 'mdc' frontmatter key)", 'not-mdc');
  }
  if (typeof data.mdc !== 'string') {
    throw mdcError(
      `not an MDC document: 'mdc' frontmatter value must be a quoted string — write mdc: "0.1" (got ${JSON.stringify(data.mdc)})`,
      'not-mdc',
    );
  }
  if (data.mdc !== '0.1') {
    throw mdcError(`unsupported mdc version ${JSON.stringify(data.mdc)} (this tool implements "0.1")`, 'unsupported-version');
  }
  const kind = typeof data.kind === 'string' ? /** @type {'template'|'run'|'list'} */ (data.kind) : 'list';
  const title = typeof data.title === 'string' ? data.title : null;
  return { mdc: data.mdc, kind, title };
}
