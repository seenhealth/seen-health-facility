import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as T from 'three';
fs.mkdirSync('work/validation', { recursive: true });
const names = [
  'schema',
  'floor-geometry',
  'assets',
  'photo-assets',
  'clinical-assets',
  'site-context',
  'site-activity',
];
for (const name of names) {
  const s = fs
    .readFileSync(`app/model/${name}.ts`, 'utf8')
    .replace(/from '\.\/([^']+)'/g, "from './$1.mjs'");
  fs.writeFileSync(
    `work/validation/${name}.mjs`,
    ts.transpileModule(s, { compilerOptions: { module: 99, target: 9 } })
      .outputText,
  );
}
const { validateFacility, polygonArea } =
  await import('../work/validation/schema.mjs');
const { buildAsset } = await import('../work/validation/assets.mjs');
const { floorShapes } = await import('../work/validation/floor-geometry.mjs');
for (const key of ['olympic', 'olympic-option', 'alveare']) {
  const m = validateFacility(
    JSON.parse(fs.readFileSync(`public/models/seen-${key}.json`)),
  );
  assert.equal(m.referencePages.length, m.source.pages);
  for (const [id, spec] of Object.entries(m.assets)) {
    const asset = buildAsset(spec, () => new T.MeshStandardMaterial());
    asset.traverse((o) => {
      if (o.isMesh) {
        assert(
          [...o.geometry.attributes.position.array].every(Number.isFinite),
          `Finite geometry: ${id}`,
        );
        assert(
          [
            ...o.position.toArray(),
            ...o.scale.toArray(),
            ...o.quaternion.toArray(),
          ].every(Number.isFinite),
          `Finite transform: ${id}`,
        );
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
  for (const p of m.referencePages) {
    if (p.image) assert(fs.existsSync(`public${p.image}`), p.image);
    if (p.file) assert(fs.existsSync(`public${p.file}`), p.file);
  }
  for (const z of [...m.zones, ...m.rooms]) {
    const g = new T.ShapeGeometry(
      floorShapes(
        z.polygon,
        (m.floorOpenings || []).filter((o) => o.zoneId === (z.zoneId || z.id)),
      ),
    );
    if (!['lift', 'stair'].includes(z.kind))
      assert(g.index.count >= 3, `triangulates ${z.id}`);
    assert([...g.attributes.position.array].every(Number.isFinite));
    g.dispose();
  }
  for (const l of m.levels) {
    if (l.planImage) assert(fs.existsSync(`public${l.planImage}`));
    assert(l.planPixelsPerMeter > 0);
  }
  const rooms = new Map(m.rooms.map((r) => [r.id, r]));
  for (const o of m.objects) {
    assert(m.assets[o.assetId]);
    if (o.roomId) assert(rooms.has(o.roomId));
  }
  for (const opening of m.floorOpenings || []) {
    const zone = m.zones.find((z) => z.id === opening.zoneId);
    const geo = new T.ShapeGeometry(floorShapes(zone.polygon, [opening]));
    geo.rotateX(-Math.PI / 2);
    const mesh = new T.Mesh(
      geo,
      new T.MeshBasicMaterial({ side: T.DoubleSide }),
    );
    mesh.updateMatrixWorld();
    const [[x0, z0], [x1, z1]] = opening.bounds;
    const ray = new T.Raycaster(
      new T.Vector3((x0 + x1) / 2, 1, (z0 + z1) / 2),
      new T.Vector3(0, -1, 0),
    );
    assert.equal(
      ray.intersectObject(mesh).length,
      0,
      'Aperture is actually open',
    );
    geo.dispose();
    mesh.material.dispose();
  }
  assert(m.geography.features.filter((f) => f.kind === 'building').length > 20);
  if (key === 'alveare') {
    assert(
      Math.abs(
        (1022 - 511) / m.calibration.pixelsPerMeter - 107.4791667 * 0.3048,
      ) < 0.08,
      'Independent orthogonal scale check',
    );
    assert(
      !m.rooms.some((r) => r.kind === 'exam'),
      'No invented clinical exam suite at Alveare',
    );
  } else assert.equal(m.rooms.filter((r) => r.kind === 'exam').length, 10);
  console.log(
    `${key}: ${m.rooms.length} rooms, ${m.objects.length} objects, ${m.geography.features.length} geographic features; source, triangulation, scale and aperture checks passed.`,
  );
}
