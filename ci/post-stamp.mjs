#!/usr/bin/env node
// Daily stamp: posts og/tape.png to @mochionhq when the day's record lands.
// Zero dependencies. OAuth 1.0a user context (HMAC-SHA1), v1.1 media upload,
// v2 tweet + self-reply with the link (links in the body are throttled; reply isn't).
//
// Voice rules enforced in code: day-count leads; the return % lives in the CARD,
// never in the text. Red days get owned, not hidden.
//
// Guards: skips on no_data; skips if the export is stale (>12h old) so odd
// re-pushes can't post yesterday's stamp twice. DRY_RUN=true logs instead of posting.

import { readFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';

const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
  console.error('stamp: missing X credentials in env'); process.exit(1);
}

const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));

// ---- guards ----------------------------------------------------------------
if (!d || d.status === 'no_data' || !d.equity_curve?.length) {
  console.error('stamp: no_data — nothing to post'); process.exit(0);
}
const FORCE = (process.env.FORCE || 'false').toLowerCase() === 'true';   // manual re-stamp override
const ageH = (Date.now() - new Date(d.generated_at).getTime()) / 36e5;
if (!FORCE && !(ageH >= 0 && ageH < 12)) {
  console.error(`stamp: export is ${ageH.toFixed(1)}h old — not a fresh day, skipping`); process.exit(0);
}

// ---- pick the line ----------------------------------------------------------
const day = d.days_live;
const c = d.equity_curve;
const delta = c.length > 1 ? (c.at(-1).close ?? c.at(-1).value) - (c.at(-2).close ?? c.at(-2).value) : 0;

const MILESTONES = {
  50: 'fifty honest days in a row. the machine is running.',
  100: 'day 100. still running. still printing. still public.',
  200: 'day 200. the machine hums on.',
  365: 'one year. every single day, printed in public.',
};
// pools rotate keyed to the day number — no back-to-back repeats, ~2 weeks between
// reuses. voice rules: sober, lowercase, never a return figure, red days owned.
const GREEN = [
  'the machine is running.',
  'printed, stamped, public.',
  'wins and losses, in the open.',
  'nothing to hide, nowhere to hide it.',
  'another day on the tape.',
  'the lights stayed on all night.',
  'same machine, same rules, same tape.',
  'it did its job. it wrote it down.',
  'the glass stays clean. look all you want.',
  'one more honest day in the ledger.',
  'quiet hum, steady hands.',
  "the tape doesn't skip days.",
];
const FLAT = [
  'boring day. boring is fine. boring compounds.',
  "nothing happened. that's a feature.",
  "flat. the machine doesn't force it.",
  "no trade worth taking. so it didn't.",
  'a quiet day at the workshop.',
  'the machine sat on its hands today. on purpose.',
  'sideways. patience is a position too.',
  'nothing to report — reported anyway.',
  'some days the tape just hums.',
  'flat day. discipline looks like this.',
];
const RED = [
  "a red one. printed anyway — that's the whole point.",
  'red today. still printed. still public.',
  'the machine took a hit. it wrote that down too.',
  "losses go on the tape. that's the deal.",
  'a rough day, printed in the same ink as the good ones.',
  'red. no excuses, just the record.',
  "down today. the tape doesn't blink.",
  "it lost. it logged it. it's still running.",
  'red days are why the tape exists.',
  'took one on the chin. printed it anyway.',
];

let text;
if (MILESTONES[day]) text = MILESTONES[day];
else if (delta < -0.05) text = `day ${day}. ${RED[day % RED.length]}`;
else if (delta <= 0.05) text = `day ${day}. ${FLAT[day % FLAT.length]}`;
else text = `day ${day}. ${GREEN[day % GREEN.length]}`;

const REPLY = 'the tape → https://mochion.xyz';

// ---- oauth 1.0a -------------------------------------------------------------
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
function authHeader(method, url, extraParams = {}) {
  const p = {
    oauth_consumer_key: X_API_KEY, oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN, oauth_version: '1.0',
  };
  const all = { ...p, ...extraParams };
  const paramStr = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join('&');
  const base = [method, pct(url), pct(paramStr)].join('&');
  const key = `${pct(X_API_SECRET)}&${pct(X_ACCESS_SECRET)}`;
  p.oauth_signature = createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(p).sort().map((k) => `${pct(k)}="${pct(p[k])}"`).join(', ');
}

async function call(method, url, { form, json, multipart } = {}) {
  let body, contentType, sigParams = {};
  if (form) { body = new URLSearchParams(form).toString(); contentType = 'application/x-www-form-urlencoded'; sigParams = form; }
  if (json) { body = JSON.stringify(json); contentType = 'application/json'; }
  if (multipart) {
    const b = '----mochion' + randomBytes(8).toString('hex');
    body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="media"; filename="tape.png"\r\nContent-Type: image/png\r\n\r\n`),
      multipart, Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    contentType = `multipart/form-data; boundary=${b}`;   // multipart params are excluded from the signature
  }
  const res = await fetch(url, {
    method, body,
    headers: { Authorization: authHeader(method, url, sigParams), 'Content-Type': contentType },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// ---- post -------------------------------------------------------------------
const png = readFileSync(new URL('../og/tape.png', import.meta.url));
console.error(`stamp: day ${day} · as_of ${d.as_of} · card ${(png.length / 1024).toFixed(0)}KB`);
console.error(`stamp: text = "${text}"`);

if (DRY) { console.error('stamp: DRY RUN — not posting'); process.exit(0); }

const media = await call('POST', 'https://upload.twitter.com/1.1/media/upload.json', { multipart: png });
const tweet = await call('POST', 'https://api.twitter.com/2/tweets',
  { json: { text, media: { media_ids: [media.media_id_string] } } });
console.error(`stamp: posted https://x.com/mochionhq/status/${tweet.data.id}`);
// URL tweets cost 13x under X's pay-per-use pricing — the link reply is manual
// (owner adds it in the first hour, which doubles as human engagement time).
// Set POST_REPLY=true to automate it anyway.
if ((process.env.POST_REPLY || 'false').toLowerCase() === 'true') {
  await call('POST', 'https://api.twitter.com/2/tweets',
    { json: { text: REPLY, reply: { in_reply_to_tweet_id: tweet.data.id } } });
  console.error('stamp: link reply posted.');
}
console.error('stamp: done. the machine speaks.');
