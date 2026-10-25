// Harnais de capture : rend la page Réglages (module pur) avec l'état par défaut
// et écrit store/media-kit/settings-preview.html pour la capture Iris.
// Activation : PK_SETTINGS_SHOT=1 pnpm exec vitest run src/mobile/tests/capture-settings.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaults } from '../types';
import { settingsViewHTML } from '../settings-view';

const ici = (() => {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, 'src/mobile/style.css'))) {
    const parent = resolve(dir, '..');
    if (parent === dir) throw new Error('Racine du projet introuvable depuis ' + process.cwd());
    dir = parent;
  }
  return dir;
})();

describe.skipIf(!process.env.PK_SETTINGS_SHOT)('capture de la page Réglages', () => {
  for (const tab of ['lecture', 'voix', 'apropos'] as const) {
    it(`écrit la capture de l’onglet ${tab}`, () => {
      const html = settingsViewHTML({
        settings: { ...defaults, ia: { url: 'https://api.deepseek.com/v1', modele: 'deepseek-chat', revision: 'r1', enabled: true, hasKey: true } },
        tab, version: '2026.10.68', native: true,
        updateHTML: '<section class="settings-section"><h2>Mises à jour</h2><p class="section-description">PK Reader <strong>2026.10.68</strong></p></section>',
      });
      const body = `<div class="app-shell"><main class="main-content">${html}</main></div>`;
      const style = readFileSync(resolve(ici, 'src/mobile/style.css'), 'utf8');
      const police = (famille: string, poids: number, fichier: string) =>
        `@font-face{font-family:'${famille}';font-style:normal;font-weight:${poids};src:url('fonts/${fichier}') format('woff2')}`;
      const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${police('DM Sans', 400, 'dm-sans-latin-400-normal.woff2')}${police('DM Sans', 500, 'dm-sans-latin-500-normal.woff2')}${police('DM Sans', 600, 'dm-sans-latin-600-normal.woff2')}${police('DM Sans', 700, 'dm-sans-latin-700-normal.woff2')}${police('Literata', 400, 'literata-latin-400-normal.woff2')}${police('Literata', 500, 'literata-latin-500-normal.woff2')}
html,body{height:844px}body{margin:0;background:var(--bg)}main{margin:0;padding:28px 22px 40px;max-width:none}
${style}</style></head><body>${body}</body></html>`;
      mkdirSync(resolve(ici, 'store/media-kit'), { recursive: true });
      writeFileSync(resolve(ici, `store/media-kit/settings-${tab}.html`), page);
      expect(html).toContain('settings-tabs');
    });
  }
});
