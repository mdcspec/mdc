/**
 * Shared fixture-discovery and comparison helpers for the corpus runner.
 * Not a test file — imported by *.test.js.
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, '..', '..', '..');
export const corpusRoot = path.join(repoRoot, 'spec', 'corpus');
export const cliPath = path.join(repoRoot, 'packages', 'mdc', 'src', 'cli.js');

/**
 * @typedef {Object} CorpusCase
 * @property {string} name Case directory name.
 * @property {string} dir Absolute path to the case directory.
 * @property {(file: string) => string} read Reads a fixture file (utf8) from the case directory.
 * @property {(file: string) => boolean} has
 */

/**
 * Discover corpus cases for one verb family. Missing directories yield an
 * empty list — corpus presence is enforced elsewhere, not here.
 *
 * @param {'parse' | 'lint' | 'fmt' | 'mutate'} kind
 * @returns {CorpusCase[]} Sorted by case name.
 */
export function discoverCases(kind) {
  const dir = path.join(corpusRoot, kind);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const caseDir = path.join(dir, e.name);
      return {
        name: e.name,
        dir: caseDir,
        read: (file) => fs.readFileSync(path.join(caseDir, file), 'utf8'),
        has: (file) => fs.existsSync(path.join(caseDir, file)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every `*.mdc.md` document anywhere under the corpus (canonical documents,
 * case inputs, expected outputs). Missing corpus yields an empty list.
 *
 * @returns {Array<{ name: string, path: string, text: string }>} `name` is the corpus-relative path.
 */
export function corpusDocuments() {
  /** @type {Array<{ name: string, path: string, text: string }>} */
  const docs = [];
  /** @param {string} dir */
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.mdc.md')) {
        docs.push({ name: path.relative(corpusRoot, p), path: p, text: fs.readFileSync(p, 'utf8') });
      }
    }
  };
  walk(corpusRoot);
  return docs;
}

/**
 * Deep-clone a JSON value with every `line` key removed at every depth.
 * Line numbers are volatile under fixture edits; corpus comparison ignores
 * them everywhere.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function stripLines(value) {
  if (Array.isArray(value)) return value.map(stripLines);
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k !== 'line') out[k] = stripLines(v);
    }
    return out;
  }
  return value;
}

/**
 * assert.deepStrictEqual with `line` keys stripped from both sides.
 *
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} [message]
 */
export function deepEqualIgnoringLines(actual, expected, message) {
  assert.deepStrictEqual(stripLines(actual), stripLines(expected), message);
}

/**
 * Byte comparison for fmt/mutate expectations (utf8 code-unit equality).
 *
 * @param {string} actual
 * @param {string} expected
 * @param {string} [message]
 */
export function assertBytesEqual(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
}

/**
 * Number of differing positions between the two texts' line arrays (a length
 * difference counts one per extra line). The minimal-diff law: a mutation
 * changes exactly one line.
 *
 * @param {string} before
 * @param {string} after
 * @returns {number}
 */
export function changedLineCount(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const max = Math.max(a.length, b.length);
  let changed = 0;
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) changed++;
  }
  return changed;
}

/**
 * Spawn the real CLI: `process.execPath packages/mdc/src/cli.js <args>`.
 * Never relies on the bin being linked or executable.
 *
 * @param {string[]} args CLI arguments after the script path.
 * @param {{ input?: string, cwd?: string }} [options] `input` is piped to stdin (stdin is always closed).
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
export function runCli(args, options = {}) {
  const { input = null, cwd = repoRoot } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input !== null) child.stdin.write(input);
    child.stdin.end();
  });
}
