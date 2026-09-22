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

Si le preset ne suffit pas, **décrire le tracé dans l'énoncé** plutôt que de forcer un preset inadapté.

## Sources acceptées

Uniquement des sources scientifiquement validées, consultées en lecture seule (aucune création de compte) :
recommandations ESC/EHRA, ACC/AHA/HRS, HAS, SFC ; articles indexés (PubMed, DOI) ; manuels techniques
officiels des fabricants ; ouvrages de référence reconnus. Pas de blog, forum ou site non validé.
