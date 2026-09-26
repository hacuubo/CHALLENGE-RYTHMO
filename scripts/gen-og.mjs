// Image de partage (Open Graph, 1200×630) : node scripts/gen-og.mjs → icons/og.png
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = `<!doctype html><html lang="fr"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&display=swap"></head><body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;
  background:#0A2540;color:#fff;font-family:'Plus Jakarta Sans',system-ui,sans-serif">
  <svg viewBox="0 0 70 40" width="210" height="120" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-left:-6px"><path d="M3 28H16L21 31L28 10L37 37L42 28H48C51 28 52 21 57 21C62 21 63 28 67 28" stroke="#fff" stroke-width="3"/><path d="M16 28V3" stroke="#FF6A3D" stroke-width="3"/></svg>
  <div style="font-size:88px;font-weight:800;letter-spacing:.01em;margin-top:10px">Shock <span style="color:#FF6A3D">&amp;</span> Pace</div>
  <div style="font-size:40px;color:rgba(255,255,255,.85);margin-top:14px">Quiz de rythmologie · ECG · pacemaker · DAI</div>
  <div style="font-size:32px;color:rgba(255,255,255,.7);margin-top:26px">Simulateur d'électrophysiologie · gratuit, sans compte</div>
</body></html>`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.join(racine, 'icons', 'og.png') });
await b.close();
console.log('icons/og.png');
