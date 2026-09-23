import * as stock from '../store.js';
import { THEMES, base } from '../donnees.js';
import { esc, pct, toast } from '../util.js';

export function vueProgression(app, { appliquerApparence }) {
  const p = stock.progres();
  const g = stock.grade();
  const niv = stock.niveau();
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
  const progGrade = g.suivant ? pct(p.points - g.min, g.suivant.min - g.min) : 100;

  app.innerHTML = `
    <h1>Ma progression</h1>
    <section class="carte">
      <div class="ligne-reglage"><div><h2 style="margin:0">${esc(g.nom)}</h2><span class="note">${p.points} points${g.suivant ? ` · prochain grade : ${esc(g.suivant.nom)} (${g.suivant.min} pts)` : ''}</span></div>
      <div class="niveau-rond petit-rond"><b>${niv.n >= 5 ? niv.niveau : '?'}</b><span>niveau</span></div></div>
      <div class="progress" style="margin-top:10px"><i style="width:${progGrade}%"></i></div>
      <p class="note">Le niveau estimé (1 à 10) s'ajuste après chaque réponse selon la difficulté de la question${niv.n < 5 ? ' ; il s\'affiche après 5 réponses' : ''}.</p>
      <div class="barres">${Object.entries(THEMES).map(([k, t]) => { const n = stock.niveau(k); return `<div class="barre-ligne"><span>${t.nom}</span><span class="piste"><i style="width:${n.n >= 3 ? n.niveau * 10 : 0}%"></i></span><span class="val">${n.n >= 3 ? 'niv. ' + n.niveau : '—'}</span></div>`; }).join('')}</div>
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
