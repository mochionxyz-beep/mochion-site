#!/usr/bin/env node
// Metrics autopilot — appends one JSON line/week to data/metrics.jsonl so the
// monthly review has real deltas, not vibes. Collects GitHub (stars/watchers/
// forks/traffic), X (followers + per-stamp engagement → caption learning), the
// record snapshot, and Search Console (via ci/gsc.mjs when the key is present).
// Every field is already public. Writes the row; the workflow commits it.
// Zero deps. DRY_RUN=true prints the row instead of appending.

import { appendFileSync, readFileSync } from 'node:fs';
import { creds, whoAmI, myRecentTweets, selfReplyCounts, isReply, outcome } from './x-lib.mjs';
import { searchConsole } from './gsc.mjs';
import { notify } from './notify.mjs';

const REPO = process.env.GITHUB_REPOSITORY || 'mochionxyz-beep/mochion-site';
const GH = process.env.GITHUB_TOKEN;
const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const ghHeaders = GH ? { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json' } : { Accept: 'application/vnd.github+json' };
const ghJSON = async (path) => { const r = await fetch(`https://api.github.com${path}`, { headers: ghHeaders }); return r.ok ? r.json() : null; };

const row = { ts: new Date().toISOString().slice(0, 10) };

// ---- GitHub ----------------------------------------------------------------
try {
  const repo = await ghJSON(`/repos/${REPO}`);
  if (repo) row.gh = { stars: repo.stargazers_count, watchers: repo.subscribers_count, forks: repo.forks_count };
  const views = await ghJSON(`/repos/${REPO}/traffic/views`);      // needs push token
  const clones = await ghJSON(`/repos/${REPO}/traffic/clones`);
  if (views) row.gh_traffic = { views_14d: views.count, uniques_14d: views.uniques };
  if (clones) row.gh_clones = { clones_14d: clones.count, uniques_14d: clones.uniques };
} catch (e) { console.error('metrics: github ' + e.message); }

// ---- X: followers + last week's stamp performance (caption learning) -------
try {
  const c = creds();
  const me = await whoAmI(c);
  row.x = { followers: me.public_metrics?.followers_count, following: me.public_metrics?.following_count, tweets: me.public_metrics?.tweet_count };
  const recent = await myRecentTweets(c, me.id, 100);   // includes the account's own replies
  const selfReplies = selfReplyCounts(recent);          // parentId → # of our own replies to it
  // pair each stamp ("day N. …", not itself a reply) with its metrics + outcome pool.
  // replies = reply_count MINUS our own self-reply (the link reply isn't engagement).
  const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));
  const curve = d.equity_curve || [];
  const outByDay = {};                                  // day-number → outcome, for classifying past posts.
  // align the LAST curve entry to days_live and walk back, so the key matches the tweet's "day N"
  // even when days_live != curve.length (--since re-index, or a missing day).
  const base = (d.days_live ?? curve.length) - curve.length + 1;
  curve.forEach((p, i) => { const prev = i ? (curve[i - 1].close ?? curve[i - 1].value) : 100; outByDay[base + i] = outcome((p.close ?? p.value) - prev); });
  row.stamps = recent.map((t) => {
    const m = /^day (\d+)\./.exec(t.text || '');
    if (!m || isReply(t)) return null;                  // must be an original stamp, not a reply
    const day = +m[1], pm = t.public_metrics || {};
    const replies = Math.max(0, (pm.reply_count || 0) - (selfReplies[t.id] || 0));
    return { day, pool: outByDay[day] || '?', impr: pm.impression_count ?? null, likes: pm.like_count, replies, rt: pm.retweet_count };
  }).filter(Boolean);
} catch (e) { console.error('metrics: x ' + e.message); }

// ---- the record snapshot (audience-vs-age correlation later) ---------------
try {
  const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));
  if (d && d.status !== 'no_data') row.tape = { days: d.days_live, cum_return_pct: d.summary?.cumulative_return_pct, max_dd_pct: d.summary?.max_drawdown_pct };
} catch (e) { console.error('metrics: tape ' + e.message); }

// ---- Search Console (optional) ---------------------------------------------
const gsc = await searchConsole();
if (gsc) row.gsc = gsc;

// ---- Telegram digest (silent) — the week at a glance, incl. best/worst caption ----
try {
  const topQ = (row.gsc?.topQueries || [])[0];
  const best = (row.stamps || []).filter((s) => s.impr != null).sort((a, b) => b.impr - a.impr)[0];
  const digest = `📊 <b>weekly metrics · ${row.ts}</b>\n` +
    `X: ${row.x?.followers ?? '—'} followers · ⭐${row.gh?.stars ?? '—'} · 👁${row.gh?.watchers ?? '—'}\n` +
    `search: ${row.gsc?.totals?.impressions ?? '—'} impr` + (topQ ? ` · top "${topQ.q}"` : '') + `\n` +
    `tape: day ${row.tape?.days ?? '—'}` + (best ? `\nbest post: day ${best.day} (${best.impr} impr, ${best.likes}♥, ${best.replies}💬)` : '');
  await notify(digest, { loud: false });
} catch (e) { console.error('metrics: notify ' + e.message); }

// ---- write -----------------------------------------------------------------
const line = JSON.stringify(row);
if (DRY) { console.error('metrics: DRY RUN — row:\n' + line); process.exit(0); }
appendFileSync(new URL('../data/metrics.jsonl', import.meta.url), line + '\n');
console.error('metrics: appended row for ' + row.ts);

// step summary: this week at a glance
const sum = process.env.GITHUB_STEP_SUMMARY;
if (sum) {
  appendFileSync(sum, `### Metrics — ${row.ts}\n\n` +
    `- GitHub: ⭐ ${row.gh?.stars ?? '—'} · 👁 ${row.gh?.watchers ?? '—'} · views(14d) ${row.gh_traffic?.views_14d ?? '—'} (${row.gh_traffic?.uniques_14d ?? '—'} uniq)\n` +
    `- X: ${row.x?.followers ?? '—'} followers · ${row.stamps?.length ?? 0} stamps tracked\n` +
    `- Tape: day ${row.tape?.days ?? '—'}\n` +
    (row.gsc && !row.gsc.error ? `- Search: ${row.gsc.totals.clicks} clicks / ${row.gsc.totals.impressions} impressions (28d)\n` : `- Search: ${row.gsc?.error ? 'error' : 'not configured'}\n`));
}
