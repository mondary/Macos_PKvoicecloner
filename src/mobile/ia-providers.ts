/** Fournisseurs OpenAI-compatibles proposés dans les réglages : l'adresse est
 *  remplie automatiquement, le lien mène à la page des clés, et les modèles
 *  connus servent de repli avant le chargement de la liste réelle. */
export interface FournisseurIA {
  id: string; nom: string; url: string; cles: string; modeles: string[]; note?: string;
}

export const FOURNISSEURS: FournisseurIA[] = [
  { id: 'zai', nom: 'GLM · Z.ai', url: 'https://api.z.ai/api/paas/v4', cles: 'https://z.ai/manage-apikey/apikey-list',
    modeles: ['glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-flash'] },
  { id: 'bigmodel', nom: 'GLM · BigModel (Chine)', url: 'https://open.bigmodel.cn/api/paas/v4', cles: 'https://open.bigmodel.cn/usercenter/apikeys',
    modeles: ['glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-flash'] },
  { id: 'deepseek', nom: 'DeepSeek', url: 'https://api.deepseek.com/v1', cles: 'https://platform.deepseek.com/api_keys',
    modeles: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'openai', nom: 'OpenAI', url: 'https://api.openai.com/v1', cles: 'https://platform.openai.com/api-keys',
    modeles: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'] },
  { id: 'mistral', nom: 'Mistral', url: 'https://api.mistral.ai/v1', cles: 'https://console.mistral.ai/api-keys/',
    modeles: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'] },
  { id: 'groq', nom: 'Groq', url: 'https://api.groq.com/openai/v1', cles: 'https://console.groq.com/keys',
    modeles: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
  { id: 'openrouter', nom: 'OpenRouter', url: 'https://openrouter.ai/api/v1', cles: 'https://openrouter.ai/keys',
    modeles: [], note: 'Chargez la liste des modèles après avoir collé votre clé.' },
  { id: 'opencode-zen', nom: 'OpenCode Zen', url: 'https://opencode.ai/zen/v1', cles: 'https://opencode.ai/auth',
    modeles: [], note: 'Les modèles gratuits (-free) ne fonctionnent que dans l’application OpenCode : choisissez un modèle payant, ou OpenCode Go avec un abonnement.' },
  { id: 'opencode-go', nom: 'OpenCode Go (abonnement)', url: 'https://opencode.ai/inference/go/openai/v1', cles: 'https://opencode.ai/auth',
    modeles: [], note: 'Abonnement OpenCode Go requis. Chargez la liste, puis choisissez un modèle compatible OpenAI (GLM, DeepSeek, Kimi…).' },
  { id: 'custom', nom: 'Autre adresse (OpenAI-compatible)', url: '', cles: '', modeles: [] },
];

/** Anciennes adresses conservées pour reconnaître une configuration déjà enregistrée. */
const ANCIENNES_URLS: { id: string; url: string }[] = [
  { id: 'opencode-go', url: 'https://opencode.ai/zen/go/v1' },
];

const sansFin = (url: string) => url.trim().replace(/\/+$/, '');
export const fournisseurParUrl = (url: string): FournisseurIA => {
  const propre = sansFin(url);
  const direct = FOURNISSEURS.find(f => f.url && sansFin(f.url) === propre);
  if (direct) return direct;
  const ancienne = ANCIENNES_URLS.find(a => sansFin(a.url) === propre);
  return ancienne ? fournisseurParId(ancienne.id) : FOURNISSEURS.find(f => f.id === 'custom')!;
};
export const fournisseurParId = (id: string): FournisseurIA =>
  FOURNISSEURS.find(f => f.id === id) ?? FOURNISSEURS[0];
/** Liste proposée dans la déroulante : les modèles connus du fournisseur, le
 *  modèle déjà enregistré s'il n'y figure pas, puis l'option de saisie libre.
 *  Les modèles gratuits d'OpenCode Zen sont réservés à l'application OpenCode :
 *  les afficher ici mènerait à une erreur « free usage limit ». */
export function optionsModeles(fournisseur: FournisseurIA, actuel = '', charges: string[] = []): string[] {
  const utilisable = (id: string) =>
    !(fournisseur.id === 'opencode-zen' && (/-free$/i.test(id) || id === 'big-pickle' || id === 'test'));
  const liste = [...new Set([...charges, ...fournisseur.modeles].filter(id => id && utilisable(id)))];
  if (actuel && !liste.includes(actuel)) liste.push(actuel);
  return liste;
}
