"""Generic full-size SUV and large sedan for the live lot, in the fleet van's style and level of detail.

    Blender -b -P build_cars.py -- <out.glb>

No brand: the SUV has the proportions of a Suburban / Yukon XL / Expedition MAX class body (5.7 m, boxy upright
greenhouse, big chrome grille, roof rails, running boards), the sedan those of a 7 Series / S-Class class body
(5.25 m, long hood, fastback C-pillar, slim lamps, a light bar across the tail). One GLB, two roots: `car-suv`,
`car-sedan`. Frame as the van's (three.js): nose at -z, kerb side +x, y up, tyre soles at y 0. Nodes the scene
drives, prefixed with the kind so names stay unique in the file (`suv-…`, `sedan-…`): `<kind>-passenger-door`
(rear kerb-side door, pivot on its front edge), `<kind>-wheel-fl/fr/rl/rr` (local y is the axle),
`<kind>-lamp-head/tail/brake/reverse`. The paint material `car-paint` is white and tinted per car by the scene.

About 10-20k triangles a car: a smoothed side profile with wide rounded edges, shaded smooth below 35 degrees;
see-through glass over a lined cabin with seats, dashboard, steering wheel and console; projector headlamps and
LED strips; grille mesh, fog lamps, badges; chrome window trim; lathed wheels with a grooved tread, twin-spoke
alloys over brake discs and calipers, lug nuts.
"""
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index('--') + 1]

def B(x, y, z):
    return Vector((x, -z, y))
def T(v):
    return Vector((v.x, v.z, -v.y))

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- materials (slot order matters: 0 is "interior")
def principled(name, color, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m
def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)
MAT = {
    'interior': principled('car-interior', srgb('#2a2d30'), 0.8),
    'paint': principled('car-paint', (1, 1, 1), 0.28, 0.45),
    'glass': principled('car-glass', srgb('#121a20'), 0.05, 0.4),
    'trim': principled('car-trim', srgb('#141618'), 0.45, 0.1),
    'chrome': principled('car-chrome', srgb('#d9dde0'), 0.14, 1.0),
    'tyre': principled('car-tyre', srgb('#1d1f21'), 0.9),
    'rim': principled('car-rim', srgb('#b8bdc1'), 0.28, 0.85),
    'plate': principled('car-plate', srgb('#efefe9'), 0.6),
    'lamp-head': principled('lamp-head', srgb('#f4f1e6'), 0.3),
    'lamp-tail': principled('lamp-tail', srgb('#7e1a1a'), 0.3),
    'lamp-brake': principled('lamp-brake', srgb('#7e1a1a'), 0.3),
    'lamp-reverse': principled('lamp-reverse', srgb('#e9e7e0'), 0.3),
}
MAT['glass'].node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.5
try:
    MAT['glass'].surface_render_method = 'BLENDED'
except Exception:
    MAT['glass'].blend_method = 'BLEND'
MAT['seat'] = principled('car-seat', srgb('#3a3632'), 0.7)
MAT['caliper'] = principled('car-caliper', srgb('#9b2b22'), 0.4, 0.2)
MAT['disc'] = principled('car-disc', srgb('#6e7174'), 0.45, 0.7)
MAT['amber'] = principled('car-amber', srgb('#d4892a'), 0.3)
SLOTS = ['interior', 'paint', 'glass', 'trim', 'chrome', 'tyre', 'rim', 'plate', 'seat', 'caliper', 'disc', 'amber']
SI = {k: i for i, k in enumerate(SLOTS)}

def new_obj(name, bm, parent=None, slots=SLOTS):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for k in slots:
        me.materials.append(MAT[k])
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    if parent: o.parent = parent
    return o

def prism(points_zy, x0, x1, bm=None, mat='trim'):
    bm = bm or bmesh.new()
    a = [bm.verts.new(B(x0, y, z)) for z, y in points_zy]
    b = [bm.verts.new(B(x1, y, z)) for z, y in points_zy]
    fs = [bm.faces.new(a), bm.faces.new(list(reversed(b)))]
    for i in range(len(points_zy)):
        j = (i + 1) % len(points_zy); fs.append(bm.faces.new([a[i], a[j], b[j], b[i]]))
    for f in fs: f.material_index = SI.get(mat, 0)
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    return bm
def box(x0, x1, y0, y1, z0, z1, bm=None, mat='trim'):
    return prism([(z0, y0), (z1, y0), (z1, y1), (z0, y1)], x0, x1, bm, mat)
def cylinder_x(cy, cz, r, x0, x1, seg=24, bm=None, mat='trim'):
    pts = [(cz + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return prism(pts, x0, x1, bm, mat)

def cylinder_z(cx, cy, r, z0, z1, seg=20, bm=None, mat='trim'):
    """Cylinder along z (a lamp lens, a fog lamp, an exhaust tip)."""
    bm = bm or bmesh.new()
    a = [bm.verts.new(B(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z0)) for i in range(seg)]
    b = [bm.verts.new(B(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z1)) for i in range(seg)]
    fs = [bm.faces.new(a), bm.faces.new(list(reversed(b)))]
    for i in range(seg):
        j = (i + 1) % seg; fs.append(bm.faces.new([a[i], a[j], b[j], b[i]]))
    for f in fs: f.material_index = SI.get(mat, 0)
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    return bm
def rounded(x0, x1, y0, y1, z0, z1, bm, mat, r=0.03, seg=2):
    """A box with its edges rounded (seats, mirrors, consoles), merged into `bm`."""
    tmp = box(x0, x1, y0, y1, z0, z1, None, mat)
    bmesh.ops.bevel(tmp, geom=tmp.edges[:], offset=r, segments=seg, affect='EDGES', clamp_overlap=True)
    me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    return bm
def chaikin(points, iters=2):
    """Corner-cut an open chain (endpoints kept): the profile's bumpers, hood, screen and roof round off."""
    for _ in range(iters):
        out = [points[0]]
        for (za, ya), (zb, yb) in zip(points, points[1:]):
            out += [(0.75 * za + 0.25 * zb, 0.75 * ya + 0.25 * yb), (0.25 * za + 0.75 * zb, 0.25 * ya + 0.75 * yb)]
        out.append(points[-1]); points = out
    return points
def smooth(o, angle=35):
    me = o.data
    if hasattr(me, 'set_sharp_from_angle'):
        me.set_sharp_from_angle(angle=math.radians(angle))
    me.shade_smooth() if hasattr(me, 'shade_smooth') else None

def boolean(target, cutter, op='DIFFERENCE'):
    m = target.modifiers.new('b', 'BOOLEAN'); m.object = cutter; m.operation = op; m.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
    target.modifiers.clear(); old = target.data; target.data = me; bpy.data.meshes.remove(old)
def remove(o):
    me = o.data; bpy.data.objects.remove(o, do_unlink=True)
    if me and me.users == 0: bpy.data.meshes.remove(me)
def reparent(o, parent):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy(); o.parent = parent; o.matrix_parent_inverse = parent.matrix_world.inverted(); o.matrix_world = mw

# ---------------------------------------------------------------- car specs
SPECS = {
    'suv': dict(
        HW=1.02, WR=0.41, tyreW=0.27, axles=(-1.80, 1.60), belt=1.20, winTop=1.80, roof=1.92, taper=0.11,
        profile=[(-2.80, 0.34), (-2.86, 0.52), (-2.875, 0.80), (-2.86, 1.04), (-2.77, 1.14), (-1.95, 1.21),
                 (-1.30, 1.25), (-0.55, 1.84), (-0.40, 1.91), (2.45, 1.92), (2.70, 1.885), (2.84, 1.70),
                 (2.86, 1.10), (2.875, 0.60), (2.80, 0.34)],
        windshield=(-1.30, -0.45), rearGlass=('z', 2.6, 9),
        windows=[(-1.18, -0.10), (0.00, 1.04), (1.16, 2.52)], pillars=[(-0.10, 0.00), (1.04, 1.16)],
        seams=[-1.27, -0.05, 1.10], door=[(0.0, 0.40), (1.10, 0.40), (1.10, 0.86), (1.03, 0.96), (1.10, 1.87), (0.0, 1.87)],
        hinge=0.0, handles=[(-0.42, 1.06), (0.62, 1.06)], mirror=(-1.16, -0.96, 1.22, 1.42),
        bevel=0.14, shieldTop=1.8, floor=0.55, cabin=(-1.25, 2.75), seats=(-0.35, [0.7, 1.8]), seatH=0.74, dash=-1.05),
    'sedan': dict(
        HW=0.97, WR=0.355, tyreW=0.245, axles=(-1.62, 1.53), belt=0.95, winTop=1.38, roof=1.48, taper=0.17,
        profile=[(-2.58, 0.24), (-2.63, 0.36), (-2.645, 0.58), (-2.60, 0.72), (-2.48, 0.80), (-1.30, 0.92),
                 (-0.95, 0.96), (-0.25, 1.42), (0.00, 1.48), (0.75, 1.47), (1.35, 1.30), (1.85, 1.04),
                 (2.45, 1.00), (2.58, 0.92), (2.63, 0.70), (2.62, 0.40), (2.55, 0.24)],
        windshield=(-0.95, -0.20), rearGlass=('band', 0.80, 1.84),
        windows=[(-0.82, 0.05), (0.15, 1.28)], pillars=[(0.05, 0.15)],
        seams=[-0.90, 0.10, 1.20], door=[(0.10, 0.30), (1.20, 0.30), (1.20, 0.80), (1.13, 0.90), (1.20, 1.36), (1.10, 1.40), (0.10, 1.47)],
        hinge=0.10, handles=[(-0.30, 0.86), (0.66, 0.86)], mirror=(-0.82, -0.64, 0.97, 1.11),
        bevel=0.13, shieldTop=1.41, floor=0.36, cabin=(-0.9, 1.4), seats=(-0.1, [0.9]), seatH=0.56, dash=-0.75),
}

def build(kind, S):
    HW, WR, belt, winTop, roof = S['HW'], S['WR'], S['belt'], S['winTop'], S['roof']
    root = bpy.data.objects.new(f'car-{kind}', None); scene.collection.objects.link(root)
    # ---- body: profile extrude, rounded on every edge of the silhouette, split for materials, tumblehome
    prof = S['profile']
    prof = chaikin(prof[:-1], 2) + [prof[-1]]   # the bottom run back to the front stays straight
    bm = prism(prof, -HW, HW, mat='paint')
    edges = []
    for e in bm.edges:
        a, b = (T(v.co) for v in e.verts)
        if abs(abs(a.x) - HW) < 1e-4 and abs(abs(b.x) - HW) < 1e-4 and a.x * b.x > 0 and max(a.y, b.y) > 0.45:
            edges.append(e)
    bmesh.ops.bevel(bm, geom=edges, offset=S['bevel'], segments=5, affect='EDGES', profile=0.5, clamp_overlap=True)
    cuts = [('y', belt), ('y', winTop)] + [('z', z) for span in S['windows'] + S['pillars'] for z in span] + \
           [('z', z) for z in S['windshield']]
    for axis, v in cuts:
        co = B(0, v, 0) if axis == 'y' else B(0, 0, v)
        no = (B(0, 1, 0) if axis == 'y' else B(0, 0, 1)) - B(0, 0, 0)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    for v in bm.verts:
        p = T(v.co)
        if p.y > belt:
            k = 1 - S['taper'] * min(1, (p.y - belt) / (roof - belt))
            v.co = B(p.x * k, p.y, p.z)
    body = new_obj(f'{kind}-body', bm, root)
    for zc in S['axles']:
        for s in (-1, 1):
            c = new_obj('well', cylinder_x(WR, zc, WR + 0.07, *sorted((s * (HW - 0.32), s * (HW + 0.3))), seg=28), slots=[])
            boolean(body, c); remove(c)
    classify(body, S)
    smooth(body)
    # ---- cabin: an inward-facing lining so the glass shows a dark interior, then the furniture
    # the lining follows the roofline 8 cm inside it, so it never shows through the screens or a sloping roof
    def top(z):
        ys = []
        for (za, ya), (zb, yb) in zip(prof, prof[1:] + prof[:1]):
            if min(za, zb) <= z <= max(za, zb) and za != zb:
                ys.append(ya + (yb - ya) * (z - za) / (zb - za))
        return max(ys) - 0.08
    c0, c1 = S['cabin']
    zs = [c0 + (c1 - c0) * i / 24 for i in range(25)]
    outline = [(c0, S['floor']), (c1, S['floor'])] + [(z, max(S['floor'] + 0.2, top(z))) for z in reversed(zs)]
    cab = prism(outline, -(HW - 0.14), HW - 0.14, None, 'interior')
    bmesh.ops.reverse_faces(cab, faces=cab.faces[:])
    for v in cab.verts:
        p = T(v.co)
        if p.y > belt:
            k = 1 - S['taper'] * min(1, (p.y - belt) / (roof - belt))
            v.co = B(p.x * k, p.y, p.z)
    new_obj(f'{kind}-cabin', cab, root)
    furn = bmesh.new()
    fz, rz = S['seats']
    sy = S['floor'] + 0.22
    sh = S['seatH']
    for x in (-0.42, 0.42):
        rounded(x - 0.26, x + 0.26, sy, sy + 0.14, fz - 0.3, fz + 0.22, furn, 'seat', 0.05, 3)            # cushion
        rounded(x - 0.25, x + 0.25, sy + 0.1, sy + sh, fz + 0.18, fz + 0.32, furn, 'seat', 0.05, 3)        # back
        rounded(x - 0.13, x + 0.13, sy + sh + 0.02, sy + sh + 0.18, fz + 0.2, fz + 0.31, furn, 'seat', 0.04, 2)
    for z in rz:
        rounded(-0.75, 0.75, sy, sy + 0.14, z - 0.28, z + 0.22, furn, 'seat', 0.05, 3)
        rounded(-0.74, 0.74, sy + 0.1, sy + sh - 0.04, z + 0.18, z + 0.3, furn, 'seat', 0.05, 3)
        for x in (-0.45, 0.45):
            rounded(x - 0.12, x + 0.12, sy + sh - 0.02, sy + sh + 0.12, z + 0.19, z + 0.29, furn, 'seat', 0.04, 2)
    dz = S['dash']
    rounded(-(HW - 0.16), HW - 0.16, belt - 0.32, belt + 0.02, dz - 0.25, dz + 0.12, furn, 'interior', 0.06, 3)
    rounded(-0.12, 0.12, S['floor'], sy + 0.2, dz + 0.1, fz + 0.1, furn, 'interior', 0.05, 3)                # console
    wheel_bm = bmesh.new()
    bmesh.ops.create_cone(wheel_bm, cap_ends=False, segments=24, radius1=0.19, radius2=0.19, depth=0.035,
                          matrix=Matrix.Translation(B(-0.42, belt + 0.02, dz + 0.32)) @ Matrix.Rotation(math.radians(-62), 4, 'X'))
    for f in wheel_bm.faces: f.material_index = SI['trim']
    me = bpy.data.meshes.new('tmp'); wheel_bm.to_mesh(me); wheel_bm.free(); furn.from_mesh(me); bpy.data.meshes.remove(me)
    fo = new_obj(f'{kind}-interior', furn, root); smooth(fo, 50)
    # ---- rear kerb-side door: the body slab inside its outline, on a pivot at its front edge
    dc = new_obj('doorcut', prism(S['door'], HW - 0.09, HW + 0.4), slots=[])
    door_mesh = body.copy(); door_mesh.data = body.data.copy(); scene.collection.objects.link(door_mesh)
    boolean(door_mesh, dc, 'INTERSECT'); boolean(body, dc); remove(dc)
    door_mesh.name = f'{kind}-door-panel'; smooth(door_mesh)
    pivot = bpy.data.objects.new(f'{kind}-passenger-door', None); scene.collection.objects.link(pivot)
    pivot.parent = root; pivot.location = B(HW, 0, S['hinge'])
    reparent(door_mesh, pivot)

    # ---- trim, chrome, lamps
    trim = bmesh.new(); chrome = bmesh.new(); plate = bmesh.new()
    lamps = {k: bmesh.new() for k in ('head', 'tail', 'brake', 'reverse')}
    nose = S['profile'][2][0]; tail = max(z for z, _ in S['profile'])
    for s in (-1, 1):
        xs = lambda a, b: sorted((s * a, s * b))
        for zseam in S['seams']:
            box(*xs(HW - 0.004, HW + 0.004), 0.42 if kind == 'suv' else 0.33, belt - 0.02, zseam - 0.006, zseam + 0.006, trim)
        z0m, z1m, y0m, y1m = S['mirror']
        mb = bmesh.new()
        rounded(*xs(HW + 0.04, HW + 0.24), y0m, y1m, z0m, z1m, mb, 'paint', 0.045, 4)
        rounded(*xs(HW - 0.04, HW + 0.07), y0m + 0.01, y0m + 0.07, z0m + 0.04, z1m - 0.06, mb, 'trim', 0.02, 2)
        box(*xs(HW + 0.06, HW + 0.22), y0m + 0.025, y1m - 0.025, z1m - 0.004, z1m + 0.004, mb, 'chrome')     # glass
        box(*xs(HW + 0.12, HW + 0.235), y0m + 0.01, y0m + 0.035, z0m + 0.02, z0m + 0.08, mb, 'amber')       # repeater
        m_obj = new_obj(f'{kind}-mirror-{"r" if s > 0 else "l"}', mb, root); smooth(m_obj, 40)
        # chrome window trim: the belt line and the top of the side glass, inset by the tumblehome
        kTop = 1 - S['taper'] * min(1, (winTop - belt) / (roof - belt))
        w0, w1 = S['windows'][0][0], S['windows'][-1][1]
        box(*xs(HW - 0.005, HW + 0.012), belt - 0.012, belt + 0.012, w0, w1, chrome)
        box(*xs(HW * kTop - 0.01, HW * kTop + 0.008), winTop - 0.01, winTop + 0.012, w0 + 0.1, w1 - (0.25 if kind == 'sedan' else 0.02), chrome)
        # side marker and fuel door
        box(*xs(HW - 0.003, HW + 0.004), belt - 0.33, belt - 0.29, S['axles'][0] - 0.78, S['axles'][0] - 0.64, chrome)
        for i, (zh, yh) in enumerate(S['handles']):
            if s > 0 and i == 1:
                continue      # the rear kerb-side handle rides on the door
            box(*xs(HW, HW + 0.025), yh - 0.025, yh + 0.025, zh - 0.08, zh + 0.08, chrome)
    if kind == 'suv':
        # big rectangular grille with three chrome bars, slim lamps above it, fog lamps, lower lip
        gz = -2.88
        for x0, x1, y0, y1 in ((-0.66, 0.66, 1.00, 1.05), (-0.66, 0.66, 0.60, 0.65), (-0.66, -0.61, 0.60, 1.05), (0.61, 0.66, 0.60, 1.05)):
            box(x0, x1, y0, y1, gz - 0.03, gz + 0.04, chrome)
        box(-0.61, 0.61, 0.65, 1.00, gz + 0.01, gz + 0.03, trim)
        for y in (0.74, 0.83, 0.92):
            box(-0.61, 0.61, y, y + 0.025, gz - 0.015, gz + 0.02, chrome)
        # grille mesh behind the bars, a badge, projector headlamps with LED strips, round fog lamps
        for gx in range(-11, 12):
            box(gx * 0.05 - 0.006, gx * 0.05 + 0.006, 0.66, 0.99, gz + 0.0, gz + 0.012, trim)
        cylinder_z(0, 0.875, 0.06, gz - 0.035, gz - 0.015, 20, chrome, 'chrome')
        for s2 in (-1, 1):
            for cx in (0.76, 0.88):
                cylinder_z(s2 * cx, 1.015, 0.035, -2.885, -2.86, 16, lamps['head'], 'interior')
            for cx in (0.72, 0.93):
                cylinder_z(s2 * cx, 0.53, 0.04, -2.89, -2.86, 16, chrome, 'chrome')
        box(-0.95, 0.95, 0.34, 0.46, -2.84, -2.60, trim)
        for s in (-1, 1):
            box(*sorted((s * 0.68, s * 0.96)), 0.97, 1.06, -2.875, -2.85, lamps['head'], 'interior')
            box(*sorted((s * 0.70, s * 0.94)), 0.93, 0.955, -2.875, -2.85, lamps['head'], 'interior')
            box(*sorted((s * 0.74, s * 0.86)), 0.50, 0.56, -2.88, -2.85, chrome)
            # vertical tail lamps on the rear corners; chrome strip across the liftgate
            box(*sorted((s * 0.80, s * 0.97)), 1.38, 1.62, 2.85, 2.875, lamps['tail'], 'interior')
            box(*sorted((s * 0.80, s * 0.97)), 1.20, 1.38, 2.85, 2.875, lamps['brake'], 'interior')
            box(*sorted((s * 0.80, s * 0.97)), 1.06, 1.20, 2.85, 2.875, lamps['reverse'], 'interior')
            # running boards, roof rails on posts
            box(*sorted((s * (HW - 0.10), s * (HW + 0.13))), 0.38, 0.43, -1.30, 1.12, trim)
            box(*sorted((s * 0.66, s * 0.72)), roof + 0.05, roof + 0.09, -0.25, 2.40, trim)
            for z in (-0.20, 1.10, 2.35):
                box(*sorted((s * 0.66, s * 0.72)), roof - 0.01, roof + 0.06, z - 0.05, z + 0.05, trim)
        box(-0.55, 0.55, 1.30, 1.34, 2.865, 2.89, chrome)
        box(-0.30, 0.30, 1.86, 1.885, 2.70, 2.85, trim)                     # roof spoiler lip
        box(-0.012, 0.012, 1.45, 1.75, 2.88, 2.9, trim)                     # rear wiper
        cylinder_z(0, 1.18, 0.05, 2.875, 2.89, 20, chrome, 'chrome')        # tailgate badge
        box(-0.98, 0.98, 0.34, 0.52, 2.62, 2.86, trim)
        box(-0.26, 0.26, 0.62, 0.78, 2.875, 2.885, plate); box(-0.26, 0.26, 0.40, 0.56, -2.885, -2.875, plate)
    else:
        # wide grille with vertical slats, slim swept lamps, lower intakes, a light bar across the tail, exhaust tips
        gz = -2.655
        for x0, x1, y0, y1 in ((-0.40, 0.40, 0.70, 0.735), (-0.40, 0.40, 0.48, 0.515), (-0.40, -0.365, 0.48, 0.735), (0.365, 0.40, 0.48, 0.735)):
            box(x0, x1, y0, y1, gz - 0.025, gz + 0.03, chrome)
        box(-0.365, 0.365, 0.515, 0.70, gz + 0.005, gz + 0.02, trim)
        for i in range(-6, 7):
            box(i * 0.052 - 0.008, i * 0.052 + 0.008, 0.515, 0.70, gz - 0.01, gz + 0.02, chrome)
        cylinder_z(0, 0.76, 0.045, -2.60, -2.585, 20, chrome, 'chrome')      # bonnet badge
        cylinder_z(0, 0.97, 0.04, 2.505, 2.52, 20, chrome, 'chrome')         # trunk badge
        box(-0.02, 0.02, 1.48, 1.54, 0.55, 0.75, trim)                       # roof fin
        for s2 in (-1, 1):
            for cx in (0.58, 0.70, 0.82):
                cylinder_z(s2 * cx, 0.755, 0.026, -2.605, -2.585, 14, lamps['head'], 'interior')
            for cx in (0.54, 0.66):
                cylinder_z(s2 * cx, 0.305, 0.035, 2.60, 2.65, 16, chrome, 'chrome')
        for s in (-1, 1):
            box(*sorted((s * 0.46, s * 0.92)), 0.72, 0.79, -2.60, -2.57, lamps['head'], 'interior')
            box(*sorted((s * 0.55, s * 0.85)), 0.33, 0.43, -2.645, -2.62, trim)
            box(*sorted((s * 0.40, s * 0.93)), 0.86, 0.93, 2.58, 2.61, lamps['tail'], 'interior')
            box(*sorted((s * 0.70, s * 0.93)), 0.80, 0.86, 2.585, 2.615, lamps['brake'], 'interior')
            box(*sorted((s * 0.60, s * 0.70)), 0.80, 0.86, 2.585, 2.615, lamps['reverse'], 'interior')
            box(*sorted((s * 0.48, s * 0.72)), 0.27, 0.34, 2.56, 2.63, chrome)
            box(*sorted((s * (HW - 0.06), s * (HW + 0.01))), 0.24, 0.32, -1.20, 1.10, trim)
        box(-0.40, 0.40, 0.875, 0.905, 2.60, 2.625, lamps['tail'], 'interior')
        box(-0.92, 0.92, 0.24, 0.30, 2.40, 2.60, trim)
        box(-0.26, 0.26, 0.58, 0.72, 2.62, 2.635, plate); box(-0.26, 0.26, 0.34, 0.46, -2.64, -2.63, plate)
    new_obj(f'{kind}-trim', trim, root); new_obj(f'{kind}-chrome', chrome, root, slots=['chrome'])
    new_obj(f'{kind}-plates', plate, root, slots=['plate'])
    for k, bmx in lamps.items():
        for f in bmx.faces: f.material_index = 0
        new_obj(f'{kind}-lamp-{k}', bmx, root, slots=[f'lamp-{k}'])
    # handle on the opening door
    hz, hy = S['handles'][1]
    h = new_obj(f'{kind}-door-handle', box(HW, HW + 0.025, hy - 0.025, hy + 0.025, hz - 0.08, hz + 0.08, mat='chrome'), root)
    reparent(h, pivot)
    # ---- wheels
    for name, s, zc in (('wheel-fl', -1, S['axles'][0]), ('wheel-fr', 1, S['axles'][0]), ('wheel-rl', -1, S['axles'][1]), ('wheel-rr', 1, S['axles'][1])):
        wheel(root, f'{kind}-{name}', s * (HW - S['tyreW'] / 2 - 0.035), zc, WR, S['tyreW'], -s, spokes=6 if kind == 'suv' else 10)
    return root

def classify(o, S):
    """Material per face of the body: glass in the window bands and the screens, black pillars and wells, paint."""
    HW, WR, belt, winTop = S['HW'], S['WR'], S['belt'], S['winTop']
    bm = bmesh.new(); bm.from_mesh(o.data)
    for f in bm.faces:
        n = T(f.normal); c = T(f.calc_center_median())
        k = 'paint'
        if abs(n.x) < 0.5 and any(math.hypot(c.y - WR, c.z - zc) < WR + 0.09 for zc in S['axles']) and abs(c.x) > HW - 0.33 and c.y < 2 * WR + 0.1:
            k = 'trim'
        elif n.y < -0.5:
            k = 'trim'
        elif c.y > belt + 0.003 and abs(n.x) > 0.45:
            if c.y < winTop - 0.003:
                if any(a < c.z < b for a, b in S['pillars']):
                    k = 'trim'
                elif any(a < c.z < b for a, b in S['windows']):
                    k = 'glass'
        elif c.y > belt + 0.02 and abs(n.x) <= 0.45:
            w0, w1 = S['windshield']
            mode, r0, r1 = S['rearGlass']
            # the smoothed roof curves into the screens, so each screen stops at its top edge (and the rear glass
            # where the roof starts to fall away), else the roof's leading and trailing curves read as glass
            if w0 < c.z < w1 and n.z < -0.25 and c.y < S['shieldTop']:
                k = 'glass'
            elif mode == 'z' and c.z > r0 and n.z > 0.3 and c.y < winTop + 0.02:
                k = 'glass'
            elif mode == 'band' and r0 < c.z < r1 and n.y < 0.95 and c.y < S['shieldTop']:
                k = 'glass'
        f.material_index = SI[k]
    bm.to_mesh(o.data); bm.free()

def wheel(root, name, x, zc, WR, tw, outer_sign, spokes):
    """Lathed tyre with shoulders and tread grooves; a rim lip, twin spokes over a brake disc and caliper, hub and
    lug nuts. Local +Y is the axle."""
    bmw = bmesh.new(); seg = 36; sd = outer_sign; hw = tw / 2
    rimR = WR * 0.7
    def ring(r, h):
        return [bmw.verts.new(Vector((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), h * sd))) for i in range(seg)]
    def band(ra, rb, mat):
        for i in range(seg):
            j = (i + 1) % seg; f = bmw.faces.new([ra[i], rb[i], rb[j], ra[j]]); f.material_index = SI[mat]
    def cap(rg, h, mat, flip):
        c = bmw.verts.new(Vector((0, 0, h * sd)))
        for i in range(seg):
            j = (i + 1) % seg
            f = bmw.faces.new([rg[i], rg[j], c] if flip else [rg[j], rg[i], c]); f.material_index = SI[mat]
    # tyre: sidewall to shoulder, a tread with three grooves, shoulder, inner sidewall
    g = 0.012
    prof = [(rimR, hw * 0.95), (WR * 0.92, hw), (WR * 0.98, hw * 0.82), (WR, hw * 0.6), (WR - g, hw * 0.52), (WR - g, hw * 0.42),
            (WR, hw * 0.34), (WR, hw * 0.06), (WR - g, -hw * 0.02), (WR - g, -hw * 0.1), (WR, -hw * 0.18), (WR, -hw * 0.6),
            (WR * 0.98, -hw * 0.82), (WR * 0.92, -hw), (rimR, -hw * 0.95)]
    rings = [ring(r, h) for r, h in prof]
    for ra, rb in zip(rings, rings[1:]):
        band(ra, rb, 'tyre')
    # rim: lip from the tyre's bead in to a recessed barrel, the disc behind it
    lip = ring(rimR * 0.94, hw * 0.98); barrel = ring(rimR * 0.9, hw * 0.35)
    band(rings[0], lip, 'rim'); band(lip, barrel, 'rim')
    disc_o = ring(rimR * 0.82, hw * 0.25); cap(disc_o, hw * 0.25, 'disc', sd > 0)
    cap(rings[-1], -hw * 0.9, 'trim', sd < 0)
    # caliper at the trailing top of the disc
    for k in range(4):
        a0, a1 = math.radians(60 + k * 9), math.radians(69 + k * 9)
        r0, r1 = rimR * 0.62, rimR * 0.86
        q = [Vector((r * math.cos(a), r * math.sin(a), h * sd)) for r, a, h in
             ((r0, a0, hw * 0.28), (r1, a0, hw * 0.28), (r1, a1, hw * 0.28), (r0, a1, hw * 0.28),
              (r0, a0, hw * 0.45), (r1, a0, hw * 0.45), (r1, a1, hw * 0.45), (r0, a1, hw * 0.45))]
        v = [bmw.verts.new(c) for c in q]
        for qq in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            f = bmw.faces.new([v[n] for n in qq]); f.material_index = SI['caliper']
    # twin spokes: each a pair of tapered bars from the hub to the lip, bowed outward at mid-span
    for i in range(spokes):
        for off in (-0.045, 0.045):
            a = 2 * math.pi * i / spokes + off * (1.0 if spokes <= 6 else 0.6)
            ca, sa = math.cos(a), math.sin(a)
            def at(r, t, h):
                return bmw.verts.new(Vector((r * ca - t * sa, r * sa + t * ca, h * sd)))
            pts = [(0.07, 0.016, hw * 0.8), (rimR * 0.5, 0.013, hw * 0.92), (rimR * 0.92, 0.01, hw * 0.88)]
            lay = [[at(r, -t, h - 0.02), at(r, t, h - 0.02), at(r, t, h), at(r, -t, h)] for r, t, h in pts]
            for la, lb in zip(lay, lay[1:]):
                for k in range(4):
                    l = (k + 1) % 4
                    f = bmw.faces.new([la[k], la[l], lb[l], lb[k]]); f.material_index = SI['rim']
            for la, flip in ((lay[0], True), (lay[-1], False)):
                f = bmw.faces.new(la if flip else list(reversed(la))); f.material_index = SI['rim']
    # hub cap and five lug nuts
    hub = [bmw.verts.new(Vector((0.075 * math.cos(2 * math.pi * i / 16), 0.075 * math.sin(2 * math.pi * i / 16), hw * 0.84 * sd))) for i in range(16)]
    hf = bmw.faces.new(hub if sd > 0 else list(reversed(hub))); hf.material_index = SI['chrome']
    for k in range(5):
        a = 2 * math.pi * k / 5
        cx, cy = 0.05 * math.cos(a), 0.05 * math.sin(a)
        nut = [bmw.verts.new(Vector((cx + 0.011 * math.cos(2 * math.pi * i / 6), cy + 0.011 * math.sin(2 * math.pi * i / 6), hw * 0.86 * sd))) for i in range(6)]
        f = bmw.faces.new(nut if sd > 0 else list(reversed(nut))); f.material_index = SI['chrome']
    bmesh.ops.recalc_face_normals(bmw, faces=bmw.faces)
    o = new_obj(name, bmw, root); smooth(o, 40)
    o.location = B(x, WR, zc)
    o.rotation_euler = (0, -math.pi / 2, 0)   # local Y (three) along x, as the van's wheels

roots = [build(k, s) for k, s in SPECS.items()]
for o in scene.objects:
    if o.type == 'MESH' and hasattr(o.data, 'shade_flat'):
        o.data.shade_flat()
bpy.context.view_layer.update()
for r in roots:
    tris = sum(len(p.vertices) - 2 for o in r.children_recursive if o.type == 'MESH' for p in o.data.polygons)
    print('TRIS', r.name, tris)
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT')
print('WROTE', OUT)
