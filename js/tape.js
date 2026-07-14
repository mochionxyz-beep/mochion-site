/* Mochion — The Tape (panel v2). Renders /data/public.json into #tape-panel.
   Vanilla JS, no deps, no CDN. One visual system with the share card:
   ink status band (LIVE · DAY N · window toggle · countdown) → candles over a
   rolling window → outcome ticks column-locked under each candle → hero honesty
   pair (return + max drawdown) → secondary stats → share line.
   ONE day-outcome rule everywhere (close vs prev close, ±0.05 = flat) — matches
   ci/og-tape.mjs and the posting bot. Deep links: #tape-YYYY-MM-DD.
   Schema: site/docs/telemetry.md (source of truth = the box exporter). */
(function () {
  'use strict';
  var el = document.getElementById('tape-panel');
  if (!el) return;

  var C = { ink: '#26201C', sec: '#6b6355', matcha: '#9DBB72', matchaDeep: '#587A40', red: '#B23A2E', paper: '#E9DFC9', sand: '#C9BD9E' };
  var CH = { W: 820, H: 316, PL: 46, PR: 16, PT: 18, PB: 48 };   // PB holds ticks + date labels
  var DATA = null;            // parsed public.json
  var WIN = '90';             // '30'|'90'|'180'|'360'|'ytd'|'all'
  var PINNED = null;          // deep-linked date to highlight

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(v, dp) { return (v == null) ? '—' : (v > 0 ? '+' : '') + v.toFixed(dp == null ? 2 : dp) + '%'; }

  function waiting(note) {
    el.innerHTML = '<div class="tape-waiting"><b>The Tape prints here.</b><span>' +
      esc(note || 'Waiting for the first honest day — the machine reports through yesterday, wins and losses, straight from the system.') +
      '</span></div>';
  }

  function X(i, n) { return CH.PL + (CH.W - CH.PL - CH.PR) * (n <= 1 ? 0.5 : i / (n - 1)); }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(iso) { var p = String(iso).split('-'); return p.length === 3 ? MON[+p[1] - 1] + ' ' + (+p[2]) : iso; }
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) return [lo];
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, ticks = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return ticks;
  }

  // ---- the ONE day-outcome rule (shared with the card + the posting bot) ----
  function outcomeCol(delta) {
    return delta > 0.05 ? { fill: C.matcha, stroke: C.matchaDeep }
      : delta < -0.05 ? { fill: C.red, stroke: C.red }
      : { fill: C.sand, stroke: C.sec };
  }
  function deltasOf(curve, prevClose) {
    return curve.map(function (p, i) {
      var prev = i ? (curve[i - 1].close != null ? curve[i - 1].close : curve[i - 1].value) : prevClose;
      return (p.close != null ? p.close : p.value) - prev;
    });
  }
  function windowSlice(full) {
    var win;
    if (WIN === 'all') win = full;
    else if (WIN === 'ytd') {
      // year of the record's last day (not wall clock) — stable across timezones
      var yr = String((full[full.length - 1] || {}).date || '').slice(0, 4);
      win = full.filter(function (p) { return String(p.date).slice(0, 4) === yr; });
      if (!win.length) win = full;
    } else {
      var n = parseInt(WIN, 10) || full.length;
      win = full.length > n ? full.slice(-n) : full;
    }
    var idx = full.indexOf(win[0]) - 1;
    var prev = idx >= 0 ? (full[idx].close != null ? full[idx].close : full[idx].value) : 100;
    return { win: win, prevClose: prev };
  }

  // ---- chart (candles + grid + %-axis + ticks row), all in one SVG ----
  function chartSVG(curve, prevClose) {
    var n = curve.length;
    var ohlc = curve[0] && curve[0].high != null && curve[0].low != null && curve[0].open != null && curve[0].close != null;
    var useCandles = ohlc && n <= 120;             // beyond ~120 days candles are slivers → line
    var lows = [], highs = [];
    curve.forEach(function (p) {
      lows.push(useCandles ? p.low : (p.value != null ? p.value : p.close));
      highs.push(useCandles ? p.high : (p.value != null ? p.value : p.close));
    });
    var min = Math.min.apply(null, lows), max = Math.max.apply(null, highs);
    var pad = (max - min) * 0.12 || 2; min -= pad; max += pad;
    function Y(v) { return CH.PT + (CH.H - CH.PT - CH.PB) * (1 - (v - min) / (max - min || 1)); }
    var last = curve[n - 1], dd = deltasOf(curve, prevClose), body = '';

    if (useCandles) {
      var cw = Math.max(2, Math.min(14, (CH.W - CH.PL - CH.PR) / n * 0.62));
      curve.forEach(function (p, i) {
        var col = outcomeCol(dd[i]);
        var x = X(i, n), yo = Y(p.open), yc = Y(p.close), top = Math.min(yo, yc), bh = Math.max(1.2, Math.abs(yc - yo));
        body += '<line x1="' + x.toFixed(1) + '" y1="' + Y(p.high).toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + Y(p.low).toFixed(1) + '" stroke="' + col.stroke + '" stroke-width="1.2"/>' +
          '<rect x="' + (x - cw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + cw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + col.fill + '" stroke="' + col.stroke + '" stroke-width="1"/>';
      });
    } else {
      var line = '', area = 'M' + X(0, n).toFixed(1) + ' ' + Y(min).toFixed(1);
      curve.forEach(function (p, i) {
        var v = p.value != null ? p.value : p.close;
        line += (i ? 'L' : 'M') + X(i, n).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ';
        area += ' L' + X(i, n).toFixed(1) + ' ' + Y(v).toFixed(1);
      });
      area += ' L' + X(n - 1, n).toFixed(1) + ' ' + Y(min).toFixed(1) + ' Z';
      body = '<path d="' + area + '" fill="' + C.matcha + '" opacity="0.2"/><path d="' + line + '" fill="none" stroke="' + C.ink + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + X(n - 1, n).toFixed(1) + '" cy="' + Y(last.value != null ? last.value : last.close).toFixed(1) + '" r="4.5" fill="' + C.matchaDeep + '" stroke="' + C.paper + '" stroke-width="1.5"/>';
    }

    // gridlines + ticks: y-axis = % change from the 100 start; x-axis = dates at intervals
    var grid = '';
    niceTicks(min - 100, max - 100, 4).forEach(function (t) {
      var yy = Y(100 + t), base = Math.abs(t) < 1e-6;
      grid += '<line x1="' + CH.PL + '" y1="' + yy.toFixed(1) + '" x2="' + (CH.W - CH.PR) + '" y2="' + yy.toFixed(1) + '" class="tape-grid' + (base ? ' tape-grid--base' : '') + '"/>' +
        '<text x="' + (CH.PL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end" class="tape-ax">' + (t > 0 ? '+' : '') + (Math.round(t * 10) / 10) + '%</text>';
    });
    var xn = Math.min(6, n), xstep = (n - 1) / (xn - 1 || 1);
    for (var k = 0; k < xn; k++) {
      var xi = Math.round(k * xstep), xx = X(xi, n);
      grid += '<line x1="' + xx.toFixed(1) + '" y1="' + CH.PT + '" x2="' + xx.toFixed(1) + '" y2="' + (CH.H - CH.PB) + '" class="tape-grid"/>' +
        '<text x="' + xx.toFixed(1) + '" y="' + (CH.H - 9) + '" text-anchor="' + (k === 0 ? 'start' : k === xn - 1 ? 'end' : 'middle') + '" class="tape-ax">' + esc(shortDate(curve[xi].date)) + '</text>';
    }

    // outcome ticks — EXACTLY under each candle (same X, same width, same color rule)
    var ticks = '';
    var tw = useCandles ? Math.max(2, Math.min(14, (CH.W - CH.PL - CH.PR) / n * 0.62)) : Math.max(1.5, (CH.W - CH.PL - CH.PR) / n * 0.8);
    var ty = CH.H - CH.PB + 8;
    dd.forEach(function (delta, i) {
      ticks += '<rect class="tape-tick" data-i="' + i + '" x="' + (X(i, n) - tw / 2).toFixed(1) + '" y="' + ty + '" width="' + tw.toFixed(1) + '" height="7" fill="' + outcomeCol(delta).fill + '"/>';
    });

    return '<svg class="tape-chart" viewBox="0 0 ' + CH.W + ' ' + CH.H + '" role="img" aria-label="Account equity, percent change from the start (indexed to 100)">' +
      grid + body + ticks +
      '<line class="tape-cursor" y1="' + CH.PT + '" y2="' + (CH.H - CH.PB) + '" style="display:none"/>' +
    '</svg>';
  }

  // ---- hover/touch: guide line + tooltip; taps update the deep link ----
  function wireChart(curve) {
    var host = el.querySelector('.tape-live'), svg = el.querySelector('.tape-chart');
    if (!host || !svg) return;
    var n = curve.length, cursor = svg.querySelector('.tape-cursor');
    var tip = document.createElement('div'); tip.className = 'tape-tip'; tip.style.display = 'none';
    host.appendChild(tip);
    function showAt(i, clientX, clientY) {
      i = Math.max(0, Math.min(n - 1, i));
      var p = curve[i], close = (p.close != null ? p.close : p.value), ret = close - 100, cx = X(i, n);
      cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.style.display = '';
      var extra = (p.high != null) ? ('  ·  H ' + p.high.toFixed(2) + ' L ' + p.low.toFixed(2)) : '';
      tip.innerHTML = '<b>' + esc(p.date) + '</b>  ' + (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%' + extra;
      tip.style.display = '';
      var hr = host.getBoundingClientRect(), r = svg.getBoundingClientRect();
      var lx = (clientX != null ? clientX : r.left + (cx / CH.W) * r.width) - hr.left;
      var ly = (clientY != null ? clientY : r.top + r.height * 0.35) - hr.top;
      tip.style.left = Math.max(4, Math.min(hr.width - tip.offsetWidth - 4, lx + 12)) + 'px';
      tip.style.top = Math.max(2, ly - 34) + 'px';
      return p;
    }
    function idxFromEvent(e) {
      var r = svg.getBoundingClientRect();
      return Math.round(((e.clientX - r.left) / r.width * CH.W - CH.PL) / (CH.W - CH.PL - CH.PR) * (n - 1));
    }
    function hide() { tip.style.display = 'none'; if (cursor) cursor.style.display = 'none'; }
    svg.addEventListener('pointermove', function (e) { showAt(idxFromEvent(e), e.clientX, e.clientY); });
    svg.addEventListener('pointerdown', function (e) {
      var p = showAt(idxFromEvent(e), e.clientX, e.clientY);
      try { if (p) history.replaceState(null, '', '#tape-' + p.date); } catch (_) {}
      if (svg.setPointerCapture) { try { svg.setPointerCapture(e.pointerId); } catch (_) {} }
    });
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    document.addEventListener('pointerdown', function (e) { if (!svg.contains(e.target)) hide(); });
    // deep-linked day → pin it
    if (PINNED) {
      var pi = -1;
      curve.forEach(function (p, i) { if (p.date === PINNED) pi = i; });
      if (pi >= 0) { showAt(pi); }
      PINNED = null;
    }
  }

  // countdown ticks toward generated_at + 24h (rolls forward if overdue)
  function startCountdown(generatedAt) {
    var span = el.querySelector('.tape-cd');
    var gen = generatedAt ? new Date(generatedAt) : null;
    if (!span || !gen || isNaN(gen.getTime())) return;
    function tick() {
      if (!span.isConnected) { clearInterval(window.__mochionTapeCd); return; }
      var next = gen.getTime() + 86400000, now = Date.now();
      while (next <= now) next += 86400000;
      var s = Math.max(0, Math.floor((next - now) / 1000));
      span.textContent = Math.floor(s / 3600) + 'h ' + ('0' + Math.floor(s % 3600 / 60)).slice(-2) + 'm ' + ('0' + (s % 60)).slice(-2) + 's';
    }
    tick();
    clearInterval(window.__mochionTapeCd);
    window.__mochionTapeCd = setInterval(tick, 1000);
  }

  function stat(v, label, hero) {
    return '<div class="tape-stat' + (hero ? ' tape-stat--hero' : '') + '"><b>' + v + '</b><span>' + esc(label) + '</span></div>';
  }

  function render() {
    var d = DATA;
    if (!d || d.status === 'no_data') { waiting(d && d.note); return; }
    try {
      var s = d.summary || {};
      var full = d.equity_curve || [];
      var sl = windowSlice(full);
      var chart = sl.win.length ? chartSVG(sl.win, sl.prevClose) : '';
      var day = d.days_live != null ? d.days_live : full.length;
      var caveat = (d.data_quality && d.data_quality.realized_reconciles === false)
        ? '<p class="tape-caveat">⚠ the newest snapshot didn’t fully reconcile with the ledger — treat as provisional.</p>' : '';
      var stamp = 'live since ' + esc(d.since || '—') + ' · generated ' + esc((d.generated_at || '').replace('T', ' ').slice(0, 16)) + ' UTC';
      var basis = d.basis ? (esc(d.basis.pnl) + ' · ' + esc(d.basis.scope)) : '';
      var wbtn = [['30', '30'], ['90', '90'], ['180', '180'], ['360', '360'], ['ytd', 'YTD'], ['all', 'all']].map(function (w) {
        return '<button type="button" class="tape-wbtn' + (WIN === w[0] ? ' is-on' : '') + '" data-w="' + w[0] + '">' + w[1] + '</button>';
      }).join('');
      var shareText = 'day ' + day + ' of a machine that shows its work. wins, losses, all of it, in the open.';
      var shareHref = 'https://x.com/intent/post?text=' + encodeURIComponent(shareText) +
        '&url=' + encodeURIComponent('https://mochion.xyz/#tape-' + (d.as_of || ''));

      el.innerHTML =
        '<div class="tape-live">' +
          '<div class="tape-band">' +
            '<span class="tape-band__live"><i class="tape-dot" aria-hidden="true"></i>LIVE · DAY ' + esc(day) + '</span>' +
            '<span class="tape-band__win" role="group" aria-label="chart window">' + wbtn + '</span>' +
            '<span class="tape-band__next">next print in <span class="tape-cd">—</span></span>' +
          '</div>' +
          chart +
          '<div class="tape-hero">' +
            stat(pct(s.cumulative_return_pct), 'return since ' + (d.since || 'start'), true) +
            stat(pct(s.max_drawdown_pct), 'max drawdown', true) +
          '</div>' +
          '<div class="tape-summary">' +
            stat(s.sharpe == null ? '—' : s.sharpe.toFixed(2), 'sharpe') +
            stat(s.win_rate_pct == null ? '—' : s.win_rate_pct.toFixed(0) + '%', 'win rate') +
            stat(s.profit_factor == null ? '—' : s.profit_factor.toFixed(2), 'profit factor') +
            stat(s.closed_trades == null ? '—' : String(s.closed_trades), 'closed trades') +
            stat(pct(s.best_day_pct), 'best day') +
            stat(pct(s.worst_day_pct), 'worst day') +
          '</div>' + caveat +
          (basis ? '<p class="tape-basis">' + basis + '</p>' : '') +
          '<p class="tape-stamp">' + stamp + '</p>' +
          '<p class="tape-share"><a href="' + shareHref + '" rel="noopener">share this tape →</a></p>' +
        '</div>';

      if (chart) wireChart(sl.win);
      startCountdown(d.generated_at);
      el.querySelectorAll('.tape-wbtn').forEach(function (b) {
        b.addEventListener('click', function () { WIN = b.getAttribute('data-w'); render(); });
      });
    } catch (err) {
      // the Tape must never break — fall back to the honest waiting panel
      waiting('The Tape hit a snag rendering — the record itself is unaffected. Refresh to retry.');
    }
  }

  function applyHash() {
    var m = /^#tape-(\d{4}-\d{2}-\d{2})$/.exec(location.hash || '');
    if (!m || !DATA || !DATA.equity_curve) return false;
    var date = m[1], full = DATA.equity_curve, inWin = false, exists = false;
    windowSlice(full).win.forEach(function (p) { if (p.date === date) inWin = true; });
    full.forEach(function (p) { if (p.date === date) exists = true; });
    if (!exists) return false;
    if (!inWin) WIN = 'all';                   // deep link outside the window → show all
    PINNED = date;
    return true;
  }

  fetch('data/public.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      DATA = d;
      if (applyHash()) { render(); try { el.scrollIntoView({ block: 'center' }); } catch (_) {} }
      else render();
      window.addEventListener('hashchange', function () { if (applyHash()) render(); });
    })
    .catch(function () { waiting(); });
})();
