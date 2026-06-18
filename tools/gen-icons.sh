#!/usr/bin/env bash
# Generate Stream Deck action icons from a single source PNG.
#
# Source: a WHITE glyph on a transparent background.
# Outputs into imgs/actions/<action-name>/:
#   icon.png     (20x20)   white glyph, transparent bg   (shown in the actions list)
#   icon@2x.png  (40x40)
#   key.png      (72x72)   grey bg + pink circle + glyph (shown on the key)
#   key@2x.png   (144x144)
#
# Usage:
#   tools/gen-icons.sh <source.png> <action-name> [extra magick ops...]
#
# Extra magick ops are applied to the glyph (e.g. rotate/flip):
#   tools/gen-icons.sh ~/Downloads/disc.png    add-track
#   tools/gen-icons.sh ~/Downloads/reload.png  go-forward  -rotate 90
#   tools/gen-icons.sh ~/Downloads/reload.png  go-back     -rotate 90 -flop

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <source.png> <action-name> [extra magick ops...]" >&2
  exit 1
fi

SRC="$1"; NAME="$2"; shift 2
TRANSFORM=("$@")   # optional magick operators applied to the glyph (rotate/flip/...)

# --- appearance (sampled from the existing icons) ---
GREY="#F2F2F2"      # key background
PINK="#E05656"      # key circle
CIRCLE_PCT=66       # circle diameter as % of the canvas
GLYPH_PCT=52        # glyph size as % of the circle diameter
ICON_PAD_PCT=0      # padding for the list icons (% of size); 0 = fill the square

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTDIR="$SCRIPT_DIR/../jp.hayate-kojima.ytm-desktop-controller.sdPlugin/imgs/actions/$NAME"
mkdir -p "$OUTDIR"

# Trimmed white glyph on a transparent bg (+ optional transform).
# (-fill white -colorize 100 is a safety net in case the source isn't pure white.)
GLYPH="$(mktemp -t sdglyph).png"
trap 'rm -f "$GLYPH"' EXIT
magick "$SRC" -trim +repage -fill white -colorize 100 ${TRANSFORM[@]+"${TRANSFORM[@]}"} +repage "$GLYPH"

# List icon: white glyph centered on a transparent square.
make_icon() {
  local S=$1 OUT=$2
  local inner=$(( S - S * ICON_PAD_PCT / 100 ))
  magick "$GLYPH" -resize "${inner}x${inner}" \
    -background none -gravity center -extent "${S}x${S}" "$OUT"
}

# On-key image: grey square + pink circle + white glyph.
make_key() {
  local S=$1 OUT=$2
  local c=$(( S / 2 ))
  local r=$(( S * CIRCLE_PCT / 200 ))                 # circle radius (= diameter / 2)
  local g=$(( S * CIRCLE_PCT * GLYPH_PCT / 10000 ))   # glyph box size
  magick -size "${S}x${S}" "xc:${GREY}" \
    -fill "$PINK" -draw "circle ${c},${c} ${c},$(( c - r ))" \
    \( "$GLYPH" -resize "${g}x${g}" \) -gravity center -composite \
    "$OUT"
}

make_icon 40  "$OUTDIR/icon@2x.png"
make_icon 20  "$OUTDIR/icon.png"
make_key  144 "$OUTDIR/key@2x.png"
make_key  72  "$OUTDIR/key.png"

echo "Generated 4 icons in $OUTDIR"
