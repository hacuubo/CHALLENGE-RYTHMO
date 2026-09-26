// Déroulé d'une série : entraînement (correction immédiate), examen (chronométré, correction à la fin)
// et compétitif (questions enchaînées sans fin, choisies selon le classement ELO).
import * as stock from '../store.js';
import { THEMES, TYPES, questionCompetitive, libSousTheme, libReco, libMarque } from '../donnees.js';
import { etat, sauver, terminer } from '../session.js';
import { esc, paragraphes, pct, lettre, diffBarres, moisAnnee, duree, toast, decimal } from '../util.js';
import { t, enAnglais } from '../i18n.js';
import { dessinerECG } from '../ecg.js';
import { chargerECG12, dessinerECG12 } from '../ecg12.js';
import { monterTrace } from '../traces.js';
import { dessinerEGM } from '../egm.js';

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
  const total = s.questions.length;
  const montrerCorrection = rep && !s.examen;
  const c = s.competitif ? stock.classement() : null;

  app.innerHTML = `
    <div class="quiz-tete">
      <button class="quitter" id="quit" aria-label="${t('Quitter la série', 'Leave the quiz')}">✕</button>
      ${c ? `<div class="elo-tete"><span class="elo-valeur" id="elo-live">${c.elo}</span><span class="note">ELO · ${esc(c.titre.nom)}${c.partiesDuJour ? ` · ${t('aujourd\'hui', 'today')} <span class="delta ${c.duJour >= 0 ? 'plus' : 'moins'}">${c.duJour >= 0 ? '+' : ''}${c.duJour}</span>` : ''}</span></div>` : `
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${s.i + 1}"><i style="width:${pct(s.i + (rep ? 1 : 0), total)}%"></i></div>
      <span class="note">${s.i + 1}/${total}</span>`}
      ${s.examen ? '<span class="chrono" id="chrono" aria-live="off"></span>' : ''}
    </div>
    <article class="carte">
      <div class="badges">
        <span class="badge theme-${q.theme}">${theme.ico} ${theme.nom}</span>
        <span class="badge">${esc(libSousTheme(q.sousTheme))}</span>
        ${q.marque ? `<span class="badge">${esc(libMarque(q.marque))}</span>` : ''}
        <span class="badge">${TYPES[q.type]}</span>
        <span class="badge" title="${t('Difficulté', 'Difficulty')} ${q.difficulte}/10">${diffBarres(q.difficulte)} ${q.difficulte}/10</span>
      </div>
      <div class="enonce">${esc(q.question)}</div>
      ${q.ecg || q.ecg12 || q.egm || q.simu ? '<div class="trace" id="trace"></div>' : ''}
      <div id="zone"></div>
      <div id="retour"></div>
    </article>
    ${s.combo >= 3 && !s.examen ? `<p class="note centre">🔥 ${t(`${s.combo} bonnes réponses d'affilée`, `${s.combo} correct answers in a row`)}</p>` : ''}
    <p class="note centre raccourcis">${t('Clavier :', 'Keyboard:')} ${q.type === 'vf' ? t('V / F', 'T / F') : q.type === 'ouverte' ? '' : '1–' + (q.options?.length || 4) + t(' ou ', ' or ') + 'A–' + lettre((q.options?.length || 4) - 1)} · ${t('Entrée pour valider / continuer', 'Enter to submit / continue')}</p>`;

  app.querySelector('#quit').onclick = () => {
    if (s.competitif) { pauseCompetitif(aller); return; }
    if (s.reponses.some(Boolean) && !confirm(t('Terminer la série maintenant ?', 'End the quiz now?'))) return;
    terminer(); aller(s.reponses.some(Boolean) ? 'resultats' : 'accueil');
  };
  if (q.ecg || q.ecg12 || q.egm || q.simu) afficherTrace(app.querySelector('#trace'), q);
  if (s.examen) demarrerChrono(app, aller);

  const suite = () => suivant(app, aller);
  if (q.type === 'ouverte') zoneOuverte(app, q, rep, suite);
  else zoneChoix(app, q, rep, suite);
  if (montrerCorrection) afficherRetour(app, q, rep, suite);
}

export function afficherTrace(div, q) {
  if (q.simu) {
    div.innerHTML = `<p class="note">${t('Préparation du tracé…', 'Preparing the tracing…')}</p>`;
    Promise.all([import('../simu/rejeu.js'), import('../simu/trace.js')]).then(([{ rejouer }, { dessinerSimu, MONTAGES }]) => {
      if (!div.isConnected) return;
      const { coeur } = rejouer(q.simu);
      const voies = MONTAGES[q.simu.montage || 'standard'].voies;
      monterTrace(div, (c, o) => {
        const boite = c.closest('.ecg-cadre, .plein, .plein-corps') || div;
        c.style.width = `${Math.max(320, (boite.clientWidth || 700) - 4)}px`;
        const geo = dessinerSimu(c, coeur, { tFin: q.simu.fin, vitesse: q.simu.vitesse || 50, mode: 'defilement', voies, etiquettes: false, bruit: true });
        return { pxmm: geo.pxms * 40, x0: geo.marge };
      }, { titre: t('Tracé d\'exploration électrophysiologique', 'EP study tracing'), legende: `${t('Simulateur d\'EEP', 'EP study simulator')} · ${decimal(q.simu.vitesse || 50)} mm/s${q.simu.legende ? ' — ' + esc(q.simu.legende) : ''}` });
    });
    return;
  }
  if (q.egm) {
    monterTrace(div, (c, o) => dessinerEGM(c, q.egm, q.id, o), {
      titre: t('EGM de boîtier avec canal de marqueurs', 'Device EGM with marker channel'), legende: `EGM · 25 mm/s · ${t('canal de marqueurs (intervalles en ms)', 'marker channel (intervals in ms)')}${q.egm.legende ? ' — ' + esc(q.egm.legende) : ''}`,
    });
    return;
  }
  if (q.ecg) {
    monterTrace(div, (c, o) => dessinerECG(c, q.ecg, q.id, o), {
      titre: t('Tracé ECG, dérivation DII', 'ECG tracing, lead II'), legende: `${t('DII', 'Lead II')} · 25 mm/s · 10 mm/mV${q.ecg.legende ? ' — ' + esc(q.ecg.legende) : ''}`,
    });
    return;
  }
  div.innerHTML = `<p class="note">${t('Chargement de l\'ECG…', 'Loading ECG…')}</p>`;
  chargerECG12(q.ecg12.fichier).then(ecg => {
    if (!div.isConnected) return;
    monterTrace(div, (c, o) => dessinerECG12(c, ecg, o), {
      titre: t('ECG 12 dérivations', '12-lead ECG'), legende: `${t('12 dérivations', '12 leads')} · 25 mm/s · 10 mm/mV${q.ecg12.legende ? ' — ' + esc(q.ecg12.legende) : ''} · <a href="https://physionet.org/content/ptb-xl/" target="_blank" rel="noopener noreferrer">PTB-XL</a>`,
    });
  }).catch(() => { div.innerHTML = `<p class="note">${t('ECG indisponible hors ligne. Reconnectez-vous pour l\'afficher.', 'This ECG is not available offline. Reconnect to view it.')}</p>`; });
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

// Pause du flux compétitif : l'ELO est déjà enregistré après chaque réponse ; on reprendra quand on voudra.
function pauseCompetitif(aller) {
  terminer();
  const badges = etat.nouveauxBadges || []; etat.nouveauxBadges = [];
  toast(badges.length ? `${t('Pause. Nouveau badge :', 'Paused. New badge:')} ${badges.map(b => b.nom).join(', ')}` : t('Pause : votre ELO est enregistré. Reprenez quand vous voulez.', 'Paused: your ELO has been saved. Resume whenever you like.'), 3000);
  if (aller) aller('competitif'); else location.hash = 'competitif';
}

function suivant(app, aller) {
  const s = etat.session;
  if (s.competitif) {
    // flux sans fin : une nouvelle question à chaque fois, selon le classement actuel (plus dure si l'ELO monte, plus simple s'il baisse)
    const q = questionCompetitive(s.questions.map(x => x.id));
    if (!q) { pauseCompetitif(aller); return; }
    s.questions.push(q);
    if (s.questions.length > 60) { s.questions.splice(0, 20); s.reponses.splice(0, 20); s.i -= 20; } // on ne garde que l'historique récent
  } else if (s.i + 1 >= s.questions.length) { clearInterval(chrono); terminer(); aller('resultats'); return; }
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
      ${multi ? `<div class="consigne">${t('Plusieurs réponses possibles — cochez toutes les bonnes propositions.', 'More than one answer may be correct — select all that apply.')}</div>` : ''}
      <div class="options" role="${multi ? 'group' : 'radiogroup'}">
        ${q.options.map((o, i) => {
          let cl = choix.has(i) ? 'choisi' : '';
          if (corrige) cl = q.reponses.includes(i) ? 'juste' : choix.has(i) ? 'faux' : '';
          const com = corrige && q.commentaires ? `<span class="commentaire">${esc(q.commentaires[i])}</span>` : '';
          return `<button class="option ${cl}" data-i="${i}" ${rep ? 'disabled' : ''} role="${multi ? 'checkbox' : 'radio'}" aria-checked="${choix.has(i)}"><span class="lettre">${q.type === 'vf' ? (i ? 'F' : t('V', 'T')) : lettre(i)}</span><span class="texte">${esc(o)}${com}</span></button>`;
        }).join('')}
      </div>
      ${rep ? '' : `<div class="actions">${s.examen ? `<button class="btn" id="passer">${t('Passer', 'Skip')}</button>` : ''}<button class="btn btn-primaire btn-bloc" id="valider" ${choix.size ? '' : 'disabled'}>${t('Valider', 'Submit')}</button></div>`}`;
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
      const vrai = enAnglais() ? 't' : 'v'; // Vrai / True
      if (q.type === 'vf' && (k === vrai || k === 'f')) { e.preventDefault(); return basculer(k === vrai ? 0 : 1); }
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
  if (barre) barre.style.width = pct(s.i + 1, s.questions.length) + '%';
  const live = app.querySelector('#elo-live');
  if (live && rep.elo) live.textContent = rep.elo.apres;
}

function zoneOuverte(app, q, rep, suite) {
  const s = etat.session;
  const zone = app.querySelector('#zone');
  if (rep) {
    zone.innerHTML = `
      ${rep.texte ? `<div class="consigne">${t('Votre réponse :', 'Your answer:')}</div><div class="modele">${esc(rep.texte)}</div>` : ''}
      <div class="consigne">${t('Réponse attendue :', 'Model answer:')}</div><div class="modele"><b>${esc(q.reponseAttendue)}</b></div>`;
    clavier = e => { if (e.key === 'Enter' && !e.target.closest('button, a, textarea')) { e.preventDefault(); suite(); } };
    return;
  }
  zone.innerHTML = `
    <div class="consigne">${t('Rédigez votre réponse (ou réfléchissez-y), puis comparez-la à la réponse attendue.', 'Write your answer (or think it through), then compare it with the model answer.')}</div>
    <textarea id="txt" placeholder="${t('Votre réponse…', 'Your answer…')}" aria-label="${t('Votre réponse', 'Your answer')}"></textarea>
    <div class="actions"><button class="btn btn-primaire btn-bloc" id="voir">${t('Voir la réponse', 'Show answer')}</button></div>`;
  clavier = null;
  zone.querySelector('#voir').onclick = () => {
    const texte = zone.querySelector('#txt').value.trim();
    zone.innerHTML = `
      ${texte ? `<div class="consigne">${t('Votre réponse :', 'Your answer:')}</div><div class="modele">${esc(texte)}</div>` : ''}
      <div class="consigne">${t('Réponse attendue :', 'Model answer:')}</div><div class="modele"><b>${esc(q.reponseAttendue)}</b></div>
      <div class="consigne" style="margin-top:12px">${t('Évaluez-vous honnêtement :', 'Rate yourself honestly:')}</div>
      <div class="auto-eval">
        <button class="btn" data-e="0">❌ ${t('À revoir', 'Needs review')}</button>
        <button class="btn" data-e="1">〰️ ${t('En partie', 'Partly')}</button>
        <button class="btn" data-e="2">✅ ${t('Acquis', 'Got it')}</button>
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
  if (s.competitif) rep.elo = stock.jouerCompetitif(q, rep.score);
  if (rep.juste) { s.points += q.difficulte; s.combo++; s.meilleurCombo = Math.max(s.meilleurCombo, s.combo); } else s.combo = 0;
  sauver();
}

// Signalement d'une erreur : ticket GitHub prérempli, dans la langue de l'interface (version anglaise signalée comme telle).
export function lienSignalement(q, rep) {
  const sep = t(' ; ', '; ');
  const votre = rep?.texte || (rep?.choix ? rep.choix.map(i => q.options[i]).join(sep) : rep && q.type === 'ouverte' ? t('(auto-évaluation)', '(self-assessed)') : '—');
  const attendue = q.type === 'ouverte' ? q.reponseAttendue : q.reponses.map(i => q.options[i]).join(sep);
  const corps = t(
    `**Question** : ${q.id} (${q.sousTheme}, difficulté ${q.difficulte})\n\n> ${q.question}\n\n**Réponse de la base** : ${attendue}\n\n**Ma réponse** : ${votre}\n\n**Problème constaté** (erreur, formulation, source, recommandation obsolète…) :\n\n\n**Source à l'appui** (facultatif) :\n`,
    `**Question**: ${q.id} (${libSousTheme(q.sousTheme)}, difficulty ${q.difficulte}) — English version\n\n> ${q.question}\n\n**Answer in the question bank**: ${attendue}\n\n**My answer**: ${votre}\n\n**Problem found** (error, wording, translation, source, outdated guideline…):\n\n\n**Supporting source** (optional):\n`);
  const titre = t(`[${q.id}] Signalement`, `[${q.id}] Error report (EN)`);
  return `https://github.com/${DEPOT}/issues/new?labels=${encodeURIComponent('contenu')}&title=${encodeURIComponent(titre)}&body=${encodeURIComponent(corps)}`;
}

export function blocCorrection(q, rep) {
  const bonnes = q.type !== 'ouverte' && (!rep || !rep.juste)
    ? `<p><b>${q.reponses.length > 1 ? t('Réponses attendues :', 'Correct answers:') : t('Réponse attendue :', 'Correct answer:')}</b> ${q.reponses.map(i => (q.type === 'vf' ? '' : lettre(i) + ' — ') + esc(q.options[i])).join(t(' ; ', '; '))}</p>` : '';
  return `
    ${bonnes}
    <div class="explication">${paragraphes(q.explication)}</div>
    ${q.aRetenir ? `<div class="retenir"><b>${t('À retenir :', 'Key point:')}</b> ${esc(q.aRetenir)}</div>` : ''}
    ${q.sources?.length ? `<div class="sources"><b>Sources</b><ul>${q.sources.map(src => `<li>${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.titre)}</a>` : esc(src.titre)}</li>`).join('')}</ul></div>` : ''}
    <div class="pied-question">
      <span class="note">${q.revise ? t(`Relue en ${moisAnnee(q.revise)}`, `Reviewed ${moisAnnee(q.revise)}`) : ''}${q.reco?.length ? ` · ${t('Réf. :', 'Ref.:')} ${q.reco.map(r => esc(libReco(r))).join(', ')}` : ''}</span>
      <a class="signaler" href="${lienSignalement(q, rep)}" target="_blank" rel="noopener noreferrer">⚑ ${t('Signaler une erreur', 'Report an error')}</a>
    </div>`;
}

function afficherRetour(app, q, rep, suite) {
  const s = etat.session;
  const r = app.querySelector('#retour');
  const partiel = q.type === 'ouverte' && rep.eval === 1;
  const cl = rep.juste ? 'ok' : partiel ? 'neutre' : 'ko';
  const gain = rep.elo ? ` <span class="delta ${rep.elo.delta >= 0 ? 'plus' : 'moins'}">${rep.elo.delta >= 0 ? '+' : ''}${rep.elo.delta} ELO</span>`
    : ` <span class="note">+${q.difficulte} pts</span>`;
  const verdict = rep.juste ? `${t('Bonne réponse !', 'Correct!')}${rep.juste || rep.elo ? gain : ''}`
    : (partiel ? t('Réponse partielle', 'Partly correct') : q.type === 'ouverte' ? t('À revoir', 'Needs review') : t('Pas tout à fait…', 'Not quite…')) + (rep.elo ? gain : '');
  const dernier = !s.competitif && s.i + 1 >= s.questions.length;
  r.innerHTML = `
    <div class="retour ${cl}" aria-live="polite">
      <div class="verdict">${verdict}</div>
      ${blocCorrection(q, rep)}
    </div>
    <div class="actions">${s.competitif ? `<button class="btn" id="arreter">${t('Pause', 'Pause')}</button>` : ''}<button class="btn btn-primaire btn-bloc" id="suivant">${dernier ? t('Voir mes résultats', 'See my results') : t('Question suivante →', 'Next question →')}</button></div>`;
  const arr = r.querySelector('#arreter');
  if (arr) arr.onclick = () => pauseCompetitif();
  const b = r.querySelector('#suivant');
  b.onclick = suite;
  b.focus({ preventScroll: true });
  r.querySelector('.retour').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (q.type !== 'ouverte') {
    clavier = e => { if (e.key === 'Enter' && !e.target.closest('a')) { e.preventDefault(); suite(); } };
  }
}

export function arreterQuiz() { clearInterval(chrono); clavier = null; }
