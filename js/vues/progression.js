import * as stock from '../store.js';
import { THEMES, base } from '../donnees.js';
import { esc, pct, toast } from '../util.js';
import { courbeElo } from '../courbe.js';

export function vueProgression(app, { appliquerApparence }) {
  const p = stock.progres();
  const c = stock.classement();
  const histo = stock.historiqueElo();
  const lignes = (tri, cle) => {
    const m = {};
    for (const q of base.questions) {
      const k = cle(q); (m[k] ??= { total: 0, vus: 0, rep: 0, ok: 0, maitrise: 0 }); m[k].total++;
      const e = p.q[q.id];
      if (e) { m[k].vus++; m[k].rep += e.vus; m[k].ok += e.justes; if (e.boite >= 3) m[k].maitrise++; }
    }
    return Object.entries(m).sort(tri).map(([k, v]) => `
      <div class="barre-ligne"><span>${esc(k)}</span><span class="piste" title="Taux de réussite"><i style="width:${pct(v.ok, v.rep)}%"></i></span>
      <span class="val">${v.rep ? pct(v.ok, v.rep) + ' %' : '—'}</span></div>
      <div class="note sous-barre">${v.vus}/${v.total} vues · ${v.maitrise} maîtrisée(s)</div>`).join('');
  };
  const hist = p.sessions.slice(-10).reverse();

  app.innerHTML = `
    <h1>Ma progression</h1>
    <section class="carte">
      <div class="ligne-reglage"><div><h2 style="margin:0">Classement ELO : ${c.elo}</h2>
        <span class="note">${esc(c.titre.nom)} · record ${c.pic} · ${c.n} question(s) classée(s)</span></div>
        <button class="btn btn-primaire" data-nav="competitif">Jouer</button></div>
      <h3 style="margin-top:14px">Évolution jour après jour</h3>
      <div id="courbe"></div>
      ${histo.length ? `<details class="tableau-elo"><summary class="note">Voir les valeurs</summary><table><thead><tr><th>Jour</th><th>ELO en fin de journée</th><th>Questions</th><th>Justes</th></tr></thead><tbody>
        ${histo.slice().reverse().map(h => `<tr><td>${new Date(h.jour + 'T12:00:00').toLocaleDateString('fr-FR')}</td><td>${Math.round(h.elo)}</td><td>${h.n}</td><td>${h.gagnees ?? 0}</td></tr>`).join('')}
      </tbody></table></details>` : ''}
    </section>
    <section class="carte"><h2>Badges</h2><div class="grille-badges">
      ${stock.BADGES.map(b => `<div class="badge-carte ${p.badges[b.id] ? 'gagne' : ''}" title="${esc(b.desc)}"><span>${b.ico}</span><b>${esc(b.nom)}</b><small>${esc(b.desc)}</small></div>`).join('')}
    </div><p class="note">Série record : ${p.serie.record || p.serie.compte || 0} jour(s) · meilleure série de bonnes réponses : ${p.compteurs.meilleurCombo || 0}</p></section>
    <section class="carte"><h2>Réussite par thème</h2><div class="barres">${lignes((a, b) => a[0].localeCompare(b[0]), q => THEMES[q.theme].nom)}</div></section>
    <section class="carte"><h2>Réussite par niveau de difficulté</h2><div class="barres">${lignes((a, b) => parseInt(a[0].slice(7)) - parseInt(b[0].slice(7)), q => 'Niveau ' + q.difficulte)}</div></section>
    <section class="carte"><h2>Dernières séries</h2>
      ${hist.length ? `<ul class="liste-erreurs">${hist.map(h => `<li>${new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${esc(h.titre)} : <b>${h.ok}/${h.n}</b> (${h.points} pts)</li>`).join('')}</ul>` : '<p class="vide">Aucune série terminée pour le moment.</p>'}
    </section>
    <section class="carte">
      <h2>Réglages</h2>
      <div class="ligne-reglage"><span>Apparence</span>
        <select id="theme-ui" class="btn"><option value="auto">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select></div>
      <div class="actions"><button class="btn" id="export">Exporter ma progression</button><label class="btn">Importer<input type="file" id="import" accept="application/json" hidden></label>
      <button class="btn" id="raz">Réinitialiser</button></div>
      <p class="note">Vos données restent sur cet appareil (aucun compte, aucun envoi). Exportez-les pour les transférer sur un autre appareil.</p>
    </section>`;
  courbeElo(app.querySelector('#courbe'), histo, { depart: stock.ELO_DEPART });
  const sel = app.querySelector('#theme-ui');
  sel.value = stock.apparence();
  sel.onchange = () => { stock.sauverApparence(sel.value); appliquerApparence(); };
  app.querySelector('#raz').onclick = () => { if (confirm('Effacer toute votre progression ?')) { stock.reinitialiser(); vueProgression(app, { appliquerApparence }); toast('Progression effacée'); } };
  app.querySelector('#export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(stock.progres(), null, 1)], { type: 'application/json' }));
    a.download = `challenge-rythmo-progression-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  app.querySelector('#import').onchange = async e => {
    try { stock.importer(JSON.parse(await e.target.files[0].text())); toast('Progression importée'); vueProgression(app, { appliquerApparence }); } catch { toast('Fichier invalide'); }
  };
}
