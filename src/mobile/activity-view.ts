import type { CastingActivity } from './casting-jobs';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const phases = { personnages: 'Identification des personnages', attribution: 'Attribution des répliques', verification: 'Relecture des attributions' };

/** Rendu partagé sur tous les écrans ; les bilans restent jusqu'à fermeture. */
export function activityView(items: CastingActivity[]): string {
  return items.map(item => {
    const p = item.progress;
    const running = item.state === 'running';
    const terminal = item.state === 'done' || item.state === 'error';
    const title = item.state === 'queued' ? 'Analyse en attente'
      : item.state === 'done' ? 'Analyse terminée'
      : item.state === 'error' ? 'Analyse interrompue'
      : p?.phase ? phases[p.phase] : 'Analyse des personnages en cours';
    const detail = item.state === 'queued' ? 'Ce livre sera traité après l’analyse en cours.'
      : item.state === 'error' ? item.error
      : item.state === 'done' ? `${item.characters ?? 0} personnage(s) proposé(s). Consultez les voix pour vérifier la distribution.`
      : p ? `${p.chapter} · ${p.done} / ${p.total} lots enregistrés. L’appel en cours peut prendre plusieurs minutes.`
      : 'Préparation du texte et de la distribution…';
    return `<article class="analysis-activity ${item.state}" data-activity-id="${esc(item.id)}">
      <div class="activity-copy"><p class="activity-state">${esc(title)}</p><strong>${esc(item.title)}</strong>
      <p class="activity-source">${esc(item.source)}</p><p class="activity-detail">${esc(detail)}</p>
      ${running && p && p.total > 0 ? `<progress max="${p.total}" value="${p.done}" aria-label="Lots enregistrés pour ${esc(item.title)}"></progress>` : ''}</div>
      <div class="activity-actions"><button class="small-button" data-action="casting" data-id="${esc(item.id)}">Voir les voix</button>
      ${terminal ? `<button class="small-button" data-action="activity-dismiss" data-id="${esc(item.id)}" aria-label="Fermer le bilan de ${esc(item.title)}">Fermer</button>` : ''}</div>
    </article>`;
  }).join('');
}
