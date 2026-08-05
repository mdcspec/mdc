/**
 * Corpus runner for spec/corpus/fmt/ cases, plus the idempotence property
 * `fmt(fmt(x)) === fmt(x)` over every corpus document.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverCases, corpusDocuments, assertBytesEqual } from './corpus.js';
import { formatDocument } from '../src/fmt.js';
import { parseDocument } from '../src/parse.js';
import { flattenItems } from '../src/model.js';

for (const c of discoverCases('fmt')) {
  test(`fmt corpus: ${c.name}`, () => {
    const input = c.read('input.mdc.md');
    const expected = c.read('expected.mdc.md');
    const options = c.name.includes('assign-ids') ? { assignIds: true } : {};
    assertBytesEqual(formatDocument(input, options).text, expected);
  });
}

for (const doc of corpusDocuments()) {
  test(`fmt idempotence: ${doc.name}`, () => {
    const once = formatDocument(doc.text).text;
    const twice = formatDocument(once).text;
    assertBytesEqual(twice, once, 'fmt(fmt(x)) must equal fmt(x)');
  });
}

// Contract requirement 4: for every corpus document, fmt changes only modeled
// item lines — every other byte (frontmatter, prose, blank lines) survives.
for (const doc of corpusDocuments()) {
  test(`fmt round-trip (non-item bytes preserved): ${doc.name}`, () => {
    let parsed;
    try {
      parsed = parseDocument(doc.text);
    } catch {
      // Non-MDC / unsupported: fmt is a no-op, so nothing can drift.
      assertBytesEqual(formatDocument(doc.text).text, doc.text, 'fmt must not touch a non-MDC document');
      return;
    }
    const itemLines = new Set(flattenItems(parsed).map(({ item }) => item.line));
    const before = doc.text.split('\n');
    const after = formatDocument(doc.text).text.split('\n');
    assert.strictEqual(after.length, before.length, 'fmt must not add or remove lines');
    for (let i = 0; i < before.length; i++) {
      if (!itemLines.has(i + 1)) {
        assert.strictEqual(after[i], before[i], `non-item line ${i + 1} must be byte-identical`);
      }
    }
  });
}
