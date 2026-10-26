import type { CastingActivity } from './casting-jobs';
import type { VoiceDownload } from './voice-downloads';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const phases = { personnages: 'Personnages', attribution: 'Attribution', verification: 'Relecture' };

export function formaterDuree(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

interface ResumeActivity { texte: string; detail: string; pct: number }
function resume(item: CastingActivity, maintenant = Date.now()): ResumeActivity {
  const p = item.progress;
  const ecoule = Math.max(0, maintenant - item.debut);
  if (item.state === 'queued') {
    return { texte: 'Analyse en attente', detail: `${item.title} · ${item.source}`, pct: 0 };
  }
  if (item.state === 'done') {
    const n = item.characters ?? 0;
    return { texte: 'Analyse terminée', detail: `${item.title} · ${item.source} · ${n} personnage${n > 1 ? 's' : ''} proposé${n > 1 ? 's' : ''}`, pct: 100 };
  }
  if (item.state === 'error') {
    return { texte: 'Analyse interrompue', detail: `${item.title} · ${item.source} · ${item.error ?? ''}`, pct: p?.total ? Math.round(p.done / p.total * 100) : 0 };
  }
  const compte = p ? `${p.done}/${p.total}` : '…';
  // Estimation honnête à partir du rythme observé (au moins 3 lots traités).
  const restant = p && p.done >= 3 ? ` · ≈ ${formaterDuree(ecoule / p.done * (p.total - p.done))} restantes` : '';
  return {
    texte: p?.phase ? `${phases[p.phase]} · ${compte} blocs` : `Analyse · ${compte} blocs`,
    detail: `${item.title} · ${item.source} · ${formaterDuree(ecoule)} écoulées${restant}`,
    pct: p?.total ? Math.round(p.done / p.total * 100) : 0,
  };
}

/** Une ligne du centre de notifications : analyse des personnages ou
 *  téléchargement d'une voix. Le panneau et la pastille partagent ce modèle. */
export interface TaskNotification {
  key: string;
  kind: 'analysis' | 'download';
  id: string;
  title: string;
  state: 'queued' | 'running' | 'done' | 'error';
  detail: string;
  pct?: number;
  error?: string;
}

function analyseNotification(item: CastingActivity, maintenant = Date.now()): TaskNotification {
  const p = item.progress;
  const commun = { key: `analysis:${item.id}`, kind: 'analysis' as const, id: item.id, title: item.title };
  if (item.state === 'error') {
    return { ...commun, state: 'error', detail: item.source, pct: p?.total ? Math.round(p.done / p.total * 100) : 0, error: item.error ?? 'Analyse interrompue.' };
  }
  if (item.state === 'done') {
    const n = item.characters ?? 0;
    return { ...commun, state: 'done', detail: `${item.source} · ${n} personnage${n > 1 ? 's' : ''} proposé${n > 1 ? 's' : ''}`, pct: 100 };
  }
  if (item.state === 'queued') return { ...commun, state: 'queued', detail: `${item.source} · en attente`, pct: 0 };
  const ecoule = Math.max(0, maintenant - item.debut);
  const phase = p?.phase ? phases[p.phase] : 'Analyse';
  const compte = p ? `${p.done}/${p.total} blocs` : 'préparation';
  const restant = p && p.done >= 3 ? ` · ≈ ${formaterDuree(ecoule / p.done * (p.total - p.done))}` : '';
  return { ...commun, state: 'running', detail: `${item.source} · ${phase} · ${compte}${restant}`, pct: p?.total ? Math.round(p.done / p.total * 100) : 0 };
}

function telechargementNotification(item: VoiceDownload): TaskNotification {
  const commun = { key: `download:${item.id}`, kind: 'download' as const, id: item.id, title: item.name };
  if (item.state === 'error') {
    return { ...commun, state: 'error', detail: 'Téléchargement interrompu.', pct: item.progress, error: item.error ?? 'Téléchargement interrompu.' };
  }
  if (item.state === 'done') return { ...commun, state: 'done', detail: 'Voix installée sur cet appareil', pct: 100 };
  return {
    ...commun, state: 'running', pct: item.progress,
    detail: item.progress >= 100 ? 'Installation en cours…' : `${Math.round(item.progress)} % téléchargé`,
  };
}

/** Fusionne les deux files en une seule liste lisible, erreurs d'abord. */
export function collectNotifications(activities: CastingActivity[], downloads: VoiceDownload[]): TaskNotification[] {
  const rang = { error: 0, queued: 1, running: 1, done: 2 } as const;
  return [...activities.map(item => analyseNotification(item)), ...downloads.map(telechargementNotification)]
    .sort((a, b) => rang[a.state] - rang[b.state]);
}

export function notificationCounts(items: TaskNotification[]) {
  return {
    actives: items.filter(item => item.state === 'running' || item.state === 'queued').length,
    erreurs: items.filter(item => item.state === 'error').length,
    terminees: items.filter(item => item.state === 'done').length,
    total: items.length,
  };
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function resumeCompte(items: TaskNotification[]) {
  const { actives, erreurs, terminees } = notificationCounts(items);
  return [actives ? `${pluriel(actives, 'tâche')} en cours` : '', erreurs ? `${pluriel(erreurs, 'erreur')}` : '', terminees ? `${terminees} terminée${terminees > 1 ? 's' : ''}` : '']
    .filter(Boolean).join(' · ');
}

/** Pastille flottante : juste une cloche et le nombre de tâches à suivre.
 *  Le détail vit dans le panneau ; rien ne s'empile en bas de l'écran. */
export function notificationBell(items: TaskNotification[], open = false): string {
  if (!items.length) return '';
  const { actives, erreurs, terminees } = notificationCounts(items);
  const urgence = actives + erreurs;
  const badge = erreurs ? (urgence > 1 ? String(urgence) : '!')
    : actives ? String(actives)
      : terminees ? icon('check') : '';
  const classes = [erreurs ? 'alert' : '', actives ? 'running' : '', !actives && !erreurs && terminees ? 'done' : ''].filter(Boolean).join(' ');
  const etat = [actives ? `${pluriel(actives, 'tâche')} en cours` : '', erreurs ? pluriel(erreurs, 'erreur') : '', terminees && !actives && !erreurs ? `${terminees} terminée${terminees > 1 ? 's' : ''}` : '']
    .filter(Boolean).join(', ');
  return `<button type="button" class="notification-bell ${classes}" data-action="notifications"
    aria-label="Notifications${etat ? ` : ${etat}` : ''}. Ouvrir le panneau." aria-haspopup="dialog"
    aria-controls="notifications" aria-expanded="${open}" title="Notifications">${icon(erreurs ? 'bell-ring' : 'bell')}
    ${badge ? `<span class="notification-badge ${erreurs ? 'alert' : ''} ${!actives && !erreurs ? 'done' : ''}" aria-hidden="true">${badge}</span>` : ''}</button>`;
}

/** Texte annoncé aux lecteurs d'écran : les compteurs changent d'état, pas à
 *  chaque pourcentage, pour ne pas répéter la progression en boucle. */
export function notificationSummary(items: TaskNotification[]): string {
  if (!items.length) return 'Aucune notification.';
  const { actives, erreurs, terminees } = notificationCounts(items);
  const parties = [actives ? `${pluriel(actives, 'tâche')} en cours` : '', erreurs ? pluriel(erreurs, 'erreur') : '', terminees ? `${terminees} terminée${terminees > 1 ? 's' : ''}` : '']
    .filter(Boolean);
  return parties.join(', ') + '.';
}

function itemNotification(item: TaskNotification): string {
  const libelle = item.state === 'error' ? 'Erreur' : item.state === 'done' ? 'Terminée' : item.state === 'queued' ? 'En attente' : 'En cours';
  const ouvrir = item.kind === 'analysis'
    ? `<button type="button" class="notification-link" data-action="notification-casting" data-id="${esc(item.id)}" data-notif="${esc(item.key)}">Voir le livre</button>`
    : `<button type="button" class="notification-link" data-action="notification-voices" data-notif="${esc(item.key)}">Voir les voix</button>`;
  const retirer = item.state === 'done' || item.state === 'error'
    ? `<button type="button" class="notification-link notification-remove" data-action="${item.kind === 'analysis' ? 'activity-dismiss' : 'download-dismiss'}" data-id="${esc(item.id)}" data-notif="${esc(item.key)}">Retirer</button>`
    : '';
  return `<article class="notification-item ${item.state}">
    <span class="notification-kind" aria-hidden="true">${icon(item.kind === 'analysis' ? 'sparkles' : 'download')}</span>
    <div class="notification-copy">
      <div class="notification-title"><strong>${esc(item.title)}</strong><span class="notification-state">${libelle}</span></div>
      <p class="notification-detail">${esc(item.detail)}</p>
      ${item.pct !== undefined && item.state === 'running' ? `<div class="notification-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(item.pct)}" aria-label="Progression de ${esc(item.title)}"><span style="width:${Math.max(0, Math.min(100, item.pct))}%"></span></div>` : ''}
      ${item.error ? `<p class="notification-error">${esc(item.error)}</p>` : ''}
      <div class="notification-actions">${ouvrir}${retirer}</div>
    </div>
  </article>`;
}

/** Contenu du panneau latéral, groupé par urgence puis par état. */
export function notificationDrawer(items: TaskNotification[]): string {
  if (!items.length) {
    return `<div class="notifications-empty">${icon('bell')}<p>Aucune notification.</p><p>Les analyses et les téléchargements de voix apparaîtront ici, sans encombrer l'écran.</p></div>`;
  }
  const groupes: [string, TaskNotification[]][] = [
    ['À vérifier', items.filter(item => item.state === 'error')],
    ['En cours', items.filter(item => item.state === 'running' || item.state === 'queued')],
    ['Terminées', items.filter(item => item.state === 'done')],
  ];
  const resume = resumeCompte(items);
  return `<p class="notifications-summary">${esc(resume)}</p>
    ${groupes.filter(([, liste]) => liste.length).map(([titre, liste]) =>
      `<section class="notifications-group"><h3>${titre}<span>${liste.length}</span></h3>${liste.map(itemNotification).join('')}</section>`).join('')}`;
}

/** Puce du lecteur : juste un point qui pulse et le décompte des lots. */
export function analysisChip(items: CastingActivity[], bookId: string, compact = false): string {
  const item = items.find(a => a.id === bookId);
  if (!item) return '';
  const etat = resume(item);
  const court = item.state === 'running'
    ? (item.progress ? `${item.progress.done}/${item.progress.total}` : 'Analyse…')
    : item.state === 'done' ? 'Terminée' : item.state === 'error' ? 'Interrompue' : 'En attente';
  return `<button type="button" class="player-analysis ${item.state} ${compact ? 'compact' : ''}" data-action="casting" data-id="${esc(bookId)}"
    aria-label="${esc(etat.texte)} — ${esc(etat.detail)}. Ouvrir les voix du livre.">
    <span class="bubble-dot" aria-hidden="true"></span>${compact ? '' : esc(court)}</button>`;
}
