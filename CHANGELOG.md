# Changelog
Keep a Changelog — https://keepachangelog.com

## [2026.10.68] - 2026-10-22

### Changed
- **PK Reader Android 2026.10.60 analyse les livres sans le Mac** : personnages, sexe des voix et attribution des dialogues sont déduits sur le téléphone (lexique de prénoms embarqué, titres, incises, alternance des répliques). La passerelle `/api/attribuer` reste disponible comme affinage facultatif.

## [2026.10.67] - 2026-10-22

### Changed
- **Préparation automatique des livres Android (2026.10.59)** : `/api/attribuer` accepte la distribution déjà rencontrée pour conserver les identités entre les chapitres. Le tagage transmet le contexte précédent et réutilise immédiatement les nouveaux locuteurs.
- La passerelle mobile valide et transmet jusqu’à 200 personnages connus. Les réponses IA doivent contenir exactement un locuteur par phrase ; une réponse tronquée est rejetée et le téléphone peut reprendre le lot.

## [2026.10.66] - 2026-10-21

### Added
- **Mode lecteur dans le studio** : l'étape ④ d'un chapitre ouvre « Ouvrir le lecteur » — un chapitre entier en plein écran comme un livre. Texte serif, blocs regroupés par personnage avec le nom du rôle, clic sur une phrase pour l'écouter, transport segment précédent / lecture / suivant, sauts **page** et **paragraphe**, taille du texte (A−/A+), mode focus. Le **karaoké mot à mot** est estimé sur la durée du WAV, et le suivi ne recadre que lorsque le mot sort de la zone de confort.
- **Lecture à la volée par fenêtre** : quand un segment n'a pas encore son audio, le lecteur demande au serveur une fenêtre de **6 phrases** seulement (voix de chaque rôle, `respecter_segments`) — le moteur n'est jamais mobilisé pour tout un chapitre, et la fenêtre glisse au fur et à mesure.
- `POST /api/lire` accepte `respecter_segments` : le lecteur envoie des phrases déjà découpées (comme le studio), elles sont synthétisées telles quelles — l'alignement segment ↔ phrase ↔ voix est garanti.

## [2026.10.65] - 2026-10-21

### Changed
- **Erreurs d'IA lisibles** : une limite d'usage (429, quota, rate limit) devient « Le fournisseur IA a atteint sa limite d'usage — attends le renouvellement du quota ou choisis un autre provider dans Réglages IA » et une clé refusée son propre message, à la place du JSON brut — dans l'analyse des livres comme dans `/api/attribuer` (429 explicite). `ia.message_lisible` centralise la traduction.
- Côté Android (2026.10.57) : mode focus du lecteur, interligne, marges et zone de suivi réglables, italiques et citations de l'EPUB conservées, paragraphes reconstitués pour les anciens livres.

## [2026.10.64] - 2026-10-21

### Changed
- **Le studio est dans la fenêtre principale de l'app** : au lancement, l'app s'ouvre directement sur l'atelier complet (voix, texte, livres, modèles) — plus besoin de chercher une fenêtre séparée. La barre native garde les versions, l'état du serveur, « Ouvrir dans une fenêtre » et Éteindre ; Vue d'ensemble et Réglages restent dans la barre latérale.
- Côté Android (2026.10.55) : jaquettes non recadrées et sans bord bleu, **quatre voix françaises supplémentaires** (Gilles, UPMC Jessica et Pierre — multi-locuteurs, un seul téléchargement), filtre par langue des voix du téléphone, vitesse déplacée à côté de la voix et **mémorisée par voix**.

## [2026.10.63] - 2026-10-21

### Added
- **Analyse des personnages pour le téléphone** : le studio expose `POST /api/attribuer` — il reçoit les phrases du chapitre telles que le lecteur Android les a découpées et rend la distribution (personnages, sexe de leur voix) puis un locuteur par phrase, dans l'ordre exact. La passerelle mobile l'expose avec sa propre validation (400 phrases de 600 caractères maximum, 600 s de délai) ; l'IA du studio fait le travail, rien ne tourne sur le téléphone.
- `livres.attribuer_telephone` réutilise la détection de distribution et le classement des genres du studio, avec un tagage par lots de 40 lignes qui garantit l'alignement un-pour-un avec les segments Android.

### Changed
- Le lecteur Android diffuse sa progression de lecture (position, durée, plage du mot prononcé) pour le karaoké mot à mot ; le TTS donne les plages exactes, les voix Piper sont estimées au prorata.

## [2026.10.62] - 2026-10-21

### Changed
- **La règle vaut aussi pour macOS** : le script de release marque désormais la release stable `v<version>` comme **Latest** à sa publication — la dernière version publiée, Android ou macOS, reste celle qui s'affiche en premier (le canal Dev reste une prérelease sans badge).

## [2026.10.61] - 2026-10-21

### Changed
- **La dernière livraison Android est la release visible** : chaque APK `pk-<version>` est publié en release complète marquée **Latest** — GitHub refuse ce badge aux préreleases, et la page des releases épinglait donc la macOS 2026.10.45 au-dessus des APK. Titre explicite (« PK Reader Android · 2026.10.53 · une voix par personnage ») et notes reprises de la section correspondante du changelog Android. La release 2026.10.53 a été convertie et re-titrée dans la foulée.

## [2026.10.60] - 2026-10-19

### Added
- **Lecture au fil de l’eau** — un bouton **Lire** à côté de Générer : le texte se lit pendant qu’il se synthétise. Le serveur le découpe en phrases, la première s’écoute dès qu’elle est prête et les suivantes se préparent pendant ce temps. Mesuré sur ce Mac : **0,13 s par phrase** avec une voix Piper (instantané), **~8 s pour la première phrase** puis ~7 s par phrase avec une voix clonée (48 kHz, cache de voix compris) — au lieu d’attendre la prise entière.
- **Lire un chapitre en direct** (studio web, étape ④ Écoute) : le chapitre entier se lit avec la voix de chaque rôle **sans générer un seul segment** — l’écoute avant la génération, puis la génération pour l’export.
- **Lire dans l’app native** : même bouton dans Texte → Voix, avec « Lecture · phrase 2 / 12 » et un arrêt immédiat.
- La lecture expose son état (`/api/lire/{id}`), ses phrases en WAV individuel et son arrêt (`/api/lire/{id}/arreter`).

### Changed
- **Le cache de voix du clonage n’est plus reconstruit à chaque phrase** : l’encodage de la référence (`build_prompt_cache`, ~7 s) est fait une fois par voix et réutilisé par toutes les phrases, à la génération comme à la lecture. Sur un chapitre de 100 segments, c’est des minutes rendues.
- La lecture utilise la synthèse streamée : le premier morceau audible tombe pendant la phrase au lieu d’attendre sa fin.

### Fixed
- **Plus de double chargement du modèle** : au démarrage, une génération Piper pouvait lancer un second chargement de VoxCPM2 alors que le premier était en cours — deux modèles de 5 Go sur MPS, et l’assertion Metal qui fait tomber le serveur au milieu d’une synthèse (reproduit). Un moteur ne se charge plus qu’une fois à la fois, et jamais pendant une synthèse.

## [2026.10.59] - 2026-10-18

### Fixed
- **Une phrase Piper ne coûte plus une minute** : les voix Piper vivaient à la place du moteur de clonage — un livre qui mélange clone (narrateur) et voix Piper (personnages) déchargeait et rechargait le gros modèle à chaque changement de famille de voix, soit 1 à 2 minutes par segment. Les voix Piper sont désormais co-résidentes (cache dédié à côté du moteur de clonage, jamais déchargé par une génération) : un segment Piper part immédiatement et le moteur de clonage reste chaud pour les segments clonés.

### Added
- **Temps de synthèse affiché** : chaque segment terminé montre son temps réel (« Segment 12 prêt · synthèse 0,4 s ») et le job expose la répartition attente / synthèse / total — la performance se lit au lieu de se deviner.

## [2026.10.58] - 2026-10-18

### Added
- **Pitch ♪ et vitesse » par voix dans l'attribution** : chaque rôle garde sa hauteur (×0,70–×1,40) et son débit (×0,75–×1,50) à côté de sa voix — une seule voix en stock peut jouer toute la distribution : narrateur à ×1,20, protagoniste à ×0,80. Un bouton « ▶ Tester » écoute chaque rôle avec ses réglages avant de générer le moindre segment, et l'étape ① du chapitre ouvre directement ces réglages.

### Changed
- Les segments appliquent automatiquement le pitch et la vitesse de leur rôle ; modifier un réglage marque les audios concernés comme à regénérer (l'empreinte du segment change). Le serveur valide les plages (vitesse 0,75–1,50 · tonalité ±12 demi-tons) et les réglages survivent à une réattribution automatique des voix.

## [2026.10.57] - 2026-10-18

### Added
- **Lien APK direct à chaque livraison Android** : le workflow Android Reader publie désormais l’APK versionné sur la prerelease `pk-<version>` (ex. `PK-Reader-2026.10.52-debug.apk`), téléchargeable publiquement depuis un téléphone ; le résumé du run affiche le lien.

## [2026.10.56] - 2026-10-18

### Changed
- **Modèles du studio web : une couleur par action**, alignée sur l'app native. **Installer** est un vrai bouton plein — ce n'était qu'un lien souligné avec un survol rouge, l'action principale passait complètement inaperçue ; **Activer** passe au vert, **Désactiver** reste neutre, **Réessayer** (après un échec) s'affiche en rouge.

## [2026.10.55] - 2026-10-18

### Changed
- **Le chapitre suit enfin une séquence lisible** (studio web) : ① Attribution des voix → ② Découpage en phrases → ③ Génération audio → ④ Écoute → ⑤ Export. Chaque étape est numérotée, avec ses boutons, son état, et les étapes verrouillées disent pourquoi (« dès que le chapitre est généré en entier »).
- **Générer un chapitre entier d'un seul bouton** : « Générer le chapitre » — l'action principale, en noir — produit tous les segments manquants avec la voix de chaque rôle ; **« Tester sur 20 lignes »** donne d'abord un échantillon à écouter, et le compteur « n / m segments générés » suit l'avancement.
- « Exporter le chapitre » ne traîne plus au milieu : il ferme la marche, après l'écoute, et reste verrouillé tant que le chapitre n'est pas complet.
- « Vérifier l'attribution (local) » rejoint l'étape d'attribution qu'elle contrôle, et « Tout automatiser ce chapitre » devient un raccourci explicite sous la séquence (analyse → phrases → voix).

## [2026.10.54] - 2026-10-18

### Changed
- **« Ouvrir le studio web » devient l'action principale de l'app** : un grand bouton plein en tête de la Vue d'ensemble (avec la ligne « Voix, texte, livres et modèles »), doublé d'un raccourci dans la barre fixe du haut. Le doublon qui traînait dans État du studio est supprimé, et l'icône comme l'aide disent enfin ce que le bouton fait : ouvrir l'atelier dans une fenêtre du studio.

## [2026.10.53] - 2026-10-18

### Fixed
- **« Activer » charge vraiment le modèle** : pour la transcription (Whisper, Parakeet), l'activation ne se contentait d'enregistrer un choix — le modèle se charge maintenant pour de bon dans son environnement, les poids montés et vérifiés, et l'attente est visible dans la liste (« Chargement… », message « Préparation de la transcription… »). Un échec de préparation remonte avec sa cause.
- La liste des modèles montre l'état réel de chargement d'un moteur TTS déjà installé au lieu de laisser le bouton « Activer » affiché pendant le chargement.

## [2026.10.52] - 2026-10-18

### Changed
- Vue d'ensemble resserrée : **« Activité récente » disparaît** — les livres vivent dans l'onglet Livres et les prises dans leur section — et **État du studio** occupe toute la largeur, voix active comprise.
- **Une couleur par action sur les modèles** : Installer (bleu), Activer (vert), Désactiver (orange), Réessayer (rouge) — dans la liste des modèles comme dans les raccourcis de l'état du studio.

## [2026.10.51] - 2026-10-18

### Added
- **Tout automatiser** (studio web) : un bouton par chapitre ou pour tout le livre enchaîne la séquence complète — analyse IA si nécessaire, découpe phrase par phrase, puis **attribution automatique des voix** selon le genre des personnages (le narrateur d'abord, voix féminines/masculines respectées, réutilisation des voix quand la distribution est trop courte).
- Les associations de voix faites à la main sont conservées ; à la fin, la notification indique combien de voix ont été attribuées et combien ont été réutilisées.

## [2026.10.50] - 2026-10-18

### Changed
- L'app macOS redevient le tableau de bord du studio : **Vue d'ensemble réunit les tuiles et la gestion des modèles** (installer, activer, désactiver, renommer, supprimer) ; le studio web reste le poste de travail complet et la navigation native redondante (voix, texte, livres, modèles) disparaît.
- Une voix Piper multi-locuteurs affiche **une ligne par locuteur** (`upmc · jessica`, `upmc · pierre`) au lieu d'une liste déroulante ; l'aperçu ▶ suit le locuteur de la ligne.

### Added
- **Désactiver** un modèle actif : le moteur TTS est déchargé et sa mémoire libérée (Piper, VoxCPM2…), la transcription et Laya peuvent aussi être éteints — plus jamais de modèle actif sans bouton pour l'arrêter.
- **Tonalité** dans l'éditeur du studio web : curseur en demi-tons (−6 à +6) appliqué à la génération, en plus de la vitesse.

### Fixed
- « Désactiver » veut dire éteint : aucune bascule implicite ne recharge un moteur dans le dos ; une génération sans moteur chargé est refusée immédiatement avec un message clair, et une activation explicite rouvre la voie.
- La génération sans moteur chargé n'attend plus trois minutes avant d'échouer.

## [2026.10.49] - 2026-10-18

### Changed
- La bibliothèque de voix montre toujours **toutes les familles en sections** — « Mes voix » (clones) puis « Voix Piper » — avec une seule voix active toutes familles mêlées : le moteur de synthèse suit automatiquement la voix choisie à la génération.

### Added
- Bouton **« Voir les voix »** sur la carte Piper de l'onglet Modèles : il ouvre la bibliothèque de voix sur la section « Voix Piper », mise en surbrillance.

## [2026.10.48] - 2026-10-18

### Added
- Écoute d'aperçu des voix Piper : bouton ▶ dans la bibliothèque de voix, dans le catalogue et dans l'onglet Modèles — l'extrait (phrase d'exemple dans la langue de la voix) est synthétisé une fois puis mis en cache, locuteur compris.
- L'onglet Modèles décrit chaque famille — text-to-speech, speech-to-text, catégorisation — avec une icône et une phrase d'explication, et la carte Piper liste les voix téléchargées avec leur extrait d'écoute.

### Fixed
- Ouvrir un livre depuis l'app macOS ouvre le studio des livres **directement sur ce livre** (le bouton « Ouvrir le studio des livres » revient à la bibliothèque).
- Le fil d'Ariane ne bascule plus sur « Livres » lorsque la section affichée est Vue d'ensemble, Voix, Modèles ou Réglages.

## [2026.10.47] - 2026-10-18

### Added
- Moteur **Piper** : voix prêtes à l'emploi sans clonage, un catalogue de 177 voix (30+ langues) téléchargées à l'unité (20–80 Mo) dans le cache partagé, avec suivi des téléchargements et suppression individuelle.
- Les livres peuvent mêler clones et voix Piper : chaque personnage reçoit sa voix, y compris multi-locuteurs, et le moteur de synthèse suit automatiquement la voix demandée.

### Changed
- Normalisation française avant synthèse : « M. » devient « Monsieur », « Louis XVI » devient « Louis seize », « 1789 » devient « mille sept cent quatre-vingt-neuf », pourcentages, euros et degrés sont développés — le texte affiché dans le studio reste celui de l'utilisateur.
- « Redécouper phrase par phrase » sur un chapitre : les segments collés par une ancienne analyse sont rescindés en phrases complètes (coupées aux clauses si trop longues), sans nouvelle analyse IA ; les audios du chapitre deviennent à régénérer.

## [2026.10.46] - 2026-10-07

### Fixed
- Les actions de la barre des menus recréent la fenêtre du studio lorsqu’elle a été fermée et la restaurent lorsqu’elle est minimisée ou masquée.
- À propos, Réglages et Rechercher les mises à jour conservent leur destination jusqu’à l’ouverture de la fenêtre ; l’activation intervient après la fermeture du menu.
- Les actions du menu de l’application et la réouverture depuis le Dock utilisent le même gestionnaire de fenêtre.

## [2026.10.45] - 2026-10-07

### Changed
- Promotion de la version Dev validée en Stable 2026.10.45, avec archive Sparkle signée, DMG et installateur macOS.

### Fixed
- Menu contextuel au clic droit (et Ctrl-clic) sur l’icône de la barre des menus, avec accès au studio, aux réglages, aux mises à jour et à la page À propos.
- Fond du bloc Mises à jour et du pied de page À propos harmonisé avec celui des autres réglages, tout en conservant le bloc fixé en bas.
- Le script de release adopte la convention de commit PK pour la publication de l’appcast.

## [2026.10.44] - 2026-10-07

### Fixed
- Publication de l’appcast Dev depuis la dernière version de `main`, sans rebase conflictuel ; builds du flux sérialisés.

## [2026.10.43] - 2026-10-07

### Changed
- Le bloc Mises à jour reste fixé au-dessus du pied de page ; son descriptif Dev correspond à la branche `dev`.

## [2026.10.42] - 2026-10-07

### Changed
- Crédits & inspirations déplacés vers une section dédiée ; libellés Soutenir et Bibliothèque de projets localisés.
- Les builds du canal Dev sont désormais produits depuis la branche `dev`.

### Fixed
- Clic gauche sur l’icône waveform de la barre des menus ouvre à nouveau le studio.

## [2026.10.41] - 2026-10-07

### Fixed
- Visibilité de `versionStatus` alignée sur son type privé (échec de compilation CI détecté par type-check, invisible au parse local).

## [2026.10.40] - 2026-10-07

### Fixed
- Build CI corrigé : expansion du tableau SDK vide sous bash 3.2 avec set -u (idiome portable).

## [2026.10.39] - 2026-10-07

### Changed

- À propos et la sidebar des Réglages affichent une mise à jour disponible selon les numéros de build, comparent correctement les versions CalVer et rafraîchissent les appcasts avant le contrôle manuel.

## [2026.10.38] - 2026-10-07

### Added

- Icône native de barre des menus activée par défaut, avec options indépendantes pour l’affichage dans la barre des menus et le Dock.
- Pages À propos, Support et Project Library rapprochées de la mise en page PKmonitor, avec assets locaux et descriptif centré de l’auteur.
- Section Crédits dans À propos : moteurs/outils effectivement intégrés séparés des inspirations d’interface, avec liens vers leurs projets.

### Changed

- Réglages intégrés à la fenêtre principale ; About, Support et Project Library reprennent la structure PKmonitor.

## [2026.10.36] - 2026-10-07

### Added

- Fenêtre Réglages PK et canaux Stable/Dev Sparkle préparés, avec appcast Dev activable après configuration du secret GitHub `SPARKLE_PRIVATE_KEY`.

## [2026.10.35] - 2026-10-07

### Added

- **Gestionnaire de modèles par famille** : catalogue unifié TTS, speech-to-text et catégorisation, avec installation puis activation depuis le studio web et l'app native. Le choix de transcription est conservé entre les sessions ; Laya rejoint le catalogue de catégorisation.

### Fixed

- Installation de Parakeet Redux dans l'environnement ASR dédié, plutôt que dans celui du serveur TTS.

## [2026.10.34] - 2026-10-07

### Added

- **Parakeet Redux en option pour la transcription** : moteur alternatif à Whisper large-v3, les deux moteurs restent isolés dans l'environnement ASR dédié.

## [2026.10.33] - 2026-10-05

### Added

- **Export audiobook** : « Exporter le chapitre » concatène les segments générés en un WAV unique avec les pauses de ponctuation intégrées (virgule 220 ms, phrase 500 ms) ; « Exporter l'audiobook (M4B) » assemble tous les chapitres générés en un **M4B chapitré** (marqueurs de chapitres, pochette de l'EPUB si présente, titre et auteur en métadonnées), avec progression par chapitre et téléchargement direct. Les chapitres sans audio complet sont listés comme ignorés.

### Fixed

- Test d'analyse interrompue fiabilisé : le thread de reprise n'est plus lancé pour de vrai (il survivait au tearDown et retombait sur un appel réseau bloquant).

## [2026.10.32] - 2026-10-03

### Added

- **Contrôle d'attribution local avec Laya** : nouveau bouton « Vérifier l'attribution (local) » sur un chapitre analysé — un petit modèle embarqué (multilingue 322M, chargé une fois depuis le cache Hugging Face partagé) signale les segments « narrateur » qui contiennent probablement du dialogue. Zéro token, zéro cloud après le premier téléchargement ; les segments suspects sont surlignés dans la vue comparaison avec leur probabilité.

## [2026.10.31] - 2026-10-03

### Fixed

- Le panneau Modèles du studio web marque le moteur actif (« ● Actif ») dès le chargement, sans attendre une réinstallation.

## [2026.10.30] - 2026-10-03

### Changed

- **Panneau Modèles du studio web aligné sur l'app** : les quatre moteurs (VoxCPM2, dots.tts, Qwen3-TTS, Pocket TTS) apparaissent avec leur état — « Actif », bouton Activer, suppression des modèles optionnels et installation.
- **Réglages du studio web** : l'entrée est désormais collée en bas de la barre latérale, juste au-dessus de « Studio personnel ».
- **Liens externes** du studio intégré (Hugging Face, Ko-fi, hub d'applications PK, GitHub) : ils s'ouvrent dans le navigateur par défaut au lieu de rester sans effet.
- La section Livres de l'app affiche les **couvertures** des EPUB.

## [2026.10.29] - 2026-10-03

### Fixed

- **Écran blanc du studio web corrigé** : la fenêtre intégrée de l'app ne met plus le studio en cache (data store non persistant, requêtes sans cache) et retente automatiquement une minute quand le serveur local redémarre — une fenêtre ouverte pendant un arrêt/relance se reconnecte seule au lieu de rester blanche.

## [2026.10.28] - 2026-10-03

### Changed

- **Réglages regroupés, même écran dans l'app et le studio web** : entrée « Réglages » épinglée en bas de la barre latérale (au-dessus de « Studio personnel »), l'app et le web ont les mêmes sections — Providers IA (formulaire pleine largeur), Clé Hugging Face (déplacée depuis Modèles) et À propos (version, Ko-fi, hub PK, GitHub).
- **Navigation alignée** entre l'app native et le studio web : Vue d'ensemble, Bibliothèque de voix, Texte vers voix, Livres, Modèles, Réglages. L'app gagne la section Livres (liste + ouverture du studio dédié) ; « Bibliothèque des textes » devient « Prises générées » et rejoint Texte vers voix.
- Le bouton Réglages quitte le header de l'app ; le dropdown « Réglages IA » disparaît de la page Livres du studio web.

## [2026.10.27] - 2026-10-03

### Changed

- Les Réglages ne sont plus une fenêtre séparée : bouton ⚙ du header et section « Réglages » de la barre latérale affichent Clés API (providers IA) et À propos dans la fenêtre principale de l'app, au style du tableau de bord.

## [2026.10.26] - 2026-10-03

### Added

- **Réglages natifs** : bouton ⚙ dans la barre supérieure de l'app (et menu Réglages… ⌘,) ouvrant une fenêtre complète — gestion des providers IA et de leurs clés API (ajout, modification, test, activation, suppression), page À propos avec version, lien Ko-fi, hub d'applications PK et GitHub.

## [2026.10.25] - 2026-10-03

### Fixed

- Le studio livre s'ouvre dans une vraie fenêtre macOS redimensionnable avec contrôles natifs de fermeture, et non dans une feuille modale trop petite.

## [2026.10.24] - 2026-10-02

### Changed

- Le bouton « Ouvrir le studio web » de l'app macOS ouvre maintenant le studio livre dans une fenêtre intégrée WKWebView au lieu d'envoyer vers Safari.

## [2026.10.23] - 2026-10-02

### Added

- Écoute continue des segments d'un chapitre avec pauses de respiration différenciées selon la ponctuation ; lecture interruptible.

## [2026.10.22] - 2026-10-02

### Changed

- Association des rôles colorée selon le genre de voix, formulaire pleine largeur et bouton d'enregistrement renforcé.
- Contrôles des segments différenciés : « Générer » avant la première synthèse, lecteur audio et « Régénérer » lorsqu'un rendu existe.
- Erreur explicite dans Réglages IA quand l'ancien serveur ne possède pas encore l'API multi-profils.

## [2026.10.21] - 2026-10-02

### Changed

- Version du studio web affichée dans l'en-tête supérieur sticky, visible pendant le défilement et dans la page dédiée d'un livre ; le pied de page conserve également la version.

## [2026.10.20] - 2026-10-02

### Added

- **Providers IA multiples** : ajouter, modifier, tester, activer et supprimer plusieurs profils (endpoint, modèle, clé masquée) ; Ollama local accepte une clé vide et les permissions du fichier de configuration sont limitées au compte courant.
- **Modèle local conseillé** : aide intégrée pour Ollama + Qwen3 4B quantifié, avec endpoint, commande de téléchargement et conseils mémoire/contexte.
- **Page livre plein écran** : navigation latérale masquée dans le livre, liste de chapitres compacte à gauche et lecteur à droite ; le premier chapitre s’ouvre à l’entrée.
- **Statut par chapitre** : état d'analyse, voix détectées, segments détectés et audios générés ; état audio conservé dans le projet pour survivre au rechargement.
- Le post-traitement sépare désormais côté serveur les phrases fusionnées par le modèle pour maintenir une unité audio par phrase.

### Fixed

- Alignement original/segments par similarité de texte : plusieurs phrases source peuvent correspondre à un segment IA fusionné ; les segments vides ne créent plus de fausses lignes/IDs et les phrases source restantes sont signalées explicitement.

## [2026.10.19] - 2026-10-02

### Added

- **Comparaison originale / structure IA** : conservation du texte source à l'import et affichage en deux colonnes synchronisées ; chaque phrase attribuée reçoit son numéro d'ordre dans le chapitre.
- **Attribution des voix et génération par segment** : associer chaque rôle à une voix de la bibliothèque, lancer une phrase seule ou générer le lot séquentiellement ; les WAV prêts restent accessibles par lecteur dans la comparaison.
- Feedback de fin d'analyse avec total de tokens ; progression plus fine par extrait et phase courante affichée. Les réponses OpenAI-compatibles fournissant `usage` alimentent le compteur.

### Changed

- L'analyse demande désormais une phrase par ligne/segment, y compris lorsque plusieurs phrases successives ont le même locuteur.
- Nouveau préfixe propriétaire `///voix` (l'ancien `[voix]` reste accepté en lecture) ; les locuteurs `np1` sont présentés comme « Voix inconnue 1 ».

## [2026.10.18] - 2026-10-02

### Changed

- **Page dédiée par livre** : un clic sur la carte ouvre la page du livre (fil d'Ariane « Livres / titre », bouton retour) — cartouche avec couverture, stats, distribution complète des voix et actions d'analyse ; liste des chapitres avec **état par chapitre** (✓ N voix, en file…, —) et bouton ⚡ individuel ; la zone de dépôt EPUB n'apparaît que sur la liste.
- **Panneau de chapitre à trois modes** : **Coloré** (une ligne par réplique, préfixée par l'orateur — narrateur en vert, hommes en bleu, femmes en rose), **Texte brut** (sans les préfixes) et **Éditer** (correction du texte et des tags, ⌘S, scission). La vue colorée est le mode par défaut d'un chapitre analysé.
- La distribution (cast) s'affiche en entier sur la page du livre ; les liens « Derniers livres » du tableau de bord ouvrent directement la page du livre concerné.

### Fixed

- L'IA écrivant parfois « Narrator » au lieu de « narrateur » : l'identifiant est normalisé (côté serveur pour les prochaines analyses, côté interface pour les chapitres déjà taggés) afin que le narrateur reste un rôle unique, en vert.

## [2026.10.17] - 2026-10-02

### Fixed

- **Analyse coincée « en cours » après un arrêt du studio** : au démarrage du serveur, toute analyse restée `en_cours` est marquée `interrompue` (le fil d'analyse meurt avec le processus) — plus de refus 409 fantôme ; la carte du livre affiche l'état, le pourcentage et un bouton « Continuer l'analyse » qui reprend au premier chapitre non analysé.
- Progression de l'analyse affichée avec pourcentage (`chapitre X/Y · Z %`) et message 409 explicite quand une analyse tourne réellement.

## [2026.10.16] - 2026-10-02

### Added

- **Analyse IA par chapitre, visible directement dans la liste** : chaque ligne de chapitre porte un bouton ⚡ qui lance (ou relance) l'analyse de ce seul chapitre, sans ouvrir l'éditeur.

### Fixed

- Ré-analyser un chapitre précis conserve désormais la distribution des voix existante : elle n'est refaite que lors d'une ré-analyse du livre entier, garantissant des identifiants de voix cohérents d'un chapitre à l'autre.

## [2026.10.15] - 2026-10-02

### Changed

- Vue d'ensemble web recentrée en tableau de bord : tuiles vivantes (voix, modèles installés, livres, prises générées) et panneaux « Derniers livres » / « Dernières prises » avec liens vers les sections — l'éditeur texte et la bibliothèque de voix ne sont plus dupliqués en page d'accueil.
- Vue « Texte vers voix » : liste complète des **prises générées** (nom, durée, extrait du transcript, lecture, téléchargement), absente du studio web jusqu'ici ; rafraîchie automatiquement après chaque génération.

### Fixed

- Réglages IA : l'endpoint accepte désormais l'URL complète (`…/chat/completions`) comme l'URL de base — le suffixe est retiré automatiquement au lieu de produire une URL doublée ; exemples directement adaptés au GLM Coding Plan (`https://api.z.ai/api/coding/paas/v4`) et note explicite « sans /chat/completions ».

## [2026.10.14] - 2026-10-02

### Changed

- Échec d'installation d'un modèle protégé Hugging Face : le message explique la marche à suivre pas à pas (accepter les conditions sur la page du modèle, créer un token Read sur huggingface.co/settings/tokens, le coller dans le studio, réessayer) au lieu du jargon `HF_TOKEN` ; un flag `aide` permet à l'UI d'afficher le guide avec liens cliquables.
- Studio web : bloc « Token Hugging Face — guide pas à pas » dans la section Modèles (champ de saisie + étapes numérotées avec liens) ; l'erreur d'un modèle protégé affiche désormais les 4 étapes avec le lien direct vers SA page Hugging Face.
- App native : les 4 étapes numérotées remplacent l'ancien texte dans le bloc Accès Hugging Face.

## [2026.10.13] - 2026-10-02

### Added

- Jalon 3 des audiobooks : **analyse IA des voix** — panneau Réglages IA du studio (endpoint OpenAI-compatible + clé API + modèle, bouton « Tester la connexion », clé masquée en lecture, stockée dans `data/ia.json`) : GLM, DeepSeek, OpenAI, Ollama local…
- Analyse en deux passes : détection de la **distribution** (narrateur + personnages, genre de voix homme/femme, importance), puis **tagage ligne par ligne** des chapitres (`[voix] texte`) par morceaux d'environ 2 500 caractères.
- **Voix requises par chapitre** et pour tout le livre ; personnages rencontrés en cours de tagage détectés puis classés homme/femme par un appel dédié ; analyse à la demande (livre entier, continuation, ou chapitre seul depuis l'éditeur) et ré-analyse forcée.
- Progression crash-safe (`projet.json` réécrit après chaque chapitre, reprise « Continuer l'analyse (N chap.) ») ; le studio suit en direct : chips ♂/♀ par voix, barre de progression, compteur de voix par chapitre et légende des voix dans l'éditeur.
- Client LLM `src/server/ia.py` en bibliothèque standard (urllib), zéro dépendance pip ; 21 tests avec faux LLM local, aucun appel réseau.

## [2026.10.12] - 2026-10-02

### Fixed

- Build natif sans Xcode complet : `build.sh` teste les SDK disponibles et retombe automatiquement sur les SDK macOS 26 (où `@State` n'est pas une macro) — les Command Line Tools 27 ne livrent pas le plugin de macros `SwiftUIMacros`, ce qui cassait toute compilation SwiftUI.

### Changed

- Vue d’ensemble native recentrée sur les stats (voix, modèles, livres EPUB, confidentialité), l’état et les actions de diagnostic du serveur, la sélection rapide d’une voix, les derniers livres importés et les dernières prises générées ; les bibliothèques et l’éditeur restent uniquement dans leurs sections dédiées.
- Chargement des projets de livres EPUB dans le client SwiftUI pour alimenter le compteur et l’activité récente.

## [2026.10.11] - 2026-10-02

### Changed

- Versions APP et SERVEUR affichées dans la barre fixe supérieure, à côté de l’état du studio et des commandes Démarrer/Éteindre ; l’écart reste signalé en orange, visible sans faire défiler le contenu.

## [2026.10.10] - 2026-10-02

### Added

- Bouton « Ouvrir le studio web » dans la barre de l’app native : ouvre le serveur local déjà démarré (`127.0.0.1:8809`) dans le navigateur par défaut. Désactivé tant que le serveur est éteint.

## [2026.10.9] - 2026-10-02

### Added

- Jalon 2 des audiobooks : **éditeur de chapitres dans le studio** — ouverture d'un chapitre en édition pleine page (titre + texte), état « modifié / enregistré » en temps réel, raccourci ⌘S, garde de fermeture si des modifications ne sont pas enregistrées, brouillons préservés entre re-rendus.
- **Scission de chapitre au curseur** (`POST /api/livres/{id}/chapitre/{n}/scinder`) : coupe un chapitre trop long en deux à la position du curseur, renomme chaque partie, renumérote les chapitres suivants — remède direct aux EPUB au sommaire cassé qui tombent en 2-3 gros blocs.
- Renommage de livre (double-clic sur le titre) et renommage de chapitre via l'éditeur (`POST /api/livres/{id}/renommer`, `titre` optionnel du `PUT` chapitre).
- Durée d'audio estimée (≈ 160 mots/min) affichée par chapitre et par livre.

## [2026.10.8] - 2026-10-02

### Added

- Jalon 1 des audiobooks : **import d'EPUB dans le studio** — dépôt par glisser-déposer ou bouton, découpage automatique chapitre par chapitre (sommaire EPUB3 `nav`, EPUB2 `toc.ncx`, ancres `fichier.xhtml#section`, repli par document du spine quand le sommaire est absent ou cassé), filtrage des pages trop courtes (page de titre, sommaire). Parsage 100 % bibliothèque standard (`zipfile`/`xml`/`html.parser`), zéro dépendance pip.
- Nouveaux endpoints `/api/livres` : import, liste, détail, chapitre en lecture **et** édition (`PUT`), suppression, couverture ; chaque livre vit dans `data/livres/{id}/` (projet.json + `chapitres/NNN.md` + EPUB source conservé pour réanalyse).
- Section « Livres » du studio web : cartes avec couverture, auteur, nombre de chapitres et de mots, lecture du texte de chaque chapitre.

## [2026.10.7] - 2026-10-01

### Changed

- Site store isolé dans `store/website/`, prêt à téléverser par FTP : `index.html` et uniquement ses ressources utilisées, avec chemins relatifs autonomes ; le kit média non utilisé reste dans `store/`.

## [2026.10.6] - 2026-10-01

### Fixed

- « No module named 'voxcpm' » persistant après installation : l'editable Python pointait encore sur `third_party/` (ancien nom avant renommage en `vendor/`) et le bouton Installer posait le paquet PyPI sans réparer ce chemin mort ; l'installation réinstalle désormais le VoxCPM vendored (même commande qu'`install.sh`, `-e vendor/VoxCPM`) et invalide les caches d'import pour que le serveur en cours d'exécution voie le paquet — « Activer » fonctionne alors directement.

### Changed

- Le studio démarre tout seul à l'ouverture de l'app ; éteint, l'écran montre un panneau d'accueil « Le studio est éteint » avec un gros bouton Démarrer (le bouton power de la barre haute est aussi mis en évidence à l'arrêt).
- Après une installation réussie depuis l'app, le moteur s'active automatiquement (suivi en arrière-plan, plus besoin de retoucher « Activer ») ; le CTA d'erreur affiche « Activer » quand tout est déjà installé.

## [2026.10.5] - 2026-10-01

### Added

- Lien « Soutenir sur Ko-fi » toujours visible dans la navigation de la page store (rouge, FR/EN) ; le lien reste aussi présent en pied de page.

## [2026.10.4] - 2026-10-01

### Added

- Version de l'application toujours visible : barre de pied de l'app native et pied du studio web affichent la version réellement exécutée ; l'app signale en orange un écart entre la version du bundle et celle du serveur (`/api/etat` expose désormais `version`).
- Feuille de route du double numérique dans `TODO.md` : clonage vocal rapide, avatar photo → vidéo lipsyncé, studio avatar — moteurs candidats et pièges Mac documentés.

## [2026.10.3] - 2026-10-01

### Added

- Deux variantes d’icône et personnalisations de couleurs de fenêtre pour VS Code.

## [2026.10.2] - 2026-10-01

### Fixed

- Échec de chargement d’un moteur affiché avec un CTA d’installation des dépendances manquantes ; l’installation reste possible lorsque les poids sont déjà en cache.

## [2026.10.0] - 2026-10-01

### Added

- Lien de soutien Ko-fi dans le menu Aide de l’application.

### Changed

- Refonte de la page store en v2 bilingue, responsive et accessible ; installation décrite honnêtement selon les artefacts réellement publiés.
- Vérification de distribution : le DMG et le cask v0.6.0 installent l’app seule, qui dépend encore du dépôt et de son environnement Python ; distribution autonome à traiter avant de promouvoir ces canaux.

- **Fichier `VERSION` supprimé** : la version est lue depuis le dernier en-tête versionné du `CHANGELOG.md` (section `[Unreleased]` ignorée) — une seule source de vérité ; lors d'une release, renommer `[Unreleased]` en `[x.y.z]` avant de lancer `.github/scripts/release.sh`

- **REFACTO arborescence** : le code serveur va dans `src/server/` (`serveur.py`, `transcrire.py`), le studio web dans `web/` (`page.html`, `assets/`) et les scripts dans `scripts/` (`build.sh`, `package_dmg.sh`, `ma-voix.sh`, `arreter-studio.sh`) ; `install.sh` reste à la racine (point d'entrée curl) — chemins mis à jour dans l'app native, les tests et les README, aucun changement fonctionnel
- **Racine nettoyée** : artefacts de release regroupés dans `releases/` (app + DMG/zip), cache Sparkle dans `vendor/` — convention `skill-releases-and-repo-architecture`, clones et sorties CLI réunis dans `data/` (`data/clones`), échantillon vocal perso déplacé en `data/voix/`, icône dans `packaging/`, prototype `index.html` et `.inspi` supprimés
- **Tout le source sous `src/`** : `web/` → `src/web/`, `packaging/` → `src/packaging/`, `tests/` → `src/tests/` ; `third_party/` renommé `vendor/` (VoxCPM). `data/` reste à la racine : contenu généré/privé (voix, clones, logs), pas du code

## [0.6.0] - 2026-09-15

### Added

- **App native macOS** : `PK Voice Cloner.app` en Swift (`swiftc` brut, fenêtre WKWebView) — plus de terminal ni de navigateur ; le serveur Python est un processus enfant démarré au lancement et arrêté gracieusement à la fermeture (modèle libéré), `--stop` conserve le contrat `arreter-studio.sh`, mises à jour automatiques via Sparkle (appcast GitHub)
- **`build.sh`** : build de l'app en une commande (swiftc + Sparkle épinglé/checksumé + icône .icns + signature ad-hoc) ; `install.sh` construit et copie l'app dans /Applications
- **Boutons Installer / Supprimer par modèle** : la liste « Modèles à tester » devient dynamique (`GET /api/modeles`) — « Installer » télécharge les poids (et le paquet pip manquant) en arrière-plan, « Supprimer » purge le cache Hugging Face (refusé si le moteur est chargé en mémoire)
- **Tout modèle installé est sélectionnable** : les moteurs Qwen3-TTS 0,6B et Pocket TTS n'apparaissent dans l'en-tête du studio qu'une fois les poids présents en cache
- **Moteur Pocket TTS (Kyutai)** : clonage vocal léger français (~0,4 Go), chargé sur MPS
- Transcript de secours : la génération réutilise le transcript de la voix sélectionnée si le client n'en envoie pas

### Changed

- **Chatterbox retiré de la liste** : il impose torchaudio==2.6, incompatible avec la venv partagée (dots.tts exige >= 2.8)

## [0.5.0] - 2026-09-14

### Added

- **Deuxième moteur TTS : dots.tts** (2B, clonage haute fidélité 48 kHz, 24 langues) — commutable à la volée depuis l'en-tête du studio ; chargé en float32 sur MPS (~2× plus rapide qu'CPU, bench local : 53 s vs 108 s)
- **Couche moteur** dans le serveur : `POST /api/moteur`, `/api/etat` expose le moteur actif, déchargement mémoire propre entre les moteurs, chargements sérialisés
- **`install.sh`** : installation en une commande `curl -fsSL …/install.sh | sh` (clone, venvs, ffmpeg, uv, dots.tts sans pynini) + tagline « Studio vocal IA open source » dans les README
- Shims d'import dots_tts sur macOS (pynini ne compile pas, garde-fou torch/torchaudio trop strict) : sans effet sur la génération

## [0.4.0] - 2026-09-14

### Added

- **Bibliothèque de voix multi-clones** : chaque clip importé/enregistré devient une voix persistante (`data/voix`), listée, sélectionnable, écoutable et supprimable depuis l'interface
- API bibliothèque : `GET /api/voix`, `POST /api/voix/{id}/choisir`, `GET /api/voix/{id}/wav`, `DELETE /api/voix/{id}` ; l'upload renvoie désormais l'`id` de la voix

### Changed

- **Interface v2** inspirée d'ElevenLabs : hero « Cloner ta voix, sans la livrer. » + panneau studio unique — voix clonées à gauche (état vide avec ajout), texte + **Générer** à droite
- Refonte claire et chaleureuse (papier, corail, serif) ; la page ne charge plus Three.js (scène 3D retirée, ~600 Ko et GPU économisés)

## [0.3.2] - 2026-09-11

### Fixed

- Bundle macOS installé dans `/Applications` avec le nom Finder, Spotlight et Launchpad explicite **PK Voice Cloner**

## [0.3.1] - 2026-09-11

### Added

- Bouton **Éteindre** dans le studio : confirmation, arrêt du serveur local, libération de VoxCPM/MPS et du contexte WebGL
- `POST /api/arreter`, PID suivi dans `data/run/serveur.pid` et `arreter-studio.sh` pour arrêter la session sans navigateur

### Changed

- Le launcher macOS cible exclusivement son serveur vérifié ; arrêt gracieux puis escalade `TERM`/`KILL` seulement si nécessaire

## [0.3.0] - 2026-09-11

### Added

- Studio de voix Three.js réel (r149, runtime local issu de ThreeUI/MIT) : micro de cabine géométrique, panneaux acoustiques, anneaux sonores, particules, éclairage et VU audio-réactifs
- Feuilles de direction à la place du HUD : import/enregistrement, waveform, transcript, script, rythme et rendu WAV
- Design de studio chaleureux (papier, bois, cuivre, lumière de cabine) ; fond et animations produits par `THREE.WebGLRenderer`, non par CSS ou un shader WebGL artisanal

### Changed

- Remplace l'interface « cockpit » v0.2.0 par PK Voice Studio
- Le serveur sert les assets locaux sous `/assets`, dont le runtime Three.js et son avis de licence

## [0.2.0] - 2026-09-11

### Added

- Interface « cockpit » : fond shader WebGL (scanlines CRT, réactif à l'état — veille/enregistrement/génération), consoles à coins biseautés, LEDs d'état (serveur/modèle/voix), horloge
- Cadran de vitesse rotatif (drag + clavier + double-clic = reset 1.00×), estimation du temps affichée avant génération
- Oscilloscopes : forme d'onde de la voix source (décodage Web Audio) et oscilloscope temps réel de la lecture du résultat
- Jauge de progression hachurée pendant la synthèse (RTF estimé ~15 sur MPS)

## [0.1.0] - 2026-09-11

### Added

- Interface web locale : upload (m4a/mp3/wav/webm), enregistrement micro, transcript éditable, vitesse 0,75×–1,5× (pitch préservé), lecture et téléchargement du résultat
- Pipeline : conversion ffmpeg 16 kHz, transcription faster-whisper large-v3, clonage ultimate VoxCPM2 sur MPS (float32), mode offline complet (HF_HUB_OFFLINE)
- Modèle résident en mémoire (une génération ≈ 90 s pour ~6 s d'audio, sans rechargement)
- Transcript persistant par hash audio (pas de 2e transcription au redémarrage)
- `ma-voix.sh` : clonage CLI une commande, texte quoté ou non, option `-a fichier`
- App macOS « PK Voice Cloner.app » : lance le serveur si besoin, ouvre le navigateur
- README FR/EN, VERSION, CHANGELOG, gitignore
