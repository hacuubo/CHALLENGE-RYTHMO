import * as stock from '../store.js';
import { THEMES } from '../donnees.js';
import { etat } from '../session.js';
import { esc, pct, melanger, lettre, duree } from '../util.js';
import { blocCorrection } from './quiz.js';

export function vueResultats(app, { demarrer }) {
  const s = etat.session;
  const lignes = s.questions.map((q, i) => ({ q, r: s.reponses[i] }));
  const faites = lignes.filter(x => x.r);
  const vues = s.examen ? lignes.slice(0, Math.max(s.i + 1, faites.length)) : faites;
  const justes = faites.filter(x => x.r.juste).length;
  const score = pct(justes, vues.length);
  const parTheme = {};
  for (const { q, r } of vues) { (parTheme[q.theme] ??= { n: 0, ok: 0 }).n++; if (r?.juste) parTheme[q.theme].ok++; }
  const erreurs = vues.filter(x => !x.r?.juste);
  const msg = score >= 90 ? 'Excellent, niveau expert !' : score >= 70 ? 'Très bien, continuez comme ça.' : score >= 50 ? 'Bon début, les révisions feront le reste.' : 'Chaque erreur est une occasion d\'apprendre.';
  const niv = stock.niveau();
  const badges = etat.nouveauxBadges || [];
  etat.nouveauxBadges = [];

  const resume = r => !r ? '<i>Sans réponse</i>' : r.choix ? r.choix.map(i => esc(lettre(i))).join(', ') : r.texte ? esc(r.texte) : '(auto-évaluation)';

  app.innerHTML = `
    <section class="carte centre">
      <h1>${esc(s.titre)} — terminé</h1>
      <div class="score-rond" style="--p:${score}"><div>${score} %</div></div>
      <p><b>${justes}/${vues.length}</b> bonnes réponses · <b>${s.points}</b> points${s.examen ? ` · durée ${duree(Date.now() - s.debut)}` : ` · meilleure série : <b>${s.meilleurCombo}</b>`}</p>
      <p class="note">${msg}${niv.n >= 5 ? ` Niveau estimé : <b>${niv.niveau}/10</b>.` : ''}</p>
      ${badges.length ? `<div class="nouveaux-badges">${badges.map(b => `<div class="badge-gagne"><span>${b.ico}</span><b>${esc(b.nom)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>` : ''}
    </section>
    <section class="carte"><h2>Par thème</h2><div class="barres">
      ${Object.entries(parTheme).map(([t, v]) => `<div class="barre-ligne"><span>${THEMES[t].nom}</span><span class="piste"><i style="width:${pct(v.ok, v.n)}%"></i></span><span class="val">${v.ok}/${v.n}</span></div>`).join('')}
    </div></section>
    <section class="carte"><h2>${s.examen ? 'Correction détaillée' : `À revoir (${erreurs.length})`}</h2>
      ${(s.examen ? vues : erreurs).length ? `<ul class="liste-erreurs">${(s.examen ? vues : erreurs).map(({ q, r }) => `<li><details><summary>${r?.juste ? '✅' : '❌'} ${esc(q.question)}</summary>
        ${q.type !== 'ouverte' ? `<p class="note">Votre réponse : ${resume(r)}</p>` : `<div class="modele">${esc(q.reponseAttendue)}</div>`}
        ${blocCorrection(q, r)}</details></li>`).join('')}</ul>` : '<p class="vide">Aucune erreur, bravo !</p>'}
    </section>
    <div class="actions">
      ${erreurs.length ? '<button class="btn btn-primaire" id="refaire">Refaire mes erreurs</button>' : ''}
      <button class="btn" data-nav="config">Nouvelle série</button>
      <button class="btn" data-nav="accueil">Accueil</button>
    </div>`;
  const rf = app.querySelector('#refaire');
  if (rf) rf.onclick = () => demarrer(melanger(erreurs.map(x => x.q)), 'Mes erreurs');
}
