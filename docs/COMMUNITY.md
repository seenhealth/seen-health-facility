# Distributed care around the center

Seen Health does not only care for people inside the Alhambra building. The
same care team runs home care with personal care aides, home health visits,
pharmacy pill-pack delivery, home-delivered meals, home modifications, escorted
specialist appointments, hospital admissions with discharge coordination and a
24/7 nurse line, joined by door-to-door transport. The model builds those
settings *around* the center, in the same scene, on the same 720 s care-day
clock and with the same engine and presentation palette, so it reads as one
distributed care system. Everything is data first: a partner adult day center
or a second Seen center is another registry entry.

Everything here is illustrative. Pads sit on the paper ground beyond the ring
streets, massing is schematic and timings are compressed onto the care-day
clock; no participant records are used.

## Files

| File | Role |
| --- | --- |
| `app/model/community-settings.ts` | The registry (`careSettings`): kind, name, position, heading, pad size, access road, horseshoe drive, anchors, services, accent. Frame helpers (`toWorld`, `lanePath`, `lanePose`, `groundYAt`). No three.js. |
| `app/model/community-pads.ts` | `buildCareSetting(setting, mat)`: plinth, drive band, stub and sidewalk, label plate, trees and the building massing per kind. |
| `app/model/community-vehicles.ts` | `communityVehicles` itineraries (dwell/drive legs) with each vehicle's name, roof decor and livery, `sampleCommunityVehicle(id, time)` pure samplers (with the fade at the map edge), `registerCommunityVehicles(registry)` (the samplers under their names), lane and turning helpers, car and ambulance bodies. |
| `app/model/community-people.ts` | `communitySource(model)`: the cast, touchpoint interactions and the `community` view as a `SourceExtension` composed into the care-day source. |
| `app/model/community-layer.ts` | `buildCommunityLayer(model, mat)`: pads + vehicle bodies, `tick(time)`, `frame(settingId?)` camera framings and the network `bounds` / `shadowExtent`. |
| `app/model/alhambra-source.ts` | `alhambraSource(model, base)`: the care day exactly as the viewer plays it (base loop + community layer + fleet crew), and `alhambraVehicles()`, pure samplers under the engine's vehicle ids. |
| `scripts/validate-community-traffic.mjs` | `npm run validate:community`: clearance, driving and cast checks (below). |
| `public/models/seen-home-wong.json` | The Wongs' home as a schema 2.0 facility specification (below), for the `home-lin` pad. |
| `app/model/home-assets.ts` | `buildHomeAsset(spec, material)`: bed, nightstand, wardrobe, kitchen range, grab bars, swing-up bar, bed rail, hospital bed and ramp kinds, called first by `buildAsset`. |
| `app/data/community/home-lin.cast.json` | The Wongs' ADL day inside the home, the input of the instance cast pipeline (below). |
| `scripts/validate-home.mjs` | `npm run validate:home`: the home's plan, assets, registry frame and cast. |

Wiring: `alhambraSource(model, base)` composes the Alhambra care day once,
`withFleetCrew(composeSources(base, communitySource(model)))`, memoised per base
loop. The renderer, the Measure panel (metrics and trace), the story scenario
(`composedStorySource`), `scripts/sim-report.mjs` and `scripts/validate-trace.mjs`
all read it, so every count, trace and report describes the people the scene
animates (203 in the base loop). When the played source carries the `community`
view, `renderer.ts` passes `registerCommunityVehicles` to `createActivity`
(which rejects a seat in an unregistered vehicle), builds the layer, ticks it,
sizes the sun's shadow camera from the network's bounds while the layer is
visible, and exposes `focusSetting(id?)` and `view('community')`.

`ViewerState.community` (default on, the **Community sites** toggle under
Layers) shows or hides the layer. The pads live in the site context, so they
also hide with **Street & parking context** and stay out of Plan. The engine
hides the layer's people through its view (`hiddenSources`, matched against
`ActorSpec.sourceId`), so the people count, walking-path lines and follow
targets follow the toggle; site-level people (the community cast and the fleet
drivers) show only with the site context, at every level.

The activity panel lists the new touchpoint categories. `computeMetrics` and
the sim report (`npm run sim:report`) fold them into one participant bucket,
"Care at home & in the community", and the trace summary counts participants
with a community touchpoint. The settings are zones of the composed source
(`ActivityData.zones`, `community:<id>`), so occupancy and the trace name them;
on-site counts and staff time by role cover the center.

## The registry

```ts
export type CareSetting = {
  id: string; kind: SettingKind; name: string; subtitle: string;
  position: Vec2; heading: number;
  pad: { w: number; d: number; back?: number }; // back: growth behind the origin (instance chassis)
  road: { from: Vec2; to: Vec2 };            // stub centre-line, street edge → pad edge
  drive: { depth: number; radius: number; lanes: 1 | 2 }; // horseshoe drive-through
  apron: { w: number; d: number };           // paved drop-off under the apex
  anchors: Record<string, Vec2>;             // door, porch, bed, counter … (world)
  services: string[];
  accent: string;
  facility?: CareFacility;                   // a facility spec stamped on the pad (SPEC-facility-instance §5.1)
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
ramp between. `groundYAt(point)` gives the height under a walker anywhere.

### Settings in this session

| id | kind | position | services |
| --- | --- | --- | --- |
| `home-lin` | home | The Wongs' home (the id predates the rename): (−84, 12), two-lane drive; the aide's car uses the north street's western reach; `facility` seen-home-wong (below), `pad.back` 8 | home-care, home-health, pill-packs, meals, home-mods, after-hours |
| `pharmacy` | pharmacy | (−84, −22) | pill-packs |
| `hospital` | hospital | (94, 14), stub from the north street | ed, discharge |
| `specialist` | specialist | (84, −56), stub from the south street | specialist |
| `partner-adc` | partner-adc | (8, −64) | day-program |

## The day (care-day clock, 1 loop second = 40 clock seconds)

| Clock | Where | What |
| --- | --- | --- |
| 8:00–8:55 | Pharmacy | Pharmacist and technician pack and check blister packs; courier loads at 8:52, leaves 9:01. |
| 8:18 | Home | Personal care aide arrives by car (in along the north street's western reach), personal care on the porch 8:35–8:47. |
| 8:38–9:14 | Hospital | Ambulance in along the north street's eastern reach to the ED; hospitalist takes the handoff (8:41–9:05). |
| 9:15 | Home | Mrs. Wong (walker) down the new ramp and up the van ramp; the Seen van leaves at 9:15 with the escort aide and driver. |
| 9:27 | Home | Courier hands the pill packs to the aide; then to the center's rear receiving (10:04–11:28) and back to the pharmacy by 12:40. |
| 9:55–10:45 | Specialist clinic | Drop-off under the canopy, check-in, vitals by the MA, cardiology follow-up 10:17–10:42; van leaves 11:02 and returns by the south and west streets. |
| 10:00–12:00 | Partner ADC | Tai chi with six participants, tabletop games, visiting Seen PT with two of them 11:00–12:00. |
| 10:30–10:55 | Hospital | Rounds with the Seen liaison nurse, hospitalist and case manager. |
| 11:40 | Home | Van home; aide meets her, follows her up the ramp and stays for the indoor care (toileting, shower, dressing, lunch); she walks back to her car at 12:57 and drives off at 13:12. |
| 12:05 | Home | Home-delivered lunch and wellness check (meals car on the outer lane; it leaves by the inner lane's exit, round the aide's parked car; back at the center by 13:00). |
| 13:00–14:30 | Home | OT and installer fit grab bars and finish the ramp rails with Mrs. Wong. |
| 13:30–13:50 | Hospital | Discharge huddle; 14:10–14:16 Mr. Wong wheeled to the Seen van; van leaves 14:23. |
| 15:07 | Home | Mr. Wong home: driver wheels him up the porch ramp; home health nurse (walked in from the road end at 14:40) does vitals and medication reconciliation. |
| 15:40–15:52 | Home ↔ center | 24/7 nurse line call between the upstairs RN and Mrs. Wong. |

## The Wongs' home

The `home-lin` pad gets a real floor plan: `public/models/seen-home-wong.json`,
a schema 2.0 facility specification of an illustrative senior-friendly
bungalow, informed by typical Alhambra and San Gabriel Valley two-bedroom
listings and by 2010 ADA Standards / ICC A117.1 guidance. It is not a real
home or address and uses no participant records. Until the facility-instance
chassis (SPEC-facility-instance) stamps it on the pad, the scene keeps the
bungalow massing and the porch choreography.

### Plan

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

### On the pad

`careSettings` `home-lin` carries `facility` (the `CareFacility` type of
SPEC-facility-instance §5.1, read by the chassis):
`{ id: 'seen-home-wong', url: '/models/seen-home-wong.json', frame: { position:
[0, −10.8], heading: −π/2 }, levelIds: ['ground'], excludeZoneIds:
['home-zone-porch'], cutaway: true, floorY: PORCH_Y, labels: {…}, margin: 1.6 }`
and `pad.back: 8` (the pad may grow 8 m west; front edge, drive and anchors stay
put). The frame puts the front door's opening 0.10 m from the `door` anchor and
the front wall's face on the porch slab's back edge (local z −7.6, `HOME_PORCH`
in `community-pads.ts`); the drawn footprint stays 0.10 m clear of the porch
slab, which the pad keeps drawing (hence the excluded porch zone), and more
than 3 m from the drive. The derived pad would need `back` 5.8 m and a 16.2 m
width. Name plates (Living room, Kitchen, Bath) go only where the name reads
at the room's label anchor: the instance's 3.6 m floor plate would put a
bedroom's or the dining nook's name under the bed or the table, and the bath's
name stays short to clear the shower.

### The ADL day

`app/data/community/home-lin.cast.json` is the day inside the house for the
build-time cast pipeline (`scripts/build-community-tracks.mjs`). People keep
their community ids; positions are facility-local; each stop is a stationary
hold over its `window` and the gap to the next stop is the walk, sized for the
person's `gait`; `arrive`/`leave` are front-door passes of visitors and `away`
windows the residents' times out (outdoor legs stay in `community-people.ts`).
Seats on chairs and benches are object ids (`seatPose`); seats on a bed, sofa,
toilet or shower are a point, a heading and `seat`. Each interaction is defined
once, on one stop, with the other actors in `with`.

| Clock | Who | Where | What |
| --- | --- | --- | --- |
| 8:00–8:21 | Mrs. Wong | bedroom, bath | Wakes, toilets on her own (raised seat, bars), washes at the roll-under basin, dresses her top half in the dressing chair |
| 8:29–8:43 | Aide, Mrs. Wong | kitchen | Aide in at 8:29: check-in, congee on the front-control range, breakfast and the morning blister at the seated worktop |
| 8:48–8:53 | Aide, Mrs. Wong | entry bench | Stockings, Velcro shoes and jacket; out to the van at 8:53 |
| 9:41–11:30 | Aide | whole house | Files the new pill packs, remakes the bed for two, laundry, cleans bath and kitchen, clears the route to the armchair |
| 12:06–12:17 | Mrs. Wong, aide, meals driver | entry bench, front door | Rest after the clinic; meal hand-off at the door at 12:14 |
| 12:23–12:44 | Mrs. Wong, aide | bath, bedroom | Toileting help, transfer, assisted shower on the fold-down seat, dressing |
| 12:47–12:59 | Aide, Mrs. Wong | kitchen, dining | Lunch heated and set up, visit logged; aide out at 12:59, car away at 1:12 |
| 1:02–2:28 | OT, installer, Mrs. Wong | dining, bath, bedroom, ramp | Bar heights, dry-run toilet and shower transfers, bed handle, swing-up bar, ramp check, sign-off |
| 1:47–3:30 | Mrs. Wong | sofa | Rests; welcomes Mr. Wong home |
| 3:08–3:46 | Home health nurse | kitchen, dining, living | Washes, sets up, meets Mr. Wong, checks his transfer technique, vitals, medication reconciliation, warning signs |
| 3:28 | Mr. Wong | front door → beside the armchair | Rolls himself in over the flush threshold |
| 3:40–3:52 | Mr. and Mrs. Wong, nurse line | living room | Nurse-line call on speakerphone |

Interactions (id · window in loop s): `home-personal-care` 30–72,
`home-meal-meds` 51–65, `home-dressing-am` 72.5–77.5, `home-housekeeping`
152.5–316, `home-return` 330–373, `home-meals` 381–386, `home-toileting`
395.5–401.5, `home-bathing` 401.5–411, `home-dressing-pm` 418–426.5,
`home-lunch` 430.5–446, `home-mods` 453–583, `home-grab-bar` 522–540,
`home-ramp-check` 523–548 (on the porch ramp), `home-discharge-arrival`
642–683.5, `home-transfer` 674.5–683.5, `home-health-visit` 683.5–700,
`after-hours-call` 690–708. `home-van-boarding` and `home-pill-drop` stay
outdoors in `community-people.ts`.

Assumptions: an illustrative composite, not a care plan. Mrs. Wong toilets,
washes and starts dressing on her own before the aide arrives (in another plan
the aide could start at 8:00); bathing and full dressing follow the clinic, so
the aide's visit runs to 1:12 PM (her car's dwell, `community-vehicles.ts`).
The couple share the queen bed with a transfer handle on his side (no hospital
bed yet; `home-hospital-bed` is a catalog entry). Mr. Wong keeps his wheelchair
all day until a per-segment mobility override exists, so the nurse checks his
transfer beside the armchair. The swing-up bar and the bed handle are fitted
during the day but drawn installed. Until the chassis lands, the aide's
community track goes indoors (hidden) after the clinic return and walks back
to her car for 1:12 PM.

Sources (the specification's `referencePages`): Redfin, Homes.com and Zillow
Alhambra 2-bedroom listings; typical room-size guides; 2010 ADA Standards and
U.S. Access Board guides; ICC A117.1 Type A dwelling units; HUD aging in place
and visitability; wheelchair, walker and hospital-bed clearance guides; CDC
STEADI *Check for Safety*; PACE (42 CFR 460) and CAPABLE.

**Integration once the chassis lands.** Keep `home-lin.facility` and
`pad.back` (drop the local `CareFacility` copy for the chassis's), keep the
porch as `community-pads.ts` draws it here (with `HOME_PORCH`) in the pad's
site part, which stays when the house massing is replaced, run `npm run
build:community`, then stitch each home actor's outdoor legs to the cast's door
times in `community-people.ts` and remove the porch and hidden segments and
the duplicated interactions there: Mrs. Wong out at 80.5 (van sill at 108.5 as
today), back at the door at 370; the aide in at 44 (a direct path from the
stall, ≤ 25 m), out 79–152.5 (van, courier hand-over) and 318.5–372 (meeting
the van), out at 449.5, hand-over to the OT on the porch 450–453, car at 469;
the OT in at 453, out 520–551 for the ramp check, gone at 582.5; the installer
in at 454, gone at 572.5; the nurse in at 642.5, gone at 709.5; Mr. Wong
pushed to the door by 672 (drive crossing and porch ramp shortened to fit),
the driver handing over the folder at the door and back at the van by 700.
Re-time `home-van-boarding` to 80.5–113.

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

**A person.** Use the `Track` builder in `community-people.ts`: `hold`,
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
on foot (including the center's cast), and every interaction names known
actors, categories and zones. Screenshots for review: `?site=alhambra&debug=1`, then
`window.__viewer.focusSetting('hospital')` or `view('community')`.

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
cast keeps today's ids and the contract windows, clears
furniture and walls at every stop, routes every walk on the instance grid in
the time its gap allows and keeps people ≥ 0.6 m apart on foot (0.55 m seated).

## Roadmap hooks

- **Partner ADC scenario.** The pad, patio and cast are in place; a Seen van
  drop at its drive is one more `van-…` itinerary plus riders (out of scope
  this session).
- **Replicate a building.** `buildCareSetting` is a function of a setting, so
  a second home or clinic is a registry entry; to replicate the Alhambra
  building itself as a spoke, add a `seen-center` kind whose builder places the
  facility JSON's massing on a pad.
- **Network of centers.** The camera framing (`frame()`), the zone naming
  (`community:<id>`) and the view (`community`) already treat settings as a
  set; a hub-and-spoke network is more settings plus vehicles whose legs join
  the ring at the right lanes.
