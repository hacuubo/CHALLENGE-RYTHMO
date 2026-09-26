// Référencement (SEO) et lisibilité par les moteurs génératifs (GEO) : fichiers statiques générés depuis la base,
// en français et en anglais.
//   - index.html : met à jour le nombre de questions dans le contenu statique (lisible sans JavaScript) ;
//   - en/index.html : version anglaise de la page d'accueil (même application, balises et contenu statique anglais) ;
//   - presentation.html et en/presentation.html : présentation complète, citable (thèmes, méthode, sources, FAQ) ;
//   - sitemap.xml (avec hreflang) et llms.txt.
// Appelé par scripts/build-index.mjs ; ne rien modifier à la main dans les fichiers générés.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from '../js/simu/scenarios.js';
import { definirLangue } from '../js/i18n.js';

export const SITE = 'https://shockandpace.com/';
export const CONTACT = 'contact@shockandpace.com';
// éditeur du site, référencé par les données structurées de toutes les pages
const EDITEUR = { '@type': 'Organization', '@id': SITE + '#editeur', name: 'Shock & Pace', url: SITE, email: CONTACT,
  logo: SITE + 'icons/icon-512.png', sameAs: ['https://github.com/hacuubo/CHALLENGE-RYTHMO'] };
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirQ = path.join(racine, 'data', 'questions');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nombre = (n, l = 'fr') => (l === 'en' ? n.toLocaleString('en-GB') : n.toLocaleString('fr-FR').replace(/ /g, ' '));
const lireJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

function lireQuestions() {
  const fichiers = fs.readdirSync(dirQ).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
  return fichiers.flatMap(f => lireJson(path.join(dirQ, f)));
}

// Nombre de questions dans le contenu statique de index.html (avant le calcul de l'empreinte du cache).
export function patcherIndex(total) {
  const p = path.join(racine, 'index.html');
  const avant = fs.readFileSync(p, 'utf8');
  const apres = avant.replace(/<!--total-->[^<]*<!--\/total-->/g, `<!--total-->${nombre(total)}<!--/total-->`);
  if (apres !== avant) fs.writeFileSync(p, apres);
}

const THEMES = {
  ecg: { fr: ['ECG', 'Lecture de tracés, vrais ECG 12 dérivations, ECG stimulé'], en: ['ECG', 'Tracing interpretation, real 12-lead ECGs, paced ECGs'] },
  programmation: { fr: ['Programmation PM / DAI', 'Modes, algorithmes par marque, DAI, CRT'], en: ['Pacemaker and ICD programming', 'Pacing modes, manufacturer algorithms, ICD, CRT'] },
  telecardio: { fr: ['Alertes télécardio', 'Télésurveillance, triage des alertes, conduite à tenir'], en: ['Remote monitoring alerts', 'Remote monitoring, alert triage, management'] },
  electrophysio: { fr: ['Électrophysiologie', 'Mécanismes, EEP, ablation, antiarythmiques'], en: ['Electrophysiology', 'Mechanisms, EP studies, ablation, antiarrhythmic drugs'] },
};

const FAQ = {
  fr: (n, nbScenarios) => [
    ['Qu\'est-ce que Shock & Pace ?',
      `Shock & Pace est une application web gratuite, en français et en anglais, pour apprendre et entretenir ses connaissances en rythmologie : lecture d'ECG, programmation et suivi des stimulateurs cardiaques (pacemakers) et défibrillateurs implantables (DAI), resynchronisation (CRT), télésurveillance des prothèses et électrophysiologie. Elle propose ${nombre(n)} questions corrigées et un simulateur d'électrophysiologie.`],
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
    ['L\'application existe-t-elle en anglais ?',
      'Oui. Toute l\'application (interface, questions, corrections et simulateur) existe en anglais. La langue se choisit sur l\'écran d\'accueil.'],
    ['L\'application fonctionne-t-elle hors ligne ?',
      'Oui. C\'est une application web progressive (PWA) : elle s\'installe sur l\'écran d\'accueil d\'un téléphone ou d\'un ordinateur et reste utilisable sans connexion une fois chargée.'],
    ['Shock & Pace remplace-t-il les recommandations ou le manuel de l\'appareil ?',
      'Non. C\'est un outil pédagogique : il ne remplace ni les recommandations officielles, ni les manuels des fabricants, ni le jugement clinique. Les valeurs de programmation peuvent varier selon les modèles et les versions logicielles.'],
  ],
  en: (n, nbScenarios) => [
    ['What is Shock & Pace?',
      `Shock & Pace is a free web app, in English and French, for learning and maintaining knowledge in cardiac rhythm management: ECG interpretation, programming and follow-up of pacemakers and implantable cardioverter-defibrillators (ICDs), cardiac resynchronisation therapy (CRT), remote monitoring and electrophysiology. It offers ${nombre(n, 'en')} questions with detailed answers and an electrophysiology simulator.`],
    ['Who is it for?',
      'Clinicians and students in cardiac electrophysiology and devices: cardiologists and cardiology trainees, cardiac physiologists, device and EP nurses, allied professionals and industry specialists, remote monitoring teams, and anyone who follows patients with a pacemaker or ICD.'],
    ['Do I need an account?',
      'No. There is no account or sign-up, and no data is sent anywhere: progress and the ELO rating are stored only in your browser.'],
    ['What sources are the questions based on?',
      'Only on scientifically validated sources: ESC, EHRA, HRS and ACC/AHA guidelines, consensus documents, indexed articles (with DOI) and official manufacturer technical manuals. Every answer cites its sources and shows its review date.'],
    ['How does the competitive mode work?',
      'The competitive mode is an endless, adaptive stream of questions: every player starts with an ELO rating of 600; a correct answer raises the rating and brings harder questions, while a wrong answer lowers it and brings easier ones. You can pause at any time.'],
    ['What can the electrophysiology simulator do?',
      `It simulates a real-time EP recording system: surface leads, intracardiac electrograms (HRA, His, coronary sinus, RV), adjustable sweep speeds, programmed stimulation (extrastimuli, ramp pacing), diagnostic manoeuvres for supraventricular tachycardia, adenosine, isoprenaline and ablation. ${nbScenarios} scenarios are available (AVNRT, accessory pathways, flutter, atrial and ventricular tachycardia…) as well as scored mystery cases.`],
    ['Is the app available in French?',
      'Yes. The whole app (interface, questions, answers and simulator) is available in English and French; the language is chosen on the home screen.'],
    ['Does it work offline?',
      'Yes. It is a progressive web app (PWA): it can be installed on the home screen of a phone or computer and keeps working offline once loaded.'],
    ['Does Shock & Pace replace guidelines or the device manual?',
      'No. It is an educational tool: it does not replace official guidelines, manufacturers\' manuals or clinical judgement. Programming values may vary between models and software versions.'],
  ],
};

// Libellés des pages, par langue.
const L = {
  fr: {
    lang: 'fr', ogLocale: 'fr_FR', app: '', pres: 'presentation.html', racine: '',
    titre: 'Présentation de Shock & Pace, quiz de rythmologie',
    description: n => `Shock & Pace : ${nombre(n)} questions de rythmologie corrigées (ECG, pacemaker, DAI, CRT, télécardio, EEP), simulateur d'électrophysiologie, sources ESC/EHRA/HRS.`,
    ogTitre: 'Shock & Pace : quiz de rythmologie et simulateur d\'électrophysiologie',
    ogAlt: 'Shock & Pace, quiz de rythmologie', llms: 'Résumé pour les assistants IA', fil: 'Présentation',
    h1: 'Shock & Pace : quiz de rythmologie, ECG, pacemaker, DAI et électrophysiologie',
    chapo: 'Application web gratuite, en français et en anglais, pour apprendre et entretenir ses connaissances en rythmologie cardiaque, sans compte ni inscription.',
    ouvrir: 'Ouvrir l\'application', ouvrir2: 'Ouvrir Shock & Pace', autre: 'English version',
    enBref: 'En bref',
    bref: '<b>Shock &amp; Pace</b> est une application d\'entraînement en <b>rythmologie</b> : lecture d\'<b>ECG</b>, programmation et suivi des <b>stimulateurs cardiaques (pacemakers)</b> et des <b>défibrillateurs automatiques implantables (DAI)</b>, <b>resynchronisation cardiaque (CRT)</b> et stimulation de conduction, <b>télésurveillance</b> des prothèses et <b>électrophysiologie</b> (EEP, manœuvres, ablation). Chaque question est corrigée, avec un commentaire pour chaque proposition et des sources cliquables.',
    chiffres: ['questions corrigées', 'vrais ECG 12 dérivations', 'scénarios de simulateur d\'EEP', 'recommandations de référence'],
    maj: (d, v) => `Base de questions mise à jour le ${new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (version ${v}).`,
    pourQui: 'Pour qui ?',
    public: 'Cardiologues et internes de cardiologie, infirmiers et techniciens de rythmologie, équipes de télésurveillance des prothèses cardiaques, étudiants en santé : toute personne qui interprète des ECG ou suit des porteurs de stimulateur ou de défibrillateur. Les questions vont du niveau débutant (1/10) à expert (10/10).',
    modes: 'Modes d\'apprentissage',
    listeModes: [
      '<b>Entraînement</b> par domaine ou ciblé (thème, sous-thème, marque, type de question, niveau, tracés uniquement), avec correction immédiate.',
      '<b>Compétitif</b> : flux continu et adaptatif, classement <b>ELO</b> (départ à 600) ; plus on progresse, plus les questions sont difficiles.',
      '<b>Examen</b> chronométré avec correction à la fin, et <b>révisions</b> de ses erreurs par répétition espacée.',
      '<b>Simulateur d\'électrophysiologie</b> : baie d\'EEP en temps réel et cas mystères notés.',
      '<b>Progression</b> : courbe ELO jour après jour, badges et points faibles.'],
    types: 'Types de questions : QCU, QCM, vrai/faux et questions ouvertes. L\'application fonctionne hors ligne et s\'installe comme une application (PWA). Interface et contenu disponibles en français et en anglais.',
    themes: 'Thèmes couverts', questions: 'questions',
    marques: 'Marques de prothèses abordées : Medtronic, Abbott, Boston Scientific, Biotronik, MicroPort.',
    simu: 'Simulateur d\'électrophysiologie',
    simuTexte: 'Le simulateur reproduit une <b>baie d\'étude électrophysiologique</b> : dérivations de surface (D1, D2, aVF, V1, V6), électrogrammes endocavitaires (oreillette droite haute, His proximal et distal, sinus coronaire, ventricule droit, sonde d\'ablation), vitesses de défilement de 12,5 à 400 mm/s, stimulation programmée (trains, extrastimuli, rampes), adénosine, isoprénaline, atropine et ablation. La conduction décrémentielle (Wenckebach), les périodes réfractaires, les réentrées et les réponses aux manœuvres émergent d\'un modèle d\'une trentaine de sites cardiaques.',
    scenarios: 'Scénarios', sep: ' ; ',
    methode: 'Méthode et fiabilité',
    listeMethode: [
      'Questions fondées uniquement sur des sources scientifiquement validées : recommandations ESC, EHRA, HRS, ACC/AHA, documents de consensus, articles indexés avec DOI, manuels techniques officiels.',
      'Relecture par un rythmologue pour un français clair ; date de relecture indiquée sur chaque question.',
      'Contrôles automatiques de la base à chaque mise à jour (format, sources, biais de longueur des propositions, complétude de la traduction).',
      'Les vrais ECG 12 dérivations proviennent de la base publique PTB-XL (PhysioNet, licence CC BY 4.0).',
      'Signalement d\'erreur possible depuis chaque correction.'],
    recos: 'Recommandations de référence', sourcesTitre: 'Principales sources citées',
    faq: 'Questions fréquentes', avert: 'Avertissement',
    avertTexte: 'Outil pédagogique : les questions visent l\'apprentissage et l\'entretien des connaissances. Elles ne remplacent ni les recommandations officielles, ni les manuels des fabricants, ni le jugement clinique.',
    pied: 'application gratuite, sans compte', code: 'code source',
  },
  en: {
    lang: 'en', ogLocale: 'en_GB', app: 'en/', pres: 'en/presentation.html', racine: '../',
    titre: 'About Shock & Pace, the cardiac rhythm quiz',
    description: n => `Shock & Pace: ${nombre(n, 'en')} cardiac rhythm questions with referenced answers (ECG, pacemakers, ICDs, CRT, remote monitoring, EP) and an electrophysiology simulator, based on ESC/EHRA/HRS guidelines.`,
    ogTitre: 'Shock & Pace: cardiac rhythm quiz and electrophysiology simulator',
    ogAlt: 'Shock & Pace, cardiac rhythm quiz', llms: 'Summary for AI assistants', fil: 'About',
    h1: 'Shock & Pace: quiz on ECG, pacemakers, ICDs and electrophysiology',
    chapo: 'A free web app, in English and French, for learning and maintaining your knowledge of cardiac rhythm management, with no account or sign-up.',
    ouvrir: 'Open the app', ouvrir2: 'Open Shock & Pace', autre: 'Version française',
    enBref: 'At a glance',
    bref: '<b>Shock &amp; Pace</b> is a training app for <b>cardiac rhythm management</b>: <b>ECG</b> interpretation, programming and follow-up of <b>pacemakers</b> and <b>implantable cardioverter-defibrillators (ICDs)</b>, <b>cardiac resynchronisation therapy (CRT)</b> and conduction system pacing, <b>remote monitoring</b> and <b>electrophysiology</b> (EP studies, pacing manoeuvres, ablation). Every question comes with a detailed answer, a comment on each option and clickable references.',
    chiffres: ['questions with detailed answers', 'real 12-lead ECGs', 'EP simulator scenarios', 'reference guidelines'],
    maj: (d, v) => `Question bank updated on ${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} (version ${v}).`,
    pourQui: 'Who is it for?',
    public: 'Cardiologists and cardiology trainees, cardiac physiologists, device and EP nurses and technicians, remote monitoring teams, industry specialists and students: anyone who interprets ECGs or follows patients with a pacemaker or ICD. Questions range from beginner (1/10) to expert (10/10).',
    modes: 'Learning modes',
    listeModes: [
      '<b>Training</b> by domain or customised (topic, subtopic, manufacturer, question type, level, tracings only), with instant feedback.',
      '<b>Competitive</b>: an endless, adaptive stream of questions with an <b>ELO</b> rating (starting at 600); the better you do, the harder the questions.',
      'Timed <b>exam</b> mode with answers at the end, and <b>spaced-repetition review</b> of your mistakes.',
      '<b>Electrophysiology simulator</b>: a real-time EP recording system and scored mystery cases.',
      '<b>Progress</b>: day-by-day ELO curve, badges and weak spots.'],
    types: 'Question types: single answer, multiple answers (select all that apply), true/false and open questions. The app works offline and can be installed like a native app (PWA). The interface and content are available in English and French.',
    themes: 'Topics covered', questions: 'questions',
    marques: 'Device manufacturers covered: Medtronic, Abbott, Boston Scientific, Biotronik, MicroPort.',
    simu: 'Electrophysiology simulator',
    simuTexte: 'The simulator recreates an <b>EP recording system</b>: surface leads (I, II, aVF, V1, V6), intracardiac electrograms (high right atrium, proximal and distal His, coronary sinus, right ventricle, ablation catheter), sweep speeds from 12.5 to 400 mm/s, programmed stimulation (drive trains, extrastimuli, ramp pacing), adenosine, isoprenaline, atropine and ablation. Decremental conduction (Wenckebach), refractory periods, re-entry and responses to pacing manoeuvres all emerge from a model of about thirty cardiac sites.',
    scenarios: 'Scenarios', sep: '; ',
    methode: 'Method and reliability',
    listeMethode: [
      'Questions based only on scientifically validated sources: ESC, EHRA, HRS and ACC/AHA guidelines, consensus documents, indexed articles with DOI and official technical manuals.',
      'Every question reviewed by an electrophysiologist, with its review date shown; the English version is a translation of the French original, checked against a medical glossary for consistent terminology.',
      'Automated checks of the question bank at every update (format, sources, answer-length bias, completeness of the translation).',
      'The real 12-lead ECGs come from the public PTB-XL database (PhysioNet, CC BY 4.0 licence).',
      'Errors can be reported from every answer.'],
    recos: 'Reference guidelines', sourcesTitre: 'Most cited sources',
    faq: 'Frequently asked questions', avert: 'Disclaimer',
    avertTexte: 'Educational tool: the questions are designed for learning and maintaining knowledge. They do not replace official guidelines, manufacturers\' manuals or clinical judgement.',
    pied: 'free app, no account', code: 'source code',
  },
};

function presentation(l, d) {
  const T = L[l];
  const url = SITE + T.pres, urlAutre = SITE + L[l === 'fr' ? 'en' : 'fr'].pres;
  const r = T.racine, n = d.n;
  const description = T.description(n);
  const faq = FAQ[l](n, d.nbScenarios);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: T.titre, description, inLanguage: l,
        dateModified: d.idx.date, isPartOf: { '@id': SITE + '#site' }, about: { '@id': SITE + '#app' }, publisher: EDITEUR,
        breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Shock & Pace', item: SITE + T.app },
          { '@type': 'ListItem', position: 2, name: T.fil, item: url }] } },
      { '@type': 'FAQPage', '@id': url + '#faq', inLanguage: l,
        mainEntity: faq.map(([q, rep]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: rep } })) },
    ],
  };
  const themes = d.themes(l), recos = d.recos(l), scenarios = d.scenarios[l];
  return `<!doctype html>
<html lang="${l}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(T.titre)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="fr" href="${SITE}presentation.html">
  <link rel="alternate" hreflang="en" href="${SITE}en/presentation.html">
  <link rel="alternate" hreflang="x-default" href="${SITE}presentation.html">
  <meta name="theme-color" content="#0b3a5d">
  <link rel="icon" href="${r}icons/icon.svg" type="image/svg+xml">
  <link rel="alternate" type="text/markdown" title="${esc(T.llms)}" href="${r}llms.txt">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="${T.ogLocale}">
  <meta property="og:locale:alternate" content="${l === 'fr' ? 'en_GB' : 'fr_FR'}">
  <meta property="og:site_name" content="Shock &amp; Pace">
  <meta property="og:title" content="${esc(T.ogTitre)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}icons/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(T.ogAlt)}">
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
    header .fil { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    header .fil a { color: #fff; }
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
    <p class="fil"><span><a href="${r}${T.app}">Shock &amp; Pace</a> › ${esc(T.fil)}</span><a href="${urlAutre}" hreflang="${l === 'fr' ? 'en' : 'fr'}" lang="${l === 'fr' ? 'en' : 'fr'}">${esc(T.autre)}</a></p>
    <h1>${esc(T.h1)}</h1>
    <p>${esc(T.chapo)}</p>
    <a class="cta" href="${r}${T.app}">${esc(T.ouvrir)}</a>
  </div></header>
  <main>
    <section>
      <h2>${esc(T.enBref)}</h2>
      <p>${T.bref}</p>
      <ul class="chiffres">
        <li><b>${nombre(n, l)}</b> ${esc(T.chiffres[0])}</li>
        <li><b>${d.nbReels}</b> ${esc(T.chiffres[1])}</li>
        <li><b>${d.nbScenarios}</b> ${esc(T.chiffres[2])}</li>
        <li><b>${recos.length}</b> ${esc(T.chiffres[3])}</li>
      </ul>
      <p class="note">${esc(T.maj(d.idx.date, d.idx.version))}</p>
    </section>

    <section>
      <h2>${esc(T.pourQui)}</h2>
      <p>${esc(T.public)}</p>
    </section>

    <section>
      <h2>${esc(T.modes)}</h2>
      <ul>${T.listeModes.map(x => `\n        <li>${x}</li>`).join('')}
      </ul>
      <p>${esc(T.types)}</p>
    </section>

    <section>
      <h2>${esc(T.themes)}</h2>
      ${themes.map(t => `<h3>${esc(t.nom)} (${nombre(t.n, l)} ${T.questions})</h3>
      <p class="note">${esc(t.desc)}.</p>
      <ul>${t.sous.map(([s, k]) => `<li>${esc(s)} <small>(${k})</small></li>`).join('')}</ul>`).join('\n      ')}
      <p class="note">${esc(T.marques)}</p>
    </section>

    <section>
      <h2>${esc(T.simu)}</h2>
      <p>${T.simuTexte}</p>
      <p>${esc(T.scenarios)}: ${scenarios.map(esc).join(T.sep)}.</p>
    </section>

    <section>
      <h2>${esc(T.methode)}</h2>
      <ul>${T.listeMethode.map(x => `\n        <li>${esc(x)}</li>`).join('')}
      </ul>
    </section>

    <section>
      <h2>${esc(T.recos)}</h2>
      <ul>${recos.map(([rec, k]) => `<li>${esc(rec)} <small>(${k} ${T.questions})</small></li>`).join('')}</ul>
      <h3>${esc(T.sourcesTitre)}</h3>
      <ol>${d.sources.map(s => `<li>${s.url ? `<a href="${esc(s.url)}" rel="noopener">${esc(s.titre)}</a>` : esc(s.titre)} <small>(${s.n})</small></li>`).join('')}</ol>
    </section>

    <section id="faq">
      <h2>${esc(T.faq)}</h2>
      ${faq.map(([q, rep]) => `<details open><summary>${esc(q)}</summary><p>${esc(rep)}</p></details>`).join('\n      ')}
    </section>

    <section>
      <h2>${esc(T.avert)}</h2>
      <p>${esc(T.avertTexte)}</p>
    </section>
    <p style="text-align:center"><a class="cta" style="background:var(--bleu);color:#fff" href="${r}${T.app}">${esc(T.ouvrir2)}</a></p>
  </main>
  <footer>Shock &amp; Pace · ${esc(T.pied)} · <a href="https://github.com/hacuubo/CHALLENGE-RYTHMO">${esc(T.code)}</a></footer>
</body>
</html>
`.replace(`${esc(T.scenarios)}: `, l === 'fr' ? `${esc(T.scenarios)} : ` : `${esc(T.scenarios)}: `);
}

// Page d'accueil anglaise : même application que index.html, avec balises et contenu statique en anglais.
function accueilAnglais(d) {
  const desc = 'Free cardiac rhythm quiz, no account needed: ECG, pacemakers, ICDs, CRT, remote monitoring and electrophysiology. Referenced answers, competitive ELO mode and an EP simulator.';
  const url = SITE + 'en/';
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': SITE + '#site', url: SITE, name: 'Shock & Pace', inLanguage: ['fr', 'en'], description: desc, publisher: { '@id': SITE + '#editeur' } },
    EDITEUR,
    { '@type': ['WebApplication', 'LearningResource'], '@id': SITE + '#app', url, name: 'Shock & Pace', alternateName: 'Challenge Rythmo',
      description: desc, inLanguage: ['en', 'fr'], applicationCategory: 'EducationalApplication',
      applicationSubCategory: 'Medical education in cardiac electrophysiology and devices',
      operatingSystem: 'Any (web browser, installable PWA)', browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      learningResourceType: ['Quiz', 'Simulation'], educationalLevel: 'Undergraduate, postgraduate and continuing medical education',
      audience: { '@type': 'Audience', audienceType: 'Cardiologists, cardiology trainees, cardiac physiologists, device and EP nurses, remote monitoring teams' },
      teaches: ['ECG interpretation', 'Pacemaker programming', 'Implantable cardioverter-defibrillator programming', 'Cardiac resynchronisation therapy (CRT)', 'Remote monitoring of cardiac devices', 'Electrophysiology and catheter ablation'],
      about: ['Cardiac electrophysiology', 'Pacemaker', 'Implantable cardioverter-defibrillator', 'Electrocardiography', 'Cardiac arrhythmia'].map(name => ({ '@type': 'Thing', name })),
      featureList: ['Questions with referenced answers (ESC, EHRA, HRS, ACC/AHA)', 'Adaptive competitive mode with ELO rating', 'Real-time EP recording system simulator', 'Real 12-lead ECGs (PTB-XL)', 'Works offline, no account'],
      image: SITE + 'icons/og.png', screenshot: SITE + 'icons/og.png', subjectOf: { '@type': 'WebPage', url: SITE + 'en/presentation.html' },
      publisher: { '@id': SITE + '#editeur' } }] };
  const tete = `  <!--seo-->
  <title>Shock &amp; Pace · Cardiac rhythm quiz: ECG, pacemaker, ICD</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${url}">
  <meta name="application-name" content="Shock &amp; Pace">
  <meta name="theme-color" content="#0b3a5d">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="en_GB">
  <meta property="og:locale:alternate" content="fr_FR">
  <meta property="og:site_name" content="Shock &amp; Pace">
  <meta property="og:title" content="Shock &amp; Pace · Cardiac rhythm quiz and electrophysiology simulator">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}icons/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Shock &amp; Pace, cardiac rhythm quiz">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="alternate" type="text/markdown" title="Summary for AI assistants" href="llms.txt">
  <link rel="sitemap" type="application/xml" href="sitemap.xml">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
  <!--/seo-->`;
  const statique = `    <!--statique-->
    <div class="statique">
      <h1>Shock &amp; Pace</h1>
      <p>A free <strong>cardiac rhythm</strong> quiz, no account needed: ${nombre(d.n, 'en')} questions with referenced answers on <strong>ECG</strong> interpretation, <strong>pacemaker</strong> and <strong>implantable cardioverter-defibrillator (ICD)</strong> programming, <strong>CRT</strong>, <strong>remote monitoring</strong> and <strong>electrophysiology</strong>.</p>
      <ul>
        <li>Training by domain, from beginner to expert, with detailed answers and references (ESC, EHRA, HRS, ACC/AHA).</li>
        <li>Adaptive competitive mode with an ELO rating.</li>
        <li>Real-time electrophysiology (EP) recording system simulator and mystery cases.</li>
        <li>Works offline; no data leaves your device.</li>
      </ul>
      <p><a href="en/presentation.html">About the app: topics, sources and frequently asked questions</a></p>
      <p class="chargement">Loading the question bank…</p>
      <noscript><p>JavaScript must be enabled to use the quizzes and the simulator.</p></noscript>
    </div>
    <!--/statique-->`;
  let s = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  s = s.replace('<html lang="fr">', '<!-- Fichier généré par scripts/build-seo.mjs depuis index.html : ne pas modifier. -->\n<html lang="en">')
    .replace('  <meta charset="utf-8">\n', '  <meta charset="utf-8">\n  <base href="../">\n')
    .replace(/  <!--seo-->[\s\S]*?<!--\/seo-->/, () => tete)
    .replace(/    <!--statique-->[\s\S]*?<!--\/statique-->/, () => statique);
  return s;
}

export function generer() {
  const qs = lireQuestions();
  const idx = lireJson(path.join(dirQ, 'index.json'));
  const lib = lireJson(path.join(dirQ, 'en', 'libelles.json'));
  const n = qs.length;
  const traduire = (l, dico, x) => (l === 'en' ? dico[x] || x : x);

  const reco = {};
  for (const q of qs) for (const r of q.reco || []) reco[r] = (reco[r] || 0) + 1;
  const m = new Map();
  for (const q of qs) for (const s of q.sources || []) {
    const e = m.get(s.url || s.titre) || { ...s, n: 0 }; e.n++; m.set(s.url || s.titre, e);
  }
  // noms des scénarios dans chaque langue (textes du simulateur, lus selon la langue courante)
  const scenarios = {};
  for (const l of ['fr', 'en']) { definirLangue(l); scenarios[l] = Object.values(SCENARIOS).map(s => s.nom); }
  definirLangue('fr');

  const d = {
    idx, n, scenarios,
    nbScenarios: Object.keys(SCENARIOS).length,
    nbReels: qs.filter(q => q.ecg12).length,
    sources: [...m.values()].sort((a, b) => b.n - a.n || a.titre.localeCompare(b.titre)).slice(0, 40),
    recos: l => Object.entries(reco).sort((a, b) => b[1] - a[1]).map(([r, k]) => [traduire(l, lib.reco, r), k]),
    // thèmes et sous-thèmes, dans l'ordre de l'application
    themes: l => Object.keys(THEMES).map(id => {
      const du = qs.filter(q => q.theme === id);
      const sous = new Map();
      for (const q of du) sous.set(q.sousTheme, (sous.get(q.sousTheme) || 0) + 1);
      return { nom: THEMES[id][l][0], desc: THEMES[id][l][1], n: du.length,
        sous: [...sous].sort((a, b) => b[1] - a[1]).map(([s, k]) => [traduire(l, lib.sousThemes, s), k]) };
    }),
  };

  fs.mkdirSync(path.join(racine, 'en'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'presentation.html'), presentation('fr', d));
  fs.writeFileSync(path.join(racine, 'en', 'presentation.html'), presentation('en', d));
  fs.writeFileSync(path.join(racine, 'en', 'index.html'), accueilAnglais(d));

  const alt = (fr, en) => `\n    <xhtml:link rel="alternate" hreflang="fr" href="${SITE}${fr}"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${fr}"/>`;
  const url = (loc, prio, a) => `  <url>\n    <loc>${SITE}${loc}</loc>\n    <lastmod>${idx.date}</lastmod>\n    <priority>${prio}</priority>${a}\n  </url>`;
  fs.writeFileSync(path.join(racine, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${url('', '1.0', alt('', 'en/'))}
${url('en/', '1.0', alt('', 'en/'))}
${url('presentation.html', '0.8', alt('presentation.html', 'en/presentation.html'))}
${url('en/presentation.html', '0.8', alt('presentation.html', 'en/presentation.html'))}
</urlset>
`);

  // robots.txt : tout est public ; robots des moteurs de recherche et des assistants IA explicitement autorisés
  const robotsIA = ['Googlebot', 'Bingbot', 'Google-Extended', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
    'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Applebot', 'Applebot-Extended', 'DuckAssistBot', 'MistralAI-User'];
  fs.writeFileSync(path.join(racine, 'robots.txt'), `# Shock & Pace : tout le contenu est public.
${robotsIA.map(b => `User-agent: ${b}\nAllow: /\n`).join('\n')}
User-agent: *
Allow: /

Sitemap: ${SITE}sitemap.xml
`);

  // llms.txt : résumé en Markdown pour les moteurs de réponse et assistants IA (https://llmstxt.org/)
  const th = { fr: d.themes('fr'), en: d.themes('en') };
  fs.writeFileSync(path.join(racine, 'llms.txt'), `# Shock & Pace

> Free web app, in English and French, with no account, for learning cardiac rhythm management: ${nombre(n, 'en')} questions with detailed, referenced answers on ECG interpretation, pacemaker and implantable cardioverter-defibrillator (ICD) programming, cardiac resynchronisation therapy (CRT), remote monitoring and electrophysiology, plus a real-time electrophysiology (EP) recording system simulator.

Key facts:

- Audience: cardiologists and trainees, cardiac physiologists, device and EP nurses and technicians, remote monitoring teams, students.
- Languages: English and French (full interface, questions, answers and simulator; chosen on the home screen). The English version is a translation of the French original.
- Modes: training by domain or targeted, adaptive competitive mode with ELO rating (start 600), timed exam, spaced-repetition review, progress tracking.
- Content: ${th.en.map(t => `${t.nom} (${t.n} questions)`).join(', ')}; ${d.nbReels} real 12-lead ECGs (PTB-XL, CC BY 4.0); difficulty 1 to 10; single-answer, multiple-answer, true/false and open questions.
- EP simulator: ${d.nbScenarios} scenarios (${scenarios.en.join(', ')}) and scored mystery cases.
- Sources: ESC, EHRA, HRS and ACC/AHA guidelines and consensus documents, indexed articles (DOI) and official manufacturer manuals only; every answer cites its sources.
- Reference guidelines: ${d.recos('en').map(([r]) => r).join(', ')}.
- Privacy: no account, no data transmitted; progress stored locally. Works offline (PWA).
- Limitation: educational tool; does not replace official guidelines, manufacturers' manuals or clinical judgement.
- Contact: ${CONTACT}

Question bank updated on ${idx.date}.

## Pages

- [Shock & Pace app, English](${SITE}en/): quizzes, competitive ELO mode, electrophysiology simulator
- [About Shock & Pace](${SITE}en/presentation.html): topics and subtopics, method, guidelines, sources, FAQ
- [Application Shock & Pace, français](${SITE}): quiz, mode compétitif ELO, simulateur d'électrophysiologie
- [Présentation détaillée (français)](${SITE}presentation.html) : thèmes, méthode, recommandations, sources, FAQ

## Optional

- [Source code and question format](https://github.com/hacuubo/CHALLENGE-RYTHMO)
`);
  console.log(`SEO : presentation.html, en/presentation.html, en/index.html, sitemap.xml, robots.txt, llms.txt (${n} questions, ${d.sources.length} sources)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) generer();
