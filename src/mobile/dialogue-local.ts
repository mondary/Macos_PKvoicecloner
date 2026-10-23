import { prenomConnu } from './prenoms';
import type { Book, Gender } from './types';

const normaliser = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const TITRE = String.raw`(?:M\.|Mme\.?|Mlle\.?|Monsieur|Madame|Mademoiselle|Dr\.?|Docteur)`;
const RE_TITRE = new RegExp(`^${TITRE}\\s+`, 'i');
export const cleNom = (nom: string) => normaliser(nom.replace(RE_TITRE, ''));

// Les mots grammaticaux/interjections ne désignent pas une personne. Ce filtre
// complète les preuves de parole ; il ne suffit jamais à valider une étiquette.
const MOTS_ORDINAIRES = new Set(('je tu il elle ils elles on nous vous eux moi toi soi ce ceci cela ca celui celle ceux celles ' +
  'avec sans puis ensuite alors enfin bref voila voici bon bien oui non merci exemple exemples ' +
  'request requete requetes question questions reponse reponses contexte resultat resultats ' +
  'chapitre chapter note notes attention titre prologue epilogue fin livre partie acte scene ' +
  'premiere deuxieme troisieme quatrieme cinquieme pourquoi comment quand ou donc mais car ' +
  'the this that these those he she they we you it i me him her them and but example request').split(/\s+/));
export function nomOrdinaire(nom: string): boolean {
  const mots = cleNom(nom).split(' ');
  return !mots[0] || mots.some(mot => MOTS_ORDINAIRES.has(mot));
}

const VERBES = String.raw`(?:dit|demanda|répondit|ajouta|murmura|cria|souffla|s['’]écria|s['’]exclama|reprit|lança|soupira|grogna|bafouilla|articula|chuchota|insista|objecta|remarqua|conclut|commença|poursuivit|interrogea|acquiesça|lâcha|cracha|said|asked|replied|whispered)`;
const MOT_NOM = String.raw`(?:[dDlL]['’])?\p{Lu}[\p{L}\p{M}'’\-]*`;
const NOM = String.raw`(?:${TITRE}\s+)?(?:(?:de|du|van|von)\s+)?${MOT_NOM}(?:\s+(?:(?:de|du|des|van|von|la|le)\s+)?${MOT_NOM}){0,3}`;
const RE_ETIQUETTE = new RegExp(String.raw`^(?:[—–«“"]\s*)?(${NOM})\s*[:：]\s*\S`, 'u');
const RE_ANNONCE = new RegExp(String.raw`^(${NOM})\s+${VERBES}\s*[:：]\s*\S`, 'u');
const RE_INCISE = new RegExp(String.raw`(?:^|[,;»”"!?…])\s*(?:[—–-]\s*)?${VERBES}\s+(${NOM})(?=[,;.!?…»”"\s]*$|[,;.!?…»”"])`, 'gu');
const RE_PRONOM = new RegExp(String.raw`\b${VERBES}-(il|elle)(?![\p{L}])`, 'u');
const RE_PLURIEL = /\b(?:dit|dirent|disaient|répondirent|demandèrent)-(?:ils|elles)\b/u;
const RE_TOUR = /^\s*[—–«“"]/u;

interface Indice {
  nom?: string; etiquette?: string; genre?: Gender; dialogue: boolean; nouveau: boolean; incertain?: boolean;
}
export interface TourLocal extends Indice { debut: number; fin: number; chapitre: number }

function indice(texte: string): Indice {
  const t = texte.trim();
  const noms = [...t.matchAll(RE_INCISE)].map(m => m[1].trim());
  const annonce = t.match(RE_ANNONCE)?.[1];
  if (annonce) noms.push(annonce);
  const distincts = [...new Map(noms.filter(n => !nomOrdinaire(n)).map(n => [cleNom(n), n])).values()];
  const incertain = distincts.length > 1 || noms.some(nomOrdinaire) || RE_PLURIEL.test(t);
  const pronom = t.match(RE_PRONOM)?.[1];
  const etiquette = t.match(RE_ETIQUETTE)?.[1];
  return {
    nom: !incertain && distincts.length === 1 ? distincts[0] : undefined,
    etiquette: etiquette && !nomOrdinaire(etiquette) ? etiquette : undefined,
    genre: pronom === 'elle' ? 'femme' : pronom === 'il' ? 'homme' : undefined,
    dialogue: RE_TOUR.test(t) || distincts.length > 0 || !!pronom,
    nouveau: RE_TOUR.test(t) || !!etiquette || !!annonce,
    incertain,
  };
}

/** Les incises/annonces nomment un locuteur. Une étiquette « Nom : » ne suffit
 * pas : il faut un nom déjà confirmé, ou un échange entre plusieurs prénoms /
 * noms titrés. Ni capitales, ni répétition, ni nombre souhaité de rôles ne sont
 * des preuves. Les pronoms sont résolus plus tard, dans l'échange courant. */
export function toursLocaux(book: Book, nomsManuels: string[] = []): TourLocal[] {
  const indices = book.segments.map(indice);
  const confirmes = new Set([...indices.flatMap(i => i.nom ? [i.nom] : []), ...nomsManuels].filter(n => !nomOrdinaire(n)).map(cleNom));
  const etiquettePlausible = (nom: string) => confirmes.has(cleNom(nom)) || RE_TITRE.test(nom) || prenomConnu(nom);
  const debuts = new Set(book.chapters.map(c => c.start));
  const paragraphes = book.paragraphs?.length === indices.length ? book.paragraphs : undefined;
  const tours: TourLocal[] = [];
  let chapitre = 0;
  indices.forEach((info, i) => {
    if (debuts.has(i)) chapitre++;
    if (info.etiquette && etiquettePlausible(info.etiquette)) info.dialogue = true;
    const precedent = tours.at(-1);
    // Une phrase supplémentaire n'est pas un changement de locuteur. Les
    // frontières de chapitre et de paragraphe interdisent cette propagation.
    if (precedent?.dialogue && paragraphes && i > 0 && paragraphes[i] === paragraphes[i - 1] &&
        precedent.chapitre === chapitre && !info.nouveau && !/[»”]\s*$/.test(book.segments[i - 1])) {
      precedent.fin = i + 1;
      if (info.nom && precedent.nom && cleNom(info.nom) !== cleNom(precedent.nom)) precedent.incertain = true;
      precedent.nom ??= info.nom;
      precedent.genre ??= info.genre;
      precedent.incertain ||= info.incertain;
    } else tours.push({ ...info, debut: i, fin: i + 1, chapitre });
  });

  // Vérifier les étiquettes au niveau de l'échange, pas d'une phrase isolée.
  for (let debut = 0; debut < tours.length;) {
    if (!tours[debut].dialogue) { debut++; continue; }
    let fin = debut + 1;
    while (fin < tours.length && tours[fin].dialogue && tours[fin].chapitre === tours[debut].chapitre) fin++;
    const noms = new Set(tours.slice(debut, fin).flatMap(t =>
      t.incertain ? [] : t.nom ? [cleNom(t.nom)] : t.etiquette && etiquettePlausible(t.etiquette) ? [cleNom(t.etiquette)] : []));
    for (let i = debut; i < fin; i++) {
      const tour = tours[i];
      if (!tour.nom && tour.etiquette) {
        if (!tour.incertain && (confirmes.has(cleNom(tour.etiquette)) || (noms.size >= 2 && etiquettePlausible(tour.etiquette)))) {
          tour.nom = tour.etiquette;
        } else { tour.incertain = true; tour.dialogue = false; }
      }
    }
    debut = fin;
  }
  return tours;
}
