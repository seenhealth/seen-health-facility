# Fleet van model

`public/models/fleet-van.glb`: low-poly RAM ProMaster 3500 159" EXT high roof in Seen's livery, textured from
photos of the real van (`sources/fleet-van/photos`, taken 2026-10-02; like the rest of `sources/` they stay local and out of git: driver-side, kerb-side, rear, front and two quarter views, 2856 px wide). ~1,900 triangles, one 2048 × 2304 atlas,
1.1 MB. `app/model/fleet-van-model.ts` loads it; `buildArrivalVan` uses it once loaded and keeps the procedural
`fleet-van` asset as the fallback.

```bash
scripts/fleet-van/build.sh        # atlas.py -> build_van.py (Blender, headless) -> render.py previews -> public/models/
```

Needs Blender 4.2+ (`BLENDER=`) and a python with numpy + pillow (`PYTHON=`). Previews land in `work/fleet-van/`.

- `atlas.py`: rectifies the driver-side and kerb-side photos onto the side plane with a homography fitted to the
  hubs (159" wheelbase, front axle at z −2.2) and the roof line, the rear near-orthographically, and crops the front
  and a rim. Plates are painted blank. A new atlas changes the GLB image hash: add it to
  `sources/public-texture-review.json` after looking at it.
- `build_van.py`: side profile extruded to 2.08 m and bevelled, then exact booleans for the cabin, wheel wells,
  windows, the twin-door opening and the driver's door leaf. UVs are chosen per face: side photo, rear photo, the
  front photo by height bands, or a flat swatch (trim, interior, tyres).
- Frame and node names follow the procedural van so the scene code is unchanged: nose −z, kerb side +x, floor
  0.58, `passenger-door-0/1`, `driver-door` (pivot on its front edge), `wheel-*` (local y = axle), `lamp-*`.
