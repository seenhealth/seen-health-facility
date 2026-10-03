import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]; out = argv[0]
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 900, 560
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.8, 0.86, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.ops.mesh.primitive_plane_add(size=30); g = bpy.context.object
gm = bpy.data.materials.new('g'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 0.5, 0.48, 1); g.data.materials.append(gm)
cam = bpy.data.cameras.new('c'); cam.lens = 40; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
# three (x,y,z) -> blender (x,-z,y); views: name, three camera pos
views = {'kerb': (9, 1.4, 0.0), 'driver': (-9, 1.4, 0.0), 'front34': (5.5, 2.2, -6.5), 'rear34': (-5.0, 2.4, 6.5), 'front': (0, 1.4, -9), 'rear': (0, 1.5, 9), 'top': (4, 9, 3)}
for name, (x, y, z) in views.items():
    co.location = Vector((x, -z, y))
    d = Vector((0, 0, 1.25)) - co.location
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)
