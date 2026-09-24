# Format de la base de questions

Chaque fichier `data/questions/<nom>.json` contient **un tableau JSON** de questions.
Le fichier `data/questions/index.json` liste les fichiers à charger.

## Schéma d'une question

```json
{
  "id": "ecg-cond-001",
  "theme": "ecg",
  "sousTheme": "Blocs auriculo-ventriculaires",
  "marque": null,
  "type": "qcu",
  "difficulte": 4,
  "question": "Énoncé en français.",
  "ecg": { "preset": "bav2-m1", "fc": 75, "cycle": 4 },
  "options": ["Proposition A", "Proposition B", "Proposition C", "Proposition D"],
  "reponses": [1],
  "reponseAttendue": null,
  "explication": "Explication didactique (3 à 8 phrases) : contexte, pourquoi la bonne réponse est juste, pourquoi les pièges sont faux, message à retenir.",
  "aRetenir": "Une phrase courte, le message clé.",
  "sources": [
    { "titre": "2021 ESC Guidelines on cardiac pacing and cardiac resynchronization therapy. Eur Heart J 2021;42:3427-3520", "url": "https://doi.org/10.1093/eurheartj/ehab364" }
  ]
}
```

| Champ | Obligatoire | Détail |
|---|---|---|
| `id` | oui | unique, préfixe du fichier + numéro sur 3 chiffres |
| `theme` | oui | `ecg`, `programmation`, `telecardio`, `electrophysio` |
| `sousTheme` | oui | libellé français court, réutilisé à l'identique dans un même fichier |
| `marque` | non | `Medtronic`, `Abbott`, `Boston Scientific`, `Biotronik`, `MicroPort` ou `null` (générique) |
| `type` | oui | `qcu` (une seule bonne réponse), `qcm` (plusieurs bonnes réponses), `vf` (vrai/faux), `ouverte` |
| `difficulte` | oui | entier 1 à 10 (1 = étudiant/IDE débutant, 5 = interne/technicien confirmé, 8 = rythmologue, 10 = expert pointu) |
| `question` | oui | énoncé |
| `ecg` | non | tracé généré par l'application (voir presets ci-dessous) |
| `options` | qcu/qcm/vf | pour `vf` : exactement `["Vrai", "Faux"]` |
| `reponses` | qcu/qcm/vf | indices (base 0) des bonnes options |
| `reponseAttendue` | ouverte | réponse modèle courte (l'utilisateur s'auto-évalue) |
| `explication` | oui | didactique, en français naturel |
| `aRetenir` | oui | message clé en une phrase |
| `sources` | oui | au moins une source fiable (recommandations, articles indexés, manuels constructeur officiels) |

## Tracés ECG générés (`ecg`)

L'application dessine une bande de rythme (dérivation type DII, 25 mm/s, ~10 s) à partir d'un *preset*.
Paramètres communs optionnels : `fc` (fréquence en bpm), `legende` (texte affiché sous le tracé).

| preset | paramètres optionnels | description |
|---|---|---|
| `sinus` | `fc`, `pr` (ms), `qrs` (`fin`/`large`) | rythme sinusal |
| `bav1` | `fc`, `pr` | BAV 1er degré |
| `bav2-m1` | `fc`, `cycle` (ex. 4 = Wenckebach 4:3) | BAV 2 Mobitz I |
| `bav2-m2` | `fc`, `ratio` (1 P bloquée toutes les n) | BAV 2 Mobitz II |
| `bav2-21` | `fc` (fréquence atriale) | BAV 2:1 |
| `bav3` | `fc` (atriale), `fv` (ventriculaire), `qrs` (`fin`/`large`) | BAV complet |
| `pause-sinusale` | `fc`, `pause` (ms) | pause / BSA |
| `esa` | `fc` | extrasystoles atriales |
| `esv` | `fc`, `bigeminisme` (bool) | extrasystoles ventriculaires |
| `fa` | `fc` (réponse ventriculaire moyenne), `qrs` | fibrillation atriale |
| `flutter` | `conduction` (2, 3, 4 ou `variable`) | flutter typique ~300/min |
| `tsv` | `fc` | tachycardie jonctionnelle / réciprocante régulière à QRS fins |
| `wpw` | `fc` | préexcitation (PR court, onde delta) |
| `tv` | `fc` | tachycardie ventriculaire monomorphe |
| `torsades` | — | torsades de pointes |
| `fv` | — | fibrillation ventriculaire |
| `aai` | `fc` | stimulation atriale, conduction AV spontanée |
| `vvi` | `fc` | stimulation ventriculaire, fond de FA |
| `ddd` | `fc`, `av` (ms) | stimulation double chambre (A + V stimulés) |
| `vdd` | `fc`, `av` | P sinusale détectée + V stimulé |
| `crt` | `fc` | stimulation biventriculaire (QRS stimulé relativement fin) |
| `perte-capture-v` | `fc` | spikes V non suivis de QRS (perte de capture) |
| `perte-capture-a` | `fc` | spikes A non suivis d'onde P |
| `sous-detection` | `fc` | spikes émis malgré une activité spontanée (sous-détection) |
| `sur-detection` | `fc` | pause sans spike (inhibition inappropriée) |
| `ttre` | `fc` | tachycardie par réentrée électronique (V stimulé à la fréquence max) |
| `fusion` | `fc` | spikes V tombant dans un QRS spontané (fusion/pseudo-fusion) |
| `asystolie` | — | asystolie avec P isolées éventuelles |

L'énoncé ne doit **pas décrire le tracé** (c'est à l'utilisateur de le lire) ; la `legende` ne doit pas donner la réponse.
Si aucun preset ne convient, préférer un vrai ECG (`ecg12`) ou une question sans tracé.

## Règles de construction (contrôlées par `scripts/audit-biais.mjs`, bloquant en CI)

- QCU : propositions homogènes (longueur, précision) ; la bonne réponse n'est la plus longue que dans ≤ 35 % des QCU d'un fichier, rapport médian de longueur ≤ 1,3 ; distracteurs plausibles ; position de la bonne réponse équilibrée.
- QCM : nombre de bonnes réponses varié ; au plus 35 % des QCM avec n-1 bonnes réponses ; jamais toutes justes.
- Vrai/faux : entre 35 et 65 % de « Vrai » par fichier.
- `commentaires` : une phrase par proposition (« Juste : … » / « Faux : … »).

## Sources acceptées

Uniquement des sources scientifiquement validées, consultées en lecture seule (aucune création de compte) :
recommandations ESC/EHRA, ACC/AHA/HRS, HAS, SFC ; articles indexés (PubMed, DOI) ; manuels techniques
officiels des fabricants ; ouvrages de référence reconnus. Pas de blog, forum ou site non validé.

## Champs complémentaires

| Champ | Détail |
|---|---|
| `commentaires` | tableau de même longueur que `options` : une phrase par option expliquant pourquoi elle est juste ou fausse (affiché après la réponse) |
| `ecg12` | vrai ECG 12 dérivations : `{ "fichier": "ptbxl-00123", "legende": "…" }` → fichier `data/ecg/ptbxl-00123.json` |
| `revise` | date de dernière relecture scientifique, `AAAA-MM` |
| `reco` | recommandation(s) de référence, ex. `["ESC 2021 stimulation"]` (sert à retrouver les questions à revoir quand une recommandation change) |

### Fichier ECG 12 dérivations (`data/ecg/<id>.json`)

```json
{
  "id": "ptbxl-00123",
  "source": "PTB-XL 1.0.3 (PhysioNet, CC BY 4.0), enregistrement 00123",
  "fs": 250,
  "unite": "uV",
  "derivations": ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"],
  "signaux": [[...], ...]
}
```
`signaux` : 12 tableaux d'entiers (µV), 10 s à `fs` Hz (2500 points), ligne de base corrigée.

## Tracés EGM de boîtier (`egm`)

`"egm": { "preset": "tv-atp", "appareil": "dai", "legende": "…" }` — l'application dessine 8 s d'EGM à 25 mm/s : EGM A bipolaire,
EGM VD bipolaire, EGM de choc (DAI) ou « EGM champ lointain » (stimulateur), puis le **canal de marqueurs** (marqueurs atriaux
au-dessus de la ligne avec l'intervalle A-A, ventriculaires au-dessous avec l'intervalle V-V, en ms ; étiquettes
d'événement en bleu : MS, SV, ATP, Chg, CD, SVT, Pause, FA). Les Holter implantables n'ont qu'un canal « ECG sous-cutané ».
Aperçu : `tests/egm-galerie.html`. Marqueurs : AS/AP (A détecté/stimulé), AR (A détecté en période réfractaire),
VS/VP (V détecté/stimulé), BV (stimulation biventriculaire), TS/TD (détection/diagnostic zone TV), FS (zone FV),
TP (impulsions d'ATP), MS (mode switch), SV (stimulation ventriculaire de sécurité), Chg (charge), CD (choc délivré).

| preset | paramètres | ce que montre le tracé |
|---|---|---|
| `ddd-as-vp` | `fc`, `av` | P détectées, V stimulé après le délai AV (suivi atrial) |
| `ddd-as-vs` | `fc`, `pr` | P détectées, conduction AV spontanée (VS) |
| `ddd-ap-vp` | `fc`, `av` | stimulation séquentielle A puis V |
| `fa-mode-switch` | — | rythme sinusal suivi, puis FA (activité A rapide, AS/AR), VS irréguliers, marqueur MS |
| `flutter-blanking` | `cycle` (ms, défaut 250) | flutter 2:1 : une onde F sur deux tombe dans le blanking post-ventriculaire → A-A affiché ≈ 2 × cycle, pas de mode switch |
| `far-field-r` | `fc` | onde R lointaine détectée sur le canal A (AR juste après chaque VS) → double comptage atrial |
| `tv-atp` | `cycle` (défaut 330) | TV monomorphe V > A (A sinusal 800 ms dissocié), TS puis TD, ATP (8 impulsions à 88 %), retour en rythme sinusal |
| `fv-choc` | — | FV (FS, cycles ≈ 200-240 ms), Chg, choc (CD), puis stimulation VVI |
| `fa-conduite-zone-tv` | — | FA (activité A rapide), V irrégulier ≈ 300-440 ms classé TS : fausse détection de TV |
| `tsv-1-1` | — | tachycardie 1:1 à accélération progressive (A = V, 150 ms A-V), marqueur SVT (thérapie retenue) |
| `bruit-sonde` | — | salves de signaux non physiologiques sur l'EGM VD seul (FS à intervalles très courts), EGM de choc normal |
| `surdetection-t` | — | onde T ample sur l'EGM VD détectée (TS 300 ms après chaque VS) → double comptage ventriculaire, EGM de choc sinusal |
| `myopotentiels` | — | patient stimulé (VP), bruit de myopotentiels détecté (VS) → inhibition et pause ; P sinusales visibles (BAV) |
| `perte-capture-v` | — | VP réguliers, 3 impulsions sans réponse évoquée (EGM VD et EGM de choc) sur fond de BAV complet |
| `ttre` | — | ESV → P rétrograde détectée (AS) → VP à la fréquence maximale de suivi (500 ms), boucle entretenue |
| `crosstalk-vsp` | — | AP ; parfois un signal détecté sur le canal V juste après AP (VS) → VP à AV court (≈110 ms), marqueur SV |
| `sous-detection-a` | — | P de faible amplitude non détectées (pas de marqueur), fréquence de base non remise à zéro → AP compétitifs, parfois sans capture ; V toujours stimulé |
| `wenckebach-electronique` | — | sinus ≈ 135 bpm > fréquence max de suivi 120 bpm : VP limités à 500 ms, allongement AS-VP puis P non suivie (AR) |
| `crt-perte-biv` | — | stimulation BV, une ESV (VS) un cycle sur trois → perte de stimulation biventriculaire |
| `ilr-fausse-pause` | — | Holter implantable : QRS de faible amplitude non détectés → « Pause » alors que les QRS sont visibles |
| `ilr-vraie-pause` | — | Holter implantable : P visibles non suivies de QRS ≈ 4,9 s (BAV paroxystique) |
| `ilr-fausse-fa` | — | Holter implantable : irrégularité par ESA fréquentes, P visibles, classé « FA » à tort |

`appareil` (`dai` ou `pm`) fixe le libellé du 3e canal ; par défaut `dai` pour tv-atp, fv-choc, fa-conduite-zone-tv, tsv-1-1,
bruit-sonde et surdetection-t, `pm` pour les autres.
`sous-detection-a` : sinus 78/min, une P sur trois détectée, AP compétitifs à la fréquence de base (1000 ms), V toujours stimulé.

Comme pour l'ECG, l'énoncé ne décrit pas le tracé : c'est à l'utilisateur de le lire.
