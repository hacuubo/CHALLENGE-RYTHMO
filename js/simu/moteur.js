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

export const SITES_ATRIAUX = ['sa', 'hra', 'ras', 'cs9', 'cs7', 'cs5', 'cs3', 'cs1', 'foyer'];
export const SITES_VENTRICULAIRES = ['vsep', 'rva', 'lvl'];

export class Coeur {
  // def : { sites: {id: {erp, cl?, declenchable?}}, voies: [{id?, a, b, ab, ba, nodale?}] }
  constructor(def, { variation = 0, alea = Math.random } = {}) {
    const f = () => (variation ? 1 + variation * Math.max(-2, Math.min(2, gauss(alea))) : 1);
    this.t = 0;
    this.tas = new Tas();
    this.journal = [];      // activations : {t, s (site), o (origine : 'stim' | 'auto' | id de voie), r (événement racine)}
    this.stims = [];        // stimulations délivrées : {t, s, capture}
    this.adenosine = null;  // {debut, fin} : bloc des voies nodales
    this.evenements = [];   // messages horodatés pour l'interface (déclenchement, ablation…)
    this.ecouteurs = [];    // fonctions (site, t) appelées à chaque activation (détection du stimulateur)
    this.alea = alea;
    this.sites = {};
    for (const [id, d] of Object.entries(def.sites)) {
      this.sites[id] = { id, erp: Math.round(d.erp * f()), cl: d.cl ? Math.round(d.cl * f()) : null, der: -1e9, prec: 1e9, gen: 0,
        actif: !d.declenchable, declenchable: !!d.declenchable, supprime: false };
    }
    const sens = p => (p ? { ...p, d: p.d != null ? Math.round(p.d * f()) : undefined, erp: Math.round((p.erp || 0) * f()) } : null);
    this.voies = def.voies.map((v, i) => ({ id: v.id || `v${i}`, a: v.a, b: v.b, ab: sens(v.ab), ba: sens(v.ba), nodale: !!v.nodale, der: -1e9, coupee: false }));
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

  // Active un site à l'instant t ; renvoie vrai si le site était excitable.
  activer(id, t, origine, racine = `${origine}:${Math.round(t)}`) {
    const s = this.sites[id];
    if (!s || s.supprime) return false;
    // restitution : la période réfractaire raccourcit quand le cycle précédent est court
    const erp = s.erp - 0.15 * Math.max(0, 600 - Math.min(600, s.prec));
    if (t - s.der < erp) return false;
    s.prec = t - s.der;
    s.der = t;
    this.journal.push({ t, s: id, o: origine, r: racine });
    if (s.cl && s.actif) { s.gen++; this.tas.pousser({ t: t + s.cl * (1 + 0.015 * (this.alea() - 0.5)), type: 'auto', s: id, gen: s.gen }); }
    for (const { v, p, vers } of this.adj[id]) {
      const c = v[p];
      if (!c || v.coupee) continue;
      if (v.nodale && this.adenosine && t >= this.adenosine.debut && t < this.adenosine.fin) continue;
      const ci = t - v.der;
      if (ci < c.erp) continue;
      v.der = t;
      if (c.bloc) continue; // pénétration cachée : la voie devient réfractaire sans conduire
      const d = c.d + (c.dec ? c.dec * Math.exp(-(ci - c.erp) / c.tau) : 0);
      this.tas.pousser({ t: t + d, type: 'arr', s: vers, v: v.id, r: racine });
    }
    for (const f of this.ecouteurs) f(id, t);
    return true;
  }

  stimuler(site, t) { this.tas.pousser({ t, type: 'stim', s: site }); }

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
        const capture = this.activer(e.s, e.t, 'stim', `stim:${e.t}`);
        this.stims.push({ t: e.t, s: e.s, capture });
        this.suivreTrainAtrial(e.s, e.t, capture);
      }
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
    tr.der = t;
    if (tr.n < 6) return;
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
    for (const s of Object.values(this.sites)) {
      s.der = t;
      if (s.declenchable) s.actif = false;
    }
    for (const v of this.voies) v.der = t;
    this.trainAtrial.n = 0;
    this.evenements.push({ t, texte: 'Choc électrique externe' });
  }

  // Bolus d'adénosine : bloc transitoire de toutes les voies nodales (délai d'arrivée ≈ 1,5 s, durée ≈ 6 s).
  injecterAdenosine(t = this.t) {
    this.adenosine = { debut: t + 1500, fin: t + 7500 };
    this.evenements.push({ t, texte: 'Adénosine 12 mg IV' });
  }

  // Ablation d'une cible : voie (par identifiant) ou site automatique. Renvoie ce qui a été détruit.
  ablater(cible, t = this.t) {
    const touchees = [];
    for (const v of this.voies) if (!v.coupee && (v.id === cible || (cible === 'rapide' && v.id === 'nav'))) { v.coupee = true; touchees.push(v.id); }
    const s = this.sites[cible];
    if (s && !s.supprime) { s.supprime = true; touchees.push(cible); }
    this.evenements.push({ t, texte: `Radiofréquence : ${touchees.length ? 'lésion efficace' : 'pas de tissu arythmogène ici'}` });
    return touchees;
  }

  derniere(site, avant = Infinity) {
    for (let i = this.journal.length - 1; i >= 0; i--) { const x = this.journal[i]; if (x.s === site && x.t <= avant) return x.t; }
    return null;
  }
}
