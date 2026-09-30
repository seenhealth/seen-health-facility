// Keep source documents in the repository, outside the deployed static directory.
// Run after any model-generation pipeline, before publishing.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const archive = path.join(root, 'sources/nonpublic');
const isPublicTexture = (p) =>
  p.startsWith('reference/photos/') || p === 'reference/fleet/final-vans.png';
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
function retainPrivate(file) {
  const relative = path.relative(path.join(root, 'public'), file);
  const target = path.join(archive, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  fs.unlinkSync(file);
}
for (const file of files(path.join(root, 'public/reference'))) {
  const relative = path.relative(path.join(root, 'public'), file);
  if (!isPublicTexture(relative)) retainPrivate(file);
}
// The obsolete 2024 GLB contains a baked-in architectural plan; current exports do not.
const oldExport = path.join(root, 'public/models/seen-alhambra-2024.glb');
if (fs.existsSync(oldExport)) retainPrivate(oldExport);
const audit = path.join(root, 'public/models/page-audit.json');
if (fs.existsSync(audit)) retainPrivate(audit);
for (const file of files(path.join(root, 'public/models')).filter((f) =>
  f.endsWith('.json'),
)) {
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (model.schemaVersion !== '2.0' || !model.source) continue;
  if (
    model.source.file ||
    model.site?.image ||
    model.referencePages.some((p) => p.image || p.file || p.text)
  ) {
    const target = path.join(archive, 'models', path.basename(file));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
  }
  delete model.source.file;
  delete model.site.image;
  if (model.planningTrace) delete model.planningTrace.sourceFile;
  for (const level of model.levels) delete level.planImage;
  for (const page of model.referencePages) {
    delete page.image;
    delete page.file;
    delete page.sourceName;
    delete page.mediaType;
    page.text = '';
  }
  model.publication = { sourceDocuments: 'not-published' };
  fs.writeFileSync(file, JSON.stringify(model, null, 2) + '\n');
}
console.log(
  'Source documents and extracted page text retained outside public assets.',
);
