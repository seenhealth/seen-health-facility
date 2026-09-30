"""September 25 revision: real bookshelf passage, full day tables, food service."""
import json,math
from pathlib import Path
R=Path(__file__).resolve().parents[1]
mp=R/'public/models/seen-alhambra-planning.json';m=json.loads(mp.read_text())
ap=R/'app/data/activity-loop.json';a=json.loads(ap.read_text());pp=R/'app/data/character-templates.json';profiles=json.loads(pp.read_text());program=json.loads((R/'app/data/day-program.json').read_text())
# The restrooms meet the bookshelf partition; there is no longitudinal rear corridor.
oldx,newx=-15.721578,-14.653121
for r in m['rooms']:
 if r['id'] in ['rehab-wc-east','rehab-wc-south','rehab-open']:
  r['polygon']=[[newx if abs(x-oldx)<.002 else x,z] for x,z in r['polygon']]
  r['notes']+=' User correction: direct cross-passage between library cabinets; no passage behind the shelving.' if 'User correction: direct' not in r['notes'] else ''
m['walls']=[w for w in m['walls'] if w['id']!='plan-wall-155']
for w in m['walls']:
 if w['zoneId']=='rehab':
  for key in ['a','b']:
   if abs(w[key][0]-oldx)<.002:w[key][0]=newx
  if w['id']=='plan-wall-180':w['a']=[newx,19.435737]
# Bay 4 previously blocked the actual opening; surrounding cabinets remain.
m['objects']=[o for o in m['objects'] if o['id']!='day-library-bay-4' and not o['id'].startswith('daily-')]
m['designDecisions']['dayRoomCrossPassage']='Opening from day room through the cabinets at x=-14.65, z=17.96–19.44 to the bathroom/PT cross-hall. Removed the fictitious longitudinal corridor and blocking cabinet bay.'
a['actors']=[x for x in a['actors'] if not x['id'].startswith('daily-')];profiles['people']=[x for x in profiles['people'] if not x['id'].startswith('daily-')];a['interactions']=[x for x in a['interactions'] if not x['id'].startswith('daily-')]
used={x.get('seatId') for x in a['actors']};removed=set(program['removedObjectIds'])
new=[]
activities={'communal':('Arts & crafts at the long table',['craft','write','conversation','craft']), 'tree':('Small-group conversation',['conversation','listen','greet','conversation']), 'diamond':('Table games & creative groups',['tabletop','craft','conversation','write']), 'banquette':('Tea & conversation',['conversation','tabletop','listen','conversation']), 'north':('Language & reading circle',['listen','conversation','device','conversation']), 'lounge':('A quiet chat',['conversation','listen','conversation','greet'])}
colors=['#bc7860','#7997a6','#d0ae66','#82a26d','#aa7287','#6b9f96','#ad8b74','#8c7b9e','#467887','#ce9a88','#a6ac7e','#9e6d59']
def person(seat,label,acts):
 i=len(new);id=f'daily-member-{i+1:02d}';p=[seat['position'][0],seat['position'][2]]
 segments=[dict(start=j*90,end=(j+1)*90,action=acts[j%len(acts)],path=[p,p],zoneId=seat['zoneId'],heading=seat['rotation']+math.pi,seated=True,title=label) for j in range(8)]
 actor=dict(id=id,profileId=id,label=label,role='participant',variant=100+i,offset=(i*11)%90,levelId='ground',roomId=seat.get('roomId'),seatId=seat['id'],seated=True,segments=segments);new.append(actor)
 profiles['people'].append(dict(id=id,role='participant',appearance=i%8,skin=['#e9b18a','#c08a61','#9b684c','#f2c9a4','#74503d','#dba07a'][i%6],hair=['#d0cbbb','#f2eee5','#3d3531','#8a8178','#b5b2aa'][i%5],hairStyle=i%4,glasses=i%3==0,accent=colors[i%12],height=.91+(i%7)*.025))
for zone in ['day','dining']:
 seats=[o for o in m['objects'] if o['zoneId']==zone and 'chair' in m['assets'][o['assetId']]['kind'] and o['id'] not in removed]
 target=math.ceil(len(seats)*.85);occupied=sum(o['id'] in used for o in seats)
 # Spread occupancy across every table; fill the large craft table first.
 seats.sort(key=lambda s:(0 if 'communal' in s['id'] else 1,s['id']))
 for s in seats:
  if s['id'] in used or occupied>=target:continue
  if zone=='dining':label,acts='Lunch & shared conversation',['tabletop','conversation','tabletop','listen']
  else:
   key=next((k for k in activities if k in s['id']),'diamond');label,acts=activities[key]
  person(s,label,acts);occupied+=1;used.add(s['id'])
 print(zone,occupied,'of',len(seats),'chairs occupied')
a['actors']+=new
# Reusable tabletop details on the real furniture.
for o in list(m['objects']):
 spec=m['assets'][o['assetId']]
 if o['zoneId'] not in ['day','dining'] or o['id'] in removed or spec['kind'] not in ['table','round-table']:continue
 if o['position'][1]>.2:continue
 style='meal' if o['zoneId']=='dining' else 'craft' if 'communal' in o['id'] else 'tea' if 'banquette' in o['id'] else 'games' if 'diamond' in o['id'] else 'craft'
 aid='daily-top-'+o['id'];m['assets'][aid]=dict(kind='activity-tabletop',dimensions=[spec['dimensions'][0],.12,spec['dimensions'][2]],material='oak',parameters={'activity':style})
 m['objects'].append(dict(id=aid,assetId=aid,zoneId=o['zoneId'],levelId='ground',position=[o['position'][0],spec['dimensions'][1]+.02,o['position'][2]],rotation=o['rotation'],scale=[1,1,1],roomId=o.get('roomId'),layer='furniture',referencePages=o['referencePages'],status='user-directed activity details',notes='Plates, cups, creative materials and shared tabletop activities.'))
# A serving trolley in the dining service aisle, plus counter trays.
for aid,kind,dims in [('daily-serving-cart','meal-cart',[.65,.9,.9]),('daily-food-trays','activity-tabletop',[1.4,.15,.48])]:m['assets'][aid]=dict(kind=kind,dimensions=dims,material='oak',parameters={'activity':'buffet'})
for aid,pos,zone,rid in [('daily-serving-cart',[7.1,0,4.9],'dining','dining-1421'),('daily-food-trays',[5.8,.95,7.2],'dining','dining-1421')]:m['objects'].append(dict(id=aid,assetId=aid,zoneId=zone,levelId='ground',position=pos,rotation=0,scale=[1,1,1],roomId=rid,layer='furniture',referencePages=[92],status='user-directed food service',notes='Prepared meal trays, fruit and drinks.'))
for label in sorted(set(x['label'] for x in new)):
 ids=[x['id'] for x in new if x['label']==label];zone=next(x['segments'][0]['zoneId'] for x in new if x['label']==label)
 a['interactions'].append(dict(id='daily-'+str(len(a['interactions'])),label=label,category='meals' if zone=='dining' else 'activities',actorIds=ids,start=0,end=720,zoneId=zone,description='A shared table activity throughout the representative care day.'))
a['description']=f"{len(a['actors'])} individual people, with most day-center and dining seats occupied, group activities, care, meals and transport."
for path,data in [(mp,m),(ap,a),(pp,profiles),(R/'public/models/activity-loop.json',a),(R/'public/models/character-templates.json',profiles)]:path.write_text(json.dumps(data,indent=2)+'\n')
print('Total cast',len(a['actors']))
