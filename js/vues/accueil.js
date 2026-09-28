// Accueil épuré : les quatre entrées principales, l'une sous l'autre. Chacune ouvre son propre écran de choix.
// En haut à droite : choix de la langue (FR | EN).
import * as stock from '../store.js';
import { resumeSauve } from '../session.js';
import { esc, toast } from '../util.js';
import { ICONES, LOGO } from '../icones.js';
import { t, langue, LANGUES, definirLangue, proposerAnglais } from '../i18n.js';
import { proposition, quandInstallable, installer, refuser, etapesIOS } from '../installation.js';

export function vueAccueil(app, ctx) {
  const { reprendre, changerLangue } = ctx;
  const c = stock.classement();
  const enCours = resumeSauve();
  const signe = n => (n > 0 ? '+' : '') + n;
  const tuile = (nav, ico, titre, extra = '') => `<button class="tuile" data-nav="${nav}">
      <span class="tuile-ico" aria-hidden="true">${ico}</span>
      <span class="tuile-texte"><strong>${titre}</strong>${extra}</span>
      <span class="tuile-fleche" aria-hidden="true">›</span></button>`;
  const choixLangue = `<div class="choix-langue" role="group" aria-label="${t('Langue', 'Language')}">
      ${Object.entries(LANGUES).map(([l, nom]) => `<button type="button" data-langue="${l}" lang="${l}" aria-label="${nom}" title="${nom}" aria-pressed="${l === langue}">${l.toUpperCase()}</button>`).join('')}
    </div>`;
  // visiteur non francophone sur la version française : invitation, rédigée en anglais
  const invitation = proposerAnglais() ? `<div class="invitation-langue" lang="en" role="region" aria-label="Language">
      <span>Also available in English</span>
      <button type="button" class="btn" data-langue="en">Switch to English</button>
      <button type="button" class="fermer-invitation" aria-label="Dismiss" title="Dismiss">✕</button>
    </div>` : '';

  app.innerHTML = `
    ${choixLangue}
    <h1 class="titre-accueil"><span class="titre-logo" aria-hidden="true">${LOGO}</span>Shock <span class="esperluette">&amp;</span> Pace</h1>
    ${invitation}
    ${encartInstallation()}
    ${enCours ? `<button class="reprise" id="reprendre">▶ ${t('Reprendre :', 'Resume:')} ${esc(enCours.titre)} (${enCours.faites}/${enCours.total})</button>` : ''}
    <nav class="menu-principal centre" aria-label="${t('Choisir une activité', 'Choose an activity')}">
      ${tuile('simulateur', ICONES.simulateur, t('Simulateur', 'Simulator'))}
      ${tuile('entrainement', ICONES.entrainement, t('Entraînement', 'Training'))}
      ${tuile('competitif', ICONES.competitif, t('Compétitif', 'Competitive'),
        `<span class="tuile-elo"><b>${c.elo}</b> ELO · ${esc(c.titre.nom)}${c.partiesDuJour ? ` · <span class="delta ${c.duJour >= 0 ? 'plus' : 'moins'}">${signe(c.duJour)}</span>` : ''}</span>`)}
      ${tuile('progression', ICONES.progression, t('Progression', 'Progress'))}
    </nav>
    <p class="pied-accueil"><button class="lien" data-nav="apropos">${t('Sources et informations', 'Sources and information')}</button></p>`;

  if (enCours) app.querySelector('#reprendre').onclick = reprendre;
  app.querySelectorAll('[data-langue]').forEach(b => b.onclick = () => {
    const l = b.dataset.langue;
    if (l === langue) { definirLangue(l); app.querySelector('.invitation-langue')?.remove(); return; } // choix mémorisé
    b.closest('.choix-langue, .invitation-langue')?.setAttribute('aria-busy', 'true');
    changerLangue(l);
  });
  const fermer = app.querySelector('.fermer-invitation');
  if (fermer) fermer.onclick = () => { definirLangue('fr'); app.querySelector('.invitation-langue').remove(); };
  brancherInstallation(app);
  // Android : l'événement d'installation peut arriver après l'affichage de l'accueil
  quandInstallable(() => {
    if (!app.querySelector('.menu-principal.centre') || app.querySelector('.installation')) return;
    (app.querySelector('.invitation-langue') || app.querySelector('.titre-accueil')).insertAdjacentHTML('afterend', encartInstallation());
    brancherInstallation(app);
  });
}

// Encart « Installer l'application » : bouton Installer (Android) ou démarche expliquée (iPhone, iPad). Rien sur ordinateur.
function encartInstallation() {
  const mode = proposition();
  if (!mode) return '';
  const action = mode === 'bouton'
    ? `<button type="button" class="btn" id="installer">${t('Installer', 'Install')}</button>`
    : `<button type="button" class="btn" id="installer" aria-expanded="false" aria-controls="installation-etapes">${t('Comment faire', 'How to')}</button>`;
  const etapes = mode === 'ios' ? `<ol id="installation-etapes" class="installation-etapes" hidden>${etapesIOS().map(e => `<li>${e}</li>`).join('')}</ol>` : '';
  return `<section class="installation" data-mode="${mode}" role="region" aria-label="${t('Installer l\'application', 'Install the app')}">
      <span class="installation-ico" aria-hidden="true">${ICONES.installation}</span>
      <span class="installation-texte"><strong>${t('Installer l\'application sur votre téléphone', 'Install the app on your phone')}</strong>
        <span>${t('Icône sur l\'écran d\'accueil, plein écran, hors connexion.', 'Home screen icon, full screen, works offline.')}</span></span>
      ${action}
      <button type="button" class="fermer-invitation fermer-installation" aria-label="${t('Ne plus proposer', 'Don\'t ask again')}" title="${t('Ne plus proposer', 'Don\'t ask again')}">✕</button>
      ${etapes}
    </section>`;
}
function brancherInstallation(app) {
  const encart = app.querySelector('.installation');
  if (!encart) return;
  const bouton = encart.querySelector('#installer');
  if (encart.dataset.mode === 'bouton') {
    bouton.onclick = async () => {
      bouton.disabled = true;
      const ok = await installer();
      encart.remove(); // accepté : l'application s'installe ; refusé : on reproposera à une prochaine visite
      if (!ok) toast(t('Installation annulée. Menu ⋮ du navigateur → « Installer l\'application » quand vous voudrez.', 'Installation cancelled. Browser menu ⋮ → “Install app” whenever you like.'), 3500);
    };
  } else {
    bouton.onclick = () => {
      const etapes = encart.querySelector('#installation-etapes');
      const ouvert = etapes.hidden;
      etapes.hidden = !ouvert;
      bouton.setAttribute('aria-expanded', String(ouvert));
      bouton.textContent = ouvert ? t('Masquer', 'Hide') : t('Comment faire', 'How to');
    };
  }
  encart.querySelector('.fermer-installation').onclick = () => { refuser(); encart.remove(); };
}
