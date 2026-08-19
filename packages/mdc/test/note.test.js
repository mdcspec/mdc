/**
 * Corpus runner for spec/corpus/note/ (attach a nested prose note) through the
 * real CLI, plus black-box tests: the note is invisible to the task model,
 * survives re-parse/lint/fmt, refuses an unknown id / empty or multiline body,
 * nests at the item's depth, and preserves CRLF.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverCases, runCli, assertBytesEqual } from './corpus.js';

function tmpDoc(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-note-'));
  const file = path.join(dir, 'input.mdc.md');
  fs.writeFileSync(file, text);
  return file;
}

for (const c of discoverCases('note')) {
  test(`note corpus: ${c.name}`, async () => {
    const input = c.read('input.mdc.md');
    const argv = /** @type {string[]} */ (JSON.parse(c.read('op.json')));
    const expected = c.read('expected.mdc.md');
    const file = tmpDoc(input);
    const result = await runCli(argv.map((t) => (t === '$FILE' ? file : t)));
    assert.strictEqual(result.code, 0, `exit 0 — stderr: ${result.stderr}`);
    assertBytesEqual(fs.readFileSync(file, 'utf8'), expected);
    // A note is prose: the result must stay canonical and lint-clean.
    assert.strictEqual((await runCli(['fmt', '--check', file])).code, 0, 'note output is canonical');
    assert.strictEqual((await runCli(['lint', file])).code, 0, 'note output is lint-clean');
  });
}

test('a note is invisible to the task model — no new item, progress unchanged', async () => {
  const doc = '---\nmdc: "0.1"\n---\n\n- [ ] A {#a}\n- [x] B {#b done=2026-08-18}\n';
  const file = tmpDoc(doc);
  const before = JSON.parse((await runCli(['status', file, '--json'])).stdout);
  await runCli(['note', file, 'a', 'some context', '--as', 'ana', '--date', '2026-08-18']);
  const after = JSON.parse((await runCli(['status', file, '--json'])).stdout);
  assert.deepStrictEqual(after.totals, before.totals, 'totals unchanged (note is not an item)');
  assert.deepStrictEqual(after.progress, before.progress, 'progress unchanged');
  // The note is addressable-adjacent but not a parsed item: #a still has no children.
  const parsed = JSON.parse((await runCli(['parse', file, '--json'])).stdout);
  assert.deepStrictEqual(parsed.items.find((/** @type {{id:string}} */ i) => i.id === 'a').children, []);
});

test('a note nests one level below its target item (child item → deeper indent)', async () => {
  const doc = '---\nmdc: "0.1"\n---\n\n- [ ] Parent {#parent}\n  - [ ] Child {#child}\n';
  const file = tmpDoc(doc);
  await runCli(['note', file, 'child', 'on the child', '--as', 'bob', '--date', '2026-08-18']);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /\n {4}- note @bob 2026-08-18: on the child\n/, 'note under a depth-1 item indents 4 spaces');
  assert.strictEqual((await runCli(['fmt', '--check', file])).code, 0, 'still canonical');
});

test('note refuses an unknown id (exit 2) and rejects empty/multiline text (exit 1)', async () => {
  const doc = '---\nmdc: "0.1"\n---\n\n- [ ] A {#a}\n';
  const file = tmpDoc(doc);
  const unknown = await runCli(['note', file, 'nope', 'hello']);
  assert.strictEqual(unknown.code, 2);
  assert.match(unknown.stderr, /unknown id/);
  const empty = await runCli(['note', file, 'a', '   ']);
  assert.strictEqual(empty.code, 1);
  assert.match(empty.stderr, /cannot be empty/);
  const multiline = await runCli(['note', file, 'a', 'line one\nline two']);
  assert.strictEqual(multiline.code, 1);
  assert.match(multiline.stderr, /single line/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), doc, 'the file is untouched on every refusal');
});

test('note without --as omits the author', async () => {
  const file = tmpDoc('---\nmdc: "0.1"\n---\n\n- [ ] A {#a}\n');
  await runCli(['note', file, 'a', 'anonymous note', '--date', '2026-08-18']);
  assert.match(fs.readFileSync(file, 'utf8'), /\n {2}- note 2026-08-18: anonymous note\n/);
});

test('note preserves CRLF line endings', async () => {
  const file = tmpDoc('---\r\nmdc: "0.1"\r\n---\r\n\r\n- [ ] A {#a}\r\n');
  const r = await runCli(['note', file, 'a', 'windows note', '--date', '2026-08-18']);
  assert.strictEqual(r.code, 0, r.stderr);
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('  - note 2026-08-18: windows note\r\n'), 'note line uses CRLF');
  assert.ok(!/[^\r]\n/.test(after), 'no bare LF introduced');
});
