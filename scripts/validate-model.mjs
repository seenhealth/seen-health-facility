import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import {
  Shape,
  ShapeGeometry,
  Box3,
  Vector3,
  MeshStandardMaterial,
} from 'three';
for (const name of [
  'activity-loop',
  'care-journeys',
  'character-templates',
  'day-program',
])
  assert.deepEqual(
    JSON.parse(readFileSync(`app/data/${name}.json`, 'utf8')),
    JSON.parse(readFileSync(`public/models/${name}.json`, 'utf8')),
    'Published download matches bundled scene data',
  );
mkdirSync('work/validation', { recursive: true });
for (const name of [
  'schema',
  'floor-geometry',
  'photo-assets',
  'clinical-assets',
  'assets',
  'envelope',
  'characters',
  'neighborhood',
  'arrival',
  'activity',
  'day-room',
]) {
  const source = readFileSync(`app/model/${name}.ts`, 'utf8');
  writeFileSync(
    `work/validation/${name}.mjs`,
    ts.transpileModule(
      source
        .replace("from './photo-assets'", "from './photo-assets.mjs'")
        .replace("from './clinical-assets'", "from './clinical-assets.mjs'")
        .replace("from './characters'", "from './characters.mjs'")
        .replace("from './assets'", "from './assets.mjs'")
        .replace("from './arrival'", "from './arrival.mjs'")
        .replace("from './day-room'", "from './day-room.mjs'")
        .replace(
          "import program from '../data/day-program.json';",
          `const program=${readFileSync('app/data/day-program.json', 'utf8')};`,
        )
        .replace(
          "import templates from '../data/character-templates.json';",
          `const templates=${readFileSync('app/data/character-templates.json', 'utf8')};`,
        )
        .replace(
          "import source from '../data/activity-loop.json';",
          `const source = ${readFileSync('public/models/activity-loop.json', 'utf8')};`,
        ),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      },
    ).outputText,
  );
}
const { validateFacility, polygonArea } =
  await import('../work/validation/schema.mjs');
const { buildAsset } = await import('../work/validation/assets.mjs');
const m = validateFacility(
  JSON.parse(
    readFileSync(
      process.argv[2] || 'public/models/seen-alhambra-planning.json',
      'utf8',
    ),
  ),
);
assert.deepEqual(
  validateFacility(JSON.parse(JSON.stringify(m))),
  m,
  'Specification survives a lossless JSON round-trip',
);
assert.equal(m.referencePages.length, m.source.pages);
assert.equal(
  m.programs
    .filter((p) => p.sourcePage === 14)
    .reduce((s, p) => s + p.publishedSqFt, 0),
  17318,
);
assert.ok(
  Math.abs(
    polygonArea(m.zones.find((z) => z.id === 'clinic').polygon) / 0.09290304 -
      3254,
  ) < 0.01,
  'Clinic calibration reproduces stated area',
);
for (const v of [...m.zones, ...m.rooms]) {
  const s = new Shape();
  v.polygon.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  const geo = new ShapeGeometry(s);
  assert.ok(geo.index.count >= 3, `Triangulate ${v.id}`);
  assert.ok([...geo.attributes.position.array].every(Number.isFinite));
  geo.dispose();
}
for (const list of [m.zones, m.rooms, m.walls, m.objects, m.details])
  for (const x of list)
    for (const p of x.referencePages)
      assert.ok(
        m.referencePages.some((r) => r.page === p),
        `Source ${p} exists for ${x.id}`,
      );
for (const p of m.referencePages) assert.ok(existsSync(`public${p.image}`));
for (const p of m.referencePages)
  if (p.file) assert.ok(existsSync(`public${p.file}`));
for (const v of Object.values(m.materials))
  if (v.textureUrl) assert.ok(existsSync(`public${v.textureUrl}`));
for (const k of [m.source.file, m.site.image])
  assert.ok(existsSync(`public${k}`));
const roomIds = new Set(m.rooms.map((r) => r.id));
for (const o of m.objects) if (o.roomId) assert.ok(roomIds.has(o.roomId));
const material = (id) =>
  new MeshStandardMaterial({ color: m.materials[id]?.color || '#dddccc' });
for (const [id, a] of Object.entries(m.assets)) {
  const g = buildAsset(a, material),
    box = new Box3().setFromObject(g),
    size = box.getSize(new Vector3());
  a.dimensions.forEach((v, i) =>
    assert.ok(
      Math.abs(v - size.getComponent(i)) < 1e-5,
      `${id}: true dimension axis ${i}`,
    ),
  );
  assert.ok(Math.abs(box.min.y) < 1e-6);
}
const swapped = structuredClone(m);
swapped.id = 'second-center-format-test';
swapped.assets.chair.dimensions = [0.65, 1.1, 0.7];
swapped.zones[0].polygon[0][0] -= 0.01;
assert.equal(validateFacility(swapped).id, swapped.id);
const bads = [
  (d) => (d.units = 'ft'),
  (d) => (d.objects[0].assetId = 'missing'),
  (d) => (d.levels[0].elevation = NaN),
  (d) =>
    (d.zones[0].polygon = [
      [0, 0],
      [0, 0],
      [0, 0],
    ]),
  (d) => (d.assets.chair.modelUrl = 'javascript:alert(1)'),
  (d) => (d.details[0].dimensions = [-1, 1, 1]),
  (d) => (d.source.file = 'javascript:alert(1)'),
  (d) => (d.objects[0].roomId = 'missing'),
  (d) => (d.walls[0].material = 'missing'),
  (d) => (d.rooms[0].referencePages = [999]),
  (d) => (d.details[0].id = d.details[1].id),
];
if (m.envelope) {
  bads.push(
    (d) => (d.envelope.walls[0].b[0] += 1),
    (d) => (d.envelope.walls[0].openings[0].width = 1000),
    (d) =>
      d.envelope.walls[0].openings.push({
        ...d.envelope.walls[0].openings[0],
        id: 'overlapping-opening',
      }),
    (d) => d.envelope.loops[0].wallIds.pop(),
    (d) => (d.envelope.walls.find((w) => w.profile).profile[1][0] = -1),
  );
  const { buildEnvelopeWall, buildRoofGeometry } =
    await import('../work/validation/envelope.mjs');
  for (const w of m.envelope.walls) {
    const full = buildEnvelopeWall({ ...w, detailIds: undefined }, material),
      cut = buildEnvelopeWall(w, material, 1.2);
    full.updateWorldMatrix(true, true);
    cut.updateWorldMatrix(true, true);
    assert.ok(
      new Box3().setFromObject(full).max.y >= w.height,
      `${w.id} full height`,
    );
    assert.ok(
      new Box3().setFromObject(cut).max.y <= 1.236,
      `${w.id} visible in cutaway`,
    );
  }
  for (const r of m.roofSections) {
    const geo = buildRoofGeometry(r);
    assert.ok(
      [...geo.attributes.position.array].every(Number.isFinite),
      `${r.id} roof geometry`,
    );
    geo.dispose();
  }
  assert.equal(
    m.envelope.loops.length,
    2,
    'Main and adjoining buildings have independent closed perimeters',
  );
}
if (m.planningTrace) {
  const t = m.planningTrace;
  assert.equal(
    createHash('sha256')
      .update(readFileSync(t.originalArchivePath))
      .digest('hex'),
    t.sourceSha256,
    'Supplied original image is preserved unchanged',
  );
  const count = (pattern) => m.objects.filter((o) => pattern.test(o.id)).length;
  for (const [pattern, n] of [
    [/^day-diamond-table-\d+$/, 9],
    [/^dining-table-\d+$/, 5],
    [/^day-banquette-table-\d+$/, 7],
    [/^day-tree-table-\d+$/, 4],
    [/^admin-workchair-/, 12],
    [/^admin-meeting-chair-/, 6],
    [/^admin-conference-(north|south)-/, 16],
  ])
    assert.equal(count(pattern), n, `Planning count ${pattern}`);
  assert.equal(
    m.objects.filter(
      (o) =>
        o.zoneId === 'rehab' &&
        ['bike', 'therapy-bed', 'parallel-bars', 'steps'].includes(o.assetId),
    ).length,
    0,
    'No therapy equipment absent from the supplied plan',
  );
  for (const o of m.objects.filter(
    (o) => o.sourcePixelPosition && o.sourcePixelFootprint,
  )) {
    const a = m.assets[o.assetId];
    assert.ok(
      Math.abs(
        o.position[0] * t.pixelsPerMeter +
          t.origin[0] -
          o.sourcePixelPosition[0],
      ) < 0.001,
    );
    assert.ok(
      Math.abs(
        o.position[2] * t.pixelsPerMeter +
          t.origin[1] -
          o.sourcePixelPosition[1],
      ) < 0.001,
    );
    assert.ok(
      Math.abs(
        a.dimensions[0] * o.scale[0] * t.pixelsPerMeter -
          o.sourcePixelFootprint[0],
      ) < 0.001,
    );
    assert.ok(
      Math.abs(
        a.dimensions[2] * o.scale[2] * t.pixelsPerMeter -
          o.sourcePixelFootprint[1],
      ) < 0.001,
    );
  }
  assert.ok(
    m.referencePages.find((p) => p.page === m.calibration.referencePage)
      .file === t.sourceFile,
  );
}
for (const mutate of bads) {
  const d = structuredClone(m);
  mutate(d);
  assert.throws(() => validateFacility(d));
}
if (m.photoSurvey) {
  assert.equal(
    m.referencePages.filter((p) => p.evidenceType === 'facility-photograph')
      .length,
    m.interiorReview ? 21 : 18,
  );
  assert.equal(
    m.referencePages.filter((p) => p.mediaType === 'video').length,
    1,
  );
  if (m.planningTrace?.furnitureAuthority === 'Overall Planning.jpg') {
    const baseline = JSON.parse(
      readFileSync('public/models/seen-alhambra-planning-base.json', 'utf8'),
    );
    const ids = new Set(baseline.objects.map((o) => o.id));
    assert.deepEqual(
      m.objects.filter((o) => ids.has(o.id)),
      baseline.objects,
      'Every furniture instance matches the saved plan configuration',
    );
    for (const id of new Set(baseline.objects.map((o) => o.assetId)))
      assert.deepEqual(
        m.assets[id],
        baseline.assets[id],
        'Plan asset dimensions and geometry restored',
      );
    assert.ok(
      m.objects
        .filter((o) => !ids.has(o.id))
        .every(
          (o) =>
            (o.layer && o.layer !== 'furniture') ||
            (o.levelId === 'upper' && o.id.startsWith('upperfit-')),
        ),
      'Only the separately requested upstairs fit-out adds loose furniture',
    );
    assert.ok(
      !m.objects.some(
        (o) =>
          o.id.startsWith('day-library-bay-') ||
          o.id === 'clinic-photo-nurse-station',
      ),
      'No replacement cabinet/counter overlaps the restored plan',
    );
  } else if (m.interiorReview) {
    const baseline = JSON.parse(
      readFileSync('public/models/seen-alhambra-planning-base.json', 'utf8'),
    );
    const changed = new Set(m.interiorReview.changedPlanObjectIds);
    const current = new Map(m.objects.map((o) => [o.id, o]));
    for (const o of baseline.objects) {
      if (!changed.has(o.id))
        assert.deepEqual(
          current.get(o.id),
          o,
          `Unreviewed furniture preserved: ${o.id}`,
        );
      else
        assert.ok(
          ['day', 'clinic', 'rehab', 'dining'].includes(o.zoneId) ||
            m.layoutCorrections?.changedPlanObjectIds.includes(o.id),
          `Photo override stays within reviewed rooms: ${o.id}`,
        );
    }
    for (const id of new Set(baseline.objects.map((o) => o.assetId)))
      assert.deepEqual(
        m.assets[id],
        baseline.assets[id],
        `Base asset retained: ${id}`,
      );
    assert.deepEqual(
      m.interiorReview.items.map((r) => r.photo),
      [1, 2, 3, 10, 23, 25, 26],
    );
    assert.ok(!current.has('day-west-banquette'));
    assert.ok(!current.has('clinic-nurse-counter-0'));
    for (const id of [
      'rehab-parallel-bars',
      'rehab-training-stairs',
      'rehab-recumbent-stepper-1',
      'clinic-exam-01-sink',
      'clinic-exam-06-diagnostics',
      'rehab-wc-east-double-vanity',
    ])
      assert.ok(current.has(id), id);
    for (const o of m.objects.filter((o) => o.navigationFootprints))
      for (const [x, z, w, d] of o.navigationFootprints)
        assert.ok([x, z, w, d].every(Number.isFinite) && w > 0 && d > 0);
  } else {
    assert.equal(
      m.objects.filter((o) => o.id.startsWith('day-photo-lounge-chair-'))
        .length,
      2,
    );
    assert.equal(
      m.objects.filter((o) => o.id.startsWith('staff-counter-stool-')).length,
      4,
    );
    assert.ok(!m.objects.some((o) => o.id === 'day-west-banquette'));
    assert.equal(
      m.objects.find((o) => o.id === 'day-central-tree').assetId,
      'photo-tree-seat',
    );
  }
  for (const id of ['admin-meeting-west', 'admin-meeting-east'])
    assert.equal(
      m.rooms.find((r) => r.id === id).floorMaterial,
      'photo-carpet',
    );
  if (
    m.planningTrace?.furnitureAuthority !== 'Overall Planning.jpg' &&
    !m.interiorReview
  ) {
    assert.equal(
      m.objects.find((o) => o.id === 'admin-entry-locker-bank').roomId,
      'east-service',
    );
    assert.equal(
      m.objects.find((o) => o.id === 'staff-kitchenette').roomId,
      'admin-staff-lounge',
    );
  }
  assert.equal(
    m.details.filter((d) => /^photo-therapy-slit-/.test(d.id)).length,
    7,
  );
  const baseline = JSON.parse(
    readFileSync('public/models/seen-alhambra-planning-base.json', 'utf8'),
  );
  assert.deepEqual(
    m.zones.map((z) => z.polygon),
    baseline.zones.map((z) => z.polygon),
    'Photo finishes preserve calibrated building footprint',
  );
  assert.deepEqual(
    m.walls.filter((w) => !w.id.startsWith('upperfit-')).map((w) => [w.a, w.b]),
    baseline.walls.map((w) => [w.a, w.b]),
    'Photo details preserve traced walls and door openings',
  );
  for (const id of ['mezzanine', 'basement'])
    assert.deepEqual(
      m.zones.find((z) => z.id === id),
      baseline.zones.find((z) => z.id === id),
      'No unseen level changes inferred from interior photos',
    );
  if (m.upstairsSurvey) {
    assert.deepEqual(
      m.zones.find((z) => z.id === 'upper-office').polygon,
      baseline.zones.find((z) => z.id === 'upper-office').polygon,
    );
    assert.equal(
      m.objects.filter((o) => o.id.startsWith('upperfit-desk-')).length,
      m.upstairsSurvey.workstationCount,
    );
    for (const id of [
      'upperfit-conference',
      'upperfit-storage',
      'upperfit-restroom',
      'upperfit-lift',
    ])
      assert.ok(m.rooms.some((r) => r.id === id && r.levelId === 'upper'));
    assert.ok(
      m.objects
        .filter((o) => o.id.startsWith('upperfit-'))
        .every((o) => o.zoneId === 'upper-office' && o.levelId === 'upper'),
    );
    assert.equal(
      m.objects.filter((o) => o.id.startsWith('fleet-van-')).length,
      2,
    );
    assert.ok(
      m.objects
        .filter((o) => o.id.startsWith('fleet-van-'))
        .every((o) => o.zoneId === 'site'),
    );
  }
}
console.log(
  `Validated ${m.zones.length} zones, ${m.rooms.length} room records, ${m.walls.length} walls, ${m.objects.length} objects, ${m.referencePages.length} source pages, dimensionally normalized assets, specification round trips, swappable definitions and ${bads.length} invalid-input paths.`,
);
