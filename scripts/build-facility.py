"""Reproducibly transcribe the supplied 2024 presentation into the portable facility format.
Pixel coordinates below are provenance, converted once to SI units in the output.
"""
import json, math, re, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
# Calibration anchor: visible clinic perimeter on PDF page 12, published department area on p.14.
PPM=math.sqrt((224*310)/(3254*0.09290304))
ORIGIN=(785,597)
def pt(p):return [round((p[0]-ORIGIN[0])/PPM,5),round((p[1]-ORIGIN[1])/PPM,5)]
def rect(x,y,w,h):return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
def area(poly):return abs(sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))/2)
levels=[
 dict(id='basement',name='Basement',elevation=-3.2,order=0,referencePages=[13,16],elevationStatus='inferred',notes='6,191 sq ft stated; basement perimeter follows the visible stacking diagram. No dimensioned basement plan or internal room schedule is supplied.'),
 dict(id='ground',name='Ground floor',elevation=0,order=1,referencePages=[12,14,17,26],elevationStatus='datum',notes='Ground floor is the model elevation datum. Horizontal scale is calibrated from the clinic area, not surveyed dimensions.'),
 dict(id='upper',name='Mezzanine / second floor',elevation=3.35,order=2,referencePages=[15,18],elevationStatus='inferred',notes='Equipment mezzanine and future office footprints are shown. Their floor elevations and proposed second-floor modifications are not supplied.'),
 dict(id='roof',name='Roof',elevation=6.4,order=3,referencePages=[19,20,66,67],elevationStatus='inferred',notes='Roof form follows the stacking diagram and day-room sections. Roof, parapet, and equipment heights remain inferred.'),
]
zones=[]
def zone(id,name,short,color,poly,level='ground',refs=None,floor='tile',notes='',sf=None,program=None,height=2.9):
 zones.append(dict(id=id,name=name,short=short,color=color,levelId=level,polygon=[pt(p) for p in poly],referencePages=refs or [12],floorMaterial=floor,notes=notes,publishedAreaSqFt=sf,programId=program or id,wallHeight=height,wallHeightStatus='documented-finish-datum' if id=='day' else 'inferred',geometryStatus='image-traced',spread=pt([(sum(p[0] for p in poly)/len(poly)-785)*.45+785,(sum(p[1] for p in poly)/len(poly)-597)*.45+597])))
zone('clinic','Clinic','Exams, consultation & nursing','#36a9a0',rect(562,226,224,310),refs=list(range(40,60)),floor='vinyl',sf=3254,notes='Clinic perimeter calibrated to 3,254 sq ft. Six numbered exam rooms are visible. Rooms 1110, 1111, 1129 and 1130 are named in the presentation; exact numeric locations of all rooms are not recoverable from the compressed floor plan.')
zone('rehab','Physical therapy','Mobility & rehabilitation','#9bb668',rect(317,694,245,274),refs=list(range(60,66)),floor='sports',program='therapy',notes='Southwest therapy wing, with treatment bays, therapy equipment, personal-care rooms and mezzanine above. Published 3,080 sq ft is shared with the rear PT/OT program; it is not a gross footprint for this rectangle.',height=4.8)
zone('ot','Rear PT / OT & support','Therapy and supporting rooms','#d8ac50',[[786,335],[960,335],[960,378],[1012,378],[1012,536],[786,536]],refs=[12,14,17],floor='vinyl',program='therapy',notes='Zone 02 also appears at the rear of the ground-floor stacking diagram. Individual support-room names and zone boundaries need the room schedule.')
zone('lobby','Lobby & reception','Arrival & connections','#a9b8a0',[[562,536],[786,536],[786,674],[608,674],[608,694],[562,694]],refs=list(range(28,35)),floor='tile',program='back-house',notes='Reception, enclosed offices and support rooms traced from the final overhead plan. Overall 3,150 sq ft lobby/back-of-house program includes other circulation and support rooms.')
zone('hall','East hallway','Connecting the center','#a9b8a0',rect(786,536,226,32),refs=list(range(35,40)),floor='tile',program='back-house',notes='Hallway 1010. Storage cubbies, handrail, doors, tiled floor and suspended ceiling are shown in the elevations and perspectives.')
zone('day','Day room','Community, activity & gathering','#5f94bc',[[562,694],[608,694],[608,674],[786,674],[786,940],[562,940]],refs=list(range(66,77)),floor='wood',sf=3665,program='day-space',height=3.6576,notes='3,665 sq ft is the published dayroom/memory-care program, not this single polygon. Page 66–67 explicitly dimensions the wall treatment datum at 12 ft, with a 4 ft lower band and 8 ft upper field. Roof crown above is inferred.')
zone('dining','Dining · 1421','Shared meals','#aa89bd',[[786,568],[906,568],[906,677],[859,677],[859,700],[786,700]],refs=list(range(77,84)),floor='wood',sf=815,notes='Dining room 1421. Tables, display wall, kitchen service opening, lattice divider and green doors are shown. Furniture counts vary across views; plan placement is used.')
zone('kitchen','Kitchen','Preparation & service','#ae9478',[[906,568],[984,568],[984,710],[859,710],[859,677],[906,677]],refs=[12,14,26,77,78,81],floor='tile',sf=638,notes='Kitchen is separate from dining and totals 638 sq ft in the area schedule. Internal equipment specifications are not supplied; visible counters are traced from page 12.')
zone('veranda','Veranda / east edge','Indoor–outdoor connection','#68a99b',rect(984,568,28,256),refs=[7,12,17],floor='pattern',program='day-space',notes='The east-edge connection is visible on the overall plan. Page 7 is a mood board, not an as-built perspective. Detailed enclosure and seating require confirmation.')
zone('admin','Administration','Workspaces & meeting rooms','#ce8c9d',[[786,700],[859,700],[859,710],[984,710],[984,824],[1012,824],[1012,968],[786,968]],refs=list(range(84,92)),floor='carpet',sf=2716,notes='Shared workstations, offices, stairs and meeting rooms follow the final plan. Source perspectives establish glazed meeting fronts, light timber desks and dark carpet.')
zone('adjacent','Adjacent building','Context shell','#90a1a7',rect(1012,614,218,354),refs=[12,17,19],floor='concrete',notes='Adjacent building is visible with its roof in the final set. This document supplies no interior fit-out. It is retained as a context shell; the 2023 future-expansion label is no longer treated as a current room program.',height=6.4)
zone('basement','Basement','Below-ground shell','#bf9a63',[[786,335],[960,335],[960,378],[1012,378],[1012,968],[786,968]],'basement',[13,16],'concrete','6,191 sq ft stated. No basement room layout, openings, access details or height are supplied; the model contains a perimeter shell only.',6191,height=2.7)
zone('mezzanine','Equipment mezzanine','Upper therapy level','#70aaa1',[[317,694],[382,694],[382,916],[562,916],[562,968],[317,968]],'upper',[15,18,60,61,62,63,64,65],'concrete','1,267 sq ft stated. L-shaped extent follows the upper-level diagram. Exact edge offsets, structure, height and equipment are unverified.',1267,height=1.1)
zone('upper-office','Future office space','Second-floor baseline','#6c87ba',rect(786,700,226,268),'upper',[15,18],'concrete','2,885 sq ft stated. Unfitted shell only. User-mentioned second-floor changes remain pending; no proposed offices or furniture have been invented.',2885,height=2.9)
# Room registry: visible enclosures, with internal trace IDs used wherever the compressed plan does not establish a room number.
rooms=[]
def room(id,name,z,box_,pages=None,kind='room',status='image-traced',notes='Room number and clear dimensions need the dimensioned room schedule.'):
 poly=rect(*box_) if len(box_)==4 and isinstance(box_[0],(int,float)) else box_
 rooms.append(dict(id=id,name=name,zoneId=z,levelId=next(a['levelId'] for a in zones if a['id']==z),polygon=[pt(p) for p in poly],kind=kind,referencePages=pages or [12],status=status,notes=notes))
for i,(top,bot) in enumerate([(226,267),(267,301),(301,347),(347,378),(378,410),(410,454),(454,490),(490,536)]):room(f'clinic-west-{i+1:02}',f'West clinical room {i+1:02}','clinic',[562,top,56,bot-top],[12,40,41,42])
for i,(top,bot) in enumerate([(226,270),(270,314),(314,357),(357,404),(404,455),(455,500)]):room(f'clinic-exam-{i+1:02}',f'Exam room {i+1:02}','clinic',[724,top,62,bot-top],[12,43,44,55,56,58,59],notes='Six numbered exam doors shown in p.44. Number-to-plan ordering remains to be confirmed; stable IDs do not assert architectural room numbers.')
for id,name,b in [('center-n1','Central clinical room N1',[647,253,48,44]),('center-n2','Central clinical room N2',[647,299,48,47]),('nurse','Nurse station',[647,360,48,67]),('center-s1','Central clinical room S1',[647,449,50,33]),('center-s2','Central clinical room S2',[647,483,50,53]),('south-east','Clinical support room SE',[724,500,62,36])]:room('clinic-'+id,name,'clinic',b,[12,40,41,42,45,46,47,48,49,50,51,52],kind='nursing' if id=='nurse' else 'room')
for i,b in enumerate([[786,335,74,43],[786,378,74,43],[884,335,76,43],[884,378,76,43],[786,421,54,38],[786,459,58,77],[864,459,57,77],[960,421,52,63],[960,484,52,52],[884,421,36,38]]):room(f'ot-support-{i+1:02}',f'Rear therapy / support {i+1:02}','ot',b,[12,14,17],notes='Visible enclosure. Program is inferred from the zone diagram; individual room use is not labeled legibly.')
room('ot-stair','Rear stair','ot',[860,335,24,86],[12,17,18],kind='stair')
for id,name,b in [('office-w1','Reception-side office W1',[562,610,44,36]),('office-w2','Reception-side office W2',[562,646,44,48]),('office-c1','Reception-side office C1',[681,563,67,52]),('office-c2','Reception-side office C2',[639,615,109,59]),('support-1','Lobby support room 1',[748,568,38,41]),('support-2','Lobby support room 2',[748,609,38,42])]:room('lobby-'+id,name,'lobby',b,[12,28,29,30])
room('lobby-arrival','Reception & arrival','lobby',[[562,536],[786,536],[786,563],[681,563],[681,615],[606,615],[606,694],[562,694]],[12,28,29,30,31,32,33,34],kind='circulation',notes='Open reception zone. Footprint is explanatory rather than a measured room boundary.')
room('hall-1010','East hallway · 1010','hall',[786,536,226,32],list(range(35,40)),kind='circulation',notes='Room number 1010 appears in the source headings.')
for i,b in enumerate([[317,694,57,70],[317,764,48,70],[444,736,42,37],[444,773,42,61],[488,736,62,48],[488,784,62,50],[488,850,62,94],[317,836,72,58]]):room(f'rehab-support-{i+1:02}',f'Therapy / personal-care room {i+1:02}','rehab',b,[12,60,61,65],notes='Enclosure visible in the final plan. Plumbing fixtures and treatment functions are interpreted from symbols; room names are not legible.')
room('rehab-floor','Physical therapy floor','rehab',[[374,731],[444,731],[444,834],[488,834],[488,944],[562,944],[562,968],[317,968],[317,894],[389,894],[389,836],[365,836],[365,764],[374,764]],list(range(60,66)),kind='activity',notes='Treatment tables, parallel bars, bikes, training steps and sports flooring shown in pp.62–65. Individual equipment models and exact dimensions are missing.')
room('day-main','Day room / tree lounge','day',[[562,694],[608,694],[608,674],[786,674],[786,940],[562,940]],list(range(66,77)),kind='activity',notes='12 ft wall treatment height documented. Table positions use the plan; renderings use different chair variants.')
room('dining-1421','Dining · 1421','dining',[[786,568],[906,568],[906,677],[859,677],[859,700],[786,700]],list(range(77,84)),kind='dining',notes='Room number 1421 explicitly documented. Published area 815 sq ft.')
room('kitchen-main','Kitchen','kitchen',[[906,568],[984,568],[984,710],[859,710],[859,677],[906,677]],[12,14,77,78,81],kind='kitchen',notes='Published area 638 sq ft. Kitchen equipment schedule absent.')
room('veranda-edge','Veranda / east circulation','veranda',[984,568,28,256],[7,12,17],kind='circulation')
for i,b in enumerate([[786,700,73,71],[786,771,47,43],[786,814,47,40],[786,854,47,48],[877,786,55,44],[932,786,52,44],[833,710,73,53],[906,712,78,51],[890,903,122,65],[833,832,151,69]]):room(f'admin-{i+1:02}',f'Administration room {i+1:02}','admin',b,list(range(84,92)),kind='meeting' if i in [8] else 'office',notes='Visible plan enclosure. Architectural room number is not provided in this presentation.')
room('admin-stair','Administration stair','admin',[859,763,83,23],[12,18],kind='stair')
for a in zones:
 if a['id'] in ['basement','mezzanine','upper-office','adjacent']:rooms.append(dict(id=a['id']+'-shell',name=a['name'],zoneId=a['id'],levelId=a['levelId'],polygon=a['polygon'],kind='shell',referencePages=a['referencePages'],status='incomplete',notes=a['notes']))
# Explicit segmented walls preserve visible openings, rather than closing every room rectangle.
walls=[]
def wall(z,x1,y1,x2,y2,h=None,status='image-traced'):
 a=next(a for a in zones if a['id']==z);walls.append(dict(id=f'wall-{len(walls)+1:03}',zoneId=z,levelId=a['levelId'],a=pt([x1,y1]),b=pt([x2,y2]),height=h or a['wallHeight'],thickness=.15,material='wall',status=status,referencePages=[12]))
def segments(z,ls):
 for s in ls:wall(z,*s)
segments('clinic',[[562,226,786,226],[562,226,562,536],[786,226,786,536]])
for yy in [267,301,347,378,410,454,490,536]:segments('clinic',[[562,yy,603,yy],[615,yy,618,yy]])
for a,b in [(226,254),(267,288),(301,334),(347,365),(378,397),(410,441),(454,477),(490,521)]:wall('clinic',618,a,618,b)
for yy in [270,314,357,404,455,500,536]:segments('clinic',[[724,yy,751,yy],[765,yy,786,yy]])
for a,b in [(226,257),(270,301),(314,344),(357,391),(404,442),(455,487),(500,523)]:wall('clinic',724,a,724,b)
segments('clinic',[[647,253,647,297],[647,253,688,253],[647,297,695,297],[695,253,695,279],[647,299,647,346],[647,346,695,346],[695,318,695,346],[647,360,647,427],[647,360,680,360],[695,373,695,427],[647,449,697,449],[647,449,647,536],[647,482,697,482],[697,449,697,465],[697,499,697,536],[647,536,681,536]])
segments('ot',[[786,335,960,335],[960,335,960,421],[960,378,1012,378],[1012,378,1012,536],[786,378,860,378],[860,335,860,421],[884,335,884,421],[786,421,904,421],[920,421,1012,421],[786,459,823,459],[835,459,844,459],[844,459,844,536],[864,459,921,459],[864,459,864,536],[921,459,921,514],[960,421,960,469],[960,484,1012,484],[960,502,960,536],[786,536,823,536],[840,536,879,536],[900,536,969,536],[987,536,1012,536]])
segments('lobby',[[562,536,562,610],[562,610,606,610],[562,646,593,646],[606,610,606,635],[606,651,606,694],[681,563,748,563],[681,563,681,598],[681,615,748,615],[639,615,639,674],[639,674,719,674],[748,563,748,595],[748,612,748,674],[748,609,786,609],[748,651,776,651],[562,694,588,694],[601,694,608,694]])
segments('hall',[[786,568,820,568],[841,568,906,568],[925,568,984,568],[1012,536,1012,555]])
segments('rehab',[[317,694,374,694],[317,694,317,968],[317,968,562,968],[562,944,562,968],[317,764,352,764],[365,731,365,834],[374,694,374,716],[414,694,562,694],[414,694,414,731],[414,731,444,731],[444,731,444,834],[444,736,550,736],[486,736,486,834],[444,773,472,773],[486,784,535,784],[444,834,550,834],[550,736,550,834],[488,850,550,850],[488,850,488,913],[488,928,488,944],[488,944,550,944],[550,850,550,944],[317,836,352,836],[367,836,389,836],[389,836,389,881],[317,894,368,894],[562,694,562,909],[562,927,562,944]])
segments('day',[[562,940,584,940],[607,940,653,940],[696,940,741,940],[766,940,786,940],[786,700,786,940],[562,731,562,909]])
segments('dining',[[786,568,786,655],[786,678,786,700],[906,568,906,648],[906,667,906,677],[859,677,906,677],[859,677,859,700],[786,700,859,700]])
segments('kitchen',[[984,568,984,710],[906,568,969,568],[859,710,984,710]])
segments('veranda',[[1012,568,1012,647],[1012,674,1012,734],[1012,761,1012,824]])
segments('admin',[[786,700,859,700],[786,700,786,968],[786,968,830,968],[852,968,1012,968],[1012,824,1012,968],[786,771,819,771],[833,771,833,854],[786,814,818,814],[786,854,819,854],[833,867,833,902],[786,902,833,902],[859,710,859,763],[859,763,926,763],[943,763,984,763],[877,786,984,786],[877,786,877,816],[877,830,984,830],[932,786,932,814],[984,786,984,830],[890,903,1012,903],[890,903,890,927],[890,946,890,968]])
for zid in ['basement','upper-office','adjacent']:
 a=next(a for a in zones if a['id']==zid)
 for i,p in enumerate(a['polygon']):
  q=a['polygon'][(i+1)%len(a['polygon'])];walls.append(dict(id=f'wall-{len(walls)+1:03}',zoneId=zid,levelId=a['levelId'],a=p,b=q,height=a['wallHeight'],thickness=.2,material='concrete' if zid=='basement' else 'wall',status='inferred-perimeter',referencePages=a['referencePages']))
assets={
 'chair':dict(kind='chair',dimensions=[.53,.87,.57],material='chair'),
 'table':dict(kind='table',dimensions=[.82,.75,.82],material='table'),
 'desk':dict(kind='desk',dimensions=[1.5,.74,.7],material='oak'),
 'exam-chair':dict(kind='exam-chair',dimensions=[.72,1.22,1.55],material='clinical-blue'),
 'therapy-bed':dict(kind='therapy-bed',dimensions=[.85,.77,1.95],material='clinical-blue'),
 'counter':dict(kind='counter',dimensions=[1.6,.91,.61],material='oak'),
 'toilet':dict(kind='toilet',dimensions=[.46,.74,.69],material='porcelain'),
 'basin':dict(kind='basin',dimensions=[.6,.85,.5],material='porcelain'),
 'tree':dict(kind='tree',dimensions=[3.9,4.8,3.9],material='leaf'),
 'planter':dict(kind='planter',dimensions=[.65,1.65,.65],material='leaf'),
 'bench':dict(kind='bench',dimensions=[2,.88,.66],material='blue'),
 'shelf':dict(kind='shelf',dimensions=[2,2.5,.35],material='oak'),
 'parallel-bars':dict(kind='parallel-bars',dimensions=[.8,1.05,3],material='metal'),
 'bike':dict(kind='bike',dimensions=[.65,1.3,1.2],material='metal'),
 'steps':dict(kind='steps',dimensions=[1.4,1.25,2.2],material='oak'),
 'stair':dict(kind='stair',dimensions=[1.2,3.35,4.8],material='concrete'),
 'refrigerator':dict(kind='box',dimensions=[.85,1.9,.78],material='metal'),
 'cabinet':dict(kind='cabinet',dimensions=[1.6,.75,.36],material='cabinet'),
 'screen':dict(kind='screen',dimensions=[1.4,.8,.06],material='screen'),
 'car':dict(kind='car',dimensions=[1.85,1.5,4.4],material='car'),
 'van':dict(kind='car',dimensions=[2.05,2.45,5.6],material='porcelain'),
}
objects=[]
def obj(asset,x,y,zid,rot=0,scale=None,elev=0,roomId=None,notes=None):
 a=next((a for a in zones if a['id']==zid),None);p=pt([x,y]);objects.append(dict(id=f'{zid}-{asset}-{len(objects)+1:04}',assetId=asset,zoneId=zid,levelId=a['levelId'] if a else 'site',position=[p[0],elev,p[1]],rotation=rot,scale=scale or [1,1,1],roomId=roomId,referencePages=(a['referencePages'] if a else [12,21,22,23,24,25]),status='image-traced-position / inferred-geometry',notes=notes or 'Procedural placeholder; replace asset model when the manufacturer specification is available.'))
def table(x,y,zid,angle=0):
 obj('table',x,y,zid,angle)
 for dx,dz,r in [(0,11,0),(0,-11,math.pi),(11,0,-math.pi/2),(-11,0,math.pi/2)]:
  xx=dx*math.cos(angle)+dz*math.sin(angle);zz=-dx*math.sin(angle)+dz*math.cos(angle);obj('chair',x+xx,y+zz,zid,angle+r)
# Clinical furnishings mirror the final plan instead of copying the earlier presentation.
for i,(x,y) in enumerate([(750,246),(749,292),(750,335),(750,381),(750,430),(750,478)]):
 rid=f'clinic-exam-{i+1:02}';obj('exam-chair',x,y,'clinic',-.45,roomId=rid);obj('counter',778,y+8,'clinic',math.pi/2,scale=[.65,1,1],roomId=rid);obj('cabinet',778,y+8,'clinic',math.pi/2,scale=[.65,1,1],elev=1.4,roomId=rid);obj('chair',769,y+17,'clinic',roomId=rid)
for y in [244,283,323,365,394,470]:obj('desk',578,y,'clinic',scale=[.8,1,.85]);obj('chair',589,y+10,'clinic')
for y in [433,513]:table(588,y,'clinic')
for y in [275,324,461,509]:obj('desk',667,y,'clinic',scale=[1.1,1,1]);obj('chair',673,y+11,'clinic')
obj('counter',672,370,'clinic',scale=[1.65,1,1]);obj('counter',651,397,'clinic',math.pi/2,scale=[1.6,1,1]);obj('counter',682,424,'clinic',scale=[.6,1,1])
# Day-room table centers and orientation from the final overhead plan.
for x,y in [(636,732),(672,732),(709,732),(641,778),(706,778),(641,819),(706,819),(637,856),(673,856),(709,856),(637,897),(673,897),(709,897)]:table(x,y,'day',math.pi/4)
obj('tree',674,794,'day')
for y in [730,769,808,847,886,920]:obj('bench',779,y,'day',math.pi/2,scale=[1.12,1,1]);obj('table',765,y,'day',scale=[.8,1,1.15]);obj('chair',752,y,'day',math.pi/2)
obj('table',604,786,'day',scale=[1,1,4.8]);
for y in [759,772,785,798,811]:obj('chair',592,y,'day',math.pi/2);obj('chair',616,y,'day',-math.pi/2)
for x,y in [(585,858),(585,886),(585,914)]:obj('chair',x,y,'day')
obj('shelf',567,780,'day',math.pi/2,scale=[1.8,1,1]);obj('screen',566,870,'day',math.pi/2,elev=1.65);obj('planter',637,925,'day')
# Dining: positions shown on p.12. No claim is made that chairs in every perspective have the same specification.
for x,y in [(822,592),(866,592),(822,632),(866,632),(822,671)]:table(x,y,'dining',math.pi/4)
obj('screen',847,571,'dining',elev=1.7)
for x,y,w,d in [(948,575,2.9,.6),(972,644,3.7,.65),(942,641,2.8,.7),(895,700,2.1,.6)]:obj('counter',x,y,'kitchen',math.pi/2 if d==.65 else 0,scale=[w/1.6,1,d/.61])
obj('refrigerator',960,695,'kitchen')
# Therapy equipment and surrounding treatment/personal-care rooms.
for x,y in [(412,866),(453,867),(420,818)]:obj('therapy-bed',x,y,'rehab',math.pi/2)
obj('parallel-bars',363,920,'rehab');obj('steps',381,865,'rehab');
for y in [747,777]:obj('bike',398,y,'rehab')
obj('desk',336,784,'rehab',scale=[.7,1,1]);obj('counter',337,705,'rehab',scale=[1.7,1,1])
for x,y in [(461,753),(504,759),(461,805),(511,808),(510,884),(511,923)]:obj('toilet',x,y,'rehab')
for y in [871,920]:obj('basin',540,y,'rehab',math.pi/2)
obj('stair',334,864,'rehab',scale=[1,1,.7]);obj('planter',336,947,'rehab')
# Rear PT/OT and service enclosures.
for x,y in [(808,495),(892,495)]:obj('therapy-bed',x,y,'ot');obj('chair',x+18,y+18,'ot')
for x,y in [(807,356),(808,397),(937,396)]:obj('counter',x,y,'ot',scale=[1.3,1,1])
for x,y in [(978,443),(978,510),(901,438)]:obj('toilet',x,y,'ot')
obj('stair',872,378,'ot',scale=[1,1,1.1])
# Reception, offices, cubbies and waiting benches.
obj('counter',654,587,'lobby',math.pi/2,scale=[1.5,1.15,1]);obj('counter',663,607,'lobby',scale=[.9,1.15,1]);
for y in [628,671]:obj('desk',579,y,'lobby',scale=[.7,1,1]);obj('chair',587,y+8,'lobby')
for x,y in [(715,584),(697,645)]:obj('desk',x,y,'lobby');obj('chair',x,y+11,'lobby')
obj('bench',607,543,'lobby',scale=[1.8,1,1]);obj('shelf',811,540,'hall',scale=[1.5,.65,1]);obj('shelf',917,540,'hall',scale=[1.5,.65,1])
for y in [589,629]:obj('toilet',767,y,'lobby')
# Administration: two facing workstation rows and south meeting room.
for x in [863,886,909,932,955,978]:obj('desk',x,860,'admin',scale=[.92,1,1]);obj('chair',x,875,'admin');obj('desk',x,850,'admin',math.pi,scale=[.92,1,1]);obj('chair',x,836,'admin',math.pi)
for x,y in [(806,725),(807,871),(902,806),(957,806)]:obj('desk',x,y,'admin',scale=[.85,1,1]);obj('chair',x,y+12,'admin')
obj('table',950,934,'admin',scale=[6.6,1,1.5]);
for x in [912,930,948,966,984]:obj('chair',x,949,'admin');obj('chair',x,918,'admin',math.pi)
obj('screen',997,935,'admin',-math.pi/2,elev=1.7);obj('stair',899,774,'admin',math.pi/2,scale=[1,1,1.1]);
for y in [792,833]:obj('toilet',807,y,'admin')
for x,y in [(248,436),(247,914),(424,987),(761,971),(1411,242),(1170,429),(1035,455),(1262,923)]:obj('planter',x,y,'site',scale=[3,2.3,3])
for x,y,rot in [(350,259,math.pi/2),(347,368,math.pi/2),(501,299,.9),(501,398,.9),(1060,314,.4),(1398,430,.5),(1390,711,.5),(1345,838,.5)]:obj('car',x,y,'site',rot)
obj('van',449,611,'site',.22)
materials={
 'wall':dict(color='#f2efdf',roughness=.85),'tile':dict(color='#dddccf',roughness=.62,pattern='tile'),'vinyl':dict(color='#c6d0c7',roughness=.75),
 'wood':dict(color='#cba773',roughness=.65,pattern='herringbone'),'sports':dict(color='#cc995f',roughness=.66,pattern='plank'),'carpet':dict(color='#6a665e',roughness=1,pattern='carpet'),
 'pattern':dict(color='#d0d3c9',roughness=.8,pattern='pattern'),'concrete':dict(color='#c5c8c2',roughness=.95),'oak':dict(color='#c4a075',roughness=.6,pattern='plank'),
 'chair':dict(color='#ece2c5',roughness=.75),'table':dict(color='#f4f2e7',roughness=.38),'clinical-blue':dict(color='#75a0bc',roughness=.8),'blue':dict(color='#39789e',roughness=.8),
 'metal':dict(color='#b2bbb8',roughness=.4,metalness=.6),'porcelain':dict(color='#eeeedd',roughness=.32),'leaf':dict(color='#477c47',roughness=1),'cabinet':dict(color='#e3e3d6',roughness=.5),'screen':dict(color='#14252b',roughness=.4),'car':dict(color='#728b96',roughness=.38,metalness=.35),
}
# Every page is preserved with its visible text and page-specific findings. Mood boards remain explicitly separate from final renderings.
source_text=subprocess.check_output(['pdftotext','-layout',str(ROOT/'public/reference/final/source.pdf'),'-'],text=True).split('\f')
def pagegroup(n):
 if n<=11:return 'Design language'
 if n<=19:return 'Building & levels'
 if n<=25:return 'Exterior & streets'
 if n<=27:return 'Materials'
 if n<=34:return 'Lobby'
 if n<=39:return 'East hallway'
 if n<=59:return 'Clinic'
 if n<=65:return 'Physical therapy'
 if n<=76:return 'Day room'
 if n<=83:return 'Dining'
 return 'Administration'
notes={1:'January 10, 2024 title date; facility address 1839 W. Valley Blvd.',2:'Design principles: nature, calm, community and home. Inspiration, not installed-condition evidence.',3:'Lobby inspiration: planting, vertical timber slats, upholstered niches.',4:'Day-space inspiration: layered landscape battens and tree seating.',5:'Library inspiration: joinery, glazing and seating.',6:'Restaurant inspiration: timber doors, round vision panels and lattice.',7:'Veranda inspiration: patterned tile, planting and furniture; no as-built exterior dimensions.',8:'Therapy inspiration: open movement areas and equipment.',9:'Clinic inspiration: numbering, clinical rooms and nurse counter.',10:'Admin inspiration: workstations, partitions and collaboration.',11:'Material families: moss, timber, upholstery, tile, LVT and carpet. Not a complete procurement schedule.',12:'Final furnished top view: canonical tracing and site-image source. No dimension strings or scale bar on the overall plan.',13:'Basement stated at 6,191 sq ft. Highlight is a stacking footprint, not a basement partition plan.',14:'Program areas: 3,150; 3,254; 3,080; 3,665; 815; 638; 2,716 sq ft, total 17,318. Program boundaries/net-versus-gross basis are not fully defined.',15:'Equipment mezzanine 1,267 sq ft and future office 2,885 sq ft. No floor elevations or office fit-out.',16:'Basement stacking view: surrounding streets and massing retained. Internal basement geometry cannot be verified.',17:'Ground stacking view: final massing and cutaway room relationships.',18:'Mezzanine/second-floor stacking: southwest L-shaped mezzanine and southeast upper office.',19:'Roof stacking: long central curved roof, southwest roof and east roof volumes. Roof equipment shapes visible; specifications absent.',20:'West entry facade elevation: signage, canopy, glazing and entry; no readable overall dimensions.',21:'West parking/drop-off top view: accessible bays, marked access aisle and van approach.',22:'West entry perspective: railings, canopy, stairs/ramp and exterior wall treatment.',23:'West entry perspective with van: arrival relationship and signage.',24:'Oblique west drop-off: ramp, wall, parking islands and markings.',25:'Alternate west drop-off view: confirms site access context.',26:'Floor-finish plan: porcelain, sheet vinyl, herringbone LVT, carpet tile, sports vinyl and ceramic. Zone 05 labeling needs schedule clarification.',27:'Bathroom finish codes PT-04, CT-03/04/05/07, SS-02, LP-03; Comfort Gray, Arctic White, Royale/Royal Blanc and Solicor Compact named.',28:'Lobby line elevations: four orientations, doors, niches, benches and counter. No dimension strings.',29:'Lobby north/south render elevations: warm upholstery, landscape niche panels, doors and fountain.',30:'Lobby east/west render elevations: planting/slats, counter, entry and timber doors.',31:'Reception perspective: white counter, timber fluting, moss wall and ceiling slats.',32:'Alternate reception perspective: paired upholstered niches and floor tiles.',33:'Lobby corridor perspective: wood doors, floor tile and wall-mounted fixtures.',34:'Lobby transition: reception axis, fountain and adjacent corridor.',35:'Hallway 1010 line elevations: two cubby banks, doors and exit glazing.',36:'Hallway 1010 finish elevations: cubbies, wall panels, handrails and door colors.',37:'Hallway perspective confirms cubbies and suspended ceiling.',38:'Hallway axis confirms sequence of doors, handrail and ceiling lights.',39:'Hallway cubby perspective, alternate direction.',40:'Clinic 1129 line elevations: nurse desk, door sequence and wall rails.',41:'Clinic 1129 rendered long elevations: six doors and numbered wayfinding.',42:'Clinic 1129 north/south render elevations: desk, consultation furniture and clinical equipment.',43:'Clinic 1130 line elevations: numbered doors 1–6 opposite clinical desk.',44:'Clinic 1130 east finish elevation: six numbered exam doors. Numeric order cannot be mapped confidently to pixel plan without a room schedule.',45:'Clinic circulation and nurse station perspective.',46:'Nurse station and clinic perspective with people; furniture/finish evidence only.',47:'Clinic nurse-station return and teal bulkhead.',48:'Alternate nurse-station perspective with people.',49:'Clinic end-on nurse counter: fluted timber, white top and teal bulkhead.',50:'Empty nurse-counter perspective confirms counter form.',51:'Clinic circulation, room 1126 sign visible; exact placement needs a numbered plan.',52:'Alternate view of same circulation and room 1126 signage.',53:'Consult room 1110: four line elevations, central table, chairs and display.',54:'Consult room 1110 perspective: wall display, table and blue chairs.',55:'Typical exam-room top view: angled exam recliner, side chair and cabinet. No dimensions or room number.',56:'Typical exam room: recliner, side chair, sink/cabinet run and wood door.',57:'Triage room 1111 perspective. Model-to-plan location cannot be established uniquely from the compressed plan.',58:'Typical exam room cabinetry, sink and side chair.',59:'Reverse typical exam-room view, diagnostic wall equipment.',60:'PT line elevations: mezzanine guardrail, glazed openings and double-height volume; no dimension strings.',61:'PT finish elevations: mezzanine edge and lower glazing.',62:'PT perspective: treatment tables, trainer, bike, mezzanine railing.',63:'PT perimeter: exercise bikes, training steps, ball rack and glazing.',64:'PT treatment table arrangement under mezzanine.',65:'PT reverse perspective and inset orientation plan; treatment tables and demonstration kitchen visible.',66:'Day-room north/south sections: 12 ft finish datum; 4 ft lower + 8 ft upper; 4 in base; bowstring trusses. Roof crown is not explicitly dimensioned.',67:'Day-room east/west elevations repeat 12 ft, 4 ft, 8 ft and 4 in datums. Landscape wall and library are clearly placed.',68:'Day-room north/south rendered elevations: tree, screens, openings and living wall.',69:'Day-room rendered elevations: landscape battens east; library and screen west. Page also contains a SOUTH label without a distinct separate elevation.',70:'Day-room perspective: round blue tree lounge, rectangular tables and timber roof/trusses.',71:'Alternate tree lounge view, timber chair frames and tabletops.',72:'Landscape wall perspective: layered slats, blue banquette and tables.',73:'Alternate banquette/landscape wall perspective.',74:'Tree lounge close view: branches, planting and blue seating.',75:'Library-wall view with pale chair variant; conflicts with darker chair variant on p.76.',76:'Same library-wall view with darker timber chair variant. Final installed chair specification is unresolved.',77:'Dining 1421 line elevations: four orientations, screen, service opening and doors.',78:'Dining 1421 rendered elevations: timber lattice, green doors, service opening and artwork.',79:'Dining perspective: TV wall, lattice partition and small tables.',80:'Alternate dining view: lattice and tile ceiling grid.',81:'Dining service wall with roller opening and beverage counter.',82:'Reverse dining view: service window, art and tables.',83:'Dining service corner and lattice detail.',84:'Admin line elevations: four directions, partition openings and glazed meeting room.',85:'Admin shared workstations: bench desks, dividers and task chairs.',86:'Admin central passage and workstations.',87:'Admin alternate bench arrangement and shared workspace.',88:'Admin workstation-to-meeting-room relationship and glass partitions.',89:'Admin window-side desk row with shades.',90:'Admin long meeting table and chairs.',91:'Small admin consultation/meeting room: table, display and chairs.'}
pages=[]
for n in range(1,92):
 text=source_text[n-1].strip();ls=[l.strip() for l in text.splitlines() if l.strip()]
 pages.append(dict(page=n,title=' · '.join(ls[:2]),group=pagegroup(n),image=f'/reference/final/{n:02}.jpg',text=text,findings=notes[n],reviewStatus='visually-inventoried',evidenceType='inspiration' if 2<=n<=11 else 'source-drawing' if n in [12,26,28,35,40,43,53,60,66,67,77,84] else 'source-render-or-schedule'))
programs=[dict(id=i,name=n,publishedSqFt=sf,sourcePage=p) for i,n,sf,p in [('back-house','Lobby / back of house',3150,14),('clinic','Clinic',3254,14),('therapy','Physical therapy / OT',3080,14),('day-space','Dayroom / memory care',3665,14),('dining','Dining',815,14),('kitchen','Kitchen',638,14),('admin','Administration',2716,14),('basement','Basement',6191,13),('mezzanine','Equipment mezzanine',1267,15),('upper-office','Future office space',2885,15)]]
gaps=[dict(id=i,title=t,detail=d,status='open',pages=p) for i,t,d,p in [
 ('dimensioned-plan','Overall and room dimensions','Need DWG/IFC/Revit or a dimensioned as-built plan; pixel tracing plus area calibration cannot establish exact lengths, door widths or wall thicknesses.',[12,14]),
 ('vertical-datums','Floor-to-floor elevations','Basement depth, mezzanine elevation, second-floor elevation and most roof/parapet heights are not dimensioned.',[13,15,16,18,19]),
 ('second-floor','Second-floor changes','User has mentioned additional updates; revised partitions, uses, access and furniture are pending.',[15,18]),
 ('basement-fitout','Basement plan','No basement partitions, doors, furniture or access plan provided.',[13,16]),
 ('furniture-schedule','Installed furniture and equipment','Need manufacturer models/dimensions and location schedule. Pages 75 and 76 show different chairs in the same scene.',[55,62,63,64,65,75,76,85,90]),
 ('room-schedule','Room names and numbering','1110 consult, 1111 triage, 1010 hallway, 1129/1130 clinic and 1421 dining are named. Other room IDs and precise mapping need a numbered plan.',[12,35,40,43,53,57,77]),
 ('site-survey','Site dimensions and street imagery','Source includes architectural street renderings, not a surveyed civil site plan or current photographs. Curbs, lanes, trees and adjacent buildings cannot be certified from these views.',[12,16,17,18,19,20,21,22,23,24,25]),
 ('program-area-basis','Net versus gross area boundaries','Published program areas total 17,318 sq ft. Exact departmental boundaries and inclusions are not defined on the overhead plan; do not force every gross traced polygon to match a net program area.',[14]),
 ('adjacent','Adjacent building interior','Final document shows an adjacent roofed shell; its internal rooms and future use are not supplied.',[12,19]),
 ('full-construction','Concealed construction / complete inventory','Structural sizes, MEP routing, full ceiling plans, fire/life-safety devices, door/window schedules and hidden conditions are not exhaustively documented in this presentation.',[19,26,27,66,67])]]
model=dict(schemaVersion='2.0',id='seen-alhambra-2024',name='Seen Health · Alhambra',address='1839 W. Valley Blvd., Alhambra, CA 91803',units='m',coordinateSystem='right-handed; +x east in source plan, +y up, +z toward Valley Blvd.',revision='2024-01-10-source / 2026-09-12-reconstruction',source=dict(title='SeenHealth_240111Render E WITH SF AREAS copy.pdf',date='2024-01-10',pages=91,author='Langdon Wilson International',file='/reference/final/source.pdf'),
 calibration=dict(method='Clinic footprint area calibration',status='area-calibrated, not dimensionally verified',pixelsPerMeter=PPM,sourcePixelOrigin=list(ORIGIN),referencePage=12,areaPage=14,anchorAreaSqFt=3254,anchorPolygonPixels=rect(562,226,224,310),notes='Uniform scale calibrated to clinic program area. Assumes the stated area corresponds to the traced perimeter. Net/gross area basis remains unverified; no survey tolerance can be claimed.'),
 levels=levels,zones=zones,rooms=rooms,walls=walls,assets=assets,objects=objects,materials=materials,programs=programs,referencePages=pages,accuracyIssues=gaps,
 site=dict(image='/reference/final/plan.png',imageSize=[1976,1280],bounds=[pt([61,124]),pt([1503,1126])],imagePixelBounds=[61,124,1503,1126],buildingOutline=[pt(p) for p in [[317,694],[562,694],[562,226],[786,226],[786,335],[960,335],[960,378],[1012,378],[1012,614],[1230,614],[1230,968],[786,968],[786,940],[562,940],[562,968],[317,968]]],referencePages=list(range(12,26)),notes='Architect-rendered site context from p.12; not a photographic survey.'),
 roofSections=[dict(id=i,kind=k,bounds=[pt([x,y]),pt([x+w,y+d])],eaveHeight=e,rise=r,referencePages=[19,66,67],status='inferred-form') for i,k,x,y,w,d,e,r in [('central','barrel',562,226,224,714,4.15,2.1),('therapy','flat',317,694,245,274,6.0,.18),('east','flat',786,335,226,633,6.5,.14),('adjacent','flat',1012,614,218,354,6.4,.12)]],
 facade=dict(height=6.2,status='image-inferred',wallMaterial='wall',glazingMaterial='glass',referencePages=list(range(20,26))),
 dimensions=[dict(id='day-wall-datum',value=3.6576,unit='m',sourceValue='12 ft 0 in',pages=[66,67],status='documented',meaning='Day-room wall finish datum, not roof ridge or floor-to-floor height'),dict(id='day-lower-band',value=1.2192,unit='m',sourceValue='4 ft 0 in',pages=[66,67],status='documented',meaning='Day-room lower wall field'),dict(id='day-upper-band',value=2.4384,unit='m',sourceValue='8 ft 0 in',pages=[66,67],status='documented',meaning='Day-room upper wall field'),dict(id='day-base',value=.1016,unit='m',sourceValue='0 ft 4 in',pages=[66,67],status='documented',meaning='Day-room base detail')])
# Geometry for facade, arrival and feature walls lives in the facility data, never in the viewer.
details=[]
def detail(id,x,y,z,w,h,d,material,surface='exterior',rotation=None,zoneId=None):
 details.append(dict(id=id,position=[x,y,z],dimensions=[w,h,d],material=material,surface=surface,rotation=rotation or [0,0,0],zoneId=zoneId,status='image-inferred',referencePages=list(range(20,26)) if surface=='exterior' else [66,67,69]))
for tag,x1,x2,yp,H,count in [('therapy-front',317,562,968,6.2,10),('admin-front',786,1012,968,6.6,9),('adjacent-front',1012,1230,968,6.6,7)]:
 a,b=pt([x1,yp]),pt([x2,yp]);W=b[0]-a[0];pitch=W/count
 for j,(y,h) in enumerate([(0,.65),(2.55,.6),(5.1,H-5.1)]):detail(f'{tag}-spandrel-{j}',(a[0]+b[0])/2,y,a[1],W,h,.22,'wall')
 for i in range(count):
  x=a[0]+pitch*(i+.5);detail(f'{tag}-pier-{i}',x-pitch/2,0,a[1],pitch*.25,H,.22,'wall')
  for j,y in enumerate([.65,3.15]):
   detail(f'{tag}-glass-{i}-{j}',x,y,a[1],pitch*.73,1.9,.045,'glass')
   detail(f'{tag}-mullion-{i}-{j}',x,y,a[1]+.04,.035,1.9,.06,'frame')
south=pt([674,940])
for i in range(8):
 detail(f'day-front-glass-{i}',south[0]-6.8+i*1.7,.03,south[1],1.58,2.65,.05,'glass')
 detail(f'day-front-frame-{i}',south[0]-7.6+i*1.7,0,south[1],.09,2.75,.15,'frame')
detail('day-canopy',south[0],2.95,south[1]+1,14.9,.18,2.4,'canopy')
detail('day-front-parapet',south[0],3.15,south[1]-.1,14.9,1.4,.28,'canopy')
for id,x,y,W,H,D in [('therapy-west',317,831,.22,6.2,274/PPM),('clinic-north',674,226,224/PPM,4.15,.22),('clinic-west',562,381,.22,4.15,310/PPM)]:
 q=pt([x,y]);detail(id,q[0],0,q[1],W,H,D,'wall')
entry=pt([562,584]);detail('west-entry-canopy',entry[0]-.85,2.8,entry[1],1.85,.16,6.8,'wall');detail('west-entry-fascia',entry[0]-.02,3.02,entry[1],.18,1.05,9.5,'wall')
detail('west-entry-ramp',entry[0]-2.2,-.16,entry[1]+2.3,2,.13,7.2,'concrete','site',[.03,0,0])
for i,x in enumerate([entry[0]-3.2,entry[0]-1.2]):
 detail(f'entry-rail-{i}',x,.82,entry[1]+2.3,.035,.035,7.2,'metal','site')
 for j in range(7):detail(f'entry-post-{i}-{j}',x,-.18,entry[1]-1+j,.03,1,.03,'metal','site')
x=pt([786,700])[0];z=pt([786,713])[1];i=0
while z<pt([786,934])[1]:
 detail(f'landscape-batten-{i}',x-.12,1.2192,z,.06,2.4384,.023,'oak','detail',zoneId='day')
 detail(f'landscape-light-{i}',x-.17,2.1+math.sin(z*1.3)*.23+math.sin(z*2.6)*.1,z,.02,.035,.05,'light','detail',zoneId='day')
 z+=.065;i+=1
materials.update(glass=dict(color='#7fabb7',roughness=.22,metalness=.15,opacity=.62),frame=dict(color='#34536b',roughness=.6),canopy=dict(color='#245785',roughness=.65),light=dict(color='#ead8ad',roughness=.5))
model['details']=details
# Associate furnishings with the smallest containing room, without changing their source positions.
def inside(p,poly):
 x,z=p;result=False;j=len(poly)-1
 for i in range(len(poly)):
  a,b=poly[i],poly[j]
  if ((a[1]>z)!=(b[1]>z)) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:result=not result
  j=i
 return result
for o in objects:
 if not o['roomId']:
  rs=[r for r in rooms if r['zoneId']==o['zoneId'] and inside([o['position'][0],o['position'][2]],r['polygon'])]
  if rs:o['roomId']=min(rs,key=lambda r:area(r['polygon']))['id']
for z in zones:z['tracedFootprintSqFt']=round(area(z['polygon'])/.09290304,1)
(ROOT/'public/models/seen-alhambra-2024.json').write_text(json.dumps(model,indent=2))
(ROOT/'public/models/page-audit.json').write_text(json.dumps(pages,indent=2))
print(f'Generated {len(zones)} zones, {len(rooms)} room records, {len(walls)} walls, {len(objects)} replaceable objects and {len(pages)} source records. Uniform scale {PPM:.6f} px/m.')
