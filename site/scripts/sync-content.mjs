#!/usr/bin/env node
// Sync the canonical MDC spec sources from the repo into the Starlight docs
// collection. Deterministic and re-runnable: it rewrites the three source
// documents, prepends Starlight frontmatter, and converts repo-relative
// markdown links to either site routes (for the three synced pages) or
// absolute GitHub blob URLs (for everything else).
//
// Bracketed corpus citations like `[parse/minimal]` are NOT markdown links
// (no parenthesised target) and are left untouched.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import path from 'node:path/posix';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const docsDir = resolve(__dirname, '..', 'src', 'content', 'docs');

const BLOB_BASE = 'https://github.com/mdcspec/mdc/blob/main/';

// Each entry: repo source, its repo-relative dir (for link resolution),
// output path under docs/, the Starlight title, and the site route it maps to.
const PAGES = [
	{
		src: 'spec/mdc-spec-v0.1.md',
		out: 'spec/v0.1.md',
		title: 'MDC Specification v0.1',
		route: '/spec/v0.1',
		// Astro would otherwise slugify "v0.1" to "v01"; pin the route.
		slug: 'spec/v0.1',
	},
	{
		src: 'spec/conformance.md',
		out: 'conformance.md',
		title: 'Conformance',
		route: '/conformance',
	},
	{
		src: 'docs/spec/implementations.md',
		out: 'implementations.md',
		title: 'Implementations',
		route: '/implementations',
	},
];

// Map normalized repo-relative source path -> site route.
const routeBySource = new Map(PAGES.map((p) => [path.normalize(p.src), p.route]));

function stripTrailingSlash(s) {
	return s.length > 1 ? s.replace(/\/+$/, '') : s;
}

// Resolve a markdown link target (relative to the source file's dir) into
// either a site route or an absolute GitHub blob URL. Absolute URLs and pure
// in-page anchors are returned unchanged.
function rewriteTarget(target, srcDir) {
	// Leave absolute URLs, protocol-relative, and mailto alone.
	if (/^(https?:)?\/\//i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
		return target;
	}
	// Pure in-page anchor.
	if (target.startsWith('#')) return target;

	const hashIdx = target.indexOf('#');
	const rawPath = hashIdx === -1 ? target : target.slice(0, hashIdx);
	const frag = hashIdx === -1 ? '' : target.slice(hashIdx); // includes '#'

	if (rawPath === '') return target; // defensive: nothing to resolve

	const resolved = path.normalize(path.join(srcDir, rawPath));
	const key = stripTrailingSlash(resolved);

	const route = routeBySource.get(key);
	if (route) return route + frag;

	return BLOB_BASE + resolved + frag;
}

// Rewrite all markdown links on a single line, skipping fenced code.
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;
function rewriteLinks(line, srcDir) {
	return line.replace(LINK_RE, (whole, text, target) => {
		const next = rewriteTarget(target, srcDir);
		return `[${text}](${next})`;
	});
}

function transform(content, srcDir) {
	const lines = content.split('\n');
	let inFence = false;
	let fenceMarker = '';
	const out = lines.map((line) => {
		const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
		if (fenceMatch) {
			const marker = fenceMatch[2][0];
			if (!inFence) {
				inFence = true;
				fenceMarker = marker;
			} else if (marker === fenceMarker) {
				inFence = false;
				fenceMarker = '';
			}
			return line;
		}
		if (inFence) return line;
		return rewriteLinks(line, srcDir);
	});
	return out.join('\n');
}

function yamlEscape(s) {
	return s.replace(/"/g, '\\"');
}

let count = 0;
for (const page of PAGES) {
	const abs = join(repoRoot, page.src);
	const raw = readFileSync(abs, 'utf8');
	const srcDir = path.dirname(path.normalize(page.src));
	const body = transform(raw, srcDir);

	const slugLine = page.slug ? `slug: "${yamlEscape(page.slug)}"\n` : '';
	const frontmatter = `---\ntitle: "${yamlEscape(page.title)}"\n${slugLine}---\n\n`;
	const outPath = join(docsDir, page.out);
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, frontmatter + body, 'utf8');
	count++;
	console.log(`synced ${page.src} -> src/content/docs/${page.out}`);
}
console.log(`sync-content: ${count} page(s) synced.`);
