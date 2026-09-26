// Persistance locale (localStorage) : progression, niveau estimé, réglages, série en cours.
// - Répétition espacée simple par boîtes de Leitner (1 à 5).
// - Classement ELO du mode compétitif, sur l'échelle des échecs (départ 600, K = 40 / 20 / 10).

import { t } from './i18n.js';

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
  classement: { elo: 600, n: 0, pic: 600, jours: {} }, points: 0, badges: {}, compteurs: { ecgJustes: 0, meilleurCombo: 0 },
});
let cache = null;

export function progres() {
  if (!cache) {
    const brut = lire(CLE_PROGRES, {});
    const v = vide();
    cache = { ...v, ...brut, serie: { ...v.serie, ...brut.serie }, classement: { ...v.classement, ...brut.classement }, compteurs: { ...v.compteurs, ...brut.compteurs } };
    // départ abaissé à 600 : un joueur qui n'a encore joué aucune partie classée repart de 600
    if (!cache.classement.n) Object.assign(cache.classement, { elo: 600, pic: 600 });
  }
  return cache;
}
const sauver = () => ecrire(CLE_PROGRES, cache);
const aujourdhui = () => new Date().toLocaleDateString('sv'); // AAAA-MM-JJ local

// ----- Classement ELO (mode compétitif) -----
// Chaque question a une cote fixe tirée de sa difficulté : 1 → 800 (débutant) … 10 → 2600 (grand maître).
// Répondre revient à jouer une partie contre la question : gain = 1, réponse fausse = 0.
export const ELO_DEPART = 600;
export const eloQuestion = difficulte => 800 + (difficulte - 1) * 200;
export const niveauDepuisElo = r => Math.max(1, Math.min(10, Math.round((r - 800) / 200) + 1));
// titres : libellé relu à chaque accès (suit la langue courante)
const titreElo = (min, fr, en) => ({ min, get nom() { return t(fr, en); } });
export const TITRES = [
  titreElo(0, 'Débutant', 'Beginner'), titreElo(1000, 'Amateur', 'Amateur'), titreElo(1400, 'Joueur de club', 'Club player'),
  titreElo(1800, 'Expert', 'Expert'), titreElo(2000, 'Candidat maître', 'Candidate Master'), titreElo(2200, 'Maître', 'Master'),
  titreElo(2400, 'Maître international', 'International Master'), titreElo(2500, 'Grand maître', 'Grandmaster'),
];
export function titre(elo) {
  let i = 0;
  while (i + 1 < TITRES.length && elo >= TITRES[i + 1].min) i++;
  return { min: TITRES[i].min, get nom() { return TITRES[i].nom; }, suivant: TITRES[i + 1] || null };
}
export function classement() {
  const c = progres().classement;
  const jour = c.jours[aujourdhui()];
  const hier = Object.keys(c.jours).filter(j => j < aujourdhui()).sort().pop();
  const reference = hier ? c.jours[hier].elo : ELO_DEPART;
  return { elo: Math.round(c.elo), n: c.n, pic: Math.round(c.pic), titre: titre(c.elo), niveau: niveauDepuisElo(c.elo),
    duJour: jour ? Math.round(c.elo - reference) : 0, partiesDuJour: jour ? jour.n : 0 };
}
// Coefficient K de la FIDE : 40 pour les 30 premières parties, 20 ensuite, 10 au-delà de 2400.
const coefficientK = c => (c.n < 30 ? 40 : c.elo < 2400 ? 20 : 10);
export function jouerCompetitif(q, score) {
  const p = progres(), c = p.classement;
  const avant = c.elo, rq = eloQuestion(q.difficulte);
  const attendu = 1 / (1 + 10 ** ((rq - avant) / 400));
  const delta = Math.round(coefficientK(c) * (score - attendu));
  c.elo = Math.max(100, avant + delta); c.n++; c.pic = Math.max(c.pic, c.elo);
  c.recents = [...(c.recents || []).filter(id => id !== q.id), q.id].slice(-150);
  const j = aujourdhui();
  const jour = c.jours[j] || { n: 0, gagnees: 0 };
  jour.n++; if (score === 1) jour.gagnees++; jour.elo = c.elo;
  c.jours[j] = jour;
  sauver();
  return { avant, apres: c.elo, delta, attendu };
}
export function historiqueElo() {
  return Object.entries(progres().classement.jours).sort((a, b) => a[0].localeCompare(b[0])).map(([jour, v]) => ({ jour, ...v }));
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

  if (juste) { p.points += q.difficulte; if (q.ecg || q.ecg12 || q.egm || q.simu) p.compteurs.ecgJustes++; }

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
  p.sessions.push({ date: Date.now(), titre: s.titre, n: rep.length, ok: rep.filter(r => r.juste).length, points: s.points, examen: !!s.examen,
    elo: s.competitif ? { debut: s.competitif.eloDebut, fin: p.classement.elo } : undefined });
  p.sessions = p.sessions.slice(-100);
  p.compteurs.meilleurCombo = Math.max(p.compteurs.meilleurCombo || 0, s.meilleurCombo || 0);
  const nouveaux = verifierBadges(s);
  sauver();
  return nouveaux;
}

// ----- badges -----
// nom et description relus à chaque accès (suivent la langue courante)
const badge = (id, ico, nom, desc) => ({ id, ico, get nom() { return t(...nom); }, get desc() { return t(...desc); } });
export const BADGES = [
  badge('premiere', '🎬', ['Première série', 'First quiz'], ['Terminer une série', 'Finish a quiz']),
  badge('parfait', '💯', ['Sans faute', 'Flawless'], ['100 % sur une série d\'au moins 10 questions', '100% on a quiz of at least 10 questions']),
  badge('combo10', '🔥', ['En feu', 'On fire'], ['10 bonnes réponses d\'affilée', '10 correct answers in a row']),
  badge('semaine', '📆', ['Assidu', 'Dedicated'], ['7 jours d\'affilée', '7 days in a row']),
  badge('cent', '🎯', ['Centurion', 'Centurion'], ['100 questions différentes vues', '100 different questions seen']),
  badge('cinqcents', '🏅', ['Marathonien', 'Marathon runner'], ['500 questions différentes vues', '500 different questions seen']),
  badge('ecg50', '📈', ['Œil d\'ECG', 'ECG eye'], ['50 bonnes réponses sur des tracés', '50 correct answers on tracings']),
  badge('examen', '⏱️', ['Examen réussi', 'Exam passed'], ['Au moins 80 % en mode examen (10 questions ou plus)', 'At least 80% in exam mode (10 questions or more)']),
  badge('club', '♞', ['Joueur de club', 'Club player'], ['Atteindre 1400 ELO en mode compétitif', 'Reach 1400 ELO in competitive mode']),
  badge('expert', '♛', ['Expert', 'Expert'], ['Atteindre 1800 ELO en mode compétitif', 'Reach 1800 ELO in competitive mode']),
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
  if (p.classement.pic >= 1400) gagner('club');
  if (p.classement.pic >= 1800) gagner('expert');
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
