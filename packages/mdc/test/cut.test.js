/**
 * Black-box CLI tests for `cut` (template -> run instantiation): stdout vs
 * --out, overwrite refusal, the not-a-template refusal, and driving a fresh
 * run. The cut/ corpus cases are driven through the CLI by conformance.test.js
 * (from spec/corpus/manifest.json), which byte-compares each run output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from './corpus.js';

test('cut to stdout: writes a run, does not touch the template', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-cut-'));
  const tpl = path.join(dir, 'release.mdc.md');
  fs.writeFileSync(tpl, '---\nmdc: "0.1"\nkind: template\ntitle: Release\n---\n\n- [ ] Cut the branch {#branch}\n');
  const before = fs.readFileSync(tpl, 'utf8');

  // Invoke from the template's directory so the source path — and thus the
  // stdout run's `template:` ref — is the plain filename, as a user would type.
  const r = await runCli(['cut', 'release.mdc.md', '--title', 'Release 9.0', '--as-version', '3', '--date', '2026-08-04'], { cwd: dir });
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /kind: run/);
  assert.match(r.stdout, /title: Release 9\.0/);
  assert.match(r.stdout, /template: release\.mdc\.md@3/);
  assert.match(r.stdout, /started: 2026-08-04/);
  assert.strictEqual(fs.readFileSync(tpl, 'utf8'), before, 'the template is never modified');
});

test('cut --out writes the run and refuses to overwrite (exit 2)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-cut-'));
  const tpl = path.join(dir, 'release.mdc.md');
  const out = path.join(dir, 'run.mdc.md');
  fs.writeFileSync(tpl, '---\nmdc: "0.1"\nkind: template\ntitle: Release\n---\n\n- [ ] Cut the branch {#branch}\n');

  const first = await runCli(['cut', tpl, '--out', out, '--date', '2026-08-04']);
  assert.strictEqual(first.code, 0, first.stderr);
  assert.ok(fs.existsSync(out), 'the run file was written');
  // The template ref is relative to the out file's directory.
  assert.match(fs.readFileSync(out, 'utf8'), /template: release\.mdc\.md\n/);

  const second = await runCli(['cut', tpl, '--out', out, '--date', '2026-08-04']);
  assert.strictEqual(second.code, 2, 'refuses to overwrite an existing run');
  assert.match(second.stderr, /already exists/);
});

test('cut refuses a non-template source with exit 1', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-cut-'));
  const notTpl = path.join(dir, 'run.mdc.md');
  fs.writeFileSync(notTpl, '---\nmdc: "0.1"\nkind: run\n---\n\n- [ ] Already a run {#x}\n');
  const r = await runCli(['cut', notTpl, '--date', '2026-08-04']);
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /not a template/);
});

test('a cut run is drivable: claim then check on a fresh instantiation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-cut-'));
  const tpl = path.join(dir, 'release.mdc.md');
  const out = path.join(dir, 'run.mdc.md');
  fs.writeFileSync(tpl, '---\nmdc: "0.1"\nkind: template\ntitle: Release\n---\n\n- [ ] Cut the branch {#branch}\n- [ ] Ship it {#ship needs=branch}\n');

  await runCli(['cut', tpl, '--out', out, '--date', '2026-08-04']);
  const claim = await runCli(['claim', out, 'branch', '--as', 'agent-a']);
  assert.strictEqual(claim.code, 0, claim.stderr);
  const check = await runCli(['check', out, 'branch', '--date', '2026-08-04']);
  assert.strictEqual(check.code, 0, check.stderr);
  assert.match(fs.readFileSync(out, 'utf8'), /- \[x\] Cut the branch \{#branch @agent-a done=2026-08-04\}/);
});
