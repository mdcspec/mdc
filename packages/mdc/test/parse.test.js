/**
 * Module-surface load check and line-anchoring unit test. The parse/ and lint/
 * corpus cases are driven end-to-end through the CLI by conformance.test.js
 * (from spec/corpus/manifest.json), so no in-process corpus loop lives here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../src/parse.js';

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
