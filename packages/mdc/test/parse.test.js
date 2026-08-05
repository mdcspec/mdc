/**
 * Corpus runner for spec/corpus/parse/ and spec/corpus/lint/ cases, plus a
 * load check of the module surface.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverCases, deepEqualIgnoringLines } from './corpus.js';
import { parseDocument } from '../src/parse.js';
import { lintDocument } from '../src/lint.js';

test('module stubs load and export the contract surface', async () => {
  const surfaces = {
    '../src/frontmatter.js': ['readFrontmatter', 'assertMdcDocument'],
    '../src/attributes.js': ['extractAttributeBlock', 'parseAttributeBlock', 'serializeAttributeBlock'],
    '../src/parse.js': ['remarkMdc', 'parseDocument'],
    '../src/model.js': ['computeDerived', 'nextItems', 'statusReport'],
    '../src/lint.js': ['lintDocument'],
    '../src/fmt.js': ['formatDocument', 'serializeItemLine', 'slugify'],
    '../src/mutate.js': ['check', 'uncheck', 'cancel', 'claim', 'PreconditionError'],
  };
  for (const [specifier, names] of Object.entries(surfaces)) {
    const mod = await import(specifier);
    for (const name of names) {
      assert.strictEqual(typeof mod[name], 'function', `${specifier} must export ${name}`);
    }
  }
});

test('line anchoring: items and warnings carry 1-based source line numbers', () => {
  const doc = parseDocument([
    '---',
    'mdc: "0.1"',
    '---',
    '',
    '# Section',
    '',
    '- [ ] Parent {#parent}',
    '  - [ ] Child {#a #b}',
    '- [ ] Broken {#oops verify="unterminated}',
  ].join('\n'));
  assert.strictEqual(doc.items[0].line, 7);
  assert.strictEqual(doc.items[0].children[0].line, 8);
  assert.strictEqual(doc.items[1].line, 9);
  assert.deepStrictEqual(
    doc.warnings.map((w) => [w.rule, w.line]),
    [['multiple-ids', 8], ['malformed-attributes', 9]],
  );
});

for (const c of discoverCases('parse')) {
  if (c.has('error.json')) {
    test(`parse corpus (error): ${c.name}`, () => {
      const input = c.read('input.mdc.md');
      const expected = JSON.parse(c.read('error.json'));
      assert.throws(
        () => parseDocument(input),
        (/** @type {Error & { code?: string, exitCode?: number }} */ err) => {
          assert.strictEqual(err.code, expected.error);
          assert.strictEqual(err.exitCode, 1);
          return true;
        },
      );
    });
    continue;
  }
  test(`parse corpus: ${c.name}`, () => {
    const input = c.read('input.mdc.md');
    const expected = JSON.parse(c.read('expected.json'));
    deepEqualIgnoringLines(parseDocument(input), expected);
  });
}

for (const c of discoverCases('lint')) {
  test(`lint corpus: ${c.name}`, () => {
    const input = c.read('input.mdc.md');
    const expected = JSON.parse(c.read('expected.json'));
    const findings = lintDocument(parseDocument(input), input);
    deepEqualIgnoringLines(findings, expected);
  });
}
