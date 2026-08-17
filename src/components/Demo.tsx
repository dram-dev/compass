import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useCompassStore } from '@/store/useCompassStore';
import { useViewStore } from '@/store/useViewMode';
import { useHasOwnData, useLoadDemo } from '@/lib/useDemo';

export function LoadDemoButton({
  className = 'btn',
  label = 'Load the demo scenario',
}: {
  className?: string;
  label?: string;
}) {
  const load = useLoadDemo();
  const nav = useNavigate();
  const hasOwn = useHasOwnData();
  const [confirming, setConfirming] = useState(false);
  if (confirming)
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px]">
        <span>Replace your current numbers with the demo?</span>
        <button
          type="button"
          className="btn !py-1 text-[11px]"
          onClick={() => {
            load();
            setConfirming(false);
            nav('/dashboard');
          }}
        >
          Yes, load demo
        </button>
        <button
          type="button"
          className="btn btn-ghost !py-1 text-[11px]"
          onClick={() => setConfirming(false)}
        >
          Keep mine
        </button>
      </span>
    );
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (hasOwn) {
          setConfirming(true);
          return;
        }
        load();
        nav('/dashboard');
      }}
    >
      {label}
    </button>
  );
}

/** `#/demo` — load and land on the dashboard, so the URL itself is shareable with reviewers. */
export function DemoRoute() {
  const load = useLoadDemo();
  const [done, setDone] = useState(false);
  useEffect(() => {
    load();
    setDone(true);
    // run once on mount: the route's whole job is to load and redirect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return done ? <Navigate to="/dashboard" replace /> : null;
}

/**
 * Persistent, dismissible-only-by-clearing banner. Reviewers must never mistake the demo's numbers
 * for their own, or its illustrative ratings for researched facts about real companies.
 */
export function DemoBanner() {
  const demo = useViewStore((s) => s.demoActive);
  const setDemoActive = useViewStore((s) => s.setDemoActive);
  const resetAll = useCompassStore((s) => s.resetAll);
  const nav = useNavigate();
  if (!demo) return null;
  return (
    <div
      role="status"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-brass bg-card px-3 py-2 text-[12px] print:hidden"
    >
      <span className="chip border-brass text-brass">Demo data</span>
      <span>
        You're looking at <b className="text-ink">Jordan</b>, an illustrative persona — fictional
        merchants and placeholder ratings, not real-company research and not your data. Everything
        is editable; change anything to see the index move.
      </span>
      <button
        type="button"
        className="btn btn-ghost !py-0.5 ml-auto text-[11px]"
        onClick={() => {
          resetAll();
          setDemoActive(false);
          nav('/wizard');
        }}
      >
        Clear demo data
      </button>
    </div>
  );
}
