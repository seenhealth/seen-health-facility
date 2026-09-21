"""Author composite activity paths through the owned model. Never consumes patient records."""
import json, math, heapq
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'public/models/seen-alhambra-planning.json').read_text())
program=json.loads((ROOT/'app/data/day-program.json').read_text())
removed=set(program['removedObjectIds'])
STEP=.20
zones=[z for z in m['zones'] if z['levelId']=='ground' and z['id']!='adjacent']
walls=[w for w in m['walls'] if w['levelId']=='ground']
def inside(p,poly):
 x,y=p; odd=False
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:odd=not odd
 return odd
def distseg(p,a,b):
 dx=b[0]-a[0];dy=b[1]-a[1];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)))
 return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
obstacles=[]
for o in m['objects']:
 if o['id'] in removed:continue
 if o['levelId']!='ground' or o.get('layer','furniture')!='furniture':continue
 a=m['assets'][o['assetId']];w,h,d=[v*s for v,s in zip(a['dimensions'],o['scale'])]
 if h<.15 or o['position'][1]>1.4:continue
 c,s=math.cos(o['rotation']),math.sin(o['rotation'])
 for x,z,fw,fd in o.get('navigationFootprints',[[0,0,w,d]]):
  obstacles.append((o['position'][0]+c*x+s*z,o['position'][2]-s*x+c*z,fw/2+.19,fd/2+.19,c,s))
# Reserve the flexible group stations and presentation screen so circulating routes go around them.
for station in program['stations']:
 x,z=station['position'];obstacles.append((x,z,.64,.65,1,0))
obstacles.append((-7,9.72,1.15,.3,1,0))
def clear(p,clearance=.21):
 if not any(inside(p,z['polygon']) for z in zones):return False
 for w in walls:
  if distseg(p,w['a'],w['b'])<w['thickness']/2+clearance:return False
 for x,z,w,d,c,s in obstacles:
  dx=p[0]-x;dz=p[1]-z
  if abs(c*dx-s*dz)<w+clearance-.21 and abs(s*dx+c*dz)<d+clearance-.21:return False
 return True
nodes={}
for ix in range(-157,77):
 for iz in range(-113,141):
  p=(round(ix*STEP,3),round(iz*STEP,3))
  if clear(p):nodes[(ix,iz)]=p
print('Navigable cells:',len(nodes))
def zone(p):return next((z['id'] for z in zones if inside(p,z['polygon'])),'lobby')
def snap(p,z=None):
 options=nodes.values() if z is None else [q for q in nodes.values() if zone(q)==z]
 q=min(options,key=lambda q:math.dist(p,q))
 if math.dist(p,q)>2.2:raise ValueError(f'Anchor too far from free floor: {p} -> {q}')
 return q
def route(a,b):
 start=(round(a[0]/STEP),round(a[1]/STEP));goal=(round(b[0]/STEP),round(b[1]/STEP))
 heap=[(0,start)];cost={start:0};prev={}
 while heap:
  _,u=heapq.heappop(heap)
  if u==goal:break
  for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)]:
   v=(u[0]+dx,u[1]+dy)
   if v not in nodes:continue
   if dx and dy and ((u[0]+dx,u[1]) not in nodes or (u[0],u[1]+dy) not in nodes):continue
   c=cost[u]+math.hypot(dx,dy)
   if c<cost.get(v,float('inf')):
    cost[v]=c;prev[v]=u;heapq.heappush(heap,(c+math.dist(v,goal),v))
 else:raise ValueError(f'No safe path from {a} to {b}')
 result=[goal]
 while result[-1]!=start:result.append(prev[result[-1]])
 raw=[nodes[q] for q in reversed(result)]
 # Keep collision-safe grid polylines, reducing only collinear vertices.
 out=[raw[0]]
 for i in range(1,len(raw)-1):
  d1=(round(raw[i][0]-raw[i-1][0],3),round(raw[i][1]-raw[i-1][1],3));d2=(round(raw[i+1][0]-raw[i][0],3),round(raw[i+1][1]-raw[i][1],3))
  if d1!=d2:out.append(raw[i])
 if raw[-1]!=out[-1]:out.append(raw[-1])
 return out
actors=[]
DURATION=360
def track(id,role,variant,stops,offset=0,mobility=None,follow=None):
 # Stops: x,z,action,dwell,heading. All routes close through the same navigation graph.
 pts=[snap((s[0],s[1])) for s in stops]
 legs=[];clock=0
 for i,s in enumerate(stops):
  p=pts[i];n=pts[(i+1)%len(pts)]
  legs.append(dict(start=round(clock,4),end=round(clock+s[3],4),action=s[2],path=[p,p],zoneId=zone(p),heading=s[4] if len(s)>4 else 0))
  clock+=s[3]
  if math.dist(p,n)>.01:
   path=route(p,n);length=sum(math.dist(a,b) for a,b in zip(path,path[1:]));sec=length/(.62 if mobility else .78)
   legs.append(dict(start=round(clock,4),end=round(clock+sec,4),action='walk',path=path,zoneId=zone(p),heading=0));clock+=sec
 if clock>DURATION:raise ValueError(f'{id} loop too long: {clock}')
 # Continue the opening activity until the seamless return to zero.
 legs.append(dict(start=round(clock,4),end=DURATION,action=stops[0][2],path=[pts[0],pts[0]],zoneId=zone(pts[0]),heading=stops[0][4] if len(stops[0])>4 else 0))
 a=dict(id=id,role=role,variant=variant,label=f'{role.replace("-"," ").title()} {variant+1}',offset=offset,levelId='ground',segments=legs)
 if mobility:a['mobility']=mobility
 if follow:a['follow']=follow
 actors.append(a);return a
def stationary(id,role,variant,x,z,action='consult',heading=0,zoneId=None,level='ground',offset=0):
 p=(x,z) if level!='ground' else snap((x,z),zoneId)
 a=dict(id=id,role=role,variant=variant,label=role.replace('-',' ').title(),offset=offset,levelId=level,segments=[dict(start=0,end=180,action=action,path=[p,p],zoneId=zoneId or zone(p),heading=heading),dict(start=180,end=DURATION,action='greet' if action=='consult' else action,path=[p,p],zoneId=zoneId or zone(p),heading=heading)])
 actors.append(a);return a

# Escort: two independently navigable tracks share visit milestones; no horizontal offsets through walls.
p=track('member-escort','participant',0,[(-12.8,-.6,'greet',24,0),(-10.1,-11,'idle',45,1.4),(-12.8,-.6,'greet',15,0),(-12.5,13.7,'exercise',50,1.5)],mobility='cane')
track('aide-escort','aide',1,[(-12,-.6,'greet',24,3.14),(-10.0,-12.0,'treat',45,-1.4),(-12,-.6,'greet',15,3.14),(-12.5,14.6,'exercise',50,1.5)])['pairedWith']='member-escort'
# Clinical team and participant consultations.
track('doctor-01','doctor',0,[(-12.3,-8.0,'consult',58,-1.57),(-10,-7.7,'document',35,-1.4)],offset=40)
stationary('member-clinic','participant',1,-13.3,-8.0,'idle',1.57)
stationary('doctor-02','doctor',1,-2.8,-8.0,'consult',1.5)
stationary('member-consult','participant',2,-1.8,-9.3,'idle',-.3)
track('nurse-01','nurse',0,[(-10,-10,'treat',42,-1.5),(-10,-4.0,'document',35,0)],offset=90)
stationary('nurse-02','nurse',3,-7.8,-11.9,'document',1.5)
# Shared rehabilitation movement and tabletop occupational-therapy task.
track('member-pt','participant',3,[(-22.8,20.6,'exercise',45,0),(-22.8,23.5,'idle',25,3.14)],offset=35,mobility='walker')
track('physical-therapist','pt',0,[(-23.8,20.6,'exercise',45,0),(-23.8,23.5,'consult',25,3.14)],offset=35)['pairedWith']='member-pt'
stationary('occupational-therapist','ot',1,-24,14.5,'tabletop',0)['seated']=True
stationary('member-ot','participant',4,-24,16.0,'tabletop',math.pi)['seated']=True
if m.get('interiorReview'):
 # Fixed interactions attach to actual furniture, avoiding navigation snapping
 # a seated patient to an arbitrary nearby piece of free floor.
 for actorid,objectid,heading in [('member-consult','clinic-exam-05-recliner',0),('nurse-02','clinic-nurse-task-chair-0',math.pi/2),('occupational-therapist','rehab-ot-chair-therapist',0),('member-ot','rehab-ot-chair-participant',math.pi)]:
  a=next(a for a in actors if a['id']==actorid);o=next(o for o in m['objects'] if o['id']==objectid);a['seatId']=objectid;a['seated']=True
  for s in a['segments']:s.update(path=[[o['position'][0],o['position'][2]]]*2,heading=heading)
 doctor=next(a for a in actors if a['id']=='doctor-02')
 for s in doctor['segments']:s.update(path=[[-3.12,-8.83]]*2,heading=math.pi/2)
track('aide-02','aide',2,[(-23.8,20.8,'greet',30,0),(-26,24,'consult',38,1.5)],offset=120)
# Activities, social connection, walking and food service.
track('activities-lead','activities',0,[(-11.3,14.8,'exercise',60,1.5),(-11.9,18,'greet',25,1.5)],offset=0)
track('member-walk','participant',2,[(-1.4,10,'idle',20,3.14),(-1.4,23.5,'greet',30,3.14),(-11.7,24,'idle',25,0),(-11.8,16,'exercise',40,1.57)],offset=110)
track('member-social','participant',5,[(-2.4,15,'greet',30,1.57),(-4.0,17.3,'exercise',45,0)],offset=35)
stationary('member-group-01','participant',6,-10.6,15.9,'exercise',1.57)
stationary('member-group-02','participant',7,-9.1,16.8,'exercise',1.57)
stationary('member-wheelchair','participant',8,-7.7,18.2,'tabletop',0)['mobility']='wheelchair'
stationary('care-aide-03','aide',4,-8.5,18.4,'consult',1.57)
stationary('social-worker','social-worker',2,10.8,24.3,'consult',-1.57,zoneId='admin')
stationary('member-support','participant',9,9.7,24.3,'idle',1.57,zoneId='admin')
stationary('receptionist','reception',1,-8.1,1.0,'greet',-1.57,zoneId='lobby')
track('food-service-01','nutrition',1,[(3.8,5.9,'serve',40,1.57),(6.2,2.0,'serve',25,0)],offset=70)
stationary('food-service-02','nutrition',2,10.0,4.8,'serve',0,zoneId='kitchen')
# Seat anchors are the existing furniture, so seated people don't acquire duplicate chairs.
for i,(chairid,role,act) in enumerate([('day-diamond-table-04-chair-1','participant','tabletop'),('day-diamond-table-04-chair-2','participant','tabletop'),('dining-table-01-chair-1','participant','seated'),('dining-table-01-chair-3','participant','seated'),('upperfit-chair-bank-0-0--1','coordinator','document'),('upperfit-chair-bank-0-1--1','coordinator','document'),('upperfit-chair-bank-1-0--1','social-worker','document')]):
 o=next(o for o in m['objects'] if o['id']==chairid)
 a=dict(id=f'seated-{i}',role=role,variant=i+2,label='Participant' if role=='participant' else role.replace('-',' ').title(),offset=i*9,levelId=o['levelId'],seatId=o['id'],seated=True,segments=[dict(start=0,end=DURATION,action=act,path=[[o['position'][0],o['position'][2]]]*2,zoneId=o['zoneId'],heading=o['rotation']+math.pi)])
 actors.append(a)
# Drivers remain outside on authored parking paths. No unverified boarding mechanism is animated.
for i,x in enumerate([-19.5,-17.6]):
 path=[[x,-3.0],[x,1.5],[-16.0,1.5],[-16.0,-.6]]
 actors.append(dict(id=f'driver-{i+1}',role='driver',variant=i,label=f'Driver {i+1}',offset=i*125,levelId='site',segments=[dict(start=0,end=30,action='greet',path=[path[0]]*2,zoneId='site',heading=1.57),dict(start=30,end=55,action='walk',path=path,zoneId='site',heading=0),dict(start=55,end=85,action='greet',path=[path[-1]]*2,zoneId='site',heading=1.57),dict(start=85,end=110,action='walk',path=path[::-1],zoneId='site',heading=0),dict(start=110,end=DURATION,action='idle',path=[path[0]]*2,zoneId='site',heading=1.57)]))

# Expand the center's existing closed tracks into a shared twelve-minute care-day clock.
from copy import deepcopy
for a in actors:
 original=deepcopy(a['segments'])
 a['segments'] += [{**s,'start':s['start']+360,'end':s['end']+360} for s in original]
 a['profileId']=a['id']
DURATION=720
actors[:]=[a for a in actors if a['role']!='driver']
# Two stable front-desk colleagues, behind the existing reception counters.
r=next(a for a in actors if a['id']=='receptionist')
for s in r['segments']:s.update(path=[[-7.9,.3]]*2,heading=-math.pi/2)
r['label']='Front desk · Jade'
stationary('receptionist-02','reception',4,-8.6,1.65,'greet',-math.pi/2,zoneId='lobby')['label']='Front desk · Robin'

interactions=[]
def interaction(id,label,category,ids,start,end,zoneId,description):
 interactions.append(dict(id=id,label=label,category=category,actorIds=ids,start=start,end=end,zoneId=zoneId,description=description))
def make_arrival(id,label,variant,mobility,van,start,board,visits,escort=None):
 global nodes
 original_nodes=nodes
 clearance=.37 if mobility=='wheelchair' else .33 if mobility=='walker' else .26
 nodes={k:p for k,p in original_nodes.items() if clear(p,clearance)}
 # Fixed boarding and entrance geometry follows the owner's described right-turn approach.
 legs=[];clock=0;pos=[-20.31,2.535];height=.35
 def leg(end,title,action,path=None,heights=None,visible=True,zoneId='site',heading=0):
  nonlocal clock,pos,height
  path=path or [pos,pos];heights=heights or [height]*len(path)
  legs.append(dict(start=round(clock,4),end=round(end,4),action=action,path=path,heights=heights,visible=visible,title=title,zoneId=zoneId,heading=heading,vehicleId=van))
  clock=end;pos=list(path[-1]);height=heights[-1]
 def travel(path,title,heights=None,seconds=None,zoneId='lobby'):
  length=sum(math.dist(a,b) for a,b in zip(path,path[1:]));leg(clock+(seconds or length/.64),title,'roll' if mobility=='wheelchair' else 'walk',path,heights,zoneId=zoneId)
 leg(start,'Riding to Seen Health','ride',visible=False)
 travel([pos,[-20.31,5.435]],'Unload on van ramp',[.35,-.23],seconds=12,zoneId='site')
 travel([pos,[-17,5.435],[-15.518,5.5]],'Meet escort · approach ramp',[-.23]*3,seconds=12,zoneId='site')
 travel([pos,[-15.518,-.992]],'Up the wheelchair ramp',[-.23,0],seconds=18,zoneId='site')
 entry=list(snap((-14,-.992)))
 travel([pos,[-14.653121,-.992],entry],'Turn right · sliding entrance',[0]*3,seconds=5)
 desk=list(snap((-10.3,.3 if variant%2==0 else 1.7)))
 travel(route(pos,desk),'Walk to reception')
 checkin=clock;leg(clock+18,'Front desk greeting & check-in','greet',zoneId='lobby',heading=math.pi/2)
 receptionist='receptionist' if variant%2==0 else 'receptionist-02'
 ids=[id]+([escort] if escort else [])
 interaction(id+'-arrival',label+' · arrival','arrivals',ids+['driver-'+('1' if van=='van-a' else '2')],start,checkin,'site','Van ramp, escort handoff, accessible approach, right turn and sliding entrance.')
 interaction(id+'-checkin',label+' · check-in','arrivals',ids+[receptionist],checkin,clock,'lobby','Greeting and registration with one of two front-desk colleagues.')
 for j,(target,title,action,dwell,staff,category) in enumerate(visits):
  dest=list(snap(target));travel(route(pos,dest),'Escort to '+title.lower());begin=clock
  leg(clock+dwell,title,action,zoneId=zone(dest),heading=1.5)
  interaction(id+'-visit-'+str(j),label+' · '+title,category,ids+staff,begin,clock,zone(dest),'Representative care-day interaction. Appointment categories reflect the Orbit review; timings and cast are illustrative.')
 # Return to reception and wait for the named vehicle's pickup window.
 travel(route(pos,desk),'Return to front desk')
 exitpath=route(pos,entry)+[[-14.653121,-.992],[-15.518,-.992],[-15.518,5.5],[-17,5.435],[-20.31,5.435],[-20.31,2.535]]
 exitheights=[0]*len(route(pos,entry))+[0,0,-.23,-.23,-.23,.35]
 duration=sum(math.dist(a,b) for a,b in zip(exitpath,exitpath[1:]))/.64
 depart=board-duration
 if depart<clock:raise ValueError(f'{id} needs {clock-depart:.1f} more seconds before pickup')
 leg(depart,'Await confirmed pickup','idle',zoneId='lobby',heading=math.pi/2)
 travel(exitpath,'Escorted departure · board van',exitheights,seconds=duration)
 interaction(id+'-departure',label+' · journey home','arrivals',ids,depart,board,'site','Return through the sliding entrance and accessible ramp, then board the waiting van.')
 leg(DURATION,'Riding home','ride',visible=False)
 a=dict(id=id,label=label,role='participant',variant=variant,profileId=id,levelId='ground',offset=0,segments=legs)
 if mobility:a['mobility']=mobility
 if mobility=='wheelchair' and escort:a['assisted']=True
 actors.append(a)
 if escort:
  actors.append(dict(id=escort,label='CNA · '+('Alex' if escort.endswith('a') else 'Sam'),role='aide',variant=variant+1,profileId=escort,offset=0,levelId='ground',segments=deepcopy(legs),escortFor=id))

 nodes=original_nodes

make_arrival('arrival-walker','Morgan · walker',10,'walker','van-a',46,568,[((-23.8,19.4),'Physical therapy','exercise',45,['physical-therapist'],'rehab'),((-11.8,16),'Group movement','exercise',38,['activities-lead'],'activities')])
make_arrival('arrival-cane','Lin · cane + escort',11,'cane','van-a',66,586,[((-10,-11),'Nursing visit','idle',42,['nurse-01'],'clinical'),((-12.5,13.7),'Social activities','greet',38,['activities-lead'],'activities')],'arrival-aide-a')
make_arrival('arrival-independent','Jordan · independent',12,None,'van-b',176,680,[((-10.6,17),'Group exercise','exercise',40,['activities-lead'],'activities'),((-1.4,10),'Social time','greet',35,[],'activities')])
make_arrival('arrival-wheelchair','Avery · wheelchair + escort',13,'wheelchair','van-b',196,698,[((-25,16),'Occupational therapy','tabletop',45,['occupational-therapist'],'rehab'),((-12.5,13.7),'Supported activities','greet',32,['activities-lead'],'activities')],'arrival-aide-b')
# Drivers meet the ramp at both transport windows. Ride segments remain inside the vehicle.
for i,(unload,board) in enumerate([((42,108),(550,590)),((172,238),(662,702))]):
 point=[-21.25,5.55];segs=[];clock=0
 for begin,end,title in [(unload[0],unload[1],'Ramp unloading & handoff'),(board[0],board[1],'Safe boarding & departure')]:
  segs.append(dict(start=clock,end=begin,action='ride',path=[point]*2,zoneId='site',heading=1.57,visible=False,vehicleId='van-'+('a' if i==0 else 'b'),title='Driving the van'))
  segs.append(dict(start=begin,end=end,action='greet',path=[point]*2,heights=[-.23]*2,zoneId='site',heading=1.57,visible=True,title=title,vehicleId='van-'+('a' if i==0 else 'b')));clock=end
 segs.append(dict(start=clock,end=DURATION,action='ride',path=[point]*2,zoneId='site',heading=1.57,visible=False,vehicleId='van-'+('a' if i==0 else 'b'),title='Driving the van'))
 actors.append(dict(id=f'driver-{i+1}',label='Driver · '+('Casey' if i==0 else 'Taylor'),role='driver',variant=i,profileId=f'driver-{i+1}',offset=0,levelId='site',segments=segs))
# Shared interaction tracks cover the rest of the center as well as arrivals.
for id,label,category,ids,zoneid in [('pt-team','PT · supported mobility','rehab',['physical-therapist','member-pt'],'rehab'),('ot-team','OT · everyday tasks','rehab',['occupational-therapist','member-ot'],'rehab'),('clinical-team','Doctor consultation','clinical',['doctor-01','member-clinic'],'clinic'),('escorted-care','CNA · clinical escort','clinical',['aide-escort','member-escort'],'clinic'),('group-team','Group exercise & connection','activities',['activities-lead','member-group-01','member-group-02'],'day'),('meal-team','Shared meal & food service','meals',['seated-2','seated-3','food-service-01'],'dining'),('support-team','Social-work conversation','coordination',['social-worker','member-support'],'admin'),('admin-team','Upstairs care coordination','coordination',['seated-4','seated-5','seated-6'],'upper-office')]:
 interaction(id,label,category,ids,0,720,zoneid,'Continuous composite interaction track; select a person to inspect their individual activity stages.')
# Synchronized day-room repertoire: the same cast remains recognizable across every activity.
interactions[:]=[i for i in interactions if i['id']!='group-team']
for station in program['stations']:
 a=next(a for a in actors if a['id']==station['actorId'])
 a['offset']=0;a['segments']=[];a['programMode']=station['mode']
 for session in program['programs']:
  mode=station['mode'];action=session['leaderAction'] if mode=='leader' else 'consult' if mode=='support' else session['action']
  seated=mode in ['chair','wheelchair'] or (mode=='leader' and action in ['write','craft','device']) or (mode=='standing' and session['action'] not in ['exercise','dance','tai-chi'])
  a['segments'].append(dict(start=session['start'],end=session['end'],action=action,path=[station['position']]*2,zoneId='day',heading=station['heading'],seated=seated,title=session['label']+' · '+{'leader':'facilitate','support':'individual assistance','standing':'standing / seated choice','chair':'chair-based participation','wheelchair':'wheelchair participation'}[mode]))
for session in program['programs']:
 interaction('day-'+session['id'],session['title'],'activities',[s['actorId'] for s in program['stations']],session['start'],session['end'],'day',session['culture']+' '+session['access'])
# Quiet creative tables stay available alongside the shared front-of-room program.
for id in ['seated-0','seated-1']:
 a=next(a for a in actors if a['id']==id);a['offset']=0;base=a['segments'][0]
 a['segments']=[dict(base,start=p['start'],end=p['end'],action='write' if i%2==0 else 'craft',title='Quiet table · '+('calligraphy' if i%2==0 else 'arts & crafts')) for i,p in enumerate(program['programs'])]
interaction('quiet-creative-table','Quiet creative table · choose your pace','activities',['seated-0','seated-1'],0,720,'day','Calligraphy and arts remain available alongside group sessions; participants may choose a quieter activity.')
for a in actors:
 a['profileId']=a['id']
 if a['id'].startswith('arrival-'):continue
 if a['label'].startswith('Participant'):a['label']='Participant · '+a['id'].replace('member-','').replace('seated-','table ')
 for s in a['segments']:s.setdefault('title',s['action'].replace('walk','Walk to next activity').replace('document','Documentation').replace('tabletop','Tabletop activity').replace('treat','Clinical care').replace('consult','Conversation').replace('exercise','Movement & exercise').replace('serve','Meal service').replace('seated','Shared meal').replace('greet','Greeting').replace('idle','Rest & connection').capitalize())
data=dict(version='2.0',duration=DURATION,dayStartMinutes=480,dayDurationMinutes=480,description='Continuous composite care-day loop with van arrivals, ramp access and person/interaction tracks. Stable composite identities; no live participant records.',timing='Twelve-minute repeating overview of a representative 8 AM–4 PM care day. Playback time is compressed and all visit times are illustrative.',navigation=dict(cellSize=STEP,wallClearance=.21,furnitureClearance=.19,status='Interior routes follow modeled wall openings. Accessible arrival sequence follows the owner-described approach; ramp dimensions and vehicle mechanism are illustrative.'),actors=actors,interactions=interactions,roles=sorted(set(a['role'] for a in actors)),evidence=['Read-only Orbit review: three participant schedules and 30 bookings plus linked orders/comments.','Therapy, clinical visits, social-work, transport and escort categories are based on the reviewed workflow records.','Owner-described arrival: van ramp, staff escort, accessible approach with one right turn, sliding entrance and two front desk people.','Profiles, staffing, gestures and compressed timing are illustrative. Upper-floor connections are not animated.'])
for relative in ['app/data/activity-loop.json','public/models/activity-loop.json']:
 (ROOT/relative).write_text(json.dumps(data,indent=2)+'\n')
library=json.loads((ROOT/'app/data/character-templates.json').read_text())
profiles={p['id']:p for p in library['people']}
for a in actors:
 if a['id'] not in profiles:
  profiles[a['id']]=dict(id=a['id'],variant=a['variant'],skin=['#edb083','#bd805a','#f2bd94','#9b6647'][a['variant']%4],hair='#e7e4d8' if a['role']=='participant' else '#253f48',hairStyle=a['variant']%3,glasses=a['variant']%3==0,accent=['#b75e42','#3d7776','#cf9362','#658085'][a['variant']%4],height=.96 if a['role']=='participant' else 1)
for a in actors:
 if a['role']!='participant':profiles[a['id']]['accent']=library['roles'][a['role']]['color']
 profiles[a['id']]['role']=a['role']
library['people']=[profiles[a['id']] for a in actors]
for relative in ['app/data/character-templates.json','public/models/character-templates.json']:(ROOT/relative).write_text(json.dumps(library,indent=2)+'\n')
print(f'Authored {len(actors)} people, {len(interactions)} interactions and {sum(len(a["segments"]) for a in actors)} stages.')
