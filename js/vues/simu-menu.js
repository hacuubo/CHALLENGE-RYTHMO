// Écran de choix du simulateur : cas mystère, mode libre, ou scénario guidé.
import { SCENARIOS } from '../simu/scenarios.js';
import { preparerSimulateur } from './simulateur.js';
import { esc } from '../util.js';
import { ICONES } from '../icones.js';
import { t } from '../i18n.js';

// titres évalués à l'affichage, dans la langue courante
const GROUPES = () => [
  [t('Physiologie', 'Physiology'), ['normal', 'double']],
  [t('Réentrées nodales et jonction', 'AV nodal re-entry and junctional'), ['trin', 'trin-atyp', 'trin-21', 'jonctionnelle']],
  [t('Voies accessoires', 'Accessory pathways'), ['trav', 'septale', 'coumel', 'pjrt', 'wpw', 'mahaim']],
  [t('Tachycardies atriales', 'Atrial tachycardias'), ['ta', 'flutter', 'flutter-mitral', 'fa']],
  [t('Ventricule', 'Ventricular arrhythmias'), ['tv']],
];

export function vueSimuMenu(app, { aller }) {
  app.innerHTML = `
    <h1>${t('Simulateur', 'Simulator')}</h1>
    <div class="menu-principal">
      <button class="tuile" data-simu="mystere"><span class="tuile-ico">${ICONES.mystere}</span><span class="tuile-texte"><strong>${t('Cas mystère', 'Mystery case')}</strong><small>${t('Mécanisme caché, démarche notée sur 10', 'Hidden mechanism, work-up scored out of 10')}</small></span><span class="tuile-fleche" aria-hidden="true">›</span></button>
      <button class="tuile" data-simu="normal"><span class="tuile-ico">${ICONES.baie}</span><span class="tuile-texte"><strong>${t('Baie libre', 'Free EP lab')}</strong><small>${t('Conduction normale : courbes AH, Wenckebach, TRS, para-hisien', 'Normal conduction: AH curves, Wenckebach, SNRT, para-Hisian pacing')}</small></span><span class="tuile-fleche" aria-hidden="true">›</span></button>
    </div>
    ${GROUPES().map(([titre, ids]) => `<section class="groupe-simu"><h2>${esc(titre)}</h2><div class="liste-simu">
      ${ids.map(id => `<button class="choix-simu" data-simu="${id}">${esc(SCENARIOS[id].nom)}</button>`).join('')}</div></section>`).join('')}`;
  app.querySelectorAll('[data-simu]').forEach(b => b.onclick = () => { preparerSimulateur(b.dataset.simu); aller('simulateur'); });
}
