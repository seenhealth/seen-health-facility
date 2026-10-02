# Distributed care around the center

Seen Health does not only care for people inside the Alhambra building. The
same care team runs home care with personal care aides, home health visits,
pharmacy pill-pack delivery, home-delivered meals, home modifications, escorted
specialist appointments, hospital admissions with discharge coordination and a
24/7 nurse line, joined by door-to-door transport. The model builds those
settings *around* the center, in the same scene, on the same 720 s care-day
clock and with the same engine and presentation palette, so it reads as one
distributed care system. Everything is data first: a partner adult day center
or a second Seen center is another registry entry, and a pad can carry a real
facility specification instead of schematic massing (a *facility instance*):
the partner adult day center is a small adult day health care center of its
own, stamped on its pad with its own generated cast, and so is the Wongs' home.

Everything here is illustrative. Pads sit on the paper ground beyond the ring
streets, massing is schematic and timings are compressed onto the care-day
clock; no participant records are used.

## Files

| File | Role |
| --- | --- |
| `app/model/community-settings.ts` | The registry (`careSettings`): kind, name, position, heading, pad size, access road, horseshoe drive, anchors, services, accent, and the optional stamped `facility`. Frame helpers (`toWorld`, `lanePath`, `lanePose`, `groundYAt`), the generated instance summaries (`instanceRooms`, `instanceFootprint`, `missingInstances`). No three.js. |
| `app/model/community-pads.ts` | `buildCareSetting(setting, mat, { massing })`: plinth, drive band, stub and sidewalk, label plate, the building `massing` and the `site` around it (trees, planting, benches) per kind. |
| `app/model/facility-instance.ts` | `buildFacilityInstance(facility, frame, options)`: any schema 2.0 facility as a static cutaway with room plates, merged by material; `instanceSelection` (what is drawn), shared with build-time navigation; `standingSurfaces` (stages, risers, ramps and steps people stand on, from an asset's `parameters.standing`). Knows nothing of settings or sites. |
| `app/model/community-track.ts` | The hand-authored `Track` builder (`hold`, `walk`, `hidden`, `ride`; `start` and `segmentsTo` for legs that fill holes). |
| `app/model/instance-cast.ts` | `placeInstanceCast(setting, cast)`: a generated cast into world actors and interactions; `fillHoles` stitches hand-authored legs into a scheduled person's track. |
| `app/sim/community-cast.ts` | Build time only: instance navigation options and view, the summary, the site checks, the cast generator `communityCastFromScenes` and its validator `checkInstanceCast`. |
| `scripts/build-community-tracks.mjs` | `npm run build:community` / `npm run validate:community-tracks`: writes and checks `app/data/community-instances.json` and `app/data/community-casts.json` from `app/data/community/<setting>.cast.json`. |
| `app/model/community-vehicles.ts` | `communityVehicles` itineraries (dwell/drive legs) with each vehicle's name, roof decor and livery, `sampleCommunityVehicle(id, time)` pure samplers (with the fade at the map edge), `registerCommunityVehicles(registry)` (the samplers under their names), lane and turning helpers, car and ambulance bodies. |
| `app/model/community-people.ts` | `communitySource(model)`: the hand-authored cast, the placed instance casts (with `HOLE_LEGS`), touchpoint interactions, the setting zones with their instance rooms and the `community` view as a `SourceExtension` composed into the care-day source. |
| `app/model/community-layer.ts` | `buildCommunityLayer(model, mat, { loadFacility, materialFor })`: pads, facility instances (`instance(id)`, `ready`) and vehicle bodies, `tick(time)`, `frame(settingId?)` camera framings, the network `bounds` / `shadowExtent` and `dispose()`. |
| `app/model/alhambra-source.ts` | `alhambraSource(model, base)`: the care day exactly as the viewer plays it (base loop + community layer + fleet crew), and `alhambraVehicles()`, pure samplers under the engine's vehicle ids. |
| `scripts/validate-community-traffic.mjs` | `npm run validate:community`: clearance, driving and cast checks (below). |
| `public/models/seen-home-wong.json` | The Wongs' home as a schema 2.0 facility specification (below), for the `home-wong` pad. |
| `app/model/home-assets.ts` | `buildHomeAsset(spec, material)`: bed, nightstand, wardrobe, kitchen range, grab bars, swing-up bar, bed rail, hospital bed and ramp kinds, called first by `buildAsset`. |
| `app/data/community/home-wong.cast.json` | The Wongs' ADL day inside the home, the input of the instance cast pipeline (below). |
| `scripts/validate-home.mjs` | `npm run validate:home`: the home's plan, assets, registry frame and cast. |
| `public/models/seen-partner-adhc.json` | The partner adult day health care center as a schema 2.0 facility specification (below), for the `partner-adc` pad. |
| `scripts/build-partner-adhc.mjs` | Writes `seen-partner-adhc.json` deterministically from its constants (`--check` compares instead). |
| `app/model/adhc-assets.ts` | `buildAdhcAsset(spec, material)`: stage platform, ramp and steps, backdrop, choir risers, lectern, piano and bench, banquet table and chair, dance floor, lantern post, bingo flashboard and caller's stand, calligraphy table, brush stand, easel, drying rack, scroll display, whiteboard, recumbent bike, band wall, practice stair and reception desk kinds, called by `buildAsset` after the home kinds. |
| `app/data/community/partner-adc.cast.json` | The partner center's day, the input of the instance cast pipeline (below). |
| `scripts/validate-partner-adhc.mjs` | `npm run validate:partner-adhc`: the center's program, plan, access, assets, registry and cast contract. |

Wiring: `alhambraSource(model, base)` composes the Alhambra care day once,
`withFleetCrew(composeSources(base, communitySource(model)))`, memoised per base
loop. The renderer, the Measure panel (metrics and trace), the story scenario
(`composedStorySource`), `scripts/sim-report.mjs` and `scripts/validate-trace.mjs`
all read it, so every count, trace and report describes the people the scene
animates (228 in the base loop: the center's 167, the fleet crew's 10 and the
community's 51, of whom 39 are generated inside facility instances: 33 in the
partner day center and 6 in the Wongs' home). When
the played source carries the `community` view, `renderer.ts` passes
`registerCommunityVehicles` to `createActivity` (which rejects a seat in an
unregistered vehicle), builds the layer, ticks it, sizes the sun's shadow
camera from the network's bounds while the layer is visible, and exposes
`focusSetting(id?)` and `view('community')`.

`ViewerState.community` (default on, the **Community sites** toggle under
Layers) shows or hides the layer. The pads live in the site context, so they
also hide with **Street & parking context** and stay out of Plan. The engine
hides the layer's people through its view (`hiddenSources`, matched against
`ActorSpec.sourceId`), so the activity panel's people count (the snapshot's
`people`: 228 with the layer, 177 without), walking-path lines and follow
targets follow the toggle; site-level people (the community cast and the fleet
drivers) show only with the site context, at every level.

The activity panel lists the new touchpoint categories. `computeMetrics` and
the sim report (`npm run sim:report`) fold them into one participant bucket,
"Care at home & in the community", and the trace summary counts participants
with a community touchpoint. The settings are zones of the composed source
(`ActivityData.zones`, `community:<id>`), so occupancy and the trace name them
(a setting with a facility by its `traceName`, e.g. "Partner ADC"); the zone
carries the instance's rooms (`SourceZone.rooms`), so trace `enter` events
read "Partner ADC · Studio" inside them. On-site counts and
staff time by role cover the center.

## The registry

```ts
export type CareSetting = {
  id: string; kind: SettingKind; name: string; subtitle: string;
  short: string;                             // 'Partner ADC', 'Home': trace room names, badges
  traceName?: string;                        // zone name in the trace and Measure (default name)
  position: Vec2; heading: number;
  pad: { w: number; d: number; back?: number }; // back: extends behind the origin
  road: { from: Vec2; to: Vec2 };            // stub centre-line, street edge → pad edge
  drive: { depth: number; radius: number; lanes: 1 | 2 }; // horseshoe drive-through
  apron: { w: number; d: number };           // paved drop-off under the apex
  anchors: Record<string, Vec2>;             // door, porch, bed, counter … (world)
  services: string[];
  accent: string;
  facility?: CareFacility;                   // a stamped specification (Facility instances)
};
```

Each setting has a local frame: the pad centre is the origin, local +z points
at the access road (the front), local +x is to the right when looking from the
road at the building, and `heading` rotates the frame like `Object3D.rotation.y`.
Anchors are authored in that frame (`define({ local: {…} })`) and stored in
world coordinates, so people and vehicles never depend on the pad's placement.

Fronts face +x or +z, the sides the default and Community cameras see
(azimuth ≈ 0.58): the home and pharmacy sit west of the west street, the
partner day center south of the south street, the hospital east of the east
street with its stub on the north street, and the specialist clinic south of
the south street east of the center. Drop-offs, the hospital's ED canopy and
ward bay and the clinic's glazed lobby are therefore in view without orbiting;
`focusSetting(id)` frames the pad and, if the camera has been turned to look at
a pad's back, orbits round to its front first.

Every pad has the same drive: an entry leg, a half circle whose centre sits
`drive.depth` m behind the front edge and an exit leg, travelled clockwise so a
vehicle's passenger side faces the building at the apex. Nothing has to reverse
or turn on the spot; radii are 6.2–7 m (lane spacing `LANE = 3.4`). The home has
two lanes: the Seen van waits at the inner apex by the porch, cars pass and stop
on the outer lane, and the aide's car parks on the outer exit leg.

Heights: pavement at street level (`STREET_Y = -0.23`), the pad plinth at
sidewalk level (`PAD_Y = -0.05`), the porch at `PORCH_Y = 0.3` with the new
ramp between. `groundYAt(point)` gives the height under a walker anywhere,
including on a stamped facility's stage, choir risers, ramp and steps (the
instance summary's `platforms`).

### Settings in this session

| id | kind | position | services |
| --- | --- | --- | --- |
| `home-wong` | home | The Wongs' home (`home-lin` until October 2026): (−84, 12), two-lane drive; the aide's car uses the north street's western reach; `facility` seen-home-wong (below), `pad.back` 8 | home-care, home-health, pill-packs, meals, home-mods, after-hours |
| `pharmacy` | pharmacy | (−84, −22) | pill-packs |
| `hospital` | hospital | (94, 14), stub from the north street | ed, discharge |
| `specialist` | specialist | (84, −56), stub from the south street | specialist |
| `partner-adc` | partner-adc | Partner adult day center: (4, −68), its own 484 m² adult day health care center (`facility` seen-partner-adhc, below) on a 34 × 40 m pad | day-program |

## The day (care-day clock, 1 loop second = 40 clock seconds)

| Clock | Where | What |
| --- | --- | --- |
| 8:00–8:55 | Pharmacy | Pharmacist and technician pack and check blister packs; courier loads at 8:52, leaves 9:01. |
| 8:00–8:49 | Home | Mrs. Wong wakes, toilets, washes and dresses her top half on her own; the personal care aide parks at 8:19 (in along the north street's western reach) and is at the front door at 8:29: breakfast and the morning pills at the seated kitchen worktop 8:35–8:43, stockings and shoes on the entry bench. |
| 8:38–9:14 | Hospital | Ambulance in along the north street's eastern reach to the ED; hospitalist takes the handoff (8:41–9:05). |
| 8:54–9:15 | Home | Mrs. Wong (walker) out of the front door behind her aide, down the new ramp and up the van ramp; the Seen van leaves at 9:15 with the escort aide and driver. |
| 9:27 | Home | Courier hands the pill packs to the aide; then to the center's rear receiving (10:04–11:28) and back to the pharmacy by 12:40. |
| 9:55–10:45 | Specialist clinic | Drop-off under the canopy, check-in, vitals by the MA, cardiology follow-up 10:17–10:42; van leaves 11:02 and returns by the south and west streets. |
| 8:00–9:07 | Partner ADC | Twenty-six participants have coffee at their own places at the long banquet tables (three wheelchair places at table ends); the activities lead welcomes everyone at the hall doors and the aide pours. |
| 9:15–10:13 | Partner ADC | The morning rotation: brush calligraphy in the studio with the aide, a class at the whiteboard with the lead and a support group in the group room's circle with the social worker. |
| 10:17–10:49 | Partner ADC | Four of the calligraphers stay on to paint at the easels. |
| 10:51–11:50 | Partner ADC | Visiting Seen PT (in through the front doors from the street) with three participants in the light rehab: the parallel bars, seated strength with bands from a wheelchair and the practice stair with the partner's rehab aide. |
| 10:57–11:50 | Partner ADC | Line dance: fourteen participants in three staggered rows on the dance floor, the lead calling the steps, the music leader at the stage piano; the others clap along from the tables. |
| 12:00–13:00 | Partner ADC | Lunch at the long tables, served by the lead and the aide, with piano music. |
| 13:10–14:23 | Partner ADC | The choir on the stage risers (eleven singers, filing off row by row), the lead conducting from the floor; the rest listen from the tables. |
| 14:11–15:05 | Partner ADC | Bingo at the long tables: eighteen players, the lead calling beside the flashboard. |
| 14:20–15:15 | Partner ADC | Afternoon studio, straight from the choir: calligraphy and painting for the eight singers who skip bingo. |
| 15:11–15:41 | Partner ADC | The fan dance troupe (eight) on the dance floor, led by the music leader; the rest watch from the tables. |
| 10:30–10:55 | Hospital | Rounds with the Seen liaison nurse, hospitalist and case manager. |
| 11:45–13:12 | Home | Van home; the aide meets her and follows her up the ramp and in (12:07); after the clinic: toileting, the assisted shower and dressing, lunch at the dining table; the aide hands over to the OT on the porch at 13:00 and drives off at 13:12. |
| 12:14 | Home | Home-delivered lunch handed to the aide at the front door, a wellness check with Mrs. Wong on the entry bench (meals car on the outer lane; it leaves by the inner lane's exit, round the aide's parked car; back at the center by 13:00). |
| 13:02–14:28 | Home | OT and installer: dry-run toilet and shower transfers with Mrs. Wong, Mr. Wong's side of the bed, the swing-up grab bar fitted (13:48–14:00) while the OT checks the porch ramp, then the sign-off. |
| 13:30–13:50 | Hospital | Discharge huddle; 14:10–14:16 Mr. Wong wheeled to the Seen van; van leaves 14:23. |
| 15:08–15:52 | Home | Mr. Wong home: the driver wheels him up the porch ramp to the front door (15:28) and he rolls in beside his armchair; the home health nurse (in at 15:08 from the road end) checks his transfer, vitals and medicines and leaves at 15:52. |
| 15:40–15:52 | Home ↔ center | 24/7 nurse line call between the upstairs RN and Mrs. Wong. |

## Facility instances

A setting with `facility` stamps a real facility specification (schema 2.0,
the same JSON the viewer opens) on its pad instead of its schematic massing,
drawn as a static cutaway with room plates, and gets people generated inside
it at build time. Nothing in the generic code knows a site or a program: the
registry entry, the specification and the cast file are the whole input.

### Registry fields

```ts
export type CareFacility = {
  id: string;                  // expected Facility.id; the viewer's own model id → stamped from it, no fetch
  url: string;                 // root-relative spec, '/models/seen-partner-adhc.json'
  frame: Frame;                // facility origin and rotation in the setting's local frame
  levelIds?: string[];         // default: the level at elevation 0
  excludeZoneIds?: string[];   // zones not drawn (the home's porch)
  excludeObjectIds?: string[]; // objects not drawn, nor obstacles, nor seats
  cutaway?: boolean;           // walls cut at CUTAWAY_HEIGHT (default true; ignores the wall mode)
  labels?: boolean | Record<string, string>; // room plates: rooms ≥ 12 m², or these ids with names
  floorY?: number;             // finished floor (default 0; a home uses PORCH_Y)
  margin?: number;             // footprint to pad edge (default 1.6 m)
  grounds?: string[];          // anchors the site builder draws on (trees, a bench, planting): ≥ 1 m outside
};
```

`frame` composes with the setting's frame (`facilityWorldFrame`): with
`heading` h a facility point (x, z) lands at `position + (x cos h + z sin h,
−x sin h + z cos h)`. The partner uses `{ position: [0, −6.6], heading: 0 }`,
which puts its front doors (facility (0, 10.2)) on the pad's front axis 1.1 m
behind the drop-off apron, facing the drive; it leaves out three table-end
chairs, a classroom chair and an armchair (wheelchair places) and labels four
rooms (Studio, Classroom, Group room, Rehab). The pad is derived
from the footprint (`derivePad`: wide enough for footprint + margin, extended
behind the origin by `pad.back` when deep, never smaller than authored, the
front edge and drive fixed; a building past the front edge throws).

At run time the layer (`community-layer.ts`) stamps the instance synchronously
when the facility is the viewer's own model, otherwise when `loadFacility`
resolves (the massing stays until then and on failure); the story and both
static builds ship every facility a registry entry stamps
(`instanceFacilityUrls`). The instance is one merged static group: about 54
draw calls (four of them room plates; about 105 with shadows) and 158k
triangles for the partner. People inside get the floor height from
`groundYAt`, which checks instance footprints first, then the summary's
`platforms`: the surfaces an asset's `parameters.standing` declares (`deck`,
`tiers`, `ramp`, `steps`, collected by `standingSurfaces`), so a choir stands
on its risers and a wheelchair climbs the stage ramp.

### Pipeline

```
public/models/<facility>.json ───────────────┐
app/data/community/<setting>.cast.json ──────┤ scripts/build-community-tracks.mjs
app/model/community-settings.ts (registry) ──┘ (Rolldown via loadSim, like build-scenario)
        │ instance view + nav grid, communityCastFromScenes, checkInstanceCast
        ▼
app/data/community-instances.json   per setting: footprint + rooms (setting-local, 2 dp) and
                                    the inputs they came from (frame, levels, exclusions, cast SHA-1)
app/data/community-casts.json       per setting: setting-local tracks, interactions, holes, notes
        │ static imports
        ▼
community-settings.ts (pads, groundYAt, rooms)    community-people.ts → placeInstanceCast(setting, cast)
```

The geometry summary and the tracks are separate files so that code needing
only geometry (`community-settings.ts`, imported by the page, metrics and the
trace) never carries the tracks, which only `community-people.ts` imports
(about 14 KB gzipped for the partner; its summary is about 3.7 KB). A summary
whose inputs no longer match the registry is ignored: the pad keeps its
authored size, the setting is listed in `missingInstances`, and
`validate-community.mjs` (in `npm run validate:activity`) fails until the
build is re-run.

```bash
npm run build:community            # generate, validate and write both JSON files
npm run validate:community-tracks  # the same in memory; fails on drift (part of npm run validate)
node scripts/build-community-tracks.mjs --notes   # also list every walk the generator moved
npm run sim:report                 # then refresh the published report and trace
```

The check validates, per setting: footprint + margin inside the pad and ≥ 1 m
from the drive band, stub legs and apron (edges sampled every 0.1 m), the
label plate and every `grounds` anchor outside the footprint; every track
contiguous 0–720 with jumps only while hidden (including the loop seam),
walking ≤ 1.65 m/s, walking samples near the building ≥ 0.20 m from walls and
poses ≥ 0.15 m, stationary poses clear of furniture on the instance view
(`roomPlacement(...).clear(p, seated ? 0.19 : 0.28, seatId)`, the seat being
the chair at that point or a scheduled stop's `seat`), interaction windows
inside the day (members outside the cast are listed for the composed-source
check), every hole with its placeholder, and no two people in sight within
0.60 m of each other, sampled every 0.25 s. The build log prints, per
setting, the pad slack and paving clearance, the people, walks, the closest
pair, the people with holes and the outside interaction members.

### Cast files

`app/data/community/<setting>.cast.json` lists everyone inside the instance in
one `people` array and one id namespace, in two kinds: **scene people** are
placed by the `scenes` that name them and routed between scenes; **scheduled
people** follow their own `stops` and leave the instance for **holes** that
hand-authored legs can fill. A person with a `stops` array is scheduled; any
other is a scene person. Points written `[x, z]` are in the facility's own
frame (as in its JSON), with headings in that frame (heading h faces
(sin h, cos h), so 0 faces +z); anchor names are the setting's registry
anchors (`define({ local })`), with headings in the setting's frame. Seconds
are loop seconds (0–720). The types are in `app/sim/community-cast.ts`.

```ts
type CastFile = {
  version?: 1;
  setting: string;                                   // registry id (checked)
  facility?: string;                                 // the facility id it is written for (checked when given)
  notes?: string[];                                  // free text, not read
  entrances?: Record<string, {
    inside: [x, z];                                  // just inside the door (facility frame)
    path: string[];                                  // setting anchors, outermost first, the last just outside the door
  }>;
  places?: Record<string, {                          // outdoor places reached through an entrance
    label: string; entrance: string;
    path: string[];                                  // anchors from the door outward to the place
  }>;
  people: (ScenePerson | ScheduledPerson)[];
  scenes?: Scene[];
  keep?: { actors?: string[]; interactions?: string[] }; // ids other code relies on: the build fails without them
};
type Person = {
  id: string; role: CharacterRole; label: string; variant: number;
  mobility?: 'cane' | 'walker' | 'wheelchair';       // routing clearance 0.26 / 0.33 / 0.37 m (else 0.21)
  gait?: number;                                     // m per loop second; staff 1.0, participant 0.75, cane 0.65,
};                                                   // walker 0.5, wheelchair 0.6 by default; ≤ 1.65
type ScenePerson = Person & {
  visit?: { entrance: string; outdoorGait?: number }; // off the pad until their first slot, in and out through it
};
type ScheduledPerson = Person & {
  arrive: { t: number; anchor: string | [x, z] };    // appears there at t and walks to the first stop; t > 0: a `before` hole
  leave: { t: number; anchor: string | [x, z] };     // reached by t, then gone (t < 720: an `after` hole);
                                                     // away windows go out and back through this anchor
  away?: [number, number][];                         // `away` holes, each between two stops
  stops: {
    window: [number, number];                        // held for the whole window, however short
    roomId: string;                                  // a drawn room of the instance
    at: string | [x, z];                             // a seat or other object id (seatPose: on it, facing its front), or a point
    heading?: number;                                // facility frame; default the seat's front, else 0
    action: Action;
    seated?: boolean;                                // default true on an object, false at a point
    seat?: string;                                   // at a point: the object sat on (bed, sofa, toilet, shower seat),
                                                     // which the furniture check then ignores
    title: string;
    with?: string[];                                 // other members of this stop's interaction (only read with
                                                     // `interaction`); people outside the cast are allowed
    interaction?: { id: string; category: string; label: string; description: string; window?: [number, number] };
  }[];
};
type Scene = {
  id: string;                                        // the interaction id (keep stable)
  room?: string; place?: string;                     // a facility room id, or an outdoor place
  window: [number, number];
  label: string; description: string; category: string; // category: one of COMMUNITY_CATEGORIES
  leaderAction?: Action; memberAction?: Action;
  interaction?: boolean;                             // false: places people, emits no interaction
  with?: string[];                                   // members without a slot
  near?: [x, z];                                     // free seats fill outward from here
  slots: {
    who: string;
    action: Action | 'lead' | 'member';
    seat?: true | 'home' | string;                   // a free seat; this person's first place in this room; a seat id
    spot?: string;                                   // stand (or park a wheelchair) by this object
    at?: { point?: [x, z]; anchor?: string; heading: number }; // a room point, or an outdoor anchor
    window?: [number, number];                       // inside the scene's (staggered arrivals)
    title?: string;
  }[];
};
```

A **scene person**, from the partner's cast (abridged): the visiting PT walks
in from the street through the `front` entrance in time for the scene, works
beside the parallel bars and leaves after it; nobody writes her walks or
times. The participants arrive staggered from their places at the long tables
and go back to them.

```json
{
  "entrances": {
    "front": { "inside": [0, 9.4],
               "path": ["sidewalkEnd", "sidewalkPad", "frontWalk", "doorOutside"] }
  },
  "people": [
    { "id": "visiting-pt", "role": "pt", "label": "Visiting Seen physical therapist",
      "variant": 8, "visit": { "entrance": "front" } },
    { "id": "adc-participant-18", "role": "participant", "label": "Day center participant 18", "variant": 27,
      "mobility": "wheelchair" },
    { "id": "adc-participant-25", "role": "participant", "label": "Day center participant 25", "variant": 34 }
  ],
  "scenes": [
    { "id": "partner-pt", "room": "adhc-rehab", "window": [256, 345], "category": "partner",
      "label": "Visiting Seen PT · strength & balance",
      "description": "A Seen physical therapist visits the partner center for strength and balance …",
      "slots": [
        { "who": "visiting-pt", "action": "treat", "at": { "point": [-8.4, -7.4], "heading": -1.5708 },
          "title": "Strength & balance" },
        { "who": "adc-participant-25", "action": "exercise", "at": { "point": [-9.3, -7.4], "heading": 0 },
          "window": [268, 338], "title": "Parallel bars with the Seen PT" },
        { "who": "adc-participant-18", "action": "exercise", "at": { "point": [-10.8, -6.9], "heading": -1.5708 },
          "window": [262, 334], "title": "Seated strength with bands" }
      ] }
  ]
}
```

Three **scheduled people** from the Wongs' home (`app/data/community/
home-wong.cast.json`, abridged to a few stops each): the home health nurse
visits through the front door (`door` anchor) from 642.5 to 708 s; Mrs. Wong,
a resident, starts the day in bed and ends it on the sofa (points with `seat`)
with her clinic trip as an `away` window; Mr. Wong comes home from hospital at
672 s, so his hospital day fills the `before` hole. Their time outside is
filled by hand-authored legs (below); `nurse-line-rn` and `community-driver`
are hand-authored actors outside the cast.

```json
{
  "setting": "home-wong", "facility": "seen-home-wong",
  "people": [
    { "id": "home-rn", "role": "nurse", "label": "Home health nurse", "variant": 5, "gait": 1.35,
      "arrive": { "t": 642.5, "anchor": "door" }, "leave": { "t": 708, "anchor": "door" },
      "stops": [
        { "window": [651, 653], "roomId": "home-kitchen", "at": [-3.89, -5.3], "heading": 3.142,
          "action": "serve", "title": "Washes her hands" },
        { "window": [683.5, 692], "roomId": "home-living", "at": [2.12, 0.05], "heading": 0.562,
          "action": "treat", "title": "Vitals: blood pressure, pulse, oxygen, temperature; skin check",
          "with": ["hospital-participant", "home-participant"],
          "interaction": { "id": "home-health-visit", "category": "home",
                           "label": "Post-discharge home health visit", "description": "…",
                           "window": [683.5, 700] } }
      ] },
    { "id": "home-participant", "role": "participant", "label": "Mrs. Wong · at home", "variant": 3,
      "mobility": "walker", "gait": 1.1,
      "arrive": { "t": 0.5, "anchor": [-4.6, 3.3] }, "leave": { "t": 720, "anchor": "door" },
      "away": [[80.5, 370]],
      "stops": [
        { "window": [0.5, 4], "roomId": "home-primary", "at": [-4.6, 3.3], "heading": 3.142,
          "seat": "home-primary-bed", "seated": true, "action": "seated",
          "title": "Awake on her side of the bed, walker at hand" },
        { "window": [56, 64], "roomId": "home-kitchen", "at": "home-kitchen-chair", "action": "tabletop",
          "title": "Breakfast and morning pills at the 0.76 m worktop" },
        { "window": [71.7, 74], "roomId": "home-living", "at": "home-living-entry-bench", "action": "seated",
          "title": "Stockings and shoes on the entry bench" },
        { "window": [708, 720], "roomId": "home-living", "at": [1.7, 0.78], "heading": 0,
          "seat": "home-living-sofa", "seated": true, "action": "seated", "title": "Home together, the TV on" }
      ] },
    { "id": "hospital-participant", "role": "participant", "label": "Mr. Wong · inpatient, discharged home",
      "variant": 8, "mobility": "wheelchair", "gait": 1,
      "arrive": { "t": 672, "anchor": "door" }, "leave": { "t": 720, "anchor": "door" },
      "stops": [
        { "window": [690, 708], "roomId": "home-living", "at": [2.58, 0.78], "heading": -0.35,
          "action": "conversation", "title": "Nurse-line call on speakerphone",
          "with": ["nurse-line-rn", "home-participant"],
          "interaction": { "id": "after-hours-call", "category": "after-hours",
                           "label": "Nurse line call · evening plan", "description": "…" } }
      ] }
  ]
}
```

Rules the build enforces for scheduled people: stops in time order without
overlap, every stop's `roomId` a drawn room, `away` windows inside `[arrive.t,
leave.t]` and each between two stops (time off before the first stop is
`arrive.t`, after the last `leave.t`), every walk between consecutive places
fitting its gap at the person's gait on the instance grid, and a person in
sight at both 0 and 720 s (`arrive.t` 0, `leave.t` 720) ending the day where
it starts, since the clock loops. A resident present all day writes
`arrive: { t: 0, anchor: <the first stop's point> }` and `leave: { t: 720,
anchor: 'door' }`; one who must start and end in different places (in bed at
8 AM, on the sofa at 4 PM) arrives at a fraction of a second (`t: 0.5`), so
the loop seam is out of sight. A scheduled person is never in a scene, and
their stops are indoors, in drawn rooms: time outside (a porch, a garden, a
trip) is a hole that hand-authored legs fill. Each stop's `interaction` id
may recur across people with the same window and category; members merge.
Interactions may name people outside the cast (hand-authored community
actors): the build lists them and `npm run validate:community` checks that
the composed source has them.

How the generator works (`communityCastFromScenes`, deterministic): places
first, then timelines, then walks. A free seat is a seat-kind object in the
room that is clear of furniture, reachable at the person's clearance and has a
way out past seated and standing neighbours; seats fill a table the scene
already uses, then nearest `near`. Every place keeps 0.6 m from every other
place booked for an overlapping window (more beside a wheelchair or between a
seat and a standing place); a chair the registry excludes is a wheelchair
place at its table. Slots may nest: a narrower slot interrupts the person's
open one, and they walk back when it ends if there is time. Walks run on the
instance's navigation grid (`walkBetween`, the person's mobility clearance)
and outdoors along anchors; each ends when the next slot starts (or leaves
when an interrupting one ends) and, when it would pass anyone closer than
0.6 m, is moved up to 30 s (waiting at the origin or the destination),
slowed, routed beside the other walk or around people standing still. A
scene person's every stay lasts at least 8 s; a scheduled stop lasts its
window, so its walks must fit the gaps with room for those moves (a walk
timed to its plain route with no slack fails as soon as someone stands near
the route). What cannot fit throws, naming the person, the place and the
time; widen a slot window or stagger a group. People are not escorted: two
people never walk through a door side by side.

**Holes and the stitch.** A scheduled person is hidden at the arrive anchor
before `arrive.t` (a `before` hole), walks out to the leave anchor for each
`away` window (arriving by its start, waiting in sight at the door if early),
is hidden there for the window (an `away` hole) and walks back in from it when
the window ends, and is hidden after `leave.t` (an `after` hole). Each hole is
one hidden placeholder segment in the generated track and an entry in
`holes[actorId] = [{ kind, start, end, from, to }]` (setting-local in
`community-casts.json`, world after `placeInstanceCast`; `from` and `to` are
the arrive anchor for a `before` hole and the leave anchor otherwise, so both
are the door for a visit through it).

Legs are registered per actor id in `HOLE_LEGS` in `community-people.ts`,
each person's legs listed by the exact hole they fill:

```ts
const HOLE_LEGS: Record<string, Leg> = {
  'home-participant': byWindow('home-participant', {
    'before 0–0.5': () => undefined,  // listed, no leg: the placeholder stays, hidden
    'away 80.5–370': (hole, s) => wongClinicLeg(hole, settingZone(s.id)),
  }),
  'home-pca': byWindow('home-pca', aideLegs),  // 'before 0–44', 'away 77–152.5', …
  // home-ot, home-installer, home-rn, hospital-participant
};
```

`byWindow` keys a person's legs by `<kind> <start>–<end>` and throws on a hole
it does not list, so a re-timed cast fails the build instead of silently
picking up the wrong leg or leaving someone hidden; a listed leg may return
nothing to keep the placeholder. `fillHoles` (`instance-cast.ts`) then
requires, per filled hole, that the first segment starts at `hole.start` and
the last ends at `hole.end` (it covers the hole exactly), that the first point
is `hole.from` unless the hole is `before` (the day may start anywhere) and
the last point is `hole.to` unless it is `after` (the day may end anywhere),
within 5 cm; segments may be hidden or ride a vehicle inside. A leg is
typically a `Track` (`community-track.ts`; `legTrack(id, role, hole, s,
start?)` starts one at `hole.start`) closed with `segmentsTo(hole.end)`,
ending with a walk onto `hole.to`; a `before` leg is the visitor's arrival
(hidden off the map, then a walk up to the door by `hole.end`), an `after` leg
the departure from the door. An actor id is either generated or hand-authored,
never both (`communitySource` throws), and an interaction id is defined once
in the composed source (`composeSources` throws on duplicates).
`test/community-cast.test.ts` generates Mrs. Wong on a stand-in house with
`away: [[80.5, 370]]`, fills the hole from the front door and back with
`wongClinicLeg`, and checks that the composed source carries the same trip in
the real home's away window; the trip's times between the door passes are
fixed by the Seen van (on board 108.5–181 and 257.5–337 s), so a cast with
another away window re-times the walks at either end of it.

### The partner adult day center

The `partner-adc` pad stamps `public/models/seen-partner-adhc.json`, a schema
2.0 facility specification of an illustrative partner adult day health care
center (ADHC), written by `scripts/build-partner-adhc.mjs` from the program
brief: mostly long tables, lots of dancing (line and fan dance), bingo, a choir
and a stage, large groups in one large activity hall, a few smaller rooms for
calligraphy, painting, classes and group therapy, and a light rehab space;
nothing else but an entry with reception and restrooms, and substantially
smaller than the main center. It is not a real provider or address and uses no
participant records. Its 33 people are generated inside it from
`app/data/community/partner-adc.cast.json`.

#### Plan

One storey, 24.2 × 18.0 m plus a 13.4 × 3.6 m entry pavilion in front (483.8
m² gross, about a quarter of the main center's 1,956 m² ground floor; 457.8 m²
net). Plan frame P: metres, origin on the hall's centre line 6.6 m behind the
hall's front wall, +x east, +z toward the front doors and the drive, y = 0 the
finished floor. P is world-aligned: world = P + (4, −74.6).

| Room (id) | Size (m) | m² | What it holds |
| --- | --- | --- | --- |
| Multipurpose hall (`adhc-hall`) | 13.08 × 14.04 | 183.6 | Two rows of long banquet tables (six 8 ft tables under red cloths and gold runners, 49 banquet chairs, three wheelchair places at the table ends), a 9.2 × 5.2 m parquet dance floor with lantern posts at its corners, the bingo flashboard and caller's stand on the west wall, the stage ramp and steps |
| Stage (`adhc-stage`) | 13.08 × 3.6 | 47.1 | Raised 0.40 m across the back of the hall: backdrop with banners and a lantern valance, three-tier choir risers, lectern, soloist microphone, upright piano and bench, two speakers |
| Light rehab (`adhc-rehab`) | 5.24 × 9.04 | 47.4 | Parallel bars, two recumbent bikes, a mat table, a resistance-band wall, a practice stair, a weights and bands rack, chairs for seated strength |
| Classroom (`adhc-classroom`) | 5.24 × 8.44 | 44.2 | Six two-place tables in three rows facing a mobile whiteboard; one place open for a wheelchair |
| Calligraphy and painting studio (`adhc-studio`) | 5.24 × 11.04 | 57.8 | Two felt-laid calligraphy tables for twelve with ink stones and brush racks, a brush and ink stand, a hanging scroll display, four easels along the east wall and a drying rack by the door |
| Group room (`adhc-group-room`) | 5.24 × 6.44 | 33.7 | A circle of eight armchairs round a low table for classes and group therapy; one place open for a wheelchair |
| Entry and reception (`adhc-reception`) | 5.88 × 3.44 | 20.2 | Double front doors (1.8 m, flush threshold), the reception desk, three waiting chairs and a planter, double doors into the hall |
| Accessible restrooms (`adhc-restroom-w`, `adhc-restroom-e`) | 3.44 × 3.44 | 11.8 each | Single-user, off the hall: toilet with side and rear grab bars, roll-under basin, 1.5 m turning circle |

The light rehab and the classroom open off the hall's west side, the studio
and the group room off its east side, the restrooms off its front; all four
wings are one step-free floor. The stage is step-free by a 1:12 ramp along its
front (0.40 m over 4.8 m) rising west to a 1.54 × 1.5 m landing level with the
deck, with a handrail on the open side; walking performers also have three
steps with side and centre handrails at the east end (two 0.64 m lanes), too
narrow for walkers and wheelchairs. Doors are 1.0 m clear (1.8 m double
doors at the front and into the hall), centred on the 0.2 m navigation grid so
each passes a wheelchair straight through; five 1.5 m turning circles
(restrooms, reception, ramp foot, stage deck). The stage platform, risers,
ramp and steps declare their standing surfaces (`parameters.standing`), so the
choir stands 0.6–1.0 m up and a wheelchair rolls up the slope; their
navigation footprints are only the stage's front edge (open at the ramp
landing and the steps), the ramp's handrail and the steps' rails. A banquet
chair's navigation footprint reaches 0.25 m behind its frame (the chair pushed
out and the seated person), so people walking behind a row keep clear of the
backs.

Decor, in the specification's own `adhc-*` materials (so the presentation
palette leaves them alone): honey maple floors with a checkered parquet dance
floor (two honey tones, a cinnabar border and a jade-and-gold medallion), red
cloths with gold runners on the long tables, black lacquer and gold on the
stage, its backdrop and the lantern posts, paper lanterns and hanging scrolls,
a sage carpet in the classroom, a rose carpet in the group room, a mint rehab
floor, terrazzo in the entry and warm terracotta stucco outside. The ADHC
kinds are in `app/model/adhc-assets.ts` (fronts in each asset's
`parameters.front`); every asset has a `name`.

#### On the pad

`careSettings` `partner-adc`: (4, −68), heading 0, pad 34 × 40 m south of the
south street (stub from (4, −35.8)), a one-lane drive (depth 6, radius 6.2)
and a 10 × 3 m apron; `facility: { id: 'seen-partner-adhc', url:
'/models/seen-partner-adhc.json', frame: { position: [0, −6.6], heading: 0 },
levelIds: ['ground'], excludeObjectIds: […], cutaway: true, labels: {…},
margin: 1.6, grounds: [treeA–D, bench, bedWest, bedEast] }`. The front doors
face the drop-off 1.1 m behind the apron; the building stays 1.05 m from the
paving and the derived pad equals the authored one (slack side 3.3, front
14.7, back 0.5 m). Left out as wheelchair places: the table-end chairs of row a
and the west end of row b, one classroom chair and one armchair in the circle.
Plates: Studio, Classroom, Group room, Rehab (none in the hall: at its label
anchor, between the dance floor and the first row of tables, the chairs would
hide it from the front). Anchors: the street walk
(`sidewalkEnd`, `sidewalkPad`, `frontWalk`, `doorOutside`), the camera and
story anchors `hall` (the dance floor's centre, world (4, −77.6)), `stage` and
`ptStand` (beside the parallel bars, world (−4.4, −82.0)), and the grounds:
four trees, a bench and two planting beds flanking the entry pavilion. While
the instance loads (or if it fails) the pad draws the footprint as plain
massing with a roof slab.

#### The day

The cast is all scene people: twenty-six participants (canes 2, 9, 20 and 26;
walkers 6, 17 and 22; wheelchairs 13, 18 and 24), the partner's activities
lead, activity aide, music and choir leader, social worker, rehab aide and
receptionist, and the visiting Seen PT (`visit` through the `front` entrance:
sidewalk, front walk, front doors). Each participant keeps a place at the long
tables all day (alternate chairs, by the side of the hall nearest their
morning room) and leaves it for the activities; the staff keep a place in
their own rooms between sessions.

| Interaction (id) | Loop s | Clock | Room | Who |
| --- | --- | --- | --- | --- |
| `partner-morning` | 0–100 | 8:00–9:07 | hall | Coffee at the long tables: all 26, the lead greeting at the hall doors, the aide pouring |
| `partner-calligraphy` | 112–200 | 9:15–10:13 | studio | The aide demonstrating at the brush stand; seven participants |
| `partner-class` | 112–200 | 9:15–10:13 | classroom | The lead at the whiteboard; seven participants (one in a wheelchair) |
| `partner-group-therapy` | 115–200 | 9:17–10:13 | group room | The social worker; five participants and one in a wheelchair |
| `partner-painting` | 206–254 | 10:17–10:49 | studio | Four calligraphers stay on at the easels; the aide |
| `partner-pt` | 256–345 | 10:51–11:50 | light rehab | Visiting Seen PT beside the parallel bars: participant 25 on the bars, 18 on seated strength with bands, 9 on the practice stair with the rehab aide |
| `partner-line-dance` | 266–345 | 10:57–11:50 | hall | Fourteen dancers in three staggered rows 1.65 m apart, the lead calling, the music leader at the piano; nine clap from the tables |
| `partner-lunch` | 360–450 | 12:00–13:00 | hall | All 26 at their places, the lead and the aide serving, piano music |
| `partner-choir` | 465–574 | 13:10–14:23 | stage | Eleven singers on the risers (back tier in first, each tier off east to west once the one in front is clear), the music leader at the piano, the lead conducting from the floor; fifteen listen from the tables |
| `partner-bingo` | 556–638 | 14:11–15:05 | hall | The lead calling beside the flashboard; eighteen players |
| `partner-afternoon` | 570–652 | 14:20–15:15 | studio | The eight singers who skip bingo: calligraphy and painting, with the aide |
| `partner-fan-dance` | 646–692 | 15:11–15:41 | hall | The fan dance troupe (eight), led by the music leader; the rest watch from the tables |

`keep` pins `visiting-pt`, `adc-lead`, `adc-aide`, `adc-music` and these twelve
interactions; `npm run validate:partner-adhc` checks them, the line dance's
dancers and the PT's window. The trace names the zone "Partner ADC" and its
rooms "Partner ADC · Multipurpose hall", "Partner ADC · Studio" and so on;
Measure counts one occupancy series for
the pad (33 people). Nobody arrives by van yet (see Roadmap hooks).

Assumptions: an illustrative composite. Lunch is catered (no kitchen in the
program) and there is no clinic or nurse station: the visiting Seen PT is the
only clinician on site. Two single-user restrooms are light for 33 people; the
brief approved restrooms without a count. The music leader also leads the fan
dance. People keep 0.6 m apart, so the line dance and the choir stand a little
looser than a real troupe.

### The Wongs' home

The `home-wong` pad stamps `public/models/seen-home-wong.json`, a schema 2.0
facility specification of an illustrative senior-friendly bungalow, informed
by typical Alhambra and San Gabriel Valley two-bedroom listings and by 2010
ADA Standards / ICC A117.1 guidance. It is not a real home or address and uses
no participant records. Its six people (Mrs. Wong, her personal care aide, the
OT, the home-mods installer, the home health nurse and Mr. Wong) are generated
inside it from `app/data/community/home-wong.cast.json`; everything they do
outside is a hole leg.

#### Plan

13.0 × 9.0 m (117 m², 1,259 sq ft), two bedrooms and one bath on one floor,
behind the existing 8.0 × 2.6 m porch and ramp. Plan frame P: metres, origin at
the centre of the house-plus-porch footprint, +x east (the front door and the
street), +z north, y = 0 the finished floor (`PORCH_Y` on the pad). P is
world-aligned: world = P + (−94.8, 12.0).

| Room (id) | Size (m) | m² | What it holds |
| --- | --- | --- | --- |
| Entry & living (`home-living`) | 3.3 × 6.28 | 20.7 | Step-free front door, entry bench, sofa, TV wall, Mr. Wong's armchair with wheelchair parking beside it |
| Dining nook (`home-dining`) | 4.6 × 2.8 | 12.9 | Table for four (east chair slides out for a wheelchair), sideboard with the weekly pill-pack organizer |
| Kitchen (`home-kitchen`) | 4.0 × 3.39 | 13.6 | L-shaped: front-control range, counter-height microwave, sink base with removable doors, 0.76 m seated worktop |
| Hall (`home-hall`) | 1.18 clear | 11.6 | Open to the living room along its south part; linen cupboard |
| Laundry & back door (`home-laundry`) | 4.0 × 1.75 | 7.0 | Washer and dryer on 0.30 m pedestals; door lined up with the back door |
| Accessible bath (`home-bath`) | 4.0 × 2.9 | 11.6 | Curbless 1.55 × 1.45 m roll-in shower with fold-down seat, raised toilet with side, rear, vertical and swing-up bars, roll-under basin, pocket doors to the hall and the bedroom |
| Primary bedroom (`home-primary`) | 4.0 × 4.2 | 16.8 | Shared queen bed: her 1.0 m walker side by the en-suite, his 1.6 m wheelchair side with the bed's transfer handle |
| Bedroom 2 (`home-bedroom-2`) | 3.18 × 3.4 | 10.8 | Full bed, desk and wardrobe for family |
| Back landing (`home-back-landing`) | 1.6 × 1.65 | 2.6 | Level with the floor; 1:12 back ramp (4.2 m) to the yard |

Senior-friendly features: floor at porch level (no step, 12 mm threshold
plate), 0.90 m clear interior and 1.00 m exterior doors, the 1.18 m hall, seven
1.5 m turning circles (entry, bath, both sides of the bed, kitchen, dining,
porch), toilet centreline 0.45 m from the wall with 1.525 × 1.42 m clear,
grab bars at 0.84–0.88 m, seated worktop, raised laundry, bedroom on the main
floor next to the bath, no rugs, night lights from bed to bath. Zones group the
rooms (day rooms, night rooms, back landing, porch); walls carry the door gaps,
centred on the 0.2 m navigation grid so each 0.9 m door passes a wheelchair
(0.37 m clearance); `doorSchedule`, `windowSchedule`, `turningCircles` and
`roofNote` record the rest. Asset kinds new to the catalog are in
`app/model/home-assets.ts`; their fronts are in each asset's
`parameters.front`.

#### On the pad

`careSettings` `home-wong`: `facility: { id: 'seen-home-wong', url:
'/models/seen-home-wong.json', frame: { position: [0, −10.8], heading: −π/2 },
levelIds: ['ground'], excludeZoneIds: ['home-zone-porch'], cutaway: true,
floorY: PORCH_Y, labels: {…}, margin: 1.6 }` and `pad.back: 8` (the pad grows
8 m west; front edge, drive and anchors stay put). The frame puts the front
door's opening 0.10 m from the `door` anchor and the front wall's face on the
porch slab's back edge (local z −7.6, `HOME_PORCH` in `community-pads.ts`); the
drawn footprint stays 0.10 m clear of the porch slab, which the pad's site
builder keeps drawing with its ramp, rail gap and half step at `porchStep`,
bench and the home-mods crate (hence the excluded porch zone), and more than
3 m from the drive. The derived pad needs `back` 5.8 m and a 16.2 m width.
Name plates (Living room, Kitchen, Bath) go only where the name reads at the
room's label anchor: the instance's 3.6 m floor plate would put a bedroom's or
the dining nook's name under the bed or the table, and the bath's name stays
short to clear the shower. The bungalow massing draws only while the instance
loads or if it fails.

#### The ADL day

The cast follows the schema above. Every walk has 1.5–2 s of slack over its
plain route at the person's gait (a few one-metre steps in the kitchen and
bath about 1 s) and door passes are at least 2 s apart, so the generator can
stagger people in a small house; the build reports a closest pair of 0.65 m.

| Clock | Who | Where | What |
| --- | --- | --- | --- |
| 8:00–8:20 | Mrs. Wong | bedroom, bath | Wakes, toilets on her own (raised seat, bars), washes at the roll-under basin, dresses her top half in the dressing chair |
| 8:29–8:43 | Aide, Mrs. Wong | kitchen | Aide in at 8:29: check-in, congee on the front-control range, breakfast and the morning blister at the seated worktop |
| 8:48–8:54 | Aide, Mrs. Wong | entry bench, front door | Stockings, Velcro shoes and jacket; the aide out ahead with the clinic bag at 8:51, Mrs. Wong at 8:54 |
| 9:42–11:30 | Aide | whole house | Files the new pill packs, remakes the bed for two, laundry, cleans bath and kitchen, clears the route to the armchair |
| 12:07–12:17 | Mrs. Wong, aide, meals driver | entry bench, front door | In at 12:07 (the aide at 12:08); rest after the clinic; meal hand-off at the door at 12:14 |
| 12:25–12:44 | Mrs. Wong, aide | bath, bedroom | Toileting help, transfer, assisted shower on the fold-down seat, dressing |
| 12:47–1:00 | Aide, Mrs. Wong | kitchen, dining | Lunch heated and set up, visit logged; aide out at 1:00, car away at 1:12 |
| 1:02–2:28 | OT, installer, Mrs. Wong | dining, bath, bedroom, porch ramp | The visit explained, bar layout and dry-run toilet and shower transfers, Mr. Wong's side of the bed and its handle; the swing-up bar fitted while the OT checks the ramp; sign-off |
| 1:47–4:00 | Mrs. Wong | sofa | At the armchair end of the sofa; welcomes Mr. Wong home |
| 3:08–3:52 | Home health nurse | kitchen, dining, living | Washes, sets up, meets Mr. Wong, checks his transfer technique, vitals, medication reconciliation, warning signs |
| 3:28 | Mr. Wong | front door → beside the armchair | Rolls himself in over the flush threshold |
| 3:40–3:52 | Mr. and Mrs. Wong, nurse line | living room | Nurse-line call on speakerphone |

Interactions (id · window in loop s): `home-personal-care` 30–72,
`home-meal-meds` 52–64, `home-dressing-am` 71.7–74.2, `home-housekeeping`
152.5–316, `home-return` 330–373, `home-meals` 381–386, `home-toileting`
397–404, `home-bathing` 404–411, `home-dressing-pm` 419.5–425.5,
`home-lunch` 430.5–446, `home-mods` 453–583, `home-grab-bar` 522–540,
`home-ramp-check` 523–548 (on the porch ramp), `home-discharge-arrival`
642–683.5, `home-transfer` 674.5–683.5, `home-health-visit` 683.5–700,
`after-hours-call` 690–708. The cast keeps `home-personal-care`,
`home-health-visit` and `after-hours-call` at those windows (the story and
the trace read them; `npm run validate:home` checks them).
`home-van-boarding` (80.5–113) and `home-pill-drop` (130–141) stay outdoors in
`community-people.ts`.

Door passes and the legs that fill the holes (`HOLE_LEGS`):

| Who | In / out at the front door (s) | Outside (hole legs) |
| --- | --- | --- |
| Mrs. Wong | out 80.5, in 370 | `wongClinicLeg`: across the porch and down the ramp to the van (sill 108.5), the cardiology clinic, home on the van (off 337), up the ramp |
| Aide | in 44, out 77, in 152.5, out 318.5, in 372.5, out 450.5 | from her car in the stall (parked 28 s); ahead of Mrs. Wong to the ramp, waving the van off, the pill packs from the courier on the drive; out to meet the van and up the ramp behind her; the hand-over to the OT on the porch and back to her car (469 s) |
| OT | in 453, out 520, in 551, out 582.5 | in from the road end and up the ramp; the ramp check (landing, rails, slope); away to the road end |
| Installer | in 456, out 572.5 | in from the road end, unpacks the kit at the crate on the pad; packs it and leaves |
| Home health nurse | in 642.5, out 708 | in from the road end and up the ramp; down the ramp to her car |
| Mr. Wong | in 672 | the hospital ward, discharge, the van ride home; the driver wheels him across the pad and up the ramp to the door (the driver hands over the discharge folder there and is back at the van by 700 s) |

The meals driver and the van driver are hand-authored and stay outside: the
meals driver hands the bag to the aide at the front door (`doorStep`), the
van driver waits at the drive.

Assumptions: an illustrative composite, not a care plan. Mrs. Wong toilets,
washes and starts dressing on her own before the aide arrives (in another plan
the aide could start at 8:00); bathing and full dressing follow the clinic, so
the aide's visit runs to 1:12 PM (her car's dwell, `community-vehicles.ts`).
The couple share the queen bed with a transfer handle on his side (no hospital
bed yet; `home-hospital-bed` is a catalog entry). Mr. Wong keeps his wheelchair
all day until a per-segment mobility override exists, so the nurse checks his
transfer beside the armchair. The swing-up bar and the bed handle are fitted
during the day but drawn installed.

Sources (the specification's `referencePages`): Redfin, Homes.com and Zillow
Alhambra 2-bedroom listings; typical room-size guides; 2010 ADA Standards and
U.S. Access Board guides; ICC A117.1 Type A dwelling units; HUD aging in place
and visitability; wheelchair, walker and hospital-bed clearance guides; CDC
STEADI *Check for Safety*; PACE (42 CFR 460) and CAPABLE.

## In the story

The scroll story (docs/STORY.md) pulls out to the whole network in its network
beat (`frame()`) and has six cutaway chapters that feature these interactions,
a public contract that `node scripts/build-scenario.mjs --check` checks (each
must exist in the composed story source, at its setting, overlapping its
chapter's window):

| Cutaway | Setting | Featured interactions | Camera anchor |
| --- | --- | --- | --- |
| `network-pharmacy` | `pharmacy` | `pharmacy-packing` | `counterBack` |
| `network-home-am` | `home-wong` | `home-meal-meds` | instance room `home-kitchen` (`door` until stamped) |
| `network-specialist` | `specialist` | `specialist-visit` | `examSeat` |
| `network-partner` | `partner-adc` | `partner-pt`, `partner-line-dance` | instance room `adhc-rehab` (`ptStand` until stamped) |
| `network-hospital` | `hospital` | `hospital-discharge-huddle` | `huddleA` |
| `network-home-pm` | `home-wong` | `home-health-visit`, `after-hours-call` | instance room `home-living` (`door` until stamped) |

Keep those interaction ids, room ids and anchor names stable when re-timing a
cast or rebuilding a pad; the story reads anchors through the layer
(`settings`, `frame(id)`, `instance(id).roomCenter(room)`), never through world
coordinates, and falls back to the pad centre when an anchor disappears.

## Adding things

**A setting.** Add a `define({...})` entry to `careSettings` with local
anchors, and a builder in `community-pads.ts` (`BUILDERS[kind]`) if it is a new
kind. The drive, plinth, stub, sidewalk and label come for free. Keep the pad
outside the ring streets (north z≈41.3, south z≈−32.3, west x≈−44.4, east x≈54)
and reach it from a lane that flows the right way (`ring(side)` in
`community-vehicles.ts`, built from `laneLine`/`laneFlow` in
`traffic-routes.ts`). The ring streets are drawn out to `STREET_EXTENT`
(x ±130, z ±95, `neighborhood.ts`), past every pad, so a stub joins a drawn
street wherever it meets the ring. Turn it (`heading`) so its front faces +x or +z; the
framing, the label plate and the shadow camera follow from the registry.

**A setting with a building.** Give the entry a `facility` (above) and a
`site` builder for the grounds if the kind needs one, run `npm run
build:community` and read its report (pad slack, paving and grounds
clearances). Place the facility with `frame` so its entrance faces the drive
and its door sits on an anchor the cast's `entrances` lead to; the pad grows
to fit. Then write `app/data/community/<setting>.cast.json` and re-run until
the build passes; commit the cast file and both generated JSON files, then run
`npm run sim:report`.

**A vehicle.** Add an itinerary to `communityVehicles`: `dwell(from, to, pose,
phase, { door, ramp })` and `drive(from, to, path, phase, { pre, post })` legs
covering the parts of the day it is on screen, a `rest` pose for the remainder,
and `seats` for riders. Build street legs from `zRun`/`xRun`, `corner`,
`arrive(setting, lane, fromLane, stopDeg)` and `depart(...)`. The renderer
registers every vehicle with the engine under its `name`, so a rider's segment
with `vehicleId` and `seat` moves with it, the camera can follow it and the
trace names it. Presentation is data: roof `decor` (`'pharmacy-cross'`,
`'meal-cooler'`, built by `VEHICLE_DECOR`) and, for a Seen van on the fleet body,
a livery `variant` letter after the center's own fleet (`fleetVanLetter`), which
the layer passes straight to `buildArrivalVan`. A Seen van's `seats`
come from `FLEET_VAN_SEATS`, the furniture its body draws. A vehicle that
enters or leaves the map does so at `OFF_MAP` (just short of the ends of the
drawn streets, `STREET_EXTENT`, beyond every pad and the Community framing)
with `fade: 'in'` or `'out'` on that leg, so it fades over the last
`FLEET_LOT.fade` (8 m) instead of appearing or vanishing in view. Lanes,
corner radius (`FLEET_LOT.streetRadius`, 6.4 m), easing (`easeDistance`),
the van ramp (`FLEET_VAN_RAMP`) and the fade itself (`fadeVehicle` in
`arrival.ts`) are shared with the center's fleet.

**A person inside a facility instance** goes in its cast file (above), never
in `community-people.ts`. **A person on a pad** uses the `Track` builder
(`community-track.ts`) in `community-people.ts`: `hold`,
`walk`, `hidden`, `ride`, ending exactly at 720 s. Walks are straight lines
between anchors on the pad (there is no navigation grid outside the building);
keep ≥ 0.6 m from props and other people. Add every place a person stands or
passes as a local anchor of its setting and give poses as `rel(setting,
localHeading)`, never as world coordinates or world headings, so the cast
follows when an entry moves or turns; places at the center come from the model
(the nurse line's desk is found by zone and asset) or from `CENTER_LOT`. Use
`zoneId: settingZone(id)` and `levelId: 'site'`. Add interactions with one of
the categories `home`, `pharmacy`, `specialist`, `hospital`, `partner`,
`after-hours`.

## Validation

```bash
npm run validate:community
```

Over the whole day at 50 Hz: community vehicles keep ≥ 0.5 m from the fleet
vans, delivery trucks, parked cars and each other and ≥ 0.85 m from the street
cars; drive nose-first with no reversing or hairpins (radius over any 3 m of
travel ≥ 5 m; the designed arcs are ≥ 6.2 m); keep doors and ramps shut while
moving; are periodic and continuous across the loop seam; every vehicle has a
name, every decor a builder and every fleet-body van its own livery letter. The
cast: contiguous 0–720 tracks, walks ≤ 1.65 m/s, every visible walk point on a
pad, its stub corridor or the center's site, seats only in registered vehicles,
steps of at most 2 m into or out of a seat, nobody within 0.55 m of anyone else
on foot (including the center's cast while near the center), and every
interaction names known actors, categories and zones. `npm run
validate:community-tracks` checks facility instances and their generated
casts (see Facility instances); `validate-community.mjs` (in `npm run
validate:activity`) fails while an instance summary is stale. Screenshots for
review: `?site=alhambra&debug=1`, then
`window.__viewer.focusSetting('partner-adc')` or `view('community')`.

```bash
npm run validate:partner-adhc
```

The partner center: `scripts/build-partner-adhc.mjs --check` rewrites the
specification unchanged; it validates, stays under 200 kB with no textures and
is formatted like `prepare-public-models.mjs` writes it; one storey of
450–650 m² gross (at most 35 % of the main center's ground floor) with exactly
the brief's rooms and the approved extras, the hall the largest; every gap
between a wall run's segments is a scheduled door ≥ 0.9 m (interior) or
≥ 1.0 m (exterior) with plan-door leaves, passed straight through at
wheelchair clearance; no floor furniture overlaps other furniture or walls or
leaves its room, and everything on the stage rests on the deck; the five
turning circles are clear; every room is reachable from just inside the front
doors at wheelchair and walker clearance, and both reach the stage deck only
up the 1:12 ramp (walking performers take the steps); every asset has a name
and builds, the ADHC kinds at their declared size with their fronts
documented; the registry stamps the file (and `instanceFacilityUrls` ships it),
its site checks pass, the front doors face the drop-off and the camera anchors
lie in their rooms; and the cast keeps the twelve contract interactions (each
≥ 20 s inside the day), its staff and the visiting PT, a line dance of at least
twelve dancers with the lead dancing, and a PT session across the story's
289–300 s chapter, as do the generated tracks.

```bash
npm run validate:home
```

The Wongs' home: the specification validates, stays under 150 kB with no
textures and is formatted like `prepare-public-models.mjs` writes it; every gap
between a wall run's segments is a scheduled door ≥ 0.9 m (interior) or ≥ 1.0 m
(exterior) and passes a wheelchair straight through; no furniture overlaps
other furniture or walls, stacked items rest on something; the seven 1.5 m
turning circles are clear on the navigation grid (explicit options: no
removals, reservations or excluded zones); every room is reachable from the
front door at wheelchair (0.37 m) and walker (0.33 m) clearance; every asset
builds and the home kinds come out at their declared size from boxes and
cylinders in defined materials; the registry frame meets the door anchor and
the porch slab, keeps the building ≥ 1 m from the drive and each room name
readable on its plate (≥ 90 % in the room and clear of floor items); and the
cast names community actors and keeps the contract windows, clears furniture
and walls at every stop, routes every walk on the instance grid in the time its
gap allows (door passes at the door, a resident's arrival at a point at her
first stop), and its generated tracks (`community-casts.json`) keep people
≥ 0.6 m apart on foot (0.55 m seated).

## Roadmap hooks

- **Partner ADC scenario.** The partner's own center, its cast and the
  visiting PT are in place; a Seen van drop at its drive (8:30, pickup 3:30)
  is one more `van-…` itinerary plus riders arriving through the `front`
  entrance.
- **Replicate a building.** Any facility specification can be stamped on a
  pad (`facility`): the partner day center and the Wongs' home are, with their
  people generated inside (`HOLE_LEGS` for the home's outdoor parts). A second
  Seen center is another entry with a `seen-center` kind.
- **Network of centers.** The camera framing (`frame()`), the zone naming
  (`community:<id>`) and the view (`community`) already treat settings as a
  set; a hub-and-spoke network is more settings plus vehicles whose legs join
  the ring at the right lanes.
