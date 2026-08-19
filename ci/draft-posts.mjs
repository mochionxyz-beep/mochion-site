#!/usr/bin/env node
// Daily content drafter — the first step of the "draft → human approves →
// posts" pipeline. Picks 3 pillars, drafts one Gemini candidate per pillar,
// drops anything guard.mjs rejects (regenerating once), then sends whatever
// survives to Telegram numbered for a reply, and writes them to
// ci/.draft-output/candidates.json for approve-post.mjs to pick up via a
// same-day GitHub Actions artifact (see .github/workflows/content-*.yml —
// this script has no opinion on HOW the artifact travels).
//
// MOSTLY general, standalone trading/investing/algo-trading knowledge — no
// Mochion framing, no "the machine", stands on its own. Real user feedback
// after the first live drafts: the Cast-narrative pillars ("the Referee
// does X") read as in-universe flavor text, not knowledge worth following
// an account for, and one pillar should ask a genuine open question so
// people have something to reply to, not just read. GENERAL_PILLARS below
// is that; MOCHION_PILLAR is the earlier build-in-public pillar, dialed
// back to roughly one day in four (see todaysPillars) rather than a third
// of every day's slate.
//
// Inputs are DELIBERATELY narrow: day count + this-week's green/red/flat
// SHAPE (not magnitudes), the latest build-log title, one devlog note if
// present — and ONLY for the Mochion pillar; general pillars get none of
// this, on purpose, so they read as knowledge, not as a status update.
// Nothing from data/public.json's actual percentages/sharpe/etc. ever
// reaches the model — see ci/guard.test.mjs's header for why that matters
// (the gate is a backstop, not a license, per the same philosophy
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

// general, standalone knowledge — no Mochion framing, must read as useful on
// its own to anyone in trading/investing, not just people who follow this account
const GENERAL_PILLARS = [
  { id: 'risk-wisdom', mochion: false, task: 'ONE plain sentence of risk-management wisdom that applies to any trader — pick just ONE of: position sizing, cutting losses early, protecting capital over chasing gains. Say only that one thing, in one breath. Do not stack a second point onto it.' },
  { id: 'psychology', mochion: false, task: 'ONE plain sentence about a trading psychology pitfall (FOMO, revenge trading, sunk-cost thinking, overconfidence after a win). Name the pitfall, or the fix — not a full explanation of both. One breath.' },
  { id: 'algo-concepts', mochion: false, task: "ONE plain sentence explaining a single systematic-trading concept (overfitting, backtesting pitfalls, survivorship bias, look-ahead bias, slippage, paper vs live) simply enough a beginner gets it instantly. Pick one concept, not a list." },
  { id: 'market-wisdom', mochion: false, task: 'ONE plain sentence of timeless investing wisdom — time in the market, compounding, diversification, discipline over strategy. Pick ONE, say it plainly, stop.' },
  { id: 'open-question', mochion: false, task: "ONE short, genuine, open-ended question about trading, investing, or algo-trading that invites real replies — something you're actually curious how other traders/builders handle. Must read as sincere curiosity, not a rhetorical hook. The question ONLY — no setup sentence, no self-answer." },
];

// the earlier, Mochion-specific pillar — kept, but now the occasional
// exception (see todaysPillars), not the default.
const MOCHION_PILLAR = { id: 'build-in-public', mochion: true, task: "ONE plain sentence about the discipline of monitoring an automated system and owning mistakes honestly. A principle, not a report — do not invent a specific bug, outage, or incident. If today's grounding below gives you a real recent note or build-log title, you may reference THAT specifically and briefly; otherwise stay general and short." };

// 3 general pillars a day, rotating through all 5 so nothing repeats two
// days running; the Mochion pillar swaps in for one slot roughly 1 day in 4.
function todaysPillars(day) {
  const picks = [0, 1, 2].map((k) => GENERAL_PILLARS[(day + k) % GENERAL_PILLARS.length]);
  if (day % 4 === 0) picks[2] = MOCHION_PILLAR;
  return picks;
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
try {
  const c = creds();
  const me = await whoAmI(c);
  const recent = await myRecentTweets(c, me.id, 30);
  recentTexts = recent.filter((tw) => !isReply(tw)).slice(0, 15).map((tw) => tw.text);
} catch (e) { console.error('draft-posts: recent-posts read skipped (' + e.message + ')'); }

function buildPrompt(pillar) {
  const mochionSection = pillar.mochion ? `
THE CAST — reference AT MOST one, only if it fits naturally, never forced:
${CAST.map((cc) => `- ${cc.name}: ${cc.job}`).join('\n')}

catchphrases you may draw on sparingly, never force one in: ${CATCHPHRASES.join(' / ')}

real examples of this project's voice, for calibration only — do NOT reuse these lines:
${FEW_SHOT.slice(0, 6).map((l) => `"${l}"`).join('\n')}
` : `
This post is GENERAL trading/investing/algo-trading knowledge and must stand completely on its own. Do NOT mention Mochion, "the machine", "the Referee", or any project-specific framing. No "we/our project" language, no self-promotion. Just genuinely useful, broadly-agreeable knowledge any trader, investor, or founder would find valuable — the kind of thing that's true whether or not the reader has ever heard of this account.
`;

  const grounding = pillar.mochion ? `
today's grounding — real, use if it helps, don't force all of it in:
- day ${day} of the public record${toHundred > 0 && toHundred <= 30 ? ` (${toHundred} days to day 100)` : ''}
- this past week's shape: ${weekShape || 'not enough days yet'}
${latestLogTitle ? `- most recent build-log entry: "${latestLogTitle}"` : ''}
${devlogNote ? `- a real recent note from the workshop: "${devlogNote}"` : ''}
` : '';

  return `You are drafting ONE X (Twitter) post for an account that mostly teaches broad, general trading/investing/algo-trading knowledge. It also build-in-publics a small crypto trading project called Mochion, but that is NOT today's topic unless stated below.

VOICE — follow exactly:
${VOICE_RULES.map((r) => '- ' + r).join('\n')}
${mochionSection}
HARD RULES, no exceptions:
- NEVER a percentage, dollar figure, ratio, or any performance number. day counts are the only numbers allowed, and ONLY on Mochion-specific posts.
- NEVER a link or URL.
- NEVER the words: invest, deposit, join, returns, alpha, token, NFT.
- NEVER promise future performance ("will recover", "back to green soon").
- NEVER weather, local time, a city, or any personal name.
- NEVER invent a specific technical mechanism, metric, or threshold — teach the general, correct idea, not a fabricated specific.
- NEVER claim a specific event, incident, or narrative happened unless it is explicitly given to you in today's grounding below.
- SHORT. Target 60–120 characters, hard cap 140. ONE idea, ONE breath. If you have two points, keep the stronger one and delete the rest — do not stack clauses with "and"/"so"/semicolons to fit more in. A reader should get it in under 3 seconds.
- lowercase preferred. no hashtags. no emoji unless it is 🍡 and only on a Mochion-specific post where it truly fits.
- length calibration, this is the target register: "cutting losses early is the whole skill. everything else is commentary." — that short, that plain, ONE thought.
${grounding}${recentTexts.length ? `\ndo NOT repeat the angle of these recent posts:\n${recentTexts.slice(0, 8).map((x) => `"${x}"`).join('\n')}` : ''}

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
