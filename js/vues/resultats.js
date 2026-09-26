import * as stock from '../store.js';
import { THEMES } from '../donnees.js';
import { etat } from '../session.js';
import { esc, pct, pctTexte, melanger, lettre, duree } from '../util.js';
import { t } from '../i18n.js';
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
  const msg = score >= 90 ? t('Excellent, niveau expert !', 'Excellent — expert level!') : score >= 70 ? t('Très bien, continuez comme ça.', 'Very good, keep it up.') : score >= 50 ? t('Bon début, les révisions feront le reste.', 'A good start: reviewing will do the rest.') : t('Chaque erreur est une occasion d\'apprendre.', 'Every mistake is a chance to learn.');
  const c = s.competitif ? stock.classement() : null;
  const badges = etat.nouveauxBadges || [];
  etat.nouveauxBadges = [];

  const resume = r => !r ? `<i>${t('Sans réponse', 'No answer')}</i>` : r.choix ? r.choix.map(i => esc(lettre(i))).join(', ') : r.texte ? esc(r.texte) : t('(auto-évaluation)', '(self-assessed)');

  app.innerHTML = `
    <section class="carte centre">
      <h1>${esc(s.titre)} — ${t('terminé', 'complete')}</h1>
      <div class="score-rond" style="--p:${score}"><div>${pctTexte(score)}</div></div>
      <p><b>${justes}/${vues.length}</b> ${t('bonnes réponses', 'correct answers')} · <b>${s.points}</b> points${s.examen ? ` · ${t('durée', 'time')} ${duree(Date.now() - s.debut)}` : ` · ${t('meilleure série :', 'best streak:')} <b>${s.meilleurCombo}</b>`}</p>
      ${c ? `<p class="elo-bilan">ELO ${s.competitif.eloDebut} → <b>${c.elo}</b> <span class="delta ${c.elo - s.competitif.eloDebut >= 0 ? 'plus' : 'moins'}">${c.elo - s.competitif.eloDebut >= 0 ? '+' : ''}${c.elo - s.competitif.eloDebut}</span> · ${esc(c.titre.nom)}</p>` : ''}
      <p class="note">${msg}</p>
      ${badges.length ? `<div class="nouveaux-badges">${badges.map(b => `<div class="badge-gagne"><span>${b.ico}</span><b>${esc(b.nom)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>` : ''}
    </section>
    <section class="carte"><h2>${t('Par thème', 'By topic')}</h2><div class="barres">
      ${Object.entries(parTheme).map(([th, v]) => `<div class="barre-ligne"><span>${THEMES[th].nom}</span><span class="piste"><i style="width:${pct(v.ok, v.n)}%"></i></span><span class="val">${v.ok}/${v.n}</span></div>`).join('')}
    </div></section>
    <section class="carte"><h2>${s.examen ? t('Correction détaillée', 'Detailed answers') : `${t('À revoir', 'To review')} (${erreurs.length})`}</h2>
      ${(s.examen ? vues : erreurs).length ? `<ul class="liste-erreurs">${(s.examen ? vues : erreurs).map(({ q, r }) => `<li><details><summary>${r?.juste ? '✅' : '❌'} ${esc(q.question)}</summary>
        ${q.type !== 'ouverte' ? `<p class="note">${t('Votre réponse :', 'Your answer:')} ${resume(r)}</p>` : `<div class="modele">${esc(q.reponseAttendue)}</div>`}
        ${blocCorrection(q, r)}</details></li>`).join('')}</ul>` : `<p class="vide">${t('Aucune erreur, bravo !', 'No mistakes — well done!')}</p>`}
    </section>
    <div class="actions">
      ${erreurs.length ? `<button class="btn btn-primaire" id="refaire">${t('Refaire mes erreurs', 'Retry my mistakes')}</button>` : ''}
      <button class="btn" data-nav="config">${t('Nouvelle série', 'New quiz')}</button>
      <button class="btn" data-nav="accueil">${t('Accueil', 'Home')}</button>
    </div>`;
  const rf = app.querySelector('#refaire');
  if (rf) rf.onclick = () => demarrer(melanger(erreurs.map(x => x.q)), t('Mes erreurs', 'My mistakes'));
}
