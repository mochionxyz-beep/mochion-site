#!/usr/bin/env node
// The Tape card v2 — "the daily front page". Renders data/public.json → og/tape.png (1200×630).
// System: ink header band · DAY ticket · CANDLESTICKS over the last 30 days (labeled,
// stays feed-readable forever) · outcome ticks column-locked under each candle ·
// all-time stats line (the honesty guard for the window) · the hand-stamped
// "VERIFIED BY MOCHI · STILL RUNNING" seal (ci/assets/mochi-seal-rough.png; clean
// master kept at brand/mascot/mochi-seal.png).
// One day-outcome rule everywhere: close vs prev close, ±0.05 = flat — matches the
// posting bot and the site panel.
// Non-fatal in CI — deploy.yml falls back to the static card if this fails.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { outcome } from './x-lib.mjs';   // the ONE day-outcome rule (±FLAT_EPS) — single source

const W = 1200, H = 630, WINDOW = 30;
const C = {
  paper: '#E7DCC2', ink: '#26201C', outline: '#20180F', sec: '#6b6355',
  matcha: '#9DBB72', matchaDeep: '#587A40', red: '#B23A2E', cream: '#F1E9D6', sand: '#C9BD9E',
};

const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));
const sealB64 = readFileSync(new URL('./assets/mochi-seal-rough.png', import.meta.url)).toString('base64');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- shared chrome ----------
function band() {
  return `
  <rect x="24" y="24" width="${W - 48}" height="64" fill="${C.ink}"/>
  <rect x="52" y="42" width="13" height="30" fill="${C.matcha}"/>
  <text x="78" y="69" font-family="Alfa Slab One" font-size="32" fill="${C.paper}">THE TAPE</text>
  <text x="${W - 52}" y="66" text-anchor="end" font-family="Special Elite" font-size="22" fill="${C.sand}">MOCHION · mochion.xyz</text>`;
}
function frame() {
  return `<rect width="${W}" height="${H}" fill="${C.paper}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${C.outline}" stroke-width="5"/>`;
}
function halftone() {
  return `<defs><pattern id="ht" width="9" height="9" patternUnits="userSpaceOnUse">
    <circle cx="2" cy="2" r="1.4" fill="${C.ink}" opacity="0.14"/></pattern></defs>
  <rect x="29" y="${H - 44}" width="${W - 58}" height="15" fill="url(#ht)"/>`;
}
function mochiSeal(x, y, size) {
  // Gemini-drawn rubber stamp (VERIFIED BY MOCHI / STILL RUNNING, face center) —
  // transparent knockout, embedded and lightly rotated like a real stamp.
  const cx = x + size / 2, cy = y + size / 2;
  return `<g transform="rotate(-8 ${cx} ${cy})" opacity="0.93">
    <image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/png;base64,${sealB64}"/>
  </g>`;
}
const COL_CX = 1041;   // the right column's shared axis: DAY ticket + seal stack on it
function dayChip(day, milestone) {
  // straight ticket, centered on the column axis; punched stub holes both edges
  const w = 196, h = 98, x = COL_CX - w / 2, y = 105;
  let holes = '';
  for (let hy = y + 13; hy <= y + h - 13; hy += 16)
    holes += `<circle cx="${x + 10}" cy="${hy}" r="3.4" fill="${C.paper}"/><circle cx="${x + w - 10}" cy="${hy}" r="3.4" fill="${C.paper}"/>`;
  const burst = milestone
    ? `<rect x="${x - 7}" y="${y - 7}" width="${w + 14}" height="${h + 14}" fill="none" stroke="${C.red}" stroke-width="3" stroke-dasharray="8 5"/>` : '';
  return `${burst}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.red}"/>
  <rect x="${x + 20}" y="${y + 7}" width="${w - 40}" height="${h - 14}" fill="none" stroke="${C.cream}" stroke-width="2.5"/>
  ${holes}
  <text x="${COL_CX + 3}" y="${y + 33}" text-anchor="middle" font-family="Special Elite" font-size="20" letter-spacing="6" fill="${C.cream}">DAY</text>
  <text x="${COL_CX}" y="${y + 84}" text-anchor="middle" font-family="Alfa Slab One" font-size="52" fill="${C.cream}">${esc(day)}</text>`;
}
function perforation(x, y0, y1) {
  let out = '';
  for (let y = y0; y <= y1; y += 24) out += `<circle cx="${x}" cy="${y}" r="3.6" fill="${C.sand}"/>`;
  return out;
}

// ---------- data pieces ----------
// ONE day-outcome rule everywhere (candles, dots, and the stamp bot): the day is
// green/red by close vs the PREVIOUS day's close (±FLAT_EPS index pts = flat/sand).
// Candles keep true OHLC geometry but are COLORED by outcome, so the chart and
// the dots strip below it can never disagree. Threshold imported from x-lib.
const OUTCOME_COLORS = {
  green: { fill: C.matcha, stroke: C.matchaDeep },
  red: { fill: C.red, stroke: C.red },
  flat: { fill: C.sand, stroke: C.sec },
};
const outcomeOf = (delta) => OUTCOME_COLORS[outcome(delta)];
const deltas = (curve, prevClose) => curve.map((p, i) => {
  const prev = i ? (curve[i - 1].close ?? curve[i - 1].value) : prevClose;
  return (p.close ?? p.value) - prev;
});

function candles(curve, CH, prevClose) {
  const n = curve.length;
  const lo = Math.min(...curve.map((p) => p.low ?? p.value));
  const hi = Math.max(...curve.map((p) => p.high ?? p.value));
  const pad = (hi - lo) * 0.10 || 2, min = lo - pad, max = hi + pad;
  const X = (i) => CH.x + (n <= 1 ? CH.w / 2 : (CH.w * i) / (n - 1));
  const Y = (v) => CH.y + CH.h * (1 - (v - min) / (max - min || 1));
  const cw = Math.max(6, Math.min(26, (CH.w / n) * 0.62));
  const dd = deltas(curve, prevClose);
  const openLvl = curve[0].open ?? curve[0].value;
  let out = `<line x1="${CH.x}" y1="${Y(openLvl).toFixed(1)}" x2="${CH.x + CH.w}" y2="${Y(openLvl).toFixed(1)}" stroke="${C.sec}" stroke-width="2" stroke-dasharray="8 8"/>`;
  curve.forEach((p, i) => {
    const o = p.open ?? p.value, c2 = p.close ?? p.value, hh = p.high ?? Math.max(o, c2), ll = p.low ?? Math.min(o, c2);
    const col = outcomeOf(dd[i]);
    const x = X(i), yo = Y(o), yc = Y(c2), top = Math.min(yo, yc), bh = Math.max(2, Math.abs(yc - yo));
    out += `<line x1="${x.toFixed(1)}" y1="${Y(hh).toFixed(1)}" x2="${x.toFixed(1)}" y2="${Y(ll).toFixed(1)}" stroke="${col.stroke}" stroke-width="2.4"/>
    <rect x="${(x - cw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${cw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.6"/>`;
  });
  return out;
}
function windowTicks(curve, CH, prevClose, y) {
  // one tick EXACTLY under each candle (same X mapping, same width, same outcome
  // color) — the strip and the chart can never look misaligned again.
  const n = curve.length;
  const X = (i) => CH.x + (n <= 1 ? CH.w / 2 : (CH.w * i) / (n - 1));
  const cw = Math.max(6, Math.min(26, (CH.w / n) * 0.62));
  const dd = deltas(curve, prevClose);
  return dd.map((delta, i) =>
    `<rect x="${(X(i) - cw / 2).toFixed(1)}" y="${y}" width="${cw.toFixed(1)}" height="8" fill="${outcomeOf(delta).fill}"/>`
  ).join('');
}

// ---------- compose ----------
let body;
if (!d || d.status === 'no_data' || !d.equity_curve?.length) {
  body = `${band()}
  <text x="90" y="300" font-family="Alfa Slab One" font-size="54" fill="${C.ink}">the tape prints here</text>
  <text x="90" y="356" font-family="Special Elite" font-size="28" fill="${C.sec}">waiting for the first honest day</text>
  <text x="90" y="560" font-family="Special Elite" font-size="24" fill="${C.sec}">don't trust — watch</text>
  ${mochiSeal(W - 330, 300, 250)}`;
} else {
  const full = d.equity_curve;
  const win = full.slice(-WINDOW);
  const s = d.summary || {};
  const day = d.days_live ?? full.length;

  // the seal is the character now — chart takes the full width; the window ticks
  // (always 30, scales forever) are the only strip — no full-record dots row.
  const CH = { x: 74, y: 140, w: 840, h: 308 };
  const dotsX = CH.x;

  const ret = s.cumulative_return_pct, dd = s.max_drawdown_pct;
  const statLine = (ret != null && dd != null)
    ? `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}% since ${esc(d.since)}  ·  max drawdown ${dd.toFixed(1)}%  ·  as of ${esc(d.as_of)}`
    : `since ${esc(d.since)}  ·  as of ${esc(d.as_of)}`;

  body = `${band()}
  ${perforation(CH.x - 16, CH.y + 6, CH.y + CH.h - 6)}
  ${perforation(CH.x + CH.w + 16, CH.y + 6, CH.y + CH.h - 6)}
  <text x="${CH.x}" y="${CH.y - 10}" font-family="Special Elite" font-size="17" fill="${C.sec}">CANDLES · LAST ${win.length} DAYS</text>
  ${candles(win, CH, (full[full.length - win.length - 1]?.close ?? full[full.length - win.length - 1]?.value ?? 100))}
  ${windowTicks(win, CH, (full[full.length - win.length - 1]?.close ?? full[full.length - win.length - 1]?.value ?? 100), CH.y + CH.h + 8)}
  ${dayChip(day, [50, 100, 200, 365].includes(day))}
  <text x="${dotsX}" y="${521}" font-family="Special Elite" font-size="26" fill="${C.ink}">${statLine}</text>
  <text x="${dotsX}" y="${563}" font-family="Special Elite" font-size="22" fill="${C.sec}">the machine is running  ·  wins and losses, in the open</text>
  ${halftone()}
  ${mochiSeal(938, 383, 206)}`;
}

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${frame()}${body}</svg>`;

import { fileURLToPath } from 'node:url';
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: {
    loadSystemFonts: false,
    fontFiles: [
      fileURLToPath(new URL('./fonts/AlfaSlabOne-Regular.ttf', import.meta.url)),
      fileURLToPath(new URL('./fonts/SpecialElite-Regular.ttf', import.meta.url)),
    ],
  },
});
mkdirSync(new URL('../og', import.meta.url), { recursive: true });
const OUT = process.env.CARD_OUT || '../og/tape.png';
writeFileSync(new URL(OUT, import.meta.url), resvg.render().asPng());
console.error(`og card v2: rendered ${OUT} (day ${d.days_live ?? '—'}, as_of ${d.as_of ?? 'no_data'})`);
