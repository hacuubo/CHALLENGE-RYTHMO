# Challenge Rythmo

Application web progressive (PWA) pour s'entraîner en **rythmologie et stimulation cardiaque** en s'amusant :
ECG, programmation des stimulateurs et défibrillateurs (par marque), alertes de télécardiologie, électrophysiologie.
Entièrement en français, utilisable hors ligne, installable sur téléphone ou ordinateur, sans compte.

## Fonctionnalités

- **1 153 questions** réparties en 4 thèmes :
  - ECG (troubles de conduction, tachycardies, ECG du patient stimulé) — avec **tracés générés** dans l'application
    et **61 vrais ECG 12 dérivations** (base PTB-XL, PhysioNet, CC BY 4.0), **compas de mesure** et plein écran ;
  - Programmation PM / DAI / CRT : principes génériques et algorithmes propres à **Medtronic, Abbott, Boston Scientific, Biotronik, MicroPort**,
    cas cliniques par constructeur, marqueurs d'événements, stimulation du système de conduction ;
  - Alertes de télécardiologie : triage, conduite à tenir, organisation, cadre français ;
  - **Lecture d'EGM de boîtier** (169 questions, 116 sur tracé, 37 tracés) : épisodes de télésurveillance, consultation de stimulateur,
    épisodes de défibrillateur, Holter implantable — EGM A, EGM VD, EGM de choc ou champ lointain et canal de marqueurs,
    centrés sur les pièges de la pratique courante ;
  - Électrophysiologie : mécanismes, EEP, manœuvres de stimulation des TSV, ablation, antiarythmiques.
- **Types de questions** : QCU, QCM, vrai/faux, questions ouvertes (avec auto-évaluation).
- **Difficulté de 1 à 10** sur chaque question ; filtre libre (« entre 1 et 3 », « au-dessus de 3 », « 7 à 10 »…).
- **Écran titre** puis **accueil épuré sur fond bleu** : Entraînement, Compétitif (avec l'ELO en cours), Simulateur,
  Progression ; l'entraînement ouvre son écran de choix, le simulateur mène directement à la baie (scénario choisi dans la baie).
  La page « Sources et informations » n'a pas de barre du bas, seulement une flèche de retour vers l'accueil.
- **Simulateur d'électrophysiologie** : une baie d'EEP en temps réel.
  - Baie : vitesse de défilement en mm/s (12,5 à 400), balayage avec barre d'effacement ou défilement, D1, D2, aVF, V1, V6,
    OD haute, Halo, His proximal et distal, sinus coronaire décapolaire, VD apex, sonde d'ablation (bipolaire et unipolaire),
    montages, gain par voie, bruit, relecture sur 40 s, jusqu'à trois compas avec report.
  - Stimulateur : site, sortie en mA, trains S1 à S4, décrément automatique, rampe, salve, couplage à la détection,
    stimulation para-hisienne ; isoprénaline, atropine, adénosine, choc ; sonde d'ablation déplaçable (cartographie) et
    radiofréquence ; journal des événements.
  - Physiologie : conduction décrémentielle avec Wenckebach nodal, freinage sinusal (TRS), branches droite et gauche
    (aberration, saut V-H, signe de Coumel), réfractarité dépendante du cycle, variabilité.
  - 17 scénarios : conduction normale, double voie nodale, TRIN typique, atypique et avec 2:1 infra-hisien, TRAV sur voie
    latérale gauche ou postéro-septale, Coumel, PJRT, WPW (et FA préexcitée), Mahaim, TA focale, tachycardie jonctionnelle,
    flutter typique et péri-mitral, FA, TV sur cicatrice.
  - Cas mystères avec contexte clinique, notation de la démarche (diagnostic, manœuvres clés, traitement) et débriefing
    avec les mesures de vos manœuvres (réponse à l'entraînement, PPI − TCL, effet de l'ESV His-réfractaire).
  - 17 questions « tracé d'EEP » générées par le moteur, rejouées à l'identique dans le quiz.
  Les réentrées et les réponses aux manœuvres émergent du modèle. Concept inspiré de svtsim (S. Iravanian), code original.
- **Mode compétitif** : classement **ELO des échecs** (départ 600 pour tout débutant, formule FIDE, K = 40 puis 20, 10 au-delà de 2400).
  Chaque question a une cote tirée de sa difficulté (niveau 1 = 800 … niveau 10 = 2600). Flux sans limite de questions :
  on joue quand on veut, pause à tout moment, l'ELO est enregistré après chaque réponse. Adaptatif dans les deux sens :
  questions plus dures quand l'ELO monte, plus simples quand il baisse. Titres de « Débutant » à « Grand maître ».
- **Autres modes** : **mode examen** chronométré (correction à la fin), entraînement ciblé (thèmes, marques, types,
  sous-thèmes, niveau, tracés uniquement), révisions de ses erreurs (répétition espacée), nouveautés.
  (Le module de fiches, `js/vues/fiches.js`, reste dans le dépôt mais n'est plus proposé dans l'application.)
- **Correction didactique** : explication, commentaire pour **chaque proposition**, message « À retenir », sources cliquables,
  date de relecture et recommandations de référence, bouton **« Signaler une erreur »** (issue GitHub pré-remplie).
- **Progression** : **courbe de l'ELO jour après jour** (avec tableau des valeurs), badges, réussite par thème et par niveau, jours consécutifs,
  historique, export/import ; une série interrompue se reprend. Tout reste sur l'appareil.
- Raccourcis clavier (1–4 / A–D, V/F, Entrée).
- Mode clair / sombre, affichage adapté au mobile.

## Utilisation

Aucune installation ni compilation : ce sont des fichiers statiques.

```bash
python3 -m http.server 8000     # puis ouvrir http://localhost:8000
```

### Publication (GitHub Pages)

Le workflow `.github/workflows/pages.yml` valide la base de questions à chaque push et publie le site
à chaque push sur `main`. À activer une fois dans **Settings → Pages → Source : GitHub Actions**.
Sur mobile, ouvrir l'adresse du site puis « Ajouter à l'écran d'accueil » pour l'installer.

## Base de questions

- Fichiers : `data/questions/*.json`, format décrit dans [`docs/FORMAT_QUESTIONS.md`](docs/FORMAT_QUESTIONS.md).
- Vérifier : `node scripts/validate.mjs` et `STRICT=1 node scripts/audit-biais.mjs` (biais des propositions)
- Après ajout ou modification d'un fichier : `node scripts/build-index.mjs` (met à jour `index.json` et la version).
  Les nouvelles questions sont signalées automatiquement aux utilisateurs (« N nouvelles questions »).
- Aperçu de tous les tracés ECG disponibles : `tests/ecg-galerie.html`.
- Test de l'interface : `node tests/smoke.mjs` (Playwright/Chromium ; lancé aussi en CI).
- Banc d'essai du simulateur : `node tests/simulateur.mjs` (physiologie de base, induction, manœuvres, adénosine, ablation pour chaque
  scénario ; `GRAINE=13 VARIATION=0.05` pour des paramètres individualisés ; lancé aussi en CI).
- Questions de tracés du simulateur : `node scripts/gen-questions-simu.mjs` les régénère ; `--verifier` (en CI) échoue si le moteur
  a changé sans régénération.

### Se tenir à jour

Chaque question porte `revise` (date de relecture) et `reco` (recommandations de référence). Quand une recommandation
change, la page « Sources » liste le nombre de questions concernées ; on les retrouve par `grep` sur `reco`.
Dernière veille : septembre 2026 (ESC 2026 insuffisance cardiaque et MCV-maladie rénale, consensus ESC/EHRA 2025
stimulation du système de conduction) — questions mises à jour et `data/questions/maj-2026.json`.

### Sources et relecture

Les questions s'appuient uniquement sur des sources scientifiquement validées, consultées en lecture seule :
recommandations ESC/EHRA (stimulation et CRT 2021, arythmies ventriculaires 2022, FA 2024, TSV 2019, syncope 2018),
HRS/APHRS/LAHRS (stimulation physiologique 2023, télésurveillance 2023, programmation des DAI 2015/2019),
consensus EHRA 2023 d'implantation de la stimulation de conduction, revues de manœuvres de stimulation en EEP (Veenhuyzen, PACE),
essais publiés (références DOI/PubMed vérifiées), manuels techniques officiels et fiches de marqueurs des fabricants,
ouvrages de référence (encyclopédies constructeur de Bordachar et coll.) et textes réglementaires français.
Les notions tirées d'ouvrages de 2016-2020 ont été confrontées aux recommandations et aux gammes actuelles ; celles qui
étaient périmées ou invérifiables ont été écartées.
Chaque fichier a été relu par un agent « rythmologue français » (exactitude médicale, formulations naturelles
plutôt que traduites mot à mot, cohérence des niveaux et des tracés, vérification des sources).

> **Outil pédagogique** : il ne remplace ni les recommandations officielles, ni les manuels des fabricants,
> ni le jugement clinique. Les valeurs de programmation varient selon les modèles et versions logicielles.
