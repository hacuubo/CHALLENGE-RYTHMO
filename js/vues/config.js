import * as stock from '../store.js';
import { THEMES, TYPES, NIVEAUX, MARQUES, base, filtrer, construireSerie } from '../donnees.js';
import { esc } from '../util.js';

export function vueConfig(app, { demarrer }) {
  const cfg = stock.config();
  const compteTheme = t => base.questions.filter(q => q.theme === t).length;
  const sousParTheme = Object.keys(THEMES).filter(t => cfg.themes.includes(t)).map(t => ({
    t, liste: [...new Set(base.questions.filter(q => q.theme === t).map(q => q.sousTheme))].sort((a, b) => a.localeCompare(b, 'fr')),
  }));
  const tousSous = sousParTheme.flatMap(x => x.liste);
  cfg.sousThemes = cfg.sousThemes.filter(s => tousSous.includes(s));
  const opts = sel => Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
  const niveauActif = NIVEAUX.find(n => n.min === cfg.min && n.max === cfg.max)?.id;
  const marquesVisibles = cfg.themes.includes('programmation') || cfg.themes.includes('telecardio');
  const nbAvances = cfg.marques.length + cfg.sousThemes.length + (cfg.types.length < 4 ? 1 : 0) + (cfg.priorite !== 'hasard' ? 1 : 0);
  const niv = stock.niveau();

  app.innerHTML = `
    <h1>Entraînement ciblé</h1>
    <form class="carte" id="f">
      <fieldset><legend>Mode</legend><div class="puces">
        <label class="puce"><input type="radio" name="mode" value="entrainement" ${cfg.mode !== 'examen' ? 'checked' : ''}><span>📖 Entraînement <span class="n">correction immédiate</span></span></label>
        <label class="puce"><input type="radio" name="mode" value="examen" ${cfg.mode === 'examen' ? 'checked' : ''}><span>⏱️ Examen <span class="n">chrono, correction à la fin</span></span></label>
      </div></fieldset>

      <fieldset><legend>Thèmes</legend><div class="puces">
        ${Object.entries(THEMES).map(([k, t]) => `<label class="puce"><input type="checkbox" name="theme" value="${k}" ${cfg.themes.includes(k) ? 'checked' : ''}><span>${t.ico} ${t.nom} <span class="n">${compteTheme(k)}</span></span></label>`).join('')}
        <label class="puce"><input type="checkbox" name="ecgSeul" ${cfg.ecgSeul ? 'checked' : ''}><span>🩺 Tracés uniquement</span></label>
      </div></fieldset>

      <fieldset><legend>Niveau de difficulté</legend>
        <div class="puces" style="margin-bottom:10px">
          ${NIVEAUX.map(n => `<label class="puce"><input type="radio" name="niveau" value="${n.id}" ${niveauActif === n.id ? 'checked' : ''}><span>${n.nom}</span></label>`).join('')}
          ${niv.n >= 5 ? `<label class="puce"><input type="radio" name="niveau" value="moi"><span>🧭 Mon niveau (${Math.max(1, niv.niveau - 1)}–${Math.min(10, niv.niveau + 2)})</span></label>` : ''}
        </div>
        <div class="plage">Entre <select name="min" aria-label="Difficulté minimale">${opts(cfg.min)}</select> et <select name="max" aria-label="Difficulté maximale">${opts(cfg.max)}</select> <span class="note">(1 = découverte, 10 = expert)</span></div>
      </fieldset>

      <fieldset><legend>Série</legend>
        <div class="plage"><select name="n" aria-label="Nombre de questions">${[5, 10, 20, 30, 50, 9999].map(n => `<option value="${n}" ${cfg.n === n ? 'selected' : ''}>${n === 9999 ? 'Toutes' : n + ' questions'}</option>`).join('')}</select></div>
      </fieldset>

      <details class="avance" ${nbAvances ? 'open' : ''}><summary>Plus d'options${nbAvances ? ` <span class="n">(${nbAvances} active${nbAvances > 1 ? 's' : ''})</span>` : ''}</summary>
        ${marquesVisibles ? `<fieldset><legend>Marques <span class="note">(programmation et télécardio — aucune sélection = toutes)</span></legend><div class="puces">
          ${['Générique', ...MARQUES].map(m => `<label class="puce"><input type="checkbox" name="marque" value="${m}" ${cfg.marques.includes(m) ? 'checked' : ''}><span>${m}</span></label>`).join('')}
        </div></fieldset>` : ''}
        <fieldset><legend>Types de questions</legend><div class="puces">
          ${Object.entries(TYPES).map(([k, t]) => `<label class="puce"><input type="checkbox" name="type" value="${k}" ${cfg.types.includes(k) ? 'checked' : ''}><span>${t}</span></label>`).join('')}
        </div></fieldset>
        <fieldset><legend>Ordre</legend><div class="plage">
          <select name="priorite" aria-label="Ordre des questions">
            <option value="hasard" ${cfg.priorite === 'hasard' ? 'selected' : ''}>Complètement au hasard</option>
            <option value="nouvelles" ${cfg.priorite === 'nouvelles' ? 'selected' : ''}>Jamais vues d'abord</option>
            <option value="faibles" ${cfg.priorite === 'faibles' ? 'selected' : ''}>Mes points faibles d'abord</option>
          </select></div></fieldset>
        <fieldset><legend>Sous-thèmes <span class="note">(aucune sélection = tous)</span></legend>
          ${sousParTheme.map(({ t, liste }) => `<div class="groupe-sous"><div class="note"><b>${THEMES[t].nom}</b></div><div class="puces">
            ${liste.map(s => `<label class="puce"><input type="checkbox" name="sous" value="${esc(s)}" ${cfg.sousThemes.includes(s) ? 'checked' : ''}><span>${esc(s)} <span class="n">${base.questions.filter(q => q.sousTheme === s && q.theme === t).length}</span></span></label>`).join('')}
          </div></div>`).join('')}
        </fieldset>
      </details>
      <p><span class="compteur" id="cpt"></span></p>
      <button class="btn btn-primaire btn-bloc" id="go">Commencer</button>
    </form>`;

  const f = app.querySelector('#f');
  const lire = () => {
    const fd = new FormData(f);
    let min = +fd.get('min'), max = +fd.get('max');
    if (min > max) [min, max] = [max, min];
    return {
      themes: fd.getAll('theme'), marques: fd.getAll('marque'), types: fd.getAll('type'), sousThemes: fd.getAll('sous'),
      min, max, n: +fd.get('n'), priorite: fd.get('priorite') || 'hasard', mode: fd.get('mode'), ecgSeul: fd.get('ecgSeul') === 'on',
    };
  };
  const maj = () => {
    const c = lire(); const l = filtrer(c);
    app.querySelector('#cpt').textContent = `${l.length} question(s) correspondent à vos critères`;
    app.querySelector('#go').disabled = !l.length;
    stock.sauverConfig(c);
    return c;
  };
  f.addEventListener('change', e => {
    if (e.target.name === 'niveau') {
      const n = e.target.value === 'moi'
        ? { min: Math.max(1, niv.niveau - 1), max: Math.min(10, niv.niveau + 2) } : NIVEAUX.find(x => x.id === e.target.value);
      f.min.value = n.min; f.max.value = n.max;
    } else if (e.target.name === 'min' || e.target.name === 'max') {
      f.querySelectorAll('[name=niveau]').forEach(r => { r.checked = false; });
    }
    maj();
    if (e.target.name === 'theme') vueConfig(app, { demarrer });
  });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const c = maj();
    const n = c.mode === 'examen' ? Math.min(c.n, 60) : c.n;
    demarrer(construireSerie(filtrer(c), n, c.priorite), c.mode === 'examen' ? 'Examen' : 'Entraînement ciblé', { examen: c.mode === 'examen' });
  });
  maj();
}
