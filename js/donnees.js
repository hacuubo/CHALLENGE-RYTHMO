// Base de questions : chargement (et surcouche anglaise), filtres, construction des séries.
// Les libellés affichés sont relus à chaque accès (accesseurs) : ils suivent la langue courante.
import * as stock from './store.js';
import { melanger } from './util.js';
import { t, enAnglais, langue } from './i18n.js';

export const THEMES = {
  ecg: { get nom() { return 'ECG'; }, ico: '📈', get desc() { return t('Lecture de tracés, vrais ECG 12 dérivations, ECG stimulé', 'Tracing interpretation, real 12-lead ECGs, paced ECGs'); } },
  programmation: { get nom() { return t('Programmation PM / DAI', 'Pacemaker / ICD programming'); }, ico: '⚙️', get desc() { return t('Modes, algorithmes par marque, DAI, CRT', 'Modes, manufacturer algorithms, ICD, CRT'); } },
  telecardio: { get nom() { return t('Alertes télécardio', 'Remote monitoring alerts'); }, ico: '📡', get desc() { return t('Télésurveillance, triage des alertes, conduite à tenir', 'Remote monitoring, alert triage, management'); } },
  electrophysio: { get nom() { return t('Électrophysiologie', 'Electrophysiology'); }, ico: '⚡', get desc() { return t('Mécanismes, EEP, ablation, antiarythmiques', 'Mechanisms, EP studies, ablation, antiarrhythmic drugs'); } },
};
export const MARQUES = ['Medtronic', 'Abbott', 'Boston Scientific', 'Biotronik', 'MicroPort'];
export const TYPES = {
  get qcu() { return t('QCU', 'Single answer'); },
  get qcm() { return t('QCM', 'Multiple answers'); },
  get vf() { return t('Vrai / Faux', 'True / False'); },
  get ouverte() { return t('Question ouverte', 'Open question'); },
};
export const NIVEAUX = [
  { id: 'tous', get nom() { return t('Tous niveaux', 'All levels'); }, min: 1, max: 10 },
  { id: 'deb', get nom() { return t('Débutant (1–3)', 'Beginner (1–3)'); }, min: 1, max: 3 },
  { id: 'inter', get nom() { return t('Intermédiaire (4–6)', 'Intermediate (4–6)'); }, min: 4, max: 6 },
  { id: 'av', get nom() { return t('Avancé (7–10)', 'Advanced (7–10)'); }, min: 7, max: 10 },
  { id: 'sup3', get nom() { return t('Au-dessus de 3', 'Above 3'); }, min: 4, max: 10 },
];

export const base = { version: '', date: '', langue: 'fr', questions: [], parId: new Map() };

// Libellés anglais des sous-thèmes et recommandations (data/questions/en/libelles.json).
// Les valeurs internes (q.sousTheme, q.reco, marque « Générique ») restent en français : on ne traduit qu'à l'affichage.
let libelles = { sousThemes: {}, reco: {} };
export const libSousTheme = s => (enAnglais() && libelles.sousThemes?.[s]) || s;
export const libReco = r => (enAnglais() && libelles.reco?.[r]) || r;
export const libMarque = m => (m === 'Générique' ? t('Générique', 'Generic') : m);

// Surcouche anglaise : mêmes champs que scripts/i18n.mjs (appliquer), recopiés ici pour ne pas dépendre des scripts.
const CHAMPS = ['question', 'options', 'commentaires', 'reponseAttendue', 'explication', 'aRetenir'];
const TRACES = ['ecg', 'egm', 'simu'];
function appliquer(q, s) {
  if (!s) return q;
  const r = { ...q };
  for (const c of CHAMPS) if (s[c] != null) r[c] = s[c];
  if (s.legende) for (const k of TRACES) if (q[k]?.legende) r[k] = { ...q[k], legende: s.legende };
  return r;
}

// Fichiers JSON gardés en mémoire pour la durée de la visite : changer de langue ne recharge que ce qui manque.
const memoire = new Map();
const lireJson = (chemin, facultatif) => {
  if (!memoire.has(chemin)) {
    memoire.set(chemin, fetch(chemin, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
      return r.json();
    }).catch(e => { memoire.delete(chemin); if (facultatif) return null; throw e; }));
  }
  return memoire.get(chemin);
};

// Charge la base dans la langue courante. En anglais, chaque fichier absent ou question non traduite reste en français.
export async function charger() {
  const en = enAnglais();
  const idx = await lireJson('data/questions/index.json');
  const [listes, surcouches, lib] = await Promise.all([
    Promise.all(idx.fichiers.map(f => lireJson(`data/questions/${f}`))),
    en ? Promise.all(idx.fichiers.map(f => lireJson(`data/questions/en/${f}`, true))) : [],
    en ? lireJson('data/questions/en/libelles.json', true) : null,
  ]);
  libelles = { sousThemes: {}, reco: {}, ...(lib || {}) };
  base.version = idx.version; base.date = idx.date; base.langue = langue;
  base.questions = listes.flatMap((l, i) => (surcouches[i] ? l.map(q => appliquer(q, surcouches[i][q.id])) : l));
  base.parId = new Map(base.questions.map(q => [q.id, q]));
}
// Après un changement de langue : recharge la base si elle n'est pas déjà dans la langue courante.
export const rechargerBase = () => (base.langue === langue && base.questions.length ? Promise.resolve() : charger());

export const aTrace = q => !!(q.ecg || q.ecg12 || q.egm || q.simu);

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

// Domaines d'entraînement proposés à l'accueil.
export const DOMAINES = [
  { id: 'stim', get nom() { return t('Stimulation, DAI, télécardio', 'Pacing, ICD, remote monitoring'); }, ico: '⚙️', themes: ['programmation', 'telecardio'], get desc() { return t('Programmation, EGM, alertes', 'Programming, EGMs, alerts'); } },
  { id: 'ecg', nom: 'ECG', ico: '📈', themes: ['ecg'], get desc() { return t('Tracés, vrais ECG 12 dérivations', 'Tracings, real 12-lead ECGs'); } },
  { id: 'ep', get nom() { return t('Électrophysiologie', 'Electrophysiology'); }, ico: '⚡', themes: ['electrophysio'], get desc() { return t('Mécanismes, EEP, ablation', 'Mechanisms, EP studies, ablation'); } },
  { id: 'tout', get nom() { return t('Tout venant', 'Mixed'); }, ico: '🎲', themes: ['ecg', 'programmation', 'telecardio', 'electrophysio'], get desc() { return t('Un peu de tout, au hasard', 'A bit of everything, at random'); } },
];

// Mode compétitif : question dont la cote est proche du classement du joueur (légèrement au-dessus),
// jamais vue dans la partie en cours, de préférence jamais vue du tout. Les questions ouvertes
// (auto-évaluées) sont exclues : elles ne peuvent pas compter pour un classement.
export function questionCompetitive(dejaPosees) {
  const p = stock.progres();
  const elo = stock.classement().elo;
  // on évite les questions de la session et les 150 dernières questions classées ; si tout a été vu, on repart de toute la base
  const exclus = new Set([...dejaPosees, ...(p.classement.recents || [])]);
  let pool = base.questions.filter(q => q.type !== 'ouverte' && !exclus.has(q.id));
  if (!pool.length) pool = base.questions.filter(q => q.type !== 'ouverte' && !dejaPosees.slice(-20).includes(q.id));
  if (!pool.length) return null;
  const cible = elo + 50;
  const score = q => {
    const e = p.q[q.id];
    const ecart = Math.abs(stock.eloQuestion(q.difficulte) - cible) / 200; // 1 = un cran de difficulté
    return ecart + (e ? (e.dernierOk ? 0.8 : 0.3) : 0) + Math.random() * 0.9;
  };
  return pool.reduce((m, q) => { const v = score(q); return v < m.v ? { q, v } : m; }, { q: null, v: Infinity }).q;
}
