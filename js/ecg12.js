// Affichage d'un vrai ECG 12 dérivations (fichiers data/ecg/*.json, issus de PTB-XL).
// Disposition classique 3 × 4 (2,5 s par dérivation) + DII long de 10 s, 25 mm/s, 10 mm/mV.
import { papier, etalonnage } from './ecg.js';

const DISPOSITION = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
const cacheECG = new Map();

export async function chargerECG12(fichier) {
  if (!cacheECG.has(fichier)) {
    cacheECG.set(fichier, fetch(`data/ecg/${fichier}.json`).then(r => {
      if (!r.ok) throw new Error('ECG introuvable');
      return r.json();
    }).catch(e => { cacheECG.delete(fichier); throw e; }));
  }
  return cacheECG.get(fichier);
}

export function dessinerECG12(canvas, ecg, opts = {}) {
  const marge = 10, colonne = 62.5, ligne = 30;
  const mmL = marge + 4 * colonne + 2, mmH = 4 * ligne + 6;
  const largeurDispo = canvas.parentElement?.clientWidth || 700;
  const pxmm = opts.pxmm || Math.max(2.6, largeurDispo / mmL);
  const { ctx } = papier(canvas, mmL, mmH, pxmm);
  const idx = Object.fromEntries(ecg.derivations.map((d, i) => [d.toLowerCase(), i]));
  const fs = ecg.fs, parMm = fs / 25; // échantillons par millimètre à 25 mm/s
  const x0 = marge * pxmm;

  ctx.font = `600 ${Math.max(10, 3.2 * pxmm)}px system-ui, sans-serif`;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ecg-trace').trim() || '#111';

  const tracer = (sig, debut, fin, xDebut, yBase) => {
    ctx.beginPath();
    for (let i = debut; i < fin && i < sig.length; i++) {
      const X = xDebut + ((i - debut) / parMm) * pxmm;
      const mv = Math.max(-2.4, Math.min(2.4, sig[i] / 1000)); // écrêtage doux pour ne pas déborder
      const Y = yBase - mv * 10 * pxmm;
      i === debut ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
    }
    ctx.stroke();
  };

  const n25 = Math.round(2.5 * fs);
  DISPOSITION.forEach((rang, r) => {
    const yBase = (r * ligne + ligne * 0.62) * pxmm;
    ctx.lineWidth = 1.2;
    etalonnage(ctx, 1 * pxmm, yBase, pxmm);
    rang.forEach((nom, c) => {
      const sig = ecg.signaux[idx[nom.toLowerCase()]];
      const xDebut = x0 + c * colonne * pxmm;
      ctx.lineWidth = 1.1;
      tracer(sig, c * n25, (c + 1) * n25, xDebut, yBase);
      ctx.fillText(nom, xDebut + 1.5 * pxmm, yBase - 12 * pxmm);
      if (c) { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(xDebut, yBase - 4 * pxmm); ctx.lineTo(xDebut, yBase + 4 * pxmm); ctx.stroke(); }
    });
  });
  const yLong = (3 * ligne + ligne * 0.62) * pxmm;
  ctx.lineWidth = 1.2;
  etalonnage(ctx, 1 * pxmm, yLong, pxmm);
  ctx.lineWidth = 1.1;
  tracer(ecg.signaux[idx.ii], 0, 10 * fs, x0, yLong);
  ctx.fillText('II', x0 + 1.5 * pxmm, yLong - 12 * pxmm);
  return { pxmm, x0 };
}
