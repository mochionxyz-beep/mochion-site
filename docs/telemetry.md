# Mochion telemetry & activity — producer / consumer contract

> One-way flow: trading box → site repo → Cloudflare Pages. The box commits **sanitized JSON only**;
> the site serves it as a static file and **renders the panels client-side (vanilla JS)**. The site
> never reaches into trading systems.
>
> **The schema itself is normatively defined by [`record.v1`](https://github.com/mochionxyz-beep/record-kit/blob/main/SPEC.md)**
> — a general, public spec for append-only, edge-preserving track records, extracted from this
> project. Where this doc and `SPEC.md` ever disagree, `SPEC.md` wins. This page covers only the
> Mochion-specific transport (the box → repo → Cloudflare Pages pipeline) and which fields the site
> actually renders — read `SPEC.md` for the field-by-field contract. *(This supersedes the earlier
> `live.json` / `mochion.telemetry.v1` spec, which was never implemented — see "What changed".)*

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
| `data/public.json`   | daily     | the track record ("The Tape"), rendered by the site (built from intraday snapshots, published through yesterday) |
| `data/activity.json` | daily ok  | commit/LOC activity, rendered by the site on the build-log page |

The site renders these with vanilla JS — the box **no longer renders SVG**. Until real data flows,
`public.json` is the `no_data` shape below (an honest "waiting" panel). The old placeholder
`stats.svg` / `activity.svg` are retired.

## `public.json` — the track record

**The field-by-field schema, invariants, and definitions are `record.v1`** — see
[`SPEC.md`](https://github.com/mochionxyz-beep/record-kit/blob/main/SPEC.md) §3–§5. This section
covers only what's specific to Mochion's own instance of it.

- **Portfolio-only, NAV / mark-to-market.** One aggregate book, indexed to 100 at `since` — no
  absolute capital, no per-strategy attribution, no venue tags, no symbols (edge/identity signal).
  `basis.pnl` describes this in the abstract (`SPEC.md` §8 explains why the wording itself matters —
  naming a P&L component more specific than realized/unrealized/fees, or a marking cadence, is its
  own kind of leak, independent of any structured field).
- `summary.sharpe` is annualized from daily returns and **provisional on a short history** — rendered
  soberly (or omitted) until the sample is long enough to be meaningful. `summary.*` may be `null`.
- **Public surface.** The site renders `cumulative_return_pct` / `max_drawdown_pct` / `best_day_pct` /
  `worst_day_pct` / `sharpe` plus the daily OHLC (for the windowed return, drawdown, and green/red/flat
  day counts) — nothing else. Earlier `summary` fields (`win_rate_pct`, `profit_factor`,
  `closed_trades`) were **removed**, not merely hidden from display — they described individual trade
  outcomes and should not have been published at all. See `data/amendments.json` for when and why.
- `data_quality.realized_reconciles=false` → the newest snapshot's realized didn't match the ledger;
  the site **must show a caveat**. The exporter still publishes from the authoritative snapshots (it
  does **not** refuse) — it just flags the drift.
- `as_of` intentionally lags one day (the exporter drops the most recent day) — publish **through
  yesterday**.

## Sanitization (hard) — results, not intentions
- ALLOWED: the indexed NAV equity curve (daily OHLC candles); the % returns / ratios / counts above
  (Sharpe, best/worst day); max drawdown; `generated_at` / `since` / `as_of` / `days_live`.
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

## What changed (2026-07-30)
- **The schema is now normatively `record.v1`**, extracted into the public
  [`record-kit`](https://github.com/mochionxyz-beep/record-kit) toolkit — this doc defers to
  `SPEC.md` rather than duplicating the field contract (the two had quietly drifted before: this page
  described `basis.pnl` as naming "funding" and a "marked each hour" cadence, and still listed
  `win_rate_pct`/`profit_factor` as allowed fields, months after both were removed from the live
  export. Corrected here, not left to drift again).
- `js/verified-tape.js` (a vendored copy of record-kit's `<verified-tape>` component) is being
  shadow-deployed at `/tape-preview.html` ahead of replacing `js/tape.js` on the live page.
- A new, separate `verify.yml` workflow runs `record-verify` against this repo's own history daily
  and writes `data/verify.json` — the machine-checkable version of the append-only claim this page
  and `index.html` have always made in prose.

## What changed (2026-07-10)
- **Curve basis: realized-only → account NAV (mark-to-market).** `equity_curve` / drawdown / Sharpe /
  returns now track total P&L, net of fees, so the line moves continuously and drawdown includes
  open-position risk.
- **`equity_curve[]` is now a daily OHLC candle** (`open`/`high`/`low`/`close`), resampled from the
  intraday snapshots, with `value` == `close` kept for the line-chart fallback.
- **Added `summary.sharpe`** — annualized daily-return Sharpe, flagged provisional on short history.
- **Publish cadence is daily** (built from intraday snapshots, published through yesterday).

## What changed (2026-07-09)
- **`public.json` replaced `live.json` / `mochion.telemetry.v1`** as the track-record contract — the
  exporter (box) is source of truth; this doc mirrors it.
- **Rendering moved to the site (vanilla JS)** — the box pushes JSON only; no more box-rendered SVG.
- **Attribution + venues dropped** — portfolio-only, percentage-only; a tighter anonymity/edge surface.

## Setup pointer (box side)
The box push runbook (dedicated pseudonymous checkout, git identity `mochion-data <data@mochion.xyz>`
+ `TZ=UTC`, a fine-grained repo-scoped token, and the publish cron) lives with the
box ops — **not** in this repo. This repo stays free of trading hostnames, paths, and repo names.
