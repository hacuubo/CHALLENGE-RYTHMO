// Accueil épuré : les cinq entrées principales, l'une sous l'autre. Chacune ouvre son propre écran de choix.
import * as stock from '../store.js';
import { resumeSauve } from '../session.js';
import { esc } from '../util.js';
import { ICONES } from '../icones.js';

export function vueAccueil(app, { reprendre }) {
  const c = stock.classement();
  const enCours = resumeSauve();
  const signe = n => (n > 0 ? '+' : '') + n;
  const tuile = (nav, ico, titre, sous, extra = '') => `<button class="tuile" data-nav="${nav}">
      <span class="tuile-ico" aria-hidden="true">${ico}</span>
      <span class="tuile-texte"><strong>${titre}</strong><small>${sous}</small>${extra}</span>
      <span class="tuile-fleche" aria-hidden="true">›</span></button>`;

  app.innerHTML = `
    <h1 class="titre-accueil"><span class="titre-logo" aria-hidden="true">${ICONES.ecg}</span>Challenge Rythmo</h1>
    ${enCours ? `<button class="reprise" id="reprendre">▶ Reprendre : ${esc(enCours.titre)} (${enCours.faites}/${enCours.total})</button>` : ''}
    <nav class="menu-principal centre" aria-label="Choisir une activité">
      ${tuile('entrainement', ICONES.entrainement, 'Entraînement', 'Stimulation, DAI, télécardio · ECG · Électrophysiologie')}
      ${tuile('competitif', ICONES.competitif, 'Compétitif', 'Questions en continu, classement ELO',
        `<span class="tuile-elo"><b>${c.elo}</b> ELO · ${esc(c.titre.nom)}${c.partiesDuJour ? ` · <span class="delta ${c.duJour >= 0 ? 'plus' : 'moins'}">${signe(c.duJour)}</span>` : ''}</span>`)}
      ${tuile('simu-menu', ICONES.simulateur, 'Simulateur', 'Baie d\'électrophysiologie, cas mystères')}
      ${tuile('fiches', ICONES.fiches, 'Fiches', 'Toutes les questions corrigées, avec recherche')}
      ${tuile('progression', ICONES.progression, 'Progression', 'ELO jour après jour, badges, points faibles')}
    </nav>
    <p class="pied-accueil"><button class="lien" data-nav="apropos">Sources et informations</button></p>`;

  if (enCours) app.querySelector('#reprendre').onclick = reprendre;
}
