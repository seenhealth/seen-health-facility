# Seven-photo interior review — September 21, 2026

Photographs establish appearance and visible relationships. The existing plan supplies the footprint. No survey dimensions, manufacturer specifications or hidden bathroom configurations have been certified.

The September 21 photo review supersedes the earlier blanket furniture restoration in the day room, clinic, rehabilitation and dining areas. Unrelated plan furniture, room boundaries, van arrivals, upstairs fit-out and staff templates remain retained. Three front table settings stay cleared for activities.

- Clinic: two photographed equipment families, a staffed nurse station and accessible low counter. Individual exam-room assignments are provisional.
- Rehabilitation: mat plinths, parallel bars, steppers, training steps/ramp, mobile resistance rack, pulleys, balls and stools. OT task seating is a simulation assumption.
- Bathrooms: photographed shared wash areas and cubicle finishes; closed stall interiors remain unverified and retain the plan layout.
- Day room/dining: tree seating, blue lattice cabinetry, landscape banquette, marble tables and cream timber-arm chairs.

[Read the seven-photo review](public/models/interior-photo-review.md) for each source, modeled element and unresolved detail. The reviewed Alhambra model contains 596 catalog objects; the active arrangement omits the 15 stored front-table objects. The care-day loop has 167 people. Additional Olympic and Alveare models, exterior references and arrivals are included; see the room-review and additional-sites accuracy notes in `public/models/`.

## Rebuild

The checked-in models are the reviewed state. Earlier generators are retained for authoring, but rerunning the old chain alone would discard later room, population and passage corrections. Source-based generators require private local inputs. See the root README for public-clone validation commands. Recompile `npm run build:scenario` after geometry or activity edits.

## Accuracy

Plan-derived scale is area calibrated, not surveyed. Room numbers, equipment dimensions, exact offsets, the library passage registration and hidden bathroom details need confirmation before this can be treated as an accurate as-built simulation. Geometry checks confirm model clearances only; they do not certify real-world clearances.

See [animation details](public/models/animation-update.md) and [upstairs/fleet details](public/models/upstairs-fleet-update.md).

## User-directed spatial corrections · September 21

The upstairs fit-out is rotated counterclockwise, stair/lift connections have real floor apertures, clinic layouts are reversed, the second-from-entrance room has a dental chair, and personal-care showers/hair care connect with back-room laundry and linen storage. See [the layout correction audit](/models/layout-corrections.md) for room mapping, validation and remaining measurement limits.

## Reviewed activity rooms and circulation

The owner's specific room conversions supersede the pull request's provisional recreation placements:

- `admin-meeting-west`: mahjong, with four participants around the table.
- `admin-meeting-east`: Wii games and television.
- `admin-workstations`: ping pong and pool in the former desk area.
- `admin-conference`: karaoke in the large rear corner room.

The upstairs office layout is retained. The small `admin-side-office` hosts the story's private social-work conversation. Story participants temporarily replace background occupants at shared seats and game positions; the normal facility retains the full base cast.

The day-room passage crosses between the library cabinets at x −14.65, z 17.96–19.44 into the bathroom/PT cross-hall. The former behind-shelf corridor is removed and walking routes use the corrected opening. These are reviewed design directions, not surveyed as-built certification.

## Public source material

Architectural drawings, PDFs and extracted source text are omitted from the current public tree and build. Local source files are preserved separately. Existing older GitHub commits may retain previously committed documents.

## Presentation rendering

The viewer renders the specification as an architectural presentation model. Finishes are warm white, light oak and pale stone; the site is paper-toned and trees are abstract. It uses soft key and sky light, a gentle room environment, neutral tone mapping, and depth-based ambient occlusion with hairline edges. The facility JSON keeps its source colors; the presentation palette is a rendering layer in `app/model/renderer.ts`. `createViewer(..., { quality })` or `?quality=high|balanced` chooses between full post-processing and a lighter direct render. Without a choice, the viewer uses `balanced` on dense or small screens and steps down once if `high` is persistently slow.
