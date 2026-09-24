# Challenge Rythmo

Application web progressive (PWA) pour s'entraîner en **rythmologie et stimulation cardiaque** en s'amusant :
ECG, programmation des stimulateurs et défibrillateurs (par marque), alertes de télécardiologie, électrophysiologie.
Entièrement en français, utilisable hors ligne, installable sur téléphone ou ordinateur, sans compte.

## Fonctionnalités

- **970 questions** réparties en 4 thèmes :
  - ECG (troubles de conduction, tachycardies, ECG du patient stimulé) — avec **tracés générés** dans l'application
    et **61 vrais ECG 12 dérivations** (base PTB-XL, PhysioNet, CC BY 4.0), **compas de mesure** et plein écran ;
  - Programmation PM / DAI / CRT : principes génériques et algorithmes propres à **Medtronic, Abbott, Boston Scientific, Biotronik, MicroPort** ;
  - Alertes de télécardiologie : triage, conduite à tenir, organisation, cadre français ;
  - **Lecture d'EGM de boîtier** (151 questions, 98 sur tracé) : épisodes de télésurveillance, consultation de stimulateur,
    épisodes de défibrillateur, Holter implantable — EGM A, EGM VD, EGM de choc ou champ lointain et canal de marqueurs,
    centrés sur les pièges de la pratique courante ;
  - Électrophysiologie : mécanismes, EEP, ablation, antiarythmiques.
- **Types de questions** : QCU, QCM, vrai/faux, questions ouvertes (avec auto-évaluation).
- **Difficulté de 1 à 10** sur chaque question ; filtre libre (« entre 1 et 3 », « au-dessus de 3 », « 7 à 10 »…).
- **Modes** : **défi adaptatif** (niveau estimé type Elo, questions juste au-dessus de votre niveau), défi aléatoire,
  défi du jour, lecture d'ECG, **mode examen** chronométré (correction à la fin), entraînement ciblé (thèmes, marques,
  types, sous-thèmes, niveau), révisions de ses erreurs (répétition espacée), nouveautés, **fiches** consultables avec recherche.
- **Correction didactique** : explication, commentaire pour **chaque proposition**, message « À retenir », sources cliquables,
  date de relecture et recommandations de référence, bouton **« Signaler une erreur »** (issue GitHub pré-remplie).
- **Progression** : niveau estimé global et par thème, grades, badges, réussite par thème et par niveau, jours consécutifs,
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

### Se tenir à jour

Chaque question porte `revise` (date de relecture) et `reco` (recommandations de référence). Quand une recommandation
change, la page « Sources » liste le nombre de questions concernées ; on les retrouve par `grep` sur `reco`.
Dernière veille : septembre 2026 (ESC 2026 insuffisance cardiaque et MCV-maladie rénale, consensus ESC/EHRA 2025
stimulation du système de conduction) — questions mises à jour et `data/questions/maj-2026.json`.

### Sources et relecture

Les questions s'appuient uniquement sur des sources scientifiquement validées, consultées en lecture seule :
recommandations ESC/EHRA (stimulation et CRT 2021, arythmies ventriculaires 2022, FA 2024, TSV 2019, syncope 2018),
HRS/APHRS/LAHRS (stimulation physiologique 2023, télésurveillance 2023, programmation des DAI 2015/2019),
essais publiés (références DOI/PubMed vérifiées), manuels techniques officiels des fabricants et textes réglementaires français.
Chaque fichier a été relu par un agent « rythmologue français » (exactitude médicale, formulations naturelles
plutôt que traduites mot à mot, cohérence des niveaux et des tracés, vérification des sources).

> **Outil pédagogique** : il ne remplace ni les recommandations officielles, ni les manuels des fabricants,
> ni le jugement clinique. Les valeurs de programmation varient selon les modèles et versions logicielles.
