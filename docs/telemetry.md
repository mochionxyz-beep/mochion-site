# Mochion telemetry & activity — producer / consumer contract

> One-way flow: trading box → site repo → Cloudflare Pages. The box commits **sanitized JSON only**;
> the site serves it as a static file and **renders the panels client-side (vanilla JS)**. The site
> never reaches into trading systems.
>
> **Source of truth for the track-record schema is the exporter on the trading box** — it emits
> `public.json`, and this doc mirrors that output for the site (consumer) side. Where this doc and
> the exporter ever disagree, the exporter wins. *(This supersedes the earlier `live.json` /
> `mochion.telemetry.v1` spec, which was never implemented — see "What changed".)*

## Flow
```
daily cron (trading box)
  → sanitized exporter        → writes  data/public.json     (the track record)
  → activity exporter         → writes  data/activity.json   (commit/LOC stats)
  → commit ONLY the JSON files into a local clone of the site repo
        author/committer: mochion-data <data@mochion.xyz>,  TZ=UTC
  → git push   (fine-grained token scoped to THIS repo only; Cloudflare token NEVER on the box)
  → Cloudflare Pages auto-deploys (git-connected)
The browser fetches the JSON and draws the panels (site/js/tape.js). No server render, no SVG on the box.
```
Box-side push steps (checkout, identity, token location, cron) live in the **box's own runbook**,
kept OUT of this repo for isolation.

## Producer owns (everything under `site/data/`) — JSON ONLY
| File | Cadence | Purpose |
|---|---|---|
| `data/public.json`   | daily     | the track record ("The Tape"), rendered by the site (built from hourly snapshots, published through yesterday) |
| `data/activity.json` | daily ok  | commit/LOC activity, rendered by the site on the build-log page |

The site renders these with vanilla JS — the box **no longer renders SVG**. Until real data flows,
`public.json` is the `no_data` shape below (an honest "waiting" panel). The old placeholder
`stats.svg` / `activity.svg` are retired.

## `public.json` — the track record (authoritative = the box exporter)

**Normal shape:**
```json
{
  "generated_at": "2026-01-04T00:00:00+00:00",
  "since": "2026-01-01",
  "as_of": "2026-01-02",
  "days_live": 2,
  "basis": {
    "pnl": "total account P&L, marked-to-market (realized + unrealized + funding − commission)",
    "scope": "portfolio (aggregate)",
    "returns": "percent of account capital",
    "note": "no absolute capital / per-strategy / per-trade detail is published. sharpe is annualized from daily returns (provisional — short history). win-rate / profit-factor are per close-event (hourly realized deltas)."
  },
  "summary": {
    "cumulative_return_pct": 6.0,
    "max_drawdown_pct": -1.2,
    "sharpe": 2.1,
    "win_rate_pct": 66.7,
    "profit_factor": 4.0,
    "closed_trades": 3,
    "best_day_pct": 4.5,
    "worst_day_pct": -1.2
  },
  "equity_curve": [
    {"date": "2026-01-01", "open": 100.0, "high": 104.6, "low": 99.7, "close": 104.5, "value": 104.5},
    {"date": "2026-01-02", "open": 104.5, "high": 106.3, "low": 103.1, "close": 106.0, "value": 106.0}
  ],
  "monthly_returns_pct": [ {"month": "2026-01", "return_pct": 6.0} ],
  "data_quality": { "realized_reconciles": true }
}
```
**No-data shape (before the first day prints):**
```json
{ "generated_at": "…", "status": "no_data",
  "note": "no realized activity yet — the first honest day hasn't printed. Follow the build.",
  "data_quality": { "realized_reconciles": true } }
```
Field notes:
- **Percent / index only.** Each `equity_curve[]` entry is one **daily OHLC candle** — `open` / `high`
  / `low` / `close`, each an index of the account NAV to **100** at `since` (`value` mirrors `close`
  for a line-chart fallback). There is **no** absolute capital, dollar figure, or position size
  anywhere — by construction.
- **Portfolio-only.** One aggregate book — **no per-strategy attribution, no venue tags, no symbols**
  (strategy names and the venue mix are edge/identity signal). This deliberately drops the old
  `attribution[]` and `venues[]` fields.
- **NAV / mark-to-market.** The curve is total account P&L (realized + unrealized + funding −
  commission), marked each hour and resampled to daily candles — so drawdown captures open-position
  risk. `win_rate_pct` / `profit_factor` / `closed_trades` still come from the **realized** deltas
  (closed trades only), per hourly close-event.
- `summary.sharpe` is annualized from daily returns and **provisional on a short history** — render it
  soberly (or omit) until the sample is long enough to be meaningful.
- `summary.*` may be `null` (e.g. `sharpe` / `win_rate_pct` / `profit_factor` before enough data).
- `data_quality.realized_reconciles=false` → the newest snapshot's realized didn't match the ledger;
  the site **must show a caveat**. The exporter still publishes from the authoritative snapshots (it
  does **not** refuse) — it just flags the drift.
- `as_of` intentionally lags (the exporter drops the last `--lag-days` days) — publish **through
  yesterday**.

## Sanitization (hard) — results, not intentions
- ALLOWED: the indexed NAV equity curve (daily OHLC candles); the % returns / ratios / counts above
  (Sharpe, win-rate, profit-factor, best/worst day); max drawdown; `generated_at` / `since` / `as_of`
  / `days_live`.
- FORBIDDEN: absolute capital, dollars, position sizes; per-strategy or per-trade detail; symbols;
  venues; open orders / pending signals / order prices; API keys, hostnames, IPs, account ids,
  anything from `.env`.
- The exporter is allow-list based (built from named fields), never a state dump. It always publishes
  from the authoritative snapshots and sets `data_quality.realized_reconciles` — it does not refuse on
  drift; the site shows a caveat when the flag is `false`.

## `activity.json` schema (v1) — unchanged (separate stream)
```json
{
  "schema": "mochion.activity.v1",
  "generated_at": "2026-07-08T15:00:00Z",
  "window_weeks": 26,
  "repos_counted": 4,
  "weekly": [ {"week_start": "2026-06-29", "commits": 23, "loc_added": 1450, "loc_removed": 620} ],
  "totals": {"commits": 1180, "loc_added": 91000, "loc_removed": 34000},
  "last_commit_at": "2026-07-08T13:42:00Z"
}
```
Rendered client-side (same pattern as The Tape). **Exclude the `mochion-data` bot author from all
counts.** Aggregate only — repo names never appear in the JSON.

## `devlog.json` schema — sanitized trading-repo digest (box airlock)
Feeds the site's **weekly dispatch draft** (`ci/draft-dispatch.mjs`) with Cast-voiced, sanitized
one-liners about the week's trading-side work — WITHOUT giving the site any trading-repo access.
Produced ONLY on the box by `ops/export_devlog.py` from commit **subjects** (never diffs/bodies),
committed by the same `mochion-data` daily job.
```json
{
  "week_start": "2026-07-07",
  "stations": [
    { "cast": "dispatcher", "changes": 6, "highlights": ["got a little more reliable", "cleaned up its bench"] },
    { "cast": "archivist",  "changes": 3, "highlights": ["tightened its checks"] }
  ]
}
```
Sanitization (hard, runs on the box): repo→Cast mapping (real repo names never leave the box);
owner denylist (strategy names / symbols / hosts); generic scrubs (tickers, $/% figures, paths,
IPs, URLs, emails, hashes, secret-words); **conservative default — any subject not provably
innocuous collapses to a count, never a highlight.** FORBIDDEN in the JSON: repo names, authors,
hashes, dates finer than the week, any number that isn't a plain change-count, any symbol/venue/
strategy/figure. `{"status":"no_data",…}` before the box deploys. The weekly draft is a PR the
owner reviews — a second human backstop over the sanitizer.

## Rendering (site side — vanilla JS, self-hosted, no CDN)
`site/js/tape.js` fetches `/data/public.json` and draws:
- an inline **SVG equity curve** (indexed-100), in the comic style — render `equity_curve[]` as daily
  **OHLC candlesticks** (`open`/`high`/`low`/`close`), or fall back to a line off `value` (== `close`);
- a sober **summary** that **owns the downside** — max drawdown and worst day shown right beside the
  wins; no hype, no projections. If you show `sharpe`, label it *provisional (short history)*;
- the **age-of-record stamp**: `live since <since> · <days_live> days · generated <UTC>`;
- the **`no_data`** "waiting" state, and a **caveat** when `realized_reconciles=false`.

Style tokens (so the panel reads native): parchment `#E9DFC9`, ink `#26201C`, secondary `#6b6355`,
matcha `#9DBB72` (fill) / `#587A40` (stroke), pink `#EFA9B8` sparingly; equity line `#26201C` 3px.
Keep the standing disclaimer: **unaudited, short history, past results never promise future ones.**

## What changed (2026-07-10)
- **Curve basis: realized-only → account NAV (mark-to-market).** `equity_curve` / drawdown / Sharpe /
  returns now track total P&L (realized + unrealized + funding − commission) marked each hour, so the
  line moves continuously and drawdown includes open-position risk. Win-rate / profit-factor stay
  realized-only (closed trades).
- **`equity_curve[]` is now a daily OHLC candle** (`open`/`high`/`low`/`close`), resampled from the
  hourly snapshots, with `value` == `close` kept for the line-chart fallback.
- **Added `summary.sharpe`** — annualized daily-return Sharpe, flagged provisional on short history.
- **Publish cadence is daily** (built from hourly snapshots, `--lag-days 1` → through yesterday).

## What changed (2026-07-09)
- **`public.json` replaced `live.json` / `mochion.telemetry.v1`** as the track-record contract — the
  exporter (box) is source of truth; this doc mirrors it.
- **Rendering moved to the site (vanilla JS)** — the box pushes JSON only; no more box-rendered SVG.
- **Attribution + venues dropped** — portfolio-only, percentage-only; a tighter anonymity/edge surface.

## Setup pointer (box side)
The box push runbook (dedicated pseudonymous checkout, git identity `mochion-data <data@mochion.xyz>`
+ `TZ=UTC`, the fine-grained token at `~/.config/mochion/gh-token`, and the hourly cron) lives with the
box ops — **not** in this repo. This repo stays free of trading hostnames, paths, and repo names.
