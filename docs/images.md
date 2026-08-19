# Images

How a screenshot gets from a submitter's clipboard to a reader's phone without
costing them a megabyte. For everything else about screenshots — how they
arrive, alt text, redaction, replacing one later — see
[admin-guide.md § Screenshots and images](admin-guide.md#screenshots-and-images).

## The short version

A screenshot is committed once, at whatever size its author exported. Alongside
it, `npm run images` writes **AVIF and WebP copies at 400, 800 and 1280 pixels
wide**, and records them in `_data/derivatives.json`. `_includes/picture.html`
reads that manifest and emits a `<picture>` so the browser downloads the one
variant that fits its screen.

```
catalog/epi-signal-triage/screenshots/
  01.png          30,300 B   the source, committed by the submission bot
  01-400.avif      5,454 B   what a phone actually downloads
  01-400.webp
  01-800.avif
  01-800.webp
  01-1280.avif
```

Nothing in the site depends on any of this existing. A fork that has never run
the script, an image a maintainer dropped in by hand, an image hosted on someone
else's server — each renders as the plain `<img>` the template always emitted.
Derivatives are an optimisation, and the template is written so that a missing
one costs speed, never a picture.

## Running it

| Command | What it does |
|---|---|
| `npm run images` | Write what is missing or out of date, prune orphans, update the manifest. |
| `npm run images -- --check` | Exit 1 if anything would change; writes nothing. **Validate Content** runs this on every pull request, so a screenshot added by hand needs `npm run images` before the PR goes green. |
| `npm run images -- catalog/my-entry` | Limit the walk to one path, when a full pass is slower than you want. |

It needs [`sharp`](https://sharp.pixelplumbing.com/), which is a devDependency —
`npm ci` installs a prebuilt binary for your platform, and nothing needs to be
compiled. It is **not** part of `npm run build`: the Pages deploy would then
carry a native dependency it has no other use for, and a local `npm start`
would litter `git status` with untracked variants every time you added a file.

Running it twice in a row is a no-op. Freshness is judged on the source's byte
length and pixel size, deliberately **not** its modification time — `git clone`
stamps every file with the checkout time, so an mtime rule would re-encode the
whole catalog on every CI run and commit byte-identical files back.

## Derivatives are committed

The bot writes them; the pull request carries them; git stores them.

- `new-entry.yml` runs the script after the scaffolder downloads a submitter's
  screenshots, so a submission arrives complete.
- `thumbnails.yml` (**Generate entry media**) runs it after `pdftoppm` renders a
  deck's first page, and on any pull request that touches a `.png`, `.jpg`,
  `.jpeg` or `.webp` — which covers a maintainer dragging a screenshot into a
  branch by hand.

Both steps are `continue-on-error`: a broken encoder must never cost a submitter
their pull request, and the site is correct without the output.

**Why committed rather than built.** This repository already stores its
screenshots, so the argument against binary files in git was settled before this
pipeline existed. Building them at deploy time instead would mean a native
dependency in the Pages workflow, a slower deploy on every unrelated commit, and
no way for a reviewer to see what a reader will be served. The cost is repo
size: for the ten shipped sample entries, 408 KB of PNG sources carry 990 KB of
derivatives — roughly two and a half times the source bytes, for thirteen
images. A catalog of two hundred entries should expect the same ratio and is
still measured in tens of megabytes.

**Why not an image CDN.** The template is deployable by a health department to
GitHub Pages with no account anywhere else. That constraint is the whole point;
a CDN would be faster and is not available to the reader this is written for.

## What the script decides

- **Widths**: 400, 800, 1280. Never wider than the source — a 900px screenshot
  gets 400 and 800, and a source narrower than 400 gets a single variant at its
  own width, because the format change alone is most of the saving.
- **Formats**: AVIF first, then WebP. Both are emitted; the browser takes the
  first `<source>` it understands, and anything that understands neither gets
  the original from the `<img>`.
- **Anything bigger than the source is thrown away**, per width *and* per
  format. Shipping a "modern format" file larger than the PNG it replaces costs
  the reader bytes and buys nothing. Screenshots of dashboards are usually flat
  palette PNGs, and a 1280px AVIF of one genuinely can lose to the original
  while the 400px variant still saves 80% — so the two verdicts are separate,
  and the manifest records only what actually landed. An image where every
  variant loses gets no manifest entry at all and is served as-is.
- **GIF and SVG are skipped.** A GIF may be animated, and a single-frame
  derivative would silently drop the animation; an SVG is already
  resolution-independent.
- **A file named like a derivative is never a source.** `01-400.webp` matches
  the pattern this script writes, so it is skipped on the walk. If you have a
  hand-made image whose name ends in `-<number>.webp` or `-<number>.avif`, it
  will not get variants of its own — rename it if that matters. The script also
  never deletes a file it did not record in the manifest.
- **Orphans are swept.** Delete `01.png` and the next run deletes its variants
  and drops the manifest entry.

Encoder settings live in `ENCODE` in `scripts/lib/derivatives.mjs`: AVIF at
quality 55 with 4:4:4 chroma (screenshots are thin coloured type on flat
backgrounds — subsampled chroma smears it), WebP at quality 78. Change them
there and re-run; the byte-length check means a change that makes files bigger
than their source silently drops them rather than shipping them.

## The manifest

`_data/derivatives.json`, keyed by the site-absolute source path exactly as it
appears in front matter:

```json
{
  "/catalog/epi-signal-triage/screenshots/01.png": {
    "w": 1280,
    "h": 800,
    "src_bytes": 30300,
    "base": "/catalog/epi-signal-triage/screenshots/01",
    "variants": { "avif": [400, 800, 1280], "webp": [400, 800] }
  }
}
```

Jekyll loads `_data/*.json` as `site.data.<name>`, so this is the one shape
Liquid can read; per-folder sidecar files would be invisible to a template. Keys
are written sorted, so two entries added in parallel pull requests produce a
diff a maintainer can read.

`w` and `h` are the source's intrinsic size, honouring EXIF orientation. They
become `width`/`height` on the `<img>`, which is what lets the page reserve the
right box before any CSS arrives — the reason a card no longer jumps when its
picture loads.

## Using it in a template

```liquid
{% include picture.html src=item.src alt=item.alt
                        sizes="(min-width: 1280px) 390px, (min-width: 640px) 47vw, 95vw"
                        class="h-full w-full object-cover" eager=true fetchpriority=true %}
```

| Parameter | Meaning |
|---|---|
| `src` | Site-relative path (`/catalog/…`) or an absolute URL. Required; an empty value emits nothing. |
| `alt` | Alt text, escaped for you. |
| `sizes` | **The box the image will occupy — measure it, do not guess.** Wrong here and the browser picks the wrong variant, which is worse than having no variants. |
| `class`, `style` | Applied to the `<img>`, not the `<picture>`. |
| `eager` | `true` sets `loading="eager"`. Default is lazy. |
| `fetchpriority` | `true` sets `fetchpriority="high"`. For the **one** image that is the page's LCP candidate — a row of them is the same as none of them. |

Two things to know when you use it:

- `<picture>` is `display: contents` (`assets/css/components/media.css`), so the
  `<img>` inside keeps whatever layout the surrounding element gave a bare
  `<img>`. A CSS rule written as a direct-child selector (`.thing > img`) still
  needs updating to `.thing > picture > img` — `entry.css`'s gallery rule is the
  precedent.
- Every variant is confirmed on disk before it enters a `srcset`. A `<source>`
  that matches by type and then 404s is **not** retried against the `<img>`; the
  reader just gets a broken image. So a manifest that has drifted from the tree
  — a hand-deleted file, a half-resolved merge — degrades to the original rather
  than to nothing.

The `sizes` values shipped in `_includes/entry-thumb.html` and
`_includes/gallery.html` were measured in a browser at 390, 640, 1024, 1280 and
1440 wide, not estimated. If you change a grid, re-measure them.

## What it bought

Measured on the ten sample entries at 390×844, DPR 2, throttled to 1.6 Mbps /
150 ms RTT / 4× CPU:

| Page | Before | After |
|---|---|---|
| `/catalog/` LCP image | 20,090 B (`01.png`) | 11,551 B (`01-800.avif`) |
| `/catalog/` all images | 124,131 B | 70,843 B (−43%) |
| `/catalog/epi-signal-triage/` all images | 55,903 B | 30,279 B (−46%) |

The sample screenshots are small and already well-optimised, which understates
the effect: the case this exists for is a real 2–4 MB retina PNG dropped into a
356px card, where the 400px AVIF is a hundredth of the source. `check_file_sizes.rb`
warns above 2 MB for exactly that image, because derivatives shrink what is
served and can do nothing about what is cloned.
