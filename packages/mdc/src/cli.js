#!/usr/bin/env node
/**
 * Verb dispatch, flags, exit codes.
 *
 * Exit-code law: 0 success · 1 usage / IO / parse / not-MDC errors ·
 * 2 domain refusal (lint errors, `fmt --check` drift, mutation precondition
 * failed). Errors go to stderr; machine output to stdout only.
 */
import fs from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parseDocument } from './parse.js';
import { readFrontmatter, assertMdcDocument } from './frontmatter.js';
import { lintDocument } from './lint.js';
import { statusReport, nextItems, reportData } from './model.js';
import { formatDocument } from './fmt.js';
import { check, uncheck, cancel, claim, addItem, start, unstart, unclaim, note, withFileLock, atomicReplace } from './mutate.js';
import { cutRun } from './cut.js';
import path from 'node:path';

const USAGE = `Usage: mdc <verb> <file> [flags]

Read verbs ("-" reads stdin):
  parse <file> --json                      L1 document model to stdout
  lint <file> [--json] [--strict]          findings; exit 2 on errors
  status <file> [--json]                   totals, progress, blocked/actionable
  next <file> [--json] [--as <handle>]     ordered actionable items (--as: for one agent)
  report <file> [--json]                   standup: done/in-progress/ready/blocked, per-assignee
  fmt <file> [--check] [--assign-ids]      canonical form in place; --check never writes

Mutations (real path required; refusals exit 2):
  add <file> "<text>" [--id <slug>] [--needs <a,b>] [--as <handle>] [--due <date>] [--class <c,d>]
      [--after <id> | --section <heading>] new open item (end, or after an item / in a section); echoes its line
  check <file> <id> [--date YYYY-MM-DD]    open -> done, stamps done=
  uncheck <file> <id>                      done -> open, removes done=
  cancel <file> <id> --reason "..."        -> cancelled, wraps ~~, writes reason=
  claim <file> <id> --as <handle>          sets @handle iff no assignee set
  note <file> <id> "<text>" [--as <handle>]  attach a dated note (nested prose bullet)
  unclaim <file> <id> [--from <handle>]    clears the assignee (--from guards the owner)
  start <file> <id>                        marks in-progress (adds .doing)
  unstart <file> <id>                      clears .doing

Instantiate:
  cut <template> [--out <file>] [--title <t>] [--as-version <v>] [--date YYYY-MM-DD]
                                           cut a run from a template; --out or stdout

Exit codes: 0 success · 1 usage/IO/parse/not-MDC · 2 domain refusal
`;

/**
 * @typedef {Object} VerbContext
 * @property {string} file Target path, or "-" for stdin on read verbs.
 * @property {string | undefined} id Target item id (mutation verbs only).
 * @property {string | undefined} text Free-text positional (`add` only).
 * @property {Record<string, string | boolean | undefined>} flags
 */

/**
 * Read a document from a path, or from stdin when the path is "-".
 *
 * @param {string} file
 * @returns {Promise<string>}
 */
async function readInput(file) {
  if (file !== '-') return fs.readFileSync(file, 'utf8');
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/**
 * Enforce the in-band MDC signature without a full parse — used where the
 * verb's own pipeline (fmt) is deliberately total over non-MDC input.
 *
 * @param {string} text
 * @throws {Error} not-MDC / unsupported version — exit 1.
 */
function assertMdc(text) {
  assertMdcDocument(readFrontmatter(text)?.data ?? null);
}

/** @param {unknown} value */
function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** @param {import('./parse.js').MdcItem} item @returns {string} */
function itemLabel(item) {
  return item.id !== null ? `#${item.id}` : `<line ${item.line}>`;
}

/**
 * `parse --json`: L1 model to stdout. Exit 0; 1 on error/not-MDC.
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runParse(ctx) {
  emitJson(parseDocument(await readInput(ctx.file)));
  return 0;
}

/**
 * `lint [--json] [--strict]`: findings report. Exit 0 clean (warnings allowed
 * unless --strict); 2 when findings include severity error; 1 on error.
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runLint(ctx) {
  const text = await readInput(ctx.file);
  const findings = lintDocument(parseDocument(text), text);
  if (ctx.flags.json === true) {
    emitJson(findings);
  } else {
    for (const f of findings) {
      const anchor = f.id !== null ? ` (#${f.id})` : '';
      process.stdout.write(`${ctx.file}:${f.line} ${f.severity} ${f.rule}${anchor} ${f.message}\n`);
    }
  }
  const refused =
    findings.some((f) => f.severity === 'error') || (ctx.flags.strict === true && findings.length > 0);
  return refused ? 2 : 0;
}

/**
 * `status [--json]`: totals, progress (cancelled excluded), blocked /
 * actionable / doing lists, per-section rollup. Exit 0; 1 on error.
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runStatus(ctx) {
  const doc = parseDocument(await readInput(ctx.file));
  const report = statusReport(doc);
  if (ctx.flags.json === true) {
    emitJson(report);
    return 0;
  }
  const list = (/** @type {string[]} */ ids) => (ids.length > 0 ? ids.join(', ') : 'none');
  const lines = [
    `${doc.title ?? ctx.file} (${doc.kind}): ${report.progress.done}/${report.progress.total} done`,
    `totals: ${report.totals.open} open, ${report.totals.done} done, ${report.totals.cancelled} cancelled, ${report.totals.total} total`,
    `actionable (${report.actionable.length}): ${list(report.actionable)}`,
    `blocked (${report.blocked.length}): ${list(report.blocked)}`,
    `doing (${report.doing.length}): ${list(report.doing)}`,
  ];
  if (report.sections.length > 0) {
    lines.push('sections:');
    for (const s of report.sections) {
      lines.push(`  ${s.section ?? '(no section)'}: ${s.done}/${s.total}`);
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

/**
 * `report [--json]`: a standup view — done, in-progress, ready, blocked (with
 * cause), cancelled, and per-assignee load. Pure read. Exit 0; 1 on error.
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runReport(ctx) {
  const doc = parseDocument(await readInput(ctx.file));
  const r = reportData(doc);
  if (ctx.flags.json === true) {
    emitJson(r);
    return 0;
  }
  const who = (/** @type {string | null} */ a) => (a !== null ? ` @${a}` : '');
  const lines = [`Report: ${r.title ?? ctx.file} — ${r.progress.done}/${r.progress.total} done`];
  /** @param {string} label @param {import('./model.js').ReportEntry[]} entries @param {(e: import('./model.js').ReportEntry) => string} fmt */
  const section = (label, entries, fmt) => {
    if (entries.length === 0) return;
    lines.push(`${label} (${entries.length}):`);
    for (const e of entries) lines.push(`  #${e.id}${who(e.assignee)} — ${e.text}${fmt(e)}`);
  };
  section('In progress', r.inProgress, () => '');
  section('Ready', r.ready, () => '');
  section('Blocked', r.blocked, (e) => {
    const cause = e.blockedBy?.length
      ? ` [needs: ${e.blockedBy.join(', ')}]`
      : e.gatedBy?.length
        ? ` [gated by: ${e.gatedBy.join(', ')}]`
        : ' [children pending]';
    return cause;
  });
  section('Done', r.done, (e) => (e.done ? ` (${e.done})` : ''));
  section('Cancelled', r.cancelled, (e) => (e.reason ? ` (${e.reason})` : ''));
  if (r.byAssignee.length > 0) {
    lines.push('By assignee:');
    for (const a of r.byAssignee) lines.push(`  @${a.assignee}: ${a.done} done, ${a.doing} doing, ${a.open} open`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

/**
 * `next [--json]`: ordered actionable items — full array as JSON, first item
 * with the rest summarized in human form. Exit 0 even if empty; 1 on error.
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runNext(ctx) {
  const doc = parseDocument(await readInput(ctx.file));
  let items = nextItems(doc);
  const as = /** @type {string | undefined} */ (ctx.flags.as);
  if (as !== undefined) {
    // "what can <as> do next": their own claimed actionable items plus the
    // unclaimed ones they could pick up. Items owned by someone else are theirs.
    items = items.filter((item) => item.assignee === as || item.assignee === null);
  }
  if (ctx.flags.json === true) {
    emitJson(items);
    return 0;
  }
  if (items.length === 0) {
    process.stdout.write('nothing actionable\n');
    return 0;
  }
  const [first, ...rest] = items;
  process.stdout.write(`${itemLabel(first)} ${first.text}\n`);
  if (rest.length > 0) {
    process.stdout.write(`(+${rest.length} more actionable: ${rest.map(itemLabel).join(', ')})\n`);
  }
  return 0;
}

/**
 * `fmt [--check] [--assign-ids]`: canonical form in place (takes the lock like
 * every mutation); --check exits without writing. Exit 0 unchanged/success;
 * 2 when --check found drift; 1 on error.
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runFmt(ctx) {
  const options = { assignIds: ctx.flags['assign-ids'] === true };
  if (ctx.flags.check === true) {
    const text = await readInput(ctx.file);
    assertMdc(text);
    if (formatDocument(text, options).changed) {
      process.stderr.write(`mdc: ${ctx.file} is not in canonical form\n`);
      return 2;
    }
    return 0;
  }
  const target = fs.realpathSync(ctx.file);
  return await withFileLock(target, (ownsLock) => {
    const text = fs.readFileSync(target, 'utf8');
    assertMdc(text);
    const { text: formatted, changed } = formatDocument(text, options);
    if (changed) {
      if (!ownsLock()) throw new Error('fmt: lock ownership lost before write');
      atomicReplace(target, formatted);
    }
    return 0;
  });
}

/**
 * `add <file> "<text>" [flags]`: create a new open item and echo its resulting
 * canonical line to stdout — uniform with every other mutation. The new id is
 * the `#…` token in that line (immediately usable to claim/check/reference).
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runAdd(ctx) {
  const { line } = await addItem(ctx.file, /** @type {string} */ (ctx.text), {
    id: /** @type {string | undefined} */ (ctx.flags.id),
    needs: /** @type {string | undefined} */ (ctx.flags.needs),
    as: /** @type {string | undefined} */ (ctx.flags.as),
    due: /** @type {string | undefined} */ (ctx.flags.due),
    classes: /** @type {string | undefined} */ (ctx.flags.class),
    after: /** @type {string | undefined} */ (ctx.flags.after),
    section: /** @type {string | undefined} */ (ctx.flags.section),
  });
  emitMutation(line);
  return 0;
}

/**
 * Every line-rewriting/inserting mutation echoes the resulting canonical line to
 * stdout, so an agent sees exactly what changed without a follow-up read (this
 * is the "one-line diff" the agent docs promise).
 * @param {string} line
 */
function emitMutation(line) {
  process.stdout.write(`${line}\n`);
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runCheck(ctx) {
  emitMutation(await check(ctx.file, /** @type {string} */ (ctx.id), { date: /** @type {string | undefined} */ (ctx.flags.date) }));
  return 0;
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runUncheck(ctx) {
  emitMutation(await uncheck(ctx.file, /** @type {string} */ (ctx.id)));
  return 0;
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runCancel(ctx) {
  emitMutation(await cancel(ctx.file, /** @type {string} */ (ctx.id), { reason: /** @type {string} */ (ctx.flags.reason) }));
  return 0;
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runClaim(ctx) {
  emitMutation(await claim(ctx.file, /** @type {string} */ (ctx.id), { as: /** @type {string} */ (ctx.flags.as) }));
  return 0;
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runNote(ctx) {
  emitMutation(await note(ctx.file, /** @type {string} */ (ctx.id), /** @type {string} */ (ctx.text), {
    as: /** @type {string | undefined} */ (ctx.flags.as),
    date: /** @type {string | undefined} */ (ctx.flags.date),
  }));
  return 0;
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runStart(ctx) {
  emitMutation(await start(ctx.file, /** @type {string} */ (ctx.id)));
  return 0;
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runUnstart(ctx) {
  emitMutation(await unstart(ctx.file, /** @type {string} */ (ctx.id)));
  return 0;
}

/** @param {VerbContext} ctx @returns {Promise<number>} */
async function runUnclaim(ctx) {
  emitMutation(await unclaim(ctx.file, /** @type {string} */ (ctx.id), { from: /** @type {string | undefined} */ (ctx.flags.from) }));
  return 0;
}

/**
 * Local calendar day, `YYYY-MM-DD` — a run's `started` records the operator's
 * day, not UTC's.
 * @returns {string}
 */
function today() {
  const now = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * `cut <template> [--out <file>] [--title …] [--as-version …] [--date …]`:
 * instantiate a run from a template, to `--out` or stdout. The `template:`
 * reference is the source path (relative to `--out`'s directory when given),
 * with `@<version>` appended when `--as-version` is passed — a git commit-ish
 * (tag, branch, or SHA) by convention, opaque to the tool (see spec TPL-2).
 * A run cut without `--as-version` is unpinned and draws a `lint` warning.
 * Refuses to overwrite an existing `--out` (exit 2).
 * @param {VerbContext} ctx
 * @returns {Promise<number>}
 */
async function runCut(ctx) {
  const src = fs.readFileSync(ctx.file, 'utf8');
  const out = /** @type {string | undefined} */ (ctx.flags.out);
  const version = /** @type {string | undefined} */ (ctx.flags['as-version']);
  const refPath = out ? path.relative(path.dirname(out), ctx.file) || path.basename(ctx.file) : ctx.file;
  const templateRef = version ? `${refPath}@${version}` : refPath;
  const started = /** @type {string | undefined} */ (ctx.flags.date) ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(started)) throw usageError(`cut: --date must be YYYY-MM-DD, got '${started}'`);

  const runText = cutRun(src, { templateRef, title: /** @type {string | undefined} */ (ctx.flags.title), started });

  if (out === undefined) {
    process.stdout.write(runText);
    return 0;
  }
  try {
    fs.writeFileSync(out, runText, { flag: 'wx' });
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EEXIST') {
      throw usageErrorWithCode(`cut: ${out} already exists (refusing to overwrite)`, 2);
    }
    throw err;
  }
  process.stderr.write(`mdc: wrote ${out}\n`);
  return 0;
}

/**
 * @type {Record<string, {
 *   flags: Record<string, { type: 'boolean' | 'string' }>,
 *   stdin: 'always' | 'check-flag' | 'never',
 *   takesId?: boolean,
 *   takesText?: boolean,
 *   required?: string[],
 *   run: (ctx: VerbContext) => Promise<number>,
 * }>}
 */
const VERBS = {
  parse: { flags: { json: { type: 'boolean' } }, stdin: 'always', run: runParse },
  lint: { flags: { json: { type: 'boolean' }, strict: { type: 'boolean' } }, stdin: 'always', run: runLint },
  status: { flags: { json: { type: 'boolean' } }, stdin: 'always', run: runStatus },
  next: { flags: { json: { type: 'boolean' }, as: { type: 'string' } }, stdin: 'always', run: runNext },
  report: { flags: { json: { type: 'boolean' } }, stdin: 'always', run: runReport },
  fmt: { flags: { check: { type: 'boolean' }, 'assign-ids': { type: 'boolean' } }, stdin: 'check-flag', run: runFmt },
  add: {
    flags: {
      id: { type: 'string' },
      needs: { type: 'string' },
      as: { type: 'string' },
      due: { type: 'string' },
      class: { type: 'string' },
      after: { type: 'string' },
      section: { type: 'string' },
    },
    stdin: 'never',
    takesText: true,
    run: runAdd,
  },
  check: { flags: { date: { type: 'string' } }, stdin: 'never', takesId: true, run: runCheck },
  uncheck: { flags: {}, stdin: 'never', takesId: true, run: runUncheck },
  cancel: { flags: { reason: { type: 'string' } }, stdin: 'never', takesId: true, required: ['reason'], run: runCancel },
  claim: { flags: { as: { type: 'string' } }, stdin: 'never', takesId: true, required: ['as'], run: runClaim },
  note: { flags: { as: { type: 'string' }, date: { type: 'string' } }, stdin: 'never', takesId: true, takesText: true, run: runNote },
  start: { flags: {}, stdin: 'never', takesId: true, run: runStart },
  unstart: { flags: {}, stdin: 'never', takesId: true, run: runUnstart },
  unclaim: { flags: { from: { type: 'string' } }, stdin: 'never', takesId: true, run: runUnclaim },
  cut: {
    flags: { out: { type: 'string' }, title: { type: 'string' }, 'as-version': { type: 'string' }, date: { type: 'string' } },
    stdin: 'never',
    run: runCut,
  },
};

/**
 * @param {string} message
 * @returns {Error & { exitCode: number }}
 */
function usageError(message) {
  return usageErrorWithCode(message, 1);
}

/**
 * @param {string} message
 * @param {number} code Exit code to carry (1 usage/IO, 2 domain refusal).
 * @returns {Error & { exitCode: number }}
 */
function usageErrorWithCode(message, code) {
  const err = /** @type {Error & { exitCode: number }} */ (new Error(message));
  err.exitCode = code;
  return err;
}

/**
 * @param {string[]} argv Arguments after the program name (no node, no script path).
 * @returns {Promise<number>} Exit code per the law above.
 */
async function dispatch(argv) {
  if (argv.length === 0) {
    process.stderr.write(USAGE);
    return 1;
  }
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }
  const verb = argv[0];
  const spec = VERBS[verb];
  if (!spec) throw usageError(`unknown verb '${verb}'`);

  // `<verb> --help` is the first thing an agent tries; answer it before
  // parseArgs, which would otherwise reject --help as an unknown option.
  if (argv.slice(1).some((a) => a === '--help' || a === '-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  let parsed;
  try {
    parsed = parseArgs({ args: argv.slice(1), options: spec.flags, allowPositionals: true });
  } catch (err) {
    throw usageError(`${verb}: ${/** @type {Error} */ (err).message}`);
  }

  const positionals = [...parsed.positionals];
  const file = positionals.shift();
  if (!file) throw usageError(`${verb}: missing <file>`);
  const id = spec.takesId ? positionals.shift() : undefined;
  if (spec.takesId && !id) throw usageError(`${verb}: missing <id>`);
  const text = spec.takesText ? positionals.shift() : undefined;
  if (spec.takesText && text === undefined) throw usageError(`${verb}: missing "<text>"`);
  if (positionals.length > 0) throw usageError(`${verb}: unexpected argument '${positionals[0]}'`);

  if (file === '-') {
    const stdinOk = spec.stdin === 'always' || (spec.stdin === 'check-flag' && parsed.values.check === true);
    if (!stdinOk) throw usageError(`${verb}: requires a real file path, not stdin`);
  }
  for (const flag of spec.required ?? []) {
    if (parsed.values[flag] === undefined) throw usageError(`${verb}: --${flag} is required`);
  }

  return await spec.run({ file, id, text, flags: parsed.values });
}

/**
 * @param {string[]} argv Arguments after the program name.
 * @returns {Promise<number>}
 */
export async function main(argv) {
  try {
    return await dispatch(argv);
  } catch (err) {
    const e = /** @type {(Error & { exitCode?: number }) | null} */ (err);
    process.stderr.write(`mdc: ${e?.message ?? String(err)}\n`);
    return Number.isInteger(e?.exitCode) ? /** @type {number} */ (e.exitCode) : 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
