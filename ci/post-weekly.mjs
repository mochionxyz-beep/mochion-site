#!/usr/bin/env node
// Weekly dispatch — a Sunday recap of the week on the tape. Counts only, never a %.
// Reuses ci/x-lib.mjs. Attaches the current card; link in the self-reply.
// Guards: skip no_data; skip if data stale >48h; skip if <7 days of record.
// DRY_RUN=true logs only.

import { readFileSync } from 'node:fs';
import { creds, uploadCard, postTweet, tally, LINK_REPLY } from './x-lib.mjs';
import { notify } from './notify.mjs';

const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const c = DRY ? null : creds();

const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));
if (!d || d.status === 'no_data' || !d.equity_curve?.length) { console.error('weekly: no_data — skip'); process.exit(0); }
const ageH = (Date.now() - new Date(d.generated_at).getTime()) / 36e5;
if (!(ageH >= 0 && ageH < 48)) { console.error(`weekly: data ${ageH.toFixed(1)}h old — skip`); process.exit(0); }
const full = d.equity_curve;
if (full.length < 7) { console.error('weekly: <7 days — skip'); process.exit(0); }

const week = full.slice(-7);
const prev = full[full.length - 8] ? (full[full.length - 8].close ?? full[full.length - 8].value) : 100;
const t = tally(week, prev);
const dayEnd = d.days_live, dayStart = dayEnd - week.length + 1;

// counts-only body, in the house voice
const parts = [];
if (t.green) parts.push(`${t.green} green`);
if (t.red) parts.push(`${t.red} red`);
if (t.flat) parts.push(`${t.flat} flat`);
const CLOSERS = [
  'every one of them public.', 'wins and losses, all on the tape.',
  'the machine kept its hours.', 'no days skipped, no days hidden.',
  "another week the glass stayed clean.", 'printed, stamped, filed.',
  "the tape doesn't take weekends off.", 'seven more honest days on the pile.',
];
// week-of-year keyed rotation (stable, no back-to-back repeat)
const woy = Math.floor((new Date(d.as_of + 'T00:00:00Z') - new Date(Date.UTC(new Date(d.as_of).getUTCFullYear(), 0, 1))) / 6048e5);
const closer = CLOSERS[woy % CLOSERS.length];
const text = `a week at the workshop: 7 days printed. ${parts.join(', ')}. day ${dayStart} → day ${dayEnd}.\n\n${closer}`;

console.error('weekly: text =\n' + text);
if (DRY) { console.error('weekly: DRY RUN — not posting'); process.exit(0); }

const card = await uploadCard(c, new URL('../og/tape.png', import.meta.url).pathname);
const tweet = await postTweet(c, text, { mediaId: card.id });
console.error(`weekly: posted https://x.com/mochionhq/status/${tweet.id}`);
await notify(`📮 <b>weekly dispatch posted</b>\n${text.split('\n')[0]}\nhttps://x.com/mochionhq/status/${tweet.id}`);
await postTweet(c, LINK_REPLY, { replyTo: tweet.id });
console.error('weekly: link reply posted. dispatch filed.');
