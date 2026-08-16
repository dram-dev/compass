import type { SwapAction, StageGate } from '@/engine/types';
import { COST_LABEL, effortDots, fmt1, fmtMoney } from '@/lib/format';

interface Props {
  action: SwapAction;
  categoryLabel: string;
  gates: StageGate[];
  highlighted?: boolean;
  printMode?: boolean;
  onMove?: (gateId: string | null) => void;
  onDismiss?: () => void;
  isManual?: boolean;
}

/** R6/R7 — one recommended action with impact / effort / cost badges, free-win tag, and controls. */
export function ActionCard({
  action,
  categoryLabel,
  gates,
  highlighted,
  printMode,
  onMove,
  onDismiss,
  isManual,
}: Props) {
  return (
    <article
      id={`action-${action.id}`}
      draggable={!printMode}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', action.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`border-b border-rule px-4 py-3 text-[13px] last:border-b-0 print:break-inside-avoid ${highlighted ? 'bg-brass/10 ring-2 ring-brass' : ''} ${printMode ? '' : 'cursor-grab active:cursor-grabbing'}`}
      aria-label={`${categoryLabel}: ${action.description}`}
    >
      <div className="text-[10.5px] uppercase tracking-[.12em] text-faint">{categoryLabel}</div>
      <div className="mt-0.5">{action.description}</div>
      <div className="mt-[7px] flex flex-wrap items-center gap-1.5">
        <span className="chip chip-delta" title="Projected Alignment Index gain">
          +{fmt1(action.deltaIndexPoints)} pts
        </span>
        <span
          className="chip tracking-[1px]"
          title={`Effort ${action.effort} of 5`}
          aria-label={`Effort ${action.effort} of 5`}
        >
          {effortDots(action.effort)}
        </span>
        <span className="chip" title="Ongoing cost impact">
          {COST_LABEL[action.costDelta]}
        </span>
        <span className="chip" title="Monthly dollars affected">
          {fmtMoney(action.dollarsPerMonth)}/mo
        </span>
        {action.freeWin && <span className="chip chip-fw">FREE WIN</span>}
        {action.localShift && (
          <span
            className="chip"
            title="Illustrative: ~2–3× more local recirculation per dollar at independents (see footnote)"
          >
            local ≈2–3×*
          </span>
        )}
        {isManual && !printMode && <span className="chip border-dashed">moved by you</span>}
      </div>
      {!printMode && (onMove || onDismiss) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] print:hidden">
          {onMove && (
            <label className="flex items-center gap-1 text-faint">
              Move to
              <select
                value={action.gateId ?? ''}
                onChange={(e) => onMove(e.target.value || null)}
                aria-label={`Move "${action.description}" to gate`}
                className="rounded border border-rule bg-paper px-1.5 py-0.5 text-[11px] text-ink"
              >
                {gates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
                <option value="">Auto-place</option>
              </select>
            </label>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-faint underline-offset-2 hover:text-opposed hover:underline"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </article>
  );
}
