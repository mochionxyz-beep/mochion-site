#!/usr/bin/env node
// Watchdog — proves the promise ("updated daily") is actually being kept.
// Fetches the LIVE site (not the repo) and fails loudly if the record went stale
// or the share card broke, so a dead box cron / failed push / broken deploy can't
// pass silently. A red run emails the account (repo issues are off).
// Zero deps. Env: MAX_AGE_H (default 26), MIN_CARD_KB (default 20).

const SITE = 'https://mochion.xyz';
const MAX_AGE_H = Number(process.env.MAX_AGE_H || 26);
const MIN_CARD_KB = Number(process.env.MIN_CARD_KB || 20);
const bust = 'cb=' + Date.now();
const problems = [];
let ageH = null, day = null, cardKB = null;

// 1) the record is fresh
try {
  const r = await fetch(`${SITE}/data/public.json?${bust}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`public.json HTTP ${r.status}`);
  const d = await r.json();
  if (d.status === 'no_data') {
    console.error('watchdog: no_data (pre-launch state) — treating as OK');
  } else if (!d.generated_at) {
    problems.push('public.json has no generated_at');
  } else {
    ageH = (Date.now() - new Date(d.generated_at).getTime()) / 36e5;
    day = d.days_live;
    if (!(ageH >= 0)) problems.push(`generated_at unparseable/future: ${d.generated_at}`);
    else if (ageH > MAX_AGE_H) problems.push(`record is ${ageH.toFixed(1)}h old (> ${MAX_AGE_H}h) — the box cron or deploy likely failed`);
  }
} catch (e) { problems.push(`could not read public.json: ${e.message}`); }

// 2) the share card renders and isn't the tiny fallback
try {
  const r = await fetch(`${SITE}/og/tape.png?${bust}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`og/tape.png HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  cardKB = buf.length / 1024;
  if (cardKB < MIN_CARD_KB) problems.push(`og/tape.png is only ${cardKB.toFixed(0)}KB (< ${MIN_CARD_KB}KB) — card render may be wedged`);
} catch (e) { problems.push(`could not read og/tape.png: ${e.message}`); }

// GitHub Actions step summary — a free daily health line in the Actions tab
const sum = process.env.GITHUB_STEP_SUMMARY;
if (sum) {
  const fs = await import('node:fs');
  const status = problems.length ? '🔴 FAIL' : '🟢 OK';
  fs.appendFileSync(sum, `### Tape watchdog — ${status}\n\n` +
    `| record age | day | card |\n|---|---|---|\n| ${ageH == null ? '—' : ageH.toFixed(1) + 'h'} | ${day ?? '—'} | ${cardKB == null ? '—' : cardKB.toFixed(0) + 'KB'} |\n\n` +
    (problems.length ? problems.map((p) => `- ⚠ ${p}`).join('\n') + '\n' : 'All good. The machine is running.\n'));
}

import { notify } from './notify.mjs';
if (problems.length) {
  console.error('watchdog: PROBLEMS\n' + problems.map((p) => ' - ' + p).join('\n'));
  await notify(`🔴 <b>WATCHDOG</b> — the tape may be stale\nday ${day ?? '—'} · record ${ageH == null ? '?' : ageH.toFixed(1) + 'h'} old · card ${cardKB == null ? '?' : cardKB.toFixed(0) + 'KB'}\n` + problems.map((p) => '• ' + p).join('\n'));
  process.exit(1);
}
console.error(`watchdog: OK — day ${day}, record ${ageH == null ? 'n/a' : ageH.toFixed(1) + 'h'} old, card ${cardKB == null ? 'n/a' : cardKB.toFixed(0) + 'KB'}`);
if ((process.env.HEARTBEAT || 'false').toLowerCase() === 'true') {
  await notify(`🟢 all good · day ${day} · record ${ageH.toFixed(1)}h old`, { loud: false });
}
