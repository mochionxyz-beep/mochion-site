// Shared X (Twitter) client + Mochion voice helpers for all CI posters.
// Zero dependencies. OAuth 1.0a user context (HMAC-SHA1), v1.1 media upload,
// v2 tweet/reply, v2 read. retry(2, backoff) on 5xx/network so a transient
// blip never costs a day. Used by post-stamp / post-weekly / post-monthly /
// announce. Voice rules live here so every surface agrees.

import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---- credentials -----------------------------------------------------------
export function creds(env = process.env) {
  const c = {
    key: env.X_API_KEY, secret: env.X_API_SECRET,
    token: env.X_ACCESS_TOKEN, tokenSecret: env.X_ACCESS_SECRET,
  };
  if (!c.key || !c.secret || !c.token || !c.tokenSecret) {
    throw new Error('missing X credentials in env (X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET)');
  }
  return c;
}

// ---- OAuth 1.0a signing ----------------------------------------------------
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
function authHeader(c, method, url, extraParams = {}) {
  const p = {
    oauth_consumer_key: c.key, oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: c.token, oauth_version: '1.0',
  };
  const all = { ...p, ...extraParams };
  const paramStr = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join('&');
  const base = [method, pct(url), pct(paramStr)].join('&');
  const key = `${pct(c.secret)}&${pct(c.tokenSecret)}`;
  p.oauth_signature = createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(p).sort().map((k) => `${pct(k)}="${pct(p[k])}"`).join(', ');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- one HTTP call, with retry on 5xx / network --------------------------
async function call(c, method, url, { form, json, multipart, query } = {}, tries = 3) {
  let body, contentType, sigParams = {};
  var target = url;
  if (query) { var qs = new URLSearchParams(query).toString(); target = url + '?' + qs; sigParams = { ...sigParams, ...query }; }
  if (form) { body = new URLSearchParams(form).toString(); contentType = 'application/x-www-form-urlencoded'; sigParams = { ...sigParams, ...form }; }
  if (json) { body = JSON.stringify(json); contentType = 'application/json'; }
  if (multipart) {
    const b = '----mochion' + randomBytes(8).toString('hex');
    body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="media"; filename="tape.png"\r\nContent-Type: image/png\r\n\r\n`),
      multipart, Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    contentType = `multipart/form-data; boundary=${b}`;   // multipart params are excluded from the signature
  }
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(target, {
        method, body,
        headers: Object.assign({ Authorization: authHeader(c, method, url, sigParams) }, contentType ? { 'Content-Type': contentType } : {}),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok) return out;
      // retry only transient server/network conditions — never a 4xx (auth, credits, duplicate)
      if (res.status >= 500 || res.status === 429) { lastErr = new Error(`${res.status} ${JSON.stringify(out).slice(0, 200)}`); }
      else throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
    } catch (e) { lastErr = e; }
    if (attempt < tries) { console.error(`x-lib: attempt ${attempt} failed (${lastErr.message}); retrying…`); await sleep(1500 * attempt); }
  }
  throw new Error(`${method} ${url} failed after ${tries} tries: ${lastErr && lastErr.message}`);
}

// ---- high-level actions ----------------------------------------------------
export async function uploadCard(c, pngPath) {
  const png = readFileSync(pngPath);
  const media = await call(c, 'POST', 'https://upload.twitter.com/1.1/media/upload.json', { multipart: png });
  return { id: media.media_id_string, bytes: png.length };
}
export async function postTweet(c, text, { mediaId, replyTo } = {}) {
  const json = { text };
  if (mediaId) json.media = { media_ids: [mediaId] };
  if (replyTo) json.reply = { in_reply_to_tweet_id: replyTo };
  const out = await call(c, 'POST', 'https://api.twitter.com/2/tweets', { json });
  return out.data;   // { id, text }
}
export async function whoAmI(c) {
  const out = await call(c, 'GET', 'https://api.twitter.com/2/users/me', { query: { 'user.fields': 'public_metrics' } });
  return out.data;   // { id, username, public_metrics:{followers_count,...} }
}
// recent posts by the authed user, with per-post metrics (for A3 + caption learning).
// Includes the account's OWN replies (referenced_tweets) so callers can subtract
// self-replies from a parent's reply_count — the link reply must not count as engagement.
export async function myRecentTweets(c, userId, max = 100) {
  const out = await call(c, 'GET', `https://api.twitter.com/2/users/${userId}/tweets`, {
    query: { max_results: String(Math.min(100, Math.max(5, max))), 'tweet.fields': 'public_metrics,created_at,text,referenced_tweets', exclude: 'retweets' },
  });
  return out.data || [];
}
// how many of `parentId`'s replies came from THIS account (self-replies to exclude)
export function selfReplyCounts(tweets) {
  const byParent = {};
  for (const t of tweets) {
    const rep = (t.referenced_tweets || []).find((r) => r.type === 'replied_to');
    if (rep) byParent[rep.id] = (byParent[rep.id] || 0) + 1;
  }
  return byParent;
}
export const isReply = (t) => (t.referenced_tweets || []).some((r) => r.type === 'replied_to');

// ---- the ONE day-outcome rule (shared with ci/og-tape.mjs + the panel) ----
export const FLAT_EPS = 0.05;
export function outcome(delta) { return delta > FLAT_EPS ? 'green' : delta < -FLAT_EPS ? 'red' : 'flat'; }
export function dayDeltas(curve, prevClose = 100) {
  return curve.map((p, i) => {
    const prev = i ? (curve[i - 1].close ?? curve[i - 1].value) : prevClose;
    return (p.close ?? p.value) - prev;
  });
}
export function tally(curve, prevClose = 100) {
  const t = { green: 0, red: 0, flat: 0 };
  dayDeltas(curve, prevClose).forEach((d) => { t[outcome(d)]++; });
  return t;
}

// ---- daily caption pools (day-number keyed; never a % in the text) --------
export const MILESTONES = {
  50: 'fifty honest days in a row. the machine is running.',
  100: 'day 100. still running. still printing. still public.',
  200: 'day 200. the machine hums on.',
  365: 'one year. every single day, printed in public.',
};
export const GREEN = ['the machine is running.', 'printed, stamped, public.', 'wins and losses, in the open.', 'nothing to hide, nowhere to hide it.', 'another day on the tape.', 'the lights stayed on all night.', 'same machine, same rules, same tape.', 'it did its job. it wrote it down.', 'the glass stays clean. look all you want.', 'one more honest day in the ledger.', 'quiet hum, steady hands.', "the tape doesn't skip days."];
export const FLAT = ['boring day. boring is fine. boring compounds.', "nothing happened. that's a feature.", "flat. the machine doesn't force it.", "no trade worth taking. so it didn't.", 'a quiet day at the workshop.', 'the machine sat on its hands today. on purpose.', 'sideways. patience is a position too.', 'nothing to report — reported anyway.', 'some days the tape just hums.', 'flat day. discipline looks like this.'];
export const RED = ["a red one. printed anyway — that's the whole point.", 'red today. still printed. still public.', 'the machine took a hit. it wrote that down too.', "losses go on the tape. that's the deal.", 'a rough day, printed in the same ink as the good ones.', 'red. no excuses, just the record.', "down today. the tape doesn't blink.", "it lost. it logged it. it's still running.", 'red days are why the tape exists.', 'took one on the chin. printed it anyway.'];

export function dailyCaption(day, delta) {
  if (MILESTONES[day]) return { text: MILESTONES[day], pool: 'milestone', idx: 0 };
  var o = outcome(delta), pool = o === 'red' ? RED : o === 'flat' ? FLAT : GREEN;
  var idx = day % pool.length;
  return { text: `day ${day}. ${pool[idx]}`, pool: o, idx: idx };
}

export const LINK_REPLY = 'the tape → https://mochion.xyz';
