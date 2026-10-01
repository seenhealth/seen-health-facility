# Seen Health · 3D Facilities

Interactive planning models of **Alhambra (1839 W Valley), 1630 Olympic and Alveare Terrace**, with animated participants, staff, accessible vans and daily workflows.

[GitHub repository](https://github.com/seenhealth/seen-health-facility) · [Live model](https://seen-health-facility.xingpersonal.chatgpt.site/)

## Explore

- Switch between sites or see their locations together on the map. Olympic includes both floors and its upstairs option. Room labels are off by default and can be enabled for design review.
- Alhambra has 167 distinct people in its base loop (177 once the fleet crew is added: a driver per van and four mid-day riders), with most day-room and dining seats occupied, group activities, arts and crafts, conversation and food service. Its former administration rooms contain mahjong, Wii, ping pong, pool and karaoke. The upstairs offices remain.
- The Alhambra day room runs a weekly repertoire. Monday is the baked base loop (performances, language circle, device class, exercise, dance, tai chi, calligraphy, arts and crafts, instruments, TCM talk). Tuesday to Friday rotate culturally specific sessions into the same ten slots: Cantonese opera, tea and dim sum, xiangqi, go and mahjong, qigong, brush painting, paper cutting and lanterns, dumpling making with the dietitian, Chinese knotting, Cantopop and Mandopop, fan dance, story circles in Toisanese, Cantonese and Mandarin, bilingual news, planter gardening, mindfulness, birthdays, a school visit, Vietnamese folk songs, Korean, Spanish and Tagalog circles, a fall-prevention talk and gongfu tea. Pick the day beside the **Day room program** picker or open `?program=tue` (`wed`, `thu`, `fri`); the panel lists each session's cultures, languages and format. Data: `programs`, `repertoire` and `rotations` in `app/data/day-program.json`, checked by `npm run validate:day-program`.
- Alhambra's eight ProMaster-style vans have see-through cabins with seated riders and a driver each. Vans A–D run the passenger timetable from five back-in bays, van E makes a neighborhood run from the fifth bay and van F two from the west curb, where the two spares park. Every move is straight runs and arcs of at least 4 m: nose-first out of the bay, a swing into the drop-off, a short straight reverse out of it before pulling away, then west and south down the west street to fade out beyond the drawn street's end; they come back the same way and back into their bays along the pull-out turn. A maneuver that passes close to a parked van waits until that bay is empty, and one van uses the driveway at a time. At the dock the driver gets out through the driver's door, comes around the nose, meets each rider at the top of the ramp and escorts them down, hands off at the foot, stows the ramp and drives on; afternoons mirror this. Package and food deliveries use the rear employee entrance and receiving area. Olympic and Alveare have site-specific van arrivals, escorts and activity; Alveare drop-off is on the east side beside reception.
- Video mode holds the camera still, speeds up the activities and can record a one-minute 1080p clip. Tilt shift is optional. Hide all controls for a clean view; **H** or **Esc** restores them and **R** starts recording.
- The viewer includes the pull request's architectural presentation palette, clay figures, soft lighting and optional ambient occlusion. `?quality=balanced` selects lighter rendering; `?quality=high` enables the full pipeline.
- **Measure** shows occupancy and staff-time metrics for Alhambra's base loop or the participant story. Its **Trace** tab lists one person's touchpoints end to end (zones, van boarding, interactions, encounters, handoffs) and downloads them as JSON.
- **Community** frames the distributed-care settings around the Alhambra center on the same care-day clock: Mrs. Lin's home (personal care, home health, pill packs, meals, home modifications), the partner pharmacy, the community hospital, a specialist clinic and a partner adult day center, joined by a Seen van, a courier, a meals car and an ambulance. The "Homes, pharmacy, hospital & partners" workflow lists their touchpoints; the toggle under Layers hides the layer. See [community documentation](docs/COMMUNITY.md).

## A day at Seen Health

`/story` follows Mrs. Lin, a composite participant, through a care day with the eleven-discipline team. Scrolling controls the camera and simulation clock. Its itinerary uses the reviewed room layout: social work in the side office, table tennis in the games lounge and karaoke in the rear corner room.

```bash
npm run build:scenario   # compile and validate the story tracks
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

## Validation

The checked-in models work without private source documents or regeneration. A fresh clone can run:

```bash
npx tsc --noEmit --incremental false
npm run validate:model
node scripts/validate-community.mjs
node scripts/validate-day-life.mjs
node scripts/validate-site-activity.mjs
node scripts/validate-site-arrivals.mjs
node scripts/validate-additional-sites.mjs
npm run validate:traffic
npm run validate:fleet
npm run validate:community
npm run build:scenario -- --check
npm run validate:trace
npm run build
npm run build:story
```

`validate:model` prepares the headless model modules used by the other validators. `validate:traffic` checks vehicle clearance (including the lot's curbs, ramp and building), nose-first motion, a 4 m minimum turning radius, fades beyond the street ends and loop continuity at 50 Hz; `validate:fleet` checks the drivers' and riders' choreography (seated while the van moves, cabin walks, ramp escorts, the driver's door, wall clearance). `validate-activity.mjs` also exports the animated cast GLB. The production build sanitizes the public model data and checks that no architectural PDFs, drawing images or extracted source text are published.

## Editing and model generation

| Area | Location |
| --- | --- |
| Site navigation, map and display controls | `app/page.tsx`, `app/data/sites.ts`, `app/components/` |
| Rendering, presentation quality and recording | `app/model/renderer.ts`, `app/model/showcase.ts` |
| People and day-room program | `app/model/characters.ts`, `app/model/day-room.ts`, `app/data/` |
| Vans, traffic and deliveries | `app/model/arrival.ts`, `app/model/alhambra-fleet.ts` (bays, route network of straight runs and arcs, day plan), `app/model/fleet-crew.ts` (drivers and riders), `app/model/traffic-routes.ts`, `app/model/deliveries.ts` |
| Additional-site activity and arrivals | `app/model/site-activity.ts`, `app/model/site-arrival.ts` |
| Distributed-care settings, vehicles and people | `app/model/community-*.ts`, [docs/COMMUNITY.md](docs/COMMUNITY.md) |
| Exterior models | `app/model/alhambra-exterior.ts`, `app/model/olympic-exterior.ts`, `app/model/alveare-exterior.ts` |
| Reviewed activity furniture | `app/model/community-assets.ts` |
| Facility specifications and exports | `public/models/` |
| Story itinerary, routes and metrics | `app/data/scenarios/`, `app/sim/`, `app/story/` |
| Accuracy and modeling decisions | [MODEL_NOTES.md](MODEL_NOTES.md), `public/models/*review*.md` |

Keep the downloadable activity/template/program JSON copies synchronized with `app/data/`. Authoring scripts are retained, but many regenerate earlier stages or require private source material; do not run the old generation chain blindly over the reviewed models. `apply-recreation-rooms.py` preserves the newer community layout when present. Recompile the story after changing room geometry, seats or the base activity tracks.

Facility GLB regeneration additionally needs `@napi-rs/canvas` (its location can be supplied with `FACILITY_CANVAS_MODULE`). Runtime presentation finishes and activity overlays are rendered by the viewer.

## GitHub and publication

**GitHub `main` is the shared code source.** This reconciliation combines the newer three-site work with [pull request #1](https://github.com/seenhealth/seen-health-facility/pull/1), preserving the GitHub commit history. The older Sites history and local recovery copies are maintained separately and are not pushed into this public repository because they contain architectural source files.

GitHub pushes do not automatically publish the live model. `.openai/hosting.json` identifies the existing Sites project; deployment to that project is a separate action.

Private architectural PDFs, original plan images, source text and local output/recovery files are excluded from the current tree and public build. Older GitHub commits may still contain previously committed documents; removing those historical copies would require a separate history cleanup. Approved material textures and modeled geometry remain public.
