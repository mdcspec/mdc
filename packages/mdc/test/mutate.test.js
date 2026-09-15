/**
 * The concurrent claim race — the one mutate property that a corpus fixture
 * cannot express (it needs 5 processes contending for one file). The mutate/
 * corpus cases are driven through the CLI by conformance.test.js (from
 * spec/corpus/manifest.json).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli, changedLineCount } from './corpus.js';

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

const MIN_DIFF_DOC = `---
mdc: "0.1"
---

# Work

- [ ] Alpha {#alpha}
- [ ] Beta {#beta}
- [ ] Gamma {#gamma}
`;

test('minimal-diff law: a successful mutation rewrites exactly one line', async () => {
  // Property held by every mutation, independent of the corpus fixtures: a
  // rewrite touches only its target line. Drive a representative spread of
  // verbs and assert one changed line each, against a fresh copy per verb.
  const cases = [
    ['check', 'alpha', '--date', '2026-08-18'],
    ['claim', 'beta', '--as', 'agent-a'],
    ['cancel', 'gamma', '--reason', 'obsolete'],
    ['edit', 'alpha', '--add-class', 'urgent'],
  ];
  for (const argv of cases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mindiff-'));
    const file = path.join(dir, 'work.mdc.md');
    fs.writeFileSync(file, MIN_DIFF_DOC);
    const r = await runCli([argv[0], file, ...argv.slice(1)]);
    assert.strictEqual(r.code, 0, `${argv[0]} exit — stderr: ${r.stderr}`);
    const after = fs.readFileSync(file, 'utf8');
    assert.strictEqual(changedLineCount(MIN_DIFF_DOC, after), 1, `${argv[0]} must change exactly one line`);
  }
});
