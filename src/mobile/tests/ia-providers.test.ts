import { describe, expect, it } from 'vitest';
import { FOURNISSEURS, adresseLocale, fournisseurParId, fournisseurParUrl, optionsModeles } from '../ia-providers';

describe('fournisseurs IA', () => {
  it('remplit l’adresse et la page des clés pour chaque fournisseur connu', () => {
    for (const f of FOURNISSEURS.filter(f => f.id !== 'custom')) {
      expect(f.url).toMatch(/^https?:\/\//);
      // Seule l'IA locale se passe de clé cloud.
      if (f.id !== 'local') expect(f.cles).toMatch(/^https:\/\//);
      expect(f.nom.length).toBeGreaterThan(2);
    }
  });

  it('retrouve le fournisseur depuis l’adresse enregistrée, même avec une barre finale', () => {
    expect(fournisseurParUrl('https://api.deepseek.com/v1/').id).toBe('deepseek');
    expect(fournisseurParUrl('https://api.openai.com/v1').id).toBe('openai');
    expect(fournisseurParUrl('https://opencode.ai/zen/v1').id).toBe('opencode-zen');
    expect(fournisseurParUrl('https://opencode.ai/inference/go/openai/v1').id).toBe('opencode-go');
    // Ancienne adresse Go encore enregistrée sur un téléphone déjà configuré.
    expect(fournisseurParUrl('https://opencode.ai/zen/go/v1').id).toBe('opencode-go');
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

  it('masque les modèles gratuits d’OpenCode Zen, réservés à l’application OpenCode', () => {
    const zen = fournisseurParId('opencode-zen');
    expect(optionsModeles(zen, '', ['glm-5.3-flash-free', 'big-pickle', 'glm-5.3', 'test']))
      .toEqual(['glm-5.3']);
    // Un modèle gratuit déjà enregistré reste affiché pour ne pas le perdre de vue.
    expect(optionsModeles(zen, 'glm-5.3-flash-free', ['glm-5.3-flash-free', 'glm-5.3']))
      .toEqual(['glm-5.3', 'glm-5.3-flash-free']);
    // Les autres fournisseurs ne sont pas filtrés.
    expect(optionsModeles(fournisseurParId('custom'), '', ['modele-free'])).toEqual(['modele-free']);
  });

  it('reconnaît une IA locale (HTTP privé) sans exiger de clé cloud', () => {
    expect(adresseLocale('http://192.168.1.20:11434/v1')).toBe(true);
    expect(adresseLocale('http://127.0.0.1:8080/v1')).toBe(true);
    expect(adresseLocale('http://localhost:1234/v1')).toBe(true);
    expect(adresseLocale('http://51.6.7.8:11434/v1')).toBe(false);
    expect(adresseLocale('https://api.openai.com/v1')).toBe(false);
    expect(fournisseurParUrl('http://127.0.0.1:11434/v1').id).toBe('local');
  });
});
