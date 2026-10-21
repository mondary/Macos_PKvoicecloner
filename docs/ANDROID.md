# PK Reader · Android

PK Reader est l’application de lecture personnelle du projet. Elle importe des EPUB sans DRM, des PDF contenant du texte, des TXT et du Markdown. Les fichiers sont traités sur l’appareil ; la bibliothèque, les signets et la progression sont conservés localement.

## Installer

Le workflow **Android Reader** construit un APK de développement pour Android 8+ en ARM64 et x86_64. À chaque build réussi, l’APK est publié sur la release `pk-<version>`, **marquée « Latest » pour rester la version visible en premier** sur la page des releases : lien direct `https://github.com/mondary/Macos_PKvoicecloner/releases/download/pk-<version>/PK-Reader-<version>-debug.apk` — par exemple `https://github.com/mondary/Macos_PKvoicecloner/releases/download/pk-2026.10.53/PK-Reader-2026.10.53-debug.apk`. Les notes de la release reprennent la section correspondante du changelog Android. L’artefact CI du même nom reste disponible. Ce paquet sert aux essais ; il n’est pas publié sur Google Play.

**Vérifier la version** — le même numéro se lit partout : nom du fichier APK, nom de l’artefact GitHub, écran Android **Paramètres → Applications → PK Reader**, et dans l’app en bas de la bibliothèque et dans **Réglages → À propos**. Le workflow refuse un APK dont le `versionName` ne correspond pas à ce numéro.

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

La passerelle est indépendante du serveur principal et s’arrête avec Ctrl-C. Elle expose seulement l’état, les voix, la génération, le suivi des tâches et les audios générés. Le code est conservé dans `~/.config/pkvoicecloner/mobile-token` avec des droits limités au propriétaire. Les appels utilisent un en-tête Bearer ; la passerelle locale fonctionne en HTTP et doit rester sur votre réseau de confiance. Aucun port n’est à ouvrir sur votre routeur.

## Une voix par personnage

Comme dans le studio du Mac, un livre peut se lire avec **une voix par personnage** — le narrateur d’un côté, chaque personnage de l’autre. L’icône Personnages de l’en-tête du lecteur (ou « Une voix par personnage → » dans la feuille de changement de voix) ouvre l’éditeur :

1. **Personnages** — activer l’option pour le livre, puis donner à chaque rôle un nom, une voix (voix du téléphone ou voix Piper installée), un **pitch** (0,50×–2×) et une **vitesse** (0,75×–1,50×). Une seule voix en stock peut donc jouer toute la distribution : narrateur à 1,20, protagoniste à 0,80. « Écouter un exemple » fait entendre le rôle avant d’enregistrer.
2. **Attribution des passages** — choisir le personnage de chaque phrase ; « Proposer les attributions de ce chapitre » repère localement les noms explicites (« Pierre : », « dit Pierre ») sans jamais deviner un dialogue ambigu, et vos choix manuels sont conservés.

Le personnage en cours s’affiche dans le lecteur et dans la barre « EN COURS ». Pendant la lecture, la phrase est rendue **mot à mot** : le mot prononcé est surligné (karaoké) — plage exacte avec le TTS Android, estimation au prorata avec une voix Piper ou clonée. Les réglages voyagent avec le livre : ils survivent à la fermeture de l’app.

**Analyse du studio** — dans « Attribution des passages », le bouton **« Analyser ce chapitre avec le studio »** envoie les phrases au Mac connecté (passerelle `mobile_gateway.py` + provider IA configuré dans le studio). Le studio détecte les personnages et le sexe de leur voix — la même analyse que sur l’ordi — puis attribue chaque phrase. Choisissez avant l’analyse les voix **Narrateur / masculine / féminine** ; chaque rôle et chaque phrase restent modifiables ensuite. Sans Mac connecté, « Proposer les attributions localement » reste disponible (noms explicites uniquement).

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
- **Personnages & voix** : icône de l’en-tête → une voix, un pitch et une vitesse par personnage, avec attribution des passages — le studio, dans le téléphone.
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
