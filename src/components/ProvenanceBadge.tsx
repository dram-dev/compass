import { useState } from 'react';
import type { Provenance } from '@/engine/types';
import { VERIFY_SOURCES } from '@/data/verifySources';
import { DataSourcesModal } from './DataSourcesModal';

const LABEL: Record<Provenance, string> = {
  sample: 'Sample — verify',
  user: 'Yours',
  imported: 'Imported',
};

/**
 * EF2 / §10.2 — visible provenance badge on every company-level datum. Sample badges open the
 * verification modal (OpenSecrets / FEC / Goods Unite Us); an explicit external link accompanies it.
 */
export function ProvenanceBadge({
  provenance,
  source,
  className = '',
  showLink = true,
}: {
  provenance: Provenance;
  source?: string;
  className?: string;
  showLink?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const styles =
    provenance === 'user'
      ? 'border-dashed border-ink text-ink'
      : provenance === 'imported'
        ? 'border-brass text-brass'
        : 'border-rule text-faint hover:border-ink hover:text-ink';
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`chip ${styles}`}
        title={
          provenance === 'imported' && source
            ? `Imported from: ${source}`
            : 'Data sources & how to verify'
        }
        aria-haspopup="dialog"
      >
        {LABEL[provenance]}
        {provenance === 'imported' && source ? ` · ${source}` : ''}
      </button>
      {showLink && provenance === 'sample' && (
        <a
          className="chip !border-transparent text-faint hover:text-ink"
          href={VERIFY_SOURCES[0].url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Verify at source (opens OpenSecrets in a new tab)"
        >
          ↗
        </a>
      )}
      <DataSourcesModal open={open} onClose={() => setOpen(false)} />
    </span>
  );
}
