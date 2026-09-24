// Accueil : un écran simple — Entraînement (par domaine), Compétitif (classement ELO), Fiches, Progression, Sources.
import * as stock from '../store.js';
import { DOMAINES, base } from '../donnees.js';
import { resumeSauve } from '../session.js';
import { esc, melanger } from '../util.js';

export function vueAccueil(app, { demarrer, reprendre, aller }) {
  const c = stock.classement();
  const enCours = resumeSauve();
  const nouvelles = stock.nouveautes(base.questions);
  const aRevoir = stock.aReviser(base.questions).length;
  const compte = d => base.questions.filter(q => d.themes.includes(q.theme)).length;
  const signe = n => (n > 0 ? '+' : '') + n;

  app.innerHTML = `
    ${enCours ? `<div class="carte bandeau"><div><b>Série en cours :</b> ${esc(enCours.titre)} (${enCours.faites}/${enCours.total})</div>
      <div class="actions serre"><button class="btn" id="abandon">Abandonner</button><button class="btn btn-primaire" id="reprendre">Reprendre</button></div></div>` : ''}
    ${nouvelles.length ? `<div class="carte bandeau"><div><b>${nouvelles.length} nouvelle(s) question(s)</b> depuis votre dernière visite.</div>
      <div class="actions serre"><button class="btn" id="plus-tard">Plus tard</button><button class="btn btn-primaire" id="go-nouv">Les découvrir</button></div></div>` : ''}

    <section class="bloc-accueil">
      <h2>Entraînement</h2>
      <div class="grille-domaines">
        ${DOMAINES.map(d => `<button class="domaine" data-domaine="${d.id}"><span class="ico">${d.ico}</span><strong>${esc(d.nom)}</strong><small>${compte(d)} questions · ${esc(d.desc)}</small></button>`).join('')}
      </div>
      <p class="liens-secondaires">
        <button class="lien" data-nav="config">Personnaliser (niveau, marques, examen)</button>
        ${aRevoir ? `<button class="lien" id="go-rev">Revoir mes erreurs (${aRevoir})</button>` : ''}
      </p>
    </section>

    <section class="bloc-accueil">
      <h2>Compétitif</h2>
      <button class="carte-competitif" id="go-comp">
        <span class="elo-grand">${c.elo}</span>
        <span class="elo-legende">ELO · ${esc(c.titre.nom)}${c.partiesDuJour ? ` · <span class="delta ${c.duJour >= 0 ? 'plus' : 'moins'}">${signe(c.duJour)} aujourd'hui</span>` : ''}</span>
        <span class="elo-texte">Questions en continu : plus votre classement monte, plus elles sont difficiles.</span>
        <span class="btn btn-primaire">Jouer</span>
      </button>
    </section>

    <section class="bloc-accueil grille-menu">
      <button class="menu" data-nav="fiches"><span class="ico">📚</span>Fiches</button>
      <button class="menu" data-nav="progression"><span class="ico">📈</span>Progression</button>
      <button class="menu" data-nav="apropos"><span class="ico">ⓘ</span>Sources</button>
    </section>`;

  const $ = s => app.querySelector(s);
  app.querySelectorAll('[data-domaine]').forEach(b => b.onclick = () => {
    const d = DOMAINES.find(x => x.id === b.dataset.domaine);
    demarrer(melanger(base.questions.filter(q => d.themes.includes(q.theme))).slice(0, 10), `Entraînement · ${d.nom}`);
  });
  $('#go-comp').onclick = () => demarrer([], 'Partie compétitive', { competitif: true });
  if (aRevoir) $('#go-rev').onclick = () => demarrer(stock.aReviser(base.questions).slice(0, 15), 'Révisions');
  if (enCours) {
    $('#reprendre').onclick = reprendre;
    $('#abandon').onclick = () => { if (confirm('Abandonner la série en cours ?')) { stock.oublierSession(); vueAccueil(app, { demarrer, reprendre, aller }); } };
  }
  if (nouvelles.length) {
    $('#go-nouv').onclick = () => { stock.marquerConnues(base.questions); demarrer(melanger(nouvelles).slice(0, 20), 'Nouveautés'); };
    $('#plus-tard').onclick = () => { stock.marquerConnues(base.questions); vueAccueil(app, { demarrer, reprendre, aller }); };
  }
}
