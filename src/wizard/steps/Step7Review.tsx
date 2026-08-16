import { useNavigate } from 'react-router-dom';
import { useCompassStore } from '@/store/useCompassStore';
import { useScores } from '@/store/scoring';
import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { fmt1, fmtMoney, signed1 } from '@/lib/format';

export function Step7Review() {
  const s = useCompassStore();
  const scores = useScores();
  const nav = useNavigate();
  const total = s.categories.reduce((a, c) => a + c.monthlySpend, 0);
  const named = s.categories.reduce(
    (a, c) => a + c.current.reduce((b, x) => b + x.namedCompanyIds.length, 0),
    0,
  );
  const rows: [string, string][] = [
    ['Goal mode', GOAL_MODE_PRESETS[s.goalMode].label],
    [
      'Principles',
      s.principles
        .filter((p) => p.weight > 0)
        .map((p) => `${p.label} ${p.weight}`)
        .join(' · ') || 'none weighted',
    ],
    [
      'Political preference',
      s.political.configured
        ? `configured · intensity ${Math.round(s.political.intensity * 100)}%`
        : 'not configured (panels show Unknown)',
    ],
    [
      'Monthly discretionary',
      `${fmtMoney(total)} across ${s.categories.length} categories · ${named} named merchants`,
    ],
    [
      'Portfolio',
      s.holdings.length
        ? `${fmtMoney(scores.investments.total)} in ${s.holdings.length} holdings`
        : 'skipped',
    ],
    [
      'Alignment index',
      `${fmt1(scores.current.index)} now → ${fmt1(scores.target.index)} optimal (${signed1(scores.target.index - scores.current.index)})`,
    ],
    [
      'Candidate swaps',
      `${scores.swaps.length} · ${scores.swaps.filter((x) => x.freeWin).length} free wins`,
    ],
  ];
  const ready = total > 0;
  return (
    <>
      <h1 className="mt-[26px] text-[26px]">Review &amp; generate</h1>
      <p className="mt-2 max-w-[60ch] text-[13.5px] text-faint">
        Everything below is editable — tap any step in the rail to revisit it. Build the plan when
        it looks right.
      </p>
      <dl className="mt-5 divide-y divide-rule border-y border-rule">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="grid grid-cols-[180px_1fr] gap-3 py-2.5 text-[13.5px] max-[560px]:grid-cols-1"
          >
            <dt className="eyebrow pt-0.5">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {!ready && (
        <div className="callout">
          Enter at least one category with monthly spend (step 4) before building a plan.
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-pri"
          disabled={!ready}
          onClick={() => {
            s.completeWizard();
            nav('/dashboard');
          }}
        >
          Build my plan →
        </button>
      </div>
    </>
  );
}
