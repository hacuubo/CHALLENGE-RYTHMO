// Scénarios du simulateur : un cœur de base (conduction normale) et ses variantes arythmogènes.
// Textes affichés : accesseurs évalués à la lecture, dans la langue courante (t).
// Délais et périodes réfractaires en ms, choisis dans les valeurs habituelles d'une exploration électrophysiologique :
// AH ≈ 80 ms, HV ≈ 40 ms, période réfractaire atriale ≈ 220 ms, nodale ≈ 270 ms à 600 ms de cycle.

import { t } from '../i18n.js';

const myo = (d, erp = 150) => ({ d, erp });                       // conduction myocardique simple
const nod = (d, dec, tau, erp, wk) => ({ d, dec, tau, erp, wk });  // conduction décrémentielle (nœud AV) ; wk : poids de Wenckebach

function base() {
  return {
    sites: {
      sa: { erp: 250, cl: 720, freinK: 0.0095, freinMax: 0.8, arythmie: true },  // nœud sinusal
      hra: { erp: 220 }, ras: { erp: 220 },
      cs9: { erp: 220 }, cs7: { erp: 220 }, cs5: { erp: 220 }, cs3: { erp: 220 }, cs1: { erp: 220 },
      ogs: { erp: 220 }, oga: { erp: 220 },                         // oreillette gauche : septum, paroi antérieure
      lath: { erp: 220 }, latm: { erp: 220 }, latb: { erp: 220 }, cti: { erp: 220 }, // paroi latérale de l'OD, isthme cavo-tricuspide
      his: { erp: 250, cl: 1400 },                                  // échappement jonctionnel
      bbd: { erp: 400, restit: 0.8 }, bbg: { erp: 300, restit: 0.8 }, // branches droite et gauche (réfractarité très dépendante du cycle)
      vsep: { erp: 230 }, vbd: { erp: 230 }, vps: { erp: 230 }, rva: { erp: 230 }, lvl: { erp: 230 }, // septum VG, septum basal VD, base postéro-septale, apex VD, paroi latérale VG
    },
    voies: [
      { a: 'sa', b: 'hra', ab: myo(15), ba: myo(30) },
      { a: 'hra', b: 'ras', ab: myo(35), ba: myo(35) },
      { a: 'ras', b: 'cs9', ab: myo(20), ba: myo(20) },
      { a: 'cs9', b: 'cs7', ab: myo(12), ba: myo(12) },
      { a: 'cs7', b: 'cs5', ab: myo(12), ba: myo(12) },
      { a: 'cs5', b: 'cs3', ab: myo(12), ba: myo(12) },
      { a: 'cs3', b: 'cs1', ab: myo(12), ba: myo(12) },
      // anneau mitral : SC ↔ oreillette gauche antérieure ↔ septum gauche (conduction rapide : pas de réentrée)
      { id: 'og-lat', a: 'cs1', b: 'oga', ab: myo(20), ba: myo(20) },
      { id: 'og-ant', a: 'oga', b: 'ogs', ab: myo(20), ba: myo(20) },
      { id: 'og-sept', a: 'ogs', b: 'cs9', ab: myo(15), ba: myo(15) },
      // anneau tricuspide : paroi latérale descendante puis isthme vers le septum (conduction rapide : pas de réentrée)
      { id: 'od-h', a: 'hra', b: 'lath', ab: myo(30), ba: myo(30) },
      { id: 'od-m', a: 'lath', b: 'latm', ab: myo(15), ba: myo(15) },
      { id: 'od-b', a: 'latm', b: 'latb', ab: myo(15), ba: myo(15) },
      { id: 'isthme-lat', a: 'latb', b: 'cti', ab: myo(20), ba: myo(20) },
      { id: 'isthme', a: 'cti', b: 'ras', ab: myo(20), ba: myo(20) },
      { id: 'nav', a: 'ras', b: 'his', nodale: true, ab: nod(80, 110, 110, 270, 0.45), ba: nod(60, 70, 100, 230) },
      // tissu de conduction : HV ≈ 40 ms par chaque branche ; conduction rétrograde plus lente (Purkinje)
      { id: 'bd-p', a: 'his', b: 'bbd', ab: myo(15), ba: myo(20) },
      { id: 'bd-d', a: 'bbd', b: 'rva', ab: myo(25), ba: myo(35) },
      { id: 'bg-p', a: 'his', b: 'bbg', ab: myo(15), ba: myo(20) },
      { id: 'bg-d', a: 'bbg', b: 'vsep', ab: myo(25), ba: myo(35) },
      { id: 'transseptal', a: 'vsep', b: 'rva', ab: myo(45), ba: myo(45) },   // conduction transseptale myocardique
      { a: 'vsep', b: 'lvl', ab: myo(35), ba: myo(35) },
      { id: 'vd-vg', a: 'rva', b: 'lvl', ab: myo(80), ba: myo(80) },
      { a: 'vbd', b: 'vsep', ab: myo(15), ba: myo(15) },
      { a: 'vbd', b: 'rva', ab: myo(30), ba: myo(30) },
      { a: 'vsep', b: 'vps', ab: myo(30), ba: myo(30) },
      { a: 'vbd', b: 'vps', ab: myo(25), ba: myo(25) },
    ],
  };
}

// Remplace les paramètres d'une voie (par identifiant) dans une définition.
const regler = (def, id, v) => { def.voies = def.voies.map(x => (x.id === id ? { ...x, ...v } : x)); return def; };

const sans = (def, id) => ({ ...def, voies: def.voies.filter(v => v.id !== id) });
const avec = (def, ...voies) => ({ ...def, voies: [...def.voies, ...voies] });

export const SCENARIOS = {
  normal: {
    get contexte() { return t('Femme de 34 ans, palpitations rapides à début et fin brusques, ECG de base normal ; pas de tachycardie documentée.', `34-year-old woman with palpitations of abrupt onset and offset, normal baseline ECG; no documented tachycardia.`); },
    position: null,
    manoeuvres: ['extraA', 'stimV'],
    get nom() { return t('Conduction normale', `Normal conduction`); },
    get court() { return t('Pas de tachycardie inductible, conduction normale', `No inducible tachycardia, normal conduction`); },
    def: () => base(),
    get explication() { return t(`Conduction AV normale : AH ≈ 80 ms, HV ≈ 40 ms, allongement progressif de l'AH avec la précocité de l'extrastimulus, sans saut. En stimulation ventriculaire, la conduction rétrograde passe par le nœud AV : activation atriale concentrique, la plus précoce sur le His, et décrémentielle. Aucune tachycardie n'est inductible.`, `Normal AV conduction: AH ≈ 80 ms, HV ≈ 40 ms, with gradual AH prolongation as the extrastimulus becomes more premature, without a jump. During ventricular pacing, retrograde conduction is over the AV node: concentric atrial activation, earliest at the His, and decremental. No tachycardia is inducible.`); },
  },
  double: {
    get contexte() { return t('Homme de 45 ans, palpitations non documentées, ECG normal.', `45-year-old man with undocumented palpitations, normal ECG.`); },
    position: null,
    manoeuvres: ['extraA', 'stimV'],
    get nom() { return t('Double voie nodale sans tachycardie', `Dual AV nodal physiology without tachycardia`); },
    get court() { return t('Double voie nodale, pas de tachycardie', `Dual AV nodal physiology, no tachycardia`); },
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(75, 60, 80, 330), ba: null },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null }),
    get explication() { return t(`Double voie nodale : quand l'extrastimulus atrial tombe dans la période réfractaire de la voie rapide, la conduction bascule sur la voie lente avec un saut de l'AH (≥ 50 ms pour 10 ms de raccourcissement du couplage). Sans conduction rétrograde nodale (dissociation VA en stimulation ventriculaire), aucune réentrée n'est possible : ni écho ni tachycardie. Cette physiologie isolée ne justifie pas d'ablation.`, `Dual AV nodal physiology: when the atrial extrastimulus falls within the fast pathway refractory period, conduction switches to the slow pathway with an AH jump (≥ 50 ms for a 10 ms decrement in coupling interval). Without retrograde nodal conduction (VA dissociation during ventricular pacing), re-entry is impossible: neither echo beats nor tachycardia. This isolated finding does not warrant ablation.`); },
  },
  trin: {
    get contexte() { return t(`Femme de 38 ans, tachycardies régulières à QRS fins depuis l'adolescence, arrêtées par des manœuvres vagales ; ECG de base normal.`, `38-year-old woman with regular narrow-QRS tachycardias since adolescence, terminated by vagal manoeuvres; normal baseline ECG.`); },
    position: 'koch',
    manoeuvres: ['extraA', 'induction', 'esvHis', 'entrainementV', 'stimV'],
    get nom() { return t('TRIN typique (lente-rapide)', `Typical AVNRT (slow–fast)`); },
    get court() { return t('Tachycardie par réentrée intranodale typique', `Typical AV nodal re-entrant tachycardia`); },
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(70, 60, 80, 330), ba: nod(45, 40, 80, 250) },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null }),
    cible: 'lente',
    get explication() { return t(`Réentrée intranodale typique : descente par la voie lente (saut d'AH à l'induction), remontée par la voie rapide. VA très court (A et V quasi simultanés, VA < 70 ms (du début du QRS à l'A le plus précoce, ici au His)), activation atriale rétrograde concentrique, la plus précoce sur le His. Une ESV délivrée quand le His est réfractaire ne modifie pas l'atrium. Après entraînement ventriculaire : réponse V-A-V, PPI − TCL > 115 ms et SA − VA > 85 ms. L'adénosine l'arrête. Traitement : ablation de la voie lente.`, `Typical AV nodal re-entry: anterograde conduction over the slow pathway (AH jump at induction), retrograde over the fast pathway. Very short VA (A and V almost simultaneous; VA < 70 ms, measured from QRS onset to the earliest A, here at the His), concentric retrograde atrial activation, earliest at the His. A PVC delivered when the His is refractory does not affect the atrium. After ventricular entrainment: V-A-V response, PPI − TCL > 115 ms and SA − VA > 85 ms. Adenosine terminates it. Treatment: slow pathway ablation.`); },
  },
  'trin-atyp': {
    get contexte() { return t('Femme de 52 ans, tachycardie régulière à QRS fins avec P négatives en inférieur et RP long.', `52-year-old woman with a regular narrow-QRS tachycardia, negative P waves in the inferior leads and a long RP.`); },
    position: 'koch',
    manoeuvres: ['extraV', 'induction', 'esvHis', 'entrainementV', 'parahis'],
    get nom() { return t('TRIN atypique (rapide-lente)', `Atypical AVNRT (fast–slow)`); },
    get court() { return t('Tachycardie par réentrée intranodale atypique', `Atypical AV nodal re-entrant tachycardia`); },
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(75, 80, 100, 270), ba: nod(45, 40, 80, 380) },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: { bloc: true, erp: 300 }, ba: nod(200, 100, 90, 280) }),
    cible: 'lente',
    get explication() { return t(`Réentrée intranodale atypique : descente par la voie rapide, remontée par la voie lente. Tachycardie à RP long, activation atriale la plus précoce à l'ostium du sinus coronaire (SC 9-10 avant le His). Souvent induite par un extrastimulus ventriculaire qui bloque dans la voie rapide rétrograde. Pas d'avance de l'atrium par une ESV His-réfractaire ; V-A-V et PPI − TCL > 115 ms après entraînement ventriculaire. Ablation de la voie lente.`, `Atypical AV nodal re-entry: anterograde conduction over the fast pathway, retrograde over the slow pathway. Long-RP tachycardia, earliest atrial activation at the coronary sinus ostium (CS 9-10 before the His). Often induced by a ventricular extrastimulus that blocks in the retrograde fast pathway. No atrial advancement by a His-refractory PVC; V-A-V response and PPI − TCL > 115 ms after ventricular entrainment. Slow pathway ablation.`); },
  },
  trav: {
    get contexte() { return t('Homme de 24 ans, tachycardies régulières à QRS fins, ECG de base sans préexcitation.', `24-year-old man with regular narrow-QRS tachycardias, baseline ECG without pre-excitation.`); },
    position: 'mitral-lat',
    manoeuvres: ['extraA', 'induction', 'esvHis', 'entrainementV', 'cartographie'],
    get nom() { return t('TRAV orthodromique (voie accessoire latérale gauche cachée)', `Orthodromic AVRT (concealed left lateral accessory pathway)`); },
    get court() { return t('Tachycardie orthodromique sur voie accessoire cachée', `Orthodromic tachycardia over a concealed accessory pathway`); },
    def: () => avec(base(), { id: 'vacc-lat', a: 'cs1', b: 'lvl', ab: { bloc: true, erp: 150 }, ba: { d: 30, erp: 150 } }),
    cible: 'vacc-lat',
    get explication() { return t(`Voie accessoire latérale gauche à conduction exclusivement rétrograde (cachée) : pas de préexcitation. Tachycardie orthodromique : descente par le nœud AV, remontée par la voie accessoire. Activation atriale excentrique, la plus précoce en SC distal (1-2), VA > 70 ms. Une ESV délivrée quand le His est réfractaire avance l'atrium : preuve d'une voie accessoire. Entraînement ventriculaire : V-A-V ; ici PPI − TCL < 115 ms, mais ce critère est validé pour les voies septales : une voie latérale gauche, loin du site de stimulation, peut donner un PPI − TCL > 115 ms. Ablation de la voie accessoire sur l'anneau mitral latéral.`, `Left lateral accessory pathway with exclusively retrograde (concealed) conduction: no pre-excitation. Orthodromic tachycardia: anterograde conduction over the AV node, retrograde over the accessory pathway. Eccentric atrial activation, earliest at the distal CS (1-2), VA > 70 ms. A PVC delivered when the His is refractory advances the atrium: proof of an accessory pathway. Ventricular entrainment: V-A-V; here PPI − TCL < 115 ms, but this criterion was validated for septal pathways: a left lateral pathway, far from the pacing site, can give a PPI − TCL > 115 ms. Ablation of the accessory pathway at the lateral mitral annulus.`); },
  },
  wpw: {
    get contexte() { return t('Homme de 19 ans, préexcitation ventriculaire sur un ECG de visite de sport, palpitations rapides.', `19-year-old man with ventricular pre-excitation on a sports pre-participation ECG and rapid palpitations.`); },
    position: 'mitral-lat',
    manoeuvres: ['extraA', 'induction', 'cartographie'],
    get nom() { return t('Syndrome de Wolff-Parkinson-White (voie latérale gauche)', `Wolff-Parkinson-White syndrome (left lateral pathway)`); },
    get court() { return t('Voie accessoire manifeste (préexcitation)', `Manifest accessory pathway (pre-excitation)`); },
    def: () => { const d = avec(base(), { id: 'vacc-lat', a: 'cs1', b: 'lvl', ab: { d: 15, erp: 320 }, ba: { d: 30, erp: 260 } }); d.sites.hra.fibrillable = true; return d; },
    cible: 'vacc-lat',
    get explication() { return t(`Voie accessoire latérale gauche bidirectionnelle : préexcitation en rythme sinusal (onde delta, HV court ou négatif), majorée par la stimulation du SC distal, proche de la voie. Quand un extrastimulus atrial bloque dans la voie accessoire (période réfractaire plus longue que celle du nœud AV), le QRS s'affine et une tachycardie orthodromique peut démarrer : activation atriale excentrique, SC distal en premier. Ablation de la voie accessoire.`, `Bidirectional left lateral accessory pathway: pre-excitation in sinus rhythm (delta wave, short or negative HV), accentuated by pacing from the distal CS, close to the pathway. When an atrial extrastimulus blocks in the accessory pathway (whose refractory period is longer than that of the AV node), the QRS narrows and an orthodromic tachycardia may start: eccentric atrial activation, distal CS first. Accessory pathway ablation.`); },
  },
  flutter: {
    get contexte() { return t('Homme de 67 ans, BPCO, palpitations ; ECG : ondes en dents de scie en D2, D3, aVF.', `67-year-old man with COPD and palpitations; ECG: sawtooth waves in II, III and aVF.`); },
    position: 'isthme',
    manoeuvres: ['induction', 'entrainementA'],
    get nom() { return t('Flutter atrial typique (antihoraire, isthme-dépendant)', `Typical atrial flutter (counterclockwise, CTI-dependent)`); },
    get court() { return t('Flutter atrial typique isthme-dépendant', `Typical CTI-dependent atrial flutter`); },
    def: () => {
      const d = base();
      regler(d, 'od-h', { ab: myo(40), ba: myo(40) });
      regler(d, 'od-m', { ab: myo(20), ba: myo(20) });
      regler(d, 'od-b', { ab: myo(20), ba: myo(20) });
      // isthme lent, avec une période réfractaire plus longue dans le sens septal → latéral : bloc unidirectionnel possible
      regler(d, 'isthme-lat', { ab: { d: 55, erp: 170 }, ba: { d: 55, erp: 280 } });
      regler(d, 'isthme', { ab: { d: 75, erp: 170 }, ba: { d: 75, erp: 280 } });
      regler(d, 'nav', { ab: nod(80, 110, 110, 300) }); // nœud AV : conduction 2:1 du flutter
      return d;
    },
    cible: 'isthme',
    get explication() { return t(`Macroréentrée autour de l'anneau tricuspide, dans le sens antihoraire (vu de la pointe, comme en OAG) : montée par le septum (ostium du SC puis His), SC activé du proximal au distal, descente par la paroi latérale de l'OD (OD latérale haute puis basse), retour par l'isthme cavo-tricuspide, zone de conduction lente. Cycle atrial ≈ 245 ms (≈ 245/min), conduction AV 2:1 (≈ 120/min) ; ondes F en dents de scie, négatives en DII, positives en V1. Induction par stimulation de l'ostium du SC (extrastimulus court ou salve), qui bloque dans l'isthme dans le sens septal → latéral. Entraînement depuis l'isthme : PPI − TCL < 20-30 ms (site dans le circuit) ; depuis le SC distal : PPI − TCL long (hors circuit). L'adénosine majore le bloc AV sans arrêter le flutter. Ablation de l'isthme cavo-tricuspide, avec pour objectif un bloc bidirectionnel. En stimulant l'ostium du SC, la paroi latérale est activée de haut en bas, tardivement : bloc septal → latéral. En stimulant l'isthme latéral, en dehors de la ligne, le septum est activé tardivement, His avant ostium du SC : bloc latéral → septal.`, `Macro-re-entry around the tricuspid annulus in a counterclockwise direction (viewed from the apex, as in LAO): ascending the septum (CS ostium, then His), CS activated from proximal to distal, descending the RA lateral wall (high then low lateral RA), and returning through the cavotricuspid isthmus, the zone of slow conduction. Atrial cycle length ≈ 245 ms (≈ 245 bpm), 2:1 AV conduction (≈ 120 bpm); sawtooth F waves, negative in lead II, positive in V1. Induced by pacing from the CS ostium (short extrastimulus or burst), which blocks in the isthmus in the septal → lateral direction. Entrainment from the isthmus: PPI − TCL < 20-30 ms (site within the circuit); from the distal CS: long PPI − TCL (outside the circuit). Adenosine increases AV block without terminating the flutter. Cavotricuspid isthmus ablation, with bidirectional block as the endpoint. With pacing from the CS ostium, the lateral wall is activated late, from top to bottom: septal → lateral block. With pacing from the lateral isthmus, outside the line, the septum is activated late, His before CS ostium: lateral → septal block.`); },
  },
  ta: {
    get contexte() { return t('Femme de 60 ans, tachycardie régulière à 150/min, ondes P différentes de la P sinusale.', `60-year-old woman with a regular tachycardia at 150 bpm, P waves differing from the sinus P wave.`); },
    position: 'og-lat',
    manoeuvres: ['salveA', 'entrainementV', 'adenosine', 'cartographie'],
    get nom() { return t('Tachycardie atriale focale', `Focal atrial tachycardia`); },
    get court() { return t('Tachycardie atriale focale', `Focal atrial tachycardia`); },
    def: () => {
      const d = base();
      d.sites.foyer = { erp: 200, cl: 400, declenchable: true };
      d.voies.push({ id: 'foyer-cs', a: 'foyer', b: 'cs3', ab: myo(15), ba: myo(15) });
      return d;
    },
    cible: 'foyer',
    get explication() { return t(`Tachycardie atriale focale, foyer près du SC 3-4 (oreillette gauche) : induite par une salve de stimulation atriale rapide, activation atriale excentrique. Après arrêt de l'entraînement ventriculaire (avec conduction rétrograde 1:1) : réponse V-A-A-V. Sous adénosine, la tachycardie persiste malgré le bloc AV (dissociation), ce qui exclut une réentrée utilisant le nœud AV. Attention : certaines TA focales (activité déclenchée) sont arrêtées par l'adénosine ; un arrêt sous adénosine n'exclut donc pas une TA. Ablation du foyer.`, `Focal atrial tachycardia, with a focus near CS 3-4 (left atrium): induced by a rapid atrial burst, eccentric atrial activation. On cessation of ventricular entrainment (with 1:1 retrograde conduction): V-A-A-V response. With adenosine, the tachycardia persists despite AV block (dissociation), which excludes AV node-dependent re-entry. Caution: some focal ATs (triggered activity) are terminated by adenosine, so termination by adenosine does not exclude AT. Ablation of the focus.`); },
  },
  septale: {
    get contexte() { return t('Homme de 31 ans, tachycardie régulière à QRS fins, P rétrogrades visibles derrière le QRS ; ECG de base normal.', `31-year-old man with a regular narrow-QRS tachycardia, retrograde P waves visible after the QRS; normal baseline ECG.`); },
    position: 'ostium',
    manoeuvres: ['induction', 'esvHis', 'entrainementV', 'parahis', 'cartographie'],
    get nom() { return t('TRAV orthodromique (voie accessoire postéro-septale cachée)', `Orthodromic AVRT (concealed posteroseptal accessory pathway)`); },
    get court() { return t('Tachycardie orthodromique sur voie accessoire septale', `Orthodromic tachycardia over a septal accessory pathway`); },
    def: () => regler(avec(base(), { id: 'vacc-sept', a: 'cs9', b: 'vps', ab: { bloc: true, erp: 150 }, ba: { d: 55, erp: 150 } }), 'nav', { ab: nod(75, 100, 110, 230, 0.45), ba: nod(60, 70, 100, 320) }),
    cible: 'vacc-sept',
    get explication() { return t(`Voie accessoire postéro-septale à conduction rétrograde exclusive. Pendant la tachycardie, l'activation atriale la plus précoce est à l'ostium du SC, comme dans une TRIN atypique : le piège classique. Ce qui tranche : VA > 70 ms mais RP court ; l'ESV His-réfractaire avance l'atrium (ou arrête la tachycardie sans l'atteindre) ; après entraînement ventriculaire, V-A-V avec PPI − TCL < 115 ms et SA − VA < 85 ms ; en stimulation para-hisienne, l'intervalle stimulus-A ne change pas quand on perd la capture du His (conduction rétrograde extranodale). Ablation de la voie accessoire à l'ostium du SC.`, `Posteroseptal accessory pathway with exclusively retrograde conduction. During tachycardia, earliest atrial activation is at the CS ostium, as in atypical AVNRT: the classic pitfall. The discriminators: VA > 70 ms but short RP; the His-refractory PVC advances the atrium (or terminates the tachycardia without reaching it); after ventricular entrainment, V-A-V with PPI − TCL < 115 ms and SA − VA < 85 ms; during para-Hisian pacing, the stimulus-to-A interval does not change when His capture is lost (extranodal retrograde conduction). Accessory pathway ablation at the CS ostium.`); },
  },
  pjrt: {
    get contexte() { return t('Garçon de 14 ans adressé pour cardiomyopathie dilatée et tachycardie quasi permanente à 150/min, P négatives en D2, D3, aVF.', `14-year-old boy referred for dilated cardiomyopathy and a near-incessant tachycardia at 150 bpm, with negative P waves in II, III and aVF.`); },
    position: 'ostium',
    manoeuvres: ['induction', 'esvHis', 'entrainementV', 'cartographie'],
    get nom() { return t('Tachycardie jonctionnelle réciprocante permanente (Coumel)', `Permanent junctional reciprocating tachycardia (Coumel)`); },
    get court() { return t('Tachycardie jonctionnelle réciprocante permanente (PJRT)', `Permanent junctional reciprocating tachycardia (PJRT)`); },
    def: () => avec(base(), { id: 'vacc-sept', a: 'cs9', b: 'vps', ab: { bloc: true, erp: 150 }, ba: nod(190, 90, 110, 90) }),
    cible: 'vacc-sept',
    get explication() { return t(`Voie accessoire postéro-septale cachée à conduction rétrograde lente et décrémentielle. La tachycardie est incessante : elle redémarre spontanément après quelques battements sinusaux. RP long (RP > PR), ondes P négatives en DII, activation atriale la plus précoce à l'ostium du SC. L'ESV His-réfractaire retarde l'atrium (conduction décrémentielle) ou arrête la tachycardie sans l'atteindre. Diagnostic différentiel : TRIN atypique et tachycardie atriale basse. Cause de cardiomyopathie rythmique chez l'enfant et l'adulte jeune. Ablation de la voie à l'ostium du SC.`, `Concealed posteroseptal accessory pathway with slow, decremental retrograde conduction. The tachycardia is incessant: it restarts spontaneously after a few sinus beats. Long RP (RP > PR), negative P waves in lead II, earliest atrial activation at the CS ostium. The His-refractory PVC delays the atrium (decremental conduction) or terminates the tachycardia without reaching it. Differential diagnosis: atypical AVNRT and low atrial tachycardia. A cause of tachycardia-induced cardiomyopathy in children and young adults. Ablation of the pathway at the CS ostium.`); },
  },
  mahaim: {
    get contexte() { return t('Femme de 22 ans, tachycardie régulière à QRS larges de type retard gauche ; ECG de base quasi normal.', `22-year-old woman with a regular wide-QRS tachycardia with LBBB morphology; near-normal baseline ECG.`); },
    position: 'od-lat',
    manoeuvres: ['extraA', 'induction', 'cartographie'],
    get nom() { return t('Fibres de Mahaim (voie atrio-fasciculaire)', `Mahaim fibres (atriofascicular pathway)`); },
    get court() { return t('Voie atrio-fasciculaire (Mahaim)', `Atriofascicular pathway (Mahaim)`); },
    def: () => avec(base(), { id: 'vacc-atf', a: 'latb', b: 'rva', ab: nod(115, 70, 100, 250), ba: null }),
    cible: 'vacc-atf',
    get explication() { return t(`Voie atrio-fasciculaire : insertion atriale sur la paroi latérale de l'anneau tricuspide, insertion distale dans la branche droite près de l'apex du VD. Conduction antérograde seule et décrémentielle. En rythme sinusal, préexcitation minime ou absente ; elle augmente en stimulant la paroi latérale de l'OD ou avec un extrastimulus atrial court (retard de conduction dans la voie, AV qui s'allonge avec un HV qui raccourcit). Tachycardie antidromique à QRS large type retard gauche, VA rétrograde par la branche droite et le nœud AV, His activé juste après le V. Ablation au site du potentiel de Mahaim, sur l'anneau tricuspide latéral.`, `Atriofascicular pathway: atrial insertion on the lateral tricuspid annulus, distal insertion into the right bundle branch near the RV apex. Anterograde-only, decremental conduction. In sinus rhythm, pre-excitation is minimal or absent; it increases with pacing from the RA lateral wall or with a short atrial extrastimulus (conduction delay in the pathway, with the AV interval lengthening as the HV shortens). Antidromic wide-QRS tachycardia with LBBB morphology, retrograde VA conduction via the right bundle branch and the AV node, His activated just after the V. Ablation at the site of the Mahaim potential, on the lateral tricuspid annulus.`); },
  },
  'trin-21': {
    get contexte() { return t('Femme de 29 ans, palpitations régulières ; tachycardie à 90/min sur le Holter, avec une onde P supplémentaire entre deux QRS (fréquence atriale ≈ 180/min).', `29-year-old woman with regular palpitations; tachycardia at 90 bpm on Holter, with an extra P wave between consecutive QRS complexes (atrial rate ≈ 180 bpm).`); },
    position: 'koch',
    manoeuvres: ['extraA', 'induction', 'entrainementV'],
    get nom() { return t('TRIN typique avec bloc 2:1 infra-hisien', `Typical AVNRT with 2:1 infra-Hisian block`); },
    get court() { return t('TRIN avec bloc 2:1 sous le His', `AVNRT with 2:1 block below the His`); },
    def: () => {
      const d = avec(sans(base(), 'nav'),
        { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(70, 60, 80, 330), ba: nod(45, 40, 80, 250) },
        { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null });
      d.sites.bbd.erp = 480; d.sites.bbg.erp = 470;
      return d;
    },
    cible: 'lente',
    get explication() { return t(`Réentrée intranodale typique dont le cycle est plus court que la période réfractaire du tissu de conduction : un H sur deux n'est pas suivi de V (bloc 2:1 sous le His). Les A restent quasi simultanés des H, à cycle court, et le rythme ventriculaire est deux fois plus lent. Le bloc sous le His prouve que les ventricules ne font pas partie du circuit : cela exclut une TRAV, qui ne survit pas à un bloc AV. Ablation de la voie lente.`, `Typical AV nodal re-entry whose cycle length is shorter than the refractory period of the His–Purkinje system: every other H is not followed by a V (2:1 block below the His). The A remain almost simultaneous with the H, at a short cycle length, and the ventricular rate is half the atrial rate. Block below the His proves that the ventricles are not part of the circuit: this excludes AVRT, which cannot survive AV block. Slow pathway ablation.`); },
  },
  coumel: {
    get contexte() { return t('Homme de 40 ans, tachycardie régulière, tantôt à QRS fins, tantôt avec aspect de bloc de branche gauche.', `40-year-old man with a regular tachycardia, sometimes with a narrow QRS, sometimes with LBBB morphology.`); },
    position: 'mitral-lat',
    manoeuvres: ['extraA', 'induction', 'entrainementV'],
    get nom() { return t('TRAV latérale gauche avec bloc de branche gauche fonctionnel', `Left lateral AVRT with functional left bundle branch block`); },
    variation: 0.02, // fenêtre d'entretien du bloc de branche étroite
    get court() { return t('TRAV avec bloc de branche homolatéral (signe de Coumel)', `AVRT with ipsilateral bundle branch block (Coumel's sign)`); },
    def: () => {
      const d = avec(base(), { id: 'vacc-lat', a: 'cs1', b: 'lvl', ab: { bloc: true, erp: 150 }, ba: { d: 30, erp: 150 } });
      d.sites.bbg.erp = 410; d.sites.bbg.restit = 0.5; d.sites.bbd.erp = 330;
      regler(d, 'transseptal', { ab: myo(55), ba: myo(55) }); regler(d, 'vd-vg', { ab: myo(95), ba: myo(95) }); // cardiopathie : conduction myocardique plus lente
      return d;
    },
    cible: 'vacc-lat',
    get explication() { return t(`Tachycardie orthodromique sur voie accessoire latérale gauche, avec un bloc de branche gauche fonctionnel à l'induction qui se pérennise (phénomène de « linking » : pénétration rétrograde cachée de la branche gauche). En bloc de branche gauche, l'influx doit traverser le septum avant d'atteindre la paroi latérale du VG : le VA s'allonge de plus de 35 ms et le cycle de la tachycardie s'allonge aussi, parfois moins que le VA car l'AH peut raccourcir (signe de Coumel), ce qui prouve qu'une voie accessoire homolatérale au bloc participe au circuit. Quand le bloc de branche disparaît, le cycle raccourcit. Ablation de la voie accessoire latérale gauche.`, `Orthodromic tachycardia over a left lateral accessory pathway, with functional left bundle branch block at induction that is perpetuated ("linking" phenomenon: concealed retrograde penetration into the left bundle). With left bundle branch block, the impulse must cross the septum before reaching the LV lateral wall: the VA lengthens by more than 35 ms and the tachycardia cycle length also lengthens, sometimes by less than the VA because the AH may shorten (Coumel's sign), proving that an accessory pathway ipsilateral to the block participates in the circuit. When the bundle branch block resolves, the cycle length shortens. Ablation of the left lateral accessory pathway.`); },
  },
  'flutter-mitral': {
    get contexte() { return t(`Femme de 63 ans, antécédent d'isolation des veines pulmonaires ; tachycardie atriale régulière à 270/min (cycle ≈ 220 ms).`, `63-year-old woman with prior pulmonary vein isolation; regular atrial tachycardia at 270 bpm (cycle length ≈ 220 ms).`); },
    position: 'mitral-lat',
    manoeuvres: ['induction', 'entrainementA'],
    get nom() { return t('Flutter péri-mitral (tachycardie atriale macroréentrante gauche)', `Perimitral flutter (left atrial macro-re-entrant tachycardia)`); },
    get court() { return t('Flutter péri-mitral', `Perimitral flutter`); },
    def: () => {
      const d = base();
      d.sites.cs5.erp = 200; d.sites.cs3.erp = 200;
      regler(d, 'og-lat', { ab: { d: 45, erp: 170 }, ba: { d: 45, erp: 290 } });
      regler(d, 'og-ant', { ab: { d: 90, erp: 170 }, ba: { d: 90, erp: 290 } });
      regler(d, 'og-sept', { ab: { d: 40, erp: 170 }, ba: { d: 40, erp: 290 } });
      regler(d, 'nav', { ab: nod(80, 110, 110, 300, 0.6) });
      return d;
    },
    cible: 'og-lat',
    get explication() { return t(`Macroréentrée autour de l'anneau mitral, souvent après ablation de fibrillation atriale ou chirurgie mitrale. Le sinus coronaire est activé en séquence d'un bout à l'autre (ici du proximal au distal), et la somme des temps d'activation couvre presque tout le cycle. Entraînement : PPI − TCL court en SC proximal comme en SC distal (sites dans le circuit), long depuis l'isthme cavo-tricuspide (hors circuit), ce qui élimine un flutter typique. Ablation de l'isthme mitral (de l'anneau mitral latéral à la veine pulmonaire inférieure gauche), avec contrôle du bloc.`, `Macro-re-entry around the mitral annulus, often after AF ablation or mitral valve surgery. The coronary sinus is activated sequentially from one end to the other (here proximal to distal), and the total activation time spans almost the entire cycle length. Entrainment: short PPI − TCL at both the proximal and the distal CS (sites within the circuit), long from the cavotricuspid isthmus (outside the circuit), which rules out typical flutter. Mitral isthmus ablation (from the lateral mitral annulus to the left inferior pulmonary vein), with confirmation of block.`); },
  },
  jonctionnelle: {
    get contexte() { return t(`Homme de 21 ans, tachycardie à QRS fins favorisée par l'effort, parfois dissociée des P.`, `21-year-old man with a narrow-QRS tachycardia brought on by exertion, sometimes dissociated from the P waves.`); },
    position: 'cryo-his',
    ablationOptionnelle: true,
    manoeuvres: ['iso', 'salveA', 'extraA', 'adenosine'],
    get nom() { return t('Tachycardie jonctionnelle focale', `Focal junctional tachycardia`); },
    get court() { return t('Tachycardie jonctionnelle focale', `Focal junctional tachycardia`); },
    def: () => {
      const d = base();
      d.sites.his = { erp: 250, cl: 1400, declenchable: false };
      d.sites.jet = { erp: 250, cl: 430, declenchable: true };
      d.voies.push({ id: 'jet-his', a: 'jet', b: 'his', ab: myo(5), ba: myo(5) });
      regler(d, 'nav', { ba: nod(70, 90, 100, 330) });
      return d;
    },
    cible: 'jet',
    get explication() { return t(`Automatisme anormal de la jonction AV (His), favorisé par l'isoprénaline ; démasqué ici, pour les besoins du modèle, par une salve atriale sous isoprénaline : un automatisme n'est classiquement ni induit ni arrêté par la stimulation programmée. Chaque V est précédé d'un H avec un HV normal ; les A suivent en rétrograde (VA court, activation concentrique) quand la conduction rétrograde le permet, sinon ils sont dissociés, ce qui exclut une réentrée. L'adénosine peut ralentir la conduction rétrograde sans arrêter la tachycardie. Une extrasystole atriale délivrée quand le His est réfractaire ne modifie pas la tachycardie, contrairement à une TRIN. Traitement : cryoablation prudente ou traitement médical, le risque de bloc AV est élevé.`, `Abnormal automaticity of the AV junction (His), facilitated by isoprenaline; unmasked here, for the purposes of the model, by an atrial burst under isoprenaline, whereas automaticity is classically neither induced nor terminated by programmed stimulation. Each V is preceded by an H with a normal HV; the A follow retrogradely (short VA, concentric activation) when retrograde conduction allows, otherwise they are dissociated, which excludes re-entry. Adenosine may slow retrograde conduction without terminating the tachycardia. A PAC delivered when the His is refractory does not affect the tachycardia, unlike in AVNRT. Treatment: cautious cryoablation or medical therapy, as the risk of AV block is high.`); },
  },
  tv: {
    get contexte() { return t('Homme de 68 ans, infarctus inférolatéral ancien, FEVG 35 %, tachycardie à QRS larges à 170/min.', `68-year-old man with a prior inferolateral myocardial infarction, LVEF 35%, wide-QRS tachycardia at 170 bpm.`); },
    position: 'vg-cicatrice',
    manoeuvres: ['extraV', 'induction', 'entrainementCicatrice'],
    get nom() { return t('Tachycardie ventriculaire sur cicatrice', `Scar-related ventricular tachycardia`); },
    get court() { return t('Tachycardie ventriculaire', `Ventricular tachycardia`); },
    def: () => {
      const d = base();
      Object.assign(d.sites, { tv1: { erp: 230 }, tv2: { erp: 200 }, tv3: { erp: 230 } });
      d.voies.push(
        { id: 'tv-entree', a: 'lvl', b: 'tv1', ab: myo(50), ba: myo(50) },
        // isthme de conduction lente ; la sortie bloque à couplage court dans le sens tv3 → tv2 (bloc unidirectionnel)
        { id: 'tv-isthme', a: 'tv1', b: 'tv2', ab: { d: 200, erp: 170 }, ba: { d: 200, erp: 420 } },
        { id: 'tv-sortie', a: 'tv2', b: 'tv3', ab: { d: 40, erp: 170 }, ba: { d: 40, erp: 300 } },
        { a: 'tv3', b: 'lvl', ab: myo(50), ba: myo(50) });
      regler(d, 'nav', { ba: nod(60, 90, 100, 400) });
      return d;
    },
    cible: 'tv-isthme',
    get explication() { return t(`Réentrée dans une cicatrice du VG (séquelle d'infarctus) : isthme de conduction lente entre deux zones de bloc. Tachycardie à QRS large type retard droit (sortie ventriculaire gauche), His non visible avant le V ou dissocié, dissociation VA ou conduction rétrograde 2:1 : les V sont plus nombreux que les A, ce qui signe l'origine ventriculaire. Induite par des extrastimulus ventriculaires (S2, S3). L'entraînement depuis l'isthme donne une fusion cachée, un PPI − TCL < 30 ms et un stimulus-QRS égal à l'électrogramme-QRS (Stevenson). Ablation de l'isthme de la cicatrice.`, `Re-entry within an LV scar (post-infarction): a slow-conduction isthmus between two zones of block. Wide-QRS tachycardia with RBBB morphology (LV exit), His not visible before the V or dissociated, VA dissociation or 2:1 retrograde conduction: more V than A, the hallmark of a ventricular origin. Induced by ventricular extrastimuli (S2, S3). Entrainment from the isthmus gives concealed fusion, a PPI − TCL < 30 ms and a stimulus-to-QRS interval equal to the electrogram-to-QRS interval (Stevenson). Ablation of the scar isthmus.`); },
  },
  fa: {
    get contexte() { return t('Homme de 58 ans, fibrillation atriale paroxystique symptomatique.', `58-year-old man with symptomatic paroxysmal atrial fibrillation.`); },
    position: null,
    manoeuvres: ['salveA'],
    get nom() { return t('Fibrillation atriale', `Atrial fibrillation`); },
    get court() { return t('Fibrillation atriale', `Atrial fibrillation`); },
    def: () => { const d = base(); d.sites.hra.fibrillable = true; return d; },
    cible: null,
    get explication() { return t(`Oreillette vulnérable : une salve atriale très rapide (cycle de 200 à 150 ms) déclenche une fibrillation atriale. Activité atriale désorganisée et variable d'un dipôle à l'autre, cycles atriaux courts et irréguliers, conduction AV irrégulière filtrée par le nœud AV (QRS fins, RR irréguliers). L'adénosine ne l'arrête pas mais majore transitoirement le bloc AV. Arrêt par choc électrique externe. Traitement ablatif : isolation des veines pulmonaires (non modélisée ici).`, `Vulnerable atrium: a very rapid atrial burst (cycle length 200 to 150 ms) induces atrial fibrillation. Disorganised atrial activity that varies from one bipole to the next, short and irregular atrial cycle lengths, and irregular AV conduction filtered by the AV node (narrow QRS, irregular RR intervals). Adenosine does not terminate it but transiently increases AV block. Terminated by external DC cardioversion. Ablation: pulmonary vein isolation (not modelled here).`); },
  },
};

// Scénarios proposés comme « cas mystère » et réponses possibles (l'ordre des réponses est fixe).
// Patients adressés en tachycardie : le mécanisme est celui du scénario de base, déjà induit à l'ouverture du cas ;
// le diagnostic se confirme par les manœuvres (entraînement, ESV His-réfractaire, adénosine…).
export const ARRIVEES = {
  'arrivee-flutter': { base: 'flutter', get nom() { return t('Patient en tachycardie : flutter à l\'arrivée', 'Patient in tachycardia: flutter on arrival'); },
    get contexte() { return t('Homme de 71 ans, palpitations et dyspnée d\'effort depuis trois jours ; ECG : tachycardie régulière à 150/min, aspect en dents de scie en D2, D3 et aVF. Il arrive en salle en tachycardie.', '71-year-old man with palpitations and exertional dyspnoea for three days; ECG: regular tachycardia at 150 bpm with a sawtooth pattern in II, III and aVF. He arrives in the EP lab in tachycardia.'); },
    recettes: [{ site: 'cs9', extra: [300, 180] }, { site: 'cs9', salve: 250, n: 10 }] },
  'arrivee-trin': { base: 'trin', get nom() { return t('Patient en tachycardie : TSV à QRS fins (1)', 'Patient in tachycardia: narrow-QRS SVT (1)'); },
    get contexte() { return t('Femme de 29 ans, tachycardie régulière à QRS fins depuis 40 minutes, non réduite par les manœuvres vagales ; elle arrive en salle en tachycardie.', '29-year-old woman with a regular narrow-QRS tachycardia for 40 minutes, not terminated by vagal manoeuvres; she arrives in the EP lab in tachycardia.'); },
    recettes: [{ site: 'hra', extra: [400, 200] }] },
  'arrivee-trav': { base: 'trav', get nom() { return t('Patient en tachycardie : TSV à QRS fins (2)', 'Patient in tachycardia: narrow-QRS SVT (2)'); },
    get contexte() { return t('Homme de 35 ans, ECG de base sans préexcitation, crises de tachycardie régulière depuis l\'adolescence ; il arrive en salle en tachycardie.', '35-year-old man, baseline ECG without pre-excitation, episodes of regular tachycardia since adolescence; he arrives in the EP lab in tachycardia.'); },
    recettes: [{ site: 'hra', extra: [400, 200] }, { site: 'rva', extra: [400, 200] }] },
  'arrivee-ta': { base: 'ta', get nom() { return t('Patient en tachycardie : TSV à QRS fins (3)', 'Patient in tachycardia: narrow-QRS SVT (3)'); },
    get contexte() { return t('Femme de 58 ans, tachycardie régulière récidivante, résistante aux bêtabloquants ; elle arrive en salle en tachycardie.', '58-year-old woman with recurrent regular tachycardia, refractory to beta-blockers; she arrives in the EP lab in tachycardia.'); },
    recettes: [{ site: 'hra', salve: 300, n: 10 }, { site: 'hra', salve: 250, n: 12 }] },
  'arrivee-tv': { base: 'tv', get nom() { return t('Patient en tachycardie : tachycardie à QRS larges', 'Patient in tachycardia: wide-QRS tachycardia'); },
    get contexte() { return t('Homme de 66 ans, infarctus inféro-latéral ancien ; tachycardie régulière à QRS larges, bien tolérée, en cours à l\'arrivée en salle.', '66-year-old man with an old inferolateral myocardial infarction; regular, well-tolerated wide-QRS tachycardia, ongoing on arrival in the EP lab.'); },
    recettes: [{ site: 'rva', extra: [400, 200] }] },
};
// Scénario complet (arrivée en tachycardie : données du scénario de base, contexte et nom propres).
export const scenario = id => (ARRIVEES[id] ? { ...SCENARIOS[ARRIVEES[id].base], ...ARRIVEES[id] } : SCENARIOS[id]);

export const MYSTERES = ['normal', 'double', 'trin', 'trin-atyp', 'trin-21', 'trav', 'septale', 'coumel', 'pjrt', 'wpw', 'mahaim', 'ta', 'jonctionnelle', 'flutter', 'flutter-mitral', 'fa', 'tv'];

// Sites de stimulation et d'ablation disponibles.
export const SITES_STIM = [
  { id: 'hra', get nom() { return t('OD haute', `High RA`); } },
  { id: 'latb', get nom() { return t('OD latérale basse (Halo 3-4)', `Low lateral RA (Halo 3-4)`); } },
  { id: 'cti', get nom() { return t('Isthme cavo-tricuspide (Halo 1-2)', `Cavotricuspid isthmus (Halo 1-2)`); } },
  { id: 'cs9', get nom() { return t('SC proximal (9-10)', `Proximal CS (9-10)`); } },
  { id: 'cs1', get nom() { return t('SC distal (1-2)', `Distal CS (1-2)`); } },
  { id: 'parahis', get nom() { return t('Para-hisien (sonde His)', `Para-Hisian (His catheter)`); } },
  { id: 'rva', get nom() { return t('VD apex', `RV apex`); } },
  { id: 'abl', get nom() { return t('Sonde d\'ablation', `Ablation catheter`); } },
];
export const SITES_DETECTION = [{ id: '', get nom() { return t('Aucune', `None`); } }, { id: 'hra', get nom() { return t('OD haute', `High RA`); } }, { id: 'his', nom: 'His' }, { id: 'rva', get nom() { return t('VD apex', `RV apex`); } }];
// Positions de la sonde d'ablation : sites vus par ses électrodes (a : atrial, v : ventriculaire),
// site stimulé depuis la sonde, et substrats détruits par un tir de radiofréquence à cet endroit.
export const POSITIONS = [
  { id: 'od-haute', get nom() { return t('OD haute', `High RA`); }, a: 'hra', v: null, stim: 'hra', cibles: [] },
  { id: 'od-lat', get nom() { return t('Anneau tricuspide latéral', `Lateral tricuspid annulus`); }, a: 'latb', v: 'rva', stim: 'latb', cibles: ['vacc-atf'] },
  { id: 'isthme', get nom() { return t('Isthme cavo-tricuspide', `Cavotricuspid isthmus`); }, a: 'cti', v: 'rva', stim: 'cti', cibles: ['isthme'] },
  { id: 'koch', get nom() { return t('Triangle de Koch, partie basse (voie lente)', `Inferior Koch's triangle (slow pathway)`); }, a: 'cs9', v: 'vps', stim: 'cs9', cibles: ['lente'] },
  { id: 'ostium', get nom() { return t('Ostium du SC, postéro-septal', `CS ostium, posteroseptal`); }, a: 'cs9', v: 'vps', stim: 'cs9', cibles: ['vacc-sept'] },
  { id: 'his', get nom() { return t('Région antéro-septale, près du His (radiofréquence)', `Anteroseptal region, near the His (radiofrequency)`); }, a: 'ras', v: 'vbd', stim: 'parahis', cibles: ['rapide', 'nav', 'jet'] },
  { id: 'cryo-his', get nom() { return t('Région para-hisienne (cryoablation prudente)', `Para-Hisian region (cautious cryoablation)`); }, a: 'ras', v: 'vbd', stim: 'parahis', cibles: ['jet'] },
  { id: 'mitral-lat', get nom() { return t('Anneau mitral latéral (transseptal)', `Lateral mitral annulus (transseptal)`); }, a: 'cs1', v: 'lvl', stim: 'cs1', cibles: ['vacc-lat', 'og-lat'] },
  { id: 'og-lat', get nom() { return t('Oreillette gauche inféro-latérale (en regard du SC 3-4)', `Inferolateral left atrium (adjacent to CS 3-4)`); }, a: 'cs3', v: 'lvl', stim: 'cs3', cibles: ['foyer'] },
  { id: 'vd-apex', get nom() { return t('Apex du VD', `RV apex`); }, a: null, v: 'rva', stim: 'rva', cibles: [] },
  { id: 'vg-cicatrice', get nom() { return t('Cicatrice inféro-latérale du VG', `Inferolateral LV scar`); }, a: null, v: 'tv2', stim: 'tv2', cibles: ['tv-isthme'] },
];
