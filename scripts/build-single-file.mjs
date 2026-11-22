import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, '.singlefile-build');
const target = path.join(root, 'downloads', 'ridgeline-auto-shop.html');

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [react()],
  base: './',
  define: { __SINGLE_FILE__: 'true' },
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

let html = await readFile(path.join(outDir, 'index.html'), 'utf8');
const assets = await readdir(path.join(outDir, 'assets'));
const cssFile = assets.find((file) => file.endsWith('.css'));
const jsFile = assets.find((file) => file.endsWith('.js'));

if (!jsFile) throw new Error('Build produced no JavaScript bundle');

const css = cssFile ? await readFile(path.join(outDir, 'assets', cssFile), 'utf8') : '';
const js = (await readFile(path.join(outDir, 'assets', jsFile), 'utf8')).replace(
  /<\/script/gi,
  '<\\/script',
);

html = html
  .replace(/<link rel="stylesheet"[^>]*>/g, () => `<style>${css}</style>`)
  .replace(
    /<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/g,
    () => `<script type="module">${js}</script>`,
  )
  .replace(/<link rel="manifest"[^>]*>/g, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>/g, '');

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, html);
await rm(outDir, { recursive: true, force: true });

console.log(`Single-file app: ${target} (${Math.round(html.length / 1024)} KB)`);
