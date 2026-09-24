// Banc d'essai du simulateur d'électrophysiologie (sans navigateur) : node tests/simulateur.mjs
// Vérifie, pour chaque scénario, le rythme de base, l'induction, les manœuvres diagnostiques et l'ablation.
import { Coeur } from '../js/simu/moteur.js';
import { SCENARIOS } from '../js/simu/scenarios.js';
import { tachycardie, mesures, battementsV, activations, sitePlusPrecoce } from '../js/simu/analyse.js';

const GRAINE = +(process.env.GRAINE || 7), VARIATION = +(process.env.VARIATION || 0);
let graine = 1;
const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
const erreurs = [];
const verifier = (cond, msg) => { if (!cond) erreurs.push(msg); console.log(cond ? '  ✓' : '  ✗', msg); };

function nouveau(id) { graine = GRAINE; const c = new Coeur(SCENARIOS[id].def(), { alea, variation: VARIATION }); c.avancer(3000); return c; }
const attendre = (c, ms) => c.avancer(c.t + ms);
function train(c, site, s1, n, ...extras) {
  let t = c.t + 50;
  for (let i = 0; i < n; i++) { c.stimuler(site, t); if (i < n - 1) t += s1; }
  for (const e of extras) { t += e; c.stimuler(site, t); }
  c.avancer(t + 10);
}
// induction par extrastimulus dégressif ; renvoie le couplage inducteur ou null
function induire(c, site, extras = 1) {
  for (let s2 = 400; s2 >= 200; s2 -= 10) {
    train(c, site, 600, 8, ...Array(extras).fill(s2));
    attendre(c, 3500);
    if (tachycardie(c).active) return s2;
    c.choc(); attendre(c, 1500);
  }
  return null;
}
// entraînement ventriculaire pendant la tachycardie, puis analyse de la réponse
function entrainementV(c) {
  const tcl = tachycardie(c).cycleV;
  const cl = Math.round(tcl - 30);
  const t0 = c.t + 50;
  for (let i = 0; i < 20; i++) c.stimuler('rva', t0 + i * cl);
  const der = t0 + 19 * cl;
  c.avancer(der + 3500);
  const V = battementsV(c.journal, der + 1, der + 1500), A = activations(c.journal, 'hra', der + 1, der + 1500);
  const rva = activations(c.journal, 'rva', der + 1, der + 1500);
  const ppi = rva[0] - der;
  // dernier A entraîné : l'activation atriale issue du dernier stimulus
  const Aent = c.journal.find(x => x.s === 'hra' && x.r === `stim:${der}`)?.t;
  const sa = Aent - der;
  const Vsuiv = V.find(v => v > (Aent ?? der) && !c.stims.some(s => Math.abs(s.t - v) < 5));
  const Asuiv = A.find(x => x > (Aent ?? der) + 5);
  const entraine = Aent != null && activations(c.journal, 'hra', der - 3 * cl, der).length >= 3;
  const reponse = !entraine ? 'non entraîné' : Asuiv != null && Vsuiv != null ? (Asuiv < Vsuiv ? 'VAAV' : 'VAV') : '?';
  return { sa: Math.round(sa), tcl: Math.round(tcl), ppi: Math.round(ppi), pptcl: Math.round(ppi - tcl), reponse, soutenue: tachycardie(c).active };
}

for (const id of Object.keys(SCENARIOS)) {
  console.log(`\n${id} — ${SCENARIOS[id].nom}`);
  const c = nouveau(id);
  attendre(c, 5000);
  const m = mesures(c);
  verifier(!tachycardie(c).active, `rythme de base sans tachycardie (cycle V ${m.cycleV}, AH ${m.AH}, HV ${m.HV})`);
  if (['normal', 'double', 'trin', 'trav', 'ta'].includes(id)) verifier(m.AH >= 60 && m.AH <= 110 && m.HV >= 35 && m.HV <= 55, `AH ${m.AH} et HV ${m.HV} normaux`);
  if (id === 'wpw') verifier(m.HV <= 15, `préexcitation : HV ${m.HV} ms`);

  if (['normal', 'double'].includes(id)) {
    verifier(induire(c, 'hra', 1) == null, 'rien d\'inductible par extrastimulus atrial');
    verifier(induire(nouveau(id), 'rva', 1) == null, 'rien d\'inductible par extrastimulus ventriculaire');
    // courbe AH
    const cc = nouveau(id); const courbe = [];
    for (let s2 = 500; s2 >= 250; s2 -= 10) {
      train(cc, 'hra', 600, 8, s2); attendre(cc, 800);
      const h = activations(cc.journal, 'his', cc.t - 800, cc.t)[0], a = activations(cc.journal, 'ras', cc.t - 1200, h).at(-1);
      courbe.push([s2, h && a ? Math.round(h - a) : null]); attendre(cc, 1200);
    }
    const saut = courbe.slice(1).some(([, ah], i) => ah && courbe[i][1] && ah - courbe[i][1] >= 50);
    console.log('    courbe AH', courbe.map(x => x.join(':')).join(' '));
    verifier(id === 'double' ? saut : !saut, id === 'double' ? 'saut de l\'AH ≥ 50 ms' : 'pas de saut de l\'AH');
    continue;
  }

  const siteInduc = id === 'trin-atyp' ? 'rva' : id === 'wpw' ? 'cs1' : 'hra';
  let couplage;
  if (id === 'ta') {
    for (let i = 0; i < 10; i++) c.stimuler('hra', c.t + 50 + i * 300);
    attendre(c, 6000);
    couplage = tachycardie(c).active ? 300 : null;
  } else couplage = induire(c, siteInduc, 1);
  verifier(couplage != null, `induction (${siteInduc}, couplage ${couplage})`);
  if (couplage == null) continue;
  const tach = tachycardie(c);
  attendre(c, 5000);
  verifier(tachycardie(c).active, `tachycardie soutenue, cycle V ${tach.cycleV} / A ${tach.cycleA}`);
  const v = battementsV(c.journal, c.t - 2000, c.t).at(-2);
  const precoce = sitePlusPrecoce(c.journal, v + 5, v + 420);
  const mm = mesures(c);
  console.log(`    VA ${mm.VA} ms, activation atriale la plus précoce : ${precoce}`);
  const attendu = { trin: ['ras'], 'trin-atyp': ['cs9'], trav: ['cs1'], wpw: ['cs1'], ta: ['cs3', 'cs5'] }[id];
  verifier(attendu.includes(precoce), `site atrial le plus précoce attendu (${attendu})`);
  if (id === 'trin') verifier(mm.VA < 70, 'VA < 70 ms');
  if (id === 'trav' || id === 'wpw') verifier(mm.VA >= 70, 'VA ≥ 70 ms');

  // ESV His-réfractaire
  if (id !== 'ta') {
    const tcl = tachycardie(c).cycleV;
    const h = activations(c.journal, 'his', c.t - 800, c.t).at(-1);
    // la prochaine activation de His est attendue à h + TCL ; on stimule le VD 10 ms après
    const cible = h + tcl + 10;
    c.avancer(cible - 1); c.stimuler('rva', cible); attendre(c, 3500);
    const A = activations(c.journal, 'hra', cible - tcl - 50, cible + 1.5 * tcl);
    const avance = Math.round(tcl - Math.min(...A.slice(1).map((x, i) => x - A[i])));
    console.log(`    ESV His-réfractaire : avance de l'A ${avance} ms`);
    verifier(['trav', 'wpw'].includes(id) ? avance >= 10 : Math.abs(avance) < 10, 'réponse à l\'ESV His-réfractaire');
    if (!tachycardie(c).active) { erreurs.push(`${id} : l'ESV a arrêté la tachycardie`); continue; }
  }
  const e = entrainementV(c);
  console.log(`    entraînement V : SA ${e.sa} TCL ${e.tcl}, PPI ${e.ppi}, PPI-TCL ${e.pptcl}, réponse ${e.reponse}, soutenue après : ${e.soutenue}`);
  if (!e.soutenue) {
    console.log('    (tachycardie arrêtée par l\'entraînement : manœuvre non interprétable, on réinduit)');
    if (id === 'ta') { for (let i = 0; i < 10; i++) c.stimuler('hra', c.t + 50 + i * 300); attendre(c, 6000); } else induire(c, siteInduc, 1);
  } else {
    verifier(e.reponse === (id === 'ta' ? 'VAAV' : 'VAV'), `réponse ${id === 'ta' ? 'V-A-A-V' : 'V-A-V'}`);
    if (id !== 'ta') verifier(id.startsWith('trin') ? e.pptcl > 115 : e.pptcl < 115, `PPI-TCL ${id.startsWith('trin') ? '> 115' : '< 115'}`);
  }
  // adénosine
  c.injecterAdenosine(); attendre(c, 4500);
  verifier(tachycardie(c).active === (id === 'ta'), id === 'ta' ? 'persiste sous adénosine' : 'arrêtée par l\'adénosine');
  attendre(c, 6000);
  // ablation
  c.choc(); attendre(c, 1000);
  c.ablater(SCENARIOS[id].cible); attendre(c, 2000);
  if (id === 'ta') { for (let i = 0; i < 10; i++) c.stimuler('hra', c.t + 50 + i * 300); attendre(c, 6000); verifier(!tachycardie(c).active, 'non réinductible après ablation'); }
  else { const r1 = induire(c, siteInduc, 1), r2 = induire(c, siteInduc === 'rva' ? 'hra' : 'rva', 1); verifier(r1 == null && r2 == null, `non réinductible après ablation (${r1}, ${r2}, cycle ${tachycardie(c).cycleV})`); }
}

// ablation de la voie rapide d'un nœud normal : bloc AV complet avec échappement jonctionnel
{
  const c = nouveau('normal'); c.ablater('rapide'); attendre(c, 8000);
  const m = mesures(c);
  verifier(m.cycleV > 1100, `bloc AV complet après ablation antéro-septale (cycle V ${m.cycleV})`);
}

console.log(erreurs.length ? `\n${erreurs.length} échec(s)` : '\nSimulateur conforme.');
process.exit(erreurs.length ? 1 : 0);
