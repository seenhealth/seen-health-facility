"""Apply the seven September 21 photo references after earlier planning layers.

Re-runnable: stable IDs replace earlier equipment, leaving unrelated rooms intact.
Photographs establish visible equipment/finishes, not surveyed coordinates.
"""
import json, math, shutil, hashlib, os
from pathlib import Path
from copy import deepcopy

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'; FILE=OUT/'seen-alhambra-planning.json'
MEDIA=Path(os.environ.get('SEEN_HEALTH_INTERIOR_DIR','/Users/xing/Library/CloudStorage/GoogleDrive-xing@seenhealth.org/Shared drives/Seen Health, Inc/24. SH Media Assets/5. SGV Center/Center interior photos/Edited by Ricky'))

def apply_update(m):
 assets=m['assets']; objects=m['objects']; rooms={r['id']:r for r in m['rooms']}
 baseline=json.loads((OUT/'seen-alhambra-planning-base.json').read_text())
 base={o['id']:o for o in baseline['objects']}
 refs={1:99,2:104,3:102,10:97,23:114,25:115,26:116}
 def asset(id,kind,dim,mat='photo-white',**params):
  assets[id]=dict(kind=kind,dimensions=dim,material=mat)
  if params:assets[id]['parameters']=params
 def remove(ids):objects[:]=[o for o in objects if o['id'] not in ids]
 def add(id,aid,pos,room,rot=0,pages=None,layer='furniture',note='',nav=None):
  remove([id]); r=rooms[room]
  o=dict(id=id,assetId=aid,zoneId=r['zoneId'],levelId=r['levelId'],position=pos,rotation=rot,scale=[1,1,1],roomId=room,referencePages=pages or [114],status='photo appearance / plan registered / dimensions estimated',notes=note or 'Visible component follows the photograph. Dimensions and placement require field verification.',layer=layer)
  if nav is not None:o['navigationFootprints']=nav
  objects.append(o);return o
 def replace(id,aid,room=None,pos=None,rot=None,pages=None,note=''):
  old=next((o for o in objects if o['id']==id),base.get(id)); assert old,id
  return add(id,aid,pos or old['position'],room or old['roomId'],old['rotation'] if rot is None else rot,pages,note=note)
 def component(id,dim,pos,room,mat='photo-white',rot=0,pages=None,layer='furniture'):
  asset('interior-'+id,'box',dim,mat);return add(id,'interior-'+id,pos,room,rot,pages,layer)
 def room_note(id,photos,note):
  r=rooms[id];r['referencePages']=list(dict.fromkeys(photos+r['referencePages']));r['notes']=note;r['status']='plan boundary / photographed equipment family / estimated placement'
 # Preserve original contact sheets unchanged, with separate panel findings below.
 for n in [23,25,26]:
  src=MEDIA/f'Center Photo redited-{n}.jpg';dst=ROOT/f'public/reference/photos/center-{n}.jpg'
  if src.exists():shutil.copyfile(src,dst)
  assert dst.exists(),f'Missing source: {src}'
  page=dict(page=refs[n],title=f'Interior contact sheet {n}',label=f'Photo {n}',group='September 21 interior review',image=f'/reference/photos/center-{n}.jpg',file=f'/reference/photos/center-{n}.jpg',mediaType='image',sourceName=src.name,text=src.name,findings='',reviewStatus='panel-by-panel visual review',evidenceType='facility-photograph')
  m['referencePages']=[p for p in m['referencePages'] if p['page']!=refs[n]]+[page]
 m['referencePages'].sort(key=lambda p:p['page']);m['source']['pages']=len(m['referencePages'])

 # 1. Day room: actual tree seat, marble tables, cream timber-arm seating.
 for aid in ['plan-dining-table','plan-round-table','plan-banquette-table','plan-lounge-table','plan-small-table','plan-long-table']:
  assets['interior-'+aid]=deepcopy(assets[aid]);assets['interior-'+aid]['material']='photo-marble'
 for o in list(objects):
  if o['zoneId'] in ['day','dining'] and o['assetId'] in ['plan-dining-chair','plan-side-chair']:
   replace(o['id'],'photo-dining-chair',pages=[99,102,115])
  if o['zoneId'] in ['day','dining'] and o['assetId'] in ['plan-dining-table','plan-round-table','plan-banquette-table','plan-lounge-table','plan-small-table','plan-long-table']:
   replace(o['id'],'interior-'+o['assetId'],pages=[99,102,115])
 replace('day-central-tree','photo-tree-seat',pages=[99,102,116])
 assets['interior-banquette']=deepcopy(assets['plan-banquette']);assets['interior-banquette']['material']='photo-blue-seat'
 replace('day-east-banquette','interior-banquette',pages=[99,102,116])
 # Keep the user's three-table cleared activity area. Reorient other square settings.
 for i in range(1,10):
  tid=f'day-diamond-table-{i:02}';table=base[tid];replace(tid,'interior-plan-dining-table',rot=0,pages=[99,102])
  x,_,z=table['position']
  for j,(dx,dz) in enumerate([(0,-.86),(.86,0),(0,.86),(-.86,0)],1):replace(tid+f'-chair-{j}','photo-dining-chair',pos=[x+dx,0,z+dz],rot=math.atan2(dx,dz),pages=[99,102])
 # Seating must clear the physical upholstered ring, not just the old tree trunk.
 cx,_,cz=base['day-central-tree']['position']
 for i in range(1,5):
  t=base[f'day-tree-table-{i}'];x,_,z=t['position'];dx=x-cx;dz=z-cz;f=2.50/math.hypot(dx,dz)-1
  for o in [q for q in base.values() if q['id']==t['id'] or q['id'].startswith(f'day-tree-chair-{i}-')]:
   replace(o['id'],'interior-plan-round-table' if o['id']==t['id'] else 'photo-dining-chair',pos=[o['position'][0]+dx*f,0,o['position'][2]+dz*f],pages=[99,102,116],note='Moved outside the photographed upholstered tree seat; plan-relative center, estimated clearance.')

 # 2. Library wall: no phantom bench in front of built-ins; two photographed recliners.
 remove(['day-west-banquette']+[f'day-lounge-chair-{i}' for i in range(4)]+[f'day-lounge-table-{i}' for i in range(2)])
 P=m['planningTrace']['pixelsPerMeter']; ox,oz=m['planningTrace']['origin']
 for i,(y,length,variant) in enumerate([(823,27,'display'),(851,27,'lattice'),(886,37,'tv'),(921,29,'display'),(948,23,'lattice'),(988,30,'display'),(1023,36,'display'),(1060,27,'lattice')]):
  aid=f'interior-library-{i}';asset(aid,'library-bay',[length/P,2.85,.42],'photo-lattice-blue',variant=variant)
  add(f'day-library-bay-{i}',aid,[(533-ox)/P,0,(y-oz)/P],'day-open',math.pi/2,[104,116])
 for i,z in enumerate([21.3,22.8]):add(f'day-photo-lounge-chair-{i+1}','photo-lounge-chair',[-13.35,0,z],'day-open',math.pi/2,[104,116])
 add('day-photo-lounge-table','interior-plan-lounge-table',[-12.75,0,22.05],'day-open',pages=[104,116])
 # 3. Reverse view checks the shared spatial relationships; retain roof structure.
 room_note('day-open',[99,104,102,116],'Photos 1–3 and 26: tree seat centered between west blue-lattice library and east landscape/banquette wall. Marble-look tables and cream timber-arm chairs. Three front table settings remain cleared for the user-requested activities; other positions estimated within the plan.')
 # Add visibly suspended black speakers/projector (previously omitted).
 for i,(x,z) in enumerate([(-12.7,12),(-1.5,12),(-12.7,20.5),(-1.5,20.5)]):component(f'day-speaker-{i}',[.32,.28,.30],[x,3.9,z],'day-open','photo-black',pages=[99,102],layer='ceiling')
 component('day-projector',[.40,.16,.30],[-5,3.72,18.5],'day-open',pages=[99,102],layer='ceiling')

 # 4. Clinic nurse station is distinct from front reception.
 remove([f'clinic-nurse-counter-{i}' for i in range(3)])
 asset('interior-nurse-station','clinical-nurse-station',[3.25,1.05,3.85],'photo-quartz')
 # Navigable hollow interior, three real counter runs. Entries remain open on -Z.
 nav=[[-1.365,-.20,.52,3.40],[1.365,-.20,.52,3.40],[0,1.62,3.25,.60]]
 add('clinic-photo-nurse-station','interior-nurse-station',[-7.45,0,-11.25],'clinic-nurse',pages=[97,114],nav=nav)
 asset('interior-cart','medical-drawer-cart',[.48,.86,.48],'photo-red-cart')
 add('clinic-red-cart','interior-cart',[-7.20,0,-12.75],'clinic-nurse',pages=[97,114])
 asset('interior-printer','clinical-printer',[.48,.42,.44]);add('clinic-printer','interior-printer',[-6.20,.78,-12.00],'clinic-nurse',pages=[97,114])
 asset('interior-station-drawers','clinical-drawers',[.78,.82,.48],'oak');add('clinic-station-drawers','interior-station-drawers',[-8.50,0,-12.6],'clinic-nurse',math.pi/2,[97,114])
 component('clinic-secure-bin',[.37,.71,.42],[-7.76,0,-12.80],'clinic-nurse','photo-silver',pages=[97,114])
 component('clinic-telephone',[.17,.095,.16],[-6.12,.77,-10.5],'clinic-nurse','photo-black',pages=[97,114])
 for i,pos in enumerate([[-7.8,0,-11.90],[-6.85,0,-10.6]]):add(f'clinic-nurse-task-chair-{i}','photo-clinic-task-chair',pos,'clinic-nurse',math.pi/2,[97,114])
 asset('interior-counter-sink','counter-basin',[.44,.25,.36])
 add('clinic-station-sink','interior-counter-sink',[-8.50,.84,-12.60],'clinic-nurse',math.pi/2,[97,114])
 room_note('clinic-nurse',[97,114],'Photo 10 / sheet 23 top left: white quartz and pale-wood staffed counter with low accessible return and open knee space, tan mesh chairs, red drawer cart, printer, telephone, storage and secure bin. Soffit and ceiling retained. Counter outline fitted inside the plan boundary; measured radii/lengths unresolved.')

 # 5. Two distinct exam equipment families; photo does not map every trace room.
 asset('interior-exam-chair','clinical-recliner',[.78,1.36,1.62],'photo-teal')
 asset('interior-procedure-chair','clinical-recliner',[.82,1.36,1.76],'photo-teal',procedure=True)
 asset('interior-exam-sink','clinical-sink',[1.28,2.10,.54])
 asset('interior-stool','clinical-stool',[.55,.53,.55],'photo-mustard')
 asset('interior-diagnostics','diagnostic-panel',[.85,.80,.22])
 asset('interior-monitor','clinical-monitor',[.52,.84,.44])
 asset('interior-procedure-cart','procedure-cart',[.63,1.02,.63])
 asset('interior-supply-cabinet','glazed-cabinet',[.68,2.08,.45])
 asset('interior-sharps','wall-dispenser',[.23,.32,.15],'photo-red-cart')
 for i in range(1,7):
  rid=f'clinic-exam-{i:02}';r=rooms[rid];z0=min(p[1] for p in r['polygon']);z1=max(p[1] for p in r['polygon']);zc=(z0+z1)/2
  # Leave the west corridor door zone open, the sink on the rear wall and
  # the workstation/visitor to the east. Same family is provisional in unseen rooms.
  remove([o['id'] for o in objects if o.get('roomId')==rid and o.get('layer','furniture')=='furniture'])
  add(rid+'-recliner','interior-exam-chair',[-2.3,0,zc],'%s'%rid,0,[114],note='Standard teal exam recliner family visible in sheet 23 lower right. Assignment to this trace room is provisional; real room number not inferred.')
  add(rid+'-sink','interior-exam-sink',[-.86,0,z0+.39],rid,0,[114])
  add(rid+'-diagnostics','interior-diagnostics',[-2.28,.96,z0+.18],rid,0,[114],layer='wall-finish')
  add(rid+'-monitor','interior-monitor',[-.33,.72,zc+.18],rid,-math.pi/2,[114],layer='wall-finish')
  add(rid+'-stool','interior-stool',[-1.21,0,zc+.25],rid,0,[114])
  add(rid+'-visitor','photo-dining-chair',[-.57,0,z1-.45],rid,math.pi/2,[114])
  add(rid+'-sharps','interior-sharps',[-.20,.93,z0+.95],rid,-math.pi/2,[114],layer='wall-finish')
  room_note(rid,[114,96],'Sheet 23 lower-right exam equipment family: teal reclining chair, sink/drawer/upper cabinet unit, diagnostic panel, wall monitor and keyboard arm, tan stool, red sharps container and visitor chair. Applied provisionally to this plan trace room; individual room number, equipment dimensions and exact side/orientation require confirmation.')
 # The larger south treatment room can demonstrate the specialty suite without
 # pretending the contact sheet supplies a room number or clinical specialty.
 rid='clinic-treatment-south';remove([o['id'] for o in objects if o.get('roomId')==rid and o.get('layer','furniture')=='furniture'])
 for id,aid,pos,rot in [('recliner','interior-procedure-chair',[-7.55,0,-3.85],0),('sink','interior-exam-sink',[-8.48,0,-5.03],0),('glass-storage','interior-supply-cabinet',[-6.2,0,-5.03],0),('cart','interior-procedure-cart',[-6.38,0,-3.55],0),('stool','interior-stool',[-8.45,0,-3.13],0),('diagnostics','interior-diagnostics',[-7.35,1.05,-5.26],0)]:
  add('clinic-south-'+id,aid,pos,rid,rot,[114],layer='wall-finish' if id=='diagnostics' else 'furniture',note='Specialty treatment equipment shown in sheet 23 lower left; placement in this larger trace room is a provisional demonstration, not a verified room assignment.')
 asset('interior-exam-lamp','exam-lamp',[.30,1.12,.63])
 add('clinic-south-exam-lamp','interior-exam-lamp',[-8.45,.65,-4.25],rid,0,[114],layer='wall-finish')
 # Curved arm task lamp is separate from diagnostic panel in the photograph.
 room_note(rid,[114],'Sheet 23 lower-left specialty equipment family: segmented recliner with headrest and arm supports, wheeled screen/basket cart, glazed supply cabinet, sink cabinetry and rolling stool. Demonstration placement; actual room identity and equipment model remain unverified.')

 # 6. Rehabilitation, dining and washroom panel details.
 asset('interior-plinth','rehab-plinth',[1.35,.69,1.95],'rehab-blue')
 m['materials']['rehab-blue']=dict(color='#2c62ac',roughness=.75)
 asset('interior-bars','rehab-bars',[1.35,.92,3.65],'photo-silver')
 asset('interior-stepper','rehab-stepper',[.83,1.36,1.65],'photo-silver')
 asset('interior-training-stairs','rehab-training-stairs',[1.08,1.48,3.7],'oak')
 asset('interior-rehab-rack','rehab-rack',[.64,1.82,.60],'oak')
 # Mat tables flank the therapy floor; parallel-bar lane stays open for practice.
 for i,(x,z,rot) in enumerate([(-25.48,12.7,0),(-25.48,20.30,0),(-25.48,22.48,0)]):add(f'rehab-mat-plinth-{i+1}','interior-plinth',[x,0,z],'rehab-open',rot,[115])
 add('rehab-parallel-bars','interior-bars',[-22.8,0,22.12],'rehab-open',pages=[115],nav=[[-.5265,0,.12,3.65],[.5265,0,.12,3.65]])
 for i,x in enumerate([-24.4,-22.0]):add(f'rehab-recumbent-stepper-{i+1}','interior-stepper',[x,0,26.15],'rehab-open',math.pi,[115])
 add('rehab-training-stairs','interior-training-stairs',[-28.70,0,26.20],'rehab-open',math.pi/2,[115])
 add('rehab-resistance-rack','interior-rehab-rack',[-26.0,0,17.0],'rehab-open',pages=[115])
 # Relocate loose planning lounge seats that otherwise intersect the therapy steps.
 for i in range(4):replace(f'rehab-visible-chair-{i}','photo-dining-chair',pos=[-30.45,0,23.78+i*.68],rot=math.pi/2,pages=[115])
 remove(['rehab-side-desk'])
 component('rehab-mirror-north',[3.1,1.35,.025],[-24.45,.7,11.18],'rehab-open','photo-silver',pages=[115],layer='wall-finish')
 component('rehab-mirror-west',[.025,1.4,3.0],[-26.40,.7,20.5],'rehab-open','photo-silver',pages=[115],layer='wall-finish')
 # The pre-existing tabletop OT interaction now has a physical model footprint.
 asset('interior-ot-table','table',[1.45,.74,.68],'oak')
 add('rehab-ot-task-table','interior-ot-table',[-24,0,15.25],'rehab-open',pages=[60,61],note='Retained tabletop OT simulation station, not verified by these photographs.')
 for id,z,r in [('therapist',14.5,math.pi),('participant',16,0)]:add('rehab-ot-chair-'+id,'photo-dining-chair',[-24,0,z],'rehab-open',r,[60,61],note='OT simulation task seating; this exact station is not visible in the new photos.')
 asset('interior-pulley','rehab-pulley',[.72,1.68,.22])
 add('rehab-wall-pulley','interior-pulley',[-23.45,.24,11.20],'rehab-open',pages=[115],layer='wall-finish')
 asset('interior-balls','therapy-balls',[1.44,.58,.78],'photo-teal')
 add('rehab-exercise-balls','interior-balls',[-24.4,0,18.72],'rehab-open',pages=[115])
 for i,z in enumerate([20.3,22.48]):add(f'rehab-treatment-stool-{i+1}','interior-stool',[-24.4,0,z],'rehab-open',pages=[115])
 room_note('rehab-open',[115,60,61],'Sheet 25 panels 10/11: three blue padded mat plinths, parallel bars with platform, separate training stairs/ramp and handrails, recumbent exercise machines, mirror panels, mobile resistance-band/weight rack and stools. Layout fitted to the existing plan; equipment dimensions and counts outside photo coverage are not certified. The tabletop OT station is retained as a simulation assumption.')
 room_note('dining-1421',[115,99],'Sheet 25 lower right: marble-look tables, cream upholstered timber-arm chairs, two-tone walls, kitchen pass-through and lattice divider. Existing room shell retained.') if 'dining-1421' in rooms else None
 asset('interior-double-sink','accessible-vanity',[1.72,1.12,.59],'photo-quartz',basins=2)
 asset('interior-paper-bin','wall-dispenser',[.34,.76,.15],'photo-silver')
 for rid,ids,zc in [('rehab-wc-east',[2,3],16.91),('rehab-wc-south',[4,5],20.68)]:
  remove([f'rehab-basin-{i}' for i in ids])
  add(rid+'-double-vanity','interior-double-sink',[-16.15,0,zc],rid,-math.pi/2,[115,116])
  component(rid+'-sink-mirror',[.025,1.00,1.80],[-15.81,1.13,zc],rid,'photo-silver',pages=[115,116],layer='wall-finish')
  remove([rid+'-mirror'])
  add(rid+'-paper-bin','interior-paper-bin',[-15.91,.27,zc-1.2],rid,-math.pi/2,[115,116],layer='wall-finish')
  asset('interior-wash-storage','clinical-drawers',[.76,.80,.40],'oak')
  add(rid+'-wash-storage','interior-wash-storage',[-16.12,0,zc-1.15],rid,-math.pi/2,[115,116])
  # Current traced cubicle walls and door openings retain their measured-image positions.
  # No new toilet handedness/grab rail layout is inferred behind closed doors.
  room_note(rid,[115,116,101,105],'Sheets 25/26 bathroom views: shared double washbasin with open knee space, mirror, soap/paper dispensers, pale-wood storage and tall cubicle fronts, white mosaic floor and teal border/tile band. Toilet positions and stall subdivisions retained from the plan; closed stall interiors, gender assignment and measured clearances remain unverified.')
 # Dining details are registered to existing wall runs/openings; exact offsets
 # remain estimates. The kitchen service opening is not a new circulation door.
 asset('interior-dining-screen','dining-lattice',[1.40,2.6,.12],'oak')
 add('dining-lattice-divider','interior-dining-screen',[4.79,0,7.34],'dining-1421',math.pi/2,[115],layer='architecture',note='Photo 25 dining lattice motif applied at the existing plan divider. Width/offset provisional.')
 component('dining-service-sill',[.62,.06,1.98],[8.39,.9,2.36],'dining-1421','photo-quartz',pages=[115],layer='architecture')
 for z in [1.38,3.34]:component('dining-service-jamb-'+str(z),[.12,1.05,.07],[8.32,.96,z],'dining-1421','oak',pages=[115],layer='wall-finish')
 component('dining-service-header',[.12,.10,2.02],[8.32,2.01,2.36],'dining-1421','oak',pages=[115],layer='wall-finish')
 for i,(x,z,dx,dz) in enumerate([(8.28,.83,.025,1.02),(8.28,4.88,.025,3.00),(6.65,7.46,3.28,.025)]):
  component('dining-lower-wall-'+str(i),[dx,1.10,dz],[x,0,z],'dining-1421','photo-blue-grey',pages=[115],layer='wall-finish')
 # 7. Opposite views verify the same library/tree/restroom assemblies, not extra rooms.
 review=[
  dict(photo=1,page=99,title='Day room · landscape wall and tree',rooms=['day-open'],matched='Segmented pale-blue circular tree seating, cream timber-arm chairs, marble tabletops, east banquette/landscape wall, timber roof, ducts, linear lights, speakers and projector.',unresolved='Furniture dimensions, tree canopy shape and overhead elevations are estimated.'),
  dict(photo=2,page=104,title='Day room · library wall',rooms=['day-open'],matched='Pale-wood display/storage bays, blue lattice panels, integrated TV, two high-back pale-blue lounge chairs and communal seating.',unresolved='Bay widths and shelf contents are approximated. The photograph’s central passage is not confidently registered to the plan; the existing verified circulation opening is retained.'),
  dict(photo=3,page=102,title='Day room · reverse view',rooms=['day-open'],matched='West library / central tree / east banquette relationship; square table orientation and spacing around the upholstered tree seat.',unresolved='Three front table settings remain cleared for the requested activities, an intentional operational difference from the photograph.'),
  dict(photo=10,page=97,title='Clinic · nurse station',rooms=['clinic-nurse'],matched='White quartz and oak counter, low return with knee space, mesh chairs, red drawer cart, printer, telephone and storage; blue-grey soffit.',unresolved='Counter lengths/radii, staff work positions and exact cabinet measurements need field verification.'),
  dict(photo=23,page=114,title='Exam rooms · four-panel sheet',rooms=[f'clinic-exam-{i:02}' for i in range(1,7)]+['clinic-treatment-south','clinic-nurse'],matched='Top panels: same nurse station and tracked wooden exam doors. Lower right: standard teal recliner, diagnostic panel, sink cabinetry, wall workstation, stool, sharps and visitor chair. Lower left: specialty recliner, wheeled screen/basket cart and glass supply cabinet.',unresolved='Number 1114 / Exam 1 is visible on a door; mapping each numbered door to a trace polygon is unconfirmed. Standard kit in six trace rooms and specialty placement are provisional, not room-by-room verified inventories.'),
  dict(photo=25,page=115,title='Rehab, bathrooms and dining · four-panel sheet',rooms=['rehab-open','rehab-wc-east','rehab-wc-south','dining-1421'],matched='Bathroom double sink with knee space, tile, mirrors and partitions. Rehab: mat plinths, parallel bars, recumbent machines, training steps/ramp and resistance rack. Dining: marble tables, timber-arm chairs, lattice divider, two-tone wall finish and service counter.',unresolved='Rehab offsets/equipment dimensions are estimated; this sheet does not establish a separate OT room inventory or the inside of closed toilet stalls.'),
  dict(photo=26,page=116,title='Library, tree and bathroom · reverse views',rooms=['day-open','rehab-wc-east','rehab-wc-south'],matched='Cross-check of the same blue lattice/library, central fluted tree seat, landscape banquette and shared wash/stall-front assemblies.',unresolved='No duplicate rooms inferred. Exact bathroom side/gender assignment, cubicle interiors and clearances remain unresolved.'),
 ]
 m['interiorReview']=dict(date='2026-09-21',title='Seven-photo interior review',items=review,accuracy='Photo-informed model; not a dimensionally verified as-built survey.')
 for r in review:
  page=next(p for p in m['referencePages'] if p['page']==r['page']);page['findings']=r['matched']+' '+r['unresolved'];page['reviewStatus']='reviewed in user-supplied sequence / physical dimensions unverified'
 for zone in m['zones']:
  if zone['id'] in ['day','clinic','rehab','dining']:
   zone['notes']='September 21 photo-informed interior. Equipment families and visible finishes follow the seven-photo review; coordinates and dimensions remain estimated within plan boundaries.'
   zone['referencePages']=list(dict.fromkeys(([99,104,102,116] if zone['id']=='day' else [97,114] if zone['id']=='clinic' else [115,116])+zone['referencePages']))
 m['planningTrace']['furnitureAuthority']='September 21 photographs in reviewed rooms; Overall Planning elsewhere'
 m['planningTrace']['furniturePolicy']='Visible furniture/equipment in day, clinic, rehab and dining follows the seven photographs. Plan boundaries retained. Cleared front activity area retained. Unseen rooms and equipment placement remain provisional.'
 m['photoSurvey']['priority']=['September 21 user photo request for reviewed interiors','User-confirmed room locations','Plan for boundaries and unphotographed spaces']
 m['photoSurvey']['userConfirmed']=list(dict.fromkeys([s for s in m['photoSurvey']['userConfirmed'] if 'reverted' not in s]+['September 21: review seven interior photographs in sequence']))
 m['photoSurvey']['references']=list(dict.fromkeys(m['photoSurvey']['references']+[114,115,116]))
 for level in m['levels']:
  if level['id']=='ground':level['notes']='Photographed interiors with plan-based room boundaries. Exam and rehab equipment, nurse station, day-room furniture and shared wash areas reflect the September 21 review; physical dimensions and room assignments remain unverified.'
 for o in objects:
  if o['assetId'] in ['interior-diagnostics','interior-monitor','interior-sharps','interior-exam-lamp','interior-pulley'] or o['id'].endswith(('-sink-mirror','-paper-bin')):o['layer']='furniture'
 m['revision']='2026-09-21 / seven-photo interior equipment and accessible wash areas'
 m['source']['date']='Interior photo review September 21, 2026'
 m['calibration']['notes']='Overall Planning.jpg supplies the ground-floor footprint and room boundaries. Reviewed interior equipment and finishes follow the September 21 photographs. Uniform scale uses the stated clinic area; lengths, heights, product sizes and individual equipment placement remain unverified.'
 for issue in m['accuracyIssues']:
  if issue['id']=='furniture-schedule':issue.update(title='Equipment dimensions and room assignments',detail='Visible clinical and rehabilitation equipment families now match the seven-photo review. Individual exam-room mapping, exact equipment models, measured offsets and closed toilet-stall interiors are unverified.',pages=[114,115,116])
 m['exportFiles']['audit']='/models/interior-photo-review.md'
 # Explicit override list allows validation to continue protecting unrelated furniture.
 by={o['id']:o for o in objects}
 m['interiorReview']['changedPlanObjectIds']=[id for id,o in base.items() if by.get(id)!=o]
 m['interiorReview']['newObjectIds']=[o['id'] for o in objects if o['id'] not in base and o['referencePages'][0] in [99,104,102,97,114,115,116,60]]
 lines=['# Seven-photo interior review — September 21, 2026','','Photographs establish appearance and visible relationships. The existing plan supplies the footprint. No survey dimensions, manufacturer specifications or hidden bathroom configurations have been certified.','']
 for r in review:lines += [f"## Photo {r['photo']} — {r['title']}",'',r['matched'],'',f"Unverified / intentional differences: {r['unresolved']}",'',f"Model rooms: {', '.join(r['rooms'])}.",'']
 lines += ['## Rebuild','', 'After earlier plan/photo/fleet layers, run `python3 scripts/apply-interior-photos.py`, then rebuild activity routes, validate the model and activity, and export the building. The earlier blanket furniture restoration is superseded only in the reviewed rooms.','']
 (OUT/'interior-photo-review.md').write_text('\n'.join(lines))
 notes = '\n'.join(lines[:4])+'''\nThe September 21 photo review supersedes the earlier blanket furniture restoration in the day room, clinic, rehabilitation and dining areas. Unrelated plan furniture, room boundaries, van arrivals, upstairs fit-out and staff templates remain retained. Three front table settings stay cleared for activities.\n
- Clinic: two photographed equipment families, a staffed nurse station and accessible low counter. Individual exam-room assignments are provisional.
- Rehabilitation: mat plinths, parallel bars, steppers, training steps/ramp, mobile resistance rack, pulleys, balls and stools. OT task seating is a simulation assumption.
- Bathrooms: photographed shared wash areas and cubicle finishes; closed stall interiors remain unverified and retain the plan layout.
- Day room/dining: tree seating, blue lattice cabinetry, landscape banquette, marble tables and cream timber-arm chairs.

[Read the seven-photo review](interior-photo-review.md) for each source, modeled element and unresolved detail. The model contains '''+str(len(objects))+''' catalog objects; the active arrangement omits the 15 stored front-table objects. The care-day loop retains 41 people, 12 roles and 4× default speed.

## Rebuild

Run the earlier plan/photo/fleet generators, then `python3 scripts/apply-interior-photos.py`, `python3 scripts/build-activity.py`, model/interior/activity validation and GLB export. `build-photo-update.py` also applies the interior layer last. Repeating the old plan restoration alone would discard the approved photo update.

## Accuracy

Plan-derived scale is area calibrated, not surveyed. Room numbers, equipment dimensions, exact offsets, the library passage registration and hidden bathroom details need confirmation before this can be treated as an accurate as-built simulation. Geometry checks confirm model clearances only; they do not certify real-world clearances.
'''
 (OUT/'photo-update.md').write_text(notes)
 (ROOT/'MODEL_NOTES.md').write_text(notes.replace('(interior-photo-review.md)','(public/models/interior-photo-review.md)')+'\nSee [animation details](public/models/animation-update.md) and [upstairs/fleet details](public/models/upstairs-fleet-update.md).\n')
 audit=['# Current model accuracy register','','Latest interior review: September 21, 2026. Current scale: '+str(m['planningTrace']['pixelsPerMeter'])+' source pixels per meter. Calibration is area-derived, not a surveyed dimension.','','See [the seven-photo review](interior-photo-review.md) and [historical source-document audit](source-document-audit.md).','']
 for issue in m['accuracyIssues']:audit += ['## '+issue['title'],'',issue['detail'],'','Status: '+issue['status']+'.','']
 (OUT/'accuracy-register.md').write_text('\n'.join(audit))
 return m

if __name__=='__main__':
 m=apply_update(json.loads(FILE.read_text()));FILE.write_text(json.dumps(m,indent=2)+'\n')
 print(f"Applied seven-photo review: {len(m['objects'])} objects; {len(m['referencePages'])} references")
