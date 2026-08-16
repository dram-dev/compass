// Generates src/data/fixtures/persona-jordan.json (spec §12). Run: node scripts/gen-jordan.mjs
import { writeFileSync } from 'node:fs';

const pm = (mid, w = 5) => {
  const k = Math.min(w, mid, 100 - mid);
  return [mid - k, mid + k];
};
const alloc = (mids, named = {}) =>
  ['local', 'regional', 'major', 'unknown'].map((b, i) => ({
    bucket: b,
    rangePct: pm(mids[i]),
    namedCompanyIds: named[b] ?? [],
  }));

const cat = (id, label, spend, cur, tgt, named = {}) => ({
  id,
  label,
  monthlySpend: spend,
  current: alloc(cur, named),
  target: alloc(tgt, named),
});

const state = {
  schemaVersion: 1,
  profile: {
    name: 'Jordan',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  },
  goalMode: 'local-first',
  principles: [
    { id: 'local-economy', label: 'Local economy', weight: 60, custom: false },
    { id: 'labor', label: 'Labor practices', weight: 25, custom: false },
    { id: 'environment', label: 'Environment', weight: 15, custom: false },
    { id: 'political-alignment', label: 'Political alignment', weight: 0, custom: false },
  ],
  political: { configured: true, direction: 1, intensity: 0.6 },
  categories: [
    cat('groceries', 'Groceries', 900, [25, 20, 45, 10], [55, 20, 20, 5], {
      local: ['green-fields-coop'],
      major: ['nationalmart'],
    }),
    cat('dining', 'Dining & coffee', 450, [55, 15, 20, 10], [70, 10, 15, 5]),
    cat('fuel', 'Fuel & auto', 350, [10, 25, 55, 10], [25, 30, 40, 5], {
      regional: ['prairie-petro-coop'],
    }),
    cat('retail', 'Retail & household', 550, [15, 15, 60, 10], [35, 15, 45, 5], {
      local: ['hearth-and-hardware'],
    }),
    cat('subscriptions', 'Subscriptions & media', 180, [5, 5, 80, 10], [15, 5, 70, 10], {
      major: ['streambox-media'],
    }),
    cat('banking', 'Banking & insurance', 420, [20, 10, 65, 5], [60, 10, 28, 2], {
      local: ['first-prairie-cu'],
      major: ['colossus-bank'],
    }),
    cat('personal-care', 'Personal care & services', 250, [60, 10, 20, 10], [75, 10, 10, 5], {
      local: ['juniper-salon'],
    }),
    cat('home', 'Home improvement', 700, [30, 20, 45, 5], [55, 15, 28, 2]),
  ],
  holdings: [
    {
      id: 'h-checking',
      label: 'Checking — Colossus Bank',
      type: 'cash',
      amount: 12000,
      ratings: {},
      political: null,
      companyId: 'colossus-bank',
      targetBucket: 'community-aligned',
    },
    {
      id: 'h-savings',
      label: 'Savings — First Prairie CU',
      type: 'cash',
      amount: 6000,
      ratings: {},
      political: null,
      companyId: 'first-prairie-cu',
    },
    {
      id: 'h-401k',
      label: 'Employer 401(k) — total-market index',
      type: 'fund',
      amount: 32000,
      ratings: { 'local-economy': -2, labor: -1, environment: -1 },
      political: null,
      targetBucket: 'broad-mixed',
    },
    {
      id: 'h-roth',
      label: 'Roth IRA — balanced fund',
      type: 'fund',
      amount: 18000,
      ratings: { 'local-economy': 0, labor: 0, environment: 0 },
      political: null,
    },
    {
      id: 'h-403b',
      label: 'Old 403(b) — unreviewed',
      type: 'fund',
      amount: 2000,
      ratings: {},
      political: null,
    },
    {
      id: 'h-megatech',
      label: 'MegaTech shares (brokerage)',
      type: 'equity',
      amount: 9000,
      ratings: { 'local-economy': -2, labor: -1, environment: -1, privacy: -2 },
      political: {
        leanScore: -1,
        confidence: 'low',
        sourceHint: 'Illustrative — verify at OpenSecrets / FEC / Goods Unite Us',
        provenance: 'user',
      },
      targetBucket: 'broad-mixed',
    },
    {
      id: 'h-cdfi',
      label: 'Community loan fund note',
      type: 'other',
      amount: 2000,
      sleeve: 'community',
      ratings: { 'local-economy': 2, labor: 1, environment: 1 },
      political: null,
    },
    {
      id: 'h-crypto',
      label: 'Crypto wallet',
      type: 'crypto',
      amount: 5000,
      ratings: {},
      political: null,
    },
  ],
  userCompanies: [],
  importedCompanies: [],
  companyOverrides: {},
  bucketDefaults: {
    local: {
      'local-economy': 2,
      labor: 1,
      environment: 1,
      'political-alignment': 0,
      'domestic-manufacturing': 1,
      privacy: 1,
      'animal-welfare': 0,
    },
    regional: {
      'local-economy': 0,
      labor: 0,
      environment: 0,
      'political-alignment': 0,
      'domestic-manufacturing': 0,
      privacy: 0,
      'animal-welfare': 0,
    },
    major: {
      'local-economy': -2,
      labor: -1,
      environment: -1,
      'political-alignment': 0,
      'domestic-manufacturing': -1,
      privacy: -1,
      'animal-welfare': 0,
    },
    unknown: {
      'local-economy': 0,
      labor: 0,
      environment: 0,
      'political-alignment': 0,
      'domestic-manufacturing': 0,
      privacy: 0,
      'animal-welfare': 0,
    },
  },
  gates: [
    { id: 'g1', label: 'Day 30', effortBudget: 8 },
    { id: 'g2', label: 'Day 60', effortBudget: 8 },
    { id: 'g3', label: 'Day 90', effortBudget: 8 },
  ],
  placements: {},
  dismissed: [],
  wizard: { step: 7, completed: true, targetsCustomized: true },
};
const total = state.categories.reduce((s, c) => s + c.monthlySpend, 0);
if (total !== 3800) throw new Error('Jordan total must be 3800, got ' + total);
const port = state.holdings.reduce((s, h) => s + h.amount, 0);
if (port !== 86000) throw new Error('portfolio must be 86000, got ' + port);
writeFileSync(
  new URL('../src/data/fixtures/persona-jordan.json', import.meta.url),
  JSON.stringify(state, null, 2) + '\n',
);
console.log('wrote Jordan: $' + total + '/mo, portfolio $' + port);
