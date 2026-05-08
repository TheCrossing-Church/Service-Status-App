# Branding — replacing the icon set

This app is built for The Crossing, but the icon and PWA branding are
isolated to a single directory so anyone forking the repo can rebrand
in minutes without touching code.

## The swap point

```
frontend/public/brand/         # served files (referenced by manifest.webmanifest)
frontend/brand-source/         # high-res master(s) — not served, used for regeneration
```

Everything that's visually identifiable as "The Crossing" lives in these
two directories. To rebrand a fork: drop a new `icon-source.png` into
`frontend/brand-source/`, regenerate the served set with the commands
below, and update the strings in `manifest.webmanifest` and
`index.html`. Nothing else needs to change.

## Required files in `frontend/public/brand/`

| File | Size | Format | Purpose |
|---|---|---|---|
| `icon-192.png` | 192×192 | PNG | Android home screen — declared `any maskable` |
| `icon-512.png` | 512×512 | PNG | Android splash + install prompts — declared `any maskable` |
| `apple-touch-icon.png` | 180×180 | PNG | iOS home screen |
| `favicon-32.png` | 32×32 | PNG | Browser tab favicon |
| `favicon-16.png` | 16×16 | PNG | Browser tab favicon (small) |

### Why one set of icons covers both `any` and `maskable`

The W3C manifest spec lets a single icon declare combined purpose
`"any maskable"` — meaning the OS may use it as either a standard or a
masked adaptive icon. This works **only if the design respects the
maskable safe zone**: all important content must sit within the center
80% of the canvas, with at most a ~10% padding margin on each side.
Android may crop the outer 10% on each edge for circle/squircle masks.

If your design fills the canvas edge-to-edge (e.g., text or content in
the corners), you need separate `icon-maskable-*.png` variants with the
artwork scaled into the safe zone. The current Crossing icon — green
concentric rings on a slate background — is designed to live within
the safe zone, so combined purpose is fine. If you replace it with art
that goes edge-to-edge, see the "Adding maskable variants" section
below.

[Maskable.app](https://maskable.app/editor) is a free tool to preview
how launchers will crop your icon.

## How to rebrand a fork

1. Generate or commission a square `icon-source.png` (1024×1024 or
   higher recommended). Keep important content within the center 80%
   so it survives Android's adaptive crop.
   - One-source online tools: [realfavicongenerator.net](https://realfavicongenerator.net),
     [PWA Builder Image Generator](https://www.pwabuilder.com/imageGenerator).
   - AI tools: see the Gemini prompt template below.
2. Drop `icon-source.png` into `frontend/brand-source/`.
3. Regenerate the served set (see "Generating sizes" below). On macOS,
   `sips` is built in.
4. Update strings:
   - `frontend/public/manifest.webmanifest` — `name`, `short_name`, `description`
   - `frontend/index.html` — `<title>` element
5. (Optional) Adjust theme colors in:
   - `frontend/public/manifest.webmanifest` — `theme_color`, `background_color`
   - `frontend/index.html` — `<meta name="theme-color">`
   - `frontend/tailwind.config.*` if you want UI accents to match
6. Rebuild: `npm run build` from `frontend/`.
7. Test the install prompt on a real device — Android Chrome shows the
   adaptive icon on the home screen, iOS shows the apple-touch-icon
   when added via Share → Add to Home Screen.

## Gemini prompt — single-shot

Paste this into Gemini (or any image-generation model) to produce one
candidate icon. Iterate by replying "try again, different direction"
until you like the result.

> Create a single 1024×1024 app icon for a real-time service status
> notification tool used at a multi-campus church. Flat, geometric,
> modern, minimal — the kind of icon you'd see on a phone home screen,
> readable down to 32 pixels. Concept: a calm signal or beacon (think
> live indicator, broadcast pulse, or signal dot) — abstract, not
> religious, not a megaphone, not a clock. Background: deep slate
> `#0f172a` filling the full square. Accent: a single green `#22c55e`
> shape, center-weighted, with all important detail kept within the
> middle 80% of the canvas. Output one image only — just the final
> icon, no contact sheet, no variants, no labels.

If your Gemini output has a visible sparkle/star watermark, paint it
out with the same slate `#0f172a` (Preview's annotation tools work).

## Gemini prompt — template for forks

> Create a single 1024×1024 app icon for `<APP NAME>`, a
> `<ONE-SENTENCE DESCRIPTION>`. Flat, geometric, modern, minimal,
> readable at 32 pixels. Background: `<PRIMARY HEX>`. Accent: a single
> `<ACCENT HEX>` shape, center-weighted, with all important detail kept
> within the middle 80% of the canvas. Output one image only — no
> contact sheet, no variants, no labels.

## Generating sizes from `icon-source.png`

You need PNGs at 512, 192, 180, 32, and 16. Pick one method.

**Easiest — online generator.** Upload `icon-source.png` to
[PWA Builder Image Generator](https://www.pwabuilder.com/imageGenerator)
or [realfavicongenerator.net](https://realfavicongenerator.net) and
download the pack. Rename files to match the table above and drop them
into `frontend/public/brand/`.

**Local — macOS (no install needed).** `sips` is built in:

```bash
cd frontend/public/brand
SRC=../../brand-source/icon-source.png
sips -z 512 512 "$SRC" --out icon-512.png
sips -z 192 192 "$SRC" --out icon-192.png
sips -z 180 180 "$SRC" --out apple-touch-icon.png
sips -z 32  32  "$SRC" --out favicon-32.png
sips -z 16  16  "$SRC" --out favicon-16.png
```

**Local — ImageMagick (cross-platform).** If installed:

```bash
cd frontend/public/brand
SRC=../../brand-source/icon-source.png
for size in 512 192; do magick "$SRC" -resize ${size}x${size} icon-${size}.png; done
magick "$SRC" -resize 180x180 apple-touch-icon.png
magick "$SRC" -resize 32x32 favicon-32.png
magick "$SRC" -resize 16x16 favicon-16.png
```

## Adding maskable variants (only if your design goes edge-to-edge)

Skip this section if your design respects the safe zone — combined
`any maskable` purpose handles both.

If your icon's content reaches the canvas edges, you need separate
maskable PNGs with the artwork scaled into the center 80%. The simplest
path is [Maskable.app](https://maskable.app/editor): upload your
source, drag to position inside the safe zone, export at 192 and 512.
Save them as `icon-maskable-192.png` and `icon-maskable-512.png` in
`frontend/public/brand/`, then split the manifest icon array into
separate `"any"` and `"maskable"` entries:

```json
"icons": [
  { "src": "/brand/icon-192.png",          "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/brand/icon-512.png",          "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/brand/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/brand/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Current state

The repo ships with The Crossing's icon set — concentric green
`#22c55e` rings on a slate `#0f172a` background, generated from a
Gemini-rendered source. Master at `frontend/brand-source/icon-source.png`,
served set at `frontend/public/brand/`. Combined `any maskable` purpose
because the rings sit within the safe zone.
