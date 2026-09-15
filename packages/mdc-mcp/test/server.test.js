/**
 * Black-box test of the MDC MCP server over its real stdio JSON-RPC transport:
 * the initialize handshake, tools/list, and tools/call for a read, a mutation,
 * and a refusal (which must come back as an isError result, not a crash).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.js');

/** A minimal MCP-over-stdio client: send a request, resolve the matching reply. */
function startServer() {
  const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdout.setEncoding('utf8');
  let buf = '';
  const waiters = new Map();
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && waiters.has(msg.id)) {
        waiters.get(msg.id)(msg);
        waiters.delete(msg.id);
      }
    }
  });
  let nextId = 1;
  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve) => {
        waiters.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    stop() {
      child.stdin.end();
    },
  };
}

function tmpDoc(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mcp-'));
  const file = path.join(dir, 'board.mdc.md');
  fs.writeFileSync(file, text);
  return file;
}

test('MCP handshake, tools/list, and tools/call (read, mutation, refusal)', async () => {
  const s = startServer();
  try {
    const init = await s.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    assert.equal(init.result.serverInfo.name, 'mdc-mcp');
    assert.ok(init.result.capabilities.tools, 'advertises tools capability');
    s.notify('notifications/initialized', {});

    const list = await s.request('tools/list', {});
    const names = list.result.tools.map((t) => t.name);
    for (const n of ['mdc_next', 'mdc_claim', 'mdc_check', 'mdc_add', 'mdc_status']) {
      assert.ok(names.includes(n), `tools/list includes ${n}`);
    }

    const file = tmpDoc('---\nmdc: "0.1"\n---\n\n- [ ] Ship it {#ship}\n- [ ] Later {#later needs=ship}\n');

    // read: next → only #ship is actionable
    const next = await s.request('tools/call', { name: 'mdc_next', arguments: { file } });
    assert.equal(next.result.isError, false);
    const nextItems = JSON.parse(next.result.content[0].text);
    assert.deepEqual(nextItems.map((i) => i.id), ['ship']);

    // mutation: claim #ship succeeds and echoes the new line
    const claim = await s.request('tools/call', { name: 'mdc_claim', arguments: { file, id: 'ship', as: 'agent-a' } });
    assert.equal(claim.result.isError, false);
    assert.match(claim.result.content[0].text, /\{#ship @agent-a\}/);

    // refusal: a second claim comes back as isError with the reason (not a crash)
    const conflict = await s.request('tools/call', { name: 'mdc_claim', arguments: { file, id: 'ship', as: 'agent-b' } });
    assert.equal(conflict.result.isError, true);
    assert.match(conflict.result.content[0].text, /already claimed by @agent-a/);

    // unknown tool → JSON-RPC-level error result
    const bad = await s.request('tools/call', { name: 'mdc_nope', arguments: {} });
    assert.ok(bad.error, 'unknown tool is a transport error');
  } finally {
    s.stop();
  }
});
