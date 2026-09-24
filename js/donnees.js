// Base de questions : chargement, filtres, construction des séries.
import * as stock from './store.js';
import { melanger } from './util.js';

export const THEMES = {
  ecg: { nom: 'ECG', ico: '📈', desc: 'Lecture de tracés, vrais ECG 12 dérivations, ECG stimulé' },
  programmation: { nom: 'Programmation PM / DAI', ico: '⚙️', desc: 'Modes, algorithmes par marque, DAI, CRT' },
  telecardio: { nom: 'Alertes télécardio', ico: '📡', desc: 'Télésurveillance, triage des alertes, conduite à tenir' },
  electrophysio: { nom: 'Électrophysiologie', ico: '⚡', desc: 'Mécanismes, EEP, ablation, antiarythmiques' },
};
export const MARQUES = ['Medtronic', 'Abbott', 'Boston Scientific', 'Biotronik', 'MicroPort'];
export const TYPES = { qcu: 'QCU', qcm: 'QCM', vf: 'Vrai / Faux', ouverte: 'Question ouverte' };
export const NIVEAUX = [
  { id: 'tous', nom: 'Tous niveaux', min: 1, max: 10 },
  { id: 'deb', nom: 'Débutant (1–3)', min: 1, max: 3 },
  { id: 'inter', nom: 'Intermédiaire (4–6)', min: 4, max: 6 },
  { id: 'av', nom: 'Avancé (7–10)', min: 7, max: 10 },
  { id: 'sup3', nom: 'Au-dessus de 3', min: 4, max: 10 },
];

export const base = { version: '', date: '', questions: [], parId: new Map() };

export async function charger() {
  const idx = await (await fetch('data/questions/index.json', { cache: 'no-cache' })).json();
  const listes = await Promise.all(idx.fichiers.map(f => fetch(`data/questions/${f}`, { cache: 'no-cache' }).then(r => r.json())));
  base.version = idx.version; base.date = idx.date;
  base.questions = listes.flat();
  base.parId = new Map(base.questions.map(q => [q.id, q]));
}

export const aTrace = q => !!(q.ecg || q.ecg12 || q.egm);

export function filtrer(cfg) {
  return base.questions.filter(q =>
    cfg.themes.includes(q.theme) &&
    q.difficulte >= cfg.min && q.difficulte <= cfg.max &&
    cfg.types.includes(q.type) &&
    (!cfg.ecgSeul || aTrace(q)) &&
    ((q.theme !== 'programmation' && q.theme !== 'telecardio') || !cfg.marques.length || cfg.marques.includes(q.marque || 'Générique')) &&
    (!cfg.sousThemes.length || cfg.sousThemes.includes(q.sousTheme)));
}

export function construireSerie(liste, n, priorite) {
  const p = stock.progres();
  const ordre = melanger(liste);
  if (priorite === 'nouvelles') ordre.sort((a, b) => (p.q[a.id] ? 1 : 0) - (p.q[b.id] ? 1 : 0));
  if (priorite === 'faibles') ordre.sort((a, b) => stock.poidsRevision(p.q[b.id]) - stock.poidsRevision(p.q[a.id]));
  return ordre.slice(0, n);
}

// Mode adaptatif : question la plus proche d'une cible juste au-dessus du niveau estimé,
// en évitant les questions déjà posées dans la série et en privilégiant celles jamais vues ou ratées.
export function questionAdaptative(pool, dejaPosees) {
  const p = stock.progres();
  const exclus = new Set(dejaPosees);
  const candidates = pool.filter(q => !exclus.has(q.id));
  if (!candidates.length) return null;
  const score = q => {
    const cible = stock.niveau(q.theme).n >= 5 ? stock.niveau(q.theme).niveau : stock.niveau().niveau;
    const e = p.q[q.id];
    return Math.abs(q.difficulte - (cible + 0.7)) + (e ? (e.dernierOk ? 1.5 : -0.5) : 0) + Math.random() * 1.2;
  };
  return candidates.reduce((m, q) => { const s = score(q); return s < m.s ? { q, s } : m; }, { q: null, s: Infinity }).q;
}
