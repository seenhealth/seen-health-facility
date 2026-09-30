"""Recompute interior walking paths through the corrected library opening."""
from pathlib import Path
import json,math,heapq
R=Path(__file__).resolve().parents[1]
# Reuse the facility's collision-aware navigation implementation without regenerating its cast.
source=(R/'scripts/build-activity.py').read_text().split('actors=[]')[0]
a=json.loads((R/'app/data/activity-loop.json').read_text())
seat_points=[x['segments'][0]['path'][0] for x in a['actors'] if x['id'].startswith('daily-')]
source=source.replace('nodes={}', 'for x,z in seat_points:obstacles.append((x,z,.56,.56,1,0))\nnodes={}')
exec(source)
a=json.loads((R/'app/data/activity-loop.json').read_text());changed=0
# Keep the original segment milestones and endpoints; only geometry of walking routes changes.
for actor in a['actors']:
 if actor['levelId']!='ground' or actor['id'].startswith('delivery-'):continue
 for s in actor['segments']:
  if s['action'] not in ['walk','roll','escort'] or len(s['path'])<2:continue
  # Routes touching the former behind-shelf corridor or crossing from day room to PT need refitting.
  affected=any(-15.95<x<-14.2 and 10<z<25.2 for x,z in s['path']) or any(math.dist(p,q)<.58 for p in s['path'] for q in seat_points)
  if not affected:continue
  start,end=s['path'][0],s['path'][-1]
  if not clear(start) or not clear(end):raise ValueError(f'Endpoint blocked: {actor["id"]}: {start} {end}')
  p,q=snap(start),snap(end)
  raw=[start]+[list(x) for x in route(p,q)]+[end]
  s['path']=[raw[0]]
  for point in raw[1:]:
   if point != s['path'][-1]:s['path'].append(point)
  if 'heights' in s:s['heights']=[0]*len(s['path'])
  changed+=1
for relative in ['app/data/activity-loop.json','public/models/activity-loop.json']:(R/relative).write_text(json.dumps(a,indent=2)+'\n')
print('Re-routed',changed,'walking segments through the corrected geometry')
