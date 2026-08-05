/**
 * Corpus runner for spec/corpus/mutate/ cases driven through the real CLI,
 * plus the minimal-diff property and the concurrent claim race.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverCases, runCli, assertBytesEqual, changedLineCount } from './corpus.js';

/**
 * Translate a case's op.json into CLI argv. Accepted shapes:
 * - `["check", "$FILE", "branch", "--date", "2026-07-26"]` — raw argv, `$FILE`
 *   replaced with the working copy (inserted after the verb when absent);
 * - `{ "verb": "check", "id": "branch", "flags": { "date": "2026-07-26" } }` —
 *   flags may also sit at the top level next to `verb`/`id`.
 * An optional `exit` key (either shape via an object) is the expected exit
 * code, default 0.
 *
 * @param {unknown} op
 * @param {string} file
 * @returns {{ argv: string[], expectedExit: number }}
 */
function opToArgv(op, file) {
  if (Array.isArray(op)) {
    const argv = op.map((t) => (t === '$FILE' ? file : String(t)));
    if (!op.includes('$FILE')) argv.splice(1, 0, file);
    return { argv, expectedExit: 0 };
  }
  const obj = /** @type {Record<string, unknown>} */ (op);
  const expectedExit = typeof obj.exit === 'number' ? obj.exit : 0;
  if (Array.isArray(obj.argv)) {
    return { ...opToArgv(obj.argv, file), expectedExit };
  }
  const verb = String(obj.verb);
  const argv = [verb, file];
  if (obj.id !== undefined) argv.push(String(obj.id));
  const flags = /** @type {Record<string, unknown>} */ (
    obj.flags ?? Object.fromEntries(Object.entries(obj).filter(([k]) => !['verb', 'id', 'exit', 'flags', 'argv'].includes(k)))
  );
  for (const [key, value] of Object.entries(flags)) {
    if (value === true) argv.push(`--${key}`);
    else if (value !== false && value !== undefined && value !== null) argv.push(`--${key}`, String(value));
  }
  return { argv, expectedExit };
}

for (const c of discoverCases('mutate')) {
  test(`mutate corpus: ${c.name}`, async () => {
    const input = c.read('input.mdc.md');
    const op = JSON.parse(c.read('op.json'));
    // Spec C-5: a case asserts either a byte-for-byte result (expected.mdc.md)
    // or a refusal (expected-error.json `{ "exit": N }`, input byte-untouched).
    const refusal = c.has('expected-error.json')
      ? /** @type {{ exit: number }} */ (JSON.parse(c.read('expected-error.json')))
      : null;
    const expected = refusal !== null ? input : c.read('expected.mdc.md');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mutate-'));
    const file = path.join(dir, 'input.mdc.md');
    fs.writeFileSync(file, input);

    const { argv, expectedExit } = opToArgv(op, file);
    const result = await runCli(argv);
    assert.strictEqual(result.code, refusal?.exit ?? expectedExit, `exit code — stderr: ${result.stderr}`);

    const actual = fs.readFileSync(file, 'utf8');
    assertBytesEqual(actual, expected);

    const changed = changedLineCount(input, expected);
    if (input === expected) {
      assert.strictEqual(changed, 0, 'a refused mutation must not touch the file');
    } else {
      assert.strictEqual(changed, 1, 'a mutation must change exactly one line');
    }
  });
}

const RACE_DOC = `---
mdc: "0.1"
title: Claim race
---

# Claim race

- [ ] Contended item {#target}
`;

test('claim race: exactly one of 5 concurrent claims exits 0, the rest exit 2', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-race-'));
  const file = path.join(dir, 'race.mdc.md');
  fs.writeFileSync(file, RACE_DOC);

  const handles = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];
  const results = await Promise.all(handles.map((h) => runCli(['claim', file, 'target', '--as', h])));

  const codes = results.map((r) => r.code);
  assert.strictEqual(codes.filter((c) => c === 0).length, 1, `exactly one winner — codes: ${codes}`);
  assert.strictEqual(codes.filter((c) => c === 2).length, handles.length - 1, `losers exit 2 — codes: ${codes}`);

  const winner = handles[codes.indexOf(0)];
  const final = fs.readFileSync(file, 'utf8');
  assert.match(final, new RegExp(`@${winner}\\b`), 'the winner is the assignee on disk');
  assert.strictEqual(changedLineCount(RACE_DOC, final), 1, 'the race changed exactly one line');
});
