# Fleet van model

`public/models/fleet-van.glb`: low-poly RAM ProMaster 3500 159" EXT high roof in Seen's livery, textured from
photos of the real van (`sources/fleet-van/photos`, taken 2026-10-02; like the rest of `sources/` they stay local and out of git: driver-side, kerb-side, rear, front and two quarter views, 2856 px wide). ~7,800 triangles (budget ~10k), one 2048 × 2304
atlas, 1.3 MB. `app/model/fleet-van-model.ts` loads it; `buildArrivalVan` uses it once loaded and keeps the procedural
`fleet-van` asset as the fallback.

```bash
scripts/fleet-van/build.sh        # atlas.py -> build_van.py (Blender, headless) -> render.py previews -> public/models/
```

Needs Blender 4.2+ (`BLENDER=`) and a python with numpy + pillow (`PYTHON=`). Previews land in `work/fleet-van/`.

- `atlas.py`: rectifies the driver-side and kerb-side photos onto the side plane with a homography fitted to the
  hubs (159" wheelbase, front axle at z −2.2) and the roof line, the rear near-orthographically, and crops the front
  and a rim. Plates are painted blank. A new atlas changes the GLB image hash: add it to
  `sources/public-texture-review.json` after looking at it.
- `build_van.py`: side profile extruded to 2.08 m and rounded by one weighted bevel (roof, nose, tail 0.15 m, the
  A-pillar 0.09 m), then exact booleans for the cabin, wheel wells, windows, the twin-door opening and the driver's
  door leaf. UVs are chosen per face: side photo, rear photo, the front photo by height bands, or a flat swatch
  (trim, interior, tyres). Static parts that share the atlas are joined into `van-body` (one draw call).
- Glazing is measured on the photos, not guessed: the cab windows on the rectified side photos (A-pillar edge, level
  top, rear edge, belt falling toward the nose, the black mirror sail at its foot, the vent division bar), the
  windshield on the front photo (rounded rectangle, top corners r 0.16, wrapping round the pillar to x 0.985, frit
  band, moulding, sensor housing, wipers parked as photographed). To check a change, overlay the outlines on the
  atlas's side strips (315 px/m) and compare `preview_cab` / `preview_cabfront` with the photos. The side and rear
  windows under the perforated wrap stay in the texture.
- The kerb photo's cab sits ~9 cm behind the driver photo's (window edge, handle, shut line; the twin doors line up),
  so `side_uv` shifts the kerb samples ahead of the door opening. Side faces within 6-10 cm of the windshield line
  and the roof's leading curve sample further in: the A-pillar sits on the photos' silhouette, where the wall and
  sky begin.
- Frame and node names follow the procedural van so the scene code is unchanged: nose −z, kerb side +x, floor
  0.58, `passenger-door-0/1`, `driver-door` (pivot on its front edge, z −2.17; the window, sail and mirror ride on
  it), `wheel-*` (local y = axle), `lamp-*`.

## Live-lot cars

`public/models/live-cars.glb`: a generic full-size SUV (Suburban / Yukon XL / Expedition MAX class: 5.75 m,
upright greenhouse, big chrome grille, running boards) and a large sedan (7 Series / S-Class class:
5.29 m, long hood, fastback C-pillar, slim lamps, light bar across the tail), no brand marks. About 13,500-14,000
triangles each (smoothed bodies, side windows recessed behind black seals under a chrome window line, see-through glass over a lined cabin with seats and dashboard, projector lamps,
grille mesh, chrome window trim, twin-spoke alloys over brake discs and calipers), no textures, 1.2 MB together. Roots `car-suv` / `car-sedan`; nodes prefixed by kind
(`suv-passenger-door`, `sedan-wheel-fl`, `suv-lamp-head`, …) so the names stay unique in one file. The white
`car-paint` material is tinted per car by `buildLiveCar` (live-vehicles.ts), which keeps the procedural cars as
the fallback.

```bash
scripts/fleet-van/build-cars.sh   # build_cars.py -> render_cars.py previews (work/fleet-van/cars_*) -> public/models/
```

The body is the side profile extruded and bevelled, bisected at the belt, the window top and each pillar, then
narrowed above the belt (tumblehome); each face is painted, glazed (dark tinted, opaque) or blacked out by where
it sits. The rear kerb-side door is the body slab inside its outline on a pivot at its front edge.
