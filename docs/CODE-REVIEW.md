# Code review and status

The architecture review below was written for the September 2026 distributed-care pull request and is reproduced verbatim. **Its file and line references (`file.ts:123`, `l.123`) refer to commit `aa89008`**; the code has moved since, so search for the named function or constant rather than trusting a line number. The plan that sequences the follow-up work is in [PLAN.md](PLAN.md).

## Status of the findings

| Finding | Review section | Status |
| --- | --- | --- |
| Measure, Trace, `sim-report.mjs` and `validate-trace.mjs` sampled the raw loop, not the composed source the viewer plays | §2.1 item 1 | Fixed in this PR |
| Per-frame placement logic implemented four times and already diverging | §2.1 item 2 | Follow-up |
| GLB export scripts broken by new renderer imports; no renderer smoke test | §2.1 item 3, §5 | Fixed in this PR (exporters and a headless renderer smoke test) |
| Olympic and Alveare reuse Alhambra's Van A/B timetable | §2.1 item 4 | Fixed in this PR (per-site timetables in `app/data/site-arrivals.json`; `validate-site-arrivals.mjs` asserts they are independent of `alhambraVanWindows`) |
| A facility without `contextStyle` inherits Alhambra's loop, streets, fleet and community | §2.1 item 5 | Follow-up |
| Validators that can pass vacuously | §2.2 item 6 | Partly fixed in this PR: `composeSources` rejects a gap between an added actor's segments and a seat without a `vehicleId`, and `createActivity` rejects a seat in a vehicle that is not registered; `validate-trace` reads the composed source and the Olympic checks no longer compare against `HEAD`. `validate-fleet-crew` builds the engine's registry (`registerCenterVehicles`) and asserts every van id and every seat against the registered ids. `validate-fleet-crew` also asserts the ramp-escort totals (every descent and ascent implied by the riders' van rides, 8 down and 8 up per source, each attended by the driver). Follow-up: the community-traffic proximity check; `validate-traffic`'s driveway-yielding check is now vacuous, since no van waits in a bay for the driveway any more (the timeline has no `yielding` spell), and should assert that or be removed; the showcase caption (`showcase-controls.tsx:109`, "N people") still prints `viewer.activity.data.actors.length` and ignores the Community toggle, unlike the activity panel's snapshot `people` |
| Day-program rotation leaking into Olympic and Alveare | §2.2 item 7 | Fixed in this PR |
| Day-program rotation as global module state that only re-poses the scene (titles, metrics and trace stay on Monday) | §2.2 item 7 | Follow-up |
| `sampleActor` ignores the source's clock; `720` hard-coded in 18 files | §2.2 item 8 | Follow-up |
| Paired actors play their partner's timing | §2.2 item 9 | Follow-up |
| Community visibility toggle applied after the engine ran | §2.2 item 10 | Fixed in this PR |
| Three clock-label implementations | §2.2 item 11 | Follow-up |
| Delivery trucks snap 45° and pivot when leaving | §2.2 item 12 | Fixed in this PR: a truck backs straight out of receiving, stops and pulls away from a short straight into 4.5 m arcs; the arrival is rounded to the same radius (`deliveries.ts`, routes from `vehicle-path.ts`) |
| The /story viewer builds the community layer; two "Mrs. Lin" actors | §2.2 item 13 | Fixed: the community household is the Wongs (`home-participant` "Mrs. Wong · at home", `hospital-participant` "Mr. Wong", setting `home-lin` "The Wongs' home", renamed `home-wong` once Mrs. Lin got a home of her own), so the story hero is the only Mrs. Lin, and the story now shows the community layer on purpose: a network beat and six cutaway chapters feature its interactions (docs/STORY.md, "The network beat and the cutaways") |
| Composed sources rebuilt per viewer | §2.2 item 14 | Fixed in this PR: `alhambraSource` memoises the composed source per base loop and model, so every viewer, the Measure panel (also before the viewer is ready) and the sim report share one `ActivityData` object and its engine caches |
| Per-frame linear scans | §2.3 item 15 | Follow-up |
| Double `update()` per UI action | §2.3 item 16 | Follow-up |
| Disposal gaps | §2.3 item 17 | Partly fixed in this PR: `validate:renderer` found two leaks outside the review's list, the PMREM `RoomEnvironment` and the tilt-shift `OutputPass`; both are disposed now and the smoke test fails on any geometry or material the renderer used that `dispose()` leaves allocated, on all four sites (no known leaks remain). The review's own items (the GLTF placeholder dropped by `g.clear()`, per-box van materials, shared character materials re-uploaded per viewer, a recording that resolves after dispose) are follow-up |
| `preserveDrawingBuffer: true` on the main renderer | §2.3 item 18 | Follow-up |
| Viewer effects read stale state by design | §2.3 item 19 | Follow-up |
| Heading conventions undocumented; vehicle-local transform written six times | §2.4 | Follow-up |
| God files, duplicated primitives, site branching in generic modules, data authored in TypeScript, unused code and dependencies | §3.1–3.5 | Partly fixed in this PR: the ring-street lanes and corner radius (`STREET_LANES`, `laneLine`, `laneFlow`, `STREET_CORNER_RADIUS`), drive easing outside the fleet (`easeDistance`), the van ramp (`FLEET_VAN_RAMP`), the vehicle fade (`fadeVehicle`), the fleet van ids and labels (`fleetVanId`, `fleetVanLabel`) and straight-and-arc routes (`vehicle-path.ts`, now used by the fleet, the trucks, the street cars and the Olympic and Alveare vans) are each defined once; the rest is follow-up |
| Fleet van pull-out arcs and docking heading snap that made vans pivot | §5 (turn-rate bullet) | Fixed in this PR: every fleet move is straight runs and arcs of at least 4 m, a maneuver that sweeps near a parked van is booked only while that spot is empty, a van leaves the drop-off by a short straight reverse, drivers get in and out through the driver's door and vans fade out over the last metres of the drawn street, the people seated in them hidden once the van is below half opacity (`SEATED_MIN_OPACITY`); arrivals from off site (every drop-off arrival fades in on the west street, and vans A–D stay on their rounds between runs instead of returning to their bays); drivers walk to parked vans (van E's and van F's drivers walk from the fleet office in the center to the van and back, so nobody appears in or vanishes from a parked van) |
| Turn-radius check for every vehicle (trucks, street cars) | §5 (turn-rate bullet) | Fixed in this PR: `validate:traffic` asserts nose-first motion, no jumps and a 4 m minimum radius for every fleet van, delivery truck and street car and for the Olympic and Alveare vans (sampled through `buildSiteArrival`); the street cars' kinked circuits (0.37 m) and the Olympic curves (1.07 m) became rounded routes to pass it |
| No test runner, `npm test` or CI | §5 | Fixed in this PR |
| Other validation gaps: orphaned validators, placement parity, fresh-compile check of the story tracks, golden outputs | §5 | Partly fixed in this PR (orphaned validators run in `npm run validate`; `validate:scenario` fails when the committed tracks differ from a fresh compile); placement parity and golden outputs are follow-up |
| Community pad orientation, label fitting and Plan-view gating | — | Fixed in this PR |
| README and documentation wording | — | Fixed in this PR |
| Building geometry, presentation constants, material batching and frame transforms locked inside `renderer.ts`; heading convention undocumented | §3.1, §3.2, §2.4 | Partly fixed after this PR: `facility-geometry.ts` (slabs, floors, finishes, walls), `presentation.ts` (palette, `CUTAWAY_HEIGHT`), `batch.ts` (merge by material) and `frame.ts` (one documented `rotation.y = heading` frame) are extracted and shared with facility instances; the renderer's output is unchanged (same resource counts, pixel-identical Alhambra frames). The vehicle-local transforms are follow-up |
| A care setting can only be schematic massing; a whole day's cast authored imperatively in `community-people.ts` | §3.1, §4.1 | Partly fixed after this PR: any schema 2.0 facility can be stamped on a pad as a cutaway (`facility-instance.ts`, registry `facility`), and the people inside it are generated at build time from a cast file (`npm run build:community`, validated and drift-checked in `npm run validate`); the partner adult day center is Seen's Alhambra ground floor with 25 generated people, and its hand-authored block is gone. Scheduled people (explicit stops, arrive/leave, away windows) leave holes that hand-authored outdoor legs fill under a checked contract (`fillHoles`, `HOLE_LEGS` keyed by exact window): the Wongs' home is stamped too, its six people generated inside with their trips as hole legs and their hand-authored blocks gone. The pharmacy, clinic and hospital are still hand-authored |
| Three "journey" models coexist; the guided `care-journeys.json` is not linked to the tracks | §3.5 | Fixed after this PR: the Journeys tab, `journey-panel.tsx`, `journeys.ts` and both copies of `care-journeys.json` are retired; `export-model.mjs` now checks the instant camera focus on the whole site and on every area and a room in it instead of on the journey steps |

Rows without a section were found in the same pass over the branch but are not part of the review text.

---

# Seen Health 3D facility — code review (read-only)

Branch `claude/great-mccarthy-0kkzy5` at `aa89008`. Scope: `app/` (model, sim, story, components, data, page), `scripts/`, vite configs. `components/ui/*` is not imported by any app code (see §3). Line numbers refer to this commit; other agents are editing concurrently, so re-check before acting.

**Verdict in one paragraph.** The *simulation core* is sound and better than its file sizes suggest: one 720 s clock, pure samplers (`sampleActor`/`sampleEscort`/`samplePairedActors`), a precompiled-track story pipeline, a vehicle registry, `composeSources`, and a deterministic trace. The *chassis around it* is not yet a chassis: Alhambra is the implicit default everywhere (absence of `contextStyle` = Alhambra), site identity is spread over four keys, per-site behaviour lives in `if`/ternaries inside generic modules, the engine's per-frame placement logic is re-implemented in 4 places (engine, metrics/trace, two validators), and 3D primitives are re-declared in ~16 files. New simulations (a)–(d) are feasible but today each would mean editing `renderer.ts`, `activity.ts`, `page.tsx` and the panels.

**What is solid and worth keeping:** deterministic pure samplers on a single care-day clock; the scenario DSL → compiler → precompiled tracks pipeline with strong build-time validation (build-scenario.mjs:51+); `VehicleRegistry` + `seatInVehicle` + `SourceExtension`/`composeSources` (the right extension seams); the community registry with a kind→builder table (community-pads.ts:645); 50 Hz vehicle clearance checks; accurate, unusually good docs; `tsc --noEmit` is clean.

---

## 1. Architecture map

### 1.1 Module graph (runtime imports; `type` imports omitted)

```
app/page.tsx ──► model/schema, model/renderer (dynamic import, l.277), model/room-labels, model/day-room,
                 components/{activity-panel, journey-panel, showcase-controls, site-map, metrics-panel (lazy)}, data/sites
app/story/page.tsx ─► story/story-experience ─► story/{director, stage, idt-panel, swimlane, data}
   story/stage ─► (dynamic) model/schema, model/renderer, story/hero-source ─► sim/story-source
story/site/main.tsx ─► story/story-experience          (standalone Vite build, vite.story.config.ts)

model/renderer.ts (2341 l) ─► assets, envelope, floor-geometry, room-labels, showcase, community-assets,
      neighborhood ─► traffic-routes ─► data/street-traffic.json
      site-context, olympic-exterior ─► envelope, alhambra-exterior, alveare-exterior ─► exterior-primitives
      activity, site-activity ─► (activity, site-activity-data ─► site-arrival-people ─► site-arrival)
      sources, community-people, community-layer ─► (community-settings, community-pads, community-vehicles, arrival)
      data/day-program.json
model/activity.ts (engine) ─► characters, arrival ─► (assets, alhambra-fleet), site-arrival, day-room, deliveries,
      fleet-crew ─► (arrival, alhambra-fleet, photo-assets, characters), data/activity-loop.json
model/assets.ts ─► photo-assets, clinical-assets, community-assets, recreation-assets
sim/index.ts (Node entry only) ─► nav, scenario, clock, metrics, trace, model/{schema, activity, arrival}
sim/scenario ─► nav, tracks, clock, model/activity, data/{care-team, day-program}
sim/metrics ─► nav, model/{activity, community-settings}; sim/trace ─► metrics, nav, clock
sim/story-source ─► tracks, model/activity, data/scenarios/day-in-the-life.tracks.json
components/metrics-panel ─► recharts, sim/{metrics, trace, clock, tracks}, (dynamic) sim/story-source
components/activity-panel ─► model/{activity, characters, arrival, day-room, community-people}
```

Layering is mostly one-directional (data → model → sim → components → page). Exceptions: `sim/metrics.ts:19` imports `model/community-settings` for a category list; `room-labels.ts:3` type-imports `renderer`; `model/community-people.ts:1489` re-exports a constant from `community-settings` purely so `activity-panel.tsx:35` can import it from a different module than `metrics.ts:19` does.

### 1.2 Data flow

```
public/models/<site>.json ──fetch──► validateFacility (schema.ts:309) ──► createViewer(model, {activity?})
app/data/activity-loop.json (167 actors, Alhambra) ─┐
app/data/scenarios/day-in-the-life.json ─► [Node] build-scenario.mjs: navGrid (sim/nav) + compileScenario (sim/scenario)
                                           └─► day-in-the-life.tracks.json ─► storyActivitySource() (sim/story-source) ─┐
renderer.ts:1009-1017   source = composeSources(options.activity ?? activityData, communitySource(model))  ◄──────────┘
activity.ts:406         source = withFleetCrew(source)      (+8 drivers, +4 riders, cabin seats)
activity.ts:454-643     per frame: sampleActor/Escort/Paired → seatInVehicle(registry) → zone PIP → pose
renderer.ts:2007        loop: activity.tick → neighborhood.tick → community.tick → doors/labels/camera → render
metrics-panel.tsx:497   computeMetrics(activityData | story.source)     ◄── NOT the source being animated (§2.1)
metrics-panel.tsx:505   traceTouchpoints(activityData | story.source)
scripts/sim-report.mjs  → public/models/sim-report.json + touchpoint-trace.json  (same raw sources)
```

### 1.3 Where the three sites diverge

| Concern | Alhambra (no `contextStyle`) | Olympic / Alveare (`contextStyle`) | Branch location |
|---|---|---|---|
| Activity source | `createActivity(…, composeSources(base, community))` | `createSiteActivity` → `buildSiteActivityData(model)` (generated from room "scenes") | renderer.ts:1010-1017; site-activity.ts:7 |
| Engine features | fleet crew, deliveries, day room, OT props, registry vans A–H | `siteSpecific: true` disables all of those | activity.ts:406-412, 460-463, 523 |
| Arrivals | `buildArrival` + `alhambra-fleet` route table (8 vans, reservations) | `buildSiteArrival` (2 vans, **Alhambra's** Van A/B timetable) | activity.ts:407-409; site-arrival.ts:2,158 |
| Site context | `buildNeighborhood` (Alhambra plan-pixel streets) | `buildSiteContext` | renderer.ts:995-996 |
| Exterior | `buildAlhambraExterior` gated on `exteriorAppearance` | `buildOlympicExterior` (gated on `contextStyle`), `buildAlveareExterior` (on `exteriorAppearance`) | renderer.ts:997-1005, each builder's line 7-12 |
| Community layer | built, composed, ticked | skipped | renderer.ts:1009, 1018-1021, 2026-2028 |
| Camera framings | hard-coded per builder presence | " | renderer.ts:1672-1685, 1723-1748, 2123-2124 |
| UI panels | Measure, Journey, program picker, Community | hidden | page.tsx:567-602, 997, 1007, 1272 |

Site identity is carried by **four** unrelated keys: `sites.ts` `id` (`alhambra`), facility `id` (`seen-alhambra-planning`), `contextStyle` (`olympic|alveare|undefined`, schema.ts:139) and `exteriorAppearance` (`alhambra-brochure|alveare-renderings`). 32 checks of these in renderer.ts, ~25 `siteId ===`/`contextStyle` checks in page.tsx.

---

## 2. Correctness bugs and likely bugs

### 2.1 High

1. **Measure/Trace do not measure what is animated.** The viewer plays `withFleetCrew(composeSources(base, community))` (renderer.ts:1016, activity.ts:406) but the panel computes metrics and the trace on raw `activityData` or raw `story.source` (metrics-panel.tsx:497-508). Metrics and trace see the raw loop's two 5-segment placeholder drivers (`driver-1`, `driver-2`) instead of the eight choreographed drivers that `withFleetCrew` substitutes (fleet-crew.ts:723, 739-752), and miss the 4 mid-day riders, the cabin seating and the whole community cast and its touchpoints. Consequences: the "Care at home & in the community" bucket (metrics.ts:59-118) is always zero in the panel; "Driving" staff time describes placeholders; the Trace person picker cannot find any community person. `sim-report.mjs:44-45,153` and `validate-trace.mjs:212-216` use the same raw sources, so the published `touchpoint-trace.json` and "everyone is traced" assertion are blind to them too. Fix: expose the composed source (`viewer.activity.data`) or build it once with a shared `buildCareDaySource(model, opts)` and feed that to metrics, trace, report and validators.
2. **Engine placement logic is duplicated and already diverges.** The per-frame placement (escort → own seat when seated → seat in registered vehicle → visibility from vehicle → ground-zone PIP) exists in activity.ts:582-604, metrics.ts:254-283 (`sampleFrame`), validate-fleet-crew.mjs:48-58 (`place`) and validate-community-traffic.mjs:203-218 (`positionAt`). `sampleFrame` has no vehicle registry and no "escort uses own seat" rule (activity.ts:587-588): seated riders would be measured at their nominal ride path and escorts at a follow point on it, not in their seats. Today this is masked only because metrics never sees seats (item 1); fixing item 1 alone would expose it. Zone rules differ too: engine reclassifies ground actors only when `!siteSpecific || arrivalVehicleId` (activity.ts:595-601) and leaves `levelId:'site'` actors in their authored zone (`community:<id>`); `sampleFrame` forces `'site'` (metrics.ts:280). One pure `placeActors(source, registry, t)` should serve all four.
3. **GLB export scripts are broken by this branch.** `scripts/export-model.mjs:100-114` and `export-additional-sites.mjs:100-114` rewrite renderer imports with a hand-maintained `.replace("from './x'")` list that lacks `./sources`, `./community-people`, `./community-layer` (added at renderer.ts:37-39). The transpiled `work/validation/renderer.mjs` imports extensionless specifiers; reproduced in a scratch copy of the same transform: `ERR_MODULE_NOT_FOUND … work/validation/sources`. `validate-activity.mjs` (README: "also exports the animated cast GLB") does not cover renderer, so no validator caught it.
4. **Olympic and Alveare reuse Alhambra's van timetable.** `site-arrival.ts:2,158` and `site-arrival-people.ts` import `vanWindows` from arrival.ts:21, the Alhambra Van A/B timetable that the driver choreography depends on (arrival.ts:18-20). This branch retimed it: Van A `unload` changed [42,108]→[42,96] and Van B [172,238]→[172,226] (`git diff 79c4758..HEAD -- app/model/arrival.ts`), so Olympic/Alveare doors and ramps now close 12 s earlier and their arrival people (site-arrival-people.ts:89) were re-timed as a side effect. The site validators still pass (run from a scratch copy), so the coupling is silent. activity-panel.tsx:23-26,113 even imports it as `siteVanWindows`. Give each site its own windows in data.
5. **Any facility without `contextStyle` gets Alhambra's world.** `createActivity` defaults to the Alhambra loop (activity.ts:402, renderer.ts:1016), `buildNeighborhood` draws Alhambra's streets from plan pixels (neighborhood.ts:76-82, 382-388), `withFleetCrew`, deliveries, the community ring and `dayProgram.removedObjectIds` (renderer.ts:1036) are applied. Opening a local spec (page.tsx:500 `openModel`) keeps `siteId` and therefore also shows Alhambra-only panels. This is the single biggest obstacle to (b).

### 2.2 Medium

6. **Validators that can pass vacuously.**
   - validate-fleet-crew.mjs:83 `assert.ok(vanIds.includes(s.vehicleId) || s.vehicleId)` — any truthy id passes.
   - validate-fleet-crew.mjs:143-186: ramp-escort checks run only when a segment is recognised as `down`/`up` by 5 cm geometric matches against hard-coded sill/foot offsets (l.152-153); there is no assertion on `totals.rampEscorts` (printed only, l.193). If FLEET_VAN_SEATS or the dock moves, the check silently covers zero descents. Ascents (`up`) never assert `seen`.
   - validate-community-traffic.mjs:316-327 compares community walkers with the center cast via plain `sampleActor` (no escort/pair/seat), and the pads are 60-100 m from the center, so the 0.55 m check is effectively only exercised at the center lot.
   - validate-trace.mjs:212-216 and the "everyone is traced" check (l.205-209) are scoped to the raw sources (see 1).
   - validate-olympic-day-spaces.mjs:48-52 and validate-olympic-exterior.mjs:17-21 compare the working-tree model with `git show HEAD:<same path>` as the "unchanged" baseline; once the edit is committed they compare a file with itself. They were one-off migration checks and are not listed in README or package.json.
   - `composeSources` (sources.ts:35) checks only first start / last end, not contiguity; the engine's `sampleActor` falls back to the last segment on gaps (activity.ts:230-231), hiding holes.
7. **Day-program rotation is global mutable module state and only cosmetic.** `activeDay` and `dayProgram.programs` are module singletons mutated by `setProgramRotation` (day-room.ts:64-83), set from the URL in page.tsx:218 before any viewer exists. The rotation re-poses station actors *after* the engine posed them (day-room.ts:305-314, a second `pose` per frame) and swaps props, but interaction titles, metrics and the trace still describe Monday's `day-<id>` sessions from activity-loop.json. A Tuesday trace says "Exercise" while the scene shows qigong. Rotation should be an input to source construction (a `SourceExtension` that retitles day interactions), not a side channel.
8. **`sampleActor` ignores the source's clock.** It wraps with the global `activityData.duration` (activity.ts:227-229) and `timelineFor` likewise (l.246-255); `createActivity` throws if a source's duration differs (l.404-405). Fine today; it makes "another clock" (24 h home-care day, multi-day twin) impossible without touching every sampler. `programAt` hard-codes 720 (day-room.ts:91), as do 18 other files (`% 720`, `LOOP = 720`, `CLOCK_END = 720`, `FLEET_LOOP = 720`).
9. **Paired actors play their partner's timing, not their own.** `samplePairedActors` indexes the staff track by the *participant's* `segmentIndex`/`fraction` (activity.ts:370-392) and caches the coordination by the staff segment only (l.300-303, 362). Both pairs in activity-loop.json (`aide-escort`/`member-escort`, `physical-therapist`/`member-pt`) have equal segment counts but different boundaries — up to 15.84 s apart for the aide (checked with node). The engine, metrics and trace follow the partner's timing, while the activity panel's track view uses the staff member's own segments via `timelineFor` (activity.ts:243), so its stage times disagree with what is animated. Validate alignment (or derive the staff track from the partner's) in `validateSource`. The first call per segment also runs a 161×161×3 DP inside a frame.
10. **Hidden community actors are hidden after the engine ran.** renderer.ts:2026-2028 sets `a.root.visible=false` after `activity.tick`, so `arrival.tick` door logic (activity.ts:650-658) and `getState().count` (l.545) still see them; `followActor` can follow an invisible person. Push `community` visibility into `updateView`.
11. **Three clock-label implementations.** `activity.dayTime` (activity.ts:236), `sim/clock.clockLabel` (clock.ts:50) and `story/data.clockLabel` (data.ts:101, adds `+1e-6` before flooring). They can disagree by a minute at boundaries; clock config also exists three times (activity-loop.json, `CARE_DAY` clock.ts:12, `scenario.clock`).
12. **Delivery trucks snap 45° and pivot when leaving.** The dwell pose has heading π (deliveries.ts:34) but the departure spline starts toward `[x+0.8, z+0.8]` then `[x+5, z]` (l.51-57): measured with three.js, the heading jumps 45.0° at the instant of departure and the path's minimum turn radius is 0.76 m for a 4.7 m truck. validate-traffic checks nose-first/turn rate only for the 8 vans (validate-traffic.mjs:101), so it passes.
13. **The /story viewer also builds the community layer and the fleet crew.** `stage.ts:57` calls the same `createViewer` with the Alhambra model, so `renderer.ts:1009` composes `communitySource()` into the story source. The story now animates two "Mrs. Lin" actors on one clock: hero `hero-lin` (cane) at the center and `home-participant` "Mrs. Lin · at home" (walker, community-people.ts:289-295) who boards a van at home at 9:15 and sees a cardiologist at 10:17–10:42 while the hero is in the clinic (step `clinic`, 140–185 s ≈ 9:33–10:03). The story's director, overlays and camera shots predate the layer and never set `community: false`. Either pass `{ community: false }`/a layer list from the story or make the community Mrs. Lin the same person as the hero.
14. **Composed sources are rebuilt per viewer.** `communitySource(model)` (1,256 lines of track building with vehicle sampling) and `withFleetCrew` run on every `createViewer` (renderer.ts:1009-1016, activity.ts:406); `storyActivitySource()` is memoised (story-source.ts:16-24) but the composed result is not, and the panel cannot reach it (item 1). Memoise `buildCareDaySource(model, options)` by model and options.

### 2.3 Low (performance, leaks, React)

15. **Per-frame linear scans** in the engine tick: `groundZones.find(inside…)` per actor (activity.ts:600), `model.zones.find` per actor (l.604), `levelY` → `model.levels.find` per actor (l.466, 605), and `data.interactions.find` *inside* `pathRoot.children.forEach` — recomputed once per path line though it does not depend on the line (l.660-664; ~180+ lines × ~70 interactions per frame). In renderer `loop`: `activity.getState()` called 5×/frame, each allocating and running `actors.filter(visible)` (renderer.ts:2024-2063, activity.ts:542-548); `basePosition` does two finds per zone per frame (l.1403-1413); `center(z.polygon)` recomputed per frame (l.2068); for contextStyle sites `furnitureRoots.filter(planDoor)` + `getObjectByName` + `getWorldPosition` allocation per door per frame (l.2029-2056). All cheap to hoist into maps built once.
16. **Double `update()` per UI action.** Handlers call `setState(next)` and `viewer.current.update(next)` (page.tsx:113,137,167,340,453,476,496) and the effect at page.tsx:325 calls `update(state)` again. `update()` sets `needsUpdate = true` on every floor material each call (renderer.ts:1583) and rebuilds the room-outline geometry when a room is selected (l.1641-1647).
17. **Disposal gaps.** GLTF custom assets: `g.clear()` drops the batched placeholder without disposing its geometry (renderer.ts:1084). `buildArrivalVan` and the stall painter create a new `MeshStandardMaterial` per box (arrival.ts:165-167, 235-238) — ~200 uncached materials for 9 vans; they are disposed by traversal but defeat material batching. Module-level shared character materials (`clay`, `aids`, characters.ts:543-580) are disposed by every viewer's `dispose()` and silently re-uploaded by the next viewer — works in three r186, but is fragile. A recording in progress at dispose resolves later and calls `renderer.setPixelRatio`/`resize()` on a disposed renderer (renderer.ts:1969-1980).
18. **`preserveDrawingBuffer: true`** on the main renderer (renderer.ts:462) costs fill-rate every frame; `snapshot()` already renders right before `toDataURL` (l.2194-2197), so it is unnecessary.
19. **Viewer effect reads stale state by design.** page.tsx:273-324 depends on `[model]` but reads `state` (l.307, 313); the `[]` effect at l.214-251 calls `selectSite` from render scope inside `queueMicrotask`. Works, but the repo's own oxlint config flags both (exhaustive-deps at page.tsx:220, 305, 329); make the intent explicit with refs.

### 2.4 Heading conventions (checked; consistent but undocumented)

People face local **+z** (`heading = atan2(dx, dz)`, activity.ts:211). Fleet vans, site vans, deliveries and community vehicles put the nose at local **−z** and use `atan2(dx,dz)+π` (alhambra-fleet.ts:504, site-arrival.ts:178, deliveries.ts:69, community-vehicles.ts:658,715). Street cars use nose **+z** with no `+π` (traffic-routes.ts:57, headlights at z=+1.955 in neighborhood.ts:376). `vehicleGap` is symmetric so clearance is unaffected; riders therefore need `seatHeading: π` (fleet-crew.ts:227, community-people.ts:187). The vehicle-local→world transform is written out 6 times (activity.ts:132 `seatInVehicle`, community-vehicles.ts:723 `seatWorld`, :736 `vanRampWorld`, community-people.ts:212-220, fleet-crew.ts:96-104, validate scripts). No bug found, but a `VehicleFrame` helper with one documented convention would remove the class of error.

---

## 3. Modularity and design smells

### 3.1 God files and god functions

| File | Lines | Largest unit | What is fused together |
|---|---|---|---|
| model/renderer.ts | 2341 | `createViewer` closure, l.451-2341 (1890 l) | palette (l.54-112), procedural textures, GTAO/denoise post pipeline (l.194-449), building geometry, site/exterior selection, activity + community wiring, `update()` (l.1414-1652), camera framings per site, picking, tilt-shift, video recording, GLB export (l.2199-2290), disposal |
| model/characters.ts | 1975 | `createCharacter`, l.581-1975 (1395 l) | mesh lofting, rig, wardrobe, every pose/action, clip export |
| page.tsx | 1698 | `Home`, l.65-1698; 22 `useState` | URL routing, site switching, viewer lifecycle, every panel and modal, site-specific copy |
| sim/scenario.ts | 1529 | `compileScenario`, l.488-1151 (663 l) | placement, scheduling, companions, meetings, interactions |
| model/community-people.ts | 1489 | `communitySource`, l.232-1488 (1256 l) | a whole day's cast authored imperatively (22 `new Track`, ~240 hard-coded loop-second literals) |

`oxlint` with the repo's own `.oxlintrc.json` reports 37 errors (exhaustive-deps ×5, react-compiler ×6 incl. refs read during render page.tsx:828-829,992, setState in effect page.tsx:339, floating promise page.tsx:277, unused imports). There is no CI and `npm run lint` is not part of any validation list.

### 3.2 Duplicated primitives and helpers

- `box` helper declared in 16 files (arrival.ts:71 and :226, assets.ts:19, clinical-assets.ts:71, community-assets.ts:28, community-pads.ts:73, community-vehicles.ts:781, day-room.ts:117, deliveries.ts:88, exterior-primitives.ts:26, neighborhood.ts:65, olympic-exterior.ts:48, photo-assets.ts:75, recreation-assets.ts:49, renderer.ts:743, site-context.ts:15); `mat`/material caches in 10; `rod`/`cyl` in 13. `exterior-primitives.ts` was meant to be the shared kit but only alhambra/alveare exteriors use it; olympic-exterior.ts re-declares its own (l.35-64).
- Point-in-polygon ×4 in app (activity.ts:151, room-labels.ts:14, site-activity-data.ts:226 `insideRoom`, sim/nav.ts:85 `insidePolygon`) plus validate-fleet-crew.mjs:24 and validate-olympic-day-spaces.mjs:17. `facing`/`headingAlong` ×4 (fleet-crew.ts:130, community-people.ts:60, scenario.ts:243, site-arrival.ts:107). Centroid ×2 (schema.ts:304 `center`, director.ts:534).
- Vehicle-local→world transform ×6 (§2.4). Drive easing ×3 (`driveProgress` alhambra-fleet.ts:436, community-vehicles.ts:646, `streetTripProgress` traffic-routes.ts:41). Door/ramp smoothstep windows ×3 (alhambra-fleet.ts:630-641, site-arrival.ts:192-203 — a verbatim copy, community-vehicles.ts:662-674 with different timings). Catmull-Rom route curves built in 5 modules.
- Track/segment builders ×4: `Track` class (community-people.ts:84-210, private), `segment`/`stay` (fleet-crew.ts:115-230), `newBuilder`/`stay`/`walk` (scenario.ts:418-461), and site-arrival-people.ts.
- Clock label ×3 and clock constants ×3 (§2.2 item 11); `% 720` or a local `720` constant in 18 files although `CARE_DAY`/`wrapLoop` exist (clock.ts:12,18; `wrapLoop` has no callers).
- TS→Node compilation ×5: regex transpile (compile-model-modules.mjs), per-script transpile loops (validate-additional-sites.mjs:15-23, validate-public-assets.mjs:23-29), regex-patched renderer (export-model.mjs, export-additional-sites.mjs), and Rolldown (`loadSim`, build-scenario.mjs:22). Only Rolldown resolves imports correctly; the others break whenever an import is added (§2.1 item 3).

### 3.3 Site-specific branching inside generic modules

- `contextStyle`/`exteriorAppearance`/builder-presence checks: 32 in renderer.ts (e.g. l.995, 1009-1017, 1337 Olympic-only furniture instancing, 1535, 1571, 1672-1685, 1726-1744, 2029-2056, 2123-2124); binary `olympic ? … : alveare` in site-activity-data.ts:313-314,553,569, site-context.ts:176, site-arrival.ts:9-60 (a fourth site would silently get Olympic's arrival layout and Alveare's scenes); room-labels.ts:74.
- Alhambra ids/coordinates in generic code: OT props at (−24.34, 0.76, 15.25) in the engine (activity.ts:523-534); `'fleet-van-a'|'fleet-van-b'` asset ids in the render loop and export (renderer.ts:2058, 2270) and page.tsx:174; `dayProgram.removedObjectIds` applied to every model (renderer.ts:1036); zone `'adjacent'` excluded in metrics (metrics.ts:239); `navGrid(model)` defaults to Alhambra's day-program stations and the screen at (−7, 9.72) (nav.ts:115-131, duplicated in day-room.ts:166); `delivery-` id prefix and `'Delivering'` title test in the engine tick (activity.ts:620-623).
- The Alhambra entrance door (−14.653, −0.992) is hard-coded in 8 places (arrival.ts:11, fleet-crew.ts:70, activity-loop.json, tracks.json, build-activity.py, populate-day-center.py, validate-model.mjs, validate-day-life.mjs) instead of read from the facility's door object. Street lanes −30.7/−34 and 39.4 are repeated across traffic-routes.ts, alhambra-fleet.ts:103 and community-vehicles.ts:71-80.
- fleet-crew.ts keys choreography on segment titles (`'Unload on van ramp'`, `'Walk to reception'`, l.754-755); validate-traffic keys reversing on `phase.startsWith('Reversing')`. Titles are UI copy; use explicit `kind` fields.

### 3.4 Data in TS that should be data (and the reverse)

Should be JSON/registry data: site configs (sites.ts plus camera framings in renderer, arrival layouts in site-arrival.ts, scenes in site-activity-data.ts:54-219, van timetables arrival.ts:21-42 / alhambra-fleet.ts:20-41, extra-run requests alhambra-fleet.ts:69-74, bays l.9-16); care settings (community-settings.ts, already "registry-shaped" but authored as TS `define()` calls), community vehicle itineraries and the community cast (≈2,300 lines of TS that are really a schedule); `MIDDAY_RIDERS`/`DRIVER_NAMES` (fleet-crew.ts:47-63); the presentation palette (renderer.ts:54-112); panel views/categories/colour maps (activity-panel.tsx:38-91, duplicated in part by `COMMUNITY_CATEGORIES`).

Should be generated, not hand-maintained: `activity-loop.json` (32,598 lines) is the accumulated output of six in-place mutators (build-activity.py, populate-day-center.py, expand-alhambra-activity.py, add-delivery-people.py, reroute-day-passage.py, place-community-cast.mjs) and is now the source of truth; re-running the first of them would discard the rest (README acknowledges this). `day-in-the-life.tracks.json` is a compiled artifact but `build:scenario --check` never compares it with a fresh compile (build-scenario.mjs:285-289), so staleness is not detected. `public/models/{activity-loop,day-program,…}.json` are copies of `app/data` kept equal by an assertion (validate-model.mjs:11-21) instead of being copied at build. The facility format has three hand-kept definitions: TS types (schema.ts), `validateFacility` (schema.ts:309) and the JSON Schema generator (create-json-schema.mjs); the published `facility.schema.json` already lacks `contextStyle`, `exteriorAppearance`, `floorOpenings` and `verticalConnections`. `prebuild` (`prepare-public-models.mjs`) rewrites tracked files in `public/models` in place and moves files out of `public/reference` — a build with side effects on the working tree.

### 3.5 Unused code, dependencies and stale artifacts

- `components/ui/*` (60 shadcn components), `hooks/use-mobile.ts`, `lib/utils.ts`: zero imports from `app/` or `story/`. Dependencies used only by them or by nothing: `@base-ui/react`, `@shadcn/react`, `class-variance-authority`, `clsx`, `cmdk`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-resizable-panels`, `tailwind-merge`, `date-fns` (0 imports anywhere), `tw-animate-css` (not imported in globals.css), `shadcn` (a CLI, listed as a runtime dependency). `globals.css:3-6` adds `@source` for `components/`, `hooks/`, `lib/`, so Tailwind still scans the unused UI kit. The app itself uses hand-written CSS classes (3,492-line globals.css). `recharts` and `lucide-react` are the only UI deps in use. `next.config.ts` is an empty config read by vinext; harmless.
- Exported but unused: `wrapLoop`, `loopToMinutes`, `minutesToLoop`, `clockToLoop`, `parseClock` (clock.ts), `routeBetween`, `roomAt`, `isClear`, `simplify` (nav.ts), `turnArc`, `turnInto`, `turnOutOf`, `arcPath`, `legPoint` (community-vehicles.ts), `toLocal`, `lanePath`, `isPaved`, `serviceLabels` (community-settings.ts), `offsetBehind` (community-people.ts), `fleetLegs`, `FLEET_LOT` (only internal), `resolveRotation`, `characterProfile`, `handoffAt`, `assetUrl`, `hasWebGL`, `activityViews` (no external importers).
- Stale: `seen-alhambra-2024.json` (665 KB) and `seen-alhambra-planning-base.json` (701 KB) are published but only Python scripts read them; the published `seen-alhambra-planning.glb` (24 MB) was last regenerated at 79c4758, before this branch rewrote the fleet van body (photo-assets.ts, +187/−141), and cannot currently be regenerated (§2.1 item 3). `story/hero-source.ts` is a one-line re-export kept for a migration that has happened (docs/STORY.md "replace its body… once the itinerary lands"). Three "journey" models coexist: `care-journeys.json` (guided, not linked to tracks; its transport scene only frames `fleet-van-a/b`), scenario steps, and the community cast.

---

## 4. Extensibility assessment

### 4.1 What it takes today

**(a) Partner adult day care centers.** A partner ADC exists only as a schematic pad (`partner-adc`, community-settings.ts; `buildPartnerAdc` community-pads.ts:616) with a hand-scripted tai-chi group. To add a real partnership: a van itinerary in community-vehicles.ts (TS legs with loop-second literals), riders and staff in community-people.ts (imperative `Track` calls, keeping ≥0.6 m spacing by hand), interactions with a new category in `COMMUNITY_CATEGORIES`, and — if the partner's interior matters — a full facility JSON, which then needs a `contextStyle` value, an arrival layout, scenes and camera framings added to the branches in §3.3. Shared participants are impossible to express: two tracks with the same person have no shared identity (staff have `profileId`, participants do not). **Missing:** Setting abstraction that can be either a schematic pad or a full facility; person identity across settings; per-setting program/timetable data.

**(b) Replicate another building from designs.** The facility JSON path is the strong part (schema 2.0, `validateFacility`, rooms/zones/objects). Everything around it is per-site code: Python generators that need private sources (build-additional-sites.py, refine-site-rooms.py, trace-site-openings.py) followed by hand edits; a bespoke 200-700-line exterior builder per site; new union members in `contextStyle` (schema.ts:139); edits to site-context.ts, site-arrival.ts, site-activity-data.ts, room-labels.ts, renderer camera framings, sites.ts and ~25 `siteId` checks in page.tsx. A building without `contextStyle` inherits Alhambra's cast, fleet, neighborhood and community (§2.1 item 5). **Missing:** a data-driven SiteConfig; parametric exterior and context descriptions (facade bays, canopy, parapets, street edges) instead of hand-placed boxes; a generic cast generator (the room-"scenes" generator in site-activity-data.ts is the right seed) that works for any facility.

**(c) Network of facilities plus distributed care.** The community layer is a good prototype of the *local* scale (registry → pad builder by kind, vehicle registry, `SourceExtension` composition, `community:<id>` zones, camera `frame()`), but it is welded to Alhambra's frame: lanes `RING` (community-vehicles.ts:71-80), `CENTER_LOT`, a street extension, pads within ±100 m, and a shadow box widened to ±130 m in renderer.ts:1610-1625. The three real centers are miles apart (sites.ts lat/lng), so a network cannot share one metric scene. Home care for many participants, after-hours (24 h) support and multi-day hospital episodes do not fit the 8 AM–4 PM 720 s loop, which is hard-coded in 18 files. **Missing:** a two-scale model (map-scale network view with projected lat/lng and route polylines; local-scale setting view), a clock that can span 24 h and multiple days, generators for home visits instead of hand-authored tracks.

**(d) Digital twin tracing every touchpoint.** `trace.ts` is a good seed: deterministic, documented schema, per-person journeys, export. Gaps: it traces raw sources, not what is animated (§2.1 item 1); events are *derived* from sampled tracks at 1–2 s, so interactions are quantised and handoffs inferred; time is loop seconds, not timestamps; no `settingId`, provenance (planned/simulated/observed) or stable person id. The /story viewer animates two different "Mrs. Lin" actors at once — the story hero `hero-lin` (cane) at the center and the community `home-participant` labelled "Mrs. Lin · at home" (walker, community-people.ts:289-295) boarding a van at home at 9:15 and seeing the cardiologist 10:17–10:42 while the hero is in the clinic (scenario step `clinic`, 140–185 s ≈ 9:33–10:03). Nothing detects that a person is in two places. **Missing:** a person/entity registry, an event log as the primary record (tracks derived from events, the scenario compiler already does this), provenance and absolute time.

### 4.2 Target chassis

```
app/chassis/
  clock.ts            CareClock {start, duration, minutesPerSecond, days}; the only place 720/480 appear
  ids.ts              PersonId, SettingId, VehicleId, SiteId (branded strings); person registry (profiles)
  geom/
    polygon.ts        pointInPolygon, centroid, area, distanceToSegment
    frame.ts          LocalFrame {position, heading}: toWorld/toLocal; documented convention
                      (people face +z; vehicle noses −z; street cars migrated to the same)
    primitives.ts     box/rounded/cyl/rod/ball/beam + MaterialCache(palette) — replaces 16 local helpers
  engine/
    source.ts         ActivitySource, SourceExtension, composeSources, validateSource (contiguity,
                      pair alignment, vehicle ids, interaction actors)
    sample.ts         sampleActor/Escort/Paired + placeActors(source, vehicles, t) → Placement[]
                      (single implementation used by renderer, metrics, trace, validators)
    vehicles.ts       VehicleDef {id, body, seats, frame, legs: (drive|dwell)[], doors, ramp};
                      sampleVehicle(def, t); Reservation scheduler (fleetReservations generalised)
    track.ts          Track builder (from community-people.ts) used by every cast author
    activity.ts       three.js binding only: characters, path lines, tick → placeActors
  sites/
    types.ts          SiteConfig {id, name, geo, modelUrl, context, exterior, arrivals {layout, timetable},
                      cast {kind:'loop'|'scenes'|'scenario', file}, program?, layers[], camera, ui}
    registry.ts       loads app/data/sites/*.json; replaces sites.ts + contextStyle + exteriorAppearance
  layers/
    layer.ts          interface Layer { id; build(ctx: {model, site, mat, vehicles, clock}):
                        {root, tick(t), dispose(), sources?: SourceExtension[], vehicles?: VehicleDef[],
                         framings?: Record<string, Framing>} }
    street-context.ts site-context.ts exterior-*.ts fleet.ts site-arrival.ts deliveries.ts
    day-room.ts community.ts      (existing builders wrapped, then simplified)
  scenarios/
    library.ts        scenario registry (day-in-the-life, partner-adc day, discharge episode, home-care route)
    compile.ts        current scenario.ts, generalised to any site's nav grid and settings
  trace/
    event.ts          TouchpointEvent + {settingId, personId, at (ISO), provenance}
    derive.ts         current trace.ts over placeActors
    compare.ts        planned vs observed per person/zone/discipline
app/data/sites/*.json  app/data/settings/*.json  app/data/vehicles/*.json  app/data/scenarios/*.json
app/viewer/            renderer split: materials.ts, post.ts, building.ts, camera.ts, picking.ts,
                       recording.ts, export.ts, viewer.ts (createViewer composes these + site.layers)
```

Boundaries: `chassis/*` imports no three.js except `geom/primitives` and `engine/activity`; `sim/metrics`, `trace`, scripts and tests import only pure modules; `viewer/` never branches on a site id — it iterates `site.layers` and reads `site.camera`.

### 4.3 Migration order (app works after every step)

1. **Correctness first:** pass the composed source to Measure/Trace/report/validators; fix the GLB exporters by bundling with `loadSim` (Rolldown) instead of regex patching; per-site van timetables; delivery departure fix. Add `npm test` + CI (§5).
2. **Golden outputs:** snapshot `sim-report.json`, `touchpoint-trace.json` summaries and a per-actor placement hash at 1 s for each site's source. Every later refactor must keep them byte-identical unless a step says otherwise.
3. **Pure helpers:** create `chassis/geom` and `chassis/clock`; replace the five PIP copies, six frame transforms, three clock labels and `% 720` literals. Goldens unchanged.
4. **`placeActors`:** one placement function; engine tick, `sampleFrame` and both validators call it. Goldens change once (drivers/riders/community now measured) — review and re-baseline.
5. **SiteConfig registry:** JSON for the three sites holding today's values (camera framings, arrival layouts, timetables, scenes, removedObjectIds, feature flags). Replace `contextStyle`/`exteriorAppearance`/`siteId` checks with config reads; keep reading `contextStyle` as a fallback key. A new site becomes a JSON file plus (optionally) an exterior spec.
6. **Layer interface:** wrap existing builders unchanged; renderer builds `site.layers`. Then split renderer.ts along the `app/viewer/` lines and page.tsx into a `useViewer` hook plus panel components.
7. **Vehicles:** migrate deliveries → site arrivals → community vehicles → Alhambra fleet to `VehicleDef` one at a time, with validate-traffic/validate-community/validate-fleet as regression.
8. **Data out of TS:** shared primitives; community settings/vehicles/cast and fleet requests to JSON; `Track` builder in `engine/`; day-program rotation as a `SourceExtension`.
9. **Twin:** person registry and provenance in the trace; scenario compiler emits planned events; then the two-scale network view and a 24 h/multi-day clock.

---

## 5. Test and validation gaps

**Covered today (19 validators, ~450 assertions):** facility schema, geometry and published-copy equality (validate-model); layout, interior, room-review, Olympic day spaces/exterior, additional sites; site activity and arrivals; base-loop structure and cast export (validate-activity); vehicle clearance at 50 Hz (validate-traffic); driver/rider choreography (validate-fleet); community vehicles and cast (validate-community); story compile with wall clearance, continuity and dwell (build:scenario); trace structure, determinism and file freshness (validate-trace); day-program rotations; public-asset hygiene.

**Missing or weak:**
- No runner, no `npm test`, no CI; README lists 14 commands to run by hand. Lint fails (37 errors) and is not run.
- Orphaned validators: validate-activity, validate-interior, validate-layout, validate-room-review and the two Olympic ones are in neither README's list nor package.json (validate-interior, validate-layout and validate-room-review pass when run from a scratch copy; validate-activity writes the cast GLB into `public/models`, so it was not run).
- The source the viewer actually animates — `withFleetCrew(composeSources(base|story, community))` — is validated nowhere as a whole: validate-fleet uses crew without community, validate-community uses community without crew, validate-trace/sim-report use neither.
- Placement parity between engine and metrics/trace is untested (and currently wrong, §2.1 item 2).
- Turn-rate bound in validate-traffic is 25° per 0.02 s (1,250°/s, l.75), far too loose to catch hairpins, and only the 8 fleet vans are checked (l.102); delivery trucks snap 45° at departure and turn at 0.76 m radius (deliveries.ts:51-57; computed with three.js) without failing. validate-community's "radius ≥ 5 m over 3 m of travel" is the right metric; reuse it for every vehicle.
- Vacuous assertions in validate-fleet (§2.2 item 6); no assertion that expected counts (ramp escorts, drivers, riders) are reached.
- `build:scenario --check` does not compare the compiled tracks with the committed file.
- No renderer smoke test: `createViewer` for each site with the headless stub that export-model.mjs already contains would have caught §2.1 item 3; no disposal/leak check.
- Rotation days are validated for data shape (validate-day-program) but not for downstream consistency (titles, trace).
- No unit tests for the pure core: clock, `composeSources`, `seatInVehicle`, `sampleSegment`, `fleetReservations`, `coordinatePair` alignment, `scheduleChain`.

**Minimal node:test harness.** `scripts/test.mjs` bundles `test/*.test.ts` with the existing `loadSim` (Rolldown; three external) into `work/test/` and runs `node --test work/test`. Assert:
1. For every viewer source (Alhambra base, story, Olympic, Olympic option, Alveare, each composed with crew/community exactly as the renderer does): unique actor/interaction ids; segments contiguous 0→duration; `heights.length === path.length`; no teleport except into/out of a registered seat; every `vehicleId` registered; every interaction actor exists; paired actors have aligned segment arrays.
2. Placement parity: engine placement equals `sampleFrame` (later `placeActors`) at 200 seeded times.
3. Clock: `dayTime(t) === clockLabel(t) === story clockLabel(t)` for t ∈ [0, 720) step 0.25.
4. Frames: `toLocal(toWorld(p)) ≈ p`; for every registered vehicle at 50 Hz, motion direction · nose direction > 0.97 unless the phase kind is `reverse`; path curvature radius ≥ body-specific minimum; no heading jump > 5° between samples.
5. Metrics: per-participant and per-staff seconds sum to the duration; community bucket > 0 for the Alhambra composed source; drivers have driving time.
6. Trace: deterministic; every animated actor traced; golden summary per site; a rotation day retitles day-room interactions.
7. Freshness: compiled tracks deep-equal the committed tracks; `public/models` copies equal `app/data`; published trace current.
8. Site independence: Olympic/Alveare van samples do not change when Alhambra timetables change (after decoupling).
9. Renderer smoke: headless `createViewer` per site builds, ticks 10 frames, `dispose()` leaves no listeners and disposes every geometry/material created.

---

## 6. Top 10 recommendations (impact ÷ effort)

1. **Measure what is animated** — feed the composed source (`viewer.activity.data`, or a shared `buildCareDaySource`) to Measure, Trace, sim-report and validators. High impact, ~1 day.
2. **Fix and protect GLB export** — bundle renderer with `loadSim` instead of regex import patching in export-model/export-additional-sites; add a headless renderer smoke test; regenerate the stale GLBs. High, ~0.5 day.
3. **Add `npm test` + CI** (tsc, oxlint clean, all validators, node:test harness in §5); fix the vacuous fleet assertions and the 1,250°/s turn bound. High, 1–2 days.
4. **One `placeActors`** shared by engine, metrics, trace and validators; delete the three re-implementations. High, 1–2 days.
5. **Decouple sites from Alhambra** — per-site van timetables, remove Alhambra defaults (loop, neighborhood, removedObjectIds, nav reservations) from the no-`contextStyle` path. High for (b), ~2 days.
6. **SiteConfig registry (JSON) + Layer interface** replacing `contextStyle`/`exteriorAppearance`/`siteId` branches and per-site camera code. Highest leverage for (a)–(c), ~1 week.
7. **Shared geometry kit** (`polygon`, `frame`, `primitives` + material cache, clock helpers); delete ~16 `box`/10 `mat`/5 PIP copies and `% 720` literals. Medium, 2–3 days, mechanical.
8. **VehicleDef abstraction** (legs, easing, door/ramp windows, seats, reservations) unifying fleet, site arrivals, deliveries, community; fix the delivery 45° departure snap. Medium-high, ~1 week.
9. **Person registry and trace v2** (stable person ids, `settingId`, provenance, absolute time); resolve the duplicate Mrs. Lin; make day-program rotation a source transform. Medium-high for (d), ~1 week.
10. **Prune and split** — remove unused shadcn kit and deps, archive retired Python mutators, split renderer.ts/page.tsx along the §4.2 lines, move community cast/vehicles to data. Medium, ongoing.
