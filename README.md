# mochion.xyz

The public website for **Mochion** (moh-chee-on) — a personal systematic crypto trading
system, built and documented in the open. Drawn like a 1930s comic; run like a machine.

This is a website repository only. It is intentionally and completely isolated from the
trading system's infrastructure, code, and credentials.

## Stack

- Static HTML + CSS. No JS frameworks, no third-party CDNs, self-hosted everything.
- Retro animation is pure CSS (12fps `steps()` keyframes) with a `prefers-reduced-motion` guard.
- Mobile-first layout; two-column comic panels arrive at ≥720px.
- Display font: Fredoka (SIL OFL, self-hosted woff2 — license in `assets/fonts/OFL.txt`).

## Local preview

```sh
python3 -m http.server -d . 8000   # then open http://localhost:8000
```

No build step. Edit HTML/CSS and refresh.

## Structure

```
index.html            the landing "issue"
log.html              build log — what broke, what got fixed, why
roadmap.html          Now / Next / Later playbill
css/styles.css        design system (comic layer over the base tokens)
assets/               mascot art, scene panels (WebP ×2 sizes), fonts, favicon
data/                 telemetry & activity artifacts (placeholders until the pipeline ships)
docs/telemetry.md     producer contract for the data pipeline
```

## Data pipeline (once live)

An hourly job on the trading side exports sanitized telemetry (`data/live.json`) and renders
the Tape panel (`data/stats.svg`), commits as the `mochion-data` bot, and pushes; Cloudflare
Pages redeploys. Full contract — schemas, sanitization rules, SVG style tokens — in
`docs/telemetry.md`. One-way flow only; nothing on the site reaches into trading systems.

## Conventions

- No solicitation language: "follow the build" is the only call to action.
- Accurate system descriptions only; failures are documented on purpose.
- This project is pseudonymous: no personal names, emails, or locations in this repo;
  commits are authored as `mochion <dev@mochion.xyz>` in UTC.

## Deployment

Cloudflare Pages (project `mochion`). Currently deployed with `wrangler pages deploy`;
switches to git-connected auto-deploys once the GitHub repo is wired.
