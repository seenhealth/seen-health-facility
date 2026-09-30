"""Apply exterior-only evidence; preserve all interior rooms, furniture and door schedules."""
import json
from pathlib import Path

root=Path('public/models')
def reference(model,title,findings):
    page=next((p for p in model['referencePages'] if p['title']==title),None)
    if page:return page['page']
    number=model['source']['pages']+1
    model['source']['pages']=number
    model['referencePages'].append({'page':number,'title':title,'group':'Exterior references','text':'','findings':findings,'reviewStatus':'Reviewed for exterior geometry only','evidenceType':'Photograph / design rendering'})
    return number
for path in root.glob('seen-alhambra-*.json'):
    m=json.loads(path.read_text())
    if not m.get('envelope'): continue
    m['exteriorAppearance']='alhambra-brochure'
    ref=reference(m,'Valley offering brochure - exterior photographs','Exterior photographs and aerials, PDF pages 1, 3, 5, 7 and 12-13. Interior photos excluded; no source files published.')
    m['materials']['om-stone']={'name':'Light concrete exterior - brochure','color':'#d9d5ca','roughness':.88}
    m['materials']['om-blue']={'name':'Blue standing-seam entry','color':'#3f6d7e','roughness':.72}
    m['materials']['om-glass']={'name':'Exterior blue-grey glazing','color':'#7b9294','roughness':.27,'metalness':.16}
    m['facade']['wallMaterial']='om-stone'
    m['facade']['status']='Exterior photographs from the supplied 1819-1841 Valley brochure; footprint retained from plan, unmeasured heights/details estimated.'
    m['site']['notes']='Plan-derived site geometry, refined using the exterior photographs and aerials in the supplied 1819-1841 W Valley brochure. Current Seen fit-out and fleet retained; historical tenant signs omitted. Heights and concealed rear details remain estimates.'
    m['details']=[d for d in m['details'] if d['id']!='day-canopy']
    for d in m['details']:
        if not d.get('zoneId') and d['surface']=='exterior' and d['material']=='photo-facade':d['material']='om-stone'
    for w in m['envelope']['walls']:
        w['material']='om-stone'
        for o in w['openings']:
            if o['material']=='glass':o['material']='om-glass'
        def openings(values):
            w['openings']=[{'id':w['id']+'-om-'+str(i),'offset':x,'width':width,'sill':sill,'height':height,'kind':kind,'material':'om-glass'} for i,(x,width,sill,height,kind) in enumerate(values)]
            w['status']='Exterior photograph-informed opening proportions; dimensions estimated against the retained plan footprint'
        if w['id']=='shell-day-front':
            w['material']='om-blue'
            w['profile']=[[0,6.2],[14.653121,6.2]]
            openings([(1.65,3.55,.35,2.78,'door'),(8.85,3.55,.35,2.78,'door')])
        elif w['id']=='shell-admin-front':
            # 1827: a glazed two-storey entry bay followed by paired narrow vertical windows.
            openings([(x,.57,sill,1.94,'window') for x in [1.0,3.0,5.0,7.0,9.0] for sill in [.48,3.3]])
        elif w['id']=='shell-admin-stair-front':
            openings([(.18,2.82,.18,2.6,'door'),(.18,2.82,3.14,1.96,'window')])
        elif w['id']=='shell-adjacent-front':
            # 1819: upper slits and recessed low storefront beneath the blue projecting shade.
            openings([(.65,9.5,.2,2.52,'door')]+[(x,.54,3.45,1.86,'window') for x in [2.0,4.0,6.0,8.0,10.0]])
        elif w['id']=='shell-therapy-west':
            w['openings']=[o for o in w['openings'] if o['offset']>3.5]
            w['openings'].append({'id':'ethel-corner-return-glazing','offset':.05,'width':3.35,'sill':.52,'height':2.24,'kind':'window','material':'om-glass'})
    for r in m['roofSections']:
        if r['id']=='adjacent':r['eaveHeight']=5.82
    m['accuracyIssues']=[a for a in m['accuracyIssues'] if a['id']!='alhambra-exterior-brochure']
    m['accuracyIssues'].append({'id':'alhambra-exterior-brochure','title':'Exterior photograph review','detail':'Exterior-only review of the supplied offering brochure: folded blue entry canopy, pale concrete panels, narrow upper windows, glazed Ethel corner, sunshades, terrace rails and rooftop equipment. Interior photographs were excluded. The brochure shows historical tenant branding; current Seen branding and interior layouts are retained. Unseen rear openings and unmeasured facade heights remain approximate.','status':'Photo-informed; dimensions estimated','pages':[ref]})
    path.write_text(json.dumps(m,indent=2)+'\n')

path=root/'seen-alveare.json'
m=json.loads(path.read_text())
m['exteriorAppearance']='alveare-renderings'
ref=reference(m,'Related California - Alveare exterior renderings','NE and NW design renderings and construction aerial from https://www.relatedcalifornia.com/our-company/properties/alveare . Viewed September 22, 2026. Public renderings are not a survey.')
m['materials']['alveare-render-white']={'name':'Alveare white exterior finish','color':'#e5e3db','roughness':.86}
m['materials']['alveare-render-glass']={'name':'Alveare exterior glazing','color':'#899b9b','roughness':.28,'metalness':.12}
for w in m['envelope']['walls']:
    w['material']='alveare-render-white'
    for o in w['openings']:o['material']='alveare-render-glass'
    # Keep the traced ground-floor openings, adding the observed exterior frame finish.
m['facade']['status']='White and bronze facade character from Related California design renderings; senior footprint and eight levels follow the newer August 2026 CD set. Heights and window modules remain estimated.'
m['roofSections'][0]['eaveHeight']=26.95
m['roofSections'][0]['status']='Estimated roof level below stepped parapets; eight senior levels retained from the August 2026 CD schedules.'
m['site']['notes']=m['site']['notes'].split(' Facade finishes,')[0]+' Facade finishes, recessed window bays, street landscaping and family-phase context refined from Related California NE/NW design renderings. Family massing remains indicative.'
m['accuracyIssues']=[a for a in m['accuracyIssues'] if a['id']!='alveare-exterior-renderings']
m['accuracyIssues'].append({'id':'alveare-exterior-renderings','title':'Exterior design renderings','detail':'White plaster, bronze vertical cladding, recessed glazing, stepped parapets, entrance canopies and street planting follow Related California NE/NW renderings. These depict a proposed development, not an as-built survey. The website lists 7 floors; the newer August 2026 senior schedules explicitly include Level 08, which is retained. The senior ground-floor plan remains unchanged. Upper window positions, heights, family-phase footprints and unseen elevations are estimates.','status':'Rendering-informed; review required','pages':[ref]})
path.write_text(json.dumps(m,indent=2)+'\n')
print('Updated Alhambra variants and Alveare exterior evidence; interior geometry retained.')
