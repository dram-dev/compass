import { useCompassStore } from '@/store/useCompassStore';
import type { GateConfig as Gate } from '@/engine/plan';

const CADENCES: { id: string; label: string; gates: Gate[] }[] = [
  {
    id: '30-60-90',
    label: '30 / 60 / 90 days',
    gates: [
      { id: 'g1', label: 'Day 30', effortBudget: 8 },
      { id: 'g2', label: 'Day 60', effortBudget: 8 },
      { id: 'g3', label: 'Day 90', effortBudget: 8 },
    ],
  },
  {
    id: 'quarterly',
    label: 'Quarterly',
    gates: [
      { id: 'q1', label: 'Q1', effortBudget: 8 },
      { id: 'q2', label: 'Q2', effortBudget: 8 },
      { id: 'q3', label: 'Q3', effortBudget: 8 },
      { id: 'q4', label: 'Q4', effortBudget: 8 },
    ],
  },
];

/** §9.1 — cadence presets, editable labels and per-gate effort budgets (EF5). */
export function GateConfigPanel() {
  const gates = useCompassStore((s) => s.gates);
  const setGates = useCompassStore((s) => s.setGates);
  const updateGate = useCompassStore((s) => s.updateGate);
  const addGate = useCompassStore((s) => s.addGate);
  const removeGate = useCompassStore((s) => s.removeGate);
  const clearPlanEdits = useCompassStore((s) => s.clearPlanEdits);
  const dismissed = useCompassStore((s) => s.dismissed);
  const placements = useCompassStore((s) => s.placements);
  const activeCadence =
    CADENCES.find(
      (c) => c.gates.length === gates.length && c.gates.every((g, i) => g.id === gates[i]?.id),
    )?.id ?? 'custom';
  return (
    <details className="card mt-4 print:hidden">
      <summary className="cursor-pointer select-none px-4 py-3 text-[12px] uppercase tracking-[.12em] text-faint hover:text-ink">
        Gate configuration · {gates.length} gates · cadence {activeCadence}
      </summary>
      <div className="border-t border-rule px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-faint">Cadence</span>
          {CADENCES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setGates(c.gates)}
              aria-pressed={activeCadence === c.id}
              className={`chip ${activeCadence === c.id ? 'border-ink text-ink' : 'hover:border-ink hover:text-ink'}`}
            >
              {c.label}
            </button>
          ))}
          <span className={`chip ${activeCadence === 'custom' ? 'border-ink text-ink' : ''}`}>
            Custom
          </span>
          <span className="flex-1" />
          <button type="button" className="chip hover:border-ink hover:text-ink" onClick={addGate}>
            + add gate
          </button>
          <button
            type="button"
            className="chip hover:border-opposed hover:text-opposed"
            onClick={clearPlanEdits}
            disabled={
              !dismissed.length && !Object.keys(placements).length && activeCadence === '30-60-90'
            }
            title="Reset gates, manual placements and dismissed actions"
          >
            reset plan edits
          </button>
        </div>
        <ul className="mt-3 grid gap-2">
          {gates.map((g, i) => (
            <li
              key={g.id}
              className="grid grid-cols-[28px_1fr_140px_28px] items-center gap-3 text-[13px] max-[560px]:grid-cols-[28px_1fr_28px]"
            >
              <span className="font-mono text-[11px] text-faint">{i + 1}</span>
              <input
                value={g.label}
                onChange={(e) => updateGate(g.id, { label: e.target.value })}
                aria-label={`Gate ${i + 1} label`}
                className="min-w-0 border-0 border-b border-rule bg-transparent py-0.5 focus:border-brass focus:outline-none"
              />
              <label className="flex items-center gap-2 font-mono text-[12px] text-faint max-[560px]:col-span-2">
                budget
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={g.effortBudget}
                  onChange={(e) =>
                    updateGate(g.id, {
                      effortBudget: Math.max(1, Math.min(40, Number(e.target.value) || 1)),
                    })
                  }
                  aria-label={`Effort budget for ${g.label}`}
                  className="w-14 border-0 border-b border-rule bg-transparent px-1 text-right text-ink focus:border-brass focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => removeGate(g.id)}
                disabled={gates.length <= 1}
                aria-label={`Remove ${g.label}`}
                className="h-[22px] w-[22px] rounded-full border border-rule text-faint hover:border-opposed hover:text-opposed disabled:opacity-30"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-faint">
          Effort budget = how many effort points (1 = habit tweak … 5 = project) you'll take on per
          gate. Actions that don't fit any gate are listed below the board.
        </p>
      </div>
    </details>
  );
}
