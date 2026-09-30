"""Owner-requested back-of-house recreation rooms (September 30, 2026).

Adds a table-tennis game room in `rear-north`, the primary karaoke room in the
central support room `lobby-office-c3` (short walks from the day room) and a
small second karaoke room in `lobby-office-w2`. These image-traced rooms had no
recorded use or furniture; the assignment is an owner-confirmable assumption,
not a surveyed program. `lobby-office-w1` stays unassigned.

Idempotent: every run removes the previous `rec-` assets, materials and objects
and rebuilds them from this file. Run after apply-layout-corrections.py. The
geometric assertions below check footprints, player run-backs, standing spots
and door approaches against the traced walls before anything is written.
"""
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / 'public/models/seen-alhambra-planning.json'
PI = math.pi
STATUS = 'owner-requested program / use assumed / dimensions estimated'
PAGES = [92]
ASSUMPTION = (
    'Owner-requested recreation use of an empty image-traced room. The room '
    'assignment is an assumption for the owner to confirm; no program or '
    'furniture was recorded here in the supplied plan.'
)

# Room use, names and the doorway each room is entered through (plan
# coordinates, meters). Doors are gaps between traced walls.
ROOMS = {
    'rear-north': dict(
        name='Game room · table tennis',
        door='South doorway x 9.46–11.35 at z −7.02, from the corridor beside the back laundry; rear exit x 10.13–11.20 in the north wall kept clear.',
    ),
    'lobby-office-c3': dict(
        name='Karaoke room',
        door='South doorway x −4.07 to −2.95 at z 7.33 from the day room; north openings to reception rooms N1 (x −6.31 to −5.44) and N2 (x −5.24 to −2.85) kept clear.',
    ),
    'lobby-office-w2': dict(
        name='Karaoke room 2',
        door='South-west doorway x −14.50 to −13.53 at z 8.80, opening from the day room.',
    ),
}
# Rooms an earlier revision of this script assigned, restored to their trace.
UNASSIGNED = {
    'lobby-office-w1': dict(
        name='Reception-side room W1',
        status='image-traced',
        notes='Boundary traced from Overall Planning.jpg. Stable trace ID; room name is descriptive unless shown in the architectural set.',
    ),
}


def apply_update(m):
    # Idempotency: clear everything this script owns.
    m['objects'] = [o for o in m['objects'] if not o['id'].startswith('rec-')]
    m['assets'] = {k: v for k, v in m['assets'].items() if not k.startswith('rec-')}
    m['materials'] = {k: v for k, v in m['materials'].items() if not k.startswith('rec-')}
    m['accuracyIssues'] = [i for i in m['accuracyIssues'] if i['id'] != 'recreation-rooms']
    review = m['interiorReview']
    review['newObjectIds'] = [i for i in review['newObjectIds'] if not i.startswith('rec-')]

    m['materials'].update({
        # Brand deep green playing surface, used sparingly.
        'rec-table-green': dict(color='#1f4d3a', roughness=0.5),
        'rec-net': dict(color='#f2f1ec', roughness=0.85, opacity=0.6),
        'rec-sofa': dict(color='#9aa68f', roughness=0.92),
        'rec-speaker': dict(color='#35393a', roughness=0.82),
        'rec-screen': dict(color='#1d2a33', roughness=0.25, emissive='#2b4a5c', emissiveIntensity=0.45),
        'rec-glow': dict(color='#fff1dc', roughness=0.6, emissive='#ffcf94', emissiveIntensity=0.9),
        'rec-lamp': dict(color='#fbf1e0', roughness=0.75, emissive='#ffd8a3', emissiveIntensity=0.75),
    })

    def asset(id, kind, dim, mat, materials=None, **params):
        a = dict(kind=kind, dimensions=dim, material=mat)
        if materials:
            a['materials'] = materials
        if params:
            a['parameters'] = params
        m['assets'][id] = a

    joinery = {'wood': 'oak', 'frame': 'photo-black', 'white': 'photo-white', 'metal': 'photo-silver'}
    # Regulation 2.74 x 1.525 m top at 0.76 m; width includes the net posts.
    asset('rec-table-tennis', 'table-tennis-table', [1.83, 0.915, 2.74], 'rec-table-green',
          {'line': 'photo-white', 'frame': 'photo-black', 'net': 'rec-net'})
    asset('rec-paddle-rack', 'paddle-rack', [0.9, 1.15, 0.3], 'oak',
          {**joinery, 'board': 'photo-white', 'rubber': 'photo-red-cart', 'accent': 'photo-mustard', 'ball': 'photo-white'})
    asset('rec-bench', 'rec-bench', [1.8, 0.45, 0.42], 'oak', {'wood': 'oak', 'frame': 'photo-black'})
    media = {'wood': 'oak', 'frame': 'photo-black', 'glow': 'rec-glow', 'screen': 'rec-screen', 'lyrics': 'rec-glow'}
    asset('rec-karaoke-media-large', 'karaoke-media', [1.9, 1.6, 0.42], 'oak', media, screenWidth=1.66)
    asset('rec-karaoke-media', 'karaoke-media', [1.5, 1.5, 0.4], 'oak', media, screenWidth=1.34)
    asset('rec-tower-speaker', 'tower-speaker', [0.24, 1.0, 0.26], 'rec-speaker', {'frame': 'photo-black', 'driver': 'photo-black'})
    asset('rec-mic-stand', 'mic-stand', [0.3, 1.5, 0.55], 'photo-black', {'frame': 'photo-black', 'metal': 'photo-silver'})
    asset('rec-sofa-3', 'compact-sofa', [1.8, 0.8, 0.78], 'rec-sofa', {'wood': 'oak'}, seats=3)
    asset('rec-side-table-lamp', 'side-table-lamp', [0.44, 0.81, 0.44], 'oak',
          {'wood': 'oak', 'frame': 'photo-black', 'base': 'photo-white', 'shade': 'rec-lamp'})

    rooms = {r['id']: r for r in m['rooms']}
    added = []

    def add(id, aid, x, z, room, rot, note, nav=None, y=0):
        r = rooms[room]
        o = dict(id=id, assetId=aid, zoneId=r['zoneId'], levelId=r['levelId'],
                 position=[round(x, 4), y, round(z, 4)], rotation=rot, scale=[1, 1, 1],
                 roomId=room, referencePages=PAGES, status=STATUS,
                 notes=note + ' ' + ASSUMPTION, layer='furniture')
        if nav is not None:
            o['navigationFootprints'] = nav
        m['objects'].append(o)
        added.append(o)

    # Game room. Inner wall faces: west 6.716, east 11.651, north (envelope)
    # −15.093; the back laundry occupies x 6.61–9.26, z −9.72 to −6.97.
    add('rec-game-table-tennis', 'rec-table-tennis', 9.3, -12.35, 'rear-north', 0,
        'Table-tennis table, long axis north–south with 1.26–1.37 m run-back at each end.',
        nav=[[0, 0, 1.525, 2.74], [0, 0, 1.83, 0.06]])
    add('rec-game-bench', 'rec-bench', 6.945, -12.0, 'rear-north', PI / 2,
        'Slatted oak spectator bench for three along the west wall.')
    add('rec-game-paddle-rack', 'rec-paddle-rack', 6.88, -14.4, 'rear-north', PI / 2,
        'Paddle and ball rack against the west wall, clear of the rear exit.')

    # Karaoke rooms: screen on the solid west wall facing east (toward the
    # default isometric camera), seating facing it, singer's spot between.
    # Primary room (lobby-office-c3): inner faces x −6.793 / −2.824,
    # z 3.332 / 7.200.
    kc = 'lobby-office-c3'
    add('rec-karaoke-main-media', 'rec-karaoke-media-large', -6.578, 5.29, kc, PI / 2,
        'Wall-hung large screen with warm backlight over a low oak console.')
    add('rec-karaoke-main-speaker-north', 'rec-tower-speaker', -6.65, 4.1, kc, PI / 2, 'Floor-standing speaker.')
    add('rec-karaoke-main-speaker-south', 'rec-tower-speaker', -6.65, 6.48, kc, PI / 2, 'Floor-standing speaker.')
    add('rec-karaoke-main-mic', 'rec-mic-stand', -5.75, 4.55, kc, 0, 'Microphone stand beside the singing spot.')
    add('rec-karaoke-main-sofa', 'rec-sofa-3', -3.224, 5.2, kc, -PI / 2, 'Three-seat sofa on the east wall facing the screen.')
    add('rec-karaoke-main-table', 'interior-plan-lounge-table', -4.37, 5.2, kc, 0,
        'Marble lounge table (day-room family) in front of the sofa.')
    add('rec-karaoke-main-armchair', 'photo-lounge-chair', -5.62, 6.55, kc, 0.558,
        'High-back lounge chair (day-room family) angled toward the screen.')
    add('rec-karaoke-main-side-table', 'rec-side-table-lamp', -6.5, 6.95, kc, 0, 'Low side table with a warm lamp.')

    # Karaoke room 2 (lobby-office-w2): inner faces x −14.528 / −12.082,
    # z 5.671 / 8.678.
    k2 = 'lobby-office-w2'
    add('rec-karaoke-2-media', 'rec-karaoke-media', -14.323, 6.7, k2, PI / 2,
        'Wall-hung large screen with warm backlight over a low oak console.')
    add('rec-karaoke-2-speaker-north', 'rec-tower-speaker', -14.39, 5.8, k2, PI / 2, 'Floor-standing speaker.')
    add('rec-karaoke-2-speaker-south', 'rec-tower-speaker', -14.39, 7.6, k2, PI / 2, 'Floor-standing speaker.')
    add('rec-karaoke-2-mic', 'rec-mic-stand', -13.75, 7.72, k2, PI / 2, 'Microphone stand beside the singing spot.')
    add('rec-karaoke-2-sofa', 'rec-sofa-3', -12.482, 6.7, k2, -PI / 2, 'Compact three-seat sofa facing the screen.')
    add('rec-karaoke-2-side-table', 'rec-side-table-lamp', -12.33, 7.9, k2, 0, 'Low side table with a warm lamp.')

    # ---- Geometric checks -------------------------------------------------
    def footprint(o):
        w, _, d = m['assets'][o['assetId']]['dimensions']
        c, s = math.cos(o['rotation']), math.sin(o['rotation'])
        hw, hd = (abs(c) * w + abs(s) * d) / 2, (abs(s) * w + abs(c) * d) / 2
        x, _, z = o['position']
        return (x - hw, x + hw, z - hd, z + hd)

    def overlaps(a, b, gap=0.0):
        return a[0] < b[1] + gap and b[0] < a[1] + gap and a[2] < b[3] + gap and b[2] < a[3] + gap

    def inset(room, t):
        xs = [p[0] for p in rooms[room]['polygon']]
        zs = [p[1] for p in rooms[room]['polygon']]
        return (min(xs) + t, max(xs) - t, min(zs) + t, max(zs) - t)

    def circle(x, z, r):
        return (x - r, x + r, z - r, z + r)

    laundry = (6.614, 9.26, -9.72, -6.97)
    wall = {'rear-north': 0.102, kc: 0.127, k2: 0.127}
    for o in added:
        f, (x0, x1, z0, z1) = footprint(o), inset(o['roomId'], wall[o['roomId']])
        assert x0 - 1e-6 <= f[0] and f[1] <= x1 + 1e-6 and z0 - 1e-6 <= f[2] and f[3] <= z1 + 1e-6, f'{o["id"]} outside {o["roomId"]}'
        assert not overlaps(f, laundry) or o['roomId'] != 'rear-north', o['id']
        for q in added:
            # Items standing on another piece (y > 0) may share its footprint.
            if q is not o and not (o['position'][1] or q['position'][1]):
                assert not overlaps(f, footprint(q)), f'{o["id"]} overlaps {q["id"]}'
    table = footprint(added[0])
    top = (9.3 - 1.525 / 2, 9.3 + 1.525 / 2)
    north_face = -15.213 + 0.12
    assert table[2] - north_face >= 1.2 and laundry[2] - table[3] >= 1.2, 'Table-tennis run-back'
    clear = {
        'rear-north': [
            (top[0], top[1], north_face, table[2]),  # north run-back
            (top[0], top[1], table[3], laundry[2]),  # south run-back
            circle(9.3, -14.35, 0.3), circle(9.3, -10.35, 0.3),  # players
            (9.46, 11.35, -8.3, -7.12),  # south doorway approach
            (10.13, 11.2, north_face, -14.1),  # rear exit approach
        ],
        kc: [
            circle(-5.75, 5.27, 0.4),  # singer, ~1 m in front of the screen
            (-4.07, -2.951, 6.4, 7.2),  # south doorway from the day room
            (-5.241, -2.849, 3.332, 4.1),  # north opening to N2
            (-6.309, -5.444, 3.332, 4.1),  # north doorway to N1
        ],
        k2: [circle(-13.305, 7.199, 0.35), (-14.5, -13.53, 7.9, 8.675)],
    }
    for room, zones in clear.items():
        for o in added:
            if o['roomId'] != room:
                continue
            for zone in zones:
                if o['id'] == 'rec-game-table-tennis' and zone[:2] == top:
                    continue
                assert not overlaps(footprint(o), zone), f'{o["id"]} blocks {zone}'
    assert 11.651 - table[1] >= 1.2, 'East aisle past the table to the rear exit'

    for room, original in UNASSIGNED.items():
        rooms[room].update(original)
    for room, spec in ROOMS.items():
        r = rooms[room]
        r['name'] = spec['name']
        r['status'] = 'image-traced / recreation use assumed (owner to confirm)'
        r['notes'] = f'Boundary traced from Overall Planning.jpg. {ASSUMPTION} Entry: {spec["door"]}'
    zone = next(z for z in m['zones'] if z['id'] == 'ot')
    zone['notes'] = zone['notes'].split(' Recreation:')[0] + ' Recreation: table-tennis game room in the former rear support north room (assumed use).'

    review['newObjectIds'] += [o['id'] for o in added]
    m['accuracyIssues'].append(dict(
        id='recreation-rooms',
        title='Recreation room uses are assumed',
        detail='The owner asked for table tennis and karaoke. They are placed in empty image-traced rooms (rear support north; central support room C3; reception-side room W2) as an assumption for the owner to confirm. Equipment follows standard sizes; placement is estimated.',
        status='open',
        pages=PAGES,
    ))
    m['recreationRooms'] = dict(
        date='2026-09-30',
        accuracy=ASSUMPTION,
        rooms=[dict(roomId=k, name=v['name'], entry=v['door']) for k, v in ROOMS.items()],
        standingSpots={
            'table-tennis-north-player': [9.3, -14.35],
            'table-tennis-south-player': [9.3, -10.35],
            'karaoke-main-singer': [-5.75, 5.27],
            'karaoke-2-singer': [-13.305, 7.199],
        },
        objectIds=[o['id'] for o in added],
    )
    return m


if __name__ == '__main__':
    m = apply_update(json.loads(FILE.read_text()))
    FILE.write_text(json.dumps(m, indent=2) + '\n')
    rec = [o for o in m['objects'] if o['id'].startswith('rec-')]
    print(f'Applied recreation rooms: {len(rec)} objects; {len(m["objects"])} objects total.')
