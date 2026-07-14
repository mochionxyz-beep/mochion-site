#!/usr/bin/env node
// Builds /feed.xml (Atom 1.0) from log.html at deploy time. Zero dependencies.
//
// Authoring contract (enforced — the build FAILS if log.html breaks it):
//   each entry is  <article class="entry" id="YYYY-MM-DD-slug"> … </article>
//   containing exactly one <time datetime="YYYY-MM-DD"> and one <h2>.
// Entry ids are permalinks AND feed GUIDs — never change one after it ships.

import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://mochion.xyz';
const PAGE = `${SITE}/log`;   // Pages serves pretty URLs (/log.html 308s here)

const html = readFileSync(new URL('../log.html', import.meta.url), 'utf8');

const entryRe = /<article class="entry" id="([^"]+)">([\s\S]*?)<\/article>/g;
const entries = [];
let m;
while ((m = entryRe.exec(html)) !== null) {
  const [, id, body] = m;
  const date = body.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/)?.[1];
  const title = body.match(/<h2>([\s\S]*?)<\/h2>/)?.[1]?.trim();
  if (!date || !title) {
    console.error(`feed: entry "${id}" is missing its <time datetime> or <h2> — fix log.html`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id)) {
    console.error(`feed: entry id "${id}" violates the YYYY-MM-DD-slug contract — fix log.html`);
    process.exit(1);
  }
  // entry content: strip the h2/time (they're headline metadata), absolutize relative URLs
  const content = body
    .replace(/<time[\s\S]*?<\/time>/, '')
    .replace(/<h2>[\s\S]*?<\/h2>/, '')
    .replace(/(href|src)="(?!https?:|#|mailto:)\/?/g, `$1="${SITE}/`)
    .trim();
  entries.push({ id, date, title, content });
}

if (entries.length === 0) {
  console.error('feed: zero entries parsed from log.html — the authoring contract broke');
  process.exit(1);
}

entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const iso = (d) => `${d}T00:00:00Z`;

const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Mochion build log</title>
  <subtitle>What broke, what got fixed, and why — dispatches from the workshop.</subtitle>
  <link href="${SITE}/feed.xml" rel="self"/>
  <link href="${PAGE}"/>
  <id>${PAGE}</id>
  <updated>${iso(entries[0].date)}</updated>
  <author><name>Mochion</name><uri>${SITE}/</uri></author>
${entries.map((e) => `  <entry>
    <title>${esc(e.title)}</title>
    <link href="${PAGE}#${e.id}"/>
    <id>${PAGE}#${e.id}</id>
    <published>${iso(e.date)}</published>
    <updated>${iso(e.date)}</updated>
    <content type="html">${esc(e.content)}</content>
  </entry>`).join('\n')}
</feed>
`;

writeFileSync(new URL('../feed.xml', import.meta.url), xml);
console.error(`feed: wrote feed.xml with ${entries.length} entries (latest ${entries[0].date})`);

// ---- regenerate the Blog/BlogPosting JSON-LD in log.html from the same entries ----
// Publishing a log entry now derives the feed AND the structured data — no hand edits.
const jsonld = {
  '@context': 'https://schema.org', '@type': 'Blog', name: 'Mochion build log', url: PAGE,
  author: { '@type': 'Organization', name: 'Mochion', url: `${SITE}/` },
  blogPost: entries.map((e) => ({ '@type': 'BlogPosting', headline: e.title, datePublished: e.date, url: `${PAGE}#${e.id}` })),
};
const block = '<script type="application/ld+json">\n  ' + JSON.stringify(jsonld, null, 2).replace(/\n/g, '\n  ') + '\n  </script>';
const marker = /<!-- JSONLD:START -->[\s\S]*?<!-- JSONLD:END -->/;
if (marker.test(html)) {
  writeFileSync(new URL('../log.html', import.meta.url), html.replace(marker, `<!-- JSONLD:START -->\n  ${block}\n  <!-- JSONLD:END -->`));
  console.error('feed: regenerated log.html JSON-LD from entries');
} else {
  console.error('feed: WARNING — no JSONLD:START/END markers in log.html; skipped JSON-LD regen');
}
