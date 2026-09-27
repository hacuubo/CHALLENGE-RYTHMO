// Ajout des rappels de cours (champ « rappel ») aux questions existantes, en français et en anglais.
//   node scripts/rappels.mjs manquants <fichier.json>            ids sans rappel (français)
//   node scripts/rappels.mjs appliquer <fichier.json> <lot.json>  lot = { "<id>": { "fr": "…", "en": "…" } }
// Le rappel est placé juste après « aRetenir » dans la question française et dans la surcouche anglaise.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirFr = path.join(racine, 'data', 'questions'), dirEn = path.join(dirFr, 'en');
const nom = f => path.basename(f).replace(/\.json$/, '') + '.json';
const lire = p => JSON.parse(fs.readFileSync(p, 'utf8'));
// insère la clé « rappel » après « aRetenir » (ou en fin d'objet) en gardant l'ordre des autres clés
const inserer = (o, texte) => {
  const r = {};
  for (const [k, v] of Object.entries(o)) { if (k === 'rappel') continue; r[k] = v; if (k === 'aRetenir') r.rappel = texte; }
  if (!('rappel' in r)) r.rappel = texte;
  return r;
};

const [cmd, f, lot] = process.argv.slice(2);
const pFr = path.join(dirFr, nom(f || '')), pEn = path.join(dirEn, nom(f || ''));
if (cmd === 'manquants') {
  console.log(lire(pFr).filter(q => !q.rappel).map(q => q.id).join('\n'));
} else if (cmd === 'appliquer') {
  const L = lire(lot), fr = lire(pFr), en = lire(pEn);
  let n = 0;
  const erreurs = [];
  const qs = fr.map(q => {
    const x = L[q.id]; if (!x) return q;
    if (typeof x.fr !== 'string' || x.fr.length < 40 || typeof x.en !== 'string' || x.en.length < 40) { erreurs.push(q.id); return q; }
    if (!en[q.id]) { erreurs.push(q.id + ' (absent de la surcouche anglaise)'); return q; }
    en[q.id] = inserer(en[q.id], x.en.trim()); n++;
    return inserer(q, x.fr.trim());
  });
  for (const id of Object.keys(L)) if (!fr.some(q => q.id === id)) erreurs.push(id + ' (id inconnu)');
  if (erreurs.length) { console.error('✗ rappels refusés : ' + erreurs.join(', ')); process.exit(1); }
  fs.writeFileSync(pFr, JSON.stringify(qs, null, 2) + '\n');
  fs.writeFileSync(pEn, JSON.stringify(en, null, 1) + '\n');
  console.log(`${n} rappel(s) appliqué(s) à ${nom(f)} ; restent ${qs.filter(q => !q.rappel).length} question(s) sans rappel.`);
} else { console.error('usage : manquants <fichier> | appliquer <fichier> <lot.json>'); process.exit(2); }
