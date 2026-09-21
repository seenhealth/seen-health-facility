"""Apply September 2026 photographic evidence to the registered planning model.

Furniture follows Overall Planning.jpg per the latest user direction. Photos
remain references for architectural finishes and confirmed room locations. No new physical dimensions are certified by photos.
Run build-planning.py first when the plan changes, then this script.
"""
import json, math, hashlib, shutil, os
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'; REF=ROOT/'public/reference/photos'; REF.mkdir(parents=True,exist_ok=True)
MEDIA=Path(os.environ.get('SEEN_HEALTH_MEDIA_DIR','/Users/xing/Library/CloudStorage/GoogleDrive-xing@seenhealth.org/Shared drives/Seen Health, Inc/24. SH Media Assets/5. SGV Center'))
m=json.loads((OUT/'seen-alhambra-planning-base.json').read_text())
P=m['planningTrace']['pixelsPerMeter']; OR=m['planningTrace']['origin']
def pt(x,y): return [round((x-OR[0])/P,6),round((y-OR[1])/P,6)]
def rect(x,y,w,d):return [pt(x,y),pt(x+w,y),pt(x+w,y+d),pt(x,y+d)]
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
rooms={r['id']:r for r in m['rooms']}; zones={z['id']:z for z in m['zones']}
assets=m['assets']; objs=m['objects']; manifest=[]
prior_manifest={a['reference']:a for a in json.loads((REF/'source-manifest.json').read_text())['assets']} if (REF/'source-manifest.json').exists() else {}
def photo_source(src,fn,num):
 if src.exists():
  im=ImageOps.exif_transpose(Image.open(src)).convert('RGB'); dimensions=im.size;im.thumbnail((2400,2400));im.save(REF/fn,quality=89,optimize=True)
  record=dict(reference=num,sourceName=src.name,sourceRelativePath=str(src.relative_to(MEDIA)),sha256=sha(src),originalSize=list(dimensions),deliveredFile=fn)
 else:
  assert (REF/fn).exists() and num in prior_manifest, f'Missing photo: {src.name}. Set SEEN_HEALTH_MEDIA_DIR to the supplied media folder.'
  record=prior_manifest[num]
 manifest.append(record)
descriptions={
 1:('Day room · tree seat and landscape wall','Day room photographs','Circular pale-blue upholstered tree seat; cream upholstered wood-arm chairs; marble-look tables; blue banquette; illuminated layered landscape and timber slats; exposed timber, skylights, ducts and linear light baffles.'),
 2:('Day room · library and lounge chairs','Day room photographs','Pale oak display/storage cabinetry with blue Chinese lattice panels, TV and open shelves. Two visible pale-blue high-back lounge chairs replace the illustrated low chairs. Cabinetry replaces the plan’s west-wall bench.'),
 3:('Day room · furniture and exposed structure','Day room photographs','View along the day room: central tree seat, square marble-look tables aligned with the room, oak/cream armchairs, west library wall and east landscape wall. Unseen furniture positions remain plan-derived.'),
 4:('Shared restrooms · partitions and vanity','Restroom photographs','User locates the paired men’s/women’s multistall restrooms between OT/rehab and the day center. Pale wood full-height partitions, white mosaic floor with teal border, white wall tile and teal band. Which side is men’s versus women’s is not established.'),
 5:('Shared restrooms · double-basin vanity','Restroom photographs','Same paired restroom suite: white double-basin vanity, pale wood cabinetry and stall fronts, teal wall-tile band, mirrors, dispensers and stainless paper receptacle. Finish applied to both suites at the user’s direction.'),
 6:('Reception · arrival desk and moss wall','Reception photographs','White quartz-faced reception desk with rounded pale-oak return, mustard bench in oak-slat niche, green moss wall with vertical timber fins continuing overhead, pale plank-look tile.'),
 7:('Clinic · nurse station and exam doors','Clinic photographs','U-shaped rounded quartz/wood nurse station with under-counter lighting, tan mesh chairs, pale blue-grey soffit. Sliding exam doors carry numbers 1–3; actual door heights remain estimated.'),
 8:('Clinic · nurse station close-up','Clinic photographs','White quartz counter band, honey wood worktops and bases, caramel mesh task chairs with white frames. Door plaques identify Exam 1 as 1114 and Exam 2 as 1115; trace-to-number mapping requires confirmation.'),
 9:('Clinic · curved counter and support rooms','Clinic photographs','Curved quartz edge with warm underlighting, honey wood base, pale blue-grey wall/soffit, red clinical cart, printer, task chairs and storage.'),
 10:('Clinic · accessible return and waiting chairs','Clinic photographs','Lower accessible counter return; printer, red cart, wood drawer cabinet, tan mesh chairs and two wood-arm waiting chairs. Consult room plaque 1123 is visible.'),
 13:('Clinic · entry and corridor','Clinic photographs','Timber double entry doors with narrow vision panels, green bilingual clinic sign, timber sliding doors, white suspended ceiling grid and square light panels.'),
 15:('Clinic · Exam Room 2','Clinic photographs','Turquoise examination recliner, white base and upper cabinetry, warm brown countertop and sink, tall glazed storage, tan stool and wood-arm visitor seating. Photo-specific arrangement should be assigned to Exam 2 after room order is confirmed.'),
 16:('Staff lounge · kitchenette and lockers','Administration photographs','User confirms Staff Lounge 1520 beside the admin stairs, between stairs and lockers. Pale cabinetry, white counter, blue-grey backsplash, four wood-shell stools and two-tier wood lockers in the right-hand admin entry corridor.'),
 18:('Administration · three-seat meeting rooms','Administration photographs','User confirms both small admin meeting rooms use this fit-out: yellow walls, light patterned carpet, three white mesh chairs, wood tabletop with teal panel pedestal, screen/video bar and whiteboard.'),
}
photo_refs={}
order=[8,13,18,15,10,7,1,9,5,3,6,2,4,16]
for i,n in enumerate(order):
 src=MEDIA/f'Center interior photos/Edited by Ricky/Center Photo redited-{n}.jpg'
 fn=f'center-{n:02}.jpg'; num=93+i;photo_source(src,fn,num)
 photo_refs[n]=num;title,group,findings=descriptions[n]
 m['referencePages'].append(dict(page=num,title=title,label=f'Photo {n}',group=group,image=f'/reference/photos/{fn}',file=f'/reference/photos/{fn}',mediaType='image',sourceName=src.name,text=src.name,findings=findings,reviewStatus='visually-reviewed / user-location-confirmed',evidenceType='facility-photograph'))
for num,relative,fn,title,findings,group in [
 (107,'Center interior photos/Langdon Wilson Photos/Sean Health Care 29A.jpg','lockers.jpg','Administration · locker details','Same admin entry corridor as Staff Lounge 1520, confirmed by the user. Two-tier honey-wood lockers, white pull handles, black electronic locks; overall bank dimensions and module count are estimated from the photograph.','Administration photographs'),
 (108,'Center interior photos/Langdon Wilson Photos/Sean Health Care 29.jpg','staff-lounge.jpg','Staff Lounge 1520 · alternate photograph','Alternate exposure of the same staff lounge and corridor. Four counter stools, white/pale wood kitchenette and blue-grey backsplash. This is the same space as Photo 16, not an additional lounge.','Administration photographs'),
 (109,'Exterior Photos/WechatIMG1941.jpg','dropoff-entry.jpg','Exterior · drop-off entrance','Tan stucco, brown cantilever canopy with suspension rods, raised white bilingual sign, silver-framed automatic entry, two tall narrow windows, brown ramp railings and concrete stairs.','Exterior photographs'),
 (110,'Exterior Photos/WechatIMG1942.jpg','valley-facade.jpg','Exterior · Valley Boulevard','Ivory façade with seven narrow upper windows, large lower glazing, white bilingual signage, blue central entry volume and angled canopy, accessible ramp and planted street edge.','Exterior photographs')]:
 src=MEDIA/relative;photo_source(src,fn,num)
 m['referencePages'].append(dict(page=num,title=title,label='Locker detail' if num==107 else 'Lounge photo' if num==108 else 'Exterior photo',group=group,image=f'/reference/photos/{fn}',file=f'/reference/photos/{fn}',mediaType='image',sourceName=src.name,text=src.name,findings=findings,reviewStatus='visually-reviewed',evidenceType='facility-photograph'))
video=MEDIA/'Exterior Photos/见心颐养航拍-Yan Xu.mp4'
if video.exists():shutil.copyfile(video,REF/'exterior-drone.mp4')
assert (REF/'exterior-drone.mp4').exists(),'Missing drone video.'
poster=ROOT/'work/drone/drone-09.jpg'
if poster.exists():shutil.copyfile(poster,REF/'drone-poster.jpg')
assert (REF/'drone-poster.jpg').exists(),'Extract the drone reference poster before building.'
m['referencePages'].append(dict(page=111,title='Drone footage · Valley Boulevard frontage',label='Drone video',group='Exterior photographs',image='/reference/photos/drone-poster.jpg',file='/reference/photos/exterior-drone.mp4',mediaType='video',sourceName=video.name,text='14.497-second source video; reviewed at 0.00, 3.792, 7.498 and 11.290 seconds.',findings='Confirms seven upper façade slit windows, lower glass storefront, west ramp, front planting and angled central canopy. The camera stays near street height; this is not overhead roof coverage and cannot verify the complete roof or hidden elevations.',reviewStatus='video-frames-reviewed',evidenceType='facility-video'))
manifest.append(dict(reference=111,sourceName=video.name,sourceRelativePath=str(video.relative_to(MEDIA)),sha256=sha(REF/'exterior-drone.mp4'),deliveredFile='exterior-drone.mp4'))

def mat(id,color,roughness=.65,**kw):m['materials'][id]=dict(color=color,roughness=roughness,**kw)
mat('oak','#ddbd85',pattern='woodgrain');mat('wood','#e3c89e',pattern='herringbone');mat('vinyl','#edece2');mat('tile','#e4daca',pattern='plank')
mat('photo-carpet','#dad4bd',1,pattern='carpet');mat('photo-white','#f5f3ea',.55);mat('photo-marble','#fafafa',.3,pattern='marble')
mat('photo-quartz','#f4f2ea',.35);mat('photo-tan-mesh','#b98d60',.85);mat('photo-blue-grey','#a1b8b6');mat('photo-teal','#57adbc')
mat('photo-seat','#ede7d8',.84);mat('photo-blue-seat','#9ec6cb',.83);mat('photo-chair-wood','#b17b43',.55,pattern='woodgrain')
mat('photo-brown-counter','#a38a7b',.42);mat('photo-mustard','#c4a146');mat('photo-yellow','#e4d19a');mat('photo-lattice-blue','#409dbd')
mat('photo-landscape-red','#a34f2f');mat('photo-landscape-ochre','#c59555');mat('photo-moss','#58794a',1)
mat('photo-light','#fff8e8',.3,emissive='#fff2d3',emissiveIntensity=.45);mat('photo-led','#f8ffff',.35,emissive='#e9f5ff',emissiveIntensity=.6)
mat('photo-mosaic','#f1eadc',.75,pattern='mosaic');mat('photo-teal-tile','#8db3ae',.42,pattern='tile')
mat('photo-facade','#d8cbb6',.9);mat('photo-bronze','#6b5845',.48,metalness=.3);mat('photo-silver','#c5c9c9',.35,metalness=.68)
mat('photo-mesh-white','#ecece7',.88);mat('photo-black','#242b2c',.55);mat('photo-red-cart','#c8453d',.45)

def asset(id,kind,w,h,d,material,materials=None,**parameters):
 assets[id]=dict(kind=kind,dimensions=[w,h,d],material=material)
 if materials:assets[id]['materials']=materials
 if parameters:assets[id]['parameters']=parameters
def instance(id,aid,x,y,zid,rot=0,elev=0,room=None,refs=None,layer='furniture',note=''):
 q=pt(x,y);o=dict(id=id,assetId=aid,zoneId=zid,levelId='ground',position=[q[0],elev,q[1]],rotation=rot,scale=[1,1,1],roomId=room,referencePages=refs or [92],status='photo-informed / dimensions-estimated',notes=note or 'Appearance follows the referenced photograph. Placement is registered to the plan; dimensions estimated without a measured drawing.',layer=layer)
 objs.append(o);return o
def component(id,x,y,w,h,d,zid,material,elev=0,rot=0,room=None,refs=None,layer='architecture'):
 aid='photo-'+id;asset(aid,'box',w,h,d,material);return instance(id,aid,x,y,zid,rot,elev,room,refs,layer)
def remove(predicate):objs[:]=[o for o in objs if not predicate(o)]
def fit(o,aid):
 # Keep a registered center but explicitly supersede the old symbol footprint.
 o['assetId']=aid;o['scale']=[1,1,1];o.pop('sourcePixelFootprint',None)
 o['status']='photo-informed furniture / center registered to plan / dimensions-estimated'
 o['notes']='Photographed furniture takes precedence over the illustrated symbol. Center retained from plan where a photo does not establish a measurable displacement.'
def refRoom(id,refs,note):
 r=rooms[id];r['referencePages']=list(dict.fromkeys(refs+r['referencePages']));r['notes']=note;r['status']='plan boundary / photo finish / user room mapping'

# Day room: the actual upholstered tree seat, cabinetry and chairs supersede rendered-plan symbols.
dr=[photo_refs[n] for n in [1,2,3]]
asset('photo-dining-chair','upholstered-chair',.55,.9,.57,'photo-seat',{'wood':'photo-chair-wood','metal':'photo-bronze'})
asset('photo-lounge-chair','lounge-chair',.69,1.17,.86,'photo-blue-seat',{'wood':'photo-white','metal':'photo-white'})
asset('photo-tree-seat','tree-seat',3.1,4.5,3.1,'photo-blue-seat',{'wood':'photo-chair-wood','trim':'photo-bronze','leaf':'leaf'})
assets['plan-dining-table']['material']='photo-marble';assets['plan-round-table']['material']='photo-marble';assets['plan-banquette-table']['material']='photo-marble';assets['plan-lounge-table']['material']='photo-marble'
assets['plan-banquette']['material']='photo-blue-seat'
for o in objs:
 if o['zoneId']=='day':
  o['referencePages']=list(dict.fromkeys(dr+o['referencePages']))
  if o['assetId'] in ['plan-dining-chair','plan-side-chair']:fit(o,'photo-dining-chair')
  if o['id'].startswith('day-diamond-table-') and '-chair-' not in o['id']:
   o['rotation']=0;o['status']='photo-informed orientation / plan-registered center';o['notes']='Square table edges follow the photographed room axes rather than the diamond symbols in the planning render.'
  if o['id']=='day-central-tree':fit(o,'photo-tree-seat')
remove(lambda o:o['id']=='day-west-banquette' or o['id'].startswith('day-lounge-chair-') or o['id'].startswith('day-lounge-table-'))
for i,y in enumerate([1019,1048]):instance(f'day-photo-lounge-chair-{i+1}','photo-lounge-chair',557,y,'day',-math.pi/2,room='day-open',refs=[photo_refs[2]])
instance('day-photo-lounge-table','plan-lounge-table',559,1034,'day',room='day-open',refs=[photo_refs[2]])
# Chairs now face the straight table edges instead of the plan's diamond symbols.
for table in [o for o in objs if o['id'].startswith('day-diamond-table-') and '-chair-' not in o['id']]:
 x,y=table['sourcePixelPosition']
 for i,(dx,dy) in enumerate([(0,-17),(17,0),(0,17),(-17,0)]):
  chair=next(o for o in objs if o['id']==table['id']+f'-chair-{i+1}')
  q=pt(x+dx,y+dy);chair['position']=[q[0],0,q[1]];chair['rotation']=math.atan2(dx,dy);chair.pop('sourcePixelPosition',None)
# Provide clearance around the newly evidenced upholstered circular seat.
for table in [o for o in objs if o['id'].startswith('day-tree-table-')]:
 x,y=table['sourcePixelPosition'];dx,dy=x-675,y-901;factor=(2.35*P)/math.hypot(dx,dy)
 sx,sy=dx*(factor-1),dy*(factor-1);idx=table['id'].split('-')[-1]
 for o in [table]+[o for o in objs if o['id'].startswith(f'day-tree-chair-{idx}-')]:
  o['position'][0]+=sx/P;o['position'][2]+=sy/P;o.pop('sourcePixelPosition',None);o.pop('sourcePixelFootprint',None)
  o['status']='photo-informed seating clearance / dimensions-estimated';o['notes']='Shifted radially around the photographed upholstered tree seat; precise offsets require measurement.'
# Actual west cabinetry. A clear opening remains at the passage shown in Photo 2.
for i,(y,length,variant) in enumerate([(788,27,'display'),(817,27,'lattice'),(850,37,'tv'),(889,29,'display'),(919,27,'lattice'),(988,30,'display'),(1023,36,'display'),(1060,27,'lattice')]):
 aid=f'photo-library-{i}';asset(aid,'library-bay',length/P,2.85,.42,'photo-lattice-blue',variant=variant)
 instance(f'day-library-bay-{i}',aid,533,y,'day',math.pi/2,room='day-open',refs=[photo_refs[2],photo_refs[3]],layer='architecture')
asset('photo-landscape-wall','landscape-screen',14.1,2.3,.18,'photo-landscape-red',{'middle':'photo-landscape-ochre','light':'photo-light','background':'photo-white'})
instance('day-landscape-wall','photo-landscape-wall',810,934,'day',-math.pi/2,1.05,'day-open',dr,'wall-finish')
m['details']=[d for d in m['details'] if not d['id'].startswith('planning-day-batten-')]
refRoom('day-open',dr,'Photographed fit-out: pale-blue tree seat, oak/blue lattice cabinetry on the west wall, lit landscape/slat wall and banquette on the east, cream armchairs and marble-look tables. Photos take priority; positions outside photo coverage remain registered to the plan.')
zones['day']['referencePages']=dr+[92,66,67];zones['day']['notes']=rooms['day-open']['notes']
asset('photo-day-duct','round-duct',.45,.45,14.8,'photo-silver')
for i,x in enumerate([558,785]):instance(f'day-hvac-duct-{i}','photo-day-duct',x,932,'day',0,4.25,'day-open',dr,'ceiling')
asset('photo-day-light','linear-light',.13,.36,14.1,'photo-white',{'light':'photo-led'})
for i,x in enumerate([573,636,711,776]):instance(f'day-linear-light-{i}','photo-day-light',x,932,'day',0,3.96,'day-open',dr,'ceiling')
asset('photo-timber-truss','timber-truss',14.15,2.08,.19,'photo-chair-wood')
for i,y in enumerate([786,834,882,930,978,1026,1074]):instance(f'day-timber-truss-{i}','photo-timber-truss',670,y,'day',0,4.05,'day-open',dr,'ceiling')
m['roofSections'][0]['structure']='components'
m['roofSections'][0]['referencePages']=dr+[19,66,67]

# Clinic counter, task seating, support equipment and visible treatment-room kit.
cr=[photo_refs[n] for n in [7,8,9,10,13]]
asset('photo-nurse-counter','nurse-station',3.55,1.05,4.25,'photo-quartz',{'wood':'oak','light':'photo-light'})
asset('photo-clinic-task-chair','mesh-chair',.59,1.03,.61,'photo-tan-mesh',{'frame':'photo-white','metal':'photo-silver'})
asset('photo-white-task-chair','mesh-chair',.58,.99,.60,'photo-mesh-white',{'frame':'photo-white','metal':'photo-white'})
asset('photo-clinic-casework','casework',2.55,2.2,.56,'photo-white',{'top':'photo-brown-counter','splash':'photo-white'},bays=4)
asset('photo-exam-recliner','exam-chair',.79,1.22,1.62,'photo-teal')
asset('photo-wood-slider','sliding-door',1.02,2.12,.12,'oak',{'metal':'photo-silver'})
remove(lambda o:o['id'].startswith('clinic-nurse-counter-'))
instance('clinic-photo-nurse-station','photo-nurse-counter',665,368,'clinic',0,room='clinic-nurse',refs=cr,layer='architecture')
for i,(x,y,r) in enumerate([(649,354,-math.pi/2),(678,358,math.pi/2),(667,389,0)]):instance(f'clinic-nurse-task-chair-{i}','photo-clinic-task-chair',x,y,'clinic',r,room='clinic-nurse',refs=cr)
component('clinic-red-cart',677,383,.48,.85,.46,'clinic','photo-red-cart',room='clinic-nurse',refs=[photo_refs[9],photo_refs[10]],layer='furniture')
component('clinic-printer',650,335,.56,.56,.52,'clinic','photo-white',elev=.71,room='clinic-nurse',refs=cr,layer='furniture')
component('clinic-printer-top',650,334,.48,.12,.36,'clinic','photo-black',elev=1.27,room='clinic-nurse',refs=cr,layer='furniture')
for i,(x,y,w,d) in enumerate([(665,321,3.8,.18),(629,369,.18,4.9),(701,369,.18,4.9),(665,418,3.8,.18)]):component(f'clinic-soffit-{i}',x,y,w,.42,d,'clinic','photo-blue-grey',elev=2.48,refs=cr,layer='ceiling')
for o in objs:
 if o['zoneId']=='clinic' and 'recliner' in o['id']:fit(o,'photo-exam-recliner');o['referencePages']=[photo_refs[15],92];o['notes']+=' Recliner family follows Exam Room 2; other rooms are not individually photographed.'
 if o['zoneId']=='clinic' and o['assetId']=='plan-clinical-chair':fit(o,'photo-dining-chair')
for i,y in enumerate([193.5,250.5,280,336,398,470.5]):
 instance(f'clinic-slider-{i+1}','photo-wood-slider',739,y,'clinic',-math.pi/2,room=f'clinic-exam-{i+1:02}',refs=[photo_refs[13],photo_refs[7]],layer='wall-finish')
asset('photo-clinic-ceiling','ceiling-grid',14.35,.045,20.2,'photo-white',{'light':'photo-led'})
instance('clinic-suspended-ceiling','photo-clinic-ceiling',669,350,'clinic',0,2.83,refs=cr,layer='ceiling')
refRoom('clinic-nurse',cr,'Photographed curved quartz and honey-wood nurse station, tan mesh task chairs, clinical cart, printer and blue-grey soffit. Plan footprint anchors this assembly; exact counter radii are estimated.')
zones['clinic']['referencePages']=cr+[photo_refs[15],92];zones['clinic']['notes']='Clinic finishes and nurse-station fit-out follow the photographs. Room boundaries retain the supplied plan. Numbered exam-room correspondence is recorded separately from stable trace IDs.'

# Reception and arrival: underlit rounded counter, mustard niche and moss/timber backdrop.
rr=[photo_refs[6]]
asset('photo-reception-long','quartz-counter',2.55,1.08,.66,'photo-quartz',{'wood':'oak','light':'photo-light'})
asset('photo-reception-return','quartz-counter',1.25,.75,.68,'photo-quartz')
remove(lambda o:o['id'] in ['reception-counter-0','reception-counter-1'])
instance('reception-quartz-desk','photo-reception-long',643,600,'lobby',-math.pi/2,room='lobby-arrival',refs=rr,layer='architecture')
instance('reception-accessible-return','photo-reception-return',647,621,'lobby',0,room='lobby-arrival',refs=rr,layer='architecture')
asset('photo-moss-screen','moss-screen',2.50,2.35,.16,'photo-moss')
instance('reception-moss-wall','photo-moss-screen',674,619,'lobby',-math.pi/2,.38,'lobby-arrival',rr,'wall-finish')
asset('photo-mustard-bench','bench',2.70,.88,.60,'photo-mustard')
instance('reception-mustard-bench','photo-mustard-bench',570,647,'lobby',math.pi,room='lobby-arrival',refs=rr,layer='architecture')
for i in range(23):component(f'reception-niche-slat-{i}',542+i*2.5,650,.032,2.65,.07,'lobby','oak',elev=.15,room='lobby-arrival',refs=rr,layer='wall-finish')
for i in range(11):component(f'reception-overhead-fin-{i}',650,594+i*2.8,2.8,.12,.055,'lobby','oak',elev=2.67,room='lobby-arrival',refs=rr,layer='ceiling')
refRoom('lobby-arrival',rr,'Reception desk, mustard bench/slat niche and moss wall follow Photo 6, registered within the plan arrival area. Fins, counter curves and furniture dimensions are estimated from the photo.')
zones['lobby']['referencePages']=rr+[92]

# Both meeting rooms: same user-confirmed yellow room fit-out, three white chairs.
ar=[photo_refs[18]]
asset('photo-meeting-table','meeting-table',1.20,.75,1.22,'photo-teal')
for i,(rid,x,left,right) in enumerate([('admin-meeting-west',965.5,936,1000),('admin-meeting-east',1033.3,1000,1067)]):
 r=rooms[rid];r['floorMaterial']='photo-carpet';refRoom(rid,ar,'User confirms both small administration meeting rooms match Photo 18. Yellow walls, wood table with teal pedestal, three white task chairs, display/video bar and whiteboard.')
 for o in objs:
  if o['id']==f'admin-meeting-table-{i}':fit(o,'photo-meeting-table');o['referencePages']=ar+[92]
  if o['id'].startswith(f'admin-meeting-chair-{i}-'):fit(o,'photo-white-task-chair');o['referencePages']=ar+[92]
 component(f'meeting-{i}-screen',x,888,1.22,.70,.045,'admin','screen',elev=.89,room=rid,refs=ar,layer='architecture')
 component(f'meeting-{i}-video-bar',x,887,0.48,.09,.06,'admin','photo-black',elev=1.61,room=rid,refs=ar,layer='architecture')
 component(f'meeting-{i}-whiteboard',left+2,919,.045,.92,1.30,'admin','photo-white',elev=1.01,room=rid,refs=ar,layer='wall-finish')
 for j,(xx,yy,ww,dd) in enumerate([(x,885,(right-left)/P,.035),(left+1,912,.035,56/P),(right-1,912,.035,56/P)]):component(f'meeting-{i}-yellow-wall-{j}',xx,yy,ww,2.62,dd,'admin','photo-yellow',room=rid,refs=ar,layer='wall-finish')
 for wall in m['walls']:
  if wall['zoneId']=='admin':
   mid=[(wall['a'][j]+wall['b'][j])/2 for j in [0,1]];px=mid[0]*P+OR[0];py=mid[1]*P+OR[1]
   if left-.5<=px<=right+.5 and 883<=py<=941:wall['material']='photo-yellow'

# Staff Lounge 1520 and the right-hand admin entry corridor: user-confirmed location.
staff=dict(id='admin-staff-lounge',name='Staff Lounge · 1520',zoneId='veranda',levelId='ground',polygon=rect(975,783,100,70),kind='staff-lounge',floorMaterial='tile',referencePages=[photo_refs[16],108,92],status='user-located / photograph fit-out',notes='User locates this lounge beside the stair going upstairs, between the stair and the lockers in the admin entry corridor. The nook matches the kitchenette above the stair in Overall Planning.jpg.')
m['rooms'].append(staff);rooms[staff['id']]=staff
rooms['east-service']['name']='Administration entry & locker corridor';rooms['east-service']['polygon']=[pt(1075,597),pt(1114,597),pt(1114,882),pt(973,882),pt(973,854),pt(1075,854)]
rooms['east-service']['referencePages']=[photo_refs[16],107,108,92];rooms['east-service']['notes']='Right-hand entry corridor into administration; user-confirmed locker location. Staff lounge is a separate nook beside the stair.'
zones['veranda']['name']='Staff lounge & admin entry';zones['veranda']['short']='Staff lounge, lockers & circulation';zones['veranda']['referencePages']=[photo_refs[16],107,108,92];zones['veranda']['notes']=staff['notes']
asset('photo-staff-casework','casework',3.0,2.28,.59,'photo-white',{'top':'photo-quartz','splash':'photo-teal-tile'},bays=5)
instance('staff-kitchenette','photo-staff-casework',1018,790,'veranda',0,room=staff['id'],refs=[photo_refs[16],108],layer='architecture')
component('staff-breakfast-counter',1025,846,2.95,.07,.44,'veranda','photo-quartz',elev=1.00,room=staff['id'],refs=[photo_refs[16],108],layer='architecture')
asset('photo-staff-stool','upholstered-chair',.42,1.02,.44,'photo-chair-wood',{'wood':'photo-chair-wood','metal':'photo-white'},seatHeightRatio=.65,arms=False)
for i,x in enumerate([1002,1017,1032,1047]):instance(f'staff-counter-stool-{i+1}','photo-staff-stool',x,834,'veranda',math.pi,room=staff['id'],refs=[photo_refs[16],108])
asset('photo-admin-lockers','locker-bank',5.85,2.16,.48,'oak',{'metal':'photo-black','white':'photo-white'},columns=18,tiers=2)
instance('admin-entry-locker-bank','photo-admin-lockers',1105,792,'veranda',-math.pi/2,room='east-service',refs=[107,photo_refs[16],108],layer='architecture',note='User-confirmed wall on the right entering administration, beside Staff Lounge 1520 and upstairs stair. Two tiers and handle/lock appearance follow photos; 18 repeated columns and total bank length are estimates.')
for i,(x,y,w,d) in enumerate([(1025,807,5.1,3.5),(1094,802,1.85,7.8)]):
 aid=f'photo-staff-ceiling-{i}';asset(aid,'ceiling-grid',w,.045,d,'photo-white',{'light':'photo-led'});instance(f'staff-ceiling-{i}',aid,x,y,'veranda',0,2.68,refs=[photo_refs[16],108],layer='ceiling')

# The paired multi-stall bathrooms beside OT/rehab and the day room.
br=[photo_refs[4],photo_refs[5]]
asset('photo-double-vanity','vanity',1.5,1.0,.55,'photo-quartz',basins=2)
for rid,ymin,ymax,vy in [('rehab-wc-east',810,944,922),('rehab-wc-south',973,1085,998)]:
 r=rooms[rid];r['name']='Shared multistall restroom · '+('north' if ymin==810 else 'south');r['floorMaterial']='photo-mosaic';refRoom(rid,br,'User confirms the paired men’s/women’s restrooms between OT/rehab and the day center. Both receive the photographed mosaic/teal tile, pale wood stall partitions and white double vanity. Gender assignment is not labeled on the supplied plan.')
 # Replace the two separate basin symbols with the photographed double vanity at the same wet-wall location.
 remove(lambda o:o['zoneId']=='rehab' and o['assetId']=='basin' and abs(o['position'][0]*P+OR[0]-499)<2 and ymin<o['position'][2]*P+OR[1]<ymax)
 instance(rid+'-double-vanity','photo-double-vanity',498,vy,'rehab',-math.pi/2,room=rid,refs=br,layer='architecture')
 component(rid+'-mirror',503,vy,.03,.96,1.60,'rehab','photo-silver',elev=1.08,room=rid,refs=br,layer='wall-finish')
 for k,x in enumerate([426,503]):
  component(rid+f'-tile-base-{k}',x,(ymin+ymax)/2,.03,1.12,(ymax-ymin-4)/P,'rehab','photo-white',room=rid,refs=br,layer='architecture')
  component(rid+f'-teal-band-{k}',x,(ymin+ymax)/2,.035,.35,(ymax-ymin-4)/P,'rehab','photo-teal-tile',elev=1.12,room=rid,refs=br,layer='wall-finish')
  component(rid+f'-floor-border-{k}',x+(-3 if k else 3),(ymin+ymax)/2,.11,.009,(ymax-ymin-4)/P,'rehab','photo-teal-tile',elev=.01,room=rid,refs=br,layer='architecture')
 for j,y in enumerate(([862,887,912] if ymin==810 else [994,1020,1045,1071])):
  component(rid+f'-stall-door-{j}',456 if ymin==810 else 458,y,.048,2.25,.80,'rehab','oak',elev=.13,room=rid,refs=br,layer='architecture')
  component(rid+f'-stall-handle-{j}',457 if ymin==810 else 459,y+5,.04,.027,.12,'rehab','photo-bronze',elev=1.03,room=rid,refs=br,layer='architecture')
 for wall in m['walls']:
  if wall['zoneId']=='rehab':
   px=(wall['a'][0]+wall['b'][0])/2*P+OR[0];py=(wall['a'][1]+wall['b'][1])/2*P+OR[1]
   if 425<px<481 and ymin+2<py<ymax-2:wall['material']='oak';wall['height']=2.38;wall['referencePages']=br+[92]
zones['rehab']['referencePages']=br+[92,110,111]

# Built street elevation: seven upper slit windows rather than the repeated two-story grid.
er=[110,111]
m['details']=[d for d in m['details'] if not d['id'].startswith('therapy-front-')]
for wall in m['walls']:
 if wall['id'] in ['plan-wall-214','plan-wall-215']:
  wall['height']=.52;wall['material']='photo-facade';wall['referencePages']=er+[92];wall['status']='photo-confirmed glazed frontage / sill height estimated'
def detail(id,x,y,width,height,depth,mat,elev=0,rotation=None,refs=er,surface='exterior'):
 q=pt(x,y);m['details'].append(dict(id=id,position=[q[0],elev,q[1]],dimensions=[width,height,depth],material=mat,surface=surface,rotation=rotation or [0,0,0],status='photograph geometry / heights estimated',referencePages=refs))
left,right=201,526;front=1125;total=(right-left)/P
# Solid spandrels and piers around separate glazing openings; no glazing buried behind a solid wall.
for i,(base,height) in enumerate([(0,.52),(2.76,.52),(5.02,1.18)]):detail(f'photo-therapy-spandrel-{i}',(left+right)/2,front,total,height,.24,'photo-facade',base)
for i in range(8):
 x=left+i*(right-left)/7;detail(f'photo-therapy-storefront-pier-{i}',x,front,.065,2.24,.18,'photo-silver',.52)
 if i<7:detail(f'photo-therapy-lower-glass-{i}',x+(right-left)/14,front,total/7-.07,2.24,.055,'glass',.52)
slits=[250+i*33 for i in range(7)];half=.22*P;last=left
for i,x in enumerate(slits):
 width=(x-half-last)/P
 detail(f'photo-therapy-upper-pier-{i}',(last+x-half)/2,front,width,1.74,.24,'photo-facade',3.28)
 detail(f'photo-therapy-slit-{i}',x,front,.44,1.74,.075,'glass',3.28)
 last=x+half
detail('photo-therapy-upper-pier-end',(last+right)/2,front,(right-last)/P,1.74,.24,'photo-facade',3.28)
for x in [205,524]:detail(f'photo-therapy-edge-{x}',x,front,.2,6.2,.24,'photo-facade')
for i in range(9):detail(f'photo-facade-wall-light-{i}',238+i*30,front+1,.25,.17,.19,'photo-facade',3.02)
for d in m['details']:
 if d['id'] in ['west-entry-canopy','west-entry-fascia'] or d['id'].startswith(('entry-rail-','entry-post-')):d['material']='photo-bronze';d['referencePages']=[109,92]
 if d['id']=='therapy-west':d['material']='photo-facade'
# Bronze horizontal rails visible in the supplied drop-off photograph.
for side,x in enumerate([491,523]):
 for j,h in enumerate([.47,.65,.83,1.02]):detail(f'photo-dropoff-horizontal-rail-{side}-{j}',x,626,.033,.03,180/P,'photo-bronze',h,refs=[109],surface='site')
# Bilingual architectural signs are text textures, independent of any photograph perspective.
def sign_image(name,text,color,background):
 if not Path('/System/Library/Fonts/STHeiti Medium.ttc').exists() and (REF/name).exists():return
 image=Image.new('RGB',(1600,210),background);draw=ImageDraw.Draw(image);font=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',92)
 b=draw.textbbox((0,0),text,font=font);draw.text(((1600-(b[2]-b[0]))/2,(210-(b[3]-b[1]))/2-b[1]),text,fill=color,font=font);image.save(REF/name)
sign_image('front-sign.png','SEEN HEALTH  见心颐养','#ffffff','#d8cbb6');mat('photo-sign-front','#ffffff',.6,textureUrl='/reference/photos/front-sign.png')
asset('photo-front-sign','sign',7.8,.98,.025,'photo-sign-front')
instance('valley-bilingual-sign','photo-front-sign',338,1128,'rehab',0,5.15,refs=er,layer='exterior')
sign_image('dropoff-sign.png','SEEN HEALTH  见心颐养','#ffffff','#6b5845');mat('photo-sign-dropoff','#ffffff',.6,textureUrl='/reference/photos/dropoff-sign.png')
asset('photo-dropoff-sign','sign',5.3,.55,.025,'photo-sign-dropoff')
instance('dropoff-bilingual-sign','photo-dropoff-sign',488,626,'lobby',-math.pi/2,2.82,refs=[109],layer='exterior')
sign_image('clinic-sign.png','CLINIC  医疗室','#225b39','#f5f3ea');mat('photo-sign-clinic','#ffffff',.6,textureUrl='/reference/photos/clinic-sign.png')
asset('photo-clinic-sign','sign',1.92,.36,.02,'photo-sign-clinic')
instance('clinic-entry-sign','photo-clinic-sign',719.5,555,'clinic',0,2.18,refs=[photo_refs[13]],layer='wall-finish')
asset('photo-clinic-entry-leaf','hinged-door',.94,2.12,.08,'oak',{'metal':'photo-silver'})
for i,(x,r) in enumerate([(706,-.65),(733,.65)]):instance(f'clinic-entry-door-{i+1}','photo-clinic-entry-leaf',x,548,'clinic',r,refs=[photo_refs[13],92],layer='wall-finish')
sign_image('reception-sign.png','见心颐养  SEEN HEALTH','#4e504e','#f4f2ea');mat('photo-sign-reception','#ffffff',.6,textureUrl='/reference/photos/reception-sign.png')
asset('photo-reception-sign','sign',1.72,.38,.02,'photo-sign-reception')
instance('reception-bilingual-sign','photo-reception-sign',635,600,'lobby',-math.pi/2,.67,refs=rr,layer='architecture')
m['facade']['referencePages']=er+[109]+m['facade']['referencePages'];m['facade']['wallMaterial']='photo-facade'
m['site']['referencePages']=[92,109,110,111];m['site']['notes']+=' Exterior photographs and the drone video document façade, entry and street-edge appearance; site dimensions remain plan-derived.'

# Evidence and uncertainty stay with the model so another center can replace the specification.
m['source'].update(title='Facility photographs, drone footage, Overall Planning and 2024 architectural presentation',author='Langdon Wilson architectural set · user-supplied facility media',date='Photos and room mapping supplied Sep 18, 2026',pages=111)
m['revision']='2026-09-18 / photographed facility and user-confirmed room mapping'
m['levels'][1]['referencePages']=[92]+dr+cr+ar+[photo_refs[16],109,110,111]
m['levels'][1]['notes']='Plan-based footprint with photographed finishes and visible furnishings. User confirms meeting rooms, staff lounge/lockers and paired restroom locations. Photographs take precedence over illustrated furniture.'
m['planningTrace']['furniturePolicy']='Photographs override depicted furniture where visible; plan positions retained where photographs provide no measurable alternative.'
m['planningTrace']['counts']['loungeChairs']=2
m['photoSurvey']=dict(date='2026-09-18',priority=['User-confirmed room locations','Photographed visible fit-out and furniture','Overall Planning for unobserved geometry','2024 architectural PDF'],references=list(range(93,112)),userConfirmed=['Both small admin meeting rooms use Photo 18','Staff Lounge 1520 beside upstairs stair and lockers','Locker bank on right-hand entry corridor into admin','Paired multistall restrooms beside OT/rehab and day center','Photographed arrangement takes precedence over the plan'],unresolved=['Exam room numbers versus stable clinic trace IDs','Measured horizontal dimensions and heights','Furniture outside photograph coverage','Exact locker module count and bank length','Which paired restroom is men’s versus women’s','Second-floor revisions and roof coverage'])
for issue in m['accuracyIssues']:
 if issue['id']=='furniture-schedule':issue.update(title='Measured furniture dimensions and unseen arrangements',detail='Visible colors, asset families and arrangements now follow facility photographs, including the tree seat, library, clinic counter, admin meeting rooms and staff lounge. Positions outside photo coverage retain the plan. Product models, exact dimensions and hidden furniture remain unverified.',pages=dr+cr+ar+[photo_refs[16]])
 if issue['id']=='room-schedule':issue['detail']='User confirmed both admin meeting rooms, Staff Lounge 1520/lockers and paired restrooms. Clinic room-number correspondence and men’s/women’s side assignment remain unconfirmed.';issue['pages']=ar+br+[photo_refs[16],photo_refs[15],92]
m['accuracyIssues'].append(dict(id='photo-coverage',title='Photograph coverage and estimated placement',detail='Images establish appearance and user-mapped areas, not survey measurements. The drone video covers the Valley Boulevard frontage only. Hidden roof surfaces, upper-floor interiors and unphotographed rooms remain provisional.',status='open',pages=[111,92]))
m['exportFiles']['audit']='/models/photo-update.md'
import importlib.util
_envelope_spec=importlib.util.spec_from_file_location('envelope',ROOT/'scripts/build-envelope.py')
_envelope_module=importlib.util.module_from_spec(_envelope_spec);_envelope_spec.loader.exec_module(_envelope_module)
_envelope_module.apply_envelope(m)
from plan_furniture import restore_plan_furniture
restore_plan_furniture(m,json.loads((OUT/'seen-alhambra-planning-base.json').read_text()))
(OUT/'seen-alhambra-planning.json').write_text(json.dumps(m,indent=2))
(REF/'source-manifest.json').write_text(json.dumps(dict(sourceRootDescription='User-supplied SGV Center media folder',assets=manifest),indent=2))
lines=['# Facility update — plan furniture restored', '', 'Furniture follows Overall Planning.jpg at the user’s latest direction. All 306 original plan instances have their original asset definitions, counts, positions, rotations and scales. Photographs remain available as references and continue to inform architectural finishes.', '', '## Changes', '', '- Day room: diamond-oriented square tables and chairs, original tree and surrounding table locations, west banquette, four lounge chairs and two small lounge tables.', '- Clinic and reception: original plan counters, seats and equipment. Photo-only furniture and replacement counter assemblies are removed.', '- Administration: plan meeting tables and chairs. Photo-only staff stools, counters, kitchenette, lockers and meeting screens are removed; user-confirmed room locations are retained.', '- Restrooms: plan plumbing fixture positions restored; photographed partitions, tile and mirrors retained.', '- Building: completed rear and side walls, stepped roofs, doors, architectural finishes and all viewing controls retained.', '- All 18 photos and the drone video remain in the source library.', '', '## Accuracy', '', 'Furniture matches the saved trace of the supplied plan. Physical scale still uses the stated clinic area; the plan is not a dimensioned survey. Hidden elevations, upper-floor interiors and estimated heights retain their existing uncertainty labels.', '', '## Portable components', '', 'Furniture, materials, walls and openings remain separate JSON definitions. Rebuild with build-planning.py, then build-photo-update.py; the final plan_furniture.py step enforces the latest furniture authority while retaining the envelope. GLB export includes the complete building.', '', '## Room-by-room evidence', '', '| Space | Source | Update |', '|---|---|---|']
for r in m['rooms']:
 refs=[x for x in r['referencePages'] if x>=93]
 if refs:lines.append(f'| {r["name"]} | '+', '.join(next(p['label'] for p in m['referencePages'] if p['page']==x) for x in refs)+f' | {r["notes"]} |')
(OUT/'photo-update.md').write_text('\n'.join(lines)+'\n');(ROOT/'MODEL_NOTES.md').write_text('\n'.join(lines[:lines.index('## Room-by-room evidence')])+'\n')
print(f'Photo model: {len(m["rooms"])} spaces, {len(m["objects"])} instances, {len(m["referencePages"])} references; 18 photos + 1 video.')

envelope_notes='\n## Complete building shell\n\nThe registered main building and adjoining wing now have two closed perimeter loops, including the clinic east face, rear service-room setbacks, side walls, west drop-off wall and admin stair projection. Roof slabs follow the stepped plan, with raised roof junction walls and curved barrel end closures. Documented door/window locations are retained; rear elevation heights and unseen finishes remain inferred.\n\nWhole building and Rear views show the assembled shell. Cutaway, per-area isolation, levels and adjustable section planes reveal the interior. JSON stores walls, openings, profiles and source evidence; GLB export always includes the full assembled geometry, independent of section controls.\n'
for _file in [OUT/'photo-update.md',ROOT/'MODEL_NOTES.md']:_file.write_text(_file.read_text()+envelope_notes)

# The September 19 upstairs request is scoped separately from ground-floor furniture.
_fitout_spec=importlib.util.spec_from_file_location('upstairs_fleet',ROOT/'scripts/apply-upstairs-fleet.py')
_fitout_module=importlib.util.module_from_spec(_fitout_spec);_fitout_spec.loader.exec_module(_fitout_module)
_fitout_module.apply_update(m)
(OUT/'seen-alhambra-planning.json').write_text(json.dumps(m,indent=2)+'\n')
_followup_note='\n## September 19 follow-up\n\nUpstairs administration now includes a photo-informed open office, conference room, storage, restroom and lift landing. Placement and dimensions remain estimated. Both static Van A/B models use the final supplied wrap sheet. Staff clothing uses solid colors and the supplied cut without ginkgo printing. The September 20 update adds 34 animated 3D people across 12 roles in a controllable six-minute loop, plus 3D street context. Three generalized Orbit-informed journeys retain separate guided playback and room focus. See [the animation audit](public/models/animation-update.md). See [the upstairs and fleet audit](public/models/upstairs-fleet-update.md).\n'
(ROOT/'MODEL_NOTES.md').write_text((ROOT/'MODEL_NOTES.md').read_text()+_followup_note)

# The latest seven-photo request supersedes the older blanket furniture reset.
from importlib.util import spec_from_file_location, module_from_spec
_review_spec=spec_from_file_location("interior_photos",ROOT/"scripts/apply-interior-photos.py")
_review_module=module_from_spec(_review_spec);_review_spec.loader.exec_module(_review_module)
m=_review_module.apply_update(m)
(OUT/"seen-alhambra-planning.json").write_text(json.dumps(m,indent=2)+"\n")
