import { writeFileSync } from 'node:fs';
const n = { type: 'number' },
  s = { type: 'string' },
  vec = (count) => ({
    type: 'array',
    items: n,
    minItems: count,
    maxItems: count,
  });
const p = { type: 'array', items: vec(2), minItems: 3 };
const refs = { type: 'array', items: { type: 'integer', minimum: 1 } };
const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
});
const arr = (items) => ({ type: 'array', items });
const entity = { id: s, referencePages: refs };
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Portable facility model',
  ...obj({
    schemaVersion: { const: '2.0' },
    id: s,
    name: s,
    address: s,
    units: { const: 'm' },
    coordinateSystem: s,
    revision: s,
    source: obj({
      title: s,
      date: s,
      pages: { type: 'integer', minimum: 1 },
      author: s,
      file: s,
    }),
    calibration: obj({
      method: s,
      status: s,
      pixelsPerMeter: { type: 'number', exclusiveMinimum: 0 },
      sourcePixelOrigin: vec(2),
      referencePage: n,
      areaPage: n,
      anchorAreaSqFt: n,
      anchorPolygonPixels: p,
      notes: s,
    }),
    levels: arr(
      obj({
        ...entity,
        name: s,
        elevation: n,
        order: n,
        elevationStatus: s,
        notes: s,
      }),
    ),
    zones: arr(
      obj({
        ...entity,
        name: s,
        short: s,
        color: s,
        levelId: s,
        polygon: p,
        floorMaterial: s,
        notes: s,
        publishedAreaSqFt: { type: ['number', 'null'] },
        tracedFootprintSqFt: n,
        programId: s,
        wallHeight: n,
        wallHeightStatus: s,
        geometryStatus: s,
        spread: vec(2),
      }),
    ),
    rooms: arr(
      obj({
        ...entity,
        name: s,
        zoneId: s,
        levelId: s,
        polygon: p,
        kind: s,
        status: s,
        notes: s,
      }),
    ),
    walls: arr(
      obj({
        ...entity,
        zoneId: s,
        levelId: s,
        a: vec(2),
        b: vec(2),
        height: n,
        thickness: n,
        material: s,
        status: s,
      }),
    ),
    assets: {
      type: 'object',
      additionalProperties: obj(
        { kind: s, dimensions: vec(3), material: s, modelUrl: s },
        ['kind', 'dimensions', 'material'],
      ),
    },
    objects: arr(
      obj({
        ...entity,
        assetId: s,
        zoneId: s,
        levelId: s,
        position: vec(3),
        rotation: n,
        scale: vec(3),
        roomId: { type: ['string', 'null'] },
        status: s,
        notes: s,
      }),
    ),
    materials: {
      type: 'object',
      additionalProperties: obj(
        { color: s, roughness: n, metalness: n, pattern: s, opacity: n },
        ['color', 'roughness'],
      ),
    },
    programs: arr(obj({ id: s, name: s, publishedSqFt: n, sourcePage: n })),
    referencePages: arr(
      obj({
        page: n,
        title: s,
        group: s,
        image: s,
        text: s,
        findings: s,
        reviewStatus: s,
        evidenceType: s,
      }),
    ),
    accuracyIssues: arr(
      obj({ id: s, title: s, detail: s, status: s, pages: refs }),
    ),
    site: obj({
      image: s,
      imageSize: vec(2),
      bounds: { type: 'array', items: vec(2), minItems: 2, maxItems: 2 },
      imagePixelBounds: vec(4),
      buildingOutline: p,
      referencePages: refs,
      notes: s,
    }),
    roofSections: arr(
      obj({
        ...entity,
        kind: { enum: ['flat', 'barrel'] },
        bounds: { type: 'array', items: vec(2), minItems: 2, maxItems: 2 },
        eaveHeight: n,
        rise: n,
        status: s,
      }),
    ),
    details: arr(
      obj({
        ...entity,
        position: vec(3),
        dimensions: vec(3),
        material: s,
        surface: { enum: ['exterior', 'site', 'structure', 'detail'] },
        rotation: vec(3),
        zoneId: { type: ['string', 'null'] },
        status: s,
      }),
    ),
    facade: obj({
      height: n,
      status: s,
      wallMaterial: s,
      glazingMaterial: s,
      referencePages: refs,
    }),
    dimensions: arr(
      obj({
        id: s,
        value: n,
        unit: s,
        sourceValue: s,
        pages: refs,
        status: s,
        meaning: s,
      }),
    ),
  }),
};
schema.properties.rooms.items.properties.floorMaterial = s;
schema.properties.referencePages.items.properties.label = s;
schema.properties.referencePages.items.properties.file = s;
schema.properties.referencePages.items.properties.mediaType = {
  enum: ['image', 'video'],
};
schema.properties.referencePages.items.properties.sourceName = s;
schema.properties.assets.additionalProperties.properties.materials = {
  type: 'object',
  additionalProperties: s,
};
schema.properties.assets.additionalProperties.properties.parameters = {
  type: 'object',
  additionalProperties: { type: ['string', 'number', 'boolean'] },
};
schema.properties.objects.items.properties.layer = {
  enum: [
    'furniture',
    'architecture',
    'wall-finish',
    'ceiling',
    'exterior',
    'roof',
  ],
};
Object.assign(schema.properties.materials.additionalProperties.properties, {
  textureUrl: s,
  emissive: s,
  emissiveIntensity: n,
});
schema.properties.photoSurvey = {
  type: 'object',
  description:
    'Photographic source priority, user-confirmed mappings and remaining uncertainties.',
};
schema.properties.roofSections.items.properties.structure = {
  enum: ['generic', 'components'],
};
schema.properties.exportFiles = obj({ glb: s, audit: s });
schema.properties.planningTrace = {
  type: 'object',
  description:
    'Original image hash, source coordinate frame and furniture counts for an image-traced revision.',
};
schema.properties.envelope = obj({
  notes: s,
  loops: arr(obj({ id: s, wallIds: arr(s) })),
  walls: arr(
    obj({
      ...entity,
      zoneId: s,
      a: vec(2),
      b: vec(2),
      height: n,
      thickness: n,
      material: s,
      status: s,
      openings: arr(
        obj({
          id: s,
          offset: n,
          width: n,
          sill: n,
          height: n,
          kind: { enum: ['door', 'window'] },
          material: s,
        }),
      ),
    }),
  ),
});
schema.properties.envelope.properties.walls.items.properties.profile = arr(
  vec(2),
);
schema.properties.envelope.properties.walls.items.properties.detailIds = arr(s);
schema.properties.roofSections.items.properties.polygon = p;
schema.properties.roofSections.items.properties.parapet = { type: 'boolean' };
writeFileSync(
  'public/models/facility.schema.json',
  JSON.stringify(schema, null, 2),
);
