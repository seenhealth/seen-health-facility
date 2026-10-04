"""Solve the poses of the front and both front-quarter photos together (bundle adjustment), for build_van.py.

    uv run --with opencv-python-headless --with scipy python scripts/fleet-van/solve_cameras.py

Writes scripts/fleet-van/cameras.json (committed, so build.sh needs neither OpenCV nor scipy). The model frame comes
from anchors measured on the rectified side photos (wheel hubs, cab-window corners); every other point is solved,
mirrored across x = 0 where the van is symmetric (a primed name is the mirror of its point) or kept on the centre
plane. Pixel coordinates are on the stored photos (2856 x 2142). Focal starts from the EXIF 24 mm equivalent and is
shared by the three photos (same lens); the fit settles about 10% longer, and the solved points barely move if it is
pinned instead.
"""
import json, math, os
import numpy as np, cv2
from scipy.optimize import least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 2856, 2142
F0 = 24 / 43.27 * math.hypot(W, H)
ANCH = {'hub_fl': (-0.99, 0.375, -2.2), 'hub_rl': (-0.99, 0.375, 1.84), 'hub_fr': (0.99, 0.375, -2.2), 'hub_rr': (0.99, 0.375, 1.84),
        'win_rt_l': (-1.04, 2.113, -1.18), 'win_ft_l': (-1.035, 2.113, -1.60), 'win_rb_l': (-1.06, 1.255, -1.213),
        'pil_t_l': (-1.04, 2.135, -1.04), 'pil_b_l': (-1.04, 1.46, -1.04),
        'win_rt_r': (1.04, 2.113, -1.18), 'win_ft_r': (1.035, 2.113, -1.60), 'win_rb_r': (1.06, 1.255, -1.213)}
# solved points: roof marker lamps, the headlamp's inner tip and outer top corner, the hood's rear corner; on x = 0 the
# grille's lower chrome notch and the plate's centre
FREE = {'mk_a': (0.69, 2.59, -1.25), 'mk_b': (0.25, 2.62, -1.24), 'mk_c': (0.02, 2.62, -1.24), 'mk_d': (-0.22, 2.62, -1.24),
        'mk_e': (-0.65, 2.60, -1.24), 'lamp_in': (-0.44, 1.08, -3.03), 'lamp_out': (-0.87, 1.29, -2.42), 'hood_rear': (-0.95, 1.44, -2.55)}
MID = {'notch': (0.73, -3.11), 'plate': (0.57, -3.31)}
OBS = {
    'front-quarter': {'hub_fl': (1518, 1553), 'hub_rl': (2372, 1127), 'win_rt_l': (1894.1, 398.8), 'win_ft_l': (1720.5, 401.9),
                      'win_rb_l': (1888.6, 905.6), 'pil_t_l': (1932.5, 422.6), 'pil_b_l': (1945.9, 817.3),
                      'mk_a': (1172.3, 288.0), 'mk_b': (1316.0, 246.0), 'mk_c': (1400.0, 231.1), 'mk_d': (1491.0, 211.0), 'mk_e': (1680.0, 185.3),
                      'lamp_in': (784, 1149), 'lamp_out': (1328, 957), "hood_rear'": (619.2, 855), 'notch': (602.7, 1356.4), 'plate': (474.5, 1506.4)},
    'kerb-front-quarter': {'hub_fr': (1383.6, 1621.5), 'hub_rr': (446.9, 1152.4), 'win_rt_r': (973.0, 404.4), 'win_ft_r': (1161.6, 408.2),
                           'win_rb_r': (966.9, 923.6),
                           'mk_a': (1191.0, 180.7), 'mk_b': (1381.4, 206.3), 'mk_c': (1471.9, 226.4), 'mk_d': (1556.4, 246.0), 'mk_e': (1697.3, 288.0),
                           "lamp_in'": (2170.1, 1195.5), "lamp_out'": (1590.7, 997.5), "hood_rear'": (1630, 889.7),
                           'notch': (2346.4, 1424.5), 'plate': (2477.3, 1569.1)},
    'front': {'mk_a': (1054.7, 318.7), 'mk_b': (1268, 313.3), 'mk_c': (1382.7, 313.3), 'mk_d': (1492, 313.3), 'mk_e': (1702.7, 326.7),
              "lamp_in'": (1004.7, 1221.4), 'lamp_in': (1793, 1224.6), "lamp_out'": (749.5, 1006.5), 'lamp_out': (2042.7, 1014.5),
              'notch': (1400, 1496), 'plate': (1412, 1706)},
}
CAMS = list(OBS)

def K(f):
    return np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
def unpack(p):
    f = p[0]; cams = {c: (p[1 + 6 * i: 4 + 6 * i], p[4 + 6 * i: 7 + 6 * i]) for i, c in enumerate(CAMS)}
    o = 1 + 6 * len(CAMS); pts = {}
    for n in FREE: pts[n] = p[o:o + 3]; o += 3
    for n in MID: pts[n] = np.array([0.0, p[o], p[o + 1]]); o += 2
    return f, cams, pts
def point(name, pts):
    if name in ANCH: return np.array(ANCH[name], float)
    q = pts[name.rstrip("'")].copy()
    if name.endswith("'"): q[0] = -q[0]
    return q
def resid(p):
    f, cams, pts = unpack(p); r = []
    for c in CAMS:
        names = list(OBS[c])
        pr, _ = cv2.projectPoints(np.array([point(n, pts) for n in names]), *cams[c], K(f), None)
        r.append((pr.reshape(-1, 2) - np.array([OBS[c][n] for n in names])).ravel())
    return np.concatenate(r + [[(f - F0) / 30.0]])

def initial():
    p = [F0]
    for c in CAMS:
        names = [n for n in OBS[c] if n in ANCH or n.rstrip("'") in FREE or n in MID]
        guess = lambda n: np.array(ANCH[n]) if n in ANCH else (np.array([0, *MID[n]]) if n in MID else
                                                                np.array(FREE[n.rstrip("'")]) * ([-1, 1, 1] if n.endswith("'") else 1))
        ok, rv, tv = cv2.solvePnP(np.array([guess(n) for n in names], float), np.array([OBS[c][n] for n in names], float), K(F0), None,
                                  flags=cv2.SOLVEPNP_SQPNP)
        p += list(rv.ravel()) + list(tv.ravel())
    for v in FREE.values(): p += list(v)
    for v in MID.values(): p += list(v)
    return np.array(p, float)

sol = least_squares(resid, initial(), loss='soft_l1', f_scale=8.0)
f, cams, pts = unpack(sol.x)
err = np.linalg.norm(resid(sol.x)[:-1].reshape(-1, 2), axis=1)
print(f'focal {f:.0f} px (EXIF {F0:.0f}); reprojection median {np.median(err):.1f} px, max {err.max():.1f} px')
out = {'size': [W, H], 'focal': f, 'cameras': {}, 'points': {n: [round(v, 4) for v in pts[n]] for n in pts}}
for c in CAMS:
    rv, tv = cams[c]; R, _ = cv2.Rodrigues(rv)
    out['cameras'][c] = {'R': R.round(6).tolist(), 't': np.ravel(tv).round(5).tolist(), 'centre': (-R.T @ tv).round(3).tolist()}
    print(c, 'camera at', out['cameras'][c]['centre'])
for n, v in out['points'].items(): print(n, v)
json.dump(out, open(os.path.join(HERE, 'cameras.json'), 'w'), indent=1)
