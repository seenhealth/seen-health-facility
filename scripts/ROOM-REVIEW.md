# Room review pipeline

Existing model metadata, materials and geographic registration are preserved. `refine-site-rooms.py` restores the original source-pixel room seed, applies explicit corrections, and replaces only Olympic and Alveare interiors. It is repeatable.

1. To change the vector evidence, run `trace-site-openings.py` with PyMuPDF and Pillow. Page rotation is applied before mapping to each existing reference image. The resulting `sources/additional-sites/*-vectors.json` files are committed; normal model rebuilds do not require PyMuPDF.
2. Run `python3 scripts/refine-site-rooms.py`.
3. Run `node scripts/validate-additional-sites.mjs` followed by `node scripts/validate-room-review.mjs`.
4. Export each changed model with `scripts/export-additional-sites.mjs`, setting `FACILITY_CANVAS_MODULE` to an installed `@napi-rs/canvas` path if it is not in this project's dependencies.
5. Build the site and publish through Sites.

For a full rebuild from the original imported plans, run `build-additional-sites.py`, `build-site-geography.py`, then `refine-site-rooms.py` before validation and exports. `room-review-baseline.json` contains the source room/level registrations, not authoritative final furniture layouts.

The upper Olympic sheet is registered at +322,+40 source pixels to the lower sheet's existing cores. The A-2 clinic inset is registered at +633.6 pixels horizontally using matching door and lift anchors. The 2-foot rise is confirmed; its west-wing extent is inferred and documented in the model's accuracy register.

Wall pairs are consolidated, then cut by source door intervals. Swing direction overrides are individually reviewed in `refine-site-rooms.py`; do not assume the longer neighboring wall always identifies the closed position. An independent clearance check ensures no partition blocks a modeled doorway.

`public/models/room-review.md` is the user-facing review and limitations record.

## Olympic exterior

`apply-olympic-exterior.py` updates both Olympic variants from the seven exterior photographs retained privately in `sources/nonpublic/photos/olympic-exterior/`. It preserves room layouts, doors and interior equipment. Apply it after any interior model regeneration. The custom shell is in `app/model/olympic-exterior.ts`; the corner screen is a parapet feature, not another occupied level. Heights, site offsets and parking geometry are estimated from photos against the plan footprint. Existing rear entry locations may require alteration for the proposed interior.

Run `validate-olympic-exterior.mjs` with the canvas runtime before exporting; it checks finite geometry and compares interior data to the prior Git revision (optional first argument). Export scripts compile their model dependencies directly from current source. Newly embedded GLB textures must be visually inspected before adding their hashes to `sources/public-texture-review.json`.

## Public-source policy

For Olympic's day-space furnishing pass, run `update-olympic-day-spaces.py` after any room/exterior regeneration. It restores the restaurant and group-activity furniture symbols, furnishes the west day space as a proposal, and preserves all room boundaries, openings, and upper-floor fit-out. The entrance-side parking enclosure is intentionally omitted by user request. Room labels use per-level design identifiers, with compact markers at overview scale and names on hover, selection, or zoom; they are not architectural room numbers.

Architectural PDFs, drawing images, and extracted page text must never be deployed. Full references and original specifications are retained under `sources/nonpublic/`. Model generators may create temporary source views in `public`; after all geometry work, run `node scripts/prepare-public-models.mjs`. The prebuild hook repeats this sanitization and validates all public assets. The public viewer has no source library or drawing overlays. Keep the 3D models, physical material textures and geographic context available.
