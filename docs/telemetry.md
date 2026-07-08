# Mochion telemetry & activity pipeline — producer contract

> Contract between the trading side (producer) and this site (consumer). The site only ever
> **serves committed static files**; the producer generates them and pushes. One-way flow:
> trading box → site repo → Cloudflare Pages. The site never reaches into trading systems.

## Flow

```
hourly cron (position-manager box)
  → run exporter (writes live.json, renders stats.svg)
  → copy into local clone of the site repo: site/data/
  → git commit  (author: mochion-data bot, message: "data: telemetry 2026-07-08T15:00Z")
  → git push    (repo-scoped deploy key, write access to THIS repo only)
  → Cloudflare Pages auto-deploys (git-connected)
```

Activity stats (commits/LOC across the private `mochi-*` repos) ride the same cron and write
`activity.json` + `activity.svg` the same way.

## Files the producer owns (everything under `site/data/`)

| File | Cadence | Purpose |
|---|---|---|
| `data/live.json` | hourly | machine-readable telemetry for the curious |
| `data/stats.svg` | hourly | the rendered Tape panel embedded on the landing page |
| `data/activity.json` | daily is fine | commit/LOC stats |
| `data/activity.svg` | daily is fine | the rendered activity panel on the build-log page |

Until the pipeline ships, comic-styled placeholders live at these paths — overwrite them.

## Sanitization rules (hard)

Publish **results, not intentions**:
- ALLOWED: equity/NAV series, realized PnL to date, max drawdown, uptime, per-strategy
  attribution (by label, e.g. "carry", "directional"), venue tags (bybit/hyperliquid),
  `generated_at` timestamps, days-live counters.
- FORBIDDEN: open orders, pending signals, in-flight position sizes, order prices, API keys,
  hostnames, internal IPs, account identifiers, anything from `.env`.
- The exporter must be allow-list based (build the JSON from named fields), never a dump of
  internal state.

## `live.json` schema (v1)

```json
{
  "schema": "mochion.telemetry.v1",
  "generated_at": "2026-07-08T15:00:00Z",
  "live_since": "2026-07-01T00:00:00Z",
  "days_live": 7,
  "uptime_pct_30d": 99.7,
  "equity_curve": {
    "unit": "index",
    "note": "normalized to 100 at live_since",
    "points": [["2026-07-08T14:00:00Z", 101.8]]
  },
  "realized_pnl_index": 1.8,
  "max_drawdown_pct": -2.4,
  "attribution": [
    {"strategy": "carry", "share_pct": 60.0},
    {"strategy": "directional", "share_pct": 40.0}
  ],
  "venues": ["bybit", "hyperliquid"]
}
```

Notes: the equity curve is an **index** (base 100), not account dollars — publish shape, not
size. Keep ≤ 2000 points (rolling window); the exporter may thin older points to daily.

## `activity.json` schema (v1)

```json
{
  "schema": "mochion.activity.v1",
  "generated_at": "2026-07-08T15:00:00Z",
  "window_weeks": 26,
  "repos_counted": 4,
  "weekly": [
    {"week_start": "2026-06-29", "commits": 23, "loc_added": 1450, "loc_removed": 620}
  ],
  "totals": {"commits": 1180, "loc_added": 91000, "loc_removed": 34000},
  "last_commit_at": "2026-07-08T13:42:00Z"
}
```

**Exclude the `mochion-data` bot author from all counts** (otherwise the data pipeline
inflates its own activity chart). Suggested metric source: `git log --shortstat` per repo,
aggregated; repo names never appear in the JSON — only aggregate counts.

## SVG panels the exporter renders

Match the site's comic system so the panels look native:

- `stats.svg`: viewBox `0 0 800 360`. `activity.svg`: viewBox `0 0 800 240`.
- Background `#E9DFC9` (parchment), inner border `4px` stroke `#141414` inset 10px,
  optional halftone: 8×8 pattern, `r=1.1` dots `#26201C` at `opacity 0.12`.
- Ink/text `#26201C`; secondary text `#6b6355`; accents: matcha `#9DBB72` (bars/curve fill),
  deep matcha `#587A40` (strokes), pink `#EFA9B8` sparingly; equity line stroke `#26201C` 3px.
- Font: `-apple-system, Helvetica, sans-serif` (SVG-as-img cannot load webfonts).
- ALWAYS render the age-of-record stamp: `live since <date> · <N> days` and `generated <UTC hour>`.
- If data is stale (> 3h old at render time is impossible by construction, but if the cron
  skipped), the previous SVG simply keeps serving — its timestamp shows the staleness honestly.
- No annualized, extrapolated, or projected figures. No dollar amounts. Descriptive stats only.

## One-time setup (owner)

1. GitHub org + repo created; this site pushed to it.
2. Cloudflare Pages → project `mochion` → connect to the GitHub repo (dashboard OAuth,
   production branch `main`). Direct-upload deploys stop; pushes deploy.
3. On the position-manager box: `ssh-keygen -t ed25519 -f ~/.ssh/mochion_site_deploy -C "mochion-data"`,
   add the **public** key as a Deploy Key (write access) on the site repo; configure the clone
   to use it. The Cloudflare API token never goes on the trading box.
4. Git identity for the cron: `git config user.name "mochion-data"`,
   `user.email "data@mochion.xyz"`, and commit with `TZ=UTC` (anonymity: no timezone leak).
   Commit message format: `data: telemetry <ISO-hour>` / `data: activity <date>`.
   The GitHub org/repo is owned by a **dedicated pseudonymous account** (e.g. registered with
   the project's own mailbox), never a personal account.
5. Cron hygiene: `git pull --rebase` before commit; if push fails, retry next hour (files are
   idempotent snapshots — a missed hour is harmless).
