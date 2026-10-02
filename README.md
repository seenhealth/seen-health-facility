# Seen Health · 3D Facilities

Interactive planning models of **Alhambra (1839 W Valley), 1630 Olympic and Alveare Terrace**, with animated participants, staff, accessible vans and daily workflows.

[GitHub repository](https://github.com/seenhealth/seen-health-facility) · [Live model](https://seen-health-facility.xingpersonal.chatgpt.site/) · [A day at Seen Health](https://seen-health-facility.xingpersonal.chatgpt.site/story)

## Outputs

Everything the repository produces, in one place. The live viewer and story are published from GitHub `main`, refreshed on October 2, 2026 through [pull request #10](https://github.com/seenhealth/seen-health-facility/pull/10). Standalone static builds remain available with `npm run build:viewer` and `npm run build:story`. The historical storyboard was recorded after [pull request #5](https://github.com/seenhealth/seen-health-facility/pull/5); that claude.ai artifact is private to the publishing account until shared.

| Interactive | Where |
| --- | --- |
| Live 3D model, all three sites | [seen-health-facility.xingpersonal.chatgpt.site](https://seen-health-facility.xingpersonal.chatgpt.site/). Published from `main`; GitHub pushes still require a separate site refresh |
| 3D viewer (cultural day room with guest instructors and the weekly repertoire, vans, drivers, community layer, hover and click cards, Measure and Trace) | [Live 3D viewer](https://seen-health-facility.xingpersonal.chatgpt.site/). **Care day → Day activities** frames the day room; pick a weekday beside the program picker |
| "A day at Seen Health" scroll story: Mrs. Lin from her front door and back, nine closing highlights across the care network | [Live story](https://seen-health-facility.xingpersonal.chatgpt.site/story) · `/story` locally |
| Clips and stills of the care day: dock choreography, the Wongs' home, the partner day center | [Storyboard](https://claude.ai/artifact/CfrUyccAgz9LDi3msDdkTx) |

| Documents | Where |
| --- | --- |
| Roadmap: simulation chassis, scenario library, digital twin, open decisions | [docs/PLAN.md](docs/PLAN.md) |
| Architecture review with the status of each finding | [docs/CODE-REVIEW.md](docs/CODE-REVIEW.md) |
| Distributed-care layer: settings registry, facility instances, generated casts | [docs/COMMUNITY.md](docs/COMMUNITY.md) |
| Simulation engine, metrics and the touchpoint trace schema | [docs/SIMULATION.md](docs/SIMULATION.md) |
| Story build, configuration, deploy and embed | [docs/STORY.md](docs/STORY.md) |
| Modeling decisions and accuracy | [MODEL_NOTES.md](MODEL_NOTES.md), [accuracy register](public/models/accuracy-register.md), [additional sites](public/models/additional-sites-accuracy.md), [room review](public/models/room-review.md), [layout corrections](public/models/layout-corrections.md), [interior photo review](public/models/interior-photo-review.md), [source document audit](public/models/source-document-audit.md) |
| Update notes | [planning](public/models/planning-update.md), [photos](public/models/photo-update.md), [animation](public/models/animation-update.md), [upstairs and fleet](public/models/upstairs-fleet-update.md) |

| Data and model files | Where |
| --- | --- |
| Facility specifications (schema 2.0) | [Alhambra](public/models/seen-alhambra-planning.json), [Olympic](public/models/seen-olympic.json), [Olympic option](public/models/seen-olympic-option.json), [Alveare](public/models/seen-alveare.json), [the Wongs' home](public/models/seen-home-wong.json), [the partner adult day center](public/models/seen-partner-adhc.json); earlier Alhambra: [2024](public/models/seen-alhambra-2024.json), [planning base](public/models/seen-alhambra-planning-base.json) |
| Specification format | [facility-format.md](public/models/facility-format.md), [facility.schema.json](public/models/facility.schema.json) |
| GLB exports (9 to 24 MB each) | [Alhambra](public/models/seen-alhambra-planning.glb), [Olympic](public/models/seen-olympic.glb), [Olympic option](public/models/seen-olympic-option.glb), [Alveare](public/models/seen-alveare.glb), [animated cast](public/models/seen-health-animated-cast.glb) |
| Simulation outputs | [simulation report](public/models/sim-report.json), [touchpoint trace](public/models/touchpoint-trace.json) |
| Activity and program data | [activity loop](public/models/activity-loop.json), [character templates](public/models/character-templates.json), [day program](public/models/day-program.json) |
| Story and community tracks | [story scenario](app/data/scenarios/day-in-the-life.json), [compiled story tracks](app/data/scenarios/day-in-the-life.tracks.json), [the Wongs' home cast](app/data/community/home-wong.cast.json), [Mrs. Lin's home cast](app/data/community/home-lin.cast.json), [partner day center cast](app/data/community/partner-adc.cast.json) |

## Explore

- Switch between sites or see their locations together on the map. Olympic includes both floors and its upstairs option. Room labels are off by default and can be enabled for design review.
- Alhambra has 184 distinct people in its base loop: 194 once the fleet crew is added (a driver per van and four mid-day riders) and 258 with the community layer's 64 people: 6 inside the Wongs' home, 2 inside Mrs. Lin's (she and her daughter), 33 inside the partner adult day center and 23 at the pharmacy, the hospital (with an ambulance crew), the specialist clinic, Seen's two nurses on the phone upstairs and on the road. The center's loop has most day-room and dining seats occupied, care, conversation and food service. Its former administration rooms contain mahjong, Wii, ping pong, pool and karaoke. The upstairs offices remain.
- In the Alhambra day room, three zones run at once: the open floor (Cantonese opera, Baduanjin qigong, fan and ribbon dance, tai chi, erhu, a TCM talk), the long arts table (calligraphy, paper-cutting, ink painting, lanterns, spring couplets) and a tea corner. An 11-person floor class rearranges for each activity (class grid, small dance group, audience, talk rows, circle, small groups); the presentation board appears only for the talk and device class. The side tables rotate through Chinese chess, Go, Chinese checkers, mahjong, cards, dominoes and crafts. Nine guest instructors in activity attire lead the sessions, and floating labels name each activity, its instructor and, closer in, each table's game or craft.
- The day room runs a weekly repertoire. Monday's ten open-floor sessions are the baked loop. Tuesday to Friday rotate culturally specific programs into the same slots, each in the slot of the floor session it is like, so the class is already in a fitting layout: birthdays, Cantopop and Mandopop with the erhu teacher and Vietnamese folk songs in the audience slots; tea and dim sum, Chinese knotting, planter gardening and dumpling making with the dietitian in small groups; story circles in Toisanese, Cantonese and Mandarin, a school visit and Korean, Spanish and Tagalog circles in the circle; and bilingual news, mindfulness, a fall-prevention talk and gongfu tea appreciation in the talk rows. The class takes each program's gestures, the floor label names it, and a slot's guest instructor appears only for the program they lead. The arts table, tea corner and side tables keep their sessions every day, so xiangqi, go, mahjong, brush painting and paper cutting run there daily, and opera, qigong and fan dance are Monday floor sessions. Pick the day beside the **Day room program** picker or open `?program=tue` (`wed`, `thu`, `fri`; Alhambra only, since Olympic and Alveare play their own Monday program, so the parameter is dropped when you switch there); the panel lists each session's cultures, languages and format. Data: `programs`, `repertoire` and `rotations` in `app/data/day-program.json`, checked by `npm run validate:day-program`.
- The **Meals** scene shows today's lunch for the same picked day, from a weekly menu planned with the dietitian for the communities the center serves: Cantonese and Toisanese (Monday), Shanghainese and Taiwanese, Vietnamese, Mexican, and Korean and Filipino. Every day has a vegetarian main and the dietitian's low-sodium, soft and minced, and diabetes-friendly adaptations; **Delivery** jumps to lunch arriving in the kitchen. Data: `lunch` in `app/data/day-program.json`.
- Alhambra's eight ProMaster-style vans have see-through cabins with seated riders and a driver each. Vans A–D run the passenger timetable: every drop-off arrival comes in from off site, fading in at the south end of the west street with its driver and riders already seated, and between runs they stay on their rounds instead of returning to the lot, so their four back-in bays stand empty. Van E makes a neighborhood run from the fifth bay and van F two from the west curb, where the two spares park; their drivers walk from the fleet office inside the center, out through the sliding entrance and across the lot to the parked van, get in through the driver's door and pull out, and after the run get out and walk back. Every move is straight runs and arcs of at least 4 m: a swing into the drop-off, a short straight reverse out of it before pulling away, then west and south down the west street to fade out over its last drawn metres (the driver and riders disappear as the van passes half opacity); van E pulls nose-first out of its bay and backs into it along the pull-out turn when it returns, and van F pulls off and back in to the curb. A maneuver that passes close to a parked van waits until that bay is empty, and one van uses the driveway at a time. At the dock the driver gets out through the driver's door, comes around the nose, meets each rider at the top of the ramp and escorts them down, hands off at the foot, stows the ramp and drives on; afternoons mirror this. Package and food deliveries use the rear employee entrance and receiving area; the trucks nose in beside the rear court's palm planters, then back out round onto the drive aisle south of them and pull away east, on 4.5 m arcs. The morning food truck brings lunch (parked 10:48–11:46 AM): its delivery person wheels the insulated carriers through receiving and the back corridor into the kitchen, where a kitchen staff member checks them against the dietitian's texture and low-sodium plans and unloads them onto the island for lunch service (`kitchen-lunch-delivery`, 11:10–11:26 AM; the tracks are written by `scripts/apply-kitchen-delivery.mjs`). Olympic and Alveare have site-specific van arrivals, escorts and activity; Alveare drop-off is on the east side beside reception.
- Point at any person, piece of furniture or vehicle to highlight it and see its name; click it for a card. A person's card gives their role and mobility, what they are doing now and where, what comes next and at what time, and the interaction they are part of, with **Follow** / **Stop following** (a click on a person also follows them); a furniture card says what the item is and what it is for in a PACE day center or at home, its room, size and evidence status. It works in the center, on every site, and on the community pads, including the furniture of the partner day center and the Wongs' home. **Esc**, **×** or a click on empty space closes the card. Names and purposes live in `app/model/asset-catalog.ts` (by asset kind); a kind without an entry still gets a card from the specification's own asset name or id.
- Video mode holds the camera still, speeds up the activities and can record a one-minute 1080p clip. Tilt shift is optional. Hide all controls for a clean view; **H** or **Esc** restores them and **R** starts recording.
- The viewer includes the pull request's architectural presentation palette, clay figures, soft lighting and optional ambient occlusion. `?quality=balanced` selects lighter rendering; `?quality=high` enables the full pipeline.
- **Measure** shows occupancy and staff-time metrics for the Alhambra care day as the scene plays it (the center's loop, the fleet crew and the community cast) or for the participant story. Occupancy includes the home and partner sites; on-site counts and staff time cover the center. Its **Trace** tab lists one person's touchpoints end to end (zones, van boarding, interactions, encounters, handoffs) and downloads them as JSON.
- **Community** frames the distributed-care settings around the Alhambra center on the same care-day clock: the Wongs' home (personal care, home health, pill packs, meals, home modifications), the partner pharmacy, the community hospital, a specialist clinic and a partner adult day center, joined by a Seen van, the personal care aide's car, a pharmacy courier, a meals car and an ambulance. Three pads carry real floor plans, stamped as cutaways with their people generated inside: the Wongs' home is a senior-friendly two-bedroom bungalow (`seen-home-wong.json`) where Mrs. Wong's day plays room by room (a dizzy spell before her aide arrives that her PERS pendant puts through to Seen's 24/7 nurse line, breakfast and the morning pills at the seated kitchen worktop, the assisted shower after her clinic trip, the OT and installer fitting a swing-up grab bar, Mr. Wong rolling in from hospital and the home health nurse's visit at his armchair), Mrs. Lin's home is the same bungalow plan, where she has breakfast and tea with her daughter, and the partner day center is a small adult day health care center of its own (`seen-partner-adhc.json`): one large hall with long banquet tables, a dance floor and a stage with choir risers, plus a calligraphy and painting studio, a classroom, a group room and light rehab, where twenty-six participants line-dance, paint, sing, play bingo and fan-dance with the partner's staff and a visiting Seen PT works on strength and balance. Any facility specification can be stamped on a pad the same way. Calls between places (the PERS call, the ED's call to Seen's on-call nurse, the hospital discharge nurse's call to Seen's care-transitions nurse, the evening nurse-line call) are drawn as arcs between the callers while they last. The "Homes, pharmacy, hospital & partners" workflow lists their touchpoints; the **Community sites** toggle under Layers hides the layer and its people. See [community documentation](docs/COMMUNITY.md).

## A day at Seen Health

[The live story](https://seen-health-facility.xingpersonal.chatgpt.site/story) (`/story` locally) follows Mrs. Lin, a composite participant, through a care day with the eleven-discipline team, from breakfast with her daughter and the Seen van at her door, through the center (lunch arriving in the kitchen first), to the van home and tea with her daughter. A rapid run of nine highlights then cuts across the care network (medication, a partner day center, specialists, optometry, imaging, hospital discharge coordinated by phone, home modifications, after-hours care and emergency transport, a personal emergency response system), and the story closes at her home at four. Scrolling controls the camera and simulation clock; headlines, cards and the cuts between highlights carry their own motion. Its itinerary uses the reviewed room layout: social work in the side office, table tennis in the games lounge and karaoke in the rear corner room.

```bash
npm run build:scenario   # compile and validate the story tracks
npm run build:community  # generate and validate the people inside facility instances on community pads
npm run validate:home    # the Wongs' home: plan, assets, its place on the pad and its ADL cast
npm run validate:partner-adhc  # the partner adult day center: program, plan, stage access, assets, pad and cast contract
npm run sim:report       # refresh the downloadable simulation report and touchpoint trace
npm run trace:report     # touchpoint trace only (public/models/touchpoint-trace.json)
npm run dev:story        # standalone story preview
npm run build:story      # static output in dist/story-site/
```

See [story documentation](docs/STORY.md) and [simulation documentation](docs/SIMULATION.md). Timing, staffing and people are illustrative, not operational forecasts or participant records.

## Run locally

Use Node.js 22.13 or later and npm. The application lives at the repository root.

```bash
git clone https://github.com/seenhealth/seen-health-facility.git
cd seen-health-facility
npm ci
npm run dev
```

Open the local URL printed by the server. The scene uses bundled data; no live clinical system connection is required.

```bash
npm run build
```

The application uses React, Three.js, Vinext/Vite and a Cloudflare-compatible runtime. `package-lock.json` pins dependencies.

## Static viewer build

The 3D viewer (`app/page.tsx`, all three sites) also builds as a plain static site for hosts without a server, including a sub-folder of another site. The entry is `viewer/site/index.html` + `viewer/site/main.tsx`, built by `vite.viewer.config.ts`.

```bash
npm run dev:viewer       # standalone dev server (reads assets straight from public/)
npm run build:viewer     # → dist/viewer-site/
npm run preview:viewer   # serve the built site locally
```

`dist/viewer-site/` (about 5.9 MB, 1.9 MB of it the van wrap texture) contains only what the viewer loads at runtime:

- `index.html`, `assets/*.js|css` (React, three.js, the renderer and the bundled activity data; the Measure charts and GLB import/export load on demand)
- the four facility specifications the viewer fetches, minified: `models/seen-alhambra-planning.json`, `seen-olympic.json`, `seen-olympic-option.json` (Olympic's alternate clinic layout) and `seen-alveare.json`
- every file those specifications load (sign textures in `reference/photos/`, `reference/fleet/final-vans.png`), collected at build time
- `brand/seen-health-horizontal.png`, `favicon.svg`

The default relative base works from any folder whose URL ends in `/`; `VIEWER_BASE=/facility/ npm run build:viewer` sets an absolute base instead. App code requests its files root-relative (`/models/…`, `/reference/…`, `/brand/…`); `viewer/site/asset-base.ts` rebases those URLs onto the build's folder where they become requests (`fetch`, image loads, `src`/`href` attributes), so app code is unchanged and exported specifications keep portable paths.

Exporting the specification, a GLB or a PNG of the view, opening a local specification and recording video all run in the browser. Not shipped: the GLB, Markdown and JSON files linked as downloads under **Model files**, the accuracy register and **Animated care day** (those links 404). **Site map** tiles load from openstreetmap.org.

## Validation

The checked-in models work without private source documents or regeneration. A fresh clone validates everything offline with one command, and CI (`.github/workflows/validate.yml`, Node 22) runs the same on every push and pull request, followed by the three builds:

```bash
npm run validate    # type check, then every validator below, in this order
npm test            # npm run validate, then the unit tests
npm run build
npm run build:story
npm run build:viewer
```

| Command | Checks |
| --- | --- |
| `npx tsc --noEmit --incremental false` | Types (first step of `validate`) |
| `npm run validate:model` | Alhambra schema, geometry and asset builders; published JSON copies match `app/data/` |
| `npm run validate:home` | The Wongs' home: plan, doors, furniture, turning circles and reach at wheelchair and walker clearance; home asset kinds; the frame on its pad; the ADL cast (rooms, seats, walk times) and contacts on its generated tracks |
| `npm run validate:layout` | Alhambra stairs and apertures, fixture openings, walking clearance around photographed equipment |
| `npm run validate:sites` | Olympic, Olympic option and Alveare: sources and scale, room review, Olympic day spaces and exterior, site activity and van arrivals |
| `npm run validate:day-program` | Weekly day-room repertoire and rotations, then the cultural program as rendered: concurrent zones, guest instructors and attire, engagement, floor layouts, table activities, labels, board and décor, and the Tue–Fri re-skins; the weekly lunch menu (a vegetarian main, sides, soup or dessert, cultures and three diet adaptations every weekday, delivered to the kitchen before service) |
| `npm run validate:community-tracks` | Facility instances on community pads: the stamped building against its pad and drive, and its generated cast (continuity, gait, walls, furniture, contacts); fails if `app/data/community-*.json` differ from a fresh `npm run build:community` |
| `npm run validate:partner-adhc` | The partner adult day center: regenerates unchanged from `scripts/build-partner-adhc.mjs`; program and size, doors, furniture, turning circles, reach and the step-free stage ramp at wheelchair and walker clearance; named assets and ADHC kinds; its pad and anchors; the cast's contract interactions |
| `npm run validate:activity` | Base care-day loop (continuity, wall clearance, pairs, arrivals, day room, animated cast), day life (including lunch reaching the kitchen) and converted community rooms |
| `npm run validate:traffic` | Vehicle clearance (including the lot's curbs, ramp and building, and for the delivery trucks the rear court's planters, receiving ramps, curbs and sidewalks), stall lines off the street roadways and the pads' drive stubs, nose-first motion, a 4 m minimum turning radius, fleet fades inside the drawn street and loop continuity at 50 Hz; the motion rules (nose-first, no jumps, 4 m radius) cover every fleet van, delivery truck and street car and the Olympic and Alveare vans |
| `npm run validate:fleet` | Drivers' and riders' choreography (seated while the van moves, nobody appearing or vanishing seated in a van in view, arrivals setting off out of sight, drivers' walks between the fleet office and parked vans, cabin walks, every ramp descent and ascent attended, the driver's and sliding doors, wall clearance) |
| `npm run validate:community` | Distributed-care vehicles and cast (see [docs/COMMUNITY.md](docs/COMMUNITY.md)) |
| `npm run validate:scenario` | Story tracks (wall clearance, continuity, dwell), timeline (cutaways at her home and in the kitchen feature real interactions, her stand-in takes part; trimming never hides a hero focus time, stop or kicker) and the closing highlights (each features real interactions at its setting inside its own window); fails if the committed tracks JSON differs from a fresh compile |
| `npm run validate:trace` | Touchpoint trace of the composed source the viewer plays: structure, coverage, determinism and file freshness |
| `npm run validate:renderer` | Headless viewer per site: 10 frames through every render mode; hover and click (synthetic pointer events) pick a person and a piece of furniture where they are drawn, open their card and follow the person, nothing is picked where a section cuts, while hidden or in the showcase, and the furniture of every facility stamped on a community pad (the partner day center, the Wongs' home) is picked on its pad; then disposal leaves no geometry, material, listener, element or frame behind |
| `npm run validate:public` | No architectural PDFs, drawings or source text in `public/` (also runs before `npm run build`) |
| `npm run test:unit` | `node --test` suite in `test/`: clock labels, the person card's now/next/interaction (`describeActor`), the asset catalog (lookup, fallbacks, coverage of the sites' and the homes' asset kinds), source composition, vehicle seat frames, the fleet van body (sides flush with roof, nose and rear), driveway reservations, the stitch between a generated instance cast and hand-authored legs, scheduled people's stops, seats and outside members, call arcs (which calls, the clock-driven draw-on and retraction, their ends, reduced motion, disposal) |

Validators only write to `work/` (gitignored). The renderer, story, trace, fleet and Olympic checks, the GLB exporters and the unit tests bundle app TypeScript with Rolldown (`loadSim` in `scripts/build-scenario.mjs`); the other validators read the modules transpiled by `scripts/compile-model-modules.mjs`, which their npm scripts run first.

`validate:activity` writes the animated cast GLB to `work/validation/`; publish it with `node scripts/compile-model-modules.mjs && node scripts/validate-activity.mjs --out public/models`. Facility GLBs are regenerated with `node scripts/export-model.mjs` (Alhambra, with integration checks) and `node scripts/export-additional-sites.mjs public/models/seen-<site>.json`; both run the headless viewer from `validate:renderer`, need `@napi-rs/canvas` for texture pixels and accept `--out <dir>`.

`npm run lint` (oxlint) is not part of `validate` yet: it still reports pre-existing errors in `app/`, `components/ui/` and a few scripts.

## Editing and model generation

| Area | Location |
| --- | --- |
| Site navigation, map and display controls | `app/page.tsx`, `app/data/sites.ts`, `app/components/` |
| Rendering, presentation quality and recording | `app/model/renderer.ts`, `app/model/showcase.ts` |
| Hover and click cards: picking, highlights, card content, furniture names and purposes | `app/model/pick.ts`, `app/model/highlight.ts`, `app/model/inspect.ts`, `app/model/asset-catalog.ts`, `app/components/inspect-card.tsx` |
| People and day-room program | `app/model/characters.ts`, `app/model/day-room.ts`, `app/model/day-program.ts`, `app/data/` |
| Vans, traffic and deliveries | `app/model/arrival.ts`, `app/model/alhambra-fleet.ts` (bays, route network of straight runs and arcs, day plan), `app/model/fleet-crew.ts` (drivers and riders), `app/model/traffic-routes.ts`, `app/model/deliveries.ts` (truck runs, lunch carriers), `scripts/apply-kitchen-delivery.mjs` (the lunch delivery's tracks in the base loop) |
| Additional-site activity and arrivals | `app/model/site-activity.ts`, `app/model/site-arrival.ts` |
| Distributed-care settings, vehicles and people | `app/model/community-*.ts`, `app/model/alhambra-source.ts` (the composed source the viewer, Measure and reports share), [docs/COMMUNITY.md](docs/COMMUNITY.md) |
| Facility instances on community pads | `app/model/facility-instance.ts`, `app/model/instance-cast.ts`, `app/sim/community-cast.ts`, cast files in `app/data/community/`; regenerate with `npm run build:community` ([docs/COMMUNITY.md](docs/COMMUNITY.md#facility-instances)) |
| Exterior models | `app/model/alhambra-exterior.ts`, `app/model/olympic-exterior.ts`, `app/model/alveare-exterior.ts` |
| Reviewed activity furniture | `app/model/community-assets.ts` |
| Facility specifications and exports | `public/models/` |
| Story itinerary, routes and metrics | `app/data/scenarios/`, `app/sim/`, `app/story/` |
| Accuracy and modeling decisions | [MODEL_NOTES.md](MODEL_NOTES.md), `public/models/*review*.md` |
| Code review status and roadmap | [docs/CODE-REVIEW.md](docs/CODE-REVIEW.md), [docs/PLAN.md](docs/PLAN.md) |

Keep the downloadable activity/template/program JSON copies synchronized with `app/data/`. The day-room zones, guest instructors and sessions are authored in `app/data/day-program.json`; `python3 scripts/apply-cultural-program.py` regenerates the instructor and participant tracks, profiles and interactions from it (then run `npm run build:scenario` and `npm run sim:report`). Authoring scripts are retained, but many regenerate earlier stages or require private source material; do not run the old generation chain blindly over the reviewed models. `apply-recreation-rooms.py` preserves the newer community layout when present. Recompile the story after changing room geometry, seats or the base activity tracks.

Facility GLB regeneration additionally needs `@napi-rs/canvas` (its location can be supplied with `FACILITY_CANVAS_MODULE`). Runtime presentation finishes and activity overlays are rendered by the viewer.

## GitHub and publication

**GitHub `main` is the shared code source.** This reconciliation combines the newer three-site work with [pull request #1](https://github.com/seenhealth/seen-health-facility/pull/1), preserving the GitHub commit history. The older Sites history and local recovery copies are maintained separately and are not pushed into this public repository because they contain architectural source files.

GitHub pushes do not automatically publish the live model. `.openai/hosting.json` identifies the existing Sites project; deployment to that project is a separate action.

Private architectural PDFs, original plan images, source text and local output/recovery files are excluded from the current tree and public build. Older GitHub commits may still contain previously committed documents; removing those historical copies would require a separate history cleanup. Approved material textures and modeled geometry remain public.
