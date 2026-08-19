#!/usr/bin/env node
// Approval window — the second half of the "draft → human approves → posts"
// pipeline (see ci/draft-posts.mjs). Reads the candidates.json artifact the
// workflow has already downloaded, polls Telegram for a reply of "1"/"2"/"3"
// or "skip" sent AFTER the draft went out, and posts the chosen candidate
// as-is (it already passed guard.mjs before it ever reached Telegram; this
// script re-checks it anyway — see below). No reply, a stale draft, or an
// explicit "skip" all resolve to: post nothing, exit 0, no Telegram noise —
// skipping a day must be the effortless default, same posture as every other
// poster in this repo (post-stamp/weekly/monthly all skip silently on their
// own guards).
//
// Deliberately does NOT self-reply with the site link. ci/smart-reply.mjs's
// existing daily cron already does that for ANY of the account's own
// original posts once they cross an engagement bar — these posts are
// indistinguishable from any other original tweet to that script. Posting a
// link immediately regardless of engagement would just re-pay the ~13x
// URL-tweet cost smart-reply.mjs exists specifically to avoid.
//
// DRY_RUN=true resolves the pick and logs it, but never calls postTweet —
// same convention as post-stamp.mjs / announce.mjs.

import { readFileSync } from 'node:fs';
import { creds, whoAmI, myRecentTweets, isReply, postTweet } from './x-lib.mjs';
import { pollReply, notify } from './notify.mjs';
import { check } from './guard.mjs';

const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const MAX_AGE_H = Number(process.env.MAX_DRAFT_AGE_H || 20);

let draft;
try {
  draft = JSON.parse(readFileSync(new URL('.draft-output/candidates.json', import.meta.url), 'utf8'));
} catch {
  console.error('approve-post: no candidates.json found (no draft today, or it was a quiet day) — nothing to approve');
  process.exit(0);
}

const draftedAt = new Date(draft.drafted_at).getTime();
const ageH = (Date.now() - draftedAt) / 36e5;
if (!(ageH >= 0 && ageH < MAX_AGE_H)) {
  console.error(`approve-post: draft is ${ageH.toFixed(1)}h old (> ${MAX_AGE_H}h, or has a bad timestamp) — too stale, skipping`);
  process.exit(0);
}

const reply = await pollReply(draftedAt, [/^[123]$/, /^skip$/i]);
if (!reply) { console.error('approve-post: no reply yet — skipping silently (the effortless default)'); process.exit(0); }
if (/^skip$/i.test(reply)) { console.error('approve-post: explicit skip — not posting'); process.exit(0); }

const chosen = draft.candidates.find((cd) => cd.n === Number(reply));
if (!chosen) { console.error(`approve-post: reply "${reply}" doesn't match a candidate — skipping`); process.exit(0); }

// Re-check the gate at approval time, not just at draft time — belt and
// suspenders against guard.mjs/voice.mjs having changed in between, or any
// other drift. A candidate that already passed once should always still
// pass; if it doesn't, something upstream changed and this must fail
// CLOSED rather than post on stale trust.
const g = check(chosen.text);
if (!g.ok) {
  console.error(`approve-post: candidate ${chosen.n} fails the gate NOW (${g.violations.map((v) => v.rule).join(',')}) — refusing to post`);
  await notify(`⚠️ <b>approval blocked</b>\ncandidate ${chosen.n} was approved but no longer passes ci/guard.mjs — not posted.`);
  process.exit(0);
}

console.error(`approve-post: chosen = ${chosen.n} [${chosen.pillar}]\n${chosen.text}`);
if (DRY) { console.error('approve-post: DRY RUN — not posting'); process.exit(0); }

const c = creds();

// idempotency: if this exact text is already among the account's last 20
// originals, a re-run (accidental double workflow_dispatch, a retry) must
// not double-post. Same pattern ci/announce.mjs already uses.
const me = await whoAmI(c);
const recent = await myRecentTweets(c, me.id, 20);
if (recent.some((tw) => !isReply(tw) && tw.text === chosen.text)) {
  console.error('approve-post: this exact text was already posted recently — skipping (idempotent)');
  process.exit(0);
}

const tweet = await postTweet(c, chosen.text);
const url = `https://x.com/mochionhq/status/${tweet.id}`;
console.error(`approve-post: posted ${url}`);
await notify(`🍡 <b>posted</b> — [${chosen.pillar}]\n${chosen.text}\n${url}`);
