# Seven-photo interior review — September 21, 2026

Photographs establish appearance and visible relationships. The existing plan supplies the footprint. No survey dimensions, manufacturer specifications or hidden bathroom configurations have been certified.

The September 21 photo review supersedes the earlier blanket furniture restoration in the day room, clinic, rehabilitation and dining areas. Unrelated plan furniture, room boundaries, van arrivals, upstairs fit-out and staff templates remain retained. Three front table settings stay cleared for activities.

- Clinic: two photographed equipment families, a staffed nurse station and accessible low counter. Individual exam-room assignments are provisional.
- Rehabilitation: mat plinths, parallel bars, steppers, training steps/ramp, mobile resistance rack, pulleys, balls and stools. OT task seating is a simulation assumption.
- Bathrooms: photographed shared wash areas and cubicle finishes; closed stall interiors remain unverified and retain the plan layout.
- Day room/dining: tree seating, blue lattice cabinetry, landscape banquette, marble tables and cream timber-arm chairs.

[Read the seven-photo review](public/models/interior-photo-review.md) for each source, modeled element and unresolved detail. The model contains 611 catalog objects, including the 17 recreation-room objects added September 30; the active arrangement omits the 15 stored front-table objects. The care-day loop retains 41 people, 12 roles and 4× default speed.

## Rebuild

Run the earlier plan/photo/fleet generators, then `python3 scripts/apply-interior-photos.py`, `python3 scripts/apply-layout-corrections.py`, `python3 scripts/apply-recreation-rooms.py`, `python3 scripts/build-activity.py`, model/layout/interior/activity validation and GLB export. `build-photo-update.py` also applies the interior layer last. Repeating the old plan restoration alone would discard the approved photo update.

## Accuracy

Plan-derived scale is area calibrated, not surveyed. Room numbers, equipment dimensions, exact offsets, the library passage registration and hidden bathroom details need confirmation before this can be treated as an accurate as-built simulation. Geometry checks confirm model clearances only; they do not certify real-world clearances.

See [animation details](public/models/animation-update.md) and [upstairs/fleet details](public/models/upstairs-fleet-update.md).

## User-directed spatial corrections · September 21

The upstairs fit-out is rotated counterclockwise, stair/lift connections have real floor apertures, clinic layouts are reversed, the second-from-entrance room has a dental chair, and personal-care showers/hair care connect with back-room laundry and linen storage. See [the layout correction audit](/models/layout-corrections.md) for room mapping, validation and remaining measurement limits.

## Recreation rooms · September 30

At the owner's request the model shows table tennis and karaoke. No recorded room had these uses, so they are placed in empty image-traced rooms. **The room assignment is an assumption for the owner to confirm**, recorded as the open accuracy issue `recreation-rooms` and in `recreationRooms` in the specification.

- **Game room · table tennis** (`rear-north`): one regulation table (2.74 × 1.525 m, 0.76 m high) centered at x 9.30, z −12.35, long axis north–south, with 1.26–1.37 m run-back at each end. It has a three-seat spectator bench and a paddle/ball rack on the west wall. The room is entered from the south doorway beside the back laundry; the rear exit stays clear.
- **Karaoke room** (`lobby-office-c3`, the primary room, entered from the day room through its south doorway): a large wall-hung screen with a warm backlight on the west wall, flanked by floor-standing speakers. A three-seat sofa faces it from the east wall, with a marble lounge table, a high-back lounge chair and a lamp table. The singer's spot is at x −5.75, z 5.27, about 1 m in front of the screen on the room's centre line, next to the microphone stand. The south doorway and both north openings stay clear.
- **Karaoke room 2** (`lobby-office-w2`, entered from the day room): a smaller version with a screen on the west wall, speakers, microphone, sofa and lamp table. The singer's spot is the room centroid.
- `lobby-office-w1` remains an unassigned reception-side room.

`scripts/apply-recreation-rooms.py` is idempotent and asserts footprints, run-backs, standing spots and door approaches against the traced walls. Equipment follows standard sizes; the placements are estimates. The downloadable facility GLB predates this change and does not yet include these rooms or the new presentation finishes. Regenerate it with `export-model.mjs`.

## Presentation rendering

The viewer renders the specification as an architectural presentation model. Finishes are warm white, light oak and pale stone; the site is paper-toned and trees are abstract. It uses soft key and sky light, a gentle room environment, neutral tone mapping, and depth-based ambient occlusion with hairline edges. The facility JSON keeps its source colors; the presentation palette is a rendering layer in `app/model/renderer.ts`. `createViewer(..., { quality })` or `?quality=high|balanced` chooses between full post-processing and a lighter direct render. Without a choice, the viewer uses `balanced` on dense or small screens and steps down once if `high` is persistently slow.
