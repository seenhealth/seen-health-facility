# Portable Seen Health facility specification — schema 2.0

A facility is data, not a copy of the renderer. The same viewer loads another validated specification through **Model files → Open another specification**. JSON loading is local to the current browser view; export the specification to keep a copy. The default published facility is unchanged by importing a file locally.

## Coordinate and dimension contract

- `units` is always `m`. One GLB/Three.js unit equals one meter.
- Coordinate system: right handed, X/Z horizontal, Y up. The Alhambra data uses +X toward the right of its plan and +Z toward Valley Blvd.; this does not assert a surveyed georeferenced north bearing.
- Level `elevation` is an absolute Y datum in meters.
- Keep `ground` as the main-floor ID. `basement`, `upper`, and `roof` are the viewer's standard level roles; additional level IDs appear in the level navigation. Site objects use the virtual `site` level and zone.
- Zone and room `polygon` points are `[x,z]`, in a shared facility coordinate frame. Do not bake level elevations or exploded positions into polygons.
- Wall endpoints `a`, `b` are `[x,z]`; `height` and `thickness` are meters.
- Furniture `position` is `[x,y,z]` relative to its level, `rotation` is radians around Y, and `scale` is `[x,y,z]`.
- Asset `dimensions` are `[width,height,depth]` in meters, measured in the asset’s local coordinate system. The origin is the center of its footprint, on the floor.
- `details` are architectural parts: position `[x,y,z]` at their bottom center, dimensions `[width,height,depth]`, Euler rotation `[x,y,z]` in radians. `surface` routes them to exterior, site or structure; `zoneId` can attach them to a particular moving area.
- `roofSections` describe bounds, eave elevation and roof rise. Flat and barrel sections are supported. Their heights are absolute, not offsets from the roof UI level.
- Camera explosion and level separation are presentation state only. They never mutate the facility data, and exports reset their transforms.

## Stable identities

Use stable IDs for facilities, levels, zones, rooms, walls, objects and architectural parts. A room can change shape while retaining its ID. IDs used by object `zoneId`, `roomId`, `assetId` and `levelId` must resolve. IDs should remain human-readable, e.g. `clinic-exam-03`, `wall-036` or `admin-task-chair-004`.

The Alhambra trace IDs are not invented architectural room numbers. Exact room numbers remain unverified unless the source explicitly names them.

## Reusing a building design

1. Export the current JSON as a starting specification and change its `id`, name, address, revision and sources.
2. Replace level elevations, room and zone polygons, wall endpoints and openings, roof sections and architectural details using the new center’s dimensioned plans.
3. Replace `site` with the new site image, bounds, image dimensions and building outline. Retain an empty schematic or actual new source image; do not carry Alhambra’s streets into another center.
4. Preserve the asset and material library to retain the visual language, or substitute approved product models and finish specifications.
5. Place furniture instances with new transforms and source references. A furniture schedule should specify product ID, size, rotation, room and placement coordinates.
6. Update source pages, documented dimensions and unresolved issues. Clear any verification status that does not apply to the new facility.
7. Validate and load the JSON in the viewer. Export the resulting model and specification.

The renderer contains no Alhambra-specific footprint or facade coordinates. Layout, facade geometry, site context and placement data are supplied by the specification.

## Swap furniture or equipment

To change every use of a furniture family, update `assets[assetId]`. To change just one object, assign a different `assetId` or modify its transform.

```json
{
  "kind": "exam-chair",
  "dimensions": [0.72, 1.22, 1.55],
  "material": "clinical-blue",
  "modelUrl": "/assets/approved-exam-chair.glb"
}
```

`modelUrl` is optional. Use a local public asset path or HTTPS URL with suitable access/CORS. The imported GLB is normalized to its floor-centered origin and fitted to the declared W/H/D dimensions. Those declared dimensions therefore must be correct. When the file fails to load, the procedural placeholder is retained and the instance records a custom-asset error. A specification must travel with referenced GLB files and images; JSON alone does not embed those binary assets.

## Fidelity and evidence

Keep `status`, `notes` and `referencePages` for every element. A stated area is not a surveyed length. A mood board is not evidence of installed conditions. Preserve the distinction between documented dimensions, image-traced positions and inferred geometry. Do not replace uncertainty with fabricated dimensions to force a numerical match.

The archived 2024 Alhambra horizontal calibration uses the clinic area on page 14 against a traced perimeter on page 12. It is not an as-built certification. The dimensions of furniture placeholders are inferred, and the declared upper/basement elevations are provisional.

The September 16 planning revision supersedes the PDF ground-floor geometry with `Overall Planning.jpg`. Its `planningTrace` records the original image checksum, coordinate frame and reviewed furniture counts. Each traced object has `sourcePixelPosition` and `sourcePixelFootprint`; each traced wall has `sourcePixels`. These source coordinates are provenance, while `position`, `dimensions` and `scale` remain the SI geometry contract. Upper levels and documented PDF wall-finish heights remain provisional or documented as previously recorded.

Rooms can specify `floorMaterial` to override the area's general finish. Reference records can specify `label` and `file` for separately supplied images; the numeric `page` is their stable reference index, not necessarily a PDF page number. `exportFiles` identifies the current prepared GLB and written audit.

The September 18 photographic update retains the calibrated footprint and wall endpoints. `photoSurvey` records the user's room mapping and instruction to prefer photographed furniture. Changed furniture no longer asserts that its old symbol footprint is exact. `seen-alhambra-planning-base.json` preserves the preceding plan configuration for comparison.

## Photographed components and presentation layers

Assets can override named material slots through `materials` (for example `wood`, `metal`, `frame`, `light`), and use simple `parameters` for variants. The reusable library includes upholstered and mesh chairs, a circular tree seat, U-shaped nurse station, quartz counter, casework, blue-lattice library bays, landscape screen, lockers, sliding doors, meeting table, ceiling grid, timber truss, lights, ducts and vanities.

```json
{
  "kind": "locker-bank",
  "dimensions": [5.85, 2.16, 0.48],
  "material": "oak",
  "materials": { "metal": "photo-black", "white": "photo-white" },
  "parameters": { "columns": 18, "tiers": 2 }
}
```

These locker dimensions and column count illustrate the estimated Alhambra reconstruction; replace them with the new center's schedule. Declared dimensions always describe the complete asset bounding box, including handles, chair backs or faucets.

Instance `layer` defaults to `furniture`. `architecture` preserves built-in joinery when furniture is hidden; `wall-finish` appears with full walls; `ceiling` follows the Ceilings & structure toggle and stays with its area when exploded. `exterior` and `roof` travel with the building envelope and roof layers. All layers are included in the assembled GLB regardless of the current view. Roof sections with `structure: "components"` use their explicit timber/ceiling assets instead of the generic truss generator.

Materials can include a relative or HTTPS `textureUrl`, `emissive` color and `emissiveIntensity`. Include texture files when exchanging a specification. Photo references use `mediaType: "image"` or `"video"`, `sourceName`, a poster/thumbnail `image` and a source `file`. The supplied video is H.264 MP4. The reference manifest preserves original checksums; delivered photo copies are resized to 2400 pixels and are not full-resolution originals.

## Deliverables

- Facility JSON: editable layout and reusable definitions.
- GLB: full assembled building in meters, named levels/areas/objects, complete walls and site context; independent of cutaway/exploded UI state.
- Accuracy-register JSON: source references, documented dimensions, room register and unresolved issues.
- Original source library: all pages preserved and indexed.
- PNG: current geometry view, without HTML interface or floating labels.

Use `npm run validate:model` to check the current specification and the asset/geometry contract. The scene integration harness runs without a browser or GPU and cannot establish visual fidelity by itself.

To reproduce the original PDF transcription, run `python3 scripts/build-facility.py` with Poppler's `pdftotext` installed, then `python3 scripts/build-audit.py`. The original PDF and page images are included under `public/reference/final/`.

To reconstruct the planning baseline, run `python3 scripts/build-planning.py` (Pillow and NumPy required). The exact original image is preserved as archive parts with a SHA-256 checksum in `sources/planning/`; the generator reassembles `Overall Planning.jpg` automatically. The web copies retain the full image at 7200 × 5400 and 3600 × 2700 pixels in RGB JPEG format. Then run `python3 scripts/build-photo-update.py` to produce the current photographic model. It uses the supplied media folder from `SEEN_HEALTH_MEDIA_DIR`, or reuses the delivered media and checksum manifest already in the repository. On macOS it regenerates bilingual sign textures; other systems retain the included textures.

Run `npm run validate:model` before `node scripts/export-model.mjs`; the export script uses `@napi-rs/canvas`, or the module path supplied in `FACILITY_CANVAS_MODULE`. The current outputs are `seen-alhambra-planning.json`, `seen-alhambra-planning.glb` and `photo-update.md`. Validation/export accept a model JSON path as their first argument for checking retained Alhambra versions. Other buildings use the same runtime specification validator; adapt source-specific verification assertions to their own area schedules and furniture counts. The headless checks verify geometry, layers, references and export portability; they do not certify photographic or measured accuracy.

## Exterior envelope and roof footprints

Optional `envelope` in schema 2.0 stores `walls`, closed perimeter `loops`, and evidence notes. Each wall has stable ID, area ID, meter-based endpoints, thickness, height and material. `openings` use offsets along the wall from endpoint a, width, sill and height, plus kind/material. Optional `profile` is an ordered wall-local [distance,height] top edge; `detailIds` reuses separately modeled photographic frontage. The validator checks loop continuity, unique IDs, bounded and non-overlapping openings, and material/source references.

Roof sections can use an explicit `polygon` footprint, including setbacks, instead of rectangular bounds. `parapet: false` means the envelope/coping provides the parapet. The renderer curves barrel roofs across these footprints and closes their undersides and edges. Raised roof-junction walls are exterior details.

Rebuild in order: `build-planning.py`, then `build-photo-update.py` (which applies `build-envelope.py`). The exterior is an assembled view; cutaway copies follow area explosion without being duplicated in GLB export. Section planes affect viewing only. Export contains the full building regardless of the current cut depth, hidden layers or exploded areas.

## Current furniture authority

Overall Planning.jpg is authoritative for furniture. The final `plan_furniture.py` stage restores the saved plan instances and asset definitions after photographic architectural finishes and the envelope are applied. This removes photo-only loose furniture and competing fixed furnishings without rolling back walls, roof geometry, confirmed room locations or viewing controls.
