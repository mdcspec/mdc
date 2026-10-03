/**
 * Black-box tests of the MDC MCP server over its real stdio JSON-RPC transport.
 * Covers: the initialize handshake, tools/list (all tools + schema shape), every
 * read tool, every mutation (and that it actually writes the file), the refusal
 * matrix (domain refusals come back as isError results, never a crash), not-MDC
 * handling, and the JSON-RPC protocol edges (ping, notifications, unknown method,
 * parse error, batched messages).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.js');

/** A minimal MCP-over-stdio client; records every message so id-less replies are inspectable. */
function startServer() {
  const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdout.setEncoding('utf8');
  let buf = '';
  const waiters = new Map();
  const messages = [];
  const anyWaiters = [];
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      messages.push(msg);
      if (msg.id !== undefined && msg.id !== null && waiters.has(msg.id)) {
        waiters.get(msg.id)(msg);
        waiters.delete(msg.id);
      } else if (anyWaiters.length) {
        anyWaiters.shift()(msg); // one waiter per message (FIFO), for id-less/raw replies
      }
    }
  });
  let nextId = 1;
  const api = {
    messages,
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve) => {
        waiters.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    call(name, args) {
      return api.request('tools/call', { name, arguments: args });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    raw(str) {
      child.stdin.write(str);
    },
    /** Resolve on the next message received (any id), for id-less error replies. */
    nextMessage() {
      return new Promise((resolve) => anyWaiters.push(resolve));
    },
    stop() {
      child.stdin.end();
    },
  };
  return api;
}

function tmpDoc(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mcp-'));
  const file = path.join(dir, 'board.mdc.md');
  fs.writeFileSync(file, text);
  return file;
}

const BOARD = '---\nmdc: "0.1"\ntitle: Board\n---\n\n- [ ] Ship it {#ship}\n- [ ] Later {#later needs=ship}\n- [x] Done already {#done done=2026-09-01}\n';

const ALL_TOOLS = [
  'mdc_parse', 'mdc_status', 'mdc_next', 'mdc_report', 'mdc_lint',
  'mdc_check', 'mdc_uncheck', 'mdc_cancel', 'mdc_claim', 'mdc_unclaim',
  'mdc_start', 'mdc_unstart', 'mdc_note', 'mdc_edit', 'mdc_add', 'mdc_cut',
];

test('handshake + tools/list advertises every tool with a well-formed schema', async () => {
  const s = startServer();
  try {
    const init = await s.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    assert.equal(init.result.serverInfo.name, 'mdc-mcp');
    assert.equal(init.result.protocolVersion, '2025-06-18', 'echoes the client protocol version');
    assert.ok(init.result.capabilities.tools, 'advertises tools capability');
    s.notify('notifications/initialized', {});

    const list = await s.request('tools/list', {});
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [...ALL_TOOLS].sort(), 'all 16 tools are listed');
    for (const t of list.result.tools) {
      assert.ok(t.description && t.description.length > 10, `${t.name} has a description`);
      assert.equal(t.inputSchema.type, 'object', `${t.name} schema is an object`);
      assert.ok(Array.isArray(t.inputSchema.required), `${t.name} declares required[]`);
    }
  } finally {
    s.stop();
  }
});

test('every read tool returns a valid, non-error result', async () => {
  const s = startServer();
  try {
    const file = tmpDoc(BOARD);
    for (const name of ['mdc_parse', 'mdc_status', 'mdc_next', 'mdc_report', 'mdc_lint']) {
      const r = await s.call(name, { file });
      assert.equal(r.result.isError, false, `${name} is not an error`);
      assert.doesNotThrow(() => JSON.parse(r.result.content[0].text), `${name} returns JSON`);
    }
    // next: only #ship is actionable (#later needs it; #done is terminal)
    const next = await s.call('mdc_next', { file });
    assert.deepEqual(JSON.parse(next.result.content[0].text).map((i) => i.id), ['ship']);
    // next --as filters to a handle's own + unclaimed
    await s.call('mdc_claim', { file, id: 'ship', as: 'agent-a' });
    const mine = await s.call('mdc_next', { file, as: 'agent-b' });
    assert.deepEqual(JSON.parse(mine.result.content[0].text).map((i) => i.id), [], 'agent-b sees nothing (ship is agent-a\'s)');
  } finally {
    s.stop();
  }
});

test('each mutation succeeds and actually writes the file', async () => {
  const s = startServer();
  try {
    const file = tmpDoc(BOARD);
    const read = () => fs.readFileSync(file, 'utf8');

    const cases = [
      ['mdc_claim', { file, id: 'ship', as: 'agent-a' }, /\{#ship @agent-a\}/, (t) => t.includes('@agent-a')],
      ['mdc_start', { file, id: 'ship' }, /\.doing/, (t) => t.includes('.doing')],
      ['mdc_note', { file, id: 'ship', text: 'kickoff', as: 'agent-a', date: '2026-09-15' }, /- note @agent-a 2026-09-15: kickoff/, (t) => t.includes('note @agent-a')],
      ['mdc_check', { file, id: 'ship', date: '2026-09-15' }, /- \[x\] Ship it/, (t) => t.includes('- [x] Ship it')],
      ['mdc_uncheck', { file, id: 'done' }, /- \[ \] Done already/, (t) => t.includes('- [ ] Done already')],
      ['mdc_edit', { file, id: 'later', addNeeds: 'done' }, /needs=ship,done/, (t) => t.includes('needs=ship,done')],
      ['mdc_add', { file, text: 'New task', id: 'newt' }, /- \[ \] New task \{#newt\}/, (t) => t.includes('{#newt}')],
      ['mdc_cancel', { file, id: 'newt', reason: 'scope cut' }, /~~New task~~/, (t) => t.includes('~~New task~~')],
    ];
    for (const [name, args, lineRe, fileCheck] of cases) {
      const r = await s.call(name, args);
      assert.equal(r.result.isError, false, `${name} succeeds — got: ${r.result.content[0].text}`);
      assert.match(r.result.content[0].text, lineRe, `${name} echoes the resulting line`);
      assert.ok(fileCheck(read()), `${name} wrote the change to disk`);
    }
    // the file remains valid MDC after the whole sequence
    const parsed = await s.call('mdc_parse', { file });
    assert.equal(parsed.result.isError, false, 'document still parses after all mutations');
  } finally {
    s.stop();
  }
});

test('mdc_cut writes a run and refuses to overwrite (isError), and mdc_unclaim releases', async () => {
  const s = startServer();
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mcp-cut-'));
    const tpl = path.join(dir, 'release.mdc.md');
    const out = path.join(dir, 'run.mdc.md');
    fs.writeFileSync(tpl, '---\nmdc: "0.1"\nkind: template\ntitle: Release\n---\n\n- [ ] Cut the branch {#branch}\n');
    const cut = await s.call('mdc_cut', { template: tpl, out, templateRef: 'release.mdc.md@1', date: '2026-09-15' });
    assert.equal(cut.result.isError, false, cut.result.content[0].text);
    assert.ok(fs.existsSync(out), 'run written');
    assert.match(fs.readFileSync(out, 'utf8'), /kind: run/);
    const again = await s.call('mdc_cut', { template: tpl, out, templateRef: 'release.mdc.md@1', date: '2026-09-15' });
    assert.equal(again.result.isError, true, 'overwrite refused as isError');
    assert.match(again.result.content[0].text, /already exists/);

    // unclaim releases a claim
    const file = tmpDoc(BOARD);
    await s.call('mdc_claim', { file, id: 'ship', as: 'agent-a' });
    const rel = await s.call('mdc_unclaim', { file, id: 'ship' });
    assert.equal(rel.result.isError, false);
    assert.ok(!fs.readFileSync(file, 'utf8').includes('@agent-a'), 'assignee cleared on disk');
  } finally {
    s.stop();
  }
});

test('domain refusals all come back as isError results with a readable reason', async () => {
  const s = startServer();
  try {
    const file = tmpDoc(BOARD);
    await s.call('mdc_claim', { file, id: 'ship', as: 'agent-a' });
    const refusals = [
      ['mdc_claim', { file, id: 'ship', as: 'agent-b' }, /already claimed by @agent-a/],
      ['mdc_check', { file, id: 'done' }, /already (done|terminal)/i],
      ['mdc_check', { file, id: 'nope' }, /unknown id/],
      ['mdc_unclaim', { file, id: 'ship', from: 'agent-z' }, /claimed by @agent-a/],
      ['mdc_edit', { file, id: 'ship', addClass: 'doing' }, /start\/unstart/],
      ['mdc_add', { file, text: 'dup', id: 'ship' }, /already exists/],
      ['mdc_start', { file, id: 'done' }, /not open|is done/i],
    ];
    const before = fs.readFileSync(file, 'utf8');
    for (const [name, args, re] of refusals) {
      const r = await s.call(name, args);
      assert.equal(r.result.isError, true, `${name} must be isError`);
      assert.match(r.result.content[0].text, re, `${name} gives a readable reason`);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'no refused mutation touched the file');
  } finally {
    s.stop();
  }
});

test('a not-MDC document comes back as isError, not a transport crash', async () => {
  const s = startServer();
  try {
    const file = tmpDoc('# just markdown\n\n- [ ] no frontmatter here\n');
    const r = await s.call('mdc_parse', { file });
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /not an MDC document|mdc/i);
  } finally {
    s.stop();
  }
});

test('JSON-RPC protocol edges: ping, unknown method, unknown tool, parse error, batched input', async () => {
  const s = startServer();
  try {
    const ping = await s.request('ping', {});
    assert.deepEqual(ping.result, {}, 'ping replies with an empty result');

    const unknownMethod = await s.request('frobnicate', {});
    assert.ok(unknownMethod.error && unknownMethod.error.code === -32601, 'unknown method → -32601');

    const unknownTool = await s.call('mdc_nope', {});
    assert.ok(unknownTool.error && unknownTool.error.code === -32602, 'unknown tool → -32602');

    // a malformed line → id-less parse error; then a valid ping still works (stream not wedged)
    const pe = s.nextMessage();
    s.raw('{ this is not json }\n');
    const err = await pe;
    assert.ok(err.error && err.error.code === -32700, 'malformed line → -32700');
    const after = await s.request('ping', {});
    assert.deepEqual(after.result, {}, 'server keeps working after a parse error');

    // two complete messages in a single write are both handled
    const twoReplies = [s.nextMessage(), s.nextMessage()];
    s.raw(`${JSON.stringify({ jsonrpc: '2.0', id: 901, method: 'ping' })}\n${JSON.stringify({ jsonrpc: '2.0', id: 902, method: 'ping' })}\n`);
    const [a, b] = await Promise.all(twoReplies);
    assert.deepEqual([a.id, b.id].sort(), [901, 902], 'both batched messages answered');
  } finally {
    s.stop();
  }
});
