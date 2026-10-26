import { describe, expect, it } from 'vitest';
import { collectNotifications, notificationBell, notificationDrawer, notificationSummary, type TaskNotification } from '../activity-view';
import type { CastingActivity } from '../casting-jobs';

const analyse = (state: CastingActivity['state'], patch: Partial<CastingActivity> = {}): CastingActivity => ({
  id: 'livre', title: 'Le voyage de Camille', state, source: 'IA · démonstration', debut: Date.now(), ...patch,
});

describe('centre de notifications', () => {
  it('n’affiche aucune cloche quand il n’y a rien à suivre', () => {
    expect(notificationBell([])).toBe('');
    expect(notificationSummary([])).toBe('Aucune notification.');
    expect(notificationDrawer([])).toContain('Aucune notification.');
  });

  it('compte une tâche en cours dans le badge et la décrit', () => {
    const items = collectNotifications([analyse('running', { progress: { done: 12, total: 40, chapter: 'Chapitre 2' } })], []);
    const cloche = notificationBell(items);
    expect(cloche).toContain('notification-badge');
    expect(cloche).toContain('>1<');
    expect(cloche).toContain('1 tâche en cours');
    expect(notificationSummary(items)).toContain('1 tâche en cours');
    expect(notificationDrawer(items)).toContain('12/40 blocs');
  });

  it('signale les erreurs en rouge et les garde dans le panneau', () => {
    const items = collectNotifications([analyse('error', { error: 'Quota épuisé' })], []);
    const cloche = notificationBell(items);
    expect(cloche).toContain('notification-bell alert');
    expect(cloche).toContain('bell-ring');
    expect(cloche).toContain('1 erreur');
    const panneau = notificationDrawer(items);
    expect(panneau).toContain('À vérifier');
    expect(panneau).toContain('Quota épuisé');
    expect(panneau).toContain('data-action="notification-casting"');
    expect(panneau).toContain('data-action="activity-dismiss"');
  });

  it('groupe les téléchargements et les analyses, erreurs d’abord', () => {
    const items: TaskNotification[] = collectNotifications(
      [analyse('running', { progress: { done: 3, total: 10, chapter: 'Chapitre 1' } }), analyse('done', { characters: 3 })],
      [{ id: 'neural:miro', name: 'Miro', progress: 100, state: 'done' }, { id: 'neural:tom', name: 'Tom', progress: 20, state: 'error', error: 'Réseau coupé' }],
    );
    expect(items.map(item => `${item.kind}:${item.state}`)).toEqual(['download:error', 'analysis:running', 'analysis:done', 'download:done']);
    expect(notificationBell(items)).toContain('1 tâche en cours');
    expect(notificationBell(items)).toContain('1 erreur');
    const panneau = notificationDrawer(items);
    expect(panneau).toContain('2 terminées');
    expect(panneau).toContain('En cours');
    expect(panneau.indexOf('À vérifier')).toBeLessThan(panneau.indexOf('En cours'));
    expect(panneau.indexOf('En cours')).toBeLessThan(panneau.indexOf('Terminées'));
    expect(panneau).toContain('Réseau coupé');
  });

  it('échappe les titres et erreurs fournis par le réseau', () => {
    const items = collectNotifications([analyse('error', { title: '<Livre>', error: 'Refus <400>' })], []);
    const panneau = notificationDrawer(items);
    expect(panneau).not.toContain('<Livre>');
    expect(panneau).toContain('&lt;Livre&gt;');
    expect(panneau).toContain('Refus &lt;400&gt;');
  });
});
