# PK Reader — feuille de route lecteur

Retours des 21 au 24/10. État des sources au 2026.10.66.

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

## Reste

- [ ] Valider le repérage et les attributions sur les romans de l’utilisateur après correction ; les tests de régression ne garantissent pas une distribution exhaustive.
- Pistes ultérieures : téléchargement des voix Piper int8 sur le Mac, mode conversationnel, import de la progression depuis le studio.
