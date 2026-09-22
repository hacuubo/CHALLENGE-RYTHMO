import * as stock from '../store.js';
import { THEMES, base, aTrace } from '../donnees.js';
import { resumeSauve } from '../session.js';
import { esc, pct, melanger, aleaDuJour } from '../util.js';

export function vueAccueil(app, { demarrer, reprendre, aller }) {
  const p = stock.progres();
  const nb = base.questions.length;
  const rep = Object.values(p.q).reduce((s, x) => s + x.vus, 0);
  const justes = Object.values(p.q).reduce((s, x) => s + x.justes, 0);
  const aRevoir = stock.aReviser(base.questions).length;
  const nouvelles = stock.nouveautes(base.questions);
  const g = stock.grade();
  const niv = stock.niveau();
  const enCours = resumeSauve();
  const nbTraces = base.questions.filter(aTrace).length;

  app.innerHTML = `
    <section class="carte hero">
      <div class="hero-haut">
        <div><h1>Challenge Rythmo</h1><p>${esc(g.nom)} · ${p.points} pts${g.suivant ? ` <span class="petit">(${g.suivant.min - p.points} pts avant « ${esc(g.suivant.nom)} »)</span>` : ''}</p></div>
        <div class="niveau-rond" title="Niveau estimé d'après vos réponses"><b>${niv.n >= 5 ? niv.niveau : '?'}</b><span>niveau</span></div>
      </div>
      <div class="stats">
        <div><b>${nb}</b><span>questions</span></div>
        <div><b>${Object.keys(p.q).filter(id => base.parId.has(id)).length}</b><span>déjà vues</span></div>
        <div><b>${rep ? pct(justes, rep) + ' %' : '—'}</b><span>réussite</span></div>
        <div><b>${p.serie.compte || 0} 🔥</b><span>jour(s) d'affilée</span></div>
      </div>
    </section>
    ${enCours ? `<div class="carte bandeau"><div><b>Série en cours :</b> ${esc(enCours.titre)} (${enCours.faites}/${enCours.total})</div>
      <div class="actions serre"><button class="btn" id="abandon">Abandonner</button><button class="btn btn-primaire" id="reprendre">Reprendre</button></div></div>` : ''}
    ${nouvelles.length ? `<div class="carte bandeau"><div><b>${nouvelles.length} nouvelle(s) question(s)</b> depuis votre dernière visite.</div>
      <div class="actions serre"><button class="btn" id="plus-tard">Plus tard</button><button class="btn btn-primaire" id="go-nouv">Les découvrir</button></div></div>` : ''}
    <div class="grille">
      <button class="tuile tuile-vedette" id="go-adapt"><span class="ico">🧭</span><strong>Défi adaptatif</strong><small>10 questions ajustées à votre niveau (${niv.n >= 5 ? 'niveau ' + niv.niveau : 'calibrage en cours'})</small></button>
      <button class="tuile" id="go-alea"><span class="ico">🎲</span><strong>Défi aléatoire</strong><small>10 questions, tous thèmes, tous niveaux</small></button>
      <button class="tuile" id="go-jour"><span class="ico">📅</span><strong>Défi du jour</strong><small>5 questions tirées pour aujourd'hui</small></button>
      <button class="tuile" id="go-ecg"><span class="ico">🩺</span><strong>Lecture d'ECG</strong><small>${nbTraces} tracés à interpréter, compas de mesure</small></button>
      <button class="tuile" id="go-exam"><span class="ico">⏱️</span><strong>Mode examen</strong><small>20 questions chronométrées, correction à la fin</small></button>
      <button class="tuile" id="go-rev" ${aRevoir ? '' : 'disabled'}><span class="ico">🔁</span><strong>Révisions</strong><small>${aRevoir ? `${aRevoir} question(s) à revoir` : 'Rien à revoir pour l\'instant'}</small></button>
      <button class="tuile" data-nav="config"><span class="ico">🎯</span><strong>Entraînement ciblé</strong><small>Thèmes, marques, niveau, types</small></button>
      <button class="tuile" data-nav="fiches"><span class="ico">📚</span><strong>Fiches</strong><small>Relire les explications par sous-thème</small></button>
    </div>
    <h2 class="titre-section">Par thème</h2>
    <div class="grille">
      ${Object.entries(THEMES).map(([k, t]) => `<button class="tuile" data-theme="${k}"><span class="ico">${t.ico}</span><strong>${t.nom}</strong><small>${base.questions.filter(q => q.theme === k).length} questions — ${t.desc}</small></button>`).join('')}
    </div>`;

  const $ = s => app.querySelector(s);
  $('#go-adapt').onclick = () => demarrer([], 'Défi adaptatif', { adaptatif: { n: 10, pool: base.questions.map(q => q.id) } });
  $('#go-alea').onclick = () => demarrer(melanger(base.questions).slice(0, 10), 'Défi aléatoire');
  $('#go-jour').onclick = () => {
    const d = new Date(); const r = aleaDuJour(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
    const l = base.questions.slice().sort((a, b) => a.id.localeCompare(b.id)).map(q => ({ q, k: r() })).sort((a, b) => a.k - b.k).slice(0, 5).map(x => x.q);
    demarrer(l, 'Défi du jour');
  };
  $('#go-ecg').onclick = () => demarrer(melanger(base.questions.filter(aTrace)).slice(0, 10), 'Lecture d\'ECG');
  $('#go-exam').onclick = () => demarrer(melanger(base.questions).slice(0, 20), 'Examen blanc', { examen: true });
  if (aRevoir) $('#go-rev').onclick = () => demarrer(stock.aReviser(base.questions).slice(0, 15), 'Révisions');
  if (enCours) {
    $('#reprendre').onclick = reprendre;
    $('#abandon').onclick = () => { if (confirm('Abandonner la série en cours ?')) { stock.oublierSession(); vueAccueil(app, { demarrer, reprendre, aller }); } };
  }
  if (nouvelles.length) {
    $('#go-nouv').onclick = () => { stock.marquerConnues(base.questions); demarrer(melanger(nouvelles).slice(0, 20), 'Nouveautés'); };
    $('#plus-tard').onclick = () => { stock.marquerConnues(base.questions); vueAccueil(app, { demarrer, reprendre, aller }); };
  }
  app.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    stock.sauverConfig({ ...stock.config(), themes: [b.dataset.theme], sousThemes: [], marques: [] });
    aller('config');
  });
}
