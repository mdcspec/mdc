/**
 * Corpus runner for spec/corpus/add/ (append a new item) driven through the
 * real CLI, plus black-box tests for id collision, empty/invalid input, the
 * canonical-by-construction guarantee, CRLF preservation, and the
 * add -> claim -> check drive that makes a freshly added item usable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverCases, runCli, assertBytesEqual } from './corpus.js';

/** Write `text` to a fresh temp file and return its path. */
function tmpDoc(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-add-'));
  const file = path.join(dir, 'input.mdc.md');
  fs.writeFileSync(file, text);
  return file;
}

for (const c of discoverCases('add')) {
  test(`add corpus: ${c.name}`, async () => {
    const input = c.read('input.mdc.md');
    const argv = /** @type {string[]} */ (JSON.parse(c.read('op.json')));
    const expected = c.read('expected.mdc.md');
    const file = tmpDoc(input);

    const result = await runCli(argv.map((t) => (t === '$FILE' ? file : t)));
    assert.strictEqual(result.code, 0, `exit 0 — stderr: ${result.stderr}`);
    assertBytesEqual(fs.readFileSync(file, 'utf8'), expected);
    // Every add output must itself be canonical (fmt is a no-op) and lint-clean.
    assert.strictEqual((await runCli(['fmt', '--check', file])).code, 0, 'add output is canonical');
    assert.strictEqual((await runCli(['lint', file])).code, 0, 'add output is lint-clean');
  });
}

test('add prints the new id and appends exactly one item line', async () => {
  const file = tmpDoc('---\nmdc: "0.1"\n---\n\n- [ ] First {#first}\n');
  const before = fs.readFileSync(file, 'utf8');
  const r = await runCli(['add', file, 'Second thing', '--id', 'second']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.strictEqual(r.stdout, '#second\n', 'prints #<id> to stdout');
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.startsWith(before), 'existing bytes are preserved verbatim');
  assert.strictEqual(after, `${before}- [ ] Second thing {#second}\n`, 'exactly one canonical item line appended');
});

test('add --section places into a section (not appended past a later gate)', async () => {
  const file = tmpDoc('---\nmdc: "0.1"\n---\n\n# Docs\n- [ ] Refresh {#docs}\n\n# Release\n- [ ] Ship {#ship .gate}\n');
  await runCli(['add', file, 'Validate links', '--id', 'links', '--needs', 'docs', '--section', 'Docs']);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /# Docs\n- \[ \] Refresh \{#docs\}\n- \[ \] Validate links \{#links needs=docs\}\n/, 'lands inside # Docs');
  // The whole point: it is NOT gated by the later #ship gate.
  const report = JSON.parse((await runCli(['report', file, '--json'])).stdout);
  assert.ok(!report.blocked.some((/** @type {{id:string,gatedBy?:string[]}} */ e) => e.id === 'links' && e.gatedBy), '#links is not gated by #ship');
});

test('add --after inserts as the next sibling, past the target subtree', async () => {
  const file = tmpDoc('---\nmdc: "0.1"\n---\n\n- [ ] Parent {#parent}\n  - [ ] Child {#child}\n- [ ] Sib {#sib}\n');
  await runCli(['add', file, 'Inserted', '--id', 'ins', '--after', 'parent']);
  assert.match(fs.readFileSync(file, 'utf8'), /  - \[ \] Child \{#child\}\n- \[ \] Inserted \{#ins\}\n- \[ \] Sib/, 'after the subtree, at parent depth');
});

test('add rejects unknown --after/--section (exit 2) and both placement flags (exit 1)', async () => {
  const input = '---\nmdc: "0.1"\n---\n\n- [ ] A {#a}\n';
  const file = tmpDoc(input);
  assert.strictEqual((await runCli(['add', file, 'x', '--after', 'nope'])).code, 2);
  assert.strictEqual((await runCli(['add', file, 'x', '--section', 'Nope'])).code, 2);
  assert.strictEqual((await runCli(['add', file, 'x', '--after', 'a', '--section', 'S'])).code, 1);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), input, 'file untouched on every placement refusal');
});

test('add generates an id from the text when --id is omitted', async () => {
  const file = tmpDoc('---\nmdc: "0.1"\n---\n\n- [ ] Anchor {#anchor}\n');
  const r = await runCli(['add', file, 'Deploy the new service']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.strictEqual(r.stdout, '#deploy-the-new\n', 'first three slugified words');
});

test('add refuses an --id collision with exit 2 and leaves the file untouched', async () => {
  const input = '---\nmdc: "0.1"\n---\n\n- [ ] Taken {#dup}\n';
  const file = tmpDoc(input);
  const r = await runCli(['add', file, 'Another', '--id', 'dup']);
  assert.strictEqual(r.code, 2, 'domain refusal');
  assert.match(r.stderr, /already exists/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), input, 'file is byte-untouched on refusal');
});

test('add rejects empty text (exit 1) and a bad --id slug (exit 1)', async () => {
  const file = tmpDoc('---\nmdc: "0.1"\n---\n\n- [ ] X {#x}\n');
  const empty = await runCli(['add', file, '   ']);
  assert.strictEqual(empty.code, 1);
  assert.match(empty.stderr, /cannot be empty/);
  const badId = await runCli(['add', file, 'Fine text', '--id', 'not a slug']);
  assert.strictEqual(badId.code, 1);
  assert.match(badId.stderr, /must be a slug/);
});

test('a freshly added item is immediately drivable: add -> claim -> check', async () => {
  const file = tmpDoc('---\nmdc: "0.1"\n---\n\n- [ ] Seed {#seed}\n');
  const add = await runCli(['add', file, 'Do the work', '--id', 'work', '--needs', 'seed']);
  assert.strictEqual(add.code, 0, add.stderr);
  // #work needs #seed, so it is not actionable yet; check the seed to unblock it.
  await runCli(['check', file, 'seed', '--date', '2026-08-16']);
  const claim = await runCli(['claim', file, 'work', '--as', 'agent-a']);
  assert.strictEqual(claim.code, 0, claim.stderr);
  const check = await runCli(['check', file, 'work', '--date', '2026-08-16']);
  assert.strictEqual(check.code, 0, check.stderr);
  // Canonical block order sorts keys alphabetically: done before needs.
  assert.match(fs.readFileSync(file, 'utf8'), /- \[x\] Do the work \{#work @agent-a done=2026-08-16 needs=seed\}/);
});

test('add preserves CRLF line endings', async () => {
  const file = tmpDoc('---\r\nmdc: "0.1"\r\n---\r\n\r\n- [ ] First {#first}\r\n');
  const r = await runCli(['add', file, 'Second', '--id', 'second']);
  assert.strictEqual(r.code, 0, r.stderr);
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.endsWith('- [ ] Second {#second}\r\n'), 'appended line uses CRLF');
  assert.ok(!/[^\r]\n/.test(after), 'no bare LF introduced');
});
