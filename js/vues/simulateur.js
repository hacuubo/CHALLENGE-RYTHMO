// Simulateur d'électrophysiologie : stimulation programmée, manœuvres diagnostiques, adénosine, choc, ablation.
import { Coeur } from '../simu/moteur.js';
import { SCENARIOS, MYSTERES, SITES_STIM, SITES_DETECTION, CIBLES_ABLATION } from '../simu/scenarios.js';
import { dessinerSimu } from '../simu/trace.js';
import { mesures, tachycardie } from '../simu/analyse.js';
import { esc, melanger } from '../util.js';

let boucle = null;
export function arreterSimulateur() { if (boucle) cancelAnimationFrame(boucle); boucle = null; }

const REGLAGES = 'rythmo.simu';
const lire = () => { try { return JSON.parse(localStorage.getItem(REGLAGES)) || {}; } catch { return {}; } };
const ecrire = r => { try { localStorage.setItem(REGLAGES, JSON.stringify(r)); } catch { /* stockage indisponible */ } };

export function vueSimulateur(app) {
  arreterSimulateur();
  const r = { site: 'hra', detection: '', s1: 600, n: 8, s2: 0, s3: 0, s4: 0, figerApres: true, fenetre: innerWidth < 700 ? 3000 : 5000, etiquettes: true, ...lire() };
  const st = { scenario: 'normal', mystere: false, coeur: null, t: 0, fige: false, recul: 0, curseurs: null, salve: null, figerA: null, dernierMaj: 0, repondu: false };

  const opt = (liste, v) => liste.map(o => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(o.nom)}</option>`).join('');
  const champ = (id, lib, v, pas = 10) => `<label class="simu-champ"><span>${lib}</span><input type="number" id="${id}" value="${v}" min="0" max="2000" step="${pas}" inputmode="numeric"></label>`;

  app.innerHTML = `
    <h1>Simulateur d'électrophysiologie</h1>
    <section class="carte simu-tete">
      <label class="simu-champ large"><span>Scénario</span>
        <select id="scenario">
          <option value="mystere">🎲 Cas mystère (diagnostic à trouver)</option>
          ${Object.entries(SCENARIOS).map(([id, s]) => `<option value="${id}" ${id === 'normal' ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}
        </select></label>
      <div class="simu-mesures" id="mesures" aria-live="off"></div>
    </section>

    <section class="simu-ecran">
      <canvas id="ecran" role="img" aria-label="Électrogrammes : DII, V1, OD haute, His, sinus coronaire, VD apex"></canvas>
      <div class="simu-etat" id="etat"></div>
      <div class="simu-message" id="message" role="status"></div>
      <div class="simu-recul" id="recul-bloc" hidden><label>Revenir en arrière <input type="range" id="recul" min="0" max="20000" step="100" value="0"></label><span id="recul-val"></span></div>
      <div class="actions serre gauche simu-outils">
        <button class="btn btn-primaire" id="stimuler">Stimuler</button>
        <button class="btn" id="s2moins" title="Raccourcir S2 de 10 ms puis stimuler">S2 − 10</button>
        <button class="btn" id="salve">Salve à S1</button>
        <button class="btn" id="figer">Figer</button>
        <button class="btn" id="adenosine">Adénosine</button>
        <button class="btn" id="choc">Choc</button>
      </div>
      <p class="note simu-aide-compas">Touchez ou cliquez le tracé pour le figer, puis faites glisser pour mesurer un intervalle.</p>
    </section>

    <section class="carte simu-commandes">
      <fieldset><legend>Stimulateur</legend>
        <div class="simu-ligne">
          <label class="simu-champ"><span>Site</span><select id="site">${opt(SITES_STIM, r.site)}</select></label>
          <label class="simu-champ"><span>Couplé à la détection</span><select id="detection">${opt(SITES_DETECTION, r.detection)}</select></label>
        </div>
        <div class="simu-ligne">
          ${champ('s1', 'S1 (ms)', r.s1)}${champ('n', 'Nb S1', r.n, 1)}${champ('s2', 'S2', r.s2)}${champ('s3', 'S3', r.s3)}${champ('s4', 'S4', r.s4)}
        </div>
        <label class="simu-case"><input type="checkbox" id="figer-apres" ${r.figerApres ? 'checked' : ''}> Figer le tracé après le train</label>
      </fieldset>
      <fieldset><legend>Ablation</legend>
        <div class="simu-ligne">
          <label class="simu-champ large"><span>Cible d'ablation</span><select id="cible">${opt(CIBLES_ABLATION, '')}</select></label>
          <button class="btn btn-danger" id="ablater">Radiofréquence</button>
        </div>
        <button class="btn" id="reinit">Recommencer le cas</button>
      </fieldset>
      <fieldset><legend>Affichage</legend>
        <div class="simu-ligne">
          <label class="simu-champ"><span>Fenêtre</span><select id="fenetre">${[2000, 3000, 5000, 8000].map(f => `<option value="${f}" ${f === r.fenetre ? 'selected' : ''}>${f / 1000} s</option>`).join('')}</select></label>
          <label class="simu-case"><input type="checkbox" id="etiquettes" ${r.etiquettes ? 'checked' : ''}> Étiquettes A, H, V sur le His</label>
        </div>
      </fieldset>
    </section>

    <section class="carte" id="diagnostic" hidden>
      <h2>Votre diagnostic</h2>
      <p class="note">Stimulez, induisez, faites vos manœuvres, puis concluez.</p>
      <div class="simu-ligne"><label class="simu-champ large"><span>Diagnostic</span><select id="reponse">
        <option value="">— Choisir —</option>${MYSTERES.map(id => `<option value="${id}">${esc(SCENARIOS[id].court)}</option>`).join('')}</select></label>
        <button class="btn btn-primaire" id="valider">Valider</button></div>
      <div id="verdict"></div>
    </section>

    <section class="carte" id="explication-scenario"></section>

    <details class="carte simu-guide">
      <summary><b>Mode d'emploi et manœuvres clés</b></summary>
      <ul>
        <li><b>Tracés</b> : DII et V1 en surface ; OD haute ; His (A, H, V) ; paroi latérale de l'OD (haute, basse) et isthme cavo-tricuspide ; sinus coronaire du proximal (9-10, ostium) au distal (1-2, anneau mitral latéral) ; VD apex. « S » en haut = stimulus capturant, « s » = non capturant.</li>
        <li><b>Extrastimulus</b> : train de S1 (ex. 8 × 600 ms) puis S2, S3, S4 (0 = désactivé). Diminuez S2 par pas de 10 ms (bouton « S2 − 10 », qui stimule aussitôt) : saut de l'AH ≥ 50 ms = double voie nodale. Période réfractaire effective : du tissu stimulé quand S2 ne capture plus ; du nœud AV (ou de la voie rapide) quand S2 capture mais n'est plus suivi d'un H.</li>
        <li><b>Induction</b> : extrastimulus atrial (OD haute ou SC), salve atriale rapide (ex. S1 = 300 ms) ou extrastimulus ventriculaire (VD).</li>
        <li><b>Pendant la tachycardie</b> : mesurez le VA sur le His et regardez l'activation atriale la plus précoce (His, SC proximal, SC distal…).</li>
        <li><b>ESV His-réfractaire</b> : site VD, détection sur le His, Nb S1 = 0, S2 (délai après la détection) ≈ 10-20 ms : le stimulus tombe quand le His vient d'être activé. Si l'atrium suivant est avancé avec la même séquence, il existe une voie accessoire (le His étant réfractaire, l'influx ne peut pas remonter par le nœud AV). Elle participe au circuit si l'ESV retarde l'atrium ou arrête la tachycardie sans l'atteindre. Une absence d'avance n'exclut pas une voie latérale gauche, éloignée du VD.</li>
        <li><b>Entraînement ventriculaire</b> : salve VD à un cycle 10 à 40 ms plus court que la tachycardie, vérifiez que l'atrium suit, arrêtez. Réponse <b>V-A-V</b> (réentrée utilisant le nœud AV ou une voie accessoire) ou <b>V-A-A-V</b> (tachycardie atriale). Mesurez PPI − TCL sur l'électrogramme VD : &gt; 115 ms (et SA − VA &gt; 85 ms) en faveur d'une réentrée intranodale, &lt; 115 ms d'une réentrée utilisant une voie accessoire (critère validé pour distinguer réentrée intranodale et voie accessoire septale). Piège : réponse pseudo-V-A-A-V quand le VA est long (TRIN atypique) ou très court ; raisonnez sur le dernier A entraîné, ou sur la séquence V-A-H-V. Un PPI − TCL limite se corrige de l'allongement de l'AH post-stimulation (PPI corrigé).</li>
        <li><b>Flutter</b> : entraînez depuis l'isthme cavo-tricuspide (site « Isthme cavo-tricuspide », cycle 10 à 30 ms plus court que celui du flutter) puis depuis le SC distal, et comparez les PPI − TCL mesurés sur l'électrogramme du site de stimulation. Après ablation de l'isthme, stimulez l'ostium du SC : une activation latérale descendante (OD lat. haute avant basse) signe le bloc septal → latéral. Stimulez ensuite l'isthme latéral (site « Isthme cavo-tricuspide ») : un His activé avant l'ostium du SC signe le bloc latéral → septal. Les deux ensemble définissent le bloc bidirectionnel.</li>
        <li><b>Adénosine</b> : bloc AV transitoire (dans le simulateur, 1,5 s après le clic ; en clinique, 10 à 20 s après un bolus IV rapide rincé) ; une tachycardie qui persiste malgré le bloc n'utilise pas le nœud AV.</li>
        <li><b>Ablation</b> : choisissez la cible puis vérifiez la non-inductibilité. L'ablation de la région antéro-septale expose au bloc AV complet.</li>
      </ul>
      <p class="note">Modèle pédagogique simplifié : les intervalles sont réalistes mais le cœur est réduit à quelques sites. Concept inspiré du simulateur svtsim (S. Iravanian) ; code et scénarios originaux. Critères : Michaud GF et al., JACC 2001;38:1163-7 (PPI − TCL, SA − VA) ; Knight BP et al., JACC 1999;33:775-81 (V-A-A-V) ; Josephson ME, Clinical Cardiac Electrophysiology.</p>
    </details>`;

  const $ = s => app.querySelector(s);
  const canvas = $('#ecran');

  function nouveauCoeur() {
    const id = st.scenario;
    st.coeur = new Coeur(SCENARIOS[id].def(), { variation: st.mystere ? 0.05 : 0 });
    st.coeur.avancer(2500);
    st.t = 2500; st.fige = false; st.recul = 0; st.curseurs = null; st.salve = null; st.figerA = null; st.repondu = false;
    $('#figer').textContent = 'Figer'; $('#salve').textContent = 'Salve à S1';
    $('#recul-bloc').hidden = true; $('#recul').value = 0;
    $('#diagnostic').hidden = !st.mystere; $('#verdict').innerHTML = ''; $('#reponse').value = '';
    const sc = SCENARIOS[id];
    $('#explication-scenario').innerHTML = st.mystere
      ? '<h2>Cas mystère</h2><p class="note">Le mécanisme est caché et les paramètres varient légèrement d\'un cas à l\'autre. À vous de jouer.</p>'
      : `<h2>${esc(sc.nom)}</h2><p>${esc(sc.explication)}</p>`;
  }

  function choisir(v) {
    st.mystere = v === 'mystere';
    st.scenario = st.mystere ? melanger(MYSTERES)[0] : v;
    nouveauCoeur();
  }

  const reglages = () => {
    const n = id => Math.max(0, Math.round(+$(id).value || 0));
    Object.assign(r, { site: $('#site').value, detection: $('#detection').value, s1: Math.max(200, n('#s1')), n: Math.min(30, n('#n')), s2: n('#s2'), s3: n('#s3'), s4: n('#s4'),
      figerApres: $('#figer-apres').checked, fenetre: +$('#fenetre').value, etiquettes: $('#etiquettes').checked });
    ecrire(r);
    return r;
  };

  function reprendre() { st.fige = false; st.recul = 0; st.curseurs = null; $('#figer').textContent = 'Figer'; $('#recul-bloc').hidden = true; $('#recul').value = 0; }
  function figer() { st.fige = true; st.figerA = null; $('#figer').textContent = 'Reprendre'; $('#recul-bloc').hidden = false; }

  // programme S1…S4 à partir de tDebut (instant du premier stimulus)
  function programmer(tDebut) {
    const c = st.coeur, p = r;
    let t = tDebut;
    const liste = [];
    for (let i = 0; i < p.n; i++) { liste.push(t); if (i < p.n - 1) t += p.s1; }
    const extras = [p.s2, p.s3, p.s4].filter(Boolean);
    if (!p.n && extras.length) t -= extras[0]; // pas de S1 : S2 est couplé directement au temps de départ
    for (const e of extras) { t += e; liste.push(t); }
    liste.forEach(x => c.stimuler(p.site, x));
    if (p.figerApres && liste.length) st.figerA = liste.at(-1) + 1600;
  }

  function stimuler() {
    reglages();
    if (st.fige) reprendre();
    if (!r.n && !r.s2) { toastLocal('Réglez au moins un S1 ou un S2.'); return; }
    const c = st.coeur;
    if (r.detection) {
      // premier stimulus couplé à la prochaine activation détectée sur le site choisi
      const depuis = c.t;
      const ecoute = (site, t) => {
        if (site !== r.detection || t <= depuis) return;
        c.ecouteurs = c.ecouteurs.filter(f => f !== ecoute);
        programmer(t + (r.n ? r.s1 : r.s2));
      };
      c.ecouteurs.push(ecoute);
    } else programmer(c.t + 150);
  }

  function toastLocal(m) { $('#message').textContent = m; setTimeout(() => { if ($('#message')?.textContent === m) $('#message').textContent = ''; }, 3500); }

  // ---------- événements ----------
  $('#scenario').onchange = e => choisir(e.target.value);
  $('#stimuler').onclick = stimuler;
  $('#s2moins').onclick = () => {
    const s2 = +$('#s2').value || 0;
    $('#s2').value = s2 ? Math.max(150, s2 - 10) : 400;
    stimuler();
  };
  $('#salve').onclick = () => {
    reglages();
    if (st.salve) { st.coeur.tas.filtrer(e => !(e.type === 'stim' && e.t > st.coeur.t)); st.salve = null; $('#salve').textContent = 'Salve à S1'; return; }
    if (st.fige) reprendre();
    st.salve = { site: r.site, cl: r.s1, prochain: st.coeur.t + 100 };
    $('#salve').textContent = 'Arrêter la salve';
  };
  $('#figer').onclick = () => (st.fige ? reprendre() : figer());
  $('#adenosine').onclick = () => { st.coeur.injecterAdenosine(); if (st.fige) reprendre(); };
  $('#choc').onclick = () => { st.coeur.choc(); if (st.fige) reprendre(); };
  $('#reinit').onclick = () => nouveauCoeur();
  $('#ablater').onclick = () => {
    const cible = $('#cible').value;
    st.coeur.choc();
    const ok = st.coeur.ablater(cible).length > 0;
    toastLocal(ok ? 'Tir de radiofréquence délivré. Vérifiez la non-inductibilité.' : 'Tir délivré : pas de tissu arythmogène à cet endroit.');
    if (st.fige) reprendre();
  };
  for (const id of ['#site', '#detection', '#s1', '#n', '#s2', '#s3', '#s4', '#figer-apres', '#fenetre', '#etiquettes']) $(id).addEventListener('change', reglages);
  $('#recul').oninput = e => { st.recul = +e.target.value; $('#recul-val').textContent = st.recul ? `−${(st.recul / 1000).toFixed(1)} s` : ''; };
  $('#valider').onclick = () => {
    const rep = $('#reponse').value;
    if (!rep) return;
    const juste = rep === st.scenario, sc = SCENARIOS[st.scenario];
    st.repondu = true;
    $('#verdict').innerHTML = `<div class="retour ${juste ? 'ok' : 'ko'}"><h3>${juste ? 'Bon diagnostic !' : 'Ce n\'est pas ça.'}</h3>
      <p>Il s'agissait de : <b>${esc(sc.nom)}</b>.</p><p>${esc(sc.explication)}</p>
      <div class="actions serre gauche"><button class="btn btn-primaire" id="autre">Nouveau cas mystère</button></div></div>`;
    $('#autre').onclick = () => choisir('mystere');
  };

  // compas : cliquer fige, glisser mesure
  let geo = null, glisse = false;
  const temps = e => { const b = canvas.getBoundingClientRect(); return geo ? geo.t0 + (e.clientX - b.left - geo.marge) / geo.pxms : null; };
  canvas.addEventListener('pointerdown', e => {
    if (!st.fige) figer();
    const t = temps(e); if (t == null) return;
    st.curseurs = [t, null]; glisse = true; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => { if (glisse && st.curseurs) st.curseurs[1] = temps(e); });
  canvas.addEventListener('pointerup', () => { glisse = false; });

  // ---------- boucle d'animation ----------
  let dernier = performance.now();
  const etat = $('#etat'), zoneMesures = $('#mesures');
  function image(maintenant) {
    if (!canvas.isConnected) { arreterSimulateur(); return; }
    const dt = Math.min(100, maintenant - dernier); dernier = maintenant;
    const c = st.coeur;
    if (!st.fige) {
      const cible = st.t + dt;
      if (st.salve) while (st.salve.prochain < cible + 400) { c.stimuler(st.salve.site, st.salve.prochain); st.salve.prochain += st.salve.cl; }
      c.avancer(cible); st.t = cible;
      if (st.figerA && st.t >= st.figerA) figer();
    }
    geo = dessinerSimu(canvas, c, { tFin: st.t - st.recul, fenetre: r.fenetre, etiquettes: r.etiquettes, curseurs: st.curseurs });
    if (maintenant - st.dernierMaj > 250) {
      st.dernierMaj = maintenant;
      const m = mesures(c, st.t - st.recul), tach = tachycardie(c, st.t);
      const f = v => (v == null ? '—' : Math.round(v));
      zoneMesures.innerHTML = `<span>A-A <b>${f(m.cycleA)}</b></span><span>V-V <b>${f(m.cycleV)}</b></span><span>AH <b>${f(m.AH)}</b></span><span>HV <b>${f(m.HV)}</b></span><span>VA <b>${f(m.VA)}</b></span>`;
      const ad = c.adenosine && st.t < c.adenosine.fin + 500;
      const msg = [st.fige ? '⏸ Figé' : '', st.salve ? `Salve ${r.site.toUpperCase()} ${st.salve.cl} ms` : '', ad ? 'Adénosine' : '', tach.active ? `Tachycardie (${tach.cycleA != null && tach.cycleV != null && Math.abs(tach.cycleA - tach.cycleV) > 20 ? `A ${Math.round(tach.cycleA)} / V ${Math.round(tach.cycleV)}` : `cycle ${Math.round(tach.cycleV ?? tach.cycleA)}`} ms)` : ''].filter(Boolean).join(' · ');
      etat.textContent = msg;
    }
    boucle = requestAnimationFrame(image);
  }
  nouveauCoeur();
  boucle = requestAnimationFrame(image);
}
