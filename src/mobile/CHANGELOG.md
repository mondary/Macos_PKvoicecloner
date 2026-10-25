# PK Reader Android

## [2026.10.75] - 2026-10-25

### Fixed
- **OpenCode Go — liste des modèles** : l’app interroge désormais `https://opencode.ai/inference/go/v1/models` ; le chemin `/openai/v1/models` renvoyait 404. Le chat reste sur `/inference/go/openai/v1`.
- **Clé API conservée même si le test échoue** : la clé, l’adresse et le modèle sont enregistrés **avant** l’appel de vérification. Un 404, un réseau coupé ou un modèle refusé ne fait plus ressaisir la clé ; la configuration reste inactive tant que le test échoue, avec le message exact du fournisseur.
- Ligne « Clé enregistrée sur ce téléphone » affichée sous le champ, pour ne plus douter de ce qui est conservé.

### Changed
- **Vérifier les mises à jour** passe en carte dédiée en haut de l’onglet À propos : icône, version actuelle, état et grand bouton d’action. Le bouton ne se confond plus avec une ligne de réglage.

## [2026.10.74] - 2026-10-25

### Changed
- **Bibliothèque repensée** : couvertures plus grandes, titres en Literata sur deux lignes, métadonnées plus lisibles, barre de progression fine, badge « Terminé » repensé et bouton « Gérer » discret.
- **Couvertures importées** : plus de cadre, de tranche factice ni de fond blanc ; l’image garde son contour et sa proportion réels, avec une ombre qui suit l’image. Les couvertures générées conservent leur reliure.
- État vide illustré, tuile d’importation plus douce, compteur « X livres · Y en cours ».

## [2026.10.73] - 2026-10-25

### Fixed
- **OpenCode Go — « missing session id »** : l’app envoie maintenant l’identifiant de session `x-opencode-session` exigé par le service, ainsi qu’un agent identifiable `PK-Reader/<version>`. L’adresse officielle `https://opencode.ai/inference/go/openai/v1` remplace l’ancienne, qui reste reconnue pour les configurations déjà enregistrées.
- **OpenCode Zen** : les modèles gratuits (`-free`, `big-pickle`, `test`) sont masqués de la liste — ils ne fonctionnent que dans l’application OpenCode et provoquaient une erreur « free usage limit ».
- Messages dédiés pour « free usage limit » et « missing session id », avec le détail du fournisseur.

## [2026.10.72] - 2026-10-25

### Fixed
- **Erreurs HTTP 400 lisibles** : l’app affiche maintenant le message exact renvoyé par le fournisseur (clé masquée) au lieu d’un simple « requête refusée ». Elle réessaie d’abord sans le mode JSON, puis sans `temperature` si le modèle les refuse — les deux causes les plus fréquentes.
- **Réponses JSON tolérantes** : le JSON est extrait même entouré de texte (fallback quand le fournisseur ne prend pas en charge `response_format`), comme le fait déjà le studio.

## [2026.10.71] - 2026-10-25

### Added
- **OpenCode Zen et OpenCode Go** ajoutés aux fournisseurs IA : sélection dans la liste, adresse `https://opencode.ai/zen/v1` (ou `/zen/go/v1`) remplie automatiquement, lien vers `opencode.ai/auth`, puis chargement des modèles par le bouton habituel.

## [2026.10.70] - 2026-10-25

### Added
- **Configuration IA guidée** : choix du fournisseur (GLM/Z.ai, BigModel, DeepSeek, OpenAI, Mistral, Groq, OpenRouter ou adresse personnalisée), adresse remplie automatiquement, lien direct vers la page des clés du fournisseur, puis **Charger les modèles** qui interroge `GET /models` et remplit une liste déroulante — plus besoin de saisir l’identifiant à la main (saisie libre conservée en secours).
- La liste des modèles est récupérée avec la clé collée sans l’enregistrer ; seuls les modèles de conversation sont proposés (embeddings, TTS, images écartés).

## [2026.10.69] - 2026-10-25

### Changed
- **Fini le menu ⋯ du livre** : un bouton **Gérer** visible (bibliothèque et lecteur) ouvre une page dédiée où chaque action est affichée avec une phrase d’explication — préparer le livre audio, personnages et voix, relancer l’analyse, reconstituer les paragraphes, effacer les audios, supprimer. Plus d’actions cachées dans un menu.
- L’état de la préparation complète s’affiche directement sur la page du livre.

## [2026.10.68] - 2026-10-25

### Changed
- **Réglages réorganisés en onglets** : Lecture, Voix & analyse, À propos — plus de page unique interminable. Les réglages de lecture (thème, taille, interligne, marges, mise en page, vitesse, surlignage, suivi) sont regroupés au même endroit, et le bouton « Apparence » du lecteur ouvre exactement le même contenu en feuille rapide.

## [2026.10.67] - 2026-10-25

### Added
- **« Préparer le livre audio » — la séquence complète en un bouton** : depuis le menu du livre (⋯), l'analyse des personnages, le téléchargement des voix manquantes et la mise en cache du livre s'enchaînent automatiquement, chapitre par chapitre, avec progression et reprise après interruption. Les corrections manuelles et les voix choisies sont conservées.
- **Réglages du livre depuis le lecteur** : le bouton ⋯ de l'en-tête ouvre le menu du livre (voix, préparation, analyse, paragraphes, audios, suppression) sans revenir à la bibliothèque.
- **Cinq voix françaises supplémentaires, dont une ultra-légère** : Siwis · légère (13 Mo), Tjiho 1, 2 et 3, Miro — dix voix françaises au catalogue.

### Changed
- **Suppression plus claire** : le menu du livre dit « Supprimer ce livre de la bibliothèque » et la confirmation également.
- **Relancer l'analyse** : une entrée dédiée du menu du livre recalcule les attributions automatiques (IA du téléphone ou repérage local) en conservant corrections, voix et réglages.

## [2026.10.66] - 2026-10-24

### Added
- **Analyse IA autonome sur le téléphone** : Réglages → Analyse IA du téléphone (adresse HTTPS, modèle, clé API). Le modèle identifie les personnages qui parlent — un nouveau rôle doit citer une ligne où il parle —, attribue chaque phrase en JSON indexé, puis relit et corrige les passages incertains. Ni Mac ni passerelle nécessaires.
- Clé chiffrée dans Android Keystore (jamais réaffichée), test de la configuration avant enregistrement, désactivation immédiate.
- Progression par phase (personnages / attribution / relecture), sauvegarde par lot, reprise après coupure.

### Changed
- Découpage par lots de 40 phrases avec contexte pour borner les réponses ; les passages dont la confiance n'est pas haute restent au narrateur.

## [2026.10.65] - 2026-10-23

### Added
- **Dialogue façon scénario** : les étiquettes en capitales suivies d'un tiret cadratin (« LE MODÈLE SCHALTZMANN — réplique ») et les suffixes entre parenthèses (« LE DAMNÉ (POÈTE) : ») sont reconnus, à condition d'un échange entre au moins deux étiquettes plausibles. Les noms tout en capitales sont affichés joliment (« Le Modèle Schaltzmann »).
- Les étiquettes composées avec deux-points (« Le Goff : », « La Solution : ») sont acceptées quand l'échange en croise au moins deux ; un tiret seul reste réservé aux capitales constantes pour ne pas confondre avec l'apposition narrative.

### Changed
- **Le cast du studio remplace le repérage local** : quand l'analyse IA raffine le livre, les rôles automatiques locaux supplantés qui n'ont plus aucune phrase disparaissent au fil des lots, au lieu de s'empiler avec les personnages du studio. Les rôles listés par le studio et vos réglages manuels survivent.

## [2026.10.64] - 2026-10-23

### Fixed
- **Des indices de parole avant de créer un rôle** : « Voilà : », « Bon : », « Elle : », « Moi : », « Puis : », « Bref : », « Exemple : », « Request : » et les titres/métadonnées ne deviennent plus des personnages. Une étiquette « Nom : » doit être corroborée par une incise/annonce ou un échange entre plusieurs prénoms/noms titrés. Les noms inconnus du lexique restent reconnus dans les incises.
- **Réparation des livres déjà analysés** : les anciennes attributions locales sont recalculées une fois à l’ouverture, y compris les faux rôles ayant déjà des phrases. Les identifiants et réglages des personnages conservés, les corrections manuelles, les lots du studio, les signets et la progression sont préservés.
- **Attribution prudente** : les pronoms ne créent plus de personnages et ne sont résolus que parmi les locuteurs nommés de l’échange. L’alternance tient compte des tours de parole, des paragraphes et des chapitres ; les passages ambigus restent au narrateur.

### Changed
- **Vérifier le résultat** : un extrait attribué est consultable sous chaque personnage. Le bilan affiche des rôles proposés, distingue repérage local et analyse du studio, et exclut la narration et les corrections manuelles du compteur d’attributions automatiques.

## [2026.10.63] - 2026-10-23

### Fixed
- **Fini les distributions à 168 voix** : un nom seulement cité dans le récit (« Pierre arriva », « Rose était là ») ne crée plus un personnage. Seuls les locuteurs qui ont réellement une réplique — étiquette, incise ou « dit-elle » — reçoivent un rôle et une voix. Le sexe des voix et l’alternance des répliques restent calculés sur le téléphone.
- **Anciennes analyses nettoyées** : les rôles sans réplique hérités des versions précédentes sont masqués dans « Les voix de ce livre », puis supprimés quand vous validez. Le nombre de rôles affiché reflète enfin les personnages qui parlent. Les corrections manuelles et les voix choisies sont conservées.

## [2026.10.62] - 2026-10-23

### Fixed
- **Vérification et téléchargement sans quitter sa lecture** : si l’on revient au lecteur pendant une vérification ou un téléchargement de mise à jour, l’écran de lecture n’est plus redessiné à la fin de l’opération. Le résultat reste visible dans Réglages → Mises à jour.

## [2026.10.61] - 2026-10-23

### Added
- **Mise à jour depuis l’application** : Réglages → **Mises à jour** vérifie les releases GitHub `pk-…`, télécharge l’APK, contrôle son empreinte SHA-256 et sa signature, puis ouvre l’installateur Android. Plus besoin d’ouvrir GitHub ni de retrouver le fichier dans les téléchargements ; la progression s’affiche pendant le téléchargement.
- Autorisation Android « installer des applications inconnues » demandée une seule fois à PK Reader ; un raccourci ouvre directement le réglage correspondant.

### Changed
- **Clé de signature permanente** : le workflow signe chaque APK avec une clé PK Reader stable au lieu d’une clé debug recréée à chaque build GitHub. Les mises à jour s’installent désormais par-dessus l’application existante, sans désinstallation ni perte de bibliothèque.
- **Une seule réinstallation** : les versions jusqu’à 2026.10.60 ont été signées avec l’ancienne clé éphémère. Désinstallez une dernière fois, installez 2026.10.61, puis les mises à jour suivantes se font depuis l’application.
- La vérification de version lit uniquement la liste publique des releases ; aucune donnée de lecture n’est envoyée.

## [2026.10.60] - 2026-10-22

### Changed
- **L'analyse des personnages tourne entièrement sur le téléphone** : plus besoin du Mac pour préparer un livre. Personnages nommés repérés (titres « Mme Martin », prénoms connus, locuteurs des répliques), **sexe des voix** déduit des titres, d'un lexique de prénoms embarqué et des incises (« dit-elle »), et **dialogues attribués par alternance des répliques** entre deux locuteurs ancrés. Les corrections manuelles servent d'ancre à l'alternance.
- L'écran « Les voix de ce livre » ne propose plus de connecter un studio : il présente directement les personnages repérés, leur sexe et les phrases attribuées, puis les voix proposées. Le studio Mac devient une amélioration **facultative** (affinage des dialogues ambigus, voix clonées) qui tourne en arrière-plan quand il est connecté.
- Un prénom ambigu (Claude, Camille…) reste « genre non déterminé » : l'app ne devine pas.

## [2026.10.59] - 2026-10-22

### Changed
- **Un seul parcours « Les voix de ce livre »** : l’import prépare les personnages et propose une voix par rôle. L’utilisateur valide ou change ces voix ; les corrections de locuteur restent facultatives et repliées. Les paragraphes, phrases et tours de parole sont découpés automatiquement, y compris les noms précédés de M. ou Mme.
- **Tout le livre est analysé automatiquement avec le studio connecté**, par lots de 120 phrases avec contexte, sans limite de 400 phrases par chapitre. Chaque lot est sauvegardé ; une coupure se reprend sans refaire les lots terminés. Sans studio, seuls les noms explicitement rattachés aux répliques sont détectés, avec une invitation à connecter le studio pour compléter.
- **Voix proposées selon la langue et le genre détecté**, avec préférence pour des timbres distincts. Le bilan nomme les rôles nécessitant une voix supplémentaire et propose les téléchargements Piper disponibles. Jessica et Pierre partagent un seul téléchargement UPMC. Les voix manuelles et leurs réglages sont conservés.

### Fixed
- Analyser un chapitre ne supprime plus les personnages des précédents ; les corrections manuelles sont préservées. Une réponse IA incomplète est signalée au lieu de décaler silencieusement les locuteurs.
- Les appels d’analyse utilisent un exécuteur Android séparé pour ne pas bloquer le chargement du lecteur pendant une requête IA.

## [2026.10.58] - 2026-10-21

### Added
- **Surlignage au choix** : Apparence → Surlignage — **Mots** (karaoké), **Phrase** seule, ou **Aucun** surlignage. Le suivi de lecture reste actif dans les trois modes, seul le repère visuel change.

### Changed
- **Phrases très longues coupées à la ponctuation** : au-delà de 400 caractères, la coupe préfère un point-virgule, deux-points, virgule ou tiret proche de la limite avant de retomber sur un espace — la lecture s'arrête sur une clause, plus au milieu d'un groupe de mots.
- **Couvertures compactées à l'import** : l'image est réduite (~24–48 Ko, WebP puis JPEG) au lieu d'être stockée en pleine résolution dans chaque livre ; repli sur l'image d'origine si le navigateur ne sait pas la redimensionner.

## [2026.10.57] - 2026-10-21

### Added
- **Mode focus** : un chevron réduit le lecteur audio à une seule ligne (voix, vitesse, minuteur, lecture) pendant qu'on lit — la page gagne tout l'écran, sans quitter l'écoute.
- **Confort de lecture réglable** : interligne (serré / normal / aéré), marges (normales / confort / larges) et **zone de suivi** (serrée / normale / large) dans Apparence.
- **Mise en forme du livre conservée** : les italiques et les citations de l'EPUB restent visibles à la lecture (marques posées à l'import, texte toujours échappé).
- **Réparer les paragraphes d'un ancien livre** : menu du livre → « Reconstituer les paragraphes » (fait aussi automatiquement à l'ouverture) — chaque réplique forme son bloc, le récit est regroupé par quatre phrases. La navigation ¶ redevient utile sur les livres importés avant 2026.10.56.
- **Quota IA lisible** : quand le fournisseur du studio atteint sa limite (429/quota), le téléphone affiche « Le fournisseur IA a atteint sa limite d'usage — attends le renouvellement ou choisis un autre provider dans Réglages IA » au lieu du JSON brut.

## [2026.10.56] - 2026-10-21

### Added
- **Navigation page ET paragraphe** : quatre boutons dans le lecteur — « ¶ Préc. », « ‹ Page », « Page › », « Suivi ¶ » — dans les deux dispositions. En mode pages, une page se tourne ; en défilement, un écran de texte. Les paragraphes d'origine sont désormais conservés à l'import (EPUB, PDF, TXT) : le saut de paragraphe tombe sur le début d'un vrai bloc, pas au milieu d'une phrase. Clavier : Page ↑/↓ pour les pages, ←/→ pour les phrases, Maj+←/→ pour les paragraphes.
- **Suivi de lecture plus doux** : la page ne défile plus à chaque phrase — seulement quand la phrase (ou le mot karaoké) sort d'une bande de confort au centre de l'écran. On garde le fil en lisant, et toute navigation manuelle suspend le suivi (la barre « EN COURS » ramène d'un geste).

### Changed
- Les livres importés avant cette version n'ont pas la structure de paragraphes : le saut de paragraphe y avance d'une phrase, sans casser la lecture.

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
