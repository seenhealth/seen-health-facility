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
| `app/model/community-vehicles.ts` | `communityVehicles` itineraries (dwell/drive legs) with each vehicle's name, roof decor and livery, `sampleCommunityVehicle(id, time)` pure samplers (with the fade at the map edge), lane and turning helpers, car and ambulance bodies. |
| `app/model/community-people.ts` | `communitySource(model)`: the cast, touchpoint interactions and the `community` view as a `SourceExtension` composed into the care-day source. |
| `app/model/community-layer.ts` | `buildCommunityLayer(model, mat, vehicles)`: pads + vehicle bodies, registers the samplers with their names, `tick(time)`, `frame(settingId?)` camera framings and the network `bounds` / `shadowExtent`. |
| `app/model/alhambra-source.ts` | `alhambraSource(model, base)`: the care day exactly as the viewer plays it (base loop + community layer + fleet crew), and `alhambraVehicles()`, pure samplers under the engine's vehicle ids. |
| `scripts/validate-community-traffic.mjs` | `npm run validate:community`: clearance, driving and cast checks (below). |

Wiring: `alhambraSource(model, base)` composes the Alhambra care day once,
`withFleetCrew(composeSources(base, communitySource(model)))`, memoised per base
loop. The renderer, the Measure panel (metrics and trace), the story scenario
(`composedStorySource`), `scripts/sim-report.mjs` and `scripts/validate-trace.mjs`
all read it, so every count, trace and report describes the people the scene
animates (203 in the base loop). `renderer.ts` builds the layer when the played
source carries the `community` view, ticks it, sizes the sun's shadow camera
from the network's bounds while the layer is visible, and exposes
`focusSetting(id?)` and `view('community')`.

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
  position: Vec2; heading: number; pad: { w: number; d: number };
  road: { from: Vec2; to: Vec2 };            // stub centre-line, street edge → pad edge
  drive: { depth: number; radius: number; lanes: 1 | 2 }; // horseshoe drive-through
  apron: { w: number; d: number };           // paved drop-off under the apex
  streetExtension?: { from: Vec2; to: Vec2; width: number };
  anchors: Record<string, Vec2>;             // door, porch, bed, counter … (world)
  services: string[];
  accent: string;
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
| `home-lin` | home | The Wongs' home (the id predates the rename): (−84, 12), two-lane drive; the north street extended west for the aide's car | home-care, home-health, pill-packs, meals, home-mods, after-hours |
| `pharmacy` | pharmacy | (−84, −22) | pill-packs |
| `hospital` | hospital | (94, 14), stub from the north street, extended east to reach it | ed, discharge |
| `specialist` | specialist | (84, −56), stub from the south street, extended east to reach it | specialist |
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
| 11:40 | Home | Van home; aide meets her and waves her up the ramp; aide drives off at 12:22. |
| 12:05 | Home | Home-delivered lunch and wellness check (meals car on the outer lane, back at the center by 13:00). |
| 13:00–14:30 | Home | OT and installer fit grab bars and finish the ramp rails with Mrs. Wong. |
| 13:30–13:50 | Hospital | Discharge huddle; 14:10–14:16 Mr. Wong wheeled to the Seen van; van leaves 14:23. |
| 15:07 | Home | Mr. Wong home: driver wheels him up the porch ramp; home health nurse (walked in from the road end at 14:40) does vitals and medication reconciliation. |
| 15:40–15:52 | Home ↔ center | 24/7 nurse line call between the upstairs RN and Mrs. Wong. |

## Adding things

**A setting.** Add a `define({...})` entry to `careSettings` with local
anchors, and a builder in `community-pads.ts` (`BUILDERS[kind]`) if it is a new
kind. The drive, plinth, stub, sidewalk and label come for free. Keep the pad
outside the ring streets (north z≈41.3, south z≈−32.3, west x≈−44.4, east x≈54)
and reach it from a lane that flows the right way (`RING` in
`community-vehicles.ts`); if there is no street where the stub should join, add
a `streetExtension`. Turn it (`heading`) so its front faces +x or +z; the
framing, the label plate and the shadow camera follow from the registry.

**A vehicle.** Add an itinerary to `communityVehicles`: `dwell(from, to, pose,
phase, { door, ramp })` and `drive(from, to, path, phase, { pre, post })` legs
covering the parts of the day it is on screen, a `rest` pose for the remainder,
and `seats` for riders. Build street legs from `zRun`/`xRun`, `corner`,
`arrive(setting, lane, fromLane, stopDeg)` and `depart(...)`. The layer
registers every vehicle with the engine under its `name`, so a rider's segment
with `vehicleId` and `seat` moves with it, the camera can follow it and the
trace names it. Presentation is data: roof `decor` (`'pharmacy-cross'`,
`'meal-cooler'`, built by `VEHICLE_DECOR`) and, for a Seen van on the fleet body,
a livery `variant` letter after the center's own fleet. A Seen van's `seats`
come from `FLEET_VAN_SEATS`, the furniture its body draws. A vehicle that
enters or leaves the map does so at `OFF_MAP` (near the ends of the drawn
streets, beyond every pad and the Community framing) with `fade: 'in'` or
`'out'` on that leg, so it fades over the last `FADE_METRES` (8 m) instead of
appearing or vanishing in view.

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
