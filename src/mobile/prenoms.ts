/** Lexique de prénoms embarqué : le sexe d'une voix se déduit sur le
 *  téléphone, sans réseau ni Mac. Noms normalisés (minuscules, sans accent).
 *  Un prénom présent dans les deux listes (Claude, Camille…) reste
 *  « indetermine » — on ne devine pas. */
const HOMMES = new Set(('adrien alain alban albert alexandre alexis alfred ali amar amedee anatole andre andy antoine armand arnaud arnold arthur athanase aubin augustin aurelien aurele baptiste barnabe barthelemy basile bastien baudouin benjamin benoit berenger bernard bertrand blaise boniface brice bruno calixte calliste cedric cesar charles charlot christian christophe clement clovis colin corentin cyr cyril damien daniel david denis didier diego dimitri dorian dominique edgar edmond edouard elias elie emile emmanuel enzo erwan eric esteban etienne eudes eugene evrard fabien fabrice faustin felix ferdinand fernand florian florent francis franck frederic gabriel gael gaspard gaston gaetan geoffroy georges gerard gervais ghislain gilbert gilles gregoire guillaume gustave guy hans harold henri herve honore hugues humbert ismael ivan jacky jacques jasper jean jeremy jerome joachim johan jonas jordan jorge jose joseph josselin judicael jules julien justin karim kevin kilian lambert laurent lazare leandre leon leonard loic lorenzo louis lourenco luc lucas lucien ludovic macaire malo manuel marc marcel marius martin matheo mathias mathieu matthieu maurice maxime michel modeste morgan nathan nicolas noel olivier omer pascal patrice patrick paul paulo philibert philippe pierre pierrick quentin rachid raphael raoul raymond regis renaud rene richard robert rodrigue roger roland romain romeo ronan rudyard salomon samuel sebastien serge severin simon sixte stephane sylvain tadee telesphore theodore thierry thibault thomas timothe tristan ulric valere venance victor vincent vital xavier yann yannick yves yvon zakarie adolphe cyriaque eleazar elisee godefroy landry leopold maximilien meriadec nestor prospere sylvestre').split(/\s+/));

const FEMMES = new Set(('adele adeline agathe agnes aimee aline alix alice alison amandine ambre amelie anais anastasie andree anna anne annick annie antoinette apolline arlette armelle astrid aurelie auriane aurore barbara beatrice benedicte berenice bernadette bertille blanche brigitte camille capucine carole caroline catherine cecile celeste celestine cerise charlotte chloe christiane christine claire clarisse claude claudine colette colombe constance coralie corinne daniele danielle daphne deborah delphine denise diane dorothee edith eleonore elisa elise elodie eloise elvire emilie emma emmanuelle estelle esther eugenie eulalie eve evette fantine felicie fernanda flavie fleur francoise frederique gabrielle genevieve georgette geraldine germaine gilberte gisele gladys guillemette henriette herminie hortense ida ines irene isabeau isabelle jacqueline jane janine jasmine jeanne jeannette jessica josee josette josephine judith julie juliette justine karen lara laura laure laurence laurine lea liliane lison lucie lucienne madeleine maela magali mahaut manon margaux margot marguerite marielle mariette marina marine marion marise marthe martine mathilde melanie melissa mireille miriam monique muriel mylene nadia nadege nancy natalie nathalie nicole nine nina noemie oceane odette odile olivia ophelie pascale pauline penelope philomene prudence rachelle regine renee rose rosalie rosalinde roxane sabine salome sandrine sara severine sibylle sidonie simone sixtine solange sophie suzanne sylvie tatiana teodora tessa therese thomasine tiphaine valentine valerie veronique victoire victorine virginie viviane xaviere yolande zita zoe').split(/\s+/));

/** Titres et marques de politesse : le sexe est certain. */
export const TITRE_FEMME = /^(?:Mme\.?|Mlle\.?|Madame|Mademoiselle)\s+/i;
export const TITRE_HOMME = /^(?:M\.|Monsieur)\s+/i;

/** Sexe du rôle déduit du nom : titre d'abord, puis lexique de prénoms.
 *  Rend « indetermine » plutôt qu'un mauvais choix. */
export function genreDuNom(nom: string): 'homme' | 'femme' | 'indetermine' {
  const label = nom.trim();
  if (TITRE_FEMME.test(label)) return 'femme';
  if (TITRE_HOMME.test(label)) return 'homme';
  const prenom = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s-]+/)[0]?.toLowerCase() ?? '';
  if (!prenom) return 'indetermine';
  const homme = HOMMES.has(prenom);
  const femme = FEMMES.has(prenom);
  if (homme && femme) return 'indetermine';
  return homme ? 'homme' : femme ? 'femme' : 'indetermine';
}

/** Un prénom connu ? Sert à repérer les personnages nommés dans le récit
 *  (première occurrence) sans dépendre d'un modèle de langage. */
export function prenomConnu(nom: string): boolean {
  const prenom = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s-]+/)[0]?.toLowerCase() ?? '';
  return HOMMES.has(prenom) || FEMMES.has(prenom);
}
