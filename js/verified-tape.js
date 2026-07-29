// Vendored from mochionxyz-beep/record-kit @ 6a20a0d0d5816c4585875e09ff3f5aa853294e8a
// https://github.com/mochionxyz-beep/record-kit/blob/6a20a0d0d5816c4585875e09ff3f5aa853294e8a/component/verified-tape.js
// To update: re-copy that file here and bump the sha above.
//
// <verified-tape> — renders a record.v1 equity curve plus its integrity
// status. Self-contained, zero runtime dependencies, Shadow DOM. Vendor
// this ONE file into your project; nothing else to fetch.
//
// READ CLAIMS.md BEFORE WIRING verify-src INTO PRODUCTION COPY. The status
// line this component renders is frozen and always ends "· self-reported" —
// see the STATUS_TEMPLATE constant below. That is not configurable, and
// that is deliberate.
//
// NOTE ON DUPLICATION: the day-outcome rule (FLAT_EPS, outcome()) below is
// a byte-for-byte port of src/rules.js in the record-kit repo, inlined here
// so this file has no import statements and can be vendored standalone.
// record-kit's own test suite parses both copies and fails if they drift —
// if you fork this file, re-verify against spec/vectors/outcome.json after
// any edit near the top of this file.

const FLAT_EPS = 0.05; // index points — see spec/params.json. Basis: close vs PREVIOUS close.

function outcome(delta) {
  return delta > FLAT_EPS ? 'green' : delta < -FLAT_EPS ? 'red' : 'flat';
}
function closeOf(p) { return p.close != null ? p.close : p.value; }
function dayDeltas(curve, prevClose) {
  return curve.map((p, i) => closeOf(p) - (i ? closeOf(curve[i - 1]) : prevClose));
}
function percentReturn(a, b) { return (a / b - 1) * 100; }
function windowStats(curve, prevClose, drawdownBasis) {
  const n = curve.length;
  if (!n) return { ret: null, maxDrawdownPct: null, bestDayPct: null, worstDayPct: null, green: 0, red: 0, flat: 0 };
  let peakClose = prevClose, peakHigh = prevClose, maxDrawdownPct = 0, bestDayPct = null, worstDayPct = null;
  let green = 0, red = 0, flat = 0, prev = prevClose;
  for (const p of curve) {
    const close = closeOf(p);
    const high = p.high != null ? p.high : close;
    if (close > peakClose) peakClose = close;
    if (high > peakHigh) peakHigh = high;
    const peak = drawdownBasis === 'high' ? peakHigh : peakClose;
    const dd = peak ? ((close - peak) / peak) * 100 : 0;
    if (dd < maxDrawdownPct) maxDrawdownPct = dd;
    const dayPct = prev ? percentReturn(close, prev) : 0;
    if (bestDayPct == null || dayPct > bestDayPct) bestDayPct = dayPct;
    if (worstDayPct == null || dayPct < worstDayPct) worstDayPct = dayPct;
    const o = outcome(close - prev);
    if (o === 'green') green++; else if (o === 'red') red++; else flat++;
    prev = close;
  }
  return { ret: prevClose ? percentReturn(closeOf(curve[n - 1]), prevClose) : null, maxDrawdownPct, bestDayPct, worstDayPct, green, red, flat };
}

// --- the frozen status template. See CLAIMS.md. Do not parameterize this away. ---
const STATUS_TEMPLATE = (days, verb) => `${days} days ${verb} · self-reported`;
const STATUS_AUDITED = (days) => `${days} days unbroken · never rewritten · self-reported`;

const CH = { W: 820, H: 316, PL: 46, PR: 16, PT: 18, PB: 48 };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STYLE = `
:host {
  --rt-ink: #26201C; --rt-paper: #E9DFC9; --rt-muted: #6b6355;
  --rt-rule: #d7ccae; --rt-rule-base: #9a8f78;
  --rt-up: #9DBB72; --rt-up-edge: #587A40;
  --rt-down: #B23A2E; --rt-down-edge: #B23A2E;
  --rt-flat: #C9BD9E; --rt-flat-edge: #6b6355;
  --rt-font-mono: "Special Elite", "Courier New", monospace;
  --rt-font-display: "Alfa Slab One", Georgia, serif;
  --rt-radius: 3px;
  --rt-band-bg: #26201C; --rt-band-fg: #E9DFC9;
  display: block; font-family: var(--rt-font-mono); color: var(--rt-ink);
}
* { box-sizing: border-box; }
.rt-live { background: var(--rt-paper); padding: 0 16px 12px; position: relative; }
.rt-waiting { background: var(--rt-paper); padding: 34px 22px; text-align: center; }
.rt-band {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  background: var(--rt-band-bg); color: var(--rt-band-fg); margin: 0 -16px 12px; padding: 9px 14px;
  font-size: .74em; letter-spacing: .05em; text-transform: uppercase;
}
.rt-band__live { font-weight: bold; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.rt-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--rt-up); display: inline-block; animation: rtpulse 2s ease-in-out infinite; }
@keyframes rtpulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.rt-band__win { display: inline-flex; gap: 6px; }
.rt-wbtn {
  font-family: var(--rt-font-mono); font-size: 1em; letter-spacing: .05em; text-transform: uppercase;
  background: none; border: 1.5px solid var(--rt-muted); color: var(--rt-flat); padding: 2px 9px;
  cursor: pointer; border-radius: var(--rt-radius);
}
.rt-wbtn.is-on { background: var(--rt-up); border-color: var(--rt-up); color: #141414; font-weight: bold; }
.rt-wbtn:hover { border-color: var(--rt-paper); color: var(--rt-paper); }
.rt-wbtn.is-on:hover { color: #141414; }
.rt-band__next { color: var(--rt-flat); white-space: nowrap; }
.rt-cd { font-weight: bold; color: var(--rt-up-edge); }
.rt-chart { display: block; width: 100%; height: auto; margin-bottom: 8px; cursor: crosshair; touch-action: pan-y; }
.rt-ax { font-family: var(--rt-font-mono); font-size: 12px; fill: var(--rt-muted); }
.rt-grid { stroke: var(--rt-rule); stroke-width: 1; }
.rt-grid--base { stroke: var(--rt-rule-base); stroke-dasharray: 4 4; }
.rt-cursor { stroke: var(--rt-muted); stroke-width: 1; stroke-dasharray: 2 3; pointer-events: none; }
.rt-tick { pointer-events: none; }
.rt-candle--up { fill: var(--rt-up); stroke: var(--rt-up-edge); }
.rt-candle--down { fill: var(--rt-down); stroke: var(--rt-down-edge); }
.rt-candle--flat { fill: var(--rt-flat); stroke: var(--rt-flat-edge); }
.rt-tip {
  position: absolute; pointer-events: none; background: var(--rt-band-bg); color: var(--rt-band-fg);
  font-family: var(--rt-font-mono); font-size: .72em; letter-spacing: .02em; padding: 3px 8px;
  border-radius: var(--rt-radius); white-space: nowrap; z-index: 3; box-shadow: 2px 2px 0 rgba(0,0,0,.25);
}
.rt-hero { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; margin: 10px 4px 4px; }
.rt-stat { text-align: center; }
.rt-stat b { display: block; font-family: var(--rt-font-display); font-size: 1.3em; line-height: 1; color: var(--rt-ink); }
.rt-stat span { display: block; font-size: .62em; letter-spacing: .03em; text-transform: uppercase; color: var(--rt-muted); margin-top: 4px; line-height: 1.2; }
.rt-stat--hero b { font-size: 2.1em; }
.rt-stat--hero span { font-size: .7em; margin-top: 6px; }
.rt-summary { display: grid; grid-template-columns: repeat(auto-fit,minmax(92px,1fr)); gap: 12px 8px; margin: 8px 4px 2px; }
.rt-basis, .rt-stamp { font-size: .72em; color: var(--rt-muted); text-align: center; margin: 6px 12px 0; }
.rt-caveat { font-size: .76em; color: var(--rt-down); text-align: center; margin: 8px 12px 0; }
.rt-integrity { font-size: .74em; color: var(--rt-muted); text-align: center; margin: 10px 12px 0; padding-top: 8px; border-top: 1px solid var(--rt-rule); }
.rt-integrity b { color: var(--rt-ink); }
.rt-integrity a { color: inherit; }
.rt-share { font-size: .78em; text-align: center; margin: 10px 12px 0; }
.rt-share a { color: var(--rt-up-edge); text-decoration: none; border-bottom: 1.5px dashed var(--rt-up-edge); }
`;

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function pct(v, dp) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(dp == null ? 2 : dp) + '%'; }
function shortDate(iso) { const p = String(iso).split('-'); return p.length === 3 ? `${MON[+p[1] - 1]} ${+p[2]}` : iso; }
function X(i, n) { return CH.PL + (CH.W - CH.PL - CH.PR) * (n <= 1 ? 0.5 : i / (n - 1)); }
function niceTicks(lo, hi, n) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export class VerifiedTape extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'verify-src', 'window', 'windows', 'theme', 'deep-link', 'deep-link-prefix', 'countdown', 'cadence-hours', 'share', 'max-report-age', 'witnessed'];
  }

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._data = null;
    this._verify = null;
    this._win = this.getAttribute('window') || '90';
    this._pinned = null;
    this._cdTimer = null;
    this._abort = null;
  }

  connectedCallback() {
    this._root.innerHTML = `<style>${STYLE}</style><div class="rt-host"></div>`;
    this._renderWaiting();
    this._load();
  }

  disconnectedCallback() {
    if (this._cdTimer) clearInterval(this._cdTimer);
    if (this._abort) this._abort.abort();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'window') { this._win = newV || '90'; if (this._data) this._render(); }
    if (name === 'src' || name === 'verify-src') this._load();
  }

  get windows() {
    const attr = this.getAttribute('windows');
    return (attr ? attr.split(',') : ['30', '90', '180', '360', 'ytd', 'all']).map((w) => w.trim());
  }

  async _load() {
    const src = this.getAttribute('src');
    if (!src) return this._renderError('no src attribute set');
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();
    try {
      const res = await fetch(src, { cache: 'no-store', signal: this._abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._data = await res.json();
      this.dispatchEvent(new CustomEvent('record-load', { detail: this._data }));
    } catch (e) {
      if (e.name === 'AbortError') return;
      this.dispatchEvent(new CustomEvent('record-error', { detail: e }));
      return this._renderError('could not load the record — refresh to retry');
    }

    const verifySrc = this.getAttribute('verify-src');
    if (verifySrc) {
      try {
        const res = await fetch(verifySrc, { cache: 'no-store', signal: this._abort.signal });
        if (res.ok) this._verify = await res.json();
      } catch { /* absent verify.json degrades gracefully — see _integrityLine */ }
    }

    this._applyHash();
    this._render();
  }

  _host() { return this._root.querySelector('.rt-host'); }

  _renderWaiting(note) {
    this._host().innerHTML = `<div class="rt-waiting"><b><slot name="empty">The record prints here.</slot></b></div>`;
  }
  _renderError(msg) {
    this._host().innerHTML = `<div class="rt-waiting"><slot name="error">${esc(msg)}</slot></div>`;
  }

  _windowSlice(full) {
    let win;
    const w = this._win;
    if (w === 'all') win = full;
    else if (w === 'ytd') {
      const yr = String((full[full.length - 1] || {}).date || '').slice(0, 4);
      win = full.filter((p) => String(p.date).slice(0, 4) === yr);
      if (!win.length) win = full;
    } else {
      const n = parseInt(w, 10) || full.length;
      win = full.length > n ? full.slice(-n) : full;
    }
    const idx = full.indexOf(win[0]) - 1;
    const prev = idx >= 0 ? closeOf(full[idx]) : 100;
    return { win, prevClose: prev };
  }

  _winLabel(since) {
    const w = this._win;
    return w === 'all' ? `since ${since || 'start'}` : w === 'ytd' ? 'year to date' : `last ${w} days`;
  }

  _integrityLine(days) {
    const maxAge = Number(this.getAttribute('max-report-age') || 48);
    const v = this._verify;
    const fresh = v && v.generated_at && (Date.now() - new Date(v.generated_at).getTime()) < maxAge * 3600000;
    const allPass = v && v.claims && Object.values(v.claims).every((x) => x === 'pass');
    const showWitnessed = this.hasAttribute('witnessed');

    let statusText, reproduce = '';
    if (fresh && allPass) {
      statusText = STATUS_AUDITED(days);
      reproduce = v.subject?.target ? ` <a href="#" class="rt-reproduce" data-cmd="npx record-verify ${esc(v.subject.target)}">reproduce this →</a>` : '';
    } else {
      statusText = STATUS_TEMPLATE(days, 'published');
    }

    let witnessedPart = '';
    if (showWitnessed && v && v.stats && v.stats.days_witnessed != null) {
      witnessedPart = ` <span class="rt-witnessed">· ${v.stats.days_witnessed} witnessed live</span>`;
    }

    // NOTE the default here is deliberately plain text, not a hyperlink — a relative
    // "CLAIMS.md" href would resolve against the HOST PAGE's URL (Shadow-DOM-injected
    // links resolve against the document, not this file's own location), which is
    // almost never where record-kit's docs actually live. Adopters should override
    // the `limits` slot with a real link once they know where their copy of
    // CLAIMS.md is served from.
    return `<div class="rt-integrity" part="rt-integrity"><b>${esc(statusText)}</b>${witnessedPart}${reproduce}<br><slot name="limits">see CLAIMS.md in record-kit for what this does and doesn't prove</slot></div>`;
  }

  _chartSVG(curve, prevClose) {
    const n = curve.length;
    const ohlc = curve[0] && curve[0].high != null && curve[0].low != null && curve[0].open != null && curve[0].close != null;
    const useCandles = ohlc && n <= 120;
    const lows = [], highs = [];
    curve.forEach((p) => {
      lows.push(useCandles ? p.low : closeOf(p));
      highs.push(useCandles ? p.high : closeOf(p));
    });
    let min = Math.min(...lows), max = Math.max(...highs);
    const base = prevClose || 100;
    min = Math.min(min, base); max = Math.max(max, base);
    const pad = (max - min) * 0.12 || 2; min -= pad; max += pad;
    const Y = (v) => CH.PT + (CH.H - CH.PT - CH.PB) * (1 - (v - min) / (max - min || 1));
    const dd = dayDeltas(curve, prevClose);
    let body = '';

    if (useCandles) {
      const cw = Math.max(2, Math.min(14, (CH.W - CH.PL - CH.PR) / n * 0.62));
      curve.forEach((p, i) => {
        const cls = outcome(dd[i]) === 'green' ? 'rt-candle--up' : outcome(dd[i]) === 'red' ? 'rt-candle--down' : 'rt-candle--flat';
        const x = X(i, n), yo = Y(p.open), yc = Y(p.close), top = Math.min(yo, yc), bh = Math.max(1.2, Math.abs(yc - yo));
        body += `<line x1="${x.toFixed(1)}" y1="${Y(p.high).toFixed(1)}" x2="${x.toFixed(1)}" y2="${Y(p.low).toFixed(1)}" class="${cls}" stroke-width="1.2"/>` +
          `<rect x="${(x - cw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${cw.toFixed(1)}" height="${bh.toFixed(1)}" class="${cls}" stroke-width="1"/>`;
      });
    } else {
      let line = '', area = `M${X(0, n).toFixed(1)} ${Y(min).toFixed(1)}`;
      curve.forEach((p, i) => {
        const v = closeOf(p);
        line += `${i ? 'L' : 'M'}${X(i, n).toFixed(1)} ${Y(v).toFixed(1)} `;
        area += ` L${X(i, n).toFixed(1)} ${Y(v).toFixed(1)}`;
      });
      area += ` L${X(n - 1, n).toFixed(1)} ${Y(min).toFixed(1)} Z`;
      body = `<path d="${area}" class="rt-candle--up" opacity="0.2"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    let grid = '';
    niceTicks((min - base) / base * 100, (max - base) / base * 100, 4).forEach((t) => {
      const raw = base * (1 + t / 100), yy = Y(raw), isBase = Math.abs(t) < 1e-6;
      grid += `<line x1="${CH.PL}" y1="${yy.toFixed(1)}" x2="${CH.W - CH.PR}" y2="${yy.toFixed(1)}" class="rt-grid${isBase ? ' rt-grid--base' : ''}"/>` +
        `<text x="${CH.PL - 6}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" class="rt-ax">${t > 0 ? '+' : ''}${Math.round(t * 10) / 10}%</text>`;
    });
    const xn = Math.min(6, n), xstep = (n - 1) / (xn - 1 || 1);
    for (let k = 0; k < xn; k++) {
      const xi = Math.round(k * xstep), xx = X(xi, n);
      grid += `<line x1="${xx.toFixed(1)}" y1="${CH.PT}" x2="${xx.toFixed(1)}" y2="${CH.H - CH.PB}" class="rt-grid"/>` +
        `<text x="${xx.toFixed(1)}" y="${CH.H - 9}" text-anchor="${k === 0 ? 'start' : k === xn - 1 ? 'end' : 'middle'}" class="rt-ax">${esc(shortDate(curve[xi].date))}</text>`;
    }

    let ticks = '';
    const tw = useCandles ? Math.max(2, Math.min(14, (CH.W - CH.PL - CH.PR) / n * 0.62)) : Math.max(1.5, (CH.W - CH.PL - CH.PR) / n * 0.8);
    const ty = CH.H - CH.PB + 8;
    dd.forEach((delta, i) => {
      const cls = outcome(delta) === 'green' ? 'rt-candle--up' : outcome(delta) === 'red' ? 'rt-candle--down' : 'rt-candle--flat';
      ticks += `<rect class="rt-tick ${cls}" data-i="${i}" x="${(X(i, n) - tw / 2).toFixed(1)}" y="${ty}" width="${tw.toFixed(1)}" height="7"/>`;
    });

    return `<svg class="rt-chart" part="rt-chart" viewBox="0 0 ${CH.W} ${CH.H}" role="img" aria-label="Account equity — percent change over the selected window, starting at 0%">` +
      grid + body + ticks + `<line class="rt-cursor" y1="${CH.PT}" y2="${CH.H - CH.PB}" style="display:none"/></svg>`;
  }

  _wireChart(curve, base) {
    const host = this._root.querySelector('.rt-live'), svg = this._root.querySelector('.rt-chart');
    if (!host || !svg) return;
    const n = curve.length, cursor = svg.querySelector('.rt-cursor');
    const tip = document.createElement('div'); tip.className = 'rt-tip'; tip.style.display = 'none';
    host.appendChild(tip);
    const showAt = (i, clientX, clientY) => {
      i = Math.max(0, Math.min(n - 1, i));
      const p = curve[i], b = base || 100, close = closeOf(p);
      const rel = (v) => (v - b) / b * 100, sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
      const cx = X(i, n);
      cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.style.display = '';
      const extra = p.high != null ? `  ·  H ${sgn(rel(p.high))} L ${sgn(rel(p.low))}` : '';
      tip.innerHTML = `<b>${esc(p.date)}</b>  ${sgn(rel(close))}${extra}`;
      tip.style.display = '';
      const hr = host.getBoundingClientRect(), r = svg.getBoundingClientRect();
      const lx = (clientX != null ? clientX : r.left + (cx / CH.W) * r.width) - hr.left;
      const ly = (clientY != null ? clientY : r.top + r.height * 0.35) - hr.top;
      tip.style.left = Math.max(4, Math.min(hr.width - tip.offsetWidth - 4, lx + 12)) + 'px';
      tip.style.top = Math.max(2, ly - 34) + 'px';
      return p;
    };
    const idxFromEvent = (e) => {
      const r = svg.getBoundingClientRect();
      return Math.round(((e.clientX - r.left) / r.width * CH.W - CH.PL) / (CH.W - CH.PL - CH.PR) * (n - 1));
    };
    const hide = () => { tip.style.display = 'none'; if (cursor) cursor.style.display = 'none'; };
    svg.addEventListener('pointermove', (e) => showAt(idxFromEvent(e), e.clientX, e.clientY));
    svg.addEventListener('pointerdown', (e) => {
      const p = showAt(idxFromEvent(e), e.clientX, e.clientY);
      if (this.hasAttribute('deep-link') && p) {
        const prefix = this.getAttribute('deep-link-prefix') || 'tape';
        try { history.replaceState(null, '', `#${prefix}-${p.date}`); } catch { /* ignore */ }
      }
      this.dispatchEvent(new CustomEvent('day-select', { detail: p }));
      if (svg.setPointerCapture) { try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    });
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    this._root.addEventListener('pointerdown', (e) => { if (!svg.contains(e.target)) hide(); });
    if (this._pinned) {
      const pi = curve.findIndex((p) => p.date === this._pinned);
      if (pi >= 0) showAt(pi);
      this._pinned = null;
    }
  }

  _startCountdown(generatedAt) {
    if (!this.hasAttribute('countdown')) return;
    const span = this._root.querySelector('.rt-cd');
    const gen = generatedAt ? new Date(generatedAt) : null;
    if (!span || !gen || isNaN(gen.getTime())) return;
    const cadenceH = Number(this.getAttribute('cadence-hours') || 24);
    const tick = () => {
      if (!span.isConnected) { clearInterval(this._cdTimer); return; }
      let next = gen.getTime() + cadenceH * 3600000;
      const now = Date.now();
      while (next <= now) next += cadenceH * 3600000;
      const s = Math.max(0, Math.floor((next - now) / 1000));
      span.textContent = `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
    };
    tick();
    if (this._cdTimer) clearInterval(this._cdTimer);
    this._cdTimer = setInterval(tick, 1000);
  }

  _stat(v, label, hero) {
    return `<div class="rt-stat${hero ? ' rt-stat--hero' : ''}"><b>${v}</b><span>${esc(label)}</span></div>`;
  }

  _render() {
    const d = this._data;
    if (!d || d.status === 'no_data') return this._renderWaiting(d && d.note);
    try {
      const full = d.equity_curve || [];
      const sl = this._windowSlice(full);
      const ws = windowStats(sl.win, sl.prevClose, d.basis?.drawdown === 'high' ? 'high' : 'close');
      const chart = sl.win.length ? this._chartSVG(sl.win, sl.prevClose) : '';
      const day = d.days_live != null ? d.days_live : full.length;
      const caveat = d.data_quality && d.data_quality.realized_reconciles === false
        ? `<p class="rt-caveat">⚠ the newest snapshot didn't fully reconcile with the ledger — treat as provisional.</p>` : '';
      const stamp = `since ${esc(d.since || '—')} · generated ${esc((d.generated_at || '').replace('T', ' ').slice(0, 16))} UTC`;
      const basis = d.basis ? `${esc(d.basis.pnl)} · ${esc(d.basis.scope)}` : '';
      const wbtn = this.windows.map((w) => {
        const label = w === 'ytd' ? 'YTD' : w === 'all' ? 'all' : w;
        return `<button type="button" class="rt-wbtn${this._win === w ? ' is-on' : ''}" data-w="${w}">${esc(label)}</button>`;
      }).join('');

      this._host().innerHTML = `<div class="rt-live" part="rt-live">
          <div class="rt-band" part="rt-band">
            <span class="rt-band__live"><i class="rt-dot" aria-hidden="true"></i>LIVE · DAY ${esc(day)}</span>
            <span class="rt-band__win" role="group" aria-label="chart window">${wbtn}</span>
            ${this.hasAttribute('countdown') ? `<span class="rt-band__next">next print in <span class="rt-cd">—</span></span>` : ''}
          </div>
          ${chart}
          <div class="rt-hero" part="rt-hero">
            ${this._stat(pct(ws.ret), 'return · ' + this._winLabel(d.since), true)}
            ${this._stat(pct(ws.maxDrawdownPct), 'max drawdown · ' + this._winLabel(d.since), true)}
          </div>
          <div class="rt-summary">
            ${this._stat(pct(ws.bestDayPct), 'best day')}
            ${this._stat(pct(ws.worstDayPct), 'worst day')}
            ${this._stat(String(ws.green), 'green days')}
            ${this._stat(String(ws.red), 'red days')}
            ${this._stat(String(ws.flat), 'flat days')}
          </div>${caveat}
          ${basis ? `<p class="rt-basis">${basis}</p>` : ''}
          <p class="rt-stamp">${stamp}</p>
          ${this._integrityLine(day)}
          <slot name="footer"></slot>
        </div>`;

      if (chart) this._wireChart(sl.win, sl.prevClose);
      this._startCountdown(d.generated_at);
      this._root.querySelectorAll('.rt-wbtn').forEach((b) => {
        b.addEventListener('click', () => {
          this._win = b.getAttribute('data-w');
          this.setAttribute('window', this._win);
          this.dispatchEvent(new CustomEvent('window-change', { detail: this._win }));
          this._render();
        });
      });
    } catch (err) {
      this._renderError('hit a snag rendering — the record itself is unaffected. Refresh to retry.');
    }
  }

  _applyHash() {
    if (!this.hasAttribute('deep-link')) return false;
    const prefix = this.getAttribute('deep-link-prefix') || 'tape';
    const m = new RegExp(`^#${prefix}-(\\d{4}-\\d{2}-\\d{2})$`).exec(location.hash || '');
    if (!m || !this._data || !this._data.equity_curve) return false;
    const date = m[1], full = this._data.equity_curve;
    let exists = false;
    full.forEach((p) => { if (p.date === date) exists = true; });
    if (!exists) return false;
    let inWin = false;
    this._windowSlice(full).win.forEach((p) => { if (p.date === date) inWin = true; });
    if (!inWin) { this._win = 'all'; this.setAttribute('window', 'all'); }
    this._pinned = date;
    return true;
  }
}

if (!customElements.get('verified-tape')) customElements.define('verified-tape', VerifiedTape);
