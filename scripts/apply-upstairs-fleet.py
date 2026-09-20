"""Photo-informed upstairs fit-out and approved van appearance; preserve ground-floor plan."""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models'
REF = ROOT / 'public/reference/fleet'


def apply_update(m):
    m['objects'] = [o for o in m['objects'] if not o['id'].startswith(('upperfit-', 'fleet-'))]
    m['walls'] = [w for w in m['walls'] if not w['id'].startswith('upperfit-')]
    m['rooms'] = [r for r in m['rooms'] if not r['id'].startswith('upperfit-')]
    m['referencePages'] = [r for r in m['referencePages'] if r['page'] not in (112, 113)]
    m['referencePages'] += [
        dict(page=112, title='Upstairs administration · photograph survey', label='Upstairs survey', group='Upstairs buildout',
             image='/reference/final/15.jpg', text='Fourteen user-supplied upstairs photographs reviewed September 19, 2026. Preview is the original upper-floor plan; original office photos remain in the local source register.',
             findings='Photos establish an open office with pale blue and white workstations, grey fabric dividers, white mesh chairs, wood-look flooring, timber slat walls, exposed black services and linear lights. A long conference room has joined oak tables, mesh chairs, mobile display and suspended ceiling. Storage, a restroom and a gated platform-lift landing are visible. Room registration, dimensions, workstation count and vertical circulation geometry are estimates.',
             reviewStatus='photo-observed / placement-estimated', evidenceType='photo-survey-summary'),
        dict(page=113, title='Final van designs · Van A and Van B', label='Final vans', group='Vehicles',
             image='/reference/fleet/final-vans.png', file='/reference/fleet/final-vans.pdf', sourceName='Final Van design Van A and Van B.pdf',
             text='User-supplied final design sheet, one page, two columns. Left column used as Van A; right column used as Van B.',
             findings='Teal RAM-front van design, gold graphics, Seen Health bilingual markings, photographic side panels, paired passenger entry doors and rear branding. The 3D model uses this sheet for wrap appearance. Model year, wheelbase, dimensions, capacity and wheelchair lift/ramp mechanism are not specified by the sheet.',
             reviewStatus='user-selected-final-design', evidenceType='vehicle-design-sheet')]

    def mat(k,c,**kw): m['materials'][k] = dict(color=c,roughness=.7,**kw)
    mat('upperfit-floor','#b7aa98',pattern='plank')
    mat('upperfit-wall','#d7cbb2')
    mat('upperfit-blue','#9ec6ce')
    mat('upperfit-divider','#929b9d')
    mat('upperfit-wood','#c39d6a',pattern='woodgrain')
    mat('upperfit-mesh','#b9ad91')
    mat('upperfit-metal','#a6adb0',metalness=.6)
    mat('fleet-teal','#075460')
    mat('fleet-glass','#24464d')
    mat('fleet-wrap','#ffffff',textureUrl='/reference/fleet/final-vans.png')

    def asset(k,kind,dims,material,materials=None,**parameters):
        m['assets'][k]=dict(kind=kind,dimensions=dims,material=material)
        if materials: m['assets'][k]['materials']=materials
        if parameters: m['assets'][k]['parameters']=parameters

    def obj(k,aid,x,z,y=0,rotation=0,room='upper-office-shell',layer='furniture',zone='upper-office'):
        m['objects'].append(dict(id=k,assetId=aid,zoneId=zone,levelId='site' if zone=='site' else 'upper',
            position=[x,y,z],rotation=rotation,scale=[1,1,1],roomId=None if zone=='site' else room,
            referencePages=[113 if zone=='site' else 112],status='appearance-referenced / dimensions-and-placement-estimated',
            notes='Appearance from supplied sources; dimensions and placement are estimates. Ground-floor plan furniture is unchanged.',layer=layer))

    def component(k,x,z,dims,material,y=0,rotation=0,room='upper-office-shell',layer='architecture',kind='box'):
        asset(k,kind,dims,material)
        obj(k,k,x,z,y,rotation,room,layer)

    def rect(x,z,w,d): return [[x,z],[x+w,z],[x+w,z+d],[x,z+d]]
    def room(k,name,x,z,w,d,kind):
        m['rooms'].append(dict(id=k,name=name,zoneId='upper-office',levelId='upper',polygon=rect(x,z,w,d),kind=kind,
            referencePages=[112,15],status='photo-observed / boundaries-estimated',floorMaterial='upperfit-floor',
            notes='Use and fit-out observed in supplied upstairs photos. Position and size within the existing upper-floor footprint are provisional, not surveyed.'))
    room('upperfit-conference','Upstairs conference room',10.8,11.8,4,13.7,'meeting')
    room('upperfit-storage','Upstairs storage',10.8,9.25,4,2.55,'storage')
    room('upperfit-restroom','Upstairs restroom',6.7,9.25,2.1,2.55,'restroom')
    room('upperfit-lift','Upstairs lift landing',.25,10.3,2.1,2.3,'circulation')
    upper = next(z for z in m['zones'] if z['id']=='upper-office')
    upper.update(name='Upstairs administration',short='Office & conference',floorMaterial='upperfit-floor',referencePages=[15,18,112],
        notes='Photo-informed open workstations, conference room, storage, restroom and lift landing. Fit-out appearance observed; room placement, counts, dimensions and access registration remain estimated.',geometryStatus='plan-footprint / photo-informed-fitout')
    main = next(r for r in m['rooms'] if r['id']=='upper-office-shell')
    main.update(name='Upstairs open office',kind='office',polygon=[[.2,9.25],[6.7,9.25],[6.7,11.8],[8.8,11.8],[8.8,9.25],[10.8,9.25],[10.8,25.5],[.2,25.5]],
        referencePages=[15,112],status='photo-observed / arrangement-estimated',floorMaterial='upperfit-floor',notes=upper['notes'])
    level = next(l for l in m['levels'] if l['id']=='upper')
    level['referencePages']=[15,18,112]
    level['notes']='Upstairs administration fit-out is photo-informed. Floor elevation, room registration and lift/stair connections remain inferred. Equipment mezzanine unchanged.'
    for w in m['walls']:
        if w['zoneId']=='upper-office': w['material']='upperfit-wall'
    def wall(k,a,b):
        m['walls'].append(dict(id='upperfit-'+k,zoneId='upper-office',levelId='upper',a=a,b=b,height=2.7,thickness=.13,
            material='upperfit-wall',status='photo-informed / position-estimated',referencePages=[112]))
    wall('conference-west-a',[10.8,11.8],[10.8,12.3]);wall('conference-west-b',[10.8,13.3],[10.8,25.5])
    wall('conference-north-a',[10.8,11.8],[11.15,11.8]);wall('conference-north-b',[12.15,11.8],[14.8,11.8])
    wall('restroom-east',[8.8,9.25],[8.8,11.8]);wall('restroom-west',[6.7,9.25],[6.7,11.8])
    wall('restroom-front-a',[6.7,11.8],[7,11.8]);wall('restroom-front-b',[8,11.8],[8.8,11.8])
    wall('storage-entry-a',[10.8,9.25],[10.8,9.5]);wall('storage-entry-b',[10.8,10.5],[10.8,11.8])

    asset('upperfit-desk-blue','admin-workstation',[1.5,1.25,.75],'upperfit-blue',{'white':'photo-white','divider':'upperfit-divider'})
    asset('upperfit-desk-white','admin-workstation',[1.45,.75,.72],'photo-white',{'white':'photo-white'},divider=False)
    asset('upperfit-chair','mesh-chair',[.62,1.02,.62],'upperfit-mesh',{'frame':'photo-white','metal':'upperfit-metal'})
    asset('upperfit-monitor','admin-monitor',[.68,.47,.2],'screen',{'white':'photo-white'})
    # Two banks of paired desks, plus perimeter workstations. Count is illustrative.
    desks=[]
    for bank,z in enumerate([16.2,21.1]):
        for col,x in enumerate([4.1,5.68,7.26]):
            for side in [-1,1]: desks.append((f'bank-{bank}-{col}-{side}',x,z+side*.4,0 if side==-1 else math.pi,'upperfit-desk-blue'))
    for i,z in enumerate([15.2,18.0,20.8,23.6]):desks.append((f'perimeter-{i}',.85,z,-math.pi/2,'upperfit-desk-white'))
    for i,x in enumerate([3.5,5.3]):desks.append((f'rear-{i}',x,10.1,math.pi,'upperfit-desk-white'))
    for k,x,z,rot,aid in desks:
        obj('upperfit-desk-'+k,aid,x,z,rotation=rot)
        obj('upperfit-monitor-'+k,'upperfit-monitor',x+math.sin(rot)*.19,z+math.cos(rot)*.19,y=.75,rotation=rot)
        obj('upperfit-chair-'+k,'upperfit-chair',x-math.sin(rot)*.83,z-math.cos(rot)*.83,rotation=rot+math.pi)
    # Long conference table assembled from repeated meeting tables with mesh seating.
    asset('upperfit-conference-table','table',[1.6,.74,2.1],'oak')
    for i,z in enumerate([15.1,17.2,19.3,21.4]):obj(f'upperfit-meeting-table-{i}','upperfit-conference-table',12.8,z,room='upperfit-conference')
    for i,z in enumerate([14.5,15.65,16.8,17.95,19.1,20.25,21.4,22.55]):
        for x,rot in [(11.6,-math.pi/2),(14,math.pi/2)]:obj(f'upperfit-meeting-chair-{i}-{x}','upperfit-chair',x,z,rotation=rot,room='upperfit-conference')
    obj('upperfit-conference-end-chair','upperfit-chair',12.8,23.5,rotation=0,room='upperfit-conference')
    component('upperfit-display',12.8,13.25,[1.55,.88,.075],'screen',y=.95,room='upperfit-conference')
    component('upperfit-display-post',12.8,13.25,[.06,.95,.06],'photo-black',room='upperfit-conference')
    component('upperfit-display-base',12.8,13.25,[1,.08,.55],'photo-black',room='upperfit-conference')
    component('upperfit-video-bar',12.8,13.25,[.6,.075,.08],'photo-black',y=1.86,room='upperfit-conference')
    asset('upperfit-conference-ceiling','ceiling-grid',[3.9,.045,13.6],'photo-white',{'light':'photo-led'})
    obj('upperfit-conference-ceiling','upperfit-conference-ceiling',12.8,18.65,y=2.68,room='upperfit-conference',layer='ceiling')
    component('upperfit-conference-slat',12.8,25.34,[3.9,2.65,.07],'upperfit-wood',room='upperfit-conference',kind='slat-wall',layer='wall-finish')
    component('upperfit-west-slat',.18,18.5,[12.9,2.8,.07],'upperfit-wood',rotation=math.pi/2,kind='slat-wall',layer='wall-finish')
    component('upperfit-front-slat',5.3,25.35,[10.2,2.8,.07],'upperfit-wood',kind='slat-wall',layer='wall-finish')
    for i,x in enumerate([2.9,8.9]):
        component(f'upperfit-duct-long-{i}',x,17.8,[.48,.35,14.6],'photo-black',y=2.48,layer='ceiling')
    for i,z in enumerate([13.5,18.5,23.3]):
        component(f'upperfit-duct-cross-{i}',5.3,z,[10.1,.35,.42],'photo-black',y=2.48,layer='ceiling')
        for j,x in enumerate([2.5,5.6,8.6]):
            component(f'upperfit-light-{i}-{j}',x,z+.85,[.3,.06,1.3],'photo-led',y=2.76,layer='ceiling')
    for i,z in enumerate([13.0,17.5,22.0]):
        component(f'upperfit-service-pipe-{i}',5.3,z,[.1,.1,10.3],'photo-black',y=2.44,rotation=math.pi/2,kind='round-duct',layer='ceiling')
    asset('upperfit-storage-rack','wire-rack',[1.7,1.9,.55],'upperfit-wood',{'metal':'upperfit-metal'})
    for i,x in enumerate([11.8,13.65]):obj(f'upperfit-storage-rack-{i}','upperfit-storage-rack',x,9.65,room='upperfit-storage')
    component('upperfit-file-cabinet',14.2,11.2,[.85,1.35,.47],'photo-white',room='upperfit-storage')
    obj('upperfit-toilet','toilet',7.2,9.75,room='upperfit-restroom')
    obj('upperfit-basin','basin',8.35,10.1,rotation=-math.pi/2,room='upperfit-restroom')
    component('upperfit-restroom-band',7.75,9.4,[1.9,.36,.04],'photo-teal-tile',y=1.25,room='upperfit-restroom',layer='wall-finish')
    asset('upperfit-lift-gate','lift-gate',[1.45,1.08,1.5],'photo-white',{'white':'photo-white','metal':'upperfit-metal'})
    obj('upperfit-lift-gate','upperfit-lift-gate',1.25,11.45,room='upperfit-lift',layer='architecture')
    for variant,x in [('A',-21),('B',-16)]:
        aid='fleet-van-'+variant.lower()
        asset(aid,'fleet-van',[2.25,2.8,6.35],'fleet-teal',{'wrap':'fleet-wrap','glass':'fleet-glass','metal':'upperfit-metal'},variant=variant)
        obj(aid,aid,x,-6,rotation=0,zone='site',layer='exterior')
    m['source']['pages']=len(m['referencePages'])
    m['revision']='2026-09-19 / photo-informed upstairs administration and final Van A/B designs'
    m['planningTrace']['furniturePolicy']='Ground-floor furniture follows Overall Planning.jpg. Upstairs fit-out is a separate photo-informed layer requested September 19; upper dimensions and placement remain estimated.'
    m['upstairsSurvey']=dict(date='2026-09-19',photoCount=14,reference=112,placementStatus='estimated',workstationCount=18,
        observed=['Open workstation banks','White mesh task chairs','Timber slat wall panels','Exposed black ducts and pipework','Long conference room','Storage shelving','Restroom','Gated platform-lift landing'],
        unresolved=['Measured upstairs plan and orientation','Exact workstation count','Partition and doorway registration','Stair openings and lift shaft alignment','Floor-to-floor height'])
    for issue in m['accuracyIssues']:
        if issue['id']=='second-floor':issue.update(title='Upstairs layout registration',detail='Fourteen supplied photos establish fit-out, open office, conference room, storage, restroom and lift landing. Placement, dimensions, workstation count and vertical access alignment remain estimated within the existing footprint.',pages=[15,18,112])
        if issue['id']=='photo-coverage':issue['detail']='Ground-floor finishes and upstairs fit-out are photo-informed. The drone covers the street frontage, not an overhead roof survey. Hidden roof surfaces, unphotographed areas and precise upstairs layout remain provisional.';issue['pages']=[111,112,92]
    m['exportFiles']['audit']='/models/upstairs-fleet-update.md'
    m['designDecisions']=dict(staffClothing=dict(color='solid colors from supplied references',cut='retain the supplied garment cut',pattern='none',ginkgoPrint=False,status='Implemented in stylized 3D characters: solid colors and reference cut without ginkgo print'),fleet=dict(sourcePage=113,variants=['A','B'],status='static appearance models',dimensions='estimated'))
    return m


if __name__ == '__main__':
    m=json.loads((OUT/'seen-alhambra-planning.json').read_text())
    apply_update(m)
    (OUT/'seen-alhambra-planning.json').write_text(json.dumps(m,indent=2)+'\n')
    print(f"Applied upstairs and fleet update: {len(m['objects'])} objects, {len(m['rooms'])} rooms.")
