// Persistance locale (localStorage) : progression, réglages, questions déjà connues.
// Répétition espacée simple par boîtes de Leitner (1 à 5).

const CLE_PROGRES = 'rythmo.progres.v1';
const CLE_CONFIG = 'rythmo.config.v1';
const CLE_CONNUES = 'rythmo.connues.v1';
const CLE_APPARENCE = 'rythmo.apparence';
const JOUR = 86400000;
const INTERVALLES = [0, 0, 1, 3, 7, 21].map(j => j * JOUR); // par boîte

const lire = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
const ecrire = (cle, val) => { try { localStorage.setItem(cle, JSON.stringify(val)); } catch { /* stockage indisponible */ } };

const vide = () => ({ q: {}, sessions: [], serie: { jour: null, compte: 0 } });
let cache = null;

export function progres() {
  if (!cache) cache = { ...vide(), ...lire(CLE_PROGRES, vide()) };
  return cache;
}
const sauver = () => ecrire(CLE_PROGRES, cache);

const aujourdhui = () => new Date().toLocaleDateString('sv'); // AAAA-MM-JJ local

export function noterReponse(id, juste) {
  const p = progres();
  const e = p.q[id] || { vus: 0, justes: 0, boite: 0, dernier: 0 };
  e.vus++;
  if (juste) { e.justes++; e.boite = Math.min(5, e.boite + 1); } else e.boite = 1;
  e.dernier = Date.now();
  e.dernierOk = juste;
  p.q[id] = e;
  const j = aujourdhui();
  if (p.serie.jour !== j) {
    const hier = new Date(Date.now() - JOUR).toLocaleDateString('sv');
    p.serie.compte = p.serie.jour === hier ? p.serie.compte + 1 : 1;
    p.serie.jour = j;
  }
  sauver();
}

export function enregistrerSession(s) {
  const p = progres();
  const rep = s.reponses.filter(Boolean);
  p.sessions.push({ date: Date.now(), titre: s.titre, n: rep.length, ok: rep.filter(r => r.juste).length, points: s.points });
  p.sessions = p.sessions.slice(-100);
  sauver();
}

// Plus le poids est élevé, plus la question mérite d'être revue.
export function poidsRevision(e) {
  if (!e) return 1.5;
  const echecs = e.vus - e.justes;
  return (e.dernierOk ? 0 : 3) + (5 - e.boite) + echecs * 0.5;
}

export function aReviser(questions) {
  const p = progres(), now = Date.now();
  return questions
    .filter(q => { const e = p.q[q.id]; return e && e.boite < 5 && (!e.dernierOk || now - e.dernier >= INTERVALLES[e.boite]); })
    .sort((a, b) => poidsRevision(p.q[b.id]) - poidsRevision(p.q[a.id]));
}

// ----- nouveautés : questions ajoutées à la base depuis la dernière visite -----
export function initialiserConnues(questions) {
  if (localStorage.getItem(CLE_CONNUES) === null) marquerConnues(questions);
}
export function nouveautes(questions) {
  const connues = new Set(lire(CLE_CONNUES, []));
  return questions.filter(q => !connues.has(q.id));
}
export function marquerConnues(questions) { ecrire(CLE_CONNUES, questions.map(q => q.id)); }

// ----- réglages -----
const CONFIG_DEFAUT = {
  themes: ['ecg', 'programmation', 'telecardio', 'electrophysio'], marques: [], sousThemes: [],
  types: ['qcu', 'qcm', 'vf', 'ouverte'], min: 1, max: 10, n: 10, priorite: 'hasard',
};
export const config = () => ({ ...CONFIG_DEFAUT, ...lire(CLE_CONFIG, {}) });
export const sauverConfig = c => ecrire(CLE_CONFIG, c);
export const apparence = () => lire(CLE_APPARENCE, 'auto');
export const sauverApparence = a => ecrire(CLE_APPARENCE, a);

export function reinitialiser() { cache = vide(); sauver(); }
export function importer(obj) {
  if (!obj || typeof obj.q !== 'object') throw new Error('format');
  cache = { ...vide(), ...obj }; sauver();
}
