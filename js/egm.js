// Tracés EGM de boîtier (interrogation ou télécardiologie) générés à partir d'un preset :
// EGM atrial, EGM ventriculaire (bipolaires), EGM de choc (champ lointain) ou ECG sous-cutané
// d'un Holter implantable, et canal de marqueurs avec intervalles, à 25 mm/s.
// Les tracés sont schématiques : ils illustrent la logique de détection, pas un modèle précis de boîtier.

const MS_PAR_MM = 40;

function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANAUX = {
  A: { nom: 'EGM A (bipolaire)', gain: 6 },
  V: { nom: 'EGM VD (bipolaire)', gain: 7 },
  FF: { nom: 'EGM de choc (boîtier–coil)', gain: 8 },
  FFpm: { nom: 'EGM champ lointain (boîtier)', gain: 8 },
  SC: { nom: 'ECG sous-cutané (Holter implantable)', gain: 9 },
};

class Scene {
  constructor(rand, duree) {
    this.rand = rand; this.duree = duree;
    this.c = { A: { g: [], s: [], f: [] }, V: { g: [], s: [], f: [] }, FF: { g: [], s: [], f: [] } };
    this.m = []; // marqueurs {t, lab, voie: 'A' | 'V' | 'X', int}
  }
  g(canal, c, a, s) { this.c[canal].g.push({ c, a, s }); }
  spike(canal, t, a = 1.3) { this.c[canal].s.push({ t, a }); }
  fn(canal, f) { this.c[canal].f.push(f); }
  mk(t, lab, voie, int) { this.m.push({ t, lab, voie, int }); }

  // --- activations atriales ---
  P(t, { amp = 1, ff = true } = {}) {
    this.g('A', t, amp, 5); this.g('A', t + 9, -0.8 * amp, 6);
    if (ff) this.g('FF', t + 40, 0.12, 20);
  }
  Pretro(t) { this.g('A', t, -0.8, 6); this.g('A', t + 10, 0.6, 7); this.g('FF', t + 30, -0.1, 18); }
  AP(t) {
    this.spike('A', t); this.spike('V', t, 0.25); this.spike('FF', t, 0.35);
    this.g('A', t + 15, -0.9, 9); this.g('A', t + 35, 0.4, 12); this.g('FF', t + 50, 0.12, 22);
  }
  // --- activations ventriculaires ---
  ffR(t) { this.g('A', t + 30, 0.18, 12); this.g('A', t + 55, -0.1, 14); }
  R(t, { tAmp = 0.12, tSigma = 40, rAmp = 1 } = {}) {
    this.g('V', t + 20, rAmp, 6); this.g('V', t + 32, -0.9 * rAmp, 7); this.g('V', t + 300, tAmp, tSigma);
    this.g('FF', t + 30, 0.9, 10); this.g('FF', t + 50, -0.25, 10); this.g('FF', t + 300, 0.25, 50);
    this.ffR(t);
  }
  VP(t, { capture = true } = {}) {
    this.spike('V', t); this.spike('A', t, 0.3); this.spike('FF', t, 0.5);
    if (!capture) return;
    this.g('V', t + 30, -0.8, 18); this.g('V', t + 80, 0.35, 25); this.g('V', t + 330, 0.15, 45);
    this.g('FF', t + 50, -0.8, 28); this.g('FF', t + 130, 0.3, 30); this.g('FF', t + 350, 0.3, 55);
    this.ffR(t + 20);
  }
  BV(t) {
    this.spike('V', t); this.spike('A', t, 0.3); this.spike('FF', t, 0.5);
    this.g('V', t + 25, -0.6, 12); this.g('V', t + 55, 0.4, 14); this.g('V', t + 320, 0.12, 40);
    this.g('FF', t + 40, -0.5, 18); this.g('FF', t + 80, 0.4, 20); this.g('FF', t + 320, 0.2, 45);
    this.ffR(t);
  }
  ESV(t) {
    this.g('V', t + 25, -1.1, 12); this.g('V', t + 50, 0.9, 14); this.g('V', t + 320, -0.2, 50);
    this.g('FF', t + 50, 1, 28); this.g('FF', t + 120, -0.4, 28); this.g('FF', t + 330, -0.3, 55);
    this.ffR(t + 10);
  }
  TVbatt(t, cycle) {
    this.g('V', t + 25, -1, 12); this.g('V', t + 50, 0.8, 14);
    this.g('FF', t + 60, 1, 35); this.g('FF', t + 150, -0.5, 35); this.g('FF', t + Math.min(300, cycle * 0.7), -0.25, 45);
    this.ffR(t + 10);
  }
  // --- activités désorganisées, bruit, choc ---
  fibA(t0, t1, ampFF = 0.04) {
    const r = this.rand, ph = [r() * 6, r() * 6, r() * 6];
    const env = t => (t >= t0 && t < t1 ? 1 : 0);
    this.fn('A', t => env(t) * 0.22 * (Math.sin(2 * Math.PI * 6.5 * t / 1000 + ph[0]) + 0.7 * Math.sin(2 * Math.PI * 8.3 * t / 1000 + ph[1]) + 0.5 * Math.sin(2 * Math.PI * 11 * t / 1000 + ph[2])));
    this.fn('FF', t => env(t) * ampFF * Math.sin(2 * Math.PI * 7 * t / 1000 + ph[1]));
    const acts = [];
    for (let t = t0 + 40; t < t1; t += 130 + r() * 90) { this.g('A', t, 0.55, 4); this.g('A', t + 7, -0.45, 5); acts.push(t); }
    return acts;
  }
  flutterA(t0, t1, cycle) {
    const acts = [];
    for (let t = t0; t < t1; t += cycle) { this.g('A', t, 0.9, 5); this.g('A', t + 9, -0.7, 6); this.g('FF', t + 60, -0.12, 30); acts.push(t); }
    return acts;
  }
  fibV(t0, t1) {
    const r = this.rand, ph = [r() * 6, r() * 6, r() * 6, r() * 6];
    const env = t => (t >= t0 && t < t1 ? 1 : 0);
    const f = (t, k) => env(t) * (0.45 + 0.25 * Math.sin(2 * Math.PI * 0.5 * t / 1000 + ph[3])) * (Math.sin(2 * Math.PI * 4.6 * t / 1000 + ph[0]) + 0.6 * Math.sin(2 * Math.PI * 6.4 * t / 1000 + ph[1]) + 0.4 * Math.sin(2 * Math.PI * 3.1 * t / 1000 + ph[2])) * k;
    this.fn('V', t => f(t, 0.8));
    this.fn('FF', t => f(t, 0.9));
  }
  bruit(canal, t0, t1, amp = 1.2) {
    const r = this.rand, pics = [];
    for (let t = t0; t < t1; t += 8 + r() * 30) pics.push({ t, a: (r() * 2 - 1) * amp });
    this.fn(canal, t => { let v = 0; for (const p of pics) { const d = t - p.t; if (d > -4 && d < 4) v += p.a * Math.exp(-(d * d) / 2); } return v; });
    return pics;
  }
  myo(canal, t0, t1, amp = 0.18) {
    const r = this.rand, tab = Array.from({ length: 2000 }, () => r() * 2 - 1);
    this.fn(canal, t => (t >= t0 && t < t1 ? amp * tab[Math.floor(t / 3) % 2000] : 0));
  }
  choc(t) {
    for (const k of ['A', 'V', 'FF']) {
      this.spike(k, t, 3);
      this.fn(k, x => (x > t && x < t + 400 ? 1.2 * Math.exp(-(x - t) / 60) : 0));
    }
    this.mk(t, 'CD', 'X');
  }

  valeur(canal, t) {
    const c = this.c[canal];
    let v = 0;
    for (const { c: m, a, s } of c.g) { const d = t - m; if (d > -5 * s && d < 5 * s) v += a * Math.exp(-(d * d) / (2 * s * s)); }
    for (const f of c.f) v += f(t);
    return v;
  }
}

// ---------------------------------------------------------------------------------------
// Presets : chaque fonction remplit la scène et renvoie la liste des canaux à afficher.
// ---------------------------------------------------------------------------------------
const cycle = fc => 60000 / fc;

const presets = {
  // Stimulateur double chambre : P détectée, V stimulé (suivi atrial)
  'ddd-as-vp'(S, o) {
    const rr = cycle(o.fc || 72), av = o.av || 160;
    for (let t = 200; t < S.duree; t += rr) { S.P(t); S.mk(t, 'AS', 'A'); S.VP(t + av); S.mk(t + av, 'VP', 'V'); }
    return ['A', 'V', 'FF'];
  },
  // Conduction spontanée (AS-VS), algorithme de préservation de la conduction
  'ddd-as-vs'(S, o) {
    const rr = cycle(o.fc || 68), pr = o.pr || 190;
    for (let t = 200; t < S.duree; t += rr) { S.P(t); S.mk(t, 'AS', 'A'); S.R(t + pr); S.mk(t + pr, 'VS', 'V'); }
    return ['A', 'V', 'FF'];
  },
  // Stimulation atriale et ventriculaire séquentielle
  'ddd-ap-vp'(S, o) {
    const rr = cycle(o.fc || 60), av = o.av || 180;
    for (let t = 200; t < S.duree; t += rr) { S.AP(t); S.mk(t, 'AP', 'A'); S.VP(t + av); S.mk(t + av, 'VP', 'V'); }
    return ['A', 'V', 'FF'];
  },
  // Entrée en FA : activité atriale rapide détectée (AS/AR), mode switch puis stimulation non suivie
  'fa-mode-switch'(S, o) {
    const rr = cycle(72), av = 160;
    let t = 200;
    for (; t < 1800; t += rr) { S.P(t); S.mk(t, 'AS', 'A'); S.VP(t + av); S.mk(t + av, 'VP', 'V'); }
    const debut = t;
    const acts = S.fibA(debut, S.duree);
    let dernierV = t - rr + av;
    const vs = [];
    for (let v = debut + 350; v < S.duree; v += 480 + S.rand() * 520) vs.push(v);
    for (const a of acts) {
      const refr = vs.some(v => a > v && a - v < 250) || (a > dernierV && a - dernierV < 250);
      S.mk(a, refr ? 'AR' : 'AS', 'A');
    }
    vs.forEach(v => { S.R(v, { tAmp: 0.08 }); S.mk(v, 'VS', 'V'); });
    S.mk(debut + 900, 'MS', 'X');
    return ['A', 'V', 'FF'];
  },
  // Flutter 2:1 : une onde F sur deux tombe dans le blanking atrial post-ventriculaire, pas de mode switch
  'flutter-blanking'(S, o) {
    const cyc = o.cycle || 250, av = 150;
    const acts = S.flutterA(150, S.duree, cyc);
    acts.forEach((a, i) => {
      if (i % 2 === 0) { S.mk(a, 'AS', 'A'); if (a + av < S.duree) { S.VP(a + av); S.mk(a + av, 'VP', 'V'); } }
    });
    return ['A', 'V', 'FF'];
  },
  // Détection du champ lointain de l'onde R sur le canal atrial (double comptage atrial)
  'far-field-r'(S, o) {
    const rr = cycle(o.fc || 70), pr = 180;
    for (let t = 200; t < S.duree; t += rr) {
      S.P(t); S.mk(t, 'AS', 'A'); S.R(t + pr); S.mk(t + pr, 'VS', 'V');
      S.g('A', t + pr + 35, 0.45, 5); S.g('A', t + pr + 44, -0.35, 6); // onde R lointaine bien visible
      S.mk(t + pr + 35, 'AR', 'A');
    }
    return ['A', 'V', 'FF'];
  },
  // TV monomorphe (V > A) traitée par ATP efficace
  'tv-atp'(S, o) {
    const cyc = o.cycle || 330, ra = cycle(75);
    for (let a = 150; a < S.duree; a += ra) { S.P(a); S.mk(a, 'AS', 'A'); }
    let t = 400, n = 0;
    for (; n < 12; t += cyc, n++) { S.TVbatt(t, cyc); S.mk(t, n < 3 ? 'TS' : 'TD', 'V'); }
    const atp = Math.round(cyc * 0.88);
    S.mk(t, 'ATP', 'X');
    for (let k = 0; k < 8; k++, t += atp) { S.VP(t); S.mk(t, 'TP', 'V'); }
    t += 500;
    for (; t < S.duree; t += 820) { S.R(t); S.mk(t, 'VS', 'V'); }
    return ['A', 'V', 'FF'];
  },
  // FV détectée, charge puis choc efficace
  'fv-choc'(S) {
    let t = 300;
    for (; t < 1300; t += 820) { S.P(t - 180); S.mk(t - 180, 'AS', 'A'); S.R(t); S.mk(t, 'VS', 'V'); }
    const debut = 1500, fin = 5600;
    S.fibV(debut, fin);
    for (let v = debut + 60; v < fin; v += 170 + S.rand() * 70) S.mk(v, 'FS', 'V');
    S.fibA(debut, fin, 0);
    S.mk(debut + 1600, 'Chg', 'X');
    S.choc(fin);
    for (let v = fin + 900; v < S.duree; v += 1000) { S.VP(v); S.mk(v, 'VP', 'V'); }
    return ['A', 'V', 'FF'];
  },
  // FA rapide conduite dans la zone TV : thérapie inappropriée (V irrégulier, A > V)
  'fa-conduite-zone-tv'(S) {
    const acts = S.fibA(100, S.duree);
    acts.forEach(a => S.mk(a, 'AS', 'A'));
    let t = 300, n = 0;
    while (t < S.duree) { S.R(t, { tAmp: 0.06 }); S.mk(t, n++ > 3 ? 'TS' : 'VS', 'V'); t += 300 + S.rand() * 140; }
    return ['A', 'V', 'FF'];
  },
  // Tachycardie 1:1 à début progressif : discriminateur (tachycardie sinusale), thérapie retenue
  'tsv-1-1'(S) {
    let t = 200, rr = 520;
    while (t < S.duree) { S.P(t); S.mk(t, 'AS', 'A'); S.R(t + 150); S.mk(t + 150, rr < 400 ? 'TS' : 'VS', 'V'); t += rr; rr = Math.max(360, rr - 12); }
    S.mk(S.duree - 1800, 'SVT', 'X');
    return ['A', 'V', 'FF'];
  },
  // Bruit de sonde (fracture) : signaux non physiologiques sur l'EGM VD seulement
  'bruit-sonde'(S) {
    const rr = cycle(72);
    for (let t = 200; t < S.duree; t += rr) { S.P(t); S.mk(t, 'AS', 'A'); S.R(t + 170); }
    const salves = [[1500, 2300], [3900, 5200], [6300, 6900]];
    const vs = [];
    for (let t = 370; t < S.duree; t += rr) vs.push(t);
    const marques = [];
    salves.forEach(([a, b]) => { const pics = S.bruit('V', a, b); for (let i = 0; i < pics.length; i += 5) marques.push(pics[i].t); });
    [...vs, ...marques].sort((x, y) => x - y).forEach((t, i, arr) => {
      const court = i && t - arr[i - 1] < 200;
      S.mk(t, court ? 'FS' : 'VS', 'V');
    });
    return ['A', 'V', 'FF'];
  },
  // Surdétection de l'onde T : double comptage ventriculaire
  'surdetection-t'(S) {
    const rr = cycle(78);
    for (let t = 200; t < S.duree; t += rr) {
      S.P(t); S.mk(t, 'AS', 'A');
      S.R(t + 160, { tAmp: 0.55, tSigma: 28, rAmp: 0.55 });
      S.mk(t + 160, 'VS', 'V'); S.mk(t + 160 + 300, 'TS', 'V');
    }
    return ['A', 'V', 'FF'];
  },
  // Myopotentiels : inhibition inappropriée chez un patient dépendant (pause)
  'myopotentiels'(S) {
    const rr = cycle(60);
    for (let t = 300; t < S.duree; t += rr) {
      if (t > 2400 && t < 5200) continue;
      S.VP(t); S.mk(t, 'VP', 'V');
    }
    S.myo('V', 2100, 5000, 0.22); S.myo('FF', 2100, 5000, 0.08);
    [2350, 2900, 3500, 4150, 4700].forEach(t => S.mk(t, 'VS', 'V'));
    for (let a = 150; a < S.duree; a += cycle(82)) S.P(a, { amp: 0.6 });
    return ['V', 'FF'];
  },
  // Perte de capture ventriculaire intermittente
  'perte-capture-v'(S) {
    const rr = cycle(60);
    for (let a = 120; a < S.duree; a += cycle(80)) { S.P(a); S.mk(a, 'AS', 'A'); }
    let i = 0;
    for (let t = 300; t < S.duree; t += rr, i++) { const ok = ![2, 3, 5].includes(i); S.VP(t, { capture: ok }); S.mk(t, 'VP', 'V'); }
    return ['A', 'V', 'FF'];
  },
  // Tachycardie par réentrée électronique : P rétrograde détectée hors PVARP, VP à la fréquence max
  'ttre'(S) {
    S.P(200); S.mk(200, 'AS', 'A'); S.VP(360); S.mk(360, 'VP', 'V');
    S.ESV(1000); S.mk(1000, 'VS', 'V');
    let a = 1240;
    while (a < S.duree) { S.Pretro(a); S.mk(a, 'AS', 'A'); const v = a + 260; if (v < S.duree) { S.VP(v); S.mk(v, 'VP', 'V'); } a = v + 240; }
    return ['A', 'V', 'FF'];
  },
  // Crosstalk : le canal V détecte la stimulation atriale, stimulation de sécurité à AV court
  'crosstalk-vsp'(S) {
    const rr = cycle(60);
    let i = 0;
    for (let t = 200; t < S.duree; t += rr, i++) {
      S.AP(t); S.mk(t, 'AP', 'A');
      if (i % 3 === 1) { S.g('V', t + 25, 0.5, 4); S.mk(t + 25, 'VS', 'V'); S.VP(t + 110); S.mk(t + 110, 'VP', 'V'); S.mk(t + 110, 'SV', 'X'); }
      else { S.VP(t + 180); S.mk(t + 180, 'VP', 'V'); }
    }
    return ['A', 'V', 'FF'];
  },
  // Sous-détection atriale : P de faible amplitude non détectées → la fréquence de base n'est pas remise à zéro,
  // stimulation atriale compétitive (fréquence de base 60/min, rythme sinusal 78/min, BAV : V toujours stimulé)
  'sous-detection-a'(S) {
    const rs = cycle(78), base = 1000, av = 170, avAP = 180;
    const sinus = [];
    for (let t = 150, i = 0; t < S.duree + 1000; t += rs, i++) sinus.push({ t, vue: i % 3 === 0 });
    let dernierA = -600, dernierV = -1000, k = 0;
    while (k < sinus.length) {
      const p = sinus[k];
      const echeance = dernierA + base;
      if (echeance < p.t && echeance < S.duree) {
        // la fréquence de base arrive à échéance avant la prochaine P détectée : stimulation atriale
        const refractaire = sinus.some(q => q.t < echeance && echeance - q.t < 250); // oreillette encore réfractaire
        if (refractaire) S.spike('A', echeance); else S.AP(echeance);
        S.mk(echeance, 'AP', 'A'); dernierA = echeance;
        if (echeance + avAP < S.duree) { S.VP(echeance + avAP); S.mk(echeance + avAP, 'VP', 'V'); dernierV = echeance + avAP; }
        continue;
      }
      if (p.t >= S.duree) break;
      S.P(p.t, { amp: p.vue ? 0.9 : 0.22 });
      if (p.vue && p.t - dernierV > 250) {
        S.mk(p.t, 'AS', 'A'); dernierA = p.t;
        if (p.t + av < S.duree) { S.VP(p.t + av); S.mk(p.t + av, 'VP', 'V'); dernierV = p.t + av; }
      }
      k++;
    }
    return ['A', 'V', 'FF'];
  },
  // Comportement à la fréquence maximale : Wenckebach électronique
  'wenckebach-electronique'(S) {
    const rs = cycle(135), fmax = cycle(120);
    let dernierV = -1000, i = 0;
    for (let a = 200; a < S.duree; a += rs, i++) {
      S.P(a);
      const v = Math.max(a + 150, dernierV + fmax);
      if (v - a > 330) { S.mk(a, 'AR', 'A'); continue; } // P dans la PVARP : non suivie
      S.mk(a, 'AS', 'A'); S.VP(v); S.mk(v, 'VP', 'V'); dernierV = v;
    }
    return ['A', 'V', 'FF'];
  },
  // CRT : perte de stimulation biventriculaire par ESV et conduction spontanée
  'crt-perte-biv'(S) {
    const rr = cycle(75);
    let i = 0;
    for (let t = 200; t < S.duree; t += rr, i++) {
      S.P(t); S.mk(t, 'AS', 'A');
      if (i % 3 === 1) { S.ESV(t + 90); S.mk(t + 90, 'VS', 'V'); } else { S.BV(t + 120); S.mk(t + 120, 'BV', 'V'); }
    }
    return ['A', 'V', 'FF'];
  },
  // Holter implantable : fausse pause par sous-détection de QRS de faible amplitude
  'ilr-fausse-pause'(S) {
    const rr = cycle(72);
    let i = 0;
    for (let t = 200; t < S.duree; t += rr, i++) {
      const faible = i >= 3 && i <= 6;
      S.g('FF', t - 140, 0.1, 20);
      S.g('FF', t, faible ? 0.18 : 0.9, 10); S.g('FF', t + 20, faible ? -0.05 : -0.25, 10); S.g('FF', t + 280, 0.2, 50);
      if (!faible) S.mk(t, 'VS', 'V');
    }
    S.mk(3200, 'Pause', 'X');
    return ['SC'];
  },
  // Holter implantable : vraie pause (BAV paroxystique : P non conduites)
  'ilr-vraie-pause'(S) {
    let t = 200;
    for (let i = 0; i < 2; i++, t += 850) { S.g('FF', t - 160, 0.12, 20); S.g('FF', t, 0.9, 10); S.g('FF', t + 20, -0.25, 10); S.g('FF', t + 290, 0.2, 50); S.mk(t, 'VS', 'V'); }
    for (let p = t - 160; p < t + 4800; p += 800) S.g('FF', p, 0.12, 20);
    S.mk(t + 1500, 'Pause', 'X');
    t += 4900;
    for (; t < S.duree; t += 1000) { S.g('FF', t - 160, 0.12, 20); S.g('FF', t, 0.9, 10); S.g('FF', t + 20, -0.25, 10); S.g('FF', t + 290, 0.2, 50); S.mk(t, 'VS', 'V'); }
    return ['SC'];
  },
  // Holter implantable : faux épisode de FA (extrasystoles atriales fréquentes, P visibles)
  'ilr-fausse-fa'(S) {
    let t = 200, i = 0;
    while (t < S.duree) {
      const prem = i % 2 === 1;
      S.g('FF', t - 140, prem ? 0.09 : 0.12, prem ? 14 : 20);
      S.g('FF', t, 0.9, 10); S.g('FF', t + 20, -0.25, 10); S.g('FF', t + 280, 0.2, 50); S.mk(t, 'VS', 'V');
      t += prem ? 1050 + S.rand() * 150 : 520 + S.rand() * 120; i++;
    }
    S.mk(2500, 'FA', 'X');
    return ['SC'];
  },
};

export const PRESETS_EGM = Object.keys(presets);
// scénarios propres au défibrillateur (3e canal = EGM de choc) ; les autres peuvent préciser `appareil: 'dai'`
const PRESETS_DAI = ['tv-atp', 'fv-choc', 'fa-conduite-zone-tv', 'tsv-1-1', 'bruit-sonde', 'surdetection-t'];

// ---------------------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------------------
export function dessinerEGM(canvas, def, seed = 'egm', opts = {}) {
  const fn = presets[def.preset];
  if (!fn) return null;
  const duree = def.duree || 8000;
  const S = new Scene(rng(seed + def.preset), duree);
  let canaux = fn(S, def) || ['A', 'V', 'FF'];
  // 3e canal : « EGM de choc » pour un défibrillateur, « champ lointain » pour un stimulateur
  const dai = def.appareil ? def.appareil === 'dai' : PRESETS_DAI.includes(def.preset);
  if (!dai) canaux = canaux.map(k => (k === 'FF' ? 'FFpm' : k));

  const hCanal = 20, hMarq = 23, marge = 4, mmL = duree / MS_PAR_MM + 2 * marge;
  const mmH = canaux.length * hCanal + hMarq + 4;
  const largeurDispo = (canvas.closest('.ecg-cadre') || canvas.parentElement)?.clientWidth || 700;
  const pxmm = opts.pxmm || Math.max(3, largeurDispo / mmL);
  const W = Math.round(mmL * pxmm), H = Math.round(mmH * pxmm);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const css = getComputedStyle(document.documentElement);
  const fond = css.getPropertyValue('--egm-bg').trim() || '#fbfcfd';
  const grille = css.getPropertyValue('--egm-grid').trim() || '#e3e8ee';
  const trace = css.getPropertyValue('--ecg-trace').trim() || '#111';
  const accent = css.getPropertyValue('--primaire-2').trim() || '#1d6fa5';
  ctx.fillStyle = fond; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = grille; ctx.lineWidth = 1;
  for (let mm = 0; mm <= mmL; mm += 5) { const x = Math.round(mm * pxmm) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

  const x0 = marge * pxmm;
  const xt = t => x0 + (t / MS_PAR_MM) * pxmm;
  const police = n => `${n}px system-ui, sans-serif`;

  canaux.forEach((k, i) => {
    const src = k === 'SC' || k === 'FFpm' ? 'FF' : k;
    const info = CANAUX[k], donnees = S.c[src];
    const base = (i * hCanal + hCanal * 0.6) * pxmm;
    ctx.fillStyle = '#6b7b88'; ctx.font = police(Math.max(10, 2.6 * pxmm));
    ctx.fillText(info.nom, x0, (i * hCanal + 3.2) * pxmm);
    const lim = hCanal * 0.55 * pxmm;
    const y = v => base - Math.max(-lim, Math.min(lim, v * info.gain * pxmm));
    ctx.strokeStyle = trace; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
    ctx.beginPath();
    const pas = MS_PAR_MM / pxmm / 2;
    for (let t = 0; t <= duree; t += pas) {
      const v = S.valeur(src, t);
      t === 0 ? ctx.moveTo(xt(t), y(v)) : ctx.lineTo(xt(t), y(v));
    }
    ctx.stroke();
    for (const s of donnees.s) {
      const X = Math.round(xt(s.t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(X, base); ctx.lineTo(X, y(s.a * 1.2)); ctx.stroke();
    }
  });

  // canal de marqueurs
  const yM = (canaux.length * hCanal + 9.5) * pxmm;
  ctx.strokeStyle = '#8a99a6'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, yM); ctx.lineTo(W - marge * pxmm, yM); ctx.stroke();
  ctx.fillStyle = '#6b7b88'; ctx.font = police(Math.max(10, 2.6 * pxmm));
  const taille = Math.max(9, 2.3 * pxmm);
  const dernier = { A: null, V: null };
  const finTexte = { A: -Infinity, V: -Infinity, X: -Infinity }; // évite le chevauchement des étiquettes
  const tri = [...S.m].filter(m => m.t >= 0 && m.t <= duree).sort((a, b) => a.t - b.t);
  for (const m of tri) {
    const X = Math.round(xt(m.t)) + 0.5;
    if (m.voie === 'X') {
      ctx.fillStyle = accent; ctx.font = `700 ${police(taille)}`;
      const w = ctx.measureText(m.lab).width;
      const gx = Math.max(X - w / 2, finTexte.X + 4);
      ctx.fillText(m.lab, gx, (canaux.length * hCanal + hMarq - 1.2) * pxmm);
      finTexte.X = gx + w;
      continue;
    }
    const haut = m.voie === 'A';
    ctx.strokeStyle = trace; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X, yM); ctx.lineTo(X, yM + (haut ? -2.2 : 2.2) * pxmm); ctx.stroke();
    ctx.fillStyle = trace; ctx.font = `600 ${police(taille)}`;
    const w = ctx.measureText(m.lab).width;
    const prec = dernier[m.voie];
    const int = m.int ?? (prec !== null ? Math.round(m.t - prec) : null);
    dernier[m.voie] = m.t;
    const place = Math.max(w, ctx.measureText(String(int ?? '')).width * 0.9);
    if (X - place / 2 < finTexte[m.voie] + 3) continue; // marqueurs trop serrés : trait seul, comme sur un vrai boîtier
    finTexte[m.voie] = X + place / 2;
    ctx.fillText(m.lab, X - w / 2, haut ? yM - 3 * pxmm : yM + 5.2 * pxmm);
    if (int !== null && !haut) {
      ctx.fillStyle = '#6b7b88'; ctx.font = police(taille * 0.9);
      const txt = String(int); ctx.fillText(txt, X - ctx.measureText(txt).width / 2, yM + 8.4 * pxmm);
    } else if (int !== null && haut) {
      ctx.fillStyle = '#6b7b88'; ctx.font = police(taille * 0.9);
      const txt = String(int); ctx.fillText(txt, X - ctx.measureText(txt).width / 2, yM - 6 * pxmm);
    }
  }
  return { pxmm, x0 };
}
