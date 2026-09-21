# User-directed spatial corrections · September 21, 2026

This revision follows the user's explicit layout instructions after the seven-photo review. The photographs supply appearance references; they do not override these instructions.

- Upstairs office fit-out is rotated 90° counterclockwise in plan. The building footprint remains registered with the ground floor. Edge partitions are fitted to that footprint; the conference room now runs east–west, with its south doorway beside the middle stair landing. Eighteen workstations are retained.
- Both administration stair flights meet the upper floor through actual slab openings, with open landing ends and side rails. The side landing includes a lift on the same X/Z axis at both levels.
- The rear stair is reversed and runs from the basement (−3.2 m) to ground (0 m). Its north landing is inside the building footprint. The PT building stair is reversed and runs from ground to the equipment mezzanine (+3.35 m). The separate low therapy training steps are unchanged.
- The nursing-station assembly is reversed 180°, including its internal chairs and equipment. Its opening now faces the other direction.
- All six exam rooms exchange the cabinet/sink wall with the monitor/keyboard workstation wall. Exam recliners face the opposite direction; visitor chairs occupy the opposite corner and diagnostics follow the new patient orientation.
- The dental chair is in **the second exam room counted from the south clinic entrance**: model trace `clinic-exam-05` (trace `06` is nearest). These trace IDs are not verified physical door numbers. The chair includes a separate dental delivery unit and examination lamp.
- The two large bathrooms opposite dining contain shower fixtures with folding seats, grab rails, hand showers and gathered curtains. The right/east room also contains a black hydraulic barber chair and hair-washing basin.
- Storage racks with folded linen occupy the back storage room; two front-loading washing machines occupy the back laundry room directly behind the personal-care showers.
- Existing 4× playback, arrival workflows, front activity clearance and reusable staff models are retained. Clinical seat anchors and navigation are regenerated from the revised furniture.

## Geometric validation

The shared renderer cuts openings through both the structural floor slabs and room finishes. Incoming stairs remain visible from their destination level; export includes each physical flight once. Automated ray checks confirm all 75 stair treads meet their calculated elevations, floor apertures remain open, destination landings belong to the correct floor, upstairs furniture clears stairwells, and exam furniture fits its room. The animated walking routes are checked against the revised furniture footprints.

## Accuracy boundary

Orientation, uses and adjacency implement the user's instructions. Physical dimensions, floor elevations, exact equipment models and hidden construction still use the existing calibrated plan and estimates. This is not a measured as-built model or a claim of pixel-perfect physical accuracy.

## Rebuild

Full regeneration: `build-photo-update.py` applies the upstairs layer, interior photo layer, then `apply-layout-corrections.py` last. The correction layer can also be rerun independently and is idempotent. Regenerate animation with `build-activity.py`, run model/interior/layout/activity validation, and export the GLB from the same source.
