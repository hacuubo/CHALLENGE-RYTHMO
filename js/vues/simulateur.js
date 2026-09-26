// Simulateur d'électrophysiologie : baie (temps réel et écran de rappel), console de stimulation toujours à portée du pouce,
// protocoles automatiques, sonde d'ablation avec générateur de radiofréquence et cartographie, constantes du patient,
// cas mystères notés et compte rendu d'exploration.
import { Coeur, SITES_ATRIAUX, seuilCapture } from '../simu/moteur.js';
import { SCENARIOS, MYSTERES, ARRIVEES, scenario, SITES_STIM, SITES_DETECTION, POSITIONS } from '../simu/scenarios.js';
import { dessinerSimu, MONTAGES, VITESSES, CANAUX, VOIES_SITE, fenetreMs, marges, evenementsCanal } from '../simu/trace.js';
import { mesures, tachycardie, analyserEntrainement, analyserESV, reponseStim, recuperationSinusale, constantes, tempsLocal,
  activations, battementsV, sitePlusPrecoce, induireTachycardie } from '../simu/analyse.js';
import { esc, melanger } from '../util.js';
import { t } from '../i18n.js';

let boucle = null;
let choixInitial = null; // scénario choisi sur l'écran de choix (ou 'mystere')
export function preparerSimulateur(choix) { choixInitial = choix; }
export function arreterSimulateur() { if (boucle) cancelAnimationFrame(boucle); boucle = null; }

const REGLAGES = 'rythmo.simu';
const lire = () => { try { return JSON.parse(localStorage.getItem(REGLAGES)) || {}; } catch { return {}; } };
const ecrire = r => { try { localStorage.setItem(REGLAGES, JSON.stringify(r)); } catch { /* stockage indisponible */ } };

// libellés évalués à l'affichage, dans la langue courante
const MANOEUVRES = () => ({
  extraA: t('Extrastimulus atrial (courbe AH, saut, période réfractaire nodale)', 'Atrial extrastimulus testing (AH curve, jump, AV nodal refractory period)'),
  extraV: t('Extrastimulus ventriculaire (conduction rétrograde)', 'Ventricular extrastimulus testing (retrograde conduction)'),
  stimV: t('Stimulation ventriculaire (conduction rétrograde, séquence atriale)', 'Ventricular pacing (retrograde conduction, atrial activation sequence)'),
  salveA: t('Salve atriale rapide', 'Rapid atrial burst pacing'),
  induction: t('Induction de la tachycardie', 'Tachycardia induction'),
  esvHis: t('ESV His-réfractaire', 'His-refractory PVC'),
  entrainementV: t('Entraînement ventriculaire (V-A-V / V-A-A-V, PPI − TCL)', 'Ventricular entrainment (V-A-V / V-A-A-V, PPI − TCL)'),
  entrainementA: t('Entraînement atrial (PPI − TCL aux différents sites)', 'Atrial entrainment (PPI − TCL at different sites)'),
  entrainementCicatrice: t('Entraînement depuis la cicatrice (PPI − TCL)', 'Entrainment from the scar (PPI − TCL)'),
  parahis: t('Stimulation para-hisienne', 'Para-Hisian pacing'),
  adenosine: t('Adénosine', 'Adenosine'),
  iso: t('Isoprénaline', 'Isoprenaline'),
  cartographie: t('Cartographie avec la sonde d\'ablation pendant la tachycardie', 'Mapping with the ablation catheter during tachycardia'),
});
// nombre décimal affiché : virgule en français, point en anglais
const virgule = x => t(String(x).replace('.', ','), String(x));
const VENTRICULAIRES = new Set(['rva', 'parahis', 'tv2', 'lvl', 'vps', 'vbd']);
// noms courts des sites pour les pastilles de la console (évalués à l'affichage, dans la langue courante)
const COURTS = () => ({ hra: t('OD haute', 'HRA'), latb: t('OD lat.', 'Lat RA'), cti: t('Isthme', 'CTI'), cs9: t('SC prox.', 'CS prox'), cs1: t('SC dist.', 'CS dist'),
  parahis: 'Para-His', rva: t('VD apex', 'RVA'), abl: t('Sonde abl.', 'ABL cath') });
const COURTS_DETECTION = () => ({ '': t('Aucune', 'None'), hra: t('OD haute', 'HRA'), his: 'His', rva: t('VD', 'RV') });
// carte schématique en vue OAG (anneau tricuspide à gauche, mitral à droite, septum au milieu) : coordonnées des positions
const CARTE = { 'od-haute': [54, 24], 'od-lat': [34, 104], isthme: [92, 168], koch: [126, 134], ostium: [158, 160], his: [152, 56],
  'cryo-his': [126, 76], 'mitral-lat': [266, 104], 'og-lat': [238, 160], 'vd-apex': [40, 190], 'vg-cicatrice': [268, 192] };
const COURTS_POS = () => ({ 'od-haute': t('ODh', 'HRA'), 'od-lat': t('AT lat', 'TA lat'), isthme: t('ICT', 'CTI'), koch: 'Koch', ostium: t('Ost SC', 'CS os'), his: 'His', 'cryo-his': 'Cryo',
  'mitral-lat': t('AM lat', 'MA lat'), 'og-lat': t('OG inf', 'LA inf'), 'vd-apex': t('VD', 'RV'), 'vg-cicatrice': t('Cicat.', 'Scar') });
const MEDIA_COMPACT = '(orientation: landscape) and (max-height: 520px)';
// voies regroupées par cathéter pour le choix des dérivations affichées
const GROUPES_VOIES = () => [['Surface', ['I', 'II', 'aVF', 'V1', 'V6']], [t('OD', 'RA'), ['hra', 'odl']], ['Halo', ['h78', 'h56', 'h34', 'h12']], ['His', ['hisp', 'hisd']],
  [t('Sinus coronaire', 'Coronary sinus'), ['cs9', 'cs7', 'cs5', 'cs3', 'cs1']], [t('VD', 'RV'), ['rva']], [t('Sonde', 'Ablation'), ['abld', 'ablu']], [t('Constantes', 'Vital signs'), ['pa']]];

export function vueSimulateur(app) {
  arreterSimulateur();
  const sauve = lire();
  if (sauve.v !== 2) { delete sauve.mode; delete sauve.figerApres; } // le balayage devient l'affichage standard
  // téléphone : montage réduit par défaut pour que le tracé tienne à l'écran avec la console
  const telephone = matchMedia('(max-width: 699px), (max-height: 520px)').matches;
  const r = { v: 2, site: 'hra', sortie: 5, largeur: 2, detection: '', s1: 600, n: 8, s2: 400, s3: 0, s4: 0, extras: false, rappelApres: true, decrement: false,
    salveCl: 400, salveType: 'burst', salveDuree: 10, modeStim: 'prog', modeSimu: 'libre', rampeDebut: 500, rampeFin: 250, rampePas: 10, vitesse: 100, vitesseRappel: 100, mode: 'balayage', montage: telephone ? 'compact' : 'standard',
    bruit: true, etiquettes: true, filtre50: true, passeHaut: true, aimant: true, miniDirect: true, puissance: 30, dureeRF: 60, onglet: 'prog', ...sauve };
  if (!VITESSES.includes(r.vitesse)) r.vitesse = 100;
  if (!VITESSES.includes(r.vitesseRappel)) r.vitesseRappel = 100;
  if (!MONTAGES[r.montage] && r.montage !== 'perso') r.montage = 'standard';
  // voies affichées : celles du montage, modifiables une à une (montage « Personnalisé »)
  if (Array.isArray(r.voies)) r.voies = r.voies.filter(id => CANAUX.some(c => c.id === id));
  if (!r.voies?.length || MONTAGES[r.montage]) r.voies = [...(MONTAGES[r.montage] ?? MONTAGES.standard).voies]; // montage prédéfini : toujours sa version à jour
  if (!SITES_STIM.some(s => s.id === r.site)) r.site = 'hra';
  if (!SITES_DETECTION.some(s => s.id === r.detection)) r.detection = '';
  // rappel : entrée du journal affichée sur l'écran de rappel (instantané du tracé), avec sa relecture et ses compas
  // enquete : diagnostic à trouver (cas mystère ou patient arrivé en tachycardie), explication cachée jusqu'à la conclusion
  // historique : manœuvres dans l'ordre où elles ont été faites (type, instant, en tachycardie ou non) pour noter la démarche
  const st = { historique: [], scenario: 'normal', mystere: false, enquete: false, coeur: null, t: 0, gains: {}, salve: null, position: 'od-haute', actions: [], faites: new Set(), analyses: [],
    positionsTachy: new Set(), tachyAvant: false, dernierMaj: 0, numero: 0,
    rappel: null, recul: 0, curseurs: [], nouveauCompas: false, report: false, demande: null, sale: true, reference: null,
    proto: null, rf: null, carte: {}, cr: null, vue: 'direct', hypo: 0, bump: null, train: null };

  const opt = (liste, v) => liste.map(o => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(o.nom)}</option>`).join('');
  // sélecteur numérique à boutons ± (appui long : défilement rapide) ; la saisie au clavier reste possible
  const pas = (id, lib, v, step, min, max) => `<div class="simu-pas"><span class="simu-pas-lib">${lib}</span><div class="simu-pas-ctl">
    <button type="button" class="btn-pas" data-cible="${id}" data-delta="-${step}" aria-label="${t(`${lib} : moins ${String(step).replace('.', ',')}`, `${lib}: minus ${step}`)}">−</button>
    <input id="${id}" type="number" value="${v}" min="${min}" max="${max}" step="${step}" inputmode="decimal" aria-label="${lib}">
    <button type="button" class="btn-pas" data-cible="${id}" data-delta="${step}" aria-label="${t(`${lib} : plus ${String(step).replace('.', ',')}`, `${lib}: plus ${step}`)}">+</button></div></div>`;
  const puces = (id, liste, v, noms, lib) => `<div class="simu-puces" id="${id}" role="radiogroup" aria-label="${lib}">${liste.map(o =>
    `<button type="button" role="radio" aria-checked="${o.id === v}" data-v="${o.id}" title="${esc(o.nom)}">${esc(noms[o.id] ?? o.nom)}</button>`).join('')}</div>`;
  const onglet = (id, lib) => `<button type="button" role="tab" id="tab-${id}" data-onglet="${id}" aria-controls="pan-${id}" aria-selected="${r.onglet === id}">${lib}</button>`;
  const panneau = (id, html) => `<div class="simu-pan" role="tabpanel" id="pan-${id}" aria-labelledby="tab-${id}" ${r.onglet === id ? '' : 'hidden'}>${html}</div>`;
  const vitesses = (id, v) => `<select id="${id}">${VITESSES.map(x => `<option value="${x}" ${x === v ? 'selected' : ''}>${virgule(x)} mm/s</option>`).join('')}</select>`;
  const case_ = (id, lib, v) => `<label class="simu-mini"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${lib}</label>`;

  app.innerHTML = `
    <h1 class="simu-h1">${t('Simulateur d\'électrophysiologie', 'Electrophysiology simulator')}</h1>
    <section class="simu-sombre simu-tete">
      <div class="simu-modes" role="tablist" aria-label="${t('Mode du simulateur', 'Simulator mode')}">
        <button type="button" role="tab" data-mode="libre" aria-selected="${r.modeSimu !== 'quiz'}"><b>${t('Entraînement libre', 'Free training')}</b><small>${t('Scénario au choix, explications visibles', 'Pick a scenario, explanations shown')}</small></button>
        <button type="button" role="tab" data-mode="quiz" aria-selected="${r.modeSimu === 'quiz'}"><b>${t('Quiz', 'Quiz')}</b><small>${t('Cas clinique tiré au sort, diagnostic et démarche notés', 'Random clinical case, diagnosis and work-up scored')}</small></button>
      </div>
      <div class="simu-cas-ligne">
        <label class="simu-champ large" id="choix-scenario"><span>${t('Scénario', 'Scenario')}</span>
          <select id="scenario">
            <optgroup label="${t('Patient en tachycardie à l\'arrivée (diagnostic à confirmer)', 'Patient in tachycardia on arrival (diagnosis to confirm)')}">
              ${Object.entries(ARRIVEES).map(([id, s]) => `<option value="${id}">${esc(s.nom)}</option>`).join('')}</optgroup>
            <optgroup label="${t('Scénarios d\'apprentissage', 'Teaching scenarios')}">
              ${Object.entries(SCENARIOS).map(([id, s]) => `<option value="${id}" ${id === 'normal' ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</optgroup>
          </select></label>
        <button type="button" class="btn btn-primaire" id="quiz-nouveau" hidden>${t('Nouveau cas', 'New case')}</button>
        <span class="simu-badge" id="cas-badge"></span>
      </div>
      <p class="note simu-quiz-stats" id="quiz-stats" hidden></p>
      <p class="simu-contexte" id="contexte"></p>
    </section>

    <div class="simu-poste">
    <section class="simu-baie" data-vue="direct" data-mini="${r.miniDirect ? 'oui' : 'non'}">
      <div class="simu-barre">
        <label class="simu-mini">${t('Vitesse', 'Speed')} ${vitesses('vitesse', r.vitesse)}</label>
        <label class="simu-mini">${t('Affichage', 'Display')} <select id="mode"><option value="balayage" ${r.mode === 'balayage' ? 'selected' : ''}>${t('Balayage (standard)', 'Sweep (standard)')}</option><option value="defilement" ${r.mode === 'defilement' ? 'selected' : ''}>${t('Défilement', 'Scrolling')}</option></select></label>
        <label class="simu-mini">${t('Montage', 'Montage')} <select id="montage">${Object.entries(MONTAGES).map(([id, m]) => `<option value="${id}" ${id === r.montage ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}
          <option value="perso" ${r.montage === 'perso' ? 'selected' : ''}>${t('Personnalisé', 'Custom')}</option></select></label>
        <details class="simu-filtres"><summary>${t('Réglages', 'Settings')}</summary><div>
          ${case_('bruit', t('Bruit', 'Noise'), r.bruit)}${case_('etiquettes', 'A-H-V', r.etiquettes)}
          ${case_('filtre50', t('Filtre secteur 50 Hz', '50 Hz notch filter'), r.filtre50)}${case_('passe-haut', t('Passe-haut 30 Hz (EGM)', '30 Hz high-pass (EGM)'), r.passeHaut)}
        </div></details>
      </div>
      <details class="simu-voies" id="voies-bloc"><summary>${t('Voies affichées', 'Displayed channels')} (<span id="voies-nb"></span>)${t(' : toucher pour ajouter ou enlever', ': tap to add or remove')}</summary>
        <div class="simu-voies-grille">${GROUPES_VOIES().map(([g, ids]) => `<div class="simu-voies-groupe"><span>${g}</span>${ids.map(id => {
          const c = CANAUX.find(x => x.id === id);
          return `<button type="button" data-voie="${id}" aria-pressed="${r.voies.includes(id)}" title="${esc(c.nom)}">${esc(c.nom)}</button>`; }).join('')}</div>`).join('')}</div>
      </details>
      <div class="simu-bascule" role="tablist" aria-label="${t('Écran affiché', 'Displayed screen')}">
        <button type="button" role="tab" data-vue="direct" aria-selected="true">${t('Temps réel', 'Real time')}</button>
        <button type="button" role="tab" data-vue="rappel" aria-selected="false">${t('Rappel', 'Review')} <span id="bascule-nouveau" class="simu-pastille" hidden></span></button>
      </div>
      <div class="simu-ecrans">
        <div class="simu-panneau simu-direct">
          <div class="simu-titre-ecran"><b>${t('Temps réel', 'Real time')}</b><span class="simu-vitaux" id="constantes"></span><div class="simu-mesures" id="mesures" aria-live="off"></div></div>
          <div class="simu-ecran">
            <canvas id="ecran" role="img" aria-label="${t('Baie d\'électrophysiologie en temps réel : dérivations de surface, électrogrammes endocavitaires et pression artérielle', 'Real-time EP recording system: surface leads, intracardiac electrograms and arterial blood pressure')}"></canvas>
            <div class="simu-etat" id="etat"></div>
          </div>
        </div>
        <div class="simu-panneau simu-rappel" id="rappel">
          <div class="simu-titre-ecran"><b>${t('Écran de rappel', 'Review screen')}</b> <span id="rappel-titre" class="note"></span></div>
          <div class="simu-barre">
            <button class="btn btn-mini" id="evt-prec" aria-label="${t('Événement précédent du journal', 'Previous log event')}">◀ ${t('Évt', 'Event')}</button>
            <button class="btn btn-mini" id="evt-suiv" aria-label="${t('Événement suivant du journal', 'Next log event')}">${t('Évt', 'Event')} ▶</button>
            <label class="simu-mini">${t('Vitesse', 'Speed')} ${vitesses('vitesse-rappel', r.vitesseRappel)}</label>
            <button class="btn btn-mini simu-seul-paysage ${r.miniDirect ? 'actif' : ''}" id="mini-direct" aria-pressed="${r.miniDirect}" title="${t('Afficher ou masquer la vignette du temps réel sur l\'écran de rappel', 'Show or hide the real-time thumbnail on the review screen')}">${t('Vignette direct', 'Live thumbnail')}</button>
            <div class="simu-mesures" id="mesures-rappel" aria-live="off"></div>
          </div>
          <div class="simu-ecran">
            <canvas id="ecran-rappel" role="img" aria-label="${t('Écran de rappel : tracé de l\'événement sélectionné dans le journal, mesurable au compas', 'Review screen: tracing of the event selected in the log, measurable with callipers')}"></canvas>
            <p class="simu-rappel-vide" id="rappel-vide">${t('Aucun événement rappelé. Faites une manœuvre ou « Enregistrer », ou touchez un événement du journal.', 'No event recalled. Perform a manoeuvre or press "Record", or tap an event in the log.')}</p>
            <span class="simu-appui" id="appui" hidden aria-hidden="true"></span>
            <canvas id="ecran-mini" class="simu-mini-direct" aria-label="${t('Vignette du tracé en temps réel (toucher pour y revenir)', 'Real-time tracing thumbnail (tap to return to it)')}" role="button" tabindex="0"></canvas>
          </div>
          <div class="simu-revue">
            <button class="btn btn-mini" id="arriere" aria-label="${t('Page précédente', 'Previous page')}">◀</button>
            <input type="range" id="recul" min="0" max="0" step="50" value="0" aria-label="${t('Se déplacer dans l\'enregistrement rappelé', 'Move through the recalled recording')}">
            <button class="btn btn-mini" id="avant" aria-label="${t('Page suivante', 'Next page')}">▶</button>
            <span id="recul-val" class="note"></span>
            <button class="btn btn-mini" id="compas-plus">${t('+ compas', '+ calliper')}</button>
            <button class="btn btn-mini" id="compas-report">${t('Report', 'March out')}</button>
            <button class="btn btn-mini" id="compas-effacer">${t('Effacer', 'Clear')}</button>
            <button class="btn btn-mini ${r.aimant ? 'actif' : ''}" id="aimant" aria-pressed="${r.aimant}" title="${t('Les compas s\'accrochent aux activations', 'Callipers snap to activations')}">${t('Aimant', 'Snap')}</button>
            <button class="btn btn-mini" id="comparer" title="${t('Garder ce rappel comme référence pour comparer', 'Keep this recording as a reference for comparison')}">${t('Comparer', 'Compare')}</button>
          </div>
          <div class="simu-reference" id="reference" hidden>
            <div class="simu-titre-ecran"><b>${t('Référence', 'Reference')}</b> <span id="reference-titre" class="note"></span><button class="btn btn-mini" id="reference-fermer" aria-label="${t('Retirer la référence', 'Remove the reference')}">✕</button></div>
            <div class="simu-ecran"><canvas id="ecran-ref" role="img" aria-label="${t('Tracé de référence pour la comparaison', 'Reference tracing for comparison')}"></canvas></div>
          </div>
        </div>
      </div>
      <div class="simu-paysage" id="paysage">
        <span aria-hidden="true" class="simu-paysage-ico">⟳</span>
        <span>${t('<b>Tournez votre téléphone en paysage</b> pour voir l\'écran de rappel (mesures au compas, rappel des événements du journal).', '<b>Turn your phone to landscape</b> to see the review screen (calliper measurements, recall of log events).')}<span id="paysage-nouveau"></span></span>
        <button class="btn btn-mini" id="btn-paysage">${t('Passer en paysage', 'Switch to landscape')}</button>
      </div>
      <div class="simu-message" id="message" role="status"></div>
    </section>

    <section class="simu-console" id="console" aria-label="${t('Console de stimulation', 'Stimulator console')}">
      <div class="simu-actions">
        <button class="btn btn-primaire simu-go" id="stimuler" title="${t('Stimuler ; pendant une stimulation, une salve ou un protocole : Stop', 'Pace; during pacing, a burst or a protocol: Stop')}">${t('Stimuler', 'Pace')}</button>
        <button class="btn simu-rf-btn" id="ablater" aria-pressed="false" title="${t('Tir de radiofréquence à la position de la sonde (onglet Sonde / RF) ; appuyer de nouveau pour arrêter', 'RF application at the catheter position (Cath / RF tab); press again to stop')}"></button>
        <button class="btn" id="enregistrer" title="${t('Envoyer les 10 dernières secondes sur l\'écran de rappel', 'Send the last 10 seconds to the review screen')}">${t('Enreg.', 'Record')}</button>
      </div>
      ${puces('site', SITES_STIM, r.site, COURTS(), t('Site de stimulation', 'Pacing site'))}
      <p class="simu-resume" id="resume"></p>
      <div class="simu-onglets" role="tablist" aria-label="${t('Réglages de la console', 'Console settings')}">
        ${onglet('prog', t('Programme', 'Programme'))}${onglet('salve', t('Salve', 'Burst'))}${onglet('proto', t('Protocoles', 'Protocols'))}${onglet('abl', t('Sonde / RF', 'Cath / RF'))}${onglet('medic', t('Médic.', 'Drugs'))}${onglet('journal', t('Journal', 'Log'))}
        <button type="button" class="simu-replier" id="replier" aria-label="${t('Replier ou déplier la console', 'Collapse or expand the console')}" aria-expanded="true">▾</button>
      </div>
      <div class="simu-pans">
        ${panneau('prog', `
          <div class="simu-grille-pas">${pas('s1', 'S1 (ms)', r.s1, 10, 200, 2000)}${pas('n', t('Nb S1', 'S1 count'), r.n, 1, 0, 30)}
          ${pas('sortie', t('Sortie (mA)', 'Output (mA)'), r.sortie, 0.5, 0.1, 20)}${pas('largeur', t('Impulsion (ms)', 'Pulse width (ms)'), r.largeur, 0.5, 0.5, 2)}</div>
          <label class="simu-case simu-extras"><input type="checkbox" id="extras" ${r.extras ? 'checked' : ''}> ${t('+ extrastimulus (S2, S3, S4)', '+ extrastimuli (S2, S3, S4)')}</label>
          <div id="extras-bloc" ${r.extras ? '' : 'hidden'}>
            <div class="simu-grille-pas">${pas('s2', 'S2 (ms)', r.s2, 10, 0, 1000)}${pas('s3', 'S3', r.s3, 10, 0, 1000)}${pas('s4', 'S4', r.s4, 10, 0, 1000)}</div>
            <label class="simu-case"><input type="checkbox" id="decrement" ${r.decrement ? 'checked' : ''}> ${t('Décrément automatique : S2 − 10 ms après chaque train', 'Automatic decrement: S2 − 10 ms after each drive train')}</label>
          </div>
          <div class="simu-ligne-puces"><span class="simu-pas-lib">${t('Couplé à la détection', 'Synchronised to sensing')}</span>${puces('detection', SITES_DETECTION, r.detection, COURTS_DETECTION(), t('Couplage à la détection', 'Synchronisation to sensing'))}</div>
          <label class="simu-case"><input type="checkbox" id="rappel-apres" ${r.rappelApres ? 'checked' : ''}> ${t('Afficher chaque manœuvre sur l\'écran de rappel', 'Show each manoeuvre on the review screen')}</label>`)}
        ${panneau('proto', `
          <div class="simu-protos">
            <button class="simu-proto" data-proto="decA"><b>${t('Extrastimulus atrial décrémental', 'Decremental atrial extrastimulus')}</b><small>${t('OD haute, S2 − 10 ms à chaque train jusqu\'à la période réfractaire : PR nodale, saut d\'AH, induction', 'HRA, S2 − 10 ms with each drive train down to the refractory period: AV nodal ERP, AH jump, induction')}</small></button>
            <button class="simu-proto" data-proto="decV"><b>${t('Extrastimulus ventriculaire décrémental', 'Decremental ventricular extrastimulus')}</b><small>${t('VD apex : conduction rétrograde, PR ventriculaire, induction', 'RV apex: retrograde conduction, ventricular ERP, induction')}</small></button>
            <button class="simu-proto" data-proto="wenck"><b>${t('Rampe atriale → Wenckebach', 'Atrial ramp → Wenckebach')}</b><small>${t('Cycle raccourci par paliers jusqu\'au premier bloc AV, arrêt automatique', 'Cycle length shortened stepwise until the first AV block, automatic stop')}</small></button>
            <button class="simu-proto" data-proto="retro"><b>${t('Rampe ventriculaire → Wenckebach VA', 'Ventricular ramp → VA Wenckebach')}</b><small>${t('Conduction rétrograde, dissociation VA', 'Retrograde conduction, VA dissociation')}</small></button>
            <button class="simu-proto" data-proto="trs"><b>${t('Temps de récupération sinusale', 'Sinus node recovery time')}</b><small>${t('Salve de 30 s à 600 ms depuis l\'OD haute, TRS et TRS corrigé', '30 s burst at 600 ms from the HRA, SNRT and CSNRT')}</small></button>
            <button class="simu-proto" data-proto="seuil"><b>${t('Seuil de capture', 'Capture threshold')}</b><small>${t('Sortie diminuée battement par battement au site choisi', 'Output decreased beat by beat at the selected site')}</small></button>
            <button class="simu-proto" data-proto="parahis"><b>${t('Stimulation para-hisienne', 'Para-Hisian pacing')}</b><small>${t('En rythme sinusal, sortie haute (His + myocarde) et basse (myocarde) alternées', 'In sinus rhythm, alternating high output (His + myocardium) and low output (myocardium only)')}</small></button>
            <button class="simu-proto" data-proto="esv"><b>${t('ESV His-réfractaire', 'His-refractory PVC')}</b><small>${t('En tachycardie : VD couplé au His, S2 = cycle − 30 ms', 'During tachycardia: RV synchronised to the His, S2 = TCL − 30 ms')}</small></button>
            <button class="simu-proto" data-proto="entrV"><b>${t('Entraînement ventriculaire', 'Ventricular entrainment')}</b><small>${t('En tachycardie : VD à cycle − 30 ms, arrêt dès l\'atrium entraîné, V-A-V / V-A-A-V, PPI − TCL', 'During tachycardia: RV at TCL − 30 ms, stops once the atrium is entrained; V-A-V / V-A-A-V, PPI − TCL')}</small></button>
            <button class="simu-proto" data-proto="entrSite"><b>${t('Entraînement depuis le site choisi', 'Entrainment from the selected site')}</b><small>${t('En tachycardie : cycle − 20 ms (− 30 ms au ventricule), arrêt automatique, PPI − TCL au site', 'During tachycardia: TCL − 20 ms (− 30 ms in the ventricle), automatic stop, PPI − TCL at the site')}</small></button>
          </div>
          <p class="simu-proto-etat" id="proto-etat" role="status"></p>`)}
        ${panneau('salve', `
          <div class="simu-ligne-puces"><span class="simu-pas-lib">${t('Type de salve', 'Burst type')}</span>${puces('salveType', [{ id: 'burst', nom: t('Burst : cycle fixe', 'Burst: fixed cycle length') }, { id: 'rampe', nom: t('Rampe : cycle décroissant', 'Ramp: decreasing cycle length') }], r.salveType, { burst: 'Burst', rampe: t('Rampe', 'Ramp') }, t('Type de salve', 'Burst type'))}</div>
          <div id="bloc-burst" ${r.salveType === 'burst' ? '' : 'hidden'}>
            <div class="simu-grille-pas">${pas('salve-cl', t('Cycle (ms)', 'Cycle length (ms)'), r.salveCl, 10, 150, 2000)}${pas('salve-duree', t('Durée (s)', 'Duration (s)'), r.salveDuree, 1, 0, 60)}</div>
            <p class="note">${t('Durée 0 : salve continue jusqu\'à « Stop ».', 'Duration 0: continuous burst until "Stop".')}</p>
          </div>
          <div id="bloc-rampe" ${r.salveType === 'rampe' ? '' : 'hidden'}>
            <div class="simu-grille-pas">${pas('rampe-debut', t('Rampe : de (ms)', 'Ramp: from (ms)'), r.rampeDebut, 10, 150, 2000)}${pas('rampe-fin', t('à (ms)', 'to (ms)'), r.rampeFin, 10, 150, 2000)}${pas('rampe-pas', t('pas (ms)', 'step (ms)'), r.rampePas, 5, 5, 50)}</div>
            <p class="note">${t('4 stimulus par palier.', '4 stimuli per step.')}</p>
          </div>
          <p class="note">${t('Lancez avec « Stimuler » (le bouton bleu) ; il devient « Stop » pendant la salve.', 'Start with "Pace" (the blue button); it turns into "Stop" during the burst.')}</p>`)}
        ${panneau('abl', `
          <div class="simu-carte-bloc">
            <svg class="simu-carte" id="carte" viewBox="0 0 300 214" role="group" aria-label="${t('Carte schématique des positions de la sonde (vue oblique antérieure gauche)', 'Schematic map of catheter positions (left anterior oblique view)')}">
              <circle cx="92" cy="104" r="56" class="anneau"/><circle cx="212" cy="104" r="52" class="anneau"/>
              <path d="M150 162 Q 212 200 262 128" class="sc"/>
              <text x="92" y="108" class="lib-anneau">${t('Tricuspide', 'Tricuspid')}</text><text x="212" y="108" class="lib-anneau">${t('Mitral', 'Mitral')}</text>
              ${POSITIONS.map(p => { const [x, y] = CARTE[p.id] || [150, 100]; return `<g class="pt" data-pos="${p.id}" tabindex="0" role="button" aria-label="${esc(p.nom)}">
                <circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y + 20}">${COURTS_POS()[p.id] || ''}</text><text x="${x}" y="${y + 3.5}" class="lat" id="lat-${p.id}"></text></g>`; }).join('')}
            </svg>
            <p class="note simu-carte-legende" id="carte-legende">${t('Touchez un point pour y placer la sonde. En tachycardie, chaque position visitée est colorée selon son activation locale (rouge = précoce, violet = tardif ; référence SC 9-10 pour l\'atrium, QRS pour le ventricule).', 'Tap a point to place the catheter there. During tachycardia, each visited position is coloured according to its local activation time (red = early, purple = late; reference CS 9-10 for the atrium, QRS for the ventricle).')}</p>
          </div>
          <label class="simu-champ large"><span>${t('Position', 'Position')}</span><select id="position">${opt(POSITIONS, st.position)}</select></label>
          <div class="simu-grille-pas">${pas('puissance', t('Puissance (W)', 'Power (W)'), r.puissance, 5, 5, 50)}${pas('duree-rf', t('Durée max (s)', 'Max duration (s)'), r.dureeRF, 10, 10, 120)}</div>
          <div class="simu-rf">
            <span class="simu-pas-lib">${t('Générateur (tir : bouton violet « Radiofréquence » en haut de la console)', 'Generator (apply with the purple "RF" button at the top of the console)')}</span>
            <output class="simu-rf-etat" id="rf-etat">${t('Générateur prêt', 'Generator ready')}</output>
          </div>
          <p class="note">${t('Électrogrammes de la sonde (ABL d, ABL uni) avec le montage « Ablation » ou en les ajoutant dans « Voies affichées » ; stimulez depuis la sonde avec le site « Sonde abl. ». Surveillez le rythme jonctionnel et sa conduction VA pendant un tir près du nœud AV.', 'Catheter electrograms (ABL d, ABL uni) are shown with the "Ablation" montage or by adding them under "Displayed channels"; pace from the catheter with the "ABL cath" site. Watch for junctional rhythm and its VA conduction during any application near the AV node.')}</p>
          <button class="btn" id="carte-effacer">${t('Effacer la carte', 'Clear map')}</button> <button class="btn" id="reinit">${t('Recommencer le cas', 'Restart the case')}</button>`)}
        ${panneau('medic', `
          <div class="simu-medics">
            <button class="btn" id="adenosine">${t('Adénosine 12 mg', 'Adenosine 12 mg')}</button>
            <button class="btn" id="iso" aria-pressed="false">${t('Isoprénaline', 'Isoprenaline')}</button>
            <button class="btn" id="atropine" aria-pressed="false">${t('Atropine', 'Atropine')}</button>
            <button class="btn btn-danger" id="choc">${t('Choc', 'Shock')}</button>
          </div>
          <p class="note">${t('Adénosine : bloc AV transitoire environ 1,5 s après le clic. Isoprénaline : effet progressif sur 15 s, facilite l\'induction. Surveillez la pression artérielle (voie PA) : une tachycardie mal tolérée s\'arrête par stimulation ou par choc.', 'Adenosine: transient AV block about 1.5 s after the click. Isoprenaline: gradual effect over 15 s, facilitates induction. Monitor the arterial pressure (ABP channel): a poorly tolerated tachycardia is terminated by pacing or DC shock.')}</p>`)}
        ${panneau('journal', `
          <ol class="simu-journal" id="journal"></ol>
          <div class="actions serre gauche"><button class="btn" id="cr-generer">${t('Compte rendu d\'EEP', 'EP study report')}</button></div>`)}
      </div>
    </section>
    </div>

    <section class="simu-sombre" id="diagnostic" hidden>
      <h2>${t('Votre diagnostic', 'Your diagnosis')}</h2>
      <p class="note">${t('Stimulez, induisez, faites vos manœuvres, traitez si besoin, puis concluez. Votre démarche est notée.', 'Pace, induce, perform your manoeuvres, treat if needed, then conclude. Your work-up is scored.')}</p>
      <div class="simu-ligne"><label class="simu-champ large"><span>${t('Diagnostic', 'Diagnosis')}</span><select id="reponse">
        <option value="">— ${t('Choisir', 'Select')} —</option>${MYSTERES.map(id => `<option value="${id}">${esc(SCENARIOS[id].court)}</option>`).join('')}</select></label>
        <button class="btn btn-primaire" id="valider">${t('Valider', 'Submit')}</button></div>
      <div id="verdict"></div>
    </section>

    <section class="simu-sombre simu-cr" id="compte-rendu" hidden></section>
    <section class="simu-sombre" id="explication-scenario"></section>

    <details class="simu-sombre simu-guide">
      <summary><b>${t('Mode d\'emploi et manœuvres clés', 'User guide and key manoeuvres')}</b></summary>
      <ul>
        <li>${t(`<b>Console</b> : sous la baie (à droite en paysage sur téléphone). « Stimuler » délivre le programme (onglet Programme) ou la salve (onglet Salve : burst de durée choisie, 0 = continu, ou rampe), selon le dernier des deux onglets ouvert. Stimuler (qui devient Stop pendant une stimulation, une salve ou un protocole) et Enregistrer restent visibles ; « + extrastimulus » affiche S2, S3 et S4 ; les pastilles choisissent le site ; les onglets donnent les réglages (± : appui long pour aller vite). Touchez l'onglet ouvert pour replier la console.`, `<b>Console</b>: below the EP lab (on the right in landscape on a phone). "Pace" delivers the programme (Programme tab) or the burst (Burst tab: burst of chosen duration, 0 = continuous, or ramp), whichever of the two tabs was opened last. Pace (which becomes Stop during pacing, a burst or a protocol) and Record always remain visible; "+ extrastimuli" shows S2, S3 and S4; the chips select the pacing site; the tabs hold the settings (±: press and hold to go faster). Tap the open tab to collapse the console.`)}</li>
        <li>${t(`<b>Baie</b> : vitesse en mm/s (25 mm/s pour une vue d'ensemble, 100 à 200 mm/s pour mesurer). L'écran en temps réel est en balayage (défilement en option) et ne se fige jamais. Choisissez un montage, puis ajoutez ou enlevez chaque voie dans « Voies affichées ». L'<b>écran de rappel</b> affiche chaque manœuvre ou enregistrement, centré sur l'extrastimulus (ou le stimulus bloqué, le dernier stimulus d'une salve) ; tout événement du journal peut y être rappelé. Faites glisser pour poser un compas (aimanté aux activations) ; au doigt, appui long (2 s) sur le début, puis appui maintenu sur la fin (elle suit le doigt, validée après 1 s immobile). Pincez pour changer de vitesse, « Comparer » garde un rappel en référence (avant / après adénosine, avant / après ablation). Sur téléphone en paysage, un seul écran à la fois : glissez horizontalement pour passer du temps réel au rappel ; « Vignette direct » retire la vignette du temps réel de l'écran de rappel. On ne stimule que depuis un cathéter dont une voie est affichée : le spike et l'électrogramme capturé, juste après lui, doivent être visibles.`, `<b>Recording system</b>: sweep speed in mm/s (25 mm/s for an overview, 100 to 200 mm/s for measurements). The real-time screen uses sweep mode (scrolling as an option) and never freezes. Choose a montage, then add or remove individual channels under "Displayed channels". The <b>review screen</b> shows each manoeuvre or recording, centred on the extrastimulus (or on the blocked stimulus, or the last stimulus of a burst); any event in the log can be recalled there. Drag to place a calliper (it snaps to activations); with a finger, press and hold (2 s) on the start, then press and hold on the end (it follows your finger and is set after 1 s without moving). Pinch to change the sweep speed; "Compare" keeps a recording as a reference (before / after adenosine, before / after ablation). On a phone in landscape, one screen at a time: swipe horizontally to switch between real time and review; "Live thumbnail" removes the real-time thumbnail from the review screen. You can only pace from a catheter whose channel is displayed: the spike and the captured electrogram just after it must be visible.`)}</li>
        <li>${t(`<b>Protocoles</b> : extrastimulus décrémental automatique (PR, saut d'AH, induction), rampe jusqu'au Wenckebach antérograde ou rétrograde, temps de récupération sinusale, seuil de capture, para-hisien, ESV His-réfractaire et entraînement avec arrêt automatique. Les résultats vont dans le journal et le compte rendu.`, `<b>Protocols</b>: automatic decremental extrastimulus testing (ERP, AH jump, induction), ramp to anterograde or retrograde Wenckebach, sinus node recovery time, capture threshold, para-Hisian pacing, His-refractory PVC and entrainment with automatic stop. The results go into the log and the report.`)}</li>
        <li>${t(`<b>Extrastimulus</b> : train de S1 (ex. 8 × 600 ms) puis, en cochant « + extrastimulus », S2, S3, S4 (0 = désactivé) ; diminuez S2 par pas de 10 ms (boutons ± ou décrément automatique). Saut de l'AH ≥ 50 ms pour 10 ms de raccourcissement du couplage = double voie nodale. Période réfractaire effective : du tissu stimulé quand S2 ne capture plus ; du nœud AV quand S2 capture sans être suivi d'un H.`, `<b>Extrastimulus testing</b>: S1 drive train (e.g. 8 × 600 ms) then, after ticking "+ extrastimuli", S2, S3, S4 (0 = off); decrease S2 in 10 ms steps (± buttons or automatic decrement). AH jump ≥ 50 ms for a 10 ms decrement in coupling interval = dual AV nodal physiology. Effective refractory period: of the paced tissue when S2 no longer captures; of the AV node when S2 captures but is not followed by an H.`)}</li>
        <li>${t(`<b>Stimulateur</b> : chaque site a son seuil (isthme, SC distal et cicatrice plus élevés) ; près du seuil, la capture devient intermittente ; une impulsion plus courte exige plus d'intensité (loi intensité-durée). Un stimulus sans capture est marqué « · ».`, `<b>Stimulator</b>: each site has its own threshold (higher at the isthmus, distal CS and scar); near threshold, capture becomes intermittent; a shorter pulse width requires a higher output (strength–duration relationship). A non-capturing stimulus is marked "·".`)}</li>
        <li>${t(`<b>Isoprénaline</b> : accélère le sinus, améliore la conduction nodale et facilite l'induction. <b>Adénosine</b> : bloc AV transitoire (1,5 s après le clic dans le simulateur).`, `<b>Isoprenaline</b>: accelerates the sinus rate, improves AV nodal conduction and facilitates induction. <b>Adenosine</b>: transient AV block (1.5 s after the click in the simulator).`)}</li>
        <li>${t(`<b>ESV His-réfractaire</b> : si l'atrium suivant est avancé avec la même séquence, il existe une voie accessoire ; elle participe au circuit si l'ESV retarde l'atrium ou arrête la tachycardie sans l'atteindre.`, `<b>His-refractory PVC</b>: if the next atrial activation is advanced with the same sequence, an accessory pathway is present; it participates in the circuit if the PVC delays the atrium or terminates the tachycardia without reaching it.`)}</li>
        <li>${t(`<b>Entraînement ventriculaire</b> : réponse <b>V-A-V</b> (réentrée nodale ou voie accessoire) ou <b>V-A-A-V</b> (tachycardie atriale). PPI − TCL &gt; 115 ms (et SA − VA &gt; 85 ms) en faveur d'une réentrée intranodale, &lt; 115 ms d'une voie accessoire.`, `<b>Ventricular entrainment</b>: <b>V-A-V</b> response (AV nodal re-entry or accessory pathway) or <b>V-A-A-V</b> (atrial tachycardia). PPI − TCL &gt; 115 ms (and SA − VA &gt; 85 ms) favours AVNRT, &lt; 115 ms an accessory pathway.`)}</li>
        <li>${t(`<b>Stimulation para-hisienne</b> : si l'intervalle stimulus-A s'allonge à la perte de capture du His, la conduction rétrograde est nodale ; s'il ne change pas, elle est extranodale (voie accessoire septale).`, `<b>Para-Hisian pacing</b>: if the stimulus-to-A interval lengthens with loss of His capture, retrograde conduction is nodal; if it is unchanged, it is extranodal (septal accessory pathway).`)}</li>
        <li>${t(`<b>Sonde et radiofréquence</b> : placez la sonde sur la carte (un contact de cathéter peut déclencher des extrasystoles, voire bloquer transitoirement une voie accessoire : perte de la préexcitation sans tir). Le tir dure jusqu'à l'arrêt ou la durée maximale ; la lésion se constitue en quelques secondes selon la puissance et le contact (température, impédance affichées). Sur la voie lente, un rythme jonctionnel signe le chauffage efficace ; une perte de la conduction VA pendant ce rythme impose d'arrêter immédiatement. Près du His, l'AH s'allonge puis le bloc AV complet survient si l'on insiste ; la cryoablation est plus sûre.`, `<b>Catheter and radiofrequency</b>: place the catheter on the map (catheter contact can trigger ectopic beats, or even transiently block an accessory pathway: loss of pre-excitation without any RF delivery). The application lasts until you stop it or the maximum duration is reached; the lesion forms within a few seconds depending on power and contact (temperature and impedance are displayed). On the slow pathway, junctional rhythm indicates effective heating; loss of VA conduction during this rhythm means you must stop immediately. Near the His, the AH lengthens and complete AV block follows if you persist; cryoablation is safer.`)}</li>
        <li>${t(`<b>Constantes</b> : la voie PA suit le remplissage (cycle, contraction atriale) : une tachycardie rapide ou une dissociation AV fait chuter la pression.`, `<b>Vital signs</b>: the ABP channel follows ventricular filling (cycle length, atrial contraction): a fast tachycardia or AV dissociation makes the pressure fall.`)}</li>
        <li>${t(`<b>Filtres</b> : sans filtre 50 Hz, le parasite secteur apparaît ; sans passe-haut, la ligne de base des électrogrammes dérive avec la respiration. Après un choc, les amplificateurs saturent brièvement.`, `<b>Filters</b>: without the 50 Hz notch filter, mains interference appears; without the high-pass filter, the electrogram baseline wanders with respiration. After a shock, the amplifiers briefly saturate.`)}</li>
      </ul>
      <p class="note">${t(`Modèle pédagogique simplifié : les intervalles sont réalistes mais le cœur est réduit à une trentaine de sites. Concept inspiré du simulateur svtsim (S. Iravanian) ; code et scénarios originaux. Critères : Michaud GF et al., JACC 2001;38:1163-7 (PPI − TCL, SA − VA) ; Knight BP et al., JACC 1999;33:775-81 (V-A-A-V) ; Hirao K et al., Circulation 1996;94:1027-35 (stimulation para-hisienne) ; Josephson ME, Clinical Cardiac Electrophysiology.`, `Simplified teaching model: the intervals are realistic, but the heart is reduced to about thirty sites. Concept inspired by the svtsim simulator (S. Iravanian); original code and scenarios. Criteria: Michaud GF et al., JACC 2001;38:1163-7 (PPI − TCL, SA − VA); Knight BP et al., JACC 1999;33:775-81 (V-A-A-V); Hirao K et al., Circulation 1996;94:1027-35 (para-Hisian pacing); Josephson ME, Clinical Cardiac Electrophysiology.`)}</p>
    </details>`;

  const $ = s => app.querySelector(s);
  const canvas = $('#ecran'), canvasR = $('#ecran-rappel'), canvasMini = $('#ecran-mini'), canvasRef = $('#ecran-ref'), baie = $('.simu-baie');
  const compact = () => matchMedia(MEDIA_COMPACT).matches;

  // ---------- journal et écran de rappel ----------
  // Chaque entrée du journal couvre une fenêtre de tracé [debut, capture] ; à l'instant « capture », le tracé de cette
  // fenêtre est copié (instantané) et peut être rappelé à tout moment sur l'écran de rappel. auto : affichage dès la capture.
  const hms = t => `${(t / 1000).toFixed(1)} s`;
  // événements émis par le moteur, par type (clé stable, indépendante de la langue) :
  // [début, capture, instant à montrer] relatifs à l'événement (ms), affichage automatique
  const FENETRES_MOTEUR = { adenosine: [-2000, 9000, 1500, true], choc: [-3000, 4000, 0, true], rf: [-4000, 3000, 0, false], bavc: [-5000, 3000, 0, true] };
  // focus : instant placé au centre de l'écran de rappel à l'ouverture (extrastimulus, stimulus bloqué, dernier stimulus d'une salve…) ;
  // sans focus, l'écran montre la fin de l'enregistrement. rf : tir de radiofréquence (notation du cas)
  function entree(t, texte, { debut = t - 6000, capture = t + 4000, auto = false, focus = null, rf = false } = {}) {
    const e = { id: ++st.numero, t, texte, debut, capture, auto, focus, rf, instantane: null };
    st.actions.push(e);
    return e;
  }
  function majJournal() {
    for (const e of st.coeur.evenements) if (!e.vu) {
      e.vu = true;
      const f = FENETRES_MOTEUR[e.type];
      entree(e.t, e.texte, f ? { debut: e.t + f[0], capture: e.t + f[1], focus: e.t + f[2], auto: f[3] && r.rappelApres, rf: e.type === 'rf' } : {});
    }
    st.actions.sort((a, b) => a.t - b.t);
    if (st.actions.length > 80) st.actions = st.actions.slice(-80);
    if (st.rappel && !st.actions.includes(st.rappel)) st.actions.unshift(st.rappel);
    rendreJournal();
  }
  const f0 = v => (v == null ? '—' : Math.round(v));
  function rendreJournal() {
    $('#journal').innerHTML = st.actions.slice().reverse().map(a => `<li><button class="simu-evt${a === st.rappel ? ' choisi' : ''}" data-evt="${a.id}" ${a === st.rappel ? 'aria-current="true"' : ''}>
      <span class="note">${hms(a.t)}</span> ${esc(a.texte)}${a.instantane ? '' : ` <span class="note" title="${t('Enregistrement en cours', 'Recording in progress')}">⏳</span>`}
      ${a.mes ? `<small class="simu-evt-mes">V-V ${f0(a.mes.cycleV)} · AH ${f0(a.mes.AH)} · HV ${f0(a.mes.HV)} · VA ${f0(a.mes.VA)}</small>` : ''}</button></li>`).join('');
  }
  function faire(type, extra = {}) {
    st.faites.add(type);
    st.historique.push({ type, t: st.t, tachy: tachycardie(st.coeur).active, ...extra });
  }
  function noter(type, texte, fenetre) {
    if (type) faire(type);
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
    if (!e.instantane) { st.demande = e; message(t('Enregistrement en cours : il s\'affichera sur l\'écran de rappel dans un instant.', 'Recording in progress: it will appear on the review screen in a moment.')); return; }
    st.rappel = e; st.curseurs = [];
    st.recul = e.focus != null ? Math.max(0, e.instantane.t - e.focus - 0.5 * fenetreMs(canvasR.clientWidth || 300, r.vitesseRappel)) : 0; st.nouveauCompas = false; st.demande = null; st.sale = true; st.finOuverte = false;
    $('#rappel-titre').textContent = `${hms(e.t)} · ${e.texte}`;
    $('#rappel-vide').hidden = true;
    $('#paysage-nouveau').textContent = t(` Dernier rappel : ${e.texte}.`, ` Last recalled: ${e.texte}.`);
    $('#bascule-nouveau').hidden = st.vue === 'rappel';
    majRecul(); rendreJournal();
  }
  function rappelVoisin(sens) {
    const prets = st.actions.filter(a => a.instantane);
    const i = prets.indexOf(st.rappel);
    rappeler(prets[i < 0 ? prets.length - 1 : Math.max(0, Math.min(prets.length - 1, i + sens))]);
  }

  // ---------- compte rendu : données recueillies au fil de l'exploration ----------
  const nouveauCR = () => ({ base: null, wenck: null, wenckRetro: null, extraA: null, extraV: null, trs: null, seuils: [], parahis: null, inductions: [], tirs: [], manoeuvres: [], hypotension: false });

  function nouveauCoeur() {
    const sc = scenario(st.scenario), arrivee = ARRIVEES[st.scenario];
    arreterRF(true);
    st.coeur = new Coeur(sc.def(), { variation: st.mystere ? Math.min(0.05, sc.variation ?? 1) : 0 });
    st.coeur.avancer(2500);
    // patient adressé en tachycardie : induction faite hors de la vue de l'utilisateur, avant l'ouverture du cas
    const induit = arrivee ? induireTachycardie(st.coeur, arrivee.recettes) : null;
    if (arrivee) {
      st.coeur.avancer(st.coeur.t + 6000);
      for (const e of st.coeur.evenements) e.vu = true;
      st.coeur.chocs = [];
    }
    // stimulus délivrés par la sonde d'ablation : l'artéfact s'inscrit sur ses voies, quel que soit le site touché
    const c0 = st.coeur, brut = c0.stimuler.bind(c0);
    c0.stimuler = (site, tt, sortie, largeur, lib) => brut(site, tt, sortie, largeur, lib, r.site === 'abl' && site === siteReel() ? 'abl' : null);
    Object.assign(st, { t: st.coeur.t, salve: null, actions: [], faites: new Set(), analyses: [], positionsTachy: new Set(), tachyAvant: false,
      rappel: null, recul: 0, curseurs: [], nouveauCompas: false, finOuverte: false, demande: null, sale: true, reference: null, proto: null, rf: null, carte: {}, cr: nouveauCR(), hypo: 0, bump: null, train: null, historique: [] });
    for (const id of ['#iso', '#atropine']) { $(id).setAttribute('aria-pressed', 'false'); $(id).classList.remove('actif'); }
    $('#rappel-titre').textContent = ''; $('#rappel-vide').hidden = false; $('#paysage-nouveau').textContent = ''; $('#reference').hidden = true;
    $('#proto-etat').textContent = ''; $('#compte-rendu').hidden = true; $('#rf-etat').textContent = t('Générateur prêt', 'Generator ready');
    majRecul(); majCarte(); majResume();
    if (arrivee && induit) {
      // la tachycardie est là dès l'ouverture : l'induction ne fait pas partie de la démarche à noter
      const tach = tachycardie(st.coeur);
      st.faites.add('induction'); st.tachyAvant = true;
      st.cr.inductions.push({ cycleA: tach.cycleA, cycleV: tach.cycleV, VA: mesures(st.coeur).VA, precoce: t('tachycardie présente à l\'arrivée', 'tachycardia present on arrival') });
    }
    st.enquete = st.mystere || !!arrivee;
    $('#diagnostic').hidden = !st.enquete; $('#verdict').innerHTML = ''; $('#reponse').value = '';
    $('#contexte').innerHTML = sc.contexte ? `<b>${t('Contexte :', 'Clinical context:')}</b> ${esc(sc.contexte)}` : '';
    $('#cas-badge').textContent = st.mystere ? (arrivee ? t('Quiz · patient en tachycardie', 'Quiz · patient in tachycardia') : 'Quiz') : arrivee ? t('Patient en tachycardie', 'Patient in tachycardia') : t('Apprentissage', 'Teaching');
    $('#cas-badge').className = `simu-badge ${arrivee ? 'tachy' : st.mystere ? 'mystere' : ''}`;
    $('#explication-scenario').innerHTML = arrivee
      ? t(`<h2>Patient adressé en tachycardie</h2><p class="note">La tachycardie est en cours${induit ? '' : ' (elle s\'est arrêtée à l\'installation : induisez-la)'}. Mesurez le cycle, le VA et la séquence atriale, confirmez le mécanisme par les manœuvres (entraînement, ESV His-réfractaire, adénosine…), traitez si besoin, puis concluez.${st.mystere ? ' Les paramètres varient légèrement d\'un cas à l\'autre.' : ''}</p>`,
        `<h2>Patient referred in tachycardia</h2><p class="note">The tachycardia is ongoing${induit ? '' : ' (it terminated during catheter placement: induce it)'}. Measure the cycle length, the VA interval and the atrial activation sequence, confirm the mechanism with manoeuvres (entrainment, His-refractory PVC, adenosine…), treat if needed, then conclude.${st.mystere ? ' The parameters vary slightly from one case to the next.' : ''}</p>`)
      : st.mystere
        ? t('<h2>Quiz</h2><p class="note">Cas tiré au sort, mécanisme caché, paramètres légèrement variables. Explorez de façon systématique : intervalles de base, stimulation ventriculaire puis atriale, induction, manœuvres en tachycardie, traitement, contrôle. Deux notes : le diagnostic et l\'enchaînement logique des manœuvres.</p>',
          '<h2>Quiz</h2><p class="note">Random case, hidden mechanism, slightly variable parameters. Work systematically: baseline intervals, ventricular then atrial pacing, induction, manoeuvres during tachycardia, treatment, check. Two scores: the diagnosis and the logical sequence of manoeuvres.</p>')
        : `<h2>${esc(sc.nom)}</h2><p>${esc(sc.explication)}</p>`;
    noter(null, arrivee ? t('Patient en tachycardie à l\'arrivée', 'Patient in tachycardia on arrival') : st.mystere ? t('Nouveau cas de quiz', 'New quiz case') : t(`Scénario : ${sc.nom}`, `Scenario: ${sc.nom}`), { debut: st.t - 5000, capture: st.t + 4000, auto: !!arrivee });
  }
  // quiz : cas tiré au sort (un scénario, ou une fois sur quatre environ un patient arrivé en tachycardie) ; entraînement libre : scénario choisi
  function choisir(v) {
    st.mystere = r.modeSimu === 'quiz';
    st.scenario = st.mystere ? melanger(Math.random() < 0.25 ? Object.keys(ARRIVEES) : MYSTERES)[0] : v;
    nouveauCoeur();
  }
  const STATS_QUIZ = 'rythmo.simuQuiz';
  const lireStats = () => { try { return JSON.parse(localStorage.getItem(STATS_QUIZ)) || []; } catch { return []; } };
  function majStatsQuiz() {
    const l = lireStats(), moy = k => virgule(Math.round(l.reduce((a, x) => a + x[k], 0) / l.length * 10) / 10);
    $('#quiz-stats').hidden = r.modeSimu !== 'quiz' || !l.length;
    if (l.length) $('#quiz-stats').textContent = t(`${l.length} cas faits · moyenne : diagnostic ${moy('d')}/10, démarche ${moy('m')}/10`, `${l.length} cases done · average: diagnosis ${moy('d')}/10, work-up ${moy('m')}/10`);
  }
  function appliquerMode(mode, scenarioLibre) {
    r.modeSimu = mode; ecrire(r);
    for (const b of app.querySelectorAll('[data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    $('#choix-scenario').hidden = mode === 'quiz'; $('#quiz-nouveau').hidden = mode !== 'quiz';
    majStatsQuiz();
    if (scenarioLibre) $('#scenario').value = scenarioLibre;
    choisir($('#scenario').value);
  }

  const reglages = () => {
    const n = (id, min = 0) => Math.max(min, +$(id).value || 0);
    Object.assign(r, { sortie: n('#sortie', 0.1), largeur: Math.min(2, n('#largeur', 0.5)), s1: Math.max(200, n('#s1')), n: Math.min(30, Math.round(n('#n'))),
      s2: Math.round(n('#s2')), s3: Math.round(n('#s3')), s4: Math.round(n('#s4')), extras: $('#extras').checked, rappelApres: $('#rappel-apres').checked, decrement: $('#decrement').checked,
      salveCl: n('#salve-cl', 150), salveDuree: Math.min(60, Math.round(n('#salve-duree'))), rampeDebut: n('#rampe-debut', 150), rampeFin: n('#rampe-fin', 150), rampePas: n('#rampe-pas', 1),
      puissance: Math.min(50, n('#puissance', 5)), dureeRF: Math.min(120, n('#duree-rf', 10)),
      vitesse: +$('#vitesse').value, vitesseRappel: +$('#vitesse-rappel').value, mode: $('#mode').value,
      bruit: $('#bruit').checked, etiquettes: $('#etiquettes').checked, filtre50: $('#filtre50').checked, passeHaut: $('#passe-haut').checked });
    ecrire(r);
    majResume();
    return r;
  };
  const siteReel = () => (r.site === 'abl' ? positionActuelle().stim : r.site);
  const nomSite = () => `${SITES_STIM.find(s => s.id === r.site).nom}${r.site === 'abl' ? ` (${positionActuelle().nom})` : ''}`;
  // on ne stimule que depuis un cathéter dont un dipôle est affiché sur la baie (on doit voir le spike et la capture)
  const siteAffiche = id => (VOIES_SITE[id] || []).some(v => r.voies.includes(v));
  function siteInterdit(id = r.site) {
    if (siteAffiche(id)) return false;
    const noms = (VOIES_SITE[id] || []).map(v => CANAUX.find(c => c.id === v).nom).join(t(' ou ', ' or '));
    message(t(`Stimulation impossible : la voie ${noms} n'est pas affichée. Ajoutez-la dans « Voies affichées ».`, `Pacing not possible: the ${noms} channel is not displayed. Add it under "Displayed channels".`));
    return true;
  }
  // pastilles de site : seulement les cathéters visibles sur la baie
  function majSites() {
    for (const b of $('#site').querySelectorAll('[data-v]')) b.hidden = !siteAffiche(b.dataset.v);
    if (!siteAffiche(r.site)) { const autre = SITES_STIM.find(x => siteAffiche(x.id)); if (autre) choisirPuce('site', autre.id); }
  }
  // réglages effectivement délivrés : S2, S3, S4 ignorés tant que « + extrastimulus » n'est pas coché
  const programme = () => ({ ...r, ...(r.extras ? {} : { s2: 0, s3: 0, s4: 0 }) });
  // résumé de ce que « Stimuler » va délivrer : programme (train + extrastimulus) ou salve (burst ou rampe)
  function majResume() {
    const q = programme(), extras = [q.s2, q.s3, q.s4].filter(Boolean), sortie = `${virgule(r.sortie)} mA / ${virgule(r.largeur)} ms`;
    $('#resume').textContent = r.modeStim === 'salve'
      ? (r.salveType === 'rampe' ? t(`Stimuler → rampe ${r.rampeDebut} → ${r.rampeFin} ms (pas ${r.rampePas}) · ${sortie}`, `Pace → ramp ${r.rampeDebut} → ${r.rampeFin} ms (${r.rampePas} ms steps) · ${sortie}`)
        : t(`Stimuler → burst ${r.salveCl} ms ${r.salveDuree ? `pendant ${r.salveDuree} s` : 'continu'} · ${sortie}`, `Pace → burst ${r.salveCl} ms ${r.salveDuree ? `for ${r.salveDuree} s` : 'continuous'} · ${sortie}`))
      : t('Stimuler → ', 'Pace → ') + `${r.n ? `${r.n} × ${r.s1}` : t('sans train', 'no drive train')}${extras.map((x, i) => ` · S${i + 2} ${x}`).join('')} ms · ${sortie}`
        + `${r.detection ? t(` · couplé ${COURTS_DETECTION()[r.detection]}`, ` · synced ${COURTS_DETECTION()[r.detection]}`) : ''}`;
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
    // chaque stimulus porte son rang dans le train (1/8 … 8/8) puis le couplage de l'extrastimulus (S2 400…)
    const libs = [...Array.from({ length: p.n }, (_, i) => `${i + 1}/${p.n}`), ...extras.map((x, i) => `S${i + 2} ${x}`)];
    liste.forEach((x, i) => c.stimuler(site, x, p.sortie, p.largeur, libs[i]));
    st.train = { temps: liste, n: p.n, nx: extras.length };
    // rappel centré sur le premier extrastimulus (S2), ou sur le dernier stimulus d'un train simple
    if (e && liste.length) Object.assign(e, { debut: liste[0] - 1500, capture: liste.at(-1) + 2000, focus: extras.length ? liste[p.n] : liste.at(-1), instantane: null });
    return liste;
  }

  function stimuler() {
    reglages();
    if (siteInterdit()) return;
    const p = programme(); // réglages figés au moment de l'appui (train couplé différé)
    if (!p.n && !p.s2) { message(r.extras ? t('Réglez au moins un S1 ou un S2.', 'Set at least one S1 or S2.') : t('Réglez au moins un S1, ou cochez « + extrastimulus ».', 'Set at least one S1, or tick "+ extrastimuli".')); return; }
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
          if (av != null) resultat(t(`ESV His-réfractaire : ${av > 5 ? `atrium avancé de ${av} ms` : av < -5 ? `atrium retardé de ${-av} ms` : 'atrium inchangé'}${tachycardie(c).active ? '' : ', tachycardie arrêtée'}`,
            `His-refractory PVC: ${av > 5 ? `atrium advanced by ${av} ms` : av < -5 ? `atrium delayed by ${-av} ms` : 'atrium unchanged'}${tachycardie(c).active ? '' : ', tachycardia terminated'}`), { manoeuvre: true });
        }, 3500);
      }
    };
    e = noter(type, `${nomSite()}${t(' : ', ': ')}${p.n ? `${p.n} × S1 ${p.s1}` : ''}${[p.s2, p.s3, p.s4].filter(Boolean).map((x, i) => ` S${i + 2} ${x}`).join('')} ms, ${virgule(p.sortie)} mA${p.detection ? t(`, couplé au ${SITES_DETECTION.find(d => d.id === p.detection).nom}`, `, synchronised to ${SITES_DETECTION.find(d => d.id === p.detection).nom} sensing`) : ''}`,
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

  // résultat d'une manœuvre : journal, débriefing du cas et compte rendu (manoeuvre : ESV ou entraînement, rubrique « Manœuvres »)
  function resultat(texte, { manoeuvre = false } = {}) {
    st.analyses.push(texte); if (manoeuvre) st.cr.manoeuvres.push(texte);
    noter(null, texte, { debut: st.t - 3000, capture: st.t + 500 }); $('#proto-etat').textContent = texte;
  }

  // salve à cycle fixe ; duree (ms) : arrêt automatique, sinon continue jusqu'à « Stop »
  function demarrerSalve(site, cl, { nom = nomSite(), type, duree = 0 } = {}) {
    const tach = tachycardie(st.coeur), debut = st.coeur.t + 100;
    st.salve = { site, cl, prochain: debut, debut, fin: duree ? debut + duree : null, sortie: r.sortie, largeur: r.largeur, tachy: tach.active,
      tcl: VENTRICULAIRES.has(site) ? tach.cycleV : (tach.cycleA ?? tach.cycleV), nom };
    noter(type ?? classer(site, { salve: true }), t(`Salve : ${nom} à ${cl} ms${duree ? ` pendant ${duree / 1000} s` : ''}, ${virgule(r.sortie)} mA`, `Burst: ${nom} at ${cl} ms${duree ? ` for ${duree / 1000} s` : ''}, ${virgule(r.sortie)} mA`));
    majBoutonStim();
  }
  function arreterSalve() {
    const s = st.salve; if (!s) return;
    const c = st.coeur;
    c.annulerStims(c.t);
    const der = c.stims.filter(x => x.s === s.site).at(-1)?.t;
    noter(null, t(`Arrêt de la salve (${s.nom} à ${s.cl} ms)`, `Burst stopped (${s.nom} at ${s.cl} ms)`), { debut: Math.max(s.debut - 2000, st.t - 30000), capture: st.t + 3500, focus: der, auto: r.rappelApres });
    st.salve = null; majBoutonStim();
    if (s.tachy && der != null) {
      setTimeout(() => {
        const a = analyserEntrainement(c, { der, site: s.site, tcl: s.tcl, ventriculaire: VENTRICULAIRES.has(s.site) });
        resultat(t(`Entraînement depuis ${s.nom} à ${s.cl} ms (TCL ${Math.round(s.tcl)}) : ${tachycardie(c).active ? '' : 'tachycardie arrêtée ; '}${a.reponse ? `réponse ${a.reponse}, ` : ''}PPI ${a.ppi ?? '—'} ms, PPI − TCL ${a.pptcl ?? '—'} ms`,
          `Entrainment from ${s.nom} at ${s.cl} ms (TCL ${Math.round(s.tcl)}): ${tachycardie(c).active ? '' : 'tachycardia terminated; '}${a.reponse ? (a.reponse.startsWith('V') ? `${a.reponse} response, ` : `${a.reponse}, `) : ''}PPI ${a.ppi ?? '—'} ms, PPI − TCL ${a.pptcl ?? '—'} ms`), { manoeuvre: true });
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
    const nom = atrial ? t('Extrastimulus atrial décrémental', 'Decremental atrial extrastimulus') : t('Extrastimulus ventriculaire décrémental', 'Decremental ventricular extrastimulus');
    // période réfractaire de conduction : nodale (atrial) ou rétrograde (ventriculaire)
    const libPR = () => t(`PR ${atrial ? 'nodale' : 'rétrograde'}`, `${atrial ? 'AV nodal' : 'retrograde'} ERP`);
    faire(atrial ? 'extraA' : 'extraV');
    noter(null, t(`Protocole : ${nom} (${n} × ${s1} ms, S2 dès ${s2} ms, ${virgule(sortie)} mA)`, `Protocol: ${nom} (${n} × ${s1} ms, S2 from ${s2} ms, ${virgule(sortie)} mA)`));
    const conclure = texte => {
      if (atrial) st.cr.extraA = res; else st.cr.extraV = res;
      resultat(t(`${nom} : ${texte}`, `${nom}: ${texte}`));
      return false;
    };
    const lancerTrain = t0 => {
      for (let i = 0; i < n; i++) c.stimuler(site, t0 + i * s1, sortie, r.largeur, `${i + 1}/${n}`);
      const ts = t0 + (n - 1) * s1 + s2;
      c.stimuler(site, ts, sortie, r.largeur, `S2 ${s2}`);
      st.train = { temps: [...Array.from({ length: n }, (_, i) => t0 + i * s1), ts], n, nx: 1 };
      fixer('#s2', s2); reglages();
      entree(t0, `${atrial ? t('OD haute', 'HRA') : t('VD apex', 'RV apex')}${t(' : ', ': ')}${n} × S1 ${s1} S2 ${s2} ms`, { debut: t0 - 1500, capture: ts + 2000, focus: ts, auto: r.rappelApres });
      majJournal();
      attente = { ts, s2, fin: ts + 2400 };
    };
    lancerTrain(c.t + 300);
    return { nom, etape(tc) {
      if (tc < attente.fin) return true;
      const rep = reponseStim(c, attente.ts);
      if (atrial && prec?.AH != null && rep.AH != null && rep.AH - prec.AH >= 50 && !res.saut) {
        res.saut = t(`saut d'AH de ${prec.AH} à ${rep.AH} ms à S2 = ${attente.s2} ms (double voie nodale)`, `AH jump from ${prec.AH} to ${rep.AH} ms at S2 = ${attente.s2} ms (dual AV nodal physiology)`);
      }
      const suite = () => `${res.prConduction ? t(` ; ${libPR()} = ${res.prConduction} ms`, `; ${libPR()} = ${res.prConduction} ms`) : ''}${res.saut ? t(` ; ${res.saut}`, `; ${res.saut}`) : ''}`;
      const Vapres = battementsV(c.journal, attente.ts + 150, tc).filter(v => !c.stims.some(s => Math.abs(s.t - v) < 5));
      const gaps = Vapres.slice(1).map((x, i) => x - Vapres[i]);
      if (Vapres.length >= 4 && gaps.every(g => g < 470)) {
        res.induction = attente.s2; faire('induction');
        return conclure(`${t(`tachycardie induite à S2 = ${attente.s2} ms`, `tachycardia induced at S2 = ${attente.s2} ms`)}${res.saut ? t(` ; ${res.saut}`, `; ${res.saut}`) : ''}`);
      }
      if (!rep.capture) {
        res.pr = attente.s2;
        return conclure(`${t(`PR ${atrial ? 'atriale' : 'ventriculaire'} = ${attente.s2} ms`, `${atrial ? 'Atrial' : 'Ventricular'} ERP = ${attente.s2} ms`)}${suite()}`);
      }
      const conduit = atrial ? rep.H != null : rep.Ahra != null || rep.SA != null;
      const intervalle = atrial ? rep.AH : rep.SA;
      res.courbe.push([attente.s2, intervalle]);
      if (!conduit && res.prConduction == null) res.prConduction = attente.s2;
      prec = rep;
      s2 -= 10;
      if (s2 < 150) return conclure(`${t('pas de perte de capture jusqu\'à 150 ms', 'no loss of capture down to 150 ms')}${res.prConduction ? t(` ; ${libPR()} = ${res.prConduction} ms`, `; ${libPR()} = ${res.prConduction} ms`) : ''}`);
      $('#proto-etat').textContent = `▶ ${nom}${t(' : ', ': ')}S2 ${attente.s2} → ${intervalle != null ? `${atrial ? 'AH' : 'S-A'} ${intervalle} ms` : conduit ? t('conduit', 'conducted') : t('bloqué', 'blocked')}${res.prConduction ? ` · ${libPR()} ${res.prConduction}` : ''}${res.saut ? t(' · saut d\'AH', ' · AH jump') : ''}`;
      lancerTrain(tc + 200);
      return true;
    } };
  }

  function protoRampe(atrial) {
    reglages();
    const c = st.coeur, site = atrial ? 'hra' : 'rva';
    choisirSite(site);
    const sortie = Math.max(r.sortie, 2 * seuilCapture(site, r.largeur));
    const liste = []; let ts = c.t + 150;
    for (let cl = Math.max(r.rampeDebut, 400); cl >= Math.min(r.rampeFin, 250) && liste.length < 200; cl -= 10) for (let k = 0; k < 4; k++) { c.stimuler(site, ts, sortie, r.largeur); liste.push({ t: ts, cl }); ts += cl; }
    const nom = atrial ? t('Rampe atriale (Wenckebach AV)', 'Atrial ramp (AV Wenckebach)') : t('Rampe ventriculaire (Wenckebach VA)', 'Ventricular ramp (VA Wenckebach)');
    faire(atrial ? 'extraA' : 'stimV');
    const e = noter(null, t(`Protocole : ${nom}, ${liste[0].cl} → ${liste.at(-1).cl} ms`, `Protocol: ${nom}, ${liste[0].cl} → ${liste.at(-1).cl} ms`), { debut: c.t - 1000, capture: ts + 1500, auto: r.rappelApres });
    let i = 0, conduits = 0;
    const fin = (texte, tFin) => {
      c.annulerStims(st.t);
      Object.assign(e, { capture: Math.max(st.t, Math.min(e.capture, tFin + 2500)), focus: tFin, instantane: null });
      if (atrial) st.cr.wenck = texte; else st.cr.wenckRetro = texte;
      resultat(t(`${nom} : ${texte}`, `${nom}: ${texte}`));
      return false;
    };
    return { nom, etape(tc) {
      while (i < liste.length && liste[i].t + 450 < tc) {
        const x = liste[i++], rep = reponseStim(c, x.t);
        if (!rep.capture || i <= 2) continue; // les deux premiers stimulus peuvent entrer en collision avec le rythme propre
        const conduit = atrial ? rep.H != null : rep.Ahra != null || rep.SA != null;
        if (conduit) { conduits++; $('#proto-etat').textContent = t(`▶ ${nom} : ${x.cl} ms, conduction 1:1`, `▶ ${nom}: ${x.cl} ms, 1:1 conduction`); continue; }
        return fin(conduits ? t(`bloc ${atrial ? 'AV' : 'VA'} (Wenckebach) à ${x.cl} ms`, `${atrial ? 'AV' : 'VA'} block (Wenckebach) at ${x.cl} ms`)
          : atrial ? t(`pas de conduction AV dès ${x.cl} ms`, `no AV conduction from ${x.cl} ms`) : t(`pas de conduction rétrograde (dissociation VA) dès ${x.cl} ms`, `no retrograde conduction (VA dissociation) from ${x.cl} ms`), x.t);
      }
      if (i >= liste.length) return fin(t(`conduction 1:1 conservée jusqu'à ${liste.at(-1).cl} ms`, `1:1 conduction maintained down to ${liste.at(-1).cl} ms`), liste.at(-1).t);
      return true;
    } };
  }

  function protoTRS() {
    reglages();
    const c = st.coeur, base = Math.round(cycleSinusal()), cl = 600, n = 50, site = 'hra';
    choisirSite(site);
    let ts = c.t + 150;
    for (let k = 0; k < n; k++) { c.stimuler(site, ts, Math.max(r.sortie, 2), r.largeur); ts += cl; }
    const der = ts - cl;
    noter('salveA', t(`Protocole : temps de récupération sinusale (salve OD haute 30 s à ${cl} ms ; cycle sinusal ${base} ms)`, `Protocol: sinus node recovery time (30 s HRA burst at ${cl} ms; sinus cycle length ${base} ms)`));
    return { nom: t('Récupération sinusale', 'Sinus node recovery'), etape(tc) {
      if (tc < der + 200) { $('#proto-etat').textContent = t(`▶ Salve de 30 s : ${Math.max(0, Math.round((der - tc) / 1000))} s restantes`, `▶ 30 s burst: ${Math.max(0, Math.round((der - tc) / 1000))} s remaining`); return true; }
      const trs = recuperationSinusale(c, der);
      if (trs == null && tc < der + 6000) return true;
      const texte = trs == null ? t('pas de reprise sinusale en 6 s (dysfonction sinusale sévère)', 'no sinus recovery within 6 s (severe sinus node dysfunction)')
        : t(`TRS ${trs} ms (N < 1500), TRS corrigé ${trs - base} ms (N < 525)`, `SNRT ${trs} ms (normal < 1500), CSNRT ${trs - base} ms (normal < 525)`);
      st.cr.trs = texte;
      entree(der, t('Fin de salve : récupération sinusale', 'End of burst: sinus node recovery'), { debut: der - 3000, capture: der + (trs ?? 6000) + 1500, focus: der + (trs ?? 0) / 2, auto: r.rappelApres });
      resultat(t(`Récupération sinusale : ${texte}`, `Sinus node recovery: ${texte}`));
      return false;
    } };
  }

  function protoSeuil() {
    reglages();
    const c = st.coeur, site = siteReel(), cl = arrondi10(Math.min(600, cycleSinusal() - 100));
    const debut = Math.min(Math.max(r.sortie, 1), 4), liste = [];
    let ts = c.t + 150;
    for (let s = debut; s >= 0.1 - 1e-9 && liste.length < 60; s = Math.round((s - 0.1) * 10) / 10) { c.stimuler(site, ts, s, r.largeur); liste.push({ t: ts, s }); ts += cl; }
    noter(null, t(`Protocole : seuil de capture, ${nomSite()} (${virgule(debut)} → 0,1 mA, impulsion ${virgule(r.largeur)} ms)`, `Protocol: capture threshold, ${nomSite()} (${virgule(debut)} → 0.1 mA, pulse width ${virgule(r.largeur)} ms)`), { capture: ts + 1000 });
    let i = 0, pertes = 0, dernier = null;
    return { nom: t('Seuil', 'Threshold'), etape(tc) {
      while (i < liste.length && liste[i].t + 30 < tc) {
        const x = liste[i++], st0 = c.stims.find(s => Math.abs(s.t - x.t) < 0.5);
        if (st0?.capture) { dernier = x.s; pertes = 0; } else if (++pertes >= 2 && dernier != null) {
          c.annulerStims(tc);
          const texte = t(`${nomSite()} ${virgule(dernier)} mA à ${virgule(r.largeur)} ms`, `${nomSite()} ${virgule(dernier)} mA at ${virgule(r.largeur)} ms`);
          st.cr.seuils.push(texte);
          resultat(t(`Seuil de capture : ${texte} (réglez la sortie au double du seuil)`, `Capture threshold: ${texte} (set the output to twice the threshold)`));
          return false;
        }
        $('#proto-etat').textContent = t(`▶ Seuil : ${virgule(x.s)} mA, ${st0?.capture ? 'capture' : 'perte de capture'}`, `▶ Threshold: ${virgule(x.s)} mA, ${st0?.capture ? 'capture' : 'loss of capture'}`);
      }
      if (i >= liste.length) {
        resultat(dernier == null ? t('Seuil de capture : pas de capture (sonde mal placée ou tissu inexcitable)', 'Capture threshold: no capture (poor catheter position or inexcitable tissue)')
          : t('Seuil de capture : < 0,1 mA', 'Capture threshold: < 0.1 mA'));
        return false;
      }
      return true;
    } };
  }

  function protoParaHis() {
    reglages();
    const c = st.coeur;
    if (tachycardie(c).active) message(t('La stimulation para-hisienne s\'interprète en rythme sinusal : arrêtez d\'abord la tachycardie.', 'Para-Hisian pacing is interpreted in sinus rhythm: terminate the tachycardia first.'));
    choisirSite('parahis');
    const cl = arrondi10(Math.min(600, cycleSinusal() - 100)), liste = [];
    let tp = c.t + 150;
    for (let k = 0; k < 12; k++) { const mA = Math.floor(k / 2) % 2 ? 5 : 15; c.stimuler('parahis', tp, mA, r.largeur); liste.push(tp); tp += cl; }
    noter('parahis', t(`Protocole : stimulation para-hisienne à ${cl} ms, 15 et 5 mA alternés`, `Protocol: para-Hisian pacing at ${cl} ms, alternating 15 and 5 mA`), { debut: liste[0] - 1000, capture: tp + 800, focus: liste[5] + cl / 2, auto: r.rappelApres });
    return { nom: t('Para-hisien', 'Para-Hisian'), etape(tc) {
      if (tc < tp + 600) return true;
      // intervalle stimulus-A mesuré sur l'atrium du His et sur l'ostium du SC (sortie d'une voie septale postérieure)
      const sa = { haut: { ras: [], cs9: [] }, bas: { ras: [], cs9: [] } };
      for (const ts of liste.slice(2)) {
        const rep = reponseStim(c, ts), g = rep.his ? sa.haut : sa.bas;
        for (const site of ['ras', 'cs9']) { const a = c.journal.find(x => x.r === `stim:${ts}` && x.s === site)?.t; if (a != null) g[site].push(a - ts); }
      }
      const moy = l => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null);
      const hH = moy(sa.haut.ras), bH = moy(sa.bas.ras), hS = moy(sa.haut.cs9), bS = moy(sa.bas.cs9);
      if (hH == null || bH == null) { resultat(t('Stimulation para-hisienne : pas de conduction rétrograde mesurable', 'Para-Hisian pacing: no measurable retrograde conduction')); return false; }
      const dH = bH - hH, dS = hS != null && bS != null ? bS - hS : null, signe = d => `${d > 0 ? '+' : ''}${d}`;
      const verdict = dS != null && Math.abs(dS) <= 10
        ? (dH >= 25 ? t('voie accessoire septale avec fusion nodale (S-A constant à l\'ostium du SC, allongé au His)', 'septal accessory pathway with nodal fusion (S-A unchanged at the CS ostium, prolonged at the His)')
          : t('conduction rétrograde extranodale (voie accessoire septale)', 'extranodal retrograde conduction (septal accessory pathway)'))
        : dH >= 25 ? t('conduction rétrograde nodale', 'nodal retrograde conduction') : t('réponse intermédiaire', 'intermediate response');
      const texte = t(`S-A au His ${hH} → ${bH} ms (Δ ${signe(dH)}), à l'ostium du SC ${hS ?? '—'} → ${bS ?? '—'} ms${dS != null ? ` (Δ ${signe(dS)})` : ''} en perdant la capture du His → ${verdict}`,
        `S-A at the His ${hH} → ${bH} ms (Δ ${signe(dH)}), at the CS ostium ${hS ?? '—'} → ${bS ?? '—'} ms${dS != null ? ` (Δ ${signe(dS)})` : ''} with loss of His capture → ${verdict}`);
      st.cr.parahis = texte;
      resultat(t(`Stimulation para-hisienne : ${texte}`, `Para-Hisian pacing: ${texte}`));
      return false;
    } };
  }

  function protoESV() {
    const c = st.coeur, t0 = tachycardie(c);
    if (!t0.active) { message(t('Pas de tachycardie en cours : induisez-la d\'abord.', 'No ongoing tachycardia: induce it first.')); return null; }
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
    $('#proto-etat').textContent = t(`▶ ESV His-réfractaire à ${arrondi10(t0.cycleV - 30)} ms (TCL ${Math.round(t0.cycleV)} ms) : résultat dans 3 s`, `▶ His-refractory PVC at ${arrondi10(t0.cycleV - 30)} ms (TCL ${Math.round(t0.cycleV)} ms): result in 3 s`);
    return null;
  }

  function protoEntrainement(siteForce) {
    reglages();
    const c = st.coeur, t0 = tachycardie(c);
    if (!t0.active) { message(t('Pas de tachycardie en cours : induisez-la d\'abord.', 'No ongoing tachycardia: induce it first.')); return null; }
    if (siteForce) choisirSite(siteForce);
    const site = siteReel(), ventr = VENTRICULAIRES.has(site);
    const tcl = ventr ? t0.cycleV : (t0.cycleA ?? t0.cycleV), cl = arrondi10(tcl - (ventr ? 30 : 20));
    const suivis = (ventr ? ['hra'] : ['hra', 'cs1', 'cs9', 'rva']).filter(s => s !== site);
    demarrerSalve(site, cl, { nom: nomSite() });
    const debut = st.salve.debut;
    let entraine = null;
    return { nom: t('Entraînement', 'Entrainment'), etape(tc) {
      if (!st.salve) return false;
      const n = c.stims.filter(s => s.t >= debut && s.s === site).length;
      if (n >= 6 && entraine == null) {
        const ok = suivis.every(s => { const A = activations(c.journal, s, tc - 4 * cl - 50, tc); const d = A.slice(1).map((x, i) => x - A[i]); return d.length >= 3 && d.slice(-3).every(x => Math.abs(x - cl) <= 12); });
        if (ok) { entraine = n; $('#proto-etat').textContent = t(`▶ Entraînement à ${cl} ms : arrêt dans 3 stimulus`, `▶ Entrainment at ${cl} ms: stopping after 3 more stimuli`); }
      }
      if (entraine != null && n >= entraine + 3) { arreterSalve(); return false; }
      if (n >= 25) { arreterSalve(); message(t('Pas d\'entraînement stable après 25 stimulus : essayez un cycle plus court ou vérifiez la capture.', 'No stable entrainment after 25 stimuli: try a shorter cycle length or check capture.')); return false; }
      return true;
    } };
  }

  const PROTOCOLES = { decA: () => protoDecremental(true), decV: () => protoDecremental(false), wenck: () => protoRampe(true), retro: () => protoRampe(false),
    trs: protoTRS, seuil: protoSeuil, parahis: protoParaHis, esv: protoESV, entrV: () => protoEntrainement('rva'), entrSite: () => protoEntrainement(null) };
  const SITE_PROTO = { decA: 'hra', wenck: 'hra', trs: 'hra', decV: 'rva', retro: 'rva', esv: 'rva', entrV: 'rva', parahis: 'parahis' };
  function lancerProtocole(id) {
    if (siteInterdit(SITE_PROTO[id] ?? r.site)) return;
    toutArreter({ silencieux: true });
    vibrer();
    const p = PROTOCOLES[id]();
    if (p) { st.proto = p; if (!$('#proto-etat').textContent) $('#proto-etat').textContent = t(`▶ ${p.nom} en cours…`, `▶ ${p.nom} in progress…`); }
    majBoutonStim();
  }
  function toutArreter({ silencieux = false, rf = true } = {}) {
    const c = st.coeur;
    const actif = st.proto || st.salve || (rf && st.rf) || c.tas.a.some(e => e.type === 'stim' && e.t > c.t);
    st.proto = null; st.train = null;
    $('#proto-etat').textContent = '';
    if (st.salve) arreterSalve();
    c.annulerStims(c.t);
    c.ecouteurs = [];
    if (rf) arreterRF();
    if (!silencieux && actif) { noter(null, t('Stop : stimulation interrompue', 'Stop: pacing interrupted')); $('#proto-etat').textContent = t('Arrêté.', 'Stopped.'); }
  }

  // ---------- radiofréquence : générateur, lésion progressive, rythme jonctionnel, bloc AV ----------
  // bouton violet de la console : Radiofréquence, puis Arrêter pendant le tir (libellé court sur téléphone)
  function libRF(actif, cryo = false) {
    const b = $('#ablater');
    b.setAttribute('aria-pressed', String(actif));
    b.innerHTML = actif
      ? `<span class="long">${cryo ? t('Arrêter la cryo', 'Stop cryo') : t('Arrêter la RF', 'Stop RF')}</span><span class="court">${t('Arrêt RF', 'Stop RF')}</span>`
      : `<span class="long">${t('Radiofréquence', 'RF ablation')}</span><span class="court">RF</span>`;
  }
  function demarrerRF() {
    reglages();
    const pos = positionActuelle(), cryo = pos.id === 'cryo-his';
    // contact : qualité d'appui de la sonde, tirée à chaque tir (impédance de départ plus basse quand l'appui est bon)
    const contact = 0.55 + 0.45 * Math.random();
    st.rf = { debut: st.t, pos, cryo, contact, imp0: Math.round(120 - 25 * contact + 6 * Math.random()), lesion: 0, applique: false, junct: false, alerteVA: false,
      temp: 37, imp: 0, tMax: 37, derive: pos.id === 'koch' ? 25000 + 20000 * Math.random() : Infinity };
    libRF(true, cryo);
    noter(null, t(`Radiofréquence : ${cryo ? 'cryothérapie' : `tir ${r.puissance} W`}, ${pos.nom}`, cryo ? `Cryoablation: ${pos.nom}` : `RF application ${r.puissance} W: ${pos.nom}`), { debut: st.t - 3000, capture: st.t + 8000, rf: true });
  }
  function arreterRF(silencieux = false) {
    const rf = st.rf; if (!rf) return;
    st.rf = null;
    st.coeur?.jonction(null);
    libRF(false);
    const duree = Math.round((st.t - rf.debut) / 1000);
    st.cr?.tirs.push({ pos: rf.pos.nom, duree, puissance: rf.cryo ? 'cryo' : `${r.puissance} W`, efficace: rf.applique, tMax: Math.round(rf.tMax) });
    if (!silencieux) noter(null, t(`Fin du tir : ${duree} s, ${Math.round(rf.tMax)} °C ${rf.cryo ? 'min' : 'max'}`, `End of application: ${duree} s, ${Math.round(rf.tMax)} °C ${rf.cryo ? 'min' : 'max'}`), { debut: rf.debut - 2000, capture: st.t + 2500, auto: r.rappelApres });
    $('#rf-etat').textContent = t(`Dernier tir : ${duree} s${rf.applique ? ', lésion constituée' : ', lésion incomplète'}`, `Last application: ${duree} s${rf.applique ? ', lesion formed' : ', incomplete lesion'}`);
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
      st.historique.push({ type: 'tir', t: st.t, tachy: tachycardie(c).active, efficace: touchees.length > 0 });
      if (touchees.includes('nav') || touchees.includes('rapide')) message(t('Bloc AV : la voie nodale rapide a été détruite.', 'AV block: the fast pathway has been ablated.'));
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
          message(t('⚠ Rythme jonctionnel sans conduction VA : risque de bloc AV, arrêtez le tir !', '⚠ Junctional rhythm without VA conduction: risk of AV block, stop the application!'));
          noter(null, t('Alerte : rythme jonctionnel sans conduction VA', 'Alert: junctional rhythm without VA conduction'), { debut: st.t - 5000, capture: st.t + 1000, auto: true });
        }
      }
    }
    $('#rf-etat').textContent = `${rf.cryo ? 'Cryo' : `${r.puissance} W`} · ${Math.round(rf.temp)} °C · ${rf.imp} Ω · ${Math.round(el / 1000)} s · contact ${rf.contact > 0.8 ? t('bon', 'good') : rf.contact > 0.65 ? t('moyen', 'fair') : t('faible', 'poor')}`;
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
    if (tachycardie(c).active) { st.positionsTachy.add(st.position); if (st.positionsTachy.size >= 2 && !st.faites.has('cartographie')) faire('cartographie'); }
    if (st.rf) arreterRF();
    noter(null, t(`Sonde d'ablation : ${pos.nom}`, `Ablation catheter: ${pos.nom}`));
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
    const sc = scenario(st.scenario), cr = st.cr, c = st.coeur, b = cr.base;
    // libellés évalués à la génération du compte rendu, dans la langue courante
    const ligne = (lib, v) => `<tr><th>${lib}</th><td>${v ? esc(v) : `<span class="note">${t('non réalisé', 'not performed')}</span>`}</td></tr>`;
    const sep = t(' ; ', '; ');
    const ext = (x, atrial) => x && [`${x.n} × ${x.s1} ms`, x.pr ? t(`PR ${atrial ? 'atriale' : 'ventriculaire'} ${x.pr} ms`, `${atrial ? 'atrial' : 'ventricular'} ERP ${x.pr} ms`) : '',
      x.prConduction ? t(`PR ${atrial ? 'nodale' : 'rétrograde'} ${x.prConduction} ms`, `${atrial ? 'AV nodal' : 'retrograde'} ERP ${x.prConduction} ms`) : '',
      x.saut || '', x.induction ? t(`induction à S2 = ${x.induction} ms`, `induction at S2 = ${x.induction} ms`) : ''].filter(Boolean).join(sep);
    const blocAV = c.voies.some(v => v.nodale && v.coupee && v.id !== 'lente') && !(sc.cible && [].concat(sc.cible).includes('rapide'));
    const conclusion = st.enquete ? ($('#verdict').textContent ? t(`Diagnostic proposé : ${$('#reponse').selectedOptions[0]?.text}`, `Proposed diagnosis: ${$('#reponse').selectedOptions[0]?.text}`)
      : t('Diagnostic non encore proposé', 'No diagnosis proposed yet')) : sc.nom;
    const rows = [
      ligne(t('Indication', 'Indication'), sc.contexte),
      ligne(ARRIVEES[st.scenario] ? t('Rythme à l\'arrivée', 'Rhythm on arrival') : t('Rythme de base', 'Baseline rhythm'),
        b && t(`cycle ${f0(b.cycleA)} ms, AH ${f0(b.AH)} ms, HV ${f0(b.HV)} ms${b.pa ? ` ; PA ${b.pa.sys}/${b.pa.dia} mmHg` : ''}`, `CL ${f0(b.cycleA)} ms, AH ${f0(b.AH)} ms, HV ${f0(b.HV)} ms${b.pa ? `; BP ${b.pa.sys}/${b.pa.dia} mmHg` : ''}`)),
      ligne(t('Conduction AV (rampe)', 'AV conduction (ramp)'), cr.wenck), ligne(t('Conduction VA (rampe)', 'VA conduction (ramp)'), cr.wenckRetro),
      ligne(t('Extrastimulus atrial', 'Atrial extrastimulus testing'), ext(cr.extraA, true)), ligne(t('Extrastimulus ventriculaire', 'Ventricular extrastimulus testing'), ext(cr.extraV, false)),
      ligne(t('Fonction sinusale', 'Sinus node function'), cr.trs), ligne(t('Seuils de capture', 'Capture thresholds'), cr.seuils.join(sep)), ligne(t('Para-hisien', 'Para-Hisian pacing'), cr.parahis),
      ligne(t('Inductibilité', 'Inducibility'), cr.inductions.map(i => t(`tachycardie à ${f0(i.cycleV)} ms (A ${f0(i.cycleA)}), VA ${f0(i.VA)} ms, activation atriale la plus précoce : ${i.precoce ?? '—'}`,
        `tachycardia CL ${f0(i.cycleV)} ms (A ${f0(i.cycleA)}), VA ${f0(i.VA)} ms, earliest atrial activation: ${i.precoce ?? '—'}`)).join(sep)
        || (st.faites.has('extraA') || st.faites.has('extraV') ? t('non inductible', 'non-inducible') : '')),
      ligne(t('Manœuvres', 'Manoeuvres'), cr.manoeuvres.join(sep)),
      ligne(t('Cartographie', 'Mapping'), Object.keys(st.carte).length ? Object.entries(st.carte).sort((x, y) => x[1].lat - y[1].lat).map(([id, p]) => `${POSITIONS.find(q => q.id === id).nom} ${p.lat} ms`).join(', ') : ''),
      ligne(t('Ablation', 'Ablation'), cr.tirs.map(x => `${x.pos}${t(' : ', ': ')}${x.puissance}, ${x.duree} s, ${x.tMax} °C${x.efficace ? t(', lésion constituée', ', lesion formed') : ''}`).join(sep)),
      ligne(t('Complications', 'Complications'), [blocAV ? t('bloc AV complet', 'complete AV block') : '', cr.hypotension ? t('tachycardie mal tolérée (hypotension)', 'poorly tolerated tachycardia (hypotension)') : ''].filter(Boolean).join(', ') || t('aucune', 'none')),
      ligne(t('Conclusion', 'Conclusion'), conclusion),
    ];
    const texte = () => [...$('#compte-rendu').querySelectorAll('tr')].map(tr => `${tr.cells[0].textContent}${t(' : ', ': ')}${tr.cells[1].textContent}`).join('\n');
    $('#compte-rendu').innerHTML = `<h2>${t('Compte rendu d\'exploration électrophysiologique', 'Electrophysiology study report')}</h2>
      <table class="simu-cr-table">${rows.join('')}</table>
      <div class="actions serre gauche"><button class="btn" id="cr-copier">${t('Copier le texte', 'Copy text')}</button><button class="btn" id="cr-fermer">${t('Fermer', 'Close')}</button></div>`;
    $('#compte-rendu').hidden = false;
    $('#cr-copier').onclick = async () => {
      try { await navigator.clipboard.writeText(`${t('Compte rendu d\'EEP', 'EP study report')}\n${texte()}`); message(t('Compte rendu copié.', 'Report copied.')); } catch { message(t('Copie impossible : sélectionnez le texte.', 'Unable to copy: select the text.')); }
    };
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
    b.textContent = actif ? 'Stop' : t('Stimuler', 'Pace');
    b.classList.toggle('btn-stop', actif); b.classList.toggle('btn-primaire', !actif);
    b.setAttribute('aria-label', actif ? t('Arrêter la stimulation en cours', 'Stop the current pacing') : t('Stimuler', 'Pace'));
  }
  // Stimuler délivre le programme (onglet Programme) ou la salve (onglet Salve : burst ou rampe), selon le dernier des deux ouvert
  function lancerSalve() {
    reglages();
    if (siteInterdit()) return;
    vibrer();
    const site = siteReel();
    if (r.salveType === 'burst') { demarrerSalve(site, r.salveCl, { duree: r.salveDuree * 1000 }); return; }
    const c = st.coeur, t0 = c.t + 150;
    let ts = t0, n = 0;
    for (let cl = r.rampeDebut; cl >= r.rampeFin && n < 200; cl -= r.rampePas) for (let k = 0; k < 4; k++, n++) { c.stimuler(site, ts, r.sortie, r.largeur); ts += cl; }
    noter(VENTRICULAIRES.has(site) ? 'stimV' : 'extraA', t(`Rampe ${r.rampeDebut} → ${r.rampeFin} ms (pas ${r.rampePas} ms, 4 stimulus par palier)`, `Ramp ${r.rampeDebut} → ${r.rampeFin} ms (${r.rampePas} ms steps, 4 stimuli per step)`),
      { debut: t0 - 1500, capture: ts + 1500, auto: r.rappelApres });
  }
  $('#stimuler').onclick = () => { if (stimEnCours()) toutArreter({ rf: false }); else if (r.modeStim === 'salve') lancerSalve(); else stimuler(); majBoutonStim(); };
  $('#salveType').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    choisirPuce('salveType', b.dataset.v);
    $('#bloc-burst').hidden = r.salveType !== 'burst'; $('#bloc-rampe').hidden = r.salveType !== 'rampe'; majResume();
  });
  $('#extras').addEventListener('change', e => { $('#extras-bloc').hidden = !e.target.checked; reglages(); });
  $('#enregistrer').onclick = () => { reglages(); faire('mesure'); noter(null, t('Enregistrement', 'Recording'), { debut: st.t - 10000, capture: st.t, auto: true }); };
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
  libRF(false);
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
    r.onglet = b.dataset.onglet;
    if (r.onglet === 'prog' || r.onglet === 'salve') { r.modeStim = r.onglet; majResume(); } // ce que « Stimuler » délivre
    ecrire(r); replier(false);
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
  for (const id of ['#sortie', '#largeur', '#s1', '#n', '#s2', '#s3', '#s4', '#rappel-apres', '#decrement', '#salve-cl', '#salve-duree', '#rampe-debut', '#rampe-fin', '#rampe-pas', '#puissance', '#duree-rf',
    '#vitesse', '#mode', '#bruit', '#etiquettes', '#filtre50', '#passe-haut']) $(id).addEventListener('change', reglages);
  // montage : jeu de voies prédéfini ; chaque voie peut ensuite être ajoutée ou enlevée (montage personnalisé)
  function majVoies() {
    for (const b of app.querySelectorAll('[data-voie]')) b.setAttribute('aria-pressed', String(r.voies.includes(b.dataset.voie)));
    $('#voies-nb').textContent = r.voies.length;
    $('#montage').value = r.montage;
    majSites();
    ecrire(r); st.sale = true;
  }
  $('#montage').addEventListener('change', e => {
    if (e.target.value === 'perso') { r.montage = 'perso'; majVoies(); return; }
    r.montage = e.target.value; r.voies = [...MONTAGES[r.montage].voies]; majVoies();
  });
  $('#voies-bloc').addEventListener('click', e => {
    const b = e.target.closest('[data-voie]'); if (!b) return;
    const id = b.dataset.voie, avec = !r.voies.includes(id);
    if (!avec && r.voies.length <= 1) { message(t('Gardez au moins une voie.', 'Keep at least one channel.')); return; }
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
  $('#compas-plus').onclick = () => { st.nouveauCompas = true; st.finOuverte = false; message(t('Faites glisser sur l\'écran de rappel (au doigt : appui long sur le début, puis sur la fin) pour poser le nouveau compas.', 'Drag across the review screen (with a finger: press and hold on the start, then on the end) to place the new calliper.')); };
  $('#compas-report').onclick = () => { st.report = !st.report; st.sale = true; $('#compas-report').classList.toggle('actif', st.report); };
  $('#compas-effacer').onclick = () => { st.curseurs = []; st.finOuverte = false; st.sale = true; };
  $('#aimant').onclick = () => { r.aimant = !r.aimant; ecrire(r); $('#aimant').classList.toggle('actif', r.aimant); $('#aimant').setAttribute('aria-pressed', String(r.aimant)); };
  $('#comparer').onclick = () => {
    if (!st.rappel?.instantane) { message(t('Rappelez d\'abord un événement.', 'Recall an event first.')); return; }
    st.reference = st.rappel; $('#reference').hidden = false; $('#reference-titre').textContent = `${hms(st.reference.t)} · ${st.reference.texte}`; st.sale = true;
    message(t('Référence gardée : rappelez un autre événement pour comparer.', 'Reference kept: recall another event to compare.'));
  };
  $('#reference-fermer').onclick = () => { st.reference = null; $('#reference').hidden = true; };

  // ---------- téléphone : paysage, un écran à la fois, glisser pour changer d'écran ----------
  $('#btn-paysage').onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await screen.orientation.lock('landscape');
    } catch { message(t('Tournez votre téléphone (et désactivez le verrouillage de la rotation) pour passer en paysage.', 'Turn your phone (and disable rotation lock) to switch to landscape.')); }
  };
  function montrer(vue) {
    st.vue = vue; baie.dataset.vue = vue; st.sale = true;
    for (const b of app.querySelectorAll('.simu-bascule [data-vue]')) b.setAttribute('aria-selected', String(b.dataset.vue === vue));
    if (vue === 'rappel') $('#bascule-nouveau').hidden = true;
    majRecul();
  }
  $('.simu-bascule').addEventListener('click', e => { const b = e.target.closest('[data-vue]'); if (b) montrer(b.dataset.vue); });
  canvasMini.addEventListener('click', () => montrer('direct'));
  // téléphone en paysage : la vignette du temps réel peut être retirée de l'écran de rappel (elle gêne les mesures)
  $('#mini-direct').onclick = e => {
    r.miniDirect = !r.miniDirect; ecrire(r);
    baie.dataset.mini = r.miniDirect ? 'oui' : 'non';
    e.currentTarget.setAttribute('aria-pressed', String(r.miniDirect)); e.currentTarget.classList.toggle('actif', r.miniDirect);
  };
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
  const aimantsSous = e => {
    const y = e.clientY - canvasR.getBoundingClientRect().top;
    const rangee = (geoR?.rangees || []).find(x => y >= x.y0 && y < x.y1)?.id;
    aimants = rangee ? evenementsCanal(rangee, st.rappel.instantane, st.rappel.instantane.ablation) : [];
  };
  const poserDebut = ta => {
    if (st.nouveauCompas || !st.curseurs.length) { st.curseurs.push([ta, null]); if (st.curseurs.length > 3) st.curseurs.shift(); st.nouveauCompas = false; }
    else st.curseurs[st.curseurs.length - 1] = [ta, null];
    st.sale = true;
  };
  const mesureFaite = () => { if (st.curseurs.at(-1)?.[1] != null && st.historique.at(-1)?.type !== 'mesure') faire('mesure'); };
  // Souris : glisser du début à la fin. Doigt : appui long (2 s) sur le début, puis nouvel appui maintenu (1 s) sur la fin ;
  // pendant ce second appui, la fin suit le doigt. Un appui bref ou un glissement ne pose rien.
  const APPUI_DEBUT = 2000, APPUI_FIN = 1000, bague = $('#appui');
  let appui = null;
  const annulerAppui = () => { if (!appui) return; clearTimeout(appui.minuteur); appui = null; bague.hidden = true; };
  const armerAppui = e => {
    clearTimeout(appui?.minuteur);
    const b = canvasR.getBoundingClientRect(), duree = st.finOuverte ? APPUI_FIN : APPUI_DEBUT;
    appui = { id: e.pointerId, x: e.clientX, y: e.clientY, minuteur: setTimeout(validerAppui, duree) };
    bague.hidden = false; bague.style.left = `${e.clientX - b.left}px`; bague.style.top = `${e.clientY - b.top}px`;
    bague.style.setProperty('--duree', `${duree}ms`); bague.classList.toggle('fin', st.finOuverte);
    bague.classList.remove('charge'); void bague.offsetWidth; bague.classList.add('charge'); // relance l'animation de la bague
  };
  function validerAppui() {
    if (!appui || !st.rappel) return;
    const ta = aimanter(temps({ clientX: appui.x }));
    if (ta == null) { annulerAppui(); return; }
    if (!st.finOuverte) { poserDebut(ta); st.finOuverte = true; message(t('Début posé : appuyez longuement sur la fin de l\'intervalle.', 'Start set: press and hold on the end of the interval.')); }
    else { st.curseurs.at(-1)[1] = ta; st.finOuverte = false; mesureFaite(); }
    st.sale = true; vibrer(); annulerAppui();
  }
  canvasR.addEventListener('pointerdown', e => {
    if (gain(canvasR, geoR, e) || !st.rappel) return;
    if (nbDoigtsR() > 1) { annulerAppui(); return; }
    const t = temps(e); if (t == null) return;
    aimantsSous(e);
    if (e.pointerType === 'touch') {
      try { canvasR.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      armerAppui(e);
      if (st.finOuverte && st.curseurs.length) { st.curseurs.at(-1)[1] = aimanter(t); st.sale = true; }
      return;
    }
    poserDebut(aimanter(t));
    glisse = true; canvasR.setPointerCapture(e.pointerId);
  });
  canvasR.addEventListener('pointermove', e => {
    if (appui && e.pointerId === appui.id) {
      if (nbDoigtsR() > 1) { annulerAppui(); return; }
      const bouge = Math.hypot(e.clientX - appui.x, e.clientY - appui.y);
      if (st.finOuverte && st.curseurs.length) { st.curseurs.at(-1)[1] = aimanter(temps(e)); st.sale = true; } // la fin suit le doigt
      if (bouge > 10) { if (st.finOuverte) armerAppui(e); else annulerAppui(); } // tenir le doigt immobile pour valider
      return;
    }
    if (glisse && st.curseurs.length && nbDoigtsR() < 2) { st.curseurs.at(-1)[1] = aimanter(temps(e)); st.sale = true; }
  });
  canvasR.addEventListener('pointerup', e => {
    if (appui && e.pointerId === appui.id) {
      annulerAppui();
      if (st.finOuverte && st.curseurs.length) { st.curseurs.at(-1)[1] = null; st.sale = true; } // doigt levé trop tôt : la fin reste à poser
      return;
    }
    if (glisse) mesureFaite();
    glisse = false;
  });
  canvasR.addEventListener('pointercancel', annulerAppui);
  canvasR.addEventListener('contextmenu', e => e.preventDefault()); // pas de menu contextuel sur appui long
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (canvasR.isConnected) majRecul(); }).observe(canvasR);

  // ---------- boucle d'animation ----------
  let dernier = performance.now(), dernierePos = 0;
  const etat = $('#etat'), zoneMesures = $('#mesures'), zoneVitaux = $('#constantes');
  const optionsTrace = () => ({ voies: r.voies, gains: st.gains, etiquettes: r.etiquettes, bruit: r.bruit, filtre50: r.filtre50, passeHaut: r.passeHaut,
    hauteurMax: compact() ? Math.max(200, innerHeight - 96) : innerWidth < 700 ? Math.round(innerHeight * 0.48) : 0 });
  const htmlMesures = m => `<span>A-A <b>${f0(m.cycleA)}</b></span><span>V-V <b>${f0(m.cycleV)}</b></span><span>AH <b>${f0(m.AH)}</b></span><span>HV <b>${f0(m.HV)}</b></span><span>VA <b>${f0(m.VA)}</b></span>`;
  const NOMS_PRECOCE = () => ({ hra: t('OD haute', 'high RA'), ras: 'His', cs9: t('SC proximal', 'proximal CS'), cs7: t('SC 7-8', 'CS 7-8'), cs5: t('SC 5-6', 'CS 5-6'), cs3: t('SC 3-4', 'CS 3-4'), cs1: t('SC distal', 'distal CS') });
  function image(maintenant) {
    if (!canvas.isConnected) { arreterSimulateur(); return; }
    const dt = Math.min(100, maintenant - dernier); dernier = maintenant;
    const c = st.coeur;
    const cible = st.t + dt;
    if (st.salve) {
      while (st.salve.prochain < cible + 400 && (st.salve.fin == null || st.salve.prochain <= st.salve.fin)) { c.stimuler(st.salve.site, st.salve.prochain, st.salve.sortie, st.salve.largeur); st.salve.prochain += st.salve.cl; }
      if (st.salve.fin != null && st.t > st.salve.prochain - st.salve.cl + 20 && st.salve.prochain > st.salve.fin) arreterSalve(); // burst de durée choisie terminé
    }
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
        noter('induction', `${t('Tachycardie', 'Tachycardia')} (A ${Math.round(tach.cycleA ?? 0)} / V ${Math.round(tach.cycleV ?? 0)} ms)`);
        const V = battementsV(c.journal, st.t - 1500, st.t).at(-2);
        st.cr.inductions.push({ cycleA: tach.cycleA, cycleV: tach.cycleV, VA: m.VA, precoce: V != null ? NOMS_PRECOCE()[sitePlusPrecoce(c.journal, V, V + 400)] : null });
      }
      st.tachyAvant = tach.active;
      if (c.evenements.some(e => !e.vu)) majJournal();
      zoneMesures.innerHTML = htmlMesures(m);
      // constantes : alerte si la pression moyenne reste < 60 mmHg plus de 8 s
      if (pa) {
        st.hypo = pa.moy < 60 ? st.hypo + 1 : 0;
        if (st.hypo === 32) {
          st.cr.hypotension = true;
          message(t('⚠ Hypotension : tachycardie mal tolérée, arrêtez-la (stimulation, adénosine ou choc).', '⚠ Hypotension: poorly tolerated tachycardia, terminate it (pacing, adenosine or DC shock).'));
          noter(null, `Hypotension ${pa.sys}/${pa.dia} mmHg`, { debut: st.t - 8000, capture: st.t + 500, auto: true });
        }
        const spo2 = pa.moy < 55 ? 94 : pa.moy < 65 ? 96 : 98;
        zoneVitaux.innerHTML = `${t('PA', 'BP')} <b class="${pa.moy < 60 ? 'alerte' : ''}">${pa.sys}/${pa.dia}</b> SpO₂ <b>${t(`${spo2} %`, `${spo2}%`)}</b>`;
      }
      // carte : point acquis quand la sonde reste en place pendant la tachycardie
      if (tach.active && maintenant - dernierePos > 1500) { dernierePos = maintenant; acquerirPoint(); }
      const ad = c.adenosine && st.t < c.adenosine.fin + 500, iso = c.niveau('iso', st.t);
      // compteur du train en cours : S1 délivrés / demandés, puis extrastimulus
      let train = '';
      if (st.train) {
        const faits = st.train.temps.filter(x => x <= st.t).length;
        if (faits >= st.train.temps.length) st.train = null;
        else train = faits <= st.train.n ? t(`Train S1 ${faits}/${st.train.n}`, `S1 drive train ${faits}/${st.train.n}`) : `S${faits - st.train.n + 1}`;
      }
      etat.textContent = [train, st.proto ? `▶ ${st.proto.nom}` : '', jonctionnel ? t('Rythme jonctionnel', 'Junctional rhythm') : '', st.salve ? `${t('Salve', 'Burst')} ${st.salve.cl} ms` : '',
        st.rf ? `${st.rf.cryo ? 'Cryo' : 'RF'} ${Math.round(st.rf.temp)} °C ${Math.round((st.t - st.rf.debut) / 1000)} s` : '',
        ad ? t('Adénosine', 'Adenosine') : '', iso > 0.05 ? t(`Isoprénaline ${Math.round(iso * 100)} %`, `Isoprenaline ${Math.round(iso * 100)}%`) : '', c.fa ? t('FA', 'AF') : '',
        tach.active ? `${t('Tachycardie', 'Tachycardia')} (${tach.cycleA != null && tach.cycleV != null && Math.abs(tach.cycleA - tach.cycleV) > 20 ? `A ${Math.round(tach.cycleA)} / V ${Math.round(tach.cycleV)}` : `${t('cycle', 'CL')} ${Math.round(tach.cycleV ?? tach.cycleA)}`} ms)` : ''].filter(Boolean).join(' · ');
    }
    boucle = requestAnimationFrame(image);
  }

  // ---------- quiz : note du diagnostic, note de la démarche, démarche idéale ----------
  // familles de mécanismes : un diagnostic de la bonne famille vaut la moitié des points
  const FAMILLES = [['normal', 'double'], ['trin', 'trin-atyp', 'trin-21'], ['trav', 'septale', 'pjrt', 'coumel', 'wpw', 'mahaim'], ['flutter', 'flutter-mitral'], ['ta', 'jonctionnelle']];
  const ETUDE = new Set(['extraA', 'extraV', 'stimV', 'induction', 'iso', 'salveA']); // étude de base et induction
  const STIMULATION = new Set(['extraA', 'extraV', 'stimV', 'salveA', 'induction', 'parahis']);
  const MANOEUVRE_SINUSAL = new Set(['parahis']); // manœuvres qui s'interprètent en rythme sinusal
  const IDEAL = () => ({
    esvHis: t('ESV His-réfractaire (VD couplé au His, S2 = TCL − 30 ms) : un atrium avancé ou retardé, ou un arrêt sans atteindre l\'atrium, prouve une voie accessoire.', 'His-refractory PVC (RV synced to the His, S2 = TCL − 30 ms): an advanced or delayed atrium, or termination without reaching the atrium, proves an accessory pathway.'),
    entrainementV: t('Entraînement ventriculaire à TCL − 20 à 40 ms : V-A-V (réentrée nodale ou voie accessoire) ou V-A-A-V (tachycardie atriale) ; PPI − TCL > 115 ms en faveur d\'une TRIN.', 'Ventricular entrainment at TCL − 20 to 40 ms: V-A-V (nodal re-entry or accessory pathway) or V-A-A-V (atrial tachycardia); PPI − TCL > 115 ms favours AVNRT.'),
    entrainementA: t('Entraînement atrial depuis l\'isthme, le SC proximal et distal : PPI − TCL < 20-30 ms = site dans le circuit.', 'Atrial entrainment from the isthmus, proximal and distal CS: PPI − TCL < 20-30 ms = site within the circuit.'),
    entrainementCicatrice: t('Entraînement depuis la cicatrice : PPI − TCL court et QRS identique (fusion cachée) = isthme critique.', 'Entrainment from the scar: short PPI − TCL and identical QRS (concealed fusion) = critical isthmus.'),
    parahis: t('Stimulation para-hisienne en rythme sinusal : S-A qui s\'allonge à la perte de capture du His = conduction nodale ; S-A constant = voie accessoire septale.', 'Para-Hisian pacing in sinus rhythm: S-A lengthening on loss of His capture = nodal conduction; constant S-A = septal accessory pathway.'),
    adenosine: t('Adénosine en tachycardie : arrêt sur une onde A (dépendance nodale) ou persistance de l\'activité atriale avec bloc AV (tachycardie atriale).', 'Adenosine during tachycardia: termination on an A wave (node-dependent) or persistent atrial activity with AV block (atrial tachycardia).'),
    cartographie: t('Cartographie avec la sonde d\'ablation : site d\'activation le plus précoce (carte colorée), électrogramme local, QS en unipolaire.', 'Mapping with the ablation catheter: earliest activation site (coloured map), local electrogram, QS on the unipolar.'),
  });
  function demarcheIdeale(sc, id) {
    const base = sc.base ?? id, arrivee = !!ARRIVEES[id], tachy = !['normal', 'double'].includes(base);
    const disc = (sc.manoeuvres || []).filter(m => IDEAL()[m]).map(m => IDEAL()[m]);
    const pos = sc.position ? POSITIONS.find(p => p.id === sc.position)?.nom : '';
    const etapes = [];
    if (arrivee) etapes.push(t('Analyser la tachycardie avant toute manœuvre : cycle, rapport A/V, VA, séquence atriale (Enregistrer, compas).', 'Analyse the tachycardia before any manoeuvre: cycle length, A/V ratio, VA interval, atrial sequence (Record, calipers).'));
    else {
      etapes.push(t('Mesurer les intervalles de base : cycle, AH, HV (Enregistrer, compas).', 'Measure baseline intervals: cycle length, AH, HV (Record, calipers).'));
      etapes.push(t('Stimulation ventriculaire : rampe et extrastimulus (conduction rétrograde, séquence atriale, décrément).', 'Ventricular pacing: ramp and extrastimuli (retrograde conduction, atrial sequence, decrement).'));
      etapes.push(t('Stimulation atriale : extrastimulus décrémental et rampe (courbe AH, saut, PR nodale, Wenckebach).', 'Atrial pacing: decremental extrastimuli and ramp (AH curve, jump, AV nodal ERP, Wenckebach).'));
      etapes.push(tachy ? t('Induction : extrastimulus atrial ou ventriculaire, salve, sous isoprénaline si besoin.', 'Induction: atrial or ventricular extrastimuli, burst, under isoproterenol if needed.')
        : t('Rechercher une tachycardie, y compris sous isoprénaline : non inductible.', 'Attempt induction, including under isoproterenol: not inducible.'));
    }
    if (tachy && !arrivee) etapes.push(t('En tachycardie : cycle, VA, séquence atriale, rapport A/V.', 'During tachycardia: cycle length, VA interval, atrial sequence, A/V ratio.'));
    etapes.push(...disc);
    if (arrivee) etapes.push(t('Arrêter la tachycardie (stimulation, adénosine) puis étudier la conduction en rythme sinusal.', 'Terminate the tachycardia (pacing, adenosine), then study conduction in sinus rhythm.'));
    etapes.push(sc.cible ? (sc.ablationOptionnelle ? t(`Traitement : abstention possible ; si ablation, ${pos} (cryothérapie prudente).`, `Treatment: observation acceptable; if ablating, ${pos} (cautious cryoablation).`) : t(`Traitement : ablation, ${pos}.`, `Treatment: ablation, ${pos}.`))
      : base === 'fa' ? t('Traitement : isolation des veines pulmonaires (non modélisée ici).', 'Treatment: pulmonary vein isolation (not modelled here).') : t('Traitement : pas d\'ablation.', 'Treatment: no ablation.'));
    if (sc.cible) etapes.push(base === 'flutter' ? t('Contrôle : bloc bidirectionnel de l\'isthme (stimulation de l\'ostium du SC puis de l\'isthme latéral) et non-inductibilité.', 'Check: bidirectional isthmus block (pacing from the CS ostium, then the lateral isthmus) and non-inducibility.')
      : t('Contrôle : non-inductibilité (± isoprénaline) et conduction AV conservée.', 'Check: non-inducibility (± isoproterenol) and preserved AV conduction.'));
    return etapes;
  }
  function evaluer(sc, id, rep) {
    const base = sc.base ?? id, arrivee = !!ARRIVEES[id], h = st.historique, c = st.coeur;
    const noteDiag = rep === base ? 10 : FAMILLES.some(f => f.includes(base) && f.includes(rep)) ? 5 : 0;
    const premier = pred => h.find(pred)?.t ?? Infinity;
    const cible = sc.cible ? [].concat(sc.cible) : [];
    const tirs = h.filter(x => x.type === 'tir'), premierTir = tirs[0]?.t ?? Infinity, dernierEfficace = tirs.filter(x => x.efficace).at(-1)?.t;
    const tire = st.actions.some(a => a.rf);
    const ablOk = !cible.length || c.voies.some(v => v.coupee && cible.includes(v.id)) || cible.some(x => c.sites[x]?.supprime) || (sc.ablationOptionnelle && !tire);
    const blocAV = c.voies.some(v => v.coupee && (v.id === 'nav' || v.id === 'rapide')) && !cible.includes('rapide');
    const ablInutile = !cible.length && tire;
    const disc = (sc.manoeuvres || []).filter(m => !ETUDE.has(m) || (base === 'fa' && m === 'salveA'));
    // une manœuvre discriminante compte si elle a été faite dans le bon contexte (en tachycardie, ou en rythme sinusal pour le para-hisien)
    const faiteBien = m => h.some(x => x.type === m && (MANOEUVRE_SINUSAL.has(m) ? !x.tachy : (x.tachy || !['esvHis', 'entrainementV', 'entrainementA', 'entrainementCicatrice', 'adenosine', 'cartographie'].includes(m))));
    const lignes = [], ajoute = (pts, max, texte) => lignes.push({ pts, max, texte });
    const induction = premier(x => x.type === 'induction');
    if (arrivee) {
      const premiereManoeuvre = premier(x => x.type !== 'mesure');
      ajoute(premier(x => x.type === 'mesure') < premiereManoeuvre ? 1 : 0, 1, t('Tachycardie analysée (enregistrement, compas) avant la première manœuvre', 'Tachycardia analysed (recording, calipers) before the first manoeuvre'));
      ajoute(h.some(x => STIMULATION.has(x.type) && !x.tachy) ? 1 : 0, 1, t('Conduction étudiée en rythme sinusal après l\'arrêt de la tachycardie', 'Conduction studied in sinus rhythm after termination'));
      ajoute(disc.some(m => !MANOEUVRE_SINUSAL.has(m) && faiteBien(m)) || !disc.length ? 1 : 0, 1, t('Manœuvres faites pendant la tachycardie, avant de l\'arrêter', 'Manoeuvres performed during the tachycardia, before terminating it'));
    } else {
      const avantInduction = Math.min(induction, premierTir);
      ajoute(premier(x => ['stimV', 'extraV'].includes(x.type) && !x.tachy) < avantInduction ? 1 : 0, 1, t('Conduction rétrograde étudiée (stimulation ventriculaire) avant l\'induction', 'Retrograde conduction studied (ventricular pacing) before induction'));
      ajoute(premier(x => x.type === 'extraA' && !x.tachy) < avantInduction ? 1 : 0, 1, t('Conduction antérograde étudiée (extrastimulus atrial, Wenckebach) avant l\'induction', 'Anterograde conduction studied (atrial extrastimuli, Wenckebach) before induction'));
      const inductible = !['normal', 'double'].includes(base);
      ajoute(inductible ? (induction < Infinity ? 1 : 0) : (st.faites.has('iso') ? 1 : st.faites.has('extraA') ? 0.5 : 0), 1,
        inductible ? t('Tachycardie induite', 'Tachycardia induced') : t('Inductibilité recherchée jusque sous isoprénaline', 'Inducibility tested, including under isoproterenol'));
    }
    const faits = disc.filter(faiteBien);
    ajoute(disc.length ? Math.round(4 * faits.length / disc.length * 2) / 2 : (st.faites.has('extraA') && (st.faites.has('stimV') || st.faites.has('extraV')) ? 4 : 2), 4,
      disc.length ? t(`Manœuvres discriminantes : ${faits.length}/${disc.length} (${disc.map(m => `${faiteBien(m) ? '✓' : '✗'} ${MANOEUVRES()[m]}`).join(' ; ')})`, `Discriminating manoeuvres: ${faits.length}/${disc.length} (${disc.map(m => `${faiteBien(m) ? '✓' : '✗'} ${MANOEUVRES()[m]}`).join('; ')})`)
        : t('Étude complète de la conduction antérograde et rétrograde', 'Complete anterograde and retrograde conduction study'));
    const dernierDisc = Math.max(-Infinity, ...h.filter(x => disc.includes(x.type)).map(x => x.t));
    ajoute(tirs.length ? (faits.length && dernierDisc < premierTir ? 1 : 0) : (faits.length || !disc.length ? 1 : 0), 1, t('Diagnostic établi avant le premier tir', 'Diagnosis established before the first RF delivery'));
    ajoute(ablOk && !blocAV && !ablInutile ? 1 : 0, 1, cible.length ? t('Traitement de la bonne cible', 'Correct target treated') : t('Pas de tir inutile', 'No unnecessary RF delivery'));
    ajoute(cible.length ? (dernierEfficace != null && h.some(x => STIMULATION.has(x.type) && x.t > dernierEfficace) ? 1 : 0) : (tire ? 0 : 1), 1,
      cible.length ? t('Contrôle après ablation (tentative de réinduction, conduction)', 'Post-ablation check (re-induction attempt, conduction)') : t('Aucune lésion inutile', 'No unnecessary lesion'));
    let noteDemarche = lignes.reduce((a, l) => a + l.pts, 0);
    if (blocAV) noteDemarche -= 2;
    if (tirs.filter(x => !x.efficace).length > 3) noteDemarche -= 0.5;
    noteDemarche = Math.max(0, Math.round(noteDemarche * 2) / 2);
    return { base, noteDiag, noteDemarche, lignes, blocAV, ablOk, ablInutile, tire, cible };
  }

  $('#valider').onclick = () => {
    const rep = $('#reponse').value;
    if (!rep) return;
    const sc = scenario(st.scenario), ev = evaluer(sc, st.scenario, rep), nomDiag = SCENARIOS[ev.base].nom;
    const posNom = sc.position ? POSITIONS.find(p => p.id === sc.position)?.nom : '';
    const traitement = ev.base === 'fa'
      ? (ev.ablInutile ? t('✗ Tir sans cible modélisée.', '✗ RF delivered with no modelled target.') : t('✓ Isolation des veines pulmonaires indiquée (non modélisée ici).', '✓ Pulmonary vein isolation indicated (not modelled here).'))
      : ev.cible.length
        ? (sc.ablationOptionnelle && !ev.tire ? t(`✓ Abstention ou traitement médical acceptables ; si ablation : ${esc(posNom)}.`, `✓ Observation or medical therapy acceptable; if ablating: ${esc(posNom)}.`)
          : ev.ablOk ? t(`✓ Substrat détruit (${esc(posNom)}).`, `✓ Substrate ablated (${esc(posNom)}).`)
            : t(`✗ Substrat non traité ; cible attendue : ${esc(posNom)}.`, `✗ Substrate not ablated; expected target: ${esc(posNom)}.`))
        : ev.ablInutile ? t('✗ Tir de radiofréquence sans cible arythmogène.', '✗ RF delivered with no arrhythmogenic target.') : t('✓ Pas d\'ablation nécessaire.', '✓ No ablation needed.');
    if (st.mystere) { try { localStorage.setItem(STATS_QUIZ, JSON.stringify([...lireStats(), { d: ev.noteDiag, m: ev.noteDemarche, s: ev.base }].slice(-200))); } catch { /* stockage indisponible */ } majStatsQuiz(); }
    const pts = x => virgule(x);
    $('#verdict').innerHTML = `<div class="retour ${ev.noteDiag === 10 ? 'ok' : 'ko'}">
      <div class="simu-notes">
        <div class="simu-note ${ev.noteDiag === 10 ? 'ok' : ev.noteDiag ? 'moyen' : 'ko'}"><span>${t('Diagnostic', 'Diagnosis')}</span><b>${pts(ev.noteDiag)}<small>/10</small></b></div>
        <div class="simu-note ${ev.noteDemarche >= 8 ? 'ok' : ev.noteDemarche >= 5 ? 'moyen' : 'ko'}"><span>${t('Démarche', 'Work-up')}</span><b>${pts(ev.noteDemarche)}<small>/10</small></b></div>
      </div>
      <h3>${ev.noteDiag === 10 ? t('Bon diagnostic !', 'Correct diagnosis!') : ev.noteDiag ? t('Presque : bonne famille de mécanismes.', 'Close: right family of mechanisms.') : t('Ce n\'est pas ça.', 'Incorrect diagnosis.')}</h3>
      <p>${t('Il s\'agissait de :', 'The diagnosis was:')} <b>${esc(nomDiag)}</b>.</p>
      <h4>${t('Votre démarche', 'Your work-up')}</h4>
      <ul class="simu-check">${ev.lignes.map(l => `<li class="${l.pts >= l.max ? 'fait' : l.pts ? 'partiel' : 'manque'}">${l.pts >= l.max ? '✓' : l.pts ? '◐' : '✗'} ${esc(l.texte)} <span class="note">(${pts(l.pts)}/${l.max})</span></li>`).join('')}
        ${ev.blocAV ? `<li class="manque">✗ ${t('Bloc AV iatrogène (− 2)', 'Iatrogenic AV block (− 2)')}</li>` : ''}</ul>
      <h4>${t('Explication', 'Explanation')}</h4><p>${esc(sc.explication)}</p>
      <h4>${t('Démarche idéale', 'Ideal work-up')}</h4><ol class="simu-ideal">${demarcheIdeale(sc, st.scenario).map(e => `<li>${esc(e)}</li>`).join('')}</ol>
      ${st.analyses.length ? `<h4>${t('Vos mesures', 'Your measurements')}</h4><ul>${st.analyses.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${st.bump ? `<p class="note">${t('Un contact de la sonde a pu bloquer transitoirement la voie accessoire (« bump ») : la préexcitation disparaît sans tir, puis revient.', 'Catheter contact may have transiently blocked the accessory pathway ("bump"): pre-excitation disappears without any RF delivery, then returns.')}</p>` : ''}
      <h4>${t('Traitement', 'Treatment')}</h4><p>${traitement}${ev.blocAV ? t(' <b>✗ Bloc AV iatrogène.</b>', ' <b>✗ Iatrogenic AV block.</b>') : ''}</p>
      <div class="actions serre gauche">${st.mystere ? `<button class="btn btn-primaire" id="autre">${t('Nouveau cas', 'New case')}</button>` : ''}<button class="btn" id="cr-verdict">${t('Compte rendu', 'Report')}</button></div></div>`;
    if (st.mystere) $('#autre').onclick = () => { choisir(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    $('#cr-verdict').onclick = compteRendu;
  };

  $('.simu-modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && b.dataset.mode !== r.modeSimu) appliquerMode(b.dataset.mode); });
  $('#quiz-nouveau').onclick = () => choisir();
  const initial = choixInitial; choixInitial = null;
  if (initial === 'mystere') appliquerMode('quiz');
  else if (initial) appliquerMode('libre', initial);
  else appliquerMode(r.modeSimu === 'quiz' ? 'quiz' : 'libre');
  majResume();
  boucle = requestAnimationFrame(image);
}
