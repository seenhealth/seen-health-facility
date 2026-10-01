# “A day at Seen Health” scroll story

A scroll-driven walkthrough of one participant’s day (Mrs. Lin, 84) at the Alhambra center, rendered with the real 3D facility model, with an overlay of the eleven-person interdisciplinary team (IDT) that evolves as the reader scrolls. It ships two ways:

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
- `models/seen-alhambra-planning.json` (facility specification, minified), plus any other specification a community pad stamps (`instanceFacilityUrls()` in `app/model/community-settings.ts`; the partner day center stamps the Alhambra plan itself, so today there is none)
- every texture the facility references (`reference/photos/*-sign.png`, `reference/fleet/final-vans.png`), collected from the specification at build time
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

`opening → reveal → team → 13 scenario chapters → finale → closing call to action`

A single animation loop (`app/story/director.ts`) reads `window.scrollY`, works out the active beat and its progress, and derives:

| Output | How it is derived |
| --- | --- |
| Sim clock | Each chapter scrubs linearly through its step `window` (loop seconds) from the middle of the previous transition to the middle of the next, so time is continuous across chapters. Opening/reveal/team hold at 8:00 AM, the finale at 4:00 PM. The clock eases toward the scroll time and is pushed to the renderer with `activity.setOptions({ time })` (`playing: false`). |
| Camera | Every beat has a shot (`app/story/choreography.ts`): zoom, azimuth, elevation, a slow push-in and drift across the beat, and an anchor (the step’s room centre, or an explicit point). When the hero is present and within the shot’s `radius` of the anchor, the target leans toward her (`follow`). Near a boundary the two shots are blended by scroll position; a critically damped spring then smooths the result and `viewer.setShot()` places the camera. The target is offset in screen space so the subject sits between the chapter card and the team panel. |
| View state | Opening, finale: exterior with roof. Reveal: the roof and upper floor float up (`stack`), then settle into a cutaway. Ground chapters: `level: 'ground'`, cutaway walls, the step’s room highlighted (`room`), following `stops` for recreation. Upstairs meetings: `level: 'all'` so the building stays in view. `viewer.update()` runs only when the state changes. |
| Page | Each section gets `--vis`, `--enter` and `--p` CSS variables (card fades and parallax); the root gets `--ui`, `--rail`, `--veil`, `--open` and `--day`. React only re-renders when the beat or the handoff phase changes. |
| Team overlay | Involved roles light up and draw spokes to Mrs. Lin; handoff *k* of *n* draws as an arrow once the chapter passes 30–66 % (`handoffAt`), with its note as a caption. Team meetings (all eleven roles, hero not present) draw the full mesh. Touchpoints and handoffs accumulate across the day. |

`prefers-reduced-motion` cuts between shots, removes parallax and draw-on animation, and shows final states. Without WebGL the stage shows a soft gradient and every text, overlay and navigation element still works.

## Chapters and scenario steps

Chapters come straight from `app/data/scenarios/day-in-the-life.json`, in order. Camera shots are keyed by step `id` in `CHAPTER_SHOTS` (`app/story/choreography.ts`); unknown ids fall back to `DEFAULT_CHAPTER_SHOT` framed on the step’s room.

| # | Step `id` | Window (s) | Room / anchor | Shot (zoom · azimuth · elevation) | Follows hero |
| --- | --- | --- | --- | --- | --- |
| 1 | `huddle` | 0–40 | `upperfit-conference` | 4.1 · 0.62 · 0.72 | no (team meeting) |
| 2 | `pickup` | 40–120 | arrival kerb & ramp | 2.7 · −0.72 · 0.50 | yes, 40 m |
| 3 | `checkin` | 120–140 | `lobby-arrival` | 4.6 · −0.35 · 0.62 | yes |
| 4 | `clinic` | 140–185 | `clinic-nurse` | 4.4 · 0.28 · 0.68 | yes |
| 5 | `therapy` | 185–240 | `rehab-open` | 2.9 · −0.50 · 0.62 | yes |
| 6 | `program` | 240–295 | `day-open` | 2.6 · 0.30 · 0.66 | yes |
| 7 | `lunch` | 295–355 | `dining-1421` | 4.2 · 0.62 · 0.66 | yes |
| 8 | `social-work` | 355–400 | `admin-meeting-west` | 5.2 · 0.85 · 0.72 | yes |
| 9 | `recreation` | 400–470 | `rear-north` → `lobby-office-w2` (stops) | 4.8 · −0.30 · 0.66 | yes |
| 10 | `personal-care` | 470–525 | `rear-wc-east` | 5.4 · 0.50 · 0.74 | yes |
| 11 | `farewell` | 525–552 | `lobby-arrival` | 4.6 · −0.45 · 0.60 | yes |
| 12 | `ride-home` | 552–624 | arrival kerb & ramp | 2.6 · −0.95 · 0.48 | yes, 40 m |
| 13 | `care-plan` | 624–720 | `upperfit-conference` | 3.3 · 1.05 · 0.74 | no (team meeting) |

Small screens multiply chapter zoom by 1.45 (the stage there is about 56 % of the viewport height).

To tune a shot, open the story with `?debug=1` and run `__story.director.debug()` in the console; it returns the current camera, sim time and beat.

## Editing the story

- **Copy:** chapter kicker, title and body are the `kicker`, `title` and `body` fields of each step in `app/data/scenarios/day-in-the-life.json`. Keep the kicker format `"9:35 AM · Clinic"`; the time before `·` also labels the finale and the day-flow strip, and should fall inside the step’s `window`. Opening, reveal, team, finale and closing copy lives in `app/story/story-experience.tsx`.
- **Who is involved:** a step’s `roles` (IDT ids from `app/data/care-team.json`) drive the ring, chips, day-flow dots, swimlane and touchpoint count. `handoffs` (`from`, `to`, `note`) drive the arrows, captions and the handoff count.
- **Team roster and colors:** `app/data/care-team.json` (`members[].color`, `short`, `title`, `focus`, `group`; `palette`).
- **New steps:** add them to the scenario; a chapter, rail tick, day-flow node and swimlane column appear automatically. Add a `CHAPTER_SHOTS` entry for a tailored camera.
- **Hero tracks:** `app/story/hero-source.ts` returns `{ source, heroId }`. It currently follows the existing Van A cane participant; replace its body with `export { storyActivitySource } from '../sim/story-source';` once the dedicated hero itinerary lands.

## Files

| File | Role |
| --- | --- |
| `app/story/page.tsx` | `/story` route (metadata + component) |
| `app/story/story-experience.tsx` | Page structure, sections, chrome, rail, stage bootstrapping |
| `app/story/director.ts` | Per-frame scroll → clock, camera, view state, CSS variables, hero name tag |
| `app/story/choreography.ts` | Shot table and interpolation helpers |
| `app/story/stage.ts` | Facility loading, asset base rewriting, WebGL check, pixel-ratio cap |
| `app/story/idt-panel.tsx`, `idt-geometry.ts` | Team ring, arrows, captions, counters, day-flow strip |
| `app/story/swimlane.tsx` | Finale flowchart (roles × moments), with a table for screen readers |
| `app/story/data.ts` | Typed access to the scenario and team JSON, derived totals |
| `app/story/hero-source.ts` | Activity tracks and hero id adapter |
| `app/story/story.css` | All story styles, scoped to `.story-root` / `.story-*` |
| `story/site/index.html`, `story/site/main.tsx`, `vite.story.config.ts` | Standalone build. The entry sits in `story/site/` because a root-level `story/index.html` would be served by the vinext dev server in place of the `/story` route. |
