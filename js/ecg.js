// Générateur de bandes de rythme ECG synthétiques (dérivation type DII, 25 mm/s, 10 mm/mV).
// Un tracé est décrit par un preset (voir docs/FORMAT_QUESTIONS.md) ; la synthèse additionne
// des gaussiennes (ondes P, QRS, T) et trace les spikes de stimulation comme des traits verticaux.

const DUREE = 10000; // ms

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Trace {
  constructor(rand) {
    this.g = [];        // gaussiennes {c, a, s}
    this.spikes = [];   // {t, a}
    this.fonds = [];    // fonctions additionnelles f(t)
    this.rand = rand;
  }
  gauss(c, a, s) { this.g.push({ c, a, s }); }
  spike(t, a = 1.6) { this.spikes.push({ t, a }); }

  p(t, a = 0.14) { this.gauss(t + 45, a, 22); }
  pRetro(t) { this.gauss(t, -0.13, 20); }
  qt(rr) { return Math.min(460, Math.max(280, 400 * Math.sqrt(rr / 1000))); }

  qrsFin(x, rr = 850) {
    this.gauss(x + 8, -0.08, 7);
    this.gauss(x + 28, 1.15, 9);
    this.gauss(x + 48, -0.28, 9);
    this.gauss(x + this.qt(rr) - 110, 0.3, 48);
  }
  qrsLarge(x, rr = 850) { // aspect de bloc de branche / QRS élargi d'origine supraventriculaire
    this.gauss(x + 20, 0.5, 16);
    this.gauss(x + 70, 0.85, 22);
    this.gauss(x + 125, -0.2, 18);
    this.gauss(x + this.qt(rr) - 80, -0.28, 55);
  }
  qrsVentriculaire(x, rr = 850, sens = 1) { // ESV / TV / échappement ventriculaire
    this.gauss(x + 45, 1.1 * sens, 30);
    this.gauss(x + 115, -0.45 * sens, 30);
    this.gauss(x + Math.min(this.qt(rr), rr * 0.55) - 30, -0.35 * sens, 55);
  }
  qrsStimuleVD(x, rr = 1000) {
    this.spike(x);
    this.gauss(x + 55, -0.95, 30);
    this.gauss(x + 130, 0.3, 30);
    this.gauss(x + this.qt(rr) - 40, 0.38, 58);
  }
  qrsBiV(x, rr = 1000) {
    this.spike(x);
    this.gauss(x + 32, -0.6, 17);
    this.gauss(x + 78, 0.5, 18);
    this.gauss(x + this.qt(rr) - 90, 0.22, 50);
  }
  pStimulee(t) { this.spike(t, 1.2); this.gauss(t + 55, 0.12, 30); }

  value(t) {
    let v = 0;
    for (const { c, a, s } of this.g) {
      const d = t - c;
      if (d > -5 * s && d < 5 * s) v += a * Math.exp(-(d * d) / (2 * s * s));
    }
    for (const f of this.fonds) v += f(t);
    return v;
  }
}

// ----- Presets -------------------------------------------------------------------------

function jitter(rand, x, pct = 0.02) { return x * (1 + (rand() * 2 - 1) * pct); }

const presets = {
  sinus(T, o) {
    const rr = 60000 / (o.fc || 72), pr = o.pr || 160;
    for (let t = 200; t < DUREE; t += jitter(T.rand, rr)) {
      T.p(t);
      o.qrs === 'large' ? T.qrsLarge(t + pr, rr) : T.qrsFin(t + pr, rr);
    }
  },
  bav1(T, o) { presets.sinus(T, { ...o, pr: o.pr || 320 }); },
  'bav2-m1'(T, o) {
    const rr = 60000 / (o.fc || 80), n = o.cycle || 4;
    const inc = [0, 110, 55, 30, 20, 15];
    let k = 0, pr = 200;
    for (let t = 150; t < DUREE; t += jitter(T.rand, rr, 0.01)) {
      T.p(t);
      if (k < n - 1) {
        pr = 200 + inc.slice(0, k + 1).reduce((s, x) => s + x, 0);
        T.qrsFin(t + pr, rr);
        k++;
      } else k = 0;
    }
  },
  'bav2-m2'(T, o) {
    const rr = 60000 / (o.fc || 75), n = o.ratio || 3;
    let i = 0;
    for (let t = 150; t < DUREE; t += jitter(T.rand, rr, 0.01), i++) {
      T.p(t);
      if ((i + 1) % n !== 0) o.qrs === 'fin' ? T.qrsFin(t + 180, rr) : T.qrsLarge(t + 180, rr);
    }
  },
  'bav2-21'(T, o) {
    const rr = 60000 / (o.fc || 84);
    let i = 0;
    for (let t = 150; t < DUREE; t += rr, i++) {
      T.p(t);
      if (i % 2 === 0) o.qrs === 'large' ? T.qrsLarge(t + 200, rr * 2) : T.qrsFin(t + 200, rr * 2);
    }
  },
  bav3(T, o) {
    const rra = 60000 / (o.fc || 82), rrv = 60000 / (o.fv || 36);
    for (let t = 100; t < DUREE; t += jitter(T.rand, rra, 0.03)) T.p(t);
    for (let t = 600; t < DUREE; t += jitter(T.rand, rrv, 0.01)) {
      o.qrs === 'fin' ? T.qrsFin(t, rrv) : T.qrsVentriculaire(t, rrv);
    }
  },
  'pause-sinusale'(T, o) {
    const rr = 60000 / (o.fc || 72), pause = o.pause || 3200;
    let t = 200, i = 0;
    while (t < DUREE) {
      T.p(t); T.qrsFin(t + 160, rr);
      t += i === 3 ? pause : jitter(T.rand, rr);
      i++;
    }
  },
  esa(T, o) {
    const rr = 60000 / (o.fc || 72);
    let t = 200, i = 0;
    while (t < DUREE) {
      const premature = i === 3 || i === 8;
      if (premature) { T.gauss(t + 40, -0.06, 18); T.gauss(t + 60, 0.1, 18); } else T.p(t);
      T.qrsFin(t + 150, rr);
      const next = i === 2 || i === 7 ? rr * 0.6 : premature ? rr * 1.1 : rr;
      t += jitter(T.rand, next, 0.01); i++;
    }
  },
  esv(T, o) {
    const rr = 60000 / (o.fc || 75);
    let t = 200, i = 0;
    while (t < DUREE) {
      T.p(t); T.qrsFin(t + 160, rr);
      const esv = o.bigeminisme ? true : i === 2 || i === 6;
      if (esv) {
        const x = t + 160 + rr * 0.55;
        if (x < DUREE) T.qrsVentriculaire(x, rr);
        t += rr * 2; // repos compensateur
        i += 1;
      } else t += jitter(T.rand, rr);
      i++;
    }
  },
  fa(T, o) {
    const rr = 60000 / (o.fc || 105);
    const ph = [T.rand() * 6, T.rand() * 6, T.rand() * 6];
    T.fonds.push(t => 0.045 * Math.sin(t / 1000 * 2 * Math.PI * 6.1 + ph[0])
      + 0.03 * Math.sin(t / 1000 * 2 * Math.PI * 7.7 + ph[1]) + 0.02 * Math.sin(t / 1000 * 2 * Math.PI * 4.3 + ph[2]));
    for (let t = 250; t < DUREE; t += rr * (0.55 + T.rand() * 0.9)) {
      o.qrs === 'large' ? T.qrsLarge(t, rr) : T.qrsFin(t, rr);
    }
  },
  flutter(T, o) {
    const cyc = 200; // 300/min
    T.fonds.push(t => { // dents de scie négatives en DII
      const ph = ((t % cyc) + cyc) % cyc / cyc;
      return ph < 0.7 ? 0.16 - 0.46 * (ph / 0.7) : -0.3 + 0.46 * ((ph - 0.7) / 0.3);
    });
    let t = 150;
    while (t < DUREE) {
      const c = o.conduction === 'variable' ? [2, 4, 3, 2, 4][Math.floor(T.rand() * 5)] : (o.conduction || 2);
      T.qrsFin(t, c * cyc);
      t += c * cyc;
    }
  },
  tsv(T, o) {
    const rr = 60000 / (o.fc || 185);
    for (let t = 150; t < DUREE; t += rr) {
      T.gauss(t + 8, -0.06, 7); T.gauss(t + 28, 1.1, 9); T.gauss(t + 48, -0.25, 9);
      T.gauss(t + rr * 0.5, 0.22, 35);
    }
  },
  wpw(T, o) {
    const rr = 60000 / (o.fc || 72);
    for (let t = 200; t < DUREE; t += jitter(T.rand, rr)) {
      T.p(t);
      const x = t + 95;
      T.gauss(x + 25, 0.35, 20); // onde delta
      T.gauss(x + 60, 1.05, 12); T.gauss(x + 82, -0.2, 10);
      T.gauss(x + 330, -0.15, 50);
    }
  },
  tv(T, o) {
    const rr = 60000 / (o.fc || 170);
    for (let t = 100; t < DUREE; t += rr) T.qrsVentriculaire(t, rr);
    for (let t = 300; t < DUREE; t += 60000 / 78) T.gauss(t + 45, 0.1, 20); // dissociation AV
  },
  torsades(T) {
    const rr0 = 1100;
    T.p(150); T.qrsFin(310, rr0); T.gauss(310 + 440, 0.4, 70);
    const deb = 1300, rr = 240;
    for (let t = deb; t < DUREE; t += jitter(T.rand, rr, 0.08)) {
      const env = 0.35 + 1.1 * Math.abs(Math.sin((t - deb) / 2400 * Math.PI));
      const sens = Math.sin((t - deb) / 2400 * Math.PI) >= 0 ? 1 : -1;
      T.gauss(t + 50, env * sens, 34);
      T.gauss(t + 140, -0.55 * env * sens, 36);
    }
  },
  fv(T) {
    const ph = Array.from({ length: 4 }, () => T.rand() * 6);
    T.fonds.push(t => {
      const s = t / 1000;
      const env = 0.35 + 0.25 * Math.sin(2 * Math.PI * 0.4 * s + ph[3]);
      return env * (Math.sin(2 * Math.PI * 4.7 * s + ph[0]) + 0.6 * Math.sin(2 * Math.PI * 6.3 * s + ph[1])
        + 0.4 * Math.sin(2 * Math.PI * 3.1 * s + ph[2]));
    });
  },
  aai(T, o) {
    const rr = 60000 / (o.fc || 70);
    for (let t = 200; t < DUREE; t += rr) { T.pStimulee(t); T.qrsFin(t + 200, rr); }
  },
  vvi(T, o) {
    const rr = 60000 / (o.fc || 60);
    presetsFond.fa(T);
    for (let t = 300; t < DUREE; t += rr) T.qrsStimuleVD(t, rr);
  },
  ddd(T, o) {
    const rr = 60000 / (o.fc || 70), av = o.av || 170;
    for (let t = 200; t < DUREE; t += rr) { T.pStimulee(t); T.qrsStimuleVD(t + av, rr); }
  },
  vdd(T, o) {
    const rr = 60000 / (o.fc || 78), av = o.av || 150;
    for (let t = 200; t < DUREE; t += jitter(T.rand, rr)) { T.p(t); T.qrsStimuleVD(t + av, rr); }
  },
  crt(T, o) {
    const rr = 60000 / (o.fc || 72), av = o.av || 110;
    for (let t = 200; t < DUREE; t += jitter(T.rand, rr)) { T.p(t); T.qrsBiV(t + av, rr); }
  },
  'perte-capture-v'(T, o) {
    const rr = 60000 / (o.fc || 60);
    for (let t = 80; t < DUREE; t += 60000 / 84) T.p(t); // BAV complet sous-jacent
    let i = 0;
    for (let t = 300; t < DUREE; t += rr, i++) {
      if (i === 2 || i === 3 || i === 6) T.spike(t); else T.qrsStimuleVD(t, rr);
    }
  },
  'perte-capture-a'(T, o) {
    const rr = 60000 / (o.fc || 70);
    let i = 0;
    for (let t = 200; t < DUREE; t += rr, i++) {
      if (i === 3 || i === 7) { T.spike(t, 1.2); continue; }
      T.pStimulee(t); T.qrsFin(t + 200, rr);
    }
  },
  'sous-detection'(T, o) {
    // rythme sinusal spontané + stimulation ventriculaire à fréquence fixe, non inhibée
    const rrs = 60000 / 78, rrp = 60000 / (o.fc || 60), refr = 380;
    const ev = [];
    for (let t = 150; t < DUREE; t += jitter(T.rand, rrs, 0.02)) ev.push({ t, k: 'p' }, { t: t + 160, k: 'q' });
    for (let t = 520; t < DUREE; t += rrp) ev.push({ t, k: 's' });
    ev.sort((a, b) => a.t - b.t);
    let dernierQRS = -1000;
    for (const e of ev) {
      if (e.k === 'p') T.p(e.t);
      else if (e.k === 'q') { if (e.t - dernierQRS > refr && e.t < DUREE) { T.qrsFin(e.t, rrs); dernierQRS = e.t; } }
      else if (e.t - dernierQRS > refr) { T.qrsStimuleVD(e.t, rrp); dernierQRS = e.t; }
      else T.spike(e.t);
    }
  },
  'sur-detection'(T, o) {
    const rr = 60000 / (o.fc || 60);
    const debPause = 300 + 3 * rr, finPause = debPause + 2800;
    for (let t = 90; t < DUREE; t += 60000 / 80) T.p(t);
    let t = 300;
    while (t < DUREE) {
      if (t > debPause && t < finPause) { t = finPause; continue; }
      T.qrsStimuleVD(t, rr); t += rr;
    }
    const r = T.rand;
    const bruit = Array.from({ length: 400 }, () => r() * 2 - 1);
    T.fonds.push(x => (x > debPause - 400 && x < finPause - 300)
      ? 0.09 * bruit[Math.floor(x / 7) % 400] : 0); // myopotentiels
  },
  ttre(T, o) {
    const rr0 = 60000 / 70, rr = 60000 / (o.fc || 120);
    T.pStimulee(200); T.qrsStimuleVD(370, rr0);
    T.pStimulee(200 + rr0); T.qrsStimuleVD(370 + rr0, rr0);
    const esv = 370 + rr0 + 520; T.qrsVentriculaire(esv, rr0);
    let pret = esv + 210;
    while (pret < DUREE) { T.pRetro(pret); const v = pret + 170; if (v < DUREE) T.qrsStimuleVD(v, rr); pret = v + rr - 170; }
  },
  fusion(T, o) {
    const rr = 60000 / (o.fc || 70);
    const types = ['stim', 'fusion', 'pseudo', 'stim', 'spont', 'fusion', 'pseudo', 'stim', 'fusion', 'spont', 'stim', 'pseudo'];
    let i = 0;
    for (let t = 200; t < DUREE; t += jitter(T.rand, rr, 0.01), i++) {
      T.p(t);
      const k = types[i % types.length];
      if (k === 'stim') T.qrsStimuleVD(t + 170, rr);
      else if (k === 'spont') T.qrsFin(t + 200, rr);
      else if (k === 'pseudo') { T.qrsFin(t + 180, rr); T.spike(t + 205); }
      else { // fusion : morphologie intermédiaire
        T.spike(t + 190);
        T.gauss(t + 205, 0.3, 10); T.gauss(t + 235, -0.45, 20); T.gauss(t + 290, 0.15, 25); T.gauss(t + 520, 0.33, 50);
      }
    }
  },
  asystolie(T) {
    for (let t = 400; t < DUREE; t += 60000 / 55) T.p(t, 0.1);
  },
};

const presetsFond = {
  fa(T) {
    const ph = [T.rand() * 6, T.rand() * 6];
    T.fonds.push(t => 0.04 * Math.sin(t / 1000 * 2 * Math.PI * 6.4 + ph[0]) + 0.025 * Math.sin(t / 1000 * 2 * Math.PI * 8.1 + ph[1]));
  },
};

export const PRESETS = Object.keys(presets);

// ----- Rendu -------------------------------------------------------------------------

export function couleurs() {
  const css = getComputedStyle(document.documentElement);
  return {
    grille: css.getPropertyValue('--ecg-grid').trim() || '#f0a9a9',
    fine: css.getPropertyValue('--ecg-grid-fine').trim() || '#fae0e0',
    fond: css.getPropertyValue('--ecg-bg').trim() || '#fff',
    trace: css.getPropertyValue('--ecg-trace').trim() || '#111',
  };
}

// Prépare un canvas de mmL × mmH millimètres à pxmm pixels/mm et dessine le papier millimétré.
export function papier(canvas, mmL, mmH, pxmm) {
  const c = couleurs();
  const W = Math.round(mmL * pxmm), H = Math.round(mmH * pxmm);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = c.fond; ctx.fillRect(0, 0, W, H);
  const lignes = (n, trait) => {
    for (let mm = 0; mm <= n; mm++) {
      ctx.strokeStyle = mm % 5 ? c.fine : c.grille; ctx.lineWidth = mm % 5 ? 0.5 : 1;
      ctx.beginPath(); trait(Math.round(mm * pxmm) + 0.5); ctx.stroke();
    }
  };
  lignes(mmL, x => { ctx.moveTo(x, 0); ctx.lineTo(x, H); });
  lignes(mmH, y => { ctx.moveTo(0, y); ctx.lineTo(W, y); });
  ctx.strokeStyle = c.trace; ctx.lineJoin = 'round';
  return { ctx, W, H };
}

// Signal d'étalonnage 1 mV (5 mm de large) à partir de x, ligne de base y0.
export function etalonnage(ctx, x, y0, pxmm) {
  ctx.beginPath();
  ctx.moveTo(x, y0); ctx.lineTo(x + pxmm, y0); ctx.lineTo(x + pxmm, y0 - 10 * pxmm);
  ctx.lineTo(x + 6 * pxmm, y0 - 10 * pxmm); ctx.lineTo(x + 6 * pxmm, y0); ctx.lineTo(x + 8 * pxmm, y0);
  ctx.stroke();
}

// Dessine un preset. Retourne la géométrie utile au compas : { pxmm, x0 } (x0 = abscisse de t = 0).
export function dessinerECG(canvas, def, seed = 'ecg', opts = {}) {
  const fn = presets[def.preset];
  if (!fn) return null;
  const T = new Trace(rng(seed + def.preset));
  fn(T, def);
  const w0 = T.rand() * 6;
  T.fonds.push(t => 0.03 * Math.sin(2 * Math.PI * 0.25 * t / 1000 + w0)); // ligne de base légèrement ondulante

  const mmL = 260, mmH = 34;
  const largeurDispo = canvas.parentElement?.clientWidth || 700;
  const pxmm = opts.pxmm || Math.max(3, largeurDispo / mmL);
  const { ctx } = papier(canvas, mmL, mmH, pxmm);
  const base = mmH * pxmm * 0.6;
  const y = mv => base - mv * 10 * pxmm;
  const x0 = 10 * pxmm;
  const xt = t => x0 + (t / 40) * pxmm; // 25 mm/s → 1 mm = 40 ms

  ctx.lineWidth = 1.4;
  etalonnage(ctx, pxmm, base, pxmm);
  const pas = 40 / pxmm / 2;
  ctx.beginPath();
  for (let t = 0; t <= DUREE; t += pas) {
    const X = xt(t), Y = y(T.value(t));
    t === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.lineWidth = 1.2;
  for (const s of T.spikes) {
    if (s.t < 0 || s.t > DUREE) continue;
    const X = Math.round(xt(s.t)) + 0.5, Yb = y(T.value(s.t));
    ctx.beginPath(); ctx.moveTo(X, Yb); ctx.lineTo(X, Math.max(pxmm, Yb - s.a * 8 * pxmm)); ctx.stroke();
  }
  return { pxmm, x0 };
}
