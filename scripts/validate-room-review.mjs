import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { buildAsset } from '../work/validation/assets.mjs';
const read = (id) => JSON.parse(fs.readFileSync(`public/models/seen-${id}.json`));
function inside([x, y], poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) yes = !yes;
  }
  return yes;
}
for (const key of ['olympic', 'olympic-option', 'alveare']) {
  const m = read(key), rooms = new Map(m.rooms.map(r => [r.id, r]));
  assert.equal(new Set(m.accuracyIssues.map(i => i.id)).size, m.accuracyIssues.length, 'No repeated review notes');
  for (const o of m.objects) {
    if (o.roomId && o.layer === 'furniture') assert(inside([o.position[0], o.position[2]], rooms.get(o.roomId).polygon), `${key}: furniture center in room ${o.id}`);
  }
  for (const d of m.doorSchedule) {
    const c = d.hinge, q = d.closed, len = Math.hypot(q[0]-c[0],q[1]-c[1]), v = q.map((x,i) => (x-c[i])/len);
    assert(Math.abs(len-d.width)<0.005, 'Leaf closes to the source opening width');
    for (const w of m.walls.filter(w=>w.levelId===d.levelId)) {
      const ps = [w.a,w.b], ds = ps.map(p=>Math.abs((p[0]-c[0])*v[1]-(p[1]-c[1])*v[0]));
      if (Math.max(...ds)>w.thickness/2+0.01) continue;
      const ts = ps.map(p=>(p[0]-c[0])*v[0]+(p[1]-c[1])*v[1]).sort((a,b)=>a-b);
      assert(Math.min(len*.85,ts[1])-Math.max(len*.15,ts[0])<=.03, `${key}: blocked door ${d.id}`);
    }
  }
  if (key.startsWith('olympic')) {
    const raised = m.zones.find(z=>z.id==='ground-mezzanine');
    assert.equal(raised.elevationOffset, .6096);
    assert.equal(rooms.get('ground-reception').zoneId,'ground-floor');
    assert.equal(rooms.get('ground-dining').zoneId,'ground-floor');
    assert.equal(m.objects.filter(o=>o.roomId==='upper-admin' && o.assetId==='review-desk').length,26);
    assert.equal(m.verticalConnections.filter(c=>c.kind==='stair').length,2);
    assert.equal(m.verticalConnections.filter(c=>c.kind==='lift').length,2);
    for (const c of m.verticalConnections) {
      const opening=m.floorOpenings.find(o=>o.connectionId===c.id), object=m.objects.find(o=>o.id===c.objectId);
      for (const [i,j] of [[0,0],[1,2]]) assert(Math.abs((opening.bounds[0][i]+opening.bounds[1][i])/2-object.position[j])<.001,'Shaft centered below its floor aperture');
    }
  } else {
    assert.equal(m.objects.filter(o=>o.roomId==='ground-staff' && o.assetId==='review-desk').length,8);
    assert(m.walls.some(w=>Math.abs(w.height-1.3716)<.0001),'54 inch divider');
    assert(rooms.get('ground-staff').referencePages.includes(29));
  }
  console.log(`${key}: unobstructed doors, furniture containment, source-specific desk counts and level registration passed.`);
}
// Return stair geometry must contain two opposite flights, not a scaled straight stair.
const stair = buildAsset({kind:'return-stair',dimensions:[2.6,4.75,5.2],material:'concrete',parameters:{rise:3.8}},()=>new T.MeshStandardMaterial());
const treads=stair.children.filter(o=>o.isMesh && o.geometry.type==='BoxGeometry' && o.geometry.parameters.height>.15 && o.geometry.parameters.depth<.8);
const left=treads.filter(o=>o.position.x<0).sort((a,b)=>a.position.z-b.position.z);
const right=treads.filter(o=>o.position.x>0).sort((a,b)=>a.position.z-b.position.z);
assert(left.length>=10 && right.length>=10);
assert(left[0].position.y<left.at(-1).position.y && right[0].position.y>right.at(-1).position.y);
assert(Math.abs(right[0].position.y+.09-3.8)<.001,'Upper flight ends at destination elevation');
console.log('Return stair has opposing flights and an exact upper landing elevation.');
