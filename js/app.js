import { dessinerECG } from './ecg.js';
import * as stock from './store.js';

const THEMES = {
  ecg: { nom: 'ECG', ico: '📈', desc: 'Lecture de tracés, troubles de conduction, tachycardies, ECG stimulé' },
  programmation: { nom: 'Programmation PM / DAI', ico: '⚙️', desc: 'Modes, algorithmes par marque, DAI, CRT' },
  telecardio: { nom: 'Alertes télécardio', ico: '📡', desc: 'Télésurveillance, triage des alertes, conduite à tenir' },
  electrophysio: { nom: 'Électrophysiologie', ico: '⚡', desc: 'Mécanismes, EEP, ablation, antiarythmiques' },
};
const MARQUES = ['Medtronic', 'Abbott', 'Boston Scientific', 'Biotronik', 'MicroPort'];
const TYPES = { qcu: 'QCU', qcm: 'QCM', vf: 'Vrai / Faux', ouverte: 'Question ouverte' };
const NIVEAUX = [
  { id: 'tous', nom: 'Tous niveaux', min: 1, max: 10 },
  { id: 'deb', nom: 'Débutant (1–3)', min: 1, max: 3 },
  { id: 'inter', nom: 'Intermédiaire (4–6)', min: 4, max: 6 },
  { id: 'av', nom: 'Avancé (7–10)', min: 7, max: 10 },
  { id: 'sup3', nom: 'Au-dessus de 3', min: 4, max: 10 },
];

const app = document.getElementById('app');
let base = { version: '', date: '', questions: [] };
let parId = new Map();
let session = null;

// ---------- utilitaires ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paragraphes = s => String(s ?? '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
const melanger = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const lettre = i => String.fromCharCode(65 + i);
const diffBarres = d => `<span class="diff" title="Difficulté ${d}/10" aria-label="Difficulté ${d} sur 10">${Array.from({ length: 10 }, (_, i) => `<i class="${i < d ? 'on' : ''}"></i>`).join('')}</span>`;
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
function aleaDuJour(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }

// ---------- chargement ----------
async function charger() {
  const idx = await (await fetch('data/questions/index.json', { cache: 'no-cache' })).json();
  const listes = await Promise.all(idx.fichiers.map(f => fetch(`data/questions/${f}`, { cache: 'no-cache' }).then(r => r.json())));
  base = { version: idx.version, date: idx.date, questions: listes.flat() };
  parId = new Map(base.questions.map(q => [q.id, q]));
}

// ---------- navigation ----------
const vues = { accueil: vueAccueil, config: vueConfig, quiz: vueQuiz, resultats: vueResultats, progression: vueProgression, apropos: vueAPropos };
function aller(vue) {
  if (location.hash.slice(1) === vue) rendre(vue); else location.hash = vue; // hashchange → rendre
}
function rendre(vue, params) {
  if (!vues[vue]) vue = 'accueil';
  if ((vue === 'quiz' || vue === 'resultats') && !session) vue = 'accueil';
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('actif', b.dataset.nav === vue || (vue === 'quiz' && b.dataset.nav === 'config')));
  vues[vue](params);
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  e.preventDefault();
  if (session && !session.fini && location.hash === '#quiz' && session.reponses.some(Boolean)
    && !confirm('Quitter la série en cours ? Les réponses déjà données sont conservées.')) return;
  aller(b.dataset.nav);
});
window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (session && !session.fini && v !== 'quiz' && v !== 'resultats') terminerSession();
  rendre(v);
});

// ---------- sélection des questions ----------
function filtrer(cfg) {
  return base.questions.filter(q =>
    cfg.themes.includes(q.theme) &&
    q.difficulte >= cfg.min && q.difficulte <= cfg.max &&
    cfg.types.includes(q.type) &&
    (q.theme !== 'programmation' && q.theme !== 'telecardio' || !cfg.marques.length ||
      cfg.marques.includes(q.marque || 'Générique')) &&
    (!cfg.sousThemes.length || cfg.sousThemes.includes(q.sousTheme)));
}

function construireSerie(liste, n, priorite) {
  const p = stock.progres();
  let ordre = melanger(liste);
  if (priorite === 'nouvelles') ordre.sort((a, b) => (p.q[a.id] ? 1 : 0) - (p.q[b.id] ? 1 : 0));
  if (priorite === 'faibles') ordre.sort((a, b) => stock.poidsRevision(p.q[b.id]) - stock.poidsRevision(p.q[a.id]));
  return ordre.slice(0, n);
}

function demarrer(questions, titre) {
  if (!questions.length) { toast('Aucune question ne correspond à ces critères.'); return; }
  session = { titre, questions, i: 0, reponses: [], points: 0, combo: 0, meilleurCombo: 0, debut: Date.now(), fini: false };
  aller('quiz');
}

function terminerSession() {
  if (!session || session.fini) return;
  session.fini = true;
  if (session.reponses.length) stock.enregistrerSession(session);
}

// ---------- vues ----------
function vueAccueil() {
  const p = stock.progres();
  const nb = base.questions.length;
  const vus = Object.keys(p.q).filter(id => parId.has(id)).length;
  const rep = Object.values(p.q).reduce((s, x) => s + x.vus, 0);
  const justes = Object.values(p.q).reduce((s, x) => s + x.justes, 0);
  const aRevoir = stock.aReviser(base.questions).length;
  const nouvelles = stock.nouveautes(base.questions);
  const parTheme = t => base.questions.filter(q => q.theme === t).length;

  app.innerHTML = `
    <section class="carte hero">
      <h1>Challenge Rythmo</h1>
      <p>Entraînez-vous en rythmologie et stimulation cardiaque, une question à la fois.</p>
      <div class="stats">
        <div><b>${nb}</b><span>questions</span></div>
        <div><b>${vus}</b><span>déjà vues</span></div>
        <div><b>${rep ? pct(justes, rep) + ' %' : '—'}</b><span>réussite</span></div>
        <div><b>${p.serie.compte || 0} 🔥</b><span>jour(s) d'affilée</span></div>
      </div>
    </section>
    ${nouvelles.length ? `<div class="carte ligne-reglage"><div><b>${nouvelles.length} nouvelle(s) question(s)</b> depuis votre dernière visite.</div>
      <button class="btn btn-primaire" id="go-nouv">Les découvrir</button></div>` : ''}
    <div class="grille">
      <button class="tuile" id="go-alea"><span class="ico">🎲</span><strong>Défi aléatoire</strong><small>10 questions, tous thèmes, tous niveaux</small></button>
      <button class="tuile" id="go-jour"><span class="ico">📅</span><strong>Défi du jour</strong><small>5 questions tirées pour aujourd'hui</small></button>
      <button class="tuile" data-nav="config"><span class="ico">🎯</span><strong>Entraînement ciblé</strong><small>Choisissez thèmes, marques et niveau</small></button>
      <button class="tuile" id="go-rev" ${aRevoir ? '' : 'disabled'}><span class="ico">🔁</span><strong>Révisions</strong><small>${aRevoir ? `${aRevoir} question(s) à revoir` : 'Rien à revoir pour l\'instant'}</small></button>
    </div>
    <h2 style="margin-top:22px">Par thème</h2>
    <div class="grille">
      ${Object.entries(THEMES).map(([k, t]) => `<button class="tuile" data-theme="${k}"><span class="ico">${t.ico}</span><strong>${t.nom}</strong><small>${parTheme(k)} questions — ${t.desc}</small></button>`).join('')}
    </div>`;

  app.querySelector('#go-alea').onclick = () => demarrer(melanger(base.questions).slice(0, 10), 'Défi aléatoire');
  app.querySelector('#go-jour').onclick = () => {
    const d = new Date(); const r = aleaDuJour(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
    const l = base.questions.slice().sort((a, b) => a.id.localeCompare(b.id)).map(q => ({ q, k: r() })).sort((a, b) => a.k - b.k).slice(0, 5).map(x => x.q);
    demarrer(l, 'Défi du jour');
  };
  const rev = app.querySelector('#go-rev');
  if (aRevoir) rev.onclick = () => demarrer(stock.aReviser(base.questions).slice(0, 15), 'Révisions');
  const nv = app.querySelector('#go-nouv');
  if (nv) nv.onclick = () => { stock.marquerConnues(base.questions); demarrer(melanger(nouvelles).slice(0, 20), 'Nouveautés'); };
  app.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    const cfg = { ...stock.config(), themes: [b.dataset.theme], sousThemes: [], marques: [] };
    stock.sauverConfig(cfg);
    aller('config');
  });
}

function vueConfig() {
  const cfg = stock.config();
  const compteTheme = t => base.questions.filter(q => q.theme === t).length;
  const sousThemes = [...new Set(base.questions.filter(q => cfg.themes.includes(q.theme)).map(q => q.sousTheme))].sort((a, b) => a.localeCompare(b, 'fr'));
  cfg.sousThemes = cfg.sousThemes.filter(s => sousThemes.includes(s));
  const opts = (sel) => Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
  const niveauActif = NIVEAUX.find(n => n.min === cfg.min && n.max === cfg.max)?.id;
  const brandVisible = cfg.themes.includes('programmation') || cfg.themes.includes('telecardio');

  app.innerHTML = `
    <h1>Entraînement ciblé</h1>
    <form class="carte" id="f">
      <fieldset><legend>Thèmes</legend><div class="puces">
        ${Object.entries(THEMES).map(([k, t]) => `<label class="puce"><input type="checkbox" name="theme" value="${k}" ${cfg.themes.includes(k) ? 'checked' : ''}><span>${t.ico} ${t.nom} <span class="n">${compteTheme(k)}</span></span></label>`).join('')}
      </div></fieldset>

      <fieldset><legend>Niveau de difficulté</legend>
        <div class="puces" style="margin-bottom:10px">
          ${NIVEAUX.map(n => `<label class="puce"><input type="radio" name="niveau" value="${n.id}" ${niveauActif === n.id ? 'checked' : ''}><span>${n.nom}</span></label>`).join('')}
        </div>
        <div class="plage">Entre <select name="min" aria-label="Difficulté minimale">${opts(cfg.min)}</select> et <select name="max" aria-label="Difficulté maximale">${opts(cfg.max)}</select> <span class="note">(1 = découverte, 10 = expert)</span></div>
      </fieldset>

      ${brandVisible ? `<fieldset><legend>Marques <span class="note">(programmation et télécardio — aucune sélection = toutes)</span></legend><div class="puces">
        ${['Générique', ...MARQUES].map(m => `<label class="puce"><input type="checkbox" name="marque" value="${m}" ${cfg.marques.includes(m) ? 'checked' : ''}><span>${m}</span></label>`).join('')}
      </div></fieldset>` : ''}

      <fieldset><legend>Types de questions</legend><div class="puces">
        ${Object.entries(TYPES).map(([k, t]) => `<label class="puce"><input type="checkbox" name="type" value="${k}" ${cfg.types.includes(k) ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </div></fieldset>

      <fieldset><legend>Sous-thèmes <span class="note">(facultatif — aucune sélection = tous)</span></legend>
        <details ${cfg.sousThemes.length ? 'open' : ''}><summary class="note">Afficher les ${sousThemes.length} sous-thèmes</summary>
        <div class="puces" style="margin-top:10px">
          ${sousThemes.map(s => `<label class="puce"><input type="checkbox" name="sous" value="${esc(s)}" ${cfg.sousThemes.includes(s) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}
        </div></details>
      </fieldset>

      <fieldset><legend>Série</legend>
        <div class="plage">
          <select name="n" aria-label="Nombre de questions">${[5, 10, 20, 30, 50, 9999].map(n => `<option value="${n}" ${cfg.n === n ? 'selected' : ''}>${n === 9999 ? 'Toutes' : n + ' questions'}</option>`).join('')}</select>
          <select name="priorite" aria-label="Ordre">
            <option value="hasard" ${cfg.priorite === 'hasard' ? 'selected' : ''}>Complètement au hasard</option>
            <option value="nouvelles" ${cfg.priorite === 'nouvelles' ? 'selected' : ''}>Jamais vues d'abord</option>
            <option value="faibles" ${cfg.priorite === 'faibles' ? 'selected' : ''}>Mes points faibles d'abord</option>
          </select>
        </div>
      </fieldset>
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
      min, max, n: +fd.get('n'), priorite: fd.get('priorite'),
    };
  };
  const maj = () => {
    const c = lire(); const l = filtrer(c);
    const btn = app.querySelector('#go');
    app.querySelector('#cpt').textContent = `${l.length} question(s) correspondent à vos critères`;
    btn.disabled = !l.length;
    stock.sauverConfig(c);
    return c;
  };
  f.addEventListener('change', e => {
    if (e.target.name === 'niveau') {
      const n = NIVEAUX.find(x => x.id === e.target.value);
      f.min.value = n.min; f.max.value = n.max;
    } else if (e.target.name === 'min' || e.target.name === 'max') {
      f.querySelectorAll('[name=niveau]').forEach(r => { r.checked = false; });
    }
    maj();
    if (e.target.name === 'theme') vueConfig();
  });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const c = maj();
    demarrer(construireSerie(filtrer(c), c.n, c.priorite), 'Entraînement ciblé');
  });
  maj();
}

function vueQuiz() {
  const s = session;
  const q = s.questions[s.i];
  const rep = s.reponses[s.i];
  const theme = THEMES[q.theme];
  app.innerHTML = `
    <div class="quiz-tete">
      <button class="quitter" id="quit" aria-label="Quitter la série">✕</button>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.questions.length}" aria-valuenow="${s.i + 1}"><i style="width:${pct(s.i + (rep ? 1 : 0), s.questions.length)}%"></i></div>
      <span class="note">${s.i + 1}/${s.questions.length}</span>
    </div>
    <article class="carte">
      <div class="badges">
        <span class="badge theme-${q.theme}">${theme.ico} ${theme.nom}</span>
        <span class="badge">${esc(q.sousTheme)}</span>
        ${q.marque ? `<span class="badge">${esc(q.marque)}</span>` : ''}
        <span class="badge">${TYPES[q.type]}</span>
        <span class="badge">${diffBarres(q.difficulte)} ${q.difficulte}/10</span>
      </div>
      <div class="enonce">${esc(q.question)}</div>
      ${q.ecg ? `<div class="ecg-cadre"><canvas role="img" aria-label="Tracé ECG, dérivation DII, 25 mm/s, 10 mm/mV"></canvas></div><div class="ecg-legende">DII · 25 mm/s · 10 mm/mV${q.ecg.legende ? ' — ' + esc(q.ecg.legende) : ''}</div>` : ''}
      <div id="zone"></div>
      <div id="retour"></div>
    </article>
    ${s.combo >= 3 ? `<p class="note centre">🔥 ${s.combo} bonnes réponses d'affilée</p>` : ''}`;

  app.querySelector('#quit').onclick = () => {
    if (s.reponses.filter(Boolean).length && !confirm('Terminer la série maintenant ?')) return;
    terminerSession(); aller(s.reponses.filter(Boolean).length ? 'resultats' : 'accueil');
  };
  if (q.ecg) {
    const cv = app.querySelector('canvas');
    requestAnimationFrame(() => {
      dessinerECG(cv, q.ecg, q.id);
      if (cv.clientWidth > cv.parentElement.clientWidth + 4) app.querySelector('.ecg-legende').insertAdjacentHTML('beforeend', ' · <b>faites défiler le tracé →</b>');
    });
  }
  q.type === 'ouverte' ? zoneOuverte(q, rep) : zoneChoix(q, rep);
}

function zoneChoix(q, rep) {
  const zone = app.querySelector('#zone');
  const multi = q.type === 'qcm';
  let choix = new Set(rep ? rep.choix : []);
  const dessiner = () => {
    zone.innerHTML = `
      ${multi ? '<div class="consigne">Plusieurs réponses possibles — cochez toutes les bonnes propositions.</div>' : ''}
      <div class="options" role="${multi ? 'group' : 'radiogroup'}">
        ${q.options.map((o, i) => {
          let cl = choix.has(i) ? 'choisi' : '';
          if (rep) cl = q.reponses.includes(i) ? 'juste' : choix.has(i) ? 'faux' : '';
          return `<button class="option ${cl}" data-i="${i}" ${rep ? 'disabled' : ''} role="${multi ? 'checkbox' : 'radio'}" aria-checked="${choix.has(i)}"><span class="lettre">${q.type === 'vf' ? (i ? 'F' : 'V') : lettre(i)}</span><span>${esc(o)}</span></button>`;
        }).join('')}
      </div>
      ${rep ? '' : `<div class="actions"><button class="btn btn-primaire btn-bloc" id="valider" ${choix.size ? '' : 'disabled'}>Valider</button></div>`}`;
    zone.querySelectorAll('.option').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (multi) choix.has(i) ? choix.delete(i) : choix.add(i); else choix = new Set([i]);
      if (!multi && q.type === 'vf') return valider();
      dessiner();
    });
    const v = zone.querySelector('#valider');
    if (v) v.onclick = valider;
  };
  const valider = () => {
    const juste = choix.size === q.reponses.length && q.reponses.every(r => choix.has(r));
    enregistrer(q, { choix: [...choix], juste });
  };
  dessiner();
  if (rep) afficherRetour(q, rep);
}

function zoneOuverte(q, rep) {
  const zone = app.querySelector('#zone');
  if (!rep) {
    zone.innerHTML = `
      <div class="consigne">Rédigez votre réponse (ou réfléchissez-y), puis comparez-la à la réponse attendue.</div>
      <textarea id="txt" placeholder="Votre réponse…" aria-label="Votre réponse"></textarea>
      <div class="actions"><button class="btn btn-primaire btn-bloc" id="voir">Voir la réponse</button></div>`;
    zone.querySelector('#voir').onclick = () => {
      const texte = zone.querySelector('#txt').value.trim();
      zone.innerHTML = `
        ${texte ? `<div class="consigne">Votre réponse :</div><div class="modele">${esc(texte)}</div>` : ''}
        <div class="consigne">Réponse attendue :</div><div class="modele"><b>${esc(q.reponseAttendue)}</b></div>
        <div class="consigne" style="margin-top:12px">Évaluez-vous honnêtement :</div>
        <div class="auto-eval">
          <button class="btn" data-e="0">❌ À revoir</button>
          <button class="btn" data-e="1">〰️ En partie</button>
          <button class="btn" data-e="2">✅ Acquis</button>
        </div>`;
      zone.querySelectorAll('[data-e]').forEach(b => b.onclick = () => enregistrer(q, { texte, eval: +b.dataset.e, juste: b.dataset.e === '2' }));
    };
  } else {
    zone.innerHTML = `
      ${rep.texte ? `<div class="consigne">Votre réponse :</div><div class="modele">${esc(rep.texte)}</div>` : ''}
      <div class="consigne">Réponse attendue :</div><div class="modele"><b>${esc(q.reponseAttendue)}</b></div>`;
    afficherRetour(q, rep);
  }
}

function enregistrer(q, rep) {
  const s = session;
  s.reponses[s.i] = rep;
  stock.noterReponse(q.id, rep.juste);
  if (rep.juste) { s.points += q.difficulte; s.combo++; s.meilleurCombo = Math.max(s.meilleurCombo, s.combo); } else s.combo = 0;
  vueQuiz();
}

function afficherRetour(q, rep) {
  const s = session;
  const r = app.querySelector('#retour');
  const partiel = q.type === 'ouverte' && rep.eval === 1;
  const cl = rep.juste ? 'ok' : partiel ? 'neutre' : 'ko';
  const verdict = rep.juste ? `Bonne réponse ! <span class="note">+${q.difficulte} pts</span>`
    : partiel ? 'Réponse partielle' : q.type === 'ouverte' ? 'À revoir' : 'Pas tout à fait…';
  const bonnes = q.type !== 'ouverte' && !rep.juste ? `<p><b>Réponse${q.reponses.length > 1 ? 's' : ''} attendue${q.reponses.length > 1 ? 's' : ''} :</b> ${q.reponses.map(i => (q.type === 'vf' ? '' : lettre(i) + ' — ') + esc(q.options[i])).join(' ; ')}</p>` : '';
  const dernier = s.i === s.questions.length - 1;
  r.innerHTML = `
    <div class="retour ${cl}" aria-live="polite">
      <div class="verdict">${verdict}</div>
      ${bonnes}
      <div class="explication">${paragraphes(q.explication)}</div>
      ${q.aRetenir ? `<div class="retenir"><b>À retenir :</b> ${esc(q.aRetenir)}</div>` : ''}
      ${q.sources?.length ? `<div class="sources"><b>Sources</b><ul>${q.sources.map(src => `<li>${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.titre)}</a>` : esc(src.titre)}</li>`).join('')}</ul></div>` : ''}
    </div>
    <div class="actions"><button class="btn btn-primaire btn-bloc" id="suivant">${dernier ? 'Voir mes résultats' : 'Question suivante →'}</button></div>`;
  const b = r.querySelector('#suivant');
  b.onclick = () => {
    if (dernier) { terminerSession(); aller('resultats'); } else { s.i++; vueQuiz(); }
  };
  b.focus({ preventScroll: true });
  r.querySelector('.retour').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function vueResultats() {
  const s = session;
  const faites = s.questions.map((q, i) => ({ q, r: s.reponses[i] })).filter(x => x.r);
  const justes = faites.filter(x => x.r.juste).length;
  const score = pct(justes, faites.length);
  const parTheme = {};
  for (const { q, r } of faites) { (parTheme[q.theme] ??= { n: 0, ok: 0 }).n++; if (r.juste) parTheme[q.theme].ok++; }
  const erreurs = faites.filter(x => !x.r.juste);
  const msg = score >= 90 ? 'Excellent, niveau expert !' : score >= 70 ? 'Très bien, continuez comme ça.' : score >= 50 ? 'Bon début, les révisions feront le reste.' : 'Chaque erreur est une occasion d\'apprendre.';
  app.innerHTML = `
    <section class="carte centre">
      <h1>${esc(s.titre)} — terminé</h1>
      <div class="score-rond" style="--p:${score}"><div>${score} %</div></div>
      <p><b>${justes}/${faites.length}</b> bonnes réponses · <b>${s.points}</b> points · meilleure série : <b>${s.meilleurCombo}</b></p>
      <p class="note">${msg}</p>
    </section>
    <section class="carte"><h2>Par thème</h2><div class="barres">
      ${Object.entries(parTheme).map(([t, v]) => `<div class="barre-ligne"><span>${THEMES[t].nom}</span><span class="piste"><i style="width:${pct(v.ok, v.n)}%"></i></span><span class="val">${v.ok}/${v.n}</span></div>`).join('')}
    </div></section>
    <section class="carte"><h2>À revoir (${erreurs.length})</h2>
      ${erreurs.length ? `<ul class="liste-erreurs">${erreurs.map(({ q }) => `<li><details><summary>${esc(q.question)}</summary>
        ${q.type === 'ouverte' ? `<div class="modele">${esc(q.reponseAttendue)}</div>` : `<p><b>Réponse :</b> ${q.reponses.map(i => esc(q.options[i])).join(' ; ')}</p>`}
        <div class="explication">${paragraphes(q.explication)}</div></details></li>`).join('')}</ul>` : '<p class="vide">Aucune erreur, bravo !</p>'}
    </section>
    <div class="actions">
      ${erreurs.length ? '<button class="btn btn-primaire" id="refaire">Refaire mes erreurs</button>' : ''}
      <button class="btn" data-nav="config">Nouvelle série</button>
      <button class="btn" data-nav="accueil">Accueil</button>
    </div>`;
  const rf = app.querySelector('#refaire');
  if (rf) rf.onclick = () => demarrer(melanger(erreurs.map(x => x.q)), 'Mes erreurs');
}

function vueProgression() {
  const p = stock.progres();
  const lignes = (grp, cle) => {
    const m = {};
    for (const q of base.questions) {
      const k = cle(q); (m[k] ??= { total: 0, vus: 0, rep: 0, ok: 0, maitrise: 0 }); m[k].total++;
      const e = p.q[q.id];
      if (e) { m[k].vus++; m[k].rep += e.vus; m[k].ok += e.justes; if (e.boite >= 3) m[k].maitrise++; }
    }
    return Object.entries(m).sort(grp).map(([k, v]) => `
      <div class="barre-ligne"><span>${esc(k)}</span><span class="piste" title="Taux de réussite"><i style="width:${pct(v.ok, v.rep)}%"></i></span>
      <span class="val">${v.rep ? pct(v.ok, v.rep) + ' %' : '—'}</span></div>
      <div class="note" style="margin:-6px 0 4px">${v.vus}/${v.total} vues · ${v.maitrise} maîtrisée(s)</div>`).join('');
  };
  const hist = p.sessions.slice(-10).reverse();
  app.innerHTML = `
    <h1>Ma progression</h1>
    <section class="carte"><h2>Par thème</h2><div class="barres">${lignes((a, b) => a[0].localeCompare(b[0]), q => THEMES[q.theme].nom)}</div></section>
    <section class="carte"><h2>Par niveau de difficulté</h2><div class="barres">${lignes((a, b) => parseInt(a[0].slice(7)) - parseInt(b[0].slice(7)), q => 'Niveau ' + q.difficulte)}</div></section>
    <section class="carte"><h2>Dernières séries</h2>
      ${hist.length ? `<ul class="liste-erreurs">${hist.map(h => `<li>${new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${esc(h.titre)} : <b>${h.ok}/${h.n}</b> (${h.points} pts)</li>`).join('')}</ul>` : '<p class="vide">Aucune série terminée pour le moment.</p>'}
    </section>
    <section class="carte">
      <h2>Réglages</h2>
      <div class="ligne-reglage"><span>Apparence</span>
        <select id="theme-ui" class="btn"><option value="auto">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select></div>
      <div class="actions"><button class="btn" id="export">Exporter ma progression</button><label class="btn">Importer<input type="file" id="import" accept="application/json" hidden></label>
      <button class="btn" id="raz">Réinitialiser</button></div>
      <p class="note">Vos données restent sur cet appareil (aucun compte, aucun envoi).</p>
    </section>`;
  const sel = app.querySelector('#theme-ui');
  sel.value = stock.apparence();
  sel.onchange = () => { stock.sauverApparence(sel.value); appliquerApparence(); };
  app.querySelector('#raz').onclick = () => { if (confirm('Effacer toute votre progression ?')) { stock.reinitialiser(); vueProgression(); toast('Progression effacée'); } };
  app.querySelector('#export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(stock.progres(), null, 1)], { type: 'application/json' }));
    a.download = `challenge-rythmo-progression-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  app.querySelector('#import').onchange = async e => {
    try { stock.importer(JSON.parse(await e.target.files[0].text())); toast('Progression importée'); vueProgression(); } catch { toast('Fichier invalide'); }
  };
}

function vueAPropos() {
  const m = new Map();
  for (const q of base.questions) for (const s of q.sources || []) {
    const k = s.titre.trim(); const e = m.get(k) || { ...s, n: 0 }; e.n++; if (!e.url && s.url) e.url = s.url; m.set(k, e);
  }
  const src = [...m.values()].sort((a, b) => b.n - a.n);
  const parType = Object.keys(TYPES).map(t => `${TYPES[t]} : ${base.questions.filter(q => q.type === t).length}`).join(' · ');
  app.innerHTML = `
    <h1>Sources et informations</h1>
    <section class="carte">
      <p class="avert"><b>Outil pédagogique.</b> Les questions visent l'apprentissage et l'entretien des connaissances ; elles ne remplacent ni les recommandations officielles, ni les manuels des fabricants, ni le jugement clinique. Les valeurs de programmation peuvent varier selon les modèles et versions logicielles : vérifiez toujours la documentation de l'appareil.</p>
      <p>Base de questions : <b>${base.questions.length}</b> questions — version ${esc(base.version)}${base.date ? ` du ${new Date(base.date).toLocaleDateString('fr-FR')}` : ''}.<br><span class="note">${parType}</span></p>
      <p class="note">Les questions s'appuient uniquement sur des sources scientifiquement validées (recommandations ESC/EHRA/HRS/ACC/AHA, HAS, articles indexés, manuels techniques officiels) ; la rédaction a été relue par un rythmologue pour un français clair et naturel. Les tracés ECG sont synthétiques et schématiques, générés par l'application à des fins d'illustration.</p>
    </section>
    <section class="carte"><h2>Références citées (${src.length})</h2>
      <ol class="sources-liste">${src.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.titre)}</a>` : esc(s.titre)} <span class="note">(${s.n})</span></li>`).join('')}</ol>
    </section>`;
}

function appliquerApparence() {
  const a = stock.apparence();
  if (a === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = a;
}

// ---------- démarrage ----------
appliquerApparence();
try {
  await charger();
  stock.initialiserConnues(base.questions);
  rendre(location.hash.slice(1) || 'accueil');
} catch (e) {
  console.error(e);
  app.innerHTML = '<div class="carte"><h2>Impossible de charger les questions</h2><p>Vérifiez votre connexion puis rechargez la page.</p></div>';
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
