# PK Reader — feuille de route lecteur

Retours du 21/10 à traiter après l'attribution studio et le karaoké (2026.10.54).

## Livraison B — le paquet visuel

1. **Jaquettes** : les couvertures importées sont recadrées (`object-fit: cover`) et un fond bleu apparaît sur les formats différents — passer en `contain` sur un fond neutre (papier/encre), sans bord bleu.
2. **Voix françaises supplémentaires** : le catalogue ne propose que Siwis et Tom. Ajouter Gilles (Piper, homme) et UPMC (Piper, 2 locuteurs : jessica/pierre) — `sid` est aujourd'hui figé à 0 dans `ModelStore.generate`, à exposer. MMS français en option.
3. **Filtre par langue** : les voix du téléphone listent toutes les langues du système et rendent la feuille illisible. Afficher d'abord la langue du livre, avec un dépliage « toutes les langues » mémorisé.
4. **Vitesse à côté de la voix** : déplacer le réglage de vitesse dans la pastille de voix, et mémoriser **une vitesse par voix** (dictionnaire voix → vitesse), combinée comme aujourd'hui avec la vitesse de rôle de l'attribution.
5. **Navigation page + paragraphe** : on peut passer d'un paragraphe à l'autre, pas d'une page à l'autre (et inversement selon le mode). Offrir les deux dans les deux dispositions (pages et défilement), boutons et gestes.
6. **Prompteur immersif** : au-delà du karaoké, garder la page lisible et la navigation libre — pas de saut de page à chaque phrase, barre « en cours » discrète, reprise facile.
7. **Lecture EPUB confortable, TTS optionnel** : conserver les paragraphes, une typographie de livre, et laisser le TTS en arrière-plan (démarrage explicite, pas de surlignage permanent hors lecture).

## Dettes techniques notées

- `ModelStore.generate` : `sid` figé à 0 (multi-locuteurs impossible).
- Les couvertures importées sont stockées en data-URL dans le livre ; vérifier le poids sur les gros EPUB.
- L'analyse studio dépend d'un provider IA externe (quota) : prévoir un message clair quand le quota est atteint, et proposer le repli local explicitement.
