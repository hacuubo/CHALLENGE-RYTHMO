// Écran de choix du simulateur : cas mystère, mode libre, ou scénario guidé.
import { SCENARIOS } from '../simu/scenarios.js';
import { preparerSimulateur } from './simulateur.js';
import { esc } from '../util.js';

const GROUPES = [
  ['Physiologie', ['normal', 'double']],
  ['Réentrées nodales et jonction', ['trin', 'trin-atyp', 'trin-21', 'jonctionnelle']],
  ['Voies accessoires', ['trav', 'septale', 'coumel', 'pjrt', 'wpw', 'mahaim']],
  ['Tachycardies atriales', ['ta', 'flutter', 'flutter-mitral', 'fa']],
  ['Ventricule', ['tv']],
];

export function vueSimuMenu(app, { aller }) {
  app.innerHTML = `
    <h1>Simulateur</h1>
    <div class="menu-principal">
      <button class="tuile" data-simu="mystere"><span class="tuile-ico" aria-hidden="true">🎲</span><span class="tuile-texte"><strong>Cas mystère</strong><small>Mécanisme caché, démarche notée sur 10</small></span><span class="tuile-fleche" aria-hidden="true">›</span></button>
      <button class="tuile" data-simu="normal"><span class="tuile-ico" aria-hidden="true">⚡</span><span class="tuile-texte"><strong>Baie libre</strong><small>Conduction normale : courbes AH, Wenckebach, TRS, para-hisien</small></span><span class="tuile-fleche" aria-hidden="true">›</span></button>
    </div>
    ${GROUPES.map(([titre, ids]) => `<section class="groupe-simu"><h2>${esc(titre)}</h2><div class="liste-simu">
      ${ids.map(id => `<button class="choix-simu" data-simu="${id}">${esc(SCENARIOS[id].nom)}</button>`).join('')}</div></section>`).join('')}`;
  app.querySelectorAll('[data-simu]').forEach(b => b.onclick = () => { preparerSimulateur(b.dataset.simu); aller('simulateur'); });
}
