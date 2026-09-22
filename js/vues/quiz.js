// Déroulé d'une série : entraînement (correction immédiate), examen (chronométré, correction à la fin)
// et défi adaptatif (chaque question est choisie selon le niveau estimé).
import * as stock from '../store.js';
import { THEMES, TYPES, base, questionAdaptative } from '../donnees.js';
import { etat, sauver, terminer } from '../session.js';
import { esc, paragraphes, pct, lettre, diffBarres, moisAnnee, duree } from '../util.js';
import { dessinerECG } from '../ecg.js';
import { chargerECG12, dessinerECG12 } from '../ecg12.js';
import { monterTrace } from '../traces.js';

export const DEPOT = 'hacuubo/CHALLENGE-RYTHMO';
let chrono = null;
let clavier = null; // gestionnaire de touches de la question affichée

export function toucheQuiz(e) { if (clavier) clavier(e); }

export function vueQuiz(app, aller) {
  const s = etat.session;
  clearInterval(chrono);
  const q = s.questions[s.i];
  const rep = s.reponses[s.i];
  const theme = THEMES[q.theme];
  const total = s.adaptatif ? s.adaptatif.n : s.questions.length;
  const montrerCorrection = rep && !s.examen;

  app.innerHTML = `
    <div class="quiz-tete">
      <button class="quitter" id="quit" aria-label="Quitter la série">✕</button>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${s.i + 1}"><i style="width:${pct(s.i + (rep ? 1 : 0), total)}%"></i></div>
      <span class="note">${s.i + 1}/${total}</span>
      ${s.examen ? '<span class="chrono" id="chrono" aria-live="off"></span>' : ''}
    </div>
    <article class="carte">
      <div class="badges">
        <span class="badge theme-${q.theme}">${theme.ico} ${theme.nom}</span>
        <span class="badge">${esc(q.sousTheme)}</span>
        ${q.marque ? `<span class="badge">${esc(q.marque)}</span>` : ''}
        <span class="badge">${TYPES[q.type]}</span>
        <span class="badge" title="Difficulté ${q.difficulte}/10">${diffBarres(q.difficulte)} ${q.difficulte}/10</span>
      </div>
      <div class="enonce">${esc(q.question)}</div>
      ${q.ecg || q.ecg12 ? '<div class="trace" id="trace"></div>' : ''}
      <div id="zone"></div>
      <div id="retour"></div>
    </article>
    ${s.combo >= 3 && !s.examen ? `<p class="note centre">🔥 ${s.combo} bonnes réponses d'affilée</p>` : ''}
    <p class="note centre raccourcis">Clavier : ${q.type === 'vf' ? 'V / F' : q.type === 'ouverte' ? '' : '1–' + (q.options?.length || 4) + ' ou A–' + lettre((q.options?.length || 4) - 1)} · Entrée pour valider / continuer</p>`;

  app.querySelector('#quit').onclick = () => {
    if (s.reponses.some(Boolean) && !confirm('Terminer la série maintenant ?')) return;
    terminer(); aller(s.reponses.some(Boolean) ? 'resultats' : 'accueil');
  };
  if (q.ecg || q.ecg12) afficherTrace(app.querySelector('#trace'), q);
  if (s.examen) demarrerChrono(app, aller);

  const suite = () => suivant(app, aller);
  if (q.type === 'ouverte') zoneOuverte(app, q, rep, suite);
  else zoneChoix(app, q, rep, suite);
  if (montrerCorrection) afficherRetour(app, q, rep, suite);
}

function afficherTrace(div, q) {
  if (q.ecg) {
    monterTrace(div, (c, o) => dessinerECG(c, q.ecg, q.id, o), {
      titre: 'Tracé ECG, dérivation DII', legende: `DII · 25 mm/s · 10 mm/mV${q.ecg.legende ? ' — ' + esc(q.ecg.legende) : ''}`,
    });
    return;
  }
  div.innerHTML = '<p class="note">Chargement de l\'ECG…</p>';
  chargerECG12(q.ecg12.fichier).then(ecg => {
    if (!div.isConnected) return;
    monterTrace(div, (c, o) => dessinerECG12(c, ecg, o), {
      titre: 'ECG 12 dérivations', legende: `12 dérivations · 25 mm/s · 10 mm/mV${q.ecg12.legende ? ' — ' + esc(q.ecg12.legende) : ''} · <a href="https://physionet.org/content/ptb-xl/" target="_blank" rel="noopener noreferrer">PTB-XL</a>`,
    });
  }).catch(() => { div.innerHTML = '<p class="note">ECG indisponible hors ligne. Reconnectez-vous pour l\'afficher.</p>'; });
}

function demarrerChrono(app, aller) {
  const s = etat.session;
  const maj = () => {
    const reste = s.finPrevue - Date.now();
    const el = app.querySelector('#chrono');
    if (el) { el.textContent = '⏱ ' + duree(reste); el.classList.toggle('urgent', reste < 60000); }
    if (reste <= 0) { clearInterval(chrono); terminer(); aller('resultats'); }
  };
  maj();
  chrono = setInterval(maj, 1000);
}

function suivant(app, aller) {
  const s = etat.session;
  const total = s.adaptatif ? s.adaptatif.n : s.questions.length;
  if (s.i + 1 >= total) { clearInterval(chrono); terminer(); aller('resultats'); return; }
  if (s.adaptatif && s.i + 1 >= s.questions.length) {
    const pool = s.adaptatif.pool.map(id => base.parId.get(id)).filter(Boolean);
    const q = questionAdaptative(pool, s.questions.map(x => x.id));
    if (!q) { terminer(); aller('resultats'); return; }
    s.questions.push(q);
  }
  s.i++;
  sauver();
  vueQuiz(app, aller);
}

function zoneChoix(app, q, rep, suite) {
  const s = etat.session;
  const zone = app.querySelector('#zone');
  const multi = q.type === 'qcm';
  let choix = new Set(rep ? rep.choix : []);
  const corrige = rep && !s.examen;
  const dessiner = () => {
    zone.innerHTML = `
      ${multi ? '<div class="consigne">Plusieurs réponses possibles — cochez toutes les bonnes propositions.</div>' : ''}
      <div class="options" role="${multi ? 'group' : 'radiogroup'}">
        ${q.options.map((o, i) => {
          let cl = choix.has(i) ? 'choisi' : '';
          if (corrige) cl = q.reponses.includes(i) ? 'juste' : choix.has(i) ? 'faux' : '';
          const com = corrige && q.commentaires ? `<span class="commentaire">${esc(q.commentaires[i])}</span>` : '';
          return `<button class="option ${cl}" data-i="${i}" ${rep ? 'disabled' : ''} role="${multi ? 'checkbox' : 'radio'}" aria-checked="${choix.has(i)}"><span class="lettre">${q.type === 'vf' ? (i ? 'F' : 'V') : lettre(i)}</span><span class="texte">${esc(o)}${com}</span></button>`;
        }).join('')}
      </div>
      ${rep ? '' : `<div class="actions">${s.examen ? '<button class="btn" id="passer">Passer</button>' : ''}<button class="btn btn-primaire btn-bloc" id="valider" ${choix.size ? '' : 'disabled'}>Valider</button></div>`}`;
    zone.querySelectorAll('.option').forEach(b => b.onclick = () => basculer(+b.dataset.i));
    const v = zone.querySelector('#valider');
    if (v) v.onclick = valider;
    const p = zone.querySelector('#passer');
    if (p) p.onclick = () => { etat.session.reponses[etat.session.i] = null; suite(); };
  };
  const basculer = i => {
    if (rep) return;
    if (multi) choix.has(i) ? choix.delete(i) : choix.add(i); else choix = new Set([i]);
    if (q.type === 'vf') return valider();
    dessiner();
  };
  const valider = () => {
    if (!choix.size) return;
    const juste = choix.size === q.reponses.length && q.reponses.every(r => choix.has(r));
    enregistrer(q, { choix: [...choix], juste, score: juste ? 1 : 0 });
    if (s.examen) suite(); else vueSansReinit(app, suite);
  };
  clavier = e => {
    if (e.target.closest('textarea, input, select')) return;
    const k = e.key.toLowerCase();
    if (!rep) {
      if (q.type === 'vf' && (k === 'v' || k === 'f')) { e.preventDefault(); return basculer(k === 'v' ? 0 : 1); }
      let i = /^[1-9]$/.test(k) ? +k - 1 : /^[a-f]$/.test(k) && q.type !== 'vf' ? k.charCodeAt(0) - 97 : -1;
      if (i >= 0 && i < q.options.length) { e.preventDefault(); return basculer(i); }
      if (k === 'enter' && choix.size && e.target.id !== 'valider') { e.preventDefault(); valider(); }
    } else if (k === 'enter' && !e.target.closest('button, a')) { e.preventDefault(); suite(); }
  };
  dessiner();
}

function vueSansReinit(app, suite) {
  // affiche la correction sans redessiner l'énoncé ni le tracé
  const s = etat.session, q = s.questions[s.i], rep = s.reponses[s.i];
  if (q.type === 'ouverte') zoneOuverte(app, q, rep, suite); else zoneChoix(app, q, rep, suite);
  afficherRetour(app, q, rep, suite);
  const barre = app.querySelector('.progress i');
  const total = s.adaptatif ? s.adaptatif.n : s.questions.length;
  if (barre) barre.style.width = pct(s.i + 1, total) + '%';
}

function zoneOuverte(app, q, rep, suite) {
  const s = etat.session;
  const zone = app.querySelector('#zone');
  if (rep) {
    zone.innerHTML = `
      ${rep.texte ? `<div class="consigne">Votre réponse :</div><div class="modele">${esc(rep.texte)}</div>` : ''}
      <div class="consigne">Réponse attendue :</div><div class="modele"><b>${esc(q.reponseAttendue)}</b></div>`;
    clavier = e => { if (e.key === 'Enter' && !e.target.closest('button, a, textarea')) { e.preventDefault(); suite(); } };
    return;
  }
  zone.innerHTML = `
    <div class="consigne">Rédigez votre réponse (ou réfléchissez-y), puis comparez-la à la réponse attendue.</div>
    <textarea id="txt" placeholder="Votre réponse…" aria-label="Votre réponse"></textarea>
    <div class="actions"><button class="btn btn-primaire btn-bloc" id="voir">Voir la réponse</button></div>`;
  clavier = null;
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
    const noter = ev => {
      enregistrer(q, { texte, eval: ev, juste: ev === 2, score: ev / 2 });
      if (s.examen) suite(); else vueSansReinit(app, suite);
    };
    zone.querySelectorAll('[data-e]').forEach(b => b.onclick = () => noter(+b.dataset.e));
    clavier = e => { if (['1', '2', '3'].includes(e.key)) { e.preventDefault(); noter(+e.key - 1); } };
  };
}

function enregistrer(q, rep) {
  const s = etat.session;
  s.reponses[s.i] = rep;
  stock.noterReponse(q, rep.score);
  if (rep.juste) { s.points += q.difficulte; s.combo++; s.meilleurCombo = Math.max(s.meilleurCombo, s.combo); } else s.combo = 0;
  sauver();
}

export function lienSignalement(q, rep) {
  const votre = rep?.texte || (rep?.choix ? rep.choix.map(i => q.options[i]).join(' ; ') : rep && q.type === 'ouverte' ? '(auto-évaluation)' : '—');
  const corps = `**Question** : ${q.id} (${q.sousTheme}, difficulté ${q.difficulte})\n\n> ${q.question}\n\n**Réponse de la base** : ${q.type === 'ouverte' ? q.reponseAttendue : q.reponses.map(i => q.options[i]).join(' ; ')}\n\n**Ma réponse** : ${votre}\n\n**Problème constaté** (erreur, formulation, source, recommandation obsolète…) :\n\n\n**Source à l'appui** (facultatif) :\n`;
  return `https://github.com/${DEPOT}/issues/new?labels=${encodeURIComponent('contenu')}&title=${encodeURIComponent(`[${q.id}] Signalement`)}&body=${encodeURIComponent(corps)}`;
}

export function blocCorrection(q, rep) {
  const bonnes = q.type !== 'ouverte' && (!rep || !rep.juste)
    ? `<p><b>Réponse${q.reponses.length > 1 ? 's' : ''} attendue${q.reponses.length > 1 ? 's' : ''} :</b> ${q.reponses.map(i => (q.type === 'vf' ? '' : lettre(i) + ' — ') + esc(q.options[i])).join(' ; ')}</p>` : '';
  return `
    ${bonnes}
    <div class="explication">${paragraphes(q.explication)}</div>
    ${q.aRetenir ? `<div class="retenir"><b>À retenir :</b> ${esc(q.aRetenir)}</div>` : ''}
    ${q.sources?.length ? `<div class="sources"><b>Sources</b><ul>${q.sources.map(src => `<li>${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.titre)}</a>` : esc(src.titre)}</li>`).join('')}</ul></div>` : ''}
    <div class="pied-question">
      <span class="note">${q.revise ? `Relue en ${moisAnnee(q.revise)}` : ''}${q.reco?.length ? ` · Réf. : ${q.reco.map(esc).join(', ')}` : ''}</span>
      <a class="signaler" href="${lienSignalement(q, rep)}" target="_blank" rel="noopener noreferrer">⚑ Signaler une erreur</a>
    </div>`;
}

function afficherRetour(app, q, rep, suite) {
  const s = etat.session;
  const r = app.querySelector('#retour');
  const partiel = q.type === 'ouverte' && rep.eval === 1;
  const cl = rep.juste ? 'ok' : partiel ? 'neutre' : 'ko';
  const verdict = rep.juste ? `Bonne réponse ! <span class="note">+${q.difficulte} pts</span>`
    : partiel ? 'Réponse partielle' : q.type === 'ouverte' ? 'À revoir' : 'Pas tout à fait…';
  const total = s.adaptatif ? s.adaptatif.n : s.questions.length;
  const dernier = s.i + 1 >= total;
  r.innerHTML = `
    <div class="retour ${cl}" aria-live="polite">
      <div class="verdict">${verdict}</div>
      ${blocCorrection(q, rep)}
    </div>
    <div class="actions"><button class="btn btn-primaire btn-bloc" id="suivant">${dernier ? 'Voir mes résultats' : 'Question suivante →'}</button></div>`;
  const b = r.querySelector('#suivant');
  b.onclick = suite;
  b.focus({ preventScroll: true });
  r.querySelector('.retour').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (q.type !== 'ouverte') {
    clavier = e => { if (e.key === 'Enter' && !e.target.closest('a')) { e.preventDefault(); suite(); } };
  }
}

export function arreterQuiz() { clearInterval(chrono); clavier = null; }
