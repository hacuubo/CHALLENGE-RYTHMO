// Série en cours : création, fin, sauvegarde et reprise.
import * as stock from './store.js';
import { base } from './donnees.js';

export const etat = { session: null, nouveauxBadges: [] };
const SECONDES_PAR_QUESTION_EXAMEN = 90;

export function creer(questions, titre, opts = {}) {
  const s = {
    titre, questions, i: 0, reponses: [], points: 0, combo: 0, meilleurCombo: 0,
    debut: Date.now(), fini: false, examen: !!opts.examen,
    competitif: opts.competitif ? { eloDebut: stock.classement().elo } : null,
  };
  if (s.examen) s.finPrevue = s.debut + questions.length * SECONDES_PAR_QUESTION_EXAMEN * 1000;
  etat.session = s;
  stock.sauverSession(s);
  return s;
}

export function sauver() { stock.sauverSession(etat.session); }

export function terminer() {
  const s = etat.session;
  if (!s || s.fini) return;
  s.fini = true;
  etat.nouveauxBadges = s.reponses.some(Boolean) ? stock.enregistrerSession(s) : [];
  stock.oublierSession();
}

export function reprendre() {
  const brut = stock.sessionSauvee();
  if (!brut) return null;
  const questions = brut.questions.map(id => base.parId.get(id)).filter(Boolean);
  if (!questions.length) { stock.oublierSession(); return null; }
  etat.session = { ...brut, questions, i: Math.min(brut.i, questions.length - 1) };
  if (etat.session.examen) {
    // le chrono ne tourne pas pendant que l'application est fermée
    const ecoule = (brut.pause || Date.now()) - brut.debut;
    etat.session.finPrevue = Date.now() + Math.max(0, brut.finPrevue - brut.debut - ecoule);
    etat.session.debut = Date.now() - ecoule;
  }
  return etat.session;
}

export function resumeSauve() {
  const b = stock.sessionSauvee();
  if (!b) return null;
  return { titre: b.titre, faites: b.reponses.filter(Boolean).length, total: b.questions.length };
}
