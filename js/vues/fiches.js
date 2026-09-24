// Fiches : relecture libre des questions et explications, par thème et sous-thème, avec recherche.
import { THEMES, base } from '../donnees.js';
import { esc } from '../util.js';
import { blocCorrection, afficherTrace } from './quiz.js';

const PAGE = 40;
const filtre = { theme: 'ecg', texte: '', sous: '' };

const normaliser = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function vueFiches(app, { demarrer }) {
  app.innerHTML = `
    <h1>Fiches</h1>
    <div class="carte">
      <div class="puces" role="radiogroup" aria-label="Thème">
        ${Object.entries(THEMES).map(([k, t]) => `<label class="puce"><input type="radio" name="ft" value="${k}" ${filtre.theme === k ? 'checked' : ''}><span>${t.ico} ${t.nom}</span></label>`).join('')}
      </div>
      <div class="plage" style="margin-top:12px">
        <input type="search" id="recherche" class="champ" placeholder="Rechercher (ex. Wenckebach, SafeR, HV…)" value="${esc(filtre.texte)}" aria-label="Rechercher dans les fiches">
        <select id="sous" class="champ" aria-label="Sous-thème"></select>
      </div>
    </div>
    <div id="liste"></div>`;
  const liste = app.querySelector('#liste');
  const selSous = app.querySelector('#sous');

  const remplirSous = () => {
    const sous = [...new Set(base.questions.filter(q => q.theme === filtre.theme).map(q => q.sousTheme))].sort((a, b) => a.localeCompare(b, 'fr'));
    if (!sous.includes(filtre.sous)) filtre.sous = '';
    selSous.innerHTML = `<option value="">Tous les sous-thèmes</option>${sous.map(s => `<option ${s === filtre.sous ? 'selected' : ''}>${esc(s)}</option>`).join('')}`;
  };
  let limite = PAGE;
  const afficher = () => {
    const t = normaliser(filtre.texte.trim());
    const qs = base.questions.filter(q => (t ? true : q.theme === filtre.theme) && (!filtre.sous || q.sousTheme === filtre.sous) &&
      (!t || normaliser(`${q.question} ${q.explication} ${q.aRetenir} ${q.sousTheme} ${(q.options || []).join(' ')}`).includes(t)))
      .sort((a, b) => a.sousTheme.localeCompare(b.sousTheme, 'fr') || a.difficulte - b.difficulte);
    let groupe = '';
    liste.innerHTML = `<p class="note">${qs.length} fiche(s)${t ? ' (tous thèmes)' : ''}</p>` + qs.slice(0, limite).map(q => {
      const entete = q.sousTheme !== groupe ? `<h2 class="titre-groupe">${esc(q.sousTheme)} <button class="btn petit-btn" data-sous="${esc(q.sousTheme)}">S'entraîner</button></h2>` : '';
      groupe = q.sousTheme;
      return `${entete}<details class="fiche" data-id="${q.id}"><summary><span class="badge">${q.difficulte}/10</span> ${q.ecg || q.ecg12 || q.egm ? '🩺 ' : ''}${esc(q.question)}</summary>
        <div class="fiche-corps">${q.ecg || q.ecg12 || q.egm ? '<div class="trace"></div>' : ''}
        ${q.type === 'ouverte' ? `<div class="modele"><b>${esc(q.reponseAttendue)}</b></div>` : `<ul class="fiche-options">${q.options.map((o, i) => `<li class="${q.reponses.includes(i) ? 'juste' : ''}">${q.reponses.includes(i) ? '✅' : '▫️'} ${esc(o)}${q.commentaires ? `<br><small>${esc(q.commentaires[i])}</small>` : ''}</li>`).join('')}</ul>`}
        ${blocCorrection(q, { juste: true })}</div></details>`;
    }).join('') + (qs.length > limite ? '<div class="actions"><button class="btn btn-bloc" id="plus">Afficher plus</button></div>' : '');
    const plus = liste.querySelector('#plus');
    if (plus) plus.onclick = () => { limite += PAGE; afficher(); };
    liste.querySelectorAll('[data-sous]').forEach(b => b.onclick = () => {
      const qs2 = base.questions.filter(q => q.sousTheme === b.dataset.sous);
      demarrer(qs2.sort(() => Math.random() - 0.5).slice(0, 10), b.dataset.sous);
    });
    liste.querySelectorAll('details.fiche').forEach(d => d.addEventListener('toggle', () => {
      const div = d.querySelector('.trace');
      if (!d.open || !div || div.dataset.fait) return;
      div.dataset.fait = '1';
      afficherTrace(div, base.parId.get(d.dataset.id));
    }));
  };
  app.querySelectorAll('[name=ft]').forEach(r => r.onchange = () => { filtre.theme = r.value; filtre.sous = ''; limite = PAGE; remplirSous(); afficher(); });
  selSous.onchange = () => { filtre.sous = selSous.value; limite = PAGE; afficher(); };
  let minuteur;
  app.querySelector('#recherche').oninput = e => { clearTimeout(minuteur); minuteur = setTimeout(() => { filtre.texte = e.target.value; limite = PAGE; afficher(); }, 200); };
  remplirSous();
  afficher();
}
