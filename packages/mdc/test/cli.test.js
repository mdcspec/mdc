/**
 * Black-box tests of the real CLI: exit codes and --json shapes over stdin
 * fixtures, never internals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from './corpus.js';

const VALID_DOC = `---
mdc: "0.1"
kind: run
title: CLI fixture
---

# CLI fixture

## Prep

- [x] Cut branch {#branch done=2026-07-24}
- [ ] Verify CI {#ci needs=branch}

## Ship

- [ ] Publish package {#publish needs=ci}
`;

const ALL_DONE_DOC = `---
mdc: "0.1"
---

- [x] Everything finished {#only done=2026-07-24}
`;

const DANGLING_DOC = `---
mdc: "0.1"
---

- [ ] Orphan {#orphan needs=missing}
`;

const NOT_MDC = `# Plain markdown

- [ ] a task with no frontmatter
`;

/** @param {unknown} entry `next --json` entries carry ids either as strings or as item objects. */
const idOf = (entry) =>
  typeof entry === 'string' ? entry : /** @type {{ id?: string }} */ (entry)?.id;

test('parse --json emits the L1 model shape (stdin via "-")', async () => {
  const r = await runCli(['parse', '-', '--json'], { input: VALID_DOC });
  assert.strictEqual(r.code, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.strictEqual(doc.mdc, '0.1');
  assert.strictEqual(doc.kind, 'run');
  assert.strictEqual(doc.title, 'CLI fixture');
  assert.strictEqual(doc.frontmatter.mdc, '0.1');
  assert.strictEqual(doc.frontmatter.title, 'CLI fixture');
  assert.ok(Array.isArray(doc.items), 'items is an array');
  assert.ok(Array.isArray(doc.warnings), 'warnings is an array');

  const byId = new Map(doc.items.map((item) => [item.id, item]));
  const ci = byId.get('ci');
  assert.ok(ci, 'item #ci is modeled');
  for (const key of ['id', 'text', 'state', 'assignee', 'classes', 'attrs', 'section', 'line', 'children', 'computed']) {
    assert.ok(key in ci, `item has '${key}'`);
  }
  assert.strictEqual(ci.state, 'open');
  assert.strictEqual(ci.section, 'Prep');
  assert.deepStrictEqual(ci.attrs.needs, ['branch']);
  assert.strictEqual(ci.computed.blocked, false, '#branch is done, so #ci is unblocked');
  assert.strictEqual(ci.computed.actionable, true);
  assert.strictEqual(ci.computed.progress, null, 'leaf items have null progress');

  const publish = byId.get('publish');
  assert.strictEqual(publish.computed.blocked, true);
  assert.deepStrictEqual(publish.computed.blockedBy, ['ci']);
  assert.strictEqual(publish.computed.actionable, false);
});

test('lint exits 0 on a clean document', async () => {
  const r = await runCli(['lint', '-'], { input: VALID_DOC });
  assert.strictEqual(r.code, 0, r.stderr);
});

test('lint exits 2 when findings include severity error', async () => {
  const r = await runCli(['lint', '-', '--json'], { input: DANGLING_DOC });
  assert.strictEqual(r.code, 2, r.stderr);
  const findings = JSON.parse(r.stdout);
  assert.ok(Array.isArray(findings), 'lint --json emits an array');
  assert.ok(
    findings.some((f) => f.rule === 'dangling-needs' && f.severity === 'error'),
    `expected a dangling-needs error, got: ${r.stdout}`
  );
});

test('status exits 0 and reports on stdin', async () => {
  const r = await runCli(['status', '-'], { input: VALID_DOC });
  assert.strictEqual(r.code, 0, r.stderr);
  assert.ok(r.stdout.length > 0, 'status writes a report to stdout');
});

test('status --json emits a JSON object', async () => {
  const r = await runCli(['status', '-', '--json'], { input: VALID_DOC });
  assert.strictEqual(r.code, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.strictEqual(typeof report, 'object');
  assert.notStrictEqual(report, null);
});

test('next --json lists actionable items in document order', async () => {
  const r = await runCli(['next', '-', '--json'], { input: VALID_DOC });
  assert.strictEqual(r.code, 0, r.stderr);
  const entries = JSON.parse(r.stdout);
  assert.ok(Array.isArray(entries), 'next --json emits an array');
  assert.deepStrictEqual(entries.map(idOf), ['ci'], 'only #ci is actionable');
});

test('next --json exits 0 with an empty array when nothing is actionable', async () => {
  const r = await runCli(['next', '-', '--json'], { input: ALL_DONE_DOC });
  assert.strictEqual(r.code, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), []);
});

test('every read verb refuses a non-MDC document with exit 1', async () => {
  const invocations = [
    ['parse', '-', '--json'],
    ['lint', '-'],
    ['status', '-'],
    ['next', '-'],
    ['fmt', '-', '--check'],
  ];
  for (const argv of invocations) {
    const r = await runCli(argv, { input: NOT_MDC });
    assert.strictEqual(r.code, 1, `${argv[0]} exit — stderr: ${r.stderr}`);
    assert.match(r.stderr, /not an MDC document/, `${argv[0]} names the refusal`);
    assert.strictEqual(r.stdout, '', `${argv[0]} keeps machine output off stdout on error`);
  }
});

test('usage errors exit 1 with usage on stderr', async () => {
  const noArgs = await runCli([]);
  assert.strictEqual(noArgs.code, 1);
  assert.match(noArgs.stderr, /Usage: mdc/);

  const unknownVerb = await runCli(['frobnicate', 'x.mdc.md']);
  assert.strictEqual(unknownVerb.code, 1);
  assert.match(unknownVerb.stderr, /unknown verb/);

  const stdinMutation = await runCli(['check', '-', 'some-id']);
  assert.strictEqual(stdinMutation.code, 1, 'mutations require a real path');

  const missingFlag = await runCli(['cancel', 'x.mdc.md', 'some-id']);
  assert.strictEqual(missingFlag.code, 1, 'cancel requires --reason');
  assert.match(missingFlag.stderr, /--reason/);
});
