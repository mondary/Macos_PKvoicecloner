import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults, type Book } from '../types';
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => {}), analyser: vi.fn() }));
vi.mock('../storage', () => ({ library: { save: mocks.save } }));
vi.mock('../engine', () => ({ native: true, Reader: { analyser: mocks.analyser } }));
import { castingActivities, castingBusy, dismissCastingActivity, prepareCasting, watchCasting } from '../casting-jobs';
import { analysisChip, collectNotifications, formaterDuree, notificationBell, notificationDrawer } from '../activity-view';

const book = (id: string): Book => ({ id, title: `Livre ${id}`, author: '', format: 'TXT', language: 'fr', color: 0,
  segments: ['Le soir tombe.'], chapters: [{ title: 'Le départ', start: 0, end: 1 }],
  position: 0, completed: false, added: 0, opened: 0, bookmarks: [] });
const settings = { ...defaults, server: 'https://studio.example', token: 'demo' };
const result = { personnages: [], locuteurs: ['narrateur'] };

afterEach(() => { castingActivities().forEach(item => dismissCastingActivity(item.id)); vi.clearAllMocks(); });

describe('suivi des analyses', () => {
  it('signale la file, les lots et le bilan sans lancer deux analyses du même livre', async () => {
    let finish!: (value: typeof result) => void;
    mocks.analyser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(result);
    const first = book('premier'), second = book('second');
    const states: string[] = [];
    const stop = watchCasting(() => states.push(castingActivities().map(a => a.state).join(',')));
    const a = prepareCasting(first, [], settings);
    expect(prepareCasting(first, [], settings)).toBe(a);
    const b = prepareCasting(second, [], settings);
    await vi.waitFor(() => expect(mocks.analyser).toHaveBeenCalledTimes(1));
    expect(castingActivities()[0].progress).toEqual({ done: 0, total: 1, chapter: 'Le départ' });
    expect(castingActivities()[1].state).toBe('queued');
    dismissCastingActivity(first.id);
    expect(castingBusy(first)).toBe(true);
    finish(result);
    await Promise.all([a, b]); stop();
    expect(states).toContain('running,queued');
    expect(castingActivities().map(a => a.state)).toEqual(['done', 'done']);
    expect(castingActivities()[0].progress?.done).toBe(1);
    const centre = collectNotifications(castingActivities(), []);
    expect(notificationDrawer(centre)).toContain('Terminée');
    expect(notificationBell(centre)).toContain('terminée');
    dismissCastingActivity(first.id);
    expect(castingActivities()).toHaveLength(1);
  });

  it('conserve l’erreur et permet une reprise qui remplace le bilan', async () => {
    mocks.analyser.mockRejectedValueOnce(new Error('Quota <épuisé>')).mockResolvedValue(result);
    const livre = book('erreur');
    await expect(prepareCasting(livre, [], settings)).rejects.toThrow('Quota');
    expect(castingBusy(livre)).toBe(false);
    expect(castingActivities()[0].state).toBe('error');
    expect(notificationDrawer(collectNotifications(castingActivities(), []))).toContain('Quota &lt;épuisé&gt;');
    await prepareCasting(livre, [], settings);
    expect(castingActivities()).toHaveLength(1);
    expect(castingActivities()[0].state).toBe('done');
  });

  it('identifie le repli local sans annoncer un appel IA', async () => {
    await prepareCasting(book('local'), [], defaults);
    expect(mocks.analyser).not.toHaveBeenCalled();
    expect(notificationDrawer(collectNotifications(castingActivities(), []))).toContain('Repérage local · sans IA');
    // Dans le lecteur, la puce ne montre que le verdict, pas une carte.
    expect(analysisChip(castingActivities(), 'local')).toContain('Terminée');
    expect(analysisChip(castingActivities(), 'autre')).toBe('');
  });

  it('formate les durées de la pastille sans faux espoir', () => {
    expect(formaterDuree(30_000)).toBe('1 min');
    expect(formaterDuree(5 * 60000)).toBe('5 min');
    expect(formaterDuree(125 * 60000)).toBe('2 h 05');
    expect(formaterDuree(60 * 60000)).toBe('1 h 00');
  });
});
