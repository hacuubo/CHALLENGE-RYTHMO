// Mesures automatiques sur le journal d'activations : cycles, intervalles AH / HV / VA, détection d'une tachycardie.
import { t as trad } from '../i18n.js'; // t désigne ici le temps
// sites dont l'activation fait le QRS (la cicatrice, de faible masse, n'en fait pas partie)
const SITES_QRS = ['vsep', 'vbd', 'vps', 'rva', 'lvl'];

// Débuts de complexes ventriculaires (première activation ventriculaire de chaque battement).
export function battementsV(journal, t0 = -Infinity, t1 = Infinity) {
  const r = [];
  for (const x of journal) {
    if (x.t < t0 || x.t > t1 || !SITES_QRS.includes(x.s)) continue;
    if (!r.length || x.t - r.at(-1) > 120) r.push(x.t);
  }
  return r;
}

export const activations = (journal, site, t0 = -Infinity, t1 = Infinity) => journal.filter(x => x.s === site && x.t >= t0 && x.t <= t1).map(x => x.t);

const mediane = l => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[s.length >> 1]; };
const ecarts = l => l.slice(1).map((x, i) => x - l[i]);

// Intervalles du dernier battement complet (sur le cathéter de His) et cycles récents.
export function mesures(coeur, t = coeur.t) {
  const j = coeur.journal;
  const fen = t - 3000;
  const A = activations(j, 'hra', fen, t), V = battementsV(j, fen, t);
  const H = activations(j, 'his', fen, t), As = activations(j, 'ras', fen, t);
  const m = { cycleA: A.length > 1 ? A.at(-1) - A.at(-2) : null, cycleV: V.length > 1 ? V.at(-1) - V.at(-2) : null, AH: null, HV: null, VA: null };
  const h = H.filter(x => x < t - 150).at(-1);
  if (h != null) {
    const a = As.filter(x => x <= h && h - x < 420).at(-1);
    const v = V.find(x => x >= h - 60 && x - h < 120);
    const vsep = activations(j, 'vsep', h, h + 150)[0];
    if (a != null && (v == null || a < v - 20)) m.AH = Math.round(h - a);
    if (vsep != null) m.HV = Math.round((v ?? vsep) - h);
  }
  const v = V.filter(x => x < t - 150).at(-1);
  if (v != null) { const a = As.find(x => x > v && x - v < 400); if (a != null) m.VA = Math.round(a - v); }
  return m;
}

// Tachycardie soutenue : ≥ 6 complexes ventriculaires ou atriaux réguliers à cycle < 460 ms sur les 3 dernières secondes.
export function tachycardie(coeur, t = coeur.t, duree = 3000) {
  const j = coeur.journal;
  const sansStim = coeur.stims.filter(s => s.t > t - duree).length === 0;
  const V = battementsV(j, t - duree, t), A = activations(j, 'hra', t - duree, t);
  const cv = mediane(ecarts(V)), ca = mediane(ecarts(A));
  const rapide = c => c != null && c < 460;
  return { active: sansStim && (rapide(cv) || rapide(ca)), cycleV: cv, cycleA: ca };
}

// Séquence d'activation atriale d'un battement : site le plus précoce parmi His A et SC.
export function sitePlusPrecoce(journal, t0, t1) {
  const sites = ['hra', 'ras', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1'];
  let best = null;
  for (const x of journal) if (x.t >= t0 && x.t <= t1 && sites.includes(x.s) && (!best || x.t < best.t)) best = x;
  return best?.s ?? null;
}

// Cycle médian d'un site sur une fenêtre (activations non stimulées).
export function cycleSite(journal, site, t0, t1) {
  const l = journal.filter(x => x.s === site && x.t >= t0 && x.t <= t1 && x.o !== 'stim').map(x => x.t);
  return mediane(ecarts(l));
}

// Analyse d'un entraînement (salve arrêtée à l'instant der, au cycle cl, depuis le site stimulé) :
// réponse (V-A-V ou V-A-A-V pour un entraînement ventriculaire), PPI mesuré sur le site stimulé, PPI − TCL, SA − VA.
// La manœuvre n'est interprétable que si le dernier stimulus a capturé, si l'atrium suivait la stimulation (entraînement
// ventriculaire) et si la tachycardie a persisté après l'arrêt : sinon interpretable est faux et motif dit pourquoi.
// Réponse lue avec le His (A-A-H contre A-H-A) : un bloc sous le His (TRIN 2:1) ne doit pas faire conclure à une V-A-A-V.
export function analyserEntrainement(coeur, { der, site, tcl, ventriculaire, debut = null }) {
  const j = coeur.journal, stims = coeur.stims.filter(s => s.s === site && s.t <= der);
  const dernier = stims.at(-1), cl = stims.length > 1 ? der - stims.at(-2).t : null;
  const ppiT = activations(j, site === 'parahis' ? 'vbd' : site, der + 1, der + 3000)[0];
  const r = { ppi: ppiT != null ? Math.round(ppiT - der) : null, pptcl: ppiT != null && tcl ? Math.round(ppiT - der - tcl) : null, reponse: null,
    interpretable: true, motif: null, arret: false, sa: null, va: null, savA: null, pseudo: false };
  // tachycardie persistante après l'arrêt : battements réguliers au voisinage du cycle initial
  const ref = ventriculaire ? battementsV(j, der + 1, der + 4000).filter(v => !coeur.stims.some(s => Math.abs(s.t - v) < 5)) : activations(j, 'hra', der + 1, der + 4000);
  const apres = ecarts(ref), c0 = mediane(apres.slice(1));
  r.arret = !tcl || apres.length < 3 || c0 == null || Math.abs(c0 - tcl) > Math.max(40, 0.15 * tcl);
  if (!dernier?.capture) { r.interpretable = false; r.motif = trad('perte de capture au dernier stimulus', 'loss of capture on the last stimulus'); }
  else if (r.arret) { r.interpretable = false; r.motif = trad('tachycardie arrêtée par la stimulation', 'tachycardia terminated by pacing'); }
  if (ventriculaire) {
    const Aent = j.find(x => x.s === 'hra' && x.r === `stim:${der}`)?.t;
    const Aavant = activations(j, 'hra', der - 4 * (cl ?? tcl) - 50, Aent ?? der);
    const suit = Aent != null && cl != null && Aavant.length >= 3 && ecarts(Aavant).slice(-2).every(d => Math.abs(d - cl) <= 12);
    if (!suit) {
      r.reponse = trad('atrium non entraîné (pas de conduction rétrograde 1:1)', 'atrium not entrained (no 1:1 retrograde conduction)');
      if (r.interpretable) { r.interpretable = false; r.motif = r.reponse; }
    } else {
      r.sa = Math.round(Aent - der);
      if (debut != null) { // VA de la tachycardie avant la stimulation : QRS → OD haute
        const V = battementsV(j, debut - 3 * tcl, debut).filter(v => !coeur.stims.some(s => Math.abs(s.t - v) < 5));
        const va = V.map(v => activations(j, 'hra', v + 1, v + tcl)[0] - v).filter(x => !Number.isNaN(x));
        if (va.length) { r.va = Math.round(mediane(va)); r.savA = r.sa - r.va; }
      }
      const V = battementsV(j, Aent + 1, Aent + 1500).filter(v => !coeur.stims.some(s => Math.abs(s.t - v) < 5));
      const A = activations(j, 'hra', Aent + 5, Aent + 1500);
      const H = j.filter(x => x.s === 'his' && x.t > Aent - 30 && x.t < Aent + 1500 && x.r !== `stim:${der}` && !coeur.stims.some(s => x.r === `stim:${s.t}`)).map(x => x.t);
      if (A.length && V.length) {
        const parV = A[0] < V[0], parH = H.length ? A[0] < H[0] : parV;
        r.pseudo = parV && !parH; // A avant le V, mais H avant le second A : bloc sous le His, pas de V-A-A-V vraie
        r.reponse = parV && parH ? 'V-A-A-V' : 'V-A-V';
      }
    }
  }
  if (!r.interpretable) { r.ppi = r.arret || !dernier?.capture ? null : r.ppi; r.pptcl = r.ppi == null ? null : r.pptcl; if (r.arret) r.reponse = null; }
  return r;
}

// Effet d'une ESV délivrée à l'instant te pendant une tachycardie de cycle tcl : avance (> 0) ou retard de l'atrium suivant.
export function analyserESV(coeur, te, tcl) {
  const b = bilanESV(coeur, te, tcl);
  return b.avance;
}
// Bilan complet d'une ESV His-réfractaire : capture, His réellement réfractaire, conduction VA 1:1 avant l'ESV,
// avance (> 0) ou retard (< 0) de l'A suivant par rapport à l'A attendu, arrêt de la tachycardie (avec ou sans atteindre l'atrium).
export function bilanESV(coeur, te, tcl) {
  const j = coeur.journal, st = coeur.stims.find(s => Math.abs(s.t - te) < 0.5);
  const cA = cycleSite(j, 'hra', te - 3000, te), cV = mediane(ecarts(battementsV(j, te - 3000, te - 1)));
  const acl = cA ?? tcl;
  const r = { capture: !!st?.capture, hisCapte: j.some(x => x.s === 'his' && x.r === `stim:${te}`), unUn: cA != null && cV != null && Math.abs(cA - cV) < 0.1 * cA,
    avance: null, arret: false, arretSansA: false };
  const Aprev = activations(j, 'hra', te - 1.5 * acl, te).at(-1);
  if (Aprev == null || !acl) return r;
  const attendu = Aprev + acl, Asuiv = activations(j, 'hra', te + 1, te + 3 * acl);
  const Anext = Asuiv[0];
  if (Anext != null && Anext < attendu + 0.6 * acl) r.avance = Math.round(attendu - Anext);
  const V = battementsV(j, te + 1, te + 4 * acl).filter(v => Math.abs(v - te) > 5);
  const reg = ecarts(Asuiv).slice(0, 3), soutenue = reg.length >= 2 && reg.every(d => Math.abs(d - acl) < 0.2 * acl);
  r.arret = !soutenue && V.length < 3;
  r.arretSansA = r.arret && (Anext == null || Anext > attendu + 0.6 * acl);
  return r;
}

// Stimulation para-hisienne : intervalle stimulus-A à chaque site atrial, avec et sans capture (réelle) du His.
// Réponse nodale : le S-A s'allonge partout, séquence inchangée ; extranodale : S-A constant au site le plus précoce ;
// les deux (fusion) : la séquence d'activation change quand on perd la capture du His.
export const SITES_A = ['hra', 'ras', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1'];
export function analyserParaHis(coeur, temps) {
  const g = { haut: {}, bas: {} };
  for (const ts of temps) {
    const st = coeur.stims.find(s => Math.abs(s.t - ts) < 0.5); if (!st?.capture) continue;
    const m = st.his ? g.haut : g.bas;
    for (const s of SITES_A) { const a = coeur.journal.find(x => x.r === `stim:${ts}` && x.s === s)?.t; if (a != null) (m[s] ??= []).push(a - ts); }
  }
  const moy = l => (l?.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null);
  const H = Object.fromEntries(SITES_A.map(s => [s, moy(g.haut[s])])), B = Object.fromEntries(SITES_A.map(s => [s, moy(g.bas[s])]));
  const premier = M => SITES_A.filter(s => M[s] != null).sort((a, b) => M[a] - M[b])[0] ?? null;
  const pH = premier(H), pB = premier(B);
  if (!pH || !pB) return { H, B, pH, pB, type: null };
  const d = B[pB] - (H[pB] ?? B[pB]), dHis = B.ras != null && H.ras != null ? B.ras - H.ras : null;
  const type = Math.abs(d) <= 10 ? (pH !== pB || (dHis != null && dHis >= 25) ? 'fusion' : 'extranodal') : d >= 25 && pH === pB ? 'nodal' : 'intermediaire';
  return { H, B, pH, pB, d, dHis, type };
}

// Réponse à un stimulus délivré à l'instant ts : capture, activations qu'il a produites (même événement racine)
// sur l'atrium (His A, OD haute), le His et les ventricules ; intervalles AH, HV et stimulus-A.
export function reponseStim(coeur, ts) {
  const st = coeur.stims.find(s => Math.abs(s.t - ts) < 0.5);
  const r = `stim:${ts}`, de = site => coeur.journal.find(x => x.r === r && x.s === site)?.t ?? null;
  const A = de('ras'), H = de('his'), Ahra = de('hra');
  const V = coeur.journal.filter(x => x.r === r && ['vsep', 'vbd', 'vps', 'rva', 'lvl'].includes(x.s)).map(x => x.t);
  const atr = coeur.journal.filter(x => x.r === r && ['hra', 'ras', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1'].includes(x.s)).map(x => x.t);
  return { capture: !!st?.capture, his: !!st?.his, A, Ahra, H, V: V.length ? Math.min(...V) : null,
    AH: A != null && H != null && H > A ? Math.round(H - A) : null, HV: H != null && V.length ? Math.round(Math.min(...V) - H) : null,
    SA: atr.length ? Math.round(Math.min(...atr) - ts) : null };
}

// Temps de récupération sinusale après une salve terminée à tDer : premier battement sinusal sur l'OD haute.
export function recuperationSinusale(coeur, tDer) {
  const sa = coeur.journal.find(x => x.s === 'sa' && x.o === 'auto' && x.t > tDer);
  if (!sa) return null;
  const hra = coeur.journal.find(x => x.s === 'hra' && x.r === sa.r);
  return Math.round((hra?.t ?? sa.t) - tDer);
}

// Pression artérielle (mmHg) par un modèle de Windkessel : chaque battement éjecte un volume qui dépend du remplissage
// (RR précédent) et de la contraction atriale (onde A 80 à 260 ms avant le QRS). Échantillons toutes les 4 ms sur [t0, t1].
export function pressionArterielle(journal, t0, t1) {
  const pas = 4, tau = 850, debut = t0 - 6000;
  const V = battementsV(journal, debut - 2000, t1), A = activations(journal, 'hra', debut - 2000, t1);
  const ejections = V.map((v, i) => {
    const rr = i ? v - V[i - 1] : 800;
    const remplissage = Math.max(0.2, Math.min(1, (rr - 150) / 450));
    const kick = A.some(a => v - a > 80 && v - a < 260) ? 1.18 : 0.85;
    return { t: v + 60, d: Math.min(300, 0.38 * rr + 60), vol: remplissage * kick };
  });
  // avant le premier battement enregistré (début de l'enregistrement), la pression reste à une valeur diastolique habituelle
  let P = 80, k = 0;
  const out = [], premier = ejections[0]?.t ?? Infinity;
  for (let t = debut; t <= t1; t += pas) {
    if (t < premier) { if (t >= t0) out.push([t, P]); continue; }
    while (k < ejections.length && ejections[k].t + ejections[k].d < t) k++;
    let q = 0;
    for (let j = Math.max(0, k - 1); j < ejections.length && ejections[j].t <= t; j++) {
      const e = ejections[j], u = (t - e.t) / e.d;
      if (u >= 0 && u <= 1) q += e.vol * Math.sin(Math.PI * u) * (Math.PI / 2) / e.d;
    }
    P += pas * (-(P - 8) / tau + 63 * q);
    if (t >= t0) out.push([t, P]);
  }
  return out;
}
// Systolique, diastolique et moyenne sur les dernières secondes.
export function constantes(journal, t, duree = 4000) {
  const p = pressionArterielle(journal, t - duree, t);
  if (!p.length) return null;
  const v = p.map(x => x[1]);
  const sys = Math.max(...v), dia = Math.min(...v), moy = v.reduce((a, b) => a + b, 0) / v.length;
  return { sys: Math.round(sys), dia: Math.round(dia), moy: Math.round(moy) };
}

// Temps d'activation local d'un site pendant une tachycardie, relatif à une référence (ms), ramené dans une fenêtre
// d'un cycle [-0,7 × TCL, +0,3 × TCL[ ; médiane des derniers battements.
export function tempsLocal(journal, site, reference, t, tcl) {
  const loc = activations(journal, site, t - 3000, t), ref = activations(journal, reference, t - 3000 - tcl, t);
  if (!loc.length || !ref.length || !tcl) return null;
  const d = loc.map(x => {
    const r = ref.filter(y => y <= x + 0.3 * tcl).at(-1);
    return r == null ? null : x - r;
  }).filter(x => x != null).map(x => { let y = x; while (y >= 0.3 * tcl) y -= tcl; while (y < -0.7 * tcl) y += tcl; return y; });
  return d.length ? Math.round(mediane(d)) : null;
}

// Met le cœur en tachycardie avant l'arrivée de l'utilisateur (patient adressé en tachycardie) : essaie chaque recette
// jusqu'à obtenir une tachycardie soutenue. Recette : { site, extra: [S2 de départ, S2 minimal] } (8 × 600 ms + S2 dégressif)
// ou { site, salve: cycle, n }. Renvoie la recette qui a réussi, ou null.
export function induireTachycardie(coeur, recettes) {
  const c = coeur;
  for (const r of recettes) {
    const couplages = r.salve ? [null] : Array.from({ length: Math.floor((r.extra[0] - r.extra[1]) / 10) + 1 }, (_, i) => r.extra[0] - 10 * i);
    for (const s2 of couplages) {
      let t = c.t + 100;
      if (r.salve) for (let i = 0; i < r.n; i++) { c.stimuler(r.site, t); if (i < r.n - 1) t += r.salve; }
      else { for (let i = 0; i < 8; i++) { c.stimuler(r.site, t); if (i < 7) t += 600; } t += s2; c.stimuler(r.site, t); }
      c.avancer(t + 3500);
      if (tachycardie(c).active) return { ...r, s2 };
      c.choc(); c.avancer(c.t + 1500);
    }
  }
  return null;
}
