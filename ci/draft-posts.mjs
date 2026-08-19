#!/usr/bin/env node
// Daily content drafter — the first step of the "draft → human approves →
// posts" pipeline. Picks 3 distinct teach-first pillars, drafts one Gemini
// candidate per pillar, drops anything guard.mjs rejects (regenerating once),
// then sends whatever survives to Telegram numbered for a reply, and writes
// them to ci/.draft-output/candidates.json for approve-post.mjs to pick up
// via a same-day GitHub Actions artifact (see .github/workflows/content-*.yml
// — this script has no opinion on HOW the artifact travels).
//
// Inputs are DELIBERATELY narrow: day count + this-week's green/red/flat
// SHAPE (not magnitudes), the latest build-log title, one devlog note if
// present. Nothing from data/public.json's actual percentages/sharpe/etc.
// ever reaches the model — see ci/guard.test.mjs's header for why that
// matters (the gate is a backstop, not a license, per the same philosophy
// ops/week-notes.template.md already states for the box's leak gate).
//
// Exit codes the workflow branches on (same convention as draft-dispatch.mjs):
// 0 + candidates.json present = drafted; 3 = deliberately no draft (quiet
// day or no_data); anything else = a real failure. The workflow ALSO checks
// the file actually exists before uploading it as an artifact, rather than
// trusting the exit code alone — belt and suspenders (see content-draft.yml).
//
// DRY_RUN=true exits 0 WITHOUT writing candidates.json (that file-existence
// check is exactly what keeps a dry run from being uploaded as if it were
// real) but still calls Gemini and still notifies Telegram — that's your own
// control room, not going live. The actual "going live" action lives
// entirely in approve-post.mjs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { creds, whoAmI, myRecentTweets, isReply, tally } from './x-lib.mjs';
import { generate } from './gemini.mjs';
import { check } from './guard.mjs';
import { CAST, CATCHPHRASES, VOICE_RULES, FEW_SHOT } from './voice.mjs';
import { parseLogEntries, sortEntriesDesc } from './log-entries.mjs';
import { notify } from './notify.mjs';

const DRY = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';

const PILLARS = [
  { id: 'risk-craft', task: "Write one short, sober X post about the IDEA of a kill-switch — a mechanism that benches a strategy the moment it stops working, before it can do real damage. Use ONLY the Referee's job as described above; do not invent a metric, threshold, or mechanism beyond that plain description. Teach the general principle, not a fake specific." },
  { id: 'verifiability', task: 'Write one short, sober X post making the case that a screenshot of trading results is worthless, but an append-only public commit history anyone can diff is real evidence. Make it read like an insight, not a slogan.' },
  { id: 'publish-losses', task: 'Write one short, sober X post about the discipline of publishing a losing day as plainly as a winning one — the real failure is quietly skipping the bad ones, not the loss itself. Speak generally/philosophically; do not claim a specific loss or incident unless it is explicitly given to you below.' },
  { id: 'build-in-public', task: "Write one short, sober X post about the GENERAL discipline of monitoring an automated system and owning mistakes plainly when they happen. This is a philosophy, not a report — do not invent a specific bug, outage, or incident. If today's grounding below gives you a real recent note or build-log title, you may reference THAT specifically; otherwise stay general." },
];

// rotate WHICH 3-of-4 pillars show today, and in what order, so a week
// cycles every pillar without the same 3 always appearing together.
function todaysPillars(day) {
  return [0, 1, 2].map((k) => PILLARS[(day + k) % PILLARS.length]);
}

const read = (p) => { try { return JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8')); } catch { return null; } };

const d = read('data/public.json');
if (!d || d.status === 'no_data' || !d.equity_curve?.length) {
  // exit 3 = "no draft", same bucket as "nothing clean drafted" below — the
  // workflow branches on this exit code (see content-draft.yml).
  console.error('draft-posts: no_data — nothing to draft'); process.exit(3);
}
const day = d.days_live;
const toHundred = 100 - day;
const week = d.equity_curve.slice(-7);
const prev = d.equity_curve[d.equity_curve.length - 8] ? (d.equity_curve[d.equity_curve.length - 8].close ?? d.equity_curve[d.equity_curve.length - 8].value) : 100;
const t = tally(week, prev);
const weekShape = [t.green && `${t.green} green`, t.red && `${t.red} red`, t.flat && `${t.flat} flat`].filter(Boolean).join(', ');

const html = (() => { try { return readFileSync(new URL('../log.html', import.meta.url), 'utf8'); } catch { return ''; } })();
const entries = sortEntriesDesc(parseLogEntries(html).filter((e) => e.date && e.title));
const latestLogTitle = entries[0]?.title || null;

const devlog = read('data/devlog.json');
const devlogNote = (devlog?.notes || []).filter(Boolean)[0] || null;

// avoid restating recent posts — best-effort; a read failure here must never
// block drafting, so any problem just means we draft without that context.
let recentTexts = [];
let c = null;
try {
  c = creds();
  const me = await whoAmI(c);
  const recent = await myRecentTweets(c, me.id, 30);
  recentTexts = recent.filter((tw) => !isReply(tw)).slice(0, 15).map((tw) => tw.text);
} catch (e) { console.error('draft-posts: recent-posts read skipped (' + e.message + ')'); }

function buildPrompt(pillar) {
  return `You are drafting ONE X (Twitter) post in the voice of Mochion, a build-in-public crypto trading project.

VOICE — follow exactly:
${VOICE_RULES.map((r) => '- ' + r).join('\n')}

THE CAST — reference AT MOST one, only if it fits naturally, never forced:
${CAST.map((cc) => `- ${cc.name}: ${cc.job}`).join('\n')}

catchphrases you may draw on sparingly, never force one in: ${CATCHPHRASES.join(' / ')}

real examples of the voice, for calibration only — do NOT reuse these lines:
${FEW_SHOT.slice(0, 8).map((l) => `"${l}"`).join('\n')}

HARD RULES, no exceptions:
- NEVER a percentage, dollar figure, ratio, or any performance number. day counts are the only numbers allowed.
- NEVER a link or URL.
- NEVER the words: invest, deposit, join, returns, alpha, token, NFT.
- NEVER promise future performance ("will recover", "back to green soon").
- NEVER weather, local time, a city, or any personal name.
- NEVER invent a specific technical mechanism, metric, or threshold beyond the plain CAST descriptions above (no fake "three consecutive fills" or "variance thresholds" — this project's real mechanism is more sophisticated than that and a wrong guess is a false claim, not a simplification).
- NEVER claim a specific event, incident, or narrative happened ("execution lagged", "we fixed a bug this week") unless it is explicitly given to you in today's grounding below. Speak in general/philosophical terms instead of inventing a specific.
- under 260 characters. lowercase preferred. no hashtags. no emoji unless it is 🍡 and only if it truly fits.

today's grounding — real, use if it helps, don't force all of it in:
- day ${day} of the public record${toHundred > 0 && toHundred <= 30 ? ` (${toHundred} days to day 100)` : ''}
- this past week's shape: ${weekShape || 'not enough days yet'}
${latestLogTitle ? `- most recent build-log entry: "${latestLogTitle}"` : ''}
${devlogNote ? `- a real recent note from the workshop: "${devlogNote}"` : ''}
${recentTexts.length ? `\ndo NOT repeat the angle of these recent posts:\n${recentTexts.slice(0, 8).map((x) => `"${x}"`).join('\n')}` : ''}

TASK: ${pillar.task}

Reply with ONLY the post text. No quotes, no preamble, no explanation.`;
}

async function draftOne(pillar) {
  for (let tryNum = 1; tryNum <= 2; tryNum++) {
    let text;
    try { text = await generate(buildPrompt(pillar), { temperature: 0.95 }); }
    catch (e) { console.error(`draft-posts: [${pillar.id}] gemini failed (${e.message})`); return null; }
    if (!text) return null;   // no key — degrade to nothing, caller handles it
    text = text.trim().replace(/^["']|["']$/g, '');
    const g = check(text);
    if (g.ok) return { pillar: pillar.id, text, warnings: g.warnings };
    console.error(`draft-posts: [${pillar.id}] try ${tryNum} rejected: ${g.violations.map((v) => v.rule).join(',')}`);
  }
  return null;
}

const pillarsToday = todaysPillars(day);
console.error(`draft-posts: day ${day} · pillars = ${pillarsToday.map((p) => p.id).join(', ')}`);

const drafted = (await Promise.all(pillarsToday.map(draftOne))).filter(Boolean);

if (!drafted.length) {
  // exit 3 = "quiet, no draft" — same convention draft-dispatch.mjs already
  // uses; the workflow's bash step reads the exit code, not stdout.
  console.error('draft-posts: nothing clean drafted today — skipping (this is fine; not every day has to post)');
  process.exit(3);
}

const candidates = drafted.map((d2, i) => ({ n: i + 1, pillar: d2.pillar, text: d2.text }));
console.error('draft-posts: candidates —');
candidates.forEach((cd) => console.error(`  ${cd.n}. [${cd.pillar}] ${cd.text}`));

const lines = candidates.map((cd) => `<b>${cd.n}.</b> [${cd.pillar}]\n${cd.text}`).join('\n\n');
await notify(`🍡 <b>today's drafts</b> — reply 1/2/3 to post, or "skip"\n\n${lines}`);

if (DRY) { console.error('draft-posts: DRY RUN — not writing candidates.json / have_draft output'); process.exit(0); }

const outDir = new URL('.draft-output/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('candidates.json', outDir), JSON.stringify({ drafted_at: new Date().toISOString(), day, candidates }, null, 2));
console.error('draft-posts: wrote candidates.json');   // exit 0 (implicit) = have_draft, same convention as draft-dispatch.mjs
