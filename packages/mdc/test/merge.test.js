/**
 * The id-aware merge driver. Two layers:
 *  - mergeMdc() unit tests: the conservative 3-way logic in isolation.
 *  - an end-to-end git merge through the configured driver, which is the
 *    regression for the original finding (concurrent edits to adjacent item
 *    lines conflicted under plain git).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mergeMdc } from '../src/merge.js';
import { runCli, cliPath } from './corpus.js';

const BASE = `---
mdc: "0.1"
---

# Release

- [ ] First {#first}
- [ ] Second {#second}
- [ ] Third {#third}
`;

/** Replace the full canonical line for an item id. */
function withLine(doc, id, line) {
  return doc
    .split('\n')
    .map((l) => (l.includes(`{#${id}`) ? line : l))
    .join('\n');
}

test('identical sides merge clean to that content', () => {
  const r = mergeMdc(BASE, BASE, BASE);
  assert.equal(r.clean, true);
  assert.equal(r.text, BASE);
});

test('adjacent items changed on different sides: clean, keeps both', () => {
  const ours = withLine(BASE, 'first', '- [ ] First {#first @agent-a}');
  const theirs = withLine(BASE, 'second', '- [ ] Second {#second @agent-b}');
  const r = mergeMdc(BASE, ours, theirs);
  assert.equal(r.clean, true);
  assert.match(r.text, /#first @agent-a/);
  assert.match(r.text, /#second @agent-b/);
  assert.match(r.text, /#third\}/); // untouched item preserved
  assert.equal(r.text.split('\n').length, BASE.split('\n').length); // no lines added/dropped
});

test('only one side changes an item: takes that side', () => {
  // theirs differs from base only on #second, ours differs only on #third,
  // so each item resolves via its single-sided branch.
  const ours = withLine(BASE, 'third', '- [ ] Third {#third @agent-a}');
  const theirs = withLine(BASE, 'second', '- [ ] Second {#second @agent-b}');
  const r = mergeMdc(BASE, ours, theirs);
  assert.equal(r.clean, true);
  assert.match(r.text, /#second @agent-b/);
  assert.match(r.text, /#third @agent-a/);
  assert.match(r.text, /#first\}/);
});

test('same id changed differently on both sides: declines (real conflict)', () => {
  const ours = withLine(BASE, 'first', '- [ ] First {#first @agent-a}');
  const theirs = withLine(BASE, 'first', '- [ ] First {#first @agent-b}');
  const r = mergeMdc(BASE, ours, theirs);
  assert.equal(r.clean, false);
  assert.equal(r.text, null);
});

test('structural change (item added) declines', () => {
  const ours = BASE.replace('- [ ] Third {#third}\n', '- [ ] Third {#third}\n- [ ] Fourth {#fourth}\n');
  const theirs = withLine(BASE, 'first', '- [ ] First {#first @agent-b}');
  assert.equal(mergeMdc(BASE, ours, theirs).clean, false);
});

test('heading edit on one side declines', () => {
  const ours = BASE.replace('# Release', '# Release 1.0');
  const theirs = withLine(BASE, 'first', '- [ ] First {#first @agent-b}');
  assert.equal(mergeMdc(BASE, ours, theirs).clean, false);
});

test('note line inserted on one side declines', () => {
  const ours = withLine(BASE, 'first', '- [ ] First {#first @agent-a}');
  const theirs = BASE.replace(
    '- [ ] First {#first}\n',
    '- [ ] First {#first}\n  - note @agent-b 2026-10-25: looking into this\n',
  );
  assert.equal(mergeMdc(BASE, ours, theirs).clean, false);
});

test('id removed on one side declines', () => {
  const ours = withLine(BASE, 'first', '- [ ] First');
  const theirs = withLine(BASE, 'second', '- [ ] Second {#second @agent-b}');
  assert.equal(mergeMdc(BASE, ours, theirs).clean, false);
});

test('duplicate id anywhere declines', () => {
  // A board with a duplicate #first (invalid, but we must not key-merge it).
  const dup = BASE.replace('- [ ] Second {#second}', '- [ ] Second {#first}');
  // Both sides diverge from base and from each other, so no fast path applies
  // and the merge must reach — and reject on — the shape/duplicate check.
  const ours = dup.replace('- [ ] Third {#third}', '- [ ] Third {#third @agent-a}');
  const theirs = dup.replace('- [ ] First {#first}', '- [ ] First {#first @agent-b}');
  assert.equal(mergeMdc(dup, ours, theirs).clean, false);
});

test('preserves the exact trailing-newline shape', () => {
  const ours = withLine(BASE, 'first', '- [ ] First {#first @agent-a}');
  const theirs = withLine(BASE, 'second', '- [ ] Second {#second @agent-b}');
  const r = mergeMdc(BASE, ours, theirs);
  assert.equal(r.text.endsWith('\n'), true);
  const noNl = BASE.replace(/\n$/, '');
  const r2 = mergeMdc(noNl, withLine(noNl, 'first', '- [ ] First {#first @agent-a}'), withLine(noNl, 'second', '- [ ] Second {#second @agent-b}'));
  assert.equal(r2.text.endsWith('\n'), false);
});

test('merge-driver CLI: resolves a clean case into <ours> and exits 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mergecli-'));
  const O = path.join(dir, 'base'), A = path.join(dir, 'ours'), B = path.join(dir, 'theirs');
  fs.writeFileSync(O, BASE);
  fs.writeFileSync(A, withLine(BASE, 'first', '- [ ] First {#first @agent-a}'));
  fs.writeFileSync(B, withLine(BASE, 'second', '- [ ] Second {#second @agent-b}'));
  const r = await runCli(['merge-driver', O, A, B]);
  assert.equal(r.code, 0);
  const out = fs.readFileSync(A, 'utf8');
  assert.match(out, /#first @agent-a/);
  assert.match(out, /#second @agent-b/);
  assert.doesNotMatch(out, /<<<<<<</);
});

test('merge-driver CLI: a real same-id conflict falls back to git and exits 1 with markers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mergecli2-'));
  const O = path.join(dir, 'base'), A = path.join(dir, 'ours'), B = path.join(dir, 'theirs');
  fs.writeFileSync(O, BASE);
  fs.writeFileSync(A, withLine(BASE, 'first', '- [ ] First {#first @agent-a}'));
  fs.writeFileSync(B, withLine(BASE, 'first', '- [ ] First {#first @agent-b}'));
  const r = await runCli(['merge-driver', O, A, B]);
  assert.equal(r.code, 1);
  assert.match(fs.readFileSync(A, 'utf8'), /<<<<<<</);
});

test('end-to-end: two branches editing adjacent items merge clean through the driver', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-mergee2e-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'a@b.c');
  git('config', 'user.name', 't');
  git('config', 'merge.mdc.name', 'MDC id-aware merge');
  // Point the driver at this CLI through node, since `mdc` is not on PATH in tests.
  git('config', 'merge.mdc.driver', `${process.execPath} ${cliPath} merge-driver %O %A %B`);
  fs.writeFileSync(path.join(dir, '.gitattributes'), '*.mdc.md merge=mdc\n');
  fs.writeFileSync(path.join(dir, 'b.mdc.md'), BASE);
  git('add', '-A');
  git('commit', '-qm', 'init');
  const mainBranch = git('branch', '--show-current').toString().trim();
  git('checkout', '-q', '-b', 'feat');
  fs.writeFileSync(path.join(dir, 'b.mdc.md'), withLine(BASE, 'first', '- [ ] First {#first @agent-a}'));
  git('commit', '-qam', 'feat: claim first');
  git('checkout', '-q', mainBranch);
  fs.writeFileSync(path.join(dir, 'b.mdc.md'), withLine(BASE, 'second', '- [ ] Second {#second @agent-b}'));
  git('commit', '-qam', 'master: claim second');
  // Without the driver this adjacent-line merge conflicts; with it, it is clean.
  git('merge', '--no-edit', 'feat');
  const merged = fs.readFileSync(path.join(dir, 'b.mdc.md'), 'utf8');
  assert.match(merged, /#first @agent-a/);
  assert.match(merged, /#second @agent-b/);
  assert.doesNotMatch(merged, /<<<<<<</);
});
