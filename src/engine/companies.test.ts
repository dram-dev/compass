import { describe, expect, it } from 'vitest';
import { makeUserCompany, resolveCompanies, slugId } from './companies';
import { SAMPLE_COMPANIES } from '@/data/sampleCompanies';
import type { Company } from './types';

describe('companies', () => {
  it('sample dataset integrity: 40–60 records, parents resolve, real brands unrated with null lean, sample provenance', () => {
    expect(SAMPLE_COMPANIES.length).toBeGreaterThanOrEqual(40);
    expect(SAMPLE_COMPANIES.length).toBeLessThanOrEqual(60);
    const ids = new Set(SAMPLE_COMPANIES.map((c) => c.id));
    expect(ids.size).toBe(SAMPLE_COMPANIES.length);
    for (const c of SAMPLE_COMPANIES) {
      if (c.parentCompanyId) expect(ids.has(c.parentCompanyId)).toBe(true);
      expect(c.political.provenance).toBe('sample');
      expect(c.ratingsProvenance).toBe('sample');
      expect(c.political.confidence).toBe('low');
      expect(c.political.sourceHint.length).toBeGreaterThan(10);
      if (!c.fictional) {
        expect(c.political.leanScore).toBeNull();
        expect(Object.keys(c.ratings)).toHaveLength(0);
      } else {
        for (const v of Object.values(c.ratings)) {
          expect(v).toBeGreaterThanOrEqual(-2);
          expect(v).toBeLessThanOrEqual(2);
        }
        if (c.political.leanScore !== null) {
          expect(Math.abs(c.political.leanScore)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('resolveCompanies: later sources win on id; overrides win over all with user provenance', () => {
    const imported: Company = { ...SAMPLE_COMPANIES[0]!, name: 'Imported Name', source: 'pack' };
    const user = makeUserCompany('My Corner Store', 'local');
    const out = resolveCompanies(SAMPLE_COMPANIES, [imported], [user], {
      [user.id]: {
        ratings: { labor: 2 },
        political: { leanScore: 1 },
        bucketDefault: 'regional',
        name: 'Renamed',
      },
      [SAMPLE_COMPANIES[1]!.id]: {},
    });
    const byId = Object.fromEntries(out.map((c) => [c.id, c]));
    expect(byId[SAMPLE_COMPANIES[0]!.id]!.name).toBe('Imported Name');
    const u = byId[user.id]!;
    expect(u.name).toBe('Renamed');
    expect(u.ratings).toEqual({ labor: 2 });
    expect(u.ratingsProvenance).toBe('user');
    expect(u.political.leanScore).toBe(1);
    expect(u.political.provenance).toBe('user');
    expect(u.bucketDefault).toBe('regional');
    expect(byId[SAMPLE_COMPANIES[1]!.id]).toEqual(SAMPLE_COMPANIES[1]);
    expect(out).toHaveLength(SAMPLE_COMPANIES.length + 1);
  });

  it('makeUserCompany creates an unrated user-provenance record; slugId is stable', () => {
    const c = makeUserCompany('  Café Río & Sons ', 'local');
    expect(c.id).toBe('user-cafe-rio-sons');
    expect(c.name).toBe('Café Río & Sons');
    expect(c.political.leanScore).toBeNull();
    expect(c.ratings).toEqual({});
    expect(c.ratingsProvenance).toBe('user');
    expect(slugId('!!!')).toBe('user-company');
    expect(slugId('x', 'imp')).toBe('imp-x');
  });
});
