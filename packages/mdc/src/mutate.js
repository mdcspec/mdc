/**
 * L2 mutations: line surgery, never a full re-serialize.
 *
 * Every mutation: (1) acquires `<file>.lock` with `wx` (a lock older than
 * LOCK_STALE_MS is stale and may be replaced), (2) parses and locates the
 * target by ID — never by text or line number, (3) regenerates only that
 * item's line in canonical form, all other bytes copied through untouched,
 * (4) writes `<file>.tmp-<pid>` and atomically renames over the original,
 * then releases the lock.
 */

import fs from 'node:fs';
import process from 'node:process';
import { parseDocument } from './parse.js';
import { flattenItems } from './model.js';
import { serializeItemLine, slugify } from './fmt.js';

/** A lock older than this may be treated as stale and replaced. */
export const LOCK_STALE_MS = 10_000;

/** Poll cadence while waiting on a live lock; jittered to spread contenders. */
const LOCK_RETRY_MS = 15;

/** Unique per-acquisition lock token: identifies which process holds the lock. */
function lockToken() {
  return `${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Run `fn` while holding `<file>.lock` (created with `wx`). A live lock is
 * waited out — contenders poll until it frees, so of N concurrent claims each
 * gets its check-and-set turn and loses on the precondition (exit 2), never on
 * contention. A lock whose mtime is older than LOCK_STALE_MS is stale and is
 * reaped by *rename* (not unlink) so exactly one contender wins the takeover —
 * two reapers unlinking in parallel could otherwise both go on to `wx`-create.
 * The lock carries an ownership token; `fn` receives an `ownsLock()` probe and
 * the `finally` only removes the lock while it is still ours, so a rival that
 * legitimately reaped a stale lock is never clobbered.
 *
 * @template T
 * @param {string} file Path whose sibling `<file>.lock` guards the write.
 * @param {(ownsLock: () => boolean) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withFileLock(file, fn) {
  const lockPath = `${file}.lock`;
  const token = lockToken();
  for (;;) {
    try {
      fs.writeFileSync(lockPath, token, { flag: 'wx' });
      break;
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') throw err;
      let stat;
      try {
        stat = fs.statSync(lockPath);
      } catch {
        continue; // reaped between our wx and stat; retry immediately
      }
      if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        const reaped = `${lockPath}.reap-${token}`;
        try {
          fs.renameSync(lockPath, reaped); // atomic: only one reaper's rename succeeds
          fs.unlinkSync(reaped);
        } catch {
          // Lost the reap race (ENOENT) — another contender took it; contend normally.
        }
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS + Math.random() * LOCK_RETRY_MS));
    }
  }
  const ownsLock = () => {
    try {
      return fs.readFileSync(lockPath, 'utf8') === token;
    } catch {
      return false;
    }
  };
  try {
    return await fn(ownsLock);
  } finally {
    try {
      if (ownsLock()) fs.unlinkSync(lockPath);
    } catch {
      // Already gone (e.g. legitimately reaped); nothing to clean up.
    }
  }
}

/**
 * Write `text` to `<file>.tmp-<pid>` and atomically rename over the original,
 * preserving the target's file mode and resolving through symlinks is the
 * caller's job (see `mutateItem`/`runFmt`, which pass a realpath). The tmp file
 * is removed on any failure after it is created — a failed write never leaks.
 *
 * @param {string} file A real path (symlinks already resolved by the caller).
 * @param {string} text
 */
export function atomicReplace(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  let mode;
  try {
    mode = fs.statSync(file).mode;
  } catch {
    mode = undefined; // new file; take the default mode
  }
  try {
    fs.writeFileSync(tmp, text);
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Nothing to clean (write may not have created it); surface the real error.
    }
    throw err;
  }
}

/**
 * Domain refusal (unknown id, state precondition failed, assignee already
 * set). The CLI maps this to exit code 2 — agents branch on it.
 */
export class PreconditionError extends Error {
  exitCode = 2;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HANDLE_RE = /^[A-Za-z0-9_/-]+$/;

/**
 * Line surgery under the lock: read, parse, locate the target by ID (never by
 * text or line number), let `apply` check its precondition and mutate the
 * item, regenerate exactly that item's line in canonical form, and atomically
 * replace the file. Every other byte is copied through untouched. A refusal
 * thrown by `apply` propagates before any write — the file stays byte-untouched.
 *
 * @param {string} file Path to the MDC document (never stdin).
 * @param {string} id Target item id.
 * @param {(item: import('./parse.js').MdcItem) => void} apply
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id or `apply`'s precondition failed — exit 2.
 * @throws {Error} IO / parse / not-MDC — exit 1.
 */
async function mutateItem(file, id, apply) {
  // Resolve symlinks up front: the lock, tmp, and rename must all act on the
  // real inode, or `check link.mdc.md` would replace the link and leave the
  // real document untouched. realpathSync throws ENOENT on a missing file — the
  // right exit-1 outcome for a mutation.
  const target = fs.realpathSync(file);
  await withFileLock(target, (ownsLock) => {
    const text = fs.readFileSync(target, 'utf8');
    const doc = parseDocument(text);
    const located = flattenItems(doc).find(({ item }) => item.id === id);
    if (located === undefined) throw new PreconditionError(`unknown id '#${id}'`);
    apply(located.item);
    const lines = text.split('\n');
    const cr = (lines[located.item.line - 1] ?? '').endsWith('\r') ? '\r' : '';
    lines[located.item.line - 1] = serializeItemLine(located.item, located.depth) + cr;
    if (!ownsLock()) {
      throw new Error('mutate: lock ownership lost before write; aborted to avoid clobbering a concurrent edit');
    }
    atomicReplace(target, lines.join('\n'));
  });
}

/**
 * `check`: open -> done, writes a `done=YYYY-MM-DD` stamp.
 *
 * @param {string} file Path to the MDC document (never stdin).
 * @param {string} id Target item id.
 * @param {{ date?: string }} [options] Stamp date `YYYY-MM-DD`; defaults to today.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id or item already terminal — exit 2.
 * @throws {Error} IO / parse / not-MDC — exit 1.
 */
export async function check(file, id, options = {}) {
  const date = options.date ?? localToday();
  if (!DATE_RE.test(date)) throw new Error(`check: --date must be YYYY-MM-DD, got '${date}'`);
  await mutateItem(file, id, (item) => {
    if (item.state !== 'open') {
      throw new PreconditionError(`cannot check '#${id}': already ${item.state}`);
    }
    item.state = 'done';
    item.attrs.done = date;
  });
}

/**
 * `uncheck`: done -> open, removes the `done=` stamp.
 *
 * @param {string} file Path to the MDC document.
 * @param {string} id Target item id.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id or item not done — exit 2.
 * @throws {Error} IO / parse / not-MDC — exit 1.
 */
export async function uncheck(file, id) {
  await mutateItem(file, id, (item) => {
    if (item.state !== 'done') {
      throw new PreconditionError(`cannot uncheck '#${id}': not done (state is ${item.state})`);
    }
    item.state = 'open';
    delete item.attrs.done;
  });
}

/**
 * `cancel`: any non-cancelled -> cancelled; wraps the text in `~~`, writes
 * `reason=`, and keeps all other attributes.
 *
 * @param {string} file Path to the MDC document.
 * @param {string} id Target item id.
 * @param {{ reason: string }} options Machine-readable reason; required.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id or already cancelled — exit 2.
 * @throws {Error} IO / parse / not-MDC / unrepresentable reason — exit 1.
 */
export async function cancel(file, id, options) {
  if (/["\n\r]/.test(options.reason)) {
    throw new Error('cancel: --reason cannot contain \'"\' or newlines (unrepresentable in v0)');
  }
  await mutateItem(file, id, (item) => {
    if (item.state === 'cancelled') {
      throw new PreconditionError(`cannot cancel '#${id}': already cancelled`);
    }
    item.state = 'cancelled';
    item.attrs.reason = options.reason;
  });
}

/**
 * `claim`: sets `@handle` iff no assignee is set. The check-and-set inside the
 * lock is the atomicity guarantee — of N concurrent claims exactly one
 * succeeds; the rest fail the precondition.
 *
 * @param {string} file Path to the MDC document.
 * @param {string} id Target item id.
 * @param {{ as: string }} options Handle to assign; required.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id or assignee already set — exit 2.
 * @throws {Error} IO / parse / not-MDC / invalid handle — exit 1.
 */
export async function claim(file, id, options) {
  if (!HANDLE_RE.test(options.as)) {
    throw new Error(`claim: --as must be a slug (a-z A-Z 0-9 - _ /), got '${options.as}'`);
  }
  await mutateItem(file, id, (item) => {
    if (item.assignee !== null) {
      throw new PreconditionError(`cannot claim '#${id}': already claimed by @${item.assignee}`);
    }
    item.assignee = options.as;
  });
}

/**
 * `start`: mark an open item in-progress by adding the reserved `.doing` class.
 * Informational only — `.doing` never affects `actionable` (STATE-6). Refuses a
 * terminal item (you cannot start what is done/cancelled) or one already `.doing`.
 *
 * @param {string} file Path to the MDC document.
 * @param {string} id Target item id.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id, item not open, or already `.doing` — exit 2.
 * @throws {Error} IO / parse / not-MDC — exit 1.
 */
export async function start(file, id) {
  await mutateItem(file, id, (item) => {
    if (item.state !== 'open') {
      throw new PreconditionError(`cannot start '#${id}': item is ${item.state}, not open`);
    }
    if (item.classes.includes('doing')) {
      throw new PreconditionError(`cannot start '#${id}': already in progress (.doing)`);
    }
    item.classes.push('doing');
  });
}

/**
 * `unstart`: clear the `.doing` class. Refuses an item that is not `.doing`.
 *
 * @param {string} file Path to the MDC document.
 * @param {string} id Target item id.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id or item not `.doing` — exit 2.
 * @throws {Error} IO / parse / not-MDC — exit 1.
 */
export async function unstart(file, id) {
  await mutateItem(file, id, (item) => {
    if (!item.classes.includes('doing')) {
      throw new PreconditionError(`cannot unstart '#${id}': not in progress (no .doing)`);
    }
    item.classes = item.classes.filter((cls) => cls !== 'doing');
  });
}

/**
 * `unclaim`: release an item's assignee (the inverse of `claim`). With `from`
 * set, refuses unless it matches the current owner — a guard against releasing
 * another agent's claim; omitted, it releases whoever holds it.
 *
 * @param {string} file Path to the MDC document.
 * @param {string} id Target item id.
 * @param {{ from?: string }} [options] Expected current owner; refuse on mismatch.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id, no assignee set, or `from` mismatch — exit 2.
 * @throws {Error} IO / parse / not-MDC — exit 1.
 */
export async function unclaim(file, id, options = {}) {
  await mutateItem(file, id, (item) => {
    if (item.assignee === null) {
      throw new PreconditionError(`cannot unclaim '#${id}': no assignee set`);
    }
    if (options.from !== undefined && item.assignee !== options.from) {
      throw new PreconditionError(`cannot unclaim '#${id}': claimed by @${item.assignee}, not @${options.from}`);
    }
    item.assignee = null;
  });
}

/** Matches an existing note line at a given indent, for chronological insertion. */
const NOTE_LINE_RE = /^- note( @[A-Za-z0-9_/-]+)? \d{4}-\d{2}-\d{2}: /;

/**
 * `note`: attach a durable, timestamped annotation to an item as a nested prose
 * bullet — `  - note @<who> <date>: <message>` — one indent level below the
 * item. Notes are the format's communication seam. Each is its **own line**, so
 * notes diff and blame per-line; notes on *different* items never conflict, and
 * a same-item concurrent-note conflict resolves trivially by keeping both lines
 * — strictly better than a single-line log where every note contends intra-line
 * on one value. Being a non-task bullet (ITEM-5) a note is invisible to the task
 * model — it never affects progress, actionable, or any derived state. New notes
 * append after the item's existing notes (chronological order).
 *
 * @param {string} file Path to the MDC document.
 * @param {string} id Target item id.
 * @param {string} message Single-line note body.
 * @param {{ as?: string, date?: string }} [options] `as` is the author handle; `date` defaults to today.
 * @returns {Promise<void>}
 * @throws {PreconditionError} Unknown id — exit 2.
 * @throws {Error} Empty/multiline message, bad `--as`/`--date`, IO, not-MDC — exit 1.
 */
export async function note(file, id, message, options = {}) {
  const msg = message.trim();
  if (msg === '') throw new Error('note: message cannot be empty');
  if (/[\r\n]/.test(msg)) throw new Error('note: message must be a single line (no newlines)');
  const author = options.as;
  if (author !== undefined && !HANDLE_RE.test(author)) {
    throw new Error(`note: --as must be a slug (a-z A-Z 0-9 - _ /), got '${author}'`);
  }
  const date = options.date ?? localToday();
  if (!DATE_RE.test(date)) throw new Error(`note: --date must be YYYY-MM-DD, got '${date}'`);

  const target = fs.realpathSync(file);
  await withFileLock(target, (ownsLock) => {
    const src = fs.readFileSync(target, 'utf8');
    const doc = parseDocument(src);
    const located = flattenItems(doc).find(({ item }) => item.id === id);
    if (located === undefined) throw new PreconditionError(`unknown id '#${id}'`);
    const srcDepth = /** @type {{ _srcDepth?: number }} */ (located.item)._srcDepth ?? located.depth;
    const indent = '  '.repeat(srcDepth + 1);
    const authorPart = author !== undefined ? ` @${author}` : '';
    const noteLine = `${indent}- note${authorPart} ${date}: ${msg}`;

    const lines = src.split('\n');
    const cr = (lines[located.item.line - 1] ?? '').endsWith('\r') ? '\r' : '';
    // Insert after the item's line and any existing notes already under it, so
    // notes read top-to-bottom in the order they were written.
    let at = located.item.line; // 0-based index of the line just after the item
    while (at < lines.length) {
      const line = (lines[at] ?? '').replace(/\r$/, '');
      if (line.startsWith(indent) && NOTE_LINE_RE.test(line.slice(indent.length))) at++;
      else break;
    }
    lines.splice(at, 0, noteLine + cr);

    if (!ownsLock()) {
      throw new Error('note: lock ownership lost before write; aborted to avoid clobbering a concurrent edit');
    }
    atomicReplace(target, lines.join('\n'));
  });
}

/**
 * `add`: append a new **open** item to the end of the document body, serialized
 * in canonical form, and return its id. Unlike the other mutations this creates
 * a line rather than rewriting one — every existing byte is copied through and
 * exactly one line (plus a trailing newline if needed) is appended, so the diff
 * stays minimal and `fmt` is a no-op afterward. Placement is end-of-document in
 * v0; section/relative placement is a planned follow-up.
 *
 * @param {string} file Path to the MDC document (never stdin).
 * @param {string} text Item text; empty (after trim) is a usage error.
 * @param {{ id?: string, needs?: string, as?: string, due?: string, classes?: string }} [options]
 *   `id` sets the id explicitly (else generated from the text); `needs`/`classes`
 *   are comma-separated; `as` sets the assignee; `due` is `YYYY-MM-DD`.
 * @returns {Promise<string>} The new item's id.
 * @throws {PreconditionError} `--id` collides with an existing id — exit 2.
 * @throws {Error} Empty text / bad slug / bad date / IO / not-MDC — exit 1.
 */
export async function addItem(file, text, options = {}) {
  const trimmed = text.trim();
  if (trimmed === '') throw new Error('add: item text cannot be empty');
  const wantId = options.id;
  const assignee = options.as;
  const due = options.due;
  if (wantId !== undefined && !HANDLE_RE.test(wantId)) {
    throw new Error(`add: --id must be a slug (a-z A-Z 0-9 - _ /), got '${wantId}'`);
  }
  if (assignee !== undefined && !HANDLE_RE.test(assignee)) {
    throw new Error(`add: --as must be a slug (a-z A-Z 0-9 - _ /), got '${assignee}'`);
  }
  if (due !== undefined && !DATE_RE.test(due)) {
    throw new Error(`add: --due must be YYYY-MM-DD, got '${due}'`);
  }
  const classList = (options.classes ?? '').split(',').map((c) => c.trim()).filter((c) => c !== '');
  for (const cls of classList) {
    if (!HANDLE_RE.test(cls)) throw new Error(`add: --class entries must be slugs, got '${cls}'`);
  }
  const needsList = (options.needs ?? '').split(',').map((n) => n.trim()).filter((n) => n !== '');

  const target = fs.realpathSync(file);
  return await withFileLock(target, (ownsLock) => {
    const src = fs.readFileSync(target, 'utf8');
    const doc = parseDocument(src); // not-MDC / unsupported version throws → exit 1
    /** @type {Set<string>} */
    const existing = new Set();
    for (const { item } of flattenItems(doc)) {
      if (item.id !== null) existing.add(item.id);
    }
    let id = wantId;
    if (id !== undefined) {
      if (existing.has(id)) throw new PreconditionError(`cannot add: id '#${id}' already exists`);
    } else {
      const base = slugify(trimmed) || 'item';
      id = base;
      for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;
    }
    /** @type {Record<string, string | string[]>} */
    const attrs = {};
    if (needsList.length > 0) attrs.needs = needsList;
    if (due !== undefined) attrs.due = due;
    const item = { id, text: trimmed, state: 'open', assignee: assignee ?? null, classes: classList, attrs };
    const lineText = serializeItemLine(/** @type {import('./parse.js').MdcItem} */ (item), 0);

    // Append on its own line, preserving the document's line ending. A file that
    // already ends in a newline needs no separator; one that does not gets one.
    const nl = src.includes('\r\n') ? '\r\n' : '\n';
    let out = src;
    if (out !== '' && !out.endsWith('\n')) out += nl;
    out += lineText + nl;

    if (!ownsLock()) {
      throw new Error('add: lock ownership lost before write; aborted to avoid clobbering a concurrent edit');
    }
    atomicReplace(target, out);
    return id;
  });
}

/**
 * Today in the local timezone — a `done=` stamp records the operator's
 * calendar day, not UTC's.
 *
 * @returns {string} `YYYY-MM-DD`.
 */
function localToday() {
  const now = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
