// Construit le bundle du harnais avec esbuild (JSX -> React.createElement).
// Usage manuel : node tests/harness/build.mjs  (écrit tests/harness/bundle.js,
// ignoré par Git), puis servir le dépôt et ouvrir tests/harness/index.html.
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const WIDGET_DIR = path.join(ROOT, 'widget/mur-des-retournements.widget');
export const WIDGET_ENTRY = path.join(WIDGET_DIR, 'mur-des-retournements.jsx');

export async function buildHarness(esbuild) {
  const result = await esbuild.build({
    entryPoints: [path.join(HERE, 'harness.js')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
    inject: [path.join(HERE, 'react-shim.js')],
    alias: {
      'widget-entry': WIDGET_ENTRY,
      uebersicht: path.join(HERE, 'uebersicht-shim.js'),
    },
    nodePaths: [path.join(ROOT, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const esbuild = await import('esbuild');
  writeFileSync(path.join(HERE, 'bundle.js'), await buildHarness(esbuild));
  console.log('Bundle écrit : tests/harness/bundle.js');
}
