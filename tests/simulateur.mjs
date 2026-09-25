// Banc d'essai du simulateur d'électrophysiologie (sans navigateur) : node tests/simulateur.mjs
// Vérifie, pour chaque scénario, le rythme de base, l'induction, les manœuvres diagnostiques et l'ablation.
import { Coeur } from '../js/simu/moteur.js';
import { SCENARIOS } from '../js/simu/scenarios.js';
import { tachycardie, mesures, battementsV, activations, sitePlusPrecoce, reponseStim, recuperationSinusale, constantes } from '../js/simu/analyse.js';
import { seuilCapture } from '../js/simu/moteur.js';

const GRAINE = +(process.env.GRAINE || 7), VARIATION = +(process.env.VARIATION || 0);
let graine = 1;
const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
const erreurs = [];
const verifier = (cond, msg) => { if (!cond) erreurs.push(msg); console.log(cond ? '  ✓' : '  ✗', msg); };

function nouveau(id) { graine = GRAINE; const c = new Coeur(SCENARIOS[id].def(), { alea, variation: Math.min(VARIATION, SCENARIOS[id].variation ?? 1) }); c.avancer(3000); return c; }
const attendre = (c, ms) => c.avancer(c.t + ms);
function train(c, site, s1, n, ...extras) {
  let t = c.t + 50;
  for (let i = 0; i < n; i++) { c.stimuler(site, t); if (i < n - 1) t += s1; }
  for (const e of extras) { t += e; c.stimuler(site, t); }
  c.avancer(t + 10);
}
// induction par extrastimulus dégressif ; renvoie le couplage inducteur ou null
function induire(c, site, extras = 1) {
  for (let s2 = 400; s2 >= 180; s2 -= 10) {
    train(c, site, 600, 8, ...Array(extras).fill(s2));
    attendre(c, 3500);
    if (tachycardie(c).active) return s2;
    c.choc(); attendre(c, 1500);
  }
  return null;
}
// entraînement ventriculaire pendant la tachycardie, puis analyse de la réponse
function entrainementV(c, avance = 30) {
  const tcl = tachycardie(c).cycleV;
  const cl = Math.round(tcl - avance);
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

// entraînement depuis un site atrial : PPI − TCL mesuré sur ce site
function entrainementA(c, site, tcl = tachycardie(c).cycleA, avance = 20) {
  const cl = Math.round(tcl - avance), t0 = c.t + 50;
  for (let i = 0; i < 12; i++) c.stimuler(site, t0 + i * cl);
  const der = t0 + 11 * cl;
  c.avancer(der + 3500);
  const ppi = activations(c.journal, site, der + 1, der + 1500)[0] - der;
  return { tcl: Math.round(tcl), ppi: Math.round(ppi), pptcl: Math.round(ppi - tcl), soutenue: tachycardie(c).active };
}

function testerFlutter(c) {
  const couplage = induire(c, 'cs9', 1);
  verifier(couplage != null, `induction depuis l'ostium du SC (couplage ${couplage})`);
  if (couplage == null) return;
  attendre(c, 4000);
  const t = tachycardie(c);
  verifier(t.active && t.cycleA > 210 && t.cycleA < 290 && Math.abs(t.cycleV - 2 * t.cycleA) < 15, `flutter à ${Math.round(t.cycleA)} ms, conduction 2:1 (V ${Math.round(t.cycleV)})`);
  // sens antihoraire : la paroi latérale est activée de haut en bas, puis l'isthme, puis le septum
  const r = c.journal.filter(x => x.t > c.t - 245 * 3);
  const lh = r.find(x => x.s === 'lath').t, lb = r.find(x => x.s === 'latb' && x.t > lh).t, ct = r.find(x => x.s === 'cti' && x.t > lb).t, ra = r.find(x => x.s === 'ras' && x.t > ct).t;
  verifier(lh < lb && lb < ct && ct < ra, `rotation antihoraire (OD lat. haute ${Math.round(lh)} → basse ${Math.round(lb)} → isthme ${Math.round(ct)} → septum ${Math.round(ra)})`);
  const e1 = entrainementA(c, 'cti');
  console.log(`    entraînement depuis l'isthme : PPI-TCL ${e1.pptcl}`);
  verifier(e1.pptcl < 30, 'isthme dans le circuit (PPI − TCL < 30 ms)');
  if (!e1.soutenue) induire(c, 'cs9', 1);
  const e2 = entrainementA(c, 'cs1');
  console.log(`    entraînement depuis le SC distal : PPI-TCL ${e2.pptcl}`);
  verifier(e2.pptcl > 50, 'SC distal hors du circuit (PPI − TCL long)');
  if (!e2.soutenue) induire(c, 'cs9', 1);
  c.injecterAdenosine(); attendre(c, 4500);
  const ta = tachycardie(c);
  verifier(ta.active && (ta.cycleV == null || ta.cycleV > 2 * ta.cycleA + 20), 'persiste sous adénosine, bloc AV majoré');
  attendre(c, 6000);
  c.choc(); attendre(c, 1000);
  c.ablater('isthme'); attendre(c, 1500);
  // bloc bidirectionnel : stimulation de l'ostium du SC → paroi latérale activée de haut en bas
  c.choc(); const tp = c.t + 350; c.stimuler('cs9', tp); attendre(c, 600);
  const lh2 = activations(c.journal, 'lath', tp, tp + 500)[0], lb2 = activations(c.journal, 'latb', tp, tp + 500)[0];
  verifier(lh2 < lb2, `bloc isthmique : activation latérale descendante en stimulant l'ostium du SC (${Math.round(lh2 - tp)} puis ${Math.round(lb2 - tp)} ms)`);
  // et dans l'autre sens : stimulation latérale à la ligne → septum activé tardivement, His avant l'ostium du SC
  c.choc(); const tq = c.t + 350; c.stimuler('cti', tq); attendre(c, 600);
  const his2 = activations(c.journal, 'ras', tq, tq + 500)[0], os2 = activations(c.journal, 'cs9', tq, tq + 500)[0];
  verifier(his2 < os2, `bloc latéral → septal : His (${Math.round(his2 - tq)} ms) avant l'ostium du SC (${Math.round(os2 - tq)} ms)`);
  const r1 = induire(c, 'cs9', 1), r2 = induire(c, 'hra', 1);
  verifier(r1 == null && r2 == null, `non réinductible après ablation (${r1}, ${r2})`);
}

const CLASSIQUES = ['normal', 'double', 'trin', 'trin-atyp', 'trav', 'wpw', 'flutter', 'ta'];
for (const id of CLASSIQUES) {
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

  if (id === 'flutter') { testerFlutter(c); continue; }

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
    // la prochaine activation de His est attendue à h + TCL ; on stimule le VD 30 ms avant (His déjà engagé, réfractaire)
    const cible = h + tcl - 30;
    c.avancer(cible - 1); c.stimuler('rva', cible); attendre(c, 3500);
    const A = activations(c.journal, 'hra', cible - tcl - 50, cible + 1.5 * tcl);
    const avance = Math.round(tcl - Math.min(...A.slice(1).map((x, i) => x - A[i])));
    console.log(`    ESV His-réfractaire : avance de l'A ${avance} ms`);
    verifier(['trav', 'wpw'].includes(id) ? avance >= 10 : Math.abs(avance) < 10, 'réponse à l\'ESV His-réfractaire');
    if (!tachycardie(c).active) {
      // arrêt par une ESV His-réfractaire : autre preuve de la participation d'une voie accessoire
      verifier(['trav', 'wpw'].includes(id), 'arrêt par l\'ESV His-réfractaire seulement avec voie accessoire');
      induire(c, siteInduc, 1);
    }
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

// ---------- physiologie de base ----------
console.log('\nphysiologie (conduction normale)');
const ecart = l => l.slice(1).map((x, i) => x - l[i]);
{
  // Wenckebach nodal : allongement progressif de l'AH puis bloc
  let pointW = null;
  for (let cl = 500; cl >= 250 && pointW == null; cl -= 10) {
    const c = nouveau('normal'); const t0 = c.t + 50;
    for (let i = 0; i < 12; i++) c.stimuler('hra', t0 + i * cl);
    c.avancer(t0 + 12 * cl + 400);
    const A = activations(c.journal, 'ras', t0, t0 + 12 * cl), H = activations(c.journal, 'his', t0, t0 + 12 * cl + 400);
    const ah = A.map(a => { const h = H.find(h => h > a && h - a < 300); return h ? h - a : null; });
    if (ah.includes(null)) { const k = ah.indexOf(null); pointW = { cl, ah: ah.slice(0, k + 1).map(x => x && Math.round(x)) }; }
  }
  console.log(`    point de Wenckebach ${pointW?.cl} ms, AH ${pointW?.ah.join(' → ')}`);
  verifier(pointW && pointW.cl >= 300 && pointW.cl <= 450, 'point de Wenckebach entre 300 et 450 ms');
  const pr = pointW?.ah.filter(Boolean) ?? [];
  verifier(pr.length >= 2 && pr.at(-1) - pr[0] >= 15, 'allongement progressif de l\'AH avant le bloc');
}
{
  // temps de récupération sinusale après 30 s de stimulation à 400 ms
  const c = nouveau('normal'); const t0 = c.t + 50;
  for (let i = 0; i < 75; i++) c.stimuler('hra', t0 + i * 400);
  const der = t0 + 74 * 400; c.avancer(der + 4000);
  const trs = c.journal.find(x => x.s === 'sa' && x.o === 'auto' && x.t > der + 5).t + 15 - der;
  const cs = mesures(nouveau('normal')).cycleA;
  console.log(`    TRS ${Math.round(trs)} ms, TRSc ${Math.round(trs - cs)} ms`);
  verifier(trs > cs + 150 && trs < 1500 && trs - cs < 525, 'TRS et TRSc normaux (TRS < 1500, TRSc < 525 ms)');
}
{
  // aberration de branche droite fonctionnelle sur extrastimulus atrial court
  const c = nouveau('normal'); let brd = null;
  for (let s2 = 400; s2 >= 240 && !brd; s2 -= 10) {
    train(c, 'hra', 600, 8, s2); attendre(c, 600);
    const v = activations(c.journal, 'vsep', c.t - 600, c.t)[0], r = activations(c.journal, 'rva', c.t - 600, c.t)[0];
    if (v && r && r - v > 30) brd = s2;
    attendre(c, 1500);
  }
  verifier(brd != null, `bloc de branche droite fonctionnel sur S2 court (couplage ${brd})`);
}
{
  // saut V2-H2 : bloc rétrograde dans la branche droite sur extrastimulus ventriculaire court
  const c = nouveau('normal'); const vh = [];
  for (let s2 = 450; s2 >= 240; s2 -= 10) {
    train(c, 'rva', 600, 8, s2); const t2 = c.t - 10; attendre(c, 500);
    const h = activations(c.journal, 'his', t2, t2 + 200)[0]; vh.push(h ? Math.round(h - t2) : null); attendre(c, 1500);
  }
  const vals = vh.filter(Boolean), saut = ecart(vals).some(d => d >= 20);
  console.log(`    VH rétrograde : ${vh.join(' ')}`);
  verifier(saut, 'saut V2-H2 (bloc rétrograde dans la branche droite)');
}
{
  // isoprénaline : accélération sinusale, amélioration de la conduction nodale
  const c = nouveau('normal'); attendre(c, 3000); const avant = mesures(c).cycleA;
  c.basculerMedicament('iso'); attendre(c, 20000); const apres = mesures(c).cycleA;
  console.log(`    cycle sinusal ${Math.round(avant)} → ${Math.round(apres)} ms sous isoprénaline`);
  verifier(apres < avant * 0.75, 'accélération sinusale sous isoprénaline');
}
// stimulation para-hisienne : conduction rétrograde nodale (S-A s'allonge sans capture du His) ou extranodale
function paraHisien(id) {
  const c = nouveau(id); const sa = {};
  for (const mA of [15, 5]) {
    c.choc(); const t0 = c.t + 400;
    for (let i = 0; i < 6; i++) c.stimuler('parahis', t0 + i * 500, mA);
    const der = t0 + 5 * 500; c.avancer(der + 450);
    // intervalle stimulus-A mesuré au site de sortie rétrograde : His (nœud AV) ou ostium du SC (voie septale)
    const site = id === 'normal' ? 'ras' : 'cs9';
    const a = activations(c.journal, site, der + 1, der + 450)[0];
    sa[mA] = a != null ? Math.round(a - der) : null;
  }
  return sa;
}
{
  const n = paraHisien('normal'), sep = paraHisien('septale');
  console.log(`    para-hisien S-A (15 / 5 mA) : nodal ${n[15]} / ${n[5]}, voie septale ${sep[15]} / ${sep[5]}`);
  verifier(n[5] - n[15] >= 40, 'para-hisien : allongement du S-A sans capture du His (conduction nodale)');
  verifier(Math.abs(sep[5] - sep[15]) < 15, 'para-hisien : S-A inchangé (voie accessoire septale)');
}

// ---------- scénarios avancés ----------
const precoceTachy = c => { const v = battementsV(c.journal, c.t - 2000, c.t).at(-2); return sitePlusPrecoce(c.journal, v + 5, v + 500); };
function esvHR(c) {
  const tcl = tachycardie(c).cycleV, h = activations(c.journal, 'his', c.t - 900, c.t).at(-1), cible = h + tcl - 30;
  c.avancer(cible - 1); c.stimuler('rva', cible); attendre(c, 3500);
  const A = activations(c.journal, 'hra', cible - tcl - 50, cible + 1.5 * tcl);
  return { avance: Math.round(tcl - Math.min(...A.slice(1).map((x, i) => x - A[i]))), soutenue: tachycardie(c).active };
}
{
  console.log('\nseptale');
  const c = nouveau('septale'); attendre(c, 4000);
  verifier(!tachycardie(c).active, 'pas de tachycardie de base');
  const cp = induire(c, 'hra', 1); verifier(cp != null, `induction (${cp})`);
  if (cp != null) {
    const p = precoceTachy(c), m = mesures(c);
    verifier(p === 'cs9' && m.VA >= 70, `A le plus précoce à l'ostium du SC (${p}), VA ${m.VA}`);
    const e = esvHR(c); verifier(e.avance >= 10 || !e.soutenue, `ESV His-réfractaire : avance ${e.avance} ms ou arrêt`);
    if (!tachycardie(c).active) induire(c, 'hra', 1);
    let en = entrainementV(c, 20);
    for (let k = 0; k < 3 && !en.soutenue; k++) { induire(c, 'hra', 1); en = entrainementV(c, 10); }
    console.log(`    entraînement V : ${en.reponse}, PPI-TCL ${en.pptcl}, soutenue ${en.soutenue}`);
    verifier(en.soutenue && en.reponse === 'VAV' && en.pptcl < 115, 'V-A-V et PPI − TCL < 115 ms');
  }
}
{
  console.log('\npjrt');
  const c = nouveau('pjrt'); attendre(c, 8000);
  const t = tachycardie(c); verifier(t.active, `tachycardie incessante (cycle ${Math.round(t.cycleV)})`);
  const v = battementsV(c.journal, c.t - 2000, c.t).at(-2), p = precoceTachy(c);
  const va = Math.round(activations(c.journal, 'cs9', v + 1, v + 800)[0] - v);
  verifier(p === 'cs9' && va > t.cycleV / 2, `RP long (VA ${va} > cycle/2), A le plus précoce à l'ostium du SC (${p})`);
}
{
  console.log('\nmahaim');
  const c = nouveau('mahaim'); attendre(c, 3000);
  const v = activations(c.journal, 'vsep', c.t - 900, c.t).at(-1), r = activations(c.journal, 'rva', c.t - 900, c.t).at(-1);
  verifier(r - v > -15, `pas de préexcitation franche en rythme sinusal (VD − septum ${Math.round(r - v)} ms)`);
  const cp = induire(c, 'hra', 1) ?? induire(c, 'hra', 2); verifier(cp != null, `tachycardie antidromique induite (${cp})`);
  if (cp != null) {
    const v2 = activations(c.journal, 'vsep', c.t - 900, c.t).at(-1), r2 = activations(c.journal, 'rva', c.t - 900, c.t).filter(x => x < v2).at(-1);
    const h = activations(c.journal, 'his', r2 - 100, r2 + 100).sort((a, b) => Math.abs(a - r2) - Math.abs(b - r2))[0];
    verifier(r2 != null && v2 - r2 > 20 && h > r2, `QRS large type retard gauche (VD ${Math.round(v2 - r2)} ms avant le septum), His après le V`);
  }
}
{
  console.log('\ntrin-21');
  const c = nouveau('trin-21'); const cp = induire(c, 'hra', 1);
  const t = tachycardie(c); verifier(cp != null && Math.abs(t.cycleV - 2 * t.cycleA) < 25, `TRIN avec bloc 2:1 sous le His (A ${Math.round(t.cycleA)}, V ${Math.round(t.cycleV)})`);
  const h = activations(c.journal, 'his', c.t - 2000, c.t).length, a = activations(c.journal, 'ras', c.t - 2000, c.t).length;
  verifier(Math.abs(h - a) <= 1, 'un H pour chaque A');
}
{
  console.log('\ncoumel');
  // on raccourcit S2 jusqu'à induire la tachycardie avec un bloc de branche gauche
  const c = nouveau('coumel'); let cp = null;
  for (let s2 = 400; s2 >= 250 && cp == null; s2 -= 10) {
    train(c, 'hra', 600, 8, s2); attendre(c, 3500);
    const v = activations(c.journal, 'vsep', c.t - 500, c.t).at(-1), r = activations(c.journal, 'rva', c.t - 500, c.t).at(-1);
    if (tachycardie(c).active && v - r > 30) cp = s2; else { c.choc(); attendre(c, 1500); }
  }
  verifier(cp != null, `induction avec bloc de branche gauche (${cp})`);
  if (cp != null) {
    const m = mesures(c), cc = nouveau('trav'); induire(cc, 'hra', 1); const m0 = mesures(cc);
    console.log(`    VA avec bloc de branche gauche ${m.VA} ms contre ${m0.VA} ms sans ; cycle ${Math.round(tachycardie(c).cycleV)} contre ${Math.round(tachycardie(cc).cycleV)}`);
    verifier(m.VA - m0.VA >= 35, 'signe de Coumel : allongement du VA ≥ 35 ms en bloc de branche homolatéral');
  }
}
{
  console.log('\nflutter-mitral');
  const c = nouveau('flutter-mitral'); attendre(c, 3000);
  verifier(!tachycardie(c).active, 'pas de tachycardie de base');
  let cp = induire(c, 'cs1', 1) ?? induire(c, 'cs9', 1); verifier(cp != null, `induction (${cp})`);
  if (cp != null) {
    const t = tachycardie(c); verifier(t.cycleA > 200 && t.cycleA < 340, `cycle atrial ${Math.round(t.cycleA)} ms`);
    const e1 = entrainementA(c, 'cs9'); if (!e1.soutenue) induire(c, 'cs1', 1);
    const e2 = entrainementA(c, 'cs1'); if (!e2.soutenue) induire(c, 'cs1', 1);
    const e3 = entrainementA(c, 'cti');
    console.log(`    PPI-TCL : SC 9-10 ${e1.pptcl}, SC 1-2 ${e2.pptcl}, isthme CT ${e3.pptcl}`);
    verifier(e1.pptcl < 30 && e2.pptcl < 30 && e3.pptcl > 50, 'SC proximal et distal dans le circuit, isthme cavo-tricuspide hors circuit');
    c.choc(); attendre(c, 1000); c.ablater('og-lat'); attendre(c, 1000);
    verifier(induire(c, 'cs1', 1) == null && induire(c, 'cs9', 1) == null, 'non réinductible après ablation de l\'isthme mitral');
  }
}
{
  console.log('\njonctionnelle');
  const c = nouveau('jonctionnelle'); c.basculerMedicament('iso'); attendre(c, 16000);
  for (let i = 0; i < 10; i++) c.stimuler('hra', c.t + 50 + i * 300);
  attendre(c, 7000);
  const t = tachycardie(c); verifier(t.active, `tachycardie jonctionnelle (cycle ${Math.round(t.cycleV)})`);
  const m = mesures(c); verifier(m.HV >= 35 && m.HV <= 55, `H avant chaque V, HV ${m.HV}`);
  c.injecterAdenosine(); attendre(c, 4500); verifier(tachycardie(c).active, 'persiste sous adénosine');
}
{
  console.log('\ntv');
  const c = nouveau('tv'); attendre(c, 3000);
  verifier(!tachycardie(c).active, 'pas de tachycardie de base');
  const cp = induire(c, 'rva', 2); verifier(cp != null, `induction par S2-S3 ventriculaires (${cp})`);
  if (cp != null) {
    const t = tachycardie(c);
    const nV = battementsV(c.journal, c.t - 3000, c.t).length, nA = activations(c.journal, 'hra', c.t - 3000, c.t).length;
    verifier(nV > nA, `plus de V que de A (${nV} V, ${nA} A) : dissociation ou rétroconduction 2:1`);
    let e = entrainementA(c, 'tv2', tachycardie(c).cycleV);
    for (let k = 0; k < 3 && !e.soutenue; k++) { induire(c, 'rva', 2); e = entrainementA(c, 'tv2', tachycardie(c).cycleV, 10); }
    console.log(`    entraînement depuis l'isthme : PPI-TCL ${e.pptcl}`);
    verifier(e.pptcl < 30, 'isthme de la cicatrice dans le circuit');
    c.choc(); attendre(c, 1000); c.ablater('tv-isthme'); attendre(c, 1000);
    verifier(induire(c, 'rva', 2) == null, 'non réinductible après ablation');
  }
}
{
  console.log('\nfa');
  for (const id of ['fa', 'wpw']) {
    const c = nouveau(id); attendre(c, 2000);
    for (let i = 0; i < 12; i++) c.stimuler('hra', c.t + 50 + i * 200);
    attendre(c, 8000);
    const V = battementsV(c.journal, c.t - 5000, c.t), rr = ecart(V), moy = rr.reduce((a, b) => a + b, 0) / rr.length;
    const sd = Math.sqrt(rr.reduce((a, b) => a + (b - moy) ** 2, 0) / rr.length);
    console.log(`    ${id} : RR moyen ${Math.round(moy)} ms, écart-type ${Math.round(sd)}, RR le plus court ${Math.round(Math.min(...rr))}`);
    verifier(c.fa && sd > 30, `${id} : fibrillation atriale, RR irréguliers`);
    if (id === 'wpw') {
      const pre = battementsV(c.journal, c.t - 5000, c.t).filter(v => { const l = activations(c.journal, 'lvl', v - 5, v + 150)[0], s = activations(c.journal, 'vsep', v - 5, v + 150)[0]; return l != null && s != null && s - l > 15; }).length;
      verifier(pre > 0, `FA préexcitée : ${pre} QRS préexcités`);
    }
    c.choc(); attendre(c, 3000); verifier(!c.fa, 'réduite par choc électrique externe');
  }
}

// ablation de la voie rapide d'un nœud normal : bloc AV complet avec échappement jonctionnel
{
  const c = nouveau('normal'); c.ablater('rapide'); attendre(c, 8000);
  const m = mesures(c);
  verifier(m.cycleV > 1100, `bloc AV complet après ablation antéro-septale (cycle V ${m.cycleV})`);
}

// stimulateur : seuil propre au site, loi intensité-durée, capture intermittente autour du seuil
{
  console.log('Stimulateur, constantes et gestes');
  const c = nouveau('normal');
  verifier(seuilCapture('cti') > seuilCapture('hra') && seuilCapture('hra', 0.5) > seuilCapture('hra', 2), 'seuils par site et loi intensité-durée');
  attendre(c, 800); const t0 = c.derniere('hra') + 550, s0 = seuilCapture('hra'); // couplage fixe au dernier battement sinusal
  c.stimuler('hra', t0, s0 * 1.2); c.stimuler('hra', t0 + 600, s0 * 0.8); attendre(c, t0 + 1500 - c.t);
  verifier(reponseStim(c, t0).capture && !reponseStim(c, t0 + 600).capture, 'capture au-dessus du seuil, perte de capture en dessous');
  const r = reponseStim(c, t0);
  verifier(r.AH > 60 && r.AH < 130 && r.HV === 40, `réponse au stimulus : AH ${r.AH} ms, HV ${r.HV} ms`);
}
// temps de récupération sinusale après 30 s de stimulation atriale
{
  const c = nouveau('normal'); let t = c.t + 100;
  for (let i = 0; i < 50; i++) { c.stimuler('hra', t); t += 600; }
  attendre(c, t - c.t + 4000);
  const trs = recuperationSinusale(c, t - 600);
  verifier(trs > 700 && trs < 1500, `TRS normal (${trs} ms)`);
}
// pression artérielle : normale en rythme sinusal, effondrée en TRIN rapide
{
  const c = nouveau('trin'); attendre(c, 5000);
  const avant = constantes(c.journal, c.t);
  induire(c, 'hra', 1); attendre(c, 6000);
  const apres = constantes(c.journal, c.t);
  console.log(`    PA ${avant.sys}/${avant.dia} en sinusal, ${apres.sys}/${apres.dia} en tachycardie`);
  verifier(avant.sys > 100 && avant.sys < 140 && avant.dia > 60 && apres.moy < avant.moy - 15, 'PA normale puis chute en tachycardie rapide');
}
// gestes : extrasystole mécanique, bloc transitoire d'une voie accessoire, rythme jonctionnel, lésion nodale progressive
{
  const c = nouveau('wpw'); const t0 = c.t + 200;
  c.ectopie('rva', t0); attendre(c, 400);
  verifier(activations(c.journal, 'rva', t0 - 1, t0 + 1).length === 1, 'extrasystole mécanique au contact du cathéter');
  const preexcite = () => battementsV(c.journal, c.t - 3000, c.t).filter(v => { const l = activations(c.journal, 'lvl', v - 5, v + 150)[0], s = activations(c.journal, 'vsep', v - 5, v + 150)[0]; return l != null && s != null && s - l > 15; }).length;
  attendre(c, 3000); const p0 = preexcite();
  const id = c.voies.find(v => v.id.startsWith('vacc')).id;
  c.bloquer(id, 6000); attendre(c, 4000); const p1 = preexcite();
  attendre(c, 6000); const p2 = preexcite();
  verifier(p0 > 0 && p1 === 0 && p2 > 0, `« bump » : préexcitation ${p0} → ${p1} → ${p2} QRS (disparaît puis revient)`);
  const n = nouveau('normal');
  n.jonction(500); attendre(n, 4000);
  const J = n.journal.filter(x => x.s === 'his' && x.o === 'auto' && x.t > n.t - 3000).length;
  n.jonction(null); attendre(n, 3000);
  verifier(J >= 4, `rythme jonctionnel accéléré (${J} battements en 3 s)`);
  const ah0 = mesures(n).AH; n.leserNoeud(60); attendre(n, 3000);
  verifier(ah0 != null && mesures(n).AH >= ah0 + 50, `lésion nodale : AH ${ah0} → ${mesures(n).AH} ms`);
  n.leserNoeud(400); attendre(n, 5000);
  verifier(n.voies.find(v => v.id === 'nav').coupee && mesures(n).cycleV > 1100, 'lésion nodale poussée : bloc AV complet');
}

console.log(erreurs.length ? `\n${erreurs.length} échec(s)` : '\nSimulateur conforme.');
process.exit(erreurs.length ? 1 : 0);
