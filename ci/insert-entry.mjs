#!/usr/bin/env node
// Inserts a drafted <article> into log.html right after the insert sentinel.
// Split out of draft-dispatch.yml so the anchor logic has ONE home and is
// testable (a YAML-embedded `node -e` was not). Reword-tolerant: only the
// SENTINEL token is load-bearing; the rest of the comment can be reworded
// freely. Fails LOUDLY (exit 1) with a restore hint if the sentinel is missing
// or duplicated — the workflow then goes red → Telegram, so a typo can't
// silently drop the weekly PR (or insert in the wrong place).
//
// Usage: node ci/insert-entry.mjs <article-file> [log-file]
//   log-file defaults to ../log.html relative to this script (cwd-independent).

import { readFileSync, writeFileSync } from 'node:fs';

// Unique machine sentinel. NB: log.html also *describes* the anchor in prose;
// that prose must NOT contain this exact token, or the uniqueness check trips.
const SENTINEL = 'DRAFT-ANCHOR:INSERT-BELOW';

const articleFile = process.argv[2];
const logFile = process.argv[3] ? new URL(`file://${process.argv[3]}`) : new URL('../log.html', import.meta.url);
if (!articleFile) { console.error('insert-entry: usage: node ci/insert-entry.mjs <article-file> [log-file]'); process.exit(2); }

const html = readFileSync(logFile, 'utf8');
const article = readFileSync(articleFile, 'utf8').replace(/\s+$/, '');

const first = html.indexOf(SENTINEL);
const last = html.lastIndexOf(SENTINEL);
if (first < 0) {
  console.error(`insert-entry: sentinel "${SENTINEL}" not found in log.html.\n` +
    `  Restore a line like:  <!-- ${SENTINEL} draft-dispatch inserts the new entry immediately after this comment. -->\n` +
    `  just above the first <article class="entry">.`);
  process.exit(1);
}
if (first !== last) {
  console.error(`insert-entry: sentinel "${SENTINEL}" appears more than once in log.html — it must be unique (the prose that describes the anchor must not repeat the exact token).`);
  process.exit(1);
}

// insert after the end of the sentinel's HTML comment (the next "-->").
const close = html.indexOf('-->', first);
if (close < 0) { console.error(`insert-entry: found "${SENTINEL}" but no closing "-->" after it — the anchor comment is malformed.`); process.exit(1); }
const at = close + 3;

const out = html.slice(0, at) + '\n\n' + article + '\n' + html.slice(at);
writeFileSync(logFile, out);
console.error(`insert-entry: inserted ${article.length} bytes after the ${SENTINEL} sentinel.`);
