// Icônes de l'application (logo « complexe stimulé ») : node scripts/gen-icones.mjs → icons/icon-192.png, icon-512.png, icon-512-maskable.png
// Source vectorielle : icons/icon.svg. La version « maskable » garde le symbole dans la zone sûre (80 % centraux).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(racine, 'icons', 'icon.svg'), 'utf8');
const symbole = svg.replace(/<rect[^>]*\/>/, '').replace(/<\/?svg[^>]*>/g, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0A2540"/><g transform="translate(64 64) scale(.75)">${symbole}</g></svg>`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [nom, source, taille, fond] of [['icon-192.png', svg, 192, 'transparent'], ['icon-512.png', svg, 512, 'transparent'], ['icon-512-maskable.png', maskable, 512, '#0A2540']]) {
  const p = await b.newPage({ viewport: { width: taille, height: taille } });
  await p.setContent(`<html><body style="margin:0;background:${fond}">${source.replace('<svg ', `<svg width="${taille}" height="${taille}" `)}</body></html>`);
  await p.screenshot({ path: path.join(racine, 'icons', nom), omitBackground: fond === 'transparent' });
  await p.close();
}
await b.close();
console.log('icons/icon-192.png, icon-512.png, icon-512-maskable.png');
