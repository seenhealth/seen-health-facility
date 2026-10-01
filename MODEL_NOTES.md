# Seven-photo interior review — September 21, 2026

Photographs establish appearance and visible relationships. The existing plan supplies the footprint. No survey dimensions, manufacturer specifications or hidden bathroom configurations have been certified.

The September 21 photo review supersedes the earlier blanket furniture restoration in the day room, clinic, rehabilitation and dining areas. Unrelated plan furniture, room boundaries, van arrivals, upstairs fit-out and staff templates remain retained. Three front table settings stay cleared for activities.

- Clinic: two photographed equipment families, a staffed nurse station and accessible low counter. Individual exam-room assignments are provisional.
- Rehabilitation: mat plinths, parallel bars, steppers, training steps/ramp, mobile resistance rack, pulleys, balls and stools. OT task seating is a simulation assumption.
- Bathrooms: photographed shared wash areas and cubicle finishes; closed stall interiors remain unverified and retain the plan layout.
- Day room/dining: tree seating, blue lattice cabinetry, landscape banquette, marble tables and cream timber-arm chairs.

[Read the seven-photo review](public/models/interior-photo-review.md) for each source, modeled element and unresolved detail. The reviewed Alhambra model contains 596 catalog objects; the active arrangement omits 42 stored objects: the 15 front-table pieces, the two small north tables and their chairs, and static tabletop sets replaced by session and table-activity props. The care-day loop has 184 people, including nine guest instructors and an eleven-person floor class. Additional Olympic and Alveare models, exterior references and arrivals are included; see the room-review and additional-sites accuracy notes in `public/models/`.

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

## Concurrent cultural day-room program · October 2026

The owner reported that the culturally focused activities did not show on the floor: the whole ten-session rotation was acted by one activities lead and three participants beside the screen, every session in the same polo and nearly the same arm movements, while the rest of the room did generic table activities and legacy walkers exercised in the aisles. The day room now runs three zones at once, authored in `app/data/day-program.json`:

- **Open floor** (shared rotation, ten sessions): Cantonese opera and songs, Baduanjin qigong, device skills, everyday movement (the story's exercise session), fan dance, tai chi, a language circle with lantern riddles, ribbon dance, erhu sing-along and a TCM wellness talk.
- **Long arts table** (13 seated participants): calligraphy, paper-cutting, ink painting, lantern making and spring couplets.
- **Tea corner** (east banquette, 6 participants): morning tea with Chinese-language newspapers, then gongfu tea.

Nine guest instructors (role `instructor`) appear only for their sessions, in activity attire: tai chi silks, Tang jackets, qipao, an opera costume and a mandarin-collar TCM coat. The activities lead co-hosts guest sessions on the floor. The arts-table head chair is reserved for the instructors; its former occupant moved to a free tree-table chair. Floating labels name each running activity and its instructor, and session décor (lanterns, couplets, paper-cuts, scroll paintings, herb chart, tea set) appears with its session. `scripts/validate-cultural-program.mjs` guards visibility: at least two guest-led activities and 15 engaged participants at every moment, distinct movements, no stray exercise in the day room, labels and décor in step with the schedule.

**Floor layouts and side tables (second pass).** The two small north tables are cleared and their group sits at the tree tables, so the open floor runs from the north corridor to the tree tables. An eleven-person class (the original three stations plus eight floor regulars) rearranges in the first six seconds of each session, keeping at least 0.5 m apart: a class grid for qigong, tai chi, exercise and fan dance; a small ribbon group with others cheering from side seats; an audience arc for opera and erhu; talk rows facing the board for the TCM talk; a circle for the language circle; and a device semicircle beside a chat circle for the device class. The presentation board stands only for the talk and device class. Walking routes go around the floor, and a lane stays open to the story participant's place in the class. Fourteen side tables follow their own schedules of Chinese chess, Go, Chinese checkers, mahjong, cards, dominoes, puzzles, origami, watercolor, coloring, knitting, flowers, photo albums, newspapers and snacks, with players and onlookers at the game tables.

Assumptions: instructor names, attire and timing are illustrative; Chinese names use Traditional characters; Olympic and Alveare share the open-floor rotation's names and movements but do not yet have the instructors, costumes, décor or labels.

## Public source material

Architectural drawings, PDFs and extracted source text are omitted from the current public tree and build. Local source files are preserved separately. Existing older GitHub commits may retain previously committed documents.

## Presentation rendering

The viewer renders the specification as an architectural presentation model. Finishes are warm white, light oak and pale stone; the site is paper-toned and trees are abstract. It uses soft key and sky light, a gentle room environment, neutral tone mapping, and depth-based ambient occlusion with hairline edges. The facility JSON keeps its source colors; the presentation palette is a rendering layer in `app/model/renderer.ts`. `createViewer(..., { quality })` or `?quality=high|balanced` chooses between full post-processing and a lighter direct render. Without a choice, the viewer uses `balanced` on dense or small screens and steps down once if `high` is persistently slow.
