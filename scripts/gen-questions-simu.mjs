// Génère les questions « tracé du simulateur d'électrophysiologie » : node scripts/gen-questions-simu.mjs [--verifier]
// Chaque question rejoue un protocole (scénario, graine, étapes) avec le moteur du simulateur ; les valeurs citées
// (intervalles, PPI, réponse à l'entraînement…) sont mesurées sur ce rejeu et les réponses attendues sont vérifiées.
// --verifier : échoue si le fichier committé ne correspond plus au moteur (à lancer en CI après toute modification du moteur).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rejouer } from '../js/simu/rejeu.js';
import { tachycardie, mesures, battementsV, activations, sitePlusPrecoce, analyserEntrainement, analyserESV } from '../js/simu/analyse.js';

const sortie = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'questions', 'simulateur-traces.json');
const verif = process.argv.includes('--verifier');
const R = Math.round;
const affirmer = (cond, msg) => { if (!cond) throw new Error(`Question non conforme : ${msg}`); };

const SRC = {
  esc: { titre: 'Brugada J, Katritsis DG et al. 2019 ESC Guidelines for the management of patients with supraventricular tachycardia. Eur Heart J 2020;41:655-720', url: 'https://doi.org/10.1093/eurheartj/ehz467' },
  michaud: { titre: 'Michaud GF et al. Differentiation of atypical atrioventricular node re-entrant tachycardia from orthodromic reciprocating tachycardia using a septal accessory pathway by the response to ventricular pacing. J Am Coll Cardiol 2001;38:1163-7', url: 'https://doi.org/10.1016/S0735-1097(01)01480-2' },
  knight: { titre: 'Knight BP et al. Diagnostic value of tachycardia features and pacing maneuvers during paroxysmal supraventricular tachycardia. J Am Coll Cardiol 2000;36:574-82', url: 'https://doi.org/10.1016/S0735-1097(00)00770-1' },
  knightVAAV: { titre: 'Knight BP et al. A technique for the rapid diagnosis of atrial tachycardia in the electrophysiology laboratory. J Am Coll Cardiol 1999;33:775-81', url: 'https://doi.org/10.1016/S0735-1097(98)00614-7' },
  hirao: { titre: 'Hirao K et al. Para-Hisian pacing. A new method for differentiating retrograde conduction over an accessory AV pathway from conduction over the AV node. Circulation 1996;94:1027-35', url: 'https://doi.org/10.1161/01.CIR.94.5.1027' },
  josephson: { titre: 'Josephson ME. Josephson\'s Clinical Cardiac Electrophysiology: Techniques and Interpretations, 6e éd. Wolters Kluwer, 2021', url: null },
  esvTV: { titre: 'Zeppenfeld K et al. 2022 ESC Guidelines for the management of patients with ventricular arrhythmias and the prevention of sudden cardiac death. Eur Heart J 2022;43:3997-4126', url: 'https://doi.org/10.1093/eurheartj/ehac262' },
  stevenson: { titre: 'Stevenson WG et al. Identification of reentry circuit sites during catheter mapping and radiofrequency ablation of ventricular tachycardia late after myocardial infarction. Circulation 1993;88:1647-70', url: 'https://doi.org/10.1161/01.CIR.88.4.1647' },
};

// essaie des couplages S2 décroissants jusqu'à obtenir une tachycardie soutenue ; renvoie les étapes d'induction
function induction(scenario, site, extras = 1, { s1 = 600, depuis = 400, jusqua = 200, avant = [] } = {}) {
  for (let s2 = depuis; s2 >= jusqua; s2 -= 10) {
    const etapes = [...avant, { train: { site, s1, n: 8, extras: Array(extras).fill(s2) } }, { attendre: 4000 }];
    const r = rejouer({ scenario, etapes });
    if (tachycardie(r.coeur, r.t, 3000).active) return { etapes, s2, r };
  }
  throw new Error(`${scenario} : pas d'induction depuis ${site}`);
}

const questions = [];
let num = 0;
function ajouter(q) {
  num++;
  questions.push({ id: `simu-${String(num).padStart(3, '0')}`, theme: 'electrophysio', sousTheme: 'Lecture de tracés d\'EEP (simulateur)', marque: null, type: 'qcu',
    ...q, reponseAttendue: null, revise: '2026-09' });
}
// fenêtre affichée : fin (instant absolu) et vitesse de défilement
const simu = (scenario, etapes, fin, { vitesse = 50, montage = 'standard', legende = '' } = {}) => ({ scenario, graine: 7, etapes, fin: R(fin), vitesse, montage, legende });

// 1. Saut de conduction nodale
{
  let precedent = null, trouve = null;
  for (let s2 = 420; s2 >= 250 && !trouve; s2 -= 10) {
    const r = rejouer({ scenario: 'double', etapes: [{ train: { site: 'hra', extras: [s2] } }, { attendre: 900 }] });
    const d = r.marques.dernierStim, a = activations(r.coeur.journal, 'ras', d, d + 200)[0], h = activations(r.coeur.journal, 'his', d, d + 600)[0];
    const ah = a != null && h != null ? R(h - a) : null;
    if (precedent && ah && precedent.ah && ah - precedent.ah >= 50) trouve = { s2, ah, prec: precedent, r };
    precedent = { s2, ah };
  }
  affirmer(trouve, 'saut d\'AH introuvable');
  const { s2, ah, prec, r } = trouve;
  ajouter({
    difficulte: 5,
    question: `Extrastimulus atrial depuis l'OD haute (8 × S1 600 ms). Au couplage S2 = ${prec.s2} ms, l'AH mesurait ${prec.ah} ms. Le tracé montre S2 = ${s2} ms : l'AH mesure ${ah} ms. Quelle est l'interprétation ?`,
    simu: simu('double', [{ train: { site: 'hra', extras: [s2] } }, { attendre: 900 }], r.marques.dernierStim + 700, { vitesse: 100, legende: `S2 = ${s2} ms` }),
    options: ['Décrément nodal habituel, sans signification particulière', 'Saut de conduction de la voie rapide vers la voie lente', 'Aberration fonctionnelle dans la branche droite', 'Conduction antérograde par une voie accessoire lente'],
    reponses: [1],
    commentaires: [
      `Faux : le décrément physiologique est progressif ; un allongement de ${ah - prec.ah} ms pour 10 ms de raccourcissement du couplage est un saut.`,
      `Juste : la voie rapide est réfractaire à ce couplage, l'influx descend par la voie lente : saut d'AH ≥ 50 ms pour 10 ms, définition de la double voie nodale.`,
      'Faux : une aberration touche le QRS (et le HV), pas l\'intervalle AH ; ici le saut est au-dessus du His.',
      'Faux : une voie accessoire antérograde préexcite le ventricule (HV court) ; ici le His précède normalement le V.',
    ],
    explication: `L'extrastimulus atrial explore la courbe de conduction nodale : quand S2 raccourcit, l'AH s'allonge progressivement (décrément). Ici l'AH passe brutalement de ${prec.ah} à ${ah} ms pour 10 ms de couplage en moins : la voie rapide a atteint sa période réfractaire effective et la conduction bascule sur la voie lente. C'est la définition de la double voie nodale (saut ≥ 50 ms pour 10 ms). Cette physiologie est fréquente et ne justifie un traitement que si une TRIN est inductible ou documentée.`,
    aRetenir: 'Saut d\'AH ≥ 50 ms pour 10 ms de raccourcissement du couplage = double voie nodale ; en soi, pas une indication d\'ablation.',
    sources: [SRC.josephson, SRC.esc],
  });
}

// 2. Diagnostic d'une TRIN typique à l'induction
{
  const { etapes, s2, r } = induction('trin', 'hra');
  const t = tachycardie(r.coeur, r.t), m = mesures(r.coeur, r.t);
  const v = battementsV(r.coeur.journal, r.t - 2000, r.t).at(-2), p = sitePlusPrecoce(r.coeur.journal, v - 60, v + 200);
  affirmer(m.VA < 70 && p === 'ras', 'TRIN : VA court et A précoce au His');
  ajouter({
    difficulte: 5,
    question: `Induction par extrastimulus atrial (S2 = ${s2} ms) d'une tachycardie à QRS fins, cycle ${R(t.cycleV)} ms. Lisez la séquence d'activation sur le tracé (His d, SC 9-10 à 1-2). Quel est le diagnostic le plus probable ?`,
    simu: simu('trin', etapes, r.t - 200, { vitesse: 100 }),
    options: ['Réentrée intranodale typique (lente-rapide)', 'Réentrée orthodromique sur voie latérale gauche', 'Tachycardie atriale focale de l\'oreillette gauche', 'Réentrée intranodale atypique (rapide-lente)'],
    reponses: [0],
    commentaires: [
      `Juste : A et V quasi simultanés (VA ${m.VA} ms, < 70 ms), activation atriale rétrograde concentrique, la plus précoce au His.`,
      'Faux : une voie latérale gauche active d\'abord le SC distal (activation excentrique) avec un VA > 70 ms.',
      'Faux : un foyer gauche donne une activation excentrique et un rapport A-V indépendant du nœud AV.',
      'Faux : la forme atypique a un RP long et une activation la plus précoce à l\'ostium du SC.',
    ],
    explication: `Le tracé montre une tachycardie régulière où chaque A tombe dans le V (VA ${m.VA} ms mesuré sur le His) avec une activation concentrique : His d'abord, puis SC proximal vers distal. Un VA < 70 ms élimine pratiquement une réentrée orthodromique, car l'influx doit traverser le ventricule avant de remonter par la voie accessoire. Le saut d'AH à l'induction oriente vers une descente par la voie lente. Ces éléments sont en faveur d'une TRIN typique, à confirmer par les manœuvres (entraînement ventriculaire, ESV His-réfractaire).`,
    aRetenir: 'VA < 70 ms avec activation concentrique la plus précoce au His : TRIN typique ; la TRAV est pratiquement exclue.',
    sources: [SRC.esc, SRC.josephson],
  });
}

// 3. Entraînement ventriculaire pendant une TRIN
{
  const ind = induction('trin', 'hra');
  const tcl = tachycardie(ind.r.coeur, ind.r.t).cycleV, cl = R(tcl - 30);
  const etapes = [...ind.etapes, { salve: { site: 'rva', cl, n: 15 } }, { attendre: 3000 }];
  const r = rejouer({ scenario: 'trin', etapes });
  const a = analyserEntrainement(r.coeur, { der: r.marques.dernierStim, site: 'rva', tcl, ventriculaire: true });
  affirmer(a.reponse === 'V-A-V' && a.pptcl > 115 && tachycardie(r.coeur, r.t).active, 'TRIN : V-A-V et PPI − TCL > 115');
  ajouter({
    difficulte: 7,
    question: `Tachycardie à QRS fins, cycle ${R(tcl)} ms. Entraînement depuis l'apex du VD à ${cl} ms, avec conduction rétrograde 1:1, puis arrêt (tracé). Le PPI mesuré sur le VD est de ${a.ppi} ms. Quelle est la conclusion ?`,
    simu: simu('trin', etapes, r.marques.dernierStim + 1300, { vitesse: 50 }),
    options: ['Réponse V-A-A-V : tachycardie atriale', 'Réponse V-A-V, PPI − TCL < 115 ms : réentrée sur voie septale', `Réponse V-A-V, PPI − TCL de ${a.pptcl} ms : réentrée intranodale`, 'Manœuvre non interprétable sans fusion du QRS'],
    reponses: [2],
    commentaires: [
      'Faux : après le dernier A entraîné vient un V, pas un second A : la réponse est V-A-V.',
      `Faux : PPI − TCL = ${a.pptcl} ms, au-delà de 115 ms : l'apex du VD est loin du circuit, ce qui oriente vers la TRIN.`,
      `Juste : réponse V-A-V et PPI − TCL = ${a.ppi} − ${R(tcl)} = ${a.pptcl} ms > 115 ms : le circuit ne passe pas par le ventricule.`,
      'Faux : l\'absence de fusion du QRS n\'empêche pas d\'interpréter la réponse ni le PPI ; elle est même attendue dans la TRIN.',
    ],
    explication: `À l'arrêt de l'entraînement, le dernier A entraîné est suivi d'un V (réponse V-A-V) : la tachycardie utilise le nœud AV, ce qui élimine une tachycardie atriale. Le PPI mesuré sur le site de stimulation (${a.ppi} ms) dépasse le cycle de ${a.pptcl} ms : l'apex du VD est éloigné du circuit. Un PPI − TCL > 115 ms (et un SA − VA > 85 ms) est en faveur d'une TRIN ; une valeur < 115 ms oriente vers une réentrée utilisant une voie accessoire septale (Michaud). Mesurez toujours le PPI sur l'électrogramme du site stimulé.`,
    aRetenir: 'Entraînement VD : V-A-V + PPI − TCL > 115 ms → TRIN ; < 115 ms → TRAV (voie septale).',
    sources: [SRC.michaud, SRC.knight, SRC.esc],
  });
}

// 4. Réponse V-A-A-V d'une tachycardie atriale
{
  const avant = [{ salve: { site: 'hra', cl: 300, n: 10 } }, { attendre: 6000 }];
  const r0 = rejouer({ scenario: 'ta', etapes: avant });
  const tcl = tachycardie(r0.coeur, r0.t).cycleA, cl = R(tcl - 30);
  affirmer(tachycardie(r0.coeur, r0.t).active, 'TA induite');
  const etapes = [...avant, { salve: { site: 'rva', cl, n: 20 } }, { attendre: 3000 }];
  const r = rejouer({ scenario: 'ta', etapes });
  const a = analyserEntrainement(r.coeur, { der: r.marques.dernierStim, site: 'rva', tcl, ventriculaire: true });
  affirmer(a.reponse === 'V-A-A-V', 'TA : V-A-A-V');
  ajouter({
    difficulte: 6,
    question: `Tachycardie à QRS fins, cycle ${R(tcl)} ms, induite par une salve atriale. Entraînement ventriculaire à ${cl} ms avec conduction rétrograde 1:1, puis arrêt (tracé). Quelle réponse observe-t-on, et qu'en concluez-vous ?`,
    simu: simu('ta', etapes, r.marques.dernierStim + 1500, { vitesse: 50 }),
    options: ['V-A-V : réentrée impliquant le nœud AV', 'V-A-A-V : tachycardie atriale', 'V-A-V : réentrée sur voie accessoire', 'Pseudo-V-A-A-V : réentrée intranodale atypique'],
    reponses: [1],
    commentaires: [
      'Faux : après le dernier A entraîné, l\'activité suivante est un A et non un V.',
      'Juste : le dernier A entraîné est suivi d\'un second A avant tout V : le foyer atrial reprend sans dépendre du ventricule.',
      'Faux : une TRAV redonnerait un V après le dernier A entraîné, puisque ce V fait partie du circuit.',
      'Faux : la pseudo-V-A-A-V s\'observe quand le VA est très long ; ici le dernier A entraîné est bien identifié juste après le dernier stimulus.',
    ],
    explication: `À l'arrêt d'un entraînement ventriculaire avec conduction rétrograde 1:1, on identifie le dernier A entraîné, puis l'activité suivante. Ici on voit A puis A avant le prochain V : réponse V-A-A-V, qui signe une tachycardie atriale (Knight 1999). En cas de TRIN ou de TRAV, le circuit passe par le ventricule, le dernier A entraîné est suivi d'un V (V-A-V). Piège : quand le VA est long (TRIN atypique, voie décrémentielle), on peut confondre le dernier A entraîné avec un A spontané (pseudo-V-A-A-V).`,
    aRetenir: 'Arrêt de l\'entraînement ventriculaire : V-A-A-V = tachycardie atriale ; V-A-V = circuit passant par le nœud AV ou une voie accessoire.',
    sources: [SRC.knightVAAV, SRC.esc],
  });
}

// 5. ESV His-réfractaire pendant une TRAV
{
  const ind = induction('trav', 'hra');
  const c0 = ind.r.coeur, tcl = tachycardie(c0, ind.r.t).cycleV;
  const h = activations(c0.journal, 'his', ind.r.t - 900, ind.r.t).at(-1);
  let cible = h + tcl - 30; while (cible < ind.r.t + 60) cible += tcl;
  const etapes = [...ind.etapes, { stim: { site: 'rva', delai: R(cible - ind.r.t) } }, { attendre: 3100 }];
  const r = rejouer({ scenario: 'trav', etapes });
  const av = analyserESV(r.coeur, r.marques.dernierStim, tcl);
  affirmer(av >= 10, `TRAV : avance de l'A (${av})`);
  ajouter({
    difficulte: 7,
    question: `Tachycardie orthodromique (cycle ${R(tcl)} ms, SC distal activé en premier). Une ESV est délivrée à l'apex du VD 30 ms avant le His attendu, alors que le His est déjà engagé (tracé). L'A suivant est avancé de ${av} ms avec la même séquence. Que prouve cette réponse ?`,
    simu: simu('trav', etapes, r.marques.dernierStim + 900, { vitesse: 50 }),
    options: ['L\'existence d\'une voie accessoire à conduction rétrograde', 'Une conduction rétrograde par la voie rapide du nœud AV intact', 'Une réentrée intranodale avec une voie finale commune basse', 'Une réinitialisation d\'un foyer atrial gauche par l\'ESV'],
    reponses: [0],
    commentaires: [
      'Juste : le His étant réfractaire, l\'influx ne peut atteindre l\'oreillette qu\'en court-circuitant le nœud AV, donc par une voie accessoire.',
      'Faux : pour remonter par le nœud AV, l\'influx doit passer par le His, qui est ici réfractaire.',
      'Faux : dans une TRIN, une ESV His-réfractaire n\'atteint pas le circuit nodal et ne modifie pas l\'atrium.',
      'Faux : pour réinitialiser un foyer atrial, l\'ESV devrait atteindre l\'oreillette, ce qui impose déjà une voie extranodale quand le His est réfractaire.',
    ],
    explication: `Une ESV délivrée quand le His est réfractaire (au moment ou juste avant le His attendu) ne peut pas remonter par le système His-nœud AV. Si l'A suivant est avancé avec la même séquence d'activation, l'influx est passé par une voie accessoire : c'est la preuve de son existence. Elle participe au circuit si l'ESV avance l'atrium ou arrête la tachycardie sans l'atteindre. À l'inverse, l'absence d'avance n'exclut pas une voie éloignée du site de stimulation, comme une voie latérale gauche stimulée depuis l'apex du VD.`,
    aRetenir: 'ESV His-réfractaire qui avance l\'atrium avec la même séquence = voie accessoire ; qui arrête la tachycardie sans atteindre l\'atrium = voie participante.',
    sources: [SRC.josephson, SRC.knight],
  });
}

// 6-7. Stimulation para-hisienne : conduction extranodale (voie septale) puis nodale
for (const [scenario, site] of [['septale', 'cs9'], ['normal', 'ras']]) {
  const etapes = [{ choc: true }, { salve: { site: 'parahis', cl: 500, n: 5, mA: 15 } }, { attendre: 700 }, { marque: 'haut' }, { salve: { site: 'parahis', cl: 500, n: 5, mA: 5 } }, { attendre: 700 }];
  const r = rejouer({ scenario, etapes });
  const j = r.coeur.journal, stims = r.coeur.stims;
  const sHaut = stims.filter(s => s.sortie === 15).at(-1).t, sBas = stims.filter(s => s.sortie === 5).at(-1).t;
  const saH = R(activations(j, site, sHaut + 1, sHaut + 400)[0] - sHaut), saB = R(activations(j, site, sBas + 1, sBas + 400)[0] - sBas);
  const extra = scenario === 'septale';
  affirmer(extra ? Math.abs(saB - saH) < 15 : saB - saH >= 40, `para-hisien ${scenario}`);
  const nomSite = extra ? 'l\'ostium du SC' : 'le His (A)';
  ajouter({
    difficulte: 8,
    question: `Stimulation para-hisienne en rythme sinusal : 15 mA (capture du His et du myocarde septal) puis 5 mA (myocarde seul, QRS élargi). L'intervalle stimulus-A mesuré sur ${nomSite}, site atrial le plus précoce, est de ${saH} ms à 15 mA et de ${saB} ms à 5 mA, avec la même séquence atriale. Quelle est la conclusion ?`,
    simu: simu(scenario, etapes, sBas + 600, { vitesse: 25, legende: '15 mA puis 5 mA' }),
    options: extra
      ? ['Conduction rétrograde exclusivement par le nœud AV', 'Conduction rétrograde extranodale : voie septale', 'Conduction rétrograde nodale et extranodale (fusion)', 'Absence de conduction rétrograde ventriculo-atriale']
      : ['Conduction rétrograde par le nœud AV seul', 'Conduction rétrograde extranodale : voie accessoire septale', 'Conduction rétrograde nodale et extranodale (fusion)', 'Absence de conduction rétrograde ventriculo-atriale'],
    reponses: [extra ? 1 : 0],
    commentaires: extra ? [
      'Faux : si l\'oreillette était activée par le nœud AV, perdre la capture du His allongerait le stimulus-A (l\'influx doit d\'abord rejoindre le His).',
      `Juste : le stimulus-A reste à ${saB} ms que le His soit capturé ou non : l'oreillette est activée par le myocarde ventriculaire, via une voie septale.`,
      'Faux : une fusion modifie la séquence ou le stimulus-A d\'un site à l\'autre ; ici tout est inchangé.',
      'Faux : chaque stimulation est suivie d\'une activation atriale, la conduction rétrograde existe.',
    ] : [
      `Juste : le stimulus-A s'allonge de ${saB - saH} ms à la perte de capture du His, avec la même séquence : l'influx doit rejoindre le His avant de remonter par le nœud AV.`,
      'Faux : une voie septale donnerait un stimulus-A inchangé au site de sortie, que le His soit capturé ou non.',
      'Faux : une fusion modifierait la séquence d\'activation atriale entre les deux sorties.',
      'Faux : chaque stimulation est suivie d\'une activation atriale, la conduction rétrograde existe.',
    ],
    explication: `La stimulation para-hisienne compare deux situations : sortie haute (His et myocarde capturés) et sortie basse (myocarde seul). Si la conduction rétrograde est nodale, la perte de capture du His allonge le stimulus-A d'autant que le temps nécessaire à l'influx pour rejoindre le His par le myocarde et les branches, sans changer la séquence. Si elle passe par une voie septale, le stimulus-A au site de sortie ne change pas, car l'oreillette est activée depuis le myocarde ventriculaire proche. ${extra ? `Ici il reste stable (${saH} puis ${saB} ms) : conduction extranodale.` : `Ici il passe de ${saH} à ${saB} ms : conduction nodale.`} Mesurez le stimulus-A à chaque site atrial, pas seulement au plus précoce, pour dépister une fusion.`,
    aRetenir: 'Para-hisien : stimulus-A allongé sans capture du His = conduction nodale ; inchangé au site de sortie = voie accessoire septale.',
    sources: [SRC.hirao, SRC.josephson],
  });
}

// 8. Entraînement du flutter depuis l'isthme cavo-tricuspide
{
  const ind = induction('flutter', 'cs9');
  const tcl = tachycardie(ind.r.coeur, ind.r.t).cycleA, cl = R(tcl - 20);
  const etapes = [...ind.etapes, { salve: { site: 'cti', cl, n: 12 } }, { attendre: 3100 }];
  const r = rejouer({ scenario: 'flutter', etapes });
  const a = analyserEntrainement(r.coeur, { der: r.marques.dernierStim, site: 'cti', tcl });
  affirmer(Math.abs(a.pptcl) < 30 && tachycardie(r.coeur, r.t).active, `flutter : isthme dans le circuit ${JSON.stringify(a)} ${tachycardie(r.coeur, r.t).active} ${tcl}`);
  ajouter({
    difficulte: 6,
    question: `Flutter atrial à cycle ${R(tcl)} ms, ondes F négatives en inférieur. Entraînement depuis l'isthme cavo-tricuspide (Halo 1-2) à ${cl} ms : le PPI mesuré sur le site de stimulation est de ${a.ppi} ms (tracé, montage Halo). Quelle est la conclusion ?`,
    simu: simu('flutter', etapes, r.marques.dernierStim + 1200, { vitesse: 50, montage: 'flutter' }),
    options: ['L\'isthme est hors du circuit : flutter non isthme-dépendant', 'L\'isthme est dans le circuit : flutter isthme-dépendant', 'Le flutter a été transformé en fibrillation atriale', 'Le PPI n\'est pas interprétable au niveau de l\'isthme'],
    reponses: [1],
    commentaires: [
      `Faux : un site hors du circuit donnerait un PPI nettement plus long que le cycle ; ici PPI − TCL = ${a.pptcl} ms.`,
      `Juste : PPI − TCL = ${a.pptcl} ms (< 20-30 ms) : l'isthme fait partie du circuit, cible de l'ablation.`,
      'Faux : le flutter reprend à l\'identique après l\'arrêt de l\'entraînement, sans activité désorganisée.',
      'Faux : le PPI se mesure justement sur l\'électrogramme du site stimulé, ici le dipôle de l\'isthme.',
    ],
    explication: `L'entraînement consiste à stimuler un peu plus vite que la tachycardie puis à mesurer le retour (PPI) sur le site stimulé. Si ce site est dans le circuit, l'influx fait un tour de circuit et revient au bout d'un cycle : PPI ≈ TCL (écart < 20-30 ms). Ici l'écart est de ${a.pptcl} ms : l'isthme cavo-tricuspide appartient au circuit, ce qui confirme un flutter typique isthme-dépendant. L'ablation de l'isthme, avec contrôle du bloc bidirectionnel, est le traitement de référence.`,
    aRetenir: 'PPI − TCL < 20-30 ms = site dans le circuit ; pour le flutter typique, l\'isthme cavo-tricuspide.',
    sources: [SRC.esc, SRC.josephson],
  });
}

// 9. Flutter péri-mitral : isthme hors circuit, SC dans le circuit
{
  const ind = (() => { try { return induction('flutter-mitral', 'cs1'); } catch { return induction('flutter-mitral', 'cs9'); } })();
  const tcl = tachycardie(ind.r.coeur, ind.r.t).cycleA, cl = R(tcl - 20);
  const mesurer = site => {
    const r = rejouer({ scenario: 'flutter-mitral', etapes: [...ind.etapes, { salve: { site, cl, n: 12 } }, { attendre: 3100 }] });
    return { r, a: analyserEntrainement(r.coeur, { der: r.marques.dernierStim, site, tcl }) };
  };
  const cti = mesurer('cti'), cs1 = mesurer('cs1');
  affirmer(cti.a.pptcl > 50 && Math.abs(cs1.a.pptcl) < 30, 'flutter péri-mitral');
  ajouter({
    difficulte: 8,
    question: `Tachycardie atriale régulière à ${R(tcl)} ms chez une patiente déjà traitée par isolation des veines pulmonaires. Entraînement à ${cl} ms : PPI − TCL = ${cti.a.pptcl} ms depuis l'isthme cavo-tricuspide, ${cs1.a.pptcl} ms depuis le SC distal (tracé : entraînement depuis l'isthme). Quel est le mécanisme le plus probable ?`,
    simu: simu('flutter-mitral', [...ind.etapes, { salve: { site: 'cti', cl, n: 12 } }, { attendre: 3100 }], cti.r.marques.dernierStim + 1200, { vitesse: 50, montage: 'flutter' }),
    options: ['Flutter typique dépendant de l\'isthme cavo-tricuspide', 'Tachycardie atriale focale de l\'oreillette droite', 'Macroréentrée péri-mitrale (flutter gauche)', 'Réentrée intranodale avec conduction atriale lente'],
    reponses: [2],
    commentaires: [
      `Faux : un flutter isthme-dépendant donnerait un PPI − TCL court depuis l'isthme ; ici ${cti.a.pptcl} ms.`,
      'Faux : une activité focale ne s\'entraîne pas avec un PPI ≈ TCL à distance du foyer, comme ici au SC distal.',
      'Juste : le SC (anneau mitral) est dans le circuit, l\'isthme cavo-tricuspide ne l\'est pas : réentrée autour de l\'anneau mitral.',
      'Faux : l\'activité atriale couvre tout le cycle, avec des sites dans le circuit loin du nœud AV : c\'est une macroréentrée atriale.',
    ],
    explication: `Après ablation de fibrillation atriale, les tachycardies atriales régulières sont souvent des macroréentrées gauches. L'entraînement localise le circuit : PPI − TCL court (< 20-30 ms) sur un site = site dans le circuit. Ici le SC distal (anneau mitral latéral) est dans le circuit (${cs1.a.pptcl} ms), l'isthme cavo-tricuspide ne l'est pas (${cti.a.pptcl} ms) : flutter péri-mitral. Le traitement est une ligne de l'isthme mitral avec contrôle du bloc, plus délicate que l'isthme cavo-tricuspide.`,
    aRetenir: 'Entraîner à plusieurs sites : SC dans le circuit et isthme cavo-tricuspide hors circuit → flutter péri-mitral.',
    sources: [SRC.esc, SRC.josephson],
  });
}

// 10. TRIN avec bloc 2:1 sous le His
{
  const { etapes, r } = induction('trin-21', 'hra');
  const t = tachycardie(r.coeur, r.t);
  affirmer(Math.abs(t.cycleV - 2 * t.cycleA) < 25, 'TRIN 2:1');
  ajouter({
    difficulte: 8,
    question: `Tachycardie avec un cycle atrial de ${R(t.cycleA)} ms et un cycle ventriculaire de ${R(t.cycleV)} ms. Sur le His, chaque A est suivi d'un H, mais un H sur deux n'est pas suivi de V (tracé). Que peut-on affirmer ?`,
    simu: simu('trin-21', etapes, r.t - 200, { vitesse: 50 }),
    options: ['Réentrée orthodromique avec un bloc AV fonctionnel 2:1', 'Tachycardie atriale avec bloc nodal 2:1', 'Flutter atrial conduit en 2:1 au nœud AV', 'Circuit qui ne passe pas par les ventricules'],
    reponses: [3],
    commentaires: [
      'Faux : une TRAV ne peut pas survivre à un bloc AV, puisque le ventricule fait partie de son circuit.',
      'Faux : dans une tachycardie atriale avec bloc nodal, les A non conduits ne sont pas suivis de H ; ici le bloc est sous le His.',
      'Faux : le flutter donne une activité atriale continue et un bloc au-dessus du His ; ici chaque A a son H, A et H quasi simultanés.',
      'Juste : le bloc sous le His prouve que les ventricules sont en dehors du circuit, ce qui exclut une TRAV ; c\'est ici une TRIN.',
    ],
    explication: `Le bloc 2:1 est situé sous le His : chaque A est suivi d'un H, mais un H sur deux ne conduit pas aux ventricules (période réfractaire du tissu de conduction plus longue que le cycle). La tachycardie continue malgré ce bloc : le ventricule n'appartient donc pas au circuit, ce qui exclut une réentrée orthodromique. Associé à des A et H quasi simultanés, cela signe une TRIN. Ce bloc fonctionnel disparaît souvent spontanément ou sous isoprénaline.`,
    aRetenir: 'Une tachycardie qui persiste avec un bloc AV (ou sous le His) exclut une TRAV.',
    sources: [SRC.josephson, SRC.esc],
  });
}

// 11. Signe de Coumel
{
  let ind = null;
  for (let s2 = 400; s2 >= 250 && !ind; s2 -= 10) {
    const etapes = [{ train: { site: 'hra', extras: [s2] } }, { attendre: 4000 }];
    const r = rejouer({ scenario: 'coumel', etapes });
    const v = activations(r.coeur.journal, 'vsep', r.t - 500, r.t).at(-1), rv = activations(r.coeur.journal, 'rva', r.t - 500, r.t).at(-1);
    if (tachycardie(r.coeur, r.t).active && v - rv > 30) ind = { etapes, r };
  }
  affirmer(ind, 'Coumel : induction avec bloc de branche gauche');
  const ref = induction('trav', 'hra');
  const va = mesures(ind.r.coeur, ind.r.t).VA, va0 = mesures(ref.r.coeur, ref.r.t).VA;
  const c1 = R(tachycardie(ind.r.coeur, ind.r.t).cycleV), c0 = R(tachycardie(ref.r.coeur, ref.r.t).cycleV);
  affirmer(va - va0 >= 30, 'Coumel : allongement du VA');
  ajouter({
    difficulte: 7,
    question: `Tachycardie orthodromique : avec un QRS de type retard gauche (tracé), le VA mesure ${va} ms et le cycle ${c1} ms ; quand le QRS redevient fin, le VA revient à ${va0} ms et le cycle à ${c0} ms. Quelle est la conclusion ?`,
    simu: simu('coumel', ind.etapes, ind.r.t - 200, { vitesse: 50 }),
    options: ['Voie accessoire droite, du côté opposé au bloc', 'Voie accessoire gauche, du même côté que le bloc', 'Réentrée intranodale avec aberration de conduction', 'Tachycardie ventriculaire fasciculaire'],
    reponses: [1],
    commentaires: [
      'Faux : un bloc de branche controlatéral à la voie ne modifie pas le VA.',
      `Juste : le bloc de branche gauche allonge le VA (+${va - va0} ms) et le cycle : la voie accessoire est du côté gauche et participe au circuit (signe de Coumel).`,
      'Faux : dans une TRIN, le ventricule est hors du circuit : un bloc de branche ne change ni le VA ni le cycle.',
      'Faux : la tachycardie a un aspect de TRAV (A après chaque V, VA fixe) et passe par le nœud AV.',
    ],
    explication: `En bloc de branche gauche fonctionnel, l'influx descend par la branche droite puis traverse le septum avant d'atteindre la paroi latérale du VG, où s'insère la voie accessoire. Le VA s'allonge (ici de ${va - va0} ms, ≥ 35 ms en pratique) et le cycle de la tachycardie aussi : c'est le signe de Coumel. Il prouve que la voie accessoire, homolatérale au bloc, fait partie du circuit. Un bloc de branche controlatéral ne modifie rien.`,
    aRetenir: 'Signe de Coumel : allongement du VA (≥ 35 ms) et du cycle en bloc de branche → voie accessoire homolatérale au bloc, participant au circuit.',
    sources: [{ titre: 'Coumel P, Attuel P. Reciprocating tachycardia in overt and latent preexcitation. Influence of functional bundle branch block on the rate of the tachycardia. Eur J Cardiol 1974;1:423-36', url: null }, SRC.josephson],
  });
}

// 12. Tachycardie ventriculaire
{
  const { etapes, r } = induction('tv', 'rva', 2);
  const nV = battementsV(r.coeur.journal, r.t - 3000, r.t).length, nA = activations(r.coeur.journal, 'hra', r.t - 3000, r.t).length;
  affirmer(nV > nA, 'TV : dissociation');
  ajouter({
    difficulte: 6,
    question: `Tachycardie à QRS larges induite par deux extrastimulus ventriculaires chez un patient aux antécédents d'infarctus. Quel élément du tracé signe l'origine ventriculaire ?`,
    simu: simu('tv', etapes, r.t - 200, { vitesse: 25 }),
    options: ['Le QRS large de type retard droit', 'La régularité du cycle ventriculaire', 'Des V plus nombreux que les A, dissociés', 'Un His précédant chaque V avec un HV normal'],
    reponses: [2],
    commentaires: [
      'Faux : une TSV avec bloc de branche ou préexcitation peut donner le même QRS large.',
      'Faux : la plupart des TSV sont aussi régulières.',
      `Juste : ${nV} V pour ${nA} A sur 3 s : les A sont dissociés ou conduits de façon rétrograde 2:1, les ventricules ne dépendent pas des oreillettes.`,
      'Faux : un His précédant chaque V avec un HV normal plaiderait pour une origine supraventriculaire ; ici le His n\'annonce pas les V.',
    ],
    explication: `Devant une tachycardie à QRS larges, la dissociation ventriculo-atriale (plus de V que d'A) signe l'origine ventriculaire. Sur les électrogrammes endocavitaires, on voit aussi que le His ne précède pas chaque V avec un HV normal. La morphologie du QRS et la régularité ne permettent pas de trancher. Chez un patient avec cicatrice d'infarctus, la TV monomorphe est le plus souvent une réentrée autour ou à travers la cicatrice, accessible à l'ablation guidée par la cartographie et l'entraînement.`,
    aRetenir: 'Plus de V que d\'A (dissociation VA) = tachycardie ventriculaire ; le QRS large seul ne suffit pas.',
    sources: [SRC.esvTV, SRC.stevenson],
  });
}

// 13. Point de Wenckebach nodal
{
  let pointW = null, detail = null;
  for (let cl = 500; cl >= 250 && !pointW; cl -= 10) {
    const r = rejouer({ scenario: 'normal', etapes: [{ salve: { site: 'hra', cl, n: 12 } }, { attendre: 800 }] });
    const d = r.marques.dernierStim, t0 = d - 11 * cl;
    const A = activations(r.coeur.journal, 'ras', t0 - 5, d + 60), H = activations(r.coeur.journal, 'his', t0, d + 400);
    const ah = A.map(a => { const h = H.find(h => h > a && h - a < 300); return h ? R(h - a) : null; });
    if (ah.includes(null)) { pointW = cl; detail = { r, ah: ah.slice(0, ah.indexOf(null) + 1) }; }
  }
  affirmer(pointW, 'point de Wenckebach');
  const suite = detail.ah.filter(Boolean);
  ajouter({
    difficulte: 4,
    question: `Stimulation atriale à cycle fixe de ${pointW} ms (OD haute). L'AH passe de ${suite[0]} à ${suite.at(-1)} ms en quelques battements, puis une activation atriale n'est pas suivie de H (tracé). Quelle est l'interprétation ?`,
    simu: simu('normal', [{ salve: { site: 'hra', cl: pointW, n: 12 } }, { attendre: 800 }], detail.r.marques.dernierStim + 600, { vitesse: 50 }),
    options: ['Bloc AV du deuxième degré infra-hisien', 'Point de Wenckebach nodal physiologique', 'Période réfractaire effective de l\'oreillette', 'Bloc AV de haut degré, indication de stimulation'],
    reponses: [1],
    commentaires: [
      'Faux : le bloc se fait entre A et H (au-dessus du His), après allongement progressif de l\'AH ; un bloc infra-hisien bloquerait après un H.',
      `Juste : allongement progressif de l'AH puis A non suivi de H à ${pointW} ms : périodicité de Wenckebach nodale, normale à ce cycle.`,
      'Faux : l\'oreillette est capturée à chaque stimulus ; c\'est la conduction nodale qui bloque.',
      'Faux : un Wenckebach nodal en stimulation atriale rapide est physiologique et n\'indique pas de stimulateur.',
    ],
    explication: `La stimulation atriale incrémentale explore la capacité de conduction du nœud AV. Le point de Wenckebach est le cycle le plus long auquel apparaît une périodicité de Wenckebach : allongement progressif de l'AH puis blocage d'une onde A au-dessus du His. Chez l'adulte, il se situe habituellement entre 300 et 500 ms ; il raccourcit sous isoprénaline ou atropine. Un bloc apparaissant sous le His (après un H) serait en revanche pathologique.`,
    aRetenir: 'Wenckebach nodal en stimulation atriale rapide = physiologique ; un bloc sous le His ne l\'est pas.',
    sources: [SRC.josephson],
  });
}

// 14. Temps de récupération sinusale
{
  const r = rejouer({ scenario: 'normal', etapes: [{ attendre: 4000 }, { marque: 'base' }, { salve: { site: 'hra', cl: 400, n: 75 } }, { attendre: 3500 }] });
  const cs = R(mesures(rejouer({ scenario: 'normal', etapes: [{ attendre: 4000 }] }).coeur).cycleA);
  const d = r.marques.dernierStim, retour = r.coeur.journal.find(x => x.s === 'hra' && x.t > d + 5 && x.o !== 'stim');
  const trs = R(retour.t - d), trsc = trs - cs;
  affirmer(trs < 1500 && trsc < 525, 'TRS normal');
  ajouter({
    difficulte: 4,
    question: `Cycle sinusal de base ${cs} ms. Après 30 s de stimulation atriale à 400 ms, la première activation sinusale survient ${trs} ms après le dernier stimulus (tracé). Quelle est la conclusion ?`,
    simu: simu('normal', [{ attendre: 4000 }, { salve: { site: 'hra', cl: 400, n: 75 } }, { attendre: 3500 }], d + 2400, { vitesse: 25 }),
    options: ['Dysfonction sinusale : TRS corrigé allongé', 'Récupération sinusale normale', 'Mesure ininterprétable faute de pause sinusale', 'Dysfonction sinusale : TRS supérieur à 1500 ms'],
    reponses: [1],
    commentaires: [
      `Faux : le TRS corrigé vaut ${trs} − ${cs} = ${trsc} ms, sous le seuil de 525 ms.`,
      `Juste : TRS ${trs} ms (< 1500 ms) et TRS corrigé ${trsc} ms (< 525 ms) : récupération sinusale normale.`,
      'Faux : la mesure se fait du dernier stimulus à la première activation sinusale spontanée, qui est ici bien visible.',
      `Faux : le TRS vaut ${trs} ms, en dessous de 1500 ms.`,
    ],
    explication: `Le temps de récupération sinusale (TRS) se mesure après une stimulation atriale rapide (30 à 60 s), du dernier stimulus à la première activation sinusale spontanée. On le corrige en soustrayant le cycle sinusal de base (TRSc). Valeurs habituelles : TRS < 1500 ms et TRSc < 525 ms. Un TRS allongé ou des pauses secondaires orientent vers une dysfonction sinusale ; la sensibilité du test reste modeste, et la décision de stimulation repose avant tout sur la corrélation symptômes-bradycardie.`,
    aRetenir: 'TRS < 1500 ms et TRS corrigé < 525 ms = récupération sinusale normale.',
    sources: [SRC.josephson],
  });
}

// 15. PJRT
{
  const r0 = rejouer({ scenario: 'pjrt', etapes: [{ attendre: 8000 }] });
  const tcl = tachycardie(r0.coeur, r0.t).cycleV;
  affirmer(tachycardie(r0.coeur, r0.t).active, 'PJRT incessante');
  const h = activations(r0.coeur.journal, 'his', r0.t - 900, r0.t).at(-1);
  let cible = h + tcl - 30; while (cible < r0.t + 60) cible += tcl;
  const etapes = [{ attendre: 8000 }, { stim: { site: 'rva', delai: R(cible - r0.t) } }, { attendre: 3100 }];
  const r = rejouer({ scenario: 'pjrt', etapes });
  const av = analyserESV(r.coeur, r.marques.dernierStim, tcl);
  const arret = !tachycardie(r.coeur, r.t).active;
  affirmer(av < -5 || av > 5 || arret, `PJRT : effet de l'ESV (${av})`);
  const effet = arret ? 'arrête la tachycardie' : av < 0 ? `retarde l'A suivant de ${-av} ms` : `avance l'A suivant de ${av} ms`;
  ajouter({
    difficulte: 8,
    question: `Garçon de 14 ans, cardiomyopathie dilatée. Tachycardie incessante à ${R(tcl)} ms, RP long, activation atriale la plus précoce à l'ostium du SC (tracé). Une ESV His-réfractaire ${effet}. Quel est le diagnostic ?`,
    simu: simu('pjrt', [{ attendre: 8000 }], r0.t - 200, { vitesse: 50 }),
    options: ['Réentrée intranodale atypique (rapide-lente)', 'Tachycardie atriale focale basse, près du SC', 'Tachycardie réciprocante permanente (PJRT)', 'Réentrée intranodale typique (lente-rapide)'],
    reponses: [2],
    commentaires: [
      'Faux : la TRIN atypique a le même aspect, mais une ESV His-réfractaire ne peut pas atteindre son circuit, intranodal.',
      'Faux : une ESV His-réfractaire ne peut atteindre un foyer atrial que par une voie accessoire ; son effet ici prouve une voie participante.',
      `Juste : tachycardie incessante à RP long, voie postéro-septale lente et décrémentielle : l'ESV His-réfractaire ${effet}, preuve de la participation de la voie.`,
      'Faux : la TRIN typique a un RP très court, A et V quasi simultanés.',
    ],
    explication: `La tachycardie jonctionnelle réciprocante permanente (maladie de Coumel) est une réentrée orthodromique utilisant une voie accessoire postéro-septale à conduction rétrograde lente et décrémentielle. Elle est incessante, à RP long, avec des P négatives en inférieur et une activation la plus précoce à l'ostium du SC. Le diagnostic différentiel est la TRIN atypique et la TA basse. L'ESV His-réfractaire tranche : si elle retarde ou avance l'atrium, ou arrête la tachycardie sans l'atteindre, la voie accessoire participe au circuit. Son caractère incessant expose à la cardiomyopathie rythmique, réversible après ablation.`,
    aRetenir: 'Tachycardie incessante à RP long, sortie à l\'ostium du SC, modifiée par une ESV His-réfractaire : PJRT (voie décrémentielle postéro-septale).',
    sources: [SRC.esc, SRC.josephson],
  });
}

// 16. Mahaim
{
  const { etapes, r } = (() => { try { return induction('mahaim', 'hra'); } catch { return induction('mahaim', 'hra', 2); } })();
  const v2 = activations(r.coeur.journal, 'vsep', r.t - 900, r.t).at(-1), r2 = activations(r.coeur.journal, 'rva', r.t - 900, r.t).filter(x => x < v2).at(-1);
  affirmer(r2 != null && v2 - r2 > 20, 'Mahaim : activation ventriculaire débutant au VD');
  ajouter({
    difficulte: 8,
    question: `Femme de 22 ans. Un extrastimulus atrial induit une tachycardie régulière à QRS larges de type retard gauche, cycle ${R(tachycardie(r.coeur, r.t).cycleV)} ms. Le VD apical est activé en premier, le His juste après le début du QRS, et chaque V est suivi d'un A (tracé). Quel est le diagnostic le plus probable ?`,
    simu: simu('mahaim', etapes, r.t - 200, { vitesse: 50 }),
    options: ['Antidromique sur voie atrio-fasciculaire', 'Tachycardie ventriculaire fasciculaire gauche', 'TRIN typique avec bloc de branche gauche', 'Antidromique sur voie latérale gauche manifeste'],
    reponses: [0],
    commentaires: [
      'Juste : descente par une voie atrio-fasciculaire (anneau tricuspide latéral vers la branche droite), remontée par la branche droite, le His et le nœud AV.',
      'Faux : une TV fasciculaire a un aspect de retard droit et n\'est pas induite ni entretenue par l\'oreillette avec un A après chaque V.',
      'Faux : en bloc de branche gauche, le His précède le V avec un HV normal ; ici le V débute avant le His.',
      'Faux : une voie latérale gauche préexciterait la paroi latérale du VG, avec un aspect de retard droit en V1.',
    ],
    explication: `Les fibres de Mahaim sont le plus souvent des voies atrio-fasciculaires : elles naissent de l'anneau tricuspide latéral et s'insèrent dans la branche droite près de l'apex. Elles conduisent seulement dans le sens antérograde, de façon décrémentielle. La tachycardie typique est antidromique : QRS large de type retard gauche, ventricule droit apical activé en premier, His activé de façon rétrograde juste après le début du QRS. En rythme sinusal, la préexcitation est minime ou absente. L'ablation se fait au site du potentiel de Mahaim sur l'anneau tricuspide.`,
    aRetenir: 'Tachycardie à QRS larges de type retard gauche, VD apical en premier, His rétrograde après le V : voie atrio-fasciculaire (Mahaim).',
    sources: [SRC.esc, SRC.josephson],
  });
}

// 17. FA préexcitée
{
  const etapes = [{ attendre: 2000 }, { salve: { site: 'hra', cl: 200, n: 12 } }, { attendre: 6000 }];
  const r = rejouer({ scenario: 'wpw', etapes });
  affirmer(r.coeur.fa, 'FA préexcitée induite');
  const pre = battementsV(r.coeur.journal, r.t - 5000, r.t).filter(v => { const l = activations(r.coeur.journal, 'lvl', v - 5, v + 150)[0], s = activations(r.coeur.journal, 'vsep', v - 5, v + 150)[0]; return l != null && s != null && s - l > 15; });
  const rr = pre.slice(1).map((v, i) => v - pre[i]).filter(x => x < 900);
  affirmer(rr.length >= 2, 'RR préexcités mesurables');
  const sperri = R(Math.min(...rr));
  const haut = sperri <= 250;
  ajouter({
    difficulte: 7,
    question: `Voie accessoire latérale gauche manifeste. Une salve atriale rapide déclenche une fibrillation atriale préexcitée (tracé, 25 mm/s). Le plus court intervalle RR entre deux QRS préexcités mesure ${sperri} ms. Comment interpréter cette valeur ?`,
    simu: simu('wpw', etapes, r.t - 200, { vitesse: 25 }),
    options: haut
      ? ['Voie à haut risque de mort subite (RR ≤ 250 ms)', 'Voie à faible risque, aucune ablation à discuter', 'Mesure non valide en fibrillation atriale', 'Voie à conduction exclusivement rétrograde']
      : ['Voie à haut risque de mort subite (RR ≤ 250 ms)', 'Voie à moindre risque ; l\'ablation reste à discuter', 'Mesure non valide en fibrillation atriale', 'Voie à conduction exclusivement rétrograde'],
    reponses: [haut ? 0 : 1],
    commentaires: haut ? [
      `Juste : RR préexcité le plus court ${sperri} ms (≤ 250 ms) : voie à conduction antérograde rapide, risque de FA conduite très vite et de fibrillation ventriculaire ; ablation recommandée.`,
      'Faux : un RR préexcité ≤ 250 ms est justement un marqueur de haut risque.',
      'Faux : le plus court RR préexcité en FA est la mesure de référence du risque.',
      'Faux : la voie conduit dans le sens antérograde, puisque les QRS sont préexcités.',
    ] : [
      `Faux : le plus court RR préexcité mesure ${sperri} ms, au-dessus du seuil de 250 ms.`,
      `Juste : ${sperri} ms (> 250 ms) est un critère de voie à moindre risque ; l'ablation reste raisonnable chez un patient symptomatique ou selon le contexte.`,
      'Faux : le plus court RR préexcité en FA est justement la mesure de référence du risque.',
      'Faux : la voie conduit dans le sens antérograde, puisque les QRS sont préexcités.',
    ],
    explication: `Chez un patient porteur d'une voie accessoire manifeste, la fibrillation atriale peut être conduite très rapidement aux ventricules par la voie, jusqu'à la fibrillation ventriculaire. Le plus court intervalle RR entre deux QRS préexcités (SPERRI) en FA spontanée ou induite évalue ce risque : ≤ 250 ms signe une voie à haut risque. Le tracé montre des QRS larges, préexcités, irréguliers, parfois fusionnés avec des QRS fins. Selon les recommandations ESC 2019, l'ablation est recommandée chez les patients à haut risque et raisonnable chez la plupart des patients symptomatiques.`,
    aRetenir: 'FA préexcitée : RR préexcité le plus court ≤ 250 ms = voie à haut risque.',
    sources: [SRC.esc],
  });
}

// ---------- écriture ----------
const json = JSON.stringify(questions, null, 2) + '\n';
if (verif) {
  const actuel = fs.existsSync(sortie) ? fs.readFileSync(sortie, 'utf8') : '';
  if (actuel !== json) { console.error('✗ data/questions/simulateur-traces.json ne correspond plus au moteur : relancez node scripts/gen-questions-simu.mjs'); process.exit(1); }
  console.log(`✓ ${questions.length} questions de tracés du simulateur conformes au moteur.`);
} else {
  fs.writeFileSync(sortie, json);
  console.log(`${questions.length} questions écrites dans ${path.relative(process.cwd(), sortie)}`);
}
