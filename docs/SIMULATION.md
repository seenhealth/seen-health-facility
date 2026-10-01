# Care-day simulation

The facility model can be *programmed, played and measured*. A scenario file
describes an itinerary on the shared care-day clock; a compiler turns it into
walking and activity tracks on navigable routes through the modeled building;
the existing activity engine animates them; and a measurement layer samples the
same tracks to report occupancy, staff time and a participant's touchpoints.

Everything here is composite and illustrative. No participant records are used.

## Architecture

```mermaid
flowchart LR
  F[Facility JSON<br/>public/models/seen-alhambra-planning.json]
  P[Day program<br/>app/data/day-program.json]
  N[Navigation grid<br/>app/sim/nav.ts]
  S[Scenario DSL<br/>app/data/scenarios/day-in-the-life.json]
  B[Base care-day loop<br/>app/data/activity-loop.json]
  C[Compiler<br/>app/sim/scenario.ts]
  T[Compiled tracks<br/>day-in-the-life.tracks.json]
  M[Merge<br/>app/sim/story-source.ts]
  A[Alhambra source<br/>app/model/alhambra-source.ts<br/>+ community layer + fleet crew]
  E[Activity engine<br/>app/model/activity.ts]
  R[Renderer<br/>app/model/renderer.ts]
  X[Metrics<br/>app/sim/metrics.ts]
  W[Touchpoint trace<br/>app/sim/trace.ts]
  U[Measure panel<br/>app/components/metrics-panel.tsx]
  J[Report<br/>scripts/sim-report.mjs → public/models/sim-report.json<br/>+ touchpoint-trace.json]

  F --> N
  P --> N
  N --> C
  S --> C
  B --> C
  C -->|npm run build:scenario| T
  T --> M
  B --> M
  B --> A
  M --> A
  A -->|ActivitySource| E
  E --> R
  A --> X
  X --> U
  X --> J
  A --> W
  W --> U
  W --> J
```

- **Build time** (Node): `scripts/build-scenario.mjs` bundles the TypeScript
  modules with Rolldown (already installed with Vite) into `work/sim/`, compiles
  the scenario, validates it and writes the tracks JSON.
  `scripts/build-community-tracks.mjs` does the same for the people inside
  facility instances on community pads (`npm run build:community`: cast files
  in `app/data/community/` → `app/data/community-casts.json`, routed on each
  instance's own navigation grid; docs/COMMUNITY.md, "Facility instances").
- **Run time** (browser): `storyActivitySource()` merges the precompiled tracks
  into the base loop. No navigation work happens in the browser.
- **Composition**: `alhambraSource(model, base)` (`app/model/alhambra-source.ts`)
  adds the distributed-care layer (`communitySource`, docs/COMMUNITY.md) and the
  fleet crew (`withFleetCrew`) to a base loop, memoised per base. The renderer,
  the Measure panel, `composedStorySource(model)` and the report scripts all use
  it; the engine plays its source as given.
- **Measurement** uses `sampleActor`, `sampleEscort` and `samplePairedActors`
  from the activity engine, seats riders in their vehicles through the same
  samplers the scene uses, and reads that same composed source, so it measures
  exactly what is animated.

## The clock

One 720-second loop is the 8 AM–4 PM day: 1 loop second = 2/3 of a clock
minute. Vans (`vanWindows` in `app/model/arrival.ts`, routes in
`app/model/alhambra-fleet.ts`), the day-room program and every activity source
run on this clock.

Every vehicle route is a chain of straight runs and circular arcs of the
vehicle's centre (`app/model/vehicle-path.ts`: the `Pen` turtle, `roundedPath`
for corner-point data, `pathAt`), so turning radii are exact: 4 m in the fleet
lot and at the Olympic and Alveare bays, 4.5 m for the delivery trucks (which
back straight out of receiving before pulling away) and 6.4 m
(`STREET_CORNER_RADIUS`) at the ring-street corners for street cars, fleet and
community vehicles. Speeds blend with the shared `easeDistance`
(`app/model/traffic-routes.ts`). `npm run validate:traffic` checks nose-first
motion, jumps and the 4 m minimum radius for every one of them at 50 Hz.

`app/sim/clock.ts` converts between loop
seconds, clock minutes and labels:

| Helper | Example |
| --- | --- |
| `clockLabel(155)` | `9:43 AM` (same as `dayTime`) |
| `loopToMinutes(t)` / `minutesToLoop(m)` | 155 ↔ 583.3 |
| `clockToLoop('12:30 PM')` | 405 |
| `loopDurationMinutes(45)` | 30 |
| `hourTicks()` | chart ticks for 8 AM … 4 PM |

### Fleet crew (`app/model/fleet-crew.ts`)

`withFleetCrew(source)` is applied by `alhambraSource()` to every Alhambra
source (the base loop and the story alike), so the viewer, Measure and the
reports see the same crew. It is a pure transform: riders
whose `ride` segments name a fleet van get a cabin seat (`seat`, `seatHeading`,
the van-local anchors in `FLEET_VAN_SEATS`) and a short cabin walk between seat
and door sill; escorted riders sit in the front row with their escort directly
behind, which is where `sampleEscort` places the escort the moment the rider
stands up. Ride segments carry a long, fast nominal path so that, as soon as
the rider is seated, `sampleEscort` measures its gap inside the ride segment and
the engine hands the escort over to its own seat. Each van gets a driver
(`driver-1` … `driver-8`) whose day follows the van's `fleetTimeline`: hidden
while the van is parked or off site, seated and visible for whole trips and
while it yields, and at the dock out through the driver's door once it swings
open (`FLEET_CAB_DOOR`), around the nose, up the ramp ahead of each rider and
0.9 m behind the rider's party on the way down, a handoff at the foot, then back
in through the driver's door before departure. Vans C and D, which arrive
without actors, get two mid-day riders each who walk the base loop's walking
arrival's ramp, entrance and lobby routes, check in behind the front-desk queue,
wait in the lobby and ride home on Van A or Van B.
`npm run validate:fleet` checks all of this as the viewer plays it.

## Navigation (`app/sim/nav.ts`)

A TypeScript port of the grid in `scripts/build-activity.py`, with identical
results: 0.2 m cells; 0.21 m wall clearance; furniture footprints (including
`navigationFootprints`) inflated by 0.19 m; cleared day-program furniture; the
reserved group stations and presentation screen; 8-connected A* without corner
cutting; collinear simplification. `navGrid(model, dayProgramNavOptions(true))`
reproduces the Python grid exactly (22,063 walkable cells; 20,099 at cane
clearance) and builds in about 0.4 s in Node, cached per model and options.

Additions over the Python grid:

- **Any clearance per route**: each cell stores its wall margin and furniture
  margin, so `route(grid, a, b, 0.26)` gives a cane route (walker 0.33,
  wheelchair 0.37) without rebuilding.
- **Vertical circulation** (`blockVerticalCirculation`, on by default): stair
  flights, the lift and floor voids are obstacles. The Python grid treats stairs
  as walkable because they are `architecture`.
- **Any level**: `navGrid(model, { levelId: 'upper', … })` for upstairs routes.
- **Connected components**: `snap` only returns cells on the main circulation,
  never an isolated pocket between furniture.
- `routeBetween`, `zoneAt`, `roomAt`, `wallClearanceAt`, `isClear` helpers.

## Authoring a scenario

`app/data/scenarios/day-in-the-life.json` has two owners. The **story** owns
copy (`title`, `kicker`, `body`, the hero's summary). The **simulation** owns
`placement` blocks. Step `window`s, `roomId`, `roles` and `handoffs` are the
shared contract.

### Scenario-level placement

```jsonc
"placement": {
  "heroGait": { "preferred": 0.78, "max": 1.45, "clearance": 0.26, "step": 0.02 },
  "staffGait": { "preferred": 0.95, "max": 1.5 },
  "minDwellFraction": 0.3,        // share of each window at the anchor
  "minDwellSeconds": 8,
  "replaced": {                     // the base actor the hero takes over
    "arrivalThroughTitle": "Front desk greeting & check-in",
    "departureTitle": "Escorted departure · board van",
    "escortId": "arrival-aide-a", "escortLabel": "PCA · Alex",
    "boardingSpeed": 0.64
  },
  "reservations": [ … ],            // extra areas new routes avoid
  "reserveBaseDwell": { "minSeconds": 40, "halfSize": 0.3 },
  "companions": [                   // staff who appear for the hero
    { "id": "idt-rn", "team": "rn", "name": "Grace", "variant": 22, "home": [-1.9, -3.0] },
    { "id": "idt-rec", "team": "rec", "name": "Dani", "variant": 28,
      "home": [12.0, 12.4], "exit": [-13.3, 4.3] }
  ],
  "meeting": { "levelId": "upper", "roomId": "upperfit-conference",
               "steps": ["huddle", "care-plan"], "entry": [4.97, 13.99], … }
}
```

`team` is a `care-team.json` id; the character role comes from its
`characterRole`. `home` is a back room where the companion appears and
disappears (`visible: false` off duty); `exit` optionally differs.

### Step placement

```jsonc
"placement": {
  "mode": "visit",                  // meeting | arrival | checkin | visit | departure
  "stops": [{
    "id": "clinic",
    "window": [140, 185],           // when this stop should be on screen
    "roomId": "clinic-treatment-south",
    "seat": "clinic-south-recliner",// anchor + facing from a furniture object
    "seated": true,
    "action": "idle",               // any character Action
    "approach": [[-9.8, -3.1], [-8.8, -3.3], [-8.75, -3.9]],
    "title": "Blood-pressure recheck and medication review",
    "category": "clinical",         // interaction category (UI filters, metrics)
    "companions": [
      { "id": "idt-rn", "anchor": [-6.8, -4.35], "action": "treat",
        "approach": [[-5.2, -4.6]], "leave": 5 },
      { "id": "idt-pcp", "seat": "clinic-south-stool", "heading": 2.22,
        "seated": true, "action": "consult", "join": 5, "leave": -2 }
    ],
    "partners": []                  // base actors who take part (interaction only)
  }]
}
```

- `anchor` or `seat` places a person. Seats face the front of the furniture
  (recliners and barber chairs face +Z, chairs and stools −Z). Standing anchors
  that end up inside furniture are nudged clear with a note, so the compile keeps
  working when furniture changes.
- `approach` waypoints lead from free floor to the anchor (e.g. through a door
  and around a stool) and are reversed on the way out. Every leg is checked for
  0.2 m wall clearance.
- `join` / `leave` time companions relative to the hero's arrival/departure
  (defaults −3 s and +1 s: they wait for her and see her off).
- `followProgram: true` takes the day-room program's standing action for each
  session the hero overlaps.
- `minDwell` overrides the minimum seconds at a stop.
- `duties` (with absolute `window`s) attach companions to steps where the hero
  follows copied tracks, e.g. the center manager at check-in.

### What the compiler does

1. Copies the replaced actor's van ride, ramp, sliding entrance and check-in
   (heights, `vehicleId`, `ride` stages intact).
2. Routes every leg between stops on the cane-clearance grid.
3. Chooses a gait and schedule: a least-squares fit of each stop's dwell to the
   centre of its window, with minimum dwells, at the slowest feasible gait; among
   the next few feasible gaits it keeps the one whose walks cross moving base
   actors least, then slides single legs by up to ±4 s to avoid remaining
   crossings.
4. Re-uses the replaced actor's departure: the same exterior path, ramp, van and
   boarding time; the indoor part is re-routed from the farewell spot.
5. Re-points the replaced actor's escort (`escortFor`) to the hero, so the PCA
   walks behind her all day on her exact path.
6. Schedules companions from their duties: appear at home, walk in, perform,
   walk directly to the next duty or go back to base when there is time, and
   vanish at home. Walks are re-timed by up to ±8 s when they would pass through
   someone.
7. Builds the upstairs IDT meetings: attendees appear at the stair landing, walk
   in along the aisles (farthest seats first, nearest seats leave first), sit and
   take turns presenting. Each attendee shares a profile with the downstairs
   person they are, so the same RN is seen at the huddle and in the clinic.
8. Emits interactions per stop, arrival, check-in, departure and meeting, and a
   `steps` summary with arrive/depart and a **focus time** for each step.
9. Removes the replaced actor and its interactions from the merged source.

## Running it

```bash
npm run build:scenario                  # compile, validate, write tracks JSON
node scripts/build-scenario.mjs --check # compile, validate, fail if the committed tracks are stale
node scripts/build-scenario.mjs --check --model path/to/facility.json   # no drift check
node scripts/sim-report.mjs             # report + public/models/sim-report.json + touchpoint-trace.json
npm run trace:report                    # touchpoint trace only (summary table + JSON)
npm run validate:trace                  # trace structure, hero coverage, file freshness and size
```

Re-run `npm run build:scenario` after changing the facility (e.g. new
furniture), the base loop or the scenario. Validation checks:

- every stage covers 0–720 contiguously, with no teleport between stages or on
  repeat, and a timeline that covers the day;
- every visible walking path stays ≥ 0.2 m from walls (sampled every 5 cm), and
  no visible pose is within 0.15 m of a wall;
- no visible jump larger than 0.6 m between samples; the escort moves less than
  0.13 m per 0.05 s;
- the hero is at each stop's anchor for at least its minimum dwell inside the
  window, and at the anchor at the step's focus time;
- the hero boards Van A only when it is parked with doors and ramp open;
- new walks keep clear of the day-room activity stations;
- it reports walks through furniture footprints and close contacts (< 0.45 m)
  between new people and anyone else, for review;
- with `--check` (`npm run validate:scenario`, part of `npm run validate`), the
  committed `day-in-the-life.tracks.json` equals the fresh compile.

## Using the story source

```ts
import { storyActivitySource, storySteps, storyStep } from '@/app/sim/story-source';

const { source, heroId } = storyActivitySource(); // memoised ActivitySource
createViewer(host, model, onSelect, { activity: source }); // composed by the renderer
const clinic = storyStep('clinic');
viewer.activity.setOptions({ time: clinic.focusTime, playing: false });
viewer.followActor(clinic.focusActorId); // 'hero-lin' or 'interaction:idt-huddle'
```

`composedStorySource(model)` returns the same story as the viewer plays it
(`alhambraSource(model, source)`: plus the community layer and the fleet crew);
Measure and the reports read that one.

Each `CompiledStep` has `window`, `focusTime`, `focusActorId`, `stops` (anchor,
heading, action, arrive/depart, overlap, companions, partners, interaction id),
`companionIds`, `interactionIds`, `handoffs` and `roles`.

## What is measured (`app/sim/metrics.ts`)

`computeMetrics(source, model, { step, heroId, steps, vehicles })` samples every
actor every `step` loop seconds (1 s in the report, 2 s in the panel). `vehicles`
(the viewer's `activity.vehicles`, or `alhambraVehicles()` in Node) seats riders
where the scene draws them:

| Measure | Definition |
| --- | --- |
| Zone occupancy | visible participants and staff per zone at each sample (ground zones by point-in-polygon, like the engine; the home and partner sites by the composed source's `zones`; `site` for the street and vans); peaks, means and person-hours |
| On site | participants and staff visible at the center (not at a home or partner site) |
| Staff utilization | per role and per person: **direct care & programs** (treat, consult, tabletop, exercise, serve, greet, present, conversation, music …), **walking & escorting**, **documenting & standby** (document, idle, listen), **team meetings** (seated upstairs), **driving**; shares of on-duty time |
| Walking distance | visible displacement per person, averaged per role |
| Participant time | per participant: arrivals, clinical, therapy, activities, meals, coordination, care at home & in the community (from interaction categories), walking between, waiting & free time, home, in the van or away (away from the center only community touchpoints count) |
| Hero touchpoints | per IDT discipline: minutes with someone of that discipline within 1.6 m or in a shared interaction, encounters, first time |
| Handoffs | counted from the scenario's step handoffs, per step and discipline |

Staff are counted as people: tracks sharing a `profileId` (an upstairs meeting
attendee and the same person downstairs) are one person. Staff utilization
covers staff seen at the center; partner staff who only appear at a home or
partner site (the pharmacist, the hospitalist) are in occupancy and the trace.

The **Measure** panel (header → Measure) shows occupancy small multiples by zone
(click to jump the playback), staff time by role and, for the story scenario,
Mrs. Lin's care team, with a marker synced to the viewer clock. Compare the base
loop and "With Mrs. Lin's day" with the scenario toggle; both are measured as the
scene plays them (the center, the fleet crew and the community settings). Its **Trace** tab lists
one person's touchpoints end to end (next section).

## Touchpoint trace (digital-twin seed)

`app/sim/trace.ts` turns the same tracks into an **event stream**: an ordered log
of what happened to whom, where and with whom, for every person on the clock:
the center's loop, the fleet crew and the community cast (`alhambraSource`).
Metrics answer "how much"; the trace answers "what happened to this person, in
order", which is the shape a digital twin of operations ingests and compares.

```ts
import { traceTouchpoints, personJourney, traceSummary } from '@/app/sim/trace';

const events = traceTouchpoints(source, model, { step: 1 }); // sorted by t, then actorId
const lin = personJourney(events, 'hero-lin');               // one person's day
const totals = traceSummary(events, source);                 // events by kind, coverage
```

### Event schema

Every event is a `TouchpointEvent`:

| Field | Meaning |
| --- | --- |
| `t`, `clock` | loop seconds and the clock label (`clockLabel`), e.g. `144.93`, `9:36 AM` |
| `actorId`, `actorLabel`, `role` | the person (one event per person involved) |
| `kind` | one of the kinds below |
| `zoneId`, `roomId`, `levelId`, `x`, `z` | where: ground zones by point-in-polygon like the engine, rooms by `model.rooms` polygons and the rooms of facility instances on community pads (`SourceZone.rooms`, `community:partner-adc/day-open`) (`null` in open areas), the home and partner sites by the source's `zones` (`community:<id>`), `site` for the street and vans |
| `with` | other actor ids involved (interaction members, the encounter partner, the two staff of a handoff) |
| `interactionId`, `category`, `title` | the interaction; `title` is also the place name on `enter` and `"RN → PT"` on a handoff |
| `vehicleId` | the vehicle on `board` / `alight` (named by the vehicle registry's labels in the panel) |
| `durationSeconds` | coalesced encounters and `interaction-end` |

Events are sorted by `t`, then `actorId`, then a fixed kind order
(`day-start, alight, on-site, leave, enter, board, off-site, interaction-end,
handoff, interaction-start, encounter, day-end`), so the output is
reproducible byte for byte.

### How each kind is derived

The tracer samples every actor every `step` seconds (2 s in the panel, 1 s in
the report) with the same `sampleFrame` helper metrics uses, so what is traced
is exactly what is animated.

| Kind | Rule |
| --- | --- |
| `day-start` / `day-end` | every person, at 0 s and 720 s |
| `on-site` / `off-site` | the track becomes visible / hidden (hidden = indoors at home, off duty or driving a car; riders seated in a van stay visible) |
| `enter` / `leave` | the (zone, room) pair changes while visible; a room change inside a zone is a `leave` + `enter` of the same zone |
| `board` / `alight` | a segment with `vehicleId` and action `ride` begins / ends |
| `interaction-start` / `-end` | `source.interactions`, one pair per member, at the authored times |
| `encounter` | two visible people on the same level (or one outdoors) within `encounterRadius` (1.6 m) for at least `minEncounterSeconds` (4 s); breaks shorter than `encounterGapSeconds` (3 s) are bridged; one event per person at the start of the run, with the partner in `with` and the length in `durationSeconds` |
| `handoff` | a participant's attending staff change role: staff attend through a shared interaction, an `escortFor` link or a `pairedWith` link; when someone of a different role than the most recent attender starts attending at a later sample, the participant gets a `handoff` from that person to the newcomer |

`personJourney` adds per-person zone dwell (from `enter`/`leave`), the IDT
disciplines met (roles of everyone in `with`, through `care-team.json`),
encounter and interaction counts and the first/last time on site.
`traceSummary` counts events by kind, participants with at least one clinical,
therapy, activities, meals, coordination or community (home, pharmacy,
specialist, hospital, partner, after-hours) interaction, and the median events
per participant.

### Report, export and validation

`npm run sim:report` (or `npm run trace:report` for the trace alone) traces the
base loop and the story source, both composed as the viewer plays them, at 1 s
and writes `public/models/touchpoint-trace.json`: `{ sources: { base, story } }`,
each with a `summary` and one event per line, about 2.3 MB for ~8,100 events
(220 people in the base loop, 235 in the story), under the 3 MB bound.
Compactness comes from coalescing encounters, not from short keys. The console
prints events by kind, participants covered per category and the hero's
discipline coverage. `npm run validate:trace` recomputes the trace and asserts
ordering, one `day-start`/`day-end` per person, alternating presence, stays and
rides, start/end pairing per interaction and per person, mutual encounters,
finite coordinates, determinism, that Mrs. Lin's trace includes every discipline
the scenario steps' `roles` claim, that the community layer is traced and its
touchpoints counted, that no event lies off the drawn world (riders are seated),
and that the published file is current and within the size bound. Both scripts
read the trace options and the size bound from `scripts/trace-config.mjs`.

In the viewer, the Measure panel's **Trace** tab has a person picker
(participants first, then staff, with search), counters (events, encounters,
disciplines), a zone-dwell strip, the ordered timeline (clock · place · event ·
who with) and **Download trace (JSON)** for the scenario shown. Clicking an entry
sets the clock there and follows the person when they are in the scene (the
story-only cast is traced, but the main viewer animates the base loop).

### Limits

- The events are derived from composite, scripted tracks, not from records:
  they show what the model animates, on its compressed clock, not what
  happened at a center.
- An encounter is proximity, not conversation: neighbours at a dining table
  count, passers-by do not (below 4 s), and a 1.6 m radius misses care given
  from behind a chair or across a treatment bed.
- Handoffs are inferred from who starts attending next, so they include
  joint starts (RN and PCP in the same minute both appear as handoffs from the
  front desk) and they do not know why a handoff happened; the scenario's
  authored `handoffs` carry that meaning.
- Rooms are only as good as the room polygons: open areas trace at zone level,
  and a person walking a corridor along a room boundary may enter and leave it
  briefly.
- The in-browser trace samples every 2 s, the report every 1 s, so counts
  differ slightly between the panel and the file.

### From simulation to operations data

The same event kinds are the join points to real signals. Each row names the
operational record that would produce the event; none of these integrations
exist in this repository.

| Trace kind | Real signal |
| --- | --- |
| `board` / `alight` | van manifest and boarding log: driver app pickup / drop-off confirmations, vehicle GPS geofence at the home and the center |
| `on-site` / `off-site` | day-center check-in and check-out: front-desk or kiosk check-in, attendance roster |
| `enter` / `leave` | room-level location where it exists: scheduled room use, clinic room assignment, badge or indoor positioning if deployed |
| `interaction` · `clinical` | clinic visit records: encounter open/close times, vitals feed timestamps, medication administration |
| `interaction` · `rehab` | therapy session notes with start and end times |
| `interaction` · `meals` | meal service: tray tickets, dietary orders, dining attendance |
| `interaction` · `activities` | program attendance and engagement notes |
| `interaction` · `coordination` / `arrivals` | social-work notes, care-coordination tasks, family phone calls and texts, front-desk registration |
| `encounter` | no direct record; approximated by staff assignment and task logs, or by proximity devices where consented |
| `handoff` | care-team handoffs: IDT huddle notes, task reassignments, secure messages between disciplines |
| `day-start` / `day-end` | the day's scheduled attendance and transport manifest |

With such feeds, `TouchpointEvent` becomes the common schema: real events and
simulated events can be compared per person (did the day go as planned?), per
zone (where does time go?) and per discipline (who did each participant see?),
which is the starting point for calibrating the simulation (see the roadmap
below).

## Limitations

- **Compressed time vs. real distances.** The hero walks about 300 m between
  ten stops in roughly 415 loop seconds, which needs a gait near 1.26 m/s per
  loop second (the base loop uses 0.62–0.78). Time on screen is compressed, so
  this reads as brisk rather than wrong, but the step windows are tight for the
  building's distances, especially recreation (table tennis in the rear
  northeast, karaoke by the entrance, 49 m apart) and the dwell at each stop is
  9–48 s. The report shows the walking burden explicitly.
- Collision handling is static reservations plus local re-timing, not
  continuous avoidance. Brief close passes with base actors remain and are
  listed by the build.
- The escort follows the hero's path at a fixed 0.95 m gap, so when she sits it
  stands on her approach path (by a doorway or behind her chair).
- People do not climb stairs. Upstairs meeting attendees are separate tracks that
  appear at the stair landing; identity is shared through `profileId`.
- Anchors were chosen before the table-tennis table and karaoke furniture landed;
  the compile nudges standing anchors out of furniture and reports crossings,
  but approach waypoints are authored.
- The base loop already has two waiting participants sharing one desk spot
  (`arrival-cane` and `arrival-wheelchair` at (−10.4, 1.6)); the hero's farewell
  therefore uses a spot beside the desk.
- Metrics describe illustrative composite tracks, not operations.

## Roadmap toward discrete-event simulation

The compiled-track approach is a scripted day. A discrete-event layer would
generate the day instead:

1. **Entities and resources.** Participants with care plans (visit types,
   durations, mobility); staff with rosters and skills; rooms and equipment with
   capacities (exam rooms, parallel bars, dining seats, vans).
2. **Stochastic arrivals.** Van runs with delay distributions, variable
   attendance, walk-in visits, weather or traffic scenarios.
3. **Queues and waits.** Requests for a nurse, therapist or room queue when the
   resource is busy; measure waits, idle time and abandonment.
4. **Staffing rosters.** Shift start/end, breaks, float staff; compare rosters
   by care time delivered and walking burden.
5. **Events → tracks.** Keep this compiler as the renderer's back end: each
   simulated event becomes a stop with an anchor and duration, routed on the same
   grid, so every what-if can be watched as well as measured.
6. **What-if runs.** Many replications per scenario (seeded), confidence
   intervals on KPIs, side-by-side comparison in the Measure panel: room swaps,
   new equipment, a second van, a different program timetable.
7. **Calibration.** Fit durations and arrival patterns to aggregated,
   de-identified operational data, and keep the source basis visible.

## Reconciled layout

The story uses the reviewed community rooms from the three-site model. `placement.replacedBackgroundActors` reserves activity positions for the story cast without changing the normal facility population. The compiler checks wall clearance and continuity and reports close pedestrian encounters; this is an illustrative simulation, not a guarantee of collision-free crowds or real-world accessibility. Vehicle traffic has a separate `npm run validate:traffic` clearance check.
