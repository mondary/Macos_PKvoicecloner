// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defaults } from '../types';
import { lectureBody, settingsViewHTML } from '../settings-view';

const base = { settings: { ...defaults }, tab: 'lecture' as const, version: '2026.10.68', native: true, updateHTML: '<section id="maj">Mises à jour</section>' };

describe('page Réglages en onglets', () => {
  it('propose trois onglets et ne montre que le contenu de l’onglet actif', () => {
    const html = settingsViewHTML(base);
    const onglets = [...html.matchAll(/data-action="settings-tab" data-id="(\w+)" class="([^"]*)"/g)].map(m => [m[1], m[2]] as [string, string]);
    expect(onglets).toEqual([['lecture', 'active'], ['voix', ''], ['apropos', '']]);
    // Lecture visible, les autres panneaux absents.
    expect(html).toContain('Interligne');
    expect(html).not.toContain('id="ia-form"');
    expect(html).not.toContain('Crédits');
  });

  it('l’onglet Voix & analyse regroupe IA, studio et gestion des voix', () => {
    const html = settingsViewHTML({ ...base, tab: 'voix' });
    expect(html).toContain('id="ia-form"');
    expect(html).toContain('id="ia-provider"');
    expect(html).toContain('id="ia-model-select"');
    expect(html).toContain('data-action="ia-load-models"');
    expect(html).toContain('Trouver ma clé chez GLM · Z.ai');
    expect(html).toContain('id="studio-form"');
    expect(html).toContain('Télécharger ou gérer les voix');
    expect(html).not.toContain('Interligne');
  });

  it('l’onglet À propos porte les mises à jour, les crédits et le Ko-fi', () => {
    const html = settingsViewHTML({ ...base, tab: 'apropos' });
    expect(html).toContain('id="maj"');
    expect(html).toContain('Crédits & inspirations');
    expect(html).toContain('https://ko-fi.com/pouark');
    expect(html).not.toContain('id="ia-form"');
  });

  it('l’IA active affiche son modèle et le bouton de désactivation', () => {
    const html = settingsViewHTML({ ...base, tab: 'voix', settings: { ...defaults, ia: { url: 'https://api.deepseek.com/v1', modele: 'deepseek-chat', revision: 'r1', enabled: true, hasKey: true } } });
    expect(html).toContain('<strong>Active</strong> · deepseek-chat');
    expect(html).toContain('Désactiver l’IA du téléphone');
  });

  it('rassure sur la clé déjà enregistrée, même si le test a échoué', () => {
    const html = settingsViewHTML({ ...base, tab: 'voix', settings: { ...defaults, ia: { url: 'https://opencode.ai/inference/go/openai/v1', modele: 'glm-5.3', revision: '', enabled: false, hasKey: true } } });
    expect(html).toContain('Clé enregistrée sur ce téléphone');
    expect(html).toContain('laissez le champ vide pour la conserver');
  });
});

describe('corps de lecture partagé', () => {
  it('contient tous les réglages de lecture, avec états pressés corrects', () => {
    const html = lectureBody({ ...defaults, fontSize: 25, theme: 'paper', surlignage: 'phrase' });
    for (const attendu of ['Thème', 'Taille du texte', 'Interligne', 'Marges', 'Mise en page',
      'Vitesse d’écoute', 'Surlignage pendant l’écoute', 'Suivi de lecture']) expect(html).toContain(attendu);
    expect(html.match(/data-action="font" data-id="25"[^>]*aria-pressed="true"/)).toBeTruthy();
    expect(html.match(/data-action="theme" data-id="paper"[^>]*aria-pressed="true"/)).toBeTruthy();
    expect(html.match(/data-action="surlignage" data-id="phrase"[^>]*aria-pressed="true"/)).toBeTruthy();
  });
});
