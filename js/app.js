// Point d'entrée : chargement de la base, navigation par ancre (#vue), service worker.
import * as stock from './store.js';
import { base, charger, questionCompetitive } from './donnees.js';
import { etat, creer, reprendre as reprendreSession, sauver } from './session.js';
import { toast } from './util.js';
import { vueAccueil } from './vues/accueil.js';
import { vueConfig } from './vues/config.js';
import { vueQuiz, toucheQuiz, arreterQuiz } from './vues/quiz.js';
import { vueResultats } from './vues/resultats.js';
import { vueProgression } from './vues/progression.js';
import { vueFiches } from './vues/fiches.js';
import { vueAPropos } from './vues/apropos.js';
import { vueCompetitif } from './vues/competitif.js';

const app = document.getElementById('app');

function appliquerApparence() {
  const a = stock.apparence();
  if (a === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = a;
}

function demarrer(questions, titre, opts = {}) {
  if (opts.competitif) {
    const q = questionCompetitive([]);
    questions = q ? [q] : [];
  }
  if (!questions.length) { toast('Aucune question ne correspond à ces critères.'); return; }
  creer(questions, titre, opts);
  aller('quiz');
}

function reprendre() {
  if (reprendreSession()) aller('quiz');
  else { toast('Cette série n\'est plus disponible.'); rendre('accueil'); }
}

const ctx = { demarrer, reprendre, aller, appliquerApparence };
const vues = {
  accueil: () => vueAccueil(app, ctx),
  config: () => vueConfig(app, ctx),
  quiz: () => vueQuiz(app, aller),
  resultats: () => vueResultats(app, ctx),
  progression: () => vueProgression(app, ctx),
  fiches: () => vueFiches(app, ctx),
  apropos: () => vueAPropos(app),
  competitif: () => vueCompetitif(app, ctx),
};

function aller(vue) {
  if (location.hash.slice(1) === vue) rendre(vue); else location.hash = vue; // hashchange → rendre
}

function rendre(vue) {
  if (!vues[vue]) vue = 'accueil';
  const s = etat.session;
  if (vue === 'quiz' && (!s || s.fini)) vue = 'accueil';
  if (vue === 'resultats' && !s) vue = 'accueil';
  if (vue !== 'quiz') arreterQuiz();
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('actif', b.dataset.nav === vue || (vue === 'quiz' && b.dataset.nav === (s?.competitif ? 'competitif' : 'accueil')) || (vue === 'config' && b.dataset.nav === 'accueil')));
  vues[vue]();
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  e.preventDefault();
  const s = etat.session;
  if (s && !s.fini && location.hash === '#quiz' && s.reponses.some(Boolean)
    && !confirm('Quitter la série ? Vous pourrez la reprendre depuis l\'accueil.')) return;
  aller(b.dataset.nav);
});

window.addEventListener('hashchange', () => rendre(location.hash.slice(1)));

document.addEventListener('keydown', e => {
  if (location.hash === '#quiz' && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('.plein')) toucheQuiz(e);
});

// Examen : le chronomètre est suspendu quand l'application passe en arrière-plan.
document.addEventListener('visibilitychange', () => {
  const s = etat.session;
  if (!s || s.fini) return;
  if (document.hidden) { s.pause = Date.now(); sauver(); } else if (s.pause) {
    if (s.examen) { const arret = Date.now() - s.pause; s.finPrevue += arret; s.debut += arret; }
    s.pause = null; sauver();
  }
});

// ---------- démarrage ----------
appliquerApparence();
try {
  await charger();
  stock.initialiserConnues(base.questions);
  // une série interrompue (fermeture, rechargement) se reprend depuis l'accueil
  const h = location.hash.slice(1);
  if (h === 'quiz' || h === 'resultats') history.replaceState(null, '', '#accueil');
  rendre(h === 'quiz' || h === 'resultats' ? 'accueil' : h || 'accueil');
} catch (e) {
  console.error(e);
  app.innerHTML = '<div class="carte"><h2>Impossible de charger les questions</h2><p>Vérifiez votre connexion puis rechargez la page.</p></div>';
}
if ('serviceWorker' in navigator) {
  const dejaControle = !!navigator.serviceWorker.controller; // pas d'annonce lors de la toute première installation
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated' && dejaControle) toast('Nouvelle version installée : elle sera utilisée au prochain lancement.', 4000);
      });
    });
  }).catch(() => {});
}
