// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAliasIndex, defaultAliases, matchOrg, normOrg } from './orgmatch.mjs';
import {
  inferPartiesFromRows,
  isExecutiveOccupation,
  makeRecipientPartyResolver,
  matchCommittees,
  parseCm,
  parseCn,
  parseIndiv,
  parseOth,
  parsePas2,
  partyOf,
} from './fec.mjs';
import { normalizeFilings, summarizeLobbying } from './lda.mjs';
import { composeSourceHint, computeLean, MIN_PARTISAN_USD, streamLean } from './political.mjs';
import { summarizeProtection, topicsForFiling } from './lobbying-topics.mjs';
import { describe as stats, judgePac, republicanShares } from './validate-political.mjs';
import { openDb } from './db.mjs';
import {
  computePoliticalFacts,
  exportPoliticalPack,
  exportPoliticalFacts,
} from './seed-political.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

describe('org-name normalization + matching', () => {
  it('normOrg strips only legal-form suffixes and a leading THE', () => {
    expect(normOrg('The Coca-Cola Company')).toBe('COCA COLA');
    expect(normOrg('Bank of America Corporation')).toBe('BANK OF AMERICA');
    expect(normOrg('American International Group, Inc.')).toBe('AMERICAN INTERNATIONAL GROUP');
    expect(normOrg('AMAZON.COM SERVICES LLC')).toBe('AMAZON COM SERVICES');
    expect(normOrg('Microsoft Corp')).toBe('MICROSOFT');
    expect(normOrg('  ')).toBe('');
    expect(normOrg('Inc')).toBe('INC'); // never strip the only word
    expect(normOrg('MERCK & CO., INC.')).toBe('MERCK');
    expect(normOrg('JPMORGAN CHASE & CO.')).toBe('JPMORGAN CHASE');
    expect(normOrg('Johnson & Johnson')).toBe('JOHNSON AND JOHNSON');
    expect(normOrg('AT&T Inc')).toBe('AT AND T');
    expect(normOrg("LOWE'S COMPANIES, INC.")).toBe('LOWES');
    expect(normOrg("McDonald's Corporation")).toBe('MCDONALDS');
    expect(normOrg('JPMORGAN CHASE BANK, N.A.')).toBe('JPMORGAN CHASE BANK');
    expect(normOrg('WELLS FARGO BANK, N. A.')).toBe('WELLS FARGO BANK');
  });
  it('defaultAliases derives sensible variants', () => {
    expect(defaultAliases('Amazon.com Inc')).toEqual(
      expect.arrayContaining(['Amazon.com Inc', 'AMAZON COM', 'AMAZON']),
    );
    expect(defaultAliases('')).toEqual([]);
  });
  const idx = buildAliasIndex([
    { symbol: 'BAC', aliases: ['Bank of America'] },
    { symbol: 'KO', aliases: ['Coca-Cola', 'The Coca-Cola Company'] },
    { symbol: 'MSFT', aliases: ['Microsoft'] },
    { symbol: 'META', aliases: ['Meta'] },
    { symbol: 'TGT', aliases: ['Target'] },
    { symbol: 'GOOGL', aliases: ['Google'] },
    { symbol: 'X1', aliases: ['Shared Name'] },
    { symbol: 'X2', aliases: ['Shared Name'] },
  ]);
  it('exact and multi-word prefix matches; deny-list blocks bottlers/associations', () => {
    expect(matchOrg('BANK OF AMERICA CORPORATION', idx)).toMatchObject({
      symbol: 'BAC',
      method: 'exact',
    }); // suffix stripped
    expect(matchOrg('BANK OF AMERICA MERRILL LYNCH', idx)).toMatchObject({
      symbol: 'BAC',
      method: 'prefix',
    });
    expect(matchOrg('Bank of America', idx)).toMatchObject({ symbol: 'BAC', method: 'exact' });
    expect(matchOrg('BANK OF HAWAII', idx)).toBeNull();
    expect(matchOrg('COCA-COLA BOTTLING COMPANY UNITED', idx)).toBeNull();
    expect(matchOrg('COCA-COLA CONSOLIDATED INC', idx)).toBeNull();
    expect(matchOrg('THE COCA-COLA COMPANY', idx)).toMatchObject({ symbol: 'KO', method: 'exact' });
    expect(matchOrg('BANK OF AMERICA CREDIT UNION', idx)).toBeNull();
  });
  it('single-word aliases never prefix-match unless singleWordPrefix + safe next word', () => {
    expect(matchOrg('MICROSOFT CORPORATION STAKEHOLDERS VOLUNTARY PAC', idx)).toBeNull();
    expect(
      matchOrg('MICROSOFT CORPORATION STAKEHOLDERS VOLUNTARY PAC', idx, { singleWordPrefix: true }),
    ).toMatchObject({ symbol: 'MSFT', method: 'prefix' });
    expect(matchOrg('META FINANCIAL GROUP PAC', idx, { singleWordPrefix: true })).toBeNull();
    expect(matchOrg('TARGET ENTERPRISES', idx, { singleWordPrefix: true })).toBeNull();
    expect(
      matchOrg('TARGET CORPORATION CITIZENS POLITICAL FORUM', idx, { singleWordPrefix: true }),
    ).toMatchObject({ symbol: 'TGT' });
    expect(matchOrg('GOOGLE LLC', idx)).toMatchObject({ symbol: 'GOOGL', method: 'exact' });
    expect(matchOrg('Shared Name', idx)).toMatchObject({
      method: 'exact-ambiguous',
      candidates: ['X1', 'X2'],
    });
    expect(matchOrg('MICROSOFT', idx, { allowPrefix: false })).toMatchObject({ method: 'exact' });
    expect(matchOrg('MICROSOFT CORP RETIREES', idx, { allowPrefix: false })).toBeNull();
  });
});

describe('FEC bulk parsing + party resolution', () => {
  const cmLine =
    'C00012468|THE COCA-COLA COMPANY NONPARTISAN COMMITTEE FOR GOOD GOVERNMENT|TREAS|1 COCA COLA PLZ||ATLANTA|GA|30313|B|Q|UNK|M|C|THE COCA-COLA COMPANY|'.split(
      '|',
    );
  const cnLine = 'H0GA01234|DOE, JANE|DEM|2024|GA|H|05|C|C|C00999999|||ATLANTA|GA|30303'.split('|');
  it('parses cm/cn rows and maps UNK/NNE to no-party', () => {
    const cm = parseCm(cmLine);
    expect(cm).toMatchObject({
      id: 'C00012468',
      designation: 'B',
      type: 'Q',
      party: 'UNK',
      orgType: 'C',
      connectedOrg: 'THE COCA-COLA COMPANY',
    });
    expect(parseCn(cnLine)).toEqual({ id: 'H0GA01234', name: 'DOE, JANE', party: 'DEM' });
    expect(partyOf('UNK')).toBe('U');
    expect(partyOf('NNE')).toBe('U');
    expect(partyOf('')).toBe('U');
    expect(partyOf('DEM')).toBe('D');
    expect(partyOf('DFL')).toBe('D');
    expect(partyOf('REP')).toBe('R');
    expect(partyOf('IND')).toBe('O');
    expect(partyOf('GRE')).toBe('O');
  });
  it('resolves recipient party via committee party, then linked candidate', () => {
    const committees = new Map([
      ['C1', { id: 'C1', party: 'DEM', candId: '' }],
      ['C2', { id: 'C2', party: '', candId: 'H1' }],
      ['C3', { id: 'C3', party: '', candId: '' }],
      ['C4', { id: 'C4', party: 'UNK', candId: '' }],
    ]);
    const candidates = new Map([
      ['H1', { party: 'REP' }],
      ['H2', { party: 'DEM' }],
    ]);
    const links = new Map([['C3', 'H2']]);
    const r = makeRecipientPartyResolver(committees, candidates, links);
    expect(r('C1')).toBe('D');
    expect(r('C2')).toBe('R');
    expect(r('C3')).toBe('D');
    expect(r('C4')).toBe('U');
    expect(r('NOPE')).toBe('U');
  });
  it('infers leadership/super PAC party from their own giving (≥80%, ≥$10k), IE opposition flips', () => {
    const cands = new Map([
      ['D1', { party: 'DEM' }],
      ['R1', { party: 'REP' }],
    ]);
    const rows = [
      { cmteId: 'LEAD', candId: 'R1', txType: '24K', amount: 9000, memo: '' },
      { cmteId: 'LEAD', candId: 'R1', txType: '24K', amount: 3000, memo: '' },
      { cmteId: 'LEAD', candId: 'D1', txType: '24K', amount: 1000, memo: '' },
      { cmteId: 'SUPER', candId: 'D1', txType: '24A', amount: 5e6, memo: '' }, // opposing a Democrat → R
      { cmteId: 'SUPER', candId: 'R1', txType: '24E', amount: 2e6, memo: '' },
      { cmteId: 'SMALL', candId: 'D1', txType: '24K', amount: 5000, memo: '' }, // under $10k
      { cmteId: 'MIXED', candId: 'D1', txType: '24K', amount: 6000, memo: '' },
      { cmteId: 'MIXED', candId: 'R1', txType: '24K', amount: 6000, memo: '' },
      { cmteId: 'MEMO', candId: 'D1', txType: '24K', amount: 50000, memo: 'X' },
    ];
    // JFC-style: transfers to committees whose party resolved via the base resolver appear as pseudo-candidates
    cands.set('cmte:C00DNC', { party: 'DEM' });
    rows.push({ cmteId: 'JFC', candId: 'cmte:C00DNC', txType: '24K', amount: 1_000_000, memo: '' });
    const inf = inferPartiesFromRows(rows, cands);
    expect(inf.get('JFC')).toBe('D');
    expect(inf.get('LEAD')).toBe('R'); // 12k of 13k
    expect(inf.get('SUPER')).toBe('R');
    expect(inf.has('SMALL')).toBe(false);
    expect(inf.has('MIXED')).toBe(false);
    expect(inf.has('MEMO')).toBe(false);
    const r = makeRecipientPartyResolver(
      new Map([['LEAD', { party: '', candId: '' }]]),
      cands,
      new Map(),
      inf,
    );
    expect(r('LEAD')).toBe('R');
    expect(r('UNKNOWN')).toBe('U');
  });
  it('matchCommittees: connected-org exact, corporate name prefix, overrides, and exclusions', () => {
    const idx = buildAliasIndex([
      { symbol: 'KO', aliases: ['Coca-Cola', 'The Coca-Cola Company'] },
      { symbol: 'MSFT', aliases: ['Microsoft'] },
      { symbol: 'AMZN', aliases: ['Amazon', 'Amazon.com'] },
    ]);
    const committees = new Map();
    const add = (id, name, orgType, connectedOrg, party = '', type = 'Q') =>
      committees.set(id, {
        id,
        name,
        orgType,
        connectedOrg,
        party,
        type,
        designation: 'B',
        candId: '',
      });
    add(
      'C1',
      'THE COCA-COLA COMPANY NONPARTISAN COMMITTEE FOR GOOD GOVERNMENT',
      'C',
      'THE COCA-COLA COMPANY',
      'UNK',
    );
    add('C2', 'COCA-COLA CONSOLIDATED, INC. POLITICAL ACTION COMMITTEE', 'C', '');
    add(
      'C3',
      'MICROSOFT CORPORATION STAKEHOLDERS VOLUNTARY PAC - MSVPAC',
      'C',
      'MICROSOFT CORPORATION',
    );
    add('C4', 'AMAZON.COM SERVICES LLC SEPARATE SEGREGATED FUND (AMAZON PAC)', 'C', '');
    add('C5', 'MICROSOFT FOR CONGRESS', '', '', 'DEM', 'H'); // candidate committee — never
    add('C6', 'AMERICAN BEVERAGE ASSOCIATION PAC', 'T', 'AMERICAN BEVERAGE ASSOCIATION'); // trade — never
    add('C7', 'SOME OTHER PAC', '', '');
    const m = matchCommittees(committees, idx, { committees: { AMZN: ['C7', '!C4'] } });
    const by = Object.fromEntries(m.map((x) => [x.committeeId, `${x.symbol}:${x.method}`]));
    expect(by).toEqual({ C1: 'KO:exact', C3: 'MSFT:exact', C7: 'AMZN:override' });
  });
  it('parses pas2/oth/indiv layouts', () => {
    const pas2 =
      'C00012468|N|Q1|P|202404|24K|CCM|DOE FOR CONGRESS|ATLANTA|GA|30303|||03152024|2500|C00999999|H0GA01234|TR1|1|||SUB1'.split(
        '|',
      );
    expect(parsePas2(pas2)).toMatchObject({
      cmteId: 'C00012468',
      txType: '24K',
      amount: 2500,
      otherId: 'C00999999',
      candId: 'H0GA01234',
      memo: '',
      subId: 'SUB1',
    });
    const oth =
      'C00012468|N|Q1|P|202404|24K|PTY|NRSC|WASHINGTON|DC|20003|||03152024|15000|C00027466|TR2|1|X||SUB2'.split(
        '|',
      );
    expect(parseOth(oth)).toMatchObject({
      txType: '24K',
      entityType: 'PTY',
      amount: 15000,
      otherId: 'C00027466',
      memo: 'X',
      subId: 'SUB2',
    });
    const indiv =
      'C00401224|N|M4|P|202404|15E|IND|SMITH, JANE|SEATTLE|WA|98101|AMAZON.COM|ENGINEER|03012024|250|C00999999|TR3|1|||SUB3'.split(
        '|',
      );
    expect(parseIndiv(indiv)).toMatchObject({
      cmteId: 'C00401224',
      txType: '15E',
      entityType: 'IND',
      employer: 'AMAZON.COM',
      occupation: 'ENGINEER',
      amount: 250,
      memo: '',
      subId: 'SUB3',
    });
  });
});

describe('LDA normalization', () => {
  it('keeps quarterly reports, marks superseded amendments, sums latest per period', () => {
    const rows = normalizeFilings(fx('lda-filings-sample.json').results, 'AMZN');
    expect(rows.map((r) => r.filing_uuid).sort()).toEqual(['a1', 'a2', 'a3']); // RR dropped
    const a1 = rows.find((r) => r.filing_uuid === 'a1');
    const a2 = rows.find((r) => r.filing_uuid === 'a2');
    expect(a1.superseded).toBe(1);
    expect(a2.superseded).toBe(0);
    expect(a2.amount_usd).toBe(65000);
    expect(a2.amount_kind).toBe('income');
    const a3 = rows.find((r) => r.filing_uuid === 'a3');
    expect(a3.amount_kind).toBe('expenses');
    expect(a3.amount_usd).toBe(4890000);
    const s = summarizeLobbying(rows);
    expect(s.byYear).toEqual({ 2024: 65000 + 4890000 });
    expect(s.topIssues[0]).toEqual({ name: 'Telecommunications', filings: 2 });
  });
  it('same period with an in-house expenses report: retained-firm income is not added on top', () => {
    const same = summarizeLobbying([
      {
        filing_year: 2024,
        filing_period: 'first_quarter',
        amount_kind: 'expenses',
        amount_usd: 2_000_000,
        superseded: 0,
        issues_json: '[]',
      },
      {
        filing_year: 2024,
        filing_period: 'first_quarter',
        amount_kind: 'income',
        amount_usd: 300_000,
        superseded: 0,
        issues_json: '[]',
      },
      {
        filing_year: 2024,
        filing_period: 'second_quarter',
        amount_kind: 'income',
        amount_usd: 100_000,
        superseded: 0,
        issues_json: '[]',
      },
    ]);
    expect(same.byYear).toEqual({ 2024: 2_100_000 });
  });
});

describe('lean derivation', () => {
  it('bins r=(R−D)/(R+D) with sign convention negative=conservative; null under the minimum', () => {
    expect(computeLean({ pacD: 1000, pacR: 1000 }).leanScore).toBeNull(); // 2k < 5k
    expect(computeLean({ pacD: 5000, pacR: 5000 })).toMatchObject({
      leanScore: 0,
      r: 0,
      confidence: 'low',
    });
    expect(computeLean({ pacD: 20000, pacR: 80000 })).toMatchObject({ leanScore: -2 }); // r = .6
    expect(computeLean({ pacD: 30000, pacR: 70000 })).toMatchObject({ leanScore: -1 }); // r = .4
    expect(computeLean({ pacD: 70000, pacR: 30000 })).toMatchObject({ leanScore: 1 });
    expect(computeLean({ pacD: 90000, pacR: 10000 })).toMatchObject({ leanScore: 2 });
    expect(computeLean({ pacD: 200000, pacR: 100000, empD: 100000, empR: 0 })).toMatchObject({
      leanScore: 1,
      confidence: 'high',
    });
    expect(computeLean({ pacD: 400000, pacR: 100000 })).toMatchObject({ confidence: 'med' }); // high needs both channels
    expect(MIN_PARTISAN_USD).toBe(5000);
  });
  it('composeSourceHint cites cycles, splits, lobbying, method, and FEC links', () => {
    const lean = computeLean({ pacD: 600000, pacR: 400000, empD: 900000, empR: 100000 });
    const hint = composeSourceHint({
      cycles: [2022, 2024],
      pac: { D: 600000, R: 400000, O: 0, U: 50000 },
      emp: { D: 900000, R: 100000, O: 0, U: 0 },
      lobbyingByYear: { 2023: 19e6, 2024: 20e6 },
      committees: ['C00360354'],
      computedAt: '2026-08-16T00:00:00Z',
      lean,
    });
    expect(hint).toMatch(
      /FEC 2021–2024: PAC \$1\.0M to candidates\/parties \(D 60% \/ R 40%\); employees \$1\.0M to candidates\/parties \(D 90% \/ R 10%\); lobbying \$39\.0M \(2023–2024, Senate LDA\)\./,
    );
    expect(hint).toMatch(/Lean \+1 \(r=-0\.50, high confidence\)/);
    expect(hint).toMatch(/fec\.gov\/data\/committee\/C00360354/);
    expect(hint).toMatch(/docs\/political-seed\.md/);
    expect(hint.length).toBeLessThanOrEqual(480);
    const none = composeSourceHint({
      cycles: [2024],
      pac: { D: 0, R: 0, O: 0, U: 0 },
      emp: { D: 0, R: 0, O: 0, U: 0 },
      lobbyingByYear: {},
      committees: [],
      computedAt: '2026-08-16T00:00:00Z',
      lean: computeLean({}),
    });
    expect(none).toMatch(/No FEC PAC\/employee contributions or LDA lobbying matched/);
    expect(none).toMatch(/Lean not assigned/);
  });
});

describe('facts + pack export (in-memory DB)', () => {
  it('aggregates cycles/channels, applies sameAs share classes, exports pack records for sample brands', () => {
    const db = openDb(':memory:');
    const ins = db.prepare(
      'INSERT INTO political_contribution (company_symbol,cycle,channel,party,amount_usd,txn_count,source,computed_at) VALUES (?,?,?,?,?,?,?,?)',
    );
    ins.run('AMZN', 2024, 'pac', 'D', 500000, 100, 't', 'now');
    ins.run('AMZN', 2024, 'pac', 'R', 500000, 100, 't', 'now');
    ins.run('AMZN', 2022, 'employee', 'D', 900000, 3000, 't', 'now');
    ins.run('AMZN', 2022, 'employee', 'R', 100000, 300, 't', 'now');
    ins.run('AMZN', 2022, 'executive', 'D', 200000, 40, 't', 'now'); // subset of employee
    ins.run('AMZN', 2022, 'executive', 'R', 50000, 10, 't', 'now');
    ins.run('GOOGL', 2024, 'pac', 'D', 300000, 50, 't', 'now');
    ins.run('GOOGL', 2024, 'pac', 'R', 300000, 50, 't', 'now');
    db.prepare(
      'INSERT INTO political_committee (company_symbol,committee_id,committee_name,connected_org,org_type,designation,match_method,cycle_seen) VALUES (?,?,?,?,?,?,?,?)',
    ).run('AMZN', 'C00360354', 'AMAZON PAC', null, 'C', 'B', 'name-prefix', 2024);
    db.prepare(
      'INSERT INTO lobbying_filing (filing_uuid,company_symbol,client_id,registrant_id,registrant_name,filing_year,filing_period,filing_type,dt_posted,amount_usd,amount_kind,issues_json,document_url,superseded) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'f1',
      'AMZN',
      50892,
      9,
      'AMAZON',
      2024,
      'first_quarter',
      'Q1',
      '2024-04-01',
      4890000,
      'expenses',
      '[{"code":"TAX","display":"Taxation","description":"Corporate tax provisions"},{"code":"TRD","display":"Trade","description":"Section 301 tariffs on imported goods; tariff exclusion requests"}]',
      'https://lda.gov/filings/f1.pdf',
      0,
    );
    const r = computePoliticalFacts(db, { cycles: [2022, 2024] });
    const amzn = r.facts.AMZN;
    expect(amzn.totals.pac).toEqual({ D: 500000, R: 500000, O: 0, U: 0 });
    expect(amzn.totals.employee).toEqual({ D: 900000, R: 100000, O: 0, U: 0 });
    expect(amzn.totals.executive).toEqual({ D: 200000, R: 50000, O: 0, U: 0 });
    expect(amzn.lean.leanScore).toBe(1); // r = (600k − 1.4M)/2M = −0.4 (executives are NOT added on top)
    expect(amzn.lean.confidence).toBe('high');
    // streams reported separately: PAC balanced, employees +2, executives +1 (r = −0.6 → bin +2? no: r ≤ −0.6 → +2)
    expect(amzn.streams.pac.leanScore).toBe(0);
    expect(amzn.streams.employee.leanScore).toBe(2);
    expect(amzn.streams.executive).toMatchObject({ leanScore: 2, subsetOf: 'employee' });
    expect(amzn.sourceHint).toMatch(/of which senior executives \$250k \(D 80% \/ R 20%\)/);
    expect(amzn.lobbying).toEqual({ 2024: 4890000 });
    expect(amzn.topIssues[0].name).toBe('Taxation');
    // Axis-2 activity block: one in-house filing, 2 codes, one of them TRD → weighted 50%, any 100%
    expect(amzn.protectionActivity).toMatchObject({
      years: [2024],
      lobbyTotalUsd: 4890000,
      filings: 1,
      tradeProtection: { anyShare: 1, weightedShare: 0.5, weightedUsd: 2445000, codes: { TRD: 1 } },
      verify: ['https://lda.gov/filings/f1.pdf'],
    });
    expect(Object.keys(amzn.protectionActivity.topics)).toEqual(
      expect.arrayContaining(['TRD', 'TAX', 'tariff', 'tariff-exclusion']),
    );
    expect(r.facts.GOOGL.protectionActivity).toBeNull();
    expect(amzn.links.fec[0]).toContain('C00360354');
    expect(r.facts.GOOG).toBeDefined();
    expect(r.facts.GOOG.sameAs).toBe('GOOGL');
    expect(r.facts.GOOG.lean.leanScore).toBe(0);
    // exports
    const dir = mkdtempSync(path.join(tmpdir(), 'compass-pol-'));
    const facts = exportPoliticalFacts(r, path.join(dir, 'facts.json'));
    expect(facts.counts.withLean).toBeGreaterThanOrEqual(3);
    const pack = exportPoliticalPack(r, path.join(dir, 'pack.json'));
    const doc = JSON.parse(readFileSync(pack.path, 'utf8'));
    expect(doc.schema).toBe('compass-data-pack');
    const wf = doc.companies.find((c) => c.id === 'whole-foods'); // sample brand with ticker AMZN
    expect(wf).toBeDefined();
    expect(wf.political.leanScore).toBe(1);
    expect(wf.political.sourceHint).toMatch(/^Via listed parent/);
    expect(wf.parentCompanyId).toBe('amazon');
    const amazon = doc.companies.find((c) => c.id === 'amazon');
    expect(amazon.political.sourceHint).not.toMatch(/^Via listed parent/);
    expect(doc.companies.find((c) => c.id === 'co-googl')).toBeDefined();
    // no values ratings are asserted
    expect(doc.companies.every((c) => Object.keys(c.ratings).length === 0)).toBe(true);
    // aggregates only (52 U.S.C. §30111(a)(4)): no donor-level fields anywhere in either export
    const donorKey =
      /^(donor|contributor|contributorName|address|street|zip|zipCode|city|firstName|lastName|occupation|transactionId|subId)$/i;
    const walk = (v, seen = []) => {
      if (Array.isArray(v)) return v.flatMap((x) => walk(x, seen));
      if (v && typeof v === 'object')
        return Object.entries(v).flatMap(([k, x]) => (donorKey.test(k) ? [k] : walk(x, seen)));
      return [];
    };
    expect(walk(JSON.parse(readFileSync(facts.path, 'utf8')))).toEqual([]);
    expect(walk(doc)).toEqual([]);
    expect(JSON.parse(readFileSync(facts.path, 'utf8')).version).toBe(2);
  });
});

describe('executive tier + per-stream lean', () => {
  it('isExecutiveOccupation: senior titles in, plain VP/director/assistants/retired out', () => {
    for (const o of [
      'CEO',
      'Chief Executive Officer',
      'PRESIDENT & CEO',
      'EXECUTIVE VICE PRESIDENT',
      'Sr. Vice President',
      'SVP',
      'CO-FOUNDER',
      'CHAIRMAN',
      'MANAGING DIRECTOR',
      'GENERAL PARTNER',
      'CHIEF FINANCIAL OFFICER',
      'BOARD MEMBER',
      'VP, PRESIDENT DIVISION',
    ])
      expect(isExecutiveOccupation(o), o).toBe(true);
    for (const o of [
      'VICE PRESIDENT',
      'AVP',
      'DIRECTOR',
      'OWNER',
      'PRINCIPAL',
      'ASSISTANT TO THE CEO',
      'DEPUTY CHIEF',
      'CHIEF PILOT',
      'CHIEF ENGINEER',
      'CHIEF OF STAFF',
      'RETIRED CEO',
      'ACCOUNT EXECUTIVE',
      'SOFTWARE ENGINEER',
      '',
      null,
    ])
      expect(isExecutiveOccupation(o), String(o)).toBe(false);
  });
  it('streamLean uses the pooled bins and floor, no confidence', () => {
    expect(streamLean({ D: 2000, R: 2000 })).toEqual({
      r: null,
      leanScore: null,
      partisanUsd: 4000,
    });
    expect(streamLean({ D: 20000, R: 80000 })).toMatchObject({ r: 0.6, leanScore: -2 });
    expect(streamLean({ D: 55000, R: 45000 })).toMatchObject({ leanScore: 0 }); // r = −0.1
    expect(streamLean({ D: 80000, R: 20000 })).toMatchObject({ leanScore: 2 });
    expect(streamLean({})).toMatchObject({ leanScore: null, partisanUsd: 0 });
  });
  it('the political_contribution CHECK accepts the executive channel', () => {
    const db = openDb(':memory:');
    expect(() =>
      db
        .prepare(
          'INSERT INTO political_contribution (company_symbol,cycle,channel,party,amount_usd,txn_count,source,computed_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run('X', 2024, 'executive', 'D', 1, 1, 't', 'now'),
    ).not.toThrow();
    expect(() =>
      db
        .prepare(
          'INSERT INTO political_contribution (company_symbol,cycle,channel,party,amount_usd,txn_count,source,computed_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run('X', 2024, 'donor', 'D', 1, 1, 't', 'now'),
    ).toThrow();
  });
});

describe('lobbying topics (Axis-2 inputs)', () => {
  it('flags issue codes and keyword topics with evidence snippets; topic, not position', () => {
    const flags = topicsForFiling({
      issues_json: JSON.stringify([
        {
          code: 'TRD',
          description: 'Section 232 steel tariffs; Buy American provisions in infrastructure bill',
        },
        { code: 'LBR', description: 'Antitrust enforcement; merger review guidelines' },
        { code: 'ENV', description: 'Clean water rules' },
      ]),
    });
    const byTopic = Object.fromEntries(flags.map((f) => [f.topic, f]));
    expect(byTopic.TRD).toMatchObject({ kind: 'code', method: 'lda-issue-code', evidence: null });
    expect(byTopic.LBR.kind).toBe('code');
    expect(byTopic.ENV).toBeUndefined(); // only Axis-2-relevant codes are flagged
    expect(byTopic.tariff).toMatchObject({ kind: 'keyword', method: 'keyword-v1' });
    expect(byTopic.tariff.evidence).toMatch(/Section 232 steel tariffs/);
    expect(byTopic['domestic-content'].evidence).toMatch(/Buy American/);
    expect(byTopic.antitrust.evidence).toMatch(/Antitrust enforcement/);
    expect(byTopic.subsidy).toBeUndefined();
    expect(topicsForFiling({ issues_json: 'not json' })).toEqual([]);
  });
  it('summarizeProtection: in-house-first dollars, any vs issue-weighted shares, count fallback', () => {
    const rows = [
      // 2024 Q1: in-house report $1M with TAX+TRD (2 codes) and a retained firm $200k on TAX only
      {
        filing_uuid: 'a',
        filing_year: 2024,
        filing_period: 'first_quarter',
        amount_usd: 1_000_000,
        amount_kind: 'expenses',
        issues_json:
          '[{"code":"TAX","description":"tax"},{"code":"TRD","description":"tariffs on inputs"}]',
        document_url: 'https://lda.gov/a.pdf',
        superseded: 0,
      },
      {
        filing_uuid: 'b',
        filing_year: 2024,
        filing_period: 'first_quarter',
        amount_usd: 200_000,
        amount_kind: 'income',
        issues_json: '[{"code":"TAX","description":"tax"}]',
        document_url: 'https://lda.gov/b.pdf',
        superseded: 0,
      },
      // 2024 Q2: only "< $5,000" filings (amount 0): TAR-only filing and a BUD filing → count fallback 1/2
      {
        filing_uuid: 'c',
        filing_year: 2024,
        filing_period: 'second_quarter',
        amount_usd: 0,
        amount_kind: 'income',
        issues_json: '[{"code":"TAR","description":"miscellaneous tariff bill"}]',
        document_url: null,
        superseded: 0,
      },
      {
        filing_uuid: 'd',
        filing_year: 2024,
        filing_period: 'second_quarter',
        amount_usd: 0,
        amount_kind: 'income',
        issues_json: '[{"code":"BUD","description":"appropriations"}]',
        document_url: null,
        superseded: 0,
      },
      {
        filing_uuid: 'old',
        filing_year: 2023,
        filing_period: 'first_quarter',
        amount_usd: 9e9,
        amount_kind: 'income',
        issues_json: '[{"code":"TAR"}]',
        document_url: null,
        superseded: 1,
      },
    ];
    const p = summarizeProtection(rows);
    // Q1 dedup total = $1M (in-house), reported = $1.2M; any share = 1.0M/1.2M; weighted = (1.0M×0.5)/1.2M
    expect(p.lobbyTotalUsd).toBe(1_000_000);
    expect(p.filings).toBe(4);
    expect(p.tradeProtection.anyUsd).toBe(Math.round((1_000_000 / 1_200_000) * 1_000_000));
    expect(p.tradeProtection.weightedUsd).toBe(Math.round((500_000 / 1_200_000) * 1_000_000));
    expect(p.tradeProtection.filings).toBe(2); // a (TRD) + c (TAR)
    expect(p.tradeProtection.codes).toEqual({ TRD: 1, TAR: 1 });
    expect(p.years).toEqual([2024]);
    expect(p.verify).toEqual(['https://lda.gov/a.pdf', 'https://lda.gov/b.pdf']);
    expect(p.topics.TRD.filings).toBe(1);
    expect(p.topics.tariff.filings).toBe(2); // "tariffs on inputs" + "miscellaneous tariff bill"
    expect(p.method).toMatch(/Topic, not position/);
    expect(summarizeProtection([rows[4]])).toBeNull();
  });
});

describe('validation harness (A4 benchmark)', () => {
  it('republicanShares per company and per company-cycle with the $5k floor; judgePac bounds', () => {
    const rows = [
      { company_symbol: 'A', cycle: 2022, channel: 'pac', party: 'D', amount_usd: 40000 },
      { company_symbol: 'A', cycle: 2022, channel: 'pac', party: 'R', amount_usd: 60000 },
      { company_symbol: 'A', cycle: 2024, channel: 'pac', party: 'D', amount_usd: 20000 },
      { company_symbol: 'A', cycle: 2024, channel: 'pac', party: 'R', amount_usd: 80000 },
      { company_symbol: 'A', cycle: 2024, channel: 'pac', party: 'U', amount_usd: 999999 },
      { company_symbol: 'B', cycle: 2024, channel: 'pac', party: 'D', amount_usd: 1000 }, // under floor
      { company_symbol: 'B', cycle: 2024, channel: 'employee', party: 'D', amount_usd: 9000 },
    ];
    const s = republicanShares(rows, 'pac');
    expect(s.pooled).toEqual([70]); // A: 140k R of 200k; B excluded
    expect(s.perCycle).toEqual([60, 80]);
    expect(republicanShares(rows, 'employee').pooled).toEqual([0]);
    expect(stats([10, 20, 30, 40, 50])).toMatchObject({
      n: 5,
      mean: 30,
      median: 30,
      p25: 20,
      p75: 40,
    });
    expect(stats([])).toEqual({ n: 0 });
    expect(judgePac({ n: 200, mean: 47, p25: 21, p75: 72 })).toMatchObject({
      ok: true,
      warnings: [],
    });
    const narrow = judgePac({ n: 200, mean: 54, p25: 49, p75: 61 });
    expect(narrow.ok).toBe(true); // narrower than the benchmark is a composition warning, not a failure
    expect(narrow.warnings[0]).toMatch(/narrower than the benchmark/);
    expect(judgePac({ n: 200, mean: 54, p25: 50, p75: 52 }).ok).toBe(false); // near-uniform
    expect(judgePac({ n: 200, mean: 80, p25: 60, p75: 95 }).ok).toBe(false); // mean far off
    expect(judgePac({ n: 10, mean: 47, p25: 21, p75: 72 }).ok).toBe(false); // too few
  });
});
