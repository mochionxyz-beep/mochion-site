#!/usr/bin/env node
// Friday draft dispatch — turns the week's SITE commits + tape stats + (optional)
// box devlog into a house-voice build-log <article>, printed to stdout for the
// workflow to open as a PR. Deterministic template (no LLM) for voice control.
// Counts only, never a %. Skips (empty output + exit 3) on a quiet week.
//
// Inputs (env): DIGEST_COMMITS = newline-joined `git log --since` subjects (site repo).
// Reads data/public.json (tape) and data/devlog.json (box airlock, if present).

import { readFileSync } from 'node:fs';
import { tally } from './x-lib.mjs';

const commits = (process.env.DIGEST_COMMITS || '').split('\n').map((s) => s.trim()).filter(Boolean);

// group site commits by prefix, drop noise (data/metrics/merge)
const NOISE = /^(data: |metrics:|Merge |CI: fix|Cache-bust)/i;
const meaningful = commits.filter((s) => !NOISE.test(s));

const read = (p) => { try { return JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8')); } catch { return null; } };
const d = read('data/public.json');
const devlog = read('data/devlog.json');

// tape week
let tapeLine = '';
if (d && d.status !== 'no_data' && d.equity_curve?.length >= 7) {
  const week = d.equity_curve.slice(-7);
  const prev = d.equity_curve[d.equity_curve.length - 8] ? (d.equity_curve[d.equity_curve.length - 8].close ?? d.equity_curve[d.equity_curve.length - 8].value) : 100;
  const t = tally(week, prev);
  const parts = []; if (t.green) parts.push(`${t.green} green`); if (t.red) parts.push(`${t.red} red`); if (t.flat) parts.push(`${t.flat} flat`);
  tapeLine = `The tape printed 7 days this week — ${parts.join(', ')} — up to day ${d.days_live}. Every one of them public.`;
}

// box devlog (Cast-voiced, already sanitized on the box)
const CAST_EMOJI = { dispatcher: '📮', referee: '🚦', lookout: '🔭', archivist: '🗄️' };
const devBullets = [];
if (devlog && Array.isArray(devlog.stations)) {
  for (const st of devlog.stations) {
    const emo = CAST_EMOJI[st.cast] || '';
    const hi = (st.highlights || []).filter(Boolean);
    if (hi.length) hi.forEach((h) => devBullets.push(`${emo} the ${st.cast} ${h}`.trim()));
    else if (st.changes) devBullets.push(`${emo} the ${st.cast} station saw ${st.changes} change${st.changes === 1 ? '' : 's'}`.trim());
  }
}

// site-workshop bullets (Mochi minds the shop), from commit subjects
const siteBullets = meaningful.slice(0, 8).map((s) => `🍡 ${s.replace(/\.$/, '')}`);

// human notes — the REAL, leak-gated highlights (reliability/risk/infra). This is the
// substance of the entry; the cast + site bullets are flavor around it. Verbatim from the box.
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const notes = (devlog && Array.isArray(devlog.notes) ? devlog.notes : []).filter(Boolean).slice(0, 6);

const totalSignal = notes.length + devBullets.length + siteBullets.length + (tapeLine ? 1 : 0);
// a single real human note always earns the post; otherwise need ≥2 signals of any kind
if (totalSignal < 2 && notes.length === 0) { console.error('draft: quiet week — no PR'); process.exit(3); }

// build the article (contract-compliant: article.entry#YYYY-MM-DD-slug, one time, one h2)
const asOf = (d && d.as_of) || new Date().toISOString().slice(0, 10);
const id = `${asOf}-week-at-hq`;
const noteItems = notes.map((n) => `        <li>${esc(n)}</li>`).join('\n');
const flavorItems = [...devBullets, ...siteBullets].slice(0, 10)
  .map((b) => `        <li>${esc(b)}</li>`).join('\n');

const workbench = notes.length ? `
      <div class="caption">
        <span class="kicker">from the workbench</span>
        <ul style="margin:6px 0 0;padding-left:20px">
${noteItems}
        </ul>
      </div>` : '';
const workshop = (devBullets.length + siteBullets.length) ? `
      <div class="caption">
        <span class="kicker">around the workshop</span>
        <ul style="margin:6px 0 0;padding-left:20px">
${flavorItems}
        </ul>
      </div>` : '';

const article = `    <div class="stars" aria-hidden="true">✦ ✦ ✦</div>

    <article class="entry" id="${id}">
      <time datetime="${asOf}">Issue #0 · ${asOf}</time>
      <h2>A week at HQ</h2>
      <div class="caption">
        <span class="kicker">what got built</span>
        ${tapeLine || 'The machine kept its hours this week.'}
      </div>${workbench}${workshop}
    </article>`;

// emit the article + a machine-readable header for the workflow
process.stdout.write(article + '\n');
console.error(`draft: proposing entry ${id} (${totalSignal} signals)`);
