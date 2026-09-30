"""User-directed activity fit-out and a reproducible 100-person demonstration cast."""
import json, math, copy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'public/models/seen-alhambra-planning.json'; m=json.loads(p.read_text())
a_path=root/'app/data/activity-loop.json'; a=json.loads(a_path.read_text())
a['actors']=[x for x in a['actors'] if not x['id'].startswith('community-')]
a['interactions']=[x for x in a['interactions'] if not x['id'].startswith('community-')]
rooms={r['id']:r for r in m['rooms']}
names={'admin-meeting-west':'Mahjong room','admin-meeting-east':'Wii & TV room','admin-workstations':'Games lounge · ping pong & pool','admin-conference':'Karaoke room'}
for rid,name in names.items():
 rooms[rid].update(name=name,kind='activity',status='user-directed activity conversion',notes='Community activity fit-out requested September 2026; furniture dimensions are illustrative.')
for z in m['zones']:
 if z['id']=='admin':z.update(name='Community activity wing',short='Activity wing')
for o in list(m['objects']):
 if o.get('roomId') in names and o.get('layer','furniture')=='furniture' and not any(s in o['id'] for s in ['yellow-wall']):m['objects'].remove(o)
m['objects']=[o for o in m['objects'] if not o['id'].startswith('community-')]
def asset(id,kind,dims,material='oak'):
 m['assets'][id]={'kind':kind,'dimensions':dims,'material':material}
asset('community-mahjong','mahjong-table',[1.05,.76,1.05])
asset('community-ping-pong','ping-pong-table',[2.74,.76,1.525])
asset('community-pool','pool-table',[2.45,.8,1.4])
asset('community-wii','wii-station',[1.5,1.7,.4])
asset('community-karaoke','karaoke-station',[2.2,1.9,.45])
asset('community-chair','chair',[.52,.86,.54],'seat-teal')
# Use an existing upholstery material, retaining the shared visual language.
m['assets']['community-chair']['material']='teal' if 'teal' in m['materials'] else 'oak'
def obj(id,aid,x,z,rid,rot=0,y=0):
 r=rooms[rid]
 m['objects'].append(dict(id='community-'+id,assetId=aid,position=[x,y,z],rotation=rot,scale=[1,1,1],zoneId=r['zoneId'],levelId=r['levelId'],roomId=rid,referencePages=r['referencePages'],status='user-directed activity fit-out',notes='Illustrative activity furniture.'))
obj('mahjong','community-mahjong',7.82,16.32,'admin-meeting-west')
obj('wii','community-wii',11.15,15.2,'admin-meeting-east')
obj('ping-pong','community-ping-pong',6.3,20.25,'admin-workstations')
obj('pool','community-pool',12,20.25,'admin-workstations')
obj('karaoke','community-karaoke',14.8,24.7,'admin-conference',-math.pi/2)
# Reuse the two original social-support characters in the new karaoke audience.
for id,pos in [('social-worker',[10.8,25.8]),('member-support',[8,24.4])]:
 act=next(x for x in a['actors'] if x['id']==id)
 act['segments']=[dict(start=0,end=720,action='clap',path=[pos,pos],zoneId='admin',heading=math.pi/2,title='Karaoke · encouragement')]
profiles_path=root/'app/data/character-templates.json'; profiles=json.loads(profiles_path.read_text())
profiles['people']=[x for x in profiles['people'] if not x['id'].startswith('community-')]
new=[]
def person(label,role,pos,zone,rid=None,action='conversation',heading=0,seated=False,path=None):
 i=len(new); id=f'community-{i+1:02d}'; level=rooms[rid]['levelId'] if rid else 'ground'
 segments=[]
 if path:
  for j in range(4):
   start=j*180
   segments.extend([dict(start=start,end=start+110,action=action,path=[pos,pos],zoneId=zone,heading=heading,title=label),dict(start=start+110,end=start+145,action='walk',path=path,zoneId=zone,heading=heading,title='Moving between activity stations'),dict(start=start+145,end=start+180,action='walk',path=list(reversed(path)),zoneId=zone,heading=heading,title='Returning to the activity')])
 else:
  for j in range(8):
   act=action if j%2==0 or action in ['ping-pong','billiards','wii','mahjong','karaoke'] else {'conversation':'greet','treat':'consult','tabletop':'craft','exercise':'tai-chi','serve':'serve','document':'document'}.get(action,action)
   segments.append(dict(start=j*90,end=(j+1)*90,action=act,path=[pos,pos],zoneId=zone,heading=heading,seated=seated,title=label))
 x=dict(id=id,label=label,role=role,variant=i+41,profileId=id,offset=(i*7)%90,levelId=level,segments=segments)
 if rid:x['roomId']=rid
 if seated:x['seated']=True
 new.append(x)
 colors=['#ce7452','#627ea6','#c19b43','#718953','#a5667c','#6ba5a0','#b78964','#715f92','#487b89','#d8988c','#a6ad77','#8b6451']
 profiles['people'].append(dict(id=id,role=role,appearance=i%8,skin=['#e9b18a','#c08a61','#9b684c','#f2c9a4','#74503d','#dba07a'][i%6],hair=['#d0cbbb','#f2eee5','#3d3531','#8a8178','#b5b2aa'][i%5],hairStyle=i%4,glasses=i%3==0,accent=colors[i%12] if role=='participant' else ['#2d8c88','#467d94','#659c86'][i%3],height=.91+(i%7)*.025))
 return id
# 22 clinical actors: a patient and care professional in each previously empty consultation room.
for rid in ['clinic-west-01','clinic-west-02','clinic-west-03','clinic-west-04','clinic-west-05','clinic-west-07','clinic-west-08','clinic-exam-01','clinic-exam-02','clinic-exam-03','clinic-exam-04']:
 r=rooms[rid]; xs=[p[0] for p in r['polygon']]; zs=[p[1] for p in r['polygon']]; cx=(min(xs)+max(xs))/2; cz=(min(zs)+max(zs))/2
 person('Clinical consultation · participant','participant',[cx-.55,cz],'clinic',rid,'conversation',math.pi/2)
 person('Clinical consultation · care team','doctor' if len(new)%4==0 else 'nurse',[cx+.65,cz],'clinic',rid,'treat',-math.pi/2)
# 3 extra therapy participants in open equipment areas.
for pos in [[-24.6,23],[-22.5,24.6],[-30.1,17.1]]:person('Balance & mobility practice','participant',pos,'rehab',None,'exercise',math.pi/2)
# 5 quiet table participants using existing model chairs.
used={x.get('seatId') for x in a['actors']}
chairs=[o for o in m['objects'] if o['zoneId']=='day' and 'chair' in m['assets'][o['assetId']]['kind'] and o['id'] not in used and o['position'][2]>17]
for o in chairs[:5]:
 id=person('Creative table · games & crafts','participant',[o['position'][0],o['position'][2]],'day',None,'tabletop',o['rotation']+math.pi,True)
 new[-1]['seatId']=o['id']
assert len(new)==30,len(new)
chairs=[o for o in m['objects'] if o['zoneId']=='dining' and 'chair' in m['assets'][o['assetId']]['kind'] and o['id'] not in used]
for o in chairs[:3]:
 person('Shared meal & conversation','participant',[o['position'][0],o['position'][2]],'dining',None,'conversation',o['rotation']+math.pi,True);new[-1]['seatId']=o['id']
# Four seated mahjong players.
for j,(dx,dz,h) in enumerate([[-.94,0,math.pi/2],[.94,0,-math.pi/2],[0,-.91,0],[0,.91,math.pi]]):
 x,z=7.82+dx,16.32+dz
 person('Mahjong · player '+str(j+1),'participant',[x,z],'admin','admin-meeting-west','mahjong',h,True)
 obj('mahjong-chair-'+str(j),'community-chair',x,z,'admin-meeting-west',h+math.pi)
for x in [10.35,11.85]:person('Wii bowling · motion game','participant',[x,16.85],'admin','admin-meeting-east','wii',math.pi)
for x,h,action in [(4.3,math.pi/2,'ping-pong'),(8.3,-math.pi/2,'ping-pong'),(10.2,math.pi/2,'billiards'),(13.8,-math.pi/2,'billiards')]:person('Ping pong rally' if action=='ping-pong' else 'Pool · friendly game','participant',[x,20.25],'admin','admin-workstations',action,h)
for j,(x,z) in enumerate([(12.9,24.4),(8,25.65),(9.3,25.65),(9.3,23.55),(10.7,23.55)]):
 person('Karaoke · singer' if j==0 else 'Karaoke · audience','participant',[x,z],'admin','admin-conference','karaoke' if j==0 else 'clap',math.pi/2,j>0)
 if j>0:obj('karaoke-chair-'+str(j),'community-chair',x,z,'admin-conference',-math.pi/2)
# Eight staff/participants populate support rooms and the remaining clinical room.
for label,role,rid,pos,act in [
 ('Care consultation','nurse','clinic-exam-06',[-2,-5.4],'consult'),
 ('Medication preparation','nurse','clinic-center-store',[-7.7,-6.8],'document'),
 ('Linen preparation','aide','rear-support-west',[3,-8.7],'serve'),
 ('Laundry','aide','rear-support-center',[7.85,-8.1],'serve'),
 ('Hair care appointment','participant','rear-wc-east',[7.3,-4.6],'conversation'),
 ('Hair care assistance','aide','rear-wc-east',[8.25,-4.6],'treat'),
 ('Staff break','coordinator','admin-staff-lounge',[10.6,11.3],'conversation'),
 ('Care coordination','social-worker','admin-side-office',[2.2,20.5],'document')]:person(label,role,pos,rooms[rid]['zoneId'],rid,act)
for j,pos in enumerate([[-5.5,4.7],[-6.7,4.7],[-10.7,1.7]]):person('Welcome & conversation','participant' if j<2 else 'aide',pos,'lobby',None,'greet',math.pi/2 if j==0 else -math.pi/2)
assert len(new)==59,len(new)
a['actors']+=new
for rid,label in names.items():
 ids=[x['id'] for x in new if x.get('roomId')==rid]
 a['interactions'].append(dict(id='community-'+rid,label=label,category='activities',actorIds=ids,start=0,end=720,zoneId='admin',description='Participant activity in the converted community wing.'))
a['description']='100 individual participants and staff bring the center to life, with care, creative activities, games, meals and transport.'
a['views']=[{'id':i,'label':l} for i,l in [('site','Vans & arrivals'),('clinic','Clinic'),('rehab','PT & OT'),('day','Day activities'),('admin','Games & karaoke'),('dining','Meals'),('upper-office','Coordination'),('all','Whole center')]]
m['revision']='Community activity fit-out · 100-person care day'
m['designDecisions']['communityActivityConversion']='User request: ground-floor mahjong, Wii, ping pong, pool and karaoke; upstairs offices retained.'
p.write_text(json.dumps(m,indent=2)+'\n');a_path.write_text(json.dumps(a,indent=2)+'\n');profiles_path.write_text(json.dumps(profiles,indent=2)+'\n')
print('Expanded cast:',len(a['actors']),'people. New activity rooms:',list(names.values()))
