# Feuille de route — double numérique local

Vision cible : **mon double → ma voix + ma photo → mon texte → écouter → générer une vidéo.**

Tout en local sur Apple Silicon (validation sur MacBook Air M5, 32 Go).
Ce fichier est le plan produit ; l'état technique livré se lit dans [CHANGELOG.md](CHANGELOG.md).

## Jalons

### 1. Version identifiable partout — ✅ fait (2026.10.4)

- Numéro de version visible en permanence : pied de l'app native, pied du studio web.
- `/api/etat` expose `version` ; l'app signale un écart app ↔ serveur (app et dépôt désynchronisés).
- Chaque livraison incrémente la version (CalVer `YYYY.MM.PATCH`), rebuild + copie dans `/Applications`.

### 2. Clonage vocal rapide — à faire

Objectif : cloner une voix **rapidement**, en quelques secondes de référence, et réutiliser le clone sans re-préparation.

- Profil vocal « Moi » : références vocales + transcripts + réglages favoris, réutilisables d'une session à l'autre.
- Préparation de référence mise en cache (transcription déjà faite → pas de re-traitement à chaque session).
- Moteur gardé chaud en mémoire entre plusieurs générations (déjà le cas, à confirmer sur chaque moteur).
- Comparatif mesuré sur les mêmes phrases françaises : fidélité, temps de génération, mémoire — puis choix **Rapide / Qualité** dans l'interface.

Moteurs candidats (recherche octobre 2026, licence permissive et projet vivant requis) :

| Moteur | Attrait | Réserve |
|---|---|---|
| [VoxCPM2](https://github.com/OpenBMB/VoxCPM) (actuel) | Multilingue (~30 langues), MPS, ultimate cloning | ~5 Go, pas le plus léger |
| [Pocket TTS](https://github.com/kyutai-labs/pocket-tts) (actuel) | Léger (~0,4 Go), français, rapide CPU (~6× temps réel sur MacBook Air M4 selon le projet) | Qualité à mesurer côté voix clonée |
| [mlx-audio](https://github.com/Blaizzy/mlx-audio) | Optimisé Apple Silicon (MLX), Swift package dispo | Moteur à intégrer, périmètre large (TTS+STT+STS) |
| [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) (actuel) | Bon rapport qualité/taille (0,6B) | Clonage plus limité |
| [Chatterbox](https://github.com/resemble-ai/chatterbox) | Clonage haute fidélité, contrôle d'émotion | Empreinte CUDA, perf Mac à vérifier |

### 3. Premier avatar parlant — à faire

Objectif : **une photo + un audio validé → un MP4 court avec lipsync**.

- Entrée : photo frontale + WAV généré au jalon 2 ; sortie MP4 ~10 s.
- File de génération avec progression et annulation (la vidéo est plus lourde que l'audio).
- Moteur choisi **après mesure réelle sur M5** : les démos fluides sont presque toujours GPU NVIDIA.

Moteurs candidats :

| Moteur | Attrait | Réserve |
|---|---|---|
| [SadTalker](https://github.com/OpenTalker/SadTalker) | Photo seule + audio → talking head, bien éprouvé | Perf Mac annoncée ~20× plus lente que RTX 4090 |
| [MuseTalk](https://github.com/TMElyralab/MuseTalk) | Lipsync temps réel vidéo | Orientation CUDA, compat Mac à valider |
| [LivePortrait](https://github.com/KlingAIResearch/LivePortrait) | Animation photo très vivante, support Mac documenté | Piloté par vidéo, pas par audio : besoin d'une cascade |
| [EchoMimic](https://github.com/antgroup/echomimic), [Hallo](https://github.com/fudan-generative-vision/hallo) | Qualité supérieure | Plus lourds, moins adaptés à un premier MVP |

### 4. Studio du double numérique — à faire

- Variantes de portraits (plusieurs photos du même profil), expressions et cadrages.
- Sous-titres incrustés, export de plusieurs scènes enchainées.
- Plus tard : mode conversationnel temps réel (micro → réponse → avatar).

## Non-buts (pour l'instant)

- Entraînement d'un modèle vocal personnel (le clonage par référence suffit au parcours visé).
- Nuage / API distantes : tout reste sur la machine, aucune donnée ne part.
- Temps réel vidéo interactif avant que le jalon 3 soit stable et mesuré.

## Contraintes permanentes

- macOS Apple Silicon uniquement, 16 Go RAM min (32 Go recommandés).
- Version incrémentée à chaque modification, visible dans l'interface (règle posée en 2026.10.4).
- README FR/EN et changelog synchronisés à chaque livraison ; commits `ADD|FIX|REFACTO|MAJ: …`.

## Pièges identifiés (à garder en tête)

- **Le piège GPU** : une démo fluide sur CUDA ne préjuge pas d'une génération rapide sur MPS/CPU Mac — mesurer avant d'intégrer un moteur.
- **La mémoire** : moteur TTS + Whisper + moteur vidéo simultanés peuvent saturer 32 Go — un seul pipeline actif à la fois, `Éteindre` libère.
- **Distribution** : le DMG/cask n'est pas autonome (dépend du dépôt + `.venv`) ; à régler avant de promouvoir ces canaux.
