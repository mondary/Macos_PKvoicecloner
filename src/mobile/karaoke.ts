/** Karaoké mot à mot : découpe une phrase en mots, puis retrouve le mot lu.
 *
 * Deux sources : le TTS Android donne la plage exacte du mot prononcé
 * (`onRangeStart`), la lecture Piper/WAV donne une position et une durée — on
 * estime alors le mot au prorata des caractères. Le rendu reste côté web. */
export interface Mot { mot: string; debut: number; fin: number }

export function decouperMots(texte: string): Mot[] {
  const mots: Mot[] = [];
  const motif = /\S+/g;
  for (let trouve = motif.exec(texte); trouve; trouve = motif.exec(texte)) {
    mots.push({ mot: trouve[0], debut: trouve.index, fin: trouve.index + trouve[0].length });
  }
  return mots;
}

/** Mot qui chevauche le plus la plage [debut, fin) ; dans un espace, le mot précédent
 *  (celui que le moteur vient de prononcer). */
export function motPourPlage(mots: Mot[], debut: number, fin: number): number {
  if (!mots.length) return -1;
  let meilleur = 0;
  let meilleurScore = 0;
  for (let i = 0; i < mots.length; i++) {
    const chevauchement = Math.min(fin, mots[i].fin) - Math.max(debut, mots[i].debut);
    if (chevauchement > meilleurScore) { meilleur = i; meilleurScore = chevauchement; }
  }
  if (meilleurScore > 0) return meilleur;
  let precedent = 0;
  for (let i = 0; i < mots.length; i++) { if (mots[i].debut <= debut) precedent = i; else break; }
  return precedent;
}

/** Mot estimé depuis la progression de lecture (0 → durée), pondérée par les caractères. */
export function motPourProgression(mots: Mot[], position: number, duree: number): number {
  if (!mots.length) return -1;
  if (!(duree > 0)) return 0;
  const finTexte = mots[mots.length - 1].fin;
  const cible = Math.max(0, Math.min(1, position / duree)) * finTexte;
  let index = 0;
  for (let i = 0; i < mots.length; i++) {
    if (mots[i].debut <= cible) index = i; else break;
  }
  return index;
}

/** Rendu HTML de la phrase : les mots passés sont lus, `actif` est en surbrillance. */
export function rendreMots(texte: string, actif: number, esc: (v: unknown) => string): string {
  const mots = decouperMots(texte);
  if (!mots.length) return esc(texte);
  let html = '';
  let curseur = 0;
  for (let i = 0; i < mots.length; i++) {
    html += esc(texte.slice(curseur, mots[i].debut));
    const classe = i === actif ? 'mot mot-actif' : i < actif ? 'mot mot-lu' : 'mot';
    html += `<span class="${classe}">${esc(mots[i].mot)}</span>`;
    curseur = mots[i].fin;
  }
  return html + esc(texte.slice(curseur));
}
