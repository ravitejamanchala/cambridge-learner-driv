import bpy
import argparse,sys
parser=argparse.ArgumentParser();parser.add_argument("source");args=parser.parse_args(sys.argv[sys.argv.index("--")+1:])
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=args.source)
# This FBX stores opaque character materials with inverted transparency.
for material in bpy.data.materials:
 material.diffuse_color=(*material.diffuse_color[:3],1.0)
 if material.use_nodes:
  for node in material.node_tree.nodes:
   if node.type=='BSDF_PRINCIPLED':
    for link in list(node.inputs['Alpha'].links):material.node_tree.links.remove(link)
    node.inputs['Alpha'].default_value=1.0
arm=bpy.data.objects['CharacterArmature']
if arm.animation_data:
 for track in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(track)
 arm.animation_data.action=None
for action in list(bpy.data.actions):
 suffix=action.name.split('|')[-1]
 if suffix not in ('Walk','Idle_Neutral'):bpy.data.actions.remove(action)
 else:action.name='Idle' if suffix=='Idle_Neutral' else 'Walk';action.use_fake_user=True
idle=bpy.data.actions['Idle'];arm.animation_data_create();arm.animation_data.action=None
for name in ['Idle','Walk']:
 track=arm.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,bpy.data.actions[name])
bpy.context.scene.frame_set(int(idle.frame_range[0]))
for prefix in ['Casual','Casual2','Suit','Worker']:
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
 for obj in bpy.data.objects:
  if obj.type=='MESH' and obj.name.startswith(prefix+'_'):obj.select_set(True)
 bpy.context.view_layer.objects.active=arm
 out=str(Path(__file__).resolve().parent.parent / 'models' / ('Human'+prefix+'.glb'))
 bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_animation_mode='NLA_TRACKS',export_animations=True,export_morph=False,export_anim_single_armature=True)
 print('EXPORTED',prefix,Path(out).stat().st_size)
