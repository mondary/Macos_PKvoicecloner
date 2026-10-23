# PK Reader · Android

PK Reader est l’application de lecture personnelle du projet. Elle importe des EPUB sans DRM, des PDF contenant du texte, des TXT et du Markdown. Les fichiers sont traités sur l’appareil ; la bibliothèque, les signets et la progression sont conservés localement.

## Installer

Le workflow **Android Reader** construit un APK de développement pour Android 8+ en ARM64 et x86_64. À chaque build réussi, l’APK est publié sur la release `pk-<version>` : lien direct `https://github.com/mondary/Macos_PKvoicecloner/releases/download/pk-<version>/PK-Reader-<version>-debug.apk` — par exemple `https://github.com/mondary/Macos_PKvoicecloner/releases/download/pk-2026.10.63/PK-Reader-2026.10.63-debug.apk`. Le badge **Latest** ne désigne qu’une seule release à la fois et suit la **dernière livraison publiée** (Android ou macOS) : il peut pointer sur le DMG sans que l’APK disparaisse — la release `pk-…` reste publique et son lien direct valable. Les notes de la release reprennent la section correspondante du changelog Android. L’artefact CI du même nom reste disponible. Ce paquet sert aux essais ; il n’est pas publié sur Google Play.

**Vérifier la version** — le même numéro se lit partout : nom du fichier APK, nom de l’artefact GitHub, écran Android **Paramètres → Applications → PK Reader**, et dans l’app en bas de la bibliothèque et dans **Réglages → À propos**. Le workflow refuse un APK dont le `versionName` ne correspond pas à ce numéro.

## Mettre à jour

Depuis **2026.10.61**, l’application se met à jour elle-même : **Réglages → Mises à jour → Vérifier les mises à jour**. Elle lit les releases `pk-…`, télécharge l’APK, vérifie son empreinte SHA-256 et sa signature, puis ouvre l’installateur Android. La progression s’affiche pendant le téléchargement.

La première fois, Android demande d’autoriser PK Reader à installer des applications inconnues. Le bouton **Autoriser l’installation** ouvre directement ce réglage ; l’autorisation est ensuite conservée.

**Changement de clé de signature** — les versions jusqu’à 2026.10.60 étaient signées par une clé debug recréée à chaque build GitHub, ce qui obligeait à désinstaller avant chaque mise à jour. La 2026.10.61 utilise une clé PK Reader permanente : **désinstallez une dernière fois** l’ancienne version, installez la 2026.10.63, puis les mises à jour suivantes s’installent par-dessus l’application et conservent la bibliothèque. L’application signale aussi ce changement dans ses notes de version.

Après compilation, l’APK récupéré localement se trouve dans `releases/android/`. Copiez-le sur le téléphone, ouvrez-le et autorisez l’installation depuis l’application utilisée pour l’ouvrir.

## Les trois sources de voix

| Source | Installation | Réseau pendant la lecture |
|---|---|---|
| Voix Android | Moteur du téléphone ou autre moteur TTS installé | Selon la voix Android choisie |
| Piper Siwis · Tom · Gilles · UPMC (Jessica/Pierre) · Lessac | Téléchargement dans l’onglet Voix, 21–23 Mo par modèle (UPMC : un téléchargement pour deux timbres) | Aucun après installation |
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

## Une voix par personnage

Depuis la version **2026.10.60**, le parcours **Les voix de ce livre** s'ouvre après l'import d'un livre, depuis son menu ou depuis l'icône Personnages du lecteur :

1. **Import et analyse sur le téléphone** — paragraphes, phrases et répliques sont découpés par l'app, puis les personnages sont repérés **sans réseau ni Mac** : titres (« Mme Martin »), prénoms connus (lexique embarqué), locuteurs nommés des répliques. Le **sexe des voix** vient des titres, du prénom et des incises (« dit-elle »), et les **dialogues sont attribués par alternance des répliques** quand deux locuteurs sont ancrés. Tout le livre est traité d'un coup, en une fraction de seconde.
2. **Personnage → voix** — chaque rôle reçoit une proposition dans la langue du livre, en privilégiant un timbre distinct et le genre connu. Vous pouvez l’écouter et changer uniquement cette association, puis **Valider les voix**. Les voix choisies manuellement sont conservées d’un chapitre à l’autre. Hauteur (0,50×–2×) et vitesse (0,75×–1,50×) restent dans les réglages facultatifs du rôle.
3. **Voix manquantes** — le bilan indique les rôles partageant une voix ou sans timbre adapté et propose les voix Piper disponibles à télécharger. Jessica et Pierre comptent comme deux voix mais un seul téléchargement UPMC. Les voix installées sont automatiquement proposées aux rôles ; une voix partagée reste utilisable si le catalogue ne suffit pas.
4. **Corrections facultatives** — le détail des phrases est replié. Il permet de corriger une erreur de locuteur, pas de préparer manuellement le livre. Ces corrections survivent aux reprises de l’analyse.

**Seuls les personnages qui parlent** — depuis la version **2026.10.63**, un nom seulement cité dans le récit (« Pierre arriva », « Rose était là ») ne crée plus un rôle. La liste ne contient que les personnages avec au moins une réplique : étiquette (« Pierre : »), incise (« …, dit Pierre ») ou « dit-elle ». Les rôles sans réplique hérités des analyses précédentes sont masqués, puis supprimés à la validation. Le nombre de voix reflète donc le livre, pas les noms croisés dans la narration ; vos corrections et voix choisies restent intactes.

Le personnage en cours s’affiche dans le lecteur et dans la barre « EN COURS ». Pendant la lecture, la phrase est rendue **mot à mot** : le mot prononcé est surligné (karaoké) — plage exacte avec le TTS Android, estimation au prorata avec une voix Piper ou clonée. Les réglages voyagent avec le livre : ils survivent à la fermeture de l’app.

**Sans rien connecter** — l'analyse locale est complète : personnages, sexe et attribution automatique des dialogues explicites et alternés. Un prénom ambigu (Claude, Camille) reste « genre non déterminé », de même que les voix Android dont le système ne fournit pas le genre. Les corrections manuelles servent d'ancre : corrigez un locuteur et l'alternance se répercute autour.

**Affinage facultatif par le studio** — si la passerelle est connectée (pour les voix clonées), le Mac réanalyse le livre en arrière-plan avec son provider IA et affine les dialogues ambigus ; les corrections manuelles et les voix choisies sont conservées, et chaque lot sauvegardé survit à une coupure. Cette étape n'est jamais demandée : sans studio, tout fonctionne déjà sur le téléphone.

Deux limites claires : l’attribution locale n’utilise que des voix du téléphone ou Piper (une voix clonée demande le Mac, elle n’est donc pas proposée comme rôle) ; et **préparer un chapitre hors ligne demande une voix Piper pour chaque rôle utilisé** — avec une voix du téléphone, le chapitre se lit en direct mais ne se met pas en cache.

## Utiliser le lecteur

- **+** : importer plusieurs livres ou coller un texte.
- Toucher une phrase : choisir le point de départ.
- Lecture / pause, phrase précédente / suivante, vitesse 0,75×–3×.
- **Chapitre précédent / suivant** dans l’en-tête, ou la liste complète des chapitres et les signets.
- **Page et paragraphe** : quatre boutons dans le lecteur (¶ Préc. · ‹ Page · Page › · Suivi ¶) — une page se tourne en mode pages, un écran défile en mode continu ; les paragraphes viennent du fichier importé. Clavier : Page ↑/↓, ←/→ et Maj+←/→.
- **Pages ou défilement** : par défaut le chapitre se tourne page à page — au doigt, avec les flèches en bas, ou au clavier — et le chapitre s’ouvre sur sa page de titre ; Apparence propose le défilement continu.
- **Barre « en cours »** : quand vous quittez la phrase lue en tournant les pages ou en défilant, la barre du bas montre la phrase en cours de lecture et y ramène d’un geste ; le suivi automatique reprend alors.
- **Changer de voix sans quitter le lecteur** : la pastille de voix ouvre une feuille listant clones, voix Piper installées et voix du téléphone, appliquées aussitôt.
- **Les voix de ce livre** : icône de l’en-tête → personnages détectés, voix proposées et téléchargements manquants ; les réglages et corrections de phrases sont facultatifs.
- Minuteur : arrêt après 5, 15, 30, 45 ou 60 minutes.
- Thèmes clair, papier et nuit ; taille de texte, **interligne** (serré/normal/aéré), **marges** et **zone de suivi** ajustables dans Apparence.
- **Mode focus** : un chevron réduit le lecteur à une ligne (voix, vitesse, lecture) — la page respire pendant l'écoute.
- **Surlignage** : mots (karaoké), phrase seule ou aucun, au choix dans Apparence ; le suivi de lecture reste actif.
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
