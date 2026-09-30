"""Room-by-room revision using vector wall/door evidence and explicit furniture layouts.
Baselines preserve source registration; this script is repeatable and only updates Olympic/Alveare.
"""
from pathlib import Path
import json,math,copy
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/models';SRC=ROOT/'sources/additional-sites';PP=math.pi
BASE=json.loads((OUT/'seen-alhambra-planning.json').read_text());SEED=json.loads((SRC/'room-review-baseline.json').read_text())
def rect(a,b,c,d):return [[a,b],[c,b],[c,d],[a,d]]
def inside(q,p):
 odd=False
 for a,b in zip(p,p[1:]+p[:1]):
  if (a[1]>q[1])!=(b[1]>q[1]) and q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0]:odd=not odd
 return odd
def segdist(q,a,b):
 v=[b[k]-a[k] for k in [0,1]];n=sum(x*x for x in v);t=max(0,min(1,sum((q[k]-a[k])*v[k] for k in [0,1])/n)) if n else 0
 return math.dist(q,[a[k]+v[k]*t for k in [0,1]])
class Review:
 def __init__(self,key):
  self.key=key;self.m=json.loads((OUT/f'seen-{key}.json').read_text());self.s=self.m['calibration']['pixelsPerMeter'];self.origin=self.m['calibration']['sourcePixelOrigin'];self.level='ground'
  self.m.update(copy.deepcopy(SEED[key]));self.raw={};self.walls=[];self.doors=[];self.n=0
  for r in self.m['rooms']:
   self.raw[r['id']]=[[p[0]*self.s+self.origin[0]+(322 if r['levelId']=='upper' else 0),p[1]*self.s+self.origin[1]+(20 if r['levelId']=='upper' else 0)] for p in r['polygon']]
  self.m['objects']=[o for o in self.m['objects'] if o['zoneId']=='site'];self.m['assets']=copy.deepcopy(BASE['assets']);self.m['walls']=[];self.m['floorOpenings']=[];self.m['verticalConnections']=[]
  self.m['revision']='2026-09-22 · Room-by-room drawing review';self.m['reviewVersion']=2
  self.m['materials'].update({'review-stainless':{'color':'#b6c1be','roughness':.35,'metalness':.65},'review-door':{'color':'#d7c5a2','roughness':.7},'review-divider':{'color':'#a4bfb6','roughness':.7}})
  self.asset('review-desk','desk',[1.524,.74,.6096],'oak');self.asset('review-table','table',[1.524,.74,.762],'photo-marble');self.asset('review-counter','counter',[1,.89,.6],'oak');self.asset('review-lowcounter','quartz-counter',[1,.74,.6],'photo-white');self.asset('review-monitor','clinical-monitor',[.48,.40,.13],'photo-white');self.asset('review-treadmill','rehab-stepper',[.78,1.30,1.7],'photo-teal')
 def point(self,q,level=None):
  lv=level or self.level;offset=[322,40] if lv=='upper' else [0,0]
  return [round((q[k]-self.origin[k]-offset[k])/self.s,5) for k in [0,1]]
 def room(self,id,bounds=None,name=None,kind=None):
  rid=self.level+'-'+id;r=next((x for x in self.m['rooms'] if x['id']==rid),None)
  if r is None:
   r={'id':rid,'name':name or id,'levelId':self.level,'zoneId':self.level+'-floor','kind':kind or 'support','floorMaterial':'wood','referencePages':[1 if self.level=='ground' else 2],'status':'Drawing reviewed','notes':''};self.m['rooms'].append(r)
  if bounds is not None:self.raw[rid]=rect(*bounds) if len(bounds)==4 and isinstance(bounds[0],(int,float)) else bounds
  r['polygon']=[self.point(q) for q in self.raw[rid]]
  if name:r['name']=name
  if kind:r['kind']=kind
  r['status']='Room-by-room drawing review'
  r['notes']='Room boundary and entrance reviewed against the supplied plan. Furniture symbols are followed where drawn; unshown equipment is a proposed Seen fit-out.'
  return r
 def remove(self,*ids):
  ids={self.level+'-'+i for i in ids};self.m['rooms']=[r for r in self.m['rooms'] if r['id'] not in ids]
  for i in ids:self.raw.pop(i,None)
 def asset(self,id,kind,dim,mat='oak',**kwargs):self.m['assets'][id]={'kind':kind,'dimensions':dim,'material':mat,**kwargs};return id
 def obj(self,asset,x,y,room=None,rot=0,scale=(1,1,1),h=0,layer='furniture',status='Plan symbol / shared Seen asset'):
  self.n+=1;p=self.point([x,y]);rid=self.level+'-'+room if room and not room.startswith(self.level+'-') else room
  item={'id':f'{self.key}-review-{self.n}','assetId':asset,'zoneId':self.level+'-floor','levelId':self.level,'roomId':rid,'position':[p[0],h,p[1]],'rotation':rot,'scale':list(scale),'referencePages':[1 if self.level=='ground' else 2],'status':status,'notes':'Room review against architectural plan; asset finish and product details reused from Seen catalog.','layer':layer}
  self.m['objects'].append(item);return item
 def box(self,id,x,y,w,d,h,room=None,mat='oak',base=0,layer='furniture'):
  self.asset(id,'box',[w/self.s,h,d/self.s],mat);return self.obj(id,x,y,room,h=base,layer=layer)
 def counter(self,x,y,w,d,room,high=.89,mat='oak'):
  id=f'{self.key}-counter-{self.n}';self.asset(id,'counter',[w/self.s,high,d/self.s],mat);return self.obj(id,x,y,room)
 def chair(self,x,y,room,rot=0,task=False):return self.obj('photo-clinic-task-chair' if task else 'photo-dining-chair',x,y,room,rot)
 def workstation(self,x,y,room,rot=0,w=1.524,d=.6096):
  self.obj('review-desk',x,y,room,rot,scale=(w/1.524,1,d/.6096));shift=(d/2+.36)*self.s
  self.chair(x+math.sin(rot)*shift,y+math.cos(rot)*shift,room,rot,True)
 def table(self,x,y,room,w=1.2,d=1.2,chairs=4):
  self.obj('review-table',x,y,room,scale=(w/1.524,1,d/.762))
  for dx,dy,r in [(0,-d/2-.32,PP),(0,d/2+.32,0),(-w/2-.32,0,-PP/2),(w/2+.32,0,PP/2)][:chairs]:self.chair(x+dx*self.s,y+dy*self.s,room,r)
 def cabinet(self,x,y,room,rot=0):self.obj('cabinet',x,y,room,rot)
 def partition(self,a,b,h=None,status='Vector-traced partition',thickness=.13):self.walls.append({'level':self.level,'a':a,'b':b,'h':h or (3.05 if self.level=='ground' else 2.85),'status':status,'thickness':thickness})
 def trace(self,level,axes=None):
  self.level=level;v=json.loads((SRC/f'{self.key}-{level}-vectors.json').read_text())
  for i,a in enumerate(v['doors']):
   if self.key=='alveare' and i in [45,46,47,48,49,50,51]:continue # Off-footprint existing Phase 1 / annotation arcs.
   if axes:
    axis=axes[i];q1,q2=a['a'],a['b'];k=0 if axis=='x' else 1
    a['closed'],a['open']=(q1,q2) if abs(q1[k]-a['hinge'][k])<abs(q2[k]-a['hinge'][k]) else (q2,q1)
   a.update(level=level,id=f'{self.key}-{level}-door-{i}');self.doors.append(a)
  for aa,bb,_ in v['walls']:
   if self.key=='olympic' and level=='ground' and abs(aa[1]-524)<5 and abs(bb[1]-524)<5 and min(aa[0],bb[0])>973 and max(aa[0],bb[0])<1148:continue
   # Keep partitions, exclude short drafting marks, wall tags, and parking hatch.
   if self.key=='alveare':
    mid=[(aa[k]+bb[k])/2 for k in [0,1]]
    polys=[p for id,p in self.raw.items() if not id.endswith('parking')]
    if not any(min(segdist(mid,c,d) for c,d in zip(p,p[1:]+p[:1]))<5 for p in polys):continue
   self.partition(aa,bb)
 def architecture(self):
  # Consolidate adjacent parallel wall faces into their centerline and true thickness.
  grouped={};other=[]
  for w in self.walls:
   a,b=w['a'],w['b'];dx,dy=b[0]-a[0],b[1]-a[1]
   axis=0 if abs(dy)<.15 else 1 if abs(dx)<.15 else None
   if axis is None:other.append(w);continue
   coord=(a[1-axis]+b[1-axis])/2;key=(w['level'],axis,w['h'],w['status'])
   grouped.setdefault(key,[]).append((coord,min(a[axis],b[axis]),max(a[axis],b[axis]),w))
  merged=[]
  for (lv,axis,h,status),ls in grouped.items():
   clusters=[]
   for l in sorted(ls,key=lambda q:q[:3]):
    if not clusters or l[0]-clusters[-1][0][0]>4.1:clusters.append([l])
    else:clusters[-1].append(l)
   for cluster in clusters:
    lo=min(x[0] for x in cluster);hi=max(x[0] for x in cluster);coord=(lo+hi)/2;ints=[]
    for _,a,b,w in sorted(cluster,key=lambda x:x[1]):
     if ints and a<=ints[-1][1]+.5:ints[-1][1]=max(b,ints[-1][1])
     else:ints.append([a,b])
    for a,b in ints:
     aa=[a,coord] if axis==0 else [coord,a];bb=[b,coord] if axis==0 else [coord,b]
     merged.append({'level':lv,'a':aa,'b':bb,'h':h,'status':status,'thickness':max(.11,(hi-lo)/self.s)})
  for w in merged+other:
   self.level=w['level'];a,b=w['a'],w['b'];length=math.dist(a,b)
   if length<2:continue
   v=[(b[k]-a[k])/length for k in [0,1]];gaps=[]
   if self.key=='olympic' and self.level=='ground' and abs(a[1]-524)<5 and abs(b[1]-524)<5:
    ts=[(x-a[0])*v[0] for x in [974,1147]];gaps.append([min(ts),max(ts)])
   for door in self.doors:
    if door['level']!=self.level:continue
    c,d=door['hinge'],door['closed'];dv=[d[k]-c[k] for k in [0,1]];dl=math.hypot(*dv)
    if abs(sum(dv[k]*v[k] for k in [0,1]))/dl<.98:continue
    perp=lambda q:abs((q[0]-a[0])*v[1]-(q[1]-a[1])*v[0])
    if max(perp(c),perp(d))>4.5:continue
    ts=[sum((q[k]-a[k])*v[k] for k in [0,1]) for q in [c,d]];gaps.append([min(ts)-1.3,max(ts)+1.3])
   ints=[[0,length]]
   for lo,hi in gaps:
    ints=[q for x,y in ints for q in ([[x,min(y,lo)]] if lo>x else [])+([[max(x,hi),y]] if hi<y else []) if q[1]-q[0]>1]
   for x,y in ints:
    aa=self.point([a[k]+v[k]*x for k in [0,1]]);bb=self.point([a[k]+v[k]*y for k in [0,1]])
    self.m['walls'].append({'id':f'{self.key}-review-wall-{len(self.m["walls"])}','zoneId':self.level+'-floor','levelId':self.level,'a':aa,'b':bb,'height':w['h'],'thickness':w['thickness'],'material':'wall','status':w['status'],'referencePages':[1 if self.level=='ground' else 2]})
  for door in self.doors:
   self.level=door['level'];c=door['hinge'];closed,op=door['closed'],door['open'];aid=door['id']
   self.asset(aid,'plan-door',[door['radius']/self.s,2.13,.043],'review-door',parameters={'closedAngle':math.atan2(closed[1]-c[1],closed[0]-c[0]),'openAngle':math.atan2(op[1]-c[1],op[0]-c[0])})
   self.obj(aid,*c,layer='architecture',status='Hinge and swing traced from source curve')
  self.m['doorSchedule']=[{'id':d['id'],'levelId':d['level'],'hinge':self.point(d['hinge'],d['level']),'closed':self.point(d['closed'],d['level']),'open':self.point(d['open'],d['level']),'width':d['radius']/self.s} for d in self.doors]
 def simple_room(self,id):
  r=self.room(id);p=self.raw[r['id']];l=min(q[0] for q in p);rr=max(q[0] for q in p);t=min(q[1] for q in p);b=max(q[1] for q in p);cx=(l+rr)/2;cy=(t+b)/2;s=self.s;k=r['kind']
  if k in ['storage','support']:
   if 'electrical' in id or id=='idf':
    self.box(self.key+'-panel-'+id,cx,t+5,rr-l-16,5,1.6,id,mat='photo-silver',base=.3)
   else:self.obj('upperfit-storage-rack',cx,t+.4*s,id,scale=(min(1,(rr-l-10)/(1.5*s)),1,1))
  elif k in ['office','work','counsel']:
   self.workstation(cx,t+.5*s,id,w=min(1.5,(rr-l)/s-.2));self.chair(cx,b-.45*s,id,PP)
  elif k=='conference':
   self.table(cx,cy,id,w=1.0,d=min(1.8,(b-t)/s-1.3))
  elif k=='quiet':
   self.obj('photo-lounge-chair',l+.6*s,cy,id,-PP/2);self.obj('plan-lounge-table',rr-.6*s,cy,id)
 def bath(self,id,toilet,basin,tr=0,br=0,shower=None):
  self.obj('toilet',*toilet,id,tr);self.obj('basin',*basin,id,br)
  if shower:self.obj('access-shower',*shower,id)
 def finish(self):
  self.architecture();self.level='ground'
  used={o['assetId'] for o in self.m['objects']};self.m['assets']={k:v for k,v in self.m['assets'].items() if k in used}
  self.m['accuracyIssues']=[i for i in self.m['accuracyIssues'] if i['id'] not in ['trace','fitout','room-review','mezzanine-review','kitchen-equipment-review','staff-review','room-elevations']]
  self.m['accuracyIssues'].insert(0,{'id':'room-review','title':'Room-by-room source review','detail':'Partition faces and door swing curves extracted from the PDF and visually reviewed. Symbolled furniture follows the drawing; unshown equipment, products, and finishes remain a proposed Seen fit-out. See the room review record for specific assumptions.','status':'Drawing reviewed','pages':[1,2] if self.key=='olympic' else [1,29]})
  self.m['calibration']['notes']='Source-scale horizontal geometry. Vector-traced door openings and partitions; room and furniture review dated September 22, 2026. Not a field survey.'
  self.m['exportFiles']['audit']='/models/room-review.md'
  (OUT/f'seen-{self.key}.json').write_text(json.dumps(self.m,indent=2)+'\n')
  for lv in self.m['levels']:
   im=Image.open(ROOT/f'public/reference/sites/{self.key}/plan-{lv["id"]}.jpg').convert('RGB');draw=ImageDraw.Draw(im)
   for w in self.m['walls']:
    if w['levelId']!=lv['id']:continue
    origin=lv['planOrigin'];qs=[(q[0]*self.s+origin[0],q[1]*self.s+origin[1]) for q in [w['a'],w['b']]];draw.line(qs,fill='#db4545',width=2)
   for d in self.doors:
    if d['level']==lv['id']:draw.line([tuple(d['hinge']),tuple(d['open'])],fill='#206bbb',width=2)
   im.save(ROOT/f'work/olympic-review/{self.key}-{lv["id"]}-review.png')
  print(self.key,len(self.m['rooms']),'rooms',len(self.m['walls']),'partitions',len(self.doors),'door leaves',len(self.m['objects']),'objects')

def olympic():
 a=Review('olympic');m=a.m;s=a.s
 # Align the existing stair/lift cores, not the differing north facade setbacks.
 m['levels'][1]['planOrigin']=[1198,650]
 m['levels'][1]['notes']='Clinic and team spaces align with the stair and elevator cores below. Floor-to-floor height is estimated at 3.8 m.'
 for z in m['zones']:
  if z['levelId']=='upper':z['polygon']=[[q[0],round(q[1]-20/s,5)] for q in z['polygon']]
 for r in list(m['rooms']):a.level=r['levelId'];a.room(r['id'].split('-',1)[1])
 a.level='ground'
 a.room('memory',[[1276,292],[1449,292],[1449,417],[1449,501],[1336,501],[1336,504],[1276,504]],'Memory care activity','memory')
 a.room('staff-memory',[1340,442,1448,501],'Memory-care staff desk','work')
 a.room('memory-wc',[[1450,417],[1524,417],[1524,501],[1477,501],[1477,473],[1450,473]],'Memory-care accessible toilet / shower','bath')
 a.room('storage-e',[[1409,504],[1524,504],[1524,631],[1450,631],[1450,571],[1409,571]])
 a.room('activities',[[893,292],[1275,292],[1275,504],[1161,504],[1161,524],[909,524],[909,435],[893,435]])
 a.room('existing-lift',[226,492,291,543],'Existing elevator','lift');a.room('shaft',[294,492,356,569],'Existing service shaft','support')
 a.room('stair-west',[222,570,356,647]);a.room('stair-east',[1452,766,1526,934])
 a.room('receiving',[1245,873,1360,932]);a.room('electrical',[1164,838,1240,932]);a.room('reception',[471,823,578,928]);a.room('vestibule',[579,823,675,928])
 a.room('servery',[1162,679,1269,702],'Servery / café','dining')
 a.room('veranda',[[594,936],[994,936],[994,1026],[699,1026],[699,985],[594,985]],'Outdoor veranda / covered-entry footprint','outdoor')
 a.room('mezz-stair',[680,437,736,480],'Short stair · +2 ft mezzanine','stair')
 axes='x y x y y y y y y y y y y y x x y y y y y y y y y x y y x x y y x x y y y x y x y x x x x x y x x x y'.split();assert len(axes)==51
 a.trace('ground',axes)
 # Existing heavy structural walls are filled paths rather than stroked new partitions.
 for b in [[226,490,356,570],[222,570,356,647]]:
  p=rect(*b)
  for x,y in zip(p,p[1:]+p[:1]):a.partition(x,y,thickness=.18)
 a.partition([292,491],[292,569]);a.partition([226,543],[292,543]);a.partition([1452,767],[1527,767]);a.partition([1452,767],[1452,934])
 for x,y in zip(SEED['olympic']['zones'][0]['polygon'],SEED['olympic']['zones'][0]['polygon'][1:]+SEED['olympic']['zones'][0]['polygon'][:1]):
  a.partition([x[k]*s+a.origin[k] for k in [0,1]],[y[k]*s+a.origin[k] for k in [0,1]],status='Exterior perimeter / source plan',thickness=.2)
 # Exact symbol groups, with clear circulation between program areas.
 for x,y,room in [(282,389,'day-west'),(1002,375,'activities'),(1002,468,'activities'),(1242,449,'activities'),(1401,338,'memory'),(815,789,'dining'),(815,877,'dining'),(934,789,'dining'),(934,877,'dining'),(1338,651,'dining')]:a.table(x,y,room)
 for x,y,r,rot in [(1299,342,'memory',-PP/2),(1299,384,'memory',-PP/2),(1332,312,'memory',PP),(815,311,'library',PP),(854,311,'library',PP),(879,347,'library',PP/2),(879,390,'library',PP/2),(1040,335,'activities',PP),(1089,334,'activities',PP),(1252,323,'activities',PP/2),(1231,363,'activities',PP/2)]:a.obj('photo-lounge-chair',x,y,r,rot)
 a.workstation(1390,456,'staff-memory');a.cabinet(1418,492,'staff-memory')
 a.obj('photo-lounge-chair',1504,381,'quiet-n',PP/2)
 for y in [782,820,859]:a.obj('photo-lounge-chair',693,y,'quiet',-PP/2)
 a.obj('photo-lounge-chair',741,909,'quiet',0)
 # Folding wall between group activities and the restaurant; the paired swing entries remain distinct.
 a.asset('olympic-operable-wall','folding-partition',[(1146-976)/s,2.7,.5],'review-divider');a.obj('olympic-operable-wall',1061,524,'activities',layer='architecture')
 a.bath('toilet-1',[1509,715],[1476,704]);a.bath('toilet-2',[1509,677],[1476,643]);a.bath('toilet-3',[1392,527],[1391,552],PP/2);a.bath('toilet-4',[702,552],[759,577],-PP/2);a.bath('toilet-5',[574,677],[541,720]);a.bath('staff-wc',[239,756],[290,783],-PP/2)
 a.bath('memory-wc',[1509,436],[1464,425],shower=[1500,487])
 for id,x in [('shower-2',450),('shower-1',530)]:
  a.obj('access-shower',x+16,310,id);a.bath(id,[x-11,355],[x-25,404],-PP/2);a.obj('bench',x+4,384,id,scale=(.65,1,1))
 for id in ['storage-e','clean','participant-storage','electrical','idf','office','eval-office','transport','dry','cold']:a.simple_room(id)
 a.table(557,580,'family',w=1.25,d=2.7)
 for x in [578,599]:a.obj('interior-plinth',x+30,324,'pt',scale=(.9,1,.85)) if x==578 else None
 a.obj('interior-plinth',724,326,'pt',scale=(.9,1,.85));a.obj('interior-stepper',624,393,'pt');a.counter(733,421,70,17,'pt');a.obj('interior-counter-sink',741,418,'pt',h=.9)
 a.obj('access-laundry',456,576,'laundry');a.obj('access-laundry',488,576,'laundry');a.counter(438,576,63,19,'laundry');a.obj('interior-counter-sink',437,576,'laundry',h=.9)
 a.counter(293,807,107,19,'staff-break');a.obj('refrigerator',238,817,'staff-break');a.table(295,858,'staff-break',w=1.15,d=.8)
 a.counter(521,840,86,18,'reception',high=1.05);a.chair(523,863,'reception',task=True);a.chair(606,686,'lobby',-PP/2);a.chair(606,726,'lobby',-PP/2)
 a.counter(1215,691,104,20,'servery',high=.9);a.box('olympic-cafe-coffee',1250,690,10,9,.45,'servery','photo-silver',base=.9)
 # A-1 defines the kitchen shell and stores but contains no appliance schedule.
 # Proposed stainless equipment is deliberately kept out of its two access paths.
 for x,y,w,d in [(1070,919,178,20),(987,842,23,120),(1078,839,85,27)]:a.counter(x,y,w,d,'kitchen',mat='review-stainless')
 a.obj('basin',1000,922,'kitchen');a.obj('refrigerator',1179,779,'kitchen');a.obj('upperfit-storage-rack',1290,915,'receiving');a.obj('interior-cart',1339,839,'cart');a.obj('interior-cart',1297,839,'cart');a.obj('basin',1378,715,'jan')
 a.box('olympic-veranda-slab',794,961,400,50,.17,'veranda','concrete',base=-.17,layer='architecture');a.box('olympic-veranda-outer-slab',846.5,1005.5,295,41,.17,'veranda','concrete',base=-.17,layer='architecture')
 # Clinic and team floor.
 a.level='upper'
 a.room('admin',[[1551,308],[1717,308],[1717,330],[1853,330],[1853,720],[1761,720],[1761,590],[1660,590],[1660,663],[1585,663],[1585,605],[1615,605],[1615,483],[1551,483]])
 a.room('clinic-reception',[[810,724],[903,724],[903,798],[869,798],[869,826],[810,826]])
 a.room('clinic-wait',[[904,724],[1017,724],[1017,826],[923,826],[923,798],[904,798]])
 a.room('crash-cart',[870,799,922,826],'Crash cart recess','support')
 a.room('pt-wait',[831,554,934,677],'PT waiting','waiting')
 a.room('providers',[979,875,1379,977]);a.room('office-clinic',[1384,875,1458,977]);a.room('clean',[1462,875,1543,977]);a.room('soiled',[[1548,898],[1566,898],[1566,875],[1616,875],[1616,977],[1548,977]])
 a.room('oxygen',[1527,875,1566,897],'Oxygen store','storage');a.room('meds',[[798,872],[889,872],[889,881],[975,881],[975,977],[798,977]])
 a.room('break',[[1412,308],[1547,308],[1547,483],[1476,483],[1476,501],[1435,501],[1435,489],[1412,489]])
 a.room('training',[[1201,308],[1410,308],[1410,489],[1307,489],[1307,510],[1240,510],[1240,489],[1201,489]])
 a.room('evaluation',[737,515,826,606]);a.room('gym-eval',[910,307,997,405],'PT evaluation bay','evaluation');a.room('gym-work',[637,474,735,530],'PT work area','work');a.room('gym-hydro',[979,407,997,532],'PT freezer / linen / hydro','support')
 a.room('gym',[[637,329],[735,329],[735,307],[909,307],[909,405],[979,405],[979,532],[827,532],[827,514],[737,514],[737,497],[637,497]])
 a.room('existing-lift',[548,532,613,582],'Existing elevator','lift');a.room('shaft',[616,532,678,608],'Existing service shaft','support')
 # Use the common shaft coordinate exactly at both stories (source deviations are documented).
 a.room('lift',[934,583,1001,675]);a.room('stair-west',[544,610,678,687]);a.room('stair-east',[1774,806,1848,974])
 axes='x x y y y y y x y y x y y y x x x x y y x x y x y y x y x y x y y y y y y y y y y y y y y y x x x y y x y x y x x'.split();assert len(axes)==57
 a.trace('upper',axes)
 for b in [[548,530,678,608],[544,610,678,687]]:
  p=rect(*b)
  for x,y in zip(p,p[1:]+p[:1]):a.partition(x,y,thickness=.18)
 a.partition([614,532],[614,608]);a.partition([548,582],[614,582]);a.partition([1774,806],[1848,806]);a.partition([1774,806],[1774,974])
 p=[[542,328],[735,328],[735,306],[1717,306],[1717,328],[1855,328],[1855,977],[542,977]]
 for x,y in zip(p,p[1:]+p[:1]):a.partition(x,y,status='Exterior perimeter / source plan',thickness=.2)
 # Reception: longitudinal counter, two staff positions; four waiting seats on the east wall.
 a.counter(896,760,18,70,'clinic-reception',high=1.06)
 for y in [740,782]:a.chair(866,y,'clinic-reception',-PP/2,True)
 for y in [740,763,786,810]:a.chair(1006,y,'clinic-wait',PP/2)
 a.obj('interior-cart',894,814,'crash-cart')
 for y in [583,629]:a.chair(917,y,'pt-wait',PP/2)
 a.obj('plan-lounge-table',917,606,'pt-wait')
 # Medication room perimeter and two refrigerated stores at the south wall.
 for x,y,w,d in [(808,920,17,81),(928,889,78,17),(966,930,17,80),(842,880,69,16)]:a.counter(x,y,w,d,'meds')
 for x in [854,891]:a.obj('refrigerator',x,962,'meds',scale=(1, .58, 1))
 a.obj('interior-counter-sink',810,923,'meds',h=.9)
 # Continuous nurses/providers workstation: same oak/quartz/teal language as Alhambra.
 for x,y,w,d in [(1005,927,20,109),(1212,968,329,19),(1371,927,17,109),(1044,885,128,21),(1227,885,156,21)]:a.counter(x,y,w,d,'providers',high=.76)
 for x in [1028,1071,1182,1227,1272]:a.chair(x,906,'providers',0,True);a.obj('review-monitor',x,885,'providers',PP,h=.76)
 for x in [1028,1071,1256,1300]:a.chair(x,952,'providers',PP,True);a.obj('review-monitor',x,968,'providers',h=.76)
 for y in [907,951]:a.chair(1353,y,'providers',PP/2,True)
 a.obj('interior-counter-sink',1133,968,'providers',h=.76);a.obj('interior-printer',1010,967,'providers',h=.76)
 # Exam rooms: alternating door corners, diagonal exam chairs and wall sinks.
 for n in range(1,11):
  id='exam-'+str(n);r=a.room(id);p=a.raw[r['id']];l=min(q[0] for q in p);t=min(q[1] for q in p);rr=max(q[0] for q in p);b=max(q[1] for q in p)
  mirror=n in [4,6];x=l+35 if mirror else rr-32;y=t+37
  a.obj('interior-exam-chair',x,y,id,PP/5 if mirror else -PP/5,scale=(.82,.9,.88));a.obj('interior-exam-sink',l+22 if mirror else rr-20,b-10,id,scale=(.9,1,1));a.obj('interior-stool',rr-13 if mirror else l+15,t+62,id)
 # Plan marks no PT equipment; provide a purposeful proposed equipment layout.
 for x,y,id in [(947,353,'gym-eval'),(785,562,'evaluation'),(584,366,'treatment')]:a.obj('interior-plinth',x,y,id);a.obj('interior-stool',x+24,y+10,id)
 for x in [710,765]:a.obj('interior-stepper',x,366,'gym');a.obj('review-treadmill',x,459,'gym',PP)
 a.obj('interior-bars',857,459,'gym',PP/2);a.obj('interior-pulley',885,340,'gym');a.obj('interior-balls',856,344,'gym');a.obj('interior-rehab-rack',970,443,'gym');a.counter(988,482,16,80,'gym-hydro');a.obj('interior-counter-sink',988,500,'gym-hydro',h=.9);a.workstation(680,498,'gym-work')
 # Break room: east-wall casework, two compact four-chair tables and breakfast stools.
 a.counter(1535,398,19,151,'break');a.obj('refrigerator',1531,467,'break');a.obj('interior-counter-sink',1535,412,'break',h=.9)
 for y in [329,356]:a.obj('photo-staff-stool',1520,y,'break',PP/2)
 for y in [329,398]:
  a.obj('review-table',1450,y,'break',scale=(1.8/1.524,1,.7/.762))
  for x in [1435,1465]:
   if y==398:a.chair(x,y-18,'break',PP)
   a.chair(x,y+18,'break')
 # Twenty-six 24 x 60 inch admin positions in source banks, not a uniform office grid.
 for y in [330,372,414,456]:a.workstation(1563,y,'admin',PP/2);a.workstation(1647,y+7,'admin',-PP/2)
 for y in [350,391,432,473]:
  a.workstation(1724,y,'admin',-PP/2);a.workstation(1747,y,'admin',PP/2)
 for y in [354,396,438,480,524,566,608,650]:a.workstation(1840,y,'admin',-PP/2)
 for x in [1686,1728]:a.workstation(x,569,'admin',PP)
 a.counter(1575,492,61,18,'reception-copy');a.obj('interior-printer',1565,492,'reception-copy',h=.9);a.workstation(1580,589,'reception-copy',PP)
 a.obj('interior-printer',1534,586,'copy');a.cabinet(1492,586,'copy')
 for id in ['meeting','conference','huddle-1','huddle-2','enrollment','office-admin','office-clinic','counsel-1','counsel-2','counsel-3','td-store','dme','clean','soiled','jan','idf','oxygen']:
  if id=='enrollment':
   a.obj('photo-lounge-chair',1507,625,id,-PP/2);a.obj('photo-lounge-chair',1507,661,id,-PP/2);a.obj('plan-lounge-table',1507,643,id)
  else:a.simple_room(id)
 for x in [1019,1067,1113]:
  for y in [350,412,474]:a.workstation(x,y,'touchdown',w=1.2,d=.6)
 for y in [340,396,452]:
  for x in [1250,1320,1380]:a.table(x,y,'training',w=1.25,d=.55,chairs=2)
 for id,c in [('phone-1',1735),('phone-2',1686)]:a.counter(c,600,35,14,id,high=.74);a.chair(c,620,id,task=True)
 for x in [1690,1731]:a.chair(x,671,'phone-3',task=True)
 a.obj('plan-lounge-table',1710,671,'phone-3')
 for id,t,b,tr in [('staff-wc-1',[1253,602],[1304,574],-PP/2),('staff-wc-2',[1253,662],[1304,625],-PP/2),('staff-wc-3',[1224,624],[1224,655],PP/2),('patient-wc-2',[1130,624],[1126,655],-PP/2),('patient-wc-3',[1102,624],[1102,655],PP/2),('patient-wc-1',[782,955],[784,914],PP/2)]:a.bath(id,t,b,tr)
 a.counter(630,952,147,20,'lab');a.obj('interior-counter-sink',681,951,'lab',h=.9);a.workstation(631,889,'lab')
 # Registered two-flight stairs and separate old/new elevator shafts.
 for id,b,kind,rotation in [('west',[222,570,356,647],'return-stair',-PP/2),('east',[1452,766,1526,934],'return-stair',PP),('new-lift',[612,543,679,635],'lift-gate',0),('existing-lift',[226,492,291,543],'lift-gate',0)]:
  a.level='ground';cx=(b[0]+b[2])/2;cy=(b[1]+b[3])/2;w=(b[2]-b[0])/s;d=(b[3]-b[1])/s;aid='olympic-core-'+id
  dims=[d-.14,4.75,w-.14] if id=='west' else [w-.14,4.75,d-.14]
  if 'lift' in id:dims=[w-.15,2.4,d-.15]
  a.asset(aid,kind,dims,'concrete' if kind=='return-stair' else 'metal',parameters={'rise':3.8});ob=a.obj(aid,cx,cy,rot=rotation,layer='architecture',status='Plan footprint; assumed floor-to-floor rise 3.8 m')
  p=a.point([cx,cy]);cid='olympic-connection-'+id;m['verticalConnections'].append({'id':cid,'objectId':ob['id'],'kind':'lift' if 'lift' in id else 'stair','fromLevel':'ground','toLevel':'upper','bottom':[p[0],0,p[1]],'top':[p[0],3.8,p[1]],'landing':[p[0],3.8,p[1]]})
  m['floorOpenings'].append({'id':'olympic-opening-'+id,'connectionId':cid,'zoneId':'upper-floor','levelId':'upper','bounds':[a.point(b[:2]),a.point(b[2:])]})
  if 'lift' in id:
   a.level='upper';a.obj(aid,cx+322,cy+40,layer='architecture')
 a.level='ground';a.asset('olympic-short-mezz-stair','connected-stair',[(480-437)/s,.6096+.95,(736-680)/s],'concrete',parameters={'rise':.6096});a.obj('olympic-short-mezz-stair',708,458.5,'mezz-stair',-PP/2,layer='architecture',status='User-confirmed rise: 2 ft / 0.6096 m; ascending west')
 # The short stair serves the western PT/shower/day wing, kept in Level 1.
 mezzpx=[[220,314],[408,314],[408,287],[780,287],[780,433],[680,433],[680,489],[220,489]];mezz=[a.point(q) for q in mezzpx]
 z=copy.deepcopy(m['zones'][0]);z.update(id='ground-mezzanine',name='Raised PT / west day wing · +2 ft',short='+2 ft',polygon=mezz,elevationOffset=.6096,slabDepth=.6096,color='#ae9364',notes='Rise confirmed by user; western raised-wing extent inferred from the short stair and needs boundary confirmation.');m['zones'].append(z)
 for r in m['rooms']:
  if r['id'] in ['ground-day-west','ground-shower-1','ground-shower-2','ground-pt']:r['zoneId']='ground-mezzanine'
 # Save before zone ownership adjustments, then repeat them on the generated wall/door records.
 a.finish()
 for w in m['walls']:
  if w['levelId']=='ground' and inside([(w['a'][k]+w['b'][k])/2 for k in [0,1]],mezz):w['zoneId']='ground-mezzanine'
 for ob in m['objects']:
  if ob['levelId']=='ground' and ob['zoneId']!='site' and ob.get('roomId')!='ground-mezz-stair' and inside([ob['position'][0],ob['position'][2]],mezz):ob['zoneId']='ground-mezzanine'
 m['accuracyIssues'].append({'id':'mezzanine-review','title':'Two-foot raised west wing','detail':'The short stair above Toilet 4 rises 2 ft westward, as confirmed by the user. PT, showers, and west day space are modeled on the raised platform. Its precise boundary is inferred pending confirmation; reception and the main day center remain at datum 0. Two full return stair cores are drawn, plus this short stair.','status':'Rise confirmed / extent inferred','pages':[1]})
 m['accuracyIssues'].append({'id':'kitchen-equipment-review','title':'Kitchen equipment','detail':'Kitchen, cold/dry stores, electrical, receiving, cart staging and servery boundaries follow A-1. The sheet does not specify cooking equipment. Stainless counters and equipment inside the kitchen are proposed, not an as-built appliance layout.','status':'Shell traced / equipment proposed','pages':[1]})
 m['accuracyIssues']=list({i['id']:i for i in m['accuracyIssues']}.values())
 (OUT/'seen-olympic.json').write_text(json.dumps(m,indent=2)+'\n')
 return a

def alveare():
 a=Review('alveare');m=a.m;s=a.s
 for r in list(m['rooms']):a.room(r['id'][7:])
 a.room('staff',[[756,577],[835,577],[835,562],[877,562],[877,644],[831,644],[831,696],[756,696]])
 a.room('stair-east',[[984,444],[1008,435],[1028,449],[1028,545],[984,545]])
 a.room('res-stair',[789,814,830,919]);a.room('res-mail',[[758,814],[828,814],[828,850],[789,850],[789,876],[758,876]])
 a.room('day',[[879,414],[906,402],[906,384],[933,376],[940,398],[971,388],[984,431],[1006,421],[1006,435],[984,444],[984,548],[986,548],[986,578],[1023,578],[1023,730],[963,730],[963,700],[910,700],[910,648],[879,648],[879,560],[838,560],[838,514],[879,514]])
 a.room('restroom-159',[799,517,836,574]);a.room('quiet',[839,517,877,556])
 a.room('quiet-storage',[838,559,877,577],'Storage below quiet room','storage')
 for id,l,r in [('nonfood-1',798,817),('nonfood-2',819,845),('nonfood-3',847,876)]:a.room(id,[l,482,r,498],'Non-food storage '+id[-1],'storage')
 a.room('jan',[[987,549],[1026,549],[1026,565],[1016,571],[1016,578],[987,578]],'161 · Janitor closet','support')
 a.room('booster',[623,749,751,767],'160 · Booster pump room','support')
 a.room('elevators',[870,790,903,832],'100 · Elevator 1','lift');a.room('elevator-2',[870,834,903,875],'Elevator 2','lift')
 a.room('garden',[[982,292],[1025,279],[1025,414],[1006,437],[984,444],[972,388]])
 a.room('rehab',[[894,943],[1023,943],[1023,1036],[926,1036],[922,1041],[914,1041],[914,1022],[894,1022]])
 a.room('lobby',[[964,733],[1023,733],[1023,779],[1017,785],[1017,843],[1023,849],[989,849],[989,897],[964,897]])
 a.room('corridor-n',[[862,331],[970,297],[981,332],[900,358],[896,357],[888,361],[905,416],[882,425],[876,415],[868,381]])
 # Arc index corrections are audited against the A2.01 door leaves, including rotated north walls.
 axes={0:'x',1:'x',3:'y',4:'x',5:'y',6:'y',7:'y',8:'y',12:'y',13:'x',14:'y',15:'y',16:'x',18:'x',19:'y',20:'y',21:'y',22:'x',23:'y',24:'y',25:'x',26:'y',27:'y',28:'x',29:'y',30:'y',31:'x',32:'y',33:'x',37:'x',40:'y',41:'y',42:'x',43:'y',44:'x'}
 a.trace('ground')
 for i,d in enumerate(a.doors):
  idx=int(d['id'].split('-')[-1])
  if idx in axes:
   k=0 if axes[idx]=='x' else 1;q1,q2=d['a'],d['b'];d['closed'],d['open']=(q1,q2) if abs(q1[k]-d['hinge'][k])<abs(q2[k]-d['hinge'][k]) else (q2,q1)
  elif idx in [2,9,10,11,17,34,35,36,38,39]:
   # North rooms follow the ~18 degree property line. Closed vectors follow
   # either that line (2,11,36,39) or its perpendicular.
   tangent=idx in [11,36,39];q1,q2=d['a'],d['b']
   def score(q):
    v=[q[k]-d['hinge'][k] for k in [0,1]]
    return abs(v[1]/(v[0] or .001))
   pick=score(q1)<score(q2) if tangent else score(q1)>score(q2)
   d['closed'],d['open']=(q1,q2) if pick else (q2,q1)
 # Non-food stores are paired cabinet doors, modeled as storage fronts rather than room passage doors.
 for id in ['nonfood-1','nonfood-2','nonfood-3','quiet-storage','storage-n','storage','res-mail','mpoe','fire-pump','electrical','booster','trash','trash-west','av']:a.simple_room(id)
 a.obj('upperfit-storage-rack',780,379,'dry',.31)
 for rid in ['ground-staff','ground-staff-office']:
  rr=next(r for r in m['rooms'] if r['id']==rid);rr['referencePages']=[29,1];rr['notes']='Mannigan ID7.10: eight 60 × 30 inch workstations, a 54-inch divider and L-shaped break casework beside the separate office. The attached furniture supplement governs this arrangement.'
 # ID7.10: six opposing 60 x 30 desks and two desks against the 54-inch divider.
 for x in [771,795,819]:a.workstation(x,601,'staff',PP,d=.762);a.workstation(x,613,'staff',0,d=.762)
 for x in [771,795]:a.workstation(x,647,'staff',PP,d=.762)
 a.partition([758,655],[807,655],h=1.3716,status='Mannigan 54-inch break-room divider');a.partition([807,641],[807,655],h=1.3716,status='Mannigan 54-inch break-room divider')
 a.counter(782.5,659,49,6,'staff',high=.91);a.counter(763,681,11,27,'staff');a.counter(790,691,64,11,'staff')
 a.obj('refrigerator',815,690,'staff',scale=(.95,1,1));a.obj('interior-counter-sink',763,681,'staff',PP/2,h=.9)
 a.box('alveare-dishwasher',763,668,11,11,.83,'staff','photo-silver')
 a.box('alveare-staff-upper-cabinets',789,693,48,5,.72,'staff','photo-white',base=1.5)
 a.box('alveare-staff-microwave',789,690,9,7,.28,'staff','photo-silver',base=.9)
 for x in [778,798]:a.obj('photo-staff-stool',x,670,'staff')
 a.obj('interior-printer',869,606,'staff',scale=(1.25,1.6,1.2));a.counter(860,567,30,10,'staff')
 a.workstation(852,675,'staff-office',w=1.6764,d=.762);a.chair(844,661,'staff-office',PP);a.chair(860,661,'staff-office',PP)
 a.cabinet(838,688,'staff-office')
 # Reception and office from enlarged A9.07; the open service counter faces the lobby.
 a.counter(955,807,12,48,'reception',high=.8636)
 for y in [794,824]:a.chair(937,y,'reception',-PP/2,True)
 a.workstation(933,884,'office');a.chair(929,864,'office',PP);a.chair(947,864,'office',PP)
 for y in [754,781]:a.obj('photo-lounge-chair',1004,y,'lobby',PP/2)
 a.obj('plan-lounge-table',1005,768,'lobby');a.obj('bench',980,881,'lobby',PP/2,scale=(.8,1,1))
 a.table(937,738,'conference',w=1.15,d=2.0)
 # A9.05 day room: staggered rotated four-person tables, then two rectangular activity tables.
 for x,y in [(924,450),(963,450),(963,482),(924,516),(963,516),(963,551),(924,582)]:
  ob=a.obj('review-table',x,y,'day',PP/4,scale=(.9/1.524,1,.9/.762))
  for ang in [PP/4,3*PP/4,5*PP/4,7*PP/4]:a.chair(x+math.cos(ang)*13,y+math.sin(ang)*13,'day',PP/2-ang)
 for y in [617,652]:
  a.obj('review-table',960,y,'day',scale=(2.2/1.524,1,1.05/.762))
  a.chair(960-1.42*s,y,'day',-PP/2);a.chair(960+1.42*s,y,'day',PP/2)
  for dx in [-.65,.65]:a.chair(960+dx*s,y-13,'day',PP);a.chair(960+dx*s,y+13,'day')
 for y in [596,622]:a.obj('photo-lounge-chair',1007,y,'day',PP/2)
 a.obj('plan-lounge-table',1008,609,'day')
 a.obj('photo-lounge-chair',852,541,'quiet',-PP/2);a.obj('plan-lounge-table',868,545,'quiet')
 # QF101 equipment plan, registered to kitchen room corners. Stainless workstations
 # and the southeast serving line follow the consultant arrangement.
 for x,y,w,d in [(763,443,12,45),(802,443,47,14),(865,446,17,47),(828,466,34,12)]:a.counter(x,y,w,d,'kitchen',mat='review-stainless')
 a.obj('refrigerator',769,465,'kitchen');a.obj('refrigerator',783,465,'kitchen');a.obj('interior-counter-sink',812,409,'kitchen',h=.89)
 for x in [818,829,840]:a.obj('interior-counter-sink',x,466,'kitchen',h=.89)
 a.box('alveare-kitchen-dishmachine',851,466,13,13,.95,'kitchen','photo-silver')
 a.box('alveare-hot-serving-counter',865,446,14,34,.91,'kitchen','photo-silver')
 for y in [433,442,451,460]:a.box('alveare-serving-pan-'+str(y),865,y,10,6,.04,'kitchen','photo-black',base=.92)
 a.box('alveare-microwave-shelf',806,438,11,6,.3,'kitchen','photo-silver',base=1.5)
 a.counter(920,393,26,12,'day',mat='review-stainless');a.obj('interior-counter-sink',914,393,'day',h=.89)
 for x in [925,933]:a.box('alveare-beverage-'+str(x),x,393,5,6,.43,'day','photo-silver',base=.9)
 # Baths keep each toilet, sink, and shower on its drawn wall.
 for id,t,b,tr in [('restroom-190',[765,518],[786,522],0),('restroom-111',[765,541],[786,540],0),('restroom-159',[824,548],[827,525],PP/2),('restroom-158',[1011,863],[1014,882],PP/2),('restroom-154',[932,928],[927,909],-PP/2),('restroom-106',[1010,928],[1012,910],PP/2)]:a.bath(id,t,b,tr)
 a.obj('access-shower',818,565,'restroom-159',scale=(1.1,1,.6));a.obj('basin',1020,556,'jan');a.cabinet(1002,552,'jan')
 a.obj('access-laundry',902,909,'storage')
 # Rehab has mirrors in A9.07 but no equipment schedule. Equipment is proposed.
 for x,y in [(926,966),(960,966)]:a.obj('interior-plinth',x,y,'rehab')
 a.obj('interior-bars',987,1006,'rehab',PP/2);a.obj('interior-stepper',918,1005,'rehab');a.obj('interior-stepper',942,1005,'rehab');a.obj('interior-pulley',1018,981,'rehab',PP/2);a.obj('interior-rehab-rack',904,960,'rehab')
 a.box('alveare-rehab-mirror',963,943,94,1,1.35,'rehab','glass',base=.7)
 for id in ['res-office','res-work','res-conference']:a.simple_room(id)
 a.counter(719,959,48,12,'res-reception',high=.8636);a.chair(719,943,'res-reception',PP,True)
 for x,y,rot in [(770,1017,0),(804,996,PP/2),(772,962,PP)]:a.obj('photo-lounge-chair',x,y,'res-lobby',rot)
 a.obj('plan-lounge-table',792,1017,'res-lobby')
 # Shared access cores: two separate elevator cars and three return stairs.
 for id,x,y,w,d,rot in [('stair-east',1006,498,38,88,PP),('stair-west',603,994,53,85,PP),('res-stair',809.5,866.5,38,99,PP)]:
  aid='alveare-'+id+'-return';a.asset(aid,'connected-stair' if id=='res-stair' else 'return-stair',[w/s,4.95,d/s],'concrete',parameters={'rise':4.0});a.obj(aid,x,y,id,rot,layer='architecture',status='Plan stair footprint; upper flight height is indicative')
 for id,y in [('elevators',810),('elevator-2',854)]:
  aid='alveare-'+id+'-car';a.asset(aid,'lift-gate',[1.95,2.4,2.4],'metal');a.obj(aid,887,y,id,PP/2,layer='architecture')
 for x,y in [(1007,366),(1005,394)]:a.obj('bench',x,y,'garden',PP/2,scale=(.8,1,1))
 a.finish()
 m['accuracyIssues'].append({'id':'staff-review','title':'Mannigan staff-room supplement','detail':'ID7.10 supplied again by the user takes precedence for room 110: eight 60 × 30 inch desks, 54-inch divider, L-shaped break casework, refrigerator, dishwasher, sink, two stools, copier and separate office. A9.06 shows a different table arrangement and has not been mixed into this layout.','status':'User-selected drawing','pages':[1,29]})
 m['accuracyIssues'].append({'id':'room-elevations','title':'Small floor transitions','detail':'A2.01 identifies local finished-floor differences and 1:12 ramps in shared access areas. This room review preserves the main Seen datum; ramp profiles and external gradients still require detailed elevation coordination.','status':'Elevation detail pending','pages':[1]})
 m['accuracyIssues']=list({i['id']:i for i in m['accuracyIssues']}.values())
 (OUT/'seen-alveare.json').write_text(json.dumps(m,indent=2)+'\n')
 return a

def clinic_option(main):
 a=Review('olympic');a.m=copy.deepcopy(main.m);m=a.m;a.level='upper';a.walls=[];a.doors=[];a.n=10000
 # A-2 inset registration from matching Exam 4 and new-lift door hinges.
 dx=633.6;regions=[[721,719,1019,831],[830,552,934,680]]
 def affected(p):return any(b[0]<=p[0]<=b[2] and b[1]<=p[1]<=b[3] for b in regions)
 def px(p):return [p[0]*a.s+1198,p[1]*a.s+650]
 def clip_interval(aa,bb,box):
  lo,hi=0.,1.
  for k in [0,1]:
   dv=bb[k]-aa[k]
   if abs(dv)<1e-8:
    if not box[k]<=aa[k]<=box[k+2]:return None
   else:
    u,v=sorted([(box[k]-aa[k])/dv,(box[k+2]-aa[k])/dv]);lo=max(lo,u);hi=min(hi,v)
  return (lo,hi) if hi>lo else None
 kept=[]
 for w in m['walls']:
  if w['levelId']!='upper':kept.append(w);continue
  aa,bb=px(w['a']),px(w['b']);pieces=[[0.,1.]]
  for region in regions:
   span=clip_interval(aa,bb,region)
   if span:
    lo,hi=span;pieces=[z for x,y in pieces for z in ([[x,min(y,lo)]] if lo>x else [])+([[max(x,hi),y]] if hi<y else []) if z[1]-z[0]>1e-6]
  for lo,hi in pieces:
   nw=copy.deepcopy(w);nw['a']=a.point([aa[k]+(bb[k]-aa[k])*lo for k in [0,1]]);nw['b']=a.point([aa[k]+(bb[k]-aa[k])*hi for k in [0,1]]);kept.append(nw)
 olddoors={d['id'] for d in m['doorSchedule'] if d['levelId']=='upper' and affected(px(d['hinge']))}
 m['objects']=[o for o in m['objects'] if o.get('roomId') not in ['upper-exam-3','upper-clinic-reception','upper-clinic-wait','upper-crash-cart','upper-pt-wait'] and o['assetId'] not in olddoors]
 m['doorSchedule']=[d for d in m['doorSchedule'] if d['id'] not in olddoors]
 a.room('clinic-reception',[723,723,827,826]);a.room('clinic-wait',[[828,723],[934,723],[934,791],[902,791],[902,826],[828,826]])
 a.room('exam-3',[936,723,1017,826]);a.room('crash-cart',[903,802,934,826]);a.room('pt-wait',[831,558,934,679],'PT waiting','waiting')
 v=json.loads((SRC/'olympic-option-vectors.json').read_text())
 for aa,bb,_ in v['walls']:
  aa=[aa[0]+dx,aa[1]];bb=[bb[0]+dx,bb[1]]
  if affected(aa) and affected(bb):a.partition(aa,bb)
 # Small changes at the two interface walls are clipped rather than importing the inset whole.
 for i in [0,1,3,4,17]:
  d=copy.deepcopy(v['doors'][i]);d['id']='olympic-option-door-'+str(i);d['level']='upper'
  for key in ['hinge','a','b','closed','open']:d[key]=[d[key][0]+dx,d[key][1]]
  # All five close along their room's horizontal entrance wall.
  q1,q2=d['a'],d['b'];d['closed'],d['open']=(q1,q2) if abs(q1[1]-d['hinge'][1])<abs(q2[1]-d['hinge'][1]) else (q2,q1)
  a.doors.append(d)
 a.counter(800,760,17,76,'clinic-reception',high=1.06)
 for y in [740,782]:a.chair(780,y,'clinic-reception',-PP/2,True)
 for y in [739,764,787]:a.chair(923,y,'clinic-wait',PP/2)
 a.chair(889,811,'clinic-wait',0);a.obj('interior-cart',918,814,'crash-cart')
 a.obj('interior-exam-chair',967,760,'exam-3',PP/5,scale=(.82,.9,.88));a.obj('interior-exam-sink',956,815,'exam-3',scale=(.9,1,1));a.obj('interior-stool',1004,785,'exam-3')
 for y in [581,604,639,663]:a.chair(916,y,'pt-wait',PP/2)
 a.obj('plan-lounge-table',916,621,'pt-wait')
 prev=m['doorSchedule'];m['walls']=[];a.architecture();m['walls']=kept+m['walls'];m['doorSchedule']=prev+m['doorSchedule']
 for i,w in enumerate(m['walls']):w['id']='olympic-option-wall-'+str(i)
 m['id']='seen-olympic-option';m['name']='Seen Health · 1630 Olympic · Clinic option';m['levels'][1].pop('planImage',None)
 m['levels'][1]['notes']='Alternative clinic reception, waiting and Exam 3 arrangement from the A-2 inset. The same stair and elevator cores are retained.'
 m['exportFiles']={'glb':'/models/seen-olympic-option.glb','audit':'/models/room-review.md'}
 (OUT/'seen-olympic-option.json').write_text(json.dumps(m,indent=2)+'\n')
 print('olympic-option',len(m['rooms']),'rooms',len(m['doorSchedule']),'door leaves')

if __name__=='__main__':
 o=olympic();alveare();clinic_option(o)
