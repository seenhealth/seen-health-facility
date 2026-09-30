import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
const approvedTextures = new Set(
  JSON.parse(fs.readFileSync('sources/public-texture-review.json', 'utf8'))
    .sha256,
);
const assetRoot = process.argv[2] || 'public';
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
const banned =
  /\/reference\/(?:final\/|planning\/|sites\/|plan\.png|page-\d+\.jpg|fleet\/final-vans\.pdf)|\/models\/page-audit\.json/;
fs.mkdirSync('work/validation', { recursive: true });
fs.writeFileSync(
  'work/validation/public-schema.mjs',
  ts.transpileModule(fs.readFileSync('app/model/schema.ts', 'utf8'), {
    compilerOptions: { module: 99, target: 9 },
  }).outputText,
);
const { validateFacility } =
  await import('../work/validation/public-schema.mjs');
let count = 0;
for (const file of files(assetRoot)) {
  const url = '/' + path.relative(assetRoot, file);
  assert(!banned.test(url), `Source document must not be deployed: ${url}`);
  assert(!file.endsWith('.pdf'), `PDF must not be deployed: ${url}`);
  if (url.startsWith('/reference/'))
    assert(
      url.startsWith('/reference/photos/') ||
        url === '/reference/fleet/final-vans.png',
      `Unexpected reference asset: ${url}`,
    );
  if (file.endsWith('.glb')) {
    const bytes = fs.readFileSync(file),
      jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const binary = bytes.subarray(28 + jsonLength);
    for (const image of gltf.images || []) {
      assert(
        image.bufferView !== undefined && !image.uri,
        'Embedded textures only',
      );
      const view = gltf.bufferViews[image.bufferView],
        start = view.byteOffset || 0;
      const hash = createHash('sha256')
        .update(binary.subarray(start, start + view.byteLength))
        .digest('hex');
      assert(
        approvedTextures.has(hash),
        `Review new GLB image for source drawings: ${url} ${hash}`,
      );
    }
  }
  if (!file.endsWith('.json') || !url.startsWith('/models/')) continue;
  const text = fs.readFileSync(file, 'utf8');
  assert(!banned.test(text), `Source URL in downloadable data: ${url}`);
  const model = JSON.parse(text);
  if (model.schemaVersion !== '2.0' || !model.source) continue;
  validateFacility(model);
  assert(!model.source.file && !model.site.image);
  assert(model.levels.every((l) => !l.planImage));
  assert(
    model.referencePages.every((p) => !p.file && !p.image && p.text === ''),
  );
  for (const material of Object.values(model.materials))
    if (material.textureUrl)
      assert(
        fs.existsSync(path.join(assetRoot, material.textureUrl)),
        `Missing material texture: ${material.textureUrl}`,
      );
  count++;
}
assert(count >= 6, 'Validate every public facility variant');
console.log(
  `${assetRoot}: ${count} valid facility specifications; no architectural PDFs, drawing images, source URLs or extracted page text.`,
);
