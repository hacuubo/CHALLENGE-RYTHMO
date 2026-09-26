// Simulateur d'électrophysiologie : baie d'enregistrement, stimulateur, médicaments, sonde d'ablation, cas mystères notés.
import { Coeur, SITES_ATRIAUX } from '../simu/moteur.js';
import { SCENARIOS, MYSTERES, SITES_STIM, SITES_DETECTION, POSITIONS } from '../simu/scenarios.js';
import { dessinerSimu, MONTAGES, VITESSES, fenetreMs, marges } from '../simu/trace.js';
import { mesures, tachycardie, analyserEntrainement, analyserESV } from '../simu/analyse.js';
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
const VENTRICULAIRES = new Set(['rva', 'parahis', 'tv2', 'lvl', 'vps', 'vbd']);

export function vueSimulateur(app) {
  arreterSimulateur();
  const sauve = lire();
  if (sauve.v !== 2) { delete sauve.mode; delete sauve.figerApres; } // le balayage devient l'affichage standard
  const r = { v: 2, site: 'hra', sortie: 5, detection: '', s1: 600, n: 8, s2: 0, s3: 0, s4: 0, rappelApres: true, decrement: false,
    rampeDebut: 400, rampeFin: 250, rampePas: 10, vitesse: 100, vitesseRappel: 100, mode: 'balayage', montage: 'standard', bruit: true, etiquettes: true, ...sauve };
  if (!VITESSES.includes(r.vitesse)) r.vitesse = 100;
  if (!VITESSES.includes(r.vitesseRappel)) r.vitesseRappel = 100;
  if (!MONTAGES[r.montage]) r.montage = 'standard';
  if (!SITES_STIM.some(s => s.id === r.site)) r.site = 'hra';
  // rappel : entrée du journal affichée sur l'écran de rappel (instantané du tracé), avec sa relecture et ses compas
  const st = { scenario: 'normal', mystere: false, coeur: null, t: 0, gains: {}, salve: null, position: 'od-haute', actions: [], faites: new Set(), analyses: [],
    positionsTachy: new Set(), tachyAvant: false, dernierMaj: 0, numero: 0,
    rappel: null, recul: 0, curseurs: [], nouveauCompas: false, report: false, demande: null, sale: true };

  const opt = (liste, v) => liste.map(o => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(o.nom)}</option>`).join('');
  const champ = (id, lib, v, pas = 10, max = 2000) => `<label class="simu-champ"><span>${lib}</span><input type="number" id="${id}" value="${v}" min="0" max="${max}" step="${pas}" inputmode="decimal"></label>`;

  app.innerHTML = `
    <h1>${t('Simulateur d\'électrophysiologie', 'Electrophysiology simulator')}</h1>
    <section class="carte simu-tete">
      <label class="simu-champ large"><span>${t('Scénario', 'Scenario')}</span>
        <select id="scenario">
          <option value="mystere">🎲 ${t('Cas mystère (diagnostic à trouver, démarche notée)', 'Mystery case (find the diagnosis, work-up scored)')}</option>
          ${Object.entries(SCENARIOS).map(([id, s]) => `<option value="${id}" ${id === 'normal' ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}
        </select></label>
      <p class="simu-contexte" id="contexte"></p>
    </section>

    <section class="simu-baie">
      <div class="simu-barre">
        <label class="simu-mini">${t('Vitesse', 'Speed')} <select id="vitesse">${VITESSES.map(v => `<option value="${v}" ${v === r.vitesse ? 'selected' : ''}>${t(String(v).replace('.', ','), String(v))} mm/s</option>`).join('')}</select></label>
        <label class="simu-mini">${t('Affichage', 'Display')} <select id="mode"><option value="balayage" ${r.mode === 'balayage' ? 'selected' : ''}>${t('Balayage (standard)', 'Sweep (standard)')}</option><option value="defilement" ${r.mode === 'defilement' ? 'selected' : ''}>${t('Défilement', 'Scrolling')}</option></select></label>
        <label class="simu-mini">${t('Montage', 'Montage')} <select id="montage">${Object.entries(MONTAGES).map(([id, m]) => `<option value="${id}" ${id === r.montage ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></label>
        <label class="simu-mini"><input type="checkbox" id="bruit" ${r.bruit ? 'checked' : ''}> ${t('Bruit', 'Noise')}</label>
        <label class="simu-mini"><input type="checkbox" id="etiquettes" ${r.etiquettes ? 'checked' : ''}> A-H-V</label>
      </div>
      <div class="simu-ecrans">
        <div class="simu-panneau">
          <div class="simu-titre-ecran"><b>${t('Temps réel', 'Real time')}</b><div class="simu-mesures" id="mesures" aria-live="off"></div></div>
          <div class="simu-ecran">
            <canvas id="ecran" role="img" aria-label="${t('Baie d\'électrophysiologie en temps réel : dérivations de surface et électrogrammes endocavitaires', 'Real-time EP recording system: surface leads and intracardiac electrograms')}"></canvas>
            <div class="simu-etat" id="etat"></div>
          </div>
        </div>
        <div class="simu-panneau simu-rappel" id="rappel">
          <div class="simu-titre-ecran"><b>${t('Écran de rappel', 'Review screen')}</b> <span id="rappel-titre" class="note"></span></div>
          <div class="simu-barre">
            <button class="btn btn-mini" id="evt-prec" aria-label="${t('Événement précédent du journal', 'Previous log event')}">◀ ${t('Évt', 'Event')}</button>
            <button class="btn btn-mini" id="evt-suiv" aria-label="${t('Événement suivant du journal', 'Next log event')}">${t('Évt', 'Event')} ▶</button>
            <label class="simu-mini">${t('Vitesse', 'Speed')} <select id="vitesse-rappel">${VITESSES.map(v => `<option value="${v}" ${v === r.vitesseRappel ? 'selected' : ''}>${t(String(v).replace('.', ','), String(v))} mm/s</option>`).join('')}</select></label>
            <div class="simu-mesures" id="mesures-rappel" aria-live="off"></div>
          </div>
          <div class="simu-ecran">
            <canvas id="ecran-rappel" role="img" aria-label="${t('Écran de rappel : tracé de l\'événement sélectionné dans le journal, mesurable au compas', 'Review screen: tracing of the event selected in the log, measurable with callipers')}"></canvas>
            <p class="simu-rappel-vide" id="rappel-vide">${t('Aucun événement rappelé. Faites une manœuvre ou « Enregistrer », ou touchez un événement du journal.', 'No event recalled. Perform a manoeuvre or press "Record", or tap an event in the log.')}</p>
          </div>
          <div class="simu-revue">
            <button class="btn btn-mini" id="arriere" aria-label="${t('Page précédente', 'Previous page')}">◀</button>
            <input type="range" id="recul" min="0" max="0" step="50" value="0" aria-label="${t('Se déplacer dans l\'enregistrement rappelé', 'Move through the recalled recording')}">
            <button class="btn btn-mini" id="avant" aria-label="${t('Page suivante', 'Next page')}">▶</button>
            <span id="recul-val" class="note"></span>
            <button class="btn btn-mini" id="compas-plus">${t('+ compas', '+ calliper')}</button>
            <button class="btn btn-mini" id="compas-report">${t('Report', 'March out')}</button>
            <button class="btn btn-mini" id="compas-effacer">${t('Effacer', 'Clear')}</button>
          </div>
        </div>
      </div>
      <div class="simu-paysage" id="paysage">
        <span aria-hidden="true" class="simu-paysage-ico">⟳</span>
        <span>${t('<b>Tournez votre téléphone en paysage</b> pour voir l\'écran de rappel à côté du tracé en temps réel (mesures au compas, rappel des événements du journal).', '<b>Turn your phone to landscape</b> to see the review screen next to the real-time tracing (calliper measurements, recall of log events).')}<span id="paysage-nouveau"></span></span>
        <button class="btn btn-mini" id="btn-paysage">${t('Passer en paysage', 'Switch to landscape')}</button>
      </div>
      <div class="actions serre gauche simu-outils">
        <button class="btn btn-primaire" id="stimuler">${t('Stimuler', 'Pace')}</button>
        <button class="btn" id="s2moins" title="${t('Raccourcir S2 de 10 ms puis stimuler', 'Shorten S2 by 10 ms, then pace')}">S2 − 10</button>
        <button class="btn" id="salve">${t('Salve à S1', 'Burst at S1')}</button>
        <button class="btn" id="enregistrer" title="${t('Envoyer les 10 dernières secondes sur l\'écran de rappel', 'Send the last 10 seconds to the review screen')}">${t('Enregistrer', 'Record')}</button>
        <button class="btn" id="adenosine">${t('Adénosine', 'Adenosine')}</button>
        <button class="btn" id="iso" aria-pressed="false">${t('Isoprénaline', 'Isoprenaline')}</button>
        <button class="btn" id="atropine">${t('Atropine', 'Atropine')}</button>
        <button class="btn" id="choc">${t('Choc', 'Shock')}</button>
      </div>
      <p class="note simu-aide-compas">${t('Le tracé en temps réel ne s\'arrête jamais. Chaque manœuvre et chaque enregistrement s\'affichent sur l\'écran de rappel : faites-y glisser le doigt pour mesurer. Touchez un événement du journal pour le rappeler. Touchez le nom d\'une voie pour changer son gain.', 'The real-time tracing never stops. Every manoeuvre and every recording is shown on the review screen: drag your finger across it to measure. Tap a log event to recall it. Tap a channel name to change its gain.')}</p>
      <div class="simu-message" id="message" role="status"></div>
    </section>

    <section class="carte simu-commandes">
      <fieldset><legend>${t('Stimulateur', 'Stimulator')}</legend>
        <div class="simu-ligne">
          <label class="simu-champ"><span>${t('Site', 'Site')}</span><select id="site">${opt(SITES_STIM, r.site)}</select></label>
          ${champ('sortie', t('Sortie (mA)', 'Output (mA)'), r.sortie, 0.5, 20)}
          <label class="simu-champ"><span>${t('Couplé à la détection', 'Synchronised to sensing')}</span><select id="detection">${opt(SITES_DETECTION, r.detection)}</select></label>
        </div>
        <div class="simu-ligne">
          ${champ('s1', 'S1 (ms)', r.s1)}${champ('n', t('Nb S1', 'S1 count'), r.n, 1, 30)}${champ('s2', 'S2', r.s2)}${champ('s3', 'S3', r.s3)}${champ('s4', 'S4', r.s4)}
        </div>
        <label class="simu-case"><input type="checkbox" id="rappel-apres" ${r.rappelApres ? 'checked' : ''}> ${t('Afficher chaque manœuvre sur l\'écran de rappel', 'Show each manoeuvre on the review screen')}</label>
        <label class="simu-case"><input type="checkbox" id="decrement" ${r.decrement ? 'checked' : ''}> ${t('Décrément automatique : S2 − 10 ms après chaque train', 'Automatic decrement: S2 − 10 ms after each drive train')}</label>
        <div class="simu-ligne">
          ${champ('rampe-debut', t('Rampe : de', 'Ramp: from'), r.rampeDebut)}${champ('rampe-fin', t('à', 'to'), r.rampeFin)}${champ('rampe-pas', t('pas', 'step'), r.rampePas, 5, 50)}
          <button class="btn" id="rampe">${t('Rampe', 'Ramp')}</button>
        </div>
      </fieldset>
      <fieldset><legend>${t('Sonde d\'ablation', 'Ablation catheter')}</legend>
        <div class="simu-ligne">
          <label class="simu-champ large"><span>${t('Position', 'Position')}</span><select id="position">${opt(POSITIONS, st.position)}</select></label>
        </div>
        <p class="note">${t('Les électrogrammes de la sonde (ABL d, ABL uni) s\'affichent avec le montage « Ablation ». Stimulez depuis la sonde avec le site « Sonde d\'ablation ».', 'The catheter electrograms (ABL d, ABL uni) are displayed with the "Ablation" montage. Pace from the catheter by selecting the "Ablation catheter" site.')}</p>
        <div class="actions serre gauche">
          <button class="btn btn-danger" id="ablater">${t('Radiofréquence', 'RF ablation')}</button>
          <button class="btn" id="reinit">${t('Recommencer le cas', 'Restart the case')}</button>
        </div>
      </fieldset>
      <fieldset class="simu-journal-bloc"><legend>${t('Journal', 'Log')}</legend>
        <p class="note">${t('Touchez un événement pour l\'afficher sur l\'écran de rappel.', 'Tap an event to display it on the review screen.')}</p>
        <ol class="simu-journal" id="journal"></ol></fieldset>
    </section>

    <section class="carte" id="diagnostic" hidden>
      <h2>${t('Votre diagnostic', 'Your diagnosis')}</h2>
      <p class="note">${t('Stimulez, induisez, faites vos manœuvres, traitez si besoin, puis concluez. Votre démarche est notée.', 'Pace, induce, perform your manoeuvres, treat if needed, then conclude. Your work-up is scored.')}</p>
      <div class="simu-ligne"><label class="simu-champ large"><span>${t('Diagnostic', 'Diagnosis')}</span><select id="reponse">
        <option value="">— ${t('Choisir', 'Select')} —</option>${MYSTERES.map(id => `<option value="${id}">${esc(SCENARIOS[id].court)}</option>`).join('')}</select></label>
        <button class="btn btn-primaire" id="valider">${t('Valider', 'Submit')}</button></div>
      <div id="verdict"></div>
    </section>

    <section class="carte" id="explication-scenario"></section>

    <details class="carte simu-guide">
      <summary><b>${t('Mode d\'emploi et manœuvres clés', 'User guide and key manoeuvres')}</b></summary>
      <ul>
        <li>${t(`<b>Baie</b> : vitesse en mm/s comme sur une baie (25 mm/s pour une vue d'ensemble, 100 à 200 mm/s pour mesurer). L'écran en temps réel est en balayage par défaut (le tracé s'écrit de gauche à droite et efface l'ancien derrière une barre ; le défilement reste disponible) et ne se fige jamais. À côté, l'<b>écran de rappel</b> affiche automatiquement chaque manœuvre (train, rampe, salve, adénosine, choc) ou un enregistrement (bouton « Enregistrer » : 10 dernières secondes) ; chaque événement du journal peut y être rappelé. Sur l'écran de rappel, parcourez l'enregistrement, changez la vitesse et posez jusqu'à trois compas ; « Report » reporte le dernier intervalle. Sur téléphone, passez en paysage pour voir les deux écrans côte à côte.`, `<b>Recording system</b>: sweep speed in mm/s, as on a real EP recording system (25 mm/s for an overview, 100 to 200 mm/s for measurements). The real-time screen uses sweep mode by default (the trace is drawn from left to right, overwriting the previous sweep behind an erase bar; scrolling mode remains available) and never freezes. Alongside it, the <b>review screen</b> automatically displays each manoeuvre (drive train, ramp, burst, adenosine, shock) or a recording ("Record" button: last 10 seconds); any event in the log can be recalled there. On the review screen, scroll through the recording, change the sweep speed and place up to three callipers; "March out" repeats the last interval across the tracing. On a phone, switch to landscape to see both screens side by side.`)}</li>
        <li>${t(`<b>Montages</b> : standard (D1, D2, V1, OD haute, His proximal et distal, SC décapolaire, VD), flutter (Halo autour de l'anneau tricuspide), ablation (électrogrammes bipolaire distal et unipolaire de la sonde), complet.`, `<b>Montages</b>: standard (I, II, V1, HRA, proximal and distal His, decapolar CS, RVA), flutter (Halo catheter around the tricuspid annulus), ablation (distal bipolar and unipolar electrograms from the ablation catheter), full.`)}</li>
        <li>${t(`<b>Extrastimulus</b> : train de S1 (ex. 8 × 600 ms) puis S2, S3, S4 (0 = désactivé). Diminuez S2 par pas de 10 ms (bouton « S2 − 10 » ou décrément automatique). Saut de l'AH ≥ 50 ms pour 10 ms de raccourcissement du couplage = double voie nodale. Période réfractaire effective : du tissu stimulé quand S2 ne capture plus ; du nœud AV quand S2 capture mais n'est plus suivi d'un H. Un retard droit sur S2 court = aberration fonctionnelle.`, `<b>Extrastimulus testing</b>: S1 drive train (e.g. 8 × 600 ms) followed by S2, S3, S4 (0 = off). Decrease S2 in 10 ms steps ("S2 − 10" button or automatic decrement). AH jump ≥ 50 ms for a 10 ms decrement in coupling interval = dual AV nodal physiology. Effective refractory period: of the paced tissue when S2 no longer captures; of the AV node when S2 captures but is no longer followed by an H. A right bundle branch block pattern after a short S2 = functional aberration.`)}</li>
        <li>${t(`<b>Rampe et salve</b> : rampe atriale jusqu'au point de Wenckebach (allongement progressif de l'AH puis bloc) ; salve continue au cycle S1 ; après une salve de 30 s, mesurez le temps de récupération sinusale (TRS &lt; 1500 ms, TRS corrigé &lt; 525 ms).`, `<b>Ramp and burst pacing</b>: atrial ramp down to the Wenckebach cycle length (progressive AH prolongation, then block); continuous burst at the S1 cycle length; after a 30 s burst, measure the sinus node recovery time (SNRT &lt; 1500 ms, corrected SNRT &lt; 525 ms).`)}</li>
        <li>${t(`<b>Isoprénaline</b> : accélère le sinus, améliore la conduction nodale et facilite l'induction ; certaines tachycardies ne s'induisent que sous isoprénaline. <b>Adénosine</b> : bloc AV transitoire (dans le simulateur, 1,5 s après le clic ; en clinique, 10 à 20 s après un bolus IV rapide rincé).`, `<b>Isoprenaline</b>: accelerates the sinus rate, improves AV nodal conduction and facilitates induction; some tachycardias are inducible only on isoprenaline. <b>Adenosine</b>: transient AV block (in the simulator, 1.5 s after the click; clinically, 10 to 20 s after a rapid IV bolus followed by a saline flush).`)}</li>
        <li>${t(`<b>Pendant la tachycardie</b> : mesurez le VA sur le His et regardez l'activation atriale la plus précoce (His, SC proximal, SC distal, Halo).`, `<b>During tachycardia</b>: measure the VA on the His catheter and look for the earliest atrial activation (His, proximal CS, distal CS, Halo).`)}</li>
        <li>${t(`<b>ESV His-réfractaire</b> : site VD, détection sur le His, Nb S1 = 0, S2 = cycle de la tachycardie − 30 ms : le stimulus tombe juste avant le His attendu, quand le His ne peut plus être atteint par voie rétrograde. Si l'atrium suivant est avancé avec la même séquence, il existe une voie accessoire ; elle participe au circuit si l'ESV retarde l'atrium ou arrête la tachycardie sans l'atteindre. Une absence d'avance n'exclut pas une voie latérale gauche, éloignée du VD.`, `<b>His-refractory PVC</b>: RV site, sensing on the His, S1 count = 0, S2 = tachycardia cycle length − 30 ms: the stimulus falls just before the expected His, when the His can no longer be reached retrogradely. If the next atrial activation is advanced with the same sequence, an accessory pathway is present; it participates in the circuit if the PVC delays the atrium or terminates the tachycardia without reaching it. Absence of advancement does not exclude a left lateral pathway, remote from the RV.`)}</li>
        <li>${t(`<b>Entraînement ventriculaire</b> : salve VD à un cycle 10 à 40 ms plus court que la tachycardie, vérifiez que l'atrium suit, arrêtez. Réponse <b>V-A-V</b> (réentrée utilisant le nœud AV ou une voie accessoire) ou <b>V-A-A-V</b> (tachycardie atriale). PPI − TCL sur l'électrogramme VD : &gt; 115 ms (et SA − VA &gt; 85 ms) en faveur d'une réentrée intranodale, &lt; 115 ms d'une voie accessoire (critère validé pour les voies septales). Piège : pseudo-V-A-A-V quand le VA est long ; raisonnez sur le dernier A entraîné.`, `<b>Ventricular entrainment</b>: RV burst at a cycle length 10 to 40 ms shorter than the tachycardia cycle length; check that the atrium follows, then stop. <b>V-A-V</b> response (re-entry involving the AV node or an accessory pathway) or <b>V-A-A-V</b> (atrial tachycardia). PPI − TCL on the RV electrogram: &gt; 115 ms (and SA − VA &gt; 85 ms) favours AVNRT, &lt; 115 ms an accessory pathway (criterion validated for septal pathways). Pitfall: pseudo-V-A-A-V when the VA is long; reason from the last entrained A.`)}</li>
        <li>${t(`<b>Stimulation para-hisienne</b> : site para-hisien, en rythme sinusal, alternez une sortie haute (15 mA : capture du His et du myocarde) et basse (5 mA : myocarde seul). Si l'intervalle stimulus-A s'allonge à la perte de capture du His, la conduction rétrograde est nodale ; s'il ne change pas au site de sortie (ostium du SC par exemple), elle est extranodale (voie accessoire septale).`, `<b>Para-Hisian pacing</b>: para-Hisian site, in sinus rhythm; alternate high output (15 mA: His and myocardial capture) and low output (5 mA: myocardium only). If the stimulus-to-A interval lengthens with loss of His capture, retrograde conduction is nodal; if it is unchanged when measured at the exit site (e.g. the CS ostium), it is extranodal (septal accessory pathway).`)}</li>
        <li>${t(`<b>Flutter et macroréentrées</b> : entraînez depuis l'isthme, le SC proximal et distal, et comparez les PPI − TCL mesurés sur l'électrogramme du site de stimulation (&lt; 20-30 ms = site dans le circuit). Après ablation de l'isthme, vérifiez le bloc dans les deux sens (stimulation de l'ostium du SC puis de l'isthme latéral).`, `<b>Flutter and macro-re-entry</b>: entrain from the isthmus and from the proximal and distal CS, and compare the PPI − TCL measured on the pacing-site electrogram (&lt; 20-30 ms = site within the circuit). After isthmus ablation, check for block in both directions (pacing from the CS ostium, then from the lateral isthmus).`)}</li>
        <li>${t(`<b>Sonde d'ablation</b> : placez-la, regardez l'électrogramme local pendant la tachycardie (précocité, QS en unipolaire au site de sortie), stimulez depuis la sonde, puis tirez. L'ablation de la région antéro-septale expose au bloc AV complet.`, `<b>Ablation catheter</b>: position it, look at the local electrogram during tachycardia (local activation time, QS unipolar electrogram at the exit site), pace from the catheter, then ablate. Ablation in the anteroseptal region carries a risk of complete AV block.`)}</li>
      </ul>
      <p class="note">${t(`Modèle pédagogique simplifié : les intervalles sont réalistes mais le cœur est réduit à une trentaine de sites. Concept inspiré du simulateur svtsim (S. Iravanian) ; code et scénarios originaux. Critères : Michaud GF et al., JACC 2001;38:1163-7 (PPI − TCL, SA − VA) ; Knight BP et al., JACC 1999;33:775-81 (V-A-A-V) ; Hirao K et al., Circulation 1996;94:1027-35 (stimulation para-hisienne) ; Josephson ME, Clinical Cardiac Electrophysiology.`, `Simplified teaching model: the intervals are realistic, but the heart is reduced to about thirty sites. Concept inspired by the svtsim simulator (S. Iravanian); original code and scenarios. Criteria: Michaud GF et al., JACC 2001;38:1163-7 (PPI − TCL, SA − VA); Knight BP et al., JACC 1999;33:775-81 (V-A-A-V); Hirao K et al., Circulation 1996;94:1027-35 (para-Hisian pacing); Josephson ME, Clinical Cardiac Electrophysiology.`)}</p>
    </details>`;

  const $ = s => app.querySelector(s);
  const canvas = $('#ecran'), canvasR = $('#ecran-rappel');

  // ---------- journal et écran de rappel ----------
  // Chaque entrée du journal couvre une fenêtre de tracé [debut, capture] ; à l'instant « capture », le tracé de cette
  // fenêtre est copié (instantané) et peut être rappelé à tout moment sur l'écran de rappel. auto : affichage dès la capture.
  const hms = t => `${(t / 1000).toFixed(1)} s`;
  const FENETRES_MOTEUR = { // événements émis par le moteur, par type : [début, capture] relatifs à l'événement (ms), affichage automatique
    adenosine: [-2000, 9000, true], choc: [-3000, 4000, true], rf: [-3000, 5000, false] };
  function entree(t, texte, { debut = t - 6000, capture = t + 4000, auto = false, rf = false } = {}) {
    const e = { id: ++st.numero, t, texte, debut, capture, auto, rf, instantane: null };
    st.actions.push(e);
    return e;
  }
  function majJournal() {
    for (const e of st.coeur.evenements) if (!e.vu) {
      e.vu = true;
      const f = FENETRES_MOTEUR[e.type];
      entree(e.t, e.texte, f ? { debut: e.t + f[0], capture: e.t + f[1], auto: f[2] && r.rappelApres, rf: e.type === 'rf' } : {});
    }
    st.actions.sort((a, b) => a.t - b.t);
    if (st.actions.length > 60) st.actions = st.actions.slice(-60);
    if (st.rappel && !st.actions.includes(st.rappel)) st.actions.unshift(st.rappel);
    rendreJournal();
  }
  function rendreJournal() {
    $('#journal').innerHTML = st.actions.slice().reverse().map(a => `<li><button class="simu-evt${a === st.rappel ? ' choisi' : ''}" data-evt="${a.id}" ${a === st.rappel ? 'aria-current="true"' : ''}>
      <span class="note">${hms(a.t)}</span> ${esc(a.texte)}${a.instantane ? '' : ` <span class="note" title="${t('Enregistrement en cours', 'Recording in progress')}">⏳</span>`}</button></li>`).join('');
  }
  function noter(type, texte, fenetre) {
    if (type) st.faites.add(type);
    const e = texte ? entree(st.t, texte, fenetre) : null;
    majJournal();
    return e;
  }
  const ablationVue = () => { const pos = POSITIONS.find(p => p.id === st.position); return pos ? { a: pos.a, v: pos.v } : null; };
  function capturer(e) {
    const c = st.coeur, t0 = Math.max(e.debut, e.capture - 60000, 0);
    e.instantane = { t: e.capture, debut: t0, journal: c.journal.filter(x => x.t >= t0 - 1000 && x.t <= e.capture + 5),
      stims: c.stims.filter(x => x.t >= t0 - 3000 && x.t <= e.capture), ablation: ablationVue() };
  }
  function rappeler(e) {
    if (!e) return;
    if (!e.instantane) { st.demande = e; message(t('Enregistrement en cours : il s\'affichera sur l\'écran de rappel dans un instant.', 'Recording in progress: it will appear on the review screen in a moment.')); return; }
    st.rappel = e; st.recul = 0; st.curseurs = []; st.nouveauCompas = false; st.demande = null; st.sale = true;
    $('#rappel-titre').textContent = `${hms(e.t)} · ${e.texte}`;
    $('#rappel-vide').hidden = true;
    $('#paysage-nouveau').textContent = t(` Dernier rappel : ${e.texte}.`, ` Last recalled: ${e.texte}.`);
    majRecul(); rendreJournal();
  }
  function rappelVoisin(sens) {
    const prets = st.actions.filter(a => a.instantane);
    const i = prets.indexOf(st.rappel);
    rappeler(prets[i < 0 ? prets.length - 1 : Math.max(0, Math.min(prets.length - 1, i + sens))]);
  }

  function nouveauCoeur() {
    const sc = SCENARIOS[st.scenario];
    st.coeur = new Coeur(sc.def(), { variation: st.mystere ? Math.min(0.05, sc.variation ?? 1) : 0 });
    st.coeur.avancer(2500);
    Object.assign(st, { t: 2500, salve: null, actions: [], faites: new Set(), analyses: [], positionsTachy: new Set(), tachyAvant: false,
      rappel: null, recul: 0, curseurs: [], nouveauCompas: false, demande: null, sale: true });
    $('#salve').textContent = t('Salve à S1', 'Burst at S1');
    $('#iso').setAttribute('aria-pressed', 'false'); $('#iso').classList.remove('actif');
    $('#rappel-titre').textContent = ''; $('#rappel-vide').hidden = false; $('#paysage-nouveau').textContent = '';
    majRecul();
    $('#diagnostic').hidden = !st.mystere; $('#verdict').innerHTML = ''; $('#reponse').value = '';
    $('#contexte').innerHTML = sc.contexte ? `<b>${t('Contexte :', 'Clinical context:')}</b> ${esc(sc.contexte)}` : '';
    $('#explication-scenario').innerHTML = st.mystere
      ? t('<h2>Cas mystère</h2><p class="note">Le mécanisme est caché et les paramètres varient légèrement d\'un cas à l\'autre. Faites les manœuvres utiles, traitez si besoin, puis concluez.</p>',
        '<h2>Mystery case</h2><p class="note">The mechanism is hidden and the parameters vary slightly from one case to the next. Perform the relevant manoeuvres, treat if needed, then conclude.</p>')
      : `<h2>${esc(sc.nom)}</h2><p>${esc(sc.explication)}</p>`;
    noter(null, st.mystere ? t('Nouveau cas mystère', 'New mystery case') : t(`Scénario : ${sc.nom}`, `Scenario: ${sc.nom}`), { debut: 0, capture: 6500 });
  }
  function choisir(v) {
    st.mystere = v === 'mystere';
    st.scenario = st.mystere ? melanger(MYSTERES)[0] : v;
    nouveauCoeur();
  }

  const reglages = () => {
    const n = (id, min = 0) => Math.max(min, +$(id).value || 0);
    Object.assign(r, { site: $('#site').value, sortie: n('#sortie'), detection: $('#detection').value, s1: Math.max(200, n('#s1')), n: Math.min(30, Math.round(n('#n'))),
      s2: Math.round(n('#s2')), s3: Math.round(n('#s3')), s4: Math.round(n('#s4')), rappelApres: $('#rappel-apres').checked, decrement: $('#decrement').checked,
      rampeDebut: n('#rampe-debut', 150), rampeFin: n('#rampe-fin', 150), rampePas: n('#rampe-pas', 1),
      vitesse: +$('#vitesse').value, vitesseRappel: +$('#vitesse-rappel').value, mode: $('#mode').value, montage: $('#montage').value, bruit: $('#bruit').checked, etiquettes: $('#etiquettes').checked });
    ecrire(r);
    return r;
  };
  const siteReel = () => (r.site === 'abl' ? POSITIONS.find(p => p.id === st.position).stim : r.site);
  const nomSite = () => `${SITES_STIM.find(s => s.id === r.site).nom}${r.site === 'abl' ? ` (${POSITIONS.find(p => p.id === st.position).nom})` : ''}`;

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

  function programmer(tDebut, site, e) {
    const c = st.coeur, p = r;
    let t = tDebut;
    const liste = [];
    for (let i = 0; i < p.n; i++) { liste.push(t); if (i < p.n - 1) t += p.s1; }
    const extras = [p.s2, p.s3, p.s4].filter(Boolean);
    if (!p.n && extras.length) t -= extras[0];
    for (const e of extras) { t += e; liste.push(t); }
    liste.forEach(x => c.stimuler(site, x, p.sortie));
    if (e && liste.length) Object.assign(e, { debut: liste[0] - 1500, capture: liste.at(-1) + 2000, instantane: null });
    return liste;
  }

  function stimuler() {
    reglages();
    if (!r.n && !r.s2) { message(t('Réglez au moins un S1 ou un S2.', 'Set at least one S1 or S2.')); return; }
    const c = st.coeur, site = siteReel();
    const type = classer(site, { detection: r.detection, n: r.n, s2: r.s2 });
    const tcl = tachycardie(c).cycleV;
    let e = null;
    const lancer = t0 => {
      const liste = programmer(t0, site, e);
      if (type === 'esvHis' && liste.length) {
        const te = liste.at(-1);
        setTimeout(() => {
          const av = analyserESV(c, te, tcl);
          if (av != null) st.analyses.push(t(`ESV His-réfractaire : ${av > 5 ? `atrium avancé de ${av} ms` : av < -5 ? `atrium retardé de ${-av} ms` : 'atrium inchangé'}${tachycardie(c).active ? '' : ', tachycardie arrêtée'}`,
            `His-refractory PVC: ${av > 5 ? `atrium advanced by ${av} ms` : av < -5 ? `atrium delayed by ${-av} ms` : 'atrium unchanged'}${tachycardie(c).active ? '' : ', tachycardia terminated'}`));
        }, 3500);
      }
    };
    e = noter(type, `${nomSite()}${t(' : ', ': ')}${r.n ? `${r.n} × S1 ${r.s1}` : ''}${[r.s2, r.s3, r.s4].filter(Boolean).map((x, i) => ` S${i + 2} ${x}`).join('')} ms, ${r.sortie} mA${r.detection ? t(`, couplé au ${SITES_DETECTION.find(d => d.id === r.detection).nom}`, `, synchronised to ${SITES_DETECTION.find(d => d.id === r.detection).nom} sensing`) : ''}`,
      { capture: st.t + 12000, auto: r.rappelApres });
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
    noter(null, t(`Arrêt de la salve (${s.nom} à ${s.cl} ms)`, `Burst stopped (${s.nom} at ${s.cl} ms)`), { debut: Math.max(s.debut - 2000, st.t - 30000), capture: st.t + 3500, auto: r.rappelApres });
    st.salve = null; $('#salve').textContent = t('Salve à S1', 'Burst at S1');
    if (s.tachy && der != null) {
      setTimeout(() => {
        const a = analyserEntrainement(c, { der, site: s.site, tcl: s.tcl, ventriculaire: VENTRICULAIRES.has(s.site) });
        st.analyses.push(t(`Entraînement depuis ${s.nom} à ${s.cl} ms (TCL ${Math.round(s.tcl)}) : ${tachycardie(c).active ? '' : 'tachycardie arrêtée ; '}${a.reponse ? `réponse ${a.reponse}, ` : ''}PPI ${a.ppi ?? '—'} ms, PPI − TCL ${a.pptcl ?? '—'} ms`,
          `Entrainment from ${s.nom} at ${s.cl} ms (TCL ${Math.round(s.tcl)}): ${tachycardie(c).active ? '' : 'tachycardia terminated; '}${a.reponse ? (a.reponse.startsWith('V') ? `${a.reponse} response, ` : `${a.reponse}, `) : ''}PPI ${a.ppi ?? '—'} ms, PPI − TCL ${a.pptcl ?? '—'} ms`));
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
    const site = siteReel(), tach = tachycardie(st.coeur);
    st.salve = { site, cl: r.s1, prochain: st.coeur.t + 100, debut: st.coeur.t + 100, sortie: r.sortie, tachy: tach.active, tcl: VENTRICULAIRES.has(site) ? tach.cycleV : (tach.cycleA ?? tach.cycleV), nom: nomSite() };
    noter(classer(site, { salve: true }), t(`Salve : ${st.salve.nom} à ${r.s1} ms, ${r.sortie} mA`, `Burst: ${st.salve.nom} at ${r.s1} ms, ${r.sortie} mA`));
    $('#salve').textContent = t('Arrêter la salve', 'Stop burst');
  };
  $('#rampe').onclick = () => {
    reglages();
    const site = siteReel(), c = st.coeur, t0 = c.t + 150;
    let ts = t0, n = 0;
    for (let cl = r.rampeDebut; cl >= r.rampeFin && n < 200; cl -= r.rampePas) for (let k = 0; k < 4; k++, n++) { c.stimuler(site, ts, r.sortie); ts += cl; }
    noter(VENTRICULAIRES.has(site) ? 'stimV' : 'extraA', t(`Rampe ${r.rampeDebut} → ${r.rampeFin} ms (pas ${r.rampePas} ms, 4 stimulus par palier)`, `Ramp ${r.rampeDebut} → ${r.rampeFin} ms (${r.rampePas} ms steps, 4 stimuli per step)`),
      { debut: t0 - 1500, capture: ts + 1500, auto: r.rappelApres });
  };
  $('#enregistrer').onclick = () => { reglages(); noter(null, t('Enregistrement', 'Recording'), { debut: st.t - 10000, capture: st.t, auto: true }); };
  $('#adenosine').onclick = () => { st.coeur.injecterAdenosine(); noter('adenosine'); };
  $('#iso').onclick = () => {
    const on = st.coeur.basculerMedicament('iso');
    $('#iso').setAttribute('aria-pressed', String(on)); $('#iso').classList.toggle('actif', on);
    noter(on ? 'iso' : null);
  };
  $('#atropine').onclick = () => { st.coeur.basculerMedicament('atropine'); noter(null); };
  $('#choc').onclick = () => { st.coeur.choc(); noter(null); };
  $('#reinit').onclick = () => nouveauCoeur();
  $('#position').onchange = e => {
    st.position = e.target.value;
    if (tachycardie(st.coeur).active) { st.positionsTachy.add(st.position); if (st.positionsTachy.size >= 2) st.faites.add('cartographie'); }
    noter(null, t(`Sonde d'ablation : ${POSITIONS.find(p => p.id === st.position).nom}`, `Ablation catheter: ${POSITIONS.find(p => p.id === st.position).nom}`));
  };
  $('#ablater').onclick = () => {
    const pos = POSITIONS.find(p => p.id === st.position);
    const touchees = st.coeur.ablater(pos.cibles);
    const e = noter(null, t(`Radiofréquence : ${pos.nom}`, `RF ablation: ${pos.nom}`)); e.rf = true;
    message(touchees.includes('nav') || touchees.includes('rapide') ? t('Attention : allongement de l\'AH… vérifiez la conduction AV.', 'Caution: AH prolongation… check AV conduction.')
      : t('Tir de radiofréquence délivré. Vérifiez l\'effet et la non-inductibilité.', 'RF application delivered. Check the effect and non-inducibility.'));
  };
  for (const id of ['#site', '#sortie', '#detection', '#s1', '#n', '#s2', '#s3', '#s4', '#rappel-apres', '#decrement', '#rampe-debut', '#rampe-fin', '#rampe-pas', '#vitesse', '#mode', '#montage', '#bruit', '#etiquettes']) $(id).addEventListener('change', reglages);
  for (const id of ['#vitesse', '#mode', '#montage', '#bruit', '#etiquettes']) $(id).addEventListener('change', () => { st.sale = true; });

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
  $('#journal').onclick = e => { const b = e.target.closest('[data-evt]'); if (b) rappeler(st.actions.find(a => a.id === +b.dataset.evt)); };
  $('#compas-plus').onclick = () => { st.nouveauCompas = true; message(t('Faites glisser sur l\'écran de rappel pour poser le nouveau compas.', 'Drag across the review screen to place the new calliper.')); };
  $('#compas-report').onclick = () => { st.report = !st.report; st.sale = true; $('#compas-report').classList.toggle('actif', st.report); };
  $('#compas-effacer').onclick = () => { st.curseurs = []; st.sale = true; };

  // ---------- téléphone : inciter au format paysage ----------
  $('#btn-paysage').onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await screen.orientation.lock('landscape');
    } catch { message(t('Tournez votre téléphone (et désactivez le verrouillage de la rotation) pour passer en paysage.', 'Turn your phone (and disable rotation lock) to switch to landscape.')); }
  };

  // ---------- notation d'un cas mystère ----------
  $('#valider').onclick = () => {
    const rep = $('#reponse').value;
    if (!rep) return;
    const sc = SCENARIOS[st.scenario], juste = rep === st.scenario;
    const cles = sc.manoeuvres || [], faites = cles.filter(m => st.faites.has(m));
    const cible = sc.cible ? [].concat(sc.cible) : [];
    const tire = st.actions.some(a => a.rf);
    const ablOk = !cible.length || st.coeur.voies.some(v => v.coupee && cible.includes(v.id)) || cible.some(c => st.coeur.sites[c]?.supprime) || (sc.ablationOptionnelle && !tire);
    const blocAV = st.coeur.voies.some(v => v.coupee && (v.id === 'nav' || v.id === 'rapide')) && !cible.includes('rapide');
    const ablInutile = !cible.length && tire;
    const note = Math.round(((juste ? 5 : 0) + (cles.length ? 3 * faites.length / cles.length : 3) + (ablOk && !blocAV && !ablInutile ? 2 : 0)) * 10) / 10;
    const posNom = sc.position ? POSITIONS.find(p => p.id === sc.position)?.nom : '';
    const traitement = st.scenario === 'fa'
      ? (ablInutile ? t('✗ Tir sans cible modélisée.', '✗ RF delivered with no modelled target.') : t('✓ Isolation des veines pulmonaires indiquée (non modélisée ici).', '✓ Pulmonary vein isolation indicated (not modelled here).'))
      : cible.length
        ? (sc.ablationOptionnelle && !tire ? t(`✓ Abstention ou traitement médical acceptables ; si ablation : ${esc(posNom)}.`, `✓ Observation or medical therapy acceptable; if ablating: ${esc(posNom)}.`)
          : ablOk ? t(`✓ Substrat détruit (${esc(posNom)}).`, `✓ Substrate ablated (${esc(posNom)}).`)
            : t(`✗ Substrat non traité ; cible attendue : ${esc(posNom)}.`, `✗ Substrate not ablated; expected target: ${esc(posNom)}.`))
        : ablInutile ? t('✗ Tir de radiofréquence sans cible arythmogène.', '✗ RF delivered with no arrhythmogenic target.') : t('✓ Pas d\'ablation nécessaire.', '✓ No ablation needed.');
    $('#verdict').innerHTML = `<div class="retour ${juste ? 'ok' : 'ko'}"><h3>${juste ? t('Bon diagnostic !', 'Correct diagnosis!') : t('Ce n\'est pas ça.', 'Incorrect diagnosis.')} ${t('Note :', 'Score:')} ${note} / 10</h3>
      <p>${t('Il s\'agissait de :', 'The diagnosis was:')} <b>${esc(sc.nom)}</b>.</p><p>${esc(sc.explication)}</p>
      <h4>${t('Manœuvres clés pour ce diagnostic', 'Key manoeuvres for this diagnosis')}</h4>
      <ul class="simu-check">${cles.map(m => `<li class="${st.faites.has(m) ? 'fait' : 'manque'}">${st.faites.has(m) ? '✓' : '✗'} ${esc(MANOEUVRES()[m])}</li>`).join('') || '<li>—</li>'}</ul>
      ${st.analyses.length ? `<h4>${t('Vos mesures', 'Your measurements')}</h4><ul>${st.analyses.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <h4>${t('Traitement', 'Treatment')}</h4><p>${traitement}${blocAV ? t(' <b>✗ Bloc AV iatrogène.</b>', ' <b>✗ Iatrogenic AV block.</b>') : ''}</p>
      <div class="actions serre gauche"><button class="btn btn-primaire" id="autre">${t('Nouveau cas mystère', 'New mystery case')}</button></div></div>`;
    $('#autre').onclick = () => choisir('mystere');
  };

  // ---------- gains (nom d'une voie, sur les deux écrans) et compas (écran de rappel) ----------
  // Toucher le tracé en temps réel ne l'arrête pas : les mesures se font sur l'écran de rappel.
  let geo = null, geoR = null, glisse = false;
  const gain = (cv, g, e) => {
    const b = cv.getBoundingClientRect();
    if (e.clientX - b.left >= marges(cv.clientWidth)) return false;
    const y = e.clientY - b.top, rangee = (g?.rangees || []).find(x => y >= x.y0 && y < x.y1);
    if (rangee) { const cycle = [1, 2, 4, 0.5], g0 = st.gains[rangee.id] || 1; st.gains[rangee.id] = cycle[(cycle.indexOf(g0) + 1) % cycle.length]; st.sale = true; }
    return true;
  };
  canvas.addEventListener('pointerdown', e => gain(canvas, geo, e));
  const temps = e => { const b = canvasR.getBoundingClientRect(); return geoR?.t0 != null ? geoR.t0 + (e.clientX - b.left - geoR.marge) / geoR.pxms : null; };
  canvasR.addEventListener('pointerdown', e => {
    if (gain(canvasR, geoR, e) || !st.rappel) return;
    const t = temps(e); if (t == null) return;
    if (st.nouveauCompas || !st.curseurs.length) { st.curseurs.push([t, null]); if (st.curseurs.length > 3) st.curseurs.shift(); st.nouveauCompas = false; }
    else st.curseurs[st.curseurs.length - 1] = [t, null];
    glisse = true; st.sale = true; canvasR.setPointerCapture(e.pointerId);
  });
  canvasR.addEventListener('pointermove', e => { if (glisse && st.curseurs.length) { st.curseurs.at(-1)[1] = temps(e); st.sale = true; } });
  canvasR.addEventListener('pointerup', () => { glisse = false; });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (canvasR.isConnected) majRecul(); }).observe(canvasR);

  // ---------- boucle d'animation ----------
  let dernier = performance.now();
  const etat = $('#etat'), zoneMesures = $('#mesures');
  function image(maintenant) {
    if (!canvas.isConnected) { arreterSimulateur(); return; }
    const dt = Math.min(100, maintenant - dernier); dernier = maintenant;
    const c = st.coeur;
    const cible = st.t + dt;
    if (st.salve) while (st.salve.prochain < cible + 400) { c.stimuler(st.salve.site, st.salve.prochain, st.salve.sortie); st.salve.prochain += st.salve.cl; }
    c.avancer(cible); st.t = cible;
    let capture = false;
    for (const e of st.actions) if (!e.instantane && st.t >= e.capture) {
      capturer(e); capture = true;
      if (e.auto || e === st.demande) rappeler(e);
    }
    if (capture) rendreJournal();
    geo = dessinerSimu(canvas, c, { tFin: st.t, vitesse: r.vitesse, mode: r.mode, voies: MONTAGES[r.montage].voies, gains: st.gains,
      etiquettes: r.etiquettes, bruit: r.bruit, ablation: ablationVue() });
    const inst = st.rappel?.instantane;
    if (st.sale && canvasR.offsetParent && !inst) { // écran de rappel vide : quadrillage seul
      st.sale = false;
      geoR = dessinerSimu(canvasR, { journal: [], stims: [] }, { tFin: 0, vitesse: r.vitesseRappel, mode: 'defilement', voies: MONTAGES[r.montage].voies, gains: st.gains, bruit: false });
      $('#mesures-rappel').innerHTML = '';
    } else if (st.sale && canvasR.offsetParent) {
      st.sale = false;
      const tFin = inst.t - st.recul;
      geoR = dessinerSimu(canvasR, inst, { tFin, vitesse: r.vitesseRappel, mode: 'defilement', voies: MONTAGES[r.montage].voies, gains: st.gains,
        etiquettes: r.etiquettes, curseurs: st.curseurs, report: st.report, bruit: r.bruit, ablation: inst.ablation });
      const m = mesures(inst, tFin), f = v => (v == null ? '—' : Math.round(v));
      $('#mesures-rappel').innerHTML = `<span>A-A <b>${f(m.cycleA)}</b></span><span>V-V <b>${f(m.cycleV)}</b></span><span>AH <b>${f(m.AH)}</b></span><span>HV <b>${f(m.HV)}</b></span><span>VA <b>${f(m.VA)}</b></span>`;
    }
    if (maintenant - st.dernierMaj > 250) {
      st.dernierMaj = maintenant;
      const m = mesures(c, st.t), tach = tachycardie(c, st.t);
      if (tach.active && !st.tachyAvant) noter('induction', `${t('Tachycardie', 'Tachycardia')} (A ${Math.round(tach.cycleA ?? 0)} / V ${Math.round(tach.cycleV ?? 0)} ms)`);
      st.tachyAvant = tach.active;
      if (c.evenements.some(e => !e.vu)) majJournal();
      const f = v => (v == null ? '—' : Math.round(v));
      zoneMesures.innerHTML = `<span>A-A <b>${f(m.cycleA)}</b></span><span>V-V <b>${f(m.cycleV)}</b></span><span>AH <b>${f(m.AH)}</b></span><span>HV <b>${f(m.HV)}</b></span><span>VA <b>${f(m.VA)}</b></span>`;
      const ad = c.adenosine && st.t < c.adenosine.fin + 500, iso = c.niveau('iso', st.t);
      etat.textContent = [st.salve ? `${t('Salve', 'Burst')} ${st.salve.cl} ms` : '', ad ? t('Adénosine', 'Adenosine') : '', iso > 0.05 ? t(`Isoprénaline ${Math.round(iso * 100)} %`, `Isoprenaline ${Math.round(iso * 100)}%`) : '', c.fa ? t('FA', 'AF') : '',
        tach.active ? `${t('Tachycardie', 'Tachycardia')} (${tach.cycleA != null && tach.cycleV != null && Math.abs(tach.cycleA - tach.cycleV) > 20 ? `A ${Math.round(tach.cycleA)} / V ${Math.round(tach.cycleV)}` : `${t('cycle', 'CL')} ${Math.round(tach.cycleV ?? tach.cycleA)}`} ms)` : ''].filter(Boolean).join(' · ');
    }
    boucle = requestAnimationFrame(image);
  }
  const initial = choixInitial; choixInitial = null;
  if (initial) { $('#scenario').value = initial; choisir(initial); } else nouveauCoeur();
  boucle = requestAnimationFrame(image);
}
