// Image de partage (Open Graph, 1200×630) : node scripts/gen-og.mjs → icons/og.png
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = `<!doctype html><html lang="fr"><body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;
  background:linear-gradient(165deg,#082c47 0%,#0f4c78 50%,#1a6fae 100%);color:#fff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <svg viewBox="0 0 64 64" width="150" height="150" style="margin-left:-12px"><path d="M4 34h14l5-12 8 26 7-30 5 16h17" fill="none" stroke="#ff8193" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div style="font-size:88px;font-weight:800;letter-spacing:.01em;margin-top:10px">Shock &amp; Pace</div>
  <div style="font-size:40px;color:rgba(255,255,255,.85);margin-top:14px">Quiz de rythmologie · ECG · pacemaker · DAI</div>
  <div style="font-size:32px;color:rgba(255,255,255,.7);margin-top:26px">Simulateur d'électrophysiologie · gratuit, sans compte</div>
</body></html>`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.screenshot({ path: path.join(racine, 'icons', 'og.png') });
await b.close();
console.log('icons/og.png');
