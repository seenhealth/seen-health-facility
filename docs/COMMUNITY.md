# Distributed care around the center

Seen Health does not only care for people inside the Alhambra building. The
same care team runs home care with personal care aides, home health visits,
pharmacy pill-pack delivery, home-delivered meals, home modifications, a
personal emergency response system, escorted specialist appointments, eye
exams and X-rays, hospital admissions with discharge coordination and a 24/7
nurse line, much of it coordinated by phone, joined by door-to-door transport.
The model builds those
settings *around* the center, in the same scene, on the same 720 s care-day
clock and with the same engine and presentation palette, so it reads as one
distributed care system. Everything is data first: a partner adult day center
or a second Seen center is another registry entry, and a pad can carry a real
facility specification instead of schematic massing (a *facility instance*):
the partner adult day center is Seen's own Alhambra ground floor, stamped on
its pad with its own generated cast.

Everything here is illustrative. Pads sit on the paper ground beyond the ring
streets, massing is schematic and timings are compressed onto the care-day
clock; no participant records are used.

## Files

| File | Role |
| --- | --- |
| `app/model/community-settings.ts` | The registry (`careSettings`): kind, name, position, heading, pad size, access road, horseshoe drive, anchors, services, accent, and the optional stamped `facility`. Frame helpers (`toWorld`, `lanePath`, `lanePose`, `groundYAt`), the generated instance summaries (`instanceRooms`, `instanceFootprint`, `missingInstances`). No three.js. |
| `app/model/community-pads.ts` | `buildCareSetting(setting, mat, { massing })`: plinth, drive band, stub and sidewalk, label plate, the building `massing` and the `site` around it (trees, patio) per kind. |
| `app/model/facility-instance.ts` | `buildFacilityInstance(facility, frame, options)`: any schema 2.0 facility as a static cutaway with room plates, merged by material; `instanceSelection` (what is drawn), shared with build-time navigation. Knows nothing of settings or sites. |
| `app/model/community-track.ts` | The hand-authored `Track` builder (`hold`, with `seated` for a stool or a chair, `walk`, `hidden`, `ride`; `start` and `segmentsTo` for legs that fill holes). |
| `app/model/instance-cast.ts` | `placeInstanceCast(setting, cast)`: a generated cast into world actors and interactions; `fillHoles` stitches hand-authored legs into a scheduled person's track. |
| `app/sim/community-cast.ts` | Build time only: instance navigation options and view, the summary, the site checks, the cast generator `communityCastFromScenes` and its validator `checkInstanceCast`. |
| `scripts/build-community-tracks.mjs` | `npm run build:community` / `npm run validate:community-tracks`: writes and checks `app/data/community-instances.json` and `app/data/community-casts.json` from `app/data/community/<setting>.cast.json`. |
| `app/model/community-vehicles.ts` | `communityVehicles` itineraries (dwell/drive legs) with each vehicle's name, roof decor and livery, `sampleCommunityVehicle(id, time)` pure samplers (with the fade at the map edge), `registerCommunityVehicles(registry)` (the samplers under their names), lane and turning helpers, car and ambulance bodies. |
| `app/model/community-people.ts` | `communitySource(model)`: the hand-authored cast, the placed instance casts (with `HOLE_LEGS`), touchpoint interactions, the setting zones with their instance rooms and the `community` view as a `SourceExtension` composed into the care-day source. |
| `app/model/community-layer.ts` | `buildCommunityLayer(model, mat, { loadFacility, materialFor, calls })`: pads, facility instances (`instance(id)`, `ready`), vehicle bodies and the call arcs (`calls`), `tick(time)`, `frame(settingId?)` camera framings, the network `bounds` / `shadowExtent` and `dispose()`. |
| `app/model/call-arcs.ts` | `buildCallArcs({ interactions, people, motion?, style? })`: an arc between the callers of every phone interaction (`channel: 'phone'`) while it lasts (below, Calls). |
| `app/model/alhambra-source.ts` | `alhambraSource(model, base)`: the care day exactly as the viewer plays it (base loop + community layer + fleet crew), and `alhambraVehicles()`, pure samplers under the engine's vehicle ids. |
| `scripts/validate-community-traffic.mjs` | `npm run validate:community`: clearance, driving and cast checks (below). |
| `public/models/seen-home-wong.json` | The Wongs' home as a schema 2.0 facility specification (below), for the `home-wong` pad; Mrs. Lin's `home-lin` pad stamps the same plan. |
| `app/model/home-assets.ts` | `buildHomeAsset(spec, material)`: bed, nightstand, wardrobe, kitchen range, grab bars, swing-up bar, bed rail, hospital bed, ramp and PERS console kinds, called first by `buildAsset`; `homeAssetSurface(spec)`, the height things stand on (a nightstand's top beside its lamp). |
| `app/data/community/home-wong.cast.json` | The Wongs' ADL day inside the home, the input of the instance cast pipeline (below). |
| `app/data/community/home-lin.cast.json` | Mrs. Lin's day at home with her daughter (below, "Mrs. Lin's home"). |
| `scripts/validate-home.mjs` | `npm run validate:home`: the home's plan, assets, registry frame and both homes' casts. |

Wiring: `alhambraSource(model, base)` composes the Alhambra care day once,
`withFleetCrew(composeSources(base, communitySource(model)))`, memoised per base
loop. The renderer, the Measure panel (metrics and trace), the story scenario
(`composedStorySource`), `scripts/sim-report.mjs` and `scripts/validate-trace.mjs`
all read it, so every count, trace and report describes the people the scene
animates (223 in the base loop: the center's 167, the fleet crew's 10 and the
community's 46, of whom 33 are generated inside facility instances: 25 in the
partner day center, 6 in the Wongs' home and 2 in Mrs. Lin's). When
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
`people`: 223 with the layer, 177 without), walking-path lines and follow
targets follow the toggle; site-level people (the community cast and the fleet
drivers) show only with the site context, at every level.

The activity panel lists the new touchpoint categories. `computeMetrics` and
the sim report (`npm run sim:report`) fold them into one participant bucket,
"Care at home & in the community", and the trace summary counts participants
with a community touchpoint. The settings are zones of the composed source
(`ActivityData.zones`, `community:<id>`), so occupancy and the trace name them
(a setting with a facility by its `traceName`, e.g. "Partner ADC · Seen
layout"); the zone carries the instance's rooms (`SourceZone.rooms`), so trace
`enter` events read "Partner ADC · Day room" inside them. On-site counts and
staff time by role cover the center. Family members (role `family`: Mrs. Lin's
daughter) are neither staff nor participants (`isStaffRole`,
`characters.ts`): Measure counts them among the people (`headline.family`) but
not in occupancy or staff time, the trace never makes one a handoff's
attending staff, the Trace tab lists them under Family and the "Staff only"
filter leaves them out.

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
(azimuth ≈ 0.58): the two homes and the pharmacy sit west of the west street, the
partner day center south of the south street, the hospital east of the east
street with its stub on the north street, and the specialty clinic south of
the south street east of the center. Drop-offs, the hospital's ED canopy and
ward bay and the clinic's open front are therefore in view without orbiting;
`focusSetting(id)` frames the pad and, if the camera has been turned to look at
a pad's back, orbits round to its front first.

Every pad has the same drive: an entry leg, a half circle whose centre sits
`drive.depth` m behind the front edge and an exit leg, travelled clockwise so a
vehicle's passenger side faces the building at the apex. Nothing has to reverse
or turn on the spot; radii are 6.2–7 m (lane spacing `LANE = 3.4`). The homes have
two lanes: a Seen van waits at the inner apex by the porch; at the Wongs', cars
pass and stop on the outer lane and the aide's car parks on the outer exit leg.

Heights: pavement at street level (`STREET_Y = -0.23`), the pad plinth at
sidewalk level (`PAD_Y = -0.05`), the porch at `PORCH_Y = 0.3` with the new
ramp between. `groundYAt(point)` gives the height under a walker anywhere.

### Settings in this session

| id | kind | position | services |
| --- | --- | --- | --- |
| `home-wong` | home | The Wongs' home (`home-lin` until October 2026): (−84, 12), two-lane drive; the aide's car uses the north street's western reach; `facility` seen-home-wong (below), `pad.back` 8 | home-care, home-health, pill-packs, meals, home-mods, after-hours |
| `pharmacy` | pharmacy | (−84, −22) | pill-packs |
| `home-lin` | home | Mrs. Lin's home, "Lives with her daughter · Seen van door to door" (short "Lin home"): (−84, −56), heading π/2, stub from the west street's southern reach; the Wongs' pad, drive, porch anchors and `facility` (seen-home-wong) | transport |
| `hospital` | hospital | (94, 14), stub from the north street | ed, discharge |
| `specialist` | specialist | Specialty clinic · cardiology, optometry & imaging: (84, −56), 44 × 26 m pad, stub from the south street (below) | specialist, optometry, imaging |
| `partner-adc` | partner-adc | Partner adult day center, "Seen Health floor plan": (4, −68), Seen's Alhambra ground floor stamped on a 62 × 50 m pad | day-program |

## The day (care-day clock, 1 loop second = 40 clock seconds)

| Clock | Where | What |
| --- | --- | --- |
| 8:00–8:55 | Pharmacy | Pharmacist and technician pack and check blister packs; courier loads at 8:52, leaves 9:01. |
| 8:00–8:49 | Home | Mrs. Wong wakes, toilets, washes and dresses her top half on her own; the personal care aide parks at 8:19 (in along the north street's western reach) and is at the front door at 8:29: breakfast and the morning pills at the seated kitchen worktop 8:35–8:43, stockings and shoes on the entry bench. |
| 8:00–8:11 | Lin home | Mrs. Lin wakes (in sight from 8:00:20, past the loop seam) and comes through to breakfast with her daughter at the dining table, 8:07–8:11; her daughter has had the rice porridge on since 8:00. |
| 8:13–8:41 | Lin home | Shoes and cardigan on the entry bench, her daughter helping; the Seen van (livery J) in from the south end of the west street to the apex at 8:15; her daughter out at 8:15, Mrs. Lin at 8:16, down the porch ramp and along the drive; the driver follows her up the van ramp (on board 8:29) and the van leaves at 8:33, south and off the map by 8:41. |
| 8:15–8:26 | Home ↔ center | Alone and light-headed, Mrs. Wong sits down at the foot of the bed and presses her PERS pendant; the response center answers through the console on her nightstand and conferences in Seen's 24/7 nurse line, who keeps her talking and lets her aide know (a call). |
| 8:38 | Lin home | Her daughter back in by the porch step; she works from home at the bedroom-2 desk (to 11:40 and 12:20–14:32), loads the washer (11:47) and has lunch at the kitchen worktop (11:56–12:12). |
| 8:38–9:14 | Hospital | Ambulance in along the north street's eastern reach to the ED bay; its two-person crew gets out of the cab and hands over to the hospitalist at the rear doors (8:52–9:01) and drives off at 9:05. |
| 8:54–9:15 | Home | Mrs. Wong (walker) out of the front door behind her aide, down the new ramp and up the van ramp; the Seen van leaves at 9:15 with the escort aide and driver. |
| 9:03–9:11 | Hospital ↔ center | The hospitalist phones Seen's on-call nurse (the 24/7 nurse line) from the sidewalk: the participant is here (a call). |
| 9:27 | Home | Courier hands the pill packs to the aide; then to the center's rear receiving (10:04–11:28) and back to the pharmacy by 12:40. |
| 9:55–10:45 | Specialty clinic | Drop-off under the canopy, check-in, vitals by the MA, cardiology follow-up 10:17–10:42; van leaves 11:02 and returns by the south and west streets. |
| 10:47–12:40 | Specialty clinic | Diabetic eye exam: a participant with a cane and her Seen escort aide walk up from a Seen ride at the kerb and check in at 11:12; the escort waits in the lobby. The optometric technician calls her in, checks acuity and eye pressure and dilates her eyes (11:36–11:43), then reads her glasses on the lensometer; the optometrist's retina exam at the slit lamp and refraction 11:45–12:01, the report to the Seen PCP. Back in the lobby at 12:13 and out to the ride, passing the next walk-in on the way. |
| 12:08–14:11 | Specialty clinic | Wrist X-ray six weeks after a fall: a participant and her Seen escort aide walk up from the kerb and check in at 12:33. The radiologic technologist calls her in, seats her at the end of the X-ray table with her forearm under the tube (13:01), takes three views from the console behind the shielded window (13:13–13:21) and checks them with her; the radiologist's read goes to the Seen PCP. Out at 13:45. |
| 8:00–12:00 | Partner ADC | Twenty participants settle at the day-room tables (two wheelchair places at table ends); the activities lead welcomes them, the aide serves coffee, the partner nurse charts at the nurse station all day. |
| 9:52–10:45 | Partner ADC | Tai chi on the patio under the slatted awning: eight participants and the lead, out through the front door and along the clinic front, arriving and leaving staggered. |
| 11:00–11:50 | Partner ADC | Visiting Seen PT (walks in from the road end at 10:20) with participant 5 at the parallel bars and participant 6 on seated strength. |
| 11:11–11:40 | Partner ADC | Visiting Seen RN reviews medications at the nurse station with participants 8 and 10, one after the other. |
| 11:40–12:10 | Partner ADC | Tabletop games in the day room with the lead. |
| 12:01–13:03 | Partner ADC | Lunch in the dining room: participants come in staggered from 12:00 to 12:20, the aide sets up and serves, two chairs are left out for the wheelchairs; she clears up until 14:30. |
| 13:20–16:00 | Partner ADC | Seated music led from the front of the day room (the lead sets up from 12:13; walkers and wheelchairs join a little later), then afternoon conversation at the same tables. |
| 10:30–10:55 | Hospital | Rounds at Mr. Wong's bedside: the hospitalist, the case manager and the hospital's discharge nurse plan his discharge. |
| 11:45–13:12 | Home | Van home; the aide meets her and follows her up the ramp and in (12:07); after the clinic: toileting, the assisted shower and dressing, lunch at the dining table; the aide hands over to the OT on the porch at 13:00 and drives off at 13:12. |
| 12:14 | Home | Home-delivered lunch handed to the aide at the front door, a wellness check with Mrs. Wong on the entry bench (meals car on the outer lane; it leaves by the inner lane's exit, round the aide's parked car; back at the center by 13:00). |
| 13:02–14:28 | Home | OT and installer: dry-run toilet and shower transfers with Mrs. Wong, Mr. Wong's side of the bed, the swing-up grab bar fitted (13:48–14:00) while the OT checks the porch ramp, then the sign-off. |
| 13:30–13:50 | Hospital ↔ center | The hospital's discharge nurse steps out of the ward bay and phones Seen's care-transitions nurse at her upstairs desk: medicines, the home health start, meals and the van pickup (a call); then the medication teach-back, and 14:10–14:17 she wheels Mr. Wong under the canopy to the Seen van; van leaves 14:23. |
| 14:39–15:25 | Lin home | Her daughter puts dinner on (14:39), then watches for the van on the porch from 14:49; the van back from the south end (on the map 14:53, apex 15:00); the driver sees Mrs. Lin down its ramp (15:05) and walks behind her along the drive; her daughter meets her at the porch-ramp foot (15:13) and follows her up; in at 15:19 and 15:21; the van leaves at 15:25. |
| 15:08–15:52 | Home | Mr. Wong home: the driver wheels him up the porch ramp to the front door (15:28) and he rolls in beside his armchair; the home health nurse (in at 15:08 from the road end) checks his transfer, vitals and medicines and leaves at 15:52. |
| 15:21–16:00 | Lin home | Tea together on the sofa: her daughter makes jasmine tea (15:26–15:29) and sits with her from 15:34 to the end of the day. |
| 15:40–15:52 | Home ↔ center | 24/7 nurse line call between the upstairs RN and Mr. and Mrs. Wong on speakerphone (a call). |

### Calls

Some touchpoints happen by phone. An interaction with `channel: 'phone'`
(`Interaction` in `activity.ts`; a cast stop's `interaction.channel`) is a
call between members in different places, placed by its first member; the
callers hold the `phone` pose (a handset at the ear) for its window.

| Interaction | Window (s) | Caller → other end |
| --- | --- | --- |
| `home-pers-call` | 23–38.5 | Mrs. Wong, at the foot of her bed (PERS pendant; the console on her nightstand) → `nurse-line-rn` |
| `hospital-ed-call` | 95–107 | `hospitalist`, on the sidewalk by the ED (`edPhone`) → `nurse-line-rn` |
| `hospital-discharge-call` | 495–525 | `hospital-rn`, out in front of the ward bay (`rnPhone`) → `seen-transitions-rn` |
| `after-hours-call` | 690–708 | Mr. and Mrs. Wong in the living room, on speakerphone → `nurse-line-rn` |

Seen's nurses on the phone sit at the perimeter desks of the upstairs open
office (`SEEN_DESKS` in `community-people.ts`, in order along it): the 24/7
nurse line at the corner desk, the care-transitions nurse at the next one.
The nurse line takes the Wongs' calls when their generated cast places them
(`castCall`), so both ends stay in step when the cast is re-timed. The
hospital's callers step out from under a roof first, so the arc rises clear.

The community layer draws every call as an arc (`call-arcs.ts`; the renderer
passes it the played source's interactions and the engine's people): a cubic
curve from just above the caller's head to just above the other end, its
crown `lift` × the span above the higher end (about 20 m between the hospital
and the center, 93 m apart) and its ends rising steeply, so a close shot of
one end shows it climbing out of the frame toward the other. Members within
8 m of each other share an end (the Wongs on speakerphone). The line draws on
from the caller over the call's first 4 loop seconds (eased out, its tip
glowing) and the far end's ring pops in as it arrives; while they talk a
pulse runs out along the line and one comes back (one 3.6 s exchange), each
ring ripples as a pulse reaches it and both breathe; over the last 3 loop
seconds the line retracts into the far end and fades. Draw-on and retraction
are functions of the care-day clock, so a scrubbed story shows the same frame
at the same time; the pulses, breathing and ripples run on wall-clock time
and stop under `prefers-reduced-motion` (`motion: false`), which holds the
fully drawn line for the whole call. An arc shows while its callers are in
the scene (on duty, not indoors or driving) and at least one of its ends is
drawn, so a call to the upstairs nurses also shows when the upper floor is
not (`level: 'ground'`: the viewer's default view, the story's cutaways), its
far end marking where they sit; a wide shot that should show the nurse at her
desk uses `level: 'all'` with the roof off. Arcs hide with the layer
(Community sites, Street & parking context, Plan) and with the people.
Following a call (`followActor('interaction:<id>')`, the activity panel, the
story's cutaway subject) aims at its caller, not at the empty ground between
the two places.

Styling knobs (`CALL_ARC_STYLE`, overridden per layer with `calls.style`):
`color`, `glow` and `pulse` (terracotta `#b0603a`, a soft `#e7b48c` halo and
`#ec7d43` pulses on the paper ground), `width` and `glowWidth` (2 and 12 CSS
px), `ring` and `ringStroke` (7 and 1.6 px), `lift`, `minLift` and `maxLift`
(0.22 × the span, 3–30 m), `above` (0.3 m over the head), `drawOn` and
`retract` (4 and 3 loop s) and `pulsePeriod` and `breathPeriod` (3.6 and
2.4 s). The curve is evaluated and widened in the vertex shader, so it keeps
its pixel width at any zoom and a frame only writes uniforms (nothing is
allocated); one ribbon and one ring geometry are shared by every arc, and
`dispose()` frees them with the arcs' materials.

## The specialty clinic

`specialist`: "Specialty clinic · cardiology, optometry & imaging", (84, −56),
heading 0, a 44 × 26 m pad south of the south street with its stub from
(84, −35.8). Its massing (`buildSpecialist` in `community-pads.ts`, local
`CLINIC`) is a two-storey bar 29.6 m wide whose ground floor is 3.9 m high and
open to the front under a solid upper storey, so the story's and the viewer's
oblique cameras (azimuth 0–0.6, elevation up to about 0.6) look into its rooms.
From west to east (local x): the cardiology exam room (−10 to −2.3: exam chair,
the cardiologist's desk), the lobby under the drop-off canopy (−2.1 to 5.2:
reception desk, two waiting chairs), optometry (5.4 to 10.4) and imaging (10.6
to 17.6, glazed at the front of the east end). Partitions stop 1.6 m short of
the front, leaving a gallery from the lobby to the rooms east of it; room signs
sit on the band above the open front, and a footpath runs from the street
sidewalk to the front beside the drive. Front columns stay off the sight lines
into both new rooms.

- **Optometry**, a mirrored lane: the exam chair faces the mirror on the
  imaging partition with the visual acuity screen behind it on the lobby
  partition (about 7.8 m by way of the mirror), so the phoropter on its arm, its
  two lens wheels in front of the patient's eyes, and the patient's face turn
  toward the cameras. The slit lamp (chin rest, illumination tower, microscope
  and oculars) stands on its instrument table at the chair's right beside the
  optometrist's stool; the instrument stand is behind the chair; the
  technician's counter (autorefractor, lensometer) and the optometrist's desk
  run along the back wall.
- **Imaging**, a digital X-ray room: the table (carbon top, detector housing)
  along the front with the patient's chair at its east end; the tube hangs
  from a telescoping column on a bridge riding two ceiling rails, its
  collimator over the end of the table. The shielded control alcove (lead-lined
  walls 2.4 m high, a lead-glass window toward the table, the console and the
  technologist's chair) fills the front corner by the optometry partition,
  lead aprons on its outer face; the upright detector stands against the back
  wall.

The two new visits are hand-authored `Track`s in the clinic's block of
`community-people.ts`. Both participants come with a Seen escort aide from a
Seen ride at the street kerb, up the sidewalk stub (in on its west half, out
on its east half, where the optometry pair passes the imaging pair at about
12:24), along the footpath and in through the open front east of the canopy;
the clinic's medical assistant checks them in at the front desk, the escort
waits in the lobby and the room's staff call the participant in. Seated holds
at a stool, the console or the X-ray table use `hold(…, { seated: true })`.

| Who (id) | Role | Day (loop s) |
| --- | --- | --- |
| `optometry-participant`, "Seen participant · eye exam" | participant (cane) | In from the kerb 251.5–289.5, check-in, the exam chair 321–364, back to the lobby by 380, out to the ride by 419.5 |
| `optometry-escort`, "Seen escort aide · eye exam" | aide | Leads her in (250–288), checks her in, waits at the lobby chairs, meets her at 379 |
| `optometry-tech`, "Optometric technician" | nurse | At the counter; calls her in (303), acuity, eye pressure and dilating drops 324.5–334, her glasses on the lensometer 337–348 |
| `optometrist`, "Optometrist" | doctor | At the desk; retina exam at the slit lamp 338–350, refraction and results 350–361, the report to the Seen PCP |
| `imaging-participant`, "Seen participant · X-ray" | participant | In from the kerb 373.5–411.5, check-in, at the X-ray table 452–495, back to the lobby by 517, out to the ride by 556.5 |
| `imaging-escort`, "Seen escort aide · X-ray" | aide | Leads her in (372–410), checks her in, waits at the lobby chairs, meets her at 517 |
| `imaging-tech`, "Radiologic technologist" | nurse | At the console; calls her in (427), positions her wrist 444–461, three views behind the shielded window 469–481, checks the images with her 489–495 |

Interactions (category `specialist`, zone `community:specialist`):

| Id | Loop s | Clock | Members |
| --- | --- | --- | --- |
| `optometry-checkin` | 288–297 | 11:12–11:18 | `optometry-escort`, `optometry-participant`, `clinic-ma` |
| `optometry-exam` | 321–364 | 11:34–12:03 | `optometry-participant`, `optometry-tech`, `optometrist` |
| `imaging-checkin` | 410–419 | 12:33–12:39 | `imaging-escort`, `imaging-participant`, `clinic-ma` |
| `imaging-scan` | 452–495 | 13:01–13:30 | `imaging-participant`, `imaging-tech` |

Anchors for camera shots (the story reads them through the layer, at 0.8 m):

| Anchor | Local | World | Shot (zoom · azimuth · elevation) |
| --- | --- | --- | --- |
| `examSeat` | (−6.4, −8.8) | (77.6, −64.8) | 3.0 · 0.22 · 0.42, the story's cardiology cutaway |
| `optoSeat` | (7.4, −8.3) | (91.4, −64.3) | 7–8 · 0.3 · 0.5 around 345 s: the optometrist at the slit lamp, the patient behind the phoropter |
| `imagingTable` | (15.2, −7.35) | (99.2, −63.35) | 7 · 0.3 · 0.5 around 475 s: the technologist at the console, the patient's forearm under the tube |

Above an elevation of about 0.6 the upper storey hides the tops of the
equipment (the tube's column, the acuity screen); from azimuth 0.4 to 0.6 the
alcove's shield wall hides the technologist at the console, and the X-ray
patient is seen past the glazed east end.

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
  url: string;                 // root-relative spec, '/models/seen-alhambra-planning.json'
  frame: Frame;                // facility origin and rotation in the setting's local frame
  levelIds?: string[];         // default: the level at elevation 0
  excludeZoneIds?: string[];   // zones not drawn (Alhambra: 'adjacent')
  excludeObjectIds?: string[]; // objects not drawn, nor obstacles, nor seats
  cutaway?: boolean;           // walls cut at CUTAWAY_HEIGHT (default true; ignores the wall mode)
  labels?: boolean | Record<string, string>; // room plates: rooms ≥ 12 m², or these ids with names
  floorY?: number;             // finished floor (default 0; a home uses PORCH_Y)
  margin?: number;             // footprint to pad edge (default 1.6 m)
  grounds?: string[];          // anchors the site builder draws on (trees, patio corners): ≥ 1 m outside
};
```

`frame` composes with the setting's frame (`facilityWorldFrame`): with
`heading` h a facility point (x, z) lands at `position + (x cos h + z sin h,
−x sin h + z cos h)`. The partner uses `{ position: [0.99, −8.15], heading:
π/2 }`, which puts the plan's west entrance (facility (−14.65, −0.99)) on the
pad's front axis facing the drive; it excludes the `adjacent` zone, the
day-room tables the day program clears and two dining chairs (wheelchair
places), labels six rooms (Day room, Physical therapy, Dining, Nurse station,
Reception, Games lounge) and draws only the ground floor. The pad is derived
from the footprint (`derivePad`: wide enough for footprint + margin, extended
behind the origin by `pad.back` when deep, never smaller than authored, the
front edge and drive fixed; a building past the front edge throws).

At run time the layer (`community-layer.ts`) stamps the instance synchronously
when the facility is the viewer's own model, otherwise when `loadFacility`
resolves (the massing stays until then and on failure); the story and both
static builds ship every facility a registry entry stamps
(`instanceFacilityUrls`). The instance is one merged static group: about 116
draw calls (196 with shadows) and 305k triangles for the partner. People
inside get the floor height from `groundYAt`, which checks instance footprints
first.

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
(about 11 KB gzipped for the partner; the summary is about 3.5 KB). A summary
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
  profileId?: string;                                // a stored profile: the same person and look as another actor
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
    interaction?: { id: string; category: string; label: string; description: string; window?: [number, number];
                    channel?: 'phone' };             // a call placed by this person (Calls)
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

A **scene person**, from the partner's cast: the visiting PT walks in from
the street through the `front` entrance in time for the scene, treats two
participants at the parallel bars and leaves after it; nobody writes her
walks or times.

```json
{
  "entrances": {
    "front": { "inside": [-14.1, -0.99],
               "path": ["sidewalkEnd", "sidewalkPad", "courtA", "courtB", "doorOutside"] }
  },
  "people": [
    { "id": "visiting-pt", "role": "pt", "label": "Visiting Seen physical therapist",
      "variant": 8, "visit": { "entrance": "front" } },
    { "id": "adc-participant-5", "role": "participant", "label": "Day center participant 5", "variant": 14 },
    { "id": "adc-participant-6", "role": "participant", "label": "Day center participant 6", "variant": 15,
      "mobility": "walker" }
  ],
  "scenes": [
    { "id": "partner-pt", "room": "rehab-open", "window": [270, 345], "category": "partner",
      "label": "Visiting Seen PT · strength & balance",
      "description": "A Seen physical therapist visits the partner center for strength and balance …",
      "slots": [
        { "who": "visiting-pt", "action": "treat", "spot": "rehab-parallel-bars", "title": "Strength & balance" },
        { "who": "adc-participant-5", "action": "exercise", "spot": "rehab-parallel-bars",
          "title": "Parallel bars with the Seen PT" },
        { "who": "adc-participant-6", "action": "exercise", "seat": "rehab-ot-chair-participant",
          "title": "Seated strength with the Seen PT" }
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
          "interaction": { "id": "after-hours-call", "category": "after-hours", "channel": "phone",
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
  // home-ot, home-installer, home-rn, hospital-participant; lin-at-home, lin-daughter
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

The partner pad (`partner-adc`, (4, −68), heading 0, pad 62 × 50 m south of
the south street, stub from (4, −35.8)) stamps Seen's own Alhambra ground
floor, `seen-alhambra-planning`, as "Seen Health floor plan": facility frame
`{ position: [0.99, −8.15], heading: π/2 }` so the plan's west entrance and
arrival court face the drive, `adjacent` zone excluded, Seen's cleared
day-room tables (`day-program.json` `removedObjectIds`, explicit in the
registry) and two dining chairs (wheelchair places) excluded, six room plates
(Day room, Physical therapy, Dining, Nurse station, Reception, Games lounge),
margin 1.6 m, `grounds` for the trees, bench and patio corners. Its pad
builder draws the hall massing only when the instance is missing, and the
grounds (four trees, a bench, planting and the tai chi patio under a slatted
pergola in the arrival court's west half) always. Same id as the viewer's model, so
the instance is stamped synchronously with no fetch.

Its cast, `app/data/community/partner-adc.cast.json`, is all scene people:
twenty participants (canes 2, 9 and 20; walkers 6 and 17; wheelchairs 13 and
18), the partner's activities lead, aide and nurse, and visiting Seen PT and
RN (`visit` through the `front` entrance: sidewalk, court walk, west door).
Scenes: morning in the day room (0–360), tai chi for eight on the patio
(outdoor place `patio`, 168–247.5), PT with participants 5 and 6 at the bars
and the OT chair (270–345), the RN's medication reviews with participants 8
and 10 at the nurse station with the partner nurse (286–330), tabletop games
(330–375), lunch in the dining room with staggered arrivals and the two
wheelchair places (362–455), the aide clearing up, music (480–600) and
afternoon conversation (600–720); the partner nurse charts all day.
`keep` pins the ids other code uses (`adc-participant-1…6`, `adc-lead`,
`visiting-pt`, `partner-tai-chi`, `partner-tabletop`, `partner-pt`, which the
story's partner cutaway features). The trace names the zone "Partner ADC ·
Seen layout" and its rooms "Partner ADC · Day room" and so on; Measure counts
one occupancy series for the pad (25 people). Nobody arrives by van yet (see
Roadmap hooks).

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
| Primary bedroom (`home-primary`) | 4.0 × 4.2 | 16.8 | Shared queen bed: her 1.0 m walker side by the en-suite, his 1.6 m wheelchair side with the bed's transfer handle; the PERS base unit beside the lamp on her nightstand |
| Bedroom 2 (`home-bedroom-2`) | 3.18 × 3.4 | 10.8 | Full bed, desk and wardrobe for family |
| Back landing (`home-back-landing`) | 1.6 × 1.65 | 2.6 | Level with the floor; 1:12 back ramp (4.2 m) to the yard |

Senior-friendly features: floor at porch level (no step, 12 mm threshold
plate), 0.90 m clear interior and 1.00 m exterior doors, the 1.18 m hall, seven
1.5 m turning circles (entry, bath, both sides of the bed, kitchen, dining,
porch), toilet centreline 0.45 m from the wall with 1.525 × 1.42 m clear,
grab bars at 0.84–0.88 m, seated worktop, raised laundry, bedroom on the main
floor next to the bath, no rugs, night lights from bed to bath, and a personal
emergency response system (PERS): Mrs. Wong's pendant and its base unit on
her nightstand (`home-primary-pers-console`, kind `pers-console`), whose
speaker the response center talks through. Zones group the
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
| 8:00–8:15 | Mrs. Wong | bedroom, bath | Wakes, toilets on her own (raised seat, bars), washes at the roll-under basin, dresses her top half at the foot of the bed |
| 8:15–8:26 | Mrs. Wong, nurse line | bedroom | Light-headed as she stands: sits back down and presses her PERS pendant; the response center answers through the console on her nightstand and conferences in Seen's 24/7 nurse line, who keeps her talking and lets her aide know (a call) |
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
`home-pers-call` 23–38.5 (a call), `home-meal-meds` 52–64, `home-dressing-am` 71.7–74.2, `home-housekeeping`
152.5–316, `home-return` 330–373, `home-meals` 381–386, `home-toileting`
397–404, `home-bathing` 404–411, `home-dressing-pm` 419.5–425.5,
`home-lunch` 430.5–446, `home-mods` 453–583, `home-grab-bar` 522–540,
`home-ramp-check` 523–548 (on the porch ramp), `home-discharge-arrival`
642–683.5, `home-transfer` 674.5–683.5, `home-health-visit` 683.5–700,
`after-hours-call` 690–708 (a call). The cast keeps `home-personal-care`,
`home-health-visit` and `after-hours-call` at those windows (the story and
the trace read them; `npm run validate:home` checks them), and
`home-pers-call` a call between Mrs. Wong and the nurse line of at least
15 s, over before her aide is in at 44 s.
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
the aide could start at 8:00), wearing her PERS pendant, which is how the
nurse line hears of her dizzy spell before her cardiology visit; bathing and
full dressing follow the clinic, so
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

### Mrs. Lin's home

Mrs. Lin, the story's participant, lives here with her daughter; a Seen van
takes her to the center and brings her home. The `home-lin` pad sits south of
the pharmacy at (−84, −56), heading π/2 (front to the west street), its stub
on the west street's southern reach, which only the fleet's off-site runs
share. It is the Wongs' bungalow again: the registry entry repeats home-wong's
`facility` exactly (seen-home-wong, frame `{ position: [0, −10.8], heading:
−π/2 }`, ground level, porch zone excluded, floor at `PORCH_Y`, the three
plates, margin 1.6 m) on the same 30 × 28 m pad (`back` 8) and two-lane drive
with the same porch, ramp and crossing anchors, so the site builder draws the
same porch, ramp and garden (the home-mods crate and the visitor's stall only
where a home has `crate` and `stall` anchors) and `validate-home.mjs` carries
the registry checks over. Plan frame P → world: world = P + (−94.8, −56). The
plan's own name never surfaces: the zone is "Mrs. Lin's home", rooms read
"Lin home · Kitchen", "Lin home · Second bedroom (family)", plates "Living
room", "Kitchen", "Bath".

Its cast, `app/data/community/home-lin.cast.json`, has two scheduled people:
Mrs. Lin (`lin-at-home`, participant, cane, gait 1.35; `profileId`
arrival-cane and variant 11, the story hero's look) and her daughter
(`lin-daughter`, role `family`: an adult in her fifties in everyday clothes, a
stored profile with her mother's skin tone; gait 1.45). Both come into sight at
0.5 s (her bed and the stove at 8 AM, the sofa at 4 PM: the loop seam stays
hidden), so a shot of the house should start at 0.5 s or later.

| Loop s | Who | Where | What |
| --- | --- | --- | --- |
| 0.5–10 | Mrs. Lin | bedroom, en-suite, hall | Awake on the edge of her bed, then through to the dining nook |
| 0.5–7 | Daughter | kitchen | Rice porridge on the stove, the kettle on |
| 10–15.8 | both | dining table | Breakfast: Mrs. Lin at the north chair, her daughter at the west chair (to 13.5) |
| 17.7–21.8 | both | entry bench | Shoes and cardigan (Mrs. Lin 19–21.8), her daughter at the bench's south end |
| 22.9, 24.1 | both | front door | Out: her daughter first, holding the door, then Mrs. Lin |
| 57–606 | Daughter | bedroom 2, laundry, kitchen | Back in at 57; desk 65–330 and 390–588; washer 340–347; lunch at the kitchen worktop 353.5–378; dinner on 598–606 |
| 614, 659, 661 | both | front door | Her daughter out to watch for the van; Mrs. Lin in, her daughter behind her |
| 660.8–720 | Mrs. Lin | sofa | Home on the sofa; tea with her daughter from 680 |
| 669–720 | Daughter | kitchen, sofa | Jasmine tea for two (669–674), on the sofa beside her from 681 |

Interactions (id · window in loop s · members): `lin-breakfast` 1.5–15.8
(Mrs. Lin, daughter) and `lin-evening` 662–720 (Mrs. Lin, daughter; the story
closes on it near 719.5) in the cast; `lin-van-pickup` 22.5–50 and
`lin-van-dropoff` 630–661 (Mrs. Lin, daughter, `lin-van-driver`) in
`community-people.ts`. Category `home`. The cast keeps `lin-at-home`,
`lin-daughter`, `lin-breakfast` and `lin-evening`.

Door passes and the legs that fill the holes (`HOLE_LEGS`):

| Who | In / out at the front door (s) | Outside (hole legs) |
| --- | --- | --- |
| Mrs. Lin | out 24.1, in 659 | `linDayLeg`: across the porch and down the ramp, her daughter 0.9 m behind, and along the drive (1.45 m/s) to the van ramp at 41.3; up it ahead of the driver, on board 43.7–62 (out of sight at her seat while the van is off the map: "Her day at the Seen center"), on board again 620–637; down the van ramp, along the drive with the driver behind her, met by her daughter at the porch-ramp foot (649.5–650.5), up the ramp and in |
| Daughter | out 22.9, in 57; out 614, in 661 | Out ahead to the porch, falling in behind her mother there and walking her to the van, seeing her off and back in by the porch step; out on the porch watching for the van, down the ramp to `rampFootSouth`, up it behind her mother and in |

Both have a `before 0–0.5` hole with no leg (the placeholder stays hidden).
The driver, `lin-van-driver` (hand-authored), is at the wheel while the van is
on the map and out of sight at his seat while it is off it; at the pickup he
walks round the nose to the ramp (28.6), follows her up it and steps through
the sliding door to his seat (45); at the drop-off he waits by the ramp,
walks 0.9 m behind her to the porch ramp, hands over to her daughter (651.5)
and walks back (666.3).

The van is `van-lin`, "Seen van · door to door", on the fleet body in livery J
(the Wongs' is I; the fleet's A–H). It comes in from the south end of the west
street on its inner lane (fading in from 12.5 s), round the drive to the inner
apex (22.5–50: door 24.5–47.7, ramp 26.5–47.2) and out along the outer lane,
off the map by 62; back 620–630, at the apex 630–667.5 (door 632–644, ramp
634–643), off the map by 679.5. On that reach it follows Van A's first arrival
in (Van A there 11–18 s; nearest fleet van 1.04 m, Van B on the other lane at
15 s), and in the afternoon it comes back on as Van A leaves the map with the
center's Mrs. Lin (622.5 s) and turns into the drive before Van B comes in
(631 s); street cars never use the reach.

Two actors represent Mrs. Lin in the composed day: the center's
(`arrival-cane` in the base loop, `hero-lin` in the story) and the network's
`lin-at-home`. They share the profile, so she is drawn the same, but Measure
and the trace count them as two participants: from 11.5 s (Van A brings the
center's Mrs. Lin in from off site) to 62 s (her own van leaves the map) both
are in sight, so one merged timeline would put her in two places at once. In
the afternoon the hand-over is already clean: Van A leaves the map with her at
622 s as her own van comes back on at 620–622 s.

Places for framing her home (world x, z): pad centre (−88, −56); front door
(−91.6, −56.4), porch (−90.3, −56.4), porch ramp top (−90.3, −59.4) and foot
(−90.3, −65.9); the van at the apex (−83.2, −56) with its ramp foot (−87.1,
−55.8); dining table (−94.7, −60.9); the sofa, Mrs. Lin (−93.1, −55.2) and her
daughter (−94.2, −55.2); bed (−99.4, −52.7). Through the layer:
`frame('home-lin')` and `instance('home-lin').roomCenter('home-living' |
'home-dining' | 'home-kitchen' | 'home-primary' | 'home-bedroom-2')`, or the
registry anchors `door`, `porch`, `rampTop`, `rampFoot`.

## In the story

The scroll story (docs/STORY.md) features these interactions in two ways, a
public contract that `node scripts/build-scenario.mjs --check` checks (each
must exist in the composed story source, at its setting, overlapping its
window by at least 4 s, the featured ones together covering 60 % of it).

**Mrs. Lin's day** visits her own home twice as cutaway chapters, following
her stand-in `lin-at-home` (`heroAlias`):

| Chapter | Setting | Featured interactions | Camera anchor |
| --- | --- | --- | --- |
| `home-am` | `home-lin` | `lin-van-pickup` | `porch` |
| `home-pm` | `home-lin` | `lin-van-dropoff`, `lin-evening` | `porch` |

and closes in her living room on `lin-evening` (instance room `home-living`).

**The closing highlights** (`highlights` in the scenario) look in on one
service each, on its own clock:

| Highlight | Setting | Featured interactions | Camera anchor |
| --- | --- | --- | --- |
| `medication` | `pharmacy` | `pharmacy-packing` | `counterBack` |
| `day-center` | `partner-adc` | `partner-line-dance` | the pad (instance) |
| `specialists` | `specialist` | `specialist-visit` | `examSeat` |
| `optometry` | `specialist` | `optometry-exam` | `optoSeat` |
| `imaging` | `specialist` | `imaging-scan` | `imagingTable` |
| `discharge` | `hospital` | `hospital-discharge-call` | `rnPhone`, revealing the call |
| `home-mods` | `home-wong` | `home-grab-bar` | instance room `home-bath` |
| `after-hours` | `hospital` | `hospital-ed-arrival`, `hospital-ed-call` | `edPhone` |
| `pers` | `home-wong` | `home-pers-call` | instance room `home-primary`, revealing the call |

Keep those interaction ids, room ids and anchor names stable when re-timing a
cast or rebuilding a pad; the story reads anchors through the layer
(`settings`, `frame(id)`, `instance(id).roomCenter(room)`), never through world
coordinates, and falls back to the pad centre when an anchor disappears. A
call reveal reads the call's two ends from its members' sampled positions.

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
(Seen's nurses' desks are found by zone and asset) or from `CENTER_LOT`. Use
`zoneId: settingZone(id)` and `levelId: 'site'`. Add interactions with one of
the categories `home`, `pharmacy`, `specialist`, `hospital`, `partner`,
`after-hours`; a call between two places is one with `channel: 'phone'`, the
caller first, and the callers in the `phone` action for its window (Calls).

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
npm run validate:home
```

The Wongs' home: the specification validates, stays under 150 kB with no
textures and is formatted like `prepare-public-models.mjs` writes it; every gap
between a wall run's segments is a scheduled door ≥ 0.9 m (interior) or ≥ 1.0 m
(exterior) and passes a wheelchair straight through; no furniture overlaps
other furniture or walls, stacked items rest on something (the PERS console on
a nightstand's top, beside its lamp); the seven 1.5 m
turning circles are clear on the navigation grid (explicit options: no
removals, reservations or excluded zones); every room is reachable from the
front door at wheelchair (0.37 m) and walker (0.33 m) clearance; every asset
builds and the home kinds come out at their declared size from boxes and
cylinders in defined materials; the registry frame meets the door anchor and
the porch slab, keeps the building ≥ 1 m from the drive and each room name
readable on its plate (≥ 90 % in the room and clear of floor items); and the
cast names community actors and keeps the contract windows and the PERS call,
clears furniture
and walls at every stop, routes every walk on the instance grid in the time its
gap allows (door passes at the door, a resident's arrival at a point at her
first stop), and its generated tracks (`community-casts.json`) keep people
≥ 0.6 m apart on foot (0.55 m seated). Mrs. Lin's home must stamp the plan
exactly as the Wongs' does, on the same pad, drive and porch anchors (so the
registry checks hold for it); its cast gets the same checks (a cane walks at
up to 1.45 m/s, the story's limit for her), and `lin-evening` must cover
700–720 s.

## Roadmap hooks

- **Partner ADC scenario.** The Seen layout, its cast and the visiting PT and
  RN are in place; a Seen van drop at its drive (8:30, pickup 3:30) is one
  more `van-…` itinerary plus riders arriving through the `front` entrance.
- **Replicate a building.** Any facility specification can be stamped on a
  pad (`facility`): the partner day center and the Wongs' home are, with their
  people generated inside (`HOLE_LEGS` for the home's outdoor parts), and Mrs.
  Lin's home stamps the Wongs' plan a second time. A second Seen center is
  another entry with a `seen-center` kind.
- **One Mrs. Lin.** Her network and center tracks share a profile. Once her
  morning no longer overlaps (Van A bringing the center's Mrs. Lin in only
  after her own van has left the map), Measure can group participants by
  profile as it already groups staff, and the trace's person view can merge
  the two into one timeline: home, van, center, van, home.
- **Network of centers.** The camera framing (`frame()`), the zone naming
  (`community:<id>`) and the view (`community`) already treat settings as a
  set; a hub-and-spoke network is more settings plus vehicles whose legs join
  the ring at the right lanes.
