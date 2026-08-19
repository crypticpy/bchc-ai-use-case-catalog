#!/usr/bin/env bash
#
# Rebuild the bundled webfonts: assets/fonts/*.woff2 and the metric-override
# numbers documented in assets/fonts/README.md.
#
#   npm run fonts            # download, subset, report sizes and metrics
#
# Three variable fonts replace seven static cuts. A variable file carries every
# weight from 400 to 700 in one download, which is smaller than three static
# cuts of the same family and removes the failure mode where a Tailwind
# `font-medium` somewhere pulls a fourth file nobody preloaded.
#
# Everything happens in a scratch directory; only the two .woff2 files are
# copied into assets/fonts/ (three files). Needs python3 and curl. No repo dependency: this
# runs by hand when a font is upgraded, not in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/assets/fonts"
WORK="${FONT_WORK_DIR:-$(mktemp -d)}"

INTER_TAG="v4.1"
SOURCE_SANS_TAG="3.052R"
SOURCE_SERIF_TAG="4.005R"

# latin + latin-extended, plus the punctuation, arrows and symbols the site's copy
# uses. Same range the previous static subsets were cut with; widen it (or drop
# --unicodes entirely) if your catalog needs Cyrillic, Greek or Vietnamese.
UNICODES="U+0000-00FF,U+0100-024F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+2000-206F,U+20AC,U+2113,U+2122,U+2190-2199,U+2212,U+2215,U+2C60-2C7F,U+A720-A7FF,U+FEFF,U+FFFD"

echo "==> work dir: $WORK"
mkdir -p "$WORK"
cd "$WORK"

if [ ! -x .venv/bin/pyftsubset ]; then
  echo "==> installing fonttools + brotli"
  python3 -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet fonttools brotli
fi

fetch() {
  # fetch <url> <zip name>
  [ -f "$2" ] || curl -sSL -o "$2" "$1"
}

echo "==> downloading upstream sources"
fetch "https://github.com/rsms/inter/releases/download/${INTER_TAG}/Inter-${INTER_TAG#v}.zip" inter.zip
fetch "https://github.com/adobe-fonts/source-sans/releases/download/${SOURCE_SANS_TAG}/VF-source-sans-${SOURCE_SANS_TAG}.zip" source-sans.zip
fetch "https://github.com/adobe-fonts/source-serif/releases/download/${SOURCE_SERIF_TAG}/source-serif-${SOURCE_SERIF_TAG%R}_Desktop.zip" source-serif.zip
rm -rf unpacked && mkdir unpacked
unzip -q -o inter.zip -d unpacked/inter
unzip -q -o source-sans.zip -d unpacked/source-sans
unzip -q -o source-serif.zip -d unpacked/source-serif

# Upstream moves these around between releases, so find them rather than hard-coding a path.
INTER_SRC="$(find unpacked/inter -name 'InterVariable.ttf' | head -1)"
SOURCE_SANS_SRC="$(find unpacked/source-sans -name 'SourceSans3VF-Upright.ttf' | head -1)"
SOURCE_SERIF_SRC="$(find unpacked/source-serif -name 'SourceSerif4Variable-Roman.ttf' | head -1)"
[ -n "$INTER_SRC" ] || { echo "InterVariable.ttf not found in $INTER_TAG"; exit 1; }
[ -n "$SOURCE_SANS_SRC" ] || { echo "SourceSans3VF-Upright.ttf not found in $SOURCE_SANS_TAG"; exit 1; }
[ -n "$SOURCE_SERIF_SRC" ] || { echo "SourceSerif4Variable-Roman.ttf not found in $SOURCE_SERIF_TAG"; exit 1; }

# Two passes. `varLib.instancer` narrows the design space first: Inter also carries an
# `opsz` axis the design system never varies, and both fonts cover 100–900 when the CSS
# only ever asks for 400–700. A pinned axis is dropped from the file outright and a
# clamped one loses its out-of-range deltas, so this is pure subtraction before the
# glyph subsetter runs. pyftsubset has no axis options of its own.
#
# Source Serif 4 also carries an `opsz` axis (8–60). It is pinned at 24 — between the
# card title (18px) and the section title (28px), where nearly every heading on the
# site sits — rather than kept: keeping even the 16–60 range costs 95 KB against 44 KB
# pinned, and a headings-only face on a public-sector audience's phone does not earn
# a second file's worth of bytes for a slightly finer hero cut.
narrow() {
  # narrow <source ttf> <output ttf> <axis limit…>
  local src="$1" out="$2"
  shift 2
  .venv/bin/fonttools varLib.instancer "$src" "$@" -o "$out" >/dev/null
}

# `--layout-features+=tnum` APPENDS to pyftsubset's default feature set. Note the `+=`:
# the more natural-looking `--layout-features=+tnum` silently means "keep exactly one
# feature, named `+tnum`" — it strips kerning and ligatures and yields a file ~20 KB
# smaller that renders visibly worse. `tnum` is the one addition the design system needs,
# for the `font-variant-numeric: tabular-nums` on `.tabular` and the results count.
# `--layout-features='*'` (what the old static recipe used) keeps every feature and costs
# ~21 KB per family for typography this site never asks for.
subset() {
  # subset <source ttf> <output woff2>
  .venv/bin/pyftsubset "$1" \
    --unicodes="$UNICODES" \
    --flavor=woff2 \
    --layout-features+=tnum \
    --no-hinting \
    --desubroutinize \
    --output-file="$2"
}

echo "==> narrowing the design space"
narrow "$INTER_SRC" inter-narrowed.ttf opsz=14 wght=400:700
narrow "$SOURCE_SANS_SRC" source-sans-narrowed.ttf wght=400:700
narrow "$SOURCE_SERIF_SRC" source-serif-narrowed.ttf opsz=24 wght=400:700

echo "==> subsetting"
subset inter-narrowed.ttf Inter-Variable.woff2
subset source-sans-narrowed.ttf SourceSans3-Variable.woff2
subset source-serif-narrowed.ttf SourceSerif4-Variable.woff2

echo "==> installing into assets/fonts/"
cp Inter-Variable.woff2 SourceSans3-Variable.woff2 SourceSerif4-Variable.woff2 "$OUT/"

echo
echo "==> sizes"
ls -l "$OUT"/*.woff2 | awk '{ printf "%10d  %s\n", $5, $9 }'

echo
echo "==> metric overrides for the fallback @font-face blocks in assets/css/components/base.css"
echo "    (percentages of the *fallback* family's em, so the swap does not reflow)"
.venv/bin/python - "$INTER_SRC" "$SOURCE_SANS_SRC" "$SOURCE_SERIF_SRC" <<'PY'
import sys
from fontTools.ttLib import TTFont

# The recipe: express the webfont's own hhea/OS2 metrics as a percentage of the
# local fallback's, after scaling the fallback so its lowercase x-height matches.
# `size-adjust` is that scale; ascent/descent/line-gap overrides are then the
# webfont's metrics divided by (upem * size-adjust).
FALLBACKS = {
    # Arial/Helvetica, from their own hhea tables (upem 2048/2048 x-height 1062/1062).
    "Arial": {"upem": 2048, "xheight": 1062},
    # Georgia (the serif fallback; Times New Roman is second in the local() list and
    # close enough in x-height that one set of overrides serves both).
    "Georgia": {"upem": 2048, "xheight": 986},
}

def metrics(path):
    f = TTFont(path, fontNumber=0, lazy=True)
    upem = f["head"].unitsPerEm
    hhea = f["hhea"]
    os2 = f["OS/2"]
    xheight = getattr(os2, "sxHeight", 0) or f["glyf"]["x"].yMax if "glyf" in f else 0
    return {
        "upem": upem,
        "ascent": hhea.ascent,
        "descent": abs(hhea.descent),
        "gap": hhea.lineGap,
        "xheight": xheight,
        "name": f["name"].getDebugName(1),
    }

for path in sys.argv[1:]:
    m = metrics(path)
    fb = FALLBACKS["Georgia" if "Serif" in m["name"] else "Arial"]
    # size-adjust equalises x-height between the webfont and Arial.
    size_adjust = (m["xheight"] / m["upem"]) / (fb["xheight"] / fb["upem"])
    scale = m["upem"] * size_adjust
    print(f'  /* {m["name"]} — upem {m["upem"]}, x-height {m["xheight"]} */')
    print(f'  size-adjust: {size_adjust * 100:.1f}%;')
    print(f'  ascent-override: {m["ascent"] / scale * 100:.1f}%;')
    print(f'  descent-override: {m["descent"] / scale * 100:.1f}%;')
    print(f'  line-gap-override: {m["gap"] / scale * 100:.1f}%;')
    print()
PY

echo "==> done. Paste the numbers above into assets/css/components/base.css and"
echo "    re-run 'npm run build:css'. Delete $WORK when finished."
