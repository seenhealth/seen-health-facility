"""Close the registered perimeter without changing interior room/furniture positions.

Called by build-photo-update.py. Plan coordinates are in the 1800px analysis
frame; all exported walls/openings are in meters and require no site-specific
renderer code. Unseen elevations deliberately retain an inferred status.
"""
import math

def apply_envelope(m):
    trace=m['planningTrace']; p=trace['pixelsPerMeter']; ox,oy=trace['origin']
    def pt(x,y): return [round((x-ox)/p,6),round((y-oy)/p,6)]
    def polygon(points): return [pt(*q) for q in points]
    walls=[]; loops=[]
    def wall(id,a,b,zone,height=6.65,material='photo-facade',openings=(),profile=False,details=None,refs=None):
        length=math.dist(a,b)/p
        w=dict(id='shell-'+id,a=pt(*a),b=pt(*b),zoneId=zone,height=height,thickness=.24,
               material=material,openings=[],status='plan-traced perimeter / inferred elevation and opening heights',referencePages=refs or [92,19])
        for i,(lo,hi,sill,h,kind,ma) in enumerate(openings):
            w['openings'].append(dict(id=f'shell-{id}-opening-{i+1}',offset=round(lo/p,6),width=round((hi-lo)/p,6),sill=sill,height=h,kind=kind,material=ma))
        if profile:
            w['profile']=[[round(length*i/28,6),round(height+2.1*math.sin(math.pi*i/28),6)] for i in range(29)]
        if details: w['detailIds']=details; w['status']='photograph-informed frontage / estimated heights'
        walls.append(w); return w['id']
    # Clockwise, starting at the west therapy wing. Every step in the plan is retained.
    specs=[
      ('therapy-north',(201,766),(526,766),'rehab',6.2,[(74,157,0,2.35,'door','glass'),(165,253,0,2.35,'door','glass')]),
      ('lobby-west',(526,766),(526,551.5),'lobby',4.15,[(111,140,.65,1.65,'window','glass'),(147,177,.65,1.65,'window','glass'),(182,207,0,2.2,'door','glass')]),
      ('clinic-step',(526,551.5),(523.5,551.5),'clinic',4.15,[]),
      ('clinic-west',(523.5,551.5),(523.5,149.5),'clinic',4.15,[]),
      ('clinic-north',(523.5,149.5),(814,149.5),'clinic',4.15,[(168,190,0,2.15,'door','photo-white')]),
      ('clinic-east',(814,149.5),(814,346),'clinic',4.15,[]),
      ('rear-court',(814,346),(916,346),'ot',6.65,[(57,83,0,2.15,'door','photo-white')]),
      ('rear-stair-west',(916,346),(916,292),'ot',6.65,[(2,28,0,2.15,'door','photo-white')]),
      ('rear-north',(916,292),(1045,292),'ot',6.65,[(45,97,0,2.3,'window','glass'),(97,118,0,2.3,'door','glass')]),
      ('rear-return',(1045,292),(1045,346),'ot',6.65,[]),
      ('rear-east-north',(1045,346),(1114,346),'ot',6.65,[]),
      ('rear-east',(1114,346),(1114,554),'ot',6.65,[(28,54,.75,1.4,'window','glass')]),
      ('east-exit',(1114,554),(1114,597),'hall',6.65,[(1,36,0,2.15,'door','glass')]),
      ('admin-east-entry',(1114,597),(1114,882),'veranda',6.65,[]),
      ('admin-east',(1114,882),(1114,1115),'admin',6.65,[]),
      ('admin-front',(1114,1115),(877,1115),'admin',6.65,[]),
      ('admin-front-return',(877,1115),(877,1143),'admin',6.65,[]),
      ('admin-stair-front',(877,1143),(814,1143),'admin',6.65,[]),
      ('admin-entry-return',(814,1143),(814,1085),'admin',6.65,[(5,28,0,2.15,'door','glass')]),
      ('day-front',(814,1085),(526,1085),'day',4.15,[]),
      ('therapy-east-return',(526,1085),(526,1125),'rehab',6.2,[]),
      ('therapy-front',(526,1125),(201,1125),'rehab',6.2,[]),
      ('therapy-west',(201,1125),(201,766),'rehab',6.2,[(79,102,0,2.15,'door','photo-white')]),
    ]
    main=[]
    photo_details=[d['id'] for d in m['details'] if d['id'].startswith('photo-therapy-')]
    # Preserve the existing photographic frontage; replace the old incomplete generic walls.
    remove_prefix=('admin-front-','adjacent-front-','day-front-')
    m['details']=[d for d in m['details'] if not d['id'].startswith(remove_prefix) and d['id'] not in ['clinic-north','clinic-west','therapy-west','west-entry-fascia']]
    for id,a,b,z,h,op in specs:
        length=math.dist(a,b)
        if id=='admin-front':
            for k in range(7):
                lo=k*length/7+3;hi=(k+1)*length/7-3
                op.extend([(lo,hi,.65,1.9,'window','glass'),(lo,hi,3.15,1.95,'window','glass')])
        if id=='day-front':
            for k in range(8):
                lo=k*length/8+1.2;hi=(k+1)*length/8-1.2
                op.append((lo,hi,0 if k in [1,6] else .03,2.68,'door' if k in [1,6] else 'window','glass'))
        if id=='therapy-front':
            for k in range(7):
                op.append((k*length/7+.7,(k+1)*length/7-.7,.52,2.24,'window','glass'))
            for x in [250+k*33 for k in range(7)]:
                op.append((526-x-.22*p,526-x+.22*p,3.28,1.74,'window','glass'))
        main.append(wall(id,a,b,z,h,material='blue' if id=='day-front' else 'photo-facade',openings=op,
                         profile=id in ['clinic-north','day-front'],details=photo_details if id=='therapy-front' else None,
                         refs=[92,110,111] if id=='therapy-front' else [92,109,25] if id in ['therapy-north','lobby-west'] else [92,19]))
    loops.append(dict(id='main-building',wallIds=main))
    adj=[]
    for id,a,b in [('north',(1120,660),(1398,660)),('east',(1398,660),(1398,1118)),('front',(1398,1118),(1120,1118)),('west',(1120,1118),(1120,660))]:
        op=[]
        if id=='front':
            for k in range(7):
                lo=k*278/7+4;hi=(k+1)*278/7-4
                op.extend([(lo,hi,.65,1.9,'window','glass'),(lo,hi,3.15,1.95,'window','glass')])
        adj.append(wall('adjacent-'+id,a,b,'adjacent',6.65,openings=op))
    loops.append(dict(id='adjoining-building',wallIds=adj))
    m['envelope']=dict(walls=walls,loops=loops,notes='Two continuous plan-registered perimeter loops. Rear elevations and opening heights are best-effort inferred; no unseen windows or furnishings are claimed as measured. Photo-informed therapy frontage is retained. Closed opening panels remain individually swappable by material and dimensions.')
    # Roof slabs follow the exact stepped footprint instead of bridging exterior notches.
    for r in m['roofSections']:
        if r['id']=='central':
            r['bounds']=[pt(523.5,149.5),pt(814,1085)]
            r['polygon']=polygon([(523.5,149.5),(814,149.5),(814,1085),(526,1085),(526,551.5),(523.5,551.5)])
        if r['id']=='therapy': r['eaveHeight']=6.05
        if r['id']=='east':
            r['polygon']=polygon([(814,346),(916,346),(916,292),(1045,292),(1045,346),(1114,346),(1114,1115),(877,1115),(877,1143),(814,1143)])
            r['bounds']=[pt(814,292),pt(1114,1143)]
        if r['id']=='adjacent': r['eaveHeight']=6.5
        r['parapet']=False
        r['referencePages']=list(dict.fromkeys([92,19]+r['referencePages']))
    # Close the exposed wall above each lower barrel eave at a taller wing.
    for id,x,ya,yb,height in [('east-roof-step',814,346,1085,2.63),('therapy-roof-step',526,766,1085,2.18)]:
        q=pt(x,(ya+yb)/2)
        m['details'].append(dict(id=id,position=[q[0],4.02,q[1]],dimensions=[.24,height,(yb-ya)/p],material='photo-facade',surface='exterior',rotation=[0,0,0],status='inferred roof junction',referencePages=[92,19]))
    m['revision']='2026-09-18 / complete perimeter, stepped roofs and sectional inspection'
    m['facade']['status']='Closed plan-traced perimeter; rear elevations and heights inferred'
    m['accuracyIssues'].append(dict(id='rear-envelope',title='Rear and side elevations are reconstructed',detail='Continuous walls follow the Overall Planning perimeter, including the clinic east face, rear setbacks, service exits, admin stair projection and adjoining building. Unphotographed wall heights, opening heights and finishes are inferred. The full shell is complete for viewing, not certified as-built geometry.',status='inferred',pages=[92,19,25,109,110,111]))
    return m
