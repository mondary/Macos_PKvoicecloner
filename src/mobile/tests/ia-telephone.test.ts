import { describe, expect, it } from 'vitest';
import { attribuerTelephone, configIA, extraireJson, requeteIA, slug, type Chat } from '../ia-telephone';

describe('utilitaires du client IA', () => {
  it('slug comme le studio : minuscules, sans accent, narrator → narrateur', () => {
    expect(slug('Le Modèle Schaltzmann')).toBe('le-modele-schaltzmann');
    expect(slug('Narrator')).toBe('narrateur');
    expect(slug('  Élodie  ')).toBe('elodie');
    expect(slug('???')).toBe('voix');
  });

  it('extrait le JSON objet, même entouré de texte ou de clôtures', () => {
    expect(extraireJson('{"a": 1}')).toEqual({ a: 1 });
    expect(extraireJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extraireJson('Voici le résultat : {"a": {"b": 2}} — terminé.')).toEqual({ a: { b: 2 } });
    expect(() => extraireJson('voici une réponse sans objet')).toThrow(/format JSON/);
    expect(() => extraireJson('[1, 2]')).toThrow(/format JSON/);
  });

  it('n’active l’IA que si elle a été testée et enregistrée sur le téléphone', () => {
    expect(configIA({})).toBeNull();
    const ia = { url: 'https://api.deepseek.com/v1', modele: 'deepseek-chat', revision: 'r1', enabled: true };
    expect(configIA({ ia })).toEqual(ia);
    expect(configIA({ ia: { ...ia, enabled: false } })).toBeNull();
    expect(configIA({ ia: { ...ia, revision: '' } })).toBeNull();
    expect(configIA({ ia: { ...ia, url: 'http://api.deepseek.com' } })).toBeNull();
  });
});

function chatScripte(reponses: (message: string) => string) {
  const messages: string[] = [];
  const chat: Chat & { messages: string[] } = Object.assign(
    (message: string) => { messages.push(message); return Promise.resolve(reponses(message)); }, { messages });
  return chat;
}

const narration = (ligne: number, confiance = 'haute') => ({ ligne, locuteur: 'narrateur', confiance });

describe('attribuerTelephone — trois passes, preuves à l’appui', () => {
  const phrases = ['Il entra.', '— Bonjour, dit Le Modèle.', '— Salut, répondit Élodie.', 'Le vent souffla.'];

  function scenario(message: string): string {
    if (message.includes('TÂCHE: CAST')) {
      return JSON.stringify({ cast: [
        { id: 'narrateur', nom: 'Narrateur', genre: 'indetermine', role: 'narrateur', aliases: [], lignes: [] },
        { id: 'le-modele', nom: 'Le Modèle', genre: 'homme', role: 'personnage', aliases: ['Schaltzmann'], lignes: [2] },
        { id: 'elodie', nom: 'Élodie', genre: 'femme', role: 'personnage', aliases: [], lignes: [3] },
      ] });
    }
    if (message.includes('TÂCHE: ATTRIBUTION')) {
      return JSON.stringify({ attributions: [
        narration(1), { ligne: 2, locuteur: 'le-modele', confiance: 'haute' },
        { ligne: 3, locuteur: 'elodie', confiance: 'moyenne' }, narration(4, 'faible'),
      ] });
    }
    return JSON.stringify({ attributions: [
      narration(1), { ligne: 2, locuteur: 'le-modele', confiance: 'haute' },
      { ligne: 3, locuteur: 'narrateur', confiance: 'faible' }, narration(4),
    ] });
  }

  it('identifie, attribue puis relit ; une confiance non haute reste au narrateur', async () => {
    const chat = chatScripte(scenario);
    const phases: string[] = [];
    const resultat = await attribuerTelephone(chat, 'Racines', phrases, [
      { id: 'narrateur', nom: 'Narrateur', genre: 'indetermine', role: 'narrateur' },
      { id: 'schaltzmann', nom: 'Schaltzmann', genre: 'homme', role: 'personnage' },
    ], '', value => phases.push(value));
    expect(phases).toEqual(['personnages', 'attribution', 'verification']);
    expect(resultat.locuteurs).toEqual(['narrateur', 'schaltzmann', 'narrateur', 'narrateur']);
    // L'alias « Schaltzmann » réutilise l'identité déjà confirmée.
    expect(resultat.personnages.map(p => p.id)).toEqual(['narrateur', 'schaltzmann']);
    expect(resultat.personnages.find(p => p.id === 'schaltzmann')?.nom).toBe('Schaltzmann');
    // Trois appels par lot : CAST, ATTRIBUTION, VERIFICATION.
    expect(chat.messages).toHaveLength(3);
    expect(chat.messages[1]).toContain('Bonjour, dit Le Modèle.');
  });

  it('découpe en lots de 40 avec contexte et répète les trois passes', async () => {
    const livres = [
      ...Array.from({ length: 85 }, (_, i) => `Phrase ${i + 1}.`),
    ];
    const chat = chatScripte(message => {
      if (message.includes('TÂCHE: CAST')) {
        return JSON.stringify({ cast: [{ id: 'narrateur', nom: 'Narrateur', genre: 'indetermine', role: 'narrateur', aliases: [], lignes: [] }] });
      }
      const nombre = (message.match(/^\d+\. /gm) ?? []).length;
      return JSON.stringify({ attributions: Array.from({ length: nombre }, (_, i) => narration(i + 1)) });
    });
    const resultat = await attribuerTelephone(chat, 'Livre', livres, []);
    expect(resultat.locuteurs).toHaveLength(85);
    expect(chat.messages.filter(m => m.includes('TÂCHE: CAST'))).toHaveLength(3);
    expect(chat.messages.filter(m => m.includes('TÂCHE: ATTRIBUTION'))).toHaveLength(3);
    expect(chat.messages.filter(m => m.includes('TÂCHE: VERIFICATION'))).toHaveLength(3);
    // Le contexte du 2e lot reprend les 6 dernières phrases déjà attribuées.
    const deuxieme = chat.messages.filter(m => m.includes('TÂCHE: CAST'))[1];
    expect(deuxieme).toContain('narrateur : Phrase 35.');
    expect(deuxieme).toContain('narrateur : Phrase 40.');
  });

  it('ne laisse pas un personnage nouvellement nommé sans ligne où il parle', async () => {
    const chat = chatScripte(message => message.includes('TÂCHE: CAST')
      ? JSON.stringify({ cast: [{ id: 'solution', nom: 'La Solution', genre: 'femme', role: 'personnage', lignes: [] }] })
      : scenario(message));
    await expect(attribuerTelephone(chat, 'Racines', phrases, [])).rejects.toThrow(/doit citer au moins une ligne/);
    // Une seule réparation de format, jamais plus : deux appels CAST.
    expect(chat.messages.filter(m => m.includes('TÂCHE: CAST'))).toHaveLength(2);
  });

  it('rejette une attribution qui ne couvre pas toutes les lignes', async () => {
    const chat = chatScripte(message => message.includes('TÂCHE: ATTRIBUTION')
      ? JSON.stringify({ attributions: [narration(1)] })
      : scenario(message));
    await expect(attribuerTelephone(chat, 'Racines', phrases, [])).rejects.toThrow(/Exactement 4 attributions/);
  });
});

describe('requête branchée sur analyserLivre', () => {
  it('n’expose que la révision au pont natif, jamais la clé', async () => {
    const appels: Array<Record<string, unknown>> = [];
    const bridge = {
      chatIA: async (options: Record<string, unknown>) => {
        appels.push(options);
        const message = String(options.message);
        if (message.includes('TÂCHE: CAST')) return { texte: JSON.stringify({ cast: [{ id: 'narrateur', nom: 'Narrateur', genre: 'indetermine', role: 'narrateur', lignes: [] }] }) };
        return { texte: JSON.stringify({ attributions: [narration(1), narration(2)] }) };
      },
    };
    const requete = requeteIA(bridge, { url: 'https://open.bigmodel.cn/api/paas/v4', modele: 'glm-4.7', revision: 'rev-42', enabled: true });
    const resultat = await requete({ titre: 'Livre', phrases: ['Bonjour.', 'Il partit.'], personnages: [] });
    expect(resultat.locuteurs).toEqual(['narrateur', 'narrateur']);
    expect(appels[0]).toEqual({ revision: 'rev-42', message: expect.any(String), json: true });
    expect(JSON.stringify(appels)).not.toContain('sk-');
  });
});
