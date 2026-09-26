// Accueil épuré : les quatre entrées principales, l'une sous l'autre. Chacune ouvre son propre écran de choix.
// En haut à droite : choix de la langue (FR | EN).
import * as stock from '../store.js';
import { resumeSauve } from '../session.js';
import { esc } from '../util.js';
import { ICONES } from '../icones.js';
import { t, langue, LANGUES, definirLangue, proposerAnglais } from '../i18n.js';

export function vueAccueil(app, ctx) {
  const { reprendre, changerLangue } = ctx;
  const c = stock.classement();
  const enCours = resumeSauve();
  const signe = n => (n > 0 ? '+' : '') + n;
  const tuile = (nav, ico, titre, sous, extra = '') => `<button class="tuile" data-nav="${nav}">
      <span class="tuile-ico" aria-hidden="true">${ico}</span>
      <span class="tuile-texte"><strong>${titre}</strong><small>${sous}</small>${extra}</span>
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
    <h1 class="titre-accueil"><span class="titre-logo" aria-hidden="true">${ICONES.ecg}</span>Challenge Rythmo</h1>
    ${invitation}
    ${enCours ? `<button class="reprise" id="reprendre">▶ ${t('Reprendre :', 'Resume:')} ${esc(enCours.titre)} (${enCours.faites}/${enCours.total})</button>` : ''}
    <nav class="menu-principal centre" aria-label="${t('Choisir une activité', 'Choose an activity')}">
      ${tuile('entrainement', ICONES.entrainement, t('Entraînement', 'Training'), t('Stimulation, DAI, télécardio · ECG · Électrophysiologie', 'Pacing, ICD, remote monitoring · ECG · Electrophysiology'))}
      ${tuile('competitif', ICONES.competitif, t('Compétitif', 'Competitive'), t('Questions en continu, classement ELO', 'Non-stop questions, ELO rating'),
        `<span class="tuile-elo"><b>${c.elo}</b> ELO · ${esc(c.titre.nom)}${c.partiesDuJour ? ` · <span class="delta ${c.duJour >= 0 ? 'plus' : 'moins'}">${signe(c.duJour)}</span>` : ''}</span>`)}
      ${tuile('simulateur', ICONES.simulateur, t('Simulateur', 'Simulator'), t('Baie d\'électrophysiologie, cas mystères', 'EP lab recording system, mystery cases'))}
      ${tuile('progression', ICONES.progression, t('Progression', 'Progress'), t('ELO jour après jour, badges, points faibles', 'Daily ELO, badges, weak spots'))}
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
}
