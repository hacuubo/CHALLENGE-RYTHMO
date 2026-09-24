// Scénarios du simulateur : un cœur de base (conduction normale) et ses variantes arythmogènes.
// Délais et périodes réfractaires en ms, choisis dans les valeurs habituelles d'une exploration électrophysiologique :
// AH ≈ 80 ms, HV ≈ 40 ms, période réfractaire atriale ≈ 220 ms, nodale ≈ 270 ms à 600 ms de cycle.

const t = (d, erp = 150) => ({ d, erp });                       // conduction myocardique simple
const nod = (d, dec, tau, erp) => ({ d, dec, tau, erp });         // conduction décrémentielle (nœud AV)

function base() {
  return {
    sites: {
      sa: { erp: 250, cl: 720 },      // nœud sinusal
      hra: { erp: 220 }, ras: { erp: 220 },
      cs9: { erp: 220 }, cs7: { erp: 220 }, cs5: { erp: 220 }, cs3: { erp: 220 }, cs1: { erp: 220 },
      his: { erp: 250, cl: 1400 },    // échappement jonctionnel
      vsep: { erp: 230 }, rva: { erp: 230 }, lvl: { erp: 230 },
    },
    voies: [
      { a: 'sa', b: 'hra', ab: t(15), ba: t(30) },
      { a: 'hra', b: 'ras', ab: t(35), ba: t(35) },
      { a: 'ras', b: 'cs9', ab: t(20), ba: t(20) },
      { a: 'cs9', b: 'cs7', ab: t(12), ba: t(12) },
      { a: 'cs7', b: 'cs5', ab: t(12), ba: t(12) },
      { a: 'cs5', b: 'cs3', ab: t(12), ba: t(12) },
      { a: 'cs3', b: 'cs1', ab: t(12), ba: t(12) },
      { id: 'nav', a: 'ras', b: 'his', nodale: true, ab: nod(80, 110, 110, 270), ba: nod(60, 70, 100, 230) },
      { a: 'his', b: 'vsep', ab: t(40, 200), ba: t(45, 200) },
      { a: 'vsep', b: 'rva', ab: t(25), ba: t(25) },
      { a: 'vsep', b: 'lvl', ab: t(35), ba: t(35) },
      { a: 'rva', b: 'lvl', ab: t(45), ba: t(45) },
    ],
  };
}

const sans = (def, id) => ({ ...def, voies: def.voies.filter(v => v.id !== id) });
const avec = (def, ...voies) => ({ ...def, voies: [...def.voies, ...voies] });

export const SCENARIOS = {
  normal: {
    nom: 'Conduction normale',
    court: 'Pas de tachycardie inductible, conduction normale',
    def: () => base(),
    explication: `Conduction AV normale : AH ≈ 80 ms, HV ≈ 40 ms, allongement progressif de l'AH avec la précocité de l'extrastimulus, sans saut. En stimulation ventriculaire, la conduction rétrograde passe par le nœud AV : activation atriale concentrique, la plus précoce sur le His, et décrémentielle. Aucune tachycardie n'est inductible.`,
  },
  double: {
    nom: 'Double voie nodale sans tachycardie',
    court: 'Double voie nodale, pas de tachycardie',
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(75, 60, 80, 330), ba: null },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null }),
    explication: `Double voie nodale : quand l'extrastimulus atrial tombe dans la période réfractaire de la voie rapide, la conduction bascule sur la voie lente avec un saut de l'AH (≥ 50 ms pour 10 ms de raccourcissement du couplage). Sans conduction rétrograde nodale (dissociation VA en stimulation ventriculaire), aucune réentrée n'est possible : ni écho ni tachycardie. Cette physiologie isolée ne justifie pas d'ablation.`,
  },
  trin: {
    nom: 'TRIN typique (lente-rapide)',
    court: 'Tachycardie par réentrée intranodale typique',
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(70, 60, 80, 330), ba: nod(45, 40, 80, 250) },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: nod(190, 120, 90, 240), ba: null }),
    cible: 'lente',
    explication: `Réentrée intranodale typique : descente par la voie lente (saut d'AH à l'induction), remontée par la voie rapide. VA très court (A et V quasi simultanés, VA (début du QRS → A le plus précoce, ici au His) < 70 ms), activation atriale rétrograde concentrique, la plus précoce sur le His. Une ESV délivrée quand le His est réfractaire ne modifie pas l'atrium. Après entraînement ventriculaire : réponse V-A-V, PPI − TCL > 115 ms et SA − VA > 85 ms. L'adénosine l'arrête. Traitement : ablation de la voie lente.`,
  },
  'trin-atyp': {
    nom: 'TRIN atypique (rapide-lente)',
    court: 'Tachycardie par réentrée intranodale atypique',
    def: () => avec(sans(base(), 'nav'),
      { id: 'rapide', a: 'ras', b: 'his', nodale: true, ab: nod(75, 80, 100, 270), ba: nod(45, 40, 80, 380) },
      { id: 'lente', a: 'cs9', b: 'his', nodale: true, ab: { bloc: true, erp: 300 }, ba: nod(200, 100, 90, 280) }),
    cible: 'lente',
    explication: `Réentrée intranodale atypique : descente par la voie rapide, remontée par la voie lente. Tachycardie à RP long, activation atriale la plus précoce à l'ostium du sinus coronaire (SC 9-10 avant le His). Souvent induite par un extrastimulus ventriculaire qui bloque dans la voie rapide rétrograde. Pas d'avance de l'atrium par une ESV His-réfractaire ; V-A-V et PPI − TCL > 115 ms après entraînement ventriculaire. Ablation de la voie lente.`,
  },
  trav: {
    nom: 'TRAV orthodromique (voie accessoire latérale gauche cachée)',
    court: 'Tachycardie orthodromique sur voie accessoire cachée',
    def: () => avec(base(), { id: 'vacc', a: 'cs1', b: 'lvl', ab: { bloc: true, erp: 150 }, ba: { d: 30, erp: 150 } }),
    cible: 'vacc',
    explication: `Voie accessoire latérale gauche à conduction exclusivement rétrograde (cachée) : pas de préexcitation. Tachycardie orthodromique : descente par le nœud AV, remontée par la voie accessoire. Activation atriale excentrique, la plus précoce en SC distal (1-2), VA > 70 ms. Une ESV délivrée quand le His est réfractaire avance l'atrium : preuve d'une voie accessoire. Entraînement ventriculaire : V-A-V ; ici PPI − TCL < 115 ms, mais ce critère est validé pour les voies septales : une voie latérale gauche, loin du site de stimulation, peut donner un PPI − TCL > 115 ms. Ablation de la voie accessoire sur l'anneau mitral latéral.`,
  },
  wpw: {
    nom: 'Syndrome de Wolff-Parkinson-White (voie latérale gauche)',
    court: 'Voie accessoire manifeste (préexcitation)',
    def: () => avec(base(), { id: 'vacc', a: 'cs1', b: 'lvl', ab: { d: 15, erp: 320 }, ba: { d: 30, erp: 260 } }),
    cible: 'vacc',
    explication: `Voie accessoire latérale gauche bidirectionnelle : préexcitation en rythme sinusal (onde delta, HV court ou négatif), majorée par la stimulation du SC distal, proche de la voie. Quand un extrastimulus atrial bloque dans la voie accessoire (période réfractaire plus longue que celle du nœud AV), le QRS s'affine et une tachycardie orthodromique peut démarrer : activation atriale excentrique, SC distal en premier. Ablation de la voie accessoire.`,
  },
  ta: {
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
};

// Scénarios proposés comme « cas mystère » et réponses possibles (l'ordre des réponses est fixe).
export const MYSTERES = ['normal', 'double', 'trin', 'trin-atyp', 'trav', 'wpw', 'ta'];

// Sites de stimulation et d'ablation disponibles.
export const SITES_STIM = [
  { id: 'hra', nom: 'OD haute' },
  { id: 'cs9', nom: 'SC proximal (9-10)' },
  { id: 'cs1', nom: 'SC distal (1-2)' },
  { id: 'rva', nom: 'VD apex' },
];
export const SITES_DETECTION = [{ id: '', nom: 'Aucune' }, { id: 'hra', nom: 'OD haute' }, { id: 'his', nom: 'His' }, { id: 'rva', nom: 'VD apex' }];
export const CIBLES_ABLATION = [
  { id: 'lente', nom: 'Partie basse du triangle de Koch, entre l\'ostium du SC et l\'anneau tricuspide (voie lente)' },
  { id: 'rapide', nom: 'Région antéro-septale, près du His (voie rapide)' },
  { id: 'vacc', nom: 'Anneau mitral latéral' },
  { id: 'foyer', nom: 'Oreillette gauche, en regard du SC 3-4' },
];
