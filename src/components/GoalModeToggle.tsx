import { GOAL_MODE_PRESETS } from '@/data/goalModePresets';
import { GOAL_MODES, type GoalMode } from '@/engine/types';
import { useCompassStore } from '@/store/useCompassStore';
import { Segmented } from './Segmented';

const OPTIONS = GOAL_MODES.map((m) => ({
  value: m,
  label: GOAL_MODE_PRESETS[m].label,
  title: GOAL_MODE_PRESETS[m].blurb,
}));
const SHORT = GOAL_MODES.map((m) => ({
  value: m,
  label: GOAL_MODE_PRESETS[m].short,
  title: GOAL_MODE_PRESETS[m].blurb,
}));

/** R4 — the goal-mode control; the same store action re-weights and re-scores live everywhere. */
export function GoalModeToggle({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const mode = useCompassStore((s) => s.goalMode);
  const setGoalMode = useCompassStore((s) => s.setGoalMode);
  return (
    <Segmented<GoalMode>
      options={compact ? SHORT : OPTIONS}
      value={mode}
      onChange={setGoalMode}
      ariaLabel="What do you want to accomplish?"
      size={compact ? 'sm' : 'md'}
      className={className}
    />
  );
}
