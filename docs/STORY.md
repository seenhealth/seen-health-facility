# “A day at Seen Health” scroll story

A scroll-driven walkthrough of one participant’s day (Mrs. Lin, 84) at the Alhambra center and the care network around her, rendered with the real 3D facility model, with an overlay of the eleven-person interdisciplinary team (IDT) that evolves as the reader scrolls. Six times the camera cuts away (“meanwhile”) to the homes, partner sites and hospital the same team serves, then returns to her. It ships two ways:

| Where | Entry | Use |
| --- | --- | --- |
| Main app route | `app/story/page.tsx` → **`/story`** | Part of the 3D center site (`npm run dev`, then open `/story`). |
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
- the facility specifications the community layer stamps on its pads as instances (the Wongs’ home plan), minified: `vite.story.config.ts` emits every URL from `instanceFacilityUrls()` (`app/model/community-settings.ts`) when that export exists, and only the main facility until then; the stage loads them from the story’s asset base (`facilityLoader` in `app/story/stage.ts`). The partner day center reuses the Alhambra layout and needs no extra file.
- every texture the facilities reference (`reference/photos/*-sign.png`, `reference/fleet/final-vans.png`), collected from the specifications at build time
- `brand/seen-health-horizontal.png`, `favicon.svg`

No GLB files, source drawings or photo archives are copied. The source-plan image (`site.image`) is only shown in the 3D app’s plan mode, so the story replaces it with a 1 px stand-in and does not ship it.

### Configuration (build-time environment variables)

| Variable | Default | Effect |
| --- | --- | --- |
| `STORY_BASE` | `./` | Public base path. The default relative base works from any folder **when the page URL ends in `/`** (e.g. `https://seenhealth.org/day/`). Set an absolute base such as `/day-at-seen/` if the host may serve the page without a trailing slash. |
| `VITE_STORY_EXPLORE_URL` | the live 3D model | Target of “Explore the 3D center”. |
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
  src="https://seenhealth.org/day-at-seen/?embed=1"
  title="A day at Seen Health: one participant and her care team"
  style="display:block;width:100%;height:100vh;height:100svh;border:0"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

The story scrolls inside the frame, so give the iframe a full viewport of height and place it where the host page can scroll past it. Links (“Learn more”, “Explore the 3D center”) open in the top-level window. For the richest experience, link to the story as its own page rather than embedding it.

## How it works

Native scrolling drives everything; nothing hijacks the wheel. Each section of the page is a *beat*:

`opening → reveal → team → network → 19 chapters (13 with Mrs. Lin, 6 across the network) → finale → closing call to action`

A single animation loop (`app/story/director.ts`) reads `window.scrollY`, works out the active beat and its progress, and derives:

| Output | How it is derived |
| --- | --- |
| Sim clock | Each chapter scrubs linearly through its *scrub window* (loop seconds, `scrub` in `app/story/data.ts`, from `scrubWindows` in `app/sim/story-timeline.ts`) from the middle of the previous transition to the middle of the next. A cutaway keeps its step `window`; a hero chapter next to a cutaway is clipped on screen to give it room (never extended), so the scrub windows meet end to start and time is continuous across chapters. The scenario windows, and so the compiled tracks, are never changed by the trimming. Opening/reveal/team/network hold at 8:00 AM, the finale at 4:00 PM. The clock eases toward the scroll time and is pushed to the renderer with `activity.setOptions({ time })` (`playing: false`). |
| Camera | Every beat has a shot (`app/story/choreography.ts`): zoom, azimuth, elevation, a slow push-in and drift across the beat, and an anchor: an explicit point, the step’s room centre, or a `place` read from the community layer (below). When the subject is within the shot’s `radius` of the anchor, the target leans toward it (`follow`): Mrs. Lin in her chapters, the first featured interaction’s people in a cutaway (`actorPosition('interaction:<id>')`; a far-off centroid, such as the nurse line’s call split between the center and the home, is ignored). Near a boundary the two shots are blended by scroll position; a critically damped spring then smooths the result and `viewer.setShot()` places the camera. The target is offset in screen space so the subject sits between the chapter card and the team panel. |
| View state | Opening, finale: exterior with roof. Reveal: the roof and upper floor float up (`stack`), then settle into a cutaway. Team and network: interior, `level: 'all'`, so nothing pops before the upstairs huddle. Ground chapters: `level: 'ground'`, cutaway walls, the step’s room highlighted (`room`), following `stops` for recreation. Upstairs meetings: `level: 'all'` so the building stays in view. Cutaways: interior at `level: 'ground'` with no room highlighted (site-level people, the community cast, show at `ground`). `viewer.update()` runs only when the state changes. |
| Page | Each section gets `--vis`, `--enter` and `--p` CSS variables (card fades and parallax); the root gets `--ui`, `--rail`, `--veil`, `--open` and `--day`. React only re-renders when the beat or the handoff phase changes. |
| Team overlay | Involved roles light up and draw spokes to Mrs. Lin; handoff *k* of *n* draws as an arrow once the chapter passes 30–66 % (`handoffAt`), with its note as a caption. Team meetings (all eleven roles, hero not present) draw the full mesh. The network beat lights every role without spokes around a hub that reads “One team / Many places”; a cutaway lights its roles with dashed spokes to a hub showing the setting (“Pharmacy / Meanwhile”). Touchpoints and handoffs count Mrs. Lin’s steps only; a third counter, “Across the network”, appears from the network beat and counts the cutaways’ roles. The day-flow strip and the rail mark cutaways with small diamonds in the network colour, and the strip labels them “8:20 AM Meanwhile · Pharmacy”. |

`prefers-reduced-motion` cuts between shots, removes parallax and draw-on animation, and shows final states. Without WebGL the stage shows a soft gradient and every text, overlay and navigation element still works.

Camera angles: world axes are +x east, +z north, y up. The camera sits at target + (sin azimuth, ·, cos azimuth), so azimuth 0 puts it north of the subject looking south, π/2 east of it looking west, and the renderer’s default iso (≈ 0.58) sees the north and east faces, which is where the care settings’ fronts face.

## The network beat and the cutaways

**Network beat.** After the team introduction the camera pulls out to the whole care network (`NETWORK_SHOT`, `place: 'network'`): the target and zoom come from the community layer’s `frame()` (its zoom times the shot’s `zoom` factor, so the framing follows as settings are added). It is seen from the east (azimuth ≈ π/2), where the network is about 115 m across the screen against about 210 m from the default iso, so all five pads and the center fit between the card and the team panel. The card (“Beyond the building · One team, many places.”) lists the places the cutaways visit.

**Cutaways.** Scenario steps with `placement.mode: 'cutaway'` (`docs/SIMULATION.md`) add no tracks: they name a care setting (`settingId`), the community interactions they feature (`interactionIds`) and external `partners`. On screen they are shorter chapters (150vh against 190vh) with a “Meanwhile, across the network” line, discipline chips plus grey partner chips, and their handoffs. Their shots anchor through the layer, never through world coordinates: `place: { setting, room?, anchor? }` resolves to the centre of `room` in the setting’s facility instance once one is stamped (`instance(id).roomCenter`), else to the registry anchor named `anchor` (the places the cast uses, e.g. `porchSeat`, already in world coordinates), else to the pad centre (`frame(setting)`). Without the community layer the camera falls back to the building. Mrs. Lin’s name tag only shows in her own chapters.

**Counters.** Mrs. Lin’s touchpoints (43) and handoffs (15) neither jump nor reset during a cutaway. The “Across the network” counter adds each cutaway’s roles (13 by the end), and the finale adds a fifth total, “moments across the network” (6), between handoffs and the shared care plan; the finale copy mentions them too. The swimlane gives cutaways narrower columns with a setting badge, hollow discipline dots, a dashed band and a dot in a “Partners” lane naming the external roles; Mrs. Lin’s path joins her own moments and passes behind them. Its screen-reader table has a “Where” column (“With Mrs. Lin”, “At the center, team meeting” or the setting).

**The Wongs’ morning (integration point).** At this commit the featured interaction `home-personal-care` runs 52–71 s on the porch, so `network-home-am` plays 50–58 s, the pharmacy 26–50 s, and the pickup chapter opens at 58 s with Van A already docked and its ramp down. When the home instance re-times personal care indoors to ≈ 30–72 s, move the two steps to `HOME_AM_RETIME.target` in `app/sim/story-timeline.ts` (home 34–42 s with kicker “8:25 AM”, pharmacy 26–34 s) and run `npm run build:scenario`; the pickup chapter then opens on the docking at 42 s. `node scripts/build-scenario.mjs --check` prints a READY notice as soon as the composed source covers the target window, and another when `partner-rn-review` exists (feature it in `network-partner` with the `rn` role).

## Chapters and scenario steps

Chapters come straight from `app/data/scenarios/day-in-the-life.json`, in order. Camera shots are keyed by step `id` in `CHAPTER_SHOTS` (`app/story/choreography.ts`); unknown ids fall back to `DEFAULT_CHAPTER_SHOT` framed on the step’s room, or `DEFAULT_CUTAWAY_SHOT` on a cutaway’s pad. “Scrub” is the clock range the chapter plays on screen; `npm run build:scenario` prints the same timeline with focus times and featured interactions.

| # | Step `id` | Window (s) | Scrub (s) | Clock | Room / anchor | Shot (zoom · azimuth · elevation) | Follows / features |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `huddle` | 0–40 | 0–26 | 8:00 AM–8:17 AM | `upperfit-conference` | 4.10 · 0.62 · 0.72 | no (team meeting) |
| 2 | `network-pharmacy` (cutaway) | 26–50 | 26–50 | 8:17 AM–8:33 AM | `pharmacy` · `counterBack` | 2.90 · 1.30 · 0.50 | `pharmacy-packing` |
| 3 | `network-home-am` (cutaway) | 50–58 | 50–58 | 8:33 AM–8:38 AM | `home-lin` · `porchSeat` | 3.30 · 1.12 · 0.72 | `home-personal-care` |
| 4 | `pickup` | 40–120 | 58–120 | 8:38 AM–9:20 AM | arrival kerb & ramp | 2.70 · −0.72 · 0.50 | yes, 40 m |
| 5 | `checkin` | 120–140 | 120–140 | 9:20 AM–9:33 AM | `lobby-arrival` | 4.60 · −0.35 · 0.62 | yes |
| 6 | `clinic` | 140–178 | 140–178 | 9:33 AM–9:58 AM | `clinic-nurse` | 4.40 · 0.28 · 0.68 | yes |
| 7 | `therapy` | 178–240 | 178–232 | 9:58 AM–10:34 AM | `rehab-open` | 2.90 · −0.50 · 0.62 | yes |
| 8 | `network-specialist` (cutaway) | 232–240 | 232–240 | 10:34 AM–10:40 AM | `specialist` · `examSeat` | 3.00 · 0.22 · 0.42 | `specialist-visit` |
| 9 | `program` | 240–290 | 240–289 | 10:40 AM–11:12 AM | `day-open` | 2.60 · 0.30 · 0.66 | yes |
| 10 | `network-partner` (cutaway) | 289–300 | 289–300 | 11:12 AM–11:20 AM | `partner-adc` · `ptStand` (instance room `rehab-open`) | 2.80 · 0.50 · 0.64 | `partner-pt` |
| 11 | `lunch` | 290–350 | 300–350 | 11:20 AM–11:53 AM | `dining-1421` | 4.20 · 0.62 · 0.66 | yes |
| 12 | `social-work` | 350–392 | 350–392 | 11:53 AM–12:21 PM | `admin-side-office` | 5.20 · 0.85 · 0.72 | yes |
| 13 | `personal-care` | 392–440 | 392–440 | 12:21 PM–12:53 PM | `rear-wc-east` | 5.20 · 0.50 · 0.92 | yes |
| 14 | `recreation` | 440–525 | 440–500 | 12:53 PM–1:33 PM | `admin-workstations` → `admin-conference` (stops) | 4.60 · −0.30 · 0.95 | yes |
| 15 | `network-hospital` (cutaway) | 500–525 | 500–525 | 1:33 PM–1:50 PM | `hospital` · `huddleA` | 2.60 · 0.08 · 0.50 | `hospital-discharge-huddle` |
| 16 | `farewell` | 525–552 | 525–552 | 1:50 PM–2:08 PM | `lobby-arrival` | 4.60 · −0.45 · 0.60 | yes |
| 17 | `ride-home` | 552–624 | 552–624 | 2:08 PM–2:56 PM | arrival kerb & ramp | 2.60 · −0.95 · 0.48 | yes, 40 m |
| 18 | `care-plan` | 624–720 | 624–690 | 2:56 PM–3:40 PM | `upperfit-conference` | 3.30 · 1.05 · 0.74 | no (team meeting) |
| 19 | `network-home-pm` (cutaway) | 690–712 | 690–712 | 3:40 PM–3:54 PM | `home-lin` · `wheelchairSpot` | 3.30 · 1.12 · 0.72 | `home-health-visit`, `after-hours-call` |

Small screens multiply chapter zoom by 1.45 (the stage there is about 56 % of the viewport height); the opening, team and network beats use 1.3.

To tune a shot, open the story with `?debug=1` and run `__story.director.debug()` in the console; it returns the current camera and sim time, the goals they are easing toward, and the beat.

## Editing the story

- **Copy:** chapter kicker, title and body are the `kicker`, `title` and `body` fields of each step in `app/data/scenarios/day-in-the-life.json`. Keep the kicker format `"9:35 AM · Clinic"`; the time before `·` also labels the rail, the day-flow strip and the swimlane, and must fall inside the chapter’s scrub window (`build-scenario` fails otherwise). Opening, reveal, team, finale and closing copy lives in `app/story/story-experience.tsx`.
- **Who is involved:** a step’s `roles` (IDT ids from `app/data/care-team.json`) drive the ring, chips, day-flow dots, swimlane and touchpoint count. `handoffs` (`from`, `to`, `note`) drive the arrows, captions and the handoff count.
- **Team roster and colors:** `app/data/care-team.json` (`members[].color`, `short`, `title`, `focus`, `group`; `palette`).
- **New steps:** add them to the scenario; a chapter, rail tick, day-flow node and swimlane column appear automatically. Add a `CHAPTER_SHOTS` entry for a tailored camera.
- **Cutaways:** a step with `settingId` (a `careSettings` id), `zoneId: "community:<settingId>"`, `roomId: null`, `heroPresent: false`, `interactionIds` (the first is the camera’s follow target), `partners` (external roles, shown as grey chips and in the swimlane’s Partners lane) and `placement: { "mode": "cutaway" }`; `title`, `kicker`, `body` as for any step. Story-owned fields are the copy and `partners`; `window`, `settingId`, `interactionIds`, `roles` and `handoffs` are the shared contract. `build-scenario` (and `--check`) enforces the placement rules: the window lies in a gap between Mrs. Lin’s stops (trimming may shorten a hero chapter but never cuts into a stop, hides its focus time or leaves its kicker outside it, and every hero chapter keeps at least 20 s); the kicker time lies inside the window; every featured interaction exists in the composed story source, happens at the setting (or on the site or upstairs, for the nurse line), overlaps the window by at least 4 s, and together they cover at least 60 % of it; `roles` and handoff ends are IDT ids. Give the shot a `place` (`{ setting, anchor }`, plus `room` for a facility instance) rather than a world `anchor`, so it survives the pads moving or being rebuilt.
- **Hero tracks:** `app/story/hero-source.ts` re-exports `storyActivitySource` (`app/sim/story-source.ts`): the base loop with Mrs. Lin’s compiled itinerary, companions and IDT meetings (`npm run build:scenario`); the renderer composes the community layer and fleet crew on top.

## Files

| File | Role |
| --- | --- |
| `app/story/page.tsx` | `/story` route (metadata + component) |
| `app/story/story-experience.tsx` | Page structure, sections, chrome, rail, stage bootstrapping |
| `app/story/director.ts` | Per-frame scroll → clock (scrub windows), camera (`place` anchors from the community layer), view state, CSS variables, hero name tag |
| `app/story/choreography.ts` | Shot table and interpolation helpers |
| `app/story/stage.ts` | Facility loading (and the instance loader), asset base rewriting, WebGL check, pixel-ratio cap |
| `app/story/idt-panel.tsx`, `idt-geometry.ts` | Team ring (intro, step, mesh, network and away modes), arrows, captions, counters, day-flow strip |
| `app/story/swimlane.tsx` | Finale flowchart (roles × moments), with a table for screen readers |
| `app/story/data.ts` | Typed access to the scenario and team JSON, derived totals (Mrs. Lin’s and the network’s), scrub windows |
| `app/sim/story-timeline.ts` | `scrubWindows` (hero chapters clipped around cutaways) and `HOME_AM_RETIME`; shared by the story, `build-scenario` and `test/story-timeline.test.ts` |
| `app/story/hero-source.ts` | Activity tracks and hero id adapter |
| `app/story/story.css` | All story styles, scoped to `.story-root` / `.story-*` |
| `story/site/index.html`, `story/site/main.tsx`, `vite.story.config.ts` | Standalone build. The entry sits in `story/site/` because a root-level `story/index.html` would be served by the vinext dev server in place of the `/story` route. |
