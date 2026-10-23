// Harnais de capture : rend la vraie feuille « Les voix de ce livre » (code de
// production) avec des données fictives et écrit store/media-kit/casting-preview.html
// pour la capture Iris. Activation : PK_CASTING_SHOT=1 pnpm exec vitest run
// src/mobile/tests/capture-casting.test.ts — voir store/media-kit/README.md.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIcons, icons } from 'lucide';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaults, type Book, type Voice } from '../types';
/** Racine du projet, trouvée depuis le cwd (vitest ne fournit pas d’URL file). */
const ici = (() => {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, 'src/mobile/style.css'))) {
    const parent = resolve(dir, '..');
    if (parent === dir) throw new Error('Racine du projet introuvable depuis ' + process.cwd());
    dir = parent;
  }
  return dir;
})();
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => {}), models: vi.fn(), load: vi.fn(async () => {}), pause: vi.fn(async () => {}) }));
vi.mock('../storage', () => ({ library: { save: mocks.save } }));
vi.mock('../engine', () => ({ native: true, Reader: { models: mocks.models }, audio: { pause: mocks.pause, load: mocks.load, play: vi.fn() } }));
import { openCasting } from '../casting-ui';
import { paragraphsOf } from '../books';

const available: Voice[] = [
  { id: 'system:default', name: 'Voix du téléphone', language: 'fr', kind: 'system', installed: true },
  { id: 'neural:tom', name: 'Tom', language: 'fr-FR', kind: 'neural', installed: true, size: 21 },
  { id: 'neural:siwis', name: 'Siwis', language: 'fr-FR', kind: 'neural', installed: true, size: 20.9 },
  { id: 'neural:gilles', name: 'Gilles', language: 'fr-FR', kind: 'neural', installed: true, size: 21.2 },
];

beforeEach(() => {
  document.body.innerHTML = '<button id="trigger">Voix</button><dialog id="sheet"></dialog>';
  const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  sheet.showModal = () => { sheet.open = true; };
  sheet.close = () => { sheet.open = false; sheet.dispatchEvent(new Event('close')); };
  mocks.models.mockResolvedValue({ voices: available, downloads: {} });
});

describe.skipIf(!process.env.PK_CASTING_SHOT)('capture de la fiche personnages', () => {
  it('écrit la page de capture avec la vraie interface', async () => {
    const texte = [
      'Voilà : la situation était tendue.',
      'Exemple : aucun mot suivi de deux-points ne devient un personnage.',
      '— Entrez, dit Schaltzmann.',
      '— Merci, répondit Élodie.',
      'Élodie contempla la pièce, silencieuse.',
      '— Vous êtes prêt ? demanda Schaltzmann.',
      '— Tout à fait, répondit Élodie.',
    ].join('\n\n');
    const decoupage = paragraphsOf(texte);
    const book: Book = { id: 'demo-casting', title: 'La chambre d’été — extrait', author: 'Texte de démonstration', format: 'TXT', language: 'fr', color: 3,
      segments: decoupage.phrases, paragraphs: decoupage.paragraphes, styles: decoupage.styles,
      chapters: [{ title: 'Chapitre premier', start: 0, end: decoupage.phrases.length }],
      position: 0, completed: false, added: 0, opened: 0, bookmarks: [] };

    const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
    const show = (title: string, body: string) => {
      sheet.setAttribute('aria-labelledby', 'sheet-title');
      sheet.innerHTML = `<div class="sheet-handle"></div><header><h2 id="sheet-title">${title}</h2><button class="icon-button" aria-label="Fermer" title="Fermer" data-action="close"><i data-lucide="x" class="" aria-hidden="true"></i></button></header>${body}`;
      sheet.showModal();
      createIcons({ icons });
    };

    await openCasting(book, available, { ...defaults, voice: 'system:default' }, show, () => {});
    await vi.waitFor(() => expect(sheet.querySelector('.casting-summary')?.textContent).toContain('phrases attribuées'));
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 60));   // dernier redraw après la sauvegarde
    createIcons({ icons });
    sheet.querySelector('.casting-evidence')?.setAttribute('open', '');
    if (!sheet.open) sheet.setAttribute('open', '');

    const style = readFileSync(resolve(ici, 'src/mobile/style.css'), 'utf8');
    const reader = readFileSync(resolve(ici, 'src/mobile/reader.css'), 'utf8');
    const police = (famille: string, poids: number, fichier: string) =>
      `@font-face{font-family:'${famille}';font-style:normal;font-weight:${poids};src:url('fonts/${fichier}') format('woff2')}`;
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${police('DM Sans', 400, 'dm-sans-latin-400-normal.woff2')}${police('DM Sans', 500, 'dm-sans-latin-500-normal.woff2')}${police('DM Sans', 600, 'dm-sans-latin-600-normal.woff2')}${police('DM Sans', 700, 'dm-sans-latin-700-normal.woff2')}${police('Literata', 400, 'literata-latin-400-normal.woff2')}${police('Literata', 500, 'literata-latin-500-normal.woff2')}
html,body{height:844px}body{margin:0;background:var(--bg)}dialog[open]{display:block;position:fixed;inset:0;width:fit-content;height:fit-content;margin:auto 0 0}
${style}${reader}</style></head>
<body><div class="app-shell"></div>${sheet.outerHTML}</body></html>`;
    mkdirSync(resolve(ici, 'store/media-kit'), { recursive: true });
    writeFileSync(resolve(ici, 'store/media-kit/casting-preview.html'), html);
  });
});
