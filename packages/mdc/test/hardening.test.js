/**
 * Regression tests for the hardening findings: cross-platform encodings (CRLF,
 * BOM), agent-facing error messages, symlink safety, no leaked lock/tmp files,
 * and stale-lock reaping. These exercise inputs that must not live as on-disk
 * corpus fixtures (git would normalize CRLF/BOM), so they are constructed in
 * memory and driven through the real CLI or the parser directly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from './corpus.js';
import { parseDocument } from '../src/parse.js';
import { formatDocument } from '../src/fmt.js';

/** @param {string} prefix @returns {string} A fresh temp directory. */
function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const LF_DOC = ['---', 'mdc: "0.1"', '---', '', '# Title', '', '- [X] Cut branch {#branch}', '- [ ] Verify CI {#ci needs=branch}', ''].join('\n');

test('CRLF: parser sees task items and frontmatter, no \\r leaks into values', () => {
  const crlf = LF_DOC.replace(/\n/g, '\r\n');
  const doc = parseDocument(crlf);
  assert.strictEqual(doc.mdc, '0.1');
  assert.strictEqual(doc.items.length, 2, 'both task items are visible under CRLF');
  assert.strictEqual(doc.items[0].id, 'branch');
  assert.strictEqual(doc.items[0].text, 'Cut branch', 'no trailing \\r in item text');
});

test('CRLF: fmt normalizes the item line but keeps CRLF and leaves prose bytes intact', () => {
  const crlf = LF_DOC.replace(/\n/g, '\r\n');
  const { text: out, changed } = formatDocument(crlf);
  assert.ok(changed, '[X] should normalize to [x]');
  assert.ok(out.includes('- [x] Cut branch {#branch}\r\n'), 'rewritten line stays CRLF and is canonical');
  assert.ok(out.includes('# Title\r\n'), 'prose keeps its CRLF');
  assert.strictEqual(formatDocument(out).changed, false, 'fmt is idempotent under CRLF');
});

test('CRLF: check via the CLI preserves other lines byte-for-byte', async () => {
  const dir = tmpDir('mdc-crlf-');
  const file = path.join(dir, 'todo.mdc.md');
  const crlf = ['---', 'mdc: "0.1"', '---', '', '- [ ] first {#a}', '- [ ] second {#b}', ''].join('\r\n');
  fs.writeFileSync(file, crlf);
  const r = await runCli(['check', file, 'a', '--date', '2026-07-26']);
  assert.strictEqual(r.code, 0, r.stderr);
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('- [x] first {#a done=2026-07-26}\r\n'), 'checked line stays CRLF');
  assert.ok(after.includes('- [ ] second {#b}\r\n'), 'untouched item keeps CRLF');
});

test('BOM: a UTF-8 BOM-prefixed document is still MDC', async () => {
  const r = await runCli(['parse', '-', '--json'], { input: '﻿' + LF_DOC });
  assert.strictEqual(r.code, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).items.length, 2);
});

test('unquoted mdc value: distinct message that names the value, exit 1', async () => {
  const r = await runCli(['parse', '-'], { input: '---\nmdc: 0.1\n---\n\n- [ ] x {#x}\n' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /must be a quoted string/);
  assert.match(r.stderr, /0\.1/);
});

test('unsupported version: message names the found and supported versions, exit 1', async () => {
  const r = await runCli(['parse', '-'], { input: '---\nmdc: "0.2"\n---\n\n- [ ] x {#x}\n' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /0\.2/);
  assert.match(r.stderr, /0\.1/);
});

test('<verb> --help prints usage to stdout and exits 0', async () => {
  for (const verb of ['check', 'claim', 'fmt', 'parse']) {
    const r = await runCli([verb, '--help']);
    assert.strictEqual(r.code, 0, `${verb} --help exit`);
    assert.match(r.stdout, /Usage: mdc/, `${verb} --help shows usage`);
  }
});

test('nesting: a task under a prose bullet is not dedented by fmt', () => {
  const doc = ['---', 'mdc: "0.1"', '---', '', '- Groceries', '  - [ ] Buy milk {#milk}', ''].join('\n');
  const { text: out, changed } = formatDocument(doc);
  assert.strictEqual(changed, false, 'a canonically-indented prose-nested task is already canonical');
  assert.ok(out.includes('  - [ ] Buy milk {#milk}'), 'the two-space indent survives fmt');
});

test('symlink: mutating through a symlink writes the real file and keeps the link', async () => {
  const dir = tmpDir('mdc-link-');
  const real = path.join(dir, 'real.mdc.md');
  const link = path.join(dir, 'link.mdc.md');
  fs.writeFileSync(real, '---\nmdc: "0.1"\n---\n\n- [ ] Linked task {#t}\n');
  fs.symlinkSync(real, link);
  const r = await runCli(['check', link, 't', '--date', '2026-07-26']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.ok(fs.readFileSync(real, 'utf8').includes('- [x] Linked task {#t done=2026-07-26}'), 'real file mutated');
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'link is still a symlink, not severed into a regular file');
});

test('no leaked lock or tmp files remain after a mutation', async () => {
  const dir = tmpDir('mdc-clean-');
  const file = path.join(dir, 'todo.mdc.md');
  fs.writeFileSync(file, '---\nmdc: "0.1"\n---\n\n- [ ] task {#t}\n');
  await runCli(['check', file, 't', '--date', '2026-07-26']);
  const leftovers = fs.readdirSync(dir).filter((n) => n.includes('.lock') || n.includes('.tmp-'));
  assert.deepStrictEqual(leftovers, [], `no lock/tmp leftovers, found: ${leftovers}`);
});

test('stale-lock reap is single-winner: one of 3 concurrent claims succeeds', async () => {
  const dir = tmpDir('mdc-stale-');
  const file = path.join(dir, 'race.mdc.md');
  fs.writeFileSync(file, '---\nmdc: "0.1"\n---\n\n- [ ] Contended {#target}\n');
  // Plant a stale lock (mtime well past the 10s threshold) that all contenders must reap.
  const lock = fs.realpathSync(file) + '.lock';
  fs.writeFileSync(lock, 'dead-holder');
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(lock, past, past);

  const results = await Promise.all(
    ['a', 'b', 'c'].map((h) => runCli(['claim', file, 'target', '--as', `agent-${h}`])),
  );
  const codes = results.map((r) => r.code);
  assert.strictEqual(codes.filter((c) => c === 0).length, 1, `exactly one winner — codes: ${codes}`);
  const final = fs.readFileSync(file, 'utf8');
  assert.match(final, /@agent-[abc]\b/, 'exactly one assignee is recorded');
  assert.ok(!fs.existsSync(lock), 'the stale lock is gone after the run');
});
