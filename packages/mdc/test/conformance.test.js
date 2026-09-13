/**
 * The portable conformance runner: drives every corpus case through the real
 * CLI purely from spec/corpus/manifest.json + the language-neutral contract in
 * spec/conformance.md — no per-family JS knowledge, no in-process calls. This
 * is the JS *implementation* of that contract; a second-language implementation
 * runs the same manifest against its own binary. If this passes, the manifest
 * is an accurate, executable, portable description of the corpus.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli, corpusRoot, deepEqualIgnoringLines, assertBytesEqual } from './corpus.js';

const manifest = JSON.parse(fs.readFileSync(path.join(corpusRoot, 'manifest.json'), 'utf8'));

for (const c of manifest.cases) {
  test(`conformance [${c.level}] ${c.id}`, async () => {
    const caseDir = path.join(corpusRoot, c.id);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mdc-conf-'));
    const file = path.join(work, 'work.mdc.md');
    const out = path.join(work, 'out.mdc.md'); // fresh; must not pre-exist (cut)
    const inputBytes = fs.readFileSync(path.join(caseDir, c.input), 'utf8');
    fs.writeFileSync(file, inputBytes);

    const argv = c.argv.map((a) => (a === '$FILE' ? file : a === '$OUT' ? out : a));
    const r = await runCli(argv);

    switch (c.compare) {
      case 'json-model': {
        assert.strictEqual(r.code, c.exit ?? 0, `exit — stderr: ${r.stderr}`);
        deepEqualIgnoringLines(JSON.parse(r.stdout), JSON.parse(fs.readFileSync(path.join(caseDir, c.expect), 'utf8')));
        break;
      }
      case 'json-findings': {
        // lint's exit encodes severity; the corpus asserts the findings, not the
        // code. Findings omit the volatile `line` key (C-3), so ignore it.
        deepEqualIgnoringLines(JSON.parse(r.stdout), JSON.parse(fs.readFileSync(path.join(caseDir, c.expect), 'utf8')));
        break;
      }
      case 'bytes': {
        assert.strictEqual(r.code, c.exit ?? 0, `exit — stderr: ${r.stderr}`);
        const resultPath = c.out === '$OUT' ? out : file;
        assertBytesEqual(fs.readFileSync(resultPath, 'utf8'), fs.readFileSync(path.join(caseDir, c.expect), 'utf8'));
        break;
      }
      case 'exit': {
        assert.strictEqual(r.code, c.exit, `expected exit ${c.exit} — stderr: ${r.stderr}`);
        assertBytesEqual(fs.readFileSync(file, 'utf8'), inputBytes, 'a refusal must leave the file byte-untouched');
        break;
      }
      case 'error': {
        assert.strictEqual(r.code, 1);
        assert.deepStrictEqual(JSON.parse(r.stdout), { error: c.error });
        break;
      }
      default:
        throw new Error(`unknown compare mode: ${c.compare}`);
    }
  });
}

test('spec citation integrity: every [family/case] and [file.mdc.md] cited in the spec resolves', () => {
  const specPath = path.join(corpusRoot, '..', 'mdc-spec-v0.1.md');
  const spec = fs.readFileSync(specPath, 'utf8');
  const families = ['parse', 'lint', 'fmt', 'mutate', 'add', 'note', 'cut'];
  const cited = new Set((spec.match(/\[[a-z0-9./-]+\]/g) ?? []).map((m) => m.slice(1, -1)));
  const missing = [];
  for (const ref of cited) {
    if (families.some((f) => ref.startsWith(`${f}/`))) {
      if (!fs.existsSync(path.join(corpusRoot, ref))) missing.push(`${ref} (corpus case dir)`);
    } else if (ref.endsWith('.mdc.md')) {
      if (!fs.existsSync(path.join(corpusRoot, ref))) missing.push(`${ref} (top-level fixture)`);
    }
    // other bracketed tokens (rule names, prose) are ignored
  }
  assert.deepStrictEqual(missing, [], `spec cites fixtures that do not exist: ${missing.join(', ')}`);
});

test('manifest ↔ corpus integrity: every manifest case exists, and every corpus case is listed', () => {
  const listed = new Set(manifest.cases.map((c) => c.id));
  // Every listed case directory exists with its input.
  for (const c of manifest.cases) {
    assert.ok(fs.existsSync(path.join(corpusRoot, c.id, c.input)), `${c.id}: input missing`);
    if (c.expect) assert.ok(fs.existsSync(path.join(corpusRoot, c.id, c.expect)), `${c.id}: expected artifact missing`);
  }
  // Every case directory on disk (in the driven families) is listed exactly once.
  for (const family of ['parse', 'lint', 'fmt', 'mutate', 'add', 'note', 'cut']) {
    const dir = path.join(corpusRoot, family);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) assert.ok(listed.has(`${family}/${e.name}`), `${family}/${e.name} is not in the manifest`);
    }
  }
});
