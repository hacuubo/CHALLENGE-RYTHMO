// Rejeu déterministe d'un protocole de stimulation : sert aux questions « tracé du simulateur ».
// Le même protocole, avec la même graine, redonne exactement le même tracé (dans le navigateur comme dans le générateur).
import { Coeur } from './moteur.js';
import { SCENARIOS } from './scenarios.js';

export function aleaGraine(graine) { let g = graine % 2147483647 || 1; return () => ((g = (g * 16807) % 2147483647) / 2147483647); }

// Étapes : { attendre: ms } | { train: { site, s1, n, extras: [], mA } } | { salve: { site, cl, n, mA } }
//          | { stim: { site, mA, delai } } | { adenosine: true } | { iso: true } | { choc: true } | { ablation: [cibles] }
// Chaque étape démarre à l'instant courant ; renvoie le cœur et les instants remarquables (marques).
export function rejouer({ scenario, graine = 7, etapes = [] }) {
  const c = new Coeur(SCENARIOS[scenario].def(), { alea: aleaGraine(graine) });
  c.avancer(3000);
  const marques = {};
  for (const e of etapes) {
    if (e.attendre) c.avancer(c.t + e.attendre);
    if (e.train) {
      const { site, s1 = 600, n = 8, extras = [], mA = 5 } = e.train;
      let t = c.t + 50;
      for (let i = 0; i < n; i++) { c.stimuler(site, t, mA); if (i < n - 1) t += s1; }
      for (const x of extras) { t += x; c.stimuler(site, t, mA); }
      marques.dernierStim = t;
      c.avancer(t + 5);
    }
    if (e.salve) {
      const { site, cl, n, mA = 5 } = e.salve;
      const t0 = c.t + 50;
      for (let i = 0; i < n; i++) c.stimuler(site, t0 + i * cl, mA);
      marques.dernierStim = t0 + (n - 1) * cl;
      c.avancer(marques.dernierStim + 5);
    }
    if (e.stim) { const t = c.t + (e.stim.delai ?? 50); c.stimuler(e.stim.site, t, e.stim.mA ?? 5); marques.dernierStim = t; c.avancer(t + 5); }
    if (e.adenosine) c.injecterAdenosine();
    if (e.iso) c.basculerMedicament('iso');
    if (e.choc) c.choc();
    if (e.ablation) c.ablater(e.ablation);
    if (e.marque) marques[e.marque] = c.t;
  }
  return { coeur: c, marques, t: c.t };
}
