"""User-directed September 21 orientation and room corrections.
Run after apply-interior-photos.py. The saved pre-correction layer makes reruns
idempotent; the rebuild pipeline starts from fresh photo and upstairs layers.
"""
import json, math
from copy import deepcopy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/'public/models/seen-alhambra-planning.json'
PI=math.pi

def apply_update(m, fresh=False):
 previous=m.get('layoutCorrections',{})
 if previous and not fresh:
  for key in ['objects','rooms','walls']:
   saved={o['id']:o for o in previous['before'][key]}
   m[key]=[deepcopy(saved.get(o['id'],o)) for o in m[key] if not o['id'].startswith('access-')]
   ids={o['id'] for o in m[key]}
   m[key]+=[deepcopy(o) for k,o in saved.items() if k not in ids]
 before={k:deepcopy(m[k]) for k in ['objects','rooms','walls']}
 objects={o['id']:o for o in m['objects']};rooms={r['id']:r for r in m['rooms']}
 def edit(id,pos=None,rot=None,aid=None):
  o=objects[id]
  if pos is not None:o['position']=pos
  if rot is not None:o['rotation']=rot
  if aid is not None:o['assetId']=aid
  for k in ['sourcePixelPosition','sourcePixelFootprint']:o.pop(k,None)
  o.update(status='user-directed arrangement / dimensions estimated',notes='September 21 user correction; registered to existing plan and level elevations. Dimensions remain estimated.')
  return o
 def asset(id,kind,dim,mat='photo-white',**p):
  m['assets'][id]=dict(kind=kind,dimensions=dim,material=mat,parameters=p)
 def add(id,aid,pos,zone,level='ground',room=None,rot=0,layer='furniture',nav=None):
  o=dict(id=id,assetId=aid,position=pos,rotation=rot,scale=[1,1,1],zoneId=zone,levelId=level,roomId=room,layer=layer,referencePages=[15,112] if level=='upper' else [114,115,116],status='user-directed arrangement / dimensions estimated',notes='September 21 user-directed layout correction. Component dimensions estimated.')
  if nav is not None:o['navigationFootprints']=nav
  objects[id]=o;return o
 def remove(*ids):
  for id in ids:objects.pop(id,None)
 def rect(x,z,w,d):return [[x,z],[x+w,z],[x+w,z+d],[x,z+d]]
 def room(id,name,poly):rooms[id].update(name=name,polygon=poly,status='user-directed orientation / dimensions estimated')
 # Rotate the upstairs fit-out 90 degrees counterclockwise in plan. The building
 # perimeter stays registered with the ground floor. Refit edge partitions and
 # circulation clearances rather than rotating the entire building footprint.
 def turn(x,z):return [z-10,25-x]
 for o in objects.values():
  if o['id'].startswith('upperfit-'):
   x,y,z=o['position'];nx,nz=turn(x,z);edit(o['id'],[nx,y,nz],o['rotation']+PI/2)
 # Conference north edge: its south entry now opens beside the middle stair.
 for o in objects.values():
  if o.get('roomId')=='upperfit-conference':o['position'][2]-=1
 room('upperfit-conference','Upstairs conference room',rect(2.9,9.25,11.9,3.95))
 # Slide the display clear of the western partition and shorten only the ceiling
 # and slat panel to the registered room, leaving furniture at its real scale.
 for id in ['upperfit-display','upperfit-display-post','upperfit-display-base','upperfit-video-bar']:objects[id]['position'][0]=3.3
 objects['upperfit-conference-ceiling']['position']=[8.85,2.68,11.225]
 m['assets']['upperfit-conference-ceiling']['dimensions']=[3.85,.045,11.75]
 objects['upperfit-conference-slat']['position']=[14.69,0,11.225]
 m['assets']['upperfit-conference-slat']['dimensions']=[3.85,2.65,.07]
 # Service rooms remain along the rotated west edge; register them clear of
 # ground-floor stairs and the conference doorway.
 room('upperfit-storage','Upstairs storage',rect(.2,9.25,2.7,3.95))
 for id,pos in [('upperfit-storage-rack-0',[.58,0,10.3]),('upperfit-storage-rack-1',[.58,0,12.15]),('upperfit-file-cabinet',[2.25,0,9.65])]:edit(id,pos,PI/2 if 'rack' in id else 0)
 room('upperfit-restroom','Upstairs restroom',rect(.2,17.6,2.7,3.1))
 edit('upperfit-toilet',[.65,0,18.35],PI/2);edit('upperfit-basin',[2.55,0,18.2],-PI/2)
 edit('upperfit-restroom-band',[.27,1.25,19.1],PI/2)
 room('upperfit-lift','Aligned lift and side-stair landing',rect(.25,22.65,2.4,2.45))
 edit('upperfit-lift-gate',[1.45,0,23.75],PI/2)
 room('upper-office-shell','Upstairs open office',[[.2,13.2],[14.8,13.2],[14.8,26.45],[3.25,26.45],[3.25,25.1],[.2,25.1],[.2,20.7],[2.9,20.7],[2.9,17.6],[.2,17.6]])
 # Rotated rear desks would cross the envelope; place that pair along west
 # circulation between storage and restroom. Preserve all eighteen workstations.
 for i,z in enumerate([14.85,16.35]):
  for prefix,dx in [('desk',0),('monitor',-.19),('chair',.83)]:
   id=f'upperfit-{prefix}-rear-{i}';o=objects[id];edit(id,[.7+dx,o['position'][1],z],-PI/2 if prefix!='chair' else PI/2)
 # Avoid the lift landing with the rotated southern perimeter desks.
 for i in range(4):
  for prefix in ['desk','monitor','chair']:
   o=objects[f'upperfit-{prefix}-perimeter-{i}'];o['position'][2]-=.55
 # One bank faces the stair void after rotation. Shift it south as a unit.
 for o in objects.values():
  if any(o['id'].startswith(f'upperfit-{p}-bank-') for p in ['desk','chair','monitor']):o['position'][2]+=.55
 edit('upperfit-west-slat',[8.5,0,26.35],PI)
 edit('upperfit-front-slat',[14.75,0,20.25],PI/2)
 # New partition openings, including a 1.2 m conference door beside stair head.
 m['walls']=[w for w in m['walls'] if not w['id'].startswith('upperfit-')]
 def wall(id,a,b):m['walls'].append(dict(id='upperfit-'+id,zoneId='upper-office',levelId='upper',a=a,b=b,height=2.7,thickness=.13,material='upperfit-wall',referencePages=[112,15],status='user-directed orientation / estimated partition dimensions'))
 for id,a,b in [('conference-west',[2.9,9.25],[2.9,13.2]),('conference-entry-a',[2.9,13.2],[4.1,13.2]),('conference-entry-b',[5.3,13.2],[14.8,13.2]),('storage-entry-a',[.2,13.2],[1,13.2]),('storage-entry-b',[2.1,13.2],[2.9,13.2]),('wc-north',[.2,17.6],[2.9,17.6]),('wc-south',[.2,20.7],[2.9,20.7]),('wc-east-a',[2.9,17.6],[2.9,18.8]),('wc-east-b',[2.9,19.8],[2.9,20.7])]:wall(id,a,b)
 # Flip every component of the nursing station together, not just its shell.
 for o in list(objects.values()):
  if o.get('roomId')=='clinic-nurse' and (o.get('layer','furniture')=='furniture'):
   x,y,z=o['position'];edit(o['id'],[-14.9-x,y,-22.5-z],o['rotation']+PI)
 # The second room counted from the south clinic entrance is trace 05.
 dental='clinic-exam-05'
 asset('access-dental-chair','dental-chair',[.82,1.36,1.76],'photo-teal',procedure=True)
 asset('access-dental-delivery','dental-delivery',[.61,1.12,.53])
 for i in range(1,7):
  id=f'clinic-exam-{i:02}';r=rooms[id];z0=min(p[1] for p in r['polygon']);z1=max(p[1] for p in r['polygon']);zc=(z0+z1)/2
  edit(id+'-sink',[-.38,0,zc+.15],-PI/2)
  edit(id+'-monitor',[-.86,.72,z0+.27],0)
  edit(id+'-recliner',[-2.05,0,zc+.12],PI,'access-dental-chair' if id==dental else 'interior-exam-chair')
  edit(id+'-diagnostics',[-2.07,.96,z1-.18],PI)
  edit(id+'-visitor',[-3.18,0,z0+.53],-PI/2)
  edit(id+'-stool',[-2.96,0,zc+.6],0)
  edit(id+'-sharps',[-.19,.93,z1-.38],-PI/2)
  r['notes']='User-directed: cabinet/sink and workstation exchange walls; recliner faces north; visitor seating moved to the opposite corner. '+('Dental treatment chair in the second room from the clinic entrance (trace 05). ' if id==dental else '')+'Room dimensions remain plan-calibrated estimates.'
 if dental in rooms:
  zc=sum(p[1] for p in rooms[dental]['polygon'])/4
  add('access-dental-delivery','access-dental-delivery',[-1.15,0,zc-.75],'clinic',room=dental,rot=PI)
  add('access-dental-lamp','interior-exam-lamp',[-2.75,.35,zc-.55],'clinic',room=dental,rot=PI/2,layer='wall-finish') if 'interior-exam-lamp' in m['assets'] else None
 # Two large bathrooms across the corridor from dining become shower suites.
 asset('access-shower','care-shower',[1.5,2.18,1.5],'photo-teal-tile')
 asset('access-barber-chair','barber-chair',[.82,1.2,1.18],'photo-black')
 asset('access-hair-wash','hair-wash-basin',[.68,1.02,.70],'photo-black')
 asset('access-laundry','laundry-machine',[.68,.92,.72])
 asset('access-linen-rack','linen-rack',[1.55,1.9,.48])
 remove('ot-basin-2','ot-basin-3','ot-toilet-1')
 add('access-shower-west','access-shower',[2.65,0,-6.05],'ot',room='rear-wc-west')
 add('access-shower-east','access-shower',[6.55,0,-6.05],'ot',room='rear-wc-east')
 add('access-barber-chair','access-barber-chair',[6.72,0,-3.68],'ot',room='rear-wc-east',rot=0)
 add('access-hair-wash','access-hair-wash',[6.72,0,-4.48],'ot',room='rear-wc-east')
 for id in ['rear-wc-west','rear-wc-east']:
  rooms[id].update(name='Personal care · shower'+(' & hair care' if id.endswith('east') else ''),notes='User-confirmed shower room opposite dining. '+('Right-hand room includes a black barber chair and hair-washing sink.' if id.endswith('east') else 'Roll-in shower, folding seat and grab rails.'))
 # Back support rooms directly behind these suites, not the public corridor.
 for i,x in enumerate([7.05,8.15]):add(f'access-washing-machine-{i+1}','access-laundry',[x,0,-9.08],'ot',room='rear-support-center')
 for i,x in enumerate([.95,2.72,4.38]):add(f'access-linen-rack-{i+1}','access-linen-rack',[x,0,-9.94],'ot',room='rear-support-west')
 add('access-linen-rack-4','access-linen-rack',[2.1,0,-7.29],'ot',room='rear-support-west',rot=PI)
 rooms['rear-support-west'].update(name='Back storage & clean linen',notes='User-directed storage racks behind the personal-care shower rooms.')
 rooms['rear-support-center'].update(name='Back laundry',notes='Two front-loading washing machines directly behind the east shower and hair-care suite; dimensions estimated.')
 # Stairs: real level-height geometry and floor openings. Local ascent is +Z.
 m['floorOpenings']=[];connections=[]
 elevations={l['id']:l['elevation'] for l in m['levels']}
 def stair(id,lower,upper,zone,tozone,rot):
  o=edit(id,rot=rot);o['levelId']=lower;o['zoneId']=zone;o['roomId']=None if lower=='basement' else o.get('roomId');o['layer']='architecture'
  w=1.22109;d=5.59668;rise=elevations[upper]-elevations[lower];aid='access-stair-'+id
  asset(aid,'connected-stair',[w,rise+.95,d],'concrete',rise=rise)
  o['assetId']=aid;x,_,z=o['position'];sx=math.sin(rot);sz=math.cos(rot)
  low=[x-sx*d/2,elevations[lower],z-sz*d/2];high=[x+sx*d/2,elevations[upper],z+sz*d/2]
  hw=(abs(math.cos(rot))*w+abs(sx)*d)/2+.04;hd=(abs(sx)*w+abs(sz)*d)/2+.04
  cid='access-'+id
  m['floorOpenings'].append(dict(id=cid+'-void',connectionId=cid,zoneId=tozone,levelId=upper,bounds=[[x-hw,z-hd],[x+hw,z+hd]]))
  # A slab landing sits at the end, not across the stairwell. Side guardrails
  # surround the floor opening, leaving its high end open onto the landing.
  asset(cid+'-landing','box',[w,.16,1.15],'upperfit-floor' if upper=='upper' else 'concrete')
  add(cid+'-landing',cid+'-landing',[high[0]+sx*.575,-.16,high[2]+sz*.575],tozone,upper,rot=rot,layer='architecture')
  for side in [-1,1]:
   asset(cid+'-guard','landing-guard',[.045,.95,d+.08],'upperfit-metal')
   add(cid+f'-guard-{side}',cid+'-guard',[x+math.cos(rot)*side*(w/2+.06),0,z-math.sin(rot)*side*(w/2+.06)],tozone,upper,rot=rot,layer='architecture')
  connections.append(dict(id=cid,kind='stair',objectId=id,fromLevel=lower,toLevel=upper,bottom=low,top=high,landing=[high[0]+sx*.575,elevations[upper],high[2]+sz*.575]))
 edit('rear-stair-flight',[5.901951,0,-11.25])
 stair('rear-stair-flight','basement','ground','basement','ot',PI)
 stair('rehab-stair','ground','upper','rehab','mezzanine',0)
 stair('admin-stair-east','ground','upper','admin','upper-office',-PI/2)
 stair('admin-stair-south','ground','upper','admin','upper-office',PI/2)
 # Lift landings share one vertical axis and a matching upper slab aperture.
 add('access-lift-ground','upperfit-lift-gate',[1.45,0,23.75],'admin',rot=PI/2,layer='architecture')
 asset('access-lift-guide','box',[.06,3.35,.06],'upperfit-metal')
 for i,z in enumerate([23.1,24.4]):add(f'access-lift-guide-{i}','access-lift-guide',[.78,0,z],'admin',layer='architecture')
 m['floorOpenings'].append(dict(id='access-lift-void',connectionId='access-lift',zoneId='upper-office',levelId='upper',bounds=[[.67,23.01],[2.23,24.49]]))
 connections.append(dict(id='access-lift',kind='lift',objectId='access-lift-ground',fromLevel='ground',toLevel='upper',bottom=[1.45,0,23.75],top=[1.45,3.35,23.75],landing=[2.8,3.35,23.75]))
 m['verticalConnections']=connections
 m['objects']=list(objects.values());m['rooms']=list(rooms.values())
 baseline=json.loads((ROOT/'public/models/seen-alhambra-planning-base.json').read_text())
 changed=[o['id'] for o in baseline['objects'] if objects.get(o['id'])!=o]
 m['interiorReview']['changedPlanObjectIds']=changed
 m['interiorReview']['newObjectIds']=[o['id'] for o in m['objects'] if o['id'] not in {q['id'] for q in baseline['objects']}]
 # Store only touched originals, not another complete copy of the model.
 undo={k:[o for o in before[k] if o!=next((q for q in m[k] if q['id']==o['id']),None)] for k in before}
 m['layoutCorrections']=dict(date='2026-09-21',rotationDegreesCounterclockwise=90,dentalRoomId=dental,dentalRoomCounting='Second from south clinic entrance; trace 06 is nearest. Trace IDs are not verified door numbers.',before=undo,changedPlanObjectIds=[id for id in changed if id not in {q['id'] for q in baseline['objects'] if q['zoneId'] in ['day','clinic','rehab','dining']}],accuracy='User-specified orientation and uses implemented; plan-calibrated dimensions and elevations remain estimates, not a measured survey.')
 m['upstairsSurvey']['placementStatus']='user-directed 90-degree counterclockwise orientation; footprint-registered fit-out'
 m['upstairsSurvey']['unresolved']=['Measured partition lengths and doorway positions','Exact workstation count','Measured floor-to-floor heights and stair rise/run']
 next(l for l in m['levels'] if l['id']=='upper')['notes']='User-directed rotated office fit-out; registered middle/side stair landings and lift. PT stair rises to equipment mezzanine. Floor-to-floor elevation remains estimated.'
 next(z for z in m['zones'] if z['id']=='upper-office')['notes']='User-directed 90-degree counterclockwise fit-out. Conference entrance beside middle stair; side stair and aligned lift landing retained. Dimensions and partition lengths remain estimated.'
 next(z for z in m['zones'] if z['id']=='ot')['notes']='Personal care opposite dining: two shower suites, hair care in the east suite, laundry and linen racks behind. Rear stair connects the basement to this floor.'
 next(l for l in m['levels'] if l['id']=='ground')['notes']='Updated clinic orientations, dental chair in the second exam room from the entrance, personal-care showers and back-room laundry. PT stairs connect to the mezzanine; rear stairs connect down to the basement. Physical dimensions remain unmeasured.'
 m['source']['date']='User-directed layout · September 21, 2026'
 m['interiorReview']['title']='Photo review and user-directed layout corrections'
 for issue in m['accuracyIssues']:
  if issue['id']=='second-floor':issue['detail']='User-specified counterclockwise fit-out orientation, conference adjacency, floor apertures and shared lift axis implemented. Partition lengths, stair rise/run and floor-to-floor height require measured verification.'
  if issue['id']=='furniture-schedule':issue['detail']='User-specified cabinet/workstation swap, reversed exam and nursing seating, second-from-entrance dental chair, shower suites, hair-care station and rear laundry implemented. Manufacturer models and equipment dimensions remain estimated.'
 m['revision']='2026-09-21 / user-directed room orientations, personal care and connected stairs'
 return m
if __name__=='__main__':
 m=apply_update(json.loads(FILE.read_text()));FILE.write_text(json.dumps(m,indent=2)+'\n');print('Applied user layout corrections:',len(m['objects']),'objects;',len(m['verticalConnections']),'vertical connections.')
