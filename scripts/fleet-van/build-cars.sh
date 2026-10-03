#!/usr/bin/env bash
# Rebuild public/models/live-cars.glb (generic SUV + sedan for the live lot) and its preview renders.
#   scripts/fleet-van/build-cars.sh        (needs Blender 4.2+; PYTHON with pillow only for the contact sheets)
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
OUT=work/fleet-van
mkdir -p "$OUT"
"$BLENDER" -b -noaudio -P scripts/fleet-van/build_cars.py -- "$PWD/$OUT/live-cars.glb" | grep -E 'TRIS|WROTE|Error'
"$BLENDER" -b "$OUT/live-cars.blend" -noaudio -P scripts/fleet-van/render_cars.py -- "$PWD/$OUT/cars" | grep -c Saved
cp "$OUT/live-cars.glb" public/models/live-cars.glb
ls -la public/models/live-cars.glb
