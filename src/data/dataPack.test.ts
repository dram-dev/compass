import { describe, expect, it } from 'vitest';
import { EXAMPLE_DATA_PACK, parseDataPack } from './dataPack';

const base = () => JSON.parse(JSON.stringify(EXAMPLE_DATA_PACK));

describe('data pack import (EF9)', () => {
  it('accepts the example pack and stamps imported provenance + source', () => {
    const r = parseDataPack(JSON.stringify(EXAMPLE_DATA_PACK));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.companies).toHaveLength(2);
    expect(r.companies[0]!.political.provenance).toBe('imported');
    expect(r.companies[0]!.ratingsProvenance).toBe('imported');
    expect(r.companies[0]!.source).toBe('Example pack (edit me)');
    expect(r.overridesSample).toBe(0);
    expect(r.companies[1]!.political.leanScore).toBe(0);
    const t = parseDataPack(
      JSON.stringify({
        ...EXAMPLE_DATA_PACK,
        companies: [
          { id: 'x', name: 'X', bucketDefault: 'major', ticker: ' amzn ' },
          { id: 'y', name: 'Y', bucketDefault: 'major', ticker: 'not a ticker' },
        ],
      }),
    );
    expect(t.ok).toBe(true);
    if (t.ok) {
      expect(t.companies[0]!.ticker).toBe('AMZN');
      expect(t.companies[1]!.ticker).toBeUndefined();
    }
  });

  it('rejects malformed packs with specific messages (never partial)', () => {
    const cases: [unknown, RegExp][] = [
      ['{', /Not valid JSON/],
      [[], /JSON object/],
      [{ ...base(), schema: 'x' }, /schema must be/],
      [{ ...base(), version: 2 }, /version must be 1/],
      [{ ...base(), source: '' }, /source is required/],
      [{ ...base(), companies: [] }, /non-empty/],
      [{ ...base(), principles: 'no' }, /principles must be/],
      [{ ...base(), principles: [{ id: 'x' }] }, /each needs id and label/],
      [{ ...base(), companies: [{ name: 'x' }] }, /id is required/],
      [{ ...base(), companies: [{ id: 'x' }] }, /name is required/],
      [{ ...base(), companies: [{ id: 'x', name: 'x', bucketDefault: 'zzz' }] }, /bucketDefault/],
      [
        {
          ...base(),
          companies: [
            { id: 'x', name: 'x', bucketDefault: 'local' },
            { id: 'x', name: 'y', bucketDefault: 'local' },
          ],
        },
        /duplicate id/,
      ],
      [
        {
          ...base(),
          companies: [{ id: 'x', name: 'x', bucketDefault: 'local', political: { leanScore: 5 } }],
        },
        /leanScore/,
      ],
      [
        {
          ...base(),
          companies: [
            { id: 'x', name: 'x', bucketDefault: 'local', political: { confidence: 'sure' } },
          ],
        },
        /confidence/,
      ],
      [
        { ...base(), companies: [{ id: 'x', name: 'x', bucketDefault: 'local', political: 3 }] },
        /political must be/,
      ],
      [
        {
          ...base(),
          companies: [{ id: 'x', name: 'x', bucketDefault: 'local', ratings: { labor: 9 } }],
        },
        /rating "labor"/,
      ],
      [
        { ...base(), companies: [{ id: 'x', name: 'x', bucketDefault: 'local', ratings: [] }] },
        /ratings must be/,
      ],
      [
        {
          ...base(),
          companies: [{ id: 'x', name: 'x', bucketDefault: 'local', parentCompanyId: 'nope' }],
        },
        /does not resolve/,
      ],
    ];
    for (const [input, re] of cases) {
      const text = typeof input === 'string' ? input : JSON.stringify(input);
      const r = parseDataPack(text);
      expect(r.ok, text.slice(0, 60)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(re);
    }
  });

  it('parents may resolve to sample records; sample-id collisions are counted as overrides', () => {
    const r = parseDataPack(
      JSON.stringify({
        ...base(),
        companies: [
          {
            id: 'nationalmart',
            name: 'NationalMart (researched)',
            bucketDefault: 'major',
            parentCompanyId: 'omnicorp-holdings',
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.overridesSample).toBe(1);
      expect(r.companies[0]!.sector).toBe('Unspecified');
      expect(r.companies[0]!.political.leanScore).toBeNull();
    }
  });
});
