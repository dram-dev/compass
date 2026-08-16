import { useRef, useState } from 'react';
import { VERIFY_SOURCES } from '@/data/verifySources';
import { useCompassStore } from '@/store/useCompassStore';
import {
  downloadJson,
  exportFilename,
  exportState,
  importState,
  pickState,
} from '@/store/persistence';
import { EXAMPLE_DATA_PACK, parseDataPack } from '@/data/dataPack';
import { BucketDefaultsPanel } from './BucketDefaultsPanel';
import { Section } from './Section';
import { FundLookthroughPanel } from './FundLookthroughPanel';
import { SAMPLE_COMPANIES } from '@/data/sampleCompanies';

type Notice = { kind: 'ok' | 'err'; text: string } | null;

/** Data page: verification sources (§10.2), export/import (EF8), community packs (EF9), Advanced (§6.2), reset. */
export function DataSourcesPage() {
  const s = useCompassStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [packNotice, setPackNotice] = useState<Notice>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const packRef = useRef<HTMLInputElement>(null);

  const readFile = (f: File, cb: (text: string) => void) => {
    const r = new FileReader();
    r.onload = () => cb(String(r.result ?? ''));
    r.onerror = () => cb('');
    r.readAsText(f);
  };
  const onImport = (text: string) => {
    const r = importState(text);
    if (!r.ok) {
      setNotice({ kind: 'err', text: `Import failed — nothing was changed. ${r.error}` });
      return;
    }
    s.loadState(r.state);
    setNotice({
      kind: 'ok',
      text: `Imported: ${r.state.categories.length} categories, ${r.state.holdings.length} holdings, ${r.state.userCompanies.length} of your merchants, ${r.state.importedCompanies.length} imported companies.`,
    });
  };
  const onPack = (text: string) => {
    const r = parseDataPack(text);
    if (!r.ok) {
      setPackNotice({ kind: 'err', text: `Pack rejected — nothing was loaded. ${r.error}` });
      return;
    }
    const n = s.importCompanies(r.companies, r.source);
    for (const p of r.principles) s.addLibraryPrinciple(p.id, 0);
    setPackNotice({
      kind: 'ok',
      text: `Loaded ${n} companies from “${r.source}”${r.overridesSample ? ` (${r.overridesSample} override sample records)` : ''}${r.principles.length ? `; declared principles: ${r.principles.map((p) => p.label).join(', ')}` : ''}.${r.notes ? ` ${r.notes}` : ''}`,
    });
  };

  return (
    <div>
      <h1 className="mt-8 text-[26px]">Data, privacy &amp; verification</h1>
      <p className="sub">
        Everything Compass knows lives in this browser's storage under{' '}
        <code className="font-mono">compass.v1</code>. No accounts, no servers, no analytics. The
        only network activity is a verification link you click.
      </p>

      <Section
        no="01"
        title="Data sources & how to verify"
        sub="Sample company ratings and political leans are illustrative placeholders on fictional archetypes; real brands ship with structure only. Verify at the primary sources before acting."
      >
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {VERIFY_SOURCES.map((v) => (
            <li key={v.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
              <a
                className="font-semibold underline-offset-2 hover:underline"
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {v.label} ↗
              </a>
              <span className="text-[13px] text-faint">{v.blurb}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-faint">
          Shipped sample set: {SAMPLE_COMPANIES.length} records —{' '}
          {SAMPLE_COMPANIES.filter((c) => c.fictional).length} fictional archetypes (rated,
          illustrative) and {SAMPLE_COMPANIES.filter((c) => !c.fictional).length} real brands
          (parent / sector / bucket only; unrated; lean unknown). Provenance badges:{' '}
          <span className="chip">Sample — verify</span>{' '}
          <span className="chip border-dashed border-ink text-ink">Yours</span>{' '}
          <span className="chip border-brass text-brass">Imported</span>. Your edits win everywhere.
        </p>
      </Section>

      <Section
        no="02"
        title="Export & import your data"
        sub="A single JSON file holds your complete state (schema-versioned). Import validates the whole file and never loads a partial state."
      >
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-pri"
            onClick={() => downloadJson(exportState(pickState(s)), exportFilename())}
          >
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import Compass JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f, onImport);
              e.target.value = '';
            }}
          />
          <span className="font-mono text-[11.5px] text-faint">
            last updated {new Date(s.profile.updatedAt).toLocaleString()}
          </span>
        </div>
        <details className="mt-3 text-[12.5px]">
          <summary className="cursor-pointer text-faint hover:text-ink">Paste JSON instead</summary>
          <PasteBox onSubmit={onImport} label="Paste a Compass export and load it" />
        </details>
        {notice && (
          <div
            role={notice.kind === 'err' ? 'alert' : 'status'}
            className={`callout ${notice.kind === 'err' ? '!border-opposed' : '!border-aligned'}`}
          >
            {notice.text}
          </div>
        )}
      </Section>

      <Section
        no="03"
        title="Community data packs"
        sub={
          <>
            Import third-party or self-researched company datasets. Schema documented in{' '}
            <code className="font-mono">docs/data-pack-schema.md</code>; every record is badged
            Imported with its source string.
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={() => packRef.current?.click()}>
            Import data pack…
          </button>
          <input
            ref={packRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import data pack JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f, onPack);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              downloadJson(
                JSON.stringify(EXAMPLE_DATA_PACK, null, 2),
                'compass-data-pack.example.json',
              )
            }
          >
            Download example pack
          </button>
          <span className="font-mono text-[11.5px] text-faint">
            {s.importedCompanies.length} imported companies loaded
          </span>
        </div>
        <details className="mt-3 text-[12.5px]">
          <summary className="cursor-pointer text-faint hover:text-ink">
            Paste a pack instead
          </summary>
          <PasteBox onSubmit={onPack} label="Paste a data pack and load it" />
        </details>
        {packNotice && (
          <div
            role={packNotice.kind === 'err' ? 'alert' : 'status'}
            className={`callout ${packNotice.kind === 'err' ? '!border-opposed' : '!border-aligned'}`}
          >
            {packNotice.text}
          </div>
        )}
        {s.importedCompanies.length > 0 && (
          <details className="mt-3 text-[12.5px]">
            <summary className="cursor-pointer text-faint hover:text-ink">Imported records</summary>
            <ul className="mt-2 grid gap-1 font-mono text-[11.5px]">
              {s.importedCompanies.slice(0, 200).map((c) => (
                <li key={c.id}>
                  {c.name} · {c.bucketDefault} · lean {c.political.leanScore ?? 'unknown'} ·{' '}
                  <span className="text-brass">{c.source}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section
        no="04"
        title="Advanced: bucket-default ratings"
        sub="The engine's fallback ratings for bucket portions without a named, rated merchant. Edit freely; the worked-example defaults are documented in the README."
      >
        <BucketDefaultsPanel />
      </Section>

      <Section
        no="05"
        title="Fund look-through (research database)"
        sub={
          <>
            Which companies the most-held ETFs and mutual funds concentrate in — from the offline
            research DB (<code className="font-mono">scripts/seed</code>: Alpha Vantage + SEC
            N-PORT). Look up a fund to see its top holdings, or a company to see who holds it.
          </>
        }
      >
        <FundLookthroughPanel />
      </Section>

      <Section
        no="06"
        title="Reset"
        sub="Erase everything stored on this device. Export first if you want to keep it."
      >
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!confirmReset ? (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
              Clear all local data…
            </button>
          ) : (
            <>
              <span className="text-[13px]">Really erase all Compass data on this device?</span>
              <button
                type="button"
                className="btn !border-opposed !text-opposed"
                onClick={() => {
                  s.resetAll();
                  setConfirmReset(false);
                  setNotice({
                    kind: 'ok',
                    text: 'All local data cleared. The wizard starts fresh.',
                  });
                }}
              >
                Yes, erase
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}

function PasteBox({ onSubmit, label }: { onSubmit: (text: string) => void; label: string }) {
  const [text, setText] = useState('');
  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={label}
        rows={5}
        className="w-full rounded border border-rule bg-paper p-2 font-mono text-[11.5px]"
        placeholder="{ ... }"
      />
      <button type="submit" className="btn w-fit !py-1.5 text-[11.5px]" disabled={!text.trim()}>
        Load
      </button>
    </form>
  );
}
