# PK Reader — feuille de route lecteur

Retours des 21 au 26/10. État des sources au 2026.10.91.

## Fait

- Attribution des voix par le studio (analyse IA via le Mac, sexes, phrase par phrase) — 2026.10.54.
- Karaoké mot à mot et surlignage discret — 2026.10.54.
- Jaquettes non recadrées, sans bord bleu — 2026.10.55.
- Voix françaises supplémentaires (Gilles, UPMC Jessica/Pierre, multi-locuteurs) — 2026.10.55.
- Filtre par langue des voix du téléphone — 2026.10.55.
- Vitesse à côté de la voix et mémorisée par voix — 2026.10.55.
- Navigation page ET paragraphe, suivi de lecture plus doux — 2026.10.56.
- Mode focus, interligne/marges/zone de suivi, italiques et citations de l'EPUB, paragraphes reconstitués, quota IA lisible — 2026.10.57.
- Surlignage réglable (mots / phrase / aucun), coupes de phrases longues sur la ponctuation, couvertures compactées, moteurs chauds documentés — 2026.10.58.
- Préparation automatique du livre à l'import, noms et genres via le studio, voix par défaut, bilan des voix manquantes et téléchargements groupés, corrections facultatives, conservation des personnages et reprise après coupure — 2026.10.59.
- Analyse 100 % sur le téléphone : lexique de prénoms embarqué, titres, incises « dit-elle », attribution par alternance des répliques — le studio devient un affinage facultatif — 2026.10.60.
- Mise à jour depuis l'app (Réglages → Mises à jour) : vérification GitHub, téléchargement de l'APK, contrôle SHA-256 et signature, installateur Android ; clé de signature permanente dans le workflow — 2026.10.61.
- Une vérification ou un téléchargement lancé depuis Réglages ne redessine plus l'écran de lecture au retour au livre ; le résultat reste dans Réglages → Mises à jour — 2026.10.62.
- Les noms seulement cités ne créent plus de voix ; les rôles sans réplique des anciennes analyses sont masqués puis supprimés à la validation — 2026.10.63. Cette correction ne traitait pas les faux locuteurs suivis de deux-points.
- Étiquettes corroborées, mots ordinaires/pronoms exclus des rôles automatiques, réanalyse locale des livres existants et passages attribués consultables — 2026.10.64.
- Dialogue façon scénario : étiquettes en capitales suivies d’un tiret cadratin, suffixes parenthésés, noms composés avec deux-points dans un échange d’au moins deux ; le cast du studio remplace le repérage local supplanté — 2026.10.65.
- Analyse IA 100 % autonome sur le téléphone : fournisseur OpenAI-compatible réglé dans l’app (clé chiffrée Android Keystore), distribution étayée par des lignes de parole, attribution JSON indexée, relecture critique, lots de 40 phrases, reprise après coupure — 2026.10.66.
- « Préparer le livre audio » : séquence complète en un bouton (analyse, voix manquantes, mise en cache chapitre par chapitre) ; menu du livre accessible depuis le lecteur ; suppression et relance d’analyse explicites ; dix voix françaises dont Siwis légère à 13 Mo — 2026.10.67.
- Réglages en trois onglets (Lecture, Voix & analyse, À propos) ; réglages de lecture regroupés et partagés avec la feuille rapide du lecteur — 2026.10.68.
- Page « Gérer le livre » à la place du menu ⋯ : bouton visible dans la bibliothèque et le lecteur, actions expliquées une par une, état de préparation sur place — 2026.10.69.
- Configuration IA guidée : fournisseur (GLM/Z.ai, DeepSeek, OpenAI, Mistral, Groq, OpenRouter), adresse et page de clés pré-remplies, liste des modèles chargée depuis le fournisseur — 2026.10.70.
- OpenCode Zen et OpenCode Go ajoutés aux fournisseurs IA guidés — 2026.10.71 ; session OpenCode Go et modèles gratuits masqués — 2026.10.73.
- Bibliothèque repensée et couvertures importées au contour réel, sans cadre — 2026.10.74.
- OpenCode Go : liste des modèles sur l’URL dédiée, clé enregistrée même si le test échoue, carte « Vérifier les mises à jour » — 2026.10.75.
- Suivi des analyses sur tous les écrans : file, source, étape, chapitre, lots, bilan et erreur — 2026.10.76.
- Préparation en streaming : chapitre courant analysé en priorité, lecture immédiate, reste du livre en arrière-plan, file rafraîchie aux changements de chapitre — 2026.10.77.
- Pastille de suivi discrète, pipeline accéléré et IA locale (Ollama/LM Studio/llama.cpp) — 2026.10.78.
- Page « Gérer le livre » en quatre étapes avec relance ciblée et « Tout relancer » — 2026.10.79.
- Notifications fixes des téléchargements, soutien Ko-fi explicite, navigation chapitre/page/phrase regroupée — 2026.10.80.
- Validation rapide des voix par chapitre, choix mémorisés et arrêt Android avant les nouveaux personnages — 2026.10.80.
- Écoute d’essai par voix, mini-lecteur par défaut et repagination selon la hauteur réelle — 2026.10.81.
- Siwis · Kokoro (132 Mo) en onzième voix française, aperçu fidèle à la voix choisie, navigation du mini-lecteur sur une ligne — 2026.10.82.
- Téléchargement automatique à la sélection, bulles regroupées, libellés blocs/personnages, auto-attribution légère — 2026.10.83.
- Sélection des voix compacte, étape Écoute clarifiée, confirmation d’effacement des audios — 2026.10.84.
- Barre en cours agrandie, pourcentage/temps restant dans le mini-lecteur, navigation imbriquée — 2026.10.85.
- Bibliothèque centrée sur les couvertures, vrais paragraphes et pagination fidèle, mini-lecteur imbriqué avec Lecture/Pause au centre — 2026.10.86.
- Navigation à deux entrées (Bibliothèque, Réglages), voix compactes dans Réglages, choix des voix pendant l’analyse et écoute immédiate avec distribution provisoire — 2026.10.87.
- Centre de notifications discret (cloche, pastille, panneau latéral), bibliothèque en 1–3 colonnes et tri par ajout, ouverture, titre ou année — 2026.10.88.
- Lecteur compact : barre unique (curseur, voix, minuteur, signet, vitesse, mise en page, plein écran), transport chapitre/page/phrase et compteurs page/pourcentage/temps — 2026.10.89.
- Voix : menus de personnages raccourcis, attribution automatique en un geste, attribution après téléchargement, liste des voix installées en tête avec progression et accès depuis Gérer le livre — 2026.10.90.
- Fiche des voix allégée (listes repliées, boutons play) et aperçu sonore corrigé — 2026.10.91.

## Reste

- [ ] Valider le repérage et les attributions sur les romans de l’utilisateur après correction ; les tests de régression ne garantissent pas une distribution exhaustive.
- Pistes ultérieures : téléchargement des voix Piper int8 sur le Mac, mode conversationnel, import de la progression depuis le studio.
