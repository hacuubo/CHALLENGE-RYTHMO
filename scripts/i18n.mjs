// Version anglaise de la base de questions.
// La base française (data/questions/*.json) reste la référence de structure ; la version anglaise est une
// SURCOUCHE de textes (data/questions/en/<même nom>.json) : { "<id>": { question, options, commentaires,
// reponseAttendue, explication, aRetenir, legende } }. Réponses, difficulté, tracés et sources ne sont jamais
// dupliqués et ne peuvent donc pas diverger. Sous-thèmes et recommandations : data/questions/en/libelles.json.
//
//   node scripts/i18n.mjs extraire <fichier.json> [sortie]   textes français à traduire (même format que la surcouche)
//   node scripts/i18n.mjs assembler <fichier.json>           réunit en/<nom>.partN.json dans en/<nom>.json
//   node scripts/i18n.mjs verifier [fichier.json…]           contrôle complétude et forme (--partiel : fichiers absents tolérés)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirFr = path.join(racine, 'data', 'questions');
const dirEn = path.join(dirFr, 'en');
export const CHAMPS = ['question', 'options', 'commentaires', 'reponseAttendue', 'explication', 'aRetenir'];
export const TRACES = ['ecg', 'egm', 'simu'];

const nom = f => path.basename(f).replace(/\.json$/, '') + '.json';
const lireJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
export const fichiersFr = () => fs.readdirSync(dirFr).filter(f => f.endsWith('.json') && f !== 'index.json').sort();

// Textes traduisibles d'une question, au format de la surcouche.
export function textes(q) {
  const o = {};
  for (const c of CHAMPS) if (q[c] != null) o[c] = q[c];
  for (const k of TRACES) if (q[k]?.legende) o.legende = q[k].legende;
  return o;
}

// Applique une surcouche anglaise à une question (utilisé aussi par l'application).
export function appliquer(q, s) {
  if (!s) return q;
  const r = { ...q };
  for (const c of CHAMPS) if (s[c] != null) r[c] = s[c];
  if (s.legende) for (const k of TRACES) if (q[k]?.legende) r[k] = { ...q[k], legende: s.legende };
  return r;
}

function extraire(f, sortie) {
  const qs = lireJson(path.join(dirFr, nom(f)));
  const o = Object.fromEntries(qs.map(q => [q.id, textes(q)]));
  const txt = JSON.stringify(o, null, 1) + '\n';
  if (sortie) { fs.writeFileSync(sortie, txt); console.log(`${qs.length} questions → ${sortie}`); } else process.stdout.write(txt);
}

function assembler(f) {
  const base = nom(f).replace(/\.json$/, '');
  const parts = fs.readdirSync(dirEn).filter(x => x.startsWith(base + '.part') && x.endsWith('.json'))
    .sort((a, b) => parseInt(a.slice(base.length + 5)) - parseInt(b.slice(base.length + 5)));
  if (!parts.length) { console.error('aucune partie trouvée pour ' + base); process.exit(1); }
  const cible = path.join(dirEn, base + '.json');
  const o = fs.existsSync(cible) ? lireJson(cible) : {};
  for (const p of parts) Object.assign(o, lireJson(path.join(dirEn, p)));
  // ordre de la base française
  const ordre = lireJson(path.join(dirFr, base + '.json')).map(q => q.id);
  const trie = Object.fromEntries(ordre.filter(id => o[id]).map(id => [id, o[id]]));
  fs.writeFileSync(cible, JSON.stringify(trie, null, 1) + '\n');
  for (const p of parts) fs.unlinkSync(path.join(dirEn, p));
  console.log(`${parts.length} partie(s) → ${path.relative(racine, cible)} (${Object.keys(trie).length}/${ordre.length} questions)`);
}

// Indices de texte resté en français (avertissements seulement).
const FRANCAIS = /\b(les|des|une|du|est|sont|avec|pour|dans|sur|pas|qui|que|mais|donc|ou bien|lorsque|après|très|être|cette|ces|aux|leur)\b/gi;
function indicesFrancais(s) {
  const m = String(s).match(FRANCAIS) || [];
  return m.length >= 3 || /[àâçèêëîïôûœ]/i.test(String(s).replace(/\b(Holter|Coumel|Mahaim|Brugada|Wenckebach|Mobitz|Bachmann|Kent|Josephson|Lenègre|Lev|Twiddler|Chagas|Ebstein|Haïssaguerre|Jaïs)\b/g, ''));
}

function verifier(liste, partiel) {
  let erreurs = 0, avert = 0, total = 0, faites = 0;
  const err = (f, id, m) => { erreurs++; console.error(`✗ en/${f} [${id}] ${m}`); };
  const warn = (f, id, m) => { avert++; if (avert <= 60) console.warn(`⚠ en/${f} [${id}] ${m}`); };
  const lib = fs.existsSync(path.join(dirEn, 'libelles.json')) ? lireJson(path.join(dirEn, 'libelles.json')) : null;
  if (!lib) { erreurs++; console.error('✗ en/libelles.json manquant'); }
  for (const f of liste) {
    const qs = lireJson(path.join(dirFr, f));
    total += qs.length;
    for (const q of qs) {
      if (lib && !lib.sousThemes?.[q.sousTheme]) err('libelles.json', q.id, `sous-thème non traduit : ${q.sousTheme}`);
      for (const r of q.reco || []) if (lib && !lib.reco?.[r]) err('libelles.json', q.id, `recommandation non traduite : ${r}`);
    }
    const p = path.join(dirEn, f);
    if (!fs.existsSync(p)) { if (!partiel) err(f, '-', 'fichier manquant'); continue; }
    let o; try { o = lireJson(p); } catch (e) { err(f, '-', 'JSON invalide : ' + e.message); continue; }
    const ids = new Set(qs.map(q => q.id));
    for (const id of Object.keys(o)) if (!ids.has(id)) err(f, id, 'id absent de la base française');
    for (const q of qs) {
      const s = o[q.id], ref = textes(q);
      if (!s) { err(f, q.id, 'question non traduite'); continue; }
      faites++;
      for (const c of Object.keys(ref)) {
        if (s[c] == null) { err(f, q.id, `champ manquant : ${c}`); continue; }
        if (Array.isArray(ref[c])) {
          if (!Array.isArray(s[c]) || s[c].length !== ref[c].length) { err(f, q.id, `${c} : ${ref[c].length} éléments attendus`); continue; }
          s[c].forEach((x, i) => { if (typeof x !== 'string' || !x.trim()) err(f, q.id, `${c}[${i}] vide`); });
        } else if (typeof s[c] !== 'string' || !s[c].trim()) err(f, q.id, `${c} vide`);
      }
      for (const c of Object.keys(s)) if (!(c in ref)) err(f, q.id, `champ inattendu : ${c}`);
      const tout = Object.values(s).flat().join(' \n ');
      if (indicesFrancais(tout)) warn(f, q.id, 'texte possiblement resté en français');
      if (/\d,\d/.test(tout.replace(/\d,\d{3}\b/g, ''))) warn(f, q.id, 'virgule décimale (utiliser le point en anglais)');
      if (q.type === 'vf' && !/^(true|false)$/i.test(s.options[0]) && !/^(true|false)$/i.test(s.options[1])) warn(f, q.id, 'vrai/faux : options attendues « True » / « False »');
    }
  }
  if (avert > 60) console.warn(`… ${avert - 60} autres avertissements`);
  console.log(`${faites}/${total} questions traduites, ${erreurs} erreur(s), ${avert} avertissement(s).`);
  return erreurs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'extraire') extraire(args[0], args[1]);
  else if (cmd === 'assembler') assembler(args[0]);
  else if (cmd === 'verifier') {
    const partiel = args.includes('--partiel');
    const liste = args.filter(a => !a.startsWith('--')).map(nom);
    process.exit(verifier(liste.length ? liste : fichiersFr(), partiel) ? 1 : 0);
  } else { console.error('usage : extraire | assembler | verifier'); process.exit(2); }
}
