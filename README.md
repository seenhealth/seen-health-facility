# Seen Health · 3D Center

An interactive model of the Seen Health Alhambra center, with animated participants, staff, accessible transportation, and day-center workflows.

**[Open the live model](https://seen-health-facility.xingpersonal.chatgpt.site/)**

## Explore the model

The scene opens on the day room and runs at **4× speed** by default. Use the workflow buttons to visit arrivals, clinical care, rehabilitation, activities, meals, or upstairs coordination. Playback supports pause, speed changes, seeking, and following an individual or a shared interaction.

- Two vans deploy ramps for arrivals and departures, with escorts, a sliding entrance and two reception staff.
- A reusable cast of 41 composite people covers 12 roles and independent, cane, walker and wheelchair mobility.
- The day room rotates through performances, language and device classes, exercise, dance, tai chi, calligraphy, arts and crafts, instruments, and TCM talks. Standing, chair-based, wheelchair and quieter table participation are represented.
- Three front tables and their chairs are cleared in the active layout. Original source drawings remain available for comparison.
- The building, upstairs administration area, streets and surroundings can be explored in 3D. Facility and animated-character models can be downloaded from the application.

## Run locally

Use Node.js **22.13 or later** and npm.

```bash
git clone https://github.com/seenhealth/seen-health-facility.git
cd seen-health-facility
npm ci
npm run dev
```

Open the local URL printed by the development server. No live Orbit connection is needed: the scene uses the bundled representative workflow data.

```bash
npm run build
```

The application uses React, Three.js, Vinext/Vite and a Cloudflare-compatible runtime. Dependencies are pinned by `package-lock.json`.

## Where to make changes

| Area | Location |
| --- | --- |
| Main page and navigation | `app/page.tsx` |
| Playback and timeline controls | `app/components/activity-panel.tsx` |
| Facility renderer | `app/model/renderer.ts` |
| Character templates and animation | `app/model/characters.ts`, `app/data/character-templates.json` |
| Arrivals and accessible entrance | `app/model/arrival.ts` |
| Day-room equipment and gestures | `app/model/day-room.ts` |
| Activity rotation and cleared furniture | `app/data/day-program.json` |
| Shared actor and interaction tracks | `app/data/activity-loop.json` |
| Facility geometry and source references | `public/models/seen-alhambra-planning.json` |
| Modeling decisions and limits | [MODEL_NOTES.md](MODEL_NOTES.md) |

The JSON files under `app/data/` have matching downloadable copies in `public/models/`. Keep those copies synchronized. `scripts/build-activity.py` regenerates the care-day tracks from the facility geometry and activity program.

## Validation and model generation

The checked-in model assets already work without regeneration. For model validation, restore the lossless source image from its tracked archive parts once:

```bash
cat sources/planning/overall-planning.part-* > 'sources/planning/Overall Planning.jpg'
node scripts/validate-model.mjs
node scripts/validate-activity.mjs
npx tsc --noEmit --incremental false
```

Run the model validator before the activity validator; it prepares the local validation modules. The activity validator also regenerates the animated cast GLB. Python 3 is required when authoring tracks with `python3 scripts/build-activity.py`.

`export-model.mjs` additionally needs an installed `@napi-rs/canvas` module. Its location can be supplied with `FACILITY_CANVAS_MODULE`; this is only needed when regenerating the facility GLB.

## Collaboration and publication

Create a branch for changes and open a pull request against `main`. Include a brief description and the relevant validation results. Review changes in the local model before proposing publication.

This repository starts from the deployed source snapshot `1f32f3214a94321e500ddc3e205b61a865b090ce` (Sites version 13, September 20, 2026). It includes the current application and its tracked assets. The earlier Sites editing history is maintained separately.

GitHub pushes do **not** automatically publish the live model. `.openai/hosting.json` identifies the existing Sites project; publication requires access to that project. Coordinate live updates with its owner.

## Source basis

People, staffing, gestures and compressed timing are illustrative. The day-program repertoire follows the owner's direction, and care categories were informed by a read-only workflow review. This repository contains composite scene data, not live participant records. The model is for exploration and planning; source-verified dimensions and estimates are distinguished in the source notes.

See [animation notes](public/models/animation-update.md), [upstairs and fleet notes](public/models/upstairs-fleet-update.md), and the [accuracy register](public/models/accuracy-register.md).
