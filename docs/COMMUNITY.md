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
| `app/model/community-vehicles.ts` | `communityVehicles` itineraries (dwell/drive legs), `sampleCommunityVehicle(id, time)` pure samplers, lane and turning helpers, car and ambulance bodies. |
| `app/model/community-people.ts` | `communitySource(model)`: the cast, touchpoint interactions and the `community` view as a `SourceExtension` composed into the care-day source. |
| `app/model/community-layer.ts` | `buildCommunityLayer(model, mat, vehicles)`: pads + vehicle bodies, registers the samplers, `tick(time)`, `frame(settingId?)` camera framings. |
| `scripts/validate-community-traffic.mjs` | `npm run validate:community`: clearance, driving and cast checks (below). |

Wiring is minimal: `renderer.ts` builds the layer for models without a bespoke
`contextStyle` (Alhambra), composes `communitySource()` into the activity
source, ticks the layer, widens the sun's shadow camera to ±130 m while the
layer is visible, and exposes `focusSetting(id?)` and `view('community')`.
`ViewerState.community` (default on) shows or hides the layer together with the
site context. The activity panel lists the new touchpoint categories and the
Measure panel folds them into one participant bucket, "Care at home & in the
community".

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
| `home-lin` | home | (−84, 12), two-lane drive | home-care, home-health, pill-packs, meals, home-mods, after-hours |
| `pharmacy` | pharmacy | (−84, −22) | pill-packs |
| `hospital` | hospital | (94, −6) | ed, discharge |
| `specialist` | specialist | (72, 64), north street extended to reach it | specialist |
| `partner-adc` | partner-adc | (8, −64) | day-program |

## The day (care-day clock, 1 loop second = 40 clock seconds)

| Clock | Where | What |
| --- | --- | --- |
| 8:00–8:55 | Pharmacy | Pharmacist and technician pack and check blister packs; courier loads at 8:52, leaves 9:01. |
| 8:12 | Home | Personal care aide arrives by car, personal care on the porch 8:35–8:47. |
| 8:39–9:07 | Hospital | Ambulance arrival at the ED; hospitalist takes the handoff. |
| 9:15 | Home | Mrs. Lin (walker) down the new ramp and up the van ramp; the Seen van leaves at 9:15 with the escort aide and driver. |
| 9:27 | Home | Courier hands the pill packs to the aide; then to the center's rear receiving (10:04–11:20) and back to the pharmacy by 12:20. |
| 9:55–10:45 | Specialist clinic | Drop-off under the canopy, check-in, vitals by the MA, cardiology follow-up 10:17–10:42; van leaves 10:58. |
| 10:00–12:00 | Partner ADC | Tai chi with six participants, tabletop games, visiting Seen PT with two of them 11:00–12:00. |
| 10:30–10:55 | Hospital | Rounds with the Seen liaison nurse, hospitalist and case manager. |
| 11:40 | Home | Van home; aide meets her and waves her up the ramp; aide leaves 12:23. |
| 12:05 | Home | Home-delivered lunch and wellness check (meals car on the outer lane). |
| 13:00–14:30 | Home | OT and installer fit grab bars and finish the ramp rails with Mrs. Lin. |
| 13:30–13:50 | Hospital | Discharge huddle; 14:10–14:16 Mr. Lin wheeled to the Seen van; van leaves 14:23. |
| 15:07 | Home | Mr. Lin home: driver wheels him up the porch ramp; home health nurse (walked in from the road end at 14:40) does vitals and medication reconciliation. |
| 15:40–15:52 | Home ↔ center | 24/7 nurse line call between the upstairs RN and Mrs. Lin. |

## Adding things

**A setting.** Add a `define({...})` entry to `careSettings` with local
anchors, and a builder in `community-pads.ts` (`BUILDERS[kind]`) if it is a new
kind. The drive, plinth, stub, sidewalk and label come for free. Keep the pad
outside the ring streets (north z≈41.3, south z≈−32.3, west x≈−44.4, east x≈54)
and reach it from a lane that flows the right way (`RING` in
`community-vehicles.ts`); if there is no street where the stub should join, add
a `streetExtension`.

**A vehicle.** Add an itinerary to `communityVehicles`: `dwell(from, to, pose,
phase, { door, ramp })` and `drive(from, to, path, phase, { pre, post })` legs
covering the parts of the day it is on screen, a `rest` pose for the remainder,
and `seats` for riders. Build street legs from `zRun`/`xRun`, `corner`,
`arrive(setting, lane, fromLane, stopDeg)` and `depart(...)`. The layer
registers every vehicle with the engine, so a rider's segment with `vehicleId`
and `seat` moves with it and the camera can follow it.

**A person.** Use the `Track` builder in `community-people.ts`: `hold`,
`walk`, `hidden`, `ride`, ending exactly at 720 s. Walks are straight lines
between anchors on the pad (there is no navigation grid outside the building);
keep ≥ 0.6 m from props and other people. Use `zoneId: settingZone(id)` and
`levelId: 'site'`. Add interactions with one of the categories `home`,
`pharmacy`, `specialist`, `hospital`, `partner`, `after-hours`.

## Validation

```bash
npm run validate:community
```

Over the whole day at 50 Hz: community vehicles keep ≥ 0.5 m from the fleet
vans, delivery trucks, parked cars and each other and ≥ 0.85 m from the street
cars; drive nose-first with no reversing or hairpins (radius over any 3 m of
travel ≥ 5 m; the designed arcs are ≥ 6.2 m); keep doors and ramps shut while
moving; are periodic and continuous across the loop seam. The cast: contiguous
0–720 tracks, walks ≤ 1.65 m/s, seats only in registered vehicles, steps of at
most 2 m into or out of a seat, nobody within 0.55 m of anyone else on foot
(including the center's cast), and every interaction names known actors,
categories and zones. Screenshots for review: `?site=alhambra&debug=1`, then
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
