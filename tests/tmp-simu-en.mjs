// Contrôle jetable : vue simulateur en anglais et en français, sans erreur de console.
import { chromium } from 'playwright-core';
const SCR = '/tmp/claude-0/-home-user-CHALLENGE-RYTHMO/d7a1d509-beb6-527e-9d7b-e10c1209e6b8/scratchpad/';
const port = process.env.PORT;
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let erreurs = [];
for (const lang of ['en', 'fr']) {
  const page = await nav.newPage({ viewport: { width: 1400, height: 1100 } });
  page.on('console', m => { if (m.type() === 'error') erreurs.push(`${lang} console: ${m.text()}`); });
  page.on('pageerror', e => erreurs.push(`${lang} pageerror: ${e.message}`));
  await page.addInitScript(l => localStorage.setItem('rythmo.langue', l), lang);
  await page.goto(`http://localhost:${port}/#simulateur`);
  await page.waitForSelector('#ecran');
  await page.selectOption('#scenario', 'trin');
  await page.fill('#s2', '320'); await page.dispatchEvent('#s2', 'change');
  await page.click('#stimuler');
  await page.waitForFunction(() => /Tachycard/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 15000 });
  await page.waitForTimeout(4000);
  await page.selectOption('#montage', 'complet');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCR}simu-${lang}.png`, fullPage: false });
  await page.selectOption('#scenario', 'mystere');
  await page.selectOption('#reponse', 'trav');
  await page.click('#valider');
  await page.waitForSelector('#verdict .retour');
  await page.locator('#verdict').screenshot({ path: `${SCR}verdict-${lang}.png` });
  console.log(lang, (await page.textContent('#etat')), '|', (await page.textContent('#rappel-titre')));
  await page.goto(`http://localhost:${port}/#simu-menu`); await page.waitForTimeout(800);
  await page.screenshot({ path: `${SCR}menu-${lang}.png` });
  await page.close();
}
await nav.close();
console.log(erreurs.length ? erreurs.join('\n') : 'aucune erreur');
