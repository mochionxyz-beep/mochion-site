/* Mochion — The Tape. Renders /data/public.json into #tape-panel.
   Vanilla JS, no deps, no CDN. The site's own honest track-record panel.
   Schema: see site/docs/telemetry.md (source of truth = the box exporter). */
(function () {
  'use strict';
  var el = document.getElementById('tape-panel');
  if (!el) return;

  var C = { ink: '#26201C', sec: '#6b6355', matcha: '#9DBB72', matchaDeep: '#587A40', paper: '#E9DFC9' };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pct(v, dp) { return (v == null) ? '—' : (v > 0 ? '+' : '') + v.toFixed(dp == null ? 2 : dp) + '%'; }

  function waiting(note) {
    el.innerHTML =
      '<div class="tape-waiting"><b>The Tape prints here.</b><span>' +
      esc(note || 'Waiting for the first honest day — the machine reports through yesterday, wins and losses, straight from the system.') +
      '</span></div>';
  }

  function chartSVG(curve) {
    var W = 820, H = 300, PL = 46, PR = 16, PT = 18, PB = 32, n = curve.length;
    var vals = curve.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals.concat([100])), max = Math.max.apply(null, vals.concat([100]));
    var pad = (max - min) * 0.12 || 2; min -= pad; max += pad;
    function X(i) { return PL + (W - PL - PR) * (n <= 1 ? 0.5 : i / (n - 1)); }
    function Y(v) { return PT + (H - PT - PB) * (1 - (v - min) / (max - min || 1)); }
    var line = '', area = '';
    curve.forEach(function (p, i) { line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1) + ' '; });
    area = 'M' + X(0).toFixed(1) + ' ' + Y(min).toFixed(1) + ' ' +
      curve.map(function (p, i) { return 'L' + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1); }).join(' ') +
      ' L' + X(n - 1).toFixed(1) + ' ' + Y(min).toFixed(1) + ' Z';
    var y100 = Y(100).toFixed(1), last = curve[n - 1];
    return '<svg class="tape-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Equity curve, indexed to 100 at start">' +
      '<path d="' + area + '" fill="' + C.matcha + '" opacity="0.2"/>' +
      '<line x1="' + PL + '" y1="' + y100 + '" x2="' + (W - PR) + '" y2="' + y100 + '" stroke="' + C.sec + '" stroke-width="1" stroke-dasharray="4 4"/>' +
      '<text x="' + (PL - 7) + '" y="' + (+y100 + 4) + '" text-anchor="end" class="tape-ax">100</text>' +
      '<path d="' + line + '" fill="none" stroke="' + C.ink + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(last.value).toFixed(1) + '" r="4.5" fill="' + C.matchaDeep + '" stroke="' + C.paper + '" stroke-width="1.5"/>' +
      '<text x="' + PL + '" y="' + (H - 11) + '" class="tape-ax">' + esc(curve[0].date) + '</text>' +
      '<text x="' + (W - PR) + '" y="' + (H - 11) + '" text-anchor="end" class="tape-ax">' + esc(last.date) + '</text>' +
    '</svg>';
  }

  function stat(v, label) { return '<div class="tape-stat"><b>' + v + '</b><span>' + esc(label) + '</span></div>'; }

  function render(d) {
    if (!d || d.status === 'no_data') { waiting(d && d.note); return; }
    var s = d.summary || {};
    var chart = (d.equity_curve && d.equity_curve.length) ? chartSVG(d.equity_curve) : '';
    var caveat = (d.data_quality && d.data_quality.realized_reconciles === false)
      ? '<p class="tape-caveat">⚠ this curve didn’t fully reconcile with the ledger — treat as provisional.</p>' : '';
    var stamp = 'live since ' + esc(d.since || '—') + ' · ' + esc(d.days_live != null ? d.days_live + ' days' : '—') +
      ' · generated ' + esc((d.generated_at || '').replace('T', ' ').slice(0, 16)) + ' UTC';
    var basis = d.basis ? (esc(d.basis.pnl) + ' · ' + esc(d.basis.scope) + ' · ' + esc(d.basis.returns)) : '';
    el.innerHTML =
      '<div class="tape-live">' + chart +
        '<div class="tape-summary">' +
          stat(pct(s.cumulative_return_pct), 'return since ' + (d.since || 'start')) +
          stat(pct(s.max_drawdown_pct), 'max drawdown') +
          stat(s.win_rate_pct == null ? '—' : s.win_rate_pct.toFixed(0) + '%', 'win rate') +
          stat(s.profit_factor == null ? '—' : s.profit_factor.toFixed(2), 'profit factor') +
          stat(s.closed_trades == null ? '—' : String(s.closed_trades), 'closed trades') +
          stat(pct(s.best_day_pct), 'best day') +
          stat(pct(s.worst_day_pct), 'worst day') +
        '</div>' + caveat +
        (basis ? '<p class="tape-basis">' + basis + '</p>' : '') +
        '<p class="tape-stamp">' + stamp + '</p>' +
      '</div>';
  }

  fetch('data/public.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(render)
    .catch(function () { waiting(); });
})();
