// Génère les questions « tracé du simulateur d'électrophysiologie » : node scripts/gen-questions-simu.mjs [--verifier]
// Chaque question rejoue un protocole (scénario, graine, étapes) avec le moteur du simulateur ; les valeurs citées
// (intervalles, PPI, réponse à l'entraînement…) sont mesurées sur ce rejeu et les réponses attendues sont vérifiées.
// Écrit aussi la surcouche anglaise data/questions/en/simulateur-traces.json (textes rédigés ici, à côté du français).
// --verifier : échoue si les fichiers committés (français et anglais) ne correspondent plus au moteur (à lancer en CI après toute modification du moteur).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rejouer } from '../js/simu/rejeu.js';
import { tachycardie, mesures, battementsV, activations, sitePlusPrecoce, analyserEntrainement, analyserESV } from '../js/simu/analyse.js';
import { textes } from './i18n.mjs';

const sortie = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'questions', 'simulateur-traces.json');
const sortieEn = path.join(path.dirname(sortie), 'en', 'simulateur-traces.json'); // surcouche anglaise (format de scripts/i18n.mjs)
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

// Chaque question porte sa version anglaise (en : mêmes champs de texte, mêmes valeurs mesurées), écrite dans la surcouche.
const questions = [], anglais = {};
let num = 0;
function ajouter({ en, ...q }) {
  num++;
  const id = `simu-${String(num).padStart(3, '0')}`;
  affirmer(en, `${id} : version anglaise manquante`);
  anglais[id] = en;
  questions.push({ id, theme: 'electrophysio', sousTheme: 'Lecture de tracés d\'EEP (simulateur)', marque: null, type: 'qcu',
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
    en: {
      question: `Atrial extrastimulus testing from the high RA (8 × S1 600 ms). At S2 = ${prec.s2} ms, the AH interval was ${prec.ah} ms. The tracing shows S2 = ${s2} ms: the AH interval is ${ah} ms. What is the interpretation?`,
      options: ['Usual AV nodal decrement, of no particular significance', 'Jump from fast to slow pathway conduction', 'Functional right bundle branch aberration', 'Anterograde conduction over a slow accessory pathway'],
      commentaires: [
        `Incorrect: physiological decrement is gradual; a ${ah - prec.ah} ms prolongation for a 10 ms decrement in coupling interval is a jump.`,
        'Correct: the fast pathway is refractory at this coupling interval and the impulse conducts over the slow pathway: an AH jump ≥ 50 ms for a 10 ms decrement defines dual AV nodal physiology.',
        'Incorrect: aberration affects the QRS (and the HV), not the AH interval; here the jump is above the His.',
        'Incorrect: an anterograde accessory pathway pre-excites the ventricle (short HV); here the His normally precedes the V.',
      ],
      explication: `Atrial extrastimulus testing explores the AV nodal conduction curve: as S2 shortens, the AH gradually lengthens (decrement). Here the AH abruptly increases from ${prec.ah} to ${ah} ms for a 10 ms shorter coupling interval: the fast pathway has reached its effective refractory period and conduction switches to the slow pathway. This defines dual AV nodal physiology (jump ≥ 50 ms for 10 ms). This physiology is common and warrants treatment only if AVNRT is inducible or documented.`,
      aRetenir: 'AH jump ≥ 50 ms for a 10 ms decrement in coupling interval = dual AV nodal physiology; not in itself an indication for ablation.',
      legende: `S2 = ${s2} ms`,
    },
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
      'Faux : un foyer gauche donne une activation excentrique et une relation VA variable, l\'A ne dépendant pas du V.',
      'Faux : la forme atypique a un RP long et une activation la plus précoce à l\'ostium du SC.',
    ],
    explication: `Le tracé montre une tachycardie régulière où chaque A tombe dans le V (VA ${m.VA} ms mesuré sur le His) avec une activation concentrique : His d'abord, puis SC proximal vers distal. Un VA < 70 ms élimine pratiquement une réentrée orthodromique, car l'influx doit traverser le ventricule avant de remonter par la voie accessoire. Le saut d'AH à l'induction oriente vers une descente par la voie lente. Ces éléments sont en faveur d'une TRIN typique, à confirmer par les manœuvres (entraînement ventriculaire, ESV His-réfractaire).`,
    aRetenir: 'VA < 70 ms avec activation concentrique la plus précoce au His : TRIN typique ; la TRAV est pratiquement exclue.',
    sources: [SRC.esc, SRC.josephson],
    en: {
      question: `An atrial extrastimulus (S2 = ${s2} ms) induces a narrow-QRS tachycardia, cycle length ${R(t.cycleV)} ms. Read the activation sequence on the tracing (His d, CS 9-10 to 1-2). What is the most likely diagnosis?`,
      options: ['Typical (slow–fast) AVNRT', 'Orthodromic AVRT over a left lateral pathway', 'Focal left atrial tachycardia', 'Atypical (fast–slow) AVNRT'],
      commentaires: [
        `Correct: A and V almost simultaneous (VA ${m.VA} ms, < 70 ms), concentric retrograde atrial activation, earliest at the His.`,
        'Incorrect: a left lateral pathway activates the distal CS first (eccentric activation), with a VA > 70 ms.',
        'Incorrect: a left-sided focus gives eccentric activation and a variable VA relationship, as the A does not depend on the V.',
        'Incorrect: the atypical form has a long RP and earliest activation at the CS ostium.',
      ],
      explication: `The tracing shows a regular tachycardia in which each A falls within the V (VA ${m.VA} ms measured on the His catheter) with concentric activation: His first, then CS from proximal to distal. A VA < 70 ms virtually excludes orthodromic re-entry, because the impulse must traverse the ventricle before returning over the accessory pathway. The AH jump at induction points to anterograde conduction over the slow pathway. These findings favour typical AVNRT, to be confirmed by pacing manoeuvres (ventricular entrainment, His-refractory PVC).`,
      aRetenir: 'VA < 70 ms with concentric activation earliest at the His: typical AVNRT; AVRT is virtually excluded.',
    },
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
      `Juste : réponse V-A-V et PPI − TCL = ${a.ppi} − ${R(tcl)} = ${a.pptcl} ms > 115 ms : l'apex du VD est éloigné du circuit.`,
      'Faux : l\'absence de fusion du QRS n\'empêche pas d\'interpréter la réponse ni le PPI ; elle est même attendue dans la TRIN.',
    ],
    explication: `À l'arrêt de l'entraînement, le dernier A entraîné est suivi d'un V (réponse V-A-V) : la tachycardie utilise le nœud AV, ce qui élimine une tachycardie atriale. Le PPI mesuré sur le site de stimulation (${a.ppi} ms) dépasse le cycle de ${a.pptcl} ms : l'apex du VD est éloigné du circuit. Un PPI − TCL > 115 ms (et un SA − VA > 85 ms) est en faveur d'une TRIN ; une valeur < 115 ms oriente vers une réentrée utilisant une voie accessoire septale (Michaud). Mesurez toujours le PPI sur l'électrogramme du site stimulé.`,
    aRetenir: 'Entraînement VD : V-A-V + PPI − TCL > 115 ms → TRIN ; < 115 ms → TRAV (voie septale).',
    sources: [SRC.michaud, SRC.knight, SRC.esc],
    en: {
      question: `Narrow-QRS tachycardia, cycle length ${R(tcl)} ms. Entrainment from the RV apex at ${cl} ms, with 1:1 retrograde conduction, then pacing is stopped (tracing). The PPI measured on the RV catheter is ${a.ppi} ms. What is the conclusion?`,
      options: ['V-A-A-V response: atrial tachycardia', 'V-A-V response, PPI − TCL < 115 ms: re-entry over a septal pathway', `V-A-V response, PPI − TCL of ${a.pptcl} ms: AV nodal re-entry`, 'Uninterpretable manoeuvre without QRS fusion'],
      commentaires: [
        'Incorrect: the last entrained A is followed by a V, not by a second A: the response is V-A-V.',
        `Incorrect: PPI − TCL = ${a.pptcl} ms, above 115 ms: the RV apex is far from the circuit, which points to AVNRT.`,
        `Correct: V-A-V response and PPI − TCL = ${a.ppi} − ${R(tcl)} = ${a.pptcl} ms > 115 ms: the RV apex is remote from the circuit.`,
        'Incorrect: absence of QRS fusion does not prevent interpretation of the response or the PPI; it is even expected in AVNRT.',
      ],
      explication: `On cessation of entrainment, the last entrained A is followed by a V (V-A-V response): the tachycardia involves the AV node, which excludes atrial tachycardia. The PPI measured at the pacing site (${a.ppi} ms) exceeds the tachycardia cycle length by ${a.pptcl} ms: the RV apex is remote from the circuit. A PPI − TCL > 115 ms (and an SA − VA > 85 ms) favours AVNRT; a value < 115 ms points to re-entry over a septal accessory pathway (Michaud). Always measure the PPI on the electrogram of the pacing site.`,
      aRetenir: 'RV entrainment: V-A-V + PPI − TCL > 115 ms → AVNRT; < 115 ms → AVRT (septal pathway).',
    },
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
    en: {
      question: `Narrow-QRS tachycardia, cycle length ${R(tcl)} ms, induced by an atrial burst. Ventricular entrainment at ${cl} ms with 1:1 retrograde conduction, then pacing is stopped (tracing). What response is observed, and what do you conclude?`,
      options: ['V-A-V: re-entry involving the AV node', 'V-A-A-V: atrial tachycardia', 'V-A-V: re-entry over an accessory pathway', 'Pseudo-V-A-A-V: atypical AVNRT'],
      commentaires: [
        'Incorrect: after the last entrained A, the next activation is an A, not a V.',
        'Correct: the last entrained A is followed by a second A before any V: the atrial focus resumes independently of the ventricle.',
        'Incorrect: AVRT would again give a V after the last entrained A, since that V is part of the circuit.',
        'Incorrect: pseudo-V-A-A-V occurs when the VA is very long; here the last entrained A is clearly identified just after the last stimulus.',
      ],
      explication: `On cessation of ventricular entrainment with 1:1 retrograde conduction, identify the last entrained A, then the next activation. Here A is followed by A before the next V: a V-A-A-V response, diagnostic of atrial tachycardia (Knight 1999). In AVNRT or AVRT, the circuit involves the ventricle and the last entrained A is followed by a V (V-A-V). Pitfall: when the VA is long (atypical AVNRT, decremental pathway), the last entrained A may be mistaken for a spontaneous A (pseudo-V-A-A-V).`,
      aRetenir: 'Cessation of ventricular entrainment: V-A-A-V = atrial tachycardia; V-A-V = circuit involving the AV node or an accessory pathway.',
    },
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
    question: `Tachycardie orthodromique (cycle ${R(tcl)} ms, SC distal activé en premier). Une ESV est délivrée à l'apex du VD 30 ms avant le His attendu, quand le His est réfractaire : le His suivant n'est pas modifié (tracé). L'A suivant est avancé de ${av} ms avec la même séquence. Que prouve cette réponse ?`,
    simu: simu('trav', etapes, r.marques.dernierStim + 900, { vitesse: 50 }),
    options: ['L\'existence d\'une voie accessoire à conduction rétrograde', 'Une conduction rétrograde par la voie rapide du nœud AV intact', 'Une réentrée intranodale avec une voie finale commune basse', 'Une réinitialisation d\'un foyer atrial gauche par l\'ESV'],
    reponses: [0],
    commentaires: [
      'Juste : le His étant réfractaire, l\'influx ne peut atteindre l\'oreillette qu\'en court-circuitant le nœud AV, donc par une voie accessoire.',
      'Faux : pour remonter par le nœud AV, l\'influx doit passer par le His, qui est ici réfractaire.',
      'Faux : dans une TRIN, une ESV His-réfractaire n\'atteint pas le circuit nodal et ne modifie pas l\'atrium.',
      'Faux : pour réinitialiser un foyer atrial, l\'ESV devrait atteindre l\'oreillette, ce qui impose déjà une voie extranodale quand le His est réfractaire.',
    ],
    explication: `Une ESV délivrée quand le His est réfractaire (au moment ou juste avant le His attendu) ne peut pas remonter par le système His-nœud AV. Si l'A suivant est avancé avec la même séquence d'activation, l'influx est passé par une voie accessoire : c'est la preuve de son existence. Elle participe au circuit si l'ESV retarde l'atrium ou arrête la tachycardie sans l'atteindre. À l'inverse, l'absence d'avance n'exclut pas une voie éloignée du site de stimulation, comme une voie latérale gauche stimulée depuis l'apex du VD.`,
    aRetenir: 'ESV His-réfractaire qui avance l\'atrium avec la même séquence = voie accessoire ; qui arrête la tachycardie sans atteindre l\'atrium = voie participante.',
    sources: [SRC.josephson, SRC.knight],
    en: {
      question: `Orthodromic tachycardia (cycle length ${R(tcl)} ms, distal CS activated first). A PVC is delivered at the RV apex 30 ms before the expected His, when the His is refractory: the next His is not affected (tracing). The next A is advanced by ${av} ms with the same sequence. What does this response prove?`,
      options: ['The presence of an accessory pathway with retrograde conduction', 'Retrograde conduction over the fast pathway of an intact AV node', 'AV nodal re-entry with a lower final common pathway', 'Resetting of a left atrial focus by the PVC'],
      commentaires: [
        'Correct: as the His is refractory, the impulse can reach the atrium only by bypassing the AV node, i.e. over an accessory pathway.',
        'Incorrect: to conduct retrogradely over the AV node, the impulse must pass through the His, which is refractory here.',
        'Incorrect: in AVNRT, a His-refractory PVC does not reach the nodal circuit and does not affect the atrium.',
        'Incorrect: to reset an atrial focus, the PVC would have to reach the atrium, which already requires an extranodal pathway when the His is refractory.',
      ],
      explication: `A PVC delivered when the His is refractory (at the time of, or just before, the expected His) cannot conduct retrogradely through the His–AV node axis. If the next A is advanced with the same activation sequence, the impulse has travelled over an accessory pathway: this proves its presence. The pathway participates in the circuit if the PVC delays the atrium or terminates the tachycardia without reaching it. Conversely, absence of advancement does not exclude a pathway remote from the pacing site, such as a left lateral pathway paced from the RV apex.`,
      aRetenir: 'His-refractory PVC that advances the atrium with the same sequence = accessory pathway; one that terminates the tachycardia without reaching the atrium = participating pathway.',
    },
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
    en: {
      question: `Para-Hisian pacing in sinus rhythm: 15 mA (His and septal myocardial capture), then 5 mA (myocardium only, wider QRS). The stimulus-to-A interval measured at ${extra ? 'the CS ostium' : 'the His (A)'}, the earliest atrial site, is ${saH} ms at 15 mA and ${saB} ms at 5 mA, with the same atrial sequence. What is the conclusion?`,
      options: extra
        ? ['Retrograde conduction exclusively over the AV node', 'Extranodal retrograde conduction: septal pathway', 'Both nodal and extranodal retrograde conduction (fusion)', 'No ventriculoatrial retrograde conduction']
        : ['Retrograde conduction over the AV node only', 'Extranodal retrograde conduction: septal accessory pathway', 'Both nodal and extranodal retrograde conduction (fusion)', 'No ventriculoatrial retrograde conduction'],
      commentaires: extra ? [
        'Incorrect: if the atrium were activated via the AV node, loss of His capture would lengthen the stimulus-to-A interval (the impulse must first reach the His).',
        `Correct: the stimulus-to-A interval remains ${saB} ms whether or not the His is captured: the atrium is activated from the ventricular myocardium via a septal pathway.`,
        'Incorrect: fusion would change the sequence or the stimulus-to-A interval from one site to another; here everything is unchanged.',
        'Incorrect: every paced beat is followed by atrial activation, so retrograde conduction is present.',
      ] : [
        `Correct: the stimulus-to-A interval lengthens by ${saB - saH} ms with loss of His capture, with the same sequence: the impulse must reach the His before conducting retrogradely over the AV node.`,
        'Incorrect: a septal pathway would give an unchanged stimulus-to-A interval at the exit site, whether or not the His is captured.',
        'Incorrect: fusion would change the atrial activation sequence between the two outputs.',
        'Incorrect: every paced beat is followed by atrial activation, so retrograde conduction is present.',
      ],
      explication: `Para-Hisian pacing compares two situations: high output (His and myocardium captured) and low output (myocardium only). If retrograde conduction is nodal, loss of His capture lengthens the stimulus-to-A interval by the time the impulse takes to reach the His through the myocardium and bundle branches, without changing the sequence. If it is over a septal pathway, the stimulus-to-A interval at the exit site does not change, because the atrium is activated from the adjacent ventricular myocardium. ${extra ? `Here it remains stable (${saH}, then ${saB} ms): extranodal conduction.` : `Here it increases from ${saH} to ${saB} ms: nodal conduction.`} Measure the stimulus-to-A interval at every atrial site, not only the earliest, to detect fusion.`,
      aRetenir: 'Para-Hisian pacing: stimulus-to-A prolonged without His capture = nodal conduction; unchanged at the exit site = septal accessory pathway.',
      legende: '15 mA, then 5 mA',
    },
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
    en: {
      question: `Atrial flutter with a cycle length of ${R(tcl)} ms and negative F waves in the inferior leads. Entrainment from the cavotricuspid isthmus (Halo 1-2) at ${cl} ms: the PPI measured at the pacing site is ${a.ppi} ms (tracing, Halo montage). What is the conclusion?`,
      options: ['The isthmus is outside the circuit: non-isthmus-dependent flutter', 'The isthmus is within the circuit: isthmus-dependent flutter', 'The flutter has degenerated into atrial fibrillation', 'The PPI cannot be interpreted at the isthmus'],
      commentaires: [
        `Incorrect: a site outside the circuit would give a PPI clearly longer than the cycle length; here PPI − TCL = ${a.pptcl} ms.`,
        `Correct: PPI − TCL = ${a.pptcl} ms (< 20-30 ms): the isthmus is part of the circuit and is the ablation target.`,
        'Incorrect: the flutter resumes unchanged after entrainment is stopped, with no disorganised activity.',
        'Incorrect: the PPI is precisely measured on the electrogram of the pacing site, here the isthmus bipole.',
      ],
      explication: `Entrainment consists of pacing slightly faster than the tachycardia and then measuring the return cycle (PPI) at the pacing site. If this site is within the circuit, the impulse travels once around the circuit and returns after one cycle length: PPI ≈ TCL (difference < 20-30 ms). Here the difference is ${a.pptcl} ms: the cavotricuspid isthmus is part of the circuit, confirming typical isthmus-dependent flutter. Isthmus ablation, with confirmation of bidirectional block, is the reference treatment.`,
      aRetenir: 'PPI − TCL < 20-30 ms = site within the circuit; for typical flutter, the cavotricuspid isthmus.',
    },
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
    question: `Tachycardie atriale régulière de cycle ${R(tcl)} ms chez une patiente déjà traitée par isolation des veines pulmonaires. Entraînement à ${cl} ms : PPI − TCL = ${cti.a.pptcl} ms depuis l'isthme cavo-tricuspide, ${cs1.a.pptcl} ms depuis le SC distal (tracé : entraînement depuis l'isthme). Quel est le mécanisme le plus probable ?`,
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
    en: {
      question: `Regular atrial tachycardia with a cycle length of ${R(tcl)} ms in a woman who has previously undergone pulmonary vein isolation. Entrainment at ${cl} ms: PPI − TCL = ${cti.a.pptcl} ms from the cavotricuspid isthmus and ${cs1.a.pptcl} ms from the distal CS (tracing: entrainment from the isthmus). What is the most likely mechanism?`,
      options: ['Typical cavotricuspid isthmus-dependent flutter', 'Focal atrial tachycardia from the right atrium', 'Perimitral macro-re-entry (left atrial flutter)', 'AV nodal re-entry with slow atrial conduction'],
      commentaires: [
        `Incorrect: isthmus-dependent flutter would give a short PPI − TCL from the isthmus; here it is ${cti.a.pptcl} ms.`,
        'Incorrect: focal activity cannot be entrained with a PPI ≈ TCL at a distance from the focus, as seen here at the distal CS.',
        'Correct: the CS (mitral annulus) is within the circuit and the cavotricuspid isthmus is not: re-entry around the mitral annulus.',
        'Incorrect: atrial activity spans the whole cycle length, with sites in the circuit far from the AV node: this is an atrial macro-re-entry.',
      ],
      explication: `After AF ablation, regular atrial tachycardias are often left atrial macro-re-entries. Entrainment localises the circuit: a short PPI − TCL (< 20-30 ms) at a site = site within the circuit. Here the distal CS (lateral mitral annulus) is within the circuit (${cs1.a.pptcl} ms) and the cavotricuspid isthmus is not (${cti.a.pptcl} ms): perimitral flutter. Treatment is a mitral isthmus line with confirmation of block, which is more challenging than cavotricuspid isthmus ablation.`,
      aRetenir: 'Entrain from several sites: CS within the circuit and cavotricuspid isthmus outside it → perimitral flutter.',
    },
  });
}

// 10. TRIN avec bloc 2:1 sous le His
{
  const { etapes, r } = induction('trin-21', 'hra');
  const t = tachycardie(r.coeur, r.t);
  affirmer(Math.abs(t.cycleV - 2 * t.cycleA) < 25, 'TRIN 2:1');
  ajouter({
    difficulte: 8,
    question: `Tachycardie avec un cycle atrial de ${R(t.cycleA)} ms et un cycle ventriculaire de ${R(t.cycleV)} ms. Sur le His, chaque A est associé à un H, mais un H sur deux n'est pas suivi de V (tracé). Que peut-on affirmer ?`,
    simu: simu('trin-21', etapes, r.t - 200, { vitesse: 50 }),
    options: ['Réentrée orthodromique avec un bloc AV fonctionnel 2:1', 'Tachycardie atriale avec bloc nodal 2:1', 'Flutter atrial conduit en 2:1 au nœud AV', 'Circuit qui ne passe pas par les ventricules'],
    reponses: [3],
    commentaires: [
      'Faux : une TRAV ne peut pas survivre à un bloc AV, puisque le ventricule fait partie de son circuit.',
      'Faux : dans une tachycardie atriale avec bloc nodal, les A non conduits ne sont pas suivis de H ; ici le bloc est sous le His.',
      'Faux : le flutter donne une activité atriale continue et un bloc au-dessus du His ; ici chaque A a son H, A et H quasi simultanés.',
      'Juste : le bloc sous le His prouve que les ventricules sont en dehors du circuit, ce qui exclut une TRAV ; c\'est ici une TRIN.',
    ],
    explication: `Le bloc 2:1 est situé sous le His : chaque A est suivi d'un H, mais un H sur deux ne conduit pas aux ventricules (période réfractaire du tissu de conduction plus longue que le cycle). La tachycardie continue malgré ce bloc : le ventricule n'appartient donc pas au circuit, ce qui exclut une réentrée orthodromique. Associé à des A et H quasi simultanés, cela est très évocateur d'une TRIN (une tachycardie jonctionnelle focale avec conduction rétrograde 1:1 reste possible). Ce bloc fonctionnel disparaît souvent spontanément ou sous isoprénaline.`,
    aRetenir: 'Une tachycardie qui persiste avec un bloc AV (ou sous le His) exclut une TRAV.',
    sources: [SRC.josephson, SRC.esc],
    en: {
      question: `Tachycardia with an atrial cycle length of ${R(t.cycleA)} ms and a ventricular cycle length of ${R(t.cycleV)} ms. On the His catheter, each A is associated with an H, but every other H is not followed by a V (tracing). What can be concluded?`,
      options: ['Orthodromic re-entry with functional 2:1 AV block', 'Atrial tachycardia with 2:1 AV nodal block', 'Atrial flutter with 2:1 AV nodal conduction', 'A circuit that does not involve the ventricles'],
      commentaires: [
        'Incorrect: AVRT cannot survive AV block, since the ventricle is part of its circuit.',
        'Incorrect: in atrial tachycardia with AV nodal block, non-conducted As are not followed by an H; here the block is below the His.',
        'Incorrect: flutter gives continuous atrial activity and block above the His; here each A has its H, with A and H almost simultaneous.',
        'Correct: block below the His proves that the ventricles are outside the circuit, which excludes AVRT; here this is AVNRT.',
      ],
      explication: `The 2:1 block is located below the His: each A is followed by an H, but every other H fails to conduct to the ventricles (refractory period of the His–Purkinje system longer than the cycle length). The tachycardia continues despite this block: the ventricle is therefore not part of the circuit, which excludes orthodromic re-entry. Combined with almost simultaneous A and H, this is highly suggestive of AVNRT (focal junctional tachycardia with 1:1 retrograde conduction remains possible). This functional block often resolves spontaneously or with isoprenaline.`,
      aRetenir: 'A tachycardia that persists despite AV block (or block below the His) excludes AVRT.',
    },
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
    en: {
      question: `Orthodromic tachycardia: with an LBBB-like QRS (tracing), the VA is ${va} ms and the cycle length ${c1} ms; when the QRS narrows again, the VA returns to ${va0} ms and the cycle length to ${c0} ms. What is the conclusion?`,
      options: ['Right-sided accessory pathway, contralateral to the block', 'Left-sided accessory pathway, ipsilateral to the block', 'AVNRT with aberrant conduction', 'Fascicular ventricular tachycardia'],
      commentaires: [
        'Incorrect: bundle branch block contralateral to the pathway does not change the VA.',
        `Correct: left bundle branch block prolongs the VA (+${va - va0} ms) and the cycle length: the accessory pathway is left-sided and participates in the circuit (Coumel's sign).`,
        'Incorrect: in AVNRT, the ventricle is outside the circuit: bundle branch block changes neither the VA nor the cycle length.',
        'Incorrect: the tachycardia looks like AVRT (an A after each V, fixed VA) and involves the AV node.',
      ],
      explication: `With functional left bundle branch block, the impulse conducts down the right bundle and then crosses the septum before reaching the LV lateral wall, where the accessory pathway inserts. The VA lengthens (here by ${va - va0} ms, ≥ 35 ms in practice) and so does the tachycardia cycle length: this is Coumel's sign. It proves that the accessory pathway, ipsilateral to the block, is part of the circuit. Contralateral bundle branch block changes nothing.`,
      aRetenir: 'Coumel\'s sign: prolongation of the VA (≥ 35 ms) and of the cycle length with bundle branch block → accessory pathway ipsilateral to the block, participating in the circuit.',
    },
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
    options: ['Le QRS large de type retard droit', 'La régularité du cycle ventriculaire', 'Des V plus nombreux que les A (dissociation VA)', 'Un His précédant chaque V avec un HV normal'],
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
    en: {
      question: 'Wide-QRS tachycardia induced by two ventricular extrastimuli in a patient with prior myocardial infarction. Which feature of the tracing establishes a ventricular origin?',
      options: ['The wide QRS with RBBB morphology', 'The regularity of the ventricular cycle length', 'More Vs than As (VA dissociation)', 'A His preceding each V with a normal HV'],
      commentaires: [
        'Incorrect: SVT with bundle branch block or pre-excitation can produce the same wide QRS.',
        'Incorrect: most SVTs are also regular.',
        `Correct: ${nV} Vs for ${nA} As over 3 s: the As are dissociated or conducted retrogradely 2:1; the ventricles are independent of the atria.`,
        'Incorrect: a His preceding each V with a normal HV would favour a supraventricular origin; here the His does not herald the Vs.',
      ],
      explication: 'In wide-QRS tachycardia, ventriculoatrial dissociation (more Vs than As) establishes a ventricular origin. The intracardiac electrograms also show that the His does not precede each V with a normal HV. QRS morphology and regularity cannot settle the question. In a patient with a post-infarction scar, monomorphic VT is most often due to re-entry around or through the scar, amenable to ablation guided by mapping and entrainment.',
      aRetenir: 'More Vs than As (VA dissociation) = ventricular tachycardia; a wide QRS alone is not enough.',
    },
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
    en: {
      question: `Fixed-rate atrial pacing at a cycle length of ${pointW} ms (high RA). The AH increases from ${suite[0]} to ${suite.at(-1)} ms over a few beats, then an atrial activation is not followed by an H (tracing). What is the interpretation?`,
      options: ['Infra-Hisian second-degree AV block', 'Physiological nodal Wenckebach point', 'Atrial effective refractory period reached', 'High-grade AV block, pacing indicated'],
      commentaires: [
        'Incorrect: block occurs between A and H (above the His), after progressive AH prolongation; infra-Hisian block would occur after an H.',
        `Correct: progressive AH prolongation, then an A not followed by an H at ${pointW} ms: AV nodal Wenckebach periodicity, normal at this cycle length.`,
        'Incorrect: the atrium is captured by every stimulus; it is AV nodal conduction that blocks.',
        'Incorrect: AV nodal Wenckebach during rapid atrial pacing is physiological and is not an indication for a pacemaker.',
      ],
      explication: 'Incremental atrial pacing assesses AV nodal conduction capacity. The Wenckebach cycle length is the longest pacing cycle length at which Wenckebach periodicity appears: progressive AH prolongation followed by block of an A above the His. In adults, it usually lies between 300 and 500 ms; it shortens with isoprenaline or atropine. Block occurring below the His (after an H), by contrast, would be pathological.',
      aRetenir: 'AV nodal Wenckebach during rapid atrial pacing = physiological; block below the His is not.',
    },
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
    en: {
      question: `Baseline sinus cycle length ${cs} ms. After 30 s of atrial pacing at 400 ms, the first sinus activation occurs ${trs} ms after the last stimulus (tracing). What is the conclusion?`,
      options: ['Sinus node dysfunction: prolonged corrected SNRT', 'Normal sinus node recovery', 'Uninterpretable measurement, no sinus pause', 'Sinus node dysfunction: SNRT above 1500 ms'],
      commentaires: [
        `Incorrect: the corrected SNRT is ${trs} − ${cs} = ${trsc} ms, below the 525 ms threshold.`,
        `Correct: SNRT ${trs} ms (< 1500 ms) and corrected SNRT ${trsc} ms (< 525 ms): normal sinus node recovery.`,
        'Incorrect: the measurement is taken from the last stimulus to the first spontaneous sinus activation, which is clearly visible here.',
        `Incorrect: the SNRT is ${trs} ms, below 1500 ms.`,
      ],
      explication: 'The sinus node recovery time (SNRT) is measured after rapid atrial pacing (30 to 60 s), from the last stimulus to the first spontaneous sinus activation. It is corrected by subtracting the baseline sinus cycle length (CSNRT). Usual values: SNRT < 1500 ms and CSNRT < 525 ms. A prolonged SNRT or secondary pauses point to sinus node dysfunction; the sensitivity of the test remains modest, and the decision to pace rests above all on symptom–bradycardia correlation.',
      aRetenir: 'SNRT < 1500 ms and corrected SNRT < 525 ms = normal sinus node recovery.',
    },
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
  const effetEn = arret ? 'terminates the tachycardia' : av < 0 ? `delays the next A by ${-av} ms` : `advances the next A by ${av} ms`;
  ajouter({
    difficulte: 8,
    question: `Garçon de 14 ans, cardiomyopathie dilatée. Tachycardie incessante à ${R(tcl)} ms, RP long, activation atriale la plus précoce à l'ostium du SC (tracé). Une ESV His-réfractaire ${effet}. Quel est le diagnostic ?`,
    simu: simu('pjrt', [{ attendre: 8000 }], r0.t - 200, { vitesse: 50 }),
    options: ['Réentrée intranodale atypique (rapide-lente)', 'Tachycardie atriale focale basse, près du SC', 'Tachycardie jonctionnelle réciprocante permanente (PJRT)', 'Réentrée intranodale typique (lente-rapide)'],
    reponses: [2],
    commentaires: [
      'Faux : la TRIN atypique a le même aspect, mais une ESV His-réfractaire ne peut pas atteindre son circuit, intranodal.',
      'Faux : une ESV His-réfractaire ne peut atteindre l\'oreillette que par une voie accessoire : son effet prouve une voie accessoire, ce qui rend une TA très improbable.',
      `Juste : l'ESV His-réfractaire ${effet} : preuve d'une voie accessoire rétrograde ; avec le caractère incessant, le RP long et la sortie à l'ostium du SC, c'est une PJRT.`,
      'Faux : la TRIN typique a un RP très court, A et V quasi simultanés.',
    ],
    explication: `La tachycardie jonctionnelle réciprocante permanente (maladie de Coumel) est une réentrée orthodromique utilisant une voie accessoire postéro-septale à conduction rétrograde lente et décrémentielle. Elle est incessante, à RP long, avec des P négatives en inférieur et une activation la plus précoce à l'ostium du SC. Le diagnostic différentiel est la TRIN atypique et la TA basse. L'ESV His-réfractaire tranche : si elle retarde l'atrium ou arrête la tachycardie sans l'atteindre, la voie participe au circuit ; si elle l'avance avec la même séquence, une voie accessoire existe, et sa participation est très probable si toute la tachycardie est recalée. Son caractère incessant expose à la cardiomyopathie rythmique, réversible après ablation.`,
    aRetenir: 'Tachycardie incessante à RP long, sortie à l\'ostium du SC, modifiée par une ESV His-réfractaire : PJRT (voie décrémentielle postéro-septale).',
    sources: [SRC.esc, SRC.josephson],
    en: {
      question: `14-year-old boy with dilated cardiomyopathy. Incessant tachycardia at ${R(tcl)} ms, long RP, earliest atrial activation at the CS ostium (tracing). A His-refractory PVC ${effetEn}. What is the diagnosis?`,
      options: ['Atypical AV nodal re-entrant tachycardia (fast–slow)', 'Low focal atrial tachycardia close to the CS ostium', 'Permanent junctional reciprocating tachycardia (PJRT)', 'Typical AV nodal re-entrant tachycardia (slow–fast)'],
      commentaires: [
        'Incorrect: atypical AVNRT looks the same, but a His-refractory PVC cannot reach its intranodal circuit.',
        'Incorrect: a His-refractory PVC can reach the atrium only over an accessory pathway: its effect proves an accessory pathway, which makes AT very unlikely.',
        `Correct: the His-refractory PVC ${effetEn}: proof of a retrograde accessory pathway; together with the incessant nature, the long RP and the exit at the CS ostium, this is PJRT.`,
        'Incorrect: typical AVNRT has a very short RP, with A and V almost simultaneous.',
      ],
      explication: 'Permanent junctional reciprocating tachycardia (Coumel\'s tachycardia) is an orthodromic re-entry using a posteroseptal accessory pathway with slow, decremental retrograde conduction. It is incessant, with a long RP, negative P waves in the inferior leads and earliest activation at the CS ostium. The differential diagnosis is atypical AVNRT and low AT. The His-refractory PVC is decisive: if it delays the atrium or terminates the tachycardia without reaching it, the pathway participates in the circuit; if it advances the atrium with the same sequence, an accessory pathway is present, and its participation is very likely if the whole tachycardia is reset. Its incessant nature can cause tachycardia-induced cardiomyopathy, which is reversible after ablation.',
      aRetenir: 'Incessant long-RP tachycardia exiting at the CS ostium and affected by a His-refractory PVC: PJRT (decremental posteroseptal pathway).',
    },
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
      'Faux : une TV fasciculaire a un aspect de retard droit avec axe gauche et ne dépend pas de l\'oreillette (dissociation VA fréquente).',
      'Faux : en bloc de branche gauche, le His précède le V avec un HV normal ; ici le V débute avant le His.',
      'Faux : une voie latérale gauche préexciterait la paroi latérale du VG, avec un aspect de retard droit en V1.',
    ],
    explication: `Les fibres de Mahaim sont le plus souvent des voies atrio-fasciculaires : elles naissent de l'anneau tricuspide latéral et s'insèrent dans la branche droite près de l'apex. Elles conduisent seulement dans le sens antérograde, de façon décrémentielle. La tachycardie typique est antidromique : QRS large de type retard gauche, ventricule droit apical activé en premier, His activé de façon rétrograde juste après le début du QRS. En rythme sinusal, la préexcitation est minime ou absente. L'ablation se fait au site du potentiel de Mahaim sur l'anneau tricuspide.`,
    aRetenir: 'Tachycardie à QRS larges de type retard gauche, VD apical en premier, His rétrograde après le V : voie atrio-fasciculaire (Mahaim).',
    sources: [SRC.esc, SRC.josephson],
    en: {
      question: `22-year-old woman. An atrial extrastimulus induces a regular wide-QRS tachycardia with LBBB morphology, cycle length ${R(tachycardie(r.coeur, r.t).cycleV)} ms. The RV apex is activated first, the His just after QRS onset, and each V is followed by an A (tracing). What is the most likely diagnosis?`,
      options: ['Antidromic tachycardia over an atriofascicular pathway', 'Left fascicular ventricular tachycardia', 'Typical AVNRT with left bundle branch block', 'Antidromic tachycardia over a manifest left lateral pathway'],
      commentaires: [
        'Correct: anterograde conduction over an atriofascicular pathway (lateral tricuspid annulus to the right bundle branch), retrograde via the right bundle branch, the His and the AV node.',
        'Incorrect: fascicular VT has RBBB morphology with left axis deviation and does not depend on the atrium (VA dissociation is common).',
        'Incorrect: with left bundle branch block, the His precedes the V with a normal HV; here the V begins before the His.',
        'Incorrect: a left lateral pathway would pre-excite the LV lateral wall, with an RBBB-like pattern in V1.',
      ],
      explication: 'Mahaim fibres are most often atriofascicular pathways: they arise from the lateral tricuspid annulus and insert into the right bundle branch near the apex. They conduct only anterogradely, in a decremental fashion. The typical tachycardia is antidromic: wide QRS with LBBB morphology, RV apex activated first, His activated retrogradely just after QRS onset. In sinus rhythm, pre-excitation is minimal or absent. Ablation is performed at the site of the Mahaim potential on the tricuspid annulus.',
      aRetenir: 'Wide-QRS tachycardia with LBBB morphology, RV apex activated first and retrograde His after the V: atriofascicular (Mahaim) pathway.',
    },
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
      : ['Voie à haut risque de mort subite (RR ≤ 250 ms)', 'Voie à moindre risque selon le SPERRI ; ablation indiquée si symptômes', 'Mesure non valide en fibrillation atriale', 'Voie à conduction exclusivement rétrograde'],
    reponses: [haut ? 0 : 1],
    commentaires: haut ? [
      `Juste : RR préexcité le plus court ${sperri} ms (≤ 250 ms) : voie à conduction antérograde rapide, risque de FA conduite très vite et de fibrillation ventriculaire ; ablation recommandée.`,
      'Faux : un RR préexcité ≤ 250 ms est justement un marqueur de haut risque.',
      'Faux : le plus court RR préexcité en FA est la mesure de référence du risque.',
      'Faux : la voie conduit dans le sens antérograde, puisque les QRS sont préexcités.',
    ] : [
      `Faux : le plus court RR préexcité mesure ${sperri} ms, au-dessus du seuil de 250 ms.`,
      `Juste : ${sperri} ms (> 250 ms) est un critère de voie à moindre risque ; l'ablation reste indiquée chez un patient symptomatique.`,
      'Faux : le plus court RR préexcité en FA est justement la mesure de référence du risque.',
      'Faux : la voie conduit dans le sens antérograde, puisque les QRS sont préexcités.',
    ],
    explication: `Chez un patient porteur d'une voie accessoire manifeste, la fibrillation atriale peut être conduite très rapidement aux ventricules par la voie, jusqu'à la fibrillation ventriculaire. Le plus court intervalle RR entre deux QRS préexcités (SPERRI) en FA spontanée ou induite évalue ce risque : ≤ 250 ms signe une voie à haut risque. Le tracé montre des QRS larges, préexcités, irréguliers, parfois fusionnés avec des QRS fins. Selon les recommandations ESC 2019, l'ablation est recommandée (classe I) chez les patients symptomatiques (TRAV récidivante ou FA préexcitée) et chez les asymptomatiques à haut risque (SPERRI ≤ 250 ms, période réfractaire de la voie ≤ 250 ms, voies multiples, TRAV inductible).`,
    aRetenir: 'FA préexcitée : RR préexcité le plus court ≤ 250 ms = voie à haut risque.',
    sources: [SRC.esc],
    en: {
      question: `Manifest left lateral accessory pathway. A rapid atrial burst triggers pre-excited atrial fibrillation (tracing, 25 mm/s). The shortest RR interval between two pre-excited QRS complexes is ${sperri} ms. How should this value be interpreted?`,
      options: haut
        ? ['High-risk pathway for sudden death (RR ≤ 250 ms)', 'Low-risk pathway, no ablation to discuss', 'Measurement invalid during atrial fibrillation', 'Pathway with exclusively retrograde conduction']
        : ['High-risk pathway for sudden death (RR ≤ 250 ms)', 'Lower risk by SPERRI; ablation if symptomatic', 'Measurement invalid during atrial fibrillation', 'Pathway with exclusively retrograde conduction'],
      commentaires: haut ? [
        `Correct: shortest pre-excited RR ${sperri} ms (≤ 250 ms): pathway with rapid anterograde conduction, with a risk of very rapidly conducted AF and ventricular fibrillation; ablation is recommended.`,
        'Incorrect: a pre-excited RR ≤ 250 ms is precisely a high-risk marker.',
        'Incorrect: the shortest pre-excited RR during AF is the reference measurement of risk.',
        'Incorrect: the pathway conducts anterogradely, since the QRS complexes are pre-excited.',
      ] : [
        `Incorrect: the shortest pre-excited RR is ${sperri} ms, above the 250 ms threshold.`,
        `Correct: ${sperri} ms (> 250 ms) is a criterion for a lower-risk pathway; ablation remains indicated in a symptomatic patient.`,
        'Incorrect: the shortest pre-excited RR during AF is precisely the reference measurement of risk.',
        'Incorrect: the pathway conducts anterogradely, since the QRS complexes are pre-excited.',
      ],
      explication: 'In patients with a manifest accessory pathway, atrial fibrillation can be conducted very rapidly to the ventricles over the pathway, and may degenerate into ventricular fibrillation. The shortest pre-excited RR interval (SPERRI) during spontaneous or induced AF assesses this risk: ≤ 250 ms indicates a high-risk pathway. The tracing shows wide, pre-excited, irregular QRS complexes, sometimes fused with narrow QRS complexes. According to the 2019 ESC guidelines, ablation is recommended (class I) in symptomatic patients (recurrent AVRT or pre-excited AF) and in high-risk asymptomatic patients (SPERRI ≤ 250 ms, accessory pathway refractory period ≤ 250 ms, multiple pathways, inducible AVRT).',
      aRetenir: 'Pre-excited AF: shortest pre-excited RR ≤ 250 ms = high-risk pathway.',
    },
  });
}

// ---------- écriture ----------
const json = JSON.stringify(questions, null, 2) + '\n';
// surcouche anglaise : mêmes champs que les textes français de chaque question, dans le même ordre
const surcouche = Object.fromEntries(questions.map(q => {
  const ref = textes(q), en = anglais[q.id];
  for (const c of new Set([...Object.keys(ref), ...Object.keys(en)])) {
    affirmer(c in ref && c in en, `${q.id} : champ ${c} présent dans une seule langue`);
    affirmer(!Array.isArray(ref[c]) || en[c].length === ref[c].length, `${q.id} : ${c} de longueurs différentes`);
  }
  return [q.id, Object.fromEntries(Object.keys(ref).map(c => [c, en[c]]))];
}));
const jsonEn = JSON.stringify(surcouche, null, 1) + '\n';
if (verif) {
  const lire = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  if (lire(sortie) !== json) { console.error('✗ data/questions/simulateur-traces.json ne correspond plus au moteur : relancez node scripts/gen-questions-simu.mjs'); process.exit(1); }
  if (lire(sortieEn) !== jsonEn) { console.error('✗ data/questions/en/simulateur-traces.json n\'est plus à jour : relancez node scripts/gen-questions-simu.mjs'); process.exit(1); }
  console.log(`✓ ${questions.length} questions de tracés du simulateur conformes au moteur (français et anglais).`);
} else {
  fs.writeFileSync(sortie, json);
  fs.mkdirSync(path.dirname(sortieEn), { recursive: true });
  fs.writeFileSync(sortieEn, jsonEn);
  console.log(`${questions.length} questions écrites dans ${path.relative(process.cwd(), sortie)} et ${path.relative(process.cwd(), sortieEn)}`);
}
