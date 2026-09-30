"""Complete Olympic's day furniture without rebuilding any room or opening."""
import json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PI = math.pi
for variant in ['olympic', 'olympic-option']:
    path = ROOT / f'public/models/seen-{variant}.json'
    m = json.loads(path.read_text())
    rooms = {r['id']: r for r in m['rooms']}
    replaced = {'ground-day-west', 'ground-dining', 'ground-activities', 'ground-memory'}
    m['objects'] = [o for o in m['objects'] if not o['id'].startswith('olympic-dayfit-') and not (o.get('roomId') in replaced and o.get('layer') == 'furniture')]
    ppm = m['calibration']['pixelsPerMeter']; origin = m['calibration']['sourcePixelOrigin']
    n = 0
    def add(asset, x, z, room, rotation=0, scale=(1,1,1), proposed=False, pixels=True):
        global n
        n += 1
        if pixels: x,z = (x-origin[0])/ppm, (z-origin[1])/ppm
        r = rooms['ground-'+room]
        m['objects'].append({'id':f'olympic-dayfit-{n:03}', 'assetId':asset, 'zoneId':r['zoneId'], 'levelId':'ground', 'roomId':r['id'], 'position':[round(x,5),0,round(z,5)], 'rotation':rotation, 'scale':list(scale), 'layer':'furniture', 'referencePages':[1], 'status':'Proposed Seen day-space furnishing' if proposed else 'A-1 furniture symbol / shared Seen asset', 'notes':'Supplemental furnishing in previously sparse day space; products and clearances require design review.' if proposed else 'Table and seating group restored from the first-floor furniture symbols; shared Seen finishes and furniture.'})
    def table(x,z,room,w=2.05,d=1.0,chairs=6,rotation=0,proposed=False,pixels=True,ends=True):
        if pixels: x,z = (x-origin[0])/ppm, (z-origin[1])/ppm
        add('review-table',x,z,room,rotation,(w/1.524,1,d/.762),proposed,False)
        if chairs==4 and w==d:
            seats=[(0,-d/2-.32,PI),(0,d/2+.32,0),(-w/2-.32,0,-PI/2),(w/2+.32,0,PI/2)]
        else:
            count=(chairs-2)//2 if ends else chairs//2
            seats=[(dx,side*(d/2+.32), PI if side<0 else 0) for side in [-1,1] for dx in [((i+.5)/count-.5)*w for i in range(count)]]
            if ends: seats += [(-w/2-.32,0,-PI/2),(w/2+.32,0,PI/2)]
        for dx,dz,angle in seats:
            xx=x+math.cos(rotation)*dx+math.sin(rotation)*dz
            zz=z-math.sin(rotation)*dx+math.cos(rotation)*dz
            add('photo-dining-chair',xx,zz,room,angle+rotation,proposed=proposed,pixels=False)
    # Six rotated four-person groups are visible in the central restaurant.
    for x,z in [(1000,600),(1090,600),(1180,600),(1268,600),(1000,674),(1090,674)]:
        table(x,z,'dining',.95,.95,4,PI/4)
    # Four southern dining tables have three seats on each long side.
    for x,z in [(815,789),(815,877),(934,789),(934,877)]:
        table(x,z,'dining',2.05,1.0,6,ends=False)
    table(1338,651,'dining',2.05,1.0,6)
    for x,z,a in [(872,586,PI),(903,586,PI),(936,627,PI/2),(936,660,PI/2),(872,695,0),(903,695,0)]:
        add('photo-lounge-chair',x,z,'dining',a)
    add('plan-lounge-table',887,642,'dining')
    # Long craft tables, a two-person table and both lounge groupings in A-1.
    for x,z in [(1002,375),(1002,468)]: table(x,z,'activities',2.05,1.0,6)
    table(1242,449,'activities',2.05,1.0,4,ends=False)
    table(966,307,'activities',1.15,.72,2)
    for x,z,a in [(1086,321,PI),(1170,374,0),(1250,321,PI),(1108,359,-PI/4),(1228,359,PI/4),(1090,451,-PI/2),(1090,480,-PI/2),(1115,426,PI),(1145,426,PI)]:
        add('photo-lounge-chair',x,z,'activities',a)
    add('plan-lounge-table',1129,460,'activities',proposed=True)
    # Memory care: rotated activity table and three drawn lounge chairs.
    table(1401,338,'memory',.95,.95,4,PI/4)
    for x,z,a in [(1299,342,-PI/2),(1299,384,-PI/2),(1332,312,PI)]: add('photo-lounge-chair',x,z,'memory',a)
    add('plan-lounge-table',1335,369,'memory',proposed=True)
    add('cabinet',1375,404,'memory',proposed=True)
    # A-1 leaves the west day room unfurnished; these are design-phase additions.
    for x,z in [(-21.9,-8.7),(-18.8,-8.7)]: table(x,z,'day-west',1.0,1.0,4,proposed=True,pixels=False)
    for x in [-22.8,-21.25]: add('photo-lounge-chair',x,-5.25,'day-west',0,proposed=True,pixels=False)
    add('plan-lounge-table',-19.5,-5.4,'day-west',proposed=True,pixels=False)
    add('cabinet',-19.5,-10.38,'day-west',proposed=True,pixels=False)
    # Complete the reading / quiet seating using the same low tables and storage.
    add('plan-lounge-table',-1.5,-9.1,'library',proposed=True,pixels=False)
    add('cabinet',-3.1,-8.5,'library',PI/2,proposed=True,pixels=False)
    add('plan-lounge-table',1492,334,'quiet-n',proposed=True)
    for x,z in [(734,799),(727,870)]: add('plan-lounge-table',x,z,'quiet',proposed=True)
    m['accuracyIssues']=[a for a in m['accuracyIssues'] if a['id']!='olympic-day-furniture']
    m['accuracyIssues'].append({'id':'olympic-day-furniture','title':'Day-space furniture completion','status':'Drawing groups restored / supplementary fit-out proposed','detail':'Central restaurant tables, dining lounge chairs, long group-activity tables and seating groups follow A-1 furniture symbols. The west day room and supplementary reading tables / low storage use shared Seen furniture as a proposed design-phase fit-out. Doorways, room boundaries, the 2 ft raised wing and the second-floor furniture remain unchanged. Entrance-side parking enclosure omitted by request.','pages':[1]})
    path.write_text(json.dumps(m,indent=2)+'\n')
    print(variant, n, 'day-space furniture instances; room geometry unchanged')
