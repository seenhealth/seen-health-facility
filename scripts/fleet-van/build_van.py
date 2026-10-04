"""Low-poly RAM ProMaster 3500 159" EXT high-roof van in Seen livery, for the facility's live lot.

Run headless (scripts/fleet-van/build.sh does atlas -> model -> preview renders):
    Blender -b -P build_van.py -- <atlas.jpg> <atlas.json> <out.glb>
Frame is three.js's (the facility's fleet-van convention): nose at -z, kerb (sliding-door) side +x, y up,
tyre soles at y 0. Blender is z-up, so every point goes through B(); the glTF exporter's +Y-up turns it back.
Window outlines, the A-pillar, the mirrors and the wipers are measured on the rectified side photos (atlas.py,
315 px/m) and the front photo. About 10,000 triangles.
"""
import bpy, bmesh, json, math, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
ATLAS_IMG, ATLAS_JSON, OUT = argv[:3]
A = json.load(open(ATLAS_JSON))
AW, AH = A['size']

def B(x, y, z):
    return Vector((x, -z, y))
def T(v):
    return Vector((v.x, v.z, -v.y))

HW = 1.04          # half body width
SILL = 0.36        # bottom of the side body
WR, AR = 0.375, 0.48   # tyre radius, wheel-well radius
WFZ, WRZ = -2.2, 1.84  # axle z (159" wheelbase)
FLOOR = 0.58
ROOF = 2.58
BEV = 0.15         # roof, hood edges and tail rounding
NOSE_R = 0.45      # the nose's corners in plan, below the hood's top (the bumper's and the headlamps' sweep)
PB = 0.09          # A-pillar rounding: the windshield wraps round it to ~97% of the width (front photo)
# Side profile (z, y), nose first, measured with the solved cameras (cameras.json) and the hood lettering triangulated
# between the front and front-quarter photos: the grille stands nearly upright (its lower chrome notch at z -3.10,
# y 0.73); the hood rises almost vertically from its front edge over the grille (y 1.07) to y 1.25 ("SEEN HEALTH"
# sits on that face), rounds over by y 1.34 and runs nearly level back to the cowl (y 1.37 on the centre line, 1.43 at
# the sides); the windshield line runs (-2.43, 1.485) -> (-1.48, 2.38).
NOSE = [(-3.175, 0.34), (-3.20, 0.46), (-3.205, 0.62), (-3.16, 0.70), (-3.115, 0.78), (-3.10, 0.95), (-3.085, 1.04),
        (-3.08, 1.07), (-3.07, 1.15), (-3.062, 1.22), (-3.045, 1.27), (-3.01, 1.31), (-2.96, 1.34), (-2.88, 1.355),
        (-2.75, 1.362), (-2.62, 1.367), (-2.53, 1.37)]
WS0, WS1 = (-2.43, 1.485), (-1.48, 2.38)
PROFILE = NOSE + [WS0, WS1, (-1.40, 2.47), (-1.26, 2.545), (-1.05, ROOF), (3.10, ROOF), (3.155, 2.555),
                  (3.175, 2.50), (3.175, 0.44), (3.10, SILL), (-3.05, SILL)]
def nose_z(y):
    """z of the nose profile at height y (front face, before the corner bevel)."""
    for (za, ya), (zb, yb) in zip(NOSE, NOSE[1:]):
        if ya <= y <= yb:
            return za + (zb - za) * (y - ya) / (yb - ya)
    return NOSE[-1][0]

# Windshield frame: s runs up the glass from the cowl line, off is outward (toward -z, +y), x across.
WL = math.hypot(WS1[0] - WS0[0], WS1[1] - WS0[1])
WEZ, WEY = (WS1[0] - WS0[0]) / WL, (WS1[1] - WS0[1]) / WL
WNZ, WNY = WEY, -WEZ                     # unit normal into the cab
def ws(x, s, off):
    return B(x, WS0[1] + WEY * s - WNY * off, WS0[0] + WEZ * s - WNZ * off)
def side_x(z, y):
    """|x| of the side skin at (z, y): within PB of the windshield line the pillar rounding pulls it in."""
    d = (z - WS0[0]) * WNZ + (y - WS0[1]) * WNY
    return HW if d >= PB else HW - (PB - math.sqrt(max(0.0, PB * PB - (PB - d) ** 2)))
def pillar_depth(x):
    """How far the rounded A-pillar falls back behind the windshield plane at |x|."""
    a = abs(x) - (HW - PB)
    return 0.0 if a <= 0 else PB - math.sqrt(max(0.0, PB * PB - a * a))
# The glass: a rounded rectangle wrapping into the pillars, 12 mm inside the skin (front photo: top corners
# r ~0.16, bottom ~0.06, the glass reaching x 0.985 of the 1.04 half width), from just above the cowl up to y 2.21,
# under the teal band of the high roof's cap.
WG = dict(xw=0.985, s0=0.03 * WL, s1=0.81 * WL, rb=0.06, rt=0.16)
def ws_glass_off(x):
    return -(pillar_depth(x) + 0.012)

def fillet(poly, radii):
    """Round each corner of a closed (z, y) polygon with its radius (0 keeps it sharp), ~15 degrees a step."""
    out = []
    n = len(poly)
    for i in range(n):
        p, a, b, r = Vector(poly[i]), Vector(poly[i - 1]), Vector(poly[(i + 1) % n]), radii[i]
        if r <= 0:
            out.append(tuple(p)); continue
        u, v = (a - p).normalized(), (b - p).normalized()
        ang = math.acos(max(-1.0, min(1.0, u.dot(v))))
        t = r / math.tan(ang / 2)
        p1, p2 = p + u * t, p + v * t
        c = p + (u + v).normalized() * (r / math.sin(ang / 2))
        k = max(2, round(math.degrees(math.pi - ang) / 15))
        a1, a2 = math.atan2(p1.y - c.y, p1.x - c.x), math.atan2(p2.y - c.y, p2.x - c.x)
        da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        out += [(c.x + r * math.cos(a1 + da * j / k), c.y + r * math.sin(a1 + da * j / k)) for j in range(k + 1)]
    return out
def offset_poly(poly, d):
    """Each vertex of a closed (z, y) polygon pushed out by d (mitred)."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sg = 1 if area > 0 else -1
    out = []
    for i in range(n):
        a, p, b = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e1, e2 = (p - a).normalized(), (b - p).normalized()
        n1, n2 = Vector((e1.y, -e1.x)) * sg, Vector((e2.y, -e2.x)) * sg
        m = (n1 + n2).normalized() if (n1 + n2).length > 1e-9 else n1
        out.append(tuple(p + m * (d / max(0.4, m.dot(n1)))))
    return out

# Cab door window (z, y), measured on both side photos: the edge along the A-pillar, a level top, the rear edge
# leaning back, the belt falling toward the nose, the black mirror sail filling its foot. A vent division bar
# splits off the front quarter glass.
CAB_WIN = fillet([(-1.60, 2.113), (-1.18, 2.113), (-1.19, 1.385), (-1.66, 1.355), (-2.10, 1.34), (-2.10, 1.638)],
                 [0.03, 0.05, 0.20, 0.0, 0.015, 0.02])
SAIL = [(-2.10, 1.34), (-1.99, 1.344), (-1.99, 1.7425), (-2.10, 1.638)]
DIVIDER = [(-1.64, 2.125), (-1.60, 2.125), (-1.672, 1.35), (-1.708, 1.35)]
# The door: its shut line runs 7 cm ahead of the window up the A-pillar, then down the fender at z -2.17.
CAB_DOOR = [(-2.17, 0.45), (-1.08, 0.45), (-1.08, 2.19), (-1.589, 2.19), (-2.17, 1.638)]
SIDE_DOOR = (-0.95, 0.65, 0.40, 2.44)   # z0, z1, y0, y1 of the twin-door opening on +x

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
scene = bpy.context.scene

def new_obj(name, bm, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    if parent: o.parent = parent
    return o

def solid(bm, a3, b3):
    """Closed solid between two loops of Blender points (caps and sides)."""
    a = [bm.verts.new(p) for p in a3]; b = [bm.verts.new(p) for p in b3]
    fs = [bm.faces.new(a), bm.faces.new(list(reversed(b)))]
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        fs.append(bm.faces.new([a[i], a[j], b[j], b[i]]))
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    return bm

def prism(points_zy, x0, x1, bm=None):
    """Closed prism: polygon in (z, y) extruded from x0 to x1 (three frame)."""
    bm = bm or bmesh.new()
    return solid(bm, [B(x0, y, z) for z, y in points_zy], [B(x1, y, z) for z, y in points_zy])

def box(x0, x1, y0, y1, z0, z1, bm=None):
    return prism([(z0, y0), (z1, y0), (z1, y1), (z0, y1)], x0, x1, bm)

def cylinder_x(cx, cy, cz, r, x0, x1, seg=16, bm=None):
    pts = [(cz + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return prism(pts, x0, x1, bm)

def face(bm, verts, want):
    """A face whose normal points along `want` (three direction)."""
    f = bm.faces.new(verts); f.normal_update()
    if f.normal.dot(B(*want)) < 0:
        f.normal_flip()
    return f

def boolean(target, cutter, op='DIFFERENCE'):
    m = target.modifiers.new('b', 'BOOLEAN')
    m.object = cutter; m.operation = op; m.solver = 'EXACT'
    apply_modifiers(target)

def apply_modifiers(target):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
    target.modifiers.clear()
    old = target.data; target.data = me; bpy.data.meshes.remove(old)

def remove(o):
    me = o.data; bpy.data.objects.remove(o, do_unlink=True)
    if me and me.users == 0: bpy.data.meshes.remove(me)

def cutter(bm, name='cut'):
    o = new_obj(name, bm); return o

def smooth(o, angle=35):
    me = o.data
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(angle))

# ---------------------------------------------------------------- body solid with rounded corners
# One weighted bevel (weights are fractions of NOSE_R): the nose's upright corners at NOSE_R, easing to BEV where the
# hood rounds over; roof and tail at BEV, the A-pillar tighter (PB).
bm = prism(PROFILE, -HW, HW)
bw = bm.edges.layers.float.new('bevel_weight_edge')
def side_edges(pred):
    out = []
    for e in bm.edges:
        a, b = (T(v.co) for v in e.verts)
        if abs(abs(a.x) - HW) < 1e-4 and abs(abs(b.x) - HW) < 1e-4 and a.x * b.x > 0 and pred(a, b):
            out.append(e)
    return out
near = lambda p, q: abs(p.z - q[0]) < 1e-3 and abs(p.y - q[1]) < 1e-3
k = BEV / NOSE_R
for e in side_edges(lambda a, b: min(a.y, b.y) > 2.37 and max(a.z, b.z) < 3.12):       # roof
    e[bw] = k * (0.8 if any(near(T(v.co), WS1) for v in e.verts) else 1.0)
for e in side_edges(lambda a, b: max(a.z, b.z) <= NOSE[-1][0] + 0.01):                     # nose
    ym = sum(T(v.co).y for v in e.verts) / 2
    e[bw] = 0.8 * k if any(near(T(v.co), NOSE[-1]) for v in e.verts) else \
        k + (1 - k) * min(1.0, max(0.0, (1.355 - ym) / (1.355 - 1.30)))
for e in side_edges(lambda a, b: min(a.z, b.z) > NOSE[-1][0] - 0.01 and max(a.z, b.z) < -1.47):  # cowl, A-pillar
    e[bw] = PB / NOSE_R
for e in side_edges(lambda a, b: min(a.z, b.z) >= 3.09 and min(a.y, b.y) > 2.45):          # roof into the tail
    e[bw] = k * (0.8 if min(T(v.co).z for v in e.verts) < 3.12 else 0.55)
for e in side_edges(lambda a, b: min(a.z, b.z) > 3.17 and abs(a.y - b.y) > 0.5):           # rear corners
    e[bw] = k * 0.4
body = new_obj('van-body', bm)
mod = body.modifiers.new('bevel', 'BEVEL')
mod.limit_method = 'WEIGHT'; mod.width = NOSE_R; mod.segments = 7; mod.profile = 0.5
mod.affect = 'EDGES'; mod.use_clamp_overlap = True
apply_modifiers(body)
# split the side faces at the nose zone and at the fascia line, so UVs can be chosen per region
bm = bmesh.new(); bm.from_mesh(body.data)
# the front fenders narrow toward the headlamps (their outer ends sit at x 0.96-0.97, triangulated): ahead of the cowl
# and above the black fascia the body pulls in by up to 7%
def taper(x, y, z):
    t = min(1.0, max(0.0, (-2.45 - z) / 0.45)); g = min(1.0, max(0.0, (y - 0.95) / 0.12))
    return x * (1 - 0.07 * t * g)
for v in bm.verts:
    p = T(v.co); v.co = B(taper(p.x, p.y, p.z), p.y, p.z)
for co, no in [((0, 0, -2.72), (0, 0, 1)), ((0, 0.98, 0), (0, 1, 0))]:
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=B(*co), plane_no=B(*no) - B(0, 0, 0))
bm.to_mesh(body.data); bm.free()

# ---------------------------------------------------------------- cabin, wheel wells, openings
inner = [(-2.39, FLOOR), (3.12, FLOOR), (3.12, 2.52), (-1.05, 2.52), (-1.33, 2.47), (-1.44, 2.336),
         (-2.39, 1.441)]
ic = cutter(prism(inner, -HW + 0.05, HW - 0.05), 'inner')
for zc in (WFZ, WRZ):
    for s in (-1, 1):
        h = cutter(box(*sorted((s * 0.70, s * 1.2)), 0.0, 0.98, zc - 0.58, zc + 0.58), 'housing')
        boolean(ic, h); remove(h)
boolean(body, ic); remove(ic)
for zc in (WFZ, WRZ):
    for s in (-1, 1):
        w = cutter(cylinder_x(0, WR, zc, AR, *sorted((s * 0.74, s * 1.3)), seg=32), 'well')
        boolean(body, w); remove(w)
for s in (-1, 1):
    c = cutter(prism(CAB_WIN, *sorted((s * (HW - 0.12), s * (HW + 0.2)))), 'win')
    boolean(body, c); remove(c)

def rr_loop(xw, s0, s1, rb, rt, n=4):
    """Rounded rectangle on the windshield frame as (x, s), corners sampled every 90/n degrees."""
    pts = []
    def arc(cx, cs, r, a0, a1):
        pts.extend((cx + r * math.cos(a0 + (a1 - a0) * i / n), cs + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1))
    arc(xw - rb, s0 + rb, rb, -math.pi / 2, 0)
    arc(xw - rt, s1 - rt, rt, 0, math.pi / 2)
    arc(-xw + rt, s1 - rt, rt, math.pi / 2, math.pi)
    arc(-xw + rb, s0 + rb, rb, math.pi, 1.5 * math.pi)
    return pts
WS_OUT = rr_loop(**WG)
c = cutter(solid(bmesh.new(), [ws(x, s, -0.15) for x, s in WS_OUT], [ws(x, s, 0.25) for x, s in WS_OUT]), 'windshield')
boolean(body, c); remove(c)
z0d, z1d, y0d, y1d = SIDE_DOOR
c = cutter(box(HW - 0.15, HW + 0.2, y0d, y1d, z0d, z1d), 'sidedoor'); boolean(body, c); remove(c)

# the finished skin, for laying gaskets and lamps onto it
skin_bm = bmesh.new(); skin_bm.from_mesh(body.data)
SKIN = BVHTree.FromBMesh(skin_bm)
def on_skin(p, d, lift):
    """Point p (three) projected along direction d onto the skin, lifted off it along the surface normal."""
    o, dv = B(*p) - B(*d) * 1.5, B(*d).normalized()
    hit, n, _, _ = SKIN.ray_cast(o, dv, 4.0)
    if hit is None:
        return B(*p)
    if n.dot(dv) > 0: n = -n
    return hit + n * lift

# driver's door: the body piece inside the door outline becomes its own leaf, hinged at its front edge
hinge = Vector((-HW, 0, CAB_DOOR[0][0]))
dc = cutter(prism(CAB_DOOR, -HW - 0.3, -HW + 0.08), 'cabdoor')
door_mesh = body.copy(); door_mesh.data = body.data.copy(); scene.collection.objects.link(door_mesh)
boolean(door_mesh, dc, 'INTERSECT'); boolean(body, dc); remove(dc)
door_mesh.name = 'driver-door-panel'

# ---------------------------------------------------------------- trim, lamps, wheels, interior
trim = bmesh.new()      # black parts (swatch)
chrome = bmesh.new()    # silver parts: grille surround, hinges
markers = bmesh.new()   # roof clearance lamps, mirror repeaters
side = {s: {k: bmesh.new() for k in ('black', 'head', 'chrome', 'marker')} for s in (-1, 1)}  # per cab door
for s in (-1, 1):
    xs = lambda a, b: sorted((s * a, s * b))
    # wheel-arch flares: a moulding swept round each arch, its outer edge rolled in
    for zc in (WFZ, WRZ):
        prof = [(AR, HW - 0.01), (AR, HW + 0.045), (AR + 0.065, HW + 0.052), (AR + 0.10, HW + 0.024), (AR + 0.10, HW - 0.01)]
        n = 20; rings = []
        for i in range(n + 1):
            a = math.pi * i / n
            rings.append([trim.verts.new(B(s * x, WR + r * math.sin(a), zc - r * math.cos(a))) for r, x in prof])
        fs = [trim.faces.new(rings[0]), trim.faces.new(list(reversed(rings[-1])))]
        for i in range(n):
            for j in range(len(prof)):
                k = (j + 1) % len(prof)
                fs.append(trim.faces.new([rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]]))
        bmesh.ops.recalc_face_normals(trim, faces=fs)
    # body-side rubbing strips along the black cladding band (not across the door openings)
    spans = [(-1.66, z0d - 0.06), (z1d + 0.06, WRZ - AR - 0.1), (WRZ + AR + 0.1, 3.12)] if s > 0 else \
            [(-1.06, WRZ - AR - 0.1), (WRZ + AR + 0.1, 3.12)]
    for za, zb in spans:
        box(*xs(HW - 0.005, HW + 0.02), 0.50, 0.64, za, zb, trim)

    P = side[s]
    # cab window: black rubber round the opening, laid on the skin; the sail and the vent division bar
    # (rays start just outside the opening, so none slips through it)
    lo = [P['black'].verts.new(on_skin((s * 2, y, z), (-s, 0, 0), 0.002)) for z, y in offset_poly(CAB_WIN, 0.003)]
    hi = [P['black'].verts.new(on_skin((s * 2, y, z), (-s, 0, 0), 0.002)) for z, y in offset_poly(CAB_WIN, 0.022)]
    for i in range(len(lo)):
        j = (i + 1) % len(lo)
        face(P['black'], [lo[i], lo[j], hi[j], hi[i]], (s, 0, 0))
    solid(P['black'], [B(s * (side_x(z, y) - 0.008), y, z) for z, y in SAIL],
          [B(s * (side_x(z, y) - 0.03), y, z) for z, y in SAIL])
    prism(DIVIDER, *xs(HW - 0.035, HW - 0.012), P['black'])
    # mirror: a tall rounded head ahead of the sail, dropping below the belt, on a deep lower arm and a slim upper
    # one; split glass facing back, a repeater lens on the outer face (side photos, undoing their perspective)
    box(*xs(HW + 0.045, HW + 0.265), 1.31, 1.74, -2.31, -2.175, P['head'])
    bmesh.ops.bevel(P['head'], geom=P['head'].edges[:], offset=0.045, segments=3, affect='EDGES', clamp_overlap=True)
    foot = [(HW - 0.03, -2.10), (HW - 0.03, -1.995), (HW + 0.09, -2.19), (HW + 0.09, -2.29)]
    solid(P['black'], [B(s * x, 1.35, z) for x, z in foot], [B(s * x, 1.47, z) for x, z in foot])
    box(*xs(HW - 0.02, HW + 0.08), 1.62, 1.655, -2.22, -2.03, P['black'])
    for y0m, y1m in ((1.345, 1.48), (1.50, 1.71)):
        q = [P['chrome'].verts.new(B(s * x, y, -2.172)) for x, y in
             ((HW + 0.075, y0m), (HW + 0.235, y0m), (HW + 0.235, y1m), (HW + 0.075, y1m))]
        face(P['chrome'], q, (0, 0, 1))
    q = [P['marker'].verts.new(B(s * (HW + 0.267), y, z)) for z, y in ((-2.275, 1.37), (-2.205, 1.37), (-2.205, 1.52), (-2.275, 1.52))]
    face(P['marker'], q, (s, 0, 0))

# twin-door frame posts, header and threshold step (+x)
box(HW - 0.01, HW + 0.04, y0d - 0.04, y1d + 0.06, z0d - 0.05, z0d, trim)
box(HW - 0.01, HW + 0.04, y0d - 0.04, y1d + 0.06, z1d, z1d + 0.05, trim)
box(HW - 0.01, HW + 0.04, y1d, y1d + 0.06, z0d, z1d, trim)
box(HW - 0.12, HW + 0.16, 0.27, 0.34, z0d, z1d, trim)
# driver-side running board
box(-HW - 0.14, -HW + 0.05, 0.28, 0.34, -1.95, -1.15, trim)
# rear: step bumper with a tread lip, corner caps, barn-door seam, hinges, tail-lamp housings, handle
box(-1.0, 1.0, 0.30, 0.50, 3.06, 3.26, trim)
box(-0.95, 0.95, 0.47, 0.50, 3.10, 3.30, trim)
for s in (-1, 1):
    box(*sorted((s * 0.92, s * 1.05)), 0.30, 0.62, 3.0, 3.20, trim)
    box(*sorted((s * 0.895, s * 1.025)), 0.92, 1.61, 3.165, 3.19, trim)        # tail-lamp housing
    for y in (0.80, 1.98):
        box(*sorted((s * 0.94, s * 1.055)), y, y + 0.13, 3.12, 3.195, chrome)  # hinge covers
box(-0.006, 0.006, 0.50, 2.47, 3.17, 3.182, trim)                              # door seam
box(-0.17, 0.17, 2.47, 2.61, 3.10, 3.22, trim)                                 # third brake light / camera
box(-0.012, 0.012, ROOF, ROOF + 0.24, -0.95, -0.93, trim)                      # antenna
box(-0.03, 0.03, ROOF, ROOF + 0.025, -0.97, -0.91, trim)
# windshield: black moulding round the opening, the frit band printed inside the glass, wipers parked on it
# where the photos show them (each rising from the cowl toward the kerb side)
WS_IN = rr_loop(WG['xw'] - 0.04, WG['s0'] + 0.05, WG['s1'] - 0.10, WG['rb'], WG['rt'] - 0.05)
WS_RIM = rr_loop(WG['xw'] + 0.016, WG['s0'] - 0.016, WG['s1'] + 0.016, WG['rb'] + 0.016, WG['rt'] + 0.016)
inward = (0, WNY, WNZ)     # three direction into the cab (x, y, z)
WS_EDGE = rr_loop(WG['xw'] + 0.003, WG['s0'] - 0.003, WG['s1'] + 0.003, WG['rb'] + 0.003, WG['rt'] + 0.003)
lo = [trim.verts.new(on_skin(tuple(T(ws(x, s, 1.0))), inward, 0.002)) for x, s in WS_EDGE]
hi = [trim.verts.new(on_skin(tuple(T(ws(x, s, 1.0))), inward, 0.002)) for x, s in WS_RIM]
out_dir = (0, -WNY, -WNZ)
for i in range(len(lo)):
    j = (i + 1) % len(lo)
    face(trim, [lo[i], lo[j], hi[j], hi[i]], out_dir)
lo = [trim.verts.new(ws(x, s, ws_glass_off(x) - 0.004)) for x, s in WS_OUT]
hi = [trim.verts.new(ws(x, s, ws_glass_off(x) - 0.004)) for x, s in WS_IN]
for i in range(len(lo)):
    j = (i + 1) % len(lo)
    face(trim, [lo[i], lo[j], hi[j], hi[i]], out_dir)
def blade(x0, s0, x1, s1, w=0.022):
    dx, ds = x1 - x0, s1 - s0; l = math.hypot(dx, ds); px, ps = -ds / l * w / 2, dx / l * w / 2
    pts = [(x0 + px, s0 + ps), (x1 + px, s1 + ps), (x1 - px, s1 - ps), (x0 - px, s0 - ps)]
    solid(trim, [ws(x, s, ws_glass_off(x) + 0.004) for x, s in pts], [ws(x, s, ws_glass_off(x) + 0.024) for x, s in pts])
blade(-0.07, 0.13, 0.86, 0.64)
blade(-0.74, 0.12, 0.28, 0.33)
# rain-sensor and mirror housing at the top of the glass, behind it, on the frit
hs = [(-0.18, WG['s1'] - 0.03), (0.18, WG['s1'] - 0.03), (0.15, WG['s1'] - 0.17), (-0.15, WG['s1'] - 0.17)]
solid(trim, [ws(x, s, ws_glass_off(x) - 0.006) for x, s in hs], [ws(x, s, ws_glass_off(x) - 0.06) for x, s in hs])
# front: wrap-around bumper (textured from the front photo, like the grille and its chrome surround)
bumper = bmesh.new()
plan = [(-1.0, -2.95), (-1.04, -3.02), (-1.0, -3.12), (-0.86, -3.19), (-0.55, -3.225), (0.55, -3.225),
        (0.86, -3.19), (1.0, -3.12), (1.04, -3.02), (1.0, -2.95)]
def prism_y(points_xz, y0, y1, bmx):
    solid(bmx, [B(x, y0, z) for x, z in points_xz], [B(x, y1, z) for x, z in points_xz])
prism_y(plan, 0.30, 0.62, bumper)
prism_y([(x * 0.96, z + 0.03) for x, z in plan], 0.62, 0.66, bumper)
# kerb-side cab door handle (the driver's rides on its door)
box(HW - 0.01, HW + 0.03, 1.26, 1.32, -1.32, -1.18, trim)
for x in (-0.65, -0.225, 0.0, 0.225, 0.65):     # where the camera solve puts them, on the roof's front curve
    box(x - 0.05, x + 0.05, 2.53, 2.595, -1.28, -1.18, markers)
bmesh.ops.bevel(markers, geom=markers.edges[:], offset=0.012, segments=1, affect='EDGES', clamp_overlap=True)

lamps = {k: bmesh.new() for k in ('head', 'tail', 'brake', 'reverse')}
def pad(bmx, x0, x1, y0, y1, z, facing):
    zz = z + facing * 0.004
    vs = [bmx.verts.new(B(x, y, zz)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    face(bmx, vs, (0, 0, facing))
# headlamps: the lens outline traced on the driver's front-quarter photo and the front photo, triangulated through
# their solved cameras (the top edge and the outer edge cross the epipolar lines well; the near-level bottom edge is
# the front camera's rays on the lens surface fitted to the rest), then laid on the skin; the kerb lamp is the mirror.
CAMS = A['cams']
def camera_ray(name, u, v):
    c = CAMS['cameras'][name]; R = Matrix(c['R']); t = Vector(c['t']); f = CAMS['focal']; w, h = CAMS['size']
    d = R.transposed() @ Vector(((u - w / 2) / f, (v - h / 2) / f, 1.0))
    return -(R.transposed() @ t), d.normalized()
LAMP_TOP = [(-0.493, 1.096, -3.088), (-0.544, 1.156, -3.034), (-0.599, 1.218, -2.988), (-0.652, 1.247, -2.918),
            (-0.727, 1.269, -2.846), (-0.812, 1.289, -2.783), (-0.886, 1.303, -2.711), (-0.939, 1.312, -2.617),
            (-0.960, 1.307, -2.544)]
LAMP_EDGE = [(-0.971, 1.277, -2.568), (-0.962, 1.223, -2.608), (-0.945, 1.166, -2.668)]
LAMP_BOT_PX = [(1882, 1201), (1981, 1188), (2031, 1168), (2049, 1162)]      # front photo, driver lamp
# lens surface z = a + b x + c y + d x^2, fitted to the triangulated points
pts = LAMP_TOP + LAMP_EDGE
rows = [(1, x, y, x * x) for x, y, _ in pts]
M4 = Matrix([[sum(r[i] * r[j] for r in rows) for j in range(4)] for i in range(4)])
rhs = Vector([sum(r[i] * p[2] for r, p in zip(rows, pts)) for i in range(4)])
cf = M4.inverted() @ rhs
lens_z = lambda x, y: cf[0] + cf[1] * x + cf[2] * y + cf[3] * x * x
def on_lens(u, v):
    o, d = camera_ray('front', u, v); t = 0.0
    for _ in range(30):                       # march along the ray to the fitted surface
        p = o + d * t; g = p.z - lens_z(p.x, p.y)
        dz = d.z - (cf[1] + 2 * cf[3] * p.x) * d.x - cf[2] * d.y
        t -= g / dz
    p = o + d * t; return (p.x, p.y, p.z)
LAMP_BOT = [LAMP_TOP[0]] + [on_lens(*q) for q in LAMP_BOT_PX] + LAMP_EDGE[::-1]
def resample3(line, n):
    seg = [(Vector(b) - Vector(a)).length for a, b in zip(line, line[1:])]; tot = sum(seg); out = []
    for k in range(n):
        t, i = tot * k / (n - 1), 0
        while i < len(seg) - 1 and t > seg[i]: t -= seg[i]; i += 1
        out.append(Vector(line[i]).lerp(Vector(line[i + 1]), min(1.0, t / seg[i])))
    return out
LN = 12
top3 = resample3(LAMP_TOP, LN)
bot3 = resample3(LAMP_BOT + [LAMP_TOP[-1]], LN)
def skin_point(p, lift):
    """The nearest point of the skin to p, lifted off it along its normal (outward: away from the van's middle)."""
    hit, n, _, _ = SKIN.find_nearest(B(*p))
    if (hit - B(0, 0, hit.z)).dot(n) < 0: n = -n
    return hit + n * lift
for sx in (1, -1):
    ends = {i: lamps['head'].verts.new(skin_point((sx * top3[i].x, top3[i].y, top3[i].z), 0.006)) for i in (0, LN - 1)}
    grid = []
    for k in (0.0, 0.5, 1.0):
        row = []
        for i, (a, b) in enumerate(zip(top3, bot3)):
            q = a.lerp(b, k)
            row.append(ends[i] if i in ends else lamps['head'].verts.new(skin_point((sx * q.x, q.y, q.z), 0.006)))
        grid.append(row)
    for r0, r1 in zip(grid, grid[1:]):
        for i in range(LN - 1):
            quad = list(dict.fromkeys([r0[i], r0[i + 1], r1[i + 1], r1[i]]))
            face(lamps['head'], quad, (0, 0.2, -1))
for s in (-1, 1):
    pad(lamps['tail'], *sorted((s * 0.91, s * 1.01)), 1.40, 1.59, 3.19, 1)
    pad(lamps['reverse'], *sorted((s * 0.91, s * 1.01)), 1.15, 1.39, 3.19, 1)
    pad(lamps['brake'], *sorted((s * 0.91, s * 1.01)), 0.94, 1.14, 3.19, 1)
    for x in (0.30, 0.85):
        box(*sorted((s * (x - 0.05), s * (x + 0.05))), 2.49, 2.57, 3.15, 3.19, lamps['tail'])
pad(lamps['brake'], -0.12, 0.12, 2.52, 2.58, 3.22, 1)

# interior: seats with headrests, a dashboard under the glass, the wheel; what the windows look into
seats = bmesh.new()
for x in (-0.55, 0.55):          # cab seats round the facility's driver anchor (FLEET_VAN_SEATS.driver, z -1.95)
    box(x - 0.25, x + 0.25, 0.86, 1.0, -2.18, -1.78, seats)
    box(x - 0.24, x + 0.24, 1.0, 1.62, -1.83, -1.71, seats)
    box(x - 0.12, x + 0.12, 1.65, 1.85, -1.81, -1.73, seats)
for zc in (0.65, 1.55, 2.45):
    box(-0.95, -0.05, 0.86, 1.0, zc - 0.24, zc + 0.24, seats)
    box(-0.95, -0.05, 1.0, 1.55, zc + 0.20, zc + 0.31, seats)
box(0.47, 0.97, 0.86, 1.0, 2.01, 2.49, seats)
box(0.47, 0.97, 1.0, 1.55, 2.45, 2.56, seats)
bmesh.ops.bevel(seats, geom=seats.edges[:], offset=0.03, segments=1, affect='EDGES', clamp_overlap=True)
prism([(-2.39, 0.85), (-2.25, 0.85), (-2.19, 1.05), (-2.13, 1.25), (-2.22, 1.40), (-2.38, 1.43)], -0.98, 0.98, seats)
wheel_ring = bmesh.new()
bmesh.ops.create_cone(wheel_ring, cap_ends=False, segments=16, radius1=0.19, radius2=0.19, depth=0.04,
                      matrix=Matrix.Translation(B(-0.55, 1.28, -2.06)) @ Matrix.Rotation(math.radians(-55), 4, 'X'))
interior_obj = new_obj('van-interior', seats)

# ---------------------------------------------------------------- UVs
SW = A['swatch']
def atlas_uv(px, py):
    return (px / AW, 1 - py / AH)
SIL = [WS0, WS1, (-1.40, 2.47), (-1.26, 2.545), (-1.05, ROOF)]
def behind_silhouette(z, y, margin):
    """A side point moved at least `margin` behind the windshield line and the roof's leading curve: the A-pillar
    and the roof edge sit on the photos' silhouette, so sampling them there picks up the wall or the sky."""
    best = None
    for (za, ya), (zb, yb) in zip(SIL, SIL[1:]):
        dz, dy = zb - za, yb - ya; l = math.hypot(dz, dy)
        t = max(0.0, min(1.0, ((z - za) * dz + (y - ya) * dy) / (l * l)))
        cz, cy = za + t * dz, ya + t * dy
        d = math.hypot(z - cz, y - cy)
        if best is None or d < best[0]:
            best = (d, cz, cy, dy / l, -dz / l)
    d, cz, cy, nz, ny = best
    return (z, y) if d >= margin else (cz + nz * margin, cy + ny * margin)
def side_uv(region, p):
    r = A[region]; x, y, w, h = r['rect']; _, u0, u1 = r['u']; v0, v1 = r['v']
    # stay on the van in the photo: its rear edge (z 3.08) and the top of the side before the roof rounds (2.47)
    z = min(p.z, 3.08); py = min(p.y, 2.47)
    z, py = behind_silhouette(z, py, 0.06 if region == 'left' else 0.10)
    if region == 'right':
        # the kerb photo's cab sits ~9 cm behind the driver photo's (window edge, handle, door shut line), the
        # twin doors line up: ease the shift in ahead of the door opening
        z += 0.09 * max(0.0, min(1.0, (-0.95 - z) / 0.15))
    u = z if r['u'][0] == 'z' else -z
    return atlas_uv(x + (u - u0) / (u1 - u0) * w, y + (v1 - py) / (v1 - v0) * h)
def rear_uv(p):
    r = A['rear']; x, y, w, h = r['rect']; _, u0, u1 = r['u']; v0, v1 = r['v']
    return atlas_uv(x + (p.x - u0) / (u1 - u0) * w, y + (v1 - p.y) / (v1 - v0) * h)
def front_uv(p):
    """Through the front photo's solved camera: the front of the van is textured where the photo shows it."""
    r = A['front']; x, y, w, h = r['rect']; X0, Y0, X1, Y1 = r['crop']
    c = CAMS['cameras']['front']; f = CAMS['focal']; cw, ch = CAMS['size']
    q = Matrix(c['R']) @ Vector((p.x, p.y, p.z)) + Vector(c['t'])
    u, v = cw / 2 + f * q.x / q.z, ch / 2 + f * q.y / q.z
    ox = min(max(2 * u, X0), X1); oy = min(max(2 * v, Y0), Y1)      # the atlas crop is on the 5712 px original
    return atlas_uv(x + (ox - X0) / (X1 - X0) * w, y + (oy - Y0) / (Y1 - Y0) * h)
def swatch(name):
    return atlas_uv(*SW[name])

FRONT_EYE = Vector(CAMS['cameras']['front']['centre'])
def classify(f, verts):
    n = T(f.normal); c = sum(verts, Vector()) / len(verts)
    for zc in (WFZ, WRZ):
        if abs(c.x) > 0.7 and math.hypot(c.y - WR, c.z - zc) < AR + 0.03 and c.y < WR + AR + 0.02:
            return 'black'
    radial = Vector((c.x, c.y - 1.45, 0))
    inside = abs(c.x) < HW - 0.02 and FLOOR - 0.03 < c.y < 2.56 and -2.6 < c.z < 3.14
    if inside and (n.dot(radial) < -0.05 or (c.z > 3.0 and n.z < -0.5)):   # cabin walls, floor, rear doors' inside
        return 'floor' if n.y > 0.7 else 'interior'
    if abs(c.x) > HW - 0.07 and abs(n.x) < 0.3 and abs(c.x) < HW - 0.001:
        return 'black'   # reveal of a cut opening
    if n.y < -0.5:
        return 'black'
    if abs(n.x) > 0.55:
        if c.z < -2.72:
            if n.dot((FRONT_EYE - c).normalized()) > 0.3:
                return 'front'
            return 'black' if c.y < 0.98 else 'teal'
        return 'right' if n.x > 0 else 'left'
    if n.z > 0.55:
        return 'rear'
    if c.z < -2.3 or (c.z < -1.0 and n.z < -0.25):
        return 'front'
    if n.y > 0.5:
        return 'roof'
    return 'teal'

def apply_uvs(o, fixed=None):
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    mw = o.matrix_world
    for f in bm.faces:
        verts = [T(mw @ v.co) for v in f.verts]
        kind = fixed or classify(f, verts)
        for loop, p in zip(f.loops, verts):
            if kind in ('left', 'right'):
                loop[uv].uv = side_uv(kind, p)
            elif kind == 'rear':
                loop[uv].uv = rear_uv(p)
            elif kind == 'front':
                loop[uv].uv = front_uv(p)
            else:
                loop[uv].uv = swatch(kind)
    bm.to_mesh(me); bm.free()

apply_uvs(body); apply_uvs(door_mesh); apply_uvs(interior_obj, 'seat')
trim_obj = new_obj('van-trim', trim); apply_uvs(trim_obj, 'black')
chrome_obj = new_obj('van-chrome', chrome); apply_uvs(chrome_obj, 'chrome')
bumper_obj = new_obj('van-bumper', bumper); apply_uvs(bumper_obj)
mark_obj = new_obj('van-markers', markers); apply_uvs(mark_obj, 'marker')
ring_obj = new_obj('van-steering', wheel_ring); apply_uvs(ring_obj, 'black')
side_objs = {}
for s, P in side.items():
    objs = []
    for kind, bmx in P.items():
        o = new_obj(f'cab-{kind}-{s}', bmx); apply_uvs(o, 'black' if kind == 'head' else kind)
        if kind == 'head': smooth(o, 40)
        objs.append(o)
    side_objs[s] = objs

# ---------------------------------------------------------------- materials
img = bpy.data.images.load(ATLAS_IMG)
def principled(name, color=(1, 1, 1, 1), rough=0.5, metal=0.0, alpha=1.0, image=None, emissive=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if image:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = image
        m.node_tree.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    return m
paint = principled('van-paint', rough=0.42, metal=0.12, image=img)
glass = principled('van-glass', (0.08, 0.13, 0.15, 1), rough=0.06, metal=0.25, alpha=0.4)
door_glass = principled('van-door-glass', (0.06, 0.30, 0.32, 1), rough=0.08, metal=0.2, alpha=0.5)
lamp_mats = {'head': principled('lamp-head', (0.95, 0.94, 0.9, 1), 0.35), 'tail': principled('lamp-tail', (0.55, 0.11, 0.11, 1), 0.35),
             'brake': principled('lamp-brake', (0.55, 0.11, 0.11, 1), 0.35), 'reverse': principled('lamp-reverse', (0.91, 0.9, 0.88, 1), 0.35)}

def join(objs, name):
    """One mesh (one draw call) from parts that share the atlas material."""
    keep = objs[0]
    with bpy.context.temp_override(active_object=keep, object=keep, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    keep.name = name; keep.data.name = name
    return keep

# ---------------------------------------------------------------- glass panes
gl = bmesh.new()
face(gl, [gl.verts.new(B(HW - 0.03, y, z)) for z, y in CAB_WIN], (1, 0, 0))
# windshield: a grid following the wrap; rows trace the corner arcs exactly as the opening does
xw, s0, s1, rb, rt = WG['xw'], WG['s0'], WG['s1'], WG['rb'], WG['rt']
rows = [(s0 + rb - rb * math.sin(math.radians(a)), xw - rb + rb * math.cos(math.radians(a))) for a in (90, 67.5, 45, 22.5, 0)]
rows += [(s0 + rb + (s1 - rt - s0 - rb) * k / 4, xw) for k in (1, 2, 3)]
rows += [(s1 - rt + rt * math.sin(math.radians(a)), xw - rt + rt * math.cos(math.radians(a))) for a in (0, 22.5, 45, 67.5, 90)]
cols = [-1, -0.975, -0.95, -0.9, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 0.9, 0.95, 0.975, 1]
grid = [[gl.verts.new(ws(c * xm, s, ws_glass_off(c * xm))) for c in cols] for s, xm in rows]
for r in range(len(rows) - 1):
    for k in range(len(cols) - 1):
        face(gl, [grid[r][k], grid[r][k + 1], grid[r + 1][k + 1], grid[r + 1][k]], (0, -WNY, -WNZ))
glass_obj = new_obj('van-glass', gl); glass_obj.data.materials.append(glass); smooth(glass_obj, 30)

# ---------------------------------------------------------------- hierarchy
root = bpy.data.objects.new('fleet-van', None); scene.collection.objects.link(root)
kerb_parts = side_objs[1]
static = [body, interior_obj, trim_obj, mark_obj, ring_obj, chrome_obj, bumper_obj] + kerb_parts
for o in static:
    o.data.materials.clear(); o.data.materials.append(paint)
body = join(static, 'van-body'); body.parent = root
glass_obj.parent = root
for k, bmx in lamps.items():
    o = new_obj(f'lamp-{k}', bmx, root); o.data.materials.append(lamp_mats[k])

# driver's door: empty at the hinge; panel, window, sail, mirror and handle ride on it
dd = bpy.data.objects.new('driver-door', None); scene.collection.objects.link(dd)
dd.parent = root; dd.location = B(hinge.x, 0, hinge.z)
def reparent(o, parent):
    mw = o.matrix_world.copy(); o.parent = parent; o.matrix_parent_inverse = parent.matrix_world.inverted(); o.matrix_world = mw
bpy.context.view_layer.update()
dh = new_obj('driver-door-handle', box(-HW - 0.03, -HW + 0.01, 1.26, 1.32, -1.32, -1.18)); apply_uvs(dh, 'black')
driver_parts = side_objs[-1]
panel = [door_mesh, dh] + driver_parts
for o in panel:
    o.data.materials.clear(); o.data.materials.append(paint)
door_mesh = join(panel, 'driver-door-panel')
reparent(door_mesh, dd)
# cab window glass fills the whole opening 3 cm in; the division bar and the sail sit over it
dg = bmesh.new()
face(dg, [dg.verts.new(B(-(HW - 0.03), y, z)) for z, y in CAB_WIN], (-1, 0, 0))
dglass = new_obj('driver-door-glass', dg); dglass.data.materials.append(glass); reparent(dglass, dd)

# twin passenger leaves on +x: a black frame round full-height tinted glass (no mid rail, per the photos) and a
# slot handle by the meeting stiles; door-0 is the front leaf
for i, (za, zb) in enumerate(((z0d + 0.015, -0.155), (-0.145, z1d - 0.015))):
    leaf = bpy.data.objects.new(f'passenger-door-{i}', None); scene.collection.objects.link(leaf); leaf.parent = root
    fr = bmesh.new(); x0, x1 = HW + 0.045, HW + 0.075
    outer, meet = 0.09, 0.06
    gz0 = za + (outer if i == 0 else meet); gz1 = zb - (meet if i == 0 else outer)
    gy0, gy1 = y0d + 0.06, y1d - 0.045
    box(x0, x1, y0d, y1d, za, gz0, fr); box(x0, x1, y0d, y1d, gz1, zb, fr)
    box(x0, x1, y0d, gy0, gz0, gz1, fr); box(x0, x1, gy1, y1d, gz0, gz1, fr)
    hz = zb - 0.12 if i == 0 else za + 0.12
    box(x1, x1 + 0.022, 0.98, 1.12, hz - 0.018, hz + 0.018, fr)
    fo = new_obj(f'passenger-door-{i}-frame', fr, leaf); fo.data.materials.append(paint); apply_uvs(fo, 'black')
    gb = bmesh.new()
    face(gb, [gb.verts.new(B(x0 + 0.015, y, z)) for z, y in ((gz0, gy0), (gz1, gy0), (gz1, gy1), (gz0, gy1))], (1, 0, 0))
    go = new_obj(f'passenger-door-{i}-glass', gb, leaf); go.data.materials.append(door_glass)

# wheels: mesh axle along the node's local +Y (three), node turned so local Y lies along x.
rim = A['rim']
def wheel(name, x, z, outer_sign):
    """Lathed tyre and alloy: tread, rounded shoulders, sidewall, a recessed rim face textured from the photo, hub."""
    bmw = bmesh.new(); seg = 36; sd = outer_sign
    prof = [(0.0, 0.085), (0.07, 0.095), (0.235, 0.075), (0.25, 0.112), (0.355, 0.115), (0.372, 0.09),
            (WR, 0.03), (WR, -0.03), (0.372, -0.09), (0.355, -0.115), (0.25, -0.112), (0.0, -0.10)]
    prof = [(r, h * sd) for r, h in prof]
    rings = []
    for r, h in prof:
        if r == 0:
            rings.append([bmw.verts.new(Vector((0, 0, h)))])
        else:
            rings.append([bmw.verts.new(Vector((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), h)))
                          for i in range(seg)])
    for ra, rb in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(ra) == 1:
                bmw.faces.new([ra[0], rb[i], rb[j]])
            elif len(rb) == 1:
                bmw.faces.new([ra[i], rb[0], ra[j]])
            else:
                bmw.faces.new([ra[i], rb[i], rb[j], ra[j]])
    bmesh.ops.recalc_face_normals(bmw, faces=bmw.faces)
    uv = bmw.loops.layers.uv.verify()
    rx, ry, rw, rh = rim['rect']; rad = rim['radius_px'] * 0.98
    for f in bmw.faces:
        face_rim = all(v.co.z * sd > 0.06 and math.hypot(v.co.x, v.co.y) <= 0.36 for v in f.verts)
        for loop in f.loops:
            if face_rim:
                q = loop.vert.co
                loop[uv].uv = atlas_uv(rx + rw / 2 + sd * q.x / WR * rad, ry + rh / 2 - q.y / WR * rad)
            else:
                loop[uv].uv = swatch('tyre')
    o = new_obj(name, bmw, root); o.data.materials.append(paint); smooth(o, 40)
    o.location = B(x, WR, z)
    # three: rotation.z = +pi/2 puts local Y along -x, i.e. Blender rotation about -Y... = about +Y by -pi/2
    o.rotation_euler = (0, -math.pi / 2, 0)
    return o
wx = HW - 0.135
# local +Y maps to world -x, so the outer (rim) face is local +Y on the driver side, -Y on the kerb side
wheel('wheel-fl', -wx, WFZ, +1); wheel('wheel-rl', -wx, WRZ, +1)
wheel('wheel-fr', wx, WFZ, -1); wheel('wheel-rr', wx, WRZ, -1)

bpy.context.view_layer.update()
tris = sum(len(p.vertices) - 2 for o in scene.objects if o.type == 'MESH' for p in o.data.polygons)
for o in scene.objects:
    if o.type == 'MESH':
        print('PART', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons))
print('TRIS', tris)
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=88, export_materials='EXPORT')
print('WROTE', OUT)
