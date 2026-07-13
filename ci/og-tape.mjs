#!/usr/bin/env node
// Renders data/public.json → og/tape.png (1200×630) at deploy time.
// "The link is the pitch": sharing mochion.xyz unfurls with the CURRENT record.
// Sober by design: day count leads; the record is shown, never hyped.
// Non-fatal in CI — deploy.yml falls back to the static card if this fails.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const W = 1200, H = 630;
// site tokens (css/styles.css)
const C = {
  paper: '#E7DCC2', ink: '#26201C', outline: '#20180F', sec: '#6b6355',
  matcha: '#9DBB72', matchaDeep: '#587A40', red: '#B23A2E', cream: '#F1E9D6',
};

const d = JSON.parse(readFileSync(new URL('../data/public.json', import.meta.url), 'utf8'));

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function svgShell(body) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${C.paper}"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${C.outline}" stroke-width="5"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${C.outline}" stroke-width="1.5"/>
  ${body}
</svg>`;
}

let body;
if (!d || d.status === 'no_data' || !d.equity_curve || !d.equity_curve.length) {
  body = `
  <text x="${W / 2}" y="250" text-anchor="middle" font-family="Alfa Slab One" font-size="64" fill="${C.ink}">MOCHION</text>
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="Special Elite" font-size="30" fill="${C.sec}">the tape prints here — waiting for the first honest day</text>
  <text x="${W / 2}" y="560" text-anchor="middle" font-family="Special Elite" font-size="26" fill="${C.sec}">don't trust — watch  ·  mochion.xyz</text>`;
} else {
  const curve = d.equity_curve;
  const n = curve.length;
  const s = d.summary || {};

  // chart box
  const CH = { x: 90, y: 150, w: W - 180, h: 320 };
  const vals = curve.map((p) => p.value ?? p.close);
  const lo = Math.min(...vals, 100), hi = Math.max(...vals, 100);
  const pad = (hi - lo) * 0.10 || 2;
  const min = lo - pad, max = hi + pad;
  const X = (i) => CH.x + (n <= 1 ? CH.w / 2 : (CH.w * i) / (n - 1));
  const Y = (v) => CH.y + CH.h * (1 - (v - min) / (max - min || 1));

  let line = '', area = `M${X(0).toFixed(1)} ${(CH.y + CH.h).toFixed(1)}`;
  curve.forEach((p, i) => {
    const v = p.value ?? p.close;
    line += `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)} `;
    area += ` L${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
  });
  area += ` L${X(n - 1).toFixed(1)} ${(CH.y + CH.h).toFixed(1)} Z`;

  const y100 = Y(100).toFixed(1);
  const last = vals[n - 1];
  const day = d.days_live ?? n;
  const ret = s.cumulative_return_pct;
  const dd = s.max_drawdown_pct;
  const statLine = (ret != null && dd != null)
    ? `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}% since ${esc(d.since)}  ·  max drawdown ${dd.toFixed(1)}%  ·  as of ${esc(d.as_of)}`
    : `since ${esc(d.since)}  ·  as of ${esc(d.as_of)}`;

  body = `
  <text x="90" y="105" font-family="Alfa Slab One" font-size="58" fill="${C.ink}">MOCHION</text>
  <text x="${W - 90}" y="102" text-anchor="end" font-family="Special Elite" font-size="26" fill="${C.sec}">THE TAPE · updated daily</text>

  <path d="${area}" fill="${C.matcha}" opacity="0.28"/>
  <line x1="${CH.x}" y1="${y100}" x2="${CH.x + CH.w}" y2="${y100}" stroke="${C.sec}" stroke-width="2" stroke-dasharray="8 8"/>
  <path d="${line}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${X(n - 1).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="11" fill="${C.matchaDeep}" stroke="${C.cream}" stroke-width="4"/>

  <g transform="rotate(-8 ${W - 175} 205)">
    <circle cx="${W - 175}" cy="205" r="62" fill="${C.red}"/>
    <circle cx="${W - 175}" cy="205" r="54" fill="none" stroke="${C.cream}" stroke-width="2.5"/>
    <text x="${W - 175}" y="196" text-anchor="middle" font-family="Special Elite" font-size="20" fill="${C.cream}">DAY</text>
    <text x="${W - 175}" y="238" text-anchor="middle" font-family="Alfa Slab One" font-size="42" fill="${C.cream}">${esc(day)}</text>
  </g>

  <text x="90" y="530" font-family="Special Elite" font-size="27" fill="${C.ink}">${statLine}</text>
  <text x="90" y="574" font-family="Special Elite" font-size="24" fill="${C.sec}">the machine is running  ·  wins and losses, in the open</text>
  <text x="${W - 90}" y="574" text-anchor="end" font-family="Alfa Slab One" font-size="24" fill="${C.matchaDeep}">mochion.xyz</text>`;
}

const svg = svgShell(body);
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
writeFileSync(new URL('../og/tape.png', import.meta.url), resvg.render().asPng());
console.error(`og card: rendered og/tape.png (day ${d.days_live ?? '—'}, as_of ${d.as_of ?? 'no_data'})`);
