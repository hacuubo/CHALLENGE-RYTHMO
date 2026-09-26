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

// Analyse d'un entraînement (salve arrêtée à l'instant der, au cycle cl, depuis le site stimulé) :
// réponse (V-A-V ou V-A-A-V pour un entraînement ventriculaire), PPI mesuré sur le site stimulé, PPI − TCL.
export function analyserEntrainement(coeur, { der, site, tcl, ventriculaire }) {
  const j = coeur.journal;
  const ppiT = activations(j, site === 'parahis' ? 'vbd' : site, der + 1, der + 3000)[0];
  const r = { ppi: ppiT != null ? Math.round(ppiT - der) : null, pptcl: ppiT != null && tcl ? Math.round(ppiT - der - tcl) : null, reponse: null };
  if (ventriculaire) {
    const Aent = j.find(x => x.s === 'hra' && x.r === `stim:${der}`)?.t;
    if (Aent != null) {
      const V = battementsV(j, Aent + 1, Aent + 1500).filter(v => !coeur.stims.some(s => Math.abs(s.t - v) < 5));
      const A = activations(j, 'hra', Aent + 5, Aent + 1500);
      if (A.length && V.length) r.reponse = A[0] < V[0] ? 'V-A-A-V' : 'V-A-V';
    } else r.reponse = trad('atrium non entraîné (pas de conduction rétrograde 1:1)', 'atrium not entrained (no 1:1 retrograde conduction)');
  }
  return r;
}

// Effet d'une ESV délivrée à l'instant te pendant une tachycardie de cycle tcl : avance (> 0) ou retard de l'atrium suivant.
export function analyserESV(coeur, te, tcl) {
  const A = activations(coeur.journal, 'hra', te - tcl - 50, te + 1.5 * tcl);
  if (A.length < 2) return null;
  const ecartsA = A.slice(1).map((x, i) => x - A[i]);
  const avance = tcl - Math.min(...ecartsA), retard = Math.max(...ecartsA) - tcl;
  return Math.round(avance > 5 || avance >= retard ? avance : -retard);
}
