#!/usr/bin/env node
// A3 — smart link reply. The daily stamp ships link-LESS (a URL post costs ~13x
// on X's pay-per-use). This drops the tape link UNDER a post only once it has
// EARNED an audience — so the ~$0.20 lands exactly where people showed up, never
// on a post nobody saw. Engagement-triggered spend, not a firehose.
//
// Safe by construction: originals only (never a reply/thread-tail), idempotent
// (never double-links a post we already linked or that carries the link itself),
// recency-bounded (won't resurrect an ancient post that slowly accrues likes),
// and capped per run. Thresholds are env-tunable so the monthly review can move
// them without a code change. DRY_RUN=true logs the picks without posting.
import { fileURLToPath } from 'node:url';
import { creds, whoAmI, myRecentTweets, isReply, postTweet, LINK_REPLY } from './x-lib.mjs';
import { notify } from './notify.mjs';

const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const num = (v, d) => (Number.isFinite(+v) && v !== '' && v != null ? +v : d);
const OPTS = {
  likesMin: num(process.env.LIKES_MIN, 25),
  repliesMin: num(process.env.REPLIES_MIN, 8),
  imprMin: num(process.env.IMPR_MIN, 5000),
  recentDays: num(process.env.RECENT_DAYS, 14),
  max: num(process.env.MAX_REPLIES, 2),
};

// PURE: given our recent timeline, which originals deserve a link-reply right now?
// Exported for tests — no network, deterministic via opts.now.
export function pickToLink(tweets, opts = {}) {
  const { likesMin = 25, repliesMin = 8, imprMin = 5000, recentDays = 14, max = 2, now = Date.now() } = opts;
  const HAS_LINK = /mochion\.xyz/i;

  // parents we've ALREADY linked: any of our replies to them that carries the link.
  const linked = new Set();
  for (const t of tweets) {
    if (!isReply(t)) continue;
    const rep = (t.referenced_tweets || []).find((r) => r.type === 'replied_to');
    if (rep && HAS_LINK.test(t.text || '')) linked.add(rep.id);
  }

  const crossed = (pm = {}) => (pm.like_count || 0) >= likesMin || (pm.reply_count || 0) >= repliesMin || (pm.impression_count || 0) >= imprMin;
  const cands = tweets.filter((t) => {
    if (isReply(t)) return false;                    // originals only — never a thread-tail or our own reply
    if (HAS_LINK.test(t.text || '')) return false;   // it already carries the link in its own text
    if (linked.has(t.id)) return false;              // we already dropped a link under it
    const ageD = (now - new Date(t.created_at).getTime()) / 864e5;
    if (!(ageD >= 0 && ageD <= recentDays)) return false;   // recent only (skip unparseable/future/old)
    return crossed(t.public_metrics);
  });
  // spend the cap on the biggest reach first
  cands.sort((a, b) => (b.public_metrics?.impression_count || 0) - (a.public_metrics?.impression_count || 0));
  return cands.slice(0, max);
}

function why(pm = {}, o) {
  if ((pm.like_count || 0) >= o.likesMin) return `${pm.like_count}♥`;
  if ((pm.reply_count || 0) >= o.repliesMin) return `${pm.reply_count} replies`;
  return `${pm.impression_count} impressions`;
}

async function main() {
  const c = creds();
  const me = await whoAmI(c);
  const recent = await myRecentTweets(c, me.id, 100);   // includes our replies (for the idempotency check)
  const picks = pickToLink(recent, OPTS);
  if (!picks.length) { console.error('smart-reply: nothing crossed the bar — no link today'); return; }
  for (const t of picks) {
    const w = why(t.public_metrics, OPTS);
    if (DRY) { console.error(`smart-reply: WOULD link ${t.id} (${w}) — "${(t.text || '').slice(0, 48)}"`); continue; }
    await postTweet(c, LINK_REPLY, { replyTo: t.id });
    console.error(`smart-reply: linked ${t.id} (${w})`);
    await notify(`💬 <b>smart link-reply</b> — a post crossed (${w})\ndropped the tape link → https://x.com/mochionhq/status/${t.id}`);
  }
}

// run as a script, but stay importable for tests (space-safe path compare — the
// repo path has a space, so a raw `file://${argv[1]}` comparison would misfire).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('smart-reply: ' + e.message); process.exit(1); });
}
