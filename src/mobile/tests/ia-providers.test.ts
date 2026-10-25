import { describe, expect, it } from 'vitest';
import { FOURNISSEURS, fournisseurParId, fournisseurParUrl, optionsModeles } from '../ia-providers';

describe('fournisseurs IA', () => {
  it('remplit l’adresse et la page des clés pour chaque fournisseur connu', () => {
    for (const f of FOURNISSEURS.filter(f => f.id !== 'custom')) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.cles).toMatch(/^https:\/\//);
      expect(f.nom.length).toBeGreaterThan(2);
    }
  });

  it('retrouve le fournisseur depuis l’adresse enregistrée, même avec une barre finale', () => {
    expect(fournisseurParUrl('https://api.deepseek.com/v1/').id).toBe('deepseek');
    expect(fournisseurParUrl('https://api.openai.com/v1').id).toBe('openai');
    expect(fournisseurParUrl('https://exemple.invalid/v1').id).toBe('custom');
    expect(fournisseurParUrl('').id).toBe('custom');
    expect(fournisseurParId('zai').url).toBe('https://api.z.ai/api/paas/v4');
  });

  it('propose les modèles connus, le modèle enregistré et les modèles chargés, sans doublon', () => {
    const f = fournisseurParId('deepseek');
    expect(optionsModeles(f, 'deepseek-chat')).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    expect(optionsModeles(f, 'mon-modele', ['deepseek-chat', 'nouveau-modele']))
      .toEqual(['deepseek-chat', 'nouveau-modele', 'deepseek-reasoner', 'mon-modele']);
    expect(optionsModeles(fournisseurParId('custom'))).toEqual([]);
  });
});
