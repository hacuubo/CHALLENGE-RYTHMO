// Persistance locale (localStorage) : progression, niveau estimé, réglages, série en cours.
// - Répétition espacée simple par boîtes de Leitner (1 à 5).
// - Niveau estimé de type Elo, global et par thème, converti en niveau de difficulté 1-10.

const CLE_PROGRES = 'rythmo.progres.v1';
const CLE_CONFIG = 'rythmo.config.v2';
const CLE_CONNUES = 'rythmo.connues.v1';
const CLE_APPARENCE = 'rythmo.apparence';
const CLE_SESSION = 'rythmo.session.v1';
const JOUR = 86400000;
const INTERVALLES = [0, 0, 1, 3, 7, 21].map(j => j * JOUR); // par boîte

const lire = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
const ecrire = (cle, val) => { try { localStorage.setItem(cle, JSON.stringify(val)); } catch { /* stockage indisponible */ } };

const vide = () => ({
  q: {}, sessions: [], serie: { jour: null, compte: 0, record: 0 },
  elo: { global: 1000, n: 0, themes: {} }, points: 0, badges: {}, compteurs: { ecgJustes: 0, meilleurCombo: 0 },
});
let cache = null;

export function progres() {
  if (!cache) {
    const brut = lire(CLE_PROGRES, {});
    const v = vide();
    cache = { ...v, ...brut, serie: { ...v.serie, ...brut.serie }, elo: { ...v.elo, ...brut.elo }, compteurs: { ...v.compteurs, ...brut.compteurs } };
  }
  return cache;
}
const sauver = () => ecrire(CLE_PROGRES, cache);
const aujourdhui = () => new Date().toLocaleDateString('sv'); // AAAA-MM-JJ local

// ----- niveau estimé (Elo) -----
export const eloQuestion = difficulte => 700 + difficulte * 60;
export const niveauDepuisElo = r => Math.max(1, Math.min(10, Math.round((r - 700) / 60)));
function majElo(ancien, rq, score, n) {
  const attendu = 1 / (1 + 10 ** ((rq - ancien) / 400));
  const k = n < 20 ? 48 : 24;
  return ancien + k * (score - attendu);
}
export function niveau(theme) {
  const e = progres().elo;
  const t = theme ? e.themes[theme] : null;
  const r = t ? t.r : e.global;
  return { elo: Math.round(r), niveau: niveauDepuisElo(r), n: t ? t.n : e.n };
}

// score : 1 juste, 0,5 partiel, 0 faux
export function noterReponse(q, score, { differe = false } = {}) {
  const p = progres();
  const juste = score === 1;
  const e = p.q[q.id] || { vus: 0, justes: 0, boite: 0, dernier: 0 };
  e.vus++;
  if (juste) { e.justes++; e.boite = Math.min(5, e.boite + 1); } else e.boite = 1;
  e.dernier = Date.now();
  e.dernierOk = juste;
  p.q[q.id] = e;

  const rq = eloQuestion(q.difficulte);
  p.elo.global = majElo(p.elo.global, rq, score, p.elo.n); p.elo.n++;
  const t = p.elo.themes[q.theme] || { r: 1000, n: 0 };
  t.r = majElo(t.r, rq, score, t.n); t.n++;
  p.elo.themes[q.theme] = t;

  if (juste) { p.points += q.difficulte; if (q.ecg || q.ecg12) p.compteurs.ecgJustes++; }

  const j = aujourdhui();
  if (p.serie.jour !== j) {
    const hier = new Date(Date.now() - JOUR).toLocaleDateString('sv');
    p.serie.compte = p.serie.jour === hier ? p.serie.compte + 1 : 1;
    p.serie.jour = j;
    p.serie.record = Math.max(p.serie.record || 0, p.serie.compte);
  }
  if (!differe) sauver();
}

export function enregistrerSession(s) {
  const p = progres();
  const rep = s.reponses.filter(Boolean);
  p.sessions.push({ date: Date.now(), titre: s.titre, n: rep.length, ok: rep.filter(r => r.juste).length, points: s.points, examen: !!s.examen });
  p.sessions = p.sessions.slice(-100);
  p.compteurs.meilleurCombo = Math.max(p.compteurs.meilleurCombo || 0, s.meilleurCombo || 0);
  const nouveaux = verifierBadges(s);
  sauver();
  return nouveaux;
}

// ----- badges et grades -----
export const GRADES = [
  { min: 0, nom: 'Externe' }, { min: 100, nom: 'Interne' }, { min: 400, nom: 'Docteur junior' },
  { min: 1000, nom: 'Chef de clinique' }, { min: 2500, nom: 'Rythmologue' }, { min: 5000, nom: 'Expert EHRA' },
  { min: 9000, nom: 'Légende de l\'EP' },
];
export function grade(points = progres().points) {
  let i = 0;
  while (i + 1 < GRADES.length && points >= GRADES[i + 1].min) i++;
  return { ...GRADES[i], suivant: GRADES[i + 1] || null };
}
export const BADGES = [
  { id: 'premiere', ico: '🎬', nom: 'Première série', desc: 'Terminer une série' },
  { id: 'parfait', ico: '💯', nom: 'Sans faute', desc: '100 % sur une série d\'au moins 10 questions' },
  { id: 'combo10', ico: '🔥', nom: 'En feu', desc: '10 bonnes réponses d\'affilée' },
  { id: 'semaine', ico: '📆', nom: 'Assidu', desc: '7 jours d\'affilée' },
  { id: 'cent', ico: '🎯', nom: 'Centurion', desc: '100 questions différentes vues' },
  { id: 'cinqcents', ico: '🏅', nom: 'Marathonien', desc: '500 questions différentes vues' },
  { id: 'ecg50', ico: '📈', nom: 'Œil d\'ECG', desc: '50 bonnes réponses sur des tracés' },
  { id: 'examen', ico: '⏱️', nom: 'Examen réussi', desc: 'Au moins 80 % en mode examen (10 questions ou plus)' },
  { id: 'expert', ico: '🧠', nom: 'Niveau 8', desc: 'Atteindre un niveau estimé de 8' },
];
function verifierBadges(s) {
  const p = progres(), b = p.badges, nouveaux = [];
  const gagner = id => { if (!b[id]) { b[id] = Date.now(); nouveaux.push(BADGES.find(x => x.id === id)); } };
  const rep = s.reponses.filter(Boolean), ok = rep.filter(r => r.juste).length;
  if (rep.length) gagner('premiere');
  if (rep.length >= 10 && ok === rep.length) gagner('parfait');
  if ((s.meilleurCombo || 0) >= 10) gagner('combo10');
  if ((p.serie.compte || 0) >= 7) gagner('semaine');
  const vus = Object.keys(p.q).length;
  if (vus >= 100) gagner('cent');
  if (vus >= 500) gagner('cinqcents');
  if (p.compteurs.ecgJustes >= 50) gagner('ecg50');
  if (s.examen && rep.length >= 10 && ok / rep.length >= 0.8) gagner('examen');
  if (niveauDepuisElo(p.elo.global) >= 8 && p.elo.n >= 30) gagner('expert');
  return nouveaux;
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

// ----- série en cours (reprise après fermeture de l'application) -----
export function sauverSession(s) {
  if (!s || s.fini) { try { localStorage.removeItem(CLE_SESSION); } catch { /* */ } return; }
  ecrire(CLE_SESSION, { ...s, questions: s.questions.map(q => q.id) });
}
export function sessionSauvee() { return lire(CLE_SESSION, null); }
export function oublierSession() { try { localStorage.removeItem(CLE_SESSION); } catch { /* */ } }

// ----- réglages -----
const CONFIG_DEFAUT = {
  themes: ['ecg', 'programmation', 'telecardio', 'electrophysio'], marques: [], sousThemes: [],
  types: ['qcu', 'qcm', 'vf', 'ouverte'], min: 1, max: 10, n: 10, priorite: 'hasard', mode: 'entrainement', ecgSeul: false,
};
export const config = () => ({ ...CONFIG_DEFAUT, ...lire(CLE_CONFIG, {}) });
export const sauverConfig = c => ecrire(CLE_CONFIG, c);
export const apparence = () => lire(CLE_APPARENCE, 'auto');
export const sauverApparence = a => ecrire(CLE_APPARENCE, a);

export function reinitialiser() { cache = vide(); sauver(); oublierSession(); }
export function importer(obj) {
  if (!obj || typeof obj.q !== 'object') throw new Error('format');
  cache = null; ecrire(CLE_PROGRES, obj); progres();
}
