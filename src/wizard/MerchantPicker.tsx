import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { BucketId, Company } from '@/engine/types';
import { BUCKET_LABELS } from '@/engine/types';
import { useCompanies } from '@/store/scoring';
import { useCompassStore } from '@/store/useCompassStore';
import { BucketDot } from '@/components/BucketDot';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { CompanyRatingEditor } from '@/components/CompanyRatingEditor';

interface Props {
  categoryId: string;
  which: 'current' | 'target';
  bucket: BucketId;
  namedCompanyIds: string[];
}

/** Merchant chip with parent roll-up (EF1), provenance badge (EF2) and rate/remove controls. */
function MerchantChip({
  company,
  parent,
  onRate,
  onRemove,
}: {
  company: Company;
  parent: Company | null;
  onRate: () => void;
  onRemove: () => void;
}) {
  const unrated =
    Object.keys(company.ratings).length === 0 && company.ratingsProvenance !== 'sample';
  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-full border bg-paper px-2.5 py-[3px] font-mono text-[10.5px] ${company.ratingsProvenance === 'user' ? 'border-dashed border-ink' : 'border-rule'}`}
    >
      <BucketDot bucket={company.bucketDefault} className="!mr-0" />
      <span className="text-ink">{company.name}</span>
      {parent && <span className="text-faint">→ {parent.name}</span>}
      <ProvenanceBadge
        provenance={company.ratingsProvenance}
        source={company.source}
        showLink={false}
        className="ml-0.5"
      />
      <button
        type="button"
        onClick={onRate}
        className={`underline-offset-2 hover:underline ${unrated ? 'text-brass' : 'text-faint'}`}
      >
        {unrated ? 'unrated · rate ›' : 'rate ›'}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-faint hover:text-opposed"
        aria-label={`Remove ${company.name}`}
      >
        ×
      </button>
    </span>
  );
}

/** §7 step 4 — typeahead over the dataset + free-text add (creates a provenance:'user' company). */
export function MerchantPicker({ categoryId, which, bucket, namedCompanyIds }: Props) {
  const companies = useCompanies();
  const addNamed = useCompassStore((s) => s.addNamedCompany);
  const removeNamed = useCompassStore((s) => s.removeNamedCompany);
  const addUserCompany = useCompassStore((s) => s.addUserCompany);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return Object.values(companies)
      .filter(
        (c) =>
          !namedCompanyIds.includes(c.id) &&
          (c.name.toLowerCase().includes(s) ||
            (c.parentCompanyId && companies[c.parentCompanyId]?.name.toLowerCase().includes(s))),
      )
      .sort(
        (a, b) =>
          Number(b.bucketDefault === bucket) - Number(a.bucketDefault === bucket) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 8);
  }, [q, companies, namedCompanyIds, bucket]);
  const canCreate =
    q.trim().length > 1 && !matches.some((m) => m.name.toLowerCase() === q.trim().toLowerCase());
  const total = matches.length + (canCreate ? 1 : 0);
  useEffect(() => setActive(0), [q]);

  const choose = (i: number) => {
    if (i < matches.length) {
      addNamed(categoryId, which, bucket, matches[i]!.id);
    } else if (canCreate) {
      const c = addUserCompany(q.trim(), bucket);
      addNamed(categoryId, which, bucket, c.id);
      setEditing(c.id);
    }
    setQ('');
    setOpen(false);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {namedCompanyIds.map((id) => {
        const c = companies[id];
        if (!c) return null;
        return (
          <MerchantChip
            key={id}
            company={c}
            parent={c.parentCompanyId ? (companies[c.parentCompanyId] ?? null) : null}
            onRate={() => setEditing(id)}
            onRemove={() => removeNamed(categoryId, which, bucket, id)}
          />
        );
      })}
      <div className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              setActive((a) => Math.min(total - 1, a + 1));
              e.preventDefault();
            } else if (e.key === 'ArrowUp') {
              setActive((a) => Math.max(0, a - 1));
              e.preventDefault();
            } else if (e.key === 'Enter' && total > 0) {
              choose(active);
              e.preventDefault();
            } else if (e.key === 'Escape') setOpen(false);
          }}
          role="combobox"
          aria-expanded={open && total > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={`Name a ${BUCKET_LABELS[bucket].toLowerCase()} merchant`}
          placeholder="+ name a merchant…"
          className="w-[190px] rounded-full border border-dashed border-rule bg-transparent px-[11px] py-[3.5px] font-mono text-[10.5px] placeholder:text-faint focus:border-brass focus:outline-none max-[640px]:w-[200px] max-[640px]:text-[16px]"
        />
        {open && total > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 top-full z-20 mt-1 max-h-64 w-[300px] overflow-auto rounded border border-ink bg-paper py-1 text-[12.5px] shadow-lg"
          >
            {matches.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(i);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === active ? 'bg-card' : ''}`}
              >
                <BucketDot bucket={c.bucketDefault} className="!mr-0" />
                <span>{c.name}</span>
                {c.parentCompanyId && companies[c.parentCompanyId] && (
                  <span className="text-faint">→ {companies[c.parentCompanyId]!.name}</span>
                )}
                <span className="ml-auto font-mono text-[10px] text-faint">
                  {c.fictional
                    ? 'sample · archetype'
                    : c.ratingsProvenance === 'sample'
                      ? 'sample · unrated'
                      : c.ratingsProvenance}
                </span>
              </li>
            ))}
            {canCreate && (
              <li
                role="option"
                aria-selected={active === matches.length}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(matches.length);
                }}
                onMouseEnter={() => setActive(matches.length)}
                className={`cursor-pointer px-3 py-1.5 text-brass ${active === matches.length ? 'bg-card' : ''}`}
              >
                + Add “{q.trim()}” as a new {BUCKET_LABELS[bucket].toLowerCase()} merchant (unrated)
              </li>
            )}
          </ul>
        )}
      </div>
      <CompanyRatingEditor
        company={editing ? (companies[editing] ?? null) : null}
        open={!!editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
