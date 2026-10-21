# PK Reader Android

## [2026.10.55] - 2026-10-21

### Added
- **Quatre voix françaises supplémentaires** : Gilles (homme, Piper low) et **UPMC** en deux timbres (Jessica et Pierre, modèle multi-locuteurs) rejoignent Siwis et Tom. Le moteur accepte désormais le locuteur d'un modèle multi-voix (`sid`), et les deux entrées UPMC partagent un seul téléchargement (22 Mo).
- **Filtre par langue des voix du téléphone** : seules les voix françaises (et la voix active) s'affichent par défaut ; les autres langues du système sont repliées derrière « Afficher les N voix dans d'autres langues », mémorisé.
- **Vitesse à côté de la voix** : la vitesse passe dans la pastille du lecteur, contre le nom de la voix, et devient **propre à chaque voix** — Alice à 1,20×, le narrateur à 1,0× ; changer de voix retrouve sa vitesse.

### Fixed
- **Jaquettes** : les couvertures importées ne sont plus recadrées (`object-fit: contain`) et le fond bleu de la couverture générée ne déborde plus autour de l'image.

## [2026.10.54] - 2026-10-21

### Added
- **Attribution des voix par l'analyse du studio** : dans « Personnages & voix » → Attribution des passages, un bouton **« Analyser ce chapitre avec le studio »** envoie les phrases du chapitre au Mac connecté. Le studio détecte les personnages et le **sexe de leur voix** (la même analyse que sur l'ordi), puis chaque phrase reçoit son personnage. On choisit les voix **narrateur / masculine / féminine** avant l'analyse ; tout reste modifiable ensuite, phrase par phrase.
- **Karaoké mot à mot** : pendant la lecture, la phrase en cours est rendue mot par mot et le mot prononcé est surligné. Le TTS Android donne la plage exacte du mot (`onRangeStart`) ; une voix Piper ou clonée est estimée d'après la position et la durée du WAV.
- Le suivi de lecture diffuse sa progression (~5 fois par seconde) sans redessiner la page : position, durée, mot courant.

### Changed
- Le surlignage de la phrase en cours devient discret (un filet à gauche, plus le bloc bleu) : le mot lu porte l'attention — on garde le fil sans perdre le fil de la page.
- La proposition d'attribution hors ligne reste disponible (« Proposer les attributions localement »), en repli quand le Mac n'est pas connecté.

## [2026.10.53] - 2026-10-19

### Added
- **Une voix par personnage, sur le téléphone** : la feuille « Personnages & voix » (icône Personnages dans l’en-tête du lecteur, ou depuis « Changer de voix ») attribue à chaque rôle sa voix — voix du téléphone ou voix Piper installée — avec son pitch (grave ↔ aigu) et sa vitesse, comme l’attribution du studio. Les modèles Piper restent chauds en cache (jusqu’à trois voix cohabitent) : passer d’un personnage à l’autre ne recharge plus le modèle.
- **Attribution des passages** : phrase par phrase, chapitre par chapitre, avec « Proposer les attributions de ce chapitre » — l’aide locale reconnaît les noms explicites (« Pierre : », « dit Pierre ») et ne devine jamais les dialogues ambigus ; les choix manuels sont conservés. « Écouter un exemple » teste chaque rôle avant d’enregistrer.
- **Le personnage en cours s’affiche** dans la pastille de voix, dans le statut du lecteur et dans la barre « EN COURS » (chapitre · personnage).
### Changed
- Préparer un chapitre hors ligne exige une voix Piper pour chaque rôle utilisé : le message le dit au lieu d’échouer en cours de route, et le cache audio distingue la voix de chaque passage.
- L’attribution locale reste sur l’appareil : une voix clonée nécessite le Mac, elle n’est pas proposée comme rôle local.

## [2026.10.52] - 2026-10-18

### Changed
- **APK publié en release à chaque build** : le workflow crée (ou met à jour) la prerelease `pk-<version>` avec l’APK `PK-Reader-<version>-debug.apk` en pièce jointe — lien direct téléchargeable depuis le téléphone, sans session GitHub ni ZIP d’artefact à décompresser. Le résumé du run affiche le lien.

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
