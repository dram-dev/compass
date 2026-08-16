import { VERIFY_SOURCES } from '@/data/verifySources';

/** Persistent disclaimers (spec §10.4) and privacy statement (§1). */
export function Footer() {
  return (
    <footer className="mt-14 border-t border-ink pt-[18px] text-[11.5px] text-faint">
      <p>
        <b className="text-ink">
          Educational scenario tool — not financial, investment, or tax advice.
        </b>
      </p>
      <p className="mt-1.5">
        Company political data varies by source and time; verify before acting.
      </p>
      <p className="mt-1.5">
        Data sources &amp; how to verify:{' '}
        {VERIFY_SOURCES.map((s, i) => (
          <span key={s.id}>
            {i > 0 && ' · '}
            <a
              className="text-ink underline-offset-2 hover:underline"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.label}
            </a>
          </span>
        ))}
      </p>
      <p className="mt-1.5">
        All data stays on this device — no accounts, no servers. Export anytime as JSON.
      </p>
      <p className="mt-3.5 font-mono">COMPASS v0.1 · schema v1 · stored locally</p>
    </footer>
  );
}
