// Rendu des voies du simulateur : 2 dérivations de surface (DII, V1) et 8 électrogrammes endocavitaires
// (OD haute, His, sinus coronaire 9-10 → 1-2, VD apex), calculés à partir du journal d'activations.

// Formes élémentaires des déflexions (τ en ms depuis l'activation locale).
const g = (x, c, s) => Math.exp(-(((x - c) / s) ** 2));
const FORMES = {
  local: τ => g(τ, 0, 3) - 0.75 * g(τ, 5, 3.5) + 0.25 * g(τ, 11, 4),         // électrogramme bipolaire local (A)
  large: τ => 0.9 * g(τ, 0, 5) - 0.8 * g(τ, 9, 5.5) + 0.2 * g(τ, 19, 6),     // ventriculaire local
  his: τ => g(τ, 0, 2) - 0.7 * g(τ, 3.5, 2),                                // potentiel hisien, bref
  loin: τ => 0.8 * g(τ, 12, 10) - 0.45 * g(τ, 34, 12),                        // champ lointain
};
const PORTEE = { local: [-10, 25], large: [-15, 40], his: [-6, 10], loin: [-20, 70] };

export const CANAUX = [
  { id: 'II', nom: 'DII', surface: true, h: 1.35 },
  { id: 'V1', nom: 'V1', surface: true, h: 1.35 },
  { id: 'hra', nom: 'OD haute', court: 'ODh', coul: 'od', src: [['hra', 1, 'local'], ['vsep', 0.14, 'loin', 15]] },
  { id: 'his', nom: 'His', coul: 'his', src: [['ras', 0.75, 'local'], ['his', 0.5, 'his'], ['vsep', 0.95, 'large', 5]] },
  { id: 'cs9', nom: 'SC 9-10', court: 'SC 9', coul: 'sc', src: [['cs9', 1, 'local'], ['vsep', 0.35, 'loin', 10]] },
  { id: 'cs7', nom: 'SC 7-8', court: 'SC 7', coul: 'sc', src: [['cs7', 1, 'local'], ['vsep', 0.35, 'loin', 15]] },
  { id: 'cs5', nom: 'SC 5-6', court: 'SC 5', coul: 'sc', src: [['cs5', 1, 'local'], ['lvl', 0.4, 'loin', -10]] },
  { id: 'cs3', nom: 'SC 3-4', court: 'SC 3', coul: 'sc', src: [['cs3', 1, 'local'], ['lvl', 0.45, 'loin', -5]] },
  { id: 'cs1', nom: 'SC 1-2', court: 'SC 1', coul: 'sc', src: [['cs1', 1, 'local'], ['lvl', 0.5, 'loin', 0]] },
  { id: 'rva', nom: 'VD apex', court: 'VD', coul: 'vd', src: [['rva', 1.1, 'large'], ['ras', 0.08, 'loin', 10]] },
];
const SITE_CANAL = { hra: 'hra', cs9: 'cs9', cs1: 'cs1', rva: 'rva' };
const ATRIUM = ['sa', 'hra', 'ras', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1'];
const VENTRICULES = ['vsep', 'rva', 'lvl'];

// Regroupe des activations en battements (écart > seuil depuis le début du battement).
function grouper(journal, sites, t0, t1, seuil) {
  const r = [];
  for (const x of journal) {
    if (x.t < t0 || x.t > t1 || !sites.includes(x.s)) continue;
    const b = r.at(-1);
    if (b && x.t - b.debut <= seuil) { b.t[x.s] ??= x.t; b.fin = Math.max(b.fin, x.t); } else r.push({ debut: x.t, fin: x.t, t: { [x.s]: x.t }, premier: x.s });
  }
  return r;
}

// Complexes de surface : chaque battement devient une petite liste de gaussiennes {c, s, a} par dérivation.
function composantesSurface(journal, t0, t1) {
  const comp = { II: [], V1: [] };
  const add = (d, c, s, a) => comp[d].push({ c, s, a });
  for (const p of grouper(journal, ATRIUM, t0 - 300, t1, 110)) {
    const dur = p.fin - p.debut, c = p.debut + dur / 2 + 20, s = (dur + 70) / 4;
    const haut = ['sa', 'hra'].includes(p.premier), gauche = ['cs1', 'cs3', 'cs5'].includes(p.premier);
    // P : positive en DII si origine haute, négative si origine basse (septale ou anneau mitral inféro-latéral)
    add('II', c, s, haut ? 0.16 : p.premier === 'cs1' ? 0.04 : gauche ? -0.08 : -0.15);
    add('V1', c - s * 0.4, s * 0.6, gauche ? 0.14 : 0.08);
    add('V1', c + s * 0.5, s * 0.6, gauche ? 0.06 : haut ? -0.05 : -0.1);
  }
  const qrs = grouper(journal, VENTRICULES, t0 - 700, t1, 130);
  qrs.forEach((b, i) => {
    const tv = b.t.vsep ?? b.fin, tr = b.t.rva ?? b.fin, tl = b.t.lvl ?? b.fin;
    const pre = Math.max(0, Math.min(1, (tv - tl - 5) / 30)), pace = Math.max(0, Math.min(1, (tv - tr - 5) / 15));
    const norm = Math.max(0, 1 - pre - pace);
    const W = 85 + 1.3 * Math.max(0, b.fin - b.debut - 45), o = b.debut;
    const q = (d, u, s, a) => add(d, o + u * W, s * W, a);
    // QRS fin : qR en DII, rS en V1
    q('II', 0.12, 0.06, -0.12 * norm); q('II', 0.42, 0.09, 1.0 * norm); q('II', 0.66, 0.07, -0.22 * norm);
    q('V1', 0.2, 0.07, 0.22 * norm); q('V1', 0.52, 0.11, -0.9 * norm);
    // préexcitation latérale gauche : onde delta, R large en DII et en V1
    q('II', 0.22, 0.16, 0.35 * pre); q('II', 0.55, 0.13, 0.75 * pre);
    q('V1', 0.22, 0.14, 0.35 * pre); q('V1', 0.56, 0.15, 0.85 * pre);
    // stimulation apicale du VD : QS large en DII et V1 (aspect de bloc de branche gauche, axe hyper-gauche)
    q('II', 0.45, 0.2, -0.95 * pace); q('V1', 0.1, 0.05, 0.1 * pace); q('V1', 0.5, 0.2, -0.95 * pace);
    // onde T : discordante si le QRS est large
    const rr = i ? o - qrs[i - 1].debut : 800;
    const tT = o + Math.max(200, 390 * Math.sqrt(Math.min(1200, rr) / 1000)) - 40;
    add('II', tT, 45, 0.26 * norm - 0.18 * pre - 0.3 * pace);
    add('V1', tT, 45, -0.06 * norm - 0.15 * pre + 0.28 * pace);
  });
  return comp;
}

function couleurs(el) {
  const cs = getComputedStyle(el);
  const v = n => cs.getPropertyValue(n).trim();
  return { fond: v('--simu-fond'), grille: v('--simu-grille'), grille2: v('--simu-grille-2'), texte: v('--simu-texte'), surface: v('--simu-surface'),
    od: v('--simu-od'), his: v('--simu-his'), sc: v('--simu-sc'), vd: v('--simu-vd'), stim: v('--simu-stim'), curseur: v('--simu-curseur') };
}

// Dessine la fenêtre [tFin - fenetre, tFin]. Options : etiquettes (A/H/V sur le His), curseurs [tA, tB], stims.
export function dessinerSimu(canvas, coeur, { tFin, fenetre = 4000, etiquettes = false, curseurs = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const L = canvas.clientWidth, etroit = L < 500, marge = etroit ? 40 : 70;
  const unite = etroit ? 34 : 40;
  const H = Math.round(CANAUX.reduce((s, c) => s + (c.h || 1) * unite, 0) + 22);
  if (canvas.width !== Math.round(L * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(L * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = `${H}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = couleurs(canvas);
  const t0 = tFin - fenetre, largeur = L - marge, pxms = largeur / fenetre;
  const X = t => marge + (t - t0) * pxms;
  ctx.fillStyle = C.fond; ctx.fillRect(0, 0, L, H);

  // quadrillage temporel : 100 ms et 1 s
  for (let t = Math.ceil(t0 / 100) * 100; t <= tFin; t += 100) {
    const sec = Math.abs(t % 1000) < 1;
    if (!sec && pxms * 100 < 6) continue;
    ctx.strokeStyle = sec ? C.grille2 : C.grille; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(X(t)) + 0.5, 0); ctx.lineTo(Math.round(X(t)) + 0.5, H - 18); ctx.stroke();
    if (sec) { ctx.fillStyle = C.texte; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${Math.round(t / 1000)} s`, X(t), H - 5); }
  }

  const j = coeur.journal;
  const surf = composantesSurface(j, t0, tFin);
  const stims = coeur.stims.filter(s => s.t >= t0 - 5 && s.t <= tFin);
  let y = 0;
  const pas = Math.min(2, 1 / (2 * pxms)); // au moins 2 échantillons par pixel, et un toutes les 2 ms
  for (const canal of CANAUX) {
    const h = (canal.h || 1) * unite, mid = y + h / 2, gain = h * (canal.surface ? 0.42 : 0.36);
    ctx.fillStyle = C.texte; ctx.font = `600 ${etroit ? 10 : 12}px system-ui, sans-serif`; ctx.textAlign = 'left';
    ctx.fillText(etroit ? canal.court || canal.nom : canal.nom, 5, mid + 4);
    // événements de la voie (triés), parcourus avec un pointeur glissant
    let ev = [];
    if (canal.surface) ev = surf[canal.id].map(c => ({ t: c.c - 3 * c.s, f: x => c.a * g(x, c.c, c.s), fin: c.c + 3 * c.s }));
    else {
      for (const [site, amp, forme, dec = 0] of canal.src) {
        const [a, b] = PORTEE[forme], f = FORMES[forme];
        for (const x of j) if (x.s === site && x.t + dec + b >= t0 && x.t + dec + a <= tFin) { const tc = x.t + dec; ev.push({ t: tc + a, fin: tc + b, f: τ => amp * f(τ - tc) }); }
      }
    }
    ev.sort((p, q) => p.t - q.t);
    ctx.save();
    ctx.beginPath(); ctx.rect(marge, y + 1, largeur, h - 2); ctx.clip();
    ctx.strokeStyle = canal.surface ? C.surface : C[canal.coul]; ctx.lineWidth = canal.surface ? 1.4 : 1.2; ctx.lineJoin = 'round';
    ctx.beginPath();
    let debut = 0;
    for (let t = t0; t <= tFin; t += pas) {
      while (debut < ev.length && ev[debut].fin < t - 80) debut++;
      let v = 0;
      for (let k = debut; k < ev.length && ev[k].t <= t; k++) if (ev[k].fin >= t) v += ev[k].f(t);
      const py = mid - Math.max(-1.3, Math.min(1.3, v)) * gain;
      if (t === t0) ctx.moveTo(X(t), py); else ctx.lineTo(X(t), py);
    }
    ctx.stroke();
    // artéfacts de stimulation : trait vertical, ample sur la voie stimulée
    ctx.lineWidth = 1.2;
    for (const s of stims) {
      const a = SITE_CANAL[s.s] === canal.id ? 1.3 : canal.surface ? 0.5 : 0.3;
      ctx.beginPath(); ctx.moveTo(X(s.t), mid + a * gain * 0.3); ctx.lineTo(X(s.t), mid - a * gain); ctx.stroke();
    }
    ctx.restore();
    // étiquettes A / H / V sur le cathéter de His
    if (etiquettes && canal.id === 'his') {
      ctx.fillStyle = C.his; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      for (const x of j) {
        const lettre = { ras: 'A', his: 'H', vsep: 'V' }[x.s];
        if (lettre && x.t >= t0 && x.t <= tFin) ctx.fillText(lettre, X(x.t + (x.s === 'vsep' ? 5 : 0)), y + 11);
      }
    }
    y += h;
  }
  // marqueurs de stimulation en haut
  ctx.fillStyle = C.stim; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const s of stims) ctx.fillText(s.capture ? 'S' : 's', X(s.t), 10);
  // compas
  if (curseurs) {
    const [a, b] = curseurs;
    ctx.strokeStyle = C.curseur; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    for (const t of [a, b]) if (t != null) { ctx.beginPath(); ctx.moveTo(X(t), 0); ctx.lineTo(X(t), H - 18); ctx.stroke(); }
    ctx.setLineDash([]);
    if (a != null && b != null) {
      const txt = `${Math.round(Math.abs(b - a))} ms`, xm = (X(a) + X(b)) / 2;
      ctx.font = '700 13px system-ui, sans-serif'; const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = C.curseur; ctx.fillRect(xm - w / 2, 14, w, 20);
      ctx.fillStyle = C.fond; ctx.textAlign = 'center'; ctx.fillText(txt, xm, 29);
    }
  }
  return { marge, pxms, t0, hauteur: H };
}
