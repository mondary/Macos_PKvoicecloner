# PK Reader · Android

PK Reader est l’application de lecture personnelle du projet. Elle importe des EPUB sans DRM, des PDF contenant du texte, des TXT et du Markdown. Les fichiers sont traités sur l’appareil ; la bibliothèque, les signets et la progression sont conservés localement.

## Installer

Le workflow **Android Reader** construit un APK de développement pour Android 8+ en ARM64 et x86_64. À chaque build réussi, l’APK est publié sur la release `pk-<version>` : lien direct `https://github.com/mondary/Macos_PKvoicecloner/releases/download/pk-<version>/PK-Reader-<version>-debug.apk` — par exemple `https://github.com/mondary/Macos_PKvoicecloner/releases/download/pk-2026.10.75/PK-Reader-2026.10.75-debug.apk`. Le badge **Latest** est réservé à la dernière livraison Android ; les DMG restent accessibles dans leurs releases `v…`. Les notes de la release reprennent la section correspondante du changelog Android. L’artefact CI du même nom reste disponible. Ce paquet sert aux essais ; il n’est pas publié sur Google Play.

**Vérifier la version** — le même numéro se lit partout : nom du fichier APK, nom de l’artefact GitHub, écran Android **Paramètres → Applications → PK Reader**, et dans l’app en bas de la bibliothèque et dans **Réglages → À propos**. Le workflow refuse un APK dont le `versionName` ne correspond pas à ce numéro.

## Analyse IA autonome (sans Mac)

Le téléphone peut exécuter lui-même l'analyse des personnages avec un fournisseur **OpenAI-compatible**, sans passerelle ni Mac. C'est le même travail que le studio, directement dans l'APK.

1. **Réglages → Analyse IA du téléphone** : deux chemins. **Sans clé**, le repérage local (immédiat, plus approximatif) suffit. **Avec une clé** — ou une **IA locale** (Ollama, LM Studio, llama.cpp sur votre Mac ou votre réseau privé, clé facultative) — choisissez le fournisseur (GLM/Z.ai, BigModel, DeepSeek, OpenAI, Mistral, Groq, OpenRouter, OpenCode Zen/Go) ; l’adresse et le lien vers la page des clés se remplissent seuls. Collez la clé, appuyez sur **Charger les modèles**, choisissez le modèle dans la liste (ou saisissez son identifiant), puis **Tester et enregistrer**. Un appel de vérification est effectué avant d’enregistrer ; une configuration qui échoue n’écrase pas la précédente.
2. **Ouvrir un livre** : la préparation enchaîne, par sous-lots de 60 phrases, une distribution **étayée** (chaque nouveau personnage doit citer une ligne où il parle réellement), une attribution indexée, puis une **relecture critique** — cette dernière uniquement quand une attribution n’est pas sûre, ce qui économise environ un tiers des appels. Les passages dont la confiance n’est pas haute restent au narrateur. Le casting envoyé est plafonné à 80 rôles (narrateur et rôles corrigés toujours inclus) pour ne pas gonfler les prompts des grands romans. Comptez de quelques minutes à plusieurs heures par livre selon le modèle ; une IA locale peut demander une nuit entière.
3. **Progression et reprise** : une **pastille discrète** flotte en bas de l’écran ; dans le lecteur, le compteur (`28/141`) est placé près de **Gérer**, en haut. Un toucher ouvre les voix et le détail de l’analyse. Un bilan se ferme seul après quelques secondes ; une erreur reste jusqu’à fermeture. Chaque lot validé est sauvegardé ; une coupure reprend sans refaire le travail déjà fait. Gardez l’application ouverte pendant l’analyse.

### Téléchargements et commandes du lecteur

- Les téléchargements de voix (manuels, depuis les personnages ou pendant la préparation) ont un **suivi fixe sur tous les écrans**. Faire défiler ou changer d’onglet ne le masque pas. « Miro · 100 % · Installée » et les erreurs restent jusqu’à fermeture explicite ; 100 % de transfert seul ne vaut pas installation terminée.
- En lecture, le lecteur se **réduit par défaut** (voix, vitesse, minuteur, lecture, fine ligne de progression) pour laisser plusieurs paragraphes par page. Le chevron du lecteur **déplie toutes les commandes** : **Chapitre** (précédent/suivant avec barre), **Page** (chevrons et compteur), **Phrase −1 / +1** (flèches circulaires). Déplier ou replier redécoupe les pages avec la hauteur réelle. Un bouton du lecteur bascule **pages à tourner / défilement continu** sans quitter le livre.
- Le titre du chapitre ouvre **Chapitres et signets**, où l’on peut ajouter un signet. Le sélecteur de voix reste dans le lecteur ; les réglages de lecture et la préparation hors ligne sont dans **Gérer**. Les titres « Inconnu » deviennent « Chapitre 1 », « Chapitre 2 », y compris pour les livres déjà importés, sans invalider l’analyse.
- **Réglages → À propos → Soutenir sur Ko-fi** ouvre `https://ko-fi.com/pouark` ; le bouton remplace le cœur sans texte.

**Si le fournisseur renvoie une erreur HTTP 400** : l’app réessaie automatiquement sans le mode JSON, puis sans `temperature` (les deux options les plus souvent refusées), et affiche le **message exact du fournisseur** dans Réglages → Analyse IA. Causes fréquentes : modèle réservé à un autre client, option non prise en charge par le modèle, ou identifiant de modèle obsolète — rechargez la liste et choisissez un modèle utilisable.

**IA locale** : le fournisseur « IA locale (Ollama, LM Studio, llama.cpp) » accepte HTTP uniquement sur `localhost`, `127.0.0.1` et le réseau privé (`192.168.*`, `10.*`, `172.16–31.*`) ; depuis le téléphone, indiquez l’adresse LAN de votre Mac (ex. `http://192.168.1.20:11434/v1`). Aucune clé n’est alors nécessaire. Le texte ne quitte pas votre réseau, mais la qualité et la vitesse dépendent du modèle local.

**OpenCode Zen et Go** : l’app envoie l’identifiant de session `x-opencode-session` et un agent `PK-Reader/<version>` exigés par OpenCode Go (sans eux : `missing session id`). Le chat utilise `https://opencode.ai/inference/go/openai/v1`, mais la liste des modèles se charge sur `https://opencode.ai/inference/go/v1/models` (le chemin `/openai/v1/models` renvoie 404). L’ancienne adresse `https://opencode.ai/zen/go/v1` reste reconnue. Les modèles **gratuits** de Zen (`-free`, `big-pickle`) ne fonctionnent que dans l’application OpenCode : ils sont masqués de la liste. Go nécessite un abonnement OpenCode Go.

La **clé API est enregistrée dès que vous appuyez sur « Tester et enregistrer »**, même si le test échoue : un réseau coupé ou un modèle refusé ne vous oblige plus à la ressaisir. La configuration reste inactive tant que le test n’a pas réussi ; le message exact du fournisseur s’affiche sous le formulaire.

La clé est **chiffrée dans Android Keystore** et n'est jamais réaffichée dans l'interface. Le texte des passages analysés est envoyé au fournisseur choisi — c'est le prix de l'analyse IA sans Mac. **Désactiver l'IA** (Réglages → Désactiver l'IA du téléphone) rend la main au repérage local ; les attributions déjà obtenues restent acquises.

Le repérage local reste le repli hors ligne : incises, étiquettes corroborées et alternance des répliques, avec les passages ambigus laissés au narrateur. La génération des voix clonées reste sur le Mac (c'est le moteur de clonage) ; l'analyse, la distribution, la lecture Piper/Android et le karaoké sont autonomes sur le téléphone.

## Mettre à jour

Depuis **2026.10.61**, l’application se met à jour elle-même : **Réglages → Mises à jour → Vérifier les mises à jour**. Elle lit les releases `pk-…`, télécharge l’APK, vérifie son empreinte SHA-256 et sa signature, puis ouvre l’installateur Android. La progression s’affiche pendant le téléchargement.

La première fois, Android demande d’autoriser PK Reader à installer des applications inconnues. Le bouton **Autoriser l’installation** ouvre directement ce réglage ; l’autorisation est ensuite conservée.

**Changement de clé de signature** — les versions jusqu’à 2026.10.60 étaient signées par une clé debug recréée à chaque build GitHub, ce qui obligeait à désinstaller avant chaque mise à jour. Depuis 2026.10.61, la clé est permanente : les mises à jour s’installent par-dessus l’application et conservent la bibliothèque. Le passage d’une version ≤ 2026.10.60 à la version actuelle demande une dernière réinstallation, qui efface les données locales ; sauvegardez-les avant si nécessaire.

Après compilation, l’APK récupéré localement se trouve dans `releases/android/`. Copiez-le sur le téléphone, ouvrez-le et autorisez l’installation depuis l’application utilisée pour l’ouvrir.

## Les trois sources de voix

| Source | Installation | Réseau pendant la lecture |
|---|---|---|
| Voix Android | Moteur du téléphone ou autre moteur TTS installé | Selon la voix Android choisie |
| Piper Siwis · Siwis légère (13 Mo) · Tom · Gilles · UPMC (Jessica/Pierre) · Tjiho 1, 2, 3 · Miro — dix voix françaises, et Lessac en anglais | Téléchargement dans l’onglet Voix, 13–23 Mo par modèle (UPMC : un téléchargement pour deux timbres) | Aucune après installation |
| Voix clonées PK Voice Studio | Connexion facultative au Mac | Mac requis pour les passages non encore générés ; passages préparés disponibles hors ligne |

Les **voix du téléphone** se limitent par défaut au français (la voix active reste toujours visible) ; « Afficher les N voix dans d’autres langues » déplie le reste du système. La **vitesse est propre à chaque voix** : elle se règle dans la pastille du lecteur, à côté du nom, et chaque timbre retrouve la sienne.

Les modèles Piper tournent sur le CPU Android avec sherpa-onnx. Le runtime est inclus dans l’APK, les poids sont téléchargés explicitement. Les archives sont vérifiées par SHA-256 avant installation. Gardez l’application ouverte pendant le téléchargement d’un modèle ; une interruption se reprend en relançant le téléchargement.

Le clonage d’une nouvelle voix n’est pas exécuté sur le téléphone dans cette version : les voix clonées sont créées et générées par PK Voice Studio sur le Mac. Dans le lecteur Android, le bouton de téléchargement prépare le chapitre courant pour l’emporter. Le cache distingue le livre, le texte et la voix. Changer de voix demande une nouvelle génération.

## Connecter le studio

1. Démarrer PK Voice Studio sur le Mac et choisir son moteur de génération.
2. Depuis le dépôt, lancer `python3 src/server/mobile_gateway.py`.
3. Sur le même réseau local de confiance, recopier l’adresse et le code dans **Réglages → Votre studio vocal** sur Android.
4. Choisir une voix dans **Voix → Mes clones**.

La passerelle est indépendante du serveur principal et s’arrête avec Ctrl-C. Elle expose seulement l’état, les voix, l’attribution des personnages, la génération, le suivi des tâches et les audios générés. Le code est conservé dans `~/.config/pkvoicecloner/mobile-token` avec des droits limités au propriétaire. Les appels utilisent un en-tête Bearer ; la passerelle locale fonctionne en HTTP et doit rester sur votre réseau de confiance. Aucun port n’est à ouvrir sur votre routeur.

## Gérer un livre — une page, pas un menu

Chaque livre a un bouton **Gérer** visible sur sa fiche dans la bibliothèque, et l’en-tête du lecteur propose le même bouton. Il ouvre une **page dédiée** organisée autour d’une progression en quatre étapes, chacune avec son pourcentage et son état :

- **Paragraphes** — 100 % quand la navigation par paragraphe est prête ; sinon **Reconstruire** (le texte n’est jamais modifié).
- **Analyse des personnages** — nombre de chapitres terminés et de lots traités (`1/2 chapitres · 1/2 lots`), phase en cours pendant le travail, erreur affichée telle quelle. Sans clé ni IA locale, le repérage local est l’état final assumé (100 %). **Relancer** recalcule les attributions automatiques sans toucher aux corrections manuelles ni aux voix.
- **Voix des personnages** — rôles avec un timbre adapté et nombre de voix à compléter ; **Choisir** ouvre la fiche des voix.
- **Écoute · chapitre en cours** — 100 % quand le chapitre où vous en êtes a tous ses lots analysés ; **Préparer** lance la séquence (analyse prioritaire, voix, lecture immédiate, suite en arrière-plan).

**Tout relancer** enchaîne les quatre étapes : paragraphes reconstitués, analyse repartant de zéro, voix manquantes téléchargées, préparation et lecture. En dessous : **Effacer les audios préparés** et **Supprimer ce livre** (le fichier d’origine reste intact).

## Une voix par personnage

### Bilan automatique du chapitre avant l’écoute

L’import démarre l’analyse. Au clic sur **Écouter**, le bilan du chapitre montre ses personnages, les voix proposées, celles déjà installées et celles à télécharger. Chaque ligne propose **« Écouter »** : un extrait du personnage dans ce chapitre, lu avec la voix sélectionnée dans la liste. Modifiez, écoutez, puis **Validez et écoutez ce chapitre** ; seules les voix sélectionnées non installées sont alors téléchargées.

Une validation fixe l’association personnage → voix dans le livre. Au chapitre suivant, les personnages connus la conservent ; si le chapitre est analysé et toutes ses voix validées/installées, il continue sans confirmation. En cas de nouveau personnage ou d’analyse incomplète, le lecteur s’arrête avant de prononcer le chapitre et affiche le bilan. Le service Android respecte aussi cet arrêt écran verrouillé ; revenez dans l’app pour valider si nécessaire. Les choix restent mémorisés après fermeture de l’app. Le guide de découverte n’exige pas de validation.

Le parcours **Les voix de ce livre** s’ouvre après l’import, depuis **Gérer → Voix des personnages** ou depuis le compteur d’analyse près de **Gérer**. L’analyse des personnages peut tourner de deux façons, sans Mac dans les deux cas :

- **avec l'IA du téléphone** (Réglages → Analyse IA du téléphone) : distribution étayée, attribution puis relecture par le modèle choisi ;
- **sans configuration** : repérage local par indices de dialogue, plus prudent, qui laisse les passages ambigus au narrateur.

1. **Import et préparation** — paragraphes et phrases sont découpés localement. Avec l'IA, chaque nouveau personnage doit citer une ligne où il parle ; sans IA, seules les incises, annonces et étiquettes corroborées créent un rôle.
2. **Personnage → voix** — vérifiez le nom et **Voir un passage attribué**, puis écoutez ou changez la proposition de voix avant **Valider les voix**. Les timbres sont proposés selon la langue et le genre connu. Vos choix manuels sont conservés d'un chapitre à l'autre. Hauteur (0,50×–2×) et vitesse (0,75×–1,50×) restent dans les réglages facultatifs du rôle.
3. **Voix manquantes** — le bilan indique les rôles partageant une voix ou sans timbre adapté et propose les voix Piper disponibles à télécharger. Jessica et Pierre comptent comme deux voix mais un seul téléchargement UPMC. Les voix installées sont automatiquement proposées aux rôles ; une voix partagée reste utilisable si le catalogue ne suffit pas.
4. **Corrections facultatives** — le détail des phrases est replié. Il permet de corriger une erreur de locuteur, pas de préparer manuellement le livre. Ces corrections survivent aux reprises de l’analyse.

**Réparer une ancienne analyse** — en **2026.10.64**, ouvrez le livre ou **Les voix de ce livre** : le repérage local est recalculé une fois, y compris pour les faux rôles qui avaient déjà des phrases. Les passages libérés reviennent au narrateur. Les corrections manuelles, les réglages des personnages conservés, les lots du studio, les signets et la progression sont préservés. Aucun réimport n’est nécessaire.

Le personnage en cours s’affiche dans le lecteur et dans la barre « EN COURS ». Pendant la lecture, la phrase est rendue **mot à mot** : le mot prononcé est surligné (karaoké) — plage exacte avec le TTS Android, estimation au prorata avec une voix Piper ou clonée. Les réglages voyagent avec le livre : ils survivent à la fermeture de l’app.

**Limites du repérage local** — ce sont des règles textuelles, pas un modèle comprenant tout le roman. Les locuteurs implicites, les alias ou les échanges ambigus peuvent rester non identifiés et sont alors lus par le narrateur. « Dit-elle » se résout seulement parmi les locuteurs nommés de l’échange, jamais à partir d’une femme citée ailleurs dans le livre. Le bilan compte les attributions automatiques aux personnages, sans y inclure la narration ou vos corrections manuelles. **L'IA du téléphone lève ces limites** : elle lit le contexte, résout les alias et les pronoms, et marque les passages incertains.

**Passerelle du studio (autre option)** — si vous préférez utiliser l'IA déjà configurée dans le studio plutôt qu'une clé sur le téléphone, connectez la passerelle mobile : le Mac réanalyse le livre en arrière-plan et le téléphone reçoit les attributions. Les corrections manuelles et les voix choisies sont conservées. Le cast du studio **remplace** le repérage local : les rôles locaux supplantés qui n’ont plus aucune phrase disparaissent au fil des lots. Ni la passerelle ni le studio ne sont nécessaires à la lecture.

Deux limites claires : l’attribution locale n’utilise que des voix du téléphone ou Piper (une voix clonée demande le Mac, elle n’est donc pas proposée comme rôle) ; et **préparer un chapitre hors ligne demande une voix Piper pour chaque rôle utilisé** — avec une voix du téléphone, le chapitre se lit en direct mais ne se met pas en cache.

## Utiliser le lecteur

- **+** : importer plusieurs livres ou coller un texte.
- Toucher une phrase : choisir le point de départ.
- Lecture / pause, phrase précédente / suivante, vitesse 0,75×–3×.
- **Chapitre précédent / suivant** dans l’en-tête, ou la liste complète des chapitres et les signets.
- **Page et paragraphe** : quatre boutons dans le lecteur (¶ Préc. · ‹ Page · Page › · Suivi ¶) — une page se tourne en mode pages, un écran défile en mode continu ; les paragraphes viennent du fichier importé. Clavier : Page ↑/↓, ←/→ et Maj+←/→.
- **Pages ou défilement** : par défaut le chapitre se tourne page à page — au doigt, avec les flèches en bas, ou au clavier — et le chapitre s’ouvre sur sa page de titre ; Réglages → Lecture propose le défilement continu.
- **Barre « en cours »** : quand vous quittez la phrase lue en tournant les pages ou en défilant, la barre du bas montre la phrase en cours de lecture et y ramène d’un geste ; le suivi automatique reprend alors.
- **Changer de voix sans quitter le lecteur** : la pastille de voix ouvre une feuille listant clones, voix Piper installées et voix du téléphone, appliquées aussitôt.
- **Les voix de ce livre** : icône de l’en-tête → personnages détectés, voix proposées et téléchargements manquants ; les réglages et corrections de phrases sont facultatifs.
- Minuteur : arrêt après 5, 15, 30, 45 ou 60 minutes.
- Thèmes clair, papier et nuit ; taille de texte, **interligne** (serré/normal/aéré), **marges** et **zone de suivi** ajustables dans Réglages → Lecture — ou depuis le lecteur avec le bouton Apparence, qui ouvre la même feuille.
- **Mode focus** : un chevron réduit le lecteur à une ligne (voix, vitesse, lecture) — la page respire pendant l'écoute.
- **Surlignage** : mots (karaoké), phrase seule ou aucun, au choix dans Réglages → Lecture ; le suivi de lecture reste actif.
- La mise en forme du livre est conservée : les **italiques** et les **citations** de l'EPUB restent visibles.
- Notifications et écran verrouillé : commandes du service audio Android.

La reprise se fait au début de la phrase interrompue. Le PDF est présenté sous forme de texte extrait, page par page ; la mise en page originale et l’OCR ne sont pas reproduits. Les EPUB à DRM, les comics et la traduction ne sont pas pris en charge. Le guide fourni est un court texte original de démonstration.

## Développer

```sh
pnpm install
pnpm dev                 # aperçu web sur http://127.0.0.1:5178
pnpm test
pnpm mobile:prepare      # interface et synchronisation Capacitor
pnpm android:deps        # runtime Android épinglé et vérifié
```

Le build APK et le test sur émulateur sont exécutés par `.github/workflows/android-reader.yml`, avec Node 24, Java 21 et Android SDK 36. Aucune installation de SDK n’est nécessaire sur le Mac. L’aperçu navigateur utilise les voix du navigateur ; Piper, le studio, les notifications et la lecture en arrière-plan nécessitent l’APK.

## Sources et crédits

- Inspiration d’usage : [TTS Reader Pro](https://play.google.com/store/apps/details?id=voice.reader.ai&hl=en) et [Readexa](https://readexa.uk/). Design et code originaux.
- [Capacitor](https://capacitorjs.com/) — MIT.
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) — Apache-2.0 ; runtime v1.13.8.
- [Modèles Piper convertis](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models) — licences propres aux modèles, voir [THIRD_PARTY.md](../src/mobile/THIRD_PARTY.md).
- fflate, Lucide, PDF.js, DM Sans et Literata : voir les licences tierces.

❤️ Soutenir ce projet sur [Ko-fi](https://ko-fi.com/pouark).
