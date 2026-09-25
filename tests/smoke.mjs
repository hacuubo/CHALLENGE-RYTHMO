// Test de fumée de l'interface (Chromium sans affichage) : node tests/smoke.mjs
// Sert le dépôt sur un port local, parcourt les écrans principaux et échoue à la moindre erreur JavaScript.
// Variables : CHROMIUM_PATH (exécutable Chromium, facultatif), CAPTURES (dossier où enregistrer des captures).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  // navigation : barre d'onglets si visible (elle est masquée sur l'accueil épuré), sinon logo ou tuile de l'accueil
  const nav = async v => {
    const barre = page.locator(`${largeur < 760 ? '.onglets-bas' : '.onglets'} [data-nav=${v}]`);
    if (await barre.isVisible()) return barre.click();
    if (v === 'accueil') return page.click('.logo');
    return page.click(`#app [data-nav=${v}]`);
  };
  const repondre = async () => {
    if (await page.$('#txt')) { await page.fill('#txt', 'test'); await page.click('#voir'); await page.click('[data-e="2"]'); return; }
    await page.click('.option >> nth=0');
    const v = await page.$('#valider:not([disabled])'); if (v) await v.click();
  };

  await page.goto(url);
  await page.waitForSelector('.menu-principal');
  await page.waitForSelector('#ecran-titre', { state: 'detached' });
  await capture('accueil');

  await verifier(`${appareil} : partie compétitive (ELO)`, async () => {
    const avant = +(await page.textContent('.tuile[data-nav=competitif] .tuile-elo b'));
    if (avant !== 600) throw new Error(`ELO de départ ${avant} au lieu de 600`);
    await page.click('.tuile[data-nav=competitif]');
    await page.click('#jouer');
    for (let i = 0; i < 6; i++) {
      await page.waitForSelector('#zone');
      await repondre();
      await page.waitForSelector('#suivant');
      if (!(await page.$('#retour .delta'))) throw new Error('variation d\'ELO absente');
      if (i === 0) await capture('correction');
      await page.click(i < 5 ? '#suivant' : '#arreter');
    }
    await page.waitForSelector('.elo-bilan');
    await capture('resultats');
    await nav('accueil');
    const apres = +(await page.textContent('.tuile[data-nav=competitif] .tuile-elo b'));
    if (!Number.isFinite(apres) || apres === avant) throw new Error(`ELO inchangé (${avant} → ${apres})`);
    await nav('competitif');
    await page.waitForSelector('#courbe svg');
    await capture('competitif');
  });

  await verifier(`${appareil} : entraînement par domaine`, async () => {
    await nav('accueil');
    await page.click('.tuile[data-nav=entrainement]');
    await page.click('[data-domaine=stim]');
    await page.waitForSelector('#zone');
    await repondre();
    await page.waitForSelector('#suivant');
    page.once('dialog', d => d.accept());
    await page.click('#quit');
  });

  await verifier(`${appareil} : examen interrompu puis repris`, async () => {
    await nav('accueil');
    await page.click('.tuile[data-nav=entrainement]');
    await page.click('.tuile[data-nav=config]');
    await page.waitForSelector('#cpt');
    await page.click('label.puce:has(input[name=mode][value=examen])');
    await page.click('#go');
    await page.waitForSelector('#chrono');
    await repondre();
    await page.waitForSelector('#zone');
    if (await page.$('#retour .retour')) throw new Error('la correction ne doit pas s\'afficher en examen');
    await page.reload();
    await page.waitForSelector('#ecran-titre', { state: 'detached' });
    await page.waitForSelector('#reprendre');
    await page.click('#reprendre');
    await page.waitForSelector('#chrono');
    page.once('dialog', d => d.accept());
    await page.click('#quit');
    await page.waitForSelector('.score-rond');
  });

  await verifier(`${appareil} : lecture d'ECG, compas et plein écran`, async () => {
    await nav('accueil');
    await page.click('.tuile[data-nav=entrainement]');
    await page.click('.tuile[data-nav=config]');
    await page.waitForSelector('#cpt');
    await page.click('label.puce:has(input[name=mode][value=entrainement])');
    await page.check('input[name=ecgSeul]');
    await page.click('#go');
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
    await nav('accueil');
    await page.click('.tuile[data-nav=entrainement]');
    await page.click('.tuile[data-nav=config]');
    await page.waitForSelector('#cpt');
    await page.uncheck('input[name=ecgSeul]');
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
    await page.waitForSelector('#courbe svg');
    await capture('progression');
    await nav('apropos');
    await page.waitForSelector('.sources-liste');
  });

  await verifier(`${appareil} : simulateur d'électrophysiologie`, async () => {
    await nav('accueil');
    await page.click('.tuile[data-nav=simu-menu]');
    await page.click('[data-simu=normal]');
    await page.waitForSelector('#ecran');
    await page.selectOption('#scenario', 'trin');
    await page.uncheck('#figer-apres');
    await page.fill('#s2', '320'); await page.dispatchEvent('#s2', 'change');
    await page.click('#stimuler');
    await page.waitForFunction(() => /Tachycardie/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 15000 });
    await capture('simulateur');
    await page.click('#adenosine');
    await page.waitForFunction(() => !/Tachycardie/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 15000 });
    await page.selectOption('#scenario', 'mystere');
    await page.selectOption('#reponse', 'trav');
    await page.click('#valider');
    await page.waitForSelector('#verdict .retour');
    await page.click('#ecran', { position: { x: 200, y: 100 } });
    await page.waitForFunction(() => /Relecture/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 3000 });
  });

  await verifier(`${appareil} : tous les tracés synthétiques (ECG et EGM) se dessinent`, async () => {
    const r = await page.evaluate(async () => {
      const { dessinerECG } = await import('./js/ecg.js');
      const { dessinerEGM, PRESETS_EGM } = await import('./js/egm.js');
      const idx = await (await fetch('data/questions/index.json')).json();
      const ko = [];
      for (const p of PRESETS_EGM) {
        const d = document.createElement('div'); const c = document.createElement('canvas'); d.append(c); document.body.append(d);
        if (!dessinerEGM(c, { preset: p }, 'test')) ko.push('egm:' + p);
        d.remove();
      }
      const { rejouer } = await import('./js/simu/rejeu.js');
      const { dessinerSimu } = await import('./js/simu/trace.js');
      for (const f of idx.fichiers) for (const q of await (await fetch('data/questions/' + f)).json()) if (q.simu) {
        const d = document.createElement('div'); const c = document.createElement('canvas'); c.style.width = '600px'; d.append(c); document.body.append(d);
        const { coeur } = rejouer(q.simu);
        if (!dessinerSimu(c, coeur, { tFin: q.simu.fin, vitesse: q.simu.vitesse, mode: 'defilement' })) ko.push(q.id);
        d.remove();
      }
      for (const f of idx.fichiers) for (const q of await (await fetch('data/questions/' + f)).json()) if (q.ecg || q.egm) {
        const d = document.createElement('div'); const c = document.createElement('canvas'); d.append(c); document.body.append(d);
        if (!(q.ecg ? dessinerECG(c, q.ecg, q.id) : dessinerEGM(c, q.egm, q.id))) ko.push(q.id);
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
