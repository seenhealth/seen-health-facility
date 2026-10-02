# “A day at Seen Health” scroll story

A scroll-driven walkthrough of one participant’s day (Mrs. Lin, 84), from her front door to the Alhambra center and home again, rendered with the real 3D facility model and the care network around it, with an overlay of the eleven-person interdisciplinary team (IDT) that evolves as the reader scrolls. After her day, a rapid run of nine highlights looks in on everything else the same team coordinates (medication, a partner day center, specialists, optometry, imaging, hospital discharge, home modifications, after-hours care and emergency transport, a personal emergency response system), each on its own clock, and the story closes where it began: at her home at four, with her daughter. It ships two ways:

| Where | Entry | Use |
| --- | --- | --- |
| Main app route | `app/story/page.tsx` → [**Live story**](https://seen-health-facility.xingpersonal.chatgpt.site/story) | Part of the [live 3D center site](https://seen-health-facility.xingpersonal.chatgpt.site/) (`npm run dev`, then open `/story` locally). |
| Standalone static site | `story/site/index.html` + `story/site/main.tsx`, built by `vite.story.config.ts` | For seenhealth.org or any static host, including iframe embedding. |

Both render the same component, `StoryExperience` (`app/story/story-experience.tsx`).

## Run, build and preview

```bash
npm run dev:story       # standalone dev server (reads assets straight from public/)
npm run build:story     # → dist/story-site/
npm run preview:story   # serve the built site locally
```

`dist/story-site/` contains only what the story needs at runtime (about 3.8 MB before compression):

- `index.html`, `assets/*.js|css` (React, three.js and the facility renderer; the renderer, schema and hero tracks load as separate chunks after the opening paints)
- `models/seen-alhambra-planning.json` (facility specification, minified)
- the facility specifications the community layer stamps on its pads as instances, minified: every URL from `instanceFacilityUrls()` (`app/model/community-settings.ts`), today `models/seen-home-wong.json` (the Wongs' home and Mrs. Lin's) and `models/seen-partner-adhc.json` (the partner adult day center). The stage loads them from the story's asset base (`loadFacility` in `app/story/stage.ts`).
- every texture the facilities reference (`reference/photos/*-sign.png`, `reference/fleet/final-vans.png`), collected from the specifications at build time
- `brand/seen-health-horizontal.png`, `favicon.svg`

No GLB files, source drawings or photo archives are copied. The source-plan image (`site.image`) is only shown in the 3D app’s plan mode, so the story replaces it with a 1 px stand-in and does not ship it.

### Configuration (build-time environment variables)

| Variable | Default | Effect |
| --- | --- | --- |
| `STORY_BASE` | `./` | Public base path. The default relative base works from any folder **when the page URL ends in `/`** (e.g. `https://seenhealth.org/day/`). Set an absolute base such as `/day-at-seen/` if the host may serve the page without a trailing slash. |
| `VITE_STORY_EXPLORE_URL` | [the live 3D model](https://seen-health-facility.xingpersonal.chatgpt.site/) | Target of “Explore the 3D center”. |
| `VITE_STORY_LEARN_MORE_URL` | `https://seenhealth.org/` | Target of the logo and “Learn more about Seen Health” (placeholder; confirm the page). |

```bash
STORY_BASE=/day-at-seen/ VITE_STORY_LEARN_MORE_URL=https://seenhealth.org/pace npm run build:story
```

## Deploy

Upload the contents of `dist/story-site/` to any static host (Cloudflare Pages, Netlify, S3/CloudFront, GitHub Pages, a CMS media folder, or a sub-folder of the existing website).

- **Sub-folder:** copy the folder to e.g. `/day-at-seen/` and link to `/day-at-seen/` (trailing slash), or build with `STORY_BASE=/day-at-seen/`.
- **MIME types:** `.json` must be served as `application/json`; `.js` as `text/javascript`.
- **Caching:** files in `assets/` are content-hashed and can be cached for a year (`immutable`). Keep `index.html` and `models/*.json` on a short cache so copy and model updates show up.
- **Compression:** enable gzip or Brotli; the facility JSON compresses from 640 kB to about 65 kB.

## Embed in another page

Add `?embed=1` to hide the story’s own header (logo and 3D link) so it sits inside a host page:

```html
<iframe
  src="https://seen-health-facility.xingpersonal.chatgpt.site/story?embed=1"
  title="A day at Seen Health: one participant and her care team"
  style="display:block;width:100%;height:100vh;height:100svh;border:0"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

The story scrolls inside the frame, so give the iframe a full viewport of height and place it where the host page can scroll past it. Links (“Learn more”, “Explore the 3D center”) open in the top-level window. For the richest experience, link to the story as its own page rather than embedding it.

## How it works

Native scrolling drives everything; nothing hijacks the wheel. Each section of the page is a *beat*:

`opening → reveal → team → 16 chapters (Mrs. Lin’s day, three of them cutaways) → finale → network → 9 highlights → peace → closing call to action`

A single animation loop (`app/story/director.ts`) reads `window.scrollY`, works out the active beat and its progress, and derives:

| Output | How it is derived |
| --- | --- |
| Sim clock | Each chapter scrubs linearly through its *scrub window* (loop seconds, `scrub` in `app/story/data.ts`, from `scrubWindows` in `app/sim/story-timeline.ts`) from the middle of the previous transition to the middle of the next. A cutaway keeps its step `window`; a hero chapter next to a cutaway is clipped on screen to give it room (never extended), so the scrub windows meet end to start and time is continuous across Mrs. Lin’s day. The scenario windows, and so the compiled tracks, are never changed by the trimming. Opening, reveal and team hold at 8:00 AM; the finale, the network beat, the close and the call to action at 4:00 PM. Each highlight scrubs its own `window`, on its own clock. The clock eases toward the scroll time (it jumps at a cut) and is pushed to the renderer with `activity.setOptions({ time })` (`playing: false`). |
| Camera | Every beat has a shot (`app/story/choreography.ts`): zoom, azimuth, elevation, a slow push-in and drift across the beat, and an anchor: an explicit point, the step’s room centre, or a `place` read from the community layer (below). When the subject is within the shot’s `radius` of the anchor, the target leans toward it (`follow`): Mrs. Lin in her chapters (her stand-in `heroAlias` at home), the first featured interaction’s people in the kitchen and in each highlight (`actorPosition('interaction:<id>')`). Near a boundary the two shots are blended by scroll position, except at a cut (below); a critically damped spring then smooths the result and `viewer.setShot()` places the camera. The target is offset in screen space so the subject sits in the free part of the stage (between the chapter card and the team panel; above and right of a highlight’s title; below the closing lines). |
| Cuts | A boundary into or out of a highlight is a cut, not a flight across the map. The director calls `hooks.onCut(direction)`; the page sweeps a skewed paper shutter with a leaf-green leading edge across the stage (Web Animations API, about 0.34 s in, 0.07 s hold, 0.52 s out, direction following the scroll) and returns when it covers the stage. Until then the stage holds the beat it is leaving; once covered, clock, view state and camera jump to the new beat in one frame, the camera landing a little wide and turned (`CUT_SETTLE`) so the spring carries it into the framing as the shutter leaves: every cut arrives in motion. |
| View state | Opening, finale, network: exterior with roof (the network aerial shows the center as one building among the places it serves). Reveal: the roof and upper floor float up (`stack`), then settle into a cutaway. Team: interior, `level: 'all'`, so nothing pops before the upstairs huddle. Ground chapters: `level: 'ground'`, cutaway walls, the step’s room highlighted (`room`), following `stops` for recreation. Upstairs meetings: `level: 'all'` so the building stays in view. The kitchen cutaway: its room highlighted like a hero chapter. Cutaways at a care setting, highlights and the close: interior at `level: 'ground'` with no room highlighted (site-level people, the community cast, show at `ground`). `viewer.update()` runs only when the state changes. |
| Page | Each section gets `--vis`, `--enter` and `--p` CSS variables (card fades and parallax) and `data-active` while it is the active beat (kinetic type, below); the root gets `--ui`, `--rail`, `--veil` (the finale only), `--open`, `--day`, `--glow` (the close) and `--hl` (highlight progress, 0–9), and the `story-ui-on`, `story-rail-on` and `story-hl-on` classes. React only re-renders when the beat or the handoff phase changes. |
| Team overlay | Involved roles light up and draw spokes to Mrs. Lin; handoff *k* of *n* draws as an arrow once the chapter passes 30–66 % (`handoffAt`), with its note as a caption. Team meetings (all eleven roles, hero not present) draw the full mesh. At home the hub reads “At home”; in the kitchen “Her lunch”. Touchpoints and handoffs count every step of her day. The team panel and the rail fade out at the finale; the highlights have their own progress bar. |

`prefers-reduced-motion` cuts between shots without the shutter, removes parallax, kinetic type and draw-on animation, and shows final states. Without WebGL the stage shows a soft gradient and every text, overlay and navigation element still works.

Camera angles: world axes are +x east, +z north, y up. The camera sits at target + (sin azimuth, ·, cos azimuth), so azimuth 0 puts it north of the subject looking south, π/2 east of it looking west, and the renderer’s default iso (≈ 0.58) sees the north and east faces, which is where the care settings’ fronts face.

## Motion

The story moves on two clocks: scroll (camera, sim time, card fades and parallax, the highlight progress) and wall time (everything that should feel crafted rather than scrubbed). The wall-time layer lives in `app/story/story.css` and the `onCut` hook in `story-experience.tsx`; it is all transforms, opacity and filters, so it composites without layout.

- **Kinetic type.** Every headline is split into words (`Words` in `story-experience.tsx`, with the full sentence kept for screen readers). When its section becomes the active beat, each word rises out of its own mask on an exponential ease-out, 55 ms after the one before (`--stagger`; the display lines of the opening and the close wait for each other through `--d`). The rest of the card follows in a short cascade: kicker, body (300 ms), chips and lists one by one (45 ms apart).
- **Highlights.** A lower-third card over the scene: an outlined two-digit numeral that slides in ahead of everything else, the service in small capitals, the title, one sentence, the time and place, and who was involved. A segmented bar at the foot of the stage fills with scroll across all nine (`--hl`).
- **The cut.** The shutter and the settle described under *Cuts* above.
- **Call reveals.** Highlights built on a phone call (`reveal: 'call'` in their shot) open on the caller, hold for a moment, then ease the target to the middle of the call’s two ends while the shot pulls back (`push` below 1), so the arc drawn between the callers (`app/model/call-arcs.ts`: it draws on from the caller, carries a pulse each way while they talk and retracts when they hang up) and the place it reaches come into view together: the hospital’s discharge nurse and Seen’s nurse at the center; Mrs. Wong’s pendant and the nurse line.
- **The close.** The three display lines resolve from a 14 px blur one after another (about a second apart), the lede last; a warm soft-light wash (`--glow`) settles over the stage, and a paper wash at the top keeps the lines legible.
- **Small things.** Mrs. Lin’s name tag springs up from its stem; legend and network lists stagger in; the swimlane draws column by column.

## Cutaways: at home and in the kitchen

A step with `placement.mode: 'cutaway'` compiles no hero tracks. It features interactions that already exist in the composed care day and keeps its own window on the timeline; the hero chapters beside it are clipped on screen (never extended). Three of Mrs. Lin’s sixteen chapters are cutaways:

- **At home** (`home-am`, `home-pm`): her own moments at her home (setting `home-lin`, the senior-friendly bungalow stamped on its pad west of the west street), where the compiled hero never goes. `heroAlias: 'lin-at-home'` names the actor who stands in for her there: the camera follows her, her name tag tags her, and the step counts toward her touchpoints and handoffs like any other. The morning features the Seen van at her door (`lin-van-pickup`: her daughter walks her out to the driver); the afternoon the van bringing her home (`lin-van-dropoff`) and tea with her daughter on the sofa (`lin-evening`, which also holds the closing shot). People outside the team (“Her daughter”) are chips in the grey partner style and a dot in the swimlane’s Partners lane.
- **In the kitchen** (`kitchen`): the center’s lunch delivery reaching the kitchen just before her lunch, with no `settingId`, its `zoneId` and `roomId` naming the center’s kitchen. The card says “Meanwhile, in the kitchen”; the room is highlighted like a hero chapter’s and the camera leans toward the delivery.

`build-scenario` (and `--check`) enforces the placement rules: the window lies in a gap between Mrs. Lin’s stops (trimming may shorten a hero chapter but never cuts into a stop, hides its focus time or leaves its kicker outside it, and every hero chapter keeps at least 20 s); the kicker time lies inside the window; every featured interaction exists in the composed story source, happens where it is shown (the setting’s zone, or the step’s zone in the center; the site, and for a setting the center’s upstairs office, also count), overlaps the window by at least 4 s, and together they cover at least 60 % of it; a `heroAlias` is an actor of the composed source and takes part in a featured interaction; `roles` and handoff ends are IDT ids.

## The highlights and the close

**Network beat.** After the finale the camera pulls out to the whole care network (`NETWORK_SHOT`, `place: 'network'`): the target and zoom come from the community layer’s `frame()` (its zoom times the shot’s `zoom` factor, so the framing follows as settings are added), seen from the east. The card (“Beyond one day · Everything else, handled.”) indexes the nine highlights that follow.

**Highlights.** `highlights` in `app/data/scenarios/day-in-the-life.json` is a separate track from Mrs. Lin’s steps: one quick look per service, in this order, each cutting to its own place and time and scrubbing its own `window` over a 104vh beat. Shots are keyed by highlight id in `HIGHLIGHT_SHOTS` (`app/story/choreography.ts`); every one anchors through the community layer (`place`), so it survives pads moving.

| # | Highlight `id` | Service | Window (s) | Clock | Setting · anchor | Features |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `medication` | Medication | 28–58 | 8:18–8:38 AM | `pharmacy` · `counterBack` | `pharmacy-packing` |
| 2 | `day-center` | Partner day center | 298–328 | 11:18–11:38 AM | `partner-adc` · `hall` | `partner-line-dance` (fourteen dancers on the dance floor, the stage behind), `partner-pt` (the visiting Seen PT in the light rehab next door) |
| 3 | `specialists` | Hospital specialists | 208–238 | 10:18–10:38 AM | `specialist` · `examSeat` | `specialist-visit` |
| 4 | `optometry` | Optometry | 334–360 | 11:43 AM–12:00 PM | `specialist` · `optoSeat` | `optometry-exam` (slit lamp, then refraction) |
| 5 | `imaging` | Imaging | 452–482 | 1:01–1:21 PM | `specialist` · `imagingTable` | `imaging-scan` (positioning, then the technologist at the console) |
| 6 | `discharge` | Hospital discharge | 497–523 | 1:31–1:48 PM | `hospital` · `rnPhone` (reveal) | `hospital-discharge-call`: the hospital’s discharge nurse phones Seen’s care-transitions nurse at the center |
| 7 | `home-mods` | Home modifications | 522–540 | 1:48–2:00 PM | `home-wong` · room `home-bath` | `home-grab-bar` |
| 8 | `after-hours` | After-hours care & emergency transport | 80–106 | 8:53–9:11 AM | `hospital` · `edPhone` | `hospital-ed-arrival` (the ambulance crew’s handoff), `hospital-ed-call` (the hospitalist phones Seen’s on-call nurse) |
| 9 | `pers` | Personal emergency response | 24–38 | 8:16–8:25 AM | `home-wong` · room `home-primary` (reveal) | `home-pers-call`: Mrs. Wong’s pendant reaches the response center and Seen’s 24/7 nurse line |

`build-scenario` checks each highlight like a cutaway (featured interactions exist at its setting, overlap the window by at least 4 s and cover 60 % of it; the kicker time lies inside the window; roles are IDT ids; ids are unique), but places no timeline constraint on it: highlights are not part of her day.

**The close.** The peace beat cuts from the last highlight back to Mrs. Lin’s living room at 4:00 PM (`PEACE_SHOT`, a slow high push-in), where she and her daughter have tea on the sofa: “Home by four. Tea with her daughter. We’ve got them.” The call to action holds the same shot at its end state under the page’s paper wash.

## Chapters and scenario steps

Chapters come straight from `steps` in `app/data/scenarios/day-in-the-life.json`, in order. Camera shots are keyed by step `id` in `CHAPTER_SHOTS` (`app/story/choreography.ts`); unknown ids fall back to `DEFAULT_CHAPTER_SHOT` framed on the step’s room, or `DEFAULT_CUTAWAY_SHOT` on a cutaway’s pad. “Scrub” is the clock range the chapter plays on screen; `npm run build:scenario` prints the same timeline with focus times and featured interactions, then the highlights.

| # | Step `id` | Window (s) | Scrub (s) | Clock | Room / anchor | Shot (zoom · azimuth · elevation) | Follows / features |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `huddle` | 0–40 | 0–20 | 8:00 AM–8:13 AM | `upperfit-conference` | 4.10 · 0.62 · 0.72 | no (team meeting) |
| 2 | `home-am` (cutaway) | 20–50 | 20–50 | 8:13 AM–8:33 AM | `home-lin` · `porch` | 3.30 · 1.10 · 0.78 | `lin-at-home`; `lin-van-pickup` |
| 3 | `pickup` | 40–120 | 50–120 | 8:33 AM–9:20 AM | arrival kerb & ramp | 2.70 · −0.72 · 0.50 | yes, 40 m |
| 4 | `checkin` | 120–140 | 120–140 | 9:20 AM–9:33 AM | `lobby-arrival` | 4.60 · −0.35 · 0.62 | yes |
| 5 | `clinic` | 140–178 | 140–178 | 9:33 AM–9:58 AM | `clinic-nurse` | 4.40 · 0.28 · 0.68 | yes |
| 6 | `therapy` | 178–240 | 178–240 | 9:58 AM–10:40 AM | `rehab-open` | 2.90 · −0.50 · 0.62 | yes |
| 7 | `program` | 240–290 | 240–289 | 10:40 AM–11:12 AM | `day-open` | 2.60 · 0.30 · 0.66 | yes |
| 8 | `kitchen` (cutaway) | 289–304 | 289–304 | 11:12 AM–11:22 AM | `kitchen-prep` · hand-over (10.2, 2.4) | 6.20 · 0.55 · 0.85 | `kitchen-lunch-delivery` |
| 9 | `lunch` | 290–350 | 304–350 | 11:22 AM–11:53 AM | `dining-1421` | 4.20 · 0.62 · 0.66 | yes |
| 10 | `social-work` | 350–392 | 350–392 | 11:53 AM–12:21 PM | `admin-side-office` | 5.20 · 0.85 · 0.72 | yes |
| 11 | `personal-care` | 392–440 | 392–440 | 12:21 PM–12:53 PM | `rear-wc-east` | 5.20 · 0.50 · 0.92 | yes |
| 12 | `recreation` | 440–525 | 440–525 | 12:53 PM–1:50 PM | `admin-workstations` → `admin-conference` (stops) | 4.60 · −0.30 · 0.95 | yes |
| 13 | `farewell` | 525–552 | 525–552 | 1:50 PM–2:08 PM | `lobby-arrival` | 4.60 · −0.45 · 0.60 | yes |
| 14 | `ride-home` | 552–624 | 552–624 | 2:08 PM–2:56 PM | arrival kerb & ramp | 2.60 · −0.95 · 0.48 | yes, 40 m |
| 15 | `home-pm` (cutaway) | 624–668 | 624–668 | 2:56 PM–3:25 PM | `home-lin` · `porch` | 3.30 · 0.95 · 0.80 | `lin-at-home`; `lin-van-dropoff`, `lin-evening` |
| 16 | `care-plan` | 624–720 | 668–720 | 3:25 PM–4:00 PM | `upperfit-conference` | 3.30 · 1.05 · 0.74 | no (team meeting) |

Small screens multiply chapter and highlight zoom by 1.45 (the stage there is about 56 % of the viewport height); the opening, team and network beats use 1.3.

To tune a shot, open the story with `?debug=1` and run `__story.director.debug()` in the console; it returns the current camera and sim time, the goals they are easing toward, and the beat.

## Editing the story

- **Copy:** chapter kicker, title and body are the `kicker`, `title` and `body` fields of each step in `app/data/scenarios/day-in-the-life.json`; a highlight’s are its `label`, `kicker`, `title` and `body` in `highlights`. Keep the kicker format `"9:35 AM · Clinic"`; the time before `·` also labels the rail, the day-flow strip and the swimlane, and must fall inside the chapter’s scrub window or the highlight’s window (`build-scenario` fails otherwise). Opening, reveal, team, finale, network, close and call-to-action copy lives in `app/story/story-experience.tsx`. Headlines animate word by word, so keep them short.
- **Who is involved:** a step’s `roles` (IDT ids from `app/data/care-team.json`) drive the ring, chips, day-flow dots, swimlane and touchpoint count. `handoffs` (`from`, `to`, `note`) drive the arrows, captions and the handoff count. `partners` names people outside the team (her daughter, the caterer, the hospital’s nurse) as grey chips and in the swimlane’s Partners lane.
- **Team roster and colors:** `app/data/care-team.json` (`members[].color`, `short`, `title`, `focus`, `group`; `palette`).
- **New steps:** add them to the scenario; a chapter, rail tick, day-flow node and swimlane column appear automatically. Add a `CHAPTER_SHOTS` entry for a tailored camera.
- **Cutaways:** a step with `placement: { "mode": "cutaway" }`, `heroPresent: false` and `interactionIds` (the first is the camera’s follow target). At a care setting: `settingId` (a `careSettings` id), `zoneId: "community:<settingId>"`, `roomId: null`, and `heroAlias` when it is Mrs. Lin’s own moment there. In the center: no `settingId`; `zoneId` and `roomId` name the zone and room. Give a setting’s shot a `place` (`{ setting, anchor }`, plus `room` for a facility instance) rather than a world `anchor`, so it survives the pads moving or being rebuilt.
- **Highlights:** add an entry to `highlights` (`id`, `label`, `kicker`, `title`, `body`, `settingId`, `interactionIds`, `window`, `roles`, `partners`) and a `HIGHLIGHT_SHOTS` entry; the beat, its numeral, the network index and a progress segment appear automatically.
- **Hero tracks:** `app/story/hero-source.ts` re-exports `storyActivitySource` (`app/sim/story-source.ts`): the base loop with Mrs. Lin’s compiled itinerary, companions and IDT meetings (`npm run build:scenario`); the renderer composes the community layer and fleet crew on top.

## Files

| File | Role |
| --- | --- |
| `app/story/page.tsx` | `/story` route (metadata + component) |
| `app/story/story-experience.tsx` | Page structure, sections, chrome, rail, stage bootstrapping |
| `app/story/director.ts` | Per-frame scroll → clock (scrub windows, highlight windows), camera (`place` anchors from the community layer), cuts, view state, CSS variables, hero name tag |
| `app/story/choreography.ts` | Shot tables (chapters, highlights, the close), the cut settle, interpolation helpers |
| `app/story/stage.ts` | Facility loading (and the instance loader), asset base rewriting, WebGL check, pixel-ratio cap |
| `app/story/idt-panel.tsx`, `idt-geometry.ts` | Team ring (intro, step and mesh modes), arrows, captions, counters, day-flow strip |
| `app/story/swimlane.tsx` | Finale flowchart (roles × moments), with a table for screen readers |
| `app/story/data.ts` | Typed access to the scenario (steps and highlights) and team JSON, derived totals, scrub windows |
| `app/sim/story-timeline.ts` | `scrubWindows` (hero chapters clipped around cutaways) and the highlight type; shared by the story, `build-scenario` and `test/story-timeline.test.ts` |
| `app/story/hero-source.ts` | Activity tracks and hero id adapter |
| `app/story/story.css` | All story styles and motion, scoped to `.story-root` / `.story-*` |
| `story/site/index.html`, `story/site/main.tsx`, `vite.story.config.ts` | Standalone build. The entry sits in `story/site/` because a root-level `story/index.html` would be served by the vinext dev server in place of the `/story` route. |
