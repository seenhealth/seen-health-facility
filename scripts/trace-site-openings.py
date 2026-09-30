"""Extract partition faces and door swing curves from the supplied vector PDFs.
PDF page rotation is applied before normalizing into the existing plan image space.
Run with PyMuPDF available; output is committed so model builds need no PDF library.
"""
from pathlib import Path
import fitz, json, math
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
def dist(a,b):return math.dist(a,b)
def circ(a,b,c):
 d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]))
 if abs(d)<.001:return None
 q=[sum(v*v for v in p) for p in [a,b,c]]
 return [(q[0]*(b[1]-c[1])+q[1]*(c[1]-a[1])+q[2]*(a[1]-b[1]))/d,(q[0]*(c[0]-b[0])+q[1]*(a[0]-c[0])+q[2]*(b[0]-a[0]))/d]
def extract(site,level,file,width,bounds,threshold):
 p=fitz.open(ROOT/'public/reference/sites'/site/file)[0];s=width/p.rect.width;lines=[];arcs=[]
 def pt(v):v=v*p.rotation_matrix;return [round(v.x*s,4),round(v.y*s,4)]
 def within(a):return bounds[0]<a[0]<bounds[2] and bounds[1]<a[1]<bounds[3]
 for d in p.get_drawings():
  if not d['color'] or max(d['color'])>.02:continue
  chunks=[];points=[]
  for i in d['items']:
   if i[0]=='l':path=[pt(i[1]),pt(i[2])]
   elif i[0]=='c':
    q=list(map(pt,i[1:]));path=[]
    for k in range(21):
     t=k/20;path.append([sum(q[j][v]*[(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3][j] for j in range(4)) for v in [0,1]])
   else:continue
   if i[0]=='l' and d['width']>=threshold and dist(*path)>5 and all(within(q) for q in path):lines.append([*path,round(d['width'],2)])
   if points and dist(points[-1],path[0])>.2:chunks.append(points);points=[]
   points.extend(path if not points else path[1:])
  if points:chunks.append(points)
  for qs in chunks:
   if len(qs)<6 or not all(within(q) for q in qs):continue
   c=circ(qs[0],qs[len(qs)//2],qs[-1])
   if c is None:continue
   r=dist(c,qs[0]);err=max(abs(dist(c,q)-r) for q in qs)
   angle=2*math.asin(min(1,dist(qs[0],qs[-1])/(2*r)))
   if not (7<r<48 and err<.18 and .65<angle<1.7):continue
   if any(dist(c,a['hinge'])<.4 and dist(qs[0],a['a'])<.4 for a in arcs):continue
   arcs.append({'hinge':c,'a':qs[0],'b':qs[-1],'radius':r,'angle':angle})
 for a in arcs:
  c=a['hinge'];scores=[]
  for q in [a['a'],a['b']]:
   v=[(q[k]-c[k])/a['radius'] for k in [0,1]];score=0
   for l,r,_ in lines:
    dl=dist(l,r);u=[(r[k]-l[k])/dl for k in [0,1]]
    if abs(sum(u[k]*v[k] for k in [0,1]))<.99:continue
    near=min(dist(c,l),dist(c,r))
    if near<8:score+=(8-near)*min(dl,30)/30
   # Door closed positions are generally orthogonal to source axes.
   score+=.15 if min(abs(v[0]),abs(v[1]))<.01 else 0
   scores.append(score)
  a['closed']=a['a'] if scores[0]>scores[1] else a['b'];a['open']=a['b'] if scores[0]>scores[1] else a['a'];a['scores']=scores
 # Curves with two 90-degree endpoints require visual review when scores tie.
 result={'source':file,'width':width,'walls':lines,'doors':arcs}
 output=ROOT/'sources/additional-sites'/f'{site}-{level}-vectors.json';output.write_text(json.dumps(result,indent=2)+'\n')
 im=Image.open(ROOT/f'public/reference/sites/{site}/plan-{"upper" if level=="option" else level}.jpg').convert('RGB');draw=ImageDraw.Draw(im)
 for l,r,_ in lines:draw.line([tuple(l),tuple(r)],fill='#df4949',width=2)
 for i,a in enumerate(arcs):
  draw.line([tuple(a['hinge']),tuple(a['closed'])],fill='#009c49',width=3);draw.line([tuple(a['hinge']),tuple(a['open'])],fill='#305aff',width=2);draw.text(tuple(a['hinge']),str(i),fill='blue')
 im.save(ROOT/f'work/olympic-review/{site}-{level}-vectors.png')
 print(site,level,len(lines),'faces',len(arcs),'swing curves')
extract('olympic','ground','source.pdf',1881,[210,270,1540,1040],.8)
extract('olympic','upper','second-floor.pdf',1881,[535,300,1860,990],.8)
extract('alveare','ground','level-1.pdf',1824,[500,275,1038,1045],1.25)

extract('olympic','option','second-floor.pdf',1881,[20,505,510,980],.8)
