// Simulateur d'électrophysiologie : baie (temps réel et écran de rappel), console de stimulation toujours à portée du pouce,
// protocoles automatiques, sonde d'ablation avec générateur de radiofréquence et cartographie, constantes du patient,
// cas mystères notés et compte rendu d'exploration.
import { Coeur, SITES_ATRIAUX, seuilCapture } from '../simu/moteur.js';
import { SCENARIOS, MYSTERES, SITES_STIM, SITES_DETECTION, POSITIONS } from '../simu/scenarios.js';
import { dessinerSimu, MONTAGES, VITESSES, CANAUX, fenetreMs, marges, evenementsCanal } from '../simu/trace.js';
import { mesures, tachycardie, analyserEntrainement, analyserESV, reponseStim, recuperationSinusale, constantes, tempsLocal,
  activations, battementsV, sitePlusPrecoce } from '../simu/analyse.js';
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
// noms courts des sites pour les pastilles de la console
const COURTS = { hra: 'OD haute', latb: 'OD lat.', cti: 'Isthme', cs9: 'SC prox.', cs1: 'SC dist.', parahis: 'Para-His', rva: 'VD apex', abl: 'Sonde abl.' };
const COURTS_DETECTION = { '': 'Aucune', hra: 'OD haute', his: 'His', rva: 'VD' };
// carte schématique en vue OAG (anneau tricuspide à gauche, mitral à droite, septum au milieu) : coordonnées des positions
const CARTE = { 'od-haute': [54, 24], 'od-lat': [34, 104], isthme: [92, 168], koch: [126, 134], ostium: [158, 160], his: [152, 56],
  'cryo-his': [126, 76], 'mitral-lat': [266, 104], 'og-lat': [238, 160], 'vd-apex': [40, 190], 'vg-cicatrice': [268, 192] };
const COURTS_POS = { 'od-haute': 'ODh', 'od-lat': 'AT lat', isthme: 'ICT', koch: 'Koch', ostium: 'Ost SC', his: 'His', 'cryo-his': 'Cryo', 'mitral-lat': 'AM lat',
  'og-lat': 'OG inf', 'vd-apex': 'VD', 'vg-cicatrice': 'Cicat.' };
const MEDIA_COMPACT = '(orientation: landscape) and (max-height: 520px)';
// voies regroupées par cathéter pour le choix des dérivations affichées
const GROUPES_VOIES = [['Surface', ['I', 'II', 'aVF', 'V1', 'V6']], ['OD', ['hra']], ['Halo', ['h78', 'h56', 'h34', 'h12']], ['His', ['hisp', 'hisd']],
  ['Sinus coronaire', ['cs9', 'cs7', 'cs5', 'cs3', 'cs1']], ['VD', ['rva']], ['Sonde', ['abld', 'ablu']], ['Constantes', ['pa']]];

export function vueSimulateur(app) {
  arreterSimulateur();
  const sauve = lire();
  if (sauve.v !== 2) { delete sauve.mode; delete sauve.figerApres; } // le balayage devient l'affichage standard
  // téléphone : montage réduit par défaut pour que le tracé tienne à l'écran avec la console
  const telephone = matchMedia('(max-width: 699px), (max-height: 520px)').matches;
  const r = { v: 2, site: 'hra', sortie: 5, largeur: 2, detection: '', s1: 600, n: 8, s2: 400, s3: 0, s4: 0, extras: false, rappelApres: true, decrement: false,
    salveCl: 400, rampeDebut: 500, rampeFin: 250, rampePas: 10, vitesse: 100, vitesseRappel: 100, mode: 'balayage', montage: telephone ? 'compact' : 'standard',
    bruit: true, etiquettes: true, filtre50: true, passeHaut: true, aimant: true, puissance: 30, dureeRF: 60, onglet: 'prog', ...sauve };
  if (!VITESSES.includes(r.vitesse)) r.vitesse = 100;
  if (!VITESSES.includes(r.vitesseRappel)) r.vitesseRappel = 100;
  if (!MONTAGES[r.montage] && r.montage !== 'perso') r.montage = 'standard';
  // voies affichées : celles du montage, modifiables une à une (montage « Personnalisé »)
  if (Array.isArray(r.voies)) r.voies = r.voies.filter(id => CANAUX.some(c => c.id === id));
  if (!r.voies?.length) r.voies = [...(MONTAGES[r.montage] ?? MONTAGES.standard).voies];
  if (!SITES_STIM.some(s => s.id === r.site)) r.site = 'hra';
  if (!SITES_DETECTION.some(s => s.id === r.detection)) r.detection = '';
  // rappel : entrée du journal affichée sur l'écran de rappel (instantané du tracé), avec sa relecture et ses compas
  const st = { scenario: 'normal', mystere: false, coeur: null, t: 0, gains: {}, salve: null, position: 'od-haute', actions: [], faites: new Set(), analyses: [],
    positionsTachy: new Set(), tachyAvant: false, dernierMaj: 0, numero: 0,
    rappel: null, recul: 0, curseurs: [], nouveauCompas: false, report: false, demande: null, sale: true, reference: null,
    proto: null, rf: null, carte: {}, cr: null, vue: 'direct', hypo: 0, bump: null };

  const opt = (liste, v) => liste.map(o => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(o.nom)}</option>`).join('');
  // sélecteur numérique à boutons ± (appui long : défilement rapide) ; la saisie au clavier reste possible
  const pas = (id, lib, v, step, min, max) => `<div class="simu-pas"><span class="simu-pas-lib">${lib}</span><div class="simu-pas-ctl">
    <button type="button" class="btn-pas" data-cible="${id}" data-delta="-${step}" aria-label="${lib} : moins ${String(step).replace('.', ',')}">−</button>
    <input id="${id}" type="number" value="${v}" min="${min}" max="${max}" step="${step}" inputmode="decimal" aria-label="${lib}">
    <button type="button" class="btn-pas" data-cible="${id}" data-delta="${step}" aria-label="${lib} : plus ${String(step).replace('.', ',')}">+</button></div></div>`;
  const puces = (id, liste, v, noms, lib) => `<div class="simu-puces" id="${id}" role="radiogroup" aria-label="${lib}">${liste.map(o =>
    `<button type="button" role="radio" aria-checked="${o.id === v}" data-v="${o.id}" title="${esc(o.nom)}">${esc(noms[o.id] ?? o.nom)}</button>`).join('')}</div>`;
  const onglet = (id, lib) => `<button type="button" role="tab" id="tab-${id}" data-onglet="${id}" aria-controls="pan-${id}" aria-selected="${r.onglet === id}">${lib}</button>`;
  const panneau = (id, html) => `<div class="simu-pan" role="tabpanel" id="pan-${id}" aria-labelledby="tab-${id}" ${r.onglet === id ? '' : 'hidden'}>${html}</div>`;
  const vitesses = (id, v) => `<select id="${id}">${VITESSES.map(x => `<option value="${x}" ${x === v ? 'selected' : ''}>${String(x).replace('.', ',')} mm/s</option>`).join('')}</select>`;
  const case_ = (id, lib, v) => `<label class="simu-mini"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${lib}</label>`;

  app.innerHTML = `
    <h1 class="simu-h1">Simulateur d'électrophysiologie</h1>
    <section class="carte simu-tete">
      <label class="simu-champ large"><span>Scénario</span>
        <select id="scenario">
          <option value="mystere">🎲 Cas mystère (diagnostic à trouver, démarche notée)</option>
          ${Object.entries(SCENARIOS).map(([id, s]) => `<option value="${id}" ${id === 'normal' ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}
        </select></label>
      <p class="simu-contexte" id="contexte"></p>
    </section>

    <div class="simu-poste">
    <section class="simu-baie" data-vue="direct">
      <div class="simu-barre">
        <label class="simu-mini">Vitesse ${vitesses('vitesse', r.vitesse)}</label>
        <label class="simu-mini">Affichage <select id="mode"><option value="balayage" ${r.mode === 'balayage' ? 'selected' : ''}>Balayage (standard)</option><option value="defilement" ${r.mode === 'defilement' ? 'selected' : ''}>Défilement</option></select></label>
        <label class="simu-mini">Montage <select id="montage">${Object.entries(MONTAGES).map(([id, m]) => `<option value="${id}" ${id === r.montage ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}
          <option value="perso" ${r.montage === 'perso' ? 'selected' : ''}>Personnalisé</option></select></label>
        <details class="simu-filtres"><summary>Réglages</summary><div>
          ${case_('bruit', 'Bruit', r.bruit)}${case_('etiquettes', 'A-H-V', r.etiquettes)}
          ${case_('filtre50', 'Filtre secteur 50 Hz', r.filtre50)}${case_('passe-haut', 'Passe-haut 30 Hz (EGM)', r.passeHaut)}
        </div></details>
      </div>
      <details class="simu-voies" id="voies-bloc"><summary>Voies affichées (<span id="voies-nb"></span>) : toucher pour ajouter ou enlever</summary>
        <div class="simu-voies-grille">${GROUPES_VOIES.map(([g, ids]) => `<div class="simu-voies-groupe"><span>${g}</span>${ids.map(id => {
          const c = CANAUX.find(x => x.id === id);
          return `<button type="button" data-voie="${id}" aria-pressed="${r.voies.includes(id)}" title="${esc(c.nom)}">${esc(c.nom)}</button>`; }).join('')}</div>`).join('')}</div>
      </details>
      <div class="simu-bascule" role="tablist" aria-label="Écran affiché">
        <button type="button" role="tab" data-vue="direct" aria-selected="true">Temps réel</button>
        <button type="button" role="tab" data-vue="rappel" aria-selected="false">Rappel <span id="bascule-nouveau" class="simu-pastille" hidden></span></button>
      </div>
      <div class="simu-ecrans">
        <div class="simu-panneau simu-direct">
          <div class="simu-titre-ecran"><b>Temps réel</b><span class="simu-vitaux" id="constantes"></span><div class="simu-mesures" id="mesures" aria-live="off"></div></div>
          <div class="simu-ecran">
            <canvas id="ecran" role="img" aria-label="Baie d'électrophysiologie en temps réel : dérivations de surface, électrogrammes endocavitaires et pression artérielle"></canvas>
            <div class="simu-etat" id="etat"></div>
          </div>
        </div>
        <div class="simu-panneau simu-rappel" id="rappel">
          <div class="simu-titre-ecran"><b>Écran de rappel</b> <span id="rappel-titre" class="note"></span></div>
          <div class="simu-barre">
            <button class="btn btn-mini" id="evt-prec" aria-label="Événement précédent du journal">◀ Évt</button>
            <button class="btn btn-mini" id="evt-suiv" aria-label="Événement suivant du journal">Évt ▶</button>
            <label class="simu-mini">Vitesse ${vitesses('vitesse-rappel', r.vitesseRappel)}</label>
            <div class="simu-mesures" id="mesures-rappel" aria-live="off"></div>
          </div>
          <div class="simu-ecran">
            <canvas id="ecran-rappel" role="img" aria-label="Écran de rappel : tracé de l'événement sélectionné dans le journal, mesurable au compas"></canvas>
            <p class="simu-rappel-vide" id="rappel-vide">Aucun événement rappelé. Faites une manœuvre ou « Enregistrer », ou touchez un événement du journal.</p>
            <canvas id="ecran-mini" class="simu-mini-direct" aria-label="Vignette du tracé en temps réel (toucher pour y revenir)" role="button" tabindex="0"></canvas>
          </div>
          <div class="simu-revue">
            <button class="btn btn-mini" id="arriere" aria-label="Page précédente">◀</button>
            <input type="range" id="recul" min="0" max="0" step="50" value="0" aria-label="Se déplacer dans l'enregistrement rappelé">
            <button class="btn btn-mini" id="avant" aria-label="Page suivante">▶</button>
            <span id="recul-val" class="note"></span>
            <button class="btn btn-mini" id="compas-plus">+ compas</button>
            <button class="btn btn-mini" id="compas-report">Report</button>
            <button class="btn btn-mini" id="compas-effacer">Effacer</button>
            <button class="btn btn-mini ${r.aimant ? 'actif' : ''}" id="aimant" aria-pressed="${r.aimant}" title="Les compas s'accrochent aux activations">Aimant</button>
            <button class="btn btn-mini" id="comparer" title="Garder ce rappel comme référence pour comparer">Comparer</button>
          </div>
          <div class="simu-reference" id="reference" hidden>
            <div class="simu-titre-ecran"><b>Référence</b> <span id="reference-titre" class="note"></span><button class="btn btn-mini" id="reference-fermer" aria-label="Retirer la référence">✕</button></div>
            <div class="simu-ecran"><canvas id="ecran-ref" role="img" aria-label="Tracé de référence pour la comparaison"></canvas></div>
          </div>
        </div>
      </div>
      <div class="simu-paysage" id="paysage">
        <span aria-hidden="true" class="simu-paysage-ico">⟳</span>
        <span><b>Tournez votre téléphone en paysage</b> pour voir l'écran de rappel (mesures au compas, rappel des événements du journal).<span id="paysage-nouveau"></span></span>
        <button class="btn btn-mini" id="btn-paysage">Passer en paysage</button>
      </div>
      <div class="simu-message" id="message" role="status"></div>
    </section>

    <section class="simu-console" id="console" aria-label="Console de stimulation">
      <div class="simu-actions">
        <button class="btn btn-primaire simu-go" id="stimuler" title="Stimuler ; pendant une stimulation, une salve ou un protocole : Stop">Stimuler</button>
        <button class="btn" id="enregistrer" title="Envoyer les 10 dernières secondes sur l'écran de rappel">Enreg.</button>
      </div>
      ${puces('site', SITES_STIM, r.site, COURTS, 'Site de stimulation')}
      <p class="simu-resume" id="resume"></p>
      <div class="simu-onglets" role="tablist" aria-label="Réglages de la console">
        ${onglet('prog', 'Programme')}${onglet('proto', 'Protocoles')}${onglet('salve', 'Salve')}${onglet('abl', 'Sonde / RF')}${onglet('medic', 'Médic.')}${onglet('journal', 'Journal')}
        <button type="button" class="simu-replier" id="replier" aria-label="Replier ou déplier la console" aria-expanded="true">▾</button>
      </div>
      <div class="simu-pans">
        ${panneau('prog', `
          <div class="simu-grille-pas">${pas('s1', 'S1 (ms)', r.s1, 10, 200, 2000)}${pas('n', 'Nb S1', r.n, 1, 0, 30)}
          ${pas('sortie', 'Sortie (mA)', r.sortie, 0.5, 0.1, 20)}${pas('largeur', 'Impulsion (ms)', r.largeur, 0.5, 0.5, 2)}</div>
          <label class="simu-case simu-extras"><input type="checkbox" id="extras" ${r.extras ? 'checked' : ''}> + extrastimulus (S2, S3, S4)</label>
          <div id="extras-bloc" ${r.extras ? '' : 'hidden'}>
            <div class="simu-grille-pas">${pas('s2', 'S2 (ms)', r.s2, 10, 0, 1000)}${pas('s3', 'S3', r.s3, 10, 0, 1000)}${pas('s4', 'S4', r.s4, 10, 0, 1000)}</div>
            <label class="simu-case"><input type="checkbox" id="decrement" ${r.decrement ? 'checked' : ''}> Décrément automatique : S2 − 10 ms après chaque train</label>
          </div>
          <div class="simu-ligne-puces"><span class="simu-pas-lib">Couplé à la détection</span>${puces('detection', SITES_DETECTION, r.detection, COURTS_DETECTION, 'Couplage à la détection')}</div>
          <label class="simu-case"><input type="checkbox" id="rappel-apres" ${r.rappelApres ? 'checked' : ''}> Afficher chaque manœuvre sur l'écran de rappel</label>`)}
        ${panneau('proto', `
          <div class="simu-protos">
            <button class="simu-proto" data-proto="decA"><b>Extrastimulus atrial décrémental</b><small>OD haute, S2 − 10 ms à chaque train jusqu'à la période réfractaire : PR nodale, saut d'AH, induction</small></button>
            <button class="simu-proto" data-proto="decV"><b>Extrastimulus ventriculaire décrémental</b><small>VD apex : conduction rétrograde, PR ventriculaire, induction</small></button>
            <button class="simu-proto" data-proto="wenck"><b>Rampe atriale → Wenckebach</b><small>Cycle raccourci par paliers jusqu'au premier bloc AV, arrêt automatique</small></button>
            <button class="simu-proto" data-proto="retro"><b>Rampe ventriculaire → Wenckebach VA</b><small>Conduction rétrograde, dissociation VA</small></button>
            <button class="simu-proto" data-proto="trs"><b>Temps de récupération sinusale</b><small>Salve de 30 s à 600 ms depuis l'OD haute, TRS et TRS corrigé</small></button>
            <button class="simu-proto" data-proto="seuil"><b>Seuil de capture</b><small>Sortie diminuée battement par battement au site choisi</small></button>
            <button class="simu-proto" data-proto="parahis"><b>Stimulation para-hisienne</b><small>En rythme sinusal, sortie haute (His + myocarde) et basse (myocarde) alternées</small></button>
            <button class="simu-proto" data-proto="esv"><b>ESV His-réfractaire</b><small>En tachycardie : VD couplé au His, S2 = cycle − 30 ms</small></button>
            <button class="simu-proto" data-proto="entrV"><b>Entraînement ventriculaire</b><small>En tachycardie : VD à cycle − 30 ms, arrêt dès l'atrium entraîné, V-A-V / V-A-A-V, PPI − TCL</small></button>
            <button class="simu-proto" data-proto="entrSite"><b>Entraînement depuis le site choisi</b><small>En tachycardie : cycle − 20 ms (− 30 ms au ventricule), arrêt automatique, PPI − TCL au site</small></button>
          </div>
          <p class="simu-proto-etat" id="proto-etat" role="status"></p>`)}
        ${panneau('salve', `
          <div class="simu-grille-pas">${pas('salve-cl', 'Salve : cycle (ms)', r.salveCl, 10, 150, 2000)}</div>
          <button class="btn" id="salve">Démarrer la salve</button>
          <p class="note">La salve stimule en continu à ce cycle jusqu'à « Arrêter la salve » ou « Stop ».</p>
          <div class="simu-grille-pas">${pas('rampe-debut', 'Rampe : de', r.rampeDebut, 10, 150, 2000)}${pas('rampe-fin', 'à', r.rampeFin, 10, 150, 2000)}${pas('rampe-pas', 'pas', r.rampePas, 5, 5, 50)}</div>
          <button class="btn" id="rampe">Lancer la rampe</button>`)}
        ${panneau('abl', `
          <div class="simu-carte-bloc">
            <svg class="simu-carte" id="carte" viewBox="0 0 300 214" role="group" aria-label="Carte schématique des positions de la sonde (vue oblique antérieure gauche)">
              <circle cx="92" cy="104" r="56" class="anneau"/><circle cx="212" cy="104" r="52" class="anneau"/>
              <path d="M150 162 Q 212 200 262 128" class="sc"/>
              <text x="92" y="108" class="lib-anneau">Tricuspide</text><text x="212" y="108" class="lib-anneau">Mitral</text>
              ${POSITIONS.map(p => { const [x, y] = CARTE[p.id] || [150, 100]; return `<g class="pt" data-pos="${p.id}" tabindex="0" role="button" aria-label="${esc(p.nom)}">
                <circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y + 20}">${COURTS_POS[p.id] || ''}</text><text x="${x}" y="${y + 3.5}" class="lat" id="lat-${p.id}"></text></g>`; }).join('')}
            </svg>
            <p class="note simu-carte-legende" id="carte-legende">Touchez un point pour y placer la sonde. En tachycardie, chaque position visitée est colorée selon son activation locale (rouge = précoce, violet = tardif ; référence SC 9-10 pour l'atrium, QRS pour le ventricule).</p>
          </div>
          <label class="simu-champ large"><span>Position</span><select id="position">${opt(POSITIONS, st.position)}</select></label>
          <div class="simu-grille-pas">${pas('puissance', 'Puissance (W)', r.puissance, 5, 5, 50)}${pas('duree-rf', 'Durée max (s)', r.dureeRF, 10, 10, 120)}</div>
          <div class="simu-rf">
            <button class="btn btn-danger simu-rf-btn" id="ablater" aria-pressed="false">Radiofréquence</button>
            <output class="simu-rf-etat" id="rf-etat">Générateur prêt</output>
          </div>
          <p class="note">Électrogrammes de la sonde (ABL d, ABL uni) avec le montage « Ablation » ou en les ajoutant dans « Voies affichées » ; stimulez depuis la sonde avec le site « Sonde abl. ». Surveillez le rythme jonctionnel et sa conduction VA pendant un tir près du nœud AV.</p>
          <button class="btn" id="carte-effacer">Effacer la carte</button> <button class="btn" id="reinit">Recommencer le cas</button>`)}
        ${panneau('medic', `
          <div class="simu-medics">
            <button class="btn" id="adenosine">Adénosine 12 mg</button>
            <button class="btn" id="iso" aria-pressed="false">Isoprénaline</button>
            <button class="btn" id="atropine" aria-pressed="false">Atropine</button>
            <button class="btn btn-danger" id="choc">Choc</button>
          </div>
          <p class="note">Adénosine : bloc AV transitoire environ 1,5 s après le clic. Isoprénaline : effet progressif sur 15 s, facilite l'induction. Surveillez la pression artérielle (voie PA) : une tachycardie mal tolérée s'arrête par stimulation ou par choc.</p>`)}
        ${panneau('journal', `
          <ol class="simu-journal" id="journal"></ol>
          <div class="actions serre gauche"><button class="btn" id="cr-generer">Compte rendu d'EEP</button></div>`)}
      </div>
    </section>
    </div>

    <section class="carte" id="diagnostic" hidden>
      <h2>Votre diagnostic</h2>
      <p class="note">Stimulez, induisez, faites vos manœuvres, traitez si besoin, puis concluez. Votre démarche est notée.</p>
      <div class="simu-ligne"><label class="simu-champ large"><span>Diagnostic</span><select id="reponse">
        <option value="">— Choisir —</option>${MYSTERES.map(id => `<option value="${id}">${esc(SCENARIOS[id].court)}</option>`).join('')}</select></label>
        <button class="btn btn-primaire" id="valider">Valider</button></div>
      <div id="verdict"></div>
    </section>

    <section class="carte simu-cr" id="compte-rendu" hidden></section>
    <section class="carte" id="explication-scenario"></section>

    <details class="carte simu-guide">
      <summary><b>Mode d'emploi et manœuvres clés</b></summary>
      <ul>
        <li><b>Console</b> : toujours en bas de l'écran (à droite en paysage sur téléphone). Stimuler (qui devient Stop pendant une stimulation, une salve ou un protocole) et Enregistrer restent visibles ; « + extrastimulus » affiche S2, S3 et S4 ; la salve se lance depuis l'onglet Salve ; les pastilles choisissent le site ; les onglets donnent les réglages (± : appui long pour aller vite). Touchez l'onglet ouvert pour replier la console.</li>
        <li><b>Baie</b> : vitesse en mm/s (25 mm/s pour une vue d'ensemble, 100 à 200 mm/s pour mesurer). L'écran en temps réel est en balayage (défilement en option) et ne se fige jamais. Choisissez un montage, puis ajoutez ou enlevez chaque voie dans « Voies affichées ». L'<b>écran de rappel</b> affiche chaque manœuvre ou enregistrement, centré sur l'extrastimulus (ou le stimulus bloqué, le dernier stimulus d'une salve) ; tout événement du journal peut y être rappelé. Faites glisser pour poser un compas (aimanté aux activations), pincez pour changer de vitesse, « Comparer » garde un rappel en référence (avant / après adénosine, avant / après ablation). Sur téléphone en paysage, un seul écran à la fois : glissez horizontalement pour passer du temps réel au rappel.</li>
        <li><b>Protocoles</b> : extrastimulus décrémental automatique (PR, saut d'AH, induction), rampe jusqu'au Wenckebach antérograde ou rétrograde, temps de récupération sinusale, seuil de capture, para-hisien, ESV His-réfractaire et entraînement avec arrêt automatique. Les résultats vont dans le journal et le compte rendu.</li>
        <li><b>Extrastimulus</b> : train de S1 (ex. 8 × 600 ms) puis, en cochant « + extrastimulus », S2, S3, S4 (0 = désactivé) ; diminuez S2 par pas de 10 ms (boutons ± ou décrément automatique). Saut de l'AH ≥ 50 ms pour 10 ms de raccourcissement du couplage = double voie nodale. Période réfractaire effective : du tissu stimulé quand S2 ne capture plus ; du nœud AV quand S2 capture sans être suivi d'un H.</li>
        <li><b>Stimulateur</b> : chaque site a son seuil (isthme, SC distal et cicatrice plus élevés) ; près du seuil, la capture devient intermittente ; une impulsion plus courte exige plus d'intensité (loi intensité-durée). Un stimulus sans capture est marqué « · ».</li>
        <li><b>Isoprénaline</b> : accélère le sinus, améliore la conduction nodale et facilite l'induction. <b>Adénosine</b> : bloc AV transitoire (1,5 s après le clic dans le simulateur).</li>
        <li><b>ESV His-réfractaire</b> : si l'atrium suivant est avancé avec la même séquence, il existe une voie accessoire ; elle participe au circuit si l'ESV retarde l'atrium ou arrête la tachycardie sans l'atteindre.</li>
        <li><b>Entraînement ventriculaire</b> : réponse <b>V-A-V</b> (réentrée nodale ou voie accessoire) ou <b>V-A-A-V</b> (tachycardie atriale). PPI − TCL &gt; 115 ms (et SA − VA &gt; 85 ms) en faveur d'une réentrée intranodale, &lt; 115 ms d'une voie accessoire.</li>
        <li><b>Stimulation para-hisienne</b> : si l'intervalle stimulus-A s'allonge à la perte de capture du His, la conduction rétrograde est nodale ; s'il ne change pas, elle est extranodale (voie accessoire septale).</li>
        <li><b>Sonde et radiofréquence</b> : placez la sonde sur la carte (un contact de cathéter peut déclencher des extrasystoles, voire bloquer transitoirement une voie accessoire : perte de la préexcitation sans tir). Le tir dure jusqu'à l'arrêt ou la durée maximale ; la lésion se constitue en quelques secondes selon la puissance et le contact (température, impédance affichées). Sur la voie lente, un rythme jonctionnel signe le chauffage efficace ; une perte de la conduction VA pendant ce rythme impose d'arrêter immédiatement. Près du His, l'AH s'allonge puis le bloc AV complet survient si l'on insiste ; la cryoablation est plus sûre.</li>
        <li><b>Constantes</b> : la voie PA suit le remplissage (cycle, contraction atriale) : une tachycardie rapide ou une dissociation AV fait chuter la pression.</li>
        <li><b>Filtres</b> : sans filtre 50 Hz, le parasite secteur apparaît ; sans passe-haut, la ligne de base des électrogrammes dérive avec la respiration. Après un choc, les amplificateurs saturent brièvement.</li>
      </ul>
      <p class="note">Modèle pédagogique simplifié : les intervalles sont réalistes mais le cœur est réduit à une trentaine de sites. Concept inspiré du simulateur svtsim (S. Iravanian) ; code et scénarios originaux. Critères : Michaud GF et al., JACC 2001;38:1163-7 (PPI − TCL, SA − VA) ; Knight BP et al., JACC 1999;33:775-81 (V-A-A-V) ; Hirao K et al., Circulation 1996;94:1027-35 (stimulation para-hisienne) ; Josephson ME, Clinical Cardiac Electrophysiology.</p>
    </details>`;

  const $ = s => app.querySelector(s);
  const canvas = $('#ecran'), canvasR = $('#ecran-rappel'), canvasMini = $('#ecran-mini'), canvasRef = $('#ecran-ref'), baie = $('.simu-baie');
  const compact = () => matchMedia(MEDIA_COMPACT).matches;

  // ---------- journal et écran de rappel ----------
  // Chaque entrée du journal couvre une fenêtre de tracé [debut, capture] ; à l'instant « capture », le tracé de cette
  // fenêtre est copié (instantané) et peut être rappelé à tout moment sur l'écran de rappel. auto : affichage dès la capture.
  const hms = t => `${(t / 1000).toFixed(1)} s`;
  // événements émis par le moteur : [début, capture, instant à montrer] relatifs à l'événement (ms), affichage automatique
  const FENETRES_MOTEUR = [[/^Adénosine/, -2000, 9000, 1500, true], [/^Choc/, -3000, 4000, 0, true], [/^Radiofréquence/, -4000, 3000, 0, false], [/^Bloc AV/, -5000, 3000, 0, true]];
  // focus : instant placé au centre de l'écran de rappel à l'ouverture (extrastimulus, stimulus bloqué, dernier stimulus d'une salve…) ;
  // sans focus, l'écran montre la fin de l'enregistrement
  function entree(t, texte, { debut = t - 6000, capture = t + 4000, auto = false, focus = null } = {}) {
    const e = { id: ++st.numero, t, texte, debut, capture, auto, focus, instantane: null };
    st.actions.push(e);
    return e;
  }
  function majJournal() {
    for (const e of st.coeur.evenements) if (!e.vu) {
      e.vu = true;
      const f = FENETRES_MOTEUR.find(([re]) => re.test(e.texte));
      entree(e.t, e.texte, f ? { debut: e.t + f[1], capture: e.t + f[2], focus: e.t + f[3], auto: f[4] && r.rappelApres } : {});
    }
    st.actions.sort((a, b) => a.t - b.t);
    if (st.actions.length > 80) st.actions = st.actions.slice(-80);
    if (st.rappel && !st.actions.includes(st.rappel)) st.actions.unshift(st.rappel);
    rendreJournal();
  }
  const f0 = v => (v == null ? '—' : Math.round(v));
  function rendreJournal() {
    $('#journal').innerHTML = st.actions.slice().reverse().map(a => `<li><button class="simu-evt${a === st.rappel ? ' choisi' : ''}" data-evt="${a.id}" ${a === st.rappel ? 'aria-current="true"' : ''}>
      <span class="note">${hms(a.t)}</span> ${esc(a.texte)}${a.instantane ? '' : ' <span class="note" title="Enregistrement en cours">⏳</span>'}
      ${a.mes ? `<small class="simu-evt-mes">V-V ${f0(a.mes.cycleV)} · AH ${f0(a.mes.AH)} · HV ${f0(a.mes.HV)} · VA ${f0(a.mes.VA)}</small>` : ''}</button></li>`).join('');
  }
  function noter(type, texte, fenetre) {
    if (type) st.faites.add(type);
    const e = texte ? entree(st.t, texte, fenetre) : null;
    majJournal();
    return e;
  }
  const positionActuelle = () => POSITIONS.find(p => p.id === st.position);
  const ablationVue = () => { const pos = positionActuelle(); return pos ? { a: pos.a, v: pos.v } : null; };
  function capturer(e) {
    const c = st.coeur, t0 = Math.max(e.debut, e.capture - 60000, 0);
    e.instantane = { t: e.capture, debut: t0, journal: c.journal.filter(x => x.t >= t0 - 8000 && x.t <= e.capture + 5),
      stims: c.stims.filter(x => x.t >= t0 - 3000 && x.t <= e.capture), chocs: c.chocs.filter(x => x >= t0 - 2000 && x <= e.capture), ablation: ablationVue() };
    e.mes = mesures(e.instantane, e.capture);
  }
  function rappeler(e) {
    if (!e) return;
    if (!e.instantane) { st.demande = e; message('Enregistrement en cours : il s\'affichera sur l\'écran de rappel dans un instant.'); return; }
    st.rappel = e; st.curseurs = [];
    st.recul = e.focus != null ? Math.max(0, e.instantane.t - e.focus - 0.5 * fenetreMs(canvasR.clientWidth || 300, r.vitesseRappel)) : 0; st.nouveauCompas = false; st.demande = null; st.sale = true;
    $('#rappel-titre').textContent = `${hms(e.t)} · ${e.texte}`;
    $('#rappel-vide').hidden = true;
    $('#paysage-nouveau').textContent = ` Dernier rappel : ${e.texte}.`;
    $('#bascule-nouveau').hidden = st.vue === 'rappel';
    majRecul(); rendreJournal();
  }
  function rappelVoisin(sens) {
    const prets = st.actions.filter(a => a.instantane);
    const i = prets.indexOf(st.rappel);
    rappeler(prets[i < 0 ? prets.length - 1 : Math.max(0, Math.min(prets.length - 1, i + sens))]);
  }

  // ---------- compte rendu : données recueillies au fil de l'exploration ----------
  const nouveauCR = () => ({ base: null, wenck: null, wenckRetro: null, extraA: null, extraV: null, trs: null, seuils: [], parahis: null, inductions: [], tirs: [], hypotension: false });

  function nouveauCoeur() {
    const sc = SCENARIOS[st.scenario];
    arreterRF(true);
    st.coeur = new Coeur(sc.def(), { variation: st.mystere ? Math.min(0.05, sc.variation ?? 1) : 0 });
    st.coeur.avancer(2500);
    Object.assign(st, { t: 2500, salve: null, actions: [], faites: new Set(), analyses: [], positionsTachy: new Set(), tachyAvant: false,
      rappel: null, recul: 0, curseurs: [], nouveauCompas: false, demande: null, sale: true, reference: null, proto: null, rf: null, carte: {}, cr: nouveauCR(), hypo: 0, bump: null });
    $('#salve').textContent = 'Démarrer la salve'; $('#salve').classList.remove('actif');
    for (const id of ['#iso', '#atropine']) { $(id).setAttribute('aria-pressed', 'false'); $(id).classList.remove('actif'); }
    $('#rappel-titre').textContent = ''; $('#rappel-vide').hidden = false; $('#paysage-nouveau').textContent = ''; $('#reference').hidden = true;
    $('#proto-etat').textContent = ''; $('#compte-rendu').hidden = true; $('#rf-etat').textContent = 'Générateur prêt';
    majRecul(); majCarte(); majResume();
    $('#diagnostic').hidden = !st.mystere; $('#verdict').innerHTML = ''; $('#reponse').value = '';
    $('#contexte').innerHTML = sc.contexte ? `<b>Contexte :</b> ${esc(sc.contexte)}` : '';
    $('#explication-scenario').innerHTML = st.mystere
      ? '<h2>Cas mystère</h2><p class="note">Le mécanisme est caché et les paramètres varient légèrement d\'un cas à l\'autre. Faites les manœuvres utiles, traitez si besoin, puis concluez.</p>'
      : `<h2>${esc(sc.nom)}</h2><p>${esc(sc.explication)}</p>`;
    noter(null, st.mystere ? 'Nouveau cas mystère' : `Scénario : ${sc.nom}`, { debut: 0, capture: 6500 });
  }
  function choisir(v) {
    st.mystere = v === 'mystere';
    st.scenario = st.mystere ? melanger(MYSTERES)[0] : v;
    nouveauCoeur();
  }

  const reglages = () => {
    const n = (id, min = 0) => Math.max(min, +$(id).value || 0);
    Object.assign(r, { sortie: n('#sortie', 0.1), largeur: Math.min(2, n('#largeur', 0.5)), s1: Math.max(200, n('#s1')), n: Math.min(30, Math.round(n('#n'))),
      s2: Math.round(n('#s2')), s3: Math.round(n('#s3')), s4: Math.round(n('#s4')), extras: $('#extras').checked, rappelApres: $('#rappel-apres').checked, decrement: $('#decrement').checked,
      salveCl: n('#salve-cl', 150), rampeDebut: n('#rampe-debut', 150), rampeFin: n('#rampe-fin', 150), rampePas: n('#rampe-pas', 1),
      puissance: Math.min(50, n('#puissance', 5)), dureeRF: Math.min(120, n('#duree-rf', 10)),
      vitesse: +$('#vitesse').value, vitesseRappel: +$('#vitesse-rappel').value, mode: $('#mode').value,
      bruit: $('#bruit').checked, etiquettes: $('#etiquettes').checked, filtre50: $('#filtre50').checked, passeHaut: $('#passe-haut').checked });
    ecrire(r);
    majResume();
    return r;
  };
  const siteReel = () => (r.site === 'abl' ? positionActuelle().stim : r.site);
  const nomSite = () => `${SITES_STIM.find(s => s.id === r.site).nom}${r.site === 'abl' ? ` (${positionActuelle().nom})` : ''}`;
  const virgule = x => String(x).replace('.', ',');
  // réglages effectivement délivrés : S2, S3, S4 ignorés tant que « + extrastimulus » n'est pas coché
  const programme = () => ({ ...r, ...(r.extras ? {} : { s2: 0, s3: 0, s4: 0 }) });
  function majResume() {
    const q = programme(), extras = [q.s2, q.s3, q.s4].filter(Boolean);
    $('#resume').textContent = `${r.n ? `${r.n} × ${r.s1}` : 'sans train'}${extras.map((x, i) => ` · S${i + 2} ${x}`).join('')} ms · ${virgule(r.sortie)} mA / ${virgule(r.largeur)} ms`
      + `${r.detection ? ` · couplé ${COURTS_DETECTION[r.detection]}` : ''} · salve ${r.salveCl} ms`;
  }
  function choisirPuce(groupe, v) {
    for (const b of $(`#${groupe}`).querySelectorAll('[data-v]')) b.setAttribute('aria-checked', String(b.dataset.v === v));
    r[groupe] = v; reglages();
  }
  function message(m) { $('#message').textContent = m; setTimeout(() => { if ($('#message')?.textContent === m) $('#message').textContent = ''; }, 5000); }
  const vibrer = () => { try { navigator.vibrate?.(12); } catch { /* sans vibreur */ } };

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

  function programmer(tDebut, site, e, p = r) {
    const c = st.coeur;
    let t = tDebut;
    const liste = [];
    for (let i = 0; i < p.n; i++) { liste.push(t); if (i < p.n - 1) t += p.s1; }
    const extras = [p.s2, p.s3, p.s4].filter(Boolean);
    if (!p.n && extras.length) t -= extras[0];
    for (const x of extras) { t += x; liste.push(t); }
    liste.forEach(x => c.stimuler(site, x, p.sortie, p.largeur));
    // rappel centré sur le premier extrastimulus (S2), ou sur le dernier stimulus d'un train simple
    if (e && liste.length) Object.assign(e, { debut: liste[0] - 1500, capture: liste.at(-1) + 2000, focus: extras.length ? liste[p.n] : liste.at(-1), instantane: null });
    return liste;
  }

  function stimuler() {
    reglages();
    const p = programme(); // réglages figés au moment de l'appui (train couplé différé)
    if (!p.n && !p.s2) { message(r.extras ? 'Réglez au moins un S1 ou un S2.' : 'Réglez au moins un S1, ou cochez « + extrastimulus ».'); return; }
    vibrer();
    const c = st.coeur, site = siteReel();
    const type = classer(site, { detection: p.detection, n: p.n, s2: p.s2 });
    const tcl = tachycardie(c).cycleV;
    let e = null;
    const lancer = t0 => {
      const liste = programmer(t0, site, e, p);
      if (type === 'esvHis' && liste.length) {
        const te = liste.at(-1);
        setTimeout(() => {
          const av = analyserESV(c, te, tcl);
          if (av != null) resultat(`ESV His-réfractaire : ${av > 5 ? `atrium avancé de ${av} ms` : av < -5 ? `atrium retardé de ${-av} ms` : 'atrium inchangé'}${tachycardie(c).active ? '' : ', tachycardie arrêtée'}`);
        }, 3500);
      }
    };
    e = noter(type, `${nomSite()} : ${p.n ? `${p.n} × S1 ${p.s1}` : ''}${[p.s2, p.s3, p.s4].filter(Boolean).map((x, i) => ` S${i + 2} ${x}`).join('')} ms, ${virgule(p.sortie)} mA${p.detection ? `, couplé au ${SITES_DETECTION.find(d => d.id === p.detection).nom}` : ''}`,
      { capture: st.t + 12000, auto: r.rappelApres });
    if (p.detection) {
      const depuis = c.t;
      const ecoute = (s, t) => {
        if (s !== p.detection || t <= depuis) return;
        c.ecouteurs = c.ecouteurs.filter(f => f !== ecoute);
        lancer(t + (p.n ? p.s1 : p.s2));
      };
      c.ecouteurs.push(ecoute);
    } else lancer(c.t + 150);
    if (p.decrement && p.s2) { $('#s2').value = Math.max(150, p.s2 - 10); reglages(); }
    majBoutonStim();
  }

  // résultat d'une manœuvre : journal, débriefing du cas et compte rendu
  function resultat(texte) { st.analyses.push(texte); noter(null, texte, { debut: st.t - 3000, capture: st.t + 500 }); $('#proto-etat').textContent = texte; }

  function demarrerSalve(site, cl, { nom = nomSite(), type } = {}) {
    const t = tachycardie(st.coeur);
    st.salve = { site, cl, prochain: st.coeur.t + 100, debut: st.coeur.t + 100, sortie: r.sortie, largeur: r.largeur, tachy: t.active,
      tcl: VENTRICULAIRES.has(site) ? t.cycleV : (t.cycleA ?? t.cycleV), nom };
    noter(type ?? classer(site, { salve: true }), `Salve : ${nom} à ${cl} ms, ${virgule(r.sortie)} mA`);
    $('#salve').textContent = 'Arrêter la salve'; $('#salve').classList.add('actif');
  }
  function arreterSalve() {
    const s = st.salve; if (!s) return;
    const c = st.coeur;
    c.annulerStims(c.t);
    const der = c.stims.filter(x => x.s === s.site).at(-1)?.t;
    noter(null, `Arrêt de la salve (${s.nom} à ${s.cl} ms)`, { debut: Math.max(s.debut - 2000, st.t - 30000), capture: st.t + 3500, focus: der, auto: r.rappelApres });
    st.salve = null; $('#salve').textContent = 'Démarrer la salve'; $('#salve').classList.remove('actif');
    if (s.tachy && der != null) {
      setTimeout(() => {
        const a = analyserEntrainement(c, { der, site: s.site, tcl: s.tcl, ventriculaire: VENTRICULAIRES.has(s.site) });
        resultat(`Entraînement depuis ${s.nom} à ${s.cl} ms (TCL ${Math.round(s.tcl)}) : ${tachycardie(c).active ? '' : 'tachycardie arrêtée ; '}${a.reponse ? `réponse ${a.reponse}, ` : ''}PPI ${a.ppi ?? '—'} ms, PPI − TCL ${a.pptcl ?? '—'} ms`);
      }, 3200);
    }
  }

  // ---------- protocoles automatiques ----------
  // Un protocole est une petite machine à états appelée à chaque image : etape(t) renvoie faux quand il est terminé.
  const cycleSinusal = () => { const A = activations(st.coeur.journal, 'hra', st.t - 6000, st.t); const d = A.slice(1).map((x, i) => x - A[i]).sort((a, b) => a - b); return d.length ? d[d.length >> 1] : 800; };
  const arrondi10 = x => Math.round(x / 10) * 10;
  const choisirSite = id => choisirPuce('site', id);
  const fixer = (id, v) => { $(id).value = v; };

  function protoDecremental(atrial) {
    reglages();
    const c = st.coeur, site = atrial ? 'hra' : 'rva';
    choisirSite(site);
    const s1 = r.s1, n = Math.max(1, r.n || 8), sortie = Math.max(r.sortie, 2 * seuilCapture(site, r.largeur));
    let s2 = arrondi10(Math.min(400, s1 - 200)), attente = null, prec = null; // départ standard, quel que soit le S2 laissé par une manœuvre précédente
    const res = { site, s1, n, pr: null, prConduction: null, saut: null, courbe: [], induction: null };
    const nom = atrial ? 'Extrastimulus atrial décrémental' : 'Extrastimulus ventriculaire décrémental';
    st.faites.add(atrial ? 'extraA' : 'extraV');
    noter(null, `Protocole : ${nom} (${n} × ${s1} ms, S2 dès ${s2} ms, ${virgule(sortie)} mA)`);
    const conclure = texte => {
      if (atrial) st.cr.extraA = res; else st.cr.extraV = res;
      resultat(`${nom} : ${texte}`);
      return false;
    };
    const lancerTrain = t0 => {
      for (let i = 0; i < n; i++) c.stimuler(site, t0 + i * s1, sortie, r.largeur);
      const ts = t0 + (n - 1) * s1 + s2;
      c.stimuler(site, ts, sortie, r.largeur);
      fixer('#s2', s2); reglages();
      entree(t0, `${atrial ? 'OD haute' : 'VD apex'} : ${n} × S1 ${s1} S2 ${s2} ms`, { debut: t0 - 1500, capture: ts + 2000, focus: ts, auto: r.rappelApres });
      majJournal();
      attente = { ts, s2, fin: ts + 2400 };
    };
    lancerTrain(c.t + 300);
    return { nom, etape(t) {
      if (t < attente.fin) return true;
      const rep = reponseStim(c, attente.ts);
      if (atrial && prec?.AH != null && rep.AH != null && rep.AH - prec.AH >= 50 && !res.saut) res.saut = `saut d'AH de ${prec.AH} à ${rep.AH} ms à S2 = ${attente.s2} ms (double voie nodale)`;
      const Vapres = battementsV(c.journal, attente.ts + 150, t).filter(v => !c.stims.some(s => Math.abs(s.t - v) < 5));
      const gaps = Vapres.slice(1).map((x, i) => x - Vapres[i]);
      if (Vapres.length >= 4 && gaps.every(g => g < 470)) { res.induction = attente.s2; st.faites.add('induction'); return conclure(`tachycardie induite à S2 = ${attente.s2} ms${res.saut ? ` ; ${res.saut}` : ''}`); }
      if (!rep.capture) {
        res.pr = attente.s2;
        return conclure(`PR ${atrial ? 'atriale' : 'ventriculaire'} = ${attente.s2} ms${res.prConduction ? ` ; PR ${atrial ? 'nodale' : 'rétrograde'} = ${res.prConduction} ms` : ''}${res.saut ? ` ; ${res.saut}` : ''}`);
      }
      const conduit = atrial ? rep.H != null : rep.Ahra != null || rep.SA != null;
      const intervalle = atrial ? rep.AH : rep.SA;
      res.courbe.push([attente.s2, intervalle]);
      if (!conduit && res.prConduction == null) res.prConduction = attente.s2;
      prec = rep;
      s2 -= 10;
      if (s2 < 150) return conclure(`pas de perte de capture jusqu'à 150 ms${res.prConduction ? ` ; PR ${atrial ? 'nodale' : 'rétrograde'} = ${res.prConduction} ms` : ''}`);
      $('#proto-etat').textContent = `▶ ${nom} : S2 ${attente.s2} → ${intervalle != null ? `${atrial ? 'AH' : 'S-A'} ${intervalle} ms` : conduit ? 'conduit' : 'bloqué'}${res.prConduction ? ` · PR ${atrial ? 'nodale' : 'rétrograde'} ${res.prConduction}` : ''}${res.saut ? ' · saut d\'AH' : ''}`;
      lancerTrain(t + 200);
      return true;
    } };
  }

  function protoRampe(atrial) {
    reglages();
    const c = st.coeur, site = atrial ? 'hra' : 'rva';
    choisirSite(site);
    const sortie = Math.max(r.sortie, 2 * seuilCapture(site, r.largeur));
    const liste = []; let t = c.t + 150;
    for (let cl = Math.max(r.rampeDebut, 400); cl >= Math.min(r.rampeFin, 250) && liste.length < 200; cl -= 10) for (let k = 0; k < 4; k++) { c.stimuler(site, t, sortie, r.largeur); liste.push({ t, cl }); t += cl; }
    const nom = atrial ? 'Rampe atriale (Wenckebach AV)' : 'Rampe ventriculaire (Wenckebach VA)';
    st.faites.add(atrial ? 'extraA' : 'stimV');
    const e = noter(null, `Protocole : ${nom}, ${liste[0].cl} → ${liste.at(-1).cl} ms`, { debut: c.t - 1000, capture: t + 1500, auto: r.rappelApres });
    let i = 0, conduits = 0;
    const fin = (texte, tFin) => {
      c.annulerStims(st.t);
      Object.assign(e, { capture: Math.max(st.t, Math.min(e.capture, tFin + 2500)), focus: tFin, instantane: null });
      if (atrial) st.cr.wenck = texte; else st.cr.wenckRetro = texte;
      resultat(`${nom} : ${texte}`);
      return false;
    };
    return { nom, etape(tc) {
      while (i < liste.length && liste[i].t + 450 < tc) {
        const x = liste[i++], rep = reponseStim(c, x.t);
        if (!rep.capture || i <= 2) continue; // les deux premiers stimulus peuvent entrer en collision avec le rythme propre
        const conduit = atrial ? rep.H != null : rep.Ahra != null || rep.SA != null;
        if (conduit) { conduits++; $('#proto-etat').textContent = `▶ ${nom} : ${x.cl} ms, conduction 1:1`; continue; }
        return fin(conduits ? `bloc ${atrial ? 'AV' : 'VA'} (Wenckebach) à ${x.cl} ms` : atrial ? `pas de conduction AV dès ${x.cl} ms` : `pas de conduction rétrograde (dissociation VA) dès ${x.cl} ms`, x.t);
      }
      if (i >= liste.length) return fin(`conduction 1:1 conservée jusqu'à ${liste.at(-1).cl} ms`, liste.at(-1).t);
      return true;
    } };
  }

  function protoTRS() {
    reglages();
    const c = st.coeur, base = Math.round(cycleSinusal()), cl = 600, n = 50, site = 'hra';
    choisirSite(site);
    let t = c.t + 150;
    for (let k = 0; k < n; k++) { c.stimuler(site, t, Math.max(r.sortie, 2), r.largeur); t += cl; }
    const der = t - cl;
    noter('salveA', `Protocole : temps de récupération sinusale (salve OD haute 30 s à ${cl} ms ; cycle sinusal ${base} ms)`);
    return { nom: 'Récupération sinusale', etape(tc) {
      if (tc < der + 200) { $('#proto-etat').textContent = `▶ Salve de 30 s : ${Math.max(0, Math.round((der - tc) / 1000))} s restantes`; return true; }
      const trs = recuperationSinusale(c, der);
      if (trs == null && tc < der + 6000) return true;
      const texte = trs == null ? 'pas de reprise sinusale en 6 s (dysfonction sinusale sévère)' : `TRS ${trs} ms (N < 1500), TRS corrigé ${trs - base} ms (N < 525)`;
      st.cr.trs = texte;
      entree(der, 'Fin de salve : récupération sinusale', { debut: der - 3000, capture: der + (trs ?? 6000) + 1500, focus: der + (trs ?? 0) / 2, auto: r.rappelApres });
      resultat(`Récupération sinusale : ${texte}`);
      return false;
    } };
  }

  function protoSeuil() {
    reglages();
    const c = st.coeur, site = siteReel(), cl = arrondi10(Math.min(600, cycleSinusal() - 100));
    const debut = Math.min(Math.max(r.sortie, 1), 4), liste = [];
    let t = c.t + 150;
    for (let s = debut; s >= 0.1 - 1e-9 && liste.length < 60; s = Math.round((s - 0.1) * 10) / 10) { c.stimuler(site, t, s, r.largeur); liste.push({ t, s }); t += cl; }
    noter(null, `Protocole : seuil de capture, ${nomSite()} (${virgule(debut)} → 0,1 mA, impulsion ${virgule(r.largeur)} ms)`, { capture: t + 1000 });
    let i = 0, pertes = 0, dernier = null;
    return { nom: 'Seuil', etape(tc) {
      while (i < liste.length && liste[i].t + 30 < tc) {
        const x = liste[i++], st0 = c.stims.find(s => Math.abs(s.t - x.t) < 0.5);
        if (st0?.capture) { dernier = x.s; pertes = 0; } else if (++pertes >= 2 && dernier != null) {
          c.annulerStims(tc);
          const texte = `${nomSite()} ${virgule(dernier)} mA à ${virgule(r.largeur)} ms`;
          st.cr.seuils.push(texte);
          resultat(`Seuil de capture : ${texte} (réglez la sortie au double du seuil)`);
          return false;
        }
        $('#proto-etat').textContent = `▶ Seuil : ${virgule(x.s)} mA, ${st0?.capture ? 'capture' : 'perte de capture'}`;
      }
      if (i >= liste.length) { resultat(dernier == null ? 'Seuil de capture : pas de capture (sonde mal placée ou tissu inexcitable)' : 'Seuil de capture : < 0,1 mA'); return false; }
      return true;
    } };
  }

  function protoParaHis() {
    reglages();
    const c = st.coeur;
    if (tachycardie(c).active) message('La stimulation para-hisienne s\'interprète en rythme sinusal : arrêtez d\'abord la tachycardie.');
    choisirSite('parahis');
    const cl = arrondi10(Math.min(600, cycleSinusal() - 100)), liste = [];
    let t = c.t + 150;
    for (let k = 0; k < 12; k++) { const mA = Math.floor(k / 2) % 2 ? 5 : 15; c.stimuler('parahis', t, mA, r.largeur); liste.push(t); t += cl; }
    noter('parahis', `Protocole : stimulation para-hisienne à ${cl} ms, 15 et 5 mA alternés`, { debut: liste[0] - 1000, capture: t + 800, focus: liste[5] + cl / 2, auto: r.rappelApres });
    return { nom: 'Para-hisien', etape(tc) {
      if (tc < t + 600) return true;
      // intervalle stimulus-A mesuré sur l'atrium du His et sur l'ostium du SC (sortie d'une voie septale postérieure)
      const sa = { haut: { ras: [], cs9: [] }, bas: { ras: [], cs9: [] } };
      for (const ts of liste.slice(2)) {
        const rep = reponseStim(c, ts), g = rep.his ? sa.haut : sa.bas;
        for (const site of ['ras', 'cs9']) { const a = c.journal.find(x => x.r === `stim:${ts}` && x.s === site)?.t; if (a != null) g[site].push(a - ts); }
      }
      const moy = l => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null);
      const hH = moy(sa.haut.ras), bH = moy(sa.bas.ras), hS = moy(sa.haut.cs9), bS = moy(sa.bas.cs9);
      if (hH == null || bH == null) { resultat('Stimulation para-hisienne : pas de conduction rétrograde mesurable'); return false; }
      const dH = bH - hH, dS = hS != null && bS != null ? bS - hS : null, signe = d => `${d > 0 ? '+' : ''}${d}`;
      const verdict = dS != null && Math.abs(dS) <= 10 ? (dH >= 25 ? 'voie accessoire septale avec fusion nodale (S-A constant à l\'ostium du SC, allongé au His)' : 'conduction rétrograde extranodale (voie accessoire septale)')
        : dH >= 25 ? 'conduction rétrograde nodale' : 'réponse intermédiaire';
      const texte = `S-A au His ${hH} → ${bH} ms (Δ ${signe(dH)}), à l'ostium du SC ${hS ?? '—'} → ${bS ?? '—'} ms${dS != null ? ` (Δ ${signe(dS)})` : ''} en perdant la capture du His → ${verdict}`;
      st.cr.parahis = texte;
      resultat(`Stimulation para-hisienne : ${texte}`);
      return false;
    } };
  }

  function protoESV() {
    const c = st.coeur, t0 = tachycardie(c);
    if (!t0.active) { message('Pas de tachycardie en cours : induisez-la d\'abord.'); return null; }
    const avant = { site: r.site, detection: r.detection, n: r.n, s2: r.s2, s3: r.s3, s4: r.s4, extras: r.extras };
    $('#extras').checked = true;
    choisirSite('rva'); choisirPuce('detection', 'his');
    fixer('#n', 0); fixer('#s2', arrondi10(t0.cycleV - 30)); fixer('#s3', 0); fixer('#s4', 0);
    stimuler();
    // la console retrouve ses réglages : l'ESV programmée garde les siens
    choisirPuce('detection', avant.detection); choisirSite(avant.site);
    for (const k of ['n', 's2', 's3', 's4']) fixer(`#${k}`, avant[k]);
    $('#extras').checked = avant.extras;
    reglages();
    $('#proto-etat').textContent = `▶ ESV His-réfractaire à ${arrondi10(t0.cycleV - 30)} ms (TCL ${Math.round(t0.cycleV)} ms) : résultat dans 3 s`;
    return null;
  }

  function protoEntrainement(siteForce) {
    reglages();
    const c = st.coeur, t0 = tachycardie(c);
    if (!t0.active) { message('Pas de tachycardie en cours : induisez-la d\'abord.'); return null; }
    if (siteForce) choisirSite(siteForce);
    const site = siteReel(), ventr = VENTRICULAIRES.has(site);
    const tcl = ventr ? t0.cycleV : (t0.cycleA ?? t0.cycleV), cl = arrondi10(tcl - (ventr ? 30 : 20));
    const suivis = (ventr ? ['hra'] : ['hra', 'cs1', 'cs9', 'rva']).filter(s => s !== site);
    demarrerSalve(site, cl, { nom: nomSite() });
    const debut = st.salve.debut;
    let entraine = null;
    return { nom: 'Entraînement', etape(tc) {
      if (!st.salve) return false;
      const n = c.stims.filter(s => s.t >= debut && s.s === site).length;
      if (n >= 6 && entraine == null) {
        const ok = suivis.every(s => { const A = activations(c.journal, s, tc - 4 * cl - 50, tc); const d = A.slice(1).map((x, i) => x - A[i]); return d.length >= 3 && d.slice(-3).every(x => Math.abs(x - cl) <= 12); });
        if (ok) { entraine = n; $('#proto-etat').textContent = `▶ Entraînement à ${cl} ms : arrêt dans 3 stimulus`; }
      }
      if (entraine != null && n >= entraine + 3) { arreterSalve(); return false; }
      if (n >= 25) { arreterSalve(); message('Pas d\'entraînement stable après 25 stimulus : essayez un cycle plus court ou vérifiez la capture.'); return false; }
      return true;
    } };
  }

  const PROTOCOLES = { decA: () => protoDecremental(true), decV: () => protoDecremental(false), wenck: () => protoRampe(true), retro: () => protoRampe(false),
    trs: protoTRS, seuil: protoSeuil, parahis: protoParaHis, esv: protoESV, entrV: () => protoEntrainement('rva'), entrSite: () => protoEntrainement(null) };
  function lancerProtocole(id) {
    toutArreter({ silencieux: true });
    vibrer();
    const p = PROTOCOLES[id]();
    if (p) { st.proto = p; if (!$('#proto-etat').textContent) $('#proto-etat').textContent = `▶ ${p.nom} en cours…`; }
    majBoutonStim();
  }
  function toutArreter({ silencieux = false, rf = true } = {}) {
    const c = st.coeur;
    const actif = st.proto || st.salve || (rf && st.rf) || c.tas.a.some(e => e.type === 'stim' && e.t > c.t);
    st.proto = null;
    $('#proto-etat').textContent = '';
    if (st.salve) arreterSalve();
    c.annulerStims(c.t);
    c.ecouteurs = [];
    if (rf) arreterRF();
    if (!silencieux && actif) { noter(null, 'Stop : stimulation interrompue'); $('#proto-etat').textContent = 'Arrêté.'; }
  }

  // ---------- radiofréquence : générateur, lésion progressive, rythme jonctionnel, bloc AV ----------
  function demarrerRF() {
    reglages();
    const pos = positionActuelle(), cryo = pos.id === 'cryo-his';
    // contact : qualité d'appui de la sonde, tirée à chaque tir (impédance de départ plus basse quand l'appui est bon)
    const contact = 0.55 + 0.45 * Math.random();
    st.rf = { debut: st.t, pos, cryo, contact, imp0: Math.round(120 - 25 * contact + 6 * Math.random()), lesion: 0, applique: false, junct: false, alerteVA: false,
      temp: 37, imp: 0, tMax: 37, derive: pos.id === 'koch' ? 25000 + 20000 * Math.random() : Infinity };
    $('#ablater').setAttribute('aria-pressed', 'true'); $('#ablater').textContent = cryo ? 'Arrêter la cryothérapie' : 'Arrêter le tir';
    noter(null, `Radiofréquence : ${cryo ? 'cryothérapie' : `tir ${r.puissance} W`}, ${pos.nom}`, { debut: st.t - 3000, capture: st.t + 8000 });
  }
  function arreterRF(silencieux = false) {
    const rf = st.rf; if (!rf) return;
    st.rf = null;
    st.coeur?.jonction(null);
    $('#ablater').setAttribute('aria-pressed', 'false'); $('#ablater').textContent = 'Radiofréquence';
    const duree = Math.round((st.t - rf.debut) / 1000);
    st.cr?.tirs.push({ pos: rf.pos.nom, duree, puissance: rf.cryo ? 'cryo' : `${r.puissance} W`, efficace: rf.applique, tMax: Math.round(rf.tMax) });
    if (!silencieux) noter(null, `Fin du tir : ${duree} s, ${Math.round(rf.tMax)} °C ${rf.cryo ? 'min' : 'max'}`, { debut: rf.debut - 2000, capture: st.t + 2500, auto: r.rappelApres });
    $('#rf-etat').textContent = `Dernier tir : ${duree} s${rf.applique ? ', lésion constituée' : ', lésion incomplète'}`;
  }
  function etapeRF(dt) {
    const rf = st.rf, c = st.coeur, el = st.t - rf.debut;
    if (rf.cryo) rf.temp = 37 - 112 * rf.contact * (1 - Math.exp(-el / 4000));
    else rf.temp = 37 + (14 + 0.3 * r.puissance) * rf.contact * (1 - Math.exp(-el / 2500));
    rf.tMax = rf.cryo ? Math.min(rf.tMax, rf.temp) : Math.max(rf.tMax, rf.temp);
    rf.imp = Math.round(rf.cryo ? rf.imp0 + 60 * (1 - Math.exp(-el / 6000)) : rf.imp0 - 12 * Math.min(1, rf.lesion));
    // la lésion se constitue en ≈ 9 s à 30 W avec un bon appui (plus lentement en cryothérapie)
    rf.lesion += dt / ((rf.cryo ? 30000 : 9000 * 30 / Math.max(5, r.puissance)) / rf.contact);
    if (rf.lesion >= 1 && !rf.applique) {
      rf.applique = true;
      const touchees = c.ablater(rf.pos.cibles);
      if (touchees.includes('nav') || touchees.includes('rapide')) message('Bloc AV : la voie nodale rapide a été détruite.');
    }
    if (!rf.cryo && ['koch', 'his'].includes(rf.pos.id)) {
      if (!rf.junct && el > 2000) { rf.junct = true; c.jonction(rf.pos.id === 'his' ? 420 : 560 + Math.round(120 * Math.random())); }
      // près du His : l'AH s'allonge dès le début ; sur la voie lente, lésion du nœud si la sonde dérive au fil d'un tir prolongé
      if (rf.pos.id === 'his' && el > 2500) c.leserNoeud(dt * 0.03);
      if (rf.pos.id === 'koch' && el > rf.derive) c.leserNoeud(dt * 0.025);
      // rythme jonctionnel sans conduction VA : signe d'alarme
      if (rf.junct && !rf.alerteVA) {
        const J = c.journal.filter(x => x.s === 'his' && x.o === 'auto' && x.t > st.t - 2500 && x.t < st.t - 300);
        if (J.length >= 2 && J.slice(-2).every(j => !c.journal.some(a => a.s === 'ras' && a.r === j.r && a.t - j.t < 260))) {
          rf.alerteVA = true;
          message('⚠ Rythme jonctionnel sans conduction VA : risque de bloc AV, arrêtez le tir !');
          noter(null, 'Alerte : rythme jonctionnel sans conduction VA', { debut: st.t - 5000, capture: st.t + 1000, auto: true });
        }
      }
    }
    $('#rf-etat').textContent = `${rf.cryo ? 'Cryo' : `${r.puissance} W`} · ${Math.round(rf.temp)} °C · ${rf.imp} Ω · ${Math.round(el / 1000)} s · contact ${rf.contact > 0.8 ? 'bon' : rf.contact > 0.65 ? 'moyen' : 'faible'}`;
    if (el >= r.dureeRF * 1000) arreterRF();
  }

  // ---------- cartographie : activation locale aux positions visitées pendant la tachycardie ----------
  function acquerirPoint() {
    const c = st.coeur, pos = positionActuelle(), tach = tachycardie(c, st.t);
    if (!tach.active || !pos) return;
    const atrial = !!pos.a, site = pos.a || pos.v, ref = atrial ? 'cs9' : 'vsep', tcl = atrial ? (tach.cycleA ?? tach.cycleV) : (tach.cycleV ?? tach.cycleA);
    if (!site) return;
    const lat = site === ref ? 0 : tempsLocal(c.journal, site, ref, st.t, tcl);
    if (lat != null) { st.carte[pos.id] = { lat, atrial }; majCarte(); }
  }
  function couleurLAT(v, min, max) { const u = max > min ? (v - min) / (max - min) : 0; return `hsl(${Math.round(u * 270)} 85% 55%)`; }
  function majCarte() {
    for (const g of app.querySelectorAll('.pt')) {
      g.classList.toggle('ici', g.dataset.pos === st.position);
      if (!st.carte[g.dataset.pos]) { g.querySelector('circle').style.fill = ''; $(`#lat-${g.dataset.pos}`).textContent = ''; }
    }
    const pts = Object.values(st.carte);
    for (const type of [true, false]) {
      const l = pts.filter(p => p.atrial === type).map(p => p.lat), min = Math.min(...l), max = Math.max(...l);
      for (const [id, p] of Object.entries(st.carte)) if (p.atrial === type) {
        const g = $(`.pt[data-pos="${id}"]`); if (!g) continue;
        g.querySelector('circle').style.fill = couleurLAT(p.lat, min, max);
        $(`#lat-${id}`).textContent = p.lat;
      }
    }
  }
  function placerSonde(id) {
    if (id === st.position) return;
    st.position = id; $('#position').value = id;
    const c = st.coeur, pos = positionActuelle();
    if (tachycardie(c).active) { st.positionsTachy.add(st.position); if (st.positionsTachy.size >= 2) st.faites.add('cartographie'); }
    if (st.rf) arreterRF();
    noter(null, `Sonde d'ablation : ${pos.nom}`);
    // contact du cathéter : extrasystoles mécaniques, parfois bloc transitoire d'une voie accessoire (« bump »)
    if (Math.random() < 0.35) {
      const site = pos.v && Math.random() < 0.6 ? pos.v : pos.a || pos.v;
      c.ectopie(site, c.t + 40);
      if (Math.random() < 0.4) c.ectopie(site, c.t + 360 + 80 * Math.random());
    }
    const vacc = pos.cibles.find(x => x.startsWith('vacc'));
    if (vacc && Math.random() < 0.25 && c.bloquer(vacc, 20000 + 40000 * Math.random())) st.bump = { voie: vacc, t: c.t };
    majCarte(); st.sale = true;
  }

  // ---------- compte rendu ----------
  function compteRendu() {
    const sc = SCENARIOS[st.scenario], cr = st.cr, c = st.coeur, b = cr.base;
    const ligne = (lib, v) => `<tr><th>${lib}</th><td>${v ? esc(v) : '<span class="note">non réalisé</span>'}</td></tr>`;
    const ext = (x, atrial) => x && [`${x.n} × ${x.s1} ms`, x.pr ? `PR ${atrial ? 'atriale' : 'ventriculaire'} ${x.pr} ms` : '', x.prConduction ? `PR ${atrial ? 'nodale' : 'rétrograde'} ${x.prConduction} ms` : '',
      x.saut || '', x.induction ? `induction à S2 = ${x.induction} ms` : ''].filter(Boolean).join(' ; ');
    const blocAV = c.voies.some(v => v.nodale && v.coupee && v.id !== 'lente') && !(sc.cible && [].concat(sc.cible).includes('rapide'));
    const conclusion = st.mystere ? ($('#verdict').textContent ? `Diagnostic proposé : ${$('#reponse').selectedOptions[0]?.text}` : 'Diagnostic non encore proposé') : sc.nom;
    const rows = [
      ligne('Indication', sc.contexte),
      ligne('Rythme de base', b && `cycle ${f0(b.cycleA)} ms, AH ${f0(b.AH)} ms, HV ${f0(b.HV)} ms${b.pa ? ` ; PA ${b.pa.sys}/${b.pa.dia} mmHg` : ''}`),
      ligne('Conduction AV (rampe)', cr.wenck), ligne('Conduction VA (rampe)', cr.wenckRetro),
      ligne('Extrastimulus atrial', ext(cr.extraA, true)), ligne('Extrastimulus ventriculaire', ext(cr.extraV, false)),
      ligne('Fonction sinusale', cr.trs), ligne('Seuils de capture', cr.seuils.join(' ; ')), ligne('Para-hisien', cr.parahis),
      ligne('Inductibilité', cr.inductions.map(i => `tachycardie à ${f0(i.cycleV)} ms (A ${f0(i.cycleA)}), VA ${f0(i.VA)} ms, activation atriale la plus précoce : ${i.precoce ?? '—'}`).join(' ; ')
        || (st.faites.has('extraA') || st.faites.has('extraV') ? 'non inductible' : '')),
      ligne('Manœuvres', st.analyses.filter(a => /Entraînement|ESV/.test(a)).join(' ; ')),
      ligne('Cartographie', Object.keys(st.carte).length ? Object.entries(st.carte).sort((x, y) => x[1].lat - y[1].lat).map(([id, p]) => `${POSITIONS.find(q => q.id === id).nom} ${p.lat} ms`).join(', ') : ''),
      ligne('Ablation', cr.tirs.map(t => `${t.pos} : ${t.puissance}, ${t.duree} s, ${t.tMax} °C${t.efficace ? ', lésion constituée' : ''}`).join(' ; ')),
      ligne('Complications', [blocAV ? 'bloc AV complet' : '', cr.hypotension ? 'tachycardie mal tolérée (hypotension)' : ''].filter(Boolean).join(', ') || 'aucune'),
      ligne('Conclusion', conclusion),
    ];
    const texte = () => [...$('#compte-rendu').querySelectorAll('tr')].map(tr => `${tr.cells[0].textContent} : ${tr.cells[1].textContent}`).join('\n');
    $('#compte-rendu').innerHTML = `<h2>Compte rendu d'exploration électrophysiologique</h2>
      <table class="simu-cr-table">${rows.join('')}</table>
      <div class="actions serre gauche"><button class="btn" id="cr-copier">Copier le texte</button><button class="btn" id="cr-fermer">Fermer</button></div>`;
    $('#compte-rendu').hidden = false;
    $('#cr-copier').onclick = async () => { try { await navigator.clipboard.writeText(`Compte rendu d'EEP\n${texte()}`); message('Compte rendu copié.'); } catch { message('Copie impossible : sélectionnez le texte.'); } };
    $('#cr-fermer').onclick = () => { $('#compte-rendu').hidden = true; };
    $('#compte-rendu').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- événements de la console ----------
  $('#scenario').onchange = e => choisir(e.target.value);
  // Stimuler devient Stop tant qu'une stimulation, une salve ou un protocole est en cours
  const stimEnCours = () => { const c = st.coeur; return !!(st.proto || st.salve || c.ecouteurs.length || c.tas.a.some(e => e.type === 'stim' && e.t > c.t)); };
  function majBoutonStim() {
    const b = $('#stimuler'), actif = stimEnCours();
    if (b.classList.contains('btn-stop') === actif) return;
    b.textContent = actif ? 'Stop' : 'Stimuler';
    b.classList.toggle('btn-stop', actif); b.classList.toggle('btn-primaire', !actif);
    b.setAttribute('aria-label', actif ? 'Arrêter la stimulation en cours' : 'Stimuler');
  }
  $('#stimuler').onclick = () => { if (stimEnCours()) toutArreter({ rf: false }); else stimuler(); majBoutonStim(); };
  $('#extras').addEventListener('change', e => { $('#extras-bloc').hidden = !e.target.checked; reglages(); });
  $('#salve').onclick = () => {
    reglages();
    if (st.salve) { st.proto = null; arreterSalve(); return; }
    vibrer();
    demarrerSalve(siteReel(), r.salveCl);
  };
  $('#rampe').onclick = () => {
    reglages();
    const site = siteReel(), c = st.coeur, t0 = c.t + 150;
    let t = t0, n = 0;
    for (let cl = r.rampeDebut; cl >= r.rampeFin && n < 200; cl -= r.rampePas) for (let k = 0; k < 4; k++, n++) { c.stimuler(site, t, r.sortie, r.largeur); t += cl; }
    noter(VENTRICULAIRES.has(site) ? 'stimV' : 'extraA', `Rampe ${r.rampeDebut} → ${r.rampeFin} ms (pas ${r.rampePas} ms, 4 stimulus par palier)`,
      { debut: t0 - 1500, capture: t + 1500, auto: r.rappelApres });
  };
  $('#enregistrer').onclick = () => { reglages(); noter(null, 'Enregistrement', { debut: st.t - 10000, capture: st.t, auto: true }); };
  $('#adenosine').onclick = () => { st.coeur.injecterAdenosine(); noter('adenosine'); };
  const basculer = (nom, type) => {
    const on = st.coeur.basculerMedicament(nom);
    $(`#${nom}`).setAttribute('aria-pressed', String(on)); $(`#${nom}`).classList.toggle('actif', on);
    noter(on ? type : null);
  };
  $('#iso').onclick = () => basculer('iso', 'iso');
  $('#atropine').onclick = () => basculer('atropine', null);
  $('#choc').onclick = () => { st.coeur.choc(); noter(null); };
  $('#reinit').onclick = () => nouveauCoeur();
  $('#position').onchange = e => placerSonde(e.target.value);
  $('#carte').addEventListener('click', e => { const g = e.target.closest('[data-pos]'); if (g) placerSonde(g.dataset.pos); });
  $('#carte').addEventListener('keydown', e => { const g = e.target.closest('[data-pos]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); placerSonde(g.dataset.pos); } });
  $('#carte-effacer').onclick = () => { st.carte = {}; majCarte(); };
  $('#ablater').onclick = () => (st.rf ? arreterRF() : demarrerRF());
  $('#cr-generer').onclick = compteRendu;
  for (const b of app.querySelectorAll('[data-proto]')) b.onclick = () => lancerProtocole(b.dataset.proto);
  $('#site').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) choisirPuce('site', b.dataset.v); });
  $('#detection').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) choisirPuce('detection', b.dataset.v); });
  // onglets : toucher l'onglet ouvert replie la console (le tracé garde toute la place)
  const console_ = $('#console');
  const replier = v => { console_.classList.toggle('repliee', v); $('#replier').setAttribute('aria-expanded', String(!v)); $('#replier').textContent = v ? '▴' : '▾'; };
  $('.simu-onglets').addEventListener('click', e => {
    const b = e.target.closest('[data-onglet]'); if (!b) return;
    if (b.dataset.onglet === r.onglet && !console_.classList.contains('repliee')) { replier(true); return; }
    r.onglet = b.dataset.onglet; ecrire(r); replier(false);
    for (const x of app.querySelectorAll('[data-onglet]')) x.setAttribute('aria-selected', String(x === b));
    for (const p of app.querySelectorAll('.simu-pan')) p.hidden = p.id !== `pan-${r.onglet}`;
  });
  $('#replier').onclick = () => replier(!console_.classList.contains('repliee'));
  // boutons ± : un appui = un pas, appui long = défilement rapide
  let repete = null;
  const pasSuivant = b => {
    const inp = $(`#${b.dataset.cible}`), d = +b.dataset.delta, min = +inp.min, max = +inp.max;
    const depart = { s2: 400, s3: 300, s4: 250 }[inp.id]; // extrastimulus désactivé (0) : « + » propose un couplage usuel
    const v = !(+inp.value) && d > 0 && depart ? depart : Math.round(((+inp.value || 0) + d) * 10) / 10;
    inp.value = Math.max(min, Math.min(max, v));
    inp.dispatchEvent(new Event('change'));
  };
  const finRepete = () => { clearTimeout(repete); repete = null; };
  console_.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn-pas'); if (!b) return;
    e.preventDefault(); pasSuivant(b);
    finRepete(); repete = setTimeout(function boucleR() { pasSuivant(b); repete = setTimeout(boucleR, 70); }, 420);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) console_.addEventListener(ev, finRepete);
  console_.addEventListener('keydown', e => { const b = e.target.closest('.btn-pas'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pasSuivant(b); } });
  for (const id of ['#sortie', '#largeur', '#s1', '#n', '#s2', '#s3', '#s4', '#rappel-apres', '#decrement', '#salve-cl', '#rampe-debut', '#rampe-fin', '#rampe-pas', '#puissance', '#duree-rf',
    '#vitesse', '#mode', '#bruit', '#etiquettes', '#filtre50', '#passe-haut']) $(id).addEventListener('change', reglages);
  // montage : jeu de voies prédéfini ; chaque voie peut ensuite être ajoutée ou enlevée (montage personnalisé)
  function majVoies() {
    for (const b of app.querySelectorAll('[data-voie]')) b.setAttribute('aria-pressed', String(r.voies.includes(b.dataset.voie)));
    $('#voies-nb').textContent = r.voies.length;
    $('#montage').value = r.montage;
    ecrire(r); st.sale = true;
  }
  $('#montage').addEventListener('change', e => {
    if (e.target.value === 'perso') { r.montage = 'perso'; majVoies(); return; }
    r.montage = e.target.value; r.voies = [...MONTAGES[r.montage].voies]; majVoies();
  });
  $('#voies-bloc').addEventListener('click', e => {
    const b = e.target.closest('[data-voie]'); if (!b) return;
    const id = b.dataset.voie, avec = !r.voies.includes(id);
    if (!avec && r.voies.length <= 1) { message('Gardez au moins une voie.'); return; }
    const choisies = avec ? [...r.voies, id] : r.voies.filter(x => x !== id);
    r.voies = CANAUX.map(c => c.id).filter(x => choisies.includes(x)); // ordre habituel de la baie
    const pareil = Object.entries(MONTAGES).find(([, m]) => m.voies.length === r.voies.length && m.voies.every(x => r.voies.includes(x)));
    r.montage = pareil ? pareil[0] : 'perso';
    majVoies();
  });
  majVoies();
  for (const id of ['#vitesse', '#mode', '#bruit', '#etiquettes', '#filtre50', '#passe-haut']) $(id).addEventListener('change', () => { st.sale = true; });

  // ---------- navigation dans l'enregistrement rappelé ----------
  // recul : distance (ms) entre la fin de l'instantané et la fin de la fenêtre affichée
  const reculMax = () => { const i = st.rappel?.instantane; return i ? Math.max(0, Math.round(i.t - i.debut - fenetreMs(canvasR.clientWidth || 300, r.vitesseRappel))) : 0; };
  function majRecul() {
    const max = reculMax();
    st.recul = Math.max(0, Math.min(max, st.recul));
    $('#recul').max = max; $('#recul').value = max - st.recul; // curseur de gauche (début) à droite (fin)
    $('#recul').disabled = !max;
    $('#recul-val').textContent = st.recul ? `−${(st.recul / 1000).toFixed(1)} s` : '';
    st.sale = true;
  }
  $('#recul').oninput = e => { st.recul = reculMax() - +e.target.value; majRecul(); };
  const page = sens => { st.recul -= sens * fenetreMs(canvasR.clientWidth || 300, r.vitesseRappel) * 0.8; majRecul(); };
  $('#arriere').onclick = () => page(-1);
  $('#avant').onclick = () => page(1);
  $('#vitesse-rappel').addEventListener('change', () => { reglages(); majRecul(); });
  $('#evt-prec').onclick = () => rappelVoisin(-1);
  $('#evt-suiv').onclick = () => rappelVoisin(1);
  $('#journal').onclick = e => { const b = e.target.closest('[data-evt]'); if (b) { rappeler(st.actions.find(a => a.id === +b.dataset.evt)); if (compact()) montrer('rappel'); } };
  $('#compas-plus').onclick = () => { st.nouveauCompas = true; message('Faites glisser sur l\'écran de rappel pour poser le nouveau compas.'); };
  $('#compas-report').onclick = () => { st.report = !st.report; st.sale = true; $('#compas-report').classList.toggle('actif', st.report); };
  $('#compas-effacer').onclick = () => { st.curseurs = []; st.sale = true; };
  $('#aimant').onclick = () => { r.aimant = !r.aimant; ecrire(r); $('#aimant').classList.toggle('actif', r.aimant); $('#aimant').setAttribute('aria-pressed', String(r.aimant)); };
  $('#comparer').onclick = () => {
    if (!st.rappel?.instantane) { message('Rappelez d\'abord un événement.'); return; }
    st.reference = st.rappel; $('#reference').hidden = false; $('#reference-titre').textContent = `${hms(st.reference.t)} · ${st.reference.texte}`; st.sale = true;
    message('Référence gardée : rappelez un autre événement pour comparer.');
  };
  $('#reference-fermer').onclick = () => { st.reference = null; $('#reference').hidden = true; };

  // ---------- téléphone : paysage, un écran à la fois, glisser pour changer d'écran ----------
  $('#btn-paysage').onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await screen.orientation.lock('landscape');
    } catch { message('Tournez votre téléphone (et désactivez le verrouillage de la rotation) pour passer en paysage.'); }
  };
  function montrer(vue) {
    st.vue = vue; baie.dataset.vue = vue; st.sale = true;
    for (const b of app.querySelectorAll('.simu-bascule [data-vue]')) b.setAttribute('aria-selected', String(b.dataset.vue === vue));
    if (vue === 'rappel') $('#bascule-nouveau').hidden = true;
    majRecul();
  }
  $('.simu-bascule').addEventListener('click', e => { const b = e.target.closest('[data-vue]'); if (b) montrer(b.dataset.vue); });
  canvasMini.addEventListener('click', () => montrer('direct'));
  let depart = null;
  $('.simu-ecrans').addEventListener('pointerdown', e => { depart = compact() && e.target !== canvasR && e.isPrimary ? { x: e.clientX, y: e.clientY } : null; });
  $('.simu-ecrans').addEventListener('pointerup', e => {
    if (!depart) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y; depart = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) montrer(dx < 0 ? 'rappel' : 'direct');
  });

  // ---------- gains, pincement (vitesse) et compas aimantés ----------
  // Toucher le tracé en temps réel ne l'arrête pas : les mesures se font sur l'écran de rappel.
  let geo = null, geoR = null, glisse = false, aimants = [];
  const gain = (cv, g, e) => {
    const b = cv.getBoundingClientRect();
    if (e.clientX - b.left >= marges(cv.clientWidth)) return false;
    const y = e.clientY - b.top, rangee = (g?.rangees || []).find(x => y >= x.y0 && y < x.y1);
    if (rangee) { const cycle = [1, 2, 4, 0.5], g0 = st.gains[rangee.id] || 1; st.gains[rangee.id] = cycle[(cycle.indexOf(g0) + 1) % cycle.length]; st.sale = true; }
    return true;
  };
  // pincer : écarter les doigts accélère le déroulement (plus de détail), les rapprocher le ralentit
  const pincer = (cv, cle, auDebut) => {
    const doigts = new Map(); let d0 = null;
    const dist = () => { const [a, b] = [...doigts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    cv.addEventListener('pointerdown', e => { doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (doigts.size === 2) { d0 = dist(); auDebut?.(); } });
    cv.addEventListener('pointermove', e => {
      if (!doigts.has(e.pointerId)) return;
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size !== 2 || !d0) return;
      const k = dist() / d0, i = VITESSES.indexOf(r[cle]);
      if (k > 1.3 || k < 0.77) {
        const j = Math.max(0, Math.min(VITESSES.length - 1, i + (k > 1 ? 1 : -1)));
        r[cle] = VITESSES[j]; $(cle === 'vitesse' ? '#vitesse' : '#vitesse-rappel').value = String(VITESSES[j]); ecrire(r); d0 = dist(); majRecul();
      }
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(ev, e => { doigts.delete(e.pointerId); if (doigts.size < 2) d0 = null; });
    return () => doigts.size;
  };
  canvas.addEventListener('pointerdown', e => gain(canvas, geo, e));
  pincer(canvas, 'vitesse');
  const nbDoigtsR = pincer(canvasR, 'vitesseRappel', () => { glisse = false; const d = st.curseurs.at(-1); if (d && d[1] == null) st.curseurs.pop(); st.sale = true; });
  const temps = e => { const b = canvasR.getBoundingClientRect(); return geoR?.t0 != null ? geoR.t0 + (e.clientX - b.left - geoR.marge) / geoR.pxms : null; };
  const aimanter = t => {
    if (!r.aimant || t == null || !aimants.length || !geoR) return t;
    let best = t, dmin = 10 / geoR.pxms;
    for (const x of aimants) { const d = Math.abs(x - t); if (d < dmin) { dmin = d; best = x; } }
    return best;
  };
  canvasR.addEventListener('pointerdown', e => {
    if (gain(canvasR, geoR, e) || !st.rappel || nbDoigtsR() > 1) return;
    const t = temps(e); if (t == null) return;
    const y = e.clientY - canvasR.getBoundingClientRect().top;
    const rangee = (geoR?.rangees || []).find(x => y >= x.y0 && y < x.y1)?.id;
    aimants = rangee ? evenementsCanal(rangee, st.rappel.instantane, st.rappel.instantane.ablation) : [];
    const ta = aimanter(t);
    if (st.nouveauCompas || !st.curseurs.length) { st.curseurs.push([ta, null]); if (st.curseurs.length > 3) st.curseurs.shift(); st.nouveauCompas = false; }
    else st.curseurs[st.curseurs.length - 1] = [ta, null];
    glisse = true; st.sale = true; canvasR.setPointerCapture(e.pointerId);
  });
  canvasR.addEventListener('pointermove', e => { if (glisse && st.curseurs.length && nbDoigtsR() < 2) { st.curseurs.at(-1)[1] = aimanter(temps(e)); st.sale = true; } });
  canvasR.addEventListener('pointerup', () => { glisse = false; });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (canvasR.isConnected) majRecul(); }).observe(canvasR);

  // ---------- boucle d'animation ----------
  let dernier = performance.now(), dernierePos = 0;
  const etat = $('#etat'), zoneMesures = $('#mesures'), zoneVitaux = $('#constantes');
  const optionsTrace = () => ({ voies: r.voies, gains: st.gains, etiquettes: r.etiquettes, bruit: r.bruit, filtre50: r.filtre50, passeHaut: r.passeHaut,
    hauteurMax: compact() ? Math.max(200, innerHeight - 96) : innerWidth < 700 ? Math.round(innerHeight * 0.48) : 0 });
  const htmlMesures = m => `<span>A-A <b>${f0(m.cycleA)}</b></span><span>V-V <b>${f0(m.cycleV)}</b></span><span>AH <b>${f0(m.AH)}</b></span><span>HV <b>${f0(m.HV)}</b></span><span>VA <b>${f0(m.VA)}</b></span>`;
  const NOMS_PRECOCE = { hra: 'OD haute', ras: 'His', cs9: 'SC proximal', cs7: 'SC 7-8', cs5: 'SC 5-6', cs3: 'SC 3-4', cs1: 'SC distal' };
  function image(maintenant) {
    if (!canvas.isConnected) { arreterSimulateur(); return; }
    const dt = Math.min(100, maintenant - dernier); dernier = maintenant;
    const c = st.coeur;
    const cible = st.t + dt;
    if (st.salve) while (st.salve.prochain < cible + 400) { c.stimuler(st.salve.site, st.salve.prochain, st.salve.sortie, st.salve.largeur); st.salve.prochain += st.salve.cl; }
    c.avancer(cible); st.t = cible;
    if (st.proto && !st.proto.etape(st.t)) st.proto = null;
    majBoutonStim();
    if (st.rf) etapeRF(dt);
    let capture = false;
    for (const e of st.actions) if (!e.instantane && st.t >= e.capture) {
      capturer(e); capture = true;
      if (e.auto || e === st.demande) rappeler(e);
    }
    if (capture) rendreJournal();
    const o = optionsTrace();
    if (!compact() || st.vue === 'direct') geo = dessinerSimu(canvas, c, { tFin: st.t, vitesse: r.vitesse, mode: r.mode, ablation: ablationVue(), ...o });
    else if (canvasMini.offsetParent) dessinerSimu(canvasMini, c, { tFin: st.t, vitesse: 25, mode: 'balayage', voies: ['II', 'hisd', 'pa'], bruit: false, hauteurMax: 96 });
    const inst = st.rappel?.instantane;
    if (st.sale && canvasR.offsetParent) {
      st.sale = false;
      if (!inst) { // écran de rappel vide : quadrillage seul
        geoR = dessinerSimu(canvasR, { journal: [], stims: [] }, { tFin: 0, vitesse: r.vitesseRappel, mode: 'defilement', ...o, bruit: false });
        $('#mesures-rappel').innerHTML = '';
      } else {
        const tFin = inst.t - st.recul;
        geoR = dessinerSimu(canvasR, inst, { tFin, vitesse: r.vitesseRappel, mode: 'defilement', curseurs: st.curseurs, report: st.report, ablation: inst.ablation, ...o });
        $('#mesures-rappel').innerHTML = htmlMesures(mesures(inst, tFin));
      }
      const ref = st.reference?.instantane;
      if (ref && canvasRef.offsetParent) {
        const reculRef = Math.min(st.recul, Math.max(0, ref.t - ref.debut - fenetreMs(canvasRef.clientWidth || 300, r.vitesseRappel)));
        dessinerSimu(canvasRef, ref, { tFin: ref.t - reculRef, vitesse: r.vitesseRappel, mode: 'defilement', ablation: ref.ablation, ...o, hauteurMax: 0 });
      }
    }
    if (maintenant - st.dernierMaj > 250) {
      st.dernierMaj = maintenant;
      const m = mesures(c, st.t), pa = constantes(c.journal, st.t);
      // rythme jonctionnel accéléré pendant un tir : ce n'est pas une tachycardie induite
      const jonctionnel = !!st.rf?.junct, tach = jonctionnel ? { active: false } : tachycardie(c, st.t);
      if (!st.cr.base && st.t > 7000) st.cr.base = { ...m, pa };
      if (tach.active && !st.tachyAvant) {
        noter('induction', `Tachycardie (A ${Math.round(tach.cycleA ?? 0)} / V ${Math.round(tach.cycleV ?? 0)} ms)`);
        const V = battementsV(c.journal, st.t - 1500, st.t).at(-2);
        st.cr.inductions.push({ cycleA: tach.cycleA, cycleV: tach.cycleV, VA: m.VA, precoce: V != null ? NOMS_PRECOCE[sitePlusPrecoce(c.journal, V, V + 400)] : null });
      }
      st.tachyAvant = tach.active;
      if (c.evenements.some(e => !e.vu)) majJournal();
      zoneMesures.innerHTML = htmlMesures(m);
      // constantes : alerte si la pression moyenne reste < 60 mmHg plus de 8 s
      if (pa) {
        st.hypo = pa.moy < 60 ? st.hypo + 1 : 0;
        if (st.hypo === 32) {
          st.cr.hypotension = true;
          message('⚠ Hypotension : tachycardie mal tolérée, arrêtez-la (stimulation, adénosine ou choc).');
          noter(null, `Hypotension ${pa.sys}/${pa.dia} mmHg`, { debut: st.t - 8000, capture: st.t + 500, auto: true });
        }
        const spo2 = pa.moy < 55 ? 94 : pa.moy < 65 ? 96 : 98;
        zoneVitaux.innerHTML = `PA <b class="${pa.moy < 60 ? 'alerte' : ''}">${pa.sys}/${pa.dia}</b> SpO₂ <b>${spo2} %</b>`;
      }
      // carte : point acquis quand la sonde reste en place pendant la tachycardie
      if (tach.active && maintenant - dernierePos > 1500) { dernierePos = maintenant; acquerirPoint(); }
      const ad = c.adenosine && st.t < c.adenosine.fin + 500, iso = c.niveau('iso', st.t);
      etat.textContent = [st.proto ? `▶ ${st.proto.nom}` : '', jonctionnel ? 'Rythme jonctionnel' : '', st.salve ? `Salve ${st.salve.cl} ms` : '', st.rf ? `${st.rf.cryo ? 'Cryo' : 'RF'} ${Math.round(st.rf.temp)} °C ${Math.round((st.t - st.rf.debut) / 1000)} s` : '',
        ad ? 'Adénosine' : '', iso > 0.05 ? `Isoprénaline ${Math.round(iso * 100)} %` : '', c.fa ? 'FA' : '',
        tach.active ? `Tachycardie (${tach.cycleA != null && tach.cycleV != null && Math.abs(tach.cycleA - tach.cycleV) > 20 ? `A ${Math.round(tach.cycleA)} / V ${Math.round(tach.cycleV)}` : `cycle ${Math.round(tach.cycleV ?? tach.cycleA)}`} ms)` : ''].filter(Boolean).join(' · ');
    }
    boucle = requestAnimationFrame(image);
  }

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
      ${st.bump ? '<p class="note">Un contact de la sonde a pu bloquer transitoirement la voie accessoire (« bump ») : la préexcitation disparaît sans tir, puis revient.</p>' : ''}
      <h4>Traitement</h4><p>${st.scenario === 'fa' ? (ablInutile ? '✗ Tir sans cible modélisée.' : '✓ Isolation des veines pulmonaires indiquée (non modélisée ici).') : cible.length ? (sc.ablationOptionnelle && !tire ? `✓ Abstention ou traitement médical acceptables ; si ablation : ${esc(posNom)}.` : ablOk ? `✓ Substrat détruit (${esc(posNom)}).` : `✗ Substrat non traité ; cible attendue : ${esc(posNom)}.`) : ablInutile ? '✗ Tir de radiofréquence sans cible arythmogène.' : '✓ Pas d\'ablation nécessaire.'}${blocAV ? ' <b>✗ Bloc AV iatrogène.</b>' : ''}</p>
      <div class="actions serre gauche"><button class="btn btn-primaire" id="autre">Nouveau cas mystère</button><button class="btn" id="cr-verdict">Compte rendu</button></div></div>`;
    $('#autre').onclick = () => choisir('mystere');
    $('#cr-verdict').onclick = compteRendu;
  };

  const initial = choixInitial; choixInitial = null;
  if (initial) { $('#scenario').value = initial; choisir(initial); } else nouveauCoeur();
  majResume();
  boucle = requestAnimationFrame(image);
}
