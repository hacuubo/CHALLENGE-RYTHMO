// Rendu de la baie d'électrophysiologie : dérivations de surface (D1, D2, aVF, V1, V6) et électrogrammes
// endocavitaires (OD haute, OD latérale, Halo, His proximal et distal, sinus coronaire, VD apex, sonde d'ablation),
// calculés à partir du journal d'activations du moteur.
// Vitesse de défilement en mm/s (comme sur papier) ; affichage en balayage avec barre d'effacement ou en défilement.
// Voie de pression artérielle (modèle de Windkessel), filtres (secteur 50 Hz, passe-haut des électrogrammes),
// saturation des amplificateurs après un choc et potentiel de polarisation après chaque stimulus.
import { pressionArterielle, battementsV } from './analyse.js';

import { t } from '../i18n.js';

export const PX_PAR_MM = 96 / 25.4; // pixels CSS par millimètre
export const VITESSES = [12.5, 25, 50, 100, 200, 400];

const g = (x, c, s) => Math.exp(-(((x - c) / s) ** 2));

// Signature propre à chaque site (déterministe) : les électrogrammes n'ont pas tous la même forme.
function hash(str) { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }
const SIGNATURES = {};
function signature(site) {
  if (SIGNATURES[site]) return SIGNATURES[site];
  const r = k => hash(site + k);
  const frag = { cti: 3, tv2: 5, tv1: 3, tv3: 3 }[site] || 0; // isthme et cicatrice : électrogrammes fragmentés, de faible amplitude
  const comp = [{ c: 0, s: 2.6 + r('s') * 1.2, a: 1 }, { c: 4.5 + r('c1') * 2, s: 3 + r('s1'), a: -(0.6 + 0.3 * r('a1')) }, { c: 10 + r('c2') * 4, s: 3.5 + r('s2') * 2, a: 0.15 + 0.3 * r('a2') }];
  for (let k = 0; k < frag; k++) comp.push({ c: 12 + k * (9 + 6 * r('f' + k)), s: 2 + r('g' + k), a: (k % 2 ? -1 : 1) * (0.25 + 0.35 * r('h' + k)) });
  const amp = frag ? 0.45 : 0.8 + 0.4 * r('amp');
  return (SIGNATURES[site] = { comp, amp, fin: 25 + frag * 15 });
}
const FORMES = {
  local: site => { const sg = signature(site); return { f: τ => sg.amp * sg.comp.reduce((s, k) => s + k.a * g(τ, k.c, k.s), 0), portee: [-10, sg.fin] }; },
  large: () => ({ f: τ => 0.9 * g(τ, 0, 5) - 0.8 * g(τ, 9, 5.5) + 0.25 * g(τ, 19, 7) - 0.1 * g(τ, 30, 8), portee: [-15, 50] }),
  his: () => ({ f: τ => g(τ, 0, 1.8) - 0.75 * g(τ, 3.2, 1.8) + 0.2 * g(τ, 6, 2), portee: [-6, 12] }),
  loin: () => ({ f: τ => 0.8 * g(τ, 12, 10) - 0.45 * g(τ, 34, 12), portee: [-20, 70] }),
  // unipolaire : déflexion négative (QS) à l'arrivée du front d'activation
  uni: () => ({ f: τ => -g(τ, 8, 7) + 0.25 * g(τ, 25, 10), portee: [-25, 60] }),
};

// Voies d'enregistrement (noms selon la langue : conventions internationales en anglais). src : [site, amplitude, forme, décalage ms].
export const CANAUX = [
  { id: 'I', get nom() { return t('D1', 'I'); }, surface: true },
  { id: 'II', get nom() { return t('D2', 'II'); }, surface: true },
  { id: 'aVF', nom: 'aVF', surface: true },
  { id: 'V1', nom: 'V1', surface: true },
  { id: 'V6', nom: 'V6', surface: true },
  { id: 'hra', get nom() { return t('OD haute', 'HRA'); }, get court() { return t('ODh', 'HRA'); }, coul: 'od', src: [['hra', 1, 'local'], ['vsep', 0.12, 'loin', 15]] },
  // OD latérale basse, au contact de l'entrée latérale de l'isthme cavo-tricuspide
  { id: 'odl', get nom() { return t('OD lat', 'Lat RA'); }, get court() { return t('ODl', 'LRA'); }, coul: 'od', src: [['latb', 1, 'local'], ['cti', 0.3, 'loin', 5], ['rva', 0.12, 'loin', 5]] },
  { id: 'h78', nom: 'Halo 7-8', court: 'H7', coul: 'halo', src: [['lath', 1, 'local'], ['vsep', 0.1, 'loin', 20]] },
  { id: 'h56', nom: 'Halo 5-6', court: 'H5', coul: 'halo', src: [['latm', 1, 'local'], ['rva', 0.1, 'loin', 10]] },
  { id: 'h34', nom: 'Halo 3-4', court: 'H3', coul: 'halo', src: [['latb', 1, 'local'], ['rva', 0.12, 'loin', 5]] },
  { id: 'h12', nom: 'Halo 1-2', court: 'H1', coul: 'halo', src: [['cti', 1, 'local'], ['rva', 0.25, 'loin', 0]] },
  { id: 'hisp', nom: 'His p', court: 'Hp', coul: 'his', src: [['ras', 1, 'local'], ['his', 0.22, 'his'], ['vsep', 0.35, 'loin', 5]] },
  { id: 'hisd', nom: 'His d', court: 'Hd', coul: 'his', src: [['ras', 0.45, 'local'], ['his', 0.55, 'his'], ['bbd', 0.18, 'his', 2], ['vsep', 0.95, 'large', 5]] },
  { id: 'cs9', get nom() { return t('SC 9-10', 'CS 9-10'); }, get court() { return t('SC9', 'CS9'); }, coul: 'sc', src: [['cs9', 1, 'local'], ['vps', 0.35, 'loin', 0]] },
  { id: 'cs7', get nom() { return t('SC 7-8', 'CS 7-8'); }, get court() { return t('SC7', 'CS7'); }, coul: 'sc', src: [['cs7', 1, 'local'], ['vps', 0.35, 'loin', 8]] },
  { id: 'cs5', get nom() { return t('SC 5-6', 'CS 5-6'); }, get court() { return t('SC5', 'CS5'); }, coul: 'sc', src: [['cs5', 1, 'local'], ['lvl', 0.4, 'loin', -12]] },
  { id: 'cs3', get nom() { return t('SC 3-4', 'CS 3-4'); }, get court() { return t('SC3', 'CS3'); }, coul: 'sc', src: [['cs3', 1, 'local'], ['lvl', 0.45, 'loin', -6]] },
  { id: 'cs1', get nom() { return t('SC 1-2', 'CS 1-2'); }, get court() { return t('SC1', 'CS1'); }, coul: 'sc', src: [['cs1', 1, 'local'], ['lvl', 0.5, 'loin', 0]] },
  { id: 'rva', get nom() { return t('VD apex', 'RVA'); }, get court() { return t('VD', 'RV'); }, coul: 'vd', src: [['rva', 1.1, 'large'], ['ras', 0.08, 'loin', 10]] },
  { id: 'abld', nom: 'ABL d', court: 'ABd', coul: 'abl', src: [] },  // renseignées selon la position de la sonde
  { id: 'ablu', nom: 'ABL uni', court: 'ABu', coul: 'abl', src: [] },
  { id: 'pa', get nom() { return t('PA', 'ABP'); }, get court() { return t('PA', 'ABP'); }, coul: 'pa', pression: true },
];

export const MONTAGES = {
  standard: { get nom() { return t('Standard (TSV)', 'Standard (SVT)'); }, voies: ['I', 'II', 'V1', 'hra', 'odl', 'hisp', 'hisd', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1', 'rva', 'pa'] },
  flutter: { nom: 'Flutter (Halo)', voies: ['I', 'II', 'aVF', 'V1', 'hra', 'h78', 'h56', 'h34', 'h12', 'hisd', 'cs9', 'cs5', 'cs1', 'rva', 'pa'] },
  ablation: { nom: 'Ablation', voies: ['I', 'II', 'aVF', 'V1', 'V6', 'hisd', 'cs9', 'cs5', 'cs1', 'rva', 'abld', 'ablu', 'pa'] },
  compact: { get nom() { return t('Réduit (téléphone)', 'Compact (phone)'); }, voies: ['II', 'V1', 'hra', 'odl', 'hisd', 'cs9', 'cs1', 'rva', 'abld'] },
  complet: { get nom() { return t('Complet', 'Full'); }, voies: CANAUX.map(c => c.id) },
};

// Sites de stimulation → dipôles qui les portent (par ordre de préférence) : on ne stimule que sur une voie affichée,
// et l'artéfact principal s'inscrit sur le premier de ces dipôles présent à l'écran.
export const VOIES_SITE = { hra: ['hra'], latb: ['odl', 'h34'], cti: ['h12'], cs9: ['cs9'], cs1: ['cs1'], parahis: ['hisd', 'hisp'], rva: ['rva'], abl: ['abld', 'ablu'] };
// Latence entre le stimulus et l'électrogramme local capturé (ms) : le complexe suit le spike, il ne se confond pas avec lui.
export const LATENCE_CAPTURE = { local: 14, large: 18, his: 8 };
const VENTRICULES_LOC = new Set(['vsep', 'vbd', 'vps', 'rva', 'lvl', 'tv1', 'tv2', 'tv3']);
const latence = (x, forme) => (x.o === 'stim' ? LATENCE_CAPTURE[forme] ?? (VENTRICULES_LOC.has(x.s) ? 18 : 14) : 0);
const ATRIUM = ['sa', 'hra', 'lath', 'latm', 'latb', 'cti', 'ras', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1', 'ogs', 'oga', 'foyer'];
const VENTRICULES = ['vsep', 'vbd', 'vps', 'rva', 'lvl'];
const DERIV = ['I', 'II', 'aVF', 'V1', 'V6'];

function grouper(journal, sites, t0, t1, seuil) {
  const r = [];
  for (const x of journal) {
    if (x.t < t0 || x.t > t1 || !sites.includes(x.s)) continue;
    const b = r.at(-1);
    if (b && x.t - b.debut <= seuil) { b.t[x.s] ??= x.t; b.fin = Math.max(b.fin, x.t); b.fa ||= x.o === 'fa'; }
    else r.push({ debut: x.t, fin: x.t, t: { [x.s]: x.t }, premier: x.s, fa: x.o === 'fa' });
  }
  return r;
}

// Amplitudes des ondes P selon l'origine [D1, D2, aVF, V1, V6].
const P_ORIGINE = {
  haute: [0.08, 0.15, 0.12, 0.07, 0.07],
  septale: [0.03, -0.15, -0.16, 0.06, -0.04],
  gauche: [-0.09, 0.06, 0.05, 0.14, -0.06],
  gaucheBasse: [-0.06, -0.09, -0.1, 0.12, -0.04],
  droiteBasse: [0.08, -0.1, -0.12, -0.05, 0.05],
};
const categorieP = s => (['sa', 'hra', 'lath'].includes(s) ? 'haute' : ['cs1', 'oga'].includes(s) ? 'gauche' : ['cs3', 'cs5', 'foyer'].includes(s) ? 'gaucheBasse'
  : ['latm', 'latb'].includes(s) ? 'droiteBasse' : 'septale');

// QRS : composantes (position relative u dans le QRS, largeur relative, amplitude) par dérivation et par morphologie.
const QRS = {
  normal: { I: [[0.15, 0.06, -0.05], [0.42, 0.09, 0.7], [0.68, 0.07, -0.1]], II: [[0.12, 0.06, -0.1], [0.42, 0.09, 1.0], [0.66, 0.07, -0.2]],
    aVF: [[0.42, 0.09, 0.6], [0.66, 0.07, -0.1]], V1: [[0.2, 0.07, 0.22], [0.52, 0.11, -0.9]], V6: [[0.12, 0.05, -0.1], [0.44, 0.1, 1.0], [0.7, 0.07, -0.12]] },
  // retard droit : onde S large et terminale en D1 et V6, rSR' en V1
  bbd: { I: [[0.3, 0.1, 0.6], [0.78, 0.12, -0.3]], II: [[0.3, 0.1, 0.8], [0.78, 0.12, -0.25]], aVF: [[0.3, 0.1, 0.5]],
    V1: [[0.12, 0.06, 0.2], [0.35, 0.09, -0.45], [0.75, 0.12, 0.85]], V6: [[0.3, 0.1, 0.9], [0.78, 0.13, -0.35]] },
  // retard gauche (bloc de branche gauche, préexcitation de type Mahaim) : QS en V1, R large crocheté en D1 et V6
  bbg: { I: [[0.35, 0.16, 0.7], [0.65, 0.14, 0.55]], II: [[0.45, 0.2, 0.45]], aVF: [[0.45, 0.2, 0.2]], V1: [[0.1, 0.05, 0.08], [0.5, 0.2, -1.0]],
    V6: [[0.35, 0.16, 0.8], [0.65, 0.14, 0.7]] },
  // stimulation apicale du VD : retard gauche avec axe hyper-gauche (négatif en D2 et aVF)
  apex: { I: [[0.45, 0.2, 0.55]], II: [[0.45, 0.2, -0.8]], aVF: [[0.45, 0.2, -0.9]], V1: [[0.5, 0.2, -0.9]], V6: [[0.45, 0.2, -0.45]] },
  // activation débutant sur la paroi latérale du VG (préexcitation latérale gauche, TV de sortie latérale) : delta négative en D1, R en V1
  lateraleG: { I: [[0.25, 0.16, -0.45], [0.6, 0.12, -0.2]], II: [[0.22, 0.16, 0.35], [0.55, 0.13, 0.55]], aVF: [[0.22, 0.16, 0.35], [0.55, 0.13, 0.5]],
    V1: [[0.22, 0.14, 0.35], [0.56, 0.15, 0.85]], V6: [[0.22, 0.14, 0.2], [0.55, 0.13, 0.45]] },
};
// ondes T [D1, D2, aVF, V1, V6] : concordantes si QRS fin, opposées à la déflexion principale du QRS sinon
const T_ONDE = { normal: [0.2, 0.3, 0.2, -0.05, 0.25], bbd: [0.15, 0.2, 0.15, -0.2, 0.2], bbg: [-0.2, -0.2, -0.1, 0.25, -0.2],
  apex: [-0.15, 0.25, 0.3, 0.2, 0.15], lateraleG: [0.2, -0.15, -0.15, -0.2, 0.1] };

// Composantes gaussiennes {c, s, a} des dérivations de surface sur la fenêtre [t0, t1].
export function composantesSurface(journal, t0, t1, stims) {
  const comp = Object.fromEntries(DERIV.map(d => [d, []]));
  const add = (c, s, a) => { DERIV.forEach((d, i) => { if (a[i]) comp[d].push({ c, s, a: a[i] }); }); };
  // macroréentrée atriale (flutter) : cycle atrial court, activation étalée sur tout le cycle, en l'absence de stimulation
  const hra = journal.filter(x => x.s === 'hra' && x.t >= t0 - 800 && x.t <= t1).map(x => x.t);
  const zonesFlutter = [];
  for (let i = 0; i + 1 < hra.length; i++) {
    const h = hra[i], cycle = hra[i + 1] - h;
    if (cycle >= 320 || stims.some(x => x.t > h - 1200 && x.t <= h + cycle)) continue;
    const ts = journal.filter(x => x.t >= h && x.t < h + cycle && ATRIUM.includes(x.s) && x.o !== 'fa').map(x => x.t);
    if (ts.length < 5 || Math.max(...ts) - Math.min(...ts) < 0.55 * cycle) continue;
    zonesFlutter.push([h - 5, h + cycle - 5]);
    const tc = id => journal.find(x => x.s === id && x.t >= h && x.t < h + cycle)?.t;
    const lh = tc('lath'), lb = tc('latb'), ct = tc('cti'), ras = tc('ras') ?? h + cycle * 0.35;
    if (lh < lb && lb < ct) { add(ras, cycle * 0.2, [0.02, -0.2, -0.22, 0.15, -0.05]); add(ras + cycle * 0.4, cycle * 0.1, [0, 0.07, 0.07, -0.03, 0.02]); } // antihoraire : dents de scie négatives en inférieur
    else if (ct < lb && lb < lh) add(ras + cycle * 0.2, cycle * 0.22, [0.04, 0.16, 0.16, -0.1, 0.05]); // horaire : F positives en inférieur, négatives en V1
    else add(h + cycle * 0.4, cycle * 0.2, [-0.08, 0.13, 0.13, 0.12, -0.06]); // circuit gauche (péri-mitral)
  }
  const dansFlutter = t => zonesFlutter.some(([a, b]) => t >= a && t < b);
  const ondesP = grouper(journal, ATRIUM, t0 - 400, t1, 110);
  ondesP.forEach(p => {
    const dur = p.fin - p.debut, c = p.debut + dur / 2 + 20, s = (dur + 70) / 4;
    if (p.fa) { add(p.debut + 30, 22, DERIV.map((_, k) => (hash(Math.round(p.debut) + ':' + k) - 0.5) * 0.14)); return; } // ondes f désordonnées
    if (dansFlutter(p.debut)) return;
    const cat = categorieP(p.premier), P = P_ORIGINE[cat];
    add(c, s, P);
    if (cat === 'haute') add(c + s * 0.6, s * 0.5, [0, 0, 0, -0.05, 0]); // P biphasique en V1
  });
  const qrs = grouper(journal, VENTRICULES, t0 - 700, t1, 130);
  qrs.forEach((b, i) => {
    const tv = b.t.vsep ?? b.fin, tr = b.t.rva ?? b.fin, tl = b.t.lvl ?? b.fin;
    const pre = Math.max(0, Math.min(1, (tv - tl - 5) / 30));
    const gauche = Math.max(0, Math.min(1, (tv - Math.min(tr, b.t.vbd ?? tr) - 5) / 20)) * (1 - pre);
    const droit = Math.max(0, Math.min(1, (tr - tv - 20) / 25)) * (1 - pre) * (1 - gauche);
    const norm = Math.max(0, 1 - pre - gauche - droit);
    // activation débutant à l'apex du VD sans passer par la branche droite (stimulation apicale, voie atrio-fasciculaire) : axe gauche ou supérieur
    const tbd = journal.find(x => x.s === 'bbd' && Math.abs(x.t - tr) < 80)?.t;
    const paceApex = stims.some(x => x.s === 'rva' && Math.abs(x.t - b.debut) < 8) || (tbd == null || tr < tbd) && tr <= b.debut + 5;
    const paraHis = stims.find(x => x.s === 'parahis' && Math.abs(x.t - b.debut) < 8);
    // para-hisien : capture du His = QRS fin (activation par le tissu de conduction) ; myocarde seul = QRS large de type retard gauche
    const poids = paraHis ? (paraHis.his ? { normal: 1 } : { bbg: 1 }) : { normal: norm, bbd: droit, lateraleG: pre, [paceApex ? 'apex' : 'bbg']: gauche };
    const W = paraHis ? (paraHis.his ? 100 : 145) : 85 + 1.3 * Math.max(0, b.fin - b.debut - 45), o = b.debut;
    for (const [m, w] of Object.entries(poids)) if (w > 0.01) for (const d of DERIV) for (const [u, s, a] of QRS[m][d] || []) comp[d].push({ c: o + u * W, s: s * W, a: a * w });
    const rr = i ? o - qrs[i - 1].debut : 800;
    const tT = o + Math.max(200, 390 * Math.sqrt(Math.min(1200, rr) / 1000)) - 40;
    DERIV.forEach((d, k) => comp[d].push({ c: tT, s: 45, a: Object.entries(poids).reduce((sum, [m, w]) => sum + w * T_ONDE[m][k], 0) }));
  });
  return comp;
}

function couleurs(el) {
  const cs = getComputedStyle(el);
  const v = n => cs.getPropertyValue(n).trim();
  return { fond: v('--simu-fond'), grille: v('--simu-grille'), grille2: v('--simu-grille-2'), texte: v('--simu-texte'), surface: v('--simu-surface'),
    od: v('--simu-od'), halo: v('--simu-halo'), his: v('--simu-his'), sc: v('--simu-sc'), vd: v('--simu-vd'), abl: v('--simu-abl'), stim: v('--simu-stim'), curseur: v('--simu-curseur'),
    pa: v('--simu-pa') || '#ff6b6b' };
}

// Bruit reproductible : table pseudo-aléatoire indexée par le temps (même tracé d'une image à l'autre).
const BRUIT = Float32Array.from({ length: 8192 }, (_, i) => (hash('b' + i) - 0.5) * 2);
const bruit = (t, k) => BRUIT[(Math.floor(t * 2) + k * 977) & 8191];

export const marges = L => (L < 500 ? 38 : 84);
export const fenetreMs = (L, vitesse) => (L - marges(L)) / (vitesse * PX_PAR_MM / 1000);

// Dessine la baie. Options :
//  tFin (instant affiché le plus récent), vitesse (mm/s), mode ('balayage' | 'defilement'), voies (ids affichés), gains {id: facteur},
//  etiquettes (A/H/V sur le His d), curseurs [[tA, tB], …], report (compas reporté), bruit, ablation {a, v} (sites vus par la sonde),
//  hauteurMax (px : les voies se resserrent pour tenir), filtre50 (faux : parasite secteur visible), passeHaut (faux : dérive de la ligne de base).
export function dessinerSimu(canvas, coeur, o = {}) {
  const { tFin, vitesse = 100, mode = 'balayage', voies = MONTAGES.standard.voies, gains = {}, etiquettes = false, curseurs = [], report = false,
    bruit: avecBruit = true, ablation = null, hauteurMax = 0, filtre50 = true, passeHaut = true } = o;
  const dpr = window.devicePixelRatio || 1;
  const L = canvas.clientWidth, etroit = L < 500, marge = marges(L);
  const canaux = CANAUX.filter(c => voies.includes(c.id));
  let hSurf = etroit ? 40 : 50, hEndo = etroit ? 30 : 36;
  const naturelle = canaux.reduce((s, c) => s + (c.surface || c.pression ? hSurf : hEndo), 0);
  if (hauteurMax && naturelle + 24 > hauteurMax) { const f = Math.max(0.45, (hauteurMax - 24) / naturelle); hSurf *= f; hEndo *= f; }
  const H = Math.round(canaux.reduce((s, c) => s + (c.surface || c.pression ? hSurf : hEndo), 0) + 24);
  if (canvas.width !== Math.round(L * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(L * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = `${H}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = couleurs(canvas);
  const largeur = L - marge, pxms = vitesse * PX_PAR_MM / 1000, fenetre = largeur / pxms;
  ctx.fillStyle = C.fond; ctx.fillRect(0, 0, L, H);

  // Segments : [tDébut, tFin, xDébut]. En balayage, le tracé s'écrit de gauche à droite puis repart à gauche
  // en effaçant l'ancien balayage devant le curseur (barre d'effacement).
  const effacement = 14;
  let segments;
  if (mode === 'balayage') {
    const xCur = (((tFin % fenetre) + fenetre) % fenetre) * pxms;
    const tDebutBalayage = tFin - xCur / pxms;
    segments = [[tDebutBalayage, tFin, marge]];
    if (xCur + effacement < largeur) segments.push([tDebutBalayage - fenetre + (xCur + effacement) / pxms, tDebutBalayage, marge + xCur + effacement]);
  } else segments = [[tFin - fenetre, tFin, marge]];
  const tMin = Math.min(...segments.map(s => s[0])), tMax = tFin;
  const X = (t, seg) => seg[2] + (t - seg[0]) * pxms;
  const segDe = t => segments.find(s => t >= s[0] && t <= s[1]);

  // quadrillage : 1 mm (s'il reste lisible) et 5 mm, comme le papier ; secondes repérées
  const pas1 = 1000 / vitesse;
  for (const seg of segments) {
    const petit = pas1 * pxms >= 5;
    const pasG = petit ? pas1 : pas1 * 5;
    for (let n = Math.ceil(seg[0] / pasG); n * pasG <= seg[1]; n++) {
      const t = n * pasG, cinq = petit ? n % 5 === 0 : true;
      ctx.strokeStyle = cinq ? C.grille2 : C.grille; ctx.lineWidth = 1;
      const x = Math.round(X(t, seg)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 20); ctx.stroke();
    }
    ctx.fillStyle = C.texte; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let t = Math.ceil(seg[0] / 1000) * 1000; t <= seg[1]; t += 1000) ctx.fillText(`${Math.round(t / 1000)} s`, X(t, seg), H - 6);
  }

  const j = coeur.journal.filter(x => x.t >= tMin - 800 && x.t <= tMax + 5);
  const stims = coeur.stims.filter(s => s.t >= tMin - 1500 && s.t <= tMax);
  const surf = composantesSurface(j, tMin, tMax, stims);
  const chocs = (coeur.chocs || []).filter(t => t <= tMax && t + 1500 >= tMin);
  const saturation = t => { let x = 0; for (const c of chocs) if (t >= c && t < c + 1500) x += 2.2 * Math.exp(-(t - c) / 350); return x; };
  const pas = Math.min(2, 1 / (2 * pxms));
  let y = 0;
  const rangees = [];
  canaux.forEach((canal, k) => {
    const h = canal.surface || canal.pression ? hSurf : hEndo, mid = y + h / 2, gv = gains[canal.id] || 1, gain = h * (canal.surface ? 0.42 : 0.36);
    if (canal.pression) { // pression artérielle : 30 à 170 mmHg sur la hauteur de la voie
      ctx.fillStyle = C.texte; ctx.font = `600 ${etroit ? 10 : 12}px system-ui, sans-serif`; ctx.textAlign = 'left';
      ctx.fillText(canal.nom, 4, mid + 4);
      const p = pressionArterielle(coeur.journal, tMin, tMax), Y = mm => y + h - 2 - (Math.max(30, Math.min(170, mm)) - 30) / 140 * (h - 4);
      ctx.save(); ctx.beginPath(); ctx.rect(marge, y + 1, largeur, h - 2); ctx.clip();
      ctx.strokeStyle = C.pa; ctx.lineWidth = 1.3;
      for (const seg of segments) {
        ctx.beginPath(); let premier = true;
        for (const [t, mm] of p) { if (t < seg[0] || t > seg[1]) continue; if (premier) { ctx.moveTo(X(t, seg), Y(mm)); premier = false; } else ctx.lineTo(X(t, seg), Y(mm)); }
        ctx.stroke();
      }
      ctx.restore();
      rangees.push({ id: canal.id, y0: y, y1: y + h }); y += h;
      return;
    }
    const voieStim = s => (VOIES_SITE[s.canal ?? s.s] || []).find(v => voies.includes(v));
    const stimsIci = stims.filter(s => voieStim(s) === canal.id);
    ctx.fillStyle = C.texte; ctx.font = `600 ${etroit ? 10 : 12}px system-ui, sans-serif`; ctx.textAlign = 'left';
    ctx.fillText(etroit ? canal.court || canal.nom : canal.nom, 4, mid + 4);
    if (gv !== 1 && !etroit) { ctx.font = '10px system-ui, sans-serif'; ctx.fillText(`×${gv}`, 4, mid + 15); }
    let ev = [];
    if (canal.surface) ev = surf[canal.id].map(c => ({ t: c.c - 3 * c.s, f: x => c.a * g(x, c.c, c.s), fin: c.c + 3 * c.s }));
    else {
      let src = canal.src;
      if (canal.id === 'abld') src = ablation ? [[ablation.a, 0.9, 'local'], [ablation.v, 0.9, 'large', 3]] : [];
      if (canal.id === 'ablu') src = ablation ? [[ablation.a, 0.6, 'uni'], [ablation.v, 0.8, 'uni']] : [];
      for (const [site, amp, forme, dec = 0] of src) {
        if (!site) continue;
        const { f, portee: [a, b] } = FORMES[forme](site);
        for (const x of j) {
          if (x.s !== site) continue;
          const tc = x.t + dec + (forme === 'loin' ? 0 : latence(x, forme));
          if (tc + b >= tMin && tc + a <= tMax) ev.push({ t: tc + a, fin: tc + b, f: τ => amp * f(τ - tc) });
        }
      }
    }
    ev.sort((p, q) => p.t - q.t);
    ctx.save();
    ctx.beginPath(); ctx.rect(marge, y + 1, largeur, h - 2); ctx.clip();
    ctx.strokeStyle = canal.surface ? C.surface : C[canal.coul]; ctx.lineWidth = canal.surface ? 1.3 : 1.1; ctx.lineJoin = 'round';
    for (const seg of segments) {
      ctx.beginPath();
      let debut = 0, premier = true;
      for (let t = seg[0]; t <= seg[1]; t += pas) {
        while (debut < ev.length && ev[debut].fin < t - 90) debut++;
        let v = 0;
        for (let q = debut; q < ev.length && ev[q].t <= t; q++) if (ev[q].fin >= t) v += ev[q].f(t);
        for (const s of stimsIci) if (t > s.t && t - s.t < 60) v += 0.4 * Math.exp(-(t - s.t) / 7); // polarisation brève après le stimulus
        v *= gv;
        if (avecBruit) v += canal.surface ? 0.012 * bruit(t, k) + 0.04 * Math.sin(t / 1600 + k) : 0.02 * bruit(t, k) + 0.012 * Math.sin(t * 0.314 + k);
        if (!filtre50) v += 0.09 * Math.sin(2 * Math.PI * t / 20 + k);
        if (!passeHaut && !canal.surface) v += 0.35 * Math.sin(2 * Math.PI * t / 4200 + k * 0.7) + 0.12 * Math.sin(t / 700 + k);
        if (chocs.length) v += saturation(t) * (k % 2 ? 1 : -1);
        const py = mid - Math.max(-1.3, Math.min(1.3, v)) * gain;
        if (premier) { ctx.moveTo(X(t, seg), py); premier = false; } else ctx.lineTo(X(t, seg), py);
      }
      ctx.stroke();
    }
    // artéfacts de stimulation : trait vertical, ample sur la voie stimulée
    ctx.lineWidth = 1.2;
    for (const s of stims) {
      const seg = segDe(s.t); if (!seg) continue;
      const a = voieStim(s) === canal.id ? 1.3 : canal.surface ? 0.5 : 0.3;
      ctx.beginPath(); ctx.moveTo(X(s.t, seg), mid + a * gain * 0.3); ctx.lineTo(X(s.t, seg), mid - a * gain); ctx.stroke();
    }
    ctx.restore();
    if (etiquettes && canal.id === 'hisd') {
      ctx.fillStyle = C.his; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      for (const x of j) {
        const lettre = { ras: 'A', his: 'H', vsep: 'V' }[x.s], seg = segDe(x.t);
        if (lettre && seg) ctx.fillText(lettre, X(x.t + (x.s === 'vsep' ? 5 : 0), seg), y + 10);
      }
    }
    rangees.push({ id: canal.id, y0: y, y1: y + h });
    y += h;
    ctx.strokeStyle = C.grille; ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(marge - 4, y + 0.5); ctx.stroke();
  });

  // marqueurs de stimulation : cycle au début d'un train, couplage de chaque extrastimulus
  ctx.fillStyle = C.stim; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center';
  const tous = coeur.stims.filter(s => s.t >= tMin - 3000 && s.t <= tMax);
  tous.forEach((s, i) => {
    const seg = segDe(s.t); if (!seg) return;
    const p = tous[i - 1], ecart = p && s.t - p.t < 2000 ? Math.round(s.t - p.t) : null;
    const ecartP = i > 1 && p.t - tous[i - 2].t < 2000 ? Math.round(p.t - tous[i - 2].t) : null;
    let txt = '';
    if (s.lib) txt = s.lib; // train programmé : numéro du S1 dans le train, couplage des extrastimulus
    else if (ecart == null) txt = 'S';
    else if (ecartP == null || Math.abs(ecart - ecartP) > 4) txt = `${ecart}`;
    if (!s.capture) txt = txt ? `${txt}·` : '·';
    if (txt) ctx.fillText(txt, X(s.t, seg), 10);
  });
  if (mode === 'balayage') { const xc = X(tFin, segments[0]); ctx.fillStyle = C.fond; ctx.fillRect(xc + 1, 0, effacement - 1, H - 20); }
  // compas (affichés en revue, en défilement)
  if (curseurs.length && mode !== 'balayage') {
    ctx.strokeStyle = C.curseur; ctx.lineWidth = 1.5;
    const seg = segments[0];
    curseurs.forEach(([a, b], n) => {
      const lignes = [a, b].filter(v => v != null);
      if (report && n === curseurs.length - 1 && a != null && b != null && Math.abs(b - a) > 20) for (let t = b + (b - a); t <= seg[1]; t += b - a) lignes.push(t);
      ctx.setLineDash(n === curseurs.length - 1 ? [5, 4] : [2, 3]);
      for (const t of lignes) { ctx.beginPath(); ctx.moveTo(X(t, seg), 14); ctx.lineTo(X(t, seg), H - 20); ctx.stroke(); }
      ctx.setLineDash([]);
      if (a != null && b != null) {
        const txt = `${Math.round(Math.abs(b - a))} ms`, xm = (X(a, seg) + X(b, seg)) / 2;
        ctx.font = '700 12px system-ui, sans-serif'; const w = ctx.measureText(txt).width + 10;
        ctx.fillStyle = C.curseur; ctx.fillRect(xm - w / 2, 14 + n * 20, w, 18);
        ctx.fillStyle = C.fond; ctx.textAlign = 'center'; ctx.fillText(txt, xm, 27 + n * 20);
      }
    });
  }
  return { marge, pxms, t0: mode === 'balayage' ? null : segments[0][0], hauteur: H, fenetre, rangees };
}

// Instants remarquables d'une voie (pour aimanter les compas) : activations locales, début des QRS et des ondes P en surface,
// stimulus.
export function evenementsCanal(id, coeur, ablation = null) {
  const canal = CANAUX.find(c => c.id === id); if (!canal) return [];
  const j = coeur.journal, r = coeur.stims.map(s => s.t);
  if (canal.surface) {
    const P = []; let der = -1e9;
    for (const x of j) if (ATRIUM.includes(x.s) && x.t - der > 150) { P.push(x.t); der = x.t; }
    return [...r, ...battementsV(j), ...P];
  }
  if (canal.pression) return battementsV(j).map(t => t + 60);
  let src = canal.src;
  if (id === 'abld' || id === 'ablu') src = ablation ? [[ablation.a, 1, 'local'], [ablation.v, 1, 'large']] : [];
  return [...r, ...src.filter(x => x[0]).flatMap(([site, , forme, dec = 0]) => j.filter(x => x.s === site).map(x => x.t + dec + (forme === 'loin' ? 0 : latence(x, forme))))];
}
