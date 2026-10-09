import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8').catch(() => '');
if (!html.includes('SNIFF — Paste Anything. Sniff Everything.')) {
  console.error('Smoke check failed: build output is missing. Run npm run build first.');
  process.exit(1);
}
if (!html.includes('/assets/')) {
  console.error('Smoke check failed: Vite did not emit an application asset.');
  process.exit(1);
}
console.log('SNIFF production entry and asset manifest are present.');
