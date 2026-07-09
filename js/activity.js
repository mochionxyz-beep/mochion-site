/* Mochion — build activity feed. Renders /data/activity.json into #activity-panel.
   Vanilla JS, no deps, no CDN. Reuses the .tape-* styles. Schema: mochion.activity.v1. */
(function () {
  'use strict';
  var el = document.getElementById('activity-panel');
  if (!el) return;
  var C = { sec: '#6b6355', matcha: '#9DBB72' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); }

  function waiting(note) {
    el.innerHTML = '<div class="tape-waiting"><b>The build feed prints here.</b><span>' +
      esc(note || 'Waiting for the first counts — commits and lines, tallied weekly across the build.') + '</span></div>';
  }

  function bars(weekly) {
    var W = 820, H = 200, PL = 16, PR = 16, PT = 16, PB = 26, n = weekly.length;
    var max = Math.max.apply(null, weekly.map(function (w) { return w.commits || 0; }).concat([1]));
    var bw = (W - PL - PR) / n, gap = Math.min(6, bw * 0.28), svg = '';
    weekly.forEach(function (w, i) {
      var h = (H - PT - PB) * ((w.commits || 0) / max);
      var x = (PL + i * bw + gap / 2).toFixed(1), y = (H - PB - h).toFixed(1);
      svg += '<rect x="' + x + '" y="' + y + '" width="' + (bw - gap).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5" fill="' + C.matcha + '"/>';
    });
    return '<svg class="tape-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Weekly commit activity">' +
      '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="' + C.sec + '" stroke-width="1"/>' +
      svg +
      '<text x="' + PL + '" y="' + (H - 8) + '" class="tape-ax">' + esc(weekly[0].week_start || '') + '</text>' +
      '<text x="' + (W - PR) + '" y="' + (H - 8) + '" text-anchor="end" class="tape-ax">' + esc(weekly[n - 1].week_start || '') + '</text>' +
    '</svg>';
  }

  function stat(v, l) { return '<div class="tape-stat"><b>' + v + '</b><span>' + esc(l) + '</span></div>'; }

  function render(d) {
    if (!d || d.status === 'no_data' || !d.weekly || !d.weekly.length) { waiting(d && d.note); return; }
    var t = d.totals || {};
    var stamp = (d.last_commit_at ? 'last commit ' + esc((d.last_commit_at || '').replace('T', ' ').slice(0, 16)) + ' · ' : '') +
      'generated ' + esc((d.generated_at || '').replace('T', ' ').slice(0, 16)) + ' UTC';
    el.innerHTML = '<div class="tape-live">' + bars(d.weekly) +
      '<div class="tape-summary">' +
        stat(num(t.commits), 'commits') +
        stat('+' + num(t.loc_added), 'lines added') +
        stat('−' + num(t.loc_removed), 'lines removed') +
        stat(num(d.repos_counted), 'repos') +
      '</div>' +
      '<p class="tape-stamp">' + stamp + '</p>' +
    '</div>';
  }

  fetch('data/activity.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(render)
    .catch(function () { waiting(); });
})();
