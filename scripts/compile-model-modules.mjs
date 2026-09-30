// Keep headless exports in sync with the browser's model modules.
import fs from 'node:fs';
import ts from 'typescript';
fs.mkdirSync('work/validation', { recursive: true });
for (const file of fs.readdirSync('app/model')) {
  if (!file.endsWith('.ts') || file === 'renderer.ts') continue;
  const source = fs
    .readFileSync(`app/model/${file}`, 'utf8')
    .replace(
      /import (\w+) from '(\.\.\/data\/[^']+\.json)';/g,
      (_, name, relative) =>
        `const ${name} = ${fs.readFileSync(`app/model/${relative}`, 'utf8')};`,
    )
    .replace(/from '\.\/([^']+)'/g, "from './$1.mjs'");
  fs.writeFileSync(
    `work/validation/${file.replace(/\.ts$/, '.mjs')}`,
    ts.transpileModule(source, { compilerOptions: { module: 99, target: 9 } })
      .outputText,
  );
}
