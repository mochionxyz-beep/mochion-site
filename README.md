# mochion.xyz

![The Tape — live daily record](https://mochion.xyz/og/tape.png)

The public website for **Mochion** (moh-chee-on) — a personal systematic crypto trading
system, built and documented in the open. Drawn like a 1930s comic; run like a machine.
**Don't trust — watch.**

This is a website repository only. It is intentionally and completely isolated from the
trading system's infrastructure, code, and credentials.

## The record, in public

Every day a bot commit stamps `data/public.json` — the sanitized track record behind
[The Tape](https://mochion.xyz/#tape) (a percent-indexed daily OHLC equity curve + summary
stats; no dollar amounts, no positions, no venues — by construction). The commit history of
that file *is* the audit trail: one commit per day, timestamped, appended in front of third
parties. Diff any two days yourself.

The record is self-reported and unaudited, and the strategy code stays private. What you can
verify here is that the numbers accumulate daily in public and are never quietly rewritten.
Any corrected day gets a build-log entry — see `data/amendments.json` for the ledger of every
change ever made to an already-published figure, and why.

This isn't just a claim in prose. [`record-kit`](https://github.com/mochionxyz-beep/record-kit)
is the general, public toolkit this site's own verification runs on — the same schema, the same
append-only rules, extracted so anyone can publish or check a record like this one. A separate,
scheduled workflow (`.github/workflows/verify.yml`, never on push — a verifier issue must never
block the record from deploying) runs `record-verify` against this repo's own history and writes
`data/verify.json`, which `<verified-tape>` renders as the integrity line under the chart.

## Stack

- Static HTML + CSS + minimal vanilla JS. The record renders via `<verified-tape>`
  (`js/verified-tape.js` — a vendored copy of the component from
  [`record-kit`](https://github.com/mochionxyz-beep/record-kit); see that repo to update it).
  No frameworks, no third-party CDNs or scripts, self-hosted everything (fonts included).
- Retro animation is pure CSS (12fps `steps()` keyframes) with a `prefers-reduced-motion` guard.
- Mobile-first layout; two-column comic panels arrive at ≥720px.
- Type: Alfa Slab One + Special Elite (SIL OFL, self-hosted woff2 — licenses in `assets/fonts/`).

## Local preview

```sh
python3 -m http.server -d . 8000   # then open http://localhost:8000
```

No build step for the site itself. Two artifacts are generated at deploy time by the
GitHub Action (never committed): `og/tape.png` (the live share card, rendered from
`data/public.json` by `ci/og-tape.mjs`) and `feed.xml` (Atom, parsed from `log.html` by
`ci/build-feed.mjs`). To preview them locally: `npm ci --prefix ci && node ci/og-tape.mjs`.

## Structure

```
index.html            the landing "issue" — the world, the cast, The Tape
log.html              build log — what broke, what got fixed, why (feeds /feed.xml)
roadmap.html          Now / Next / Later playbill
css/styles.css        design system (comic layer over the base tokens)
js/                   verified-tape.js (record-kit's component) + activity.js — client-side
                      renderers for data/*.json. js/tape.js is kept, unreferenced, as a
                      one-line rollback of the verified-tape.js migration
ci/                   deploy-time generators (OG card, Atom feed) — pinned, zero-runtime-deps
data/                 sanitized telemetry: public.json (pushed daily by the mochion-data bot),
                      verify.json (record-verify's report, written by verify.yml),
                      amendments.json (the ledger of disclosed changes to public.json)
docs/telemetry.md     producer/consumer contract for the data pipeline (defers to record-kit's
                      SPEC.md for the schema itself)
```

## Data pipeline

A daily job on the trading side exports sanitized JSON (`data/public.json`), commits as the
`mochion-data` bot, and pushes; the GitHub Action redeploys Cloudflare Pages and snapshots
the site to the Internet Archive. Full contract — schema, sanitization allow-list — in
`docs/telemetry.md`. One-way flow only; nothing on the site reaches into trading systems.

Note: the deployed `index.html` differs from the committed one by exactly one substitution —
the Action stamps a daily `?v=` cache-buster into the `og:image` URL (see `deploy.yml`).

## Conventions

- No solicitation language: "follow the build" is the only call to action. A personal
  project, not a fund; nothing here is an offer or investment advice.
- Accurate system descriptions only; failures are documented on purpose.
- This project is pseudonymous: no personal names, emails, or locations in this repo;
  commits are authored as `mochion <dev@mochion.xyz>` in UTC.

## Licenses

Code is MIT (`LICENSE`). The Mochion artwork and mascot are **not** MIT — they're
CC BY-NC 4.0 (`assets/LICENSE-ART.txt`): remix and share with credit to @mochionhq,
no commercial use.

## Deployment

Cloudflare Pages (project `mochion`), auto-deployed on every push to `main` by
`.github/workflows/deploy.yml`.
