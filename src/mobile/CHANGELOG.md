# PK Reader Android

## [2026.10.51] - 2026-10-18

### Changed
- **Version unique et vérifiable** : `package.json` est la seule source de vérité — le nom du fichier APK (`PK-Reader-2026.10.51-debug.apk`), son `versionName` Android, l'artefact GitHub et la version affichée dans l'app portent le même numéro. Le workflow refuse un APK dont la version ne correspond pas.
- La version est visible dans l'app : en bas de la bibliothèque, dans l'en-tête des Réglages et dans À propos.

## [2026.10.50] - 2026-10-18

### Added
- **Lecture page à page** : chaque chapitre se découpe en vraies pages qui tiennent dans l’écran, tournées au doigt, au bouton ou au clavier ; le chapitre s’ouvre sur sa page de titre et le numéro de page reste visible. Le défilement continu reste disponible dans Apparence.
- **Barre « en cours »** : dès que vous quittez la phrase lue — défilement libre ou pages feuilletées — une barre basse rappelle la phrase en cours et ramène au fil de la lecture d’un geste.
- **Chapitre précédent / suivant** dans l’en-tête du lecteur, à côté de la liste des chapitres.
- **Changement de voix dans le lecteur** : une feuille du bas liste clones, voix Piper installées et voix du téléphone, appliquées immédiatement à l’écoute en cours.
- **Crédits & inspirations** dans les Réglages : TTS Reader Pro, Readexa et les bibliothèques tierces.

### Changed
- Bibliothèque repensée : carte « Reprendre » avec anneau de progression et temps restant, étagère plus aérée, badge « Terminé », apparitions en cascade et thèmes clair/papier/nuit raffinés.
- Le suivi automatique du texte se suspend dès que vous prenez la main et ne reprend qu’au retour explicite sur la phrase lue.

## [2026.10.49] - 2026-10-18

- Tests Android ciblés sur le module applicatif ; vérification du démarrage du lecteur et de la lecture écran éteint.
- Bouton Retour Android, barres système adaptées au thème, écran de lancement et message de fin de préparation.
- Documentation FR/EN et captures de l’interface mobile ; import EPUB/PDF, chapitres, signets et reprise contrôlés dans le navigateur.

## [2026.10.48] - 2026-10-18

- Build Android : installation explicite des SDK actuels, retrait des tests générés par le scaffold et prise en compte des marges système Android.
- Lecture : maintien du dernier chapitre à la fin du livre et ajustements de la bibliothèque mobile.

## [2026.10.47] - 2026-10-18

- Première application Android : bibliothèque locale, import EPUB/PDF/TXT/Markdown, lecteur à la phrase, chapitres, signets, reprise, thèmes et minuteur.
- Service audio natif, session média et commandes de notification ; voix Android et moteurs TTS installés.
- Téléchargement vérifié des modèles Piper Siwis, Tom et Lessac ; synthèse locale avec sherpa-onnx.
- Voix clonées du Mac via une passerelle limitée avec code de connexion ; cache audio et préparation de chapitre.
- APK de développement construit dans GitHub Actions, tests d’import et de passerelle, test Android de synthèse réelle et de lecture en arrière-plan.

La version Android est indépendante de la version macOS du CHANGELOG racine.
