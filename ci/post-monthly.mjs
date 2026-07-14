#!/usr/bin/env node
// Monthly retro — the previous calendar month, counts only, never a %.
// Reuses ci/x-lib.mjs. Card + link reply. Runs on the 1st; looks back one month.
// Guards: skip no_data / stale >48h / no complete previous month in range.
// DRY_RUN=true logs only.

import { readFileSync } from 'node:fs';
import { creds, uploadCard, postTweet, tally, LINK_REPLY } from './x-lib.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const c = DRY ? null : creds();

const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));
if (!d || d.status === 'no_data' || !d.equity_curve?.length) { console.error('monthly: no_data — skip'); process.exit(0); }
const ageH = (Date.now() - new Date(d.generated_at).getTime()) / 36e5;
if (!(ageH >= 0 && ageH < 48)) { console.error(`monthly: data ${ageH.toFixed(1)}h old — skip`); process.exit(0); }

// previous month relative to the record's last day (timezone-proof)
const asOf = new Date(d.as_of + 'T00:00:00Z');
const y = asOf.getUTCFullYear(), m = asOf.getUTCMonth();       // 0-based
const pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y;
const key = `${py}-${String(pm + 1).padStart(2, '0')}`;
const full = d.equity_curve;
const idxs = full.map((p, i) => (String(p.date).slice(0, 7) === key ? i : -1)).filter((i) => i >= 0);
if (idxs.length < 20) { console.error(`monthly: only ${idxs.length} days in ${key} — not a full month, skip`); process.exit(0); }

const first = idxs[0];
const prev = first > 0 ? (full[first - 1].close ?? full[first - 1].value) : 100;
const t = tally(idxs.map((i) => full[i]), prev);
const parts = [];
if (t.green) parts.push(`${t.green} green`);
if (t.red) parts.push(`${t.red} red`);
if (t.flat) parts.push(`${t.flat} flat`);

const text = `${MONTHS[pm]}, printed and filed. ${idxs.length} days on the tape — ${parts.join(', ')}. every single one public.\n\nnot advice. not a fund. just the record.`;

console.error('monthly: text =\n' + text);
if (DRY) { console.error('monthly: DRY RUN — not posting'); process.exit(0); }

const card = await uploadCard(c, new URL('../og/tape.png', import.meta.url).pathname);
const tweet = await postTweet(c, text, { mediaId: card.id });
console.error(`monthly: posted https://x.com/mochionhq/status/${tweet.id}`);
await postTweet(c, LINK_REPLY, { replyTo: tweet.id });
console.error('monthly: link reply posted. month filed.');
