import * as stock from '../store.js';
import { THEMES, base } from '../donnees.js';
import { esc, pct, pctTexte, toast } from '../util.js';
import { t, locale } from '../i18n.js';
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
      <div class="barre-ligne"><span>${esc(k)}</span><span class="piste" title="${t('Taux de réussite', 'Success rate')}"><i style="width:${pct(v.ok, v.rep)}%"></i></span>
      <span class="val">${v.rep ? pctTexte(pct(v.ok, v.rep)) : '—'}</span></div>
      <div class="note sous-barre">${t(`${v.vus}/${v.total} vues · ${v.maitrise} maîtrisée(s)`, `${v.vus}/${v.total} seen · ${v.maitrise} mastered`)}</div>`).join('');
  };
  const hist = p.sessions.slice(-10).reverse();

  app.innerHTML = `
    <h1>${t('Ma progression', 'My progress')}</h1>
    <section class="carte">
      <div class="ligne-reglage"><div><h2 style="margin:0">${t('Classement ELO :', 'ELO rating:')} ${c.elo}</h2>
        <span class="note">${esc(c.titre.nom)} · ${t('record', 'peak')} ${c.pic} · ${t(`${c.n} question(s) classée(s)`, `${c.n} rated question${c.n === 1 ? '' : 's'}`)}</span></div>
        <button class="btn btn-primaire" data-nav="competitif">${t('Jouer', 'Play')}</button></div>
      <h3 style="margin-top:14px">${t('Évolution jour après jour', 'Day-by-day history')}</h3>
      <div id="courbe"></div>
      ${histo.length ? `<details class="tableau-elo"><summary class="note">${t('Voir les valeurs', 'Show values')}</summary><table><thead><tr><th>${t('Jour', 'Day')}</th><th>${t('ELO en fin de journée', 'End-of-day ELO')}</th><th>Questions</th><th>${t('Justes', 'Correct')}</th></tr></thead><tbody>
        ${histo.slice().reverse().map(h => `<tr><td>${new Date(h.jour + 'T12:00:00').toLocaleDateString(locale())}</td><td>${Math.round(h.elo)}</td><td>${h.n}</td><td>${h.gagnees ?? 0}</td></tr>`).join('')}
      </tbody></table></details>` : ''}
    </section>
    <section class="carte"><h2>${t('Badges', 'Badges')}</h2><div class="grille-badges">
      ${stock.BADGES.map(b => `<div class="badge-carte ${p.badges[b.id] ? 'gagne' : ''}" title="${esc(b.desc)}"><span>${b.ico}</span><b>${esc(b.nom)}</b><small>${esc(b.desc)}</small></div>`).join('')}
    </div><p class="note">${t(`Série record : ${p.serie.record || p.serie.compte || 0} jour(s) · meilleure série de bonnes réponses : ${p.compteurs.meilleurCombo || 0}`, `Longest daily streak: ${p.serie.record || p.serie.compte || 0} day${(p.serie.record || p.serie.compte || 0) === 1 ? '' : 's'} · most correct answers in a row: ${p.compteurs.meilleurCombo || 0}`)}</p></section>
    <section class="carte"><h2>${t('Réussite par thème', 'Success by topic')}</h2><div class="barres">${lignes((a, b) => a[0].localeCompare(b[0]), q => THEMES[q.theme].nom)}</div></section>
    <section class="carte"><h2>${t('Réussite par niveau de difficulté', 'Success by difficulty level')}</h2><div class="barres">${lignes((a, b) => parseInt(a[0].replace(/\D+/, '')) - parseInt(b[0].replace(/\D+/, '')), q => t('Niveau ', 'Level ') + q.difficulte)}</div></section>
    <section class="carte"><h2>${t('Dernières séries', 'Recent quizzes')}</h2>
      ${hist.length ? `<ul class="liste-erreurs">${hist.map(h => `<li>${new Date(h.date).toLocaleDateString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${esc(h.titre)}${t(' :', ':')} <b>${h.ok}/${h.n}</b> (${h.points} ${t('pts', h.points === 1 ? 'pt' : 'pts')})</li>`).join('')}</ul>` : `<p class="vide">${t('Aucune série terminée pour le moment.', 'No quizzes completed yet.')}</p>`}
    </section>
    <section class="carte">
      <h2>${t('Réglages', 'Settings')}</h2>
      <div class="ligne-reglage"><span>${t('Apparence', 'Appearance')}</span>
        <select id="theme-ui" class="btn"><option value="auto">${t('Automatique', 'Automatic')}</option><option value="light">${t('Clair', 'Light')}</option><option value="dark">${t('Sombre', 'Dark')}</option></select></div>
      <div class="actions"><button class="btn" id="export">${t('Exporter ma progression', 'Export my progress')}</button><label class="btn">${t('Importer', 'Import')}<input type="file" id="import" accept="application/json" hidden></label>
      <button class="btn" id="raz">${t('Réinitialiser', 'Reset')}</button></div>
      <p class="note">${t('Vos données restent sur cet appareil (aucun compte, aucun envoi). Exportez-les pour les transférer sur un autre appareil.', 'Your data stays on this device (no account, nothing is sent). Export it to transfer it to another device.')}</p>
    </section>`;
  courbeElo(app.querySelector('#courbe'), histo, { depart: stock.ELO_DEPART });
  const sel = app.querySelector('#theme-ui');
  sel.value = stock.apparence();
  sel.onchange = () => { stock.sauverApparence(sel.value); appliquerApparence(); };
  app.querySelector('#raz').onclick = () => { if (confirm(t('Effacer toute votre progression ?', 'Erase all your progress? This cannot be undone.'))) { stock.reinitialiser(); vueProgression(app, { appliquerApparence }); toast(t('Progression effacée', 'Progress erased')); } };
  app.querySelector('#export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(stock.progres(), null, 1)], { type: 'application/json' }));
    a.download = `shock-and-pace-progression-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  app.querySelector('#import').onchange = async e => {
    try { stock.importer(JSON.parse(await e.target.files[0].text())); toast(t('Progression importée', 'Progress imported')); vueProgression(app, { appliquerApparence }); } catch { toast(t('Fichier invalide', 'Invalid file')); }
  };
}
