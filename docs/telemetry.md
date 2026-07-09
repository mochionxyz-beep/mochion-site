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
hourly cron (trading box)
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
| `data/public.json`   | hourly    | the track record ("The Tape"), rendered by the site |
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
    "pnl": "realized, net of fees and funding",
    "scope": "portfolio (aggregate)",
    "returns": "percent of account capital",
    "note": "no absolute capital, no per-strategy or per-trade detail is published"
  },
  "summary": {
    "cumulative_return_pct": 6.0,
    "max_drawdown_pct": -1.2,
    "win_rate_pct": 66.7,
    "closed_trades": 3,
    "profit_factor": 4.0,
    "best_day_pct": 4.5,
    "worst_day_pct": -1.2
  },
  "equity_curve": [ {"date": "2026-01-01", "value": 104.5}, {"date": "2026-01-02", "value": 106.0} ],
  "monthly_returns_pct": [ {"month": "2026-01", "return_pct": 6.0} ],
  "data_quality": { "realized_reconciles": true }
}
```
**No-data shape (before the first realized day):**
```json
{ "generated_at": "…", "status": "no_data", "note": "no realized activity in range yet",
  "data_quality": { "realized_reconciles": true } }
```
Field notes:
- **Percent / index only.** `equity_curve[].value` is indexed to **100** at `since`. There is **no**
  absolute capital, dollar figure, or position size anywhere — by construction.
- **Portfolio-only.** One aggregate book — **no per-strategy attribution, no venue tags, no symbols**
  (strategy names and the venue mix are edge/identity signal). This deliberately drops the old
  `attribution[]` and `venues[]` fields.
- **Realized only**, net of fees + funding; no mark-to-market / unrealized.
- `summary.*` may be `null` (e.g. `win_rate_pct` / `profit_factor` before enough closed trades).
- `data_quality.realized_reconciles=false` → the series didn't reconcile with the ledger; the site
  must show a caveat (the exporter otherwise refuses to publish).
- `as_of` intentionally lags (the exporter drops the last day) — publish **through yesterday**.

## Sanitization (hard) — results, not intentions
- ALLOWED: the indexed equity curve; the realized % returns / ratios / counts above; max drawdown;
  `generated_at` / `since` / `as_of` / `days_live`.
- FORBIDDEN: absolute capital, dollars, position sizes; per-strategy or per-trade detail; symbols;
  venues; open orders / pending signals / order prices; API keys, hostnames, IPs, account ids,
  anything from `.env`.
- The exporter is allow-list based (built from named fields), never a state dump, and refuses to
  publish an unreconciled curve.

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

## Rendering (site side — vanilla JS, self-hosted, no CDN)
`site/js/tape.js` fetches `/data/public.json` and draws:
- an inline **SVG equity curve** (indexed-100 line), in the comic style;
- a sober **summary** that **owns the downside** — max drawdown and worst day shown right beside the
  wins; no hype, no annualizing, no projections;
- the **age-of-record stamp**: `live since <since> · <days_live> days · generated <UTC>`;
- the **`no_data`** "waiting" state, and a **caveat** when `realized_reconciles=false`.

Style tokens (so the panel reads native): parchment `#E9DFC9`, ink `#26201C`, secondary `#6b6355`,
matcha `#9DBB72` (fill) / `#587A40` (stroke), pink `#EFA9B8` sparingly; equity line `#26201C` 3px.
Keep the standing disclaimer: **unaudited, short history, past results never promise future ones.**

## What changed (2026-07-09)
- **`public.json` replaced `live.json` / `mochion.telemetry.v1`** as the track-record contract — the
  exporter (box) is source of truth; this doc mirrors it.
- **Rendering moved to the site (vanilla JS)** — the box pushes JSON only; no more box-rendered SVG.
- **Attribution + venues dropped** — portfolio-only, percentage-only; a tighter anonymity/edge surface.

## Setup pointer (box side)
The box push runbook (dedicated pseudonymous checkout, git identity `mochion-data <data@mochion.xyz>`
+ `TZ=UTC`, the fine-grained token at `~/.config/mochion/gh-token`, and the hourly cron) lives with the
box ops — **not** in this repo. This repo stays free of trading hostnames, paths, and repo names.
