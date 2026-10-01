"""Concurrent Chinese-American cultural zones in the Alhambra day room (October 2026).

app/data/day-program.json is the hand-authored source. This script regenerates, idempotently:
 - guest instructor actors and profiles (`instructor-*`), visible only during their sessions;
 - synchronized tracks for the floor stations, the long arts table and the tea corner;
 - a `day-<session>` interaction for every session in every zone;
 - the arts-table head chair for instructors (its participant moves to a free tree-table chair);
 - legacy day-room "Movement & exercise" stops beside the long table, now watching the arts table.
Writes the app/data and public/models copies of activity-loop.json and character-templates.json.
"""
import json, math
from pathlib import Path

R = Path(__file__).resolve().parents[1]
load = lambda p: json.loads((R / p).read_text())
program = load('app/data/day-program.json')
loop = load('app/data/activity-loop.json')
library = load('app/data/character-templates.json')
model = load('public/models/seen-alhambra-planning.json')
DURATION = loop['duration']
MOVEMENT = {'exercise', 'dance', 'tai-chi', 'qigong', 'fan-dance'}
zones = {z['id']: z for z in program['zones']}
instructors = {i['id']: i for i in program['instructors']}
sessions = lambda zone: sorted((s for s in program['programs'] if s['zone'] == zone), key=lambda s: s['start'])
r4 = lambda v: round(v, 4)


def actor(id):
    found = [a for a in loop['actors'] if a['id'] == id]
    assert found, f'Missing actor {id}'
    return found[0]


# ---- Schedule sanity: every zone is a gap-free rotation over the care day; one zone per instructor.
for zone in program['zones']:
    clock = 0
    for s in sessions(zone['id']):
        assert s['start'] == clock and s['end'] > s['start'], f"{s['id']} follows the previous session"
        assert not s.get('instructorId') or s['instructorId'] in instructors, f"{s['id']}: unknown instructor"
        clock = s['end']
    assert clock == DURATION, f"{zone['id']} covers the care day"
for id in instructors:
    assert len({s['zone'] for s in program['programs'] if s.get('instructorId') == id}) == 1, f'{id} leads in one zone'

# ---- Idempotency: drop everything this script owns before rebuilding it.
loop['actors'] = [a for a in loop['actors'] if not a['id'].startswith('instructor-')]
library['people'] = [p for p in library['people'] if not p['id'].startswith('instructor-')]
loop['interactions'] = [i for i in loop['interactions'] if not i['id'].startswith('day-')]

# ---- Free the arts-table head chair for the instructors.
head = zones['arts-table']['instructorSpot']
RELOCATE = {'daily-member-07': 'day-tree-chair-2-1'}
for id, chair_id in RELOCATE.items():
    a, chair = actor(id), next(o for o in model['objects'] if o['id'] == chair_id)
    assert not any(b is not a and b.get('seatId') == chair_id for b in loop['actors']), f'{chair_id} is free'
    p, acts = [chair['position'][0], chair['position'][2]], ['conversation', 'listen', 'greet', 'conversation']
    a.update(label='Small-group conversation', seatId=chair_id, roomId=chair.get('roomId', a.get('roomId')))
    a['segments'] = [dict(start=j * 90, end=(j + 1) * 90, action=acts[j % 4], path=[p, p], zoneId=chair['zoneId'],
                          heading=chair['rotation'] + math.pi, seated=True, title='Small-group conversation') for j in range(8)]
assert not any(a.get('seatId') == head['seatId'] for a in loop['actors']), 'Head chair is reserved for instructors'

# ---- Floor stations follow the open-floor rotation; guests lead while the activities lead co-hosts.
MODE_TITLE = {'leader': 'facilitate', 'support': 'individual assistance', 'standing': 'standing / seated choice',
              'chair': 'chair-based participation', 'wheelchair': 'wheelchair participation'}
for station in program['stations']:
    a, mode = actor(station['actorId']), station['mode']
    a.update(offset=0, programMode=mode)
    a['segments'] = []
    for s in sessions('floor'):
        action = s['leaderAction'] if mode == 'leader' else 'consult' if mode == 'support' else s['action']
        seated = mode in ['chair', 'wheelchair'] or (mode == 'leader' and action in ['write', 'craft', 'device']) or (
            mode == 'standing' and s['action'] not in MOVEMENT)
        role = f"co-host with {instructors[s['instructorId']]['name']}" if mode == 'leader' and s.get('instructorId') else MODE_TITLE[mode]
        a['segments'].append(dict(start=s['start'], end=s['end'], action=action, path=[station['position']] * 2, zoneId='day',
                                  heading=station['heading'], seated=seated, title=f"{s['label']} · {role}"))


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

# ---- Guest instructors: present for their sessions at the zone's instructor spot.
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
    spot = zones[led[0]['zone']]['instructorSpot']
    p, segments, clock = spot['position'], [], 0

    def away(end):
        if end > clock:
            segments.append(dict(start=clock, end=end, action='idle', path=[p, p], zoneId='day', heading=spot['heading'],
                                 visible=False, title='Guest instructor · not on site'))

    for s in led:
        away(s['start'])
        name = s['label'] + (' ' + s['labelZh'] if s.get('labelZh') else '')
        segments.append(dict(start=s['start'], end=s['end'], action=s['instructorAction'], path=[p, p], zoneId='day',
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
    if a['id'].startswith('instructor-') or a['id'] in stations or a.get('escortFor'):
        continue
    for s in a['segments']:
        still = all(q == s['path'][0] for q in s['path'])
        # Standing stops only: seated table groups keep their own conversation cycles.
        if s['zoneId'] != 'day' or not still or s.get('seated') or a.get('seatId') or s['action'] not in ['exercise', 'greet']:
            continue
        if near_table(s['path'][0]):
            staff = a['role'] != 'participant'
            s.update(action='consult' if staff else 'listen', title='Assisting at the arts table' if staff else 'Watching the arts table')
            retargeted += 1
        elif s['action'] == 'exercise':
            s.update(action='conversation', title='Chatting with friends')
            retargeted += 1
# Escorts mirror their participant's itinerary; keep their copies in step.
for escort in (a for a in loop['actors'] if a.get('escortFor')):
    leader = actor(escort['escortFor'])
    for s, l in zip(escort['segments'], leader['segments']):
        if s['zoneId'] == 'day':
            s.update(action=l['action'], title=l['title'])
for i in loop['interactions']:
    if not i['id'].startswith('arrival-') or '-visit-' not in i['id']:
        continue
    person = actor(i['actorIds'][0])
    at = next((s for s in person['segments'] if abs(s['start'] - i['start']) < 1e-3 and s['zoneId'] == 'day'), None)
    if not at or at['title'] != 'Watching the arts table':
        continue
    teachers = [s['instructorId'] for s in sessions('arts-table') if min(s['end'], i['end']) - max(s['start'], i['start']) > 1]
    i['label'] = ' · '.join(i['label'].split(' · ')[:-1] + ['Arts table visit'])
    i['actorIds'] = [id for id in i['actorIds'] if id != 'activities-lead'] + list(dict.fromkeys(teachers))

# ---- One interaction per session, in every zone.
for s in program['programs']:
    cast = [st['actorId'] for st in program['stations']] if s['zone'] == 'floor' else zones[s['zone']]['participants']
    loop['interactions'].append(dict(
        id='day-' + s['id'], label=s['title'] + (' · ' + s['labelZh'] if s.get('labelZh') else ''), category='activities',
        actorIds=cast + ([s['instructorId']] if s.get('instructorId') else []), start=s['start'], end=s['end'], zoneId='day',
        description=s['culture'] + ' ' + s['access']))
# Table groups that now belong to a zone leave their all-day table interactions.
zoned = {id for z in program['zones'] for id in z.get('participants', [])}
for i in (i for i in loop['interactions'] if i['id'].startswith('daily-')):
    i['actorIds'] = [id for id in i['actorIds'] if id not in zoned and id not in RELOCATE]
    if i['label'] == 'Small-group conversation':
        i['actorIds'] += [id for id in RELOCATE if id not in i['actorIds']]
loop['interactions'] = [i for i in loop['interactions'] if i['actorIds']]

for a in loop['actors']:
    a['profileId'] = a['id']
loop['roles'] = sorted({a['role'] for a in loop['actors']})
loop['description'] = f"{len(loop['actors'])} individual people, with most day-center and dining seats occupied, concurrent cultural activities with guest instructors, care, meals and transport."
assert len({a['id'] for a in loop['actors']}) == len(loop['actors'])
profiles = {p['id'] for p in library['people']}
assert all(a['profileId'] in profiles for a in loop['actors']), 'Every actor has a profile'
for path, data in [('app/data/activity-loop.json', loop), ('public/models/activity-loop.json', loop),
                   ('app/data/character-templates.json', library), ('public/models/character-templates.json', library)]:
    (R / path).write_text(json.dumps(data, indent=2) + '\n')
print(f"Cultural program: {len(program['programs'])} sessions in {len(program['zones'])} zones, {len(program['instructors'])} guest instructors, "
      f"{retargeted} legacy stops retargeted this run; {len(loop['actors'])} people, {len(loop['interactions'])} interactions.")
