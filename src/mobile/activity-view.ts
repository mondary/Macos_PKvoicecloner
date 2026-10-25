import type { CastingActivity } from './casting-jobs';

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
    texte: p?.phase ? `${phases[p.phase]} · ${compte}` : `Analyse · ${compte}`,
    detail: `${item.title} · ${item.source} · ${formaterDuree(ecoule)} écoulées${restant}`,
    pct: p?.total ? Math.round(p.done / p.total * 100) : 0,
  };}

/** Pastille flottante : une notification discrète, pas une carte. Le détail
 *  (source, chapitre, lots) vit dans la fiche des voix, pas ici. */
export function activityView(items: CastingActivity[]): string {
  return items.slice(0, 3).map(item => {
    const etat = resume(item);
    const terminal = item.state === 'done' || item.state === 'error';
    return `<div class="analysis-bubble ${item.state}" data-activity-id="${esc(item.id)}">
      <button type="button" class="bubble-main" data-action="casting" data-id="${esc(item.id)}"
        aria-label="${esc(etat.texte)} — ${esc(etat.detail)}. Ouvrir les voix du livre.">
        <span class="bubble-dot" aria-hidden="true"></span>
        <span class="bubble-text">${esc(etat.texte)}</span>
        ${item.state === 'running' && etat.pct > 0 ? `<span class="bubble-bar" style="width:${etat.pct}%"></span>` : ''}
      </button>
      ${terminal ? `<button type="button" class="bubble-close" data-action="activity-dismiss" data-id="${esc(item.id)}"
        aria-label="Fermer le message ${esc(etat.texte)}">${icon('x')}</button>` : ''}
    </div>`;
  }).join('');
}

/** Puce du lecteur : juste un point qui pulse et le décompte des lots. */
export function analysisChip(items: CastingActivity[], bookId: string): string {
  const item = items.find(a => a.id === bookId);
  if (!item) return '';
  const etat = resume(item);
  const court = item.state === 'running'
    ? (item.progress ? `${item.progress.done}/${item.progress.total}` : 'Analyse…')
    : item.state === 'done' ? 'Terminée' : item.state === 'error' ? 'Interrompue' : 'En attente';
  return `<button type="button" class="player-analysis ${item.state}" data-action="casting" data-id="${esc(bookId)}"
    aria-label="${esc(etat.texte)} — ${esc(etat.detail)}. Ouvrir les voix du livre.">
    <span class="bubble-dot" aria-hidden="true"></span>${esc(court)}</button>`;
}
