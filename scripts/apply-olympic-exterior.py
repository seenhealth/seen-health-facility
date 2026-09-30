"""Apply the observed exterior without regenerating or publishing the private plans."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
for name in ['olympic','olympic-option']:
 p=root/f'public/models/seen-{name}.json';m=json.loads(p.read_text())
 m['exteriorSurvey']={'id':'olympic-photos-2026-09-22','bounds':[-23.81102,-11.86921,23.81102,11.79662],'roofHeight':8.2,'screenHeight':11.65,'finHeight':12.15,'status':'Seven supplied exterior photographs; capture date unknown. Heights and unmeasured exterior offsets estimated from proportions against the plan footprint. Existing shell, proposed Seen interior.'}
 m['facade']['height']=12.15;m['facade']['status']='Existing exterior observed in supplied photographs; roof and screen heights estimated, not surveyed.'
 m['envelope']['notes']='Photographed existing exterior is rendered by the exteriorSurvey component; plan-based perimeter copies remain available in interior cutaway views.'
 for r in m['roofSections']:
  r['eaveHeight']=8.2;r['status']='Roof profile from drone photographs; height estimated against the source plan footprint.'
 m['objects']=[o for o in m['objects'] if not o['id'].startswith('olympic-photo-car-')]
 for o in m['objects']:
  if o['assetId']=='fleet-van-a':o['position']=[-17.7,0,18.1];o['rotation']=0
  if o['assetId']=='fleet-van-b':o['position']=[-14.7,0,18.1];o['rotation']=0
 for i,(x,z,angle,color) in enumerate([(-11.9,37.5,0,'#abb7b3'),(16.5,32.1,3.14159,'#385454'),(9.2,49.6,0,'#d9dace'),(-19.8,49.6,0,'#56676d'),(19.2,18.1,0,'#e7e3d8'),(10,-18.3,1.5708,'#e0e0d8'),(-29.6,7,3.14159,'#364b51'),(-29.6,40,3.14159,'#a94f3a')],1):
  material=f'olympic-car-paint-{i}';asset=f'olympic-context-car-{i}';m['materials'][material]={'color':color,'roughness':0.46};m['assets'][asset]={'kind':'car','dimensions':[1.8,1.5,4.25],'material':material}
  m['objects'].append({'id':f'olympic-photo-car-{i}','assetId':asset,'zoneId':'site','levelId':'site','position':[x,0,z],'rotation':angle,'scale':[1,1,1],'referencePages':[1],'status':'Indicative vehicle in observed parking / curbside area','notes':'Photograph-informed context. Exact vehicles and stall occupancy are illustrative.'})
 note={'id':'olympic-existing-exterior','title':'Exterior photographs and proposed interior','status':'Photo-informed; dimensions to verify','detail':'Seven user-supplied photographs govern the ribbed corner screen, high white side fin, address numerals, continuous translucent Olympic-facing windows, irregular stone base, blank rear panels, original rear entry and service grilles, rooftop vents, fenced rear lot and Beacon Avenue palms. Exterior height and depth offsets remain estimated. The model retains the proposed Seen interior and fleet; photographed existing entrances may require alteration to align with that proposal. Source photographs are retained outside public assets.','pages':[1,2]}
 m['accuracyIssues']=[v for v in m['accuracyIssues'] if v['id']!=note['id']]+[note]
 m['site']['notes']=m['site']['notes'].split(' Photographed exterior:')[0]+' Photographed exterior: Olympic frontage and Beacon Avenue corner; rear parking, gates and landscaping interpreted from seven supplied images. Parking dimensions and minor site details remain approximate.'
 p.write_text(json.dumps(m,indent=2)+'\n')
print('Applied photographed Olympic exterior to main and clinic-option models; interior rooms and doors retained.')
