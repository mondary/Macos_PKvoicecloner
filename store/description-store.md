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

### PK Reader Android — 2026.10.65

**FR** — Importe un livre, valide une voix par personnage. Les locuteurs sont repérés **sur le téléphone** à partir d’indices de parole — incises (« …, dit Pierre »), annonces de dialogue et échanges nommés — sans Mac ni réseau. Une majuscule suivie de deux-points ne crée pas un personnage : chaque rôle affiche un **passage attribué à vérifier**, et les passages incertains restent au narrateur. Ce repérage par règles ne garantit pas une distribution exhaustive. Le bilan indique les voix manquantes et propose leurs téléchargements Piper. Le studio Mac reste facultatif (affinage IA des dialogues ambigus, voix clonées). **Mise à jour depuis l'app** : Réglages → Mises à jour télécharge l'APK et ouvre l'installateur, avec une clé de signature permanente. APK 2026.10.65 (release `pk-2026.10.65`).

**EN** — Import a book, confirm one voice per character. Speakers are identified **on the phone** from speech evidence — attribution clauses (“…, said Pierre”), dialogue announcements and named exchanges — no Mac, no network. A capital letter followed by a colon does not create a character: each role shows an **assigned passage to review**, and uncertain passages stay with the narrator. This rule-based detection does not guarantee an exhaustive cast. A summary lists missing voices and offers Piper downloads. The Mac studio remains optional (AI refinement of ambiguous dialogue, cloned voices). **In-app updates**: Settings → Updates downloads the APK and opens the installer, with a permanent signing key. APK 2026.10.65 (release `pk-2026.10.65`).

Capture mobile : `store/screenshots/android-reader/casting.png` — véritable interface web (rendue par le code de production), texte fictif, repérage local. Les voix système de l’aperçu navigateur ne représentent pas le catalogue d’un téléphone Android.

| Fichier | Usage |
|---|---|
| `store/assets/banner-1544x500.png` | bannière store |
| `store/website/assets/card-1200x630.png` | carte Open Graph du site |
| `store/website/screenshots/voix-reference@2x.png` | capture : bibliothèque de voix |
| `store/website/screenshots/generation-resultat@2x.png` | capture : génération + lecteur |
| `store/website/gifs/demo-large-1200.gif` | GIF boucle d'interface (large), utilisé par le site |
| `store/website/assets/icon.png` | icône de marque du site, embarquée pour FTP |
| `store/gifs/demo-compact-640.gif` | GIF compact |
| `store/videos/demo-master.mp4` | master vidéo |
| `store/website/index.html` | page store bilingue, prête à téléverser |
| `store/media-kit/dynamic-demo.html` | démo source (régénère tout) |
