"""Concurrent Chinese-American cultural activities in the Alhambra day room (October 2026).

app/data/day-program.json is the hand-authored source. This script regenerates, idempotently:
 - guest instructor actors and profiles (`instructor-*`), visible only during their sessions;
 - the open-floor class: eight floor regulars (`floor-member-*`) join the original stations, and the
   whole class rearranges between layouts (grid, small dance group, audience, rows, circle, small
   groups) by walking to its new places during the first seconds of each session;
 - synchronized tracks for the long arts table, the tea corner and the side tables' games and crafts;
 - a `day-<session>` interaction for every zone session and a `table-*` interaction per table activity;
 - the arts-table head chair for instructors and tree-table seats for the cleared north-table group;
 - legacy day-room "Movement & exercise" stops, now watching the arts table, and walking routes that
   used to cross the open floor, now routed around it.
Writes the app/data and public/models copies of activity-loop.json and character-templates.json.
"""
import heapq, itertools, json, math, zlib
from pathlib import Path

R = Path(__file__).resolve().parents[1]
load = lambda p: json.loads((R / p).read_text())
program = load('app/data/day-program.json')
loop = load('app/data/activity-loop.json')
library = load('app/data/character-templates.json')
model = load('public/models/seen-alhambra-planning.json')
DURATION = loop['duration']
MOVEMENT = {'exercise', 'dance', 'tai-chi', 'qigong', 'fan-dance'}
FLOOR = program['floor']
FORMATIONS, SHIFT = FLOOR['formations'], FLOOR['transition']
(AX0, AZ0), (AX1, AZ1) = FLOOR['area']
zones = {z['id']: z for z in program['zones']}
instructors = {i['id']: i for i in program['instructors']}
sessions = lambda zone: sorted((s for s in program['programs'] if s['zone'] == zone), key=lambda s: s['start'])
r4 = lambda v: round(v, 4)
dist = lambda p, q: math.hypot(p[0] - q[0], p[1] - q[1])
lerp = lambda p, q, t: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]


def actor(id):
    found = [a for a in loop['actors'] if a['id'] == id]
    assert found, f'Missing actor {id}'
    return found[0]


def chair(id):
    return next(o for o in model['objects'] if o['id'] == id)


# ---- Schedule sanity: every zone and table is a gap-free rotation over the care day.
def gap_free(items, name):
    clock = 0
    for s in sorted(items, key=lambda s: s['start']):
        assert s['start'] == clock and s['end'] > s['start'], f'{name}: gap or overlap at {clock}'
        clock = s['end']
    assert clock == DURATION, f'{name} covers the care day'


for zone in program['zones']:
    gap_free(sessions(zone['id']), zone['id'])
    for s in sessions(zone['id']):
        assert not s.get('instructorId') or s['instructorId'] in instructors, f"{s['id']}: unknown instructor"
        assert zone['id'] != 'floor' or s['formation'] in FORMATIONS, f"{s['id']}: unknown formation"
for t in program['tables']:
    gap_free(t['schedule'], t['id'])
    assert all(e['activity'] in program['tableActivities'] for e in t['schedule'])
for id in instructors:
    led = [s for s in program['programs'] if s.get('instructorId') == id]
    assert len({s['zone'] for s in led}) == 1, f'{id} leads in one zone'
    assert len({tuple(FORMATIONS[s['formation']]['lead']) for s in led if s['zone'] == 'floor'}) <= 1, f'{id} keeps one spot'

# ---- Idempotency: drop everything this script owns before rebuilding it.
OWNED = ('instructor-', 'floor-member-')
loop['actors'] = [a for a in loop['actors'] if not a['id'].startswith(OWNED)]
library['people'] = [p for p in library['people'] if not p['id'].startswith(OWNED)]
# The owner review's quiet-room tables (`quiet-table-*`, scripts/apply-owner-review-day-admin.mjs)
# keep their own sitters and interactions; this generator seats only the day room's `day-*` tables.
OWNED_TABLES = [t for t in program['tables'] if t['id'].startswith('day-')]
loop['interactions'] = [i for i in loop['interactions']
                        if not i['id'].startswith(('day-', 'table-')) or i['id'].startswith('table-quiet-')]

# ---- Seats: the arts-table head chair is the instructors'; the cleared north tables' group moves
# to free tree-table chairs.
head = zones['arts-table']['instructorSpot']
RELOCATE = {'daily-member-07': 'day-tree-chair-2-1', 'daily-member-46': 'day-tree-chair-1-3', 'daily-member-47': 'day-tree-chair-2-2',
            'daily-member-48': 'day-tree-chair-3-1', 'daily-member-49': 'day-tree-chair-3-2'}
for id, chair_id in RELOCATE.items():
    a, c = actor(id), chair(chair_id)
    assert not any(b is not a and b.get('seatId') == chair_id for b in loop['actors']), f'{chair_id} is free'
    p = [c['position'][0], c['position'][2]]
    a.update(label='Small-group conversation', seatId=chair_id, roomId=c.get('roomId', a.get('roomId')), offset=0)
    a['segments'] = [dict(start=0, end=DURATION, action='conversation', path=[p, p], zoneId=c['zoneId'], heading=c['rotation'] + math.pi,
                          seated=True, title='Small-group conversation')]
assert not any(a.get('seatId') == head['seatId'] for a in loop['actors']), 'Head chair is reserved for instructors'
removed = set(program['removedObjectIds'])
assert not any(a.get('seatId') in removed for a in loop['actors']), 'Nobody sits on cleared furniture'

# ---- Floor regulars: participants who stay with the open-floor class all day.
REGULARS = [  # skin, hair, hair style, figure, wardrobe, cut, height
    ('#dcae8b', '#e6e2da', 2, 'f', 0, 'cardigan', .94), ('#c48e69', '#a19d96', 0, 'm', 2, 'shirt', .97),
    ('#ecc9a8', '#c8c5be', 1, 'f', 3, 'sweater', .93), ('#a06e50', '#d9d4ca', 3, 'm', 5, 'cardigan', .96),
    ('#dcae8b', '#e6e2da', 4, 'f', 4, 'shirt', .95), ('#ecc9a8', '#a19d96', 6, 'm', 1, 'sweater', .98),
    ('#c48e69', '#c8c5be', 2, 'f', 2, 'sweater', .92), ('#dcae8b', '#d9d4ca', 0, 'm', 3, 'shirt', .97)]
for i, station in enumerate(s for s in program['stations'] if s['actorId'].startswith('floor-member-')):
    id = station['actorId']
    skin, hair, style, figure, wardrobe, cut, height = REGULARS[i]
    loop['actors'].append(dict(id=id, role='participant', variant=300 + i, label='Open floor class · participant', offset=0,
                               levelId='ground', roomId='day-open', segments=[], profileId=id))
    library['people'].append(dict(id=id, role='participant', appearance=i, skin=skin, hair=hair, hairStyle=style, glasses=i % 3 == 1,
                                  accent=library['people'][0]['accent'], height=height, figure=figure, wardrobe=wardrobe, cut=cut))


def hungarian(cost):
    """Minimum-cost assignment of every row to a distinct column (rows <= columns)."""
    n, m = len(cost), len(cost[0])
    u, v, p, way = [0.0] * (n + 1), [0.0] * (m + 1), [0] * (m + 1), [0] * (m + 1)
    for i in range(1, n + 1):
        p[0], j0 = i, 0
        minv, used = [math.inf] * (m + 1), [False] * (m + 1)
        while True:
            used[j0], i0, delta, j1 = True, p[j0], math.inf, 0
            for j in range(1, m + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while j0:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
    out = [0] * n
    for j in range(1, m + 1):
        if p[j]:
            out[p[j] - 1] = j - 1
    return out


# ---- Open-floor class: each session's layout, with the shortest rearrangement from the last one.
MODE_TITLE = {'leader': 'facilitate', 'support': 'individual assistance', 'standing': 'standing / seated choice',
              'chair': 'chair-based participation', 'wheelchair': 'wheelchair participation'}
floor_sessions = sessions('floor')
cohort = [s for s in program['stations'] if s['mode'] not in ('leader', 'support')]
lead = next(s['actorId'] for s in program['stations'] if s['mode'] == 'leader')
aide = next(s['actorId'] for s in program['stations'] if s['mode'] == 'support')


def layout(k, previous, following=None):
    """Session k's places: {actorId: (point, heading, slot)}, nearest to both neighbouring layouts."""
    s = floor_sessions[k]
    f = FORMATIONS[s['formation']]
    slots = [x for x in f['slots'] if not x.get('reserved')]
    assert len(slots) >= len(cohort), f"{s['formation']} seats the whole class"

    def cost(member, slot):
        id = member['actorId']
        c = dist(previous[id], slot['at']) + (dist(slot['at'], following[id]) if following else 0)
        if s['formation'] == 'grid-small':  # Seated members take the side seats first.
            c += 1.5 if (slot.get('group') == 'side') != (member['mode'] in ('chair', 'wheelchair')) else 0
        return c

    order = hungarian([[cost(m, x) for x in slots] for m in cohort])
    here = {m['actorId']: (slots[k2]['at'], slots[k2]['heading'], slots[k2]) for m, k2 in zip(cohort, order)}
    spot = f['cohost'] if s.get('instructorId') else f['lead']
    here[lead] = (spot[:2], spot[2], None)
    here[aide] = (f['aide'][:2], f['aide'][2], None)
    return here


points = lambda here: {k: v[0] for k, v in here.items()}
first = FORMATIONS[floor_sessions[-1]['formation']]
previous = {m['actorId']: x['at'] for m, x in zip(cohort, [x for x in first['slots'] if not x.get('reserved')])}
plan = []
for k in range(len(floor_sessions)):
    plan.append(layout(k, previous))
    previous = points(plan[-1])
# The care day loops: refine each layout against both neighbours until the total walking settles.
total = lambda: sum(dist(plan[k - 1][m['actorId']][0], plan[k][m['actorId']][0]) for k in range(len(plan)) for m in cohort)
for _ in range(100):
    before = total()
    for k in range(len(plan)):
        plan[k] = layout(k, points(plan[k - 1]), points(plan[(k + 1) % len(plan)]))
    if total() > before - 1e-9:
        break
floor_people = [m['actorId'] for m in cohort] + [lead, aide]
modes = {s['actorId']: s['mode'] for s in program['stations']}


def guests_at(k):
    s = floor_sessions[k]
    return [FORMATIONS[s['formation']]['lead'][:2]] if s.get('instructorId') else []


def along(path, f):
    """Point at fraction f of a polyline's length."""
    lengths = [dist(a, b) for a, b in zip(path, path[1:])]
    target, walked = f * sum(lengths), 0
    for (a, b), d in zip(zip(path, path[1:]), lengths):
        if walked + d >= target - 1e-12:
            return lerp(a, b, (target - walked) / (d or 1))
        walked += d
    return path[-1]


def mover_track(path, delay, duration):
    return lambda t: path[0] if t <= delay else path[-1] if t >= delay + duration else along(path, (t - delay) / duration)


def detours(p, q):
    """The straight walk first, then gentle bends either side of it."""
    yield [p, q]
    d = dist(p, q) or 1
    nx, nz = -(q[1] - p[1]) / d, (q[0] - p[0]) / d
    mid = lerp(p, q, .5)
    for bend in (.5, -.5, .9, -.9):
        yield [p, [mid[0] + nx * bend, mid[1] + nz * bend], q]


timing = []  # Per session: {actorId: (delay, duration)} for those who move.
worst = math.inf


def stagger(k, order):
    """Greedy start delays so walkers pass each other with room; returns (closest pass, delays)."""
    before, after = plan[k - 1], plan[k]
    tracks = {a: (lambda p: (lambda t: p))(after[a][0]) for a in floor_people if a not in order}
    chosen, closest = {}, 9.0
    for a in order:
        p, q = before[a][0], after[a][0]
        best = None
        for path in detours(p, q):
            length = sum(dist(x, y) for x, y in zip(path, path[1:]))
            for delay in (0, .75, 1.5, 2.25, 3):
                duration = SHIFT - delay
                if length / duration > 1.1:
                    continue
                track = mover_track(path, delay, duration)
                clearance = min(min(dist(track(t / 10), other(t / 10)) for other in tracks.values()) if tracks else 9
                                for t in range(0, SHIFT * 10 + 1))
                # Prefer straight, prompt walks unless a bend or a pause buys real room.
                score = clearance - (0.05 if len(path) > 2 else 0) - 0.01 * delay
                if best is None or score > best[0] + 1e-9:
                    best = (score, delay, duration, track, path, clearance)
            if best and best[5] >= 0.7:
                break
        assert best, f'{a} cannot rearrange in time for {floor_sessions[k]["id"]}'
        chosen[a], tracks[a] = (best[1], best[2], best[4]), best[3]
        closest = min(closest, best[5])
    return closest, chosen


for k, s in enumerate(floor_sessions):
    movers = sorted((a for a in floor_people if dist(plan[k - 1][a][0], plan[k][a][0]) > 0.02),
                    key=lambda a: -dist(plan[k - 1][a][0], plan[k][a][0]))
    # Try the longest walks first, then a few deterministic shuffles; keep the roomiest result.
    orders = [movers] + [sorted(movers, key=lambda a: zlib.crc32(f'{a}/{seed}'.encode())) for seed in range(40)]
    closest, chosen = max((stagger(k, order) for order in orders), key=lambda r: r[0])
    for g in guests_at(k):
        closest = min([closest] + [dist(g, plan[k][a][0]) for a in floor_people])
    worst = min(worst, closest)
    timing.append(chosen)

for station in program['stations']:
    a, mode = actor(station['actorId']), station['mode']
    a.update(offset=0, programMode=mode)
    a.pop('seatId', None)
    a.pop('seated', None)
    a['segments'] = []
    for k, s in enumerate(floor_sessions):
        point, heading, slot = plan[k][a['id']]
        if mode == 'leader':
            action = s['leaderAction']
        elif mode == 'support':
            action = 'consult'
        else:
            action = (slot or {}).get('action') or s['action']
        seated = mode in ['chair', 'wheelchair'] or (mode == 'leader' and action in ['write', 'craft', 'device']) or (
            mode == 'standing' and action not in MOVEMENT)
        role = f"co-host with {instructors[s['instructorId']]['name']}" if mode == 'leader' and s.get('instructorId') else MODE_TITLE[mode]
        group = (slot or {}).get('group')
        title = f"{s['label']} · {role}" if group != 'side' else f"{s['label']} · cheering from the side"
        start = s['start']
        if a['id'] in timing[k]:
            delay, duration, route_path = timing[k][a['id']]
            p = plan[k - 1][a['id']][0]
            if delay:
                prev = a['segments'][-1] if a['segments'] else None
                hold = dict(prev or {}, start=start, end=start + delay)
                if prev is None:  # The care day opens mid-rearrangement: wait in the previous layout's place.
                    p_head = plan[k - 1][a['id']][1]
                    hold = dict(action='idle', path=[p, p], zoneId='day', heading=p_head, seated=False, title='Waiting to rearrange',
                                start=start, end=start + delay)
                hold['path'] = [p, p]
                a['segments'].append(hold)
            a['segments'].append(dict(start=r4(start + delay), end=r4(start + delay + duration), action='roll' if mode == 'wheelchair' else 'walk',
                                      path=route_path, zoneId='day', heading=heading, seated=False, title=f"Rearranging the floor for {s['label']}"))
            start = r4(start + delay + duration)
        a['segments'].append(dict(start=start, end=s['end'], action=action, path=[point, point], zoneId='day', heading=heading,
                                  seated=seated, title=title))
    # A hold that copies the care day's last stage must not leak its timing from another session.
    for seg in a['segments']:
        seg['start'], seg['end'] = r4(seg['start']), r4(seg['end'])


def local_track(segments, offset):
    """Stationary segments authored on the shared clock, shifted into an actor's local time."""
    out = []
    for s in segments:
        start, end = r4(s['start'] + offset), r4(s['end'] + offset)
        if end <= DURATION:
            out.append({**s, 'start': start, 'end': end})
        else:
            if start < DURATION:
                out.append({**s, 'start': start, 'end': DURATION})
            out.append({**s, 'start': 0, 'end': r4(end - DURATION)})
    return sorted(out, key=lambda s: s['start'])


# ---- Table zones: seated participants follow their zone's sessions, slightly out of phase.
for zone in (z for z in program['zones'] if z.get('participants')):
    for i, id in enumerate(zone['participants']):
        a = actor(id)
        base = a['segments'][0]
        assert a.get('seated') and a.get('seatId'), f'{id} is seated'
        a.update(offset=r4(0.37 * (i % 5)), label=f"{zone['label']} · participant")
        a['segments'] = local_track([dict(start=s['start'], end=s['end'], action=s['action'], path=base['path'], zoneId=base['zoneId'],
                                          heading=base['heading'], seated=True, title=f"{s['label']} · {zone['label'].lower()}")
                                     for s in sessions(zone['id'])], a['offset'])

# ---- Side tables: games and crafts by table, players and onlookers at game tables.
ACTIVITIES = program['tableActivities']


def seated_at(table_id):
    if table_id.startswith('day-tree-table-'):
        prefix = 'day-tree-chair-' + table_id.rsplit('-', 1)[1] + '-'
    elif table_id == 'day-photo-lounge-table':
        prefix = 'day-photo-lounge-chair-'
    else:
        prefix = table_id + '-chair-'
    return sorted((a for a in loop['actors'] if (a.get('seatId') or '').startswith(prefix)), key=lambda a: a['seatId'])


def players(people, k):
    """The k seats spread furthest apart around the table play; the rest look on."""
    if not k or k >= len(people):
        return set(a['id'] for a in people)
    point = lambda a: a['segments'][0]['path'][0]
    best = max(itertools.combinations(people, k), key=lambda group: min(dist(point(a), point(b)) for a, b in itertools.combinations(group, 2)))
    return {a['id'] for a in best}


tabled = {}
for t in OWNED_TABLES:
    people = seated_at(t['id'])
    assert people, f"{t['id']} has seated participants"
    for i, a in enumerate(people):
        base = a['segments'][0]
        segments = []
        for e in t['schedule']:
            act = ACTIVITIES[e['activity']]
            if act.get('players'):
                action = act['play'] if a['id'] in players(people, act['players']) else act['others']
            else:  # Crafts: everyone takes part; at bigger tables one neighbour mostly chats.
                action = act['others'] if len(people) >= 3 and i == len(people) - 1 else act['play']
            segments.append(dict(start=e['start'], end=e['end'], action=action, path=base['path'], zoneId=base['zoneId'], heading=base['heading'],
                                 seated=True, title=f"{act['label']} {act['labelZh']}"))
        a['offset'] = r4(0.53 * (i % 4) + 0.2 * (len(tabled) % 3))
        a['segments'] = local_track(segments, a['offset'])
        a['label'] = 'Table games & crafts · participant'
        tabled[a['id']] = t['id']

# ---- Guest instructors: present for their sessions at their zone or layout spot.
LOOKS = {  # figure, skin, hair, hair style, glasses, height, costume
    'instructor-opera': ('f', '#ecc9a8', '#231f1c', 2, False, .99, dict(style='opera', color='#e39aa2', trim='#d6ae4f', accent='#f6f1e8')),
    'instructor-qigong': ('m', '#dcae8b', '#a19d96', 3, False, 1, dict(style='taichi', color='#c6d6c8', trim='#45685a')),
    'instructor-dance': ('f', '#ecc9a8', '#231f1c', 2, False, 1, dict(style='qipao', color='#b8312f', trim='#e0b64e')),
    'instructor-taichi': ('m', '#dcae8b', '#d9d4ca', 0, False, 1.01, dict(style='taichi', color='#f2eee6', trim='#24211f')),
    'instructor-erhu': ('m', '#c48e69', '#231f1c', 3, True, .99, dict(style='tang', color='#2e3d61', trim='#c9a24a')),
    'instructor-tcm': ('f', '#dcae8b', '#3b2a21', 4, True, .98, dict(style='tcm-coat', color='#f3f1ea', trim='#7b2f2b')),
    'instructor-calligraphy': ('m', '#dcae8b', '#c8c5be', 3, True, 1, dict(style='tang', color='#6a2c29', trim='#1e1b1a')),
    'instructor-papercut': ('f', '#ecc9a8', '#3b2a21', 1, False, .97, dict(style='tang', color='#b3312e', trim='#e3bf5a')),
    'instructor-tea': ('f', '#dcae8b', '#231f1c', 2, False, .98, dict(style='qipao', color='#5d8b77', trim='#eee5d1')),
}
for i, person in enumerate(program['instructors']):
    led = sorted((s for s in program['programs'] if s.get('instructorId') == person['id']), key=lambda s: s['start'])
    on_floor = led[0]['zone'] == 'floor'
    if on_floor:
        x, z, heading = FORMATIONS[led[0]['formation']]['lead']
        spot = dict(position=[x, z], heading=heading)
    else:
        spot = zones[led[0]['zone']]['instructorSpot']
    p, segments, clock = spot['position'], [], 0

    def away(end):
        if end > clock:
            segments.append(dict(start=clock, end=end, action='idle', path=[p, p], zoneId='day', heading=spot['heading'],
                                 visible=False, title='Guest instructor · not on site'))

    for s in led:
        arrive = s['start'] + (SHIFT if on_floor else 0)  # Floor guests step in once the class has rearranged.
        away(arrive)
        name = s['label'] + (' ' + s['labelZh'] if s.get('labelZh') else '')
        segments.append(dict(start=arrive, end=s['end'], action=s['instructorAction'], path=[p, p], zoneId='day',
                             heading=spot['heading'], seated=bool(spot.get('seatId') or spot.get('seated') or s['instructorAction'] == 'erhu'),
                             title=f"{name} · {person['name']} leads"))
        clock = s['end']
    away(DURATION)
    a = dict(id=person['id'], role='instructor', variant=200 + i, label=f"{person['name']} · {person['specialty']}", offset=0,
             levelId='ground', roomId='day-open', segments=segments, profileId=person['id'])
    if spot.get('seatId'):
        a.update(seatId=spot['seatId'], seated=True)
    loop['actors'].append(a)
    figure, skin, hair, style, glasses, height, costume = LOOKS[person['id']]
    library['people'].append(dict(id=person['id'], role='instructor', appearance=i, skin=skin, hair=hair, hairStyle=style,
                                  glasses=glasses, accent=costume['color'], height=height, figure=figure, costume=costume))
library['roles']['instructor'] = dict(
    wardrobe='costume', color='#A63A2E', skeleton='seen-clay-16',
    detail='Guest cultural instructor in activity attire: tai chi silks, Tang jacket, qipao, opera costume or TCM coat')

# ---- Legacy day-room exercise stops: watch the arts table instead of exercising in the aisles.
table = next(o for o in model['objects'] if o['id'] == 'day-communal-table')
near_table = lambda q: math.hypot(max(0, abs(q[0] - table['position'][0]) - .46), max(0, abs(q[1] - table['position'][2]) - 2.32)) < 2
stations = {s['actorId'] for s in program['stations']}
retargeted = 0
for a in loop['actors']:
    if a['id'].startswith(OWNED) or a['id'] in stations or a.get('escortFor'):
        continue
    for s in a['segments']:
        still = all(q == s['path'][0] for q in s['path'])
        # Standing stops only: seated table groups keep their own activities.
        if s['zoneId'] != 'day' or not still or s.get('seated') or a.get('seatId') or s['action'] not in ['exercise', 'greet']:
            continue
        if near_table(s['path'][0]):
            staff = a['role'] != 'participant'
            s.update(action='consult' if staff else 'listen', title='Assisting at the arts table' if staff else 'Watching the arts table')
            retargeted += 1
        elif s['action'] == 'exercise':
            s.update(action='conversation', title='Chatting with friends')
            retargeted += 1

# ---- Walking routes keep clear of the open floor: reroute any that cross it.
STEP = .2
grounded = [z for z in model['zones'] if z['levelId'] == 'ground' and z['id'] != 'adjacent']
walls = [w for w in model['walls'] if w['levelId'] == 'ground']


def inside(p, poly):
    x, y = p
    odd = False
    for a, b in zip(poly, poly[1:] + poly[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            odd = not odd
    return odd


def distseg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


obstacles = []
# Seated people are obstacles too: routes keep their distance from every chair in use.
for a in loop['actors']:
    if a.get('seatId') and a['levelId'] == 'ground':
        x, z = a['segments'][0]['path'][0]
        obstacles.append((x, z, .62, .62, 1, 0))
for o in model['objects']:
    if o['id'] in removed or o['levelId'] != 'ground' or o.get('layer', 'furniture') != 'furniture':
        continue
    w, h, d = [v * s for v, s in zip(model['assets'][o['assetId']]['dimensions'], o['scale'])]
    if h < .15 or o['position'][1] > 1.4:
        continue
    c, s = math.cos(o['rotation']), math.sin(o['rotation'])
    for x, z, fw, fd in o.get('navigationFootprints', [[0, 0, w, d]]):
        obstacles.append((o['position'][0] + c * x + s * z, o['position'][2] - s * x + c * z, fw / 2 + .19, fd / 2 + .19, c, s))
AREA_MARGIN = .35
crosses_floor = lambda p: AX0 - AREA_MARGIN < p[0] < AX1 + AREA_MARGIN and AZ0 - AREA_MARGIN < p[1] < AZ1 + AREA_MARGIN


def clear(p):
    if crosses_floor(p) or not any(inside(p, z['polygon']) for z in grounded):
        return False
    if any(distseg(p, w['a'], w['b']) < w['thickness'] / 2 + .21 for w in walls if abs(p[0] - w['a'][0]) < 30):
        return False
    for x, z, w, d, c, s in obstacles:
        dx, dz = p[0] - x, p[1] - z
        if abs(c * dx - s * dz) < w and abs(s * dx + c * dz) < d:
            return False
    return True


cells = {}


def node(ix, iz):
    if (ix, iz) not in cells:
        p = (round(ix * STEP, 3), round(iz * STEP, 3))
        cells[(ix, iz)] = p if clear(p) else None
    return cells[(ix, iz)]


def route(a, b):
    snap = lambda p: min(((round(p[0] / STEP) + dx, round(p[1] / STEP) + dz) for dx in range(-3, 4) for dz in range(-3, 4)
                          if node(round(p[0] / STEP) + dx, round(p[1] / STEP) + dz)), key=lambda k: dist(cells[k], p))
    start, goal = snap(a), snap(b)
    heap, cost, prev = [(0, start)], {start: 0}, {}
    while heap:
        _, u = heapq.heappop(heap)
        if u == goal:
            break
        for dx, dz in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)]:
            v = (u[0] + dx, u[1] + dz)
            if not node(*v) or (dx and dz and (not node(u[0] + dx, u[1]) or not node(u[0], u[1] + dz))):
                continue
            c = cost[u] + math.hypot(dx, dz)
            if c < cost.get(v, math.inf):
                cost[v], prev[v] = c, u
                heapq.heappush(heap, (c + dist(v, goal), v))
    else:
        raise ValueError(f'No route around the floor from {a} to {b}')
    cellpath = [goal]
    while cellpath[-1] != start:
        cellpath.append(prev[cellpath[-1]])
    raw = [list(cells[k]) for k in reversed(cellpath)]
    out = [raw[0]]
    for i in range(1, len(raw) - 1):
        d1 = (round(raw[i][0] - raw[i - 1][0], 3), round(raw[i][1] - raw[i - 1][1], 3))
        d2 = (round(raw[i + 1][0] - raw[i][0], 3), round(raw[i + 1][1] - raw[i][1], 3))
        if d1 != d2:
            out.append(raw[i])
    out.append(raw[-1])
    full = [list(a)] + out + [list(b)]
    return [p for i, p in enumerate(full) if i == 0 or dist(p, full[i - 1]) > 1e-6]


rerouted = []
for a in loop['actors']:
    if a['levelId'] != 'ground' or a['id'] in stations or a.get('escortFor') or a.get('pairedWith'):
        continue
    for s in a['segments']:
        if s['action'] not in ('walk', 'roll') or s.get('visible') is False:
            continue
        samples = [lerp(p, q, j / 20) for p, q in zip(s['path'], s['path'][1:]) for j in range(21)]
        if not any(crosses_floor(p) for p in samples):
            continue
        s['path'] = route(s['path'][0], s['path'][-1])
        if 'heights' in s:
            # Floor reroutes stay on one level; keep a height per point.
            assert len(set(s['heights'])) == 1, f"{a['id']} reroute changes level"
            s['heights'] = [s['heights'][0]] * len(s['path'])
        length = sum(dist(p, q) for p, q in zip(s['path'], s['path'][1:]))
        rerouted.append((a['id'], round(length / (s['end'] - s['start']), 2)))
assert all(speed <= 1.3 for _, speed in rerouted), f'Rerouted walks stay at a comfortable pace: {rerouted}'
# Earlier reroutes left stale per-point heights; one level, so one height per point.
for a in loop['actors']:
    for s in a['segments']:
        if 'heights' in s and len(s['heights']) != len(s['path']):
            assert len(set(s['heights'])) == 1, f"{a['id']} {s['title']} changes level"
            s['heights'] = [s['heights'][0]] * len(s['path'])

# Escorts mirror their participant's itinerary; keep their copies in step.
for escort in (a for a in loop['actors'] if a.get('escortFor')):
    leader = actor(escort['escortFor'])
    for s, l in zip(escort['segments'], leader['segments']):
        if s['zoneId'] == 'day':
            s.update(action=l['action'], title=l['title'], path=l['path'])
            if 'heights' in l:
                s['heights'] = l['heights']
for i in loop['interactions']:
    if not i['id'].startswith('arrival-') or '-visit-' not in i['id']:
        continue
    person = actor(i['actorIds'][0])
    at = next((s for s in person['segments'] if abs(s['start'] - i['start']) < 1e-3 and s['zoneId'] == 'day'), None)
    if not at or at['title'] != 'Watching the arts table':
        continue
    teachers = [s['instructorId'] for s in sessions('arts-table') if min(s['end'], i['end']) - max(s['start'], i['start']) > 1]
    i['label'] = ' · '.join(i['label'].split(' · ')[:-1] + ['Arts table visit'])
    i['actorIds'] = list(dict.fromkeys([id for id in i['actorIds'] if id != 'activities-lead'] + teachers))

# ---- Interactions: one per zone session and one per table activity.
for s in program['programs']:
    cast = [st['actorId'] for st in program['stations']] if s['zone'] == 'floor' else zones[s['zone']]['participants']
    loop['interactions'].append(dict(
        id='day-' + s['id'], label=s['title'] + (' · ' + s['labelZh'] if s.get('labelZh') else ''), category='activities',
        actorIds=cast + ([s['instructorId']] if s.get('instructorId') else []), start=s['start'], end=s['end'], zoneId='day',
        description=s['culture'] + ' ' + s['access']))
for t in OWNED_TABLES:
    cast = [id for id, table_id in tabled.items() if table_id == t['id']]
    name = t['id'].replace('day-', '').replace('-table', '').replace('-', ' ')
    for k, e in enumerate(t['schedule']):
        act = ACTIVITIES[e['activity']]
        loop['interactions'].append(dict(
            id=f"table-{t['id'].replace('day-', '')}-{k + 1}", label=f"{act['label']} · {act['labelZh']}", category='activities',
            actorIds=cast, start=e['start'], end=e['end'], zoneId='day', description=f"{act['label']} at the {name} table."))
# Groups that now belong to a zone or a table leave their all-day table interactions.
grouped = {id for z in program['zones'] for id in z.get('participants', [])} | set(tabled) | set(RELOCATE)
for i in (i for i in loop['interactions'] if i['id'].startswith('daily-') or i['id'] == 'quiet-creative-table'):
    i['actorIds'] = [id for id in i['actorIds'] if id not in grouped]
loop['interactions'] = [i for i in loop['interactions'] if i['actorIds']]

for a in loop['actors']:
    a['profileId'] = a['id']
loop['roles'] = sorted({a['role'] for a in loop['actors']})
loop['description'] = f"{len(loop['actors'])} individual people, with most day-center and dining seats occupied, concurrent cultural activities with guest instructors, table games and crafts, care, meals and transport."
assert len({a['id'] for a in loop['actors']}) == len(loop['actors'])
profiles = {p['id'] for p in library['people']}
assert all(a['profileId'] in profiles for a in loop['actors']), 'Every actor has a profile'
for path, data in [('app/data/activity-loop.json', loop), ('public/models/activity-loop.json', loop),
                   ('app/data/character-templates.json', library), ('public/models/character-templates.json', library)]:
    (R / path).write_text(json.dumps(data, indent=2) + '\n')
print(f"Cultural program: {len(program['programs'])} sessions in {len(program['zones'])} zones, {len(cohort)} in the floor class, "
      f"{len(tabled)} people at {len(program['tables'])} activity tables, {len(program['instructors'])} guest instructors; "
      f"closest rearrangement pass {worst:.2f} m; {retargeted} legacy stops retargeted, {len(rerouted)} walks rerouted {rerouted}; "
      f"{len(loop['actors'])} people, {len(loop['interactions'])} interactions.")
