// Validation de la base de questions : node scripts/validate.mjs [fichiers...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THEMES = ['ecg', 'programmation', 'telecardio', 'electrophysio'];
const TYPES = ['qcu', 'qcm', 'vf', 'ouverte'];
const MARQUES = [null, 'Medtronic', 'Abbott', 'Boston Scientific', 'Biotronik', 'MicroPort'];
const PRESETS = ['sinus', 'bav1', 'bav2-m1', 'bav2-m2', 'bav2-21', 'bav3', 'pause-sinusale', 'esa', 'esv', 'fa',
  'flutter', 'tsv', 'wpw', 'tv', 'torsades', 'fv', 'aai', 'vvi', 'ddd', 'vdd', 'crt', 'perte-capture-v',
  'perte-capture-a', 'sous-detection', 'sur-detection', 'ttre', 'fusion', 'asystolie'];

// presets EGM lus dans js/egm.js (source unique)
const PRESETS_EGM = [...fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'egm.js'), 'utf8')
  .matchAll(/^  '?([a-z0-9-]+)'?\(S/gm)].map(m => m[1]);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'questions');
let files = process.argv.slice(2);
if (!files.length) {
  files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => path.join(dir, f));
}

const ids = new Set();
const enonces = new Map();
let errors = 0, total = 0;
const err = (f, id, msg) => { errors++; console.error(`✗ ${path.basename(f)} [${id}] ${msg}`); };

for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, '-', 'JSON invalide : ' + e.message); continue; }
  if (!Array.isArray(data)) { err(f, '-', 'le fichier doit contenir un tableau'); continue; }
  for (const q of data) {
    total++;
    const id = q.id || '?';
    if (!q.id) err(f, id, 'id manquant');
    if (ids.has(q.id)) err(f, id, 'id en double');
    ids.add(q.id);
    if (!THEMES.includes(q.theme)) err(f, id, 'theme invalide : ' + q.theme);
    if (!TYPES.includes(q.type)) err(f, id, 'type invalide : ' + q.type);
    if (!q.sousTheme) err(f, id, 'sousTheme manquant');
    if (q.marque !== undefined && !MARQUES.includes(q.marque)) err(f, id, 'marque invalide : ' + q.marque);
    if (!Number.isInteger(q.difficulte) || q.difficulte < 1 || q.difficulte > 10) err(f, id, 'difficulte invalide');
    if (!q.question || q.question.length < 10) err(f, id, 'question vide');
    if (!q.explication || q.explication.length < 40) err(f, id, 'explication trop courte');
    if (!q.aRetenir) err(f, id, 'aRetenir manquant');
    if (!Array.isArray(q.sources) || !q.sources.length) err(f, id, 'source manquante');
    else for (const s of q.sources) {
      if (!s.titre) err(f, id, 'source sans titre');
      if (s.url && !/^https:\/\//.test(s.url)) err(f, id, 'url non https : ' + s.url);
    }
    if (q.type === 'ouverte') {
      if (!q.reponseAttendue) err(f, id, 'reponseAttendue manquante');
    } else {
      if (!Array.isArray(q.options) || q.options.length < 2) err(f, id, 'options manquantes');
      if (!Array.isArray(q.reponses) || !q.reponses.length) err(f, id, 'reponses manquantes');
      else if (q.reponses.some(r => !Number.isInteger(r) || r < 0 || r >= q.options.length)) err(f, id, 'indice de réponse hors limites');
      if (q.type === 'qcu' && q.reponses?.length !== 1) err(f, id, 'qcu doit avoir exactement 1 réponse');
      if (q.type === 'vf' && JSON.stringify(q.options) !== '["Vrai","Faux"]') err(f, id, 'vf : options doivent être ["Vrai","Faux"]');
      if (q.type === 'vf' && q.reponses?.length !== 1) err(f, id, 'vf : 1 réponse');
    }
    if (q.ecg && !PRESETS.includes(q.ecg.preset)) err(f, id, 'preset ECG inconnu : ' + q.ecg.preset);
    if (q.egm && !PRESETS_EGM.includes(q.egm.preset)) err(f, id, 'preset EGM inconnu : ' + q.egm.preset);
    if ([q.ecg, q.ecg12, q.egm].filter(Boolean).length > 1) err(f, id, 'un seul tracé par question');
    if (q.ecg12) {
      const fe = path.join(dir, '..', 'ecg', `${q.ecg12.fichier}.json`);
      if (!fs.existsSync(fe)) err(f, id, 'fichier ECG 12 dérivations introuvable : ' + q.ecg12.fichier);
    }
    if (q.commentaires !== undefined) {
      if (!Array.isArray(q.commentaires) || q.commentaires.length !== (q.options || []).length || q.commentaires.some(c => !c || typeof c !== 'string'))
        err(f, id, 'commentaires : un commentaire non vide par option');
    }
    if (q.type === 'qcm' && q.reponses?.length === q.options?.length) err(f, id, 'qcm : toutes les options ne peuvent pas être justes');
    if (q.revise !== undefined && !/^\d{4}-\d{2}$/.test(q.revise)) err(f, id, 'revise doit être au format AAAA-MM');
    const cle = (q.question || '').toLowerCase().replace(/[^a-z0-9àâçéèêëîïôûùüÿœ]+/g, ' ').trim();
    if (enonces.has(cle)) err(f, id, 'énoncé identique à ' + enonces.get(cle));
    enonces.set(cle, id);
  }
}
console.log(`${total} questions vérifiées, ${errors} erreur(s).`);
process.exit(errors ? 1 : 0);
