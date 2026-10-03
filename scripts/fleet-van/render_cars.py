"""Preview renders of live-cars.blend: each car alone, paint tinted, from the van previews' angles."""
import bpy, sys, math
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 800, 500
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.8, 0.86, 1)
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.ops.mesh.primitive_plane_add(size=30)
cam = bpy.data.cameras.new('c'); cam.lens = 40; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
tint = {'car-suv': (0.06, 0.12, 0.10, 1), 'car-sedan': (0.08, 0.10, 0.25, 1)}
roots = [o for o in sc.objects if o.name.startswith('car-')]
views = {'front34': (4.5, 1.8, -6.0), 'rear34': (-4.5, 2.0, 6.0), 'kerb': (8.5, 1.2, 0.0), 'front': (0, 1.2, -8.5), 'sideclose': (4.2, 1.5, 0.6)}
for r in roots:
    for o in roots:
        for c in [o, *o.children_recursive]:
            c.hide_render = o is not r
    bpy.data.materials['car-paint'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = tint[r.name]
    for name, (x, y, z) in views.items():
        co.location = Vector((x, -z, y))
        co.rotation_euler = (Vector((0, 0, 0.8)) - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{out}_{r.name}_{name}.png'
        bpy.ops.render.render(write_still=True)
