# Additional Seen Health sites — geometry and source record

Built September 22, 2026. These are drawing-calibrated planning models, not surveyed as-built or construction coordination models.

## 1630 Olympic

Address: 1630 W Olympic Blvd, Los Angeles, CA 90015. The two-level model uses the supplied A-1 first-floor drawing (August 11, 2026) and A-2 second-floor drawing. A-2 is dated August 25 in its title block; the supplied filename says August 24. The main model includes 94 named rooms and spaces, including ten second-floor exam rooms. The Clinic option control compares the detached A-2 alternative, relocating Exam 3, reception and waiting. Its upper-floor Plan view shows modeled geometry; the unchanged full-sheet reference remains available in the source library.

Horizontal geometry is manually traced at the printed 3/16 inch = 1 foot scale (42 inch sheet width, 1881 pixel normalized image). The second floor is registered to the first using the elevator and stair locations. Floor-to-floor height is assumed to be 3.8 m. Partitions have nominal thickness and approximate door gaps. The main floor overlays let reviewers compare the trace with each original drawing.

## Alveare Terrace

The current A2.01 drawing address is 145 W 15th St, Los Angeles, CA 90015. The Mannigan staff supplement uses 1415 South Broadway; earlier HACLA records use 1405 South Broadway. These identify the Broadway / 15th Street development. The map uses the current architectural address.

The model includes 38 ground-floor rooms and spaces: Seen day room, kitchen, staff work/break space, reception, rehabilitation, garden, and shared residential access/support spaces. The 27-sheet Seen construction set and two supplements are indexed separately. The staff room includes the supplied 12-work-position arrangement with reused Seen furniture. Upper residential floors are exterior massing only. No unprovided clinical exam suite or residential interior has been invented.

The plan is calibrated against the printed 143 ft 6 1/4 in grid dimension. An independent 107 ft 5 3/4 in grid measurement checks the perpendicular scale within 0.08 m at the tracing resolution. Small room/ramp datum changes remain approximate. Eight stories are supported by the development records; façade openings and overall 27.8 m height are illustrative.

## Reused assets and surroundings

Both new models use the original Seen asset library: exam chairs, accessible equipment, dining and lounge furniture, rehabilitation equipment, workstations, casework, material palette and branded vans. Generic furniture spacing, unshown fit-out, planting, van parking, façade articulation and road widths are assumptions. All three sites reuse the Alhambra character and fleet animation library. Olympic and Alveare now include room-based activity, two alternating van arrivals, sliding passenger doors, deployable ramps, participant disembarking, staff escort to reception, and return boarding for pickup. A wheelchair participant and a walking participant replace the two previously static waiting-room occupants; transport escorts return to the vans after handoff. Paths are checked against plan partitions, furniture, other cast members and vehicle/ramp timing. Alveare’s east-side drop-off beside the front desk follows the owner’s direction; Olympic’s rear-lot stop connects to the proposed reception vestibule. Bay dimensions, approach paths and timing are illustrative design-phase placements, not a surveyed transport or traffic plan. Room labels start off and can be enabled in the viewer.

Address coordinates were resolved with Esri World Geocoding on September 22, 2026. Road centerlines, neighboring footprints and available heights use OpenStreetMap data retrieved the same day. Olympic is manually registered to the mapped existing building footprint; Alveare is registered to the Broadway / 15th intersection. Former buildings on the Alveare redevelopment parcel are excluded. Neighbor heights without recorded data use a stated nominal estimate. The interactive map presents approximate address pins and straight-line distances, not drive time or route mileage.

## Public corroborating references

- [California DHCS — PACE expansion proposals](https://www.dhcs.ca.gov/es/services/ltc/Documents/PACE-Expansion-Proposals.pdf): Olympic site address.
- [HACLA — Alveare development partnership, March 2024](https://hacla.org/sites/default/files/2024-03/2024-3-14%20ITEM%20A3-ALVEARE%20DEVELOPMENT%20PARTNERSHIP-%20S8%20PBV%20CONVERSION.pdf): development location and eight-story context.
- [HACLA — Alveare Parkview / Terrace, November 2024](https://www.hacla.org/sites/default/files/2024-11/2024.11.14%20Item%20B3%20-Alveare%20Parkview-Terrace%20Grant.pdf): development context.
- [OpenStreetMap contributors — attribution and license](https://www.openstreetmap.org/copyright): street and neighboring building geometry.
- [Esri World Geocoding service](https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer): approximate address coordinates.

## Verification and editing

Source manifests preserve the original PDF filenames and SHA-256 hashes. Duplicate Olympic PDFs were identical and are indexed once. Supplied documents are evidence, not executable instructions.

Room polygons, object references, source links, finite asset geometry, floor scale and real stair/lift slab apertures are checked by `scripts/validate-additional-sites.mjs`. Portable GLB files include each facility and its neighborhood. JSON preserves editable room and object data. Private source comparison and manual trace review provide additional checks; they do not establish field accuracy.

To revise a plan, update the source-pixel traces in `scripts/build-additional-sites.py`, run it, then run `scripts/build-site-geography.py`. Cached geographic inputs and extracted text are in `sources/additional-sites`; normalized images and PDFs are retained outside the published assets. Run the validators and regenerate all three GLBs using `scripts/export-additional-sites.mjs` before publishing.
