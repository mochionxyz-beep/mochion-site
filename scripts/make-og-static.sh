#!/usr/bin/env bash
# Static per-page OG cards (1200x630 JPEG) from existing scene art + favicon.ico + masthead logo.
# Run from site/ when the source art changes:  bash scripts/make-og-static.sh
set -euo pipefail

mkdir -p assets/og

# index — the MOCHION machine (the pitch). 1000x671 → cover-crop to 1200x630.
magick assets/scenes/machine.webp -resize 1200x630^ -gravity center -extent 1200x630 \
  -unsharp 0x0.6 -quality 88 assets/og/og-index.jpg

# log — night shift (dispatches from HQ). 800x800 → center band.
magick assets/scenes/scene-04-nightshift.webp -resize 1200x1200 -gravity center -extent 1200x630 \
  -unsharp 0x0.6 -quality 88 assets/og/og-log.jpg

# roadmap — penny-farthing onward (the journey).
magick assets/scenes/scene-03c-pennyfarthing-tall.webp -resize 1200x1200 -gravity center -extent 1200x630 \
  -unsharp 0x0.6 -quality 88 assets/og/og-roadmap.jpg

# real multi-res favicon.ico (16/32/48) — /favicon.ico 404s otherwise
magick assets/favicon.png -define icon:auto-resize=48,32,16 favicon.ico

# masthead logo: the 2.9MB print-res PNG stays for the kit; mastheads load this ~560w copy
magick assets/logo/mochion-logo.png -resize 560x -strip assets/logo/mochion-logo-560.png

ls -la assets/og/ favicon.ico assets/logo/mochion-logo-560.png
