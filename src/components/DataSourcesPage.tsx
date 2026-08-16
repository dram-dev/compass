import { VERIFY_SOURCES } from '@/data/verifySources';

export function DataSourcesPage() {
  return (
    <section className="mt-8">
      <h1 className="text-[26px]">Data sources &amp; how to verify</h1>
      <p className="sub">
        Sample company ratings in Compass are illustrative placeholders. Before acting on any
        political or values profile, verify at the primary sources below.
      </p>
      <ul className="mt-5 divide-y divide-rule border-y border-rule">
        {VERIFY_SOURCES.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
            <a
              className="font-semibold text-ink underline-offset-2 hover:underline"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.label} ↗
            </a>
            <span className="text-[13px] text-faint">{s.blurb}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
