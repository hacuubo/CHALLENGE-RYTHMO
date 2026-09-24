// Régénère data/questions/index.json (liste des fichiers, total, version) et la version du cache
// hors ligne dans sw.js : node scripts/build-index.mjs
// Le résultat est déterministe : la date de version ne change que si le contenu (code ou questions) change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(racine, 'data', 'questions');
const fichiers = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const total = fichiers.reduce((n, f) => n + JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).length, 0);

const code = ['index.html', 'css/styles.css',
  ...fs.readdirSync(path.join(racine, 'js')).filter(f => f.endsWith('.js')).sort().map(f => 'js/' + f),
  ...fs.readdirSync(path.join(racine, 'js', 'vues')).sort().map(f => 'js/vues/' + f)];
const h = crypto.createHash('sha1');
for (const f of [...code, ...fichiers.map(f => 'data/questions/' + f)]) h.update(f).update(fs.readFileSync(path.join(racine, f)));
const empreinte = h.digest('hex').slice(0, 10);

const cheminIndex = path.join(dir, 'index.json');
const ancien = fs.existsSync(cheminIndex) ? JSON.parse(fs.readFileSync(cheminIndex, 'utf8')) : {};
const jour = new Date().toISOString().slice(0, 10);
const date = ancien.empreinte === empreinte && ancien.date ? ancien.date : jour;
const index = { version: date.replace(/-/g, '.'), date, empreinte, total, fichiers };
fs.writeFileSync(cheminIndex, JSON.stringify(index, null, 2) + '\n');

// La version du cache suit l'empreinte : un nouveau déploiement invalide proprement l'ancien cache.
const sw = path.join(racine, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'rythmo-${empreinte}';`));
console.log(`index.json : ${fichiers.length} fichiers, ${total} questions, empreinte ${empreinte}`);
