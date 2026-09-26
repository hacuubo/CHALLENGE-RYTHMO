// Écran de choix de l'entraînement : par domaine, personnalisé, révisions, nouveautés.
import * as stock from '../store.js';
import { DOMAINES, base } from '../donnees.js';
import { resumeSauve } from '../session.js';
import { esc, melanger } from '../util.js';
import { ICONES } from '../icones.js';
import { t } from '../i18n.js';

export function vueEntrainement(app, ctx) {
  const { demarrer, reprendre } = ctx;
  const enCours = resumeSauve();
  const nouvelles = stock.nouveautes(base.questions);
  const aRevoir = stock.aReviser(base.questions).length;
  const compte = d => base.questions.filter(q => d.themes.includes(q.theme)).length;

  app.innerHTML = `
    <h1>${t('Entraînement', 'Training')}</h1>
    ${enCours ? `<div class="carte bandeau"><div><b>${t('Série en cours :', 'Quiz in progress:')}</b> ${esc(enCours.titre)} (${enCours.faites}/${enCours.total})</div>
      <div class="actions serre"><button class="btn" id="abandon">${t('Abandonner', 'Discard')}</button><button class="btn btn-primaire" id="reprendre">${t('Reprendre', 'Resume')}</button></div></div>` : ''}
    ${nouvelles.length ? `<div class="carte bandeau"><div>${t(`<b>${nouvelles.length} nouvelle(s) question(s)</b> depuis votre dernière visite.`, `<b>${nouvelles.length} new question${nouvelles.length > 1 ? 's' : ''}</b> since your last visit.`)}</div>
      <div class="actions serre"><button class="btn" id="plus-tard">${t('Plus tard', 'Later')}</button><button class="btn btn-primaire" id="go-nouv">${t('Les découvrir', 'Try them')}</button></div></div>` : ''}
    <div class="grille-domaines">
      ${DOMAINES.map(d => `<button class="domaine" data-domaine="${d.id}"><span class="ico">${ICONES[d.id]}</span><strong>${esc(d.nom)}</strong><small>${compte(d)} questions · ${esc(d.desc)}</small></button>`).join('')}
    </div>
    <div class="menu-principal menu-secondaire">
      <button class="tuile" data-nav="config"><span class="tuile-ico">${ICONES.reglages}</span><span class="tuile-texte"><strong>${t('Personnaliser', 'Customise')}</strong><small>${t('Niveau, thèmes, marques, tracés, mode examen', 'Level, topics, manufacturers, tracings, exam mode')}</small></span><span class="tuile-fleche" aria-hidden="true">›</span></button>
      ${aRevoir ? `<button class="tuile" id="go-rev"><span class="tuile-ico">${ICONES.revoir}</span><span class="tuile-texte"><strong>${t('Revoir mes erreurs', 'Review my mistakes')}</strong><small>${t(`${aRevoir} question(s) à revoir (répétition espacée)`, `${aRevoir} question${aRevoir > 1 ? 's' : ''} to review (spaced repetition)`)}</small></span><span class="tuile-fleche" aria-hidden="true">›</span></button>` : ''}
    </div>`;

  const $ = s => app.querySelector(s);
  app.querySelectorAll('[data-domaine]').forEach(b => b.onclick = () => {
    const d = DOMAINES.find(x => x.id === b.dataset.domaine);
    demarrer(melanger(base.questions.filter(q => d.themes.includes(q.theme))).slice(0, 10), `${t('Entraînement', 'Training')} · ${d.nom}`);
  });
  if (aRevoir) $('#go-rev').onclick = () => demarrer(stock.aReviser(base.questions).slice(0, 15), t('Révisions', 'Review'));
  if (enCours) {
    $('#reprendre').onclick = reprendre;
    $('#abandon').onclick = () => { if (confirm(t('Abandonner la série en cours ?', 'Discard the quiz in progress?'))) { stock.oublierSession(); vueEntrainement(app, ctx); } };
  }
  if (nouvelles.length) {
    $('#go-nouv').onclick = () => { stock.marquerConnues(base.questions); demarrer(melanger(nouvelles).slice(0, 20), t('Nouveautés', 'New questions')); };
    $('#plus-tard').onclick = () => { stock.marquerConnues(base.questions); vueEntrainement(app, ctx); };
  }
}
