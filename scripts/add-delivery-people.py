import json,copy
from pathlib import Path
R=Path(__file__).resolve().parents[1];a=json.loads((R/'app/data/activity-loop.json').read_text());p=json.loads((R/'app/data/character-templates.json').read_text());m=json.loads((R/'public/models/seen-alhambra-planning.json').read_text())
a['actors']=[x for x in a['actors'] if not x['id'].startswith('delivery-')];p['people']=[x for x in p['people'] if not x['id'].startswith('delivery-')]
for kind,starts,hold,path in [
 ('food',[110,460],60,[[7.35,-21.8],[7.3,-18.3],[8.8,-16.1],[8.8,-15.212789],[8.8,-13.9]]),
 ('package',[280,590],52,[[4.8,-18.5],[4.2,-16],[3.56,-13.3],[3.56,-12.465328],[3.56,-11.7]])]:
 id='delivery-'+kind;segs=[];clock=0;anchor=path[0];heights=[-.23,-.23,-.115,0,0]
 def s(end,action,points,title,visible=True,hs=None):
  global clock
  segs.append(dict(start=clock,end=end,action=action,path=points,zoneId='site',heading=0,heights=hs if hs is not None else [-.23]*len(points),visible=visible,title=title));clock=end
 for start in starts:
  arrive=start+24;leave=arrive+hold
  s(arrive+2,'ride',[anchor,anchor],'Delivery route',False)
  s(arrive+22,'escort',path,'Delivering '+('fresh meals' if kind=='food' else 'packages'),True,heights)
  s(leave-20,'serve',[path[-1],path[-1]],'Receiving '+kind+' delivery',True,[0,0])
  s(leave-2,'escort',list(reversed(path)),'Returning with empty trolley',True,list(reversed(heights)))
  s(leave,'ride',[anchor,anchor],'Returning to delivery vehicle',False)
 s(720,'ride',[anchor,anchor],'Delivery route',False)
 a['actors'].append(dict(id=id,profileId=id,label='Meal delivery · loading dock' if kind=='food' else 'Package delivery · employee entrance',role='nutrition' if kind=='food' else 'driver',variant=200 if kind=='food' else 201,offset=0,levelId='ground',arrivalVehicleId=id,cargo=kind,segments=segs))
 p['people'].append(dict(id=id,role='nutrition' if kind=='food' else 'driver',appearance=4,skin='#ba805b',hair='#443d35',hairStyle=1,glasses=False,accent='#799882' if kind=='food' else '#b48b60',height=1.02))
for w in m['envelope']['walls']:
 if w['id']=='shell-rear-court':
  for opening in w['openings']:opening['operable']=True
 if w['id']=='shell-rear-north':
  o=w['openings'][0];o.update(kind='door',operable=True)
m['designDecisions']['rearServiceActivity']='Package deliveries use the rear employee entrance; meal deliveries use the wide rear receiving opening. Routes, vehicle sizes and timing are illustrative.'
a['description']=f"{len(a['actors'])} individual people, with most day-center and dining seats occupied, group activities, care, meals and transport."
for path,data in [('app/data/activity-loop.json',a),('public/models/activity-loop.json',a),('app/data/character-templates.json',p),('public/models/character-templates.json',p),('public/models/seen-alhambra-planning.json',m)]: (R/path).write_text(json.dumps(data,indent=2)+'\n')
print(len(a['actors']),'people including staggered food and package deliveries')
