#!/usr/bin/env node
// Announce — when a new build-log entry ships, post it to X automatically.
// Text-only post (no card): "new dispatch from the workshop: <title>", link in
// self-reply. Idempotent: reads the account's recent posts and skips if this
// title was already announced (so re-deploys / data pushes never double-post).
// Reuses ci/x-lib.mjs. DRY_RUN=true logs only.

import { readFileSync } from 'node:fs';
import { creds, whoAmI, myRecentTweets, postTweet, LINK_REPLY } from './x-lib.mjs';

const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';

// newest entry = same contract as build-feed
const html = readFileSync(new URL('../log.html', import.meta.url), 'utf8');
const entries = [];
const re = /<article class="entry" id="([^"]+)">([\s\S]*?)<\/article>/g;
let m; while ((m = re.exec(html)) !== null) {
  const date = m[2].match(/<time datetime="(\d{4}-\d{2}-\d{2})"/)?.[1];
  const title = m[2].match(/<h2>([\s\S]*?)<\/h2>/)?.[1]?.trim();
  if (date && title) entries.push({ id: m[1], date, title });
}
if (!entries.length) { console.error('announce: no entries — skip'); process.exit(0); }
entries.sort((a, b) => (a.date < b.date ? 1 : -1));
const latest = entries[0];
const url = `https://mochion.xyz/log#${latest.id}`;
const text = `new dispatch from the workshop:\n\n"${latest.title}"`;

console.error(`announce: latest = "${latest.title}" (${latest.id})`);
if (DRY) { console.error('announce: DRY RUN — would post:\n' + text + '\n' + url); process.exit(0); }

const c = creds();
const me = await whoAmI(c);
const recent = await myRecentTweets(c, me.id, 30);
if (recent.some((t) => (t.text || '').includes(latest.title))) {
  console.error('announce: already posted this dispatch — skip'); process.exit(0);
}
const tweet = await postTweet(c, text);
console.error(`announce: posted https://x.com/mochionhq/status/${tweet.id}`);
await postTweet(c, `read it → ${url}`, { replyTo: tweet.id });
console.error('announce: link reply posted.');
