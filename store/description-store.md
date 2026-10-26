# PK Voice Cloner — description store

## Laius court

Ta voix. Clonée. 100 % locale. PK Voice Cloner clone ta voix sur ton Mac en
quelques minutes : enregistre quelques secondes, écris ton texte, écoute le
résultat. Aucun cloud, aucun compte — tout tourne sur Apple Silicon.

## Laius long

PK Voice Cloner est un studio macOS open source de clonage vocal local. Importe
un enregistrement ou parle dans le micro, révise la transcription puis génère
un fichier audio avec un moteur compatible installé sur ton Mac. Ta voix et tes
clones restent sur ton disque. L’installation utilisateur actuellement
documentée passe par l’installateur source ; le DMG et le cask v0.6.0 ne sont
pas autonomes et nécessitent encore le dépôt et son environnement Python.

- Plateforme : macOS 14+, Apple Silicon
- Installation vérifiée : `curl -fsSL https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/install.sh | sh`
- DMG / Homebrew : disponibles en v0.6.0 mais non autonomes ; ne pas les présenter comme installateurs prêts à l’emploi avant correction
- Mises à jour Sparkle : feed et zip signés présents pour la release v0.6.0 ; vérifier à chaque publication
- Éthique : pour ta propre voix ; le consentement n'est pas optionnel

## Assets

### PK Reader Android — 2026.10.92

**FR — Recherche et bibliothèque** : une loupe dans le lecteur retrouve un mot ou un personnage, affiche chapitre et extrait et amène à la phrase. La page Voix se filtre par nom. Titre, auteur et année se modifient depuis Gérer ; l’année apparaît sur la fiche. La pastille d’analyse devient un point discret dans l’en-tête.

**EN — Search and library**: a magnifier in the reader finds a word or character, shows chapter and excerpt and jumps to the sentence. The Voices page filters by name. Title, author and year can be edited from Manage; the year appears on the book page. The analysis chip becomes a discreet dot in the header.

### PK Reader Android — 2026.10.91

**FR — Fiche des voix allégée** : aide, détails et longue liste de personnages repliés, boutons play compacts, et aperçu sonore qui joue réellement (le garde-fou de chapitre ne bloque plus l’extrait).

**EN — Lighter voice sheet**: help, details and the long character list fold away, compact play buttons, and a preview that actually plays (the chapter gate no longer blocks the excerpt).

### PK Reader Android — 2026.10.90

**FR — Moins de voix, mieux attribuées** : les menus de personnages ne listent plus toutes les voix Android (voix générique, timbres de l’app installés et voix du rôle). Un bouton **Attribuer automatiquement** répartit les voix par genre et enregistre la distribution ; après un téléchargement, les voix sont attribuées avec un retour visible. La page Voix montre les timbres installés en tête, leur progression et « Réessayer », et reste accessible depuis Réglages comme depuis Gérer le livre.

**EN — Fewer voices, better assigned**: character menus no longer list every Android voice (generic voice, installed app timbres and the role's current voice). An **Assign automatically** button distributes voices by gender and saves the casting; after a download, voices are assigned with visible feedback. The Voices page lists installed timbres first, with progress and “Retry”, and is reachable from both Settings and Manage book.

### PK Reader Android — 2026.10.89

**FR — Lecteur compact** : une barre unique réunit curseur, voix, minuteur, signet, vitesse, sens de lecture et plein écran ; chapitre/page/phrase entourent Lecture/Pause, puis une ligne discrète donne chapitre, page, pourcentage et temps restant. L’en-tête garde l’apparence et la gestion du livre ; le plein écran masque l’en-tête et agrandit la page. Le texte gagne la hauteur de l’ancienne carte.

**EN — Compact player**: one bar gathers the slider, voice, sleep timer, bookmark, speed, reading mode and full screen; chapter/page/sentence surround Play/Pause, followed by a discreet line with chapter, page, percentage and remaining time. The header keeps appearance and book management; full screen hides the header and enlarges the page. Text gains the height of the old card.

### PK Reader Android — 2026.10.88

**FR — Suivi discret** : une cloche avec pastille remplace les tuiles. Elle ouvre un panneau latéral groupé « À vérifier / En cours / Terminées » : analyses et téléchargements montrent leur avancement, une action vers le livre ou les voix, et « Retirer » pour les résultats. Les tâches terminées s’effacent seules ; les erreurs restent.

**EN — Discreet tracking**: a bell with a badge replaces the tiles. It opens a side panel grouped into “To check / Running / Finished”: analyses and downloads show progress, a shortcut to the book or voices, and “Remove” for results. Finished tasks fade on their own; errors remain.

**FR — Bibliothèque à votre mesure** : 1, 2 ou 3 colonnes sur téléphone, et tri par dernier ajout, dernier ouvert, titre A–Z ou année (métadonnées EPUB, repli sur l’année d’ajout). Les deux réglages sont mémorisés et s’appliquent sans recharger la page.

**EN — A library that fits you**: 1, 2 or 3 columns on phones, and sorting by last added, last opened, title A–Z or year (EPUB metadata, falling back to the year added). Both settings are remembered and apply without reloading the page.

### PK Reader Android — 2026.10.87

**FR — Deux entrées, des voix au bon endroit** : Bibliothèque et Réglages seulement. Les voix s’ouvrent depuis Réglages → Voix & analyse, en une ligne compacte par voix, avec un retour explicite vers les réglages.

**EN — Two entries, voices in the right place**: Library and Settings only. Voices open from Settings → Voices & analysis, one compact row per voice, with an explicit back to settings.

**FR — Choisir pendant l’analyse** : la fiche des personnages reste modifiable pendant le repérage et enregistre les voix au passage. Le bilan du chapitre s’ouvre même sans analyse terminée : on valide, on écoute tout de suite, et l’analyse affine la distribution ensuite. Seule une voix non confirmée arrête la lecture.

**EN — Choose while analysing**: the character sheet stays editable during detection and saves voices as you pick them. The chapter summary opens even before analysis finishes: confirm, start listening immediately, and analysis refines the casting afterwards. Only an unconfirmed voice stops playback.

### PK Reader Android — 2026.10.86

**FR — Place au contenu** : recherche visible et grandes couvertures, reprise compacte ; vrais paragraphes dans le lecteur, commandes autour de Lecture/Pause sur une ligne. Bleu et guide conservés, thèmes clair/papier/nuit disponibles.

**EN — Content first**: visible search and large covers, compact resume strip; real paragraphs in the reader, controls around Play/Pause on one line. Blue identity and discovery guide retained, with light/paper/night themes.

**FR — Lecture simplifiée** : commandes chapitre/page/phrase regroupées près du lecteur, compteur d’analyse près de Gérer, téléchargements de voix suivis par des notifications fixes jusqu’à fermeture du résultat. Bouton « Soutenir sur Ko-fi » explicite dans À propos.

**EN — Simpler reading**: chapter/page/sentence controls grouped near playback, analysis count beside Manage, and fixed voice-download notifications until results are dismissed. Explicit Ko-fi support button in About.

**FR — Bilan par chapitre** : chaque proposition de voix s’écoute avant validation, sur un extrait du personnage. Validez le premier chapitre — même pendant l’analyse, l’écoute démarre aussitôt avec la distribution provisoire — puis retrouvez ces associations au suivant ; seuls les nouveaux personnages interrompent la lecture. En lecture, le lecteur réduit laisse plusieurs paragraphes par page, avec bascule pages/défilement.

**EN — Chapter summary**: listen to each voice proposal before confirming, on an excerpt of the character. Confirm the first chapter, then reuse those associations later; only new characters interrupt playback. While reading, the collapsed player leaves several paragraphs per page, with a paged/scrolling toggle.

**FR — Préparation en streaming et IA au choix** : le chapitre à écouter est analysé en priorité et la lecture démarre pendant le reste de l’analyse ; pastille de suivi discrète ; clé API ou IA locale (Ollama, LM Studio), ou repérage local sans clé.

**EN — Streaming preparation and AI of your choice**: the chapter you are about to hear is analysed first and playback starts while the rest is analysed; discreet progress pill; API key or local AI (Ollama, LM Studio), or keyless local detection.

**FR** — Importe un livre, valide une voix par personnage. Les locuteurs sont repérés **sur le téléphone** — avec votre propre fournisseur IA (adresse, modèle, clé chiffrée dans Android Keystore) ou, sans configuration, par indices de dialogue. L'IA identifie les personnages qui parlent, attribue chaque réplique puis relit les passages incertains : la qualité du studio sans Mac. Une majuscule suivie de deux-points ne crée pas un personnage ; les passages ambigus restent au narrateur. Le bilan indique les voix manquantes et propose leurs téléchargements Piper. **Mise à jour depuis l'app** : Réglages → Mises à jour télécharge l'APK et ouvre l'installateur, avec une clé de signature permanente. APK 2026.10.92 (release `pk-2026.10.92`).

**EN** — Import a book, confirm one voice per character. Speakers are identified **on the phone** — with your own AI provider (URL, model, key encrypted in Android Keystore) or, without configuration, from dialogue cues. The AI identifies speaking characters, assigns every line and then reviews uncertain passages: studio quality without a Mac. A capital letter followed by a colon does not create a character; ambiguous passages stay with the narrator. A summary lists missing voices and offers Piper downloads. **In-app updates**: Settings → Updates downloads the APK and opens the installer, with a permanent signing key. APK 2026.10.92 (release `pk-2026.10.92`).

Capture mobile : `store/screenshots/android-reader/casting.png` — véritable interface web (rendue par le code de production), texte fictif, repérage local. Les voix système de l’aperçu navigateur ne représentent pas le catalogue d’un téléphone Android.

| Fichier | Usage |
|---|---|
| `store/assets/banner-1544x500.png` | bannière store |
| `store/website/assets/card-1200x630.png` | carte Open Graph du site |
| `store/website/screenshots/voix-reference@2x.png` | capture : bibliothèque de voix |
| `store/screenshots/android-reader/notifications.png` | capture : panneau de notifications |
| `store/screenshots/android-reader/book-search.png` | capture : recherche dans le livre |
| `store/screenshots/android-reader/library-3-columns.png` | capture : bibliothèque en 3 colonnes |
| `store/website/screenshots/generation-resultat@2x.png` | capture : génération + lecteur |
| `store/website/gifs/demo-large-1200.gif` | GIF boucle d'interface (large), utilisé par le site |
| `store/website/assets/icon.png` | icône de marque du site, embarquée pour FTP |
| `store/gifs/demo-compact-640.gif` | GIF compact |
| `store/videos/demo-master.mp4` | master vidéo |
| `store/website/index.html` | page store bilingue, prête à téléverser |
| `store/media-kit/dynamic-demo.html` | démo source (régénère tout) |
