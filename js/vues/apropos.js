import { TYPES, base } from '../donnees.js';
import { esc } from '../util.js';
import { DEPOT } from './quiz.js';

export function vueAPropos(app) {
  const m = new Map();
  for (const q of base.questions) for (const s of q.sources || []) {
    const k = s.titre.trim(); const e = m.get(k) || { ...s, n: 0 }; e.n++; if (!e.url && s.url) e.url = s.url; m.set(k, e);
  }
  const src = [...m.values()].sort((a, b) => b.n - a.n);
  const parType = Object.keys(TYPES).map(t => `${TYPES[t]} : ${base.questions.filter(q => q.type === t).length}`).join(' · ');
  const reco = {};
  for (const q of base.questions) for (const r of q.reco || []) reco[r] = (reco[r] || 0) + 1;
  const nbReels = base.questions.filter(q => q.ecg12).length;

  app.innerHTML = `
    <h1>Sources et informations</h1>
    <section class="carte">
      <p class="avert"><b>Outil pédagogique.</b> Les questions visent l'apprentissage et l'entretien des connaissances ; elles ne remplacent ni les recommandations officielles, ni les manuels des fabricants, ni le jugement clinique. Les valeurs de programmation peuvent varier selon les modèles et versions logicielles : vérifiez toujours la documentation de l'appareil.</p>
      <p>Base de questions : <b>${base.questions.length}</b> questions — version ${esc(base.version)}${base.date ? ` du ${new Date(base.date).toLocaleDateString('fr-FR')}` : ''}.<br><span class="note">${parType}</span></p>
      <p class="note">Les questions s'appuient uniquement sur des sources scientifiquement validées (recommandations ESC/EHRA/HRS/ACC/AHA, HAS, articles indexés, manuels techniques officiels) et ont été relues par un rythmologue pour un français clair et naturel. Chaque question indique sa date de relecture.</p>
      <p class="note">Une erreur, une formulation ambiguë, une recommandation dépassée ? Utilisez le lien « ⚑ Signaler une erreur » sous chaque correction, ou <a href="https://github.com/${DEPOT}/issues" target="_blank" rel="noopener noreferrer">consultez les signalements</a>.</p>
    </section>
    <section class="carte"><h2>Tracés ECG</h2>
      <p class="note">Les bandes de rythme (dérivation DII) sont synthétiques, générées par l'application pour illustrer rythmes et dysfonctions de stimulation. ${nbReels ? `Les ${nbReels} ECG 12 dérivations sont de vrais enregistrements issus de <a href="https://physionet.org/content/ptb-xl/" target="_blank" rel="noopener noreferrer">PTB-XL</a> (PhysioNet, licence CC BY 4.0) : Wagner P, Strodthoff N, Bousseljot RD et al. PTB-XL, a large publicly available electrocardiography dataset. Sci Data 2020;7:154 (<a href="https://doi.org/10.1038/s41597-020-0495-6" target="_blank" rel="noopener noreferrer">doi</a>) ; Goldberger AL et al. PhysioBank, PhysioToolkit, and PhysioNet. Circulation 2000;101:e215-e220. Tracés rééchantillonnés à 250 Hz, ligne de base corrigée.` : ''}</p>
    </section>
    <section class="carte"><h2>Simulateur d'électrophysiologie</h2>
      <p class="note">Modèle pédagogique original : le cœur est représenté par un réseau d'une trentaine de sites (oreillettes, anneau tricuspide, His et branches, sinus coronaire, ventricules) reliés par des voies de conduction avec délais décrémentiels (Wenckebach), périodes réfractaires dépendantes du cycle, freinage sinusal et effets de l'isoprénaline ; les réentrées et les réponses aux manœuvres émergent du modèle. Les questions « tracé d'EEP » sont rejouées par ce moteur. Le concept s'inspire du simulateur <a href="https://svtsim.com/" target="_blank" rel="noopener noreferrer">svtsim</a> (S. Iravanian, licence CC BY-NC 4.0), sans reprise de son code. Critères diagnostiques : Michaud GF et al., JACC 2001;38:1163-7 ; Knight BP et al., JACC 1999;33:775-81 ; Hirao K et al., Circulation 1996;94:1027-35 ; Josephson ME, <i>Clinical Cardiac Electrophysiology</i>.</p>
    </section>
    ${Object.keys(reco).length ? `<section class="carte"><h2>Questions par recommandation de référence</h2>
      <p class="note">Quand une recommandation est mise à jour, ces questions sont relues en priorité.</p>
      <ul class="sources-liste">${Object.entries(reco).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<li>${esc(r)} <span class="note">(${n})</span></li>`).join('')}</ul></section>` : ''}
    <section class="carte"><h2>Références citées (${src.length})</h2>
      <ol class="sources-liste">${src.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.titre)}</a>` : esc(s.titre)} <span class="note">(${s.n})</span></li>`).join('')}</ol>
    </section>`;
}
