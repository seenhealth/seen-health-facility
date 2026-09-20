"""Ground-floor reconstruction from Overall Planning.jpg.

All coordinates below are in a 1800 x 1350 analysis frame (original / 4).
They are converted once to SI. Source positions and footprints are retained for
overlay verification; heights remain provisional where not dimensioned.
"""
import json, math, shutil, hashlib
from pathlib import Path
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'
REF=ROOT/'public/reference/planning'
REF.mkdir(parents=True,exist_ok=True)
original=ROOT/'sources/planning/Overall Planning.jpg'
original.parent.mkdir(parents=True,exist_ok=True)
if not original.exists():
    manifest=original.parent/'source-manifest.json'
    if manifest.exists():
        archive=json.loads(manifest.read_text());data=b''.join((original.parent/p).read_bytes() for p in archive['parts'])
        assert hashlib.sha256(data).hexdigest()==archive['sha256'],'Original image archive checksum mismatch'
        original.write_bytes(data)
    else:shutil.copyfile('/Users/xing/Downloads/Overall Planning.jpg',original)
rgb=Image.open(original).convert('RGB')
rgb.save(REF/'overall-full.jpg',quality=95,subsampling=0)
rgb.resize((3600,2700),Image.Resampling.LANCZOS).save(REF/'plan.jpg',quality=95)
im=np.asarray(rgb.resize((1800,1350),Image.Resampling.LANCZOS)).astype(int)
m=json.loads((OUT/'seen-alhambra-2024.json').read_text())
old=m['calibration'];oldppm=old['pixelsPerMeter'];oldorigin=old['sourcePixelOrigin']
PPM=math.sqrt(290.5*402/(3254*.09290304)); ORIGIN=[814,591]
def pt(p):return [round((p[i]-ORIGIN[i])/PPM,6) for i in range(2)]
def rect(x,y,w,h):return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
def area(p):return abs(sum(a[0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*a[1] for i,a in enumerate(p))/2)
def old_to_pixel(p):
    q=[p[i]*oldppm+oldorigin[i] for i in range(2)]
    return [523.5+(q[0]-562)*290.5/224,149.5+(q[1]-226)*402/310]
def remap(p):return pt(old_to_pixel(p))
def remap3(p):
    q=remap([p[0],p[2]]);return [q[0],p[1],q[1]]
for z in m['zones']:z['polygon']=[remap(p) for p in z['polygon']]
for r in m['rooms']:r['polygon']=[remap(p) for p in r['polygon']]
for w in m['walls']:w['a'],w['b']=remap(w['a']),remap(w['b'])
for d in m['details']:
    original_pos=d['position'][:]
    source_x=original_pos[0]*oldppm+oldorigin[0]
    d['position']=remap3(original_pos)
    for tag,oldleft,oldright,left,right,front in [('therapy-front',317,562,201,526,1125),('admin-front',786,1012,814,1114,1115),('adjacent-front',1012,1230,1120,1398,1118)]:
        if d['id'].startswith(tag):
            q=pt([left+(source_x-oldleft)/(oldright-oldleft)*(right-left),front])
            d['position'][0],d['position'][2]=q
            d['dimensions'][0]*=(right-left)/PPM/((oldright-oldleft)/oldppm)
    if d['id']=='therapy-west':
        q=pt([201,(766+1125)/2]);d['position'][0],d['position'][2]=q;d['dimensions'][2]=359/PPM
    if d['id'].startswith('day-front-') or d['id']=='day-canopy':d['position'][2]+=(1085-old_to_pixel([0,(940-oldorigin[1])/oldppm])[1])/PPM
    if d['id']=='west-entry-canopy':
        q=pt([508,626]);d['position'][0],d['position'][2]=q;d['dimensions'][0]=31/PPM;d['dimensions'][2]=188/PPM
    if d['id']=='west-entry-fascia':
        q=pt([526,625]);d['position'][0],d['position'][2]=q;d['dimensions'][2]=185/PPM
    if d['id']=='west-entry-ramp':
        q=pt([509,626]);d['position'][0],d['position'][2]=q;d['dimensions'][0]=25/PPM;d['dimensions'][2]=180/PPM
    if d['id'].startswith('entry-rail-'):
        q=pt([491 if d['id'].endswith('0') else 523,626]);d['position'][0],d['position'][2]=q;d['dimensions'][2]=180/PPM
    if d['id'].startswith('entry-post-'):
        _,_,side,j=d['id'].split('-');q=pt([491 if side=='0' else 523,536+int(j)*30]);d['position'][0],d['position'][2]=q
for r in m['roofSections']:r['bounds']=[remap(p) for p in r['bounds']]

polys={
 'clinic':rect(523.5,149.5,290.5,402),
 'rehab':rect(201,766,325,359),
 'ot':[[814,346],[916,346],[916,292],[1045,292],[1045,346],[1114,346],[1114,554],[814,554]],
 'lobby':[[526,551.5],[814,551.5],[814,740],[624,740],[624,660],[579,660],[579,765],[526,765]],
 'hall':rect(814,554,300,43),
 'day':[[526,765],[579,765],[579,660],[624,660],[624,740],[814,740],[814,1085],[526,1085]],
 'dining':[[814,597],[979,597],[979,740],[911,740],[911,772],[814,772]],
 'kitchen':[[979,597],[1075,597],[1075,780],[946,780],[946,772],[911,772],[911,740],[979,740]],
 'veranda':[[1075,597],[1114,597],[1114,882],[973,882],[973,780],[1075,780]],
 'admin':[[814,772],[911,772],[911,780],[973,780],[973,882],[1114,882],[1114,1115],[877,1115],[877,1143],[814,1143]],
 'adjacent':rect(1120,660,278,458),
}
zmap={z['id']:z for z in m['zones']}
for zid,p in polys.items():
    z=zmap[zid];z['polygon']=[pt(q) for q in p];z['referencePages']=[92]+z['referencePages'];z['geometryStatus']='traced-from-overall-planning';z['spread']=[v*.45 for v in pt([sum(q[0] for q in p)/len(p),sum(q[1] for q in p)/len(p)])]
    z['notes']='Walls, openings and furniture placement follow the supplied Overall Planning.jpg. Physical scale remains area-calibrated; vertical dimensions use the prior PDF where available.'
zmap['ot'].update(name='Rear support & personal care',short='Personal care, stairs & support',notes='Personal-care bathrooms, shower/changing rooms, stairs and unlabelled support spaces follow the supplied plan. Individual room names are provisional.')
zmap['veranda'].update(name='East service corridor',short='Kitchen & administration connection',floorMaterial='wood',notes='The supplied image shows an enclosed service corridor here. The previous veranda interpretation is superseded.')
zmap['adjacent']['notes']='The adjacent roofed building follows the new site image. Its interior remains undocumented.'
zmap['rehab']['notes']='The open wood-floor therapy area, perimeter support rooms, personal-care suites and only the furniture shown in Overall Planning.jpg. Earlier illustrative exercise equipment has been removed.'
zmap['day']['notes']='Nine diamond-oriented tables, seven banquette tables, four round tables around the tree, a long communal table, two small north tables and four lounge chairs follow the supplied image.'
zmap['dining']['notes']='Five diamond-oriented four-seat dining tables and the service counter follow the supplied image.'
zmap['admin']['notes']='Twelve central workstations, two three-seat meeting rooms, a sixteen-seat conference table, side workspace and waiting chairs follow the supplied image.'
# Align retained upper shells to the updated ground-floor perimeter. Their fit-out is not supplied.
for zid,p in {'upper-office':[[814,772],[1114,772],[1114,1115],[877,1115],[877,1143],[814,1143]],'mezzanine':[[201,766],[286,766],[286,1055],[526,1055],[526,1125],[201,1125]]}.items():
    zmap[zid]['polygon']=[pt(q) for q in p]
for z in m['zones']:z['tracedFootprintSqFt']=round(area(z['polygon'])/.09290304,1)

m['rooms']=[r for r in m['rooms'] if r['levelId']!='ground']
for r in m['rooms']:r['polygon']=zmap[r['zoneId']]['polygon']
def room(id,name,zid,b,finish=None,kind='room'):
    p=rect(*b) if isinstance(b[0],(int,float)) else b
    r=dict(id=id,name=name,zoneId=zid,levelId='ground',polygon=[pt(v) for v in p],kind=kind,referencePages=[92],status='image-traced',notes='Boundary traced from Overall Planning.jpg. Stable trace ID; room name is descriptive unless shown in the architectural set.',sourcePolygonPixels=p)
    if finish:r['floorMaterial']=finish
    m['rooms'].append(r)

for i,(y1,y2) in enumerate([(150,199),(199,246),(246,309),(309,347),(347,394),(394,445),(445,489),(489,546)]):room(f'clinic-west-{i+1:02}',f'West clinical room {i+1:02}','clinic',[526,y1,70,y2-y1])
for i,(y1,y2) in enumerate([(150,208),(208,266),(266,323),(323,381),(381,454),(454,511)]):room(f'clinic-exam-{i+1:02}',f'Clinical treatment room {i+1:02}','clinic',[740,y1,74,y2-y1])
room('clinic-south-east','Clinical utility room','clinic',[740,511,74,42])
room('clinic-wc-north','Clinical bathroom north','clinic',[634,184,56,63],'wet-tile')
room('clinic-wc-south','Clinical bathroom south','clinic',[634,247,56,62],'wet-tile')
room('clinic-center-store','Central clinical support','clinic',[634,435,66,49])
room('clinic-treatment-south','South clinical treatment room','clinic',[634,484,66,60])
room('clinic-nurse','Nurse station','clinic',[632,325,71,87],kind='nursing')
for id,name,b,finish in [
 ('rear-stair','Rear stair',[916,292,28,116],None),('rear-north','Rear support north',[944,292,101,162],'concrete'),
 ('rear-utility-nw','Rear utility northwest',[814,348,102,40],'concrete'),('rear-support-west','Rear support west',[814,388,102,66],'concrete'),
 ('rear-support-center','Rear central support',[944,402,50,52],'concrete'),('rear-support-east','Rear support east',[1045,348,69,60],'concrete'),
 ('rear-shower-north','Rear personal-care room north',[1045,408,69,76],'concrete'),('rear-shower-south','Rear personal-care room south',[1045,484,69,53],'concrete'),
 ('rear-wc-west','Accessible bathroom west',[814,454,75,90],'wet-tile'),('rear-wc-east','Accessible bathroom east',[923,454,71,90],'wet-tile')]:room(id,name,'ot',b,finish)
for id,name,b,finish in [
 ('office-w1','Reception-side room W1',[526,651,53,49],'carpet'),('office-w2','Reception-side room W2',[526,700,53,65],'carpet'),
 ('office-n1','Reception-side room N1',[682,592,27,62],'carpet'),('office-n2','Reception-side room N2',[709,592,52,62],'carpet'),
 ('office-c1','Central support room C1',[624,654,54,40],'carpet'),('office-c2','Central support room C2',[624,694,54,42],'carpet'),
 ('office-c3','Central support room C3',[678,654,83,82],'carpet'),('wc-1','Lobby bathroom north',[761,597,53,54],'wet-tile'),('wc-2','Lobby bathroom south',[761,651,53,55],'wet-tile')]:room('lobby-'+id,name,'lobby',b,finish)
room('hall-1010','East hallway · 1010','hall',polys['hall'],'tile',kind='circulation')
room('lobby-arrival','Reception & arrival','lobby',[[526,553],[814,553],[814,592],[682,592],[682,651],[622,651],[622,660],[579,660],[579,651],[526,651]],'tile',kind='circulation')
room('day-open','Day room','day',polys['day'],'wood',kind='open-space')
room('dining-1421','Dining · 1421','dining',polys['dining'],'wood',kind='open-space')
room('kitchen-prep','Kitchen preparation & service','kitchen',polys['kitchen'],'concrete')
room('east-service','East service corridor','veranda',polys['veranda'],'wood',kind='circulation')
for id,name,b,finish in [
 ('support-nw','Therapy support NW',[[201,766],[273,766],[273,808],[261,808],[261,853],[201,853]],'concrete'),
 ('support-west','Therapy west room',[230,853,63,56],'sports'),('support-north','Therapy north support',[273,766,91,42],'sports'),
 ('entry','Therapy entry corridor',[364,766,162,43],'tile'),('support-mid','Therapy southwest room',[231,947,62,80],'sports'),
 ('wc-nw','Therapy bathroom northwest',[370,810,54,57],'wet-tile'),('wc-sw','Therapy bathroom west',[370,867,54,77],'wet-tile'),
 ('wc-east','Therapy personal care east',[424,810,81,134],'wet-tile'),('wc-south','Therapy personal care south',[424,973,81,112],'wet-tile')]:room('rehab-'+id,name,'rehab',b,finish)
room('rehab-open','Open therapy space','rehab',[[201,853],[230,853],[230,909],[293,909],[293,808],[364,808],[364,810],[370,810],[370,944],[505,944],[505,973],[424,973],[424,1085],[526,1085],[526,1125],[201,1125],[201,1050],[231,1050],[231,1027],[293,1027],[293,947],[231,947],[231,909],[201,909]],'sports',kind='open-space')
for id,name,b,finish in [
 ('waiting-west','Administration waiting west',[[814,774],[911,774],[911,826],[875,826],[875,867],[814,867]],'carpet'),
 ('waiting-east','Administration waiting east',[911,780,62,46],'carpet'),('wc-north','Administration bathroom north',[826,867,49,52],'wet-tile'),
 ('wc-south','Administration bathroom south',[826,919,49,54],'wet-tile'),('side-office','Administration side workspace',[826,973,49,64],'carpet'),
 ('meeting-west','Three-seat meeting room west',[936,884,64,56],'carpet'),('meeting-east','Three-seat meeting room east',[1000,884,67,56],'carpet'),
 ('conference','Conference room',[951,1037,163,78],'carpet')]:room('admin-'+id,name,'admin',b,finish)
room('admin-workstations','Administration shared workstations','admin',[875,940,239,97],'carpet',kind='open-space')
room('adjacent-shell','Adjacent building shell','adjacent',polys['adjacent'],'concrete',kind='shell')

# Extract the dark wall strokes along explicitly reviewed wall centerlines.
# This preserves every visible door/window break instead of closing rectangles.
dark=(im[:,:,0]<65)&(im[:,:,1]<82)&(im[:,:,2]<86)
m['walls']=[w for w in m['walls'] if w['levelId']!='ground']
seen=set()
def stroke(zid,axis,c,a,b,th=4,material='wall'):
    c=int(c);a=int(a);b=int(b)
    candidates=range(c-2,c+3)
    def score(k):
        stripe=dark[k-1:k+2,a:b+1] if axis=='h' else dark[a:b+1,k-1:k+2].T
        return int((stripe.mean(0)>=.66).sum())-.1*abs(k-c)
    c=max(candidates,key=score)
    strip=dark[c-1:c+2,a:b+1] if axis=='h' else dark[a:b+1,c-1:c+2].T
    hit=strip.mean(0)>=.66
    # Fill one-pixel raster holes only; never bridge a doorway.
    for i in range(1,len(hit)-1):
        if hit[i-1] and hit[i+1]:hit[i]=True
    start=None
    for i,yes in enumerate(list(hit)+[False]):
        if yes and start is None:start=i
        if not yes and start is not None:
            if i-start>=3:
                p,q=([a+start,c],[a+i-1,c]) if axis=='h' else ([c,a+start],[c,a+i-1])
                key=tuple(p+q)
                if key not in seen:
                    seen.add(key);m['walls'].append(dict(id=f'plan-wall-{len(m["walls"]):03}',zoneId=zid,levelId='ground',a=pt(p),b=pt(q),height=zmap[zid]['wallHeight'],thickness=th/PPM,material=material,status='source-stroke-traced / height-inferred',referencePages=[92],sourcePixels=[p,q]))
            start=None
def H(z,y,x1,x2,t=4):stroke(z,'h',y,x1,x2,t)
def V(z,x,y1,y2,t=4):stroke(z,'v',x,y1,y2,t)
for x,a,b,t in [(526,150,555,6),(814,150,553,7),(596,150,558,4),(740,150,555,4),(634,183,309,4),(689,184,309,4),(634,433,546,4),(700,435,549,4)]:V('clinic',x,a,b,t)
for y,x1,x2 in [(150,526,814),(199,526,596),(246,526,596),(309,526,596),(347,526,596),(394,526,596),(445,526,596),(489,526,596),(546,526,596),(554,526,596),(208,740,814),(266,740,814),(323,740,814),(381,740,814),(454,740,814),(511,740,814),(554,740,814),(184,634,690),(247,634,690),(309,634,690),(435,634,700),(484,634,700),(545,634,700),(555,634,700)]:H('clinic',y,x1,x2)
for x,a,b in [(916,292,409),(944,292,454),(1045,292,555),(1114,347,553),(869,388,420),(889,420,554),(923,454,555),(994,401,555),(974,454,476)]:V('ot',x,a,b)
for y,a,b in [(292,916,1045),(348,814,916),(348,1045,1114),(388,814,916),(409,916,944),(420,869,944),(402,944,994),(408,1045,1114),(454,814,889),(454,923,1045),(484,1045,1114),(537,1045,1114),(545,814,889),(545,923,994),(555,814,889),(555,923,994),(476,974,994)]:H('ot',y,a,b)
for x,a,b in [(526,554,765),(579,651,765),(622,651,736),(678,654,736),(682,592,654),(709,592,654),(761,592,736),(814,597,739),(789,706,736)]:V('lobby',x,a,b,5)
for y,a,b in [(651,526,579),(700,526,579),(765,526,579),(660,579,622),(592,682,761),(654,622,761),(694,622,678),(736,622,761),(597,761,814),(651,761,814),(706,761,814),(736,789,814)]:H('lobby',y,a,b,5)
H('hall',597,814,1114,4);V('hall',1114,553,597,6);V('hall',977,555,597,3)
V('dining',979,597,740,5);H('dining',740,911,979,4);V('dining',911,721,772,3);H('dining',774,814,911,5);V('day',814,774,1085,6);V('day',526,810,1085,6);H('day',1085,526,814,5)
V('kitchen',1075,597,780,5);H('kitchen',780,946,1075,5);V('kitchen',946,740,780,4)
V('veranda',1114,597,1115,7);H('veranda',854,973,1078,4);H('veranda',780,973,1078,4)
for x,a,b,t in [(201,766,1125,7),(273,766,808,4),(261,808,853,4),(230,853,947,4),(293,853,909,4),(364,766,810,4),(370,810,944,5),(424,810,1085,5),(505,810,1085,5),(231,947,1027,4),(293,947,1027,4)]:V('rehab',x,a,b,t)
for y,a,b in [(766,201,526),(808,261,370),(810,370,526),(853,201,293),(909,230,293),(947,231,293),(1027,218,293),(867,370,424),(944,370,505),(852,424,505),(879,424,455),(898,424,455),(916,424,455),(935,424,455),(973,424,505),(1008,424,458),(1031,424,458),(1057,424,505),(1085,424,526),(1125,201,526)]:H('rehab',y,a,b,4)
V('rehab',455,879,935,2);V('rehab',458,1008,1057,2)
for x,a,b in [(911,774,826),(875,826,1055),(826,867,1075),(936,884,940),(1000,884,940),(1067,884,940),(951,1037,1115),(877,1115,1143),(814,1085,1143)]:V('admin',x,a,b,4)
for y,a,b in [(826,875,973),(867,814,875),(919,826,875),(973,826,875),(1037,826,875),(1055,826,850),(884,936,1114),(940,936,1067),(1037,951,1114),(1115,877,1114),(1143,814,877)]:H('admin',y,a,b,4)
# Adjacent roofed shell, kept separate from the furnished building.
for p,q in zip(polys['adjacent'],polys['adjacent'][1:]+polys['adjacent'][:1]):m['walls'].append(dict(id=f'adjacent-wall-{len(m["walls"])}',zoneId='adjacent',levelId='ground',a=pt(p),b=pt(q),height=6.4,thickness=.2,material='wall',status='image-traced-shell',referencePages=[92]))

# Reusable assets, sized to the visible plan footprint; vertical sizes are inferred.
m['materials'].update({'wet-tile':dict(color='#618b82',roughness=.72,pattern='tile'),'dining-chair':dict(color='#8b4d21',roughness=.62),'office-blue':dict(color='#367e9d',roughness=.75),'lounge-blue':dict(color='#193dac',roughness=.7),'grey-seat':dict(color='#c7c7d3',roughness=.8),'clinical-seat':dict(color='#cedac9',roughness=.65)})
m['materials']['wood']['color']='#d7d6b8';m['materials']['carpet']['color']='#545546'
assets=m['assets'];objects=[]
def asset(id,kind,w,h,d,material):assets[id]=dict(kind=kind,dimensions=[round(w/PPM,5),h,round(d/PPM,5)],material=material)
asset('plan-dining-table','table',19.2,.75,19.2,'table');asset('plan-dining-chair','chair',10,.87,10,'dining-chair')
asset('plan-banquette-table','table',19,.75,32,'table');asset('plan-side-chair','chair',9,.84,11,'chair')
asset('plan-round-table','round-table',19,.74,19,'table');asset('plan-lounge-table','round-table',16,.48,16,'table')
asset('plan-task-chair','task-chair',13,.98,13,'office-blue');asset('plan-grey-chair','task-chair',13,.98,13,'grey-seat');asset('plan-clinical-chair','chair',10,.88,10,'clinical-seat')
asset('plan-lounge-chair','chair',13,.85,14,'lounge-blue');asset('plan-exam-chair','exam-chair',17,1.18,31,'clinical-seat')
asset('plan-banquette','bench',290,.9,13,'blue');asset('plan-tree','tree-unseated',68,4.2,68,'leaf')
asset('plan-workbench','table',167,.74,26,'oak');asset('plan-conference-table','table',105,.74,27,'oak')
asset('plan-long-table','table',18,.75,91,'oak');asset('plan-small-table','table',19,.75,20,'table')
asset('plan-meeting-table','table',20,.74,24,'table');asset('plan-reception-counter','counter',19,1.1,14,'table')
asset('plan-stair','stair',24,3.35,110,'concrete');asset('plan-cabinet','cabinet',15,.85,15,'cabinet')
asset('plan-clinical-desk','table',16,.76,18,'table')
def obj(id,aid,x,y,zid,rot=0,w=None,d=None,h=None,elev=0,roomId=None):
    a=assets[aid];scale=[1,1,1]
    if w is not None:scale[0]=w/PPM/a['dimensions'][0]
    if h is not None:scale[1]=h/a['dimensions'][1]
    if d is not None:scale[2]=d/PPM/a['dimensions'][2]
    q=pt([x,y]);objects.append(dict(id=id,assetId=aid,zoneId=zid,levelId='site' if zid=='site' else 'ground',position=[q[0],elev,q[1]],rotation=rot,scale=scale,roomId=roomId,referencePages=[92],status='image-traced-position-and-footprint / height-inferred',notes='Plan location, orientation and horizontal footprint follow Overall Planning.jpg; product and height remain inferred.',sourcePixelPosition=[x,y],sourcePixelFootprint=[a['dimensions'][0]*scale[0]*PPM,a['dimensions'][2]*scale[2]*PPM]))
def chair(id,x,y,zid,tx,ty,aid='plan-dining-chair'):
    obj(id,aid,x,y,zid,math.atan2(x-tx,y-ty))
def four_table(id,x,y,zid):
    obj(id,'plan-dining-table',x,y,zid,math.pi/4)
    for i,(dx,dy) in enumerate([(-12.8,-12.8),(12.8,-12.8),(12.8,12.8),(-12.8,12.8)]):chair(f'{id}-chair-{i+1}',x+dx,y+dy,zid,x,y)
for i,(x,y) in enumerate([(865.8,628.3),(923.1,626.1),(865.9,678),(923.5,677.5),(865.8,734.6)]):four_table(f'dining-table-{i+1:02}',x,y,'dining')
for i,(x,y) in enumerate([(632.5,818.4),(676.8,818.3),(721.2,818.3),(622.1,982.8),(672.7,981.6),(721.1,982.8),(623,1031.8),(672.7,1032.6),(721.1,1033.9)]):four_table(f'day-diamond-table-{i+1:02}',x,y,'day')
for i,y in enumerate([807.5,848.5,889.5,931.1,973.2,1014.1,1055.7]):
    obj(f'day-banquette-table-{i+1:02}','plan-banquette-table',784,y,'day')
    for j,dy in enumerate([-6.5,6.5]):chair(f'day-banquette-table-{i+1:02}-chair-{j+1}',766.5,y+dy,'day',784,y+dy,'plan-side-chair')
obj('day-east-banquette','plan-banquette',804,934,'day',math.pi/2,w=293)
obj('day-west-banquette','plan-banquette',533,947,'day',-math.pi/2,w=275,d=12)
for i,(x,y,offsets) in enumerate([(644,878,[(-13,-13),(13,-13),(-13,13)]),(703.1,877.7,[(-13,-13),(13,-13),(13,13)]),(644.2,924.5,[(-13,-13),(-13,13),(13,13)]),(702.8,924.2,[(13,-13),(-13,13),(13,13)])]):
    obj(f'day-tree-table-{i+1}','plan-round-table',x,y,'day')
    for j,(dx,dy) in enumerate(offsets):chair(f'day-tree-chair-{i+1}-{j+1}',x+dx,y+dy,'day',x,y)
obj('day-central-tree','plan-tree',675,901,'day')
obj('day-communal-table','plan-long-table',578,885,'day')
for i,y in enumerate([848,864,879,894,910,925]):
    chair(f'day-communal-west-{i}',563.5,y,'day',578,y);chair(f'day-communal-east-{i}',592.5,y,'day',578,y)
chair('day-communal-north',578,832,'day',578,885);chair('day-communal-south',578,939,'day',578,885)
for i,x in enumerate([668,706.5]):
    obj(f'day-north-table-{i+1}','plan-small-table',x,760.5,'day')
    chair(f'day-north-table-{i+1}-side',x+(-17 if i==0 else 17),760.5,'day',x,760.5)
    chair(f'day-north-table-{i+1}-south',x,778.5,'day',x,760.5)
for i,(x,y) in enumerate([(553,988),(557,1034)]):obj(f'day-lounge-table-{i}','plan-lounge-table',x,y,'day')
for i,(x,y,tx,ty) in enumerate([(575,975,553,988),(575,999,553,988),(580,1047,557,1034),(559,1057,557,1034)]):chair(f'day-lounge-chair-{i}',x,y,'day',tx,ty,'plan-lounge-chair')
# Clinical treatment furniture and consultation rooms.
for i,(y,angle,cy,dy) in enumerate([(166,1.20,182,186),(221,1.20,239,243),(300,1.92,288,286),(358,1.92,344,342),(425,0,406,425),(493,1.92,474,474)]):
    rid=f'clinic-exam-{i+1:02}';obj(f'{rid}-recliner','plan-exam-chair',756 if i!=4 else 770,y,'clinic',angle,roomId=rid)
    obj(f'{rid}-desk','plan-clinical-desk',792,dy,'clinic',roomId=rid)
    chair(f'{rid}-stool',779,cy,'clinic',792,dy,'plan-clinical-chair')
    if i!=4:
        for j,yy in enumerate([dy-12,dy+1]):chair(f'{rid}-visitor-{j}',804,yy,'clinic',785,yy,'plan-clinical-chair')
    obj(f'{rid}-cabinet','plan-cabinet',804,153 if i==0 else [0,211,311,370,444,502][i],'clinic',w=10,d=16)
obj('clinic-south-recliner','plan-exam-chair',652,504,'clinic',.7)
obj('clinic-south-desk','plan-clinical-desk',674,531,'clinic')
chair('clinic-south-stool',663,529,'clinic',674,531,'plan-clinical-chair');chair('clinic-south-visitor',690,536,'clinic',674,531,'plan-clinical-chair')
for i,y in enumerate([368,474]):
    chair(f'clinic-west-office-chair-{i}',556,y,'clinic',577,y,'plan-clinical-chair');chair(f'clinic-west-office-visitor-{i}',587,y-10 if i==0 else y+9,'clinic',556,y,'plan-clinical-chair')
for k,y in enumerate([416,515]):
    obj(f'clinic-consult-table-{k}','plan-small-table',561,y,'clinic',w=20,d=24)
    for j,(x,yy) in enumerate([(544,y-7),(578,y-7),(561,y+13)]):chair(f'clinic-consult-chair-{k}-{j}',x,yy,'clinic',561,y,'plan-task-chair')
for i,(x,y,w,d) in enumerate([(660,331,67,9),(635,370,7,80),(690,375,17,73)]):obj(f'clinic-nurse-counter-{i}','plan-reception-counter',x,y,'clinic',w=w,d=d,h=.94)
for i,y in enumerate([164,210]):obj(f'clinic-west-storage-{i}','plan-cabinet',554,y,'clinic',w=55,d=9,h=2.1)
for i,(x,y,zid,w,d) in enumerate([(641,597,'lobby',34,14),(628,623,'lobby',10,58),(819,351,'ot',6,35)]):obj(f'reception-counter-{i}','plan-reception-counter',x,y,zid,w=w,d=d)
# Admin: furniture count and chair orientations follow the image, without monitors not shown in plan.
obj('admin-workbench','plan-workbench',994,986,'admin')
for i,x in enumerate([918,947,977,1006,1037,1068]):
    chair(f'admin-workchair-north-{i}',x,967,'admin',x,986,'plan-task-chair');chair(f'admin-workchair-south-{i}',x,1004,'admin',x,986,'plan-task-chair')
for i,x in enumerate([965.5,1033.3]):
    obj(f'admin-meeting-table-{i}','plan-meeting-table',x,899,'admin')
    for j,(dx,dy) in enumerate([(-18,0),(18,0),(0,18)]):chair(f'admin-meeting-chair-{i}-{j}',x+dx,899+dy,'admin',x,899,'plan-task-chair')
obj('admin-conference-table','plan-conference-table',1027.5,1076,'admin')
for i,x in enumerate([980,994,1008,1022,1036,1050,1064,1078]):
    chair(f'admin-conference-north-{i}',x,1057,'admin',x,1076,'plan-grey-chair');chair(f'admin-conference-south-{i}',x,1093,'admin',x,1076,'plan-grey-chair')
obj('admin-side-worktop','table',835,1001,'admin',w=12,d=48,h=.74)
for i,y in enumerate([989,1014]):chair(f'admin-side-chair-{i}',849,y,'admin',835,y,'plan-task-chair')
for i,(x,y,tx,ty) in enumerate([(896,809,855,843),(828,854,855,843),(862,854,855,843),(930,809,945,807)]):chair(f'admin-waiting-chair-{i}',x,y,'admin',tx,ty,'plan-grey-chair')
obj('admin-stair-east','plan-stair',978,866,'admin',-math.pi/2,w=24,d=110)
obj('admin-stair-south','plan-stair',910,1097,'admin',math.pi/2,w=24,d=79)
obj('rear-stair-flight','plan-stair',930,352,'ot',d=106)
obj('rehab-stair','plan-stair',218,984,'rehab',math.pi,w=24,d=77)
for i,(x,y) in enumerate([(264,1042),(224,1080),(219,1107),(248,1100)]):chair(f'rehab-visible-chair-{i}',x,y,'rehab',235,1086,'plan-lounge-chair')
obj('rehab-side-desk','table',209,1090,'rehab',w=15,d=67,h=.74)
obj('rehab-demonstration-counter','counter',298,868,'rehab',w=12,d=96,h=.9)
# Plumbing fixtures actually depicted, including stalls. Wheelchair symbols are clearance diagrams, not loose furnishings.
for zid,pts in {
 'clinic':[(643,231,0),(643,259,math.pi)],
 'lobby':[(803,641,0),(803,665,math.pi)],
 'ot':[(820,490,math.pi/2),(985,485,-math.pi/2),(985,518,-math.pi/2)],
 'rehab':[(412,858,-math.pi/2),(412,901,-math.pi/2),(432,830,math.pi/2),(432,864,math.pi/2),(432,884,math.pi/2),(432,905,math.pi/2),(435,1018,math.pi/2),(435,1044,math.pi/2),(501,1030,-math.pi/2),(435,1075,math.pi/2)],
 'admin':[(837,910,math.pi/2),(837,929,math.pi/2)]}.items():
    for i,(x,y,r) in enumerate(pts):obj(f'{zid}-toilet-{i}','toilet',x,y,zid,r,w=8,d=12)
for zid,pts in {
 'clinic':[(677,233),(677,260),(540,317),(610,157)],'lobby':[(775,641),(775,665),(786,584)],
 'ot':[(820,533),(985,533),(877,467),(976,466),(1098,424),(1098,461),(1098,493),(1098,521)],
 'rehab':[(415,830),(414,927),(499,916),(499,931),(499,990),(499,1006),(485,762)],
 'admin':[(832,879),(832,962),(1090,887)]}.items():
    for i,(x,y) in enumerate(pts):obj(f'{zid}-basin-{i}','basin',x,y,zid,w=10,d=9)
# Kitchen equipment islands and perimeter service counters, matching their plan footprints.
for i,(x,y,w,d) in enumerate([(987,680,13,62),(1026,680,17,74),(1064,674,17,88),(992,771,25,13),(1020,771,25,13),(1062,744,14,53),(928,733,34,15),(985,610,16,21)]):obj(f'kitchen-equipment-{i}','counter',x,y,'kitchen' if i!=6 else 'dining',w=w,d=d,h=.9)
for i,(x,y,w,d) in enumerate([(1034,724,15,12),(1034,741,15,12),(1062,629,17,9),(1062,648,17,9)]):obj(f'kitchen-cart-{i}','plan-cabinet',x,y,'kitchen',w=w,d=d)
# Use the image itself for streets, markings, vegetation and parked vehicles;
# do not place duplicate trees/cars over its already rendered objects.

def inside(p,poly):
    x,z=p;yes=False;j=len(poly)-1
    for i,a in enumerate(poly):
        b=poly[j]
        if ((a[1]>z)!=(b[1]>z)) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:yes=not yes
        j=i
    return yes
for o in objects:
    if not o['roomId']:
        rs=[r for r in m['rooms'] if r['zoneId']==o['zoneId'] and inside([o['position'][0],o['position'][2]],r['polygon'])]
        if rs:o['roomId']=min(rs,key=lambda r:area(r['polygon']))['id']
m['objects']=objects
# Preserve PDF exterior/detail design, reprojected into the new coordinate frame.
# Remove prior plan-conflicting internal decorative batten positions. Rebuild at the new day-room east wall.
m['details']=[d for d in m['details'] if not d.get('zoneId')]
for i,y in enumerate(np.arange(790,1078,1.3)):
    q=pt([812,y]);m['details'].append(dict(id=f'planning-day-batten-{i}',position=[q[0]-.05,1.2192,q[1]],dimensions=[.04,2.4384,.025],material='oak',surface='detail',rotation=[0,0,0],zoneId='day',status='PDF finish / planning wall placement',referencePages=[92,66,67,69]))

outline=[[201,766],[526,766],[526,150],[814,150],[814,346],[916,346],[916,292],[1045,292],[1045,346],[1114,346],[1114,660],[1398,660],[1398,1118],[1120,1118],[1120,1115],[877,1115],[877,1143],[814,1143],[814,1085],[526,1085],[526,1125],[201,1125]]
m['site'].update(image='/reference/planning/plan.jpg',imageSize=[3600,2700],bounds=[pt([18,18]),pt([1782,1332])],imagePixelBounds=[36,36,3564,2664],buildingOutline=[pt(q) for q in outline],referencePages=[92],notes='The supplied Overall Planning.jpg is the exact site-context image. Source street, parking, planting and adjacent-building imagery is preserved.')
# Texture calibration uses the 3600-pixel delivery image; trace metadata uses the 1800-pixel analysis frame.
m['calibration'].update(method='Planning-image clinic footprint area calibration',pixelsPerMeter=PPM*2,sourcePixelOrigin=[v*2 for v in ORIGIN],referencePage=92,anchorPolygonPixels=[[v*2 for v in p] for p in polys['clinic']],notes='Overall Planning.jpg controls ground-floor layout and furniture placement. Uniform scale uses the 3,254 sq ft clinic area from PDF p.14 against the clinic perimeter in this image. No linear dimensions are supplied; heights and product geometry remain provisional.')
m['source'].update(title='Overall Planning.jpg + 2024 architectural presentation',date='Planning image supplied Sep 16, 2026',pages=92)
m['referencePages'].append(dict(page=92,title='Overall Planning · current layout and furniture',label='Planning image',group='Current floor plan',image='/reference/planning/plan.jpg',file='/reference/planning/overall-full.jpg',text='User-supplied image, 7200 × 5400 pixels. Ground-floor layout and furniture arrangement are authoritative for this revision. No dimension strings or room schedule are shown.',findings='Supersedes PDF p.12 for ground-floor walls, doors, floor finishes, furniture positions, parking and streets. PDF details and upper-level information are retained only where this image supplies no replacement.',reviewStatus='traced-and-overlaid',evidenceType='current-user-supplied-plan'))
m['id']='seen-alhambra-planning';m['revision']='Overall Planning / 2026-09-16 layout reconstruction'
m['exportFiles']=dict(glb='/models/seen-alhambra-planning.glb',audit='/models/planning-update.md')
m['levels'][1]['referencePages']=[92,14,17,26];m['levels'][1]['notes']='Ground-floor geometry and furniture follow Overall Planning.jpg. Use Source overlay to compare against the exact image.'
for r,bb in zip(m['roofSections'],[[[523.5,149.5],[814,1085]],[[201,766],[526,1125]],[[814,292],[1114,1115]],[[1120,660],[1398,1118]]]):r['bounds']=[pt(p) for p in bb]
m['accuracyIssues'][0]['pages']=[92,14];m['accuracyIssues'][0]['detail']='Ground-floor positions and footprints are traced from the supplied 7200 × 5400 image. A dimensioned drawing is still needed to verify physical lengths; published-area calibration does not certify exact room dimensions.'
for i in m['accuracyIssues']:
    if i['id']=='furniture-schedule':i.update(title='Furniture product geometry and heights',detail='Overall Planning.jpg now controls counts, positions, orientation and horizontal footprints. Manufacturer geometry, exact heights, finishes and product IDs remain unspecified.',pages=[92,55,75,76])
    if i['id']=='site-survey':i.update(detail='The full supplied site image is preserved, including parking, curbs, streets, vegetation and adjacent building. Survey elevations and civil dimensions are still absent.',pages=[92])
    if i['id']=='room-schedule':i['pages']=[92,35,40,43,53,57,77]
m['planningTrace']=dict(sourceFile='/reference/planning/overall-full.jpg',originalArchivePath='sources/planning/Overall Planning.jpg',analysisImageSize=[1800,1350],pixelsPerMeter=PPM,origin=ORIGIN,groundFloorAuthority='Overall Planning.jpg',sourceImageDimensions=[7200,5400],furniturePolicy='Only furniture and equipment depicted in the image; no added therapy gym equipment.',counts=dict(dayDiamondTables=9,diningDiamondTables=5,banquetteTables=7,treeRoundTables=4,centralWorkstationSeats=12,smallMeetingSeats=6,conferenceSeats=16))
m['planningTrace']['sourceSha256']=hashlib.sha256(original.read_bytes()).hexdigest()
(OUT/'seen-alhambra-planning-base.json').write_text(json.dumps(m,indent=2))
lines=['# Overall Planning — floor plan and furniture update','','## Controlling source','','The user-supplied Overall Planning.jpg (7200 × 5400 pixels) supersedes the PDF ground-floor image for walls, openings, room configuration, furniture, site context and adjacent-building footprint. The original file is preserved unchanged; the viewer uses an RGB image of the same plan.','','## Model update','',f'- {len(m["rooms"])} room/space records.',f'- {len(m["walls"])} wall segments across all levels.',f'- {len(objects)} furniture and plumbing/equipment instances.','- Exact supplied image available through Current floor plan and Source overlay.','- Source overlay hides extruded walls/furniture to avoid doubled depictions.','- Upper-level shells and PDF finish information are retained where the image provides no replacement.','','## Seating configuration','','| Area | Configuration |','|---|---|','| Dining | 5 diamond-oriented tables, 4 chairs each |','| Day room | 9 diamond-oriented tables, 4 chairs each |','| East banquette | 7 rectangular tables, 2 loose chairs each, continuous bench |','| Tree seating | 4 round tables and 12 chairs around central tree |','| Communal table | 14 chairs |','| North day-room tables | 2 tables with 2 chairs each |','| Lounge corner | 2 round side tables and 4 blue chairs |','| Administration workbench | 12 chairs |','| Small meeting rooms | 2 rooms with 3 chairs each |','| Conference room | 16 chairs |','','## Trace contract','','Every new wall and furniture instance retains coordinates in a 1800 × 1350 analysis frame (one quarter of the original image). Furniture records also retain horizontal footprints, rotations and stable IDs. These coordinates are converted once to meters. Use the data to replace a building or swap an asset family without modifying the renderer.','','## Verification and limitations','','Wall centerlines and furniture footprints were plotted directly over the supplied image. Positions, counts and horizontal footprints follow this image; heights, manufacturer geometry, hidden construction and unprovided upper-floor fit-out are not established by the image. Physical scale uses the PDF clinic area (3,254 sq ft) and remains provisional until a measured length or dimensioned drawing is supplied. This is not an as-built dimensional certification. Browser visual testing is not included.','','## Room / space register','','| ID | Room / space | Furniture / fixtures |','|---|---|---:|']
for r in m['rooms']:lines.append(f'| {r["id"]} | {r["name"]} | {sum(o.get("roomId")==r["id"] for o in objects)} |')
lines+=['','## Source priority','','1. Overall Planning.jpg: current ground-floor plan and furniture arrangement.','2. Final 2024 PDF: published areas, finish/elevation references, basement and upper-level information.','3. Inferred values: clearly identified dimensions and geometry not documented by either source.']
(OUT/'planning-update.md').write_text('\n'.join(lines)+'\n')
(ROOT/'MODEL_NOTES.md').write_text('\n'.join(lines[:lines.index('## Room / space register')])+'\n\nFull update: public/models/planning-update.md. Previous PDF audit: public/models/accuracy-register.md.\n')
print(f'Planning model: {len(m["rooms"])} spaces, {len(m["walls"])} wall segments, {len(objects)} furniture/fixture instances; {PPM:.6f} analysis pixels/m.')
