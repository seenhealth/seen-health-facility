# Plan: one chassis for distributed care, replicable buildings, networks and a digital twin

Status: proposal for review, written alongside the September 2026 distributed-care pull request.
Timing, staffing and people in every simulation remain illustrative; nothing here uses participant
records. The companion [code review](CODE-REVIEW.md) holds the evidence behind each recommendation.

## 1. Where we are

The repository renders three Seen Health sites as architectural presentation models and animates a
composite care day on one 720-second clock (8 AM to 4 PM). Alhambra carries the full loop: 184 people,
eight vans, deliveries, a programmable day room, a scripted participant story, a scenario compiler that
routes people on a navigation grid, and a measurement layer that samples the same tracks. Olympic and
Alveare reuse the rigs with site-specific casts and arrivals.

The pull request adds, on top of that:

- vans that read as the Seen Health ProMaster fleet, drive nose-first with no street U-turns, and carry
  visible drivers who deploy the ramp and escort every rider on and off;
- a distributed-care layer around the center: a participant's home (home care, home health, pill packs,
  meals, home modifications, the nurse line), a partner pharmacy, a community hospital with discharge
  coordination, a specialist clinic and a partner adult day center, with couriers and a van moving
  between them on the same clock;
- a weekly day-program repertoire with rotations and more culturally specific activities;
- a touchpoint trace: an ordered event stream for every person, with a Trace tab and a JSON export;
- engine hooks that make the above composable: a vehicle registry, seats inside vehicles, and source
  composition.

The review's verdict: the simulation core is sound (pure samplers on one clock, a compiler with strong
build-time validation, the registry and composition seams). The chassis around it is not yet a chassis:
Alhambra is the implicit default, site identity lives in four keys, per-site branches sit inside generic
modules, per-frame placement is implemented four times, and 3D primitives are declared in sixteen files.

## 2. What the review found (summary)

| Theme | Finding | Where it stands |
| --- | --- | --- |
| Measurement | Measure, Trace, the report and the trace validator sampled the raw loop, not the composed source the viewer plays. | Fixed in this PR: one shared composed source feeds the viewer, the panels, the report and validators. |
| Fleet motion | Tight pull-out arcs and a docking heading snap still made vans pivot; the turn-rate bound could not catch it; delivery trucks snap 45° on departure. | Fixed in this PR: the fleet drives straight runs and arcs of at least 4 m (a short straight reverse out of the drop-off, drivers through the driver's door, every drop-off arrival from off site, drivers walking from the fleet office to parked vans, fades over the drawn street's last metres), delivery trucks back out and turn on 4.5 m arcs, street cars and the Olympic and Alveare vans drive rounded routes, and `validate:traffic` checks nose-first motion, jumps and a 4 m radius for every vehicle. |
| Site coupling | Olympic and Alveare reuse Alhambra's van timetable; a facility without a context style inherits Alhambra's world. | Per-site van timetables fixed in this PR (`app/data/site-arrivals.json`); the general fix is the site registry below. |
| Exporters | The GLB export scripts patch renderer imports by hand and broke when modules were added. | Fixed in this PR: the exporters bundle the renderer with the Rolldown loader, and `validate:renderer` is a headless smoke and disposal test for every site. |
| Identity | The story and the community layer each had a "Mrs. Lin"; nothing detects one person in two places. | Renamed in this PR: the community household is the Wongs ("Mrs. Wong · at home", "Mr. Wong", "The Wongs' home"; actor and setting ids unchanged), so the story hero is the only Mrs. Lin. A person registry that detects one person in two places is part of the digital-twin work. |
| Duplication | Placement logic ×4, point-in-polygon ×4, vehicle frame transform ×6, clock labels ×3, box helper ×16, five ways of compiling TypeScript for Node. | Started in this PR for vehicles: ring lanes, corner radius, easing, the van ramp, the fade, the fleet van ids and straight-and-arc routes (`vehicle-path.ts`) are each defined once. The other kits follow the migration order below. |
| Validation | 19 validators, no runner, no CI, lint not enforced, several vacuous or orphaned checks. | Runner and CI added in this PR: `npm run validate` runs every validator (orphans included), `npm test` adds a `node:test` suite and CI runs both; the fleet-crew vehicle-id check now asserts against the engine's registered ids; lint enforcement and the remaining vacuous checks are follow-up. |
| Dependencies | The shadcn kit and about a dozen packages are unused. | Prune during the split of the renderer and the page. |
| Facility instances | A care setting could only be schematic massing; nothing could put a real building, or its people, on a pad. | Built after this PR: any schema 2.0 facility is stamped on a pad (`facility-instance.ts`, registry `facility`) with people generated inside it at build time from a cast file (`npm run build:community`): scene people placed by room scenes, and scheduled people with explicit stops whose time off the instance is a hole that hand-authored legs fill (`fillHoles`, `HOLE_LEGS`). The partner adult day center is Seen's Alhambra ground floor; the Wongs' home is its own bungalow plan (`seen-home-wong.json`, `npm run validate:home`) with the six people of its ADL day generated inside and their time outdoors (the clinic trip, the aide's car and porch, the visitors' arrivals, Mr. Wong's hospital day) as hole legs. The story's home and partner cutaways frame the stamped rooms. Renderer geometry, batching and frame helpers it needed are extracted (`facility-geometry.ts`, `batch.ts`, `frame.ts`, `presentation.ts`). |

## 3. The chassis

The aim is that a new simulation is mostly data plus a camera, and the same look and feel comes for free.

### 3.1 Target layout

```
app/chassis/
  clock.ts            CareClock {start, duration, minutesPerSecond, days}; the only place 720 appears
  ids.ts              PersonId, SettingId, VehicleId, SiteId; person registry (profiles)
  geom/               polygon.ts, frame.ts (one documented local-frame convention), primitives.ts
  engine/             source.ts (compose + validate), sample.ts (one placeActors), vehicles.ts
                      (VehicleDef: body, seats, legs, doors, ramp, reservations), track.ts, activity.ts
  sites/              SiteConfig registry read from app/data/sites/*.json
  layers/             Layer interface; street context, exteriors, fleet, arrivals, deliveries,
                      day room, community: each builds a root, ticks, disposes, and may contribute
                      sources, vehicles and camera framings
  scenarios/          library + compiler generalised to any site and setting
  trace/              event schema with settingId, personId, absolute time, provenance; derive; compare
app/data/sites/*.json  app/data/settings/*.json  app/data/vehicles/*.json  app/data/scenarios/*.json
app/viewer/            renderer split: materials, post, building, camera, picking, recording, export
```

Boundaries: the chassis imports no three.js outside `geom/primitives` and `engine/activity`; metrics, trace,
scripts and tests import only pure modules; the viewer never branches on a site id, it iterates the site's
layers and reads the site's camera.

### 3.2 Registries (data)

| Registry | Today | Target |
| --- | --- | --- |
| Sites | `app/data/sites.ts` plus `contextStyle`, `exteriorAppearance` and `siteId` checks in code | One `SiteConfig` per site: model, geography, context and exterior specs, arrival layout and timetable, cast kind, program, layers, camera framings, panel flags. A fourth site is a JSON file. |
| Care settings | `community-settings.ts` (registry-shaped TypeScript) | JSON entries with a kind, a local frame, anchors, services and a cast template; the same schema around every site. |
| Vehicles | Fleet, trucks, site vans, couriers and street cars each with their own sampler (sharing route pieces, lanes and easing) | One `VehicleDef` and one sampler; the traffic validator iterates the registry. |
| Casts | `character-templates.json`, room scenes, `community-people.ts`, `fleet-crew.ts` | Cast templates per setting kind, parameterised by counts and anchors; one `Track` builder. |
| Programs | `day-program.json` with repertoire and rotations | Rotation as a source transform that retitles sessions, so trace and metrics follow the chosen day. |
| Scenarios | One scenario file | A library with a manifest: base source, extensions, hero, steps, shots. |

### 3.3 Engines

- Navigation: unchanged for buildings; add an outdoor graph for pads and access roads.
- Compiler: learns steps at a care setting and vehicle legs (board at A, alight at B).
- Activity engine: one `placeActors` used by renderer, metrics, trace and validators; zone lookup
  precomputed per segment.
- Metrics and trace: one sampling pass; metrics become reductions over the trace.

## 4. Scenario library: three simulations we can now stamp out

### 4.1 Partnering with adult day centers

Question: what does a Seen partnership with an existing ADC look like day to day, and what does Seen bring
on-site? Data: the `partner-adc` setting (already placed) with a cast template (their activities lead and
participants, a Seen visiting PT and RN on a rota, a Seen van drop-off and pickup, a meal delivery, a
weekly IDT video huddle). Scenario: a partnership day from a 9:10 van departure to a 2:30 return, with the
trace showing which disciplines touched each participant at the partner site. Measure: staff time on the
road and on-site, participant activity minutes by setting, van utilisation. Missing pieces today: person
identity across settings and a setting that can be either a pad or a full facility.

Status: the layout and the day are built. The partner pad carries the partner's own adult day health care
center (`seen-partner-adhc`, trace zone "Partner ADC") with twenty-six participants, the partner's activities
lead, activity aide, music and choir leader, social worker, rehab aide and receptionist and a visiting Seen PT,
generated from `app/data/community/partner-adc.cast.json`: coffee at the long tables, calligraphy, a class and
a support group, painting, the line dance and PT, lunch, the choir, bingo, an afternoon studio and the fan
dance; the trace names its rooms. Still missing: the van drop-off and pickup, a meal delivery, the IDT huddle
and person identity across settings.

### 4.2 Replicating another building quickly

Question: given a new center's drawings, how fast can we get a populated, animated model with the same
look? Pipeline: drawings → traced plan → facility JSON (schema 2.0, the strong part) → auto-populate from
the approved catalog → navigation grid → cast generation (the room-scene generator is the seed) →
validators → viewer. Make it a command (`npm run new-site`) that scaffolds the site JSON, the arrival
layout and a default cast and runs the validators, and generate the design-review checklist alongside,
because reviewed accuracy is what made Alhambra credible. Blockers today: the Alhambra defaults on the
no-context path, bespoke exterior builders per site, and the site branches in the renderer and the page.

### 4.3 A network of facilities as one distributed health system

Question: how do several centers, partner sites, homes and hospitals work as one system, with data and
software as the layer that ties them together? View: a two-scale model. A map-scale network view built from
the site registry (projected geography, route polylines, vans and couriers moving between sites, animated
signal arcs for calls, alerts and discharge notices) and the local-scale setting view that exists today.
Data: the trace becomes network-wide and follows a person across settings. Measure: cross-site KPIs
(on-site time by setting, transport minutes per participant, handoffs across organisations), the language
of the growth stages in the deck. Blockers today: the 720-second clock in 18 files and the Alhambra frame
baked into the community lanes.

## 5. The digital twin: from tracks to operations data

The trace defines the event vocabulary: board, alight, enter, leave, interaction start and end, encounter,
handoff, on-site, off-site. The same vocabulary maps onto the signals the operating platform collects
(van driver logs, day-center check-ins, meal service, clinic visits, specialist faxes, family texts, vitals
feeds). Keep simulation and platform speaking one schema:

1. Publish the trace schema as the contract and add stable person ids, setting ids, absolute time and
   provenance (planned, simulated, observed).
2. Add an importer that turns de-identified, aggregated operational events into the same stream, so the
   Measure and Trace panels can show simulated and observed days side by side.
3. Calibrate dwell times, arrival patterns and encounter rates to the observed stream and show the basis
   of each number in the UI.
4. Make the event log the primary record: the scenario compiler already turns steps into tracks; a
   discrete-event layer (entities, resources, stochastic arrivals, queues, rosters, replications) generates
   days that can be watched as well as measured.
5. Close the loop with the platform's playbooks: a simulated alert becomes a scenario step, the team's
   response is choreographed and measured, and the outcome feeds the playbook version.

## 6. Migration order (the app works after every step)

1. Correctness first: composed source everywhere (done), exporters bundled with Rolldown plus a headless
   renderer smoke test (done), per-site van timetables (done), delivery departure fix (done), `npm test` and CI
   (done).
2. Golden outputs: snapshot report and trace summaries and a per-actor placement hash per site; later
   refactors keep them byte-identical unless a step says otherwise.
3. Pure helpers: `chassis/geom` and `chassis/clock`; replace the polygon, frame, clock-label and `720`
   copies.
4. One `placeActors` for engine, metrics, trace and validators; re-baseline the goldens once.
5. Site registry: JSON for the three sites holding today's values; replace the style and id checks with
   config reads.
6. Layer interface: wrap existing builders, then split the renderer and the page along the layout above.
7. Vehicles: migrate deliveries, site arrivals, community vehicles and the fleet to `VehicleDef` one at a
   time with the traffic validators as regression.
8. Data out of TypeScript: community settings, vehicles and cast, fleet requests, palette and panel lists;
   rotation as a source transform.
9. Twin: person registry and provenance in the trace, planned events from the compiler, the network view
   and a clock that spans a day or more.

## 7. Assumptions recorded this session

- **Clock.** The 8 AM to 4 PM loop stays. After-hours support is shown as a daytime nurse-line call between
  the home and the center's on-call desk; an evening clock variant is a scenario-library item.
- **Geometry.** Care settings sit on schematic pads beyond the ring streets of the Alhambra block, each with
  a horseshoe drive so no vehicle reverses or U-turns there. Real geography belongs to the network view.
  Community people use short straight paths on their pads; there is no outdoor navigation grid. People
  inside a facility stamped on a pad walk on that facility's own navigation grid, and along anchors
  outdoors.
- **Fleet.** Five back-in bays line the west side of the lot, starting a stall north of the curb island;
  van F and the two spares park at the west-street curb. Vans A–D never come back to their bays during the
  day: every drop-off arrival comes in from off site (riders board out of view) and between runs they stay
  on their rounds, because only the northernmost bay can turn south toward the street. Van E (that bay) and
  van F (curb) make the neighborhood runs; their drivers walk from the fleet office in the center out to the
  parked van and back. Every move is straight runs and arcs of at least 4 m; off-site trips leave through
  the driveway and down the west street and fade out over the drawn street's last metres, the people seated
  in a van hidden once it is below half opacity. A van leaves the drop-off by backing straight out 3 m,
  because a forward exit would sweep the entrance ramp's landing. Alhambra's unload windows were shortened
  to fit the loop; Olympic and Alveare keep their original van timetable, now their own data.
- **Deliveries.** The trucks nose in at the rear receiving doors beside the rear court's palm planters,
  then back round onto the drive aisle south of them and pull away east; they still appear and vanish on the south street east of the yard.
- **Community timings** were shifted to clear fleet, truck and street-car movements (the van leaves the
  home 9:15, specialist visit 10:05, discharge pickup 2:23 PM, home-health visit 3:07 PM, nurse line
  3:40 PM). The discharged participant goes home and rolls in at the front door at 3:28 PM; the home's
  indoor day (breakfast and pills, the assisted shower after the clinic, the grab bar, the nurse's visit)
  fits around those times.
- **Day program.** Rotations default to the existing Monday so the story and validators are unchanged;
  repertoire programs borrow equipment from a base program and reuse existing poses.
- **Trace.** Encounters are emitted for both people; handoffs are attributed to the participant; the
  in-browser trace samples every 2 s, the report every 1 s.

## 8. Open questions for the owner

Product:

- Which partner types matter most for the next pitch: adult day centers, hospitals, pharmacies, housing?
- Should the network view use real geography (the three geocoded sites) or a schematic ring?
- Is there an aggregated, de-identified operational extract we can use to calibrate the first KPIs?
- Which new center's drawings should be the first test of the replication pipeline?

Model details:

- Should the community van idle at the home between runs (as now) or return to the fleet lot?
- Keep the ambulance cameo at the hospital, and should the story page show the community layer?
- Trim the curb island so all eight vans can use bays, or keep two spares at the curb?
- ~~Move the drop-off dock 3 m west so vans can leave it forward instead of backing out 3 m first?~~ Done
  differently (owner walkthrough, 2026-10): the van now docks on the aisle parallel to the lobby wall, sliding
  door toward the entrance, and leaves forward down the aisle.
- Van E backs into the northernmost bay only while van D's bay is empty, so it was given one long
  neighborhood run instead of two; now that vans A–D stay on their rounds, van D's bay is always empty.
  Should van E make two runs again?
- Should delivery trucks back in to the receiving doors (tailgate at the door) and drive in from and out to
  the ends of the drawn streets with a fade, as the vans do?
- Should non-Monday rotations be baked into the day-room interaction tracks rather than re-posed at runtime?
- Should handoff events also be attributed to the two staff members, and do analysts want CSV or NDJSON
  exports alongside the JSON trace?
