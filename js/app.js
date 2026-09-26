// Point d'entrée : chargement de la base, navigation par ancre (#vue), service worker.
import * as stock from './store.js';
import { base, charger, rechargerBase, questionCompetitive } from './donnees.js';
import { t, definirLangue, langue } from './i18n.js';
import { etat, creer, reprendre as reprendreSession, sauver } from './session.js';
import { toast } from './util.js';
import { vueAccueil } from './vues/accueil.js';
import { vueConfig } from './vues/config.js';
import { vueQuiz, toucheQuiz, arreterQuiz } from './vues/quiz.js';
import { vueResultats } from './vues/resultats.js';
import { vueProgression } from './vues/progression.js';
import { vueAPropos } from './vues/apropos.js';
import { vueCompetitif } from './vues/competitif.js';
import { vueSimulateur, arreterSimulateur } from './vues/simulateur.js';
import { vueEntrainement } from './vues/entrainement.js';
import { vueSimuMenu } from './vues/simu-menu.js';

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
  if (!questions.length) { toast(t('Aucune question ne correspond à ces critères.', 'No questions match these criteria.')); return; }
  creer(questions, titre, opts);
  aller('quiz');
}

function reprendre() {
  if (reprendreSession()) aller('quiz');
  else { toast(t('Cette série n\'est plus disponible.', 'This quiz is no longer available.')); rendre('accueil'); }
}

// Changement de langue (accueil) : base rechargée dans la nouvelle langue, écran courant redessiné, sans recharger la page.
async function changerLangue(l) {
  if (l === langue) return;
  const precedente = langue;
  definirLangue(l);
  try { await rechargerBase(); } catch (e) {
    console.error(e);
    definirLangue(precedente);
    toast(t('Impossible de charger les questions. Vérifiez votre connexion.', 'Unable to load the questions. Please check your connection.'));
  }
  // série en mémoire : ses questions pointent désormais vers la base dans la bonne langue
  const s = etat.session;
  if (s) s.questions = s.questions.map(q => base.parId.get(q.id) || q);
  rendre(location.hash.slice(1) || 'accueil');
}

const ctx = { demarrer, reprendre, aller, appliquerApparence, changerLangue };
const vues = {
  accueil: () => vueAccueil(app, ctx),
  config: () => vueConfig(app, ctx),
  quiz: () => vueQuiz(app, aller),
  resultats: () => vueResultats(app, ctx),
  progression: () => vueProgression(app, ctx),
  apropos: () => vueAPropos(app),
  competitif: () => vueCompetitif(app, ctx),
  simulateur: () => vueSimulateur(app),
  entrainement: () => vueEntrainement(app, ctx),
  'simu-menu': () => vueSimuMenu(app, ctx),
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
  if (vue !== 'simulateur') arreterSimulateur();
  document.body.classList.toggle('sur-accueil', vue === 'accueil');
  vues[vue]();
  // pas de barre de navigation : chaque écran a son retour vers l'écran parent (accueil épuré → écrans de choix → activité)
  const accueil = ['accueil', t('Accueil', 'Home')];
  const parent = { entrainement: accueil, 'simu-menu': accueil, competitif: accueil,
    progression: accueil, config: ['entrainement', t('Entraînement', 'Training')], simulateur: accueil }[vue];
  if (parent) app.insertAdjacentHTML('afterbegin', `<button class="retour-accueil" data-nav="${parent[0]}">‹ ${parent[1]}</button>`);
  if (vue === 'apropos') app.insertAdjacentHTML('afterbegin', `<button class="retour-fleche" data-nav="accueil" aria-label="${t('Retour à l\'accueil', 'Back to home')}" title="${t('Accueil', 'Home')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg></button>`);
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  e.preventDefault();
  const s = etat.session;
  if (s && !s.fini && location.hash === '#quiz' && s.reponses.some(Boolean)
    && !confirm(t('Quitter la série ? Vous pourrez la reprendre depuis l\'accueil.', 'Leave this quiz? You can resume it from the home screen.'))) return;
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
// Écran titre : la marque s'affiche pendant le chargement puis s'efface pour laisser place à l'accueil.
const debutTitre = performance.now();
function effacerTitre() {
  const titre = document.getElementById('ecran-titre');
  if (!titre) return;
  const bref = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    titre.classList.add('sortie');
    setTimeout(() => titre.remove(), bref ? 50 : 600);
  }, Math.max(0, (bref ? 400 : 1700) - (performance.now() - debutTitre)));
}
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
  app.innerHTML = `<div class="carte"><h2>${t('Impossible de charger les questions', 'Unable to load the questions')}</h2><p>${t('Vérifiez votre connexion puis rechargez la page.', 'Check your connection, then reload the page.')}</p></div>`;
}
effacerTitre();
if ('serviceWorker' in navigator) {
  const dejaControle = !!navigator.serviceWorker.controller; // pas d'annonce lors de la toute première installation
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated' && dejaControle) toast(t('Nouvelle version installée : elle sera utilisée au prochain lancement.', 'New version installed: it will be used next time you open the app.'), 4000);
      });
    });
  }).catch(() => {});
}
