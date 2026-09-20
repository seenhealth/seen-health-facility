# Facility update — plan furniture restored

Furniture follows Overall Planning.jpg at the user’s latest direction. All 306 original plan instances have their original asset definitions, counts, positions, rotations and scales. Photographs remain available as references and continue to inform architectural finishes.

## Changes

- Day room: diamond-oriented square tables and chairs, original tree and surrounding table locations, west banquette, four lounge chairs and two small lounge tables.
- Clinic and reception: original plan counters, seats and equipment. Photo-only furniture and replacement counter assemblies are removed.
- Administration: plan meeting tables and chairs. Photo-only staff stools, counters, kitchenette, lockers and meeting screens are removed; user-confirmed room locations are retained.
- Restrooms: plan plumbing fixture positions restored; photographed partitions, tile and mirrors retained.
- Building: completed rear and side walls, stepped roofs, doors, architectural finishes and all viewing controls retained.
- All 18 photos and the drone video remain in the source library.

## Accuracy

Furniture matches the saved trace of the supplied plan. Physical scale still uses the stated clinic area; the plan is not a dimensioned survey. Hidden elevations, upper-floor interiors and estimated heights retain their existing uncertainty labels.

## Portable components

Furniture, materials, walls and openings remain separate JSON definitions. Rebuild with build-planning.py, then build-photo-update.py; the final plan_furniture.py step enforces the latest furniture authority while retaining the envelope. GLB export includes the complete building.


## Complete building shell

The registered main building and adjoining wing now have two closed perimeter loops, including the clinic east face, rear service-room setbacks, side walls, west drop-off wall and admin stair projection. Roof slabs follow the stepped plan, with raised roof junction walls and curved barrel end closures. Documented door/window locations are retained; rear elevation heights and unseen finishes remain inferred.

Whole building and Rear views show the assembled shell. Cutaway, per-area isolation, levels and adjustable section planes reveal the interior. JSON stores walls, openings, profiles and source evidence; GLB export always includes the full assembled geometry, independent of section controls.

## September 19 follow-up

Upstairs administration now includes a photo-informed open office, conference room, storage, restroom and lift landing. Placement and dimensions remain estimated. Both static Van A/B models use the final supplied wrap sheet. Staff clothing uses solid colors and the supplied cut without ginkgo printing. The September 20 update adds 41 rounded isometric 3D people across 12 roles in a controllable twelve-minute care-day loop with accessible van arrival, a sliding entrance, two reception colleagues and separate person/interaction tracks, plus 3D street context. Three generalized Orbit-informed journeys retain separate guided playback and room focus. See [the animation audit](public/models/animation-update.md). See [the upstairs and fleet audit](public/models/upstairs-fleet-update.md).

## Day-room repertoire and flexible layout — September 20, 2026

The owner authorized clearing front tables for activities. The active 3D arrangement and GLB omit day-diamond-table-01 through -03 and their twelve chairs (15 objects), while all 518 original source objects remain in the facility JSON and plan comparison. The active GLB therefore contains 503 catalog objects. Do not restore those front tables from the baseline during routine rebuilds. `app/data/day-program.json` is the explicit layout and repertoire override.

Ten owner-requested session types share the care-day clock, with standing, chair-based and wheelchair participants, a staff facilitator, a care aide and a quiet calligraphy/craft alternative. Actual daily timing and language preferences are illustrative. See `public/models/animation-update.md` for behavior and source distinctions.
