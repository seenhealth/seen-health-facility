"""Low-poly RAM ProMaster 3500 159" EXT high-roof van in Seen livery, for the facility's live lot.

Run headless (scripts/fleet-van/build.sh does atlas -> model -> preview renders):
    Blender -b -P build_van.py -- <atlas.jpg> <atlas.json> <out.glb>
Frame is three.js's (the facility's fleet-van convention): nose at -z, kerb (sliding-door) side +x, y up,
tyre soles at y 0. Blender is z-up, so every point goes through B(); the glTF exporter's +Y-up turns it back.
"""
import bpy, bmesh, json, math, sys
from mathutils import Vector, Matrix

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
# Side profile (z, y), nose first; windshield runs (-2.50, 1.26) -> (-1.48, 2.38)
PROFILE = [(-3.175, 0.34), (-3.19, 0.70), (-3.15, 0.98), (-3.06, 1.08), (-2.50, 1.26), (-1.48, 2.38),
           (-1.30, 2.53), (-1.05, ROOF), (3.10, ROOF), (3.175, 2.50), (3.175, 0.44), (3.10, SILL), (-3.05, SILL)]
CAB_DOOR = [(-2.27, 0.45), (-1.08, 0.45), (-1.08, 2.10), (-1.64, 2.10), (-2.27, 1.40)]
CAB_WINDOW = [(-2.12, 1.47), (-1.72, 2.03), (-1.16, 2.03), (-1.16, 1.47)]
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

def prism(points_zy, x0, x1, bm=None):
    """Closed prism: polygon in (z, y) extruded from x0 to x1 (three frame)."""
    bm = bm or bmesh.new()
    a = [bm.verts.new(B(x0, y, z)) for z, y in points_zy]
    b = [bm.verts.new(B(x1, y, z)) for z, y in points_zy]
    n = len(points_zy)
    bm.faces.new(a); bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([a[i], a[j], b[j], b[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def box(x0, x1, y0, y1, z0, z1, bm=None):
    return prism([(z0, y0), (z1, y0), (z1, y1), (z0, y1)], x0, x1, bm)

def cylinder_x(cx, cy, cz, r, x0, x1, seg=16, bm=None):
    pts = [(cz + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return prism(pts, x0, x1, bm)

def boolean(target, cutter, op='DIFFERENCE'):
    m = target.modifiers.new('b', 'BOOLEAN')
    m.object = cutter; m.operation = op; m.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
    target.modifiers.clear()
    old = target.data; target.data = me; bpy.data.meshes.remove(old)

def remove(o):
    me = o.data; bpy.data.objects.remove(o, do_unlink=True)
    if me and me.users == 0: bpy.data.meshes.remove(me)

def cutter(bm, name='cut'):
    o = new_obj(name, bm); return o

# ---------------------------------------------------------------- body solid with rounded corners
bm = prism(PROFILE, -HW, HW)
def side_edges(pred):
    out = []
    for e in bm.edges:
        a, b = (T(v.co) for v in e.verts)
        if abs(abs(a.x) - HW) < 1e-4 and abs(abs(b.x) - HW) < 1e-4 and a.x * b.x > 0 and pred(a, b):
            out.append(e)
    return out
roof_e = side_edges(lambda a, b: min(a.y, b.y) > 2.37 and max(a.z, b.z) < 3.12)
nose_e = side_edges(lambda a, b: max(a.z, b.z) <= -2.49)
pillar_e = side_edges(lambda a, b: min(a.z, b.z) > -2.51 and max(a.z, b.z) < -1.47)
bmesh.ops.bevel(bm, geom=roof_e + nose_e + pillar_e, offset=0.13, segments=2, affect='EDGES', profile=0.5,
                clamp_overlap=True)
rear_e = side_edges(lambda a, b: min(a.z, b.z) > 3.17 and abs(a.y - b.y) > 0.5)
bmesh.ops.bevel(bm, geom=rear_e, offset=0.05, segments=1, affect='EDGES', clamp_overlap=True)
# split the side faces at the nose zone and at the fascia line, so UVs can be chosen per region
for co, no in [((0, 0, -2.72), (0, 0, 1)), ((0, 0.98, 0), (0, 1, 0))]:
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=B(*co), plane_no=B(*no) - B(0, 0, 0))
body = new_obj('van-body', bm)

# ---------------------------------------------------------------- cabin, wheel wells, openings
inner = [(-2.47, FLOOR), (3.12, FLOOR), (3.12, 2.52), (-1.05, 2.52), (-1.33, 2.47), (-1.46, 2.33),
         (-2.47, 1.22)]
ic = cutter(prism(inner, -HW + 0.05, HW - 0.05), 'inner')
for zc in (WFZ, WRZ):
    for s in (-1, 1):
        h = cutter(box(*sorted((s * 0.70, s * 1.2)), 0.0, 0.98, zc - 0.58, zc + 0.58), 'housing')
        boolean(ic, h); remove(h)
boolean(body, ic); remove(ic)
for zc in (WFZ, WRZ):
    for s in (-1, 1):
        w = cutter(cylinder_x(0, WR, zc, AR, *sorted((s * 0.74, s * 1.3)), seg=14), 'well')
        boolean(body, w); remove(w)
for s in (-1, 1):
    c = cutter(prism(CAB_WINDOW, *sorted((s * (HW - 0.12), s * (HW + 0.2)))), 'win')
    boolean(body, c); remove(c)
# windshield: a slab along its line, inside the A-pillars
(z0, y0), (z1, y1) = (-2.50, 1.26), (-1.48, 2.38)
dz, dy = z1 - z0, y1 - y0; L = math.hypot(dz, dy); nz, ny = dy / L, -dz / L   # outward normal (-z, +y side)
def along(t, off):
    return (z0 + dz * t - nz * off, y0 + dy * t - ny * off)
slab = [along(0.06, -0.2), along(0.94, -0.2), along(0.94, 0.2), along(0.06, 0.2)]
c = cutter(prism(slab, -0.90, 0.90), 'windshield'); boolean(body, c); remove(c)
z0d, z1d, y0d, y1d = SIDE_DOOR
c = cutter(box(HW - 0.15, HW + 0.2, y0d, y1d, z0d, z1d), 'sidedoor'); boolean(body, c); remove(c)

# driver's door: the body piece inside the door outline becomes its own leaf, hinged at its front edge
hinge = Vector((-HW, 0, CAB_DOOR[0][0]))
dc = cutter(prism(CAB_DOOR, -HW - 0.3, -HW + 0.08), 'cabdoor')
door_mesh = body.copy(); door_mesh.data = body.data.copy(); scene.collection.objects.link(door_mesh)
boolean(door_mesh, dc, 'INTERSECT'); boolean(body, dc); remove(dc)
door_mesh.name = 'driver-door-panel'

# ---------------------------------------------------------------- trim, lamps, wheels, interior
trim = bmesh.new()      # black parts (swatch)
for s in (-1, 1):
    # wheel-arch flares
    for zc in (WFZ, WRZ):
        n = 8
        for i in range(n):
            a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
            p = lambda r, a: (zc - r * math.cos(a), WR + r * math.sin(a))
            pts = [p(AR, a0), p(AR + 0.08, a0), p(AR + 0.08, a1), p(AR, a1)]
            prism(pts, *sorted((s * (HW - 0.01), s * (HW + 0.03))), trim)
    # mirrors: arm and head
    box(*sorted((s * (HW - 0.02), s * 1.09)), 1.50, 1.57, -2.29, -2.22, trim)
    box(*sorted((s * 1.07, s * 1.25)), 1.40, 1.86, -2.31, -2.17, trim)
# twin-door frame posts, header and threshold step (+x)
box(HW - 0.01, HW + 0.04, y0d - 0.04, y1d + 0.06, z0d - 0.05, z0d, trim)
box(HW - 0.01, HW + 0.04, y0d - 0.04, y1d + 0.06, z1d, z1d + 0.05, trim)
box(HW - 0.01, HW + 0.04, y1d, y1d + 0.06, z0d, z1d, trim)
box(HW - 0.12, HW + 0.16, 0.27, 0.34, z0d, z1d, trim)
# driver-side running board
box(-HW - 0.14, -HW + 0.05, 0.28, 0.34, -1.95, -1.15, trim)
# rear bumper and step, brake-light / camera housing, antenna
box(-1.0, 1.0, 0.30, 0.50, 3.06, 3.27, trim)
box(-0.17, 0.17, 2.47, 2.61, 3.10, 3.22, trim)
box(-0.012, 0.012, ROOF, ROOF + 0.24, -0.95, -0.93, trim)
markers = bmesh.new()
for x in (-0.6, -0.3, 0.0, 0.3, 0.6):
    box(x - 0.05, x + 0.05, ROOF - 0.01, ROOF + 0.05, -1.16, -1.06, markers)

lamps = {k: bmesh.new() for k in ('head', 'tail', 'brake', 'reverse')}
def pad(bmx, x0, x1, y0, y1, z, facing):
    zz = z + facing * 0.004
    vs = [bmx.verts.new(B(x, y, zz)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    bmx.faces.new(vs if facing > 0 else list(reversed(vs)))   # counter-clockwise seen from the side it faces
for s in (-1, 1):
    # headlamps sit on the sloped strip between the fascia top (y 0.98) and the hood edge (1.08)
    vs = [lamps['head'].verts.new(B(s * x, y, z)) for x, y, z in
          ((0.62, 0.975, -3.162), (0.97, 0.975, -3.10), (0.92, 1.085, -3.03), (0.60, 1.085, -3.07))]
    lamps['head'].faces.new(vs if s < 0 else list(reversed(vs)))   # facing -z on both sides
    pad(lamps['tail'], *sorted((s * 0.905, s * 1.0)), 1.40, 1.58, 3.175, 1)
    pad(lamps['reverse'], *sorted((s * 0.905, s * 1.0)), 1.15, 1.40, 3.175, 1)
    pad(lamps['brake'], *sorted((s * 0.905, s * 1.0)), 0.95, 1.15, 3.175, 1)
    for x in (0.30, 0.85):
        box(*sorted((s * (x - 0.05), s * (x + 0.05))), 2.49, 2.57, 3.15, 3.19, lamps['tail'])
pad(lamps['brake'], -0.12, 0.12, 2.52, 2.58, 3.22, 1)

interior = bmesh.new()
# cab seats and dashboard around the facility's driver anchor (FLEET_VAN_SEATS.driver, z -1.95)
for x in (-0.55, 0.55):
    box(x - 0.25, x + 0.25, 0.88, 1.0, -2.18, -1.78, interior)       # cushion
    box(x - 0.25, x + 0.25, 1.0, 1.72, -1.80, -1.70, interior)       # back
box(-0.98, 0.98, 0.95, 1.22, -2.47, -2.27, interior)                  # dashboard
for zc in (0.65, 1.55, 2.45):
    box(-0.95, -0.05, 0.88, 1.0, zc - 0.24, zc + 0.24, interior)
    box(-0.95, -0.05, 1.0, 1.55, zc + 0.22, zc + 0.31, interior)
box(0.47, 0.97, 0.88, 1.0, 2.01, 2.49, interior)
box(0.47, 0.97, 1.0, 1.55, 2.47, 2.56, interior)
wheel_ring = bmesh.new()
bmesh.ops.create_cone(wheel_ring, cap_ends=False, segments=12, radius1=0.19, radius2=0.19, depth=0.04,
                      matrix=Matrix.Translation(B(-0.55, 1.22, -2.2)) @ Matrix.Rotation(math.radians(-55), 4, 'X'))
interior_obj = new_obj('van-interior', interior)

# ---------------------------------------------------------------- UVs
SW = A['swatch']
def atlas_uv(px, py):
    return (px / AW, 1 - py / AH)
def side_uv(region, p):
    r = A[region]; x, y, w, h = r['rect']; _, u0, u1 = r['u']; v0, v1 = r['v']
    # stay on the van in the photo: its rear edge (z 3.08) and the top of the side before the roof rounds (2.47)
    z = min(p.z, 3.08); py = min(p.y, 2.47)
    u = z if r['u'][0] == 'z' else -z
    return atlas_uv(x + (u - u0) / (u1 - u0) * w, y + (v1 - py) / (v1 - v0) * h)
def rear_uv(p):
    r = A['rear']; x, y, w, h = r['rect']; _, u0, u1 = r['u']; v0, v1 = r['v']
    return atlas_uv(x + (p.x - u0) / (u1 - u0) * w, y + (v1 - p.y) / (v1 - v0) * h)
def front_uv(p):
    r = A['front']; x, y, w, h = r['rect']; X0, Y0, X1, Y1 = r['crop']; bands = r['bands']
    yy = min(max(p.y, bands[0][0]), bands[-1][0])
    for (ya, ra, sa, ca), (yb, rb, sb, cb) in zip(bands, bands[1:]):
        if yy <= yb:
            t = (yy - ya) / (yb - ya); row = ra + (rb - ra) * t; ppm = sa + (sb - sa) * t; cx = ca + (cb - ca) * t
            break
    ox, oy = 4 * (cx - ppm * p.x), 4 * row
    return atlas_uv(x + (ox - X0) / (X1 - X0) * w, y + (oy - Y0) / (Y1 - Y0) * h)
def swatch(name):
    return atlas_uv(*SW[name])

def classify(f, verts):
    n = T(f.normal); c = sum(verts, Vector()) / len(verts)
    for zc in (WFZ, WRZ):
        if abs(c.x) > 0.7 and math.hypot(c.y - WR, c.z - zc) < AR + 0.03 and c.y < WR + AR + 0.02:
            return 'black'
    radial = Vector((c.x, c.y - 1.45, 0))
    if n.dot(radial) < -0.05 and abs(c.x) < HW - 0.02 and FLOOR - 0.03 < c.y < 2.56 and -2.6 < c.z < 3.14:
        return 'floor' if n.y > 0.7 else 'interior'
    if abs(c.x) > HW - 0.07 and abs(n.x) < 0.3 and abs(c.x) < HW - 0.001:
        return 'black'   # reveal of a cut opening
    if n.y < -0.5:
        return 'black'
    if abs(n.x) > 0.55:
        if c.z < -2.72:
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
mark_obj = new_obj('van-markers', markers); apply_uvs(mark_obj, 'marker')
ring_obj = new_obj('van-steering', wheel_ring); apply_uvs(ring_obj, 'black')

# ---------------------------------------------------------------- materials
img = bpy.data.images.load(ATLAS_IMG)
def principled(name, color=(1, 1, 1, 1), rough=0.5, metal=0.0, alpha=1.0, image=None, emissive=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
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
glass = principled('van-glass', (0.10, 0.17, 0.19, 1), rough=0.08, metal=0.2, alpha=0.32)
door_glass = principled('van-door-glass', (0.06, 0.30, 0.32, 1), rough=0.08, metal=0.2, alpha=0.5)
lamp_mats = {'head': principled('lamp-head', (0.95, 0.94, 0.9, 1), 0.35), 'tail': principled('lamp-tail', (0.55, 0.11, 0.11, 1), 0.35),
             'brake': principled('lamp-brake', (0.55, 0.11, 0.11, 1), 0.35), 'reverse': principled('lamp-reverse', (0.91, 0.9, 0.88, 1), 0.35)}
for o in (body, door_mesh, interior_obj, trim_obj, mark_obj, ring_obj):
    o.data.materials.append(paint)

# ---------------------------------------------------------------- glass panes
def quad_x(x, pts_zy, mat, name, parent=None, facing=1):
    bmx = bmesh.new()
    vs = [bmx.verts.new(B(x, y, z)) for z, y in pts_zy]
    bmx.faces.new(vs if facing > 0 else list(reversed(vs)))
    bmesh.ops.recalc_face_normals(bmx, faces=bmx.faces)
    o = new_obj(name, bmx, parent); o.data.materials.append(mat); return o
gl = bmesh.new()
for s in (1,):
    vs = [gl.verts.new(B(s * (HW - 0.03), y, z)) for z, y in CAB_WINDOW]
    gl.faces.new(vs)
ws = [along(0.06, 0.0), along(0.94, 0.0)]
vs = [gl.verts.new(B(x, y + 0.0, z)) for (z, y), x in ((ws[0], -0.9), (ws[0], 0.9), (ws[1], 0.9), (ws[1], -0.9))]
gl.faces.new(vs)
glass_obj = new_obj('van-glass', gl); glass_obj.data.materials.append(glass)

# ---------------------------------------------------------------- hierarchy
root = bpy.data.objects.new('fleet-van', None); scene.collection.objects.link(root)
for o in (body, interior_obj, trim_obj, mark_obj, ring_obj, glass_obj):
    o.parent = root
for k, bmx in lamps.items():
    o = new_obj(f'lamp-{k}', bmx, root); o.data.materials.append(lamp_mats[k])

# driver's door: empty at the hinge; panel, window and mirror ride on it
dd = bpy.data.objects.new('driver-door', None); scene.collection.objects.link(dd)
dd.parent = root; dd.location = B(hinge.x, 0, hinge.z)
def reparent(o, parent):
    mw = o.matrix_world.copy(); o.parent = parent; o.matrix_parent_inverse = parent.matrix_world.inverted(); o.matrix_world = mw
bpy.context.view_layer.update()
reparent(door_mesh, dd)
dglass = quad_x(-(HW - 0.03), list(reversed(CAB_WINDOW)), glass, 'driver-door-glass'); reparent(dglass, dd)

# twin passenger leaves on +x: frame + tall tinted glass + handle; door-0 is the front leaf
for i, (za, zb) in enumerate(((z0d + 0.015, -0.155), (-0.145, z1d - 0.015))):
    leaf = bpy.data.objects.new(f'passenger-door-{i}', None); scene.collection.objects.link(leaf); leaf.parent = root
    fr = bmesh.new(); x0, x1 = HW + 0.045, HW + 0.075
    box(x0, x1, y0d, y0d + 0.08, za, zb, fr); box(x0, x1, y1d - 0.07, y1d, za, zb, fr)
    box(x0, x1, y0d, y1d, za, za + 0.06, fr); box(x0, x1, y0d, y1d, zb - 0.06, zb, fr)
    box(x0, x1, 1.02, 1.08, za, zb, fr)
    hz = zb - 0.12 if i == 0 else za + 0.12
    box(x1, x1 + 0.025, 0.92, 1.12, hz - 0.02, hz + 0.02, fr)
    fo = new_obj(f'passenger-door-{i}-frame', fr, leaf); fo.data.materials.append(paint); apply_uvs(fo, 'black')
    gb = bmesh.new()
    for ya, yb in ((y0d + 0.08, 1.02), (1.08, y1d - 0.07)):
        vs = [gb.verts.new(B(x0 + 0.015, y, z)) for z, y in ((za + 0.06, ya), (zb - 0.06, ya), (zb - 0.06, yb), (za + 0.06, yb))]
        gb.faces.new(list(reversed(vs)))
    go = new_obj(f'passenger-door-{i}-glass', gb, leaf); go.data.materials.append(door_glass)

# wheels: mesh axle along the node's local +Y (three), node turned so local Y lies along x.
rim = A['rim']
def wheel(name, x, z, outer_sign):
    bmw = bmesh.new(); seg = 18; hw = 0.115
    ring = lambda yy: [bmw.verts.new(Vector((WR * math.cos(2 * math.pi * i / seg), WR * math.sin(2 * math.pi * i / seg), yy))) for i in range(seg)]
    a, b = ring(-hw), ring(hw)
    fa = bmw.faces.new(list(reversed(a))); fb = bmw.faces.new(b)
    for i in range(seg):
        j = (i + 1) % seg; bmw.faces.new([a[i], a[j], b[j], b[i]])
    bmesh.ops.recalc_face_normals(bmw, faces=bmw.faces)
    uv = bmw.loops.layers.uv.verify()
    rx, ry, rw, rh = rim['rect']; k = (rw / 2) / rim['radius_px'] * (rim['radius_px'] / (rw / 2))
    for f in bmw.faces:
        outer = (f is fb) if outer_sign > 0 else (f is fa)
        for loop in f.loops:
            if outer:
                p = loop.vert.co; s = 1 if outer_sign > 0 else -1
                loop[uv].uv = atlas_uv(rx + rw / 2 + s * p.x / WR * (rim['radius_px'] * 0.98), ry + rh / 2 - p.y / WR * (rim['radius_px'] * 0.98))
            else:
                loop[uv].uv = swatch('tyre')
    o = new_obj(name, bmw, root); o.data.materials.append(paint)
    o.location = B(x, WR, z)
    # three: rotation.z = +pi/2 puts local Y along -x, i.e. Blender rotation about -Y... = about +Y by -pi/2
    o.rotation_euler = (0, -math.pi / 2, 0)
    return o
wx = HW - 0.135
# local +Y maps to world -x, so the outer (rim) face is local +Y on the driver side, -Y on the kerb side
wheel('wheel-fl', -wx, WFZ, +1); wheel('wheel-rl', -wx, WRZ, +1)
wheel('wheel-fr', wx, WFZ, -1); wheel('wheel-rr', wx, WRZ, -1)

for o in scene.objects:
    if o.type == 'MESH':
        o.data.shade_flat() if hasattr(o.data, 'shade_flat') else None
bpy.context.view_layer.update()
tris = sum(len(p.vertices) - 2 for o in scene.objects if o.type == 'MESH' for p in o.data.polygons)
print('TRIS', tris)
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=88, export_materials='EXPORT')
print('WROTE', OUT)
