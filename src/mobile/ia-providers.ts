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
  { id: 'custom', nom: 'Autre adresse (OpenAI-compatible)', url: '', cles: '', modeles: [] },
];

const sansFin = (url: string) => url.trim().replace(/\/+$/, '');
export const fournisseurParUrl = (url: string): FournisseurIA => {
  const propre = sansFin(url);
  return FOURNISSEURS.find(f => f.url && sansFin(f.url) === propre)
    ?? FOURNISSEURS.find(f => f.id === 'custom')!;
};
export const fournisseurParId = (id: string): FournisseurIA =>
  FOURNISSEURS.find(f => f.id === id) ?? FOURNISSEURS[0];
/** Liste proposée dans la déroulante : les modèles connus du fournisseur, le
 *  modèle déjà enregistré s'il n'y figure pas, puis l'option de saisie libre. */
export function optionsModeles(fournisseur: FournisseurIA, actuel = '', charges: string[] = []): string[] {
  const liste = [...new Set([...charges, ...fournisseur.modeles, actuel].filter(Boolean))];
  return liste;
}
