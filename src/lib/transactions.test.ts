import { describe, expect, it } from 'vitest';
import { parseDelimited, sniffDelimiter } from './csv';
import {
  buildCompanyIndex,
  buildPlan,
  categoryFor,
  excludeReason,
  matchMerchant,
  monthsCovered,
  normalizeDescriptor,
  parseAmount,
  parseDate,
  parseStatement,
  summarise,
  titleCase,
} from './transactions';
import { BARE, CAPITAL_ONE, CHASE, EU_BANK } from './fixtures/statements';
import { SAMPLE_COMPANIES } from '@/data/sampleCompanies';

const index = buildCompanyIndex(SAMPLE_COMPANIES);

describe('csv parsing', () => {
  it('sniffs delimiters and honours RFC4180 quoting', () => {
    expect(sniffDelimiter(CHASE)).toBe(',');
    expect(sniffDelimiter(EU_BANK)).toBe(';');
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    const t = parseDelimited('a,b\n"x, y","he said ""hi"""\n');
    expect(t.header).toEqual(['a', 'b']);
    expect(t.rows[0]).toEqual(['x, y', 'he said "hi"']);
  });

  it('skips preamble lines and finds the real header', () => {
    const t = parseDelimited(EU_BANK);
    expect(t.header).toEqual(['Datum', 'Beschreibung', 'Betrag', 'Saldo']);
    expect(t.preamble.length).toBeGreaterThan(0);
    expect(t.rows.length).toBe(4);
  });
});

describe('value parsing', () => {
  it('parses statement amounts including parentheses, EU decimals and trailing minus', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56);
    expect(parseAmount('-84.19')).toBe(-84.19);
    expect(parseAmount('(12.34)')).toBe(-12.34);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('-43,17')).toBe(-43.17);
    expect(parseAmount('45.00-')).toBe(-45);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
  });

  it('parses ISO, US and D.M.Y dates; day > 12 disambiguates', () => {
    expect(parseDate('2026-02-27')).toBe('2026-02-27');
    expect(parseDate('02/28/2026')).toBe('2026-02-28');
    expect(parseDate('28.02.2026')).toBe('2026-02-28');
    expect(parseDate('3/4/26')).toBe('2026-03-04');
    expect(parseDate('15 Feb 2026')).toBe('2026-02-15');
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('descriptor normalization', () => {
  it('strips processor prefixes, store numbers, phones and trailing geography', () => {
    expect(normalizeDescriptor('SQ *BLUE BOTTLE COFFEE')).toBe('BLUE BOTTLE COFFEE');
    expect(normalizeDescriptor('TST* JOES PIZZA 4155551212')).toBe('JOES PIZZA');
    expect(normalizeDescriptor('WHOLEFDS MKT 10255')).toBe('WHOLEFDS MKT');
    expect(normalizeDescriptor('AMZN Mktp US*2H45R9OL3')).toBe('AMZN MKTP US 2H45R9OL3');
    expect(normalizeDescriptor('NETFLIX.COM')).toBe('NETFLIX');
    expect(normalizeDescriptor('TRADER JOE S #182')).toBe('TRADER JOE S');
    expect(titleCase('BLUE BOTTLE COFFEE')).toBe('Blue Bottle Coffee');
  });
});

describe('merchant matching', () => {
  it('recognises chains from the brand table and reuses the shipped sample company', () => {
    const m = matchMerchant('WHOLEFDS MKT 10255', index, 'Groceries');
    expect(m).toMatchObject({
      brand: 'Whole Foods Market',
      companyId: 'whole-foods',
      bucket: 'major',
      category: 'groceries',
      method: 'brand-rule',
    });
    expect(matchMerchant('SBUX STORE 44012', index).companyId).toBe('starbucks');
    expect(matchMerchant('SHELL OIL 57442136703', index).category).toBe('fuel');
    expect(matchMerchant('CHIPOTLE 1834', index).brand).toBe('Chipotle');
    expect(matchMerchant('AMZN Mktp US*1K9', index).companyId).toBe('amazon');
  });

  it('matches an existing company by name when no brand rule applies', () => {
    const m = matchMerchant('PLANET FIT CLUB FEES', index);
    expect(m.companyId).toBe('planet-fitness');
  });

  it('leaves unknown merchants Unknown — never guesses local vs major', () => {
    const m = matchMerchant('SQ *BLUE BOTTLE COFFEE', index);
    expect(m).toMatchObject({
      companyId: null,
      brand: null,
      bucket: 'unknown',
      method: 'unmatched',
      display: 'Blue Bottle Coffee',
    });
    expect(m.category).toBe('dining'); // category still inferred from the keyword
    expect(matchMerchant('UNKNOWN VENDOR XYZ', index)).toMatchObject({
      bucket: 'unknown',
      category: 'retail', // fallback
    });
  });

  it('categorises from keywords and from the bank category column', () => {
    expect(categoryFor('JOES PIZZA')).toBe('dining');
    expect(categoryFor('CITY FARM PRODUCE')).toBe('groceries');
    expect(categoryFor('SOME VENDOR', 'Gas/Automotive')).toBe('fuel');
    expect(categoryFor('ACME WIDGETS')).toBe('retail');
  });
});

describe('exclusions', () => {
  it('drops payments, transfers, cash, income, fees, rent and utilities', () => {
    expect(excludeReason('Payment Thank You - Web')).toBe('card-payment');
    expect(excludeReason('CAPITAL ONE AUTOPAY PYMT')).toBe('card-payment');
    expect(excludeReason('ZELLE TO ALEX')).toBe('transfer');
    expect(excludeReason('ATM WITHDRAWAL')).toBe('atm-cash');
    expect(excludeReason('DIRECT DEP PAYROLL')).toBe('income');
    expect(excludeReason('ANNUAL MEMBERSHIP FEE')).toBe('fees');
    expect(excludeReason('RENT MARCH')).toBe('housing');
    expect(excludeReason('CITY OF AUSTIN WATER DEPT')).toBe('utilities');
    expect(excludeReason('WHOLEFDS MKT 10255')).toBeNull();
  });
});

describe('column detection and sign conventions', () => {
  it('Chase: negative purchases, own category column, transaction date preferred', () => {
    const f = parseStatement(CHASE);
    expect(f.columns).toMatchObject({ date: 0, description: 2, amount: 5, category: 3 });
    const spend = f.txns.filter((t) => !t.excluded);
    // 20 rows: the $1,250 payment and the $95 fee are excluded, 18 remain
    expect(spend.length).toBe(18);
    expect(spend.every((t) => t.amount > 0)).toBe(true);
    // a credit row that is clearly a card payment keeps the specific label, not just "credit"
    expect(f.txns.find((t) => /Payment Thank You/.test(t.description))?.excluded).toBe(
      'card-payment',
    );
    expect(f.txns.find((t) => /ANNUAL MEMBERSHIP/.test(t.description))?.excluded).toBe('fees');
  });

  it('Capital One: debit/credit columns, ISO dates, refunds excluded', () => {
    const f = parseStatement(CAPITAL_ONE);
    expect(f.columns.debit).toBe(5);
    expect(f.columns.credit).toBe(6);
    const spend = f.txns.filter((t) => !t.excluded);
    expect(spend.length).toBe(8);
    expect(f.txns.find((t) => /RETURN/.test(t.description))?.excluded).toBe('credit');
    expect(f.txns.find((t) => /AUTOPAY/.test(t.description))?.excluded).toBe('card-payment');
  });

  it('European export: semicolons, comma decimals, income excluded', () => {
    const f = parseStatement(EU_BANK);
    const spend = f.txns.filter((t) => !t.excluded);
    expect(spend.map((t) => t.amount)).toEqual([43.17, 18.9, 129]);
    expect(f.txns.find((t) => /LOHN/.test(t.description))?.excluded).toBe('credit');
  });

  it('bare three-column file with positive amounts', () => {
    const f = parseStatement(BARE);
    expect(f.columns).toMatchObject({ date: 0, description: 1, amount: 2 });
    expect(f.txns.filter((t) => !t.excluded).length).toBe(3);
  });
});

describe('summary and plan', () => {
  it('months covered spans the dated rows, never below 1', () => {
    expect(monthsCovered(['2026-01-01', '2026-03-31']).months).toBe(3);
    expect(monthsCovered(['2026-02-01', '2026-02-20']).months).toBe(1); // partial month → 1
    expect(monthsCovered([]).months).toBe(1);
    expect(monthsCovered(['2026-02-10']).from).toBe('2026-02-10');
  });

  it('groups merchants, scales to a monthly figure, and splits by bucket', () => {
    const s = summarise([parseStatement(CHASE)], index);
    // months span the spending rows only (2025-12-22 → 2026-02-28 ≈ 69 days), not the excluded fee
    expect(s.months).toBe(2.5);
    expect(s.from).toBe('2025-12-22');
    expect(s.excluded['card-payment']?.count).toBe(1);
    expect(s.excluded['fees']?.count).toBe(1);
    expect(s.excluded['credit']).toBeUndefined(); // the only credit row was a card payment
    // Whole Foods appears twice and is grouped
    const wf = s.groups.find((g) => g.brand === 'Whole Foods Market')!;
    expect(wf.count).toBe(2);
    expect(wf.total).toBeCloseTo(175.21, 2);

    const plan = buildPlan(s);
    const groceries = plan.find((p) => p.categoryId === 'groceries')!;
    // 84.19+91.02+62.44+40+55.31+210.55 = 543.51 over 2.5 months
    expect(groceries.monthlySpend).toBe(Math.round(543.51 / 2.5));
    // Whole Foods / TJ / Costco are majors; the co-op and farmers market are unknown until classified
    expect(groceries.shares.major).toBeGreaterThan(50);
    expect(groceries.shares.unknown).toBeGreaterThan(10);
    expect(groceries.shares.local).toBe(0);
    expect(groceries.named.major).toContain('whole-foods');
    expect(Object.values(groceries.shares).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it('review overrides move dollars between buckets and categories, and skips drop out', () => {
    const s = summarise([parseStatement(CHASE)], index);
    const coop = s.groups.find((g) => g.display === 'Green Fields Coop')!;
    coop.bucketOverride = 'local';
    const salon = s.groups.find((g) => g.display === 'Juniper Salon')!;
    salon.bucketOverride = 'local';
    salon.categoryOverride = 'personal-care';
    const netflix = s.groups.find((g) => g.brand === 'Netflix')!;
    netflix.skip = true;

    const plan = buildPlan(s);
    const groceries = plan.find((p) => p.categoryId === 'groceries')!;
    expect(groceries.shares.local).toBeGreaterThan(0);
    expect(groceries.newCompanies).toEqual([{ name: 'Green Fields Coop', bucket: 'local' }]);
    const care = plan.find((p) => p.categoryId === 'personal-care')!;
    expect(care.merchants.some((m) => m.display === 'Juniper Salon')).toBe(true);
    expect(plan.flatMap((p) => p.merchants).some((m) => m.display === 'Netflix')).toBe(false);
  });

  it('a months override rescales every category', () => {
    const s = summarise([parseStatement(CHASE)], index);
    const one = buildPlan(s, 1);
    const three = buildPlan(s, 3);
    const g1 = one.find((p) => p.categoryId === 'groceries')!.monthlySpend;
    const g3 = three.find((p) => p.categoryId === 'groceries')!.monthlySpend;
    expect(Math.abs(g1 - g3 * 3)).toBeLessThanOrEqual(3); // per-category rounding only
  });

  it('multiple files combine into one summary', () => {
    const s = summarise([parseStatement(CHASE), parseStatement(CAPITAL_ONE)], index);
    expect(s.rows).toBe(30);
    expect(s.groups.some((g) => g.brand === 'Kroger')).toBe(true);
    expect(s.groups.some((g) => g.brand === 'Whole Foods Market')).toBe(true);
  });
});
