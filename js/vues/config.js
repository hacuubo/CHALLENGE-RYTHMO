import * as stock from '../store.js';
import { THEMES, TYPES, NIVEAUX, MARQUES, base, filtrer, construireSerie, libSousTheme, libMarque } from '../donnees.js';
import { esc } from '../util.js';
import { t, locale } from '../i18n.js';

export function vueConfig(app, { demarrer }) {
  const cfg = stock.config();
  const compteTheme = th => base.questions.filter(q => q.theme === th).length;
  const sousParTheme = Object.keys(THEMES).filter(th => cfg.themes.includes(th)).map(th => ({
    th, liste: [...new Set(base.questions.filter(q => q.theme === th).map(q => q.sousTheme))].sort((a, b) => libSousTheme(a).localeCompare(libSousTheme(b), locale())),
  }));
  const tousSous = sousParTheme.flatMap(x => x.liste);
  cfg.sousThemes = cfg.sousThemes.filter(s => tousSous.includes(s));
  const opts = sel => Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
  const niveauActif = NIVEAUX.find(n => n.min === cfg.min && n.max === cfg.max)?.id;
  const marquesVisibles = cfg.themes.includes('programmation') || cfg.themes.includes('telecardio');
  const nbAvances = cfg.marques.length + cfg.sousThemes.length + (cfg.types.length < 4 ? 1 : 0) + (cfg.priorite !== 'hasard' ? 1 : 0);
  const niv = stock.classement();

  app.innerHTML = `
    <h1>${t('Entraînement ciblé', 'Custom training')}</h1>
    <form class="carte" id="f">
      <fieldset><legend>${t('Mode', 'Mode')}</legend><div class="puces">
        <label class="puce"><input type="radio" name="mode" value="entrainement" ${cfg.mode !== 'examen' ? 'checked' : ''}><span>📖 ${t('Entraînement', 'Training')} <span class="n">${t('correction immédiate', 'instant feedback')}</span></span></label>
        <label class="puce"><input type="radio" name="mode" value="examen" ${cfg.mode === 'examen' ? 'checked' : ''}><span>⏱️ ${t('Examen', 'Exam')} <span class="n">${t('chrono, correction à la fin', 'timed, answers at the end')}</span></span></label>
      </div></fieldset>

      <fieldset><legend>${t('Thèmes', 'Topics')}</legend><div class="puces">
        ${Object.entries(THEMES).map(([k, th]) => `<label class="puce"><input type="checkbox" name="theme" value="${k}" ${cfg.themes.includes(k) ? 'checked' : ''}><span>${th.ico} ${th.nom} <span class="n">${compteTheme(k)}</span></span></label>`).join('')}
        <label class="puce"><input type="checkbox" name="ecgSeul" ${cfg.ecgSeul ? 'checked' : ''}><span>🩺 ${t('Tracés uniquement', 'Tracings only')}</span></label>
      </div></fieldset>

      <fieldset><legend>${t('Niveau de difficulté', 'Difficulty level')}</legend>
        <div class="puces" style="margin-bottom:10px">
          ${NIVEAUX.map(n => `<label class="puce"><input type="radio" name="niveau" value="${n.id}" ${niveauActif === n.id ? 'checked' : ''}><span>${n.nom}</span></label>`).join('')}
          ${niv.n >= 5 ? `<label class="puce"><input type="radio" name="niveau" value="moi"><span>🧭 ${t('Mon niveau', 'My level')} (${Math.max(1, niv.niveau - 1)}–${Math.min(10, niv.niveau + 2)})</span></label>` : ''}
        </div>
        <div class="plage">${t('Entre', 'Between')} <select name="min" aria-label="${t('Difficulté minimale', 'Minimum difficulty')}">${opts(cfg.min)}</select> ${t('et', 'and')} <select name="max" aria-label="${t('Difficulté maximale', 'Maximum difficulty')}">${opts(cfg.max)}</select> <span class="note">${t('(1 = découverte, 10 = expert)', '(1 = introductory, 10 = expert)')}</span></div>
      </fieldset>

      <fieldset><legend>${t('Série', 'Quiz length')}</legend>
        <div class="plage"><select name="n" aria-label="${t('Nombre de questions', 'Number of questions')}">${[5, 10, 20, 30, 50, 9999].map(n => `<option value="${n}" ${cfg.n === n ? 'selected' : ''}>${n === 9999 ? t('Toutes', 'All') : n + ' questions'}</option>`).join('')}</select></div>
      </fieldset>

      <details class="avance" ${nbAvances ? 'open' : ''}><summary>${t('Plus d\'options', 'More options')}${nbAvances ? ` <span class="n">(${nbAvances} active${nbAvances > 1 ? t('s', '') : ''})</span>` : ''}</summary>
        ${marquesVisibles ? `<fieldset><legend>${t('Marques', 'Manufacturers')} <span class="note">${t('(programmation et télécardio — aucune sélection = toutes)', '(programming and remote monitoring — none selected = all)')}</span></legend><div class="puces">
          ${['Générique', ...MARQUES].map(m => `<label class="puce"><input type="checkbox" name="marque" value="${m}" ${cfg.marques.includes(m) ? 'checked' : ''}><span>${esc(libMarque(m))}</span></label>`).join('')}
        </div></fieldset>` : ''}
        <fieldset><legend>${t('Types de questions', 'Question types')}</legend><div class="puces">
          ${Object.entries(TYPES).map(([k, ty]) => `<label class="puce"><input type="checkbox" name="type" value="${k}" ${cfg.types.includes(k) ? 'checked' : ''}><span>${ty}</span></label>`).join('')}
        </div></fieldset>
        <fieldset><legend>${t('Ordre', 'Order')}</legend><div class="plage">
          <select name="priorite" aria-label="${t('Ordre des questions', 'Question order')}">
            <option value="hasard" ${cfg.priorite === 'hasard' ? 'selected' : ''}>${t('Complètement au hasard', 'Completely random')}</option>
            <option value="nouvelles" ${cfg.priorite === 'nouvelles' ? 'selected' : ''}>${t('Jamais vues d\'abord', 'Unseen first')}</option>
            <option value="faibles" ${cfg.priorite === 'faibles' ? 'selected' : ''}>${t('Mes points faibles d\'abord', 'My weak spots first')}</option>
          </select></div></fieldset>
        <fieldset><legend>${t('Sous-thèmes', 'Subtopics')} <span class="note">${t('(aucune sélection = tous)', '(none selected = all)')}</span></legend>
          ${sousParTheme.map(({ th, liste }) => `<div class="groupe-sous"><div class="note"><b>${THEMES[th].nom}</b></div><div class="puces">
            ${liste.map(s => `<label class="puce"><input type="checkbox" name="sous" value="${esc(s)}" ${cfg.sousThemes.includes(s) ? 'checked' : ''}><span>${esc(libSousTheme(s))} <span class="n">${base.questions.filter(q => q.sousTheme === s && q.theme === th).length}</span></span></label>`).join('')}
          </div></div>`).join('')}
        </fieldset>
      </details>
      <p><span class="compteur" id="cpt"></span></p>
      <button class="btn btn-primaire btn-bloc" id="go">${t('Commencer', 'Start')}</button>
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
    app.querySelector('#cpt').textContent = t(`${l.length} question(s) correspondent à vos critères`, `${l.length} question${l.length === 1 ? ' matches' : 's match'} your criteria`);
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
    demarrer(construireSerie(filtrer(c), n, c.priorite), c.mode === 'examen' ? t('Examen', 'Exam') : t('Entraînement ciblé', 'Custom training'), { examen: c.mode === 'examen' });
  });
  maj();
}
