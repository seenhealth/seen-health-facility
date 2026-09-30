"""Register OpenStreetMap geometry to the source plans; retain attribution and uncertainty."""
from pathlib import Path
import json,math
ROOT=Path(__file__).resolve().parents[1];TMP=ROOT/'sources/additional-sites'
for key in ['olympic','alveare']:
 m=json.loads((ROOT/f'public/models/seen-{key}.json').read_text());loc=m['location'];lat,lon=loc['lat'],loc['lng']
 d=json.loads((TMP/f'osm-{key}.json').read_text());bearing=28.4 if key=='olympic' else 33.2;t=math.radians(bearing)
 def local(q):
  e=(q['lon']-lon)*111320*math.cos(math.radians(lat));n=(q['lat']-lat)*111320
  return [e*math.cos(t)-n*math.sin(t),-e*math.sin(t)-n*math.cos(t)]
 if key=='olympic':
  building=next(e for e in d['elements'] if e['id']==426712315);p=[local(q) for q in building['geometry']]
  outline=m['site']['buildingOutline'];shift=[(min(q[i] for q in outline)+max(q[i] for q in outline)-min(q[i] for q in p)-max(q[i] for q in p))/2 for i in range(2)]
 else:
  corner=local({'lat':34.034833,'lon':-118.2630064});outline=m['site']['buildingOutline'];shift=[max(p[0] for p in outline)+10-corner[0],max(p[1] for p in outline)+10-corner[1]]
 def project(q):return [round(v+shift[i],3) for i,v in enumerate(local(q))]
 features=[]
 for e in d['elements']:
  tags=e.get('tags',{});p=[project(q) for q in e.get('geometry',[])];kind='building' if 'building' in tags else 'road'
  if len(p)<2:continue
  if min(x[0] for x in p)>115 or max(x[0] for x in p)<-115 or min(x[1] for x in p)>100 or max(x[1] for x in p)<-100:continue
  if kind=='building':
   if (key=='olympic' and tags.get('lacounty:ain') in ['5137016023','5137016019']) or (key=='alveare' and tags.get('lacounty:ain')=='5133003902'):continue
   height=float(tags.get('height','0').split()[0] or 0);height=height or float(tags.get('building:levels',2))*3.2
   features.append({'id':str(e['id']),'kind':'building','points':p,'height':min(height,80),'heightStatus':'OSM recorded height' if 'height' in tags else 'Estimated from stories or nominal two stories','name':tags.get('name','Adjacent building')})
  elif tags.get('highway') in ['primary','secondary','tertiary','residential','service','footway','pedestrian']:
   lanes=int(tags.get('lanes','2'));width=lanes*3.1+1 if tags['highway'] in ['primary','secondary','tertiary'] else 8 if tags['highway']=='residential' else 4 if tags['highway']=='service' else 1.6
   # Clip long OSM ways to the presentation extent using segment intersection.
   for a,b in zip(p,p[1:]):
    u0,u1=0,1;dx=b[0]-a[0];dz=b[1]-a[1];ok=True
    for pp,qq in [(-dx,a[0]+115),(dx,115-a[0]),(-dz,a[1]+100),(dz,100-a[1])]:
     if abs(pp)<1e-9:
      if qq<0:ok=False;break
     elif pp<0:u0=max(u0,qq/pp)
     else:u1=min(u1,qq/pp)
    if ok and u0<u1:
     points=[[a[0]+u*dx,a[1]+u*dz] for u in [u0,u1]]
     features.append({'id':str(e['id'])+'-'+str(len(features)),'kind':'road','points':points,'width':width,'name':tags.get('name',''),'roadType':tags['highway']})
 geo={'source':'https://www.openstreetmap.org/copyright','fetched':'2026-09-22','registration':'Olympic: existing footprint bounding box. Alveare: Broadway / 15th intersection. Plan orientation aligned to street geometry. Manual registration, not survey.','bearing':bearing,'features':features}
 for suffix in [key]+(['olympic-option'] if key=='olympic' else []):
  f=ROOT/f'public/models/seen-{suffix}.json';v=json.loads(f.read_text());v['geography']=geo;v['location']['planNorthDegrees']=bearing;v['site']['notes']='OSM building footprints, road centerlines and available heights. New facility plan manually registered to street geometry. Road widths estimated from lanes; secondary details indicative. © OpenStreetMap contributors. '+geo['registration'];f.write_text(json.dumps(v,indent=2)+'\n')
 print(key,len([x for x in features if x['kind']=='building']),'mapped buildings',len([x for x in features if x['kind']=='road']),'street segments')
