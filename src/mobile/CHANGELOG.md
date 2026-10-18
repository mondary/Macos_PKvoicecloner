# PK Reader Android

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
