# PK Reader · Android

PK Reader est l’application de lecture personnelle du projet. Elle importe des EPUB sans DRM, des PDF contenant du texte, des TXT et du Markdown. Les fichiers sont traités sur l’appareil ; la bibliothèque, les signets et la progression sont conservés localement.

## Installer

Le workflow **Android Reader** construit un APK de développement pour Android 8+ en ARM64 et x86_64. L’artefact `PK-Reader-Android-debug` contient `app-debug.apk`. Ce paquet sert aux essais ; il n’est pas publié sur Google Play.

Après compilation, l’APK récupéré localement se trouve dans `releases/android/`. Copiez-le sur le téléphone, ouvrez-le et autorisez l’installation depuis l’application utilisée pour l’ouvrir.

## Les trois sources de voix

| Source | Installation | Réseau pendant la lecture |
|---|---|---|
| Voix Android | Moteur du téléphone ou autre moteur TTS installé | Selon la voix Android choisie |
| Piper Siwis / Tom / Lessac | Téléchargement dans l’onglet Voix, environ 21 Mo par modèle | Aucun après installation |
| Voix clonées PK Voice Studio | Connexion facultative au Mac | Mac requis pour les passages non encore générés ; passages préparés disponibles hors ligne |

Les modèles Piper tournent sur le CPU Android avec sherpa-onnx. Le runtime est inclus dans l’APK, les poids sont téléchargés explicitement. Les archives sont vérifiées par SHA-256 avant installation. Gardez l’application ouverte pendant le téléchargement d’un modèle ; une interruption se reprend en relançant le téléchargement.

Le clonage d’une nouvelle voix n’est pas exécuté sur le téléphone dans cette version : les voix clonées sont créées et générées par PK Voice Studio sur le Mac. Dans le lecteur Android, le bouton de téléchargement prépare le chapitre courant pour l’emporter. Le cache distingue le livre, le texte et la voix. Changer de voix demande une nouvelle génération.

## Connecter le studio

1. Démarrer PK Voice Studio sur le Mac et choisir son moteur de génération.
2. Depuis le dépôt, lancer `python3 src/server/mobile_gateway.py`.
3. Sur le même réseau local de confiance, recopier l’adresse et le code dans **Réglages → Votre studio vocal** sur Android.
4. Choisir une voix dans **Voix → Mes clones**.

La passerelle est indépendante du serveur principal et s’arrête avec Ctrl-C. Elle expose seulement l’état, les voix, la génération, le suivi des tâches et les audios générés. Le code est conservé dans `~/.config/pkvoicecloner/mobile-token` avec des droits limités au propriétaire. Les appels utilisent un en-tête Bearer ; la passerelle locale fonctionne en HTTP et doit rester sur votre réseau de confiance. Aucun port n’est à ouvrir sur votre routeur.

## Utiliser le lecteur

- **+** : importer plusieurs livres ou coller un texte.
- Toucher une phrase : choisir le point de départ.
- Lecture / pause, phrase précédente / suivante, vitesse 0,75×–3×.
- Bouton chapitres : navigation et signets.
- Minuteur : arrêt après 5, 15, 30, 45 ou 60 minutes.
- Thèmes clair, papier et nuit ; taille de texte ajustable.
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
