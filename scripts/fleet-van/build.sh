#!/usr/bin/env bash
# Rebuild public/models/fleet-van.glb from the photos: atlas -> Blender model -> preview renders.
#   scripts/fleet-van/build.sh            (needs Blender 4.2+ and python3 with numpy + pillow)
#   BLENDER=/path/to/Blender scripts/fleet-van/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
PY=${PYTHON:-python3}
OUT=work/fleet-van
mkdir -p "$OUT"
"$PY" scripts/fleet-van/atlas.py "$OUT"
"$BLENDER" -b -noaudio -P scripts/fleet-van/build_van.py -- "$PWD/$OUT/atlas.jpg" "$PWD/$OUT/atlas.json" "$PWD/$OUT/fleet-van.glb" | grep -E 'TRIS|WROTE|Error'
"$BLENDER" -b "$OUT/fleet-van.blend" -noaudio -P scripts/fleet-van/render.py -- "$PWD/$OUT/preview" | grep -c Saved
cp "$OUT/fleet-van.glb" public/models/fleet-van.glb
ls -la public/models/fleet-van.glb
