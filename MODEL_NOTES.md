# Seven-photo interior review — September 21, 2026

Photographs establish appearance and visible relationships. The existing plan supplies the footprint. No survey dimensions, manufacturer specifications or hidden bathroom configurations have been certified.

The September 21 photo review supersedes the earlier blanket furniture restoration in the day room, clinic, rehabilitation and dining areas. Unrelated plan furniture, room boundaries, van arrivals, upstairs fit-out and staff templates remain retained. Three front table settings stay cleared for activities.

- Clinic: two photographed equipment families, a staffed nurse station and accessible low counter. Individual exam-room assignments are provisional.
- Rehabilitation: mat plinths, parallel bars, steppers, training steps/ramp, mobile resistance rack, pulleys, balls and stools. OT task seating is a simulation assumption.
- Bathrooms: photographed shared wash areas and cubicle finishes; closed stall interiors remain unverified and retain the plan layout.
- Day room/dining: tree seating, blue lattice cabinetry, landscape banquette, marble tables and cream timber-arm chairs.

[Read the seven-photo review](public/models/interior-photo-review.md) for each source, modeled element and unresolved detail. The model contains 570 catalog objects; the active arrangement omits the 15 stored front-table objects. The care-day loop retains 41 people, 12 roles and 4× default speed.

## Rebuild

Run the earlier plan/photo/fleet generators, then `python3 scripts/apply-interior-photos.py`, `python3 scripts/build-activity.py`, model/interior/activity validation and GLB export. `build-photo-update.py` also applies the interior layer last. Repeating the old plan restoration alone would discard the approved photo update.

## Accuracy

Plan-derived scale is area calibrated, not surveyed. Room numbers, equipment dimensions, exact offsets, the library passage registration and hidden bathroom details need confirmation before this can be treated as an accurate as-built simulation. Geometry checks confirm model clearances only; they do not certify real-world clearances.

See [animation details](public/models/animation-update.md) and [upstairs/fleet details](public/models/upstairs-fleet-update.md).
