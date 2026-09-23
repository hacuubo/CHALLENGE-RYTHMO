// Mesure les biais docimologiques de la base : node scripts/audit-biais.mjs [fichiers...]
// - QCU : part des questions où la bonne réponse est la plus longue, rapport de longueur,
//   position de la bonne réponse ;
// - QCM : répartition du nombre de bonnes réponses ;
// - Vrai/Faux : équilibre.
// Seuils visés : bonne réponse la plus longue ≤ 35 % des QCU, rapport médian ≤ 1,3,
// QCM avec (n-1) bonnes réponses ≤ 35 %, Vrai entre 40 et 60 %.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'questions');
let files = process.argv.slice(2);
if (!files.length) files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => path.join(dir, f));
const strict = process.env.STRICT === '1';
let echec = false;

const mediane = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

function mesurer(qs) {
  const qcu = qs.filter(q => q.type === 'qcu');
  let plusLongue = 0; const rapports = [];
  for (const q of qcu) {
    const L = q.options.map(o => o.length), b = q.reponses[0];
    const autres = L.filter((_, i) => i !== b);
    if (L[b] === Math.max(...L) && L.filter(x => x === L[b]).length === 1) plusLongue++;
    rapports.push(L[b] / (autres.reduce((s, x) => s + x, 0) / autres.length));
  }
  const qcm = qs.filter(q => q.type === 'qcm');
  const presqueTout = qcm.filter(q => q.reponses.length === q.options.length - 1).length;
  const vf = qs.filter(q => q.type === 'vf');
  const vrai = vf.filter(q => q.reponses[0] === 0).length;
  return {
    qcu: qcu.length, plusLonguePct: qcu.length ? Math.round(100 * plusLongue / qcu.length) : 0,
    rapportMedian: +mediane(rapports).toFixed(2),
    qcm: qcm.length, presqueToutPct: qcm.length ? Math.round(100 * presqueTout / qcm.length) : 0,
    vf: vf.length, vraiPct: vf.length ? Math.round(100 * vrai / vf.length) : 50,
  };
}

const tout = [];
for (const f of files) {
  const qs = JSON.parse(fs.readFileSync(f, 'utf8'));
  tout.push(...qs);
  const m = mesurer(qs);
  const ok = m.plusLonguePct <= 35 && m.rapportMedian <= 1.3 && m.presqueToutPct <= 35 && (m.vf < 4 || (m.vraiPct >= 35 && m.vraiPct <= 65));
  if (!ok) echec = true;
  console.log(`${ok ? '✓' : '✗'} ${path.basename(f)} — QCU ${m.qcu} : bonne = plus longue ${m.plusLonguePct} %, rapport ${m.rapportMedian} · QCM ${m.qcm} : n-1 justes ${m.presqueToutPct} % · VF ${m.vf} : vrai ${m.vraiPct} %`);
}
if (files.length > 1) console.log('Base entière :', mesurer(tout));
process.exit(strict && echec ? 1 : 0);
