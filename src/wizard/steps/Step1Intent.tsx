import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { useCompassStore } from '@/store/useCompassStore';
import { GoalModeToggle } from '@/components/GoalModeToggle';

export function Step1Intent() {
  const mode = useCompassStore((s) => s.goalMode);
  const name = useCompassStore((s) => s.profile.name);
  const setName = useCompassStore((s) => s.setProfileName);
  return (
    <>
      <h1 className="mt-[26px] text-[26px]">What do you want to accomplish?</h1>
      <p className="mt-2 max-w-[60ch] text-[13.5px] text-faint">
        Pick a starting posture. Each mode sets default principle weights and prefills your optimal
        targets — everything stays editable, and this same control lives in the dashboard header to
        re-score live.
      </p>
      <div className="mt-5">
        <GoalModeToggle />
      </div>
      <ul className="mt-5 grid gap-2 border-t border-rule pt-4">
        {Object.values(GOAL_MODE_PRESETS).map((p) => (
          <li
            key={p.id}
            className={`grid grid-cols-[150px_1fr] gap-3 text-[13px] max-[560px]:grid-cols-1 ${p.id === mode ? 'text-ink' : 'text-faint'}`}
          >
            <span className={`font-semibold ${p.id === mode ? 'text-brass' : ''}`}>{p.label}</span>
            <span>{p.blurb}</span>
          </li>
        ))}
      </ul>
      <label className="mt-6 block max-w-sm text-[13px]">
        <span className="eyebrow block">Your name (optional — appears on the printed plan)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Jordan"
          className="mt-1 w-full border-0 border-b border-rule bg-transparent py-1 focus:border-brass focus:outline-none"
        />
      </label>
    </>
  );
}
