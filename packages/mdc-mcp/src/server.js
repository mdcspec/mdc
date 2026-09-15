#!/usr/bin/env node
/**
 * MDC MCP server — exposes the MDC (Markdown Checklists) verbs as Model Context
 * Protocol tools, so any MCP host (Claude Desktop/Code, Cursor, …) can drive
 * shared checklist state natively: query the dependency graph (`next`,
 * `status`, `report`), atomically `claim` work, `check` it off, `add`/`edit`
 * discovered tasks, and leave `note`s — the coordination loop, without shelling
 * out.
 *
 * A dependency-free stdio JSON-RPC 2.0 server (newline-delimited messages, the
 * MCP stdio transport). It imports the reference implementation directly, so it
 * shares one parser, one canonical serializer, and the exit-code-as-API
 * semantics: a domain refusal (unknown id, already-claimed, precondition
 * failed) comes back as a tool result with `isError: true` and the reason, so
 * an agent branches on it exactly as it branches on the CLI's exit code 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

import { parseDocument } from '../../mdc/src/parse.js';
import { statusReport, nextItems, reportData } from '../../mdc/src/model.js';
import { lintDocument } from '../../mdc/src/lint.js';
import { check, uncheck, cancel, claim, unclaim, start, unstart, note, edit, addItem } from '../../mdc/src/mutate.js';
import { cutRun } from '../../mdc/src/cut.js';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;
const DEFAULT_PROTOCOL = '2025-06-18';

/** Read + parse a document from a path (fully computed). Throws on not-MDC. */
function readDoc(file) {
  return parseDocument(fs.readFileSync(path.resolve(file), 'utf8'));
}

/** JSON tool result. */
function json(value) {
  return `${JSON.stringify(value, null, 2)}`;
}

const SLUG = { type: 'string' };
const FILE = { type: 'string', description: 'Path to the MDC document.' };

/**
 * The tool table. Each `run` returns the text payload of a successful call, or
 * throws — a thrown error becomes an `isError` result carrying its message.
 * @type {Record<string, { description: string, inputSchema: object, run: (a: any) => Promise<string> | string }>}
 */
const TOOLS = {
  // ---- reads ----
  mdc_parse: {
    description: 'Parse an MDC document to its L1 JSON model (items, states, attributes, and computed blocked/actionable/progress).',
    inputSchema: { type: 'object', properties: { file: FILE }, required: ['file'] },
    run: ({ file }) => json(readDoc(file)),
  },
  mdc_status: {
    description: 'Totals, progress, and the blocked / actionable / doing lists for an MDC document.',
    inputSchema: { type: 'object', properties: { file: FILE }, required: ['file'] },
    run: ({ file }) => json(statusReport(readDoc(file))),
  },
  mdc_next: {
    description: 'The actionable items in document order — what can be worked right now given all dependencies and gates. Pass `as` to filter to one agent\'s own + unclaimed items.',
    inputSchema: { type: 'object', properties: { file: FILE, as: { type: 'string', description: 'Filter to this handle\'s own + unclaimed items.' } }, required: ['file'] },
    run: ({ file, as }) => {
      let items = nextItems(readDoc(file));
      if (as !== undefined) items = items.filter((i) => i.assignee === as || i.assignee === null);
      return json(items);
    },
  },
  mdc_report: {
    description: 'A standup view: done / in-progress / ready / blocked-with-cause / cancelled buckets, plus per-assignee load.',
    inputSchema: { type: 'object', properties: { file: FILE }, required: ['file'] },
    run: ({ file }) => json(reportData(readDoc(file))),
  },
  mdc_lint: {
    description: 'Structural findings (duplicate/dangling ids, cycles, invalid dates, unpinned template, …) for an MDC document.',
    inputSchema: { type: 'object', properties: { file: FILE }, required: ['file'] },
    run: ({ file }) => json(lintDocument(readDoc(file), fs.readFileSync(path.resolve(file), 'utf8'))),
  },

  // ---- mutations (return the rewritten canonical line) ----
  mdc_check: {
    description: 'Mark an item done (open → done), stamping done=. Clears .doing. Refuses if the item is already terminal.',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG, date: { type: 'string', description: 'YYYY-MM-DD; defaults to today.' } }, required: ['file', 'id'] },
    run: ({ file, id, date }) => check(path.resolve(file), id, { date }),
  },
  mdc_uncheck: {
    description: 'Reopen a done item (done → open), removing done=.',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG }, required: ['file', 'id'] },
    run: ({ file, id }) => uncheck(path.resolve(file), id),
  },
  mdc_cancel: {
    description: 'Cancel an item with a machine-readable reason (not deletion — the reason is the audit record).',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG, reason: { type: 'string' } }, required: ['file', 'id', 'reason'] },
    run: ({ file, id, reason }) => cancel(path.resolve(file), id, { reason }),
  },
  mdc_claim: {
    description: 'Atomically claim an item (set @assignee iff none set). Refuses (isError) if already claimed — the multi-agent concurrency primitive.',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG, as: { type: 'string', description: 'Your handle.' } }, required: ['file', 'id', 'as'] },
    run: ({ file, id, as }) => claim(path.resolve(file), id, { as }),
  },
  mdc_unclaim: {
    description: 'Release an item\'s assignee. Pass `from` to guard against releasing another agent\'s claim.',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG, from: { type: 'string' } }, required: ['file', 'id'] },
    run: ({ file, id, from }) => unclaim(path.resolve(file), id, { from }),
  },
  mdc_start: {
    description: 'Mark an item in progress (adds .doing). Signals active work, distinct from merely claimed.',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG }, required: ['file', 'id'] },
    run: ({ file, id }) => start(path.resolve(file), id),
  },
  mdc_unstart: {
    description: 'Clear the .doing marker from an item.',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG }, required: ['file', 'id'] },
    run: ({ file, id }) => unstart(path.resolve(file), id),
  },
  mdc_note: {
    description: 'Attach a durable, dated note to an item (a nested prose bullet) — the communication seam for coordinating with other agents.',
    inputSchema: { type: 'object', properties: { file: FILE, id: SLUG, text: { type: 'string' }, as: { type: 'string' }, date: { type: 'string' } }, required: ['file', 'id', 'text'] },
    run: ({ file, id, text, as, date }) => note(path.resolve(file), id, text, { as, date }),
  },
  mdc_edit: {
    description: 'Amend an existing item: text, dependencies (needs/add-needs/rm-needs), classes (add-class/rm-class), or due. Keeps next/report honest when work turns out to depend on something.',
    inputSchema: {
      type: 'object',
      properties: {
        file: FILE, id: SLUG,
        text: { type: 'string' }, needs: { type: 'string' }, addNeeds: { type: 'string' }, rmNeeds: { type: 'string' },
        addClass: { type: 'string' }, rmClass: { type: 'string' }, due: { type: 'string' },
      },
      required: ['file', 'id'],
    },
    run: ({ file, id, text, needs, addNeeds, rmNeeds, addClass, rmClass, due }) =>
      edit(path.resolve(file), id, { text, needs, addNeeds, rmNeeds, addClass, rmClass, due }),
  },
  mdc_add: {
    description: 'Add a newly-discovered item (open). Returns its canonical line (id in the {#…} block). Place with `after` (an item id) or `section` (a heading) so it is not trapped behind a later gate.',
    inputSchema: {
      type: 'object',
      properties: {
        file: FILE, text: { type: 'string' },
        id: { type: 'string' }, needs: { type: 'string' }, as: { type: 'string' }, due: { type: 'string' },
        class: { type: 'string' }, after: { type: 'string' }, section: { type: 'string' },
      },
      required: ['file', 'text'],
    },
    run: async ({ file, text, id, needs, as, due, class: cls, after, section }) =>
      (await addItem(path.resolve(file), text, { id, needs, as, due, classes: cls, after, section })).line,
  },
  mdc_cut: {
    description: 'Instantiate a run document from a template (kind: template → kind: run), resetting every item to a pristine open state. Refuses to overwrite an existing output.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Path to the kind: template document.' },
        out: { type: 'string', description: 'Path to write the new run document (refuses to overwrite).' },
        templateRef: { type: 'string', description: 'Pin the run\'s template: value exactly.' },
        asVersion: { type: 'string' }, title: { type: 'string' }, date: { type: 'string', description: 'started date, YYYY-MM-DD.' },
      },
      required: ['template', 'out'],
    },
    run: ({ template, out, templateRef, asVersion, title, date }) => {
      const src = fs.readFileSync(path.resolve(template), 'utf8');
      const refPath = path.relative(path.dirname(path.resolve(out)), path.resolve(template)) || path.basename(template);
      const ref = templateRef ?? (asVersion ? `${refPath}@${asVersion}` : refPath);
      const started = date ?? new Date().toISOString().slice(0, 10);
      const runText = cutRun(src, { templateRef: ref, title, started });
      try {
        fs.writeFileSync(path.resolve(out), runText, { flag: 'wx' });
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EEXIST') {
          const e = new Error(`cut: ${out} already exists (refusing to overwrite)`);
          throw e;
        }
        throw err;
      }
      return `wrote ${out}`;
    },
  },
};

// ---- JSON-RPC over stdio (newline-delimited) ----

/** Write a JSON-RPC message as one line to stdout. */
function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

/** @param {any} id @param {number} code @param {string} message */
function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'mdc-mcp', version: VERSION },
      },
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return; // no reply
  if (method === 'ping') {
    if (!isNotification) send({ jsonrpc: '2.0', id, result: {} });
    return;
  }
  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })),
      },
    });
    return;
  }
  if (method === 'tools/call') {
    const tool = TOOLS[params?.name];
    if (!tool) return sendError(id, -32602, `unknown tool: ${params?.name}`);
    try {
      const text = await tool.run(params.arguments ?? {});
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: false } });
    } catch (err) {
      // Domain refusals (precondition failed) and everything else come back as a
      // tool-level error the model can read and branch on — never a transport error.
      const message = err instanceof Error ? err.message : String(err);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: message }], isError: true } });
    }
    return;
  }
  if (!isNotification) sendError(id, -32601, `method not found: ${method}`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line === '') continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      sendError(null, -32700, 'parse error');
      continue;
    }
    void handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
