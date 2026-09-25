// Simulateur d'électrophysiologie : baie d'enregistrement, stimulateur, médicaments, sonde d'ablation, cas mystères notés.
import { Coeur, SITES_ATRIAUX } from '../simu/moteur.js';
import { SCENARIOS, MYSTERES, SITES_STIM, SITES_DETECTION, POSITIONS } from '../simu/scenarios.js';
import { dessinerSimu, MONTAGES, VITESSES, fenetreMs, marges } from '../simu/trace.js';
import { mesures, tachycardie, analyserEntrainement, analyserESV } from '../simu/analyse.js';
import { esc, melanger } from '../util.js';

let boucle = null;
let choixInitial = null; // scénario choisi sur l'écran de choix (ou 'mystere')
export function preparerSimulateur(choix) { choixInitial = choix; }
export function arreterSimulateur() { if (boucle) cancelAnimationFrame(boucle); boucle = null; }

const REGLAGES = 'rythmo.simu';
const lire = () => { try { return JSON.parse(localStorage.getItem(REGLAGES)) || {}; } catch { return {}; } };
const ecrire = r => { try { localStorage.setItem(REGLAGES, JSON.stringify(r)); } catch { /* stockage indisponible */ } };

const MANOEUVRES = {
  extraA: 'Extrastimulus atrial (courbe AH, saut, période réfractaire nodale)',
  extraV: 'Extrastimulus ventriculaire (conduction rétrograde)',
  stimV: 'Stimulation ventriculaire (conduction rétrograde, séquence atriale)',
  salveA: 'Salve atriale rapide',
  induction: 'Induction de la tachycardie',
  esvHis: 'ESV His-réfractaire',
  entrainementV: 'Entraînement ventriculaire (V-A-V / V-A-A-V, PPI − TCL)',
  entrainementA: 'Entraînement atrial (PPI − TCL aux différents sites)',
  entrainementCicatrice: 'Entraînement depuis la cicatrice (PPI − TCL)',
  parahis: 'Stimulation para-hisienne',
  adenosine: 'Adénosine',
  iso: 'Isoprénaline',
  cartographie: 'Cartographie avec la sonde d\'ablation pendant la tachycardie',
};
const VENTRICULAIRES = new Set(['rva', 'parahis', 'tv2', 'lvl', 'vps', 'vbd']);

export function vueSimulateur(app) {
  arreterSimulateur();
  const r = { site: 'hra', sortie: 5, detection: '', s1: 600, n: 8, s2: 0, s3: 0, s4: 0, figerApres: true, decrement: false,
    rampeDebut: 400, rampeFin: 250, rampePas: 10, vitesse: 100, mode: 'balayage', montage: 'standard', bruit: true, etiquettes: true, ...lire() };
  if (!VITESSES.includes(r.vitesse)) r.vitesse = 100;
  if (!MONTAGES[r.montage]) r.montage = 'standard';
  if (!SITES_STIM.some(s => s.id === r.site)) r.site = 'hra';
  const st = { scenario: 'normal', mystere: false, coeur: null, t: 0, fige: false, recul: 0, curseurs: [], nouveauCompas: false, report: false, gains: {},
    salve: null, figerA: null, position: 'od-haute', actions: [], faites: new Set(), analyses: [], positionsTachy: new Set(), tachyAvant: false, dernierMaj: 0 };

  const opt = (liste, v) => liste.map(o => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(o.nom)}</option>`).join('');
  const champ = (id, lib, v, pas = 10, max = 2000) => `<label class="simu-champ"><span>${lib}</span><input type="number" id="${id}" value="${v}" min="0" max="${max}" step="${pas}" inputmode="decimal"></label>`;

  app.innerHTML = `
    <h1>Simulateur d'électrophysiologie</h1>
    <section class="carte simu-tete">
      <label class="simu-champ large"><span>Scénario</span>
        <select id="scenario">
          <option value="mystere">🎲 Cas mystère (diagnostic à trouver, démarche notée)</option>
          ${Object.entries(SCENARIOS).map(([id, s]) => `<option value="${id}" ${id === 'normal' ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}
        </select></label>
      <p class="simu-contexte" id="contexte"></p>
    </section>

    <section class="simu-baie">
      <div class="simu-barre">
        <label class="simu-mini">Vitesse <select id="vitesse">${VITESSES.map(v => `<option value="${v}" ${v === r.vitesse ? 'selected' : ''}>${String(v).replace('.', ',')} mm/s</option>`).join('')}</select></label>
        <label class="simu-mini">Affichage <select id="mode"><option value="balayage" ${r.mode === 'balayage' ? 'selected' : ''}>Balayage</option><option value="defilement" ${r.mode === 'defilement' ? 'selected' : ''}>Défilement</option></select></label>
        <label class="simu-mini">Montage <select id="montage">${Object.entries(MONTAGES).map(([id, m]) => `<option value="${id}" ${id === r.montage ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></label>
        <label class="simu-mini"><input type="checkbox" id="bruit" ${r.bruit ? 'checked' : ''}> Bruit</label>
        <label class="simu-mini"><input type="checkbox" id="etiquettes" ${r.etiquettes ? 'checked' : ''}> A-H-V</label>
        <div class="simu-mesures" id="mesures" aria-live="off"></div>
      </div>
      <div class="simu-ecran">
        <canvas id="ecran" role="img" aria-label="Baie d'électrophysiologie : dérivations de surface et électrogrammes endocavitaires"></canvas>
        <div class="simu-etat" id="etat"></div>
      </div>
      <div class="simu-revue" id="revue" hidden>
        <button class="btn" id="arriere" aria-label="Page précédente">◀</button>
        <input type="range" id="recul" min="0" max="40000" step="100" value="0" aria-label="Revenir en arrière">
        <button class="btn" id="avant" aria-label="Page suivante">▶</button>
        <span id="recul-val" class="note"></span>
        <button class="btn" id="compas-plus">+ compas</button>
        <button class="btn" id="compas-report">Report</button>
        <button class="btn" id="compas-effacer">Effacer</button>
      </div>
      <div class="actions serre gauche simu-outils">
        <button class="btn btn-primaire" id="stimuler">Stimuler</button>
        <button class="btn" id="s2moins" title="Raccourcir S2 de 10 ms puis stimuler">S2 − 10</button>
        <button class="btn" id="salve">Salve à S1</button>
        <button class="btn" id="figer">Figer</button>
        <button class="btn" id="adenosine">Adénosine</button>
        <button class="btn" id="iso" aria-pressed="false">Isoprénaline</button>
        <button class="btn" id="atropine">Atropine</button>
        <button class="btn" id="choc">Choc</button>
      </div>
      <p class="note simu-aide-compas">Touchez le tracé pour le figer (relecture), puis faites glisser pour mesurer. Touchez le nom d'une voie pour changer son gain.</p>
      <div class="simu-message" id="message" role="status"></div>
    </section>

    <section class="carte simu-commandes">
      <fieldset><legend>Stimulateur</legend>
        <div class="simu-ligne">
          <label class="simu-champ"><span>Site</span><select id="site">${opt(SITES_STIM, r.site)}</select></label>
          ${champ('sortie', 'Sortie (mA)', r.sortie, 0.5, 20)}
          <label class="simu-champ"><span>Couplé à la détection</span><select id="detection">${opt(SITES_DETECTION, r.detection)}</select></label>
        </div>
        <div class="simu-ligne">
          ${champ('s1', 'S1 (ms)', r.s1)}${champ('n', 'Nb S1', r.n, 1, 30)}${champ('s2', 'S2', r.s2)}${champ('s3', 'S3', r.s3)}${champ('s4', 'S4', r.s4)}
        </div>
        <label class="simu-case"><input type="checkbox" id="figer-apres" ${r.figerApres ? 'checked' : ''}> Figer le tracé après le train</label>
        <label class="simu-case"><input type="checkbox" id="decrement" ${r.decrement ? 'checked' : ''}> Décrément automatique : S2 − 10 ms après chaque train</label>
        <div class="simu-ligne">
          ${champ('rampe-debut', 'Rampe : de', r.rampeDebut)}${champ('rampe-fin', 'à', r.rampeFin)}${champ('rampe-pas', 'pas', r.rampePas, 5, 50)}
          <button class="btn" id="rampe">Rampe</button>
        </div>
      </fieldset>
      <fieldset><legend>Sonde d'ablation</legend>
        <div class="simu-ligne">
          <label class="simu-champ large"><span>Position</span><select id="position">${opt(POSITIONS, st.position)}</select></label>
        </div>
        <p class="note">Les électrogrammes de la sonde (ABL d, ABL uni) s'affichent avec le montage « Ablation ». Stimulez depuis la sonde avec le site « Sonde d'ablation ».</p>
        <div class="actions serre gauche">
          <button class="btn btn-danger" id="ablater">Radiofréquence</button>
          <button class="btn" id="reinit">Recommencer le cas</button>
        </div>
      </fieldset>
      <fieldset class="simu-journal-bloc"><legend>Journal</legend><ol class="simu-journal" id="journal"></ol></fieldset>
    </section>

    <section class="carte" id="diagnostic" hidden>
      <h2>Votre diagnostic</h2>
      <p class="note">Stimulez, induisez, faites vos manœuvres, traitez si besoin, puis concluez. Votre démarche est notée.</p>
      <div class="simu-ligne"><label class="simu-champ large"><span>Diagnostic</span><select id="reponse">
        <option value="">— Choisir —</option>${MYSTERES.map(id => `<option value="${id}">${esc(SCENARIOS[id].court)}</option>`).join('')}</select></label>
        <button class="btn btn-primaire" id="valider">Valider</button></div>
      <div id="verdict"></div>
    </section>

    <section class="carte" id="explication-scenario"></section>

    <details class="carte simu-guide">
      <summary><b>Mode d'emploi et manœuvres clés</b></summary>
      <ul>
        <li><b>Baie</b> : vitesse en mm/s comme sur une baie (25 mm/s pour une vue d'ensemble, 100 à 200 mm/s pour mesurer). Balayage : le tracé s'écrit de gauche à droite et efface l'ancien derrière une barre ; défilement : le tracé glisse vers la gauche. Figez pour relire (jusqu'à 40 s en arrière) et poser jusqu'à trois compas ; « Report » reporte le dernier intervalle.</li>
        <li><b>Montages</b> : standard (D1, D2, V1, OD haute, His proximal et distal, SC décapolaire, VD), flutter (Halo autour de l'anneau tricuspide), ablation (électrogrammes bipolaire distal et unipolaire de la sonde), complet.</li>
        <li><b>Extrastimulus</b> : train de S1 (ex. 8 × 600 ms) puis S2, S3, S4 (0 = désactivé). Diminuez S2 par pas de 10 ms (bouton « S2 − 10 » ou décrément automatique). Saut de l'AH ≥ 50 ms pour 10 ms de raccourcissement du couplage = double voie nodale. Période réfractaire effective : du tissu stimulé quand S2 ne capture plus ; du nœud AV quand S2 capture mais n'est plus suivi d'un H. Un retard droit sur S2 court = aberration fonctionnelle.</li>
        <li><b>Rampe et salve</b> : rampe atriale jusqu'au point de Wenckebach (allongement progressif de l'AH puis bloc) ; salve continue au cycle S1 ; après une salve de 30 s, mesurez le temps de récupération sinusale (TRS &lt; 1500 ms, TRS corrigé &lt; 525 ms).</li>
        <li><b>Isoprénaline</b> : accélère le sinus, améliore la conduction nodale et facilite l'induction ; certaines tachycardies ne s'induisent que sous isoprénaline. <b>Adénosine</b> : bloc AV transitoire (dans le simulateur, 1,5 s après le clic ; en clinique, 10 à 20 s après un bolus IV rapide rincé).</li>
        <li><b>Pendant la tachycardie</b> : mesurez le VA sur le His et regardez l'activation atriale la plus précoce (His, SC proximal, SC distal, Halo).</li>
        <li><b>ESV His-réfractaire</b> : site VD, détection sur le His, Nb S1 = 0, S2 = cycle de la tachycardie − 30 ms : le stimulus tombe juste avant le His attendu, quand le His ne peut plus être atteint par voie rétrograde. Si l'atrium suivant est avancé avec la même séquence, il existe une voie accessoire ; elle participe au circuit si l'ESV retarde l'atrium ou arrête la tachycardie sans l'atteindre. Une absence d'avance n'exclut pas une voie latérale gauche, éloignée du VD.</li>
        <li><b>Entraînement ventriculaire</b> : salve VD à un cycle 10 à 40 ms plus court que la tachycardie, vérifiez que l'atrium suit, arrêtez. Réponse <b>V-A-V</b> (réentrée utilisant le nœud AV ou une voie accessoire) ou <b>V-A-A-V</b> (tachycardie atriale). PPI − TCL sur l'électrogramme VD : &gt; 115 ms (et SA − VA &gt; 85 ms) en faveur d'une réentrée intranodale, &lt; 115 ms d'une voie accessoire (critère validé pour les voies septales). Piège : pseudo-V-A-A-V quand le VA est long ; raisonnez sur le dernier A entraîné.</li>
        <li><b>Stimulation para-hisienne</b> : site para-hisien, en rythme sinusal, alternez une sortie haute (15 mA : capture du His et du myocarde) et basse (5 mA : myocarde seul). Si l'intervalle stimulus-A s'allonge à la perte de capture du His, la conduction rétrograde est nodale ; s'il ne change pas au site de sortie (ostium du SC par exemple), elle est extranodale (voie accessoire septale).</li>
        <li><b>Flutter et macroréentrées</b> : entraînez depuis l'isthme, le SC proximal et distal, et comparez les PPI − TCL mesurés sur l'électrogramme du site de stimulation (&lt; 20-30 ms = site dans le circuit). Après ablation de l'isthme, vérifiez le bloc dans les deux sens (stimulation de l'ostium du SC puis de l'isthme latéral).</li>
        <li><b>Sonde d'ablation</b> : placez-la, regardez l'électrogramme local pendant la tachycardie (précocité, QS en unipolaire au site de sortie), stimulez depuis la sonde, puis tirez. L'ablation de la région antéro-septale expose au bloc AV complet.</li>
      </ul>
      <p class="note">Modèle pédagogique simplifié : les intervalles sont réalistes mais le cœur est réduit à une trentaine de sites. Concept inspiré du simulateur svtsim (S. Iravanian) ; code et scénarios originaux. Critères : Michaud GF et al., JACC 2001;38:1163-7 (PPI − TCL, SA − VA) ; Knight BP et al., JACC 1999;33:775-81 (V-A-A-V) ; Hirao K et al., Circulation 1996;94:1027-35 (stimulation para-hisienne) ; Josephson ME, Clinical Cardiac Electrophysiology.</p>
    </details>`;

  const $ = s => app.querySelector(s);
  const canvas = $('#ecran');

  // ---------- journal et manœuvres ----------
  const hms = t => `${(t / 1000).toFixed(1)} s`;
  function majJournal() {
    for (const e of st.coeur.evenements) if (!e.vu) { e.vu = true; st.actions.push({ t: e.t, texte: e.texte }); }
    st.actions.sort((a, b) => a.t - b.t);
    if (st.actions.length > 60) st.actions = st.actions.slice(-60);
    $('#journal').innerHTML = st.actions.slice(-12).reverse().map(a => `<li><span class="note">${hms(a.t)}</span> ${esc(a.texte)}</li>`).join('');
  }
  function noter(type, texte) {
    if (type) st.faites.add(type);
    if (texte) st.actions.push({ t: st.t, texte });
    majJournal();
  }

  function nouveauCoeur() {
    const sc = SCENARIOS[st.scenario];
    st.coeur = new Coeur(sc.def(), { variation: st.mystere ? Math.min(0.05, sc.variation ?? 1) : 0 });
    st.coeur.avancer(2500);
    Object.assign(st, { t: 2500, fige: false, recul: 0, curseurs: [], salve: null, figerA: null, actions: [], faites: new Set(), analyses: [], positionsTachy: new Set(), tachyAvant: false });
    $('#figer').textContent = 'Figer'; $('#salve').textContent = 'Salve à S1';
    $('#iso').setAttribute('aria-pressed', 'false'); $('#iso').classList.remove('actif');
    $('#revue').hidden = true; $('#recul').value = 0;
    $('#diagnostic').hidden = !st.mystere; $('#verdict').innerHTML = ''; $('#reponse').value = '';
    $('#contexte').innerHTML = sc.contexte ? `<b>Contexte :</b> ${esc(sc.contexte)}` : '';
    $('#explication-scenario').innerHTML = st.mystere
      ? '<h2>Cas mystère</h2><p class="note">Le mécanisme est caché et les paramètres varient légèrement d\'un cas à l\'autre. Faites les manœuvres utiles, traitez si besoin, puis concluez.</p>'
      : `<h2>${esc(sc.nom)}</h2><p>${esc(sc.explication)}</p>`;
    noter(null, st.mystere ? 'Nouveau cas mystère' : `Scénario : ${sc.nom}`);
  }
  function choisir(v) {
    st.mystere = v === 'mystere';
    st.scenario = st.mystere ? melanger(MYSTERES)[0] : v;
    nouveauCoeur();
  }

  const reglages = () => {
    const n = (id, min = 0) => Math.max(min, +$(id).value || 0);
    Object.assign(r, { site: $('#site').value, sortie: n('#sortie'), detection: $('#detection').value, s1: Math.max(200, n('#s1')), n: Math.min(30, Math.round(n('#n'))),
      s2: Math.round(n('#s2')), s3: Math.round(n('#s3')), s4: Math.round(n('#s4')), figerApres: $('#figer-apres').checked, decrement: $('#decrement').checked,
      rampeDebut: n('#rampe-debut', 150), rampeFin: n('#rampe-fin', 150), rampePas: n('#rampe-pas', 1),
      vitesse: +$('#vitesse').value, mode: $('#mode').value, montage: $('#montage').value, bruit: $('#bruit').checked, etiquettes: $('#etiquettes').checked });
    ecrire(r);
    return r;
  };
  const siteReel = () => (r.site === 'abl' ? POSITIONS.find(p => p.id === st.position).stim : r.site);
  const nomSite = () => `${SITES_STIM.find(s => s.id === r.site).nom}${r.site === 'abl' ? ` (${POSITIONS.find(p => p.id === st.position).nom})` : ''}`;

  function reprendre() { st.fige = false; st.recul = 0; $('#figer').textContent = 'Figer'; $('#revue').hidden = true; $('#recul').value = 0; $('#recul-val').textContent = ''; }
  function figer() { st.fige = true; st.figerA = null; $('#figer').textContent = 'Reprendre'; $('#revue').hidden = false; }
  function message(m) { $('#message').textContent = m; setTimeout(() => { if ($('#message')?.textContent === m) $('#message').textContent = ''; }, 4000); }

  // classement de la manœuvre lancée, pour le journal et la notation
  function classer(site, { salve = false, detection = '', n = 0, s2 = 0 } = {}) {
    const tach = tachycardie(st.coeur).active, v = VENTRICULAIRES.has(site), atrial = SITES_ATRIAUX.includes(site);
    if (site === 'parahis') return 'parahis';
    if (tach && detection === 'his' && v && !n) return 'esvHis';
    if (tach && salve) return site === 'tv2' ? 'entrainementCicatrice' : v ? 'entrainementV' : 'entrainementA';
    if (salve) return atrial ? 'salveA' : 'stimV';
    if (s2) return v ? 'extraV' : 'extraA';
    return v ? 'stimV' : null;
  }

  function programmer(tDebut, site) {
    const c = st.coeur, p = r;
    let t = tDebut;
    const liste = [];
    for (let i = 0; i < p.n; i++) { liste.push(t); if (i < p.n - 1) t += p.s1; }
    const extras = [p.s2, p.s3, p.s4].filter(Boolean);
    if (!p.n && extras.length) t -= extras[0];
    for (const e of extras) { t += e; liste.push(t); }
    liste.forEach(x => c.stimuler(site, x, p.sortie));
    if (p.figerApres && liste.length) st.figerA = liste.at(-1) + 1600;
    return liste;
  }

  function stimuler() {
    reglages();
    if (st.fige) reprendre();
    if (!r.n && !r.s2) { message('Réglez au moins un S1 ou un S2.'); return; }
    const c = st.coeur, site = siteReel();
    const type = classer(site, { detection: r.detection, n: r.n, s2: r.s2 });
    const tcl = tachycardie(c).cycleV;
    const lancer = t0 => {
      const liste = programmer(t0, site);
      if (type === 'esvHis' && liste.length) {
        const te = liste.at(-1);
        setTimeout(() => {
          const av = analyserESV(c, te, tcl);
          if (av != null) st.analyses.push(`ESV His-réfractaire : ${av > 5 ? `atrium avancé de ${av} ms` : av < -5 ? `atrium retardé de ${-av} ms` : 'atrium inchangé'}${tachycardie(c).active ? '' : ', tachycardie arrêtée'}`);
        }, 3500);
      }
    };
    noter(type, `${nomSite()} : ${r.n ? `${r.n} × S1 ${r.s1}` : ''}${[r.s2, r.s3, r.s4].filter(Boolean).map((x, i) => ` S${i + 2} ${x}`).join('')} ms, ${r.sortie} mA${r.detection ? `, couplé au ${SITES_DETECTION.find(d => d.id === r.detection).nom}` : ''}`);
    if (r.detection) {
      const depuis = c.t;
      const ecoute = (s, t) => {
        if (s !== r.detection || t <= depuis) return;
        c.ecouteurs = c.ecouteurs.filter(f => f !== ecoute);
        lancer(t + (r.n ? r.s1 : r.s2));
      };
      c.ecouteurs.push(ecoute);
    } else lancer(c.t + 150);
    if (r.decrement && r.s2) { $('#s2').value = Math.max(150, r.s2 - 10); reglages(); }
  }

  function arreterSalve() {
    const s = st.salve; if (!s) return;
    const c = st.coeur;
    c.annulerStims(c.t);
    const der = c.stims.filter(x => x.s === s.site).at(-1)?.t;
    st.salve = null; $('#salve').textContent = 'Salve à S1';
    noter(null, 'Arrêt de la salve');
    if (s.tachy && der != null) {
      setTimeout(() => {
        const a = analyserEntrainement(c, { der, site: s.site, tcl: s.tcl, ventriculaire: VENTRICULAIRES.has(s.site) });
        st.analyses.push(`Entraînement depuis ${s.nom} à ${s.cl} ms (TCL ${Math.round(s.tcl)}) : ${tachycardie(c).active ? '' : 'tachycardie arrêtée ; '}${a.reponse ? `réponse ${a.reponse}, ` : ''}PPI ${a.ppi ?? '—'} ms, PPI − TCL ${a.pptcl ?? '—'} ms`);
      }, 3200);
    }
  }

  // ---------- événements ----------
  $('#scenario').onchange = e => choisir(e.target.value);
  $('#stimuler').onclick = stimuler;
  $('#s2moins').onclick = () => { const s2 = +$('#s2').value || 0; $('#s2').value = s2 ? Math.max(150, s2 - 10) : 400; stimuler(); };
  $('#salve').onclick = () => {
    reglages();
    if (st.salve) { arreterSalve(); return; }
    if (st.fige) reprendre();
    const site = siteReel(), t = tachycardie(st.coeur);
    st.salve = { site, cl: r.s1, prochain: st.coeur.t + 100, sortie: r.sortie, tachy: t.active, tcl: VENTRICULAIRES.has(site) ? t.cycleV : (t.cycleA ?? t.cycleV), nom: nomSite() };
    noter(classer(site, { salve: true }), `Salve : ${st.salve.nom} à ${r.s1} ms, ${r.sortie} mA`);
    $('#salve').textContent = 'Arrêter la salve';
  };
  $('#rampe').onclick = () => {
    reglages(); if (st.fige) reprendre();
    const site = siteReel(), c = st.coeur;
    let t = c.t + 150, n = 0;
    for (let cl = r.rampeDebut; cl >= r.rampeFin && n < 200; cl -= r.rampePas) for (let k = 0; k < 4; k++, n++) { c.stimuler(site, t, r.sortie); t += cl; }
    if (r.figerApres) st.figerA = t + 1200;
    noter(VENTRICULAIRES.has(site) ? 'stimV' : 'extraA', `Rampe ${r.rampeDebut} → ${r.rampeFin} ms (pas ${r.rampePas} ms, 4 stimulus par palier)`);
  };
  $('#figer').onclick = () => (st.fige ? reprendre() : figer());
  $('#adenosine').onclick = () => { st.coeur.injecterAdenosine(); noter('adenosine'); if (st.fige) reprendre(); };
  $('#iso').onclick = () => {
    const on = st.coeur.basculerMedicament('iso');
    $('#iso').setAttribute('aria-pressed', String(on)); $('#iso').classList.toggle('actif', on);
    noter(on ? 'iso' : null); if (st.fige) reprendre();
  };
  $('#atropine').onclick = () => { st.coeur.basculerMedicament('atropine'); noter(null); if (st.fige) reprendre(); };
  $('#choc').onclick = () => { st.coeur.choc(); noter(null); if (st.fige) reprendre(); };
  $('#reinit').onclick = () => nouveauCoeur();
  $('#position').onchange = e => {
    st.position = e.target.value;
    if (tachycardie(st.coeur).active) { st.positionsTachy.add(st.position); if (st.positionsTachy.size >= 2) st.faites.add('cartographie'); }
    noter(null, `Sonde d'ablation : ${POSITIONS.find(p => p.id === st.position).nom}`);
  };
  $('#ablater').onclick = () => {
    const pos = POSITIONS.find(p => p.id === st.position);
    const touchees = st.coeur.ablater(pos.cibles);
    noter(null, `Radiofréquence : ${pos.nom}`);
    message(touchees.includes('nav') || touchees.includes('rapide') ? 'Attention : allongement de l\'AH… vérifiez la conduction AV.' : 'Tir de radiofréquence délivré. Vérifiez l\'effet et la non-inductibilité.');
    if (st.fige) reprendre();
  };
  for (const id of ['#site', '#sortie', '#detection', '#s1', '#n', '#s2', '#s3', '#s4', '#figer-apres', '#decrement', '#rampe-debut', '#rampe-fin', '#rampe-pas', '#vitesse', '#mode', '#montage', '#bruit', '#etiquettes']) $(id).addEventListener('change', reglages);
  const majRecul = () => { $('#recul').value = st.recul; $('#recul-val').textContent = st.recul ? `−${(st.recul / 1000).toFixed(1)} s` : ''; };
  $('#recul').oninput = e => { st.recul = +e.target.value; majRecul(); };
  const page = sens => { const f = fenetreMs(canvas.clientWidth, r.vitesse) * 0.8; st.recul = Math.max(0, Math.min(40000, st.recul - sens * f)); majRecul(); };
  $('#arriere').onclick = () => page(-1);
  $('#avant').onclick = () => page(1);
  $('#compas-plus').onclick = () => { st.nouveauCompas = true; message('Faites glisser sur le tracé pour poser le nouveau compas.'); };
  $('#compas-report').onclick = () => { st.report = !st.report; $('#compas-report').classList.toggle('actif', st.report); };
  $('#compas-effacer').onclick = () => { st.curseurs = []; };

  // ---------- notation d'un cas mystère ----------
  $('#valider').onclick = () => {
    const rep = $('#reponse').value;
    if (!rep) return;
    const sc = SCENARIOS[st.scenario], juste = rep === st.scenario;
    const cles = sc.manoeuvres || [], faites = cles.filter(m => st.faites.has(m));
    const cible = sc.cible ? [].concat(sc.cible) : [];
    const tire = st.actions.some(a => a.texte.startsWith('Radiofréquence'));
    const ablOk = !cible.length || st.coeur.voies.some(v => v.coupee && cible.includes(v.id)) || cible.some(c => st.coeur.sites[c]?.supprime) || (sc.ablationOptionnelle && !tire);
    const blocAV = st.coeur.voies.some(v => v.coupee && (v.id === 'nav' || v.id === 'rapide')) && !cible.includes('rapide');
    const ablInutile = !cible.length && tire;
    const note = Math.round(((juste ? 5 : 0) + (cles.length ? 3 * faites.length / cles.length : 3) + (ablOk && !blocAV && !ablInutile ? 2 : 0)) * 10) / 10;
    const posNom = sc.position ? POSITIONS.find(p => p.id === sc.position)?.nom : '';
    $('#verdict').innerHTML = `<div class="retour ${juste ? 'ok' : 'ko'}"><h3>${juste ? 'Bon diagnostic !' : 'Ce n\'est pas ça.'} Note : ${note} / 10</h3>
      <p>Il s'agissait de : <b>${esc(sc.nom)}</b>.</p><p>${esc(sc.explication)}</p>
      <h4>Manœuvres clés pour ce diagnostic</h4>
      <ul class="simu-check">${cles.map(m => `<li class="${st.faites.has(m) ? 'fait' : 'manque'}">${st.faites.has(m) ? '✓' : '✗'} ${esc(MANOEUVRES[m])}</li>`).join('') || '<li>—</li>'}</ul>
      ${st.analyses.length ? `<h4>Vos mesures</h4><ul>${st.analyses.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <h4>Traitement</h4><p>${st.scenario === 'fa' ? (ablInutile ? '✗ Tir sans cible modélisée.' : '✓ Isolation des veines pulmonaires indiquée (non modélisée ici).') : cible.length ? (sc.ablationOptionnelle && !tire ? `✓ Abstention ou traitement médical acceptables ; si ablation : ${esc(posNom)}.` : ablOk ? `✓ Substrat détruit (${esc(posNom)}).` : `✗ Substrat non traité ; cible attendue : ${esc(posNom)}.`) : ablInutile ? '✗ Tir de radiofréquence sans cible arythmogène.' : '✓ Pas d\'ablation nécessaire.'}${blocAV ? ' <b>✗ Bloc AV iatrogène.</b>' : ''}</p>
      <div class="actions serre gauche"><button class="btn btn-primaire" id="autre">Nouveau cas mystère</button></div></div>`;
    $('#autre').onclick = () => choisir('mystere');
  };

  // ---------- compas et gains (pointeur sur le tracé) ----------
  let geo = null, glisse = false;
  const temps = e => { const b = canvas.getBoundingClientRect(); return geo?.t0 != null ? geo.t0 + (e.clientX - b.left - geo.marge) / geo.pxms : null; };
  canvas.addEventListener('pointerdown', e => {
    const b = canvas.getBoundingClientRect();
    if (e.clientX - b.left < marges(canvas.clientWidth)) { // nom d'une voie : gain ×1 → ×2 → ×4 → ×0,5
      const y = e.clientY - b.top, rangee = (geo?.rangees || []).find(x => y >= x.y0 && y < x.y1);
      if (rangee) { const cycle = [1, 2, 4, 0.5], g0 = st.gains[rangee.id] || 1; st.gains[rangee.id] = cycle[(cycle.indexOf(g0) + 1) % cycle.length]; }
      return;
    }
    if (!st.fige) { figer(); return; }
    const t = temps(e); if (t == null) return;
    if (st.nouveauCompas || !st.curseurs.length) { st.curseurs.push([t, null]); if (st.curseurs.length > 3) st.curseurs.shift(); st.nouveauCompas = false; }
    else st.curseurs[st.curseurs.length - 1] = [t, null];
    glisse = true; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => { if (glisse && st.curseurs.length) st.curseurs.at(-1)[1] = temps(e); });
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
      if (st.salve) while (st.salve.prochain < cible + 400) { c.stimuler(st.salve.site, st.salve.prochain, st.salve.sortie); st.salve.prochain += st.salve.cl; }
      c.avancer(cible); st.t = cible;
      if (st.figerA && st.t >= st.figerA) figer();
    }
    const pos = POSITIONS.find(p => p.id === st.position);
    geo = dessinerSimu(canvas, c, { tFin: st.t - st.recul, vitesse: r.vitesse, mode: st.fige ? 'defilement' : r.mode, voies: MONTAGES[r.montage].voies, gains: st.gains,
      etiquettes: r.etiquettes, curseurs: st.fige ? st.curseurs : [], report: st.report, bruit: r.bruit, ablation: pos ? { a: pos.a, v: pos.v } : null });
    if (maintenant - st.dernierMaj > 250) {
      st.dernierMaj = maintenant;
      const m = mesures(c, st.t - st.recul), tach = tachycardie(c, st.t);
      if (tach.active && !st.tachyAvant) noter('induction', `Tachycardie (A ${Math.round(tach.cycleA ?? 0)} / V ${Math.round(tach.cycleV ?? 0)} ms)`);
      st.tachyAvant = tach.active;
      if (c.evenements.some(e => !e.vu)) majJournal();
      const f = v => (v == null ? '—' : Math.round(v));
      zoneMesures.innerHTML = `<span>A-A <b>${f(m.cycleA)}</b></span><span>V-V <b>${f(m.cycleV)}</b></span><span>AH <b>${f(m.AH)}</b></span><span>HV <b>${f(m.HV)}</b></span><span>VA <b>${f(m.VA)}</b></span>`;
      const ad = c.adenosine && st.t < c.adenosine.fin + 500, iso = c.niveau('iso', st.t);
      etat.textContent = [st.fige ? '⏸ Relecture' : '', st.salve ? `Salve ${st.salve.cl} ms` : '', ad ? 'Adénosine' : '', iso > 0.05 ? `Isoprénaline ${Math.round(iso * 100)} %` : '', c.fa ? 'FA' : '',
        tach.active ? `Tachycardie (${tach.cycleA != null && tach.cycleV != null && Math.abs(tach.cycleA - tach.cycleV) > 20 ? `A ${Math.round(tach.cycleA)} / V ${Math.round(tach.cycleV)}` : `cycle ${Math.round(tach.cycleV ?? tach.cycleA)}`} ms)` : ''].filter(Boolean).join(' · ');
    }
    boucle = requestAnimationFrame(image);
  }
  const initial = choixInitial; choixInitial = null;
  if (initial) { $('#scenario').value = initial; choisir(initial); } else nouveauCoeur();
  boucle = requestAnimationFrame(image);
}
