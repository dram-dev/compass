import { VERIFY_SOURCES } from '@/data/verifySources';
import { Modal } from './Modal';

/** §10.2 — "Data sources & how to verify", reachable from every Sample — verify badge. */
export function DataSourcesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Data sources & how to verify">
      <p className="text-[13.5px] text-faint">
        Sample company ratings and political leans in Compass are{' '}
        <b className="text-ink">illustrative placeholders</b> on fictional archetypes. Real brands
        ship with structure only (parent, sector, bucket) and no political rating. Nothing here is a
        claim about a real company's donations. Before acting, verify at the primary sources:
      </p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {VERIFY_SOURCES.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
            <a
              className="font-semibold underline-offset-2 hover:underline"
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
      <p className="mt-4 text-[12.5px] text-faint">
        Provenance badges: <b className="text-ink">Sample</b> = shipped with Compass ·{' '}
        <b className="text-ink">Yours</b> = you rated or added it ·{' '}
        <b className="text-ink">Imported</b> = from a community data pack (source shown). Your edits
        always win over sample values. Company political data varies by source and time; verify
        before acting.
      </p>
    </Modal>
  );
}
