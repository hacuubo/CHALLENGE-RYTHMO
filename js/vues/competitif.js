// Mode compétitif : classement ELO sur l'échelle des échecs, questions enchaînées selon le niveau.
import * as stock from '../store.js';
import { esc, pct } from '../util.js';
import { courbeElo } from '../courbe.js';

export function vueCompetitif(app, { demarrer }) {
  const c = stock.classement();
  const t = c.titre;
  const parties = stock.progres().sessions.filter(h => h.elo).slice(-5).reverse();
  const signe = n => (n > 0 ? '+' : '') + n;

  app.innerHTML = `
    <h1>Compétitif</h1>
    <section class="carte centre">
      <div class="elo-grand">${c.elo}</div>
      <div class="elo-legende">ELO · <b>${esc(t.nom)}</b> · record ${c.pic}</div>
      ${t.suivant ? `<div class="progress titre-progress" aria-label="Progression vers ${esc(t.suivant.nom)}"><i style="width:${pct(c.elo - t.min, t.suivant.min - t.min)}%"></i></div>
        <p class="note">${t.suivant.min - c.elo} points avant « ${esc(t.suivant.nom)} »</p>` : '<p class="note">Titre le plus élevé atteint.</p>'}
      <button class="btn btn-primaire btn-bloc" id="jouer">Jouer</button>
      <p class="note">${c.n} question(s) classée(s)${c.partiesDuJour ? ` · aujourd'hui : <span class="delta ${c.duJour >= 0 ? 'plus' : 'moins'}">${signe(c.duJour)}</span>` : ''}</p>
    </section>
    <section class="carte"><h2>Évolution</h2><div id="courbe"></div></section>
    ${parties.length ? `<section class="carte"><h2>Dernières sessions de jeu</h2><ul class="liste-erreurs">${parties.map(h => `<li>${new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${h.ok}/${h.n} justes · ${h.elo.debut} → <b>${h.elo.fin}</b> <span class="delta ${h.elo.fin - h.elo.debut >= 0 ? 'plus' : 'moins'}">${signe(h.elo.fin - h.elo.debut)}</span></li>`).join('')}</ul></section>` : ''}
    <section class="carte">
      <h2>Comment ça marche</h2>
      <p>Chaque réponse est une partie d'échecs contre la question. Les questions ont une cote fixe, tirée de leur difficulté :</p>
      <div class="defile-x"><table class="tableau-cotes">
        <thead><tr><th>Difficulté</th>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody><tr><th>Cote</th>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => `<td>${stock.eloQuestion(d)}</td>`).join('')}</tr></tbody>
      </table></div>
      <ul class="liste-regles">
        <li>Vous démarrez à <b>${stock.ELO_DEPART}</b>. Battre une question mieux cotée que vous rapporte beaucoup ; rater une question facile coûte cher.</li>
        <li>Calcul officiel des échecs : gain = K × (résultat − probabilité de réussite attendue), avec K = 40 pendant les 30 premières questions, puis 20, et 10 au-delà de 2400 (règles de la FIDE).</li>
        <li>Pas de nombre de questions : vous jouez quand vous voulez et vous vous arrêtez quand vous voulez (bouton Pause ou ✕). Votre ELO est enregistré après chaque réponse et vous repartez de là à la session suivante.</li>
        <li>C'est adaptatif : chaque question est tirée au hasard parmi celles dont la cote est proche de votre classement. Quand votre ELO monte, les questions deviennent plus difficiles ; quand il baisse, elles redeviennent plus simples.</li>
        <li>Les questions ouvertes (auto-évaluées) ne sont pas proposées. Seul ce mode fait varier l'ELO : l'entraînement ne compte pas pour le classement.</li>
      </ul>
      <p class="note">Titres : ${stock.TITRES.map(x => `${esc(x.nom)} (${x.min ? '≥ ' + x.min : '< 1000'})`).join(' · ')}.</p>
    </section>`;

  courbeElo(app.querySelector('#courbe'), stock.historiqueElo(), { depart: stock.ELO_DEPART });
  app.querySelector('#jouer').onclick = () => demarrer([], 'Compétitif', { competitif: true });
}
