// Harnais de capture : rend le panneau de notifications de production avec des
// données fictives et écrit store/media-kit/notifications-preview.html.
// Activation : PK_NOTIFICATIONS_SHOT=1 pnpm exec vitest run src/mobile/tests/capture-notifications.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createIcons, icons } from 'lucide';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectNotifications, notificationDrawer } from '../activity-view';

const ici = (() => {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, 'src/mobile/style.css'))) {
    const parent = resolve(dir, '..');
    if (parent === dir) throw new Error('Racine du projet introuvable depuis ' + process.cwd());
    dir = parent;
  }
  return dir;
})();

describe.skipIf(!process.env.PK_NOTIFICATIONS_SHOT)('capture du panneau de notifications', () => {
  it('écrit la page de capture avec les états réels du composant', () => {
    const items = collectNotifications([
      { id: 'demo-crossing', title: 'La traversée', state: 'error', source: 'Repérage local', debut: Date.now(), error: 'Le fournisseur a refusé la requête : quota épuisé.' },
      { id: 'demo-controls', title: 'Le voyage de Camille', state: 'running', source: 'IA · démonstration', debut: Date.now() - 90_000, progress: { done: 28, total: 141, chapter: 'Chapitre 2' } },
    ], [
      { id: 'neural:miro', name: 'Miro', progress: 64, state: 'running' },
      { id: 'neural:siwis', name: 'Siwis', progress: 100, state: 'done' },
    ]);
    document.body.innerHTML = `<img class="capture-library" src="../screenshots/android-reader/library.png" alt="" />
      <dialog id="notifications" class="notifications-dialog" aria-labelledby="notifications-title">
        <div class="notifications-panel">
          <header class="notifications-head">
            <div><p class="eyebrow">SUIVI</p><h2 id="notifications-title">Notifications</h2></div>
            <button type="button" class="icon-button" data-action="notifications-close" aria-label="Fermer les notifications" title="Fermer les notifications"><i data-lucide="x" aria-hidden="true"></i></button>
          </header>
          <div id="notifications-body" class="notifications-body">${notificationDrawer(items)}</div>
        </div>
      </dialog>`;
    createIcons({ icons, attrs: { 'stroke-width': 1.7 } });
    expect(document.querySelectorAll('#notifications .notification-item')).toHaveLength(4);
    expect(document.getElementById('notifications-body')?.textContent).toContain('quota épuisé');

    const style = readFileSync(resolve(ici, 'src/mobile/style.css'), 'utf8');
    const reader = readFileSync(resolve(ici, 'src/mobile/reader.css'), 'utf8');
    const police = (famille: string, poids: number, fichier: string) =>
      `@font-face{font-family:'${famille}';font-style:normal;font-weight:${poids};src:url('fonts/${fichier}') format('woff2')}`;
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Notifications — PK Reader</title>
<style>${police('DM Sans', 400, 'dm-sans-latin-400-normal.woff2')}${police('DM Sans', 500, 'dm-sans-latin-500-normal.woff2')}${police('DM Sans', 600, 'dm-sans-latin-600-normal.woff2')}${police('DM Sans', 700, 'dm-sans-latin-700-normal.woff2')}${police('Literata', 400, 'literata-latin-400-normal.woff2')}${police('Literata', 500, 'literata-latin-500-normal.woff2')}
html,body{height:844px;margin:0}.capture-library{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
${style}${reader}</style></head>
<body>${document.body.innerHTML}<script>document.querySelector('#notifications').showModal(); document.activeElement?.blur();</script></body></html>`;
    mkdirSync(resolve(ici, 'store/media-kit'), { recursive: true });
    writeFileSync(resolve(ici, 'store/media-kit/notifications-preview.html'), html);
  });
});
