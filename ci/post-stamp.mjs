#!/usr/bin/env node
// Daily stamp: posts og/tape.png to @mochionhq when the day's record lands.
// Zero deps; all X plumbing + the Mochion voice live in ci/x-lib.mjs.
// Voice rule enforced there: day-count leads, the % lives in the CARD, never the text.
// Guards: skip no_data; skip if the export is stale (>12h) so a re-push can't double-post.
// DRY_RUN=true logs only. FORCE=true bypasses the freshness guard (manual re-stamp).
// POST_REPLY=true also posts the link reply (URL tweets cost 13x — off by default).

import { readFileSync } from 'node:fs';
import { creds, uploadCard, postTweet, dailyCaption, LINK_REPLY } from './x-lib.mjs';
import { notify } from './notify.mjs';

const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const FORCE = (process.env.FORCE || 'false').toLowerCase() === 'true';
const c = DRY ? null : creds();

const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));
if (!d || d.status === 'no_data' || !d.equity_curve?.length) {
  console.error('stamp: no_data — nothing to post'); process.exit(0);
}
const ageH = (Date.now() - new Date(d.generated_at).getTime()) / 36e5;
if (!FORCE && !(ageH >= 0 && ageH < 12)) {
  console.error(`stamp: export is ${ageH.toFixed(1)}h old — not a fresh day, skipping`); process.exit(0);
}

const day = d.days_live;
const cv = d.equity_curve;
const delta = cv.length > 1 ? ((cv.at(-1).close ?? cv.at(-1).value) - (cv.at(-2).close ?? cv.at(-2).value)) : 0;
const cap = dailyCaption(day, delta);

console.error(`stamp: day ${day} · as_of ${d.as_of} · [${cap.pool}#${cap.idx}]`);
console.error(`stamp: text = "${cap.text}"`);
if (DRY) { console.error('stamp: DRY RUN — not posting'); process.exit(0); }

const card = await uploadCard(c, new URL('../og/tape.png', import.meta.url));
const tweet = await postTweet(c, cap.text, { mediaId: card.id });
const url = `https://x.com/mochionhq/status/${tweet.id}`;
console.error(`stamp: posted ${url}  (card ${(card.bytes / 1024).toFixed(0)}KB)`);
await notify(`📮 <b>stamp posted</b> · day ${day} · ${cap.pool}\n${cap.text}\n${url}`);

if ((process.env.POST_REPLY || 'false').toLowerCase() === 'true') {
  await postTweet(c, LINK_REPLY, { replyTo: tweet.id });
  console.error('stamp: link reply posted.');
  await notify(`💬 <b>link reply</b> under day ${day}`, { loud: false });
}
console.error('stamp: done. the machine speaks.');
