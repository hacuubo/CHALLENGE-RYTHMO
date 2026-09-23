// Test de fumée de l'interface (Chromium sans affichage) : node tests/smoke.mjs
// Sert le dépôt sur un port local, parcourt les écrans principaux et échoue à la moindre erreur JavaScript.
// Variables : CHROMIUM_PATH (exécutable Chromium, facultatif), CAPTURES (dossier où enregistrer des captures).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }

const racine = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  const p = path.join(racine, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(racine) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${serveur.address().port}/`;

const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const erreurs = [];
const captures = process.env.CAPTURES;
let etape = '';
async function verifier(nom, fn) {
  etape = nom;
  try { await fn(); console.log('✓', nom); } catch (e) { erreurs.push(`${nom} : ${e.message.split('\n')[0]}`); console.log('✗', nom, e.message.split('\n')[0]); }
}

for (const [largeur, hauteur, appareil] of [[390, 844, 'mobile'], [1280, 900, 'bureau']]) {
  const page = await navigateur.newPage({ viewport: { width: largeur, height: hauteur } });
  page.on('pageerror', e => erreurs.push(`[${appareil}] ${etape} : ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(`[${appareil}] ${etape} : console ${m.text()}`); });
  const capture = async n => { if (captures) await page.screenshot({ path: path.join(captures, `${appareil}-${n}.png`), fullPage: true }); };
  const nav = v => page.click(`${largeur < 760 ? '.onglets-bas' : '.onglets'} [data-nav=${v}]`);
  const repondre = async () => {
    if (await page.$('#txt')) { await page.fill('#txt', 'test'); await page.click('#voir'); await page.click('[data-e="2"]'); return; }
    await page.click('.option >> nth=0');
    const v = await page.$('#valider:not([disabled])'); if (v) await v.click();
  };

  await page.goto(url);
  await page.waitForSelector('.hero');
  await capture('accueil');

  await verifier(`${appareil} : défi adaptatif (10 questions)`, async () => {
    await page.click('#go-adapt');
    for (let i = 0; i < 10; i++) {
      await page.waitForSelector('#zone');
      await repondre();
      await page.waitForSelector('#suivant');
      if (i === 0) await capture('correction');
      await page.click('#suivant');
    }
    await page.waitForSelector('.score-rond');
    await capture('resultats');
  });

  await verifier(`${appareil} : examen interrompu puis repris`, async () => {
    await nav('accueil');
    await page.click('#go-exam');
    await page.waitForSelector('#chrono');
    await repondre();
    await page.waitForSelector('#zone');
    if (await page.$('#retour .retour')) throw new Error('la correction ne doit pas s\'afficher en examen');
    await page.reload();
    await page.waitForSelector('#reprendre');
    await page.click('#reprendre');
    await page.waitForSelector('#chrono');
    page.once('dialog', d => d.accept());
    await page.click('#quit');
    await page.waitForSelector('.score-rond');
  });

  await verifier(`${appareil} : lecture d'ECG, compas et plein écran`, async () => {
    await nav('accueil');
    await page.click('#go-ecg');
    await page.waitForSelector('.trace canvas');
    await page.click('[data-compas]');
    const boite = await page.locator('.trace .calque').boundingBox();
    await page.mouse.move(boite.x + 40, boite.y + 40); await page.mouse.down();
    await page.mouse.move(boite.x + 160, boite.y + 40, { steps: 4 }); await page.mouse.up();
    const mesure = await page.textContent('.trace .compas-mesure');
    if (!/ms/.test(mesure)) throw new Error('mesure du compas absente');
    await capture('compas');
    await page.click('[data-plein]');
    await page.waitForSelector('.plein canvas');
    await capture('plein-ecran');
    await page.click('.plein [data-fermer]');
    page.once('dialog', d => d.accept());
    await page.click('#quit');
  });

  await verifier(`${appareil} : ECG 12 dérivations (rendu)`, async () => {
    const ok = await page.evaluate(async () => {
      const { dessinerECG12 } = await import('./js/ecg12.js');
      const derivations = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
      const signaux = derivations.map((_, k) => Array.from({ length: 2500 }, (_, i) => Math.round(900 * Math.exp(-(((i % 200) - 60) ** 2) / 20) * (k % 2 ? -1 : 1))));
      const d = document.createElement('div'); const c = document.createElement('canvas'); d.append(c); document.body.append(d);
      const g = dessinerECG12(c, { fs: 250, derivations, signaux });
      d.remove();
      return g && g.pxmm > 0;
    });
    if (!ok) throw new Error('rendu 12 dérivations impossible');
  });

  await verifier(`${appareil} : entraînement ciblé, fiches, progression, sources`, async () => {
    await nav('config');
    await page.waitForSelector('#cpt');
    await page.check('input[name=niveau][value=av]');
    await capture('config');
    await page.click('#go');
    await page.waitForSelector('#zone');
    await nav('fiches');
    page.once('dialog', d => d.accept());
    await page.waitForSelector('#recherche');
    await page.fill('#recherche', 'Wenckebach');
    await page.waitForTimeout(400);
    await page.click('details.fiche >> nth=0');
    await capture('fiches');
    await nav('progression');
    await page.waitForSelector('.grille-badges');
    await capture('progression');
    await nav('apropos');
    await page.waitForSelector('.sources-liste');
  });

  await verifier(`${appareil} : tous les tracés synthétiques se dessinent`, async () => {
    const r = await page.evaluate(async () => {
      const { dessinerECG } = await import('./js/ecg.js');
      const idx = await (await fetch('data/questions/index.json')).json();
      const ko = [];
      for (const f of idx.fichiers) for (const q of await (await fetch('data/questions/' + f)).json()) if (q.ecg) {
        const d = document.createElement('div'); const c = document.createElement('canvas'); d.append(c); document.body.append(d);
        if (!dessinerECG(c, q.ecg, q.id)) ko.push(q.id);
        d.remove();
      }
      return ko;
    });
    if (r.length) throw new Error('tracés en échec : ' + r.join(', '));
  });
  await page.close();
}

await navigateur.close();
serveur.close();
if (erreurs.length) { console.error('\nErreurs :\n' + erreurs.join('\n')); process.exit(1); }
console.log('\nTest de fumée réussi.');
