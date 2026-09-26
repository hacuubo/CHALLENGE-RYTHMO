// Mode compétitif : classement ELO sur l'échelle des échecs, questions enchaînées selon le niveau.
import * as stock from '../store.js';
import { esc, pct } from '../util.js';
import { courbeElo } from '../courbe.js';
import { t, locale } from '../i18n.js';

export function vueCompetitif(app, { demarrer }) {
  const c = stock.classement();
  const ti = c.titre;
  const parties = stock.progres().sessions.filter(h => h.elo).slice(-5).reverse();
  const signe = n => (n > 0 ? '+' : '') + n;

  app.innerHTML = `
    <h1>${t('Compétitif', 'Competitive')}</h1>
    <section class="carte centre">
      <div class="elo-grand">${c.elo}</div>
      <div class="elo-legende">ELO · <b>${esc(ti.nom)}</b> · ${t('record', 'best')} ${c.pic}</div>
      ${ti.suivant ? `<div class="progress titre-progress" aria-label="${t('Progression vers', 'Progress towards')} ${esc(ti.suivant.nom)}"><i style="width:${pct(c.elo - ti.min, ti.suivant.min - ti.min)}%"></i></div>
        <p class="note">${t(`${ti.suivant.min - c.elo} points avant « ${esc(ti.suivant.nom)} »`, `${ti.suivant.min - c.elo} points to "${esc(ti.suivant.nom)}"`)}</p>` : `<p class="note">${t('Titre le plus élevé atteint.', 'Highest title reached.')}</p>`}
      <button class="btn btn-primaire btn-bloc" id="jouer">${t('Jouer', 'Play')}</button>
      <p class="note">${t(`${c.n} question(s) classée(s)`, `${c.n} rated question${c.n === 1 ? '' : 's'}`)}${c.partiesDuJour ? ` · ${t('aujourd\'hui :', 'today:')} <span class="delta ${c.duJour >= 0 ? 'plus' : 'moins'}">${signe(c.duJour)}</span>` : ''}</p>
    </section>
    <section class="carte"><h2>${t('Évolution', 'Rating history')}</h2><div id="courbe"></div></section>
    ${parties.length ? `<section class="carte"><h2>${t('Dernières sessions de jeu', 'Recent sessions')}</h2><ul class="liste-erreurs">${parties.map(h => `<li>${new Date(h.date).toLocaleDateString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${h.ok}/${h.n} ${t('justes', 'correct')} · ${h.elo.debut} → <b>${h.elo.fin}</b> <span class="delta ${h.elo.fin - h.elo.debut >= 0 ? 'plus' : 'moins'}">${signe(h.elo.fin - h.elo.debut)}</span></li>`).join('')}</ul></section>` : ''}
    <section class="carte">
      <h2>${t('Comment ça marche', 'How it works')}</h2>
      <p>${t('Chaque réponse est une partie d\'échecs contre la question. Les questions ont une cote fixe, tirée de leur difficulté :', 'Each answer is a chess game against the question. Questions have a fixed rating, based on their difficulty:')}</p>
      <div class="defile-x"><table class="tableau-cotes">
        <thead><tr><th>${t('Difficulté', 'Difficulty')}</th>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody><tr><th>${t('Cote', 'Rating')}</th>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => `<td>${stock.eloQuestion(d)}</td>`).join('')}</tr></tbody>
      </table></div>
      <ul class="liste-regles">
        ${t(`<li>Vous démarrez à <b>${stock.ELO_DEPART}</b>. Battre une question mieux cotée que vous rapporte beaucoup ; rater une question facile coûte cher.</li>
        <li>Calcul officiel des échecs : gain = K × (résultat − probabilité de réussite attendue), avec K = 40 pendant les 30 premières questions, puis 20, et 10 au-delà de 2400 (règles de la FIDE).</li>
        <li>Pas de nombre de questions : vous jouez quand vous voulez et vous vous arrêtez quand vous voulez (bouton Pause ou ✕). Votre ELO est enregistré après chaque réponse et vous repartez de là à la session suivante.</li>
        <li>C'est adaptatif : chaque question est tirée au hasard parmi celles dont la cote est proche de votre classement. Quand votre ELO monte, les questions deviennent plus difficiles ; quand il baisse, elles redeviennent plus simples.</li>
        <li>Les questions ouvertes (auto-évaluées) ne sont pas proposées. Seul ce mode fait varier l'ELO : l'entraînement ne compte pas pour le classement.</li>`,
        `<li>You start at <b>${stock.ELO_DEPART}</b>. Beating a question rated higher than you earns a lot; missing an easy one costs a lot.</li>
        <li>Official chess formula: gain = K × (result − expected probability of success), with K = 40 for the first 30 questions, then 20, and 10 above 2400 (FIDE rules).</li>
        <li>No fixed number of questions: play whenever you like and stop whenever you like (Pause or ✕ button). Your ELO is saved after every answer and you pick up from there next time.</li>
        <li>It is adaptive: each question is drawn at random from those rated close to your own rating. As your ELO rises, questions get harder; when it drops, they get easier again.</li>
        <li>Open questions (self-assessed) are not included. Only this mode changes your ELO: training does not count towards your rating.</li>`)}
      </ul>
      <p class="note">${t('Titres :', 'Titles:')} ${stock.TITRES.map(x => `${esc(x.nom)} (${x.min ? '≥ ' + x.min : '< 1000'})`).join(' · ')}.</p>
    </section>`;

  courbeElo(app.querySelector('#courbe'), stock.historiqueElo(), { depart: stock.ELO_DEPART });
  app.querySelector('#jouer').onclick = () => demarrer([], t('Compétitif', 'Competitive'), { competitif: true });
}
