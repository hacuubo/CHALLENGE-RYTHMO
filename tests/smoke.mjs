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
  // parcours en français par défaut (le navigateur de test n'est pas francophone : pas d'invitation à passer en anglais)
  await page.addInitScript(() => { if (!sessionStorage.getItem('langue-posee')) { localStorage.setItem('rythmo.langue', 'fr'); sessionStorage.setItem('langue-posee', '1'); } });
  page.on('pageerror', e => erreurs.push(`[${appareil}] ${etape} : ${e.message}`));
  // ressource absente : erreur, sauf surcouche anglaise pas encore traduite (repli prévu sur le français)
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) erreurs.push(`[${appareil}] ${etape} : console ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && !/\/data\/questions\/en\//.test(r.url())) erreurs.push(`[${appareil}] ${etape} : ${r.status()} ${r.url()}`); });
  const capture = async n => { if (captures) await page.screenshot({ path: path.join(captures, `${appareil}-${n}.png`), fullPage: true }); };
  // navigation sans barre du bas : bouton de l'écran, sinon retour à l'accueil puis case de l'accueil
  const nav = async v => {
    if (await page.$('.onglets-bas')) throw new Error('barre de navigation du bas présente');
    const surAccueil = async () => !!await page.$('.menu-principal.centre');
    if (v === 'accueil' && await surAccueil()) return; // déjà sur l'accueil
    if (await page.$(`#app [data-nav=${v}]`)) return page.click(`#app [data-nav=${v}] >> nth=0`);
    if (await page.evaluate(() => location.hash === '#quiz') && await page.$('#quit')) { // quitter la série en cours
      await page.click('#quit');
      await page.waitForSelector('#quit', { state: 'detached' });
    }
    if (!await surAccueil()) await page.click('#app [data-nav=accueil] >> nth=0');
    await page.waitForSelector('.menu-principal.centre');
    return page.click(`#app [data-nav=${v}] >> nth=0`);
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
    // pause : retour à l'écran Compétitif, sans écran de résultats ni série à reprendre ; on peut rejouer aussitôt
    await page.waitForSelector('#jouer');
    await page.click('#jouer');
    await page.waitForSelector('#zone');
    await page.click('#quit');
    await page.waitForSelector('#jouer');
    await nav('accueil');
    if (await page.$('#reprendre')) throw new Error('le mode compétitif ne doit pas laisser de série à reprendre');
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
    await page.waitForSelector('.score-rond'); // série commencée : écran de résultats
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
    await page.waitForSelector('#quit', { state: 'detached' });
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

  await verifier(`${appareil} : entraînement ciblé, progression, sources`, async () => {
    await nav('accueil');
    await page.click('.tuile[data-nav=entrainement]');
    await page.click('.tuile[data-nav=config]');
    await page.waitForSelector('#cpt');
    await page.uncheck('input[name=ecgSeul]');
    await page.check('input[name=niveau][value=av]');
    await capture('config');
    await page.click('#go');
    await page.waitForSelector('#zone');
    page.once('dialog', d => d.accept().catch(() => {}));
    await nav('progression');
    await page.waitForSelector('.grille-badges');
    await page.waitForSelector('#courbe svg');
    await capture('progression');
    await nav('apropos');
    await page.waitForSelector('.sources-liste');
    await capture('sources');
    await page.click('.retour-fleche');
    await page.waitForSelector('.menu-principal.centre');
    if (await page.$('.tuile[data-nav=fiches]')) throw new Error('les fiches sont encore sur l\'accueil');
  });

  await verifier(`${appareil} : simulateur d'électrophysiologie`, async () => {
    await nav('accueil');
    await page.click('.tuile[data-nav=simulateur]');
    await page.waitForSelector('#ecran'); // l'accueil mène directement à la baie
    await page.selectOption('#scenario', 'trin');
    if (await page.isVisible('#s2')) throw new Error('S2 visible sans « + extrastimulus »');
    await page.check('#extras');
    await page.fill('#s2', '320'); await page.dispatchEvent('#s2', 'change');
    await page.click('#stimuler');
    // pendant le train, Stimuler devient Stop
    if (await page.textContent('#stimuler') !== 'Stop') throw new Error('le bouton Stimuler ne devient pas Stop');
    // compteur du train : S1 délivrés / demandés (8 par défaut)
    await page.waitForFunction(() => /Train S1 \d\/8/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 3000 });
    // simulation en temps réel : l'induction prend ~9 s, davantage sur une machine chargée
    await page.waitForFunction(() => /Tachycardie/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 30000 });
    // la manœuvre s'affiche sur l'écran de rappel ; toucher le tracé en temps réel ne l'arrête pas
    await page.waitForFunction(() => /S2 320/.test(document.querySelector('#rappel-titre')?.textContent || ''), null, { timeout: 10000 });
    if (!/−/.test(await page.textContent('#recul-val'))) throw new Error('le rappel n\'est pas centré sur l\'extrastimulus');
    // voies : en enlever une et en ajouter une autre passe en montage personnalisé
    await page.click('#voies-bloc summary');
    await page.click('[data-voie=V1]'); await page.click('[data-voie=abld]');
    if (await page.inputValue('#montage') !== 'perso' || await page.getAttribute('[data-voie=V1]', 'aria-pressed') !== 'false') throw new Error('choix des voies inopérant');
    await page.click('#voies-bloc summary');
    // la barre d'état est réécrite à chaque image : on attend qu'elle soit renseignée
    const t0 = await (await page.waitForFunction(() => document.querySelector('#etat')?.textContent.trim() || null, null, { timeout: 5000 })).jsonValue();
    await page.click('#ecran', { position: { x: 200, y: 100 } });
    if (/Relecture/.test(await page.evaluate(() => document.querySelector('#etat').textContent)) || !t0) throw new Error('le tracé en temps réel s\'est figé');
    await page.click('#enregistrer');
    await page.waitForFunction(() => document.querySelector('#rappel-titre')?.textContent.includes('Enregistrement'), null, { timeout: 5000 });
    await page.click('#tab-journal');
    await page.click('#journal [data-evt]:last-child');
    if (largeur < 700) { if (!await page.isVisible('#paysage')) throw new Error('invitation au paysage absente'); }
    else {
      if (!await page.isVisible('#ecran-rappel')) throw new Error('écran de rappel invisible');
      const b = await page.locator('#ecran-rappel').boundingBox();
      await page.mouse.move(b.x + b.width * 0.5, b.y + 60); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.7, b.y + 60); await page.mouse.up();
      await page.waitForTimeout(100);
      if (!await page.evaluate(() => /A-A/.test(document.querySelector('#mesures-rappel').textContent))) throw new Error('mesures du rappel absentes');
    }
    await capture('simulateur');
    await page.click('#tab-medic');
    await page.click('#adenosine');
    await page.waitForFunction(() => !/Tachycardie/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 15000 });
    // protocole automatique : stimulation para-hisienne, conclusion nodale dans le scénario de conduction normale
    await page.selectOption('#scenario', 'normal');
    await page.click('#tab-proto');
    await page.click('[data-proto=parahis]');
    await page.waitForFunction(() => /conduction rétrograde nodale/.test(document.querySelector('#proto-etat')?.textContent || ''), null, { timeout: 20000 });
    // sonde placée sur la carte, tir de radiofréquence avec température affichée, puis arrêt
    await page.click('#tab-abl');
    await page.click('.pt[data-pos=koch]');
    await page.click('#ablater');
    await page.waitForFunction(() => /°C/.test(document.querySelector('#rf-etat')?.textContent || ''), null, { timeout: 5000 });
    await page.click('#ablater');
    if (await page.getAttribute('#ablater', 'aria-pressed') !== 'false') throw new Error('le tir ne s\'arrête pas');
    await page.click('#tab-journal');
    await page.click('#cr-generer');
    await page.waitForSelector('#compte-rendu .simu-cr-table');
    await capture('simulateur-console');
    if (largeur < 700) { // téléphone en paysage : un écran à la fois, bascule vers le rappel
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(300);
      if (!await page.isVisible('.simu-bascule')) throw new Error('bascule temps réel / rappel absente en paysage');
      await page.click('.simu-bascule [data-vue=rappel]');
      await page.waitForTimeout(200);
      if (await page.isVisible('#ecran') || !await page.isVisible('#ecran-rappel')) throw new Error('bascule vers l\'écran de rappel inopérante');
      await capture('simulateur-paysage');
      await page.click('.simu-bascule [data-vue=direct]');
      await page.setViewportSize({ width: largeur, height: hauteur });
    }
    // patient adressé en flutter : tachycardie présente dès l'ouverture, diagnostic à confirmer
    await page.selectOption('#scenario', 'arrivee-flutter');
    await page.waitForFunction(() => /Tachycardie/.test(document.querySelector('#etat')?.textContent || ''), null, { timeout: 3000 });
    if (await page.textContent('#cas-badge') !== 'Patient en tachycardie' || !await page.isVisible('#diagnostic')) throw new Error('cas « patient en tachycardie » mal présenté');
    // salve : burst de 2 s lancé par Stimuler (onglet Salve), qui redevient Stimuler à la fin du burst
    await page.click('#tab-salve');
    await page.click('#salveType [data-v=burst]');
    await page.fill('#salve-duree', '2'); await page.dispatchEvent('#salve-duree', 'change');
    await page.click('#stimuler');
    if (await page.textContent('#stimuler') !== 'Stop') throw new Error('le burst ne démarre pas depuis Stimuler');
    await page.waitForFunction(() => document.querySelector('#stimuler').textContent === 'Stimuler', null, { timeout: 6000 });
    await page.click('#tab-prog');
    // quiz : cas tiré au sort, deux notes (diagnostic, démarche) et démarche idéale
    await page.click('[data-mode=quiz]');
    if (await page.isVisible('#choix-scenario') || !await page.isVisible('#quiz-nouveau')) throw new Error('mode quiz mal présenté');
    await page.selectOption('#reponse', 'trav');
    await page.click('#valider');
    await page.waitForSelector('#verdict .retour');
    if (await page.locator('#verdict .simu-note').count() !== 2 || !await page.locator('#verdict .simu-ideal li').count()) throw new Error('notes ou démarche idéale absentes');
    await page.click('[data-mode=libre]');
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
  await verifier(`${appareil} : version anglaise (accueil, question et correction), puis retour au français`, async () => {
    await page.evaluate(() => { location.hash = 'accueil'; }); // indépendant de l'écran laissé par l'étape précédente
    await page.waitForSelector('.choix-langue [data-langue=en][aria-pressed=false]');
    await page.click('.choix-langue [data-langue=en]');
    await page.waitForSelector('.choix-langue [data-langue=en][aria-pressed=true]');
    if (await page.evaluate(() => document.documentElement.lang) !== 'en') throw new Error('<html lang> non mis à jour');
    const accueil = await page.textContent('#app');
    for (const m of ['Training', 'Competitive', 'Simulator', 'Progress', 'Sources and information']) if (!accueil.includes(m)) throw new Error(`accueil : « ${m} » absent`);
    for (const m of ['Entraînement', 'Compétitif', 'Simulateur']) if (accueil.includes(m)) throw new Error(`accueil : « ${m} » encore en français`);
    await page.click('.tuile[data-nav=entrainement]');
    await page.waitForSelector('h1:text("Training")');
    await page.click('[data-domaine=ecg]');
    await page.waitForSelector('#zone');
    await repondre();
    await page.waitForSelector('#suivant');
    const quiz = await page.textContent('#app');
    if (/Question suivante|Voir mes résultats|Signaler une erreur|À retenir/.test(quiz)) throw new Error('correction encore en français');
    if (!/Next question|See my results/.test(await page.textContent('#suivant'))) throw new Error('bouton suivant non traduit');
    if (!/Report an error/.test(quiz)) throw new Error('lien de signalement non traduit');
    if (await page.$('.retenir') && !/Key point/.test(await page.textContent('.retenir'))) throw new Error('« Key point » absent');
    if (!/Error%20report/.test(await page.getAttribute('.signaler', 'href'))) throw new Error('signalement non prérempli en anglais');
    await capture('anglais-correction');
    await page.evaluate(() => { location.hash = 'accueil'; }); // série laissée en cours (sans confirmation)
    await page.waitForSelector('.menu-principal.centre');
    if (!/Resume:/.test(await page.textContent('#reprendre'))) throw new Error('bouton de reprise non traduit');
    // le choix est mémorisé : il survit au rechargement
    await page.reload();
    await page.waitForSelector('#ecran-titre', { state: 'detached' });
    await page.waitForSelector('.choix-langue [data-langue=en][aria-pressed=true]');
    await page.click('.choix-langue [data-langue=fr]');
    await page.waitForSelector('.choix-langue [data-langue=fr][aria-pressed=true]');
    if (!(await page.textContent('#app')).includes('Entraînement')) throw new Error('retour au français incomplet');
    if (await page.evaluate(() => localStorage.getItem('rythmo.langue')) !== 'fr') throw new Error('choix du français non mémorisé');
  });
  await page.close();
}

// Visiteur non francophone sans choix mémorisé : invitation (en anglais) à passer à l'anglais, refermable.
await verifier('invitation à la version anglaise', async () => {
  const ctx = await navigateur.newContext({ locale: 'en-GB' });
  const page = await ctx.newPage();
  page.on('pageerror', e => erreurs.push(`invitation : ${e.message}`));
  await page.goto(url);
  await page.waitForSelector('.invitation-langue');
  if (!(await page.textContent('#app')).includes('Entraînement')) throw new Error('la version par défaut doit rester en français');
  await page.click('.invitation-langue [data-langue=en]');
  await page.waitForSelector('.choix-langue [data-langue=en][aria-pressed=true]');
  if (await page.$('.invitation-langue')) throw new Error('invitation encore affichée');
  await page.evaluate(() => localStorage.removeItem('rythmo.langue'));
  await page.reload();
  await page.waitForSelector('.fermer-invitation');
  await page.click('.fermer-invitation');
  if (await page.$('.invitation-langue') || await page.evaluate(() => localStorage.getItem('rythmo.langue')) !== 'fr') throw new Error('invitation non refermée');
  await ctx.close();
});

// Référencement : balises essentielles, données structurées valides, contenu lisible sans JavaScript.
await verifier('référencement (SEO / GEO)', async () => {
  const ctx = await navigateur.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  for (const [chemin, texte] of [['', 'questions corrigées'], ['presentation.html', 'Questions fréquentes']]) {
    await page.goto(url + chemin, { waitUntil: 'domcontentloaded' });
    for (const sel of ['title', 'meta[name=description]', 'link[rel=canonical]', 'meta[property="og:image"]', 'script[type="application/ld+json"]']) {
      if (!(await page.$(sel))) throw new Error(`${chemin || 'index.html'} : ${sel} manquant`);
    }
    for (const j of await page.$$eval('script[type="application/ld+json"]', s => s.map(e => e.textContent))) JSON.parse(j);
    if (!(await page.textContent('body')).includes(texte)) throw new Error(`${chemin || 'index.html'} : contenu statique absent`);
    if (!(await page.isVisible('h1'))) throw new Error(`${chemin || 'index.html'} : titre masqué sans JavaScript`);
  }
  await ctx.close();
});

await navigateur.close();
serveur.close();
if (erreurs.length) { console.error('\nErreurs :\n' + erreurs.join('\n')); process.exit(1); }
console.log('\nTest de fumée réussi.');
