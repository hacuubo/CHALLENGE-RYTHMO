// Régénère data/questions/index.json (liste des fichiers + version) : node scripts/build-index.mjs
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'questions');
const fichiers = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const total = fichiers.reduce((n, f) => n + JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).length, 0);
const d = new Date();
const index = { version: d.toISOString().slice(0, 10).replace(/-/g, '.'), date: d.toISOString().slice(0, 10), total, fichiers };
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`index.json : ${fichiers.length} fichiers, ${total} questions`);
