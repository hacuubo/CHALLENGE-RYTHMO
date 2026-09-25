// Référencement (SEO) et lisibilité par les moteurs génératifs (GEO) : fichiers statiques générés depuis la base.
//   - index.html : met à jour le nombre de questions dans le contenu statique (lisible sans JavaScript) ;
//   - presentation.html : page de présentation complète, citable (thèmes, méthode, recommandations, sources, FAQ) ;
//   - sitemap.xml et llms.txt.
// Appelé par scripts/build-index.mjs ; ne rien modifier à la main dans les fichiers générés.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES } from '../js/donnees.js';
import { SCENARIOS } from '../js/simu/scenarios.js';

export const SITE = 'https://hacuubo.github.io/CHALLENGE-RYTHMO/';
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirQ = path.join(racine, 'data', 'questions');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nombre = n => n.toLocaleString('fr-FR').replace(/ /g, ' ');

function lireQuestions() {
  const fichiers = fs.readdirSync(dirQ).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
  return fichiers.flatMap(f => JSON.parse(fs.readFileSync(path.join(dirQ, f), 'utf8')));
}

// Nombre de questions dans le contenu statique de index.html (avant le calcul de l'empreinte du cache).
export function patcherIndex(total) {
  const p = path.join(racine, 'index.html');
  const avant = fs.readFileSync(p, 'utf8');
  const apres = avant.replace(/<!--total-->[^<]*<!--\/total-->/g, `<!--total-->${nombre(total)}<!--/total-->`);
  if (apres !== avant) fs.writeFileSync(p, apres);
}

const FAQ = (n, nbScenarios) => [
  ['Qu\'est-ce que Challenge Rythmo ?',
    `Challenge Rythmo est une application web gratuite, en français, pour apprendre et entretenir ses connaissances en rythmologie : lecture d'ECG, programmation et suivi des stimulateurs cardiaques (pacemakers) et défibrillateurs implantables (DAI), resynchronisation (CRT), télésurveillance des prothèses et électrophysiologie. Elle propose ${nombre(n)} questions corrigées et un simulateur d'électrophysiologie.`],
  ['À qui s\'adresse l\'application ?',
    'Aux professionnels et étudiants de la rythmologie : cardiologues et internes de cardiologie, infirmiers et techniciens de rythmologie ou de télésurveillance, et plus largement à toute personne qui suit des porteurs de stimulateur ou de défibrillateur.'],
  ['Faut-il créer un compte ?',
    'Non. L\'application est en lecture seule : aucun compte, aucune inscription, aucune donnée transmise. La progression et le classement ELO sont enregistrés uniquement dans le navigateur de l\'utilisateur.'],
  ['Sur quelles sources s\'appuient les questions ?',
    'Uniquement sur des sources scientifiquement validées : recommandations ESC, EHRA, HRS, ACC/AHA, documents de consensus, articles indexés (avec DOI) et manuels techniques officiels des fabricants. Chaque correction cite ses sources et indique sa date de relecture.'],
  ['Comment fonctionne le mode compétitif ?',
    'Le mode compétitif est un flux continu de questions adaptatif : chaque joueur démarre à 600 points ELO ; une bonne réponse fait monter l\'ELO et appelle des questions plus difficiles, une erreur le fait baisser et appelle des questions plus simples. On peut faire une pause à tout moment.'],
  ['Que permet le simulateur d\'électrophysiologie ?',
    `Il reproduit une baie d'étude électrophysiologique (EEP) en temps réel : dérivations de surface, électrogrammes endocavitaires (HRA, His, sinus coronaire, VD), vitesses de défilement en mm/s, stimulation programmée (extrastimuli, rampes), manœuvres diagnostiques des tachycardies supraventriculaires, adénosine, isoprénaline et ablation. ${nbScenarios} scénarios sont disponibles (TRIN, voies accessoires, flutter, tachycardies atriales et ventriculaires…) ainsi que des cas mystères notés.`],
  ['L\'application fonctionne-t-elle hors ligne ?',
    'Oui. C\'est une application web progressive (PWA) : elle s\'installe sur l\'écran d\'accueil d\'un téléphone ou d\'un ordinateur et reste utilisable sans connexion une fois chargée.'],
  ['Challenge Rythmo remplace-t-il les recommandations ou le manuel de l\'appareil ?',
    'Non. C\'est un outil pédagogique : il ne remplace ni les recommandations officielles, ni les manuels des fabricants, ni le jugement clinique. Les valeurs de programmation peuvent varier selon les modèles et les versions logicielles.'],
];

export function generer() {
  const qs = lireQuestions();
  const idx = JSON.parse(fs.readFileSync(path.join(dirQ, 'index.json'), 'utf8'));
  const n = qs.length;
  const nbScenarios = Object.keys(SCENARIOS).length;
  const nbReels = qs.filter(q => q.ecg12).length;

  // thèmes et sous-thèmes, dans l'ordre de l'application
  const themes = Object.entries(THEMES).map(([id, t]) => {
    const du = qs.filter(q => q.theme === id);
    const sous = new Map();
    for (const q of du) sous.set(q.sousTheme, (sous.get(q.sousTheme) || 0) + 1);
    return { id, nom: t.nom, desc: t.desc, n: du.length, sous: [...sous].sort((a, b) => b[1] - a[1]) };
  });
  const reco = {};
  for (const q of qs) for (const r of q.reco || []) reco[r] = (reco[r] || 0) + 1;
  const recos = Object.entries(reco).sort((a, b) => b[1] - a[1]);
  const m = new Map();
  for (const q of qs) for (const s of q.sources || []) {
    const e = m.get(s.url || s.titre) || { ...s, n: 0 }; e.n++; m.set(s.url || s.titre, e);
  }
  const sources = [...m.values()].sort((a, b) => b.n - a.n || a.titre.localeCompare(b.titre)).slice(0, 40);
  const faq = FAQ(n, nbScenarios);
  const scenarios = Object.values(SCENARIOS).map(s => s.nom);

  const description = `Challenge Rythmo : ${nombre(n)} questions de rythmologie corrigées (ECG, pacemaker, DAI, CRT, télécardio, EEP), simulateur d'électrophysiologie, sources ESC/EHRA/HRS.`;
  const url = SITE + 'presentation.html';
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: 'Présentation de Challenge Rythmo', description, inLanguage: 'fr',
        dateModified: idx.date, isPartOf: { '@id': SITE + '#site' }, about: { '@id': SITE + '#app' },
        breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Challenge Rythmo', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Présentation', item: url }] } },
      { '@type': 'FAQPage', '@id': url + '#faq', inLanguage: 'fr',
        mainEntity: faq.map(([q, r]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: r } })) },
    ],
  };

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Présentation de Challenge Rythmo, quiz de rythmologie</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#0b3a5d">
  <link rel="icon" href="icons/icon.svg" type="image/svg+xml">
  <link rel="alternate" type="text/markdown" title="Résumé pour les assistants IA" href="llms.txt">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:site_name" content="Challenge Rythmo">
  <meta property="og:title" content="Challenge Rythmo : quiz de rythmologie et simulateur d'électrophysiologie">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}icons/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Challenge Rythmo, quiz de rythmologie">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
  <style>
    :root { --fond: #f6f8fb; --carte: #fff; --texte: #14202b; --texte-2: #4a5a6a; --lien: #0b5fa5; --bord: #dfe6ee; --bleu: #0b3a5d; }
    @media (prefers-color-scheme: dark) { :root { --fond: #0b1621; --carte: #122232; --texte: #e8eef4; --texte-2: #a9b8c6; --lien: #7cc0ff; --bord: #22384d; } }
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--fond); color: var(--texte); }
    header { background: linear-gradient(160deg, #0b3a5d, #1a6fae); color: #fff; padding: 40px 16px 32px; }
    header .l, main { max-width: 860px; margin: 0 auto; }
    header h1 { margin: 0 0 8px; font-size: clamp(1.6rem, 5vw, 2.3rem); line-height: 1.2; }
    header p { margin: 0 0 18px; color: rgba(255, 255, 255, .88); font-size: 1.08rem; }
    .cta { display: inline-block; background: #fff; color: var(--bleu); font-weight: 700; padding: 10px 18px; border-radius: 999px; text-decoration: none; }
    main { padding: 8px 16px 48px; }
    section { background: var(--carte); border: 1px solid var(--bord); border-radius: 14px; padding: 4px 20px 12px; margin: 20px 0; }
    h2 { font-size: 1.3rem; margin: 18px 0 8px; } h3 { font-size: 1.05rem; margin: 16px 0 4px; }
    a { color: var(--lien); } .note, small { color: var(--texte-2); }
    ul { padding-left: 1.2em; } li { margin: 3px 0; }
    .chiffres { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 14px 0; padding: 0; list-style: none; }
    .chiffres li { border: 1px solid var(--bord); border-radius: 12px; padding: 10px 12px; margin: 0; } .chiffres b { display: block; font-size: 1.5rem; }
    details { border-top: 1px solid var(--bord); padding: 8px 0; } summary { font-weight: 600; cursor: pointer; }
    footer { text-align: center; color: var(--texte-2); padding: 0 16px 32px; font-size: .9rem; }
  </style>
</head>
<body>
  <header><div class="l">
    <p><a href="./" style="color:#fff">Challenge Rythmo</a> › Présentation</p>
    <h1>Challenge Rythmo : quiz de rythmologie, ECG, pacemaker, DAI et électrophysiologie</h1>
    <p>Application web gratuite et en français pour apprendre et entretenir ses connaissances en rythmologie cardiaque, sans compte ni inscription.</p>
    <a class="cta" href="./">Ouvrir l'application</a>
  </div></header>
  <main>
    <section>
      <h2>En bref</h2>
      <p><b>Challenge Rythmo</b> est une application d'entraînement en <b>rythmologie</b> : lecture d'<b>ECG</b>, programmation et suivi des <b>stimulateurs cardiaques (pacemakers)</b> et des <b>défibrillateurs automatiques implantables (DAI)</b>, <b>resynchronisation cardiaque (CRT)</b> et stimulation de conduction, <b>télésurveillance</b> des prothèses et <b>électrophysiologie</b> (EEP, manœuvres, ablation). Chaque question est corrigée, avec un commentaire pour chaque proposition et des sources cliquables.</p>
      <ul class="chiffres">
        <li><b>${nombre(n)}</b> questions corrigées</li>
        <li><b>${nbReels}</b> vrais ECG 12 dérivations</li>
        <li><b>${nbScenarios}</b> scénarios de simulateur d'EEP</li>
        <li><b>${recos.length}</b> recommandations de référence</li>
      </ul>
      <p class="note">Base de questions mise à jour le ${new Date(idx.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (version ${esc(idx.version)}).</p>
    </section>

    <section>
      <h2>Pour qui ?</h2>
      <p>Cardiologues et internes de cardiologie, infirmiers et techniciens de rythmologie, équipes de télésurveillance des prothèses cardiaques, étudiants en santé : toute personne qui interprète des ECG ou suit des porteurs de stimulateur ou de défibrillateur. Les questions vont du niveau débutant (1/10) à expert (10/10).</p>
    </section>

    <section>
      <h2>Modes d'apprentissage</h2>
      <ul>
        <li><b>Entraînement</b> par domaine ou ciblé (thème, sous-thème, marque, type de question, niveau, tracés uniquement), avec correction immédiate.</li>
        <li><b>Compétitif</b> : flux continu et adaptatif, classement <b>ELO</b> (départ à 600) ; plus on progresse, plus les questions sont difficiles.</li>
        <li><b>Examen</b> chronométré avec correction à la fin, et <b>révisions</b> de ses erreurs par répétition espacée.</li>
        <li><b>Simulateur d'électrophysiologie</b> : baie d'EEP en temps réel et cas mystères notés.</li>
        <li><b>Progression</b> : courbe ELO jour après jour, badges et points faibles.</li>
      </ul>
      <p>Types de questions : QCU, QCM, vrai/faux et questions ouvertes. L'application fonctionne hors ligne et s'installe comme une application (PWA).</p>
    </section>

    <section>
      <h2>Thèmes couverts</h2>
      ${themes.map(t => `<h3>${esc(t.nom)} (${nombre(t.n)} questions)</h3>
      <p class="note">${esc(t.desc)}.</p>
      <ul>${t.sous.map(([s, k]) => `<li>${esc(s)} <small>(${k})</small></li>`).join('')}</ul>`).join('\n      ')}
      <p class="note">Marques de prothèses abordées : Medtronic, Abbott, Boston Scientific, Biotronik, MicroPort.</p>
    </section>

    <section>
      <h2>Simulateur d'électrophysiologie</h2>
      <p>Le simulateur reproduit une <b>baie d'étude électrophysiologique</b> : dérivations de surface (D1, D2, aVF, V1, V6), électrogrammes endocavitaires (oreillette droite haute, His proximal et distal, sinus coronaire, ventricule droit, sonde d'ablation), vitesses de défilement de 12,5 à 400 mm/s, stimulation programmée (trains, extrastimuli, rampes), adénosine, isoprénaline, atropine et ablation. La conduction décrémentielle (Wenckebach), les périodes réfractaires, les réentrées et les réponses aux manœuvres émergent d'un modèle d'une trentaine de sites cardiaques.</p>
      <p>Scénarios : ${scenarios.map(esc).join(' ; ')}.</p>
    </section>

    <section>
      <h2>Méthode et fiabilité</h2>
      <ul>
        <li>Questions fondées uniquement sur des sources scientifiquement validées : recommandations ESC, EHRA, HRS, ACC/AHA, documents de consensus, articles indexés avec DOI, manuels techniques officiels.</li>
        <li>Relecture par un rythmologue pour un français clair ; date de relecture indiquée sur chaque question.</li>
        <li>Contrôles automatiques de la base à chaque mise à jour (format, sources, biais de longueur des propositions).</li>
        <li>Les vrais ECG 12 dérivations proviennent de la base publique PTB-XL (PhysioNet, licence CC BY 4.0).</li>
        <li>Signalement d'erreur possible depuis chaque correction.</li>
      </ul>
    </section>

    <section>
      <h2>Recommandations de référence</h2>
      <ul>${recos.map(([r, k]) => `<li>${esc(r)} <small>(${k} questions)</small></li>`).join('')}</ul>
      <h3>Principales sources citées</h3>
      <ol>${sources.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" rel="noopener">${esc(s.titre)}</a>` : esc(s.titre)} <small>(${s.n})</small></li>`).join('')}</ol>
    </section>

    <section id="faq">
      <h2>Questions fréquentes</h2>
      ${faq.map(([q, r]) => `<details open><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('\n      ')}
    </section>

    <section>
      <h2>Avertissement</h2>
      <p>Outil pédagogique : les questions visent l'apprentissage et l'entretien des connaissances. Elles ne remplacent ni les recommandations officielles, ni les manuels des fabricants, ni le jugement clinique.</p>
    </section>
    <p style="text-align:center"><a class="cta" style="background:var(--bleu);color:#fff" href="./">Ouvrir Challenge Rythmo</a></p>
  </main>
  <footer>Challenge Rythmo · application gratuite, sans compte · <a href="https://github.com/hacuubo/CHALLENGE-RYTHMO">code source</a></footer>
</body>
</html>
`;
  fs.writeFileSync(path.join(racine, 'presentation.html'), html);

  fs.writeFileSync(path.join(racine, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><lastmod>${idx.date}</lastmod><priority>1.0</priority></url>
  <url><loc>${url}</loc><lastmod>${idx.date}</lastmod><priority>0.8</priority></url>
</urlset>
`);

  // llms.txt : résumé en Markdown pour les moteurs de réponse et assistants IA (https://llmstxt.org/)
  fs.writeFileSync(path.join(racine, 'llms.txt'), `# Challenge Rythmo

> Application web gratuite, en français et sans compte pour apprendre la rythmologie cardiaque : ${nombre(n)} questions corrigées sur l'ECG, la programmation des stimulateurs cardiaques (pacemakers) et défibrillateurs implantables (DAI), la resynchronisation (CRT), la télésurveillance et l'électrophysiologie, plus un simulateur de baie d'électrophysiologie (EEP) en temps réel.

Points clés :

- Public : cardiologues, internes, infirmiers et techniciens de rythmologie, équipes de télésurveillance, étudiants.
- Modes : entraînement par domaine ou ciblé, compétitif adaptatif avec classement ELO (départ à 600), examen chronométré, révisions espacées, progression.
- Contenu : ${themes.map(t => `${t.nom} (${t.n} questions)`).join(', ')} ; ${nbReels} vrais ECG 12 dérivations (PTB-XL, CC BY 4.0) ; difficulté de 1 à 10 ; QCU, QCM, vrai/faux, questions ouvertes.
- Simulateur d'EEP : ${nbScenarios} scénarios (${scenarios.join(', ')}) et cas mystères notés.
- Sources : uniquement recommandations et consensus ESC, EHRA, HRS, ACC/AHA, articles indexés (DOI) et manuels officiels ; relecture par un rythmologue ; chaque correction cite ses sources.
- Recommandations de référence : ${recos.map(([r]) => r).join(', ')}.
- Confidentialité : aucun compte, aucune donnée transmise ; progression stockée localement. Fonctionne hors ligne (PWA).
- Limite : outil pédagogique, ne remplace ni les recommandations officielles, ni les manuels des fabricants, ni le jugement clinique.

Base mise à jour le ${idx.date}.

## Pages

- [Application Challenge Rythmo](${SITE}) : quiz, mode compétitif ELO, simulateur d'électrophysiologie
- [Présentation détaillée](${url}) : thèmes et sous-thèmes, méthode, recommandations, sources, FAQ

## Optional

- [Code source et format des questions](https://github.com/hacuubo/CHALLENGE-RYTHMO)
`);
  console.log(`SEO : presentation.html, sitemap.xml, llms.txt (${n} questions, ${sources.length} sources)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) generer();
