// Scénarios du simulateur : un cœur de base (conduction normale) et ses variantes arythmogènes.
// Délais et périodes réfractaires en ms, choisis dans les valeurs habituelles d'une exploration électrophysiologique :
// AH ≈ 80 ms, HV ≈ 40 ms, période réfractaire atriale ≈ 220 ms, nodale ≈ 270 ms à 600 ms de cycle.

const t = (d, erp = 150) => ({ d, erp });                       // conduction myocardique simple
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
      { a: 'sa', b: 'hra', ab: t(15), ba: t(30) },
      { a: 'hra', b: 'ras', ab: t(35), ba: t(35) },
      { a: 'ras', b: 'cs9', ab: t(20), ba: t(20) },
      { a: 'cs9', b: 'cs7', ab: t(12), ba: t(12) },
      { a: 'cs7', b: 'cs5', ab: t(12), ba: t(12) },
      { a: 'cs5', b: 'cs3', ab: t(12), ba: t(12) },
      { a: 'cs3', b: 'cs1', ab: t(12), ba: t(12) },
      // anneau mitral : SC ↔ oreillette gauche antérieure ↔ septum gauche (conduction rapide : pas de réentrée)
      { id: 'og-lat', a: 'cs1', b: 'oga', ab: t(20), ba: t(20) },
      { id: 'og-ant', a: 'oga', b: 'ogs', ab: t(20), ba: t(20) },
      { id: 'og-sept', a: 'ogs', b: 'cs9', ab: t(15), ba: t(15) },
      // anneau tricuspide : paroi latérale descendante puis isthme vers le septum (conduction rapide : pas de réentrée)
      { id: 'od-h', a: 'hra', b: 'lath', ab: t(30), ba: t(30) },
      { id: 'od-m', a: 'lath', b: 'latm', ab: t(15), ba: t(15) },
      { id: 'od-b', a: 'latm', b: 'latb', ab: t(15), ba: t(15) },
      { id: 'isthme-lat', a: 'latb', b: 'cti', ab: t(20), ba: t(20) },
      { id: 'isthme', a: 'cti', b: 'ras', ab: t(20), ba: t(20) },
      { id: 'nav', a: 'ras', b: 'his', nodale: true, ab: nod(80, 110, 110, 270, 0.45), ba: nod(60, 70, 100, 230) },
      // tissu de conduction : HV ≈ 40 ms par chaque branche ; conduction rétrograde plus lente (Purkinje)
      { id: 'bd-p', a: 'his', b: 'bbd', ab: t(15), ba: t(20) },
      { id: 'bd-d', a: 'bbd', b: 'rva', ab: t(25), ba: t(35) },
      { id: 'bg-p', a: 'his', b: 'bbg', ab: t(15), ba: t(20) },
      { id: 'bg-d', a: 'bbg', b: 'vsep', ab: t(25), ba: t(35) },
      { id: 'transseptal', a: 'vsep', b: 'rva', ab: t(45), ba: t(45) },   // conduction transseptale myocardique
      { a: 'vsep', b: 'lvl', ab: t(35), ba: t(35) },
      { id: 'vd-vg', a: 'rva', b: 'lvl', ab: t(80), ba: t(80) },
      { a: 'vbd', b: 'vsep', ab: t(15), ba: t(15) },
      { a: 'vbd', b: 'rva', ab: t(30), ba: t(30) },
      { a: 'vsep', b: 'vps', ab: t(30), ba: t(30) },
      { a: 'vbd', b: 'vps', ab: t(25), ba: t(25) },
    ],
  };
}

// Remplace les paramètres d'une voie (par identifiant) dans une définition.
const regler = (def, id, v) => { def.voies = def.voies.map(x => (x.id === id ? { ...x, ...v } : x)); return def; };

const sans = (def, id) => ({ ...def, voies: def.voies.filter(v => v.id !== id) });
const avec = (def, ...voies) => ({ ...def, voies: [...def.voies, ...voies] });

export const SCENARIOS = {
  normal: {
    contexte: 'Femme de 34 ans, palpitations rapides à début et fin brusques, ECG de base normal ; pas de tachycardie documentée.',
    position: null,
    manoeuvres: ['extraA', 'stimV'],
    nom: 'Conduction normale',
    court: 'Pas de tachycardie inductible, conduction normale',
    def: () => base(),
    explication: `Conduction AV normale : AH ≈ 80 ms, HV ≈ 40 ms, allongement progressif de l'AH avec la précocité de l'extrastimulus, sans saut. En stimulation ventriculaire, la conduction rétrograde passe par le nœud AV : activation atriale concentrique, la plus précoce sur le His, et décrémentielle. Aucune tachycardie n'est inductible.`,
  },
  double: {
    contexte: 'Homme de 45 ans, palpitations non documentées, ECG normal.',
    position: null,
    manoeuvres: ['extraA', 'stimV'],
    nom: 'Double voie nodale sans tachycardie',
    court: 'Double voie nodale, pas de tachycardie',
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(75, 60, 80, 330), ba: null },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null }),
    explication: `Double voie nodale : quand l'extrastimulus atrial tombe dans la période réfractaire de la voie rapide, la conduction bascule sur la voie lente avec un saut de l'AH (≥ 50 ms pour 10 ms de raccourcissement du couplage). Sans conduction rétrograde nodale (dissociation VA en stimulation ventriculaire), aucune réentrée n'est possible : ni écho ni tachycardie. Cette physiologie isolée ne justifie pas d'ablation.`,
  },
  trin: {
    contexte: `Femme de 38 ans, tachycardies régulières à QRS fins depuis l'adolescence, arrêtées par des manœuvres vagales ; ECG de base normal.`,
    position: 'koch',
    manoeuvres: ['extraA', 'induction', 'esvHis', 'entrainementV', 'stimV'],
    nom: 'TRIN typique (lente-rapide)',
    court: 'Tachycardie par réentrée intranodale typique',
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(70, 60, 80, 330), ba: nod(45, 40, 80, 250) },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null }),
    cible: 'lente',
    explication: `Réentrée intranodale typique : descente par la voie lente (saut d'AH à l'induction), remontée par la voie rapide. VA très court (A et V quasi simultanés, VA < 70 ms (du début du QRS à l'A le plus précoce, ici au His)), activation atriale rétrograde concentrique, la plus précoce sur le His. Une ESV délivrée quand le His est réfractaire ne modifie pas l'atrium. Après entraînement ventriculaire : réponse V-A-V, PPI − TCL > 115 ms et SA − VA > 85 ms. L'adénosine l'arrête. Traitement : ablation de la voie lente.`,
  },
  'trin-atyp': {
    contexte: 'Femme de 52 ans, tachycardie régulière à QRS fins avec P négatives en inférieur et RP long.',
    position: 'koch',
    manoeuvres: ['extraV', 'induction', 'esvHis', 'entrainementV', 'parahis'],
    nom: 'TRIN atypique (rapide-lente)',
    court: 'Tachycardie par réentrée intranodale atypique',
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(75, 80, 100, 270), ba: nod(45, 40, 80, 380) },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: { bloc: true, erp: 300 }, ba: nod(200, 100, 90, 280) }),
    cible: 'lente',
    explication: `Réentrée intranodale atypique : descente par la voie rapide, remontée par la voie lente. Tachycardie à RP long, activation atriale la plus précoce à l'ostium du sinus coronaire (SC 9-10 avant le His). Souvent induite par un extrastimulus ventriculaire qui bloque dans la voie rapide rétrograde. Pas d'avance de l'atrium par une ESV His-réfractaire ; V-A-V et PPI − TCL > 115 ms après entraînement ventriculaire. Ablation de la voie lente.`,
  },
  trav: {
    contexte: 'Homme de 24 ans, tachycardies régulières à QRS fins, ECG de base sans préexcitation.',
    position: 'mitral-lat',
    manoeuvres: ['extraA', 'induction', 'esvHis', 'entrainementV', 'cartographie'],
    nom: 'TRAV orthodromique (voie accessoire latérale gauche cachée)',
    court: 'Tachycardie orthodromique sur voie accessoire cachée',
    def: () => avec(base(), { id: 'vacc-lat', a: 'cs1', b: 'lvl', ab: { bloc: true, erp: 150 }, ba: { d: 30, erp: 150 } }),
    cible: 'vacc-lat',
    explication: `Voie accessoire latérale gauche à conduction exclusivement rétrograde (cachée) : pas de préexcitation. Tachycardie orthodromique : descente par le nœud AV, remontée par la voie accessoire. Activation atriale excentrique, la plus précoce en SC distal (1-2), VA > 70 ms. Une ESV délivrée quand le His est réfractaire avance l'atrium : preuve d'une voie accessoire. Entraînement ventriculaire : V-A-V ; ici PPI − TCL < 115 ms, mais ce critère est validé pour les voies septales : une voie latérale gauche, loin du site de stimulation, peut donner un PPI − TCL > 115 ms. Ablation de la voie accessoire sur l'anneau mitral latéral.`,
  },
  wpw: {
    contexte: 'Homme de 19 ans, préexcitation ventriculaire sur un ECG de visite de sport, palpitations rapides.',
    position: 'mitral-lat',
    manoeuvres: ['extraA', 'induction', 'cartographie'],
    nom: 'Syndrome de Wolff-Parkinson-White (voie latérale gauche)',
    court: 'Voie accessoire manifeste (préexcitation)',
    def: () => { const d = avec(base(), { id: 'vacc-lat', a: 'cs1', b: 'lvl', ab: { d: 15, erp: 320 }, ba: { d: 30, erp: 260 } }); d.sites.hra.fibrillable = true; return d; },
    cible: 'vacc-lat',
    explication: `Voie accessoire latérale gauche bidirectionnelle : préexcitation en rythme sinusal (onde delta, HV court ou négatif), majorée par la stimulation du SC distal, proche de la voie. Quand un extrastimulus atrial bloque dans la voie accessoire (période réfractaire plus longue que celle du nœud AV), le QRS s'affine et une tachycardie orthodromique peut démarrer : activation atriale excentrique, SC distal en premier. Ablation de la voie accessoire.`,
  },
  flutter: {
    contexte: 'Homme de 67 ans, BPCO, palpitations ; ECG : ondes en dents de scie en D2, D3, aVF.',
    position: 'isthme',
    manoeuvres: ['induction', 'entrainementA'],
    nom: 'Flutter atrial typique (antihoraire, isthme-dépendant)',
    court: 'Flutter atrial typique isthme-dépendant',
    def: () => {
      const d = base();
      regler(d, 'od-h', { ab: t(40), ba: t(40) });
      regler(d, 'od-m', { ab: t(20), ba: t(20) });
      regler(d, 'od-b', { ab: t(20), ba: t(20) });
      // isthme lent, avec une période réfractaire plus longue dans le sens septal → latéral : bloc unidirectionnel possible
      regler(d, 'isthme-lat', { ab: { d: 55, erp: 170 }, ba: { d: 55, erp: 280 } });
      regler(d, 'isthme', { ab: { d: 75, erp: 170 }, ba: { d: 75, erp: 280 } });
      regler(d, 'nav', { ab: nod(80, 110, 110, 300) }); // nœud AV : conduction 2:1 du flutter
      return d;
    },
    cible: 'isthme',
    explication: `Macroréentrée autour de l'anneau tricuspide, dans le sens antihoraire (vu de la pointe, comme en OAG) : montée par le septum (ostium du SC puis His), SC activé du proximal au distal, descente par la paroi latérale de l'OD (OD latérale haute puis basse), retour par l'isthme cavo-tricuspide, zone de conduction lente. Cycle atrial ≈ 245 ms (≈ 245/min), conduction AV 2:1 (≈ 120/min) ; ondes F en dents de scie, négatives en DII, positives en V1. Induction par stimulation de l'ostium du SC (extrastimulus court ou salve), qui bloque dans l'isthme dans le sens septal → latéral. Entraînement depuis l'isthme : PPI − TCL < 20-30 ms (site dans le circuit) ; depuis le SC distal : PPI − TCL long (hors circuit). L'adénosine majore le bloc AV sans arrêter le flutter. Ablation de l'isthme cavo-tricuspide, avec pour objectif un bloc bidirectionnel. En stimulant l'ostium du SC, la paroi latérale est activée de haut en bas, tardivement : bloc septal → latéral. En stimulant l'isthme latéral, en dehors de la ligne, le septum est activé tardivement, His avant ostium du SC : bloc latéral → septal.`,
  },
  ta: {
    contexte: 'Femme de 60 ans, tachycardie régulière à 150/min, ondes P différentes de la P sinusale.',
    position: 'og-lat',
    manoeuvres: ['salveA', 'entrainementV', 'adenosine', 'cartographie'],
    nom: 'Tachycardie atriale focale',
    court: 'Tachycardie atriale focale',
    def: () => {
      const d = base();
      d.sites.foyer = { erp: 200, cl: 400, declenchable: true };
      d.voies.push({ id: 'foyer-cs', a: 'foyer', b: 'cs3', ab: t(15), ba: t(15) });
      return d;
    },
    cible: 'foyer',
    explication: `Tachycardie atriale focale, foyer près du SC 3-4 (oreillette gauche) : induite par une salve de stimulation atriale rapide, activation atriale excentrique. Après arrêt de l'entraînement ventriculaire (avec conduction rétrograde 1:1) : réponse V-A-A-V. Sous adénosine, la tachycardie persiste malgré le bloc AV (dissociation), ce qui exclut une réentrée utilisant le nœud AV. Attention : certaines TA focales (activité déclenchée) sont arrêtées par l'adénosine ; un arrêt sous adénosine n'exclut donc pas une TA. Ablation du foyer.`,
  },
  septale: {
    contexte: 'Homme de 31 ans, tachycardie régulière à QRS fins, P rétrogrades visibles derrière le QRS ; ECG de base normal.',
    position: 'ostium',
    manoeuvres: ['induction', 'esvHis', 'entrainementV', 'parahis', 'cartographie'],
    nom: 'TRAV orthodromique (voie accessoire postéro-septale cachée)',
    court: 'Tachycardie orthodromique sur voie accessoire septale',
    def: () => regler(avec(base(), { id: 'vacc-sept', a: 'cs9', b: 'vps', ab: { bloc: true, erp: 150 }, ba: { d: 55, erp: 150 } }), 'nav', { ab: nod(75, 100, 110, 230, 0.45), ba: nod(60, 70, 100, 320) }),
    cible: 'vacc-sept',
    explication: `Voie accessoire postéro-septale à conduction rétrograde exclusive. Pendant la tachycardie, l'activation atriale la plus précoce est à l'ostium du SC, comme dans une TRIN atypique : le piège classique. Ce qui tranche : VA > 70 ms mais RP court ; l'ESV His-réfractaire avance l'atrium (ou arrête la tachycardie sans l'atteindre) ; après entraînement ventriculaire, V-A-V avec PPI − TCL < 115 ms et SA − VA < 85 ms ; en stimulation para-hisienne, l'intervalle stimulus-A ne change pas quand on perd la capture du His (conduction rétrograde extranodale). Ablation de la voie accessoire à l'ostium du SC.`,
  },
  pjrt: {
    contexte: 'Garçon de 14 ans adressé pour cardiomyopathie dilatée et tachycardie quasi permanente à 150/min, P négatives en D2, D3, aVF.',
    position: 'ostium',
    manoeuvres: ['induction', 'esvHis', 'entrainementV', 'cartographie'],
    nom: 'Tachycardie jonctionnelle réciprocante permanente (Coumel)',
    court: 'Tachycardie jonctionnelle réciprocante permanente (PJRT)',
    def: () => avec(base(), { id: 'vacc-sept', a: 'cs9', b: 'vps', ab: { bloc: true, erp: 150 }, ba: nod(190, 90, 110, 90) }),
    cible: 'vacc-sept',
    explication: `Voie accessoire postéro-septale cachée à conduction rétrograde lente et décrémentielle. La tachycardie est incessante : elle redémarre spontanément après quelques battements sinusaux. RP long (RP > PR), ondes P négatives en DII, activation atriale la plus précoce à l'ostium du SC. L'ESV His-réfractaire retarde l'atrium (conduction décrémentielle) ou arrête la tachycardie sans l'atteindre. Diagnostic différentiel : TRIN atypique et tachycardie atriale basse. Cause de cardiomyopathie rythmique chez l'enfant et l'adulte jeune. Ablation de la voie à l'ostium du SC.`,
  },
  mahaim: {
    contexte: 'Femme de 22 ans, tachycardie régulière à QRS larges de type retard gauche ; ECG de base quasi normal.',
    position: 'od-lat',
    manoeuvres: ['extraA', 'induction', 'cartographie'],
    nom: 'Fibres de Mahaim (voie atrio-fasciculaire)',
    court: 'Voie atrio-fasciculaire (Mahaim)',
    def: () => avec(base(), { id: 'vacc-atf', a: 'latb', b: 'rva', ab: nod(115, 70, 100, 250), ba: null }),
    cible: 'vacc-atf',
    explication: `Voie atrio-fasciculaire : insertion atriale sur la paroi latérale de l'anneau tricuspide, insertion distale dans la branche droite près de l'apex du VD. Conduction antérograde seule et décrémentielle. En rythme sinusal, préexcitation minime ou absente ; elle augmente en stimulant la paroi latérale de l'OD ou avec un extrastimulus atrial court (retard de conduction dans la voie, AV qui s'allonge avec un HV qui raccourcit). Tachycardie antidromique à QRS large type retard gauche, VA rétrograde par la branche droite et le nœud AV, His activé juste après le V. Ablation au site du potentiel de Mahaim, sur l'anneau tricuspide latéral.`,
  },
  'trin-21': {
    contexte: 'Femme de 29 ans, palpitations régulières ; tachycardie à 90/min sur le Holter, avec une onde P supplémentaire entre deux QRS (fréquence atriale ≈ 180/min).',
    position: 'koch',
    manoeuvres: ['extraA', 'induction', 'entrainementV'],
    nom: 'TRIN typique avec bloc 2:1 infra-hisien',
    court: 'TRIN avec bloc 2:1 sous le His',
    def: () => {
      const d = avec(sans(base(), 'nav'),
        { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(70, 60, 80, 330), ba: nod(45, 40, 80, 250) },
        { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null });
      d.sites.bbd.erp = 480; d.sites.bbg.erp = 470;
      return d;
    },
    cible: 'lente',
    explication: `Réentrée intranodale typique dont le cycle est plus court que la période réfractaire du tissu de conduction : un H sur deux n'est pas suivi de V (bloc 2:1 sous le His). Les A restent quasi simultanés des H, à cycle court, et le rythme ventriculaire est deux fois plus lent. Le bloc sous le His prouve que les ventricules ne font pas partie du circuit : cela exclut une TRAV, qui ne survit pas à un bloc AV. Ablation de la voie lente.`,
  },
  coumel: {
    contexte: 'Homme de 40 ans, tachycardie régulière, tantôt à QRS fins, tantôt avec aspect de bloc de branche gauche.',
    position: 'mitral-lat',
    manoeuvres: ['extraA', 'induction', 'entrainementV'],
    nom: 'TRAV latérale gauche avec bloc de branche gauche fonctionnel',
    variation: 0.02, // fenêtre d'entretien du bloc de branche étroite
    court: 'TRAV avec bloc de branche homolatéral (signe de Coumel)',
    def: () => {
      const d = avec(base(), { id: 'vacc-lat', a: 'cs1', b: 'lvl', ab: { bloc: true, erp: 150 }, ba: { d: 30, erp: 150 } });
      d.sites.bbg.erp = 410; d.sites.bbg.restit = 0.5; d.sites.bbd.erp = 330;
      regler(d, 'transseptal', { ab: t(55), ba: t(55) }); regler(d, 'vd-vg', { ab: t(95), ba: t(95) }); // cardiopathie : conduction myocardique plus lente
      return d;
    },
    cible: 'vacc-lat',
    explication: `Tachycardie orthodromique sur voie accessoire latérale gauche, avec un bloc de branche gauche fonctionnel à l'induction qui se pérennise (phénomène de « linking » : pénétration rétrograde cachée de la branche gauche). En bloc de branche gauche, l'influx doit traverser le septum avant d'atteindre la paroi latérale du VG : le VA s'allonge de plus de 35 ms et le cycle de la tachycardie s'allonge aussi, parfois moins que le VA car l'AH peut raccourcir (signe de Coumel), ce qui prouve qu'une voie accessoire homolatérale au bloc participe au circuit. Quand le bloc de branche disparaît, le cycle raccourcit. Ablation de la voie accessoire latérale gauche.`,
  },
  'flutter-mitral': {
    contexte: `Femme de 63 ans, antécédent d'isolation des veines pulmonaires ; tachycardie atriale régulière à 270/min (cycle ≈ 220 ms).`,
    position: 'mitral-lat',
    manoeuvres: ['induction', 'entrainementA'],
    nom: 'Flutter péri-mitral (tachycardie atriale macroréentrante gauche)',
    court: 'Flutter péri-mitral',
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
    explication: `Macroréentrée autour de l'anneau mitral, souvent après ablation de fibrillation atriale ou chirurgie mitrale. Le sinus coronaire est activé en séquence d'un bout à l'autre (ici du proximal au distal), et la somme des temps d'activation couvre presque tout le cycle. Entraînement : PPI − TCL court en SC proximal comme en SC distal (sites dans le circuit), long depuis l'isthme cavo-tricuspide (hors circuit), ce qui élimine un flutter typique. Ablation de l'isthme mitral (de l'anneau mitral latéral à la veine pulmonaire inférieure gauche), avec contrôle du bloc.`,
  },
  jonctionnelle: {
    contexte: `Homme de 21 ans, tachycardie à QRS fins favorisée par l'effort, parfois dissociée des P.`,
    position: 'cryo-his',
    ablationOptionnelle: true,
    manoeuvres: ['iso', 'salveA', 'extraA', 'adenosine'],
    nom: 'Tachycardie jonctionnelle focale',
    court: 'Tachycardie jonctionnelle focale',
    def: () => {
      const d = base();
      d.sites.his = { erp: 250, cl: 1400, declenchable: false };
      d.sites.jet = { erp: 250, cl: 430, declenchable: true };
      d.voies.push({ id: 'jet-his', a: 'jet', b: 'his', ab: t(5), ba: t(5) });
      regler(d, 'nav', { ba: nod(70, 90, 100, 330) });
      return d;
    },
    cible: 'jet',
    explication: `Automatisme anormal de la jonction AV (His), favorisé par l'isoprénaline ; démasqué ici, pour les besoins du modèle, par une salve atriale sous isoprénaline : un automatisme n'est classiquement ni induit ni arrêté par la stimulation programmée. Chaque V est précédé d'un H avec un HV normal ; les A suivent en rétrograde (VA court, activation concentrique) quand la conduction rétrograde le permet, sinon ils sont dissociés, ce qui exclut une réentrée. L'adénosine peut ralentir la conduction rétrograde sans arrêter la tachycardie. Une extrasystole atriale délivrée quand le His est réfractaire ne modifie pas la tachycardie, contrairement à une TRIN. Traitement : cryoablation prudente ou traitement médical, le risque de bloc AV est élevé.`,
  },
  tv: {
    contexte: 'Homme de 68 ans, infarctus inférolatéral ancien, FEVG 35 %, tachycardie à QRS larges à 170/min.',
    position: 'vg-cicatrice',
    manoeuvres: ['extraV', 'induction', 'entrainementCicatrice'],
    nom: 'Tachycardie ventriculaire sur cicatrice',
    court: 'Tachycardie ventriculaire',
    def: () => {
      const d = base();
      Object.assign(d.sites, { tv1: { erp: 230 }, tv2: { erp: 200 }, tv3: { erp: 230 } });
      d.voies.push(
        { id: 'tv-entree', a: 'lvl', b: 'tv1', ab: t(50), ba: t(50) },
        // isthme de conduction lente ; la sortie bloque à couplage court dans le sens tv3 → tv2 (bloc unidirectionnel)
        { id: 'tv-isthme', a: 'tv1', b: 'tv2', ab: { d: 200, erp: 170 }, ba: { d: 200, erp: 420 } },
        { id: 'tv-sortie', a: 'tv2', b: 'tv3', ab: { d: 40, erp: 170 }, ba: { d: 40, erp: 300 } },
        { a: 'tv3', b: 'lvl', ab: t(50), ba: t(50) });
      regler(d, 'nav', { ba: nod(60, 90, 100, 400) });
      return d;
    },
    cible: 'tv-isthme',
    explication: `Réentrée dans une cicatrice du VG (séquelle d'infarctus) : isthme de conduction lente entre deux zones de bloc. Tachycardie à QRS large type retard droit (sortie ventriculaire gauche), His non visible avant le V ou dissocié, dissociation VA ou conduction rétrograde 2:1 : les V sont plus nombreux que les A, ce qui signe l'origine ventriculaire. Induite par des extrastimulus ventriculaires (S2, S3). L'entraînement depuis l'isthme donne une fusion cachée, un PPI − TCL < 30 ms et un stimulus-QRS égal à l'électrogramme-QRS (Stevenson). Ablation de l'isthme de la cicatrice.`,
  },
  fa: {
    contexte: 'Homme de 58 ans, fibrillation atriale paroxystique symptomatique.',
    position: null,
    manoeuvres: ['salveA'],
    nom: 'Fibrillation atriale',
    court: 'Fibrillation atriale',
    def: () => { const d = base(); d.sites.hra.fibrillable = true; return d; },
    cible: null,
    explication: `Oreillette vulnérable : une salve atriale très rapide (cycle de 200 à 150 ms) déclenche une fibrillation atriale. Activité atriale désorganisée et variable d'un dipôle à l'autre, cycles atriaux courts et irréguliers, conduction AV irrégulière filtrée par le nœud AV (QRS fins, RR irréguliers). L'adénosine ne l'arrête pas mais majore transitoirement le bloc AV. Arrêt par choc électrique externe. Traitement ablatif : isolation des veines pulmonaires (non modélisée ici).`,
  },
};

// Scénarios proposés comme « cas mystère » et réponses possibles (l'ordre des réponses est fixe).
// Patients adressés en tachycardie : le mécanisme est celui du scénario de base, déjà induit à l'ouverture du cas ;
// le diagnostic se confirme par les manœuvres (entraînement, ESV His-réfractaire, adénosine…).
export const ARRIVEES = {
  'arrivee-flutter': { base: 'flutter', nom: 'Patient en tachycardie : flutter à l\'arrivée',
    contexte: 'Homme de 71 ans, palpitations et dyspnée d\'effort depuis trois jours ; ECG : tachycardie régulière à 150/min, aspect en dents de scie en D2, D3 et aVF. Il arrive en salle en tachycardie.',
    recettes: [{ site: 'cs9', extra: [300, 180] }, { site: 'cs9', salve: 250, n: 10 }] },
  'arrivee-trin': { base: 'trin', nom: 'Patient en tachycardie : TSV à QRS fins (1)',
    contexte: 'Femme de 29 ans, tachycardie régulière à QRS fins depuis 40 minutes, non réduite par les manœuvres vagales ; elle arrive en salle en tachycardie.',
    recettes: [{ site: 'hra', extra: [400, 200] }] },
  'arrivee-trav': { base: 'trav', nom: 'Patient en tachycardie : TSV à QRS fins (2)',
    contexte: 'Homme de 35 ans, ECG de base sans préexcitation, crises de tachycardie régulière depuis l\'adolescence ; il arrive en salle en tachycardie.',
    recettes: [{ site: 'hra', extra: [400, 200] }, { site: 'rva', extra: [400, 200] }] },
  'arrivee-ta': { base: 'ta', nom: 'Patient en tachycardie : TSV à QRS fins (3)',
    contexte: 'Femme de 58 ans, tachycardie régulière récidivante, résistante aux bêtabloquants ; elle arrive en salle en tachycardie.',
    recettes: [{ site: 'hra', salve: 300, n: 10 }, { site: 'hra', salve: 250, n: 12 }] },
  'arrivee-tv': { base: 'tv', nom: 'Patient en tachycardie : tachycardie à QRS larges',
    contexte: 'Homme de 66 ans, infarctus inféro-latéral ancien ; tachycardie régulière à QRS larges, bien tolérée, en cours à l\'arrivée en salle.',
    recettes: [{ site: 'rva', extra: [400, 200] }] },
};
// Scénario complet (arrivée en tachycardie : données du scénario de base, contexte et nom propres).
export const scenario = id => (ARRIVEES[id] ? { ...SCENARIOS[ARRIVEES[id].base], ...ARRIVEES[id] } : SCENARIOS[id]);

export const MYSTERES = ['normal', 'double', 'trin', 'trin-atyp', 'trin-21', 'trav', 'septale', 'coumel', 'pjrt', 'wpw', 'mahaim', 'ta', 'jonctionnelle', 'flutter', 'flutter-mitral', 'fa', 'tv'];

// Sites de stimulation et d'ablation disponibles.
export const SITES_STIM = [
  { id: 'hra', nom: 'OD haute' },
  { id: 'latb', nom: 'OD latérale basse (Halo 3-4)' },
  { id: 'cti', nom: 'Isthme cavo-tricuspide (Halo 1-2)' },
  { id: 'cs9', nom: 'SC proximal (9-10)' },
  { id: 'cs1', nom: 'SC distal (1-2)' },
  { id: 'parahis', nom: 'Para-hisien (sonde His)' },
  { id: 'rva', nom: 'VD apex' },
  { id: 'abl', nom: 'Sonde d\'ablation' },
];
export const SITES_DETECTION = [{ id: '', nom: 'Aucune' }, { id: 'hra', nom: 'OD haute' }, { id: 'his', nom: 'His' }, { id: 'rva', nom: 'VD apex' }];
// Positions de la sonde d'ablation : sites vus par ses électrodes (a : atrial, v : ventriculaire),
// site stimulé depuis la sonde, et substrats détruits par un tir de radiofréquence à cet endroit.
export const POSITIONS = [
  { id: 'od-haute', nom: 'OD haute', a: 'hra', v: null, stim: 'hra', cibles: [] },
  { id: 'od-lat', nom: 'Anneau tricuspide latéral', a: 'latb', v: 'rva', stim: 'latb', cibles: ['vacc-atf'] },
  { id: 'isthme', nom: 'Isthme cavo-tricuspide', a: 'cti', v: 'rva', stim: 'cti', cibles: ['isthme'] },
  { id: 'koch', nom: 'Triangle de Koch, partie basse (voie lente)', a: 'cs9', v: 'vps', stim: 'cs9', cibles: ['lente'] },
  { id: 'ostium', nom: 'Ostium du SC, postéro-septal', a: 'cs9', v: 'vps', stim: 'cs9', cibles: ['vacc-sept'] },
  { id: 'his', nom: 'Région antéro-septale, près du His (radiofréquence)', a: 'ras', v: 'vbd', stim: 'parahis', cibles: ['rapide', 'nav', 'jet'] },
  { id: 'cryo-his', nom: 'Région para-hisienne (cryoablation prudente)', a: 'ras', v: 'vbd', stim: 'parahis', cibles: ['jet'] },
  { id: 'mitral-lat', nom: 'Anneau mitral latéral (transseptal)', a: 'cs1', v: 'lvl', stim: 'cs1', cibles: ['vacc-lat', 'og-lat'] },
  { id: 'og-lat', nom: 'Oreillette gauche inféro-latérale (en regard du SC 3-4)', a: 'cs3', v: 'lvl', stim: 'cs3', cibles: ['foyer'] },
  { id: 'vd-apex', nom: 'Apex du VD', a: null, v: 'rva', stim: 'rva', cibles: [] },
  { id: 'vg-cicatrice', nom: 'Cicatrice inféro-latérale du VG', a: null, v: 'tv2', stim: 'tv2', cibles: ['tv-isthme'] },
];
