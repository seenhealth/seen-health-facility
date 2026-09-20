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

## Room-by-room evidence

| Space | Source | Update |
|---|---|---|
| Nurse station | Photo 7, Photo 8, Photo 9, Photo 10, Photo 13 | Nurse-station counters and furnishings restored to the planning layout. Photographed soffit, doors and ceiling remain architectural references. |
| Reception & arrival | Photo 6 | Reception counters follow Overall Planning.jpg. Photographed moss wall, timber slats and overhead fins remain; photo-only furniture and its desk-mounted sign were removed. |
| Day room | Photo 1, Photo 2, Photo 3 | Furniture follows Overall Planning.jpg: diamond-oriented square tables and chairs, original tree and surrounding table positions, west banquette, four lounge chairs and two small tables. Photographed landscape wall, ceiling and finishes are retained. |
| Administration entry & locker corridor | Photo 16, Locker detail, Lounge photo | User-confirmed administration entry and locker corridor. The current model uses plan furnishings; photographs remain available as references for the built room. |
| Shared multistall restroom · north | Photo 4, Photo 5 | User-confirmed paired multistall restrooms beside OT/rehab and the day center. Plumbing fixture positions follow Overall Planning.jpg; photographed tile, stall partitions and mirrors are retained. Gender assignment remains unconfirmed. |
| Shared multistall restroom · south | Photo 4, Photo 5 | User-confirmed paired multistall restrooms beside OT/rehab and the day center. Plumbing fixture positions follow Overall Planning.jpg; photographed tile, stall partitions and mirrors are retained. Gender assignment remains unconfirmed. |
| Three-seat meeting room west | Photo 18 | Meeting table and three chairs follow Overall Planning.jpg. User-confirmed yellow walls and photographed carpet/whiteboard are retained. |
| Three-seat meeting room east | Photo 18 | Meeting table and three chairs follow Overall Planning.jpg. User-confirmed yellow walls and photographed carpet/whiteboard are retained. |
| Staff Lounge · 1520 | Photo 16, Lounge photo | User-confirmed Staff Lounge 1520 beside the upstairs stair and locker corridor. Furnishings follow the plan; photo-only stools, kitchenette, breakfast counter and locker bank are not added to this configuration. |

## Complete building shell

The registered main building and adjoining wing now have two closed perimeter loops, including the clinic east face, rear service-room setbacks, side walls, west drop-off wall and admin stair projection. Roof slabs follow the stepped plan, with raised roof junction walls and curved barrel end closures. Documented door/window locations are retained; rear elevation heights and unseen finishes remain inferred.

Whole building and Rear views show the assembled shell. Cutaway, per-area isolation, levels and adjustable section planes reveal the interior. JSON stores walls, openings, profiles and source evidence; GLB export always includes the full assembled geometry, independent of section controls.
