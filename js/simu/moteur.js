// Moteur du simulateur d'électrophysiologie.
// Le cœur est un réseau de sites (oreillettes, His, ventricules…) reliés par des voies de conduction.
// Chaque site a une période réfractaire (et éventuellement un automatisme) ; chaque voie a, dans chaque sens,
// un délai de conduction (décrémentiel pour le nœud AV), une période réfractaire, ou une simple pénétration
// cachée (« bloc ») qui la rend réfractaire sans conduire. Les réentrées émergent du réseau, sans être programmées.
// Simulation à événements discrets, temps en millisecondes. Aucune dépendance au DOM (testable sous Node).

class Tas {
  constructor() { this.a = []; }
  get taille() { return this.a.length; }
  haut() { return this.a[0]; }
  pousser(e) {
    const a = this.a; a.push(e);
    let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p].t <= e.t) break; a[i] = a[p]; i = p; }
    a[i] = e;
  }
  extraire() {
    const a = this.a, top = a[0], der = a.pop();
    if (a.length) {
      let i = 0;
      for (;;) {
        const g = 2 * i + 1, d = g + 1;
        let m = i, v = der;
        if (g < a.length && a[g].t < v.t) { m = g; v = a[g]; }
        if (d < a.length && a[d].t < v.t) { m = d; v = a[d]; }
        if (m === i) break;
        a[i] = a[m]; i = m;
      }
      a[i] = der;
    }
    return top;
  }
  filtrer(f) { const garde = this.a.filter(f); this.a = []; garde.forEach(e => this.pousser(e)); }
}

// variation gaussienne (Box-Muller) pour personnaliser légèrement un scénario
const gauss = (alea) => { let u = 0, v = 0; while (!u) u = alea(); while (!v) v = alea(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export const SITES_ATRIAUX = ['sa', 'hra', 'lath', 'latm', 'latb', 'cti', 'ras', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1', 'ogs', 'oga', 'foyer'];
export const SITES_VENTRICULAIRES = ['vsep', 'vbd', 'vps', 'rva', 'lvl', 'tv1', 'tv2', 'tv3'];

// Seuils de capture (mA) ; le site para-hisien capture le His seulement à haute énergie.
export const SEUILS = { defaut: 0.8, his: 10 };
// Seuils par site pour une impulsion de 2 ms (tissu sain ≈ 0,5-1,5 mA ; isthme, SC distal et cicatrice plus élevés).
export const SEUILS_SITES = { hra: 0.6, latb: 1.0, cti: 1.4, cs9: 0.9, cs1: 1.3, rva: 0.5, lvl: 1.1, tv2: 2.4, vbd: 0.8 };
// Loi intensité-durée (Lapicque, chronaxie ≈ 0,4 ms), normalisée sur une impulsion de 2 ms.
export const seuilCapture = (site, largeur = 2) => (SEUILS_SITES[site] ?? SEUILS.defaut) * (1 + 0.4 / largeur) / 1.2;

export class Coeur {
  // def : { sites: {id: {erp, cl?, declenchable?}}, voies: [{id?, a, b, ab, ba, nodale?}] }
  constructor(def, { variation = 0, alea = Math.random } = {}) {
    // variation individuelle : pleine sur les délais et les cycles, réduite de moitié sur les périodes réfractaires
    // (les fenêtres d'induction dépendent d'écarts fins entre périodes réfractaires)
    const f = (k = 1) => (variation ? 1 + k * variation * Math.max(-2, Math.min(2, gauss(alea))) : 1);
    this.t = 0;
    this.tas = new Tas();
    this.journal = [];      // activations : {t, s (site), o (origine : 'stim' | 'auto' | id de voie), r (événement racine)}
    this.stims = [];        // stimulations délivrées : {t, s, capture}
    this.adenosine = null;  // {debut, fin} : bloc des voies nodales
    this.evenements = [];   // messages horodatés pour l'interface (déclenchement, ablation…)
    this.chocs = [];        // instants des chocs (saturation des amplificateurs)
    this.ecouteurs = [];    // fonctions (site, t) appelées à chaque activation (détection du stimulateur)
    this.alea = alea;
    this.sites = {};
    for (const [id, d] of Object.entries(def.sites)) {
      this.sites[id] = { id, erp: Math.round(d.erp * f(0.5)), cl: d.cl ? Math.round(d.cl * f()) : null, der: -1e9, prec: 1e9, gen: 0,
        actif: !d.declenchable, declenchable: !!d.declenchable, supprime: false,
        // freinage (suppression par surcharge) : chaque activation imposée à cadence rapide allonge la reprise
        restit: d.restit ?? 0.15, freinK: d.freinK || 0, freinMax: d.freinMax || 0, frein: 0, arythmie: !!d.arythmie, fibrillable: !!d.fibrillable };
    }
    const sens = p => (p ? { ...p, d: p.d != null ? Math.round(p.d * f()) : undefined, erp: Math.round((p.erp || 0) * f(0.5)) } : null);
    this.voies = def.voies.map((v, i) => ({ id: v.id || `v${i}`, a: v.a, b: v.b, ab: sens(v.ab), ba: sens(v.ba), nodale: !!v.nodale, der: -1e9, surplus: 0, coupee: false }));
    this.medicaments = { iso: null, atropine: null }; // {debut, fin?, niveauFin?}
    this.fa = null;                                   // fibrillation atriale en cours : {fin?}
    this.adj = {};
    for (const id of Object.keys(this.sites)) this.adj[id] = [];
    for (const v of this.voies) {
      this.adj[v.a].push({ v, p: 'ab', vers: v.b });
      this.adj[v.b].push({ v, p: 'ba', vers: v.a });
    }
    this.trainAtrial = { n: 0, der: -1e9 };
    for (const s of Object.values(this.sites)) if (s.cl && s.actif) this.programmer(s, Math.round(s.cl * (0.3 + 0.5 * alea())));
  }

  programmer(s, dt) { s.gen++; this.tas.pousser({ t: this.t + dt, type: 'auto', s: s.id, gen: s.gen }); }

  // Niveau (0 → 1) d'un médicament : montée en 15 s, décroissance en 45 s après l'arrêt.
  niveau(nom, t = this.t) {
    const m = this.medicaments[nom];
    if (!m) return 0;
    const monte = Math.min(1, Math.max(0, (Math.min(t, m.fin ?? t) - m.debut) / 15000));
    return m.fin == null || t < m.fin ? monte : Math.max(0, monte * (1 - (t - m.fin) / 45000));
  }
  basculerMedicament(nom, t = this.t) {
    const m = this.medicaments[nom];
    if (m && m.fin == null) { m.fin = t; this.evenements.push({ t, texte: nom === 'iso' ? 'Arrêt de l\'isoprénaline' : 'Fin de l\'atropine' }); return false; }
    const reste = this.niveau(nom, t);
    this.medicaments[nom] = { debut: t - reste * 15000 };
    this.evenements.push({ t, texte: nom === 'iso' ? 'Isoprénaline 1 µg/min' : 'Atropine 1 mg IV' });
    return true;
  }
  // Effets combinés : cycle des automatismes, réfractarité et décrément nodaux, réfractarité myocardique.
  effets(t) {
    const iso = this.niveau('iso', t), atr = this.niveau('atropine', t);
    return { cl: 1 - 0.35 * iso - 0.22 * atr, nodErp: 1 - 0.14 * iso - 0.1 * atr, nodDec: 1 - 0.3 * iso - 0.15 * atr, myoErp: 1 - 0.07 * iso, iso };
  }
  cycle(s, t) {
    const e = this.effets(t);
    const resp = s.arythmie ? 1 + 0.03 * Math.sin(2 * Math.PI * t / 4200) : 1; // arythmie respiratoire
    return s.cl * (s.id === 'sa' || s.id === 'his' || s.declenchable ? e.cl : 1) * resp * (1 + s.frein);
  }

  // Active un site à l'instant t ; renvoie vrai si le site était excitable.
  activer(id, t, origine, racine = `${origine}:${Math.round(t)}`) {
    const s = this.sites[id];
    if (!s || s.supprime) return false;
    // restitution : la période réfractaire raccourcit quand le cycle précédent est court
    const ef = this.effets(t);
    const erp = (s.erp - s.restit * Math.max(0, 600 - Math.min(600, s.prec))) * ef.myoErp;
    if (t - s.der < erp) return false;
    s.prec = t - s.der;
    s.der = t;
    this.journal.push({ t, s: id, o: origine, r: racine });
    if (s.cl && s.actif) {
      if (s.freinK) {
        if (origine === 'auto') s.frein *= 0.3;
        else if (s.prec < 0.9 * s.cl) s.frein = Math.min(s.freinMax, s.frein + s.freinK * (s.cl / s.prec - 1));
      }
      s.gen++; this.tas.pousser({ t: t + this.cycle(s, t) * (1 + 0.015 * (this.alea() - 0.5)), type: 'auto', s: id, gen: s.gen });
    }
    for (const { v, p, vers } of this.adj[id]) {
      const c = v[p];
      if (!c || v.coupee || v.id === origine) continue; // pas de retour immédiat dans la voie d'arrivée
      if (v.bloqueJusqua > t) continue;                   // bloc mécanique transitoire (« bump » du cathéter)
      if (v.nodale && this.adenosine && t >= this.adenosine.debut && t < this.adenosine.fin) continue;
      const cerp = v.nodale ? c.erp * ef.nodErp : c.erp;
      // récupération : pour une voie décrémentielle, comptée depuis la sortie de l'influx précédent
      // (le surplus de délai du battement précédent retarde la récupération → périodicité de Wenckebach)
      const ci = t - v.der - (c.dec ? (c.wk ?? 0.3) * v.surplus : 0);
      if (ci < cerp) continue;
      v.der = t;
      if (c.bloc) { v.surplus = 0; continue; } // pénétration cachée : la voie devient réfractaire sans conduire
      const surplus = c.dec ? c.dec * (v.nodale ? ef.nodDec : 1) * Math.exp(-(ci - cerp) / c.tau) : 0;
      v.surplus = surplus;
      const d = c.d + surplus + (v.nodale ? 2 * (this.alea() - 0.5) : 0);
      this.tas.pousser({ t: t + d, type: 'arr', s: vers, v: v.id, r: racine });
    }
    for (const f of this.ecouteurs) f(id, t);
    return true;
  }

  // lib : étiquette affichée au-dessus du stimulus (numéro dans le train « 3/8 », « S2 400 »…)
  stimuler(site, t, sortie = 5, largeur = 2, lib = null) { this.tas.pousser({ t, type: 'stim', s: site, sortie, largeur, lib }); }
  // Capture d'un site : certaine au-dessus du seuil, intermittente dans une marge de ± 8 % autour du seuil.
  capte(site, sortie, largeur = 2) {
    const s = seuilCapture(site, largeur);
    if (sortie >= s * 1.08) return true;
    if (sortie < s * 0.92) return false;
    return this.alea() < (sortie - s * 0.92) / (s * 0.16);
  }
  // Extrasystole mécanique (contact du cathéter) : activation du site sans stimulation électrique.
  ectopie(site, t = this.t) { if (this.sites[site]) this.tas.pousser({ t, type: 'arr', s: site, v: 'meca', r: `meca:${Math.round(t)}` }); }
  // Bloc mécanique transitoire d'une voie (traumatisme par le cathéter), sans message : c'est un piège à reconnaître.
  bloquer(id, duree, t = this.t) { const v = this.voies.find(x => x.id === id && !x.coupee); if (v) v.bloqueJusqua = t + duree; return !!v; }
  // Rythme jonctionnel accéléré (chauffage de la région du nœud AV) : cycle imposé à l'échappement hisien, ou retour à la normale.
  jonction(cl, t = this.t) {
    const s = this.sites.his; if (!s || s.supprime) return;
    s.clBase ??= s.cl;
    s.cl = cl || s.clBase;
    if (cl) { s.gen++; this.tas.pousser({ t: t + Math.max(80, cl - (t - s.der)), type: 'auto', s: 'his', gen: s.gen }); }
  }
  // Lésion thermique progressive des voies nodales rapides : allongement des délais antérograde et rétrograde (ms).
  leserNoeud(ms, { retro = true, antero = true } = {}) {
    for (const v of this.voies) if (v.nodale && v.id !== 'lente' && !v.coupee) {
      if (antero && v.ab && !v.ab.bloc) v.ab.d += ms;
      if (retro && v.ba && !v.ba.bloc) v.ba.d += ms;
      if ((v.ab?.d ?? 0) > 400) { v.coupee = true; this.evenements.push({ t: this.t, texte: 'Bloc AV complet' }); }
    }
  }
  annulerStims(apres = this.t) { this.tas.filtrer(e => !(e.type === 'stim' && e.t > apres)); }

  // Fibrillation atriale : activations désordonnées et indépendantes des différents sites atriaux (cycles 140-220 ms).
  demarrerFA(t) {
    if (this.fa) return;
    this.fa = { debut: t };
    for (const id of SITES_ATRIAUX) if (this.sites[id] && id !== 'sa' && id !== 'foyer') this.tas.pousser({ t: t + 40 + 150 * this.alea(), type: 'fa', s: id });
    this.evenements.push({ t, texte: 'Fibrillation atriale' });
  }
  ondeFA(e) {
    if (!this.fa) return;
    const s = this.sites[e.s];
    // la fibrillation active le site sans propagation organisée : seule la voie nodale est sollicitée
    if (e.t - s.der >= 90) {
      s.prec = e.t - s.der; s.der = e.t;
      this.journal.push({ t: e.t, s: e.s, o: 'fa', r: `fa:${Math.round(e.t)}` });
      for (const { v, p, vers } of this.adj[e.s]) if (v.nodale || SITES_VENTRICULAIRES.includes(vers) || vers === 'his') {
        const c = v[p]; if (!c || v.coupee || c.bloc) continue;
        if (this.adenosine && e.t >= this.adenosine.debut && e.t < this.adenosine.fin && v.nodale) continue;
        const ef = this.effets(e.t), cerp = v.nodale ? c.erp * ef.nodErp : c.erp;
        const ci = e.t - v.der - (c.dec ? (c.wk ?? 0.3) * v.surplus : 0);
        if (ci < cerp) continue;
        v.der = e.t;
        if (this.alea() < 0.3) continue; // conduction cachée dans le nœud AV : irrégularité des RR
        const surplus = c.dec ? c.dec * Math.exp(-(ci - cerp) / c.tau) : 0; v.surplus = surplus;
        this.tas.pousser({ t: e.t + c.d + surplus, type: 'arr', s: vers, v: v.id, r: `fa:${Math.round(e.t)}` });
      }
    }
    this.tas.pousser({ t: e.t + 110 + 140 * this.alea(), type: 'fa', s: e.s });
  }

  avancer(tFin) {
    while (this.tas.taille && this.tas.haut().t <= tFin) {
      const e = this.tas.extraire();
      this.t = e.t;
      if (e.type === 'arr') this.activer(e.s, e.t, e.v, e.r);
      else if (e.type === 'auto') {
        const s = this.sites[e.s];
        if (e.gen !== s.gen || !s.actif || s.supprime) continue;
        // un automatisme bloqué par la réfractarité repart à la fin de celle-ci
        if (!this.activer(e.s, e.t, 'auto')) this.programmer(s, Math.max(20, s.erp - (e.t - s.der)) + s.cl * 0.25);
      } else if (e.type === 'stim') {
        const r = `stim:${e.t}`, sortie = e.sortie ?? 5;
        let capture = false;
        if (e.s === 'parahis') {
          // stimulation para-hisienne : myocarde septal basal du VD, plus le His si la sortie dépasse son seuil
          if (sortie >= SEUILS.his && this.sites.his) capture = this.activer('his', e.t, 'stim', r) || capture;
          if (sortie >= SEUILS.defaut) capture = this.activer('vbd', e.t, 'stim', r) || capture;
        } else if (this.capte(e.s, sortie, e.largeur)) capture = this.activer(e.s, e.t, 'stim', r);
        this.stims.push({ t: e.t, s: e.s, capture, sortie, his: e.s === 'parahis' && sortie >= SEUILS.his, lib: e.lib ?? null });
        this.suivreTrainAtrial(e.s, e.t, capture);
      } else if (e.type === 'fa') this.ondeFA(e);
    }
    this.t = tFin;
    // on ne garde que la dernière minute
    if (this.journal.length > 4000) this.journal = this.journal.filter(x => x.t > tFin - 60000);
    if (this.stims.length > 1000) this.stims = this.stims.filter(x => x.t > tFin - 60000);
  }

  // Activité déclenchée : une salve atriale rapide (≥ 6 captures à ≤ 400 ms) allume les foyers « déclenchables ».
  suivreTrainAtrial(site, t, capture) {
    if (!SITES_ATRIAUX.includes(site) || !capture) return;
    const tr = this.trainAtrial;
    tr.n = t - tr.der <= 400 ? tr.n + 1 : 1;
    tr.rapide = t - tr.der <= 220 ? (tr.rapide || 0) + 1 : 0;
    tr.der = t;
    // salve atriale très rapide sur oreillette vulnérable : fibrillation atriale
    if (tr.rapide >= 8 && Object.values(this.sites).some(x => x.fibrillable)) { this.demarrerFA(t + 5); tr.rapide = 0; }
    if (tr.n < (this.effets(t).iso > 0.5 ? 3 : 6)) return;
    for (const s of Object.values(this.sites)) {
      if (s.declenchable && !s.actif && !s.supprime) {
        s.actif = true; s.gen++;
        this.tas.pousser({ t: t + s.cl, type: 'auto', s: s.id, gen: s.gen });
        this.evenements.push({ t, texte: 'Activité déclenchée' });
      }
    }
  }

  // Choc électrique externe : tout le myocarde est dépolarisé, les ondes en cours s'éteignent.
  choc(t = this.t) {
    this.tas.filtrer(e => e.type === 'auto' && this.sites[e.s].actif && !this.sites[e.s].declenchable);
    this.fa = null;
    for (const s of Object.values(this.sites)) {
      s.der = t;
      if (s.declenchable) s.actif = false;
    }
    for (const v of this.voies) v.der = t;
    this.trainAtrial.n = 0;
    this.chocs.push(t);
    this.evenements.push({ t, texte: 'Choc électrique externe' });
  }

  // Bolus d'adénosine : bloc transitoire de toutes les voies nodales (délai d'arrivée ≈ 1,5 s, durée ≈ 6 s).
  injecterAdenosine(t = this.t) {
    this.adenosine = { debut: t + 1500, fin: t + 7500 };
    this.evenements.push({ t, texte: 'Adénosine 12 mg IV' });
  }

  // Ablation d'une cible : voie (par identifiant) ou site automatique. Renvoie ce qui a été détruit.
  ablater(cibles, t = this.t) {
    const liste = [].concat(cibles), touchees = [];
    for (const v of this.voies) if (!v.coupee && (liste.includes(v.id) || (liste.includes('rapide') && v.id === 'nav'))) { v.coupee = true; touchees.push(v.id); }
    for (const c of liste) { const s = this.sites[c]; if (s && !s.supprime) { s.supprime = true; touchees.push(c); } }
    this.evenements.push({ t, texte: `Radiofréquence : ${touchees.length ? 'lésion efficace' : 'pas de tissu arythmogène ici'}` });
    return touchees;
  }

  derniere(site, avant = Infinity) {
    for (let i = this.journal.length - 1; i >= 0; i--) { const x = this.journal[i]; if (x.s === site && x.t <= avant) return x.t; }
    return null;
  }
}
