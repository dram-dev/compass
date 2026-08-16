// Generates src/data/companies.sample.json. Run: node scripts/gen-sample-companies.mjs
import { writeFileSync } from 'node:fs';
import { SAMPLE_TICKER_MAP } from './seed/sample-tickers.mjs';

const FICT_HINT =
  'Illustrative fictional archetype — no real-world counterpart. Ratings and lean are placeholders to demonstrate the tool. For real companies, verify via OpenSecrets · FEC.gov · Goods Unite Us.';
const REAL_HINT =
  'Not rated in sample data (structure only: parent, sector, bucket). Verify PAC/employee giving at OpenSecrets org search, FEC.gov filings, or Goods Unite Us — then rate it yourself or import a community data pack.';

const L = { 'local-economy': 2, labor: 1, environment: 1 };
const M = { 'local-economy': -2, labor: -1, environment: -1 };
const R = { 'local-economy': 0, labor: 0, environment: 0 };

const fict = (id, name, sector, bucketDefault, lean, ratings, parentCompanyId) => ({
  id,
  name,
  ...(parentCompanyId ? { parentCompanyId } : {}),
  sector,
  bucketDefault,
  political: { leanScore: lean, confidence: 'low', sourceHint: FICT_HINT, provenance: 'sample' },
  ratings,
  ratingsProvenance: 'sample',
  fictional: true,
});
const real = (id, name, sector, bucketDefault, parentCompanyId) => ({
  id,
  name,
  ...(parentCompanyId ? { parentCompanyId } : {}),
  ...(SAMPLE_TICKER_MAP[id] ? { ticker: SAMPLE_TICKER_MAP[id] } : {}),
  sector,
  bucketDefault,
  political: { leanScore: null, confidence: 'low', sourceHint: REAL_HINT, provenance: 'sample' },
  ratings: {},
  ratingsProvenance: 'sample',
  fictional: false,
});

const companies = [
  // ---- fictional archetypes (fully rated; le/la/en equal bucket defaults for demo parity) ----
  fict('green-fields-coop', 'Green Fields Co-op', 'Grocery', 'local', 1, {
    ...L,
    'domestic-manufacturing': 1,
    privacy: 1,
    'animal-welfare': 1,
  }),
  fict('riverbend-farmers-market', 'Riverbend Farmers Market', 'Grocery', 'local', null, {
    ...L,
    environment: 2,
    'domestic-manufacturing': 2,
    privacy: 2,
    'animal-welfare': 1,
  }),
  fict(
    'nationalmart',
    'NationalMart',
    'Retail & grocery',
    'major',
    -1,
    { ...M, 'domestic-manufacturing': -1, privacy: -1, 'animal-welfare': 0 },
    'omnicorp-holdings',
  ),
  fict(
    'bigbox-home-center',
    'BigBox Home Center',
    'Home improvement',
    'major',
    -1,
    { ...M, 'domestic-manufacturing': -1, privacy: -1, 'animal-welfare': 0 },
    'omnicorp-holdings',
  ),
  fict('omnicorp-holdings', 'Omnicorp Holdings', 'Conglomerate (holding)', 'major', -1, {
    ...M,
    'domestic-manufacturing': -1,
    privacy: -1,
    'animal-welfare': 0,
  }),
  fict('first-prairie-cu', 'First Prairie Credit Union', 'Banking & insurance', 'local', 1, {
    ...L,
    'domestic-manufacturing': 0,
    privacy: 2,
    'animal-welfare': 0,
  }),
  fict('meadowlark-mutual', 'Meadowlark Insurance Mutual', 'Banking & insurance', 'regional', 0, {
    ...R,
    'domestic-manufacturing': 0,
    privacy: 1,
    'animal-welfare': 0,
  }),
  fict(
    'colossus-bank',
    'Colossus Bank',
    'Banking & insurance',
    'major',
    -2,
    { ...M, 'domestic-manufacturing': 0, privacy: -2, 'animal-welfare': 0 },
    'colossus-financial-group',
  ),
  fict('colossus-financial-group', 'Colossus Financial Group', 'Financial holding', 'major', -2, {
    ...M,
    'domestic-manufacturing': 0,
    privacy: -2,
    'animal-welfare': 0,
  }),
  fict(
    'streambox-media',
    'StreamBox Media',
    'Subscriptions & media',
    'major',
    -1,
    { ...M, 'domestic-manufacturing': 0, privacy: -2, 'animal-welfare': 0 },
    'meridian-entertainment',
  ),
  fict(
    'summit-streaming',
    'Summit Streaming',
    'Subscriptions & media',
    'major',
    1,
    { ...M, 'domestic-manufacturing': 0, privacy: -1, 'animal-welfare': 0 },
    'meridian-entertainment',
  ),
  fict('meridian-entertainment', 'Meridian Entertainment', 'Media conglomerate', 'major', -1, {
    ...M,
    'domestic-manufacturing': 0,
    privacy: -2,
    'animal-welfare': 0,
  }),
  fict('hearth-and-hardware', 'Hearth & Hardware', 'Home improvement', 'local', 0, {
    ...L,
    'domestic-manufacturing': 1,
    privacy: 1,
    'animal-welfare': 0,
  }),
  fict('prairie-petro-coop', 'Prairie Petro Co-op', 'Fuel & auto', 'regional', 0, {
    ...R,
    'domestic-manufacturing': 1,
    privacy: 0,
    'animal-welfare': 0,
  }),
  fict('juniper-salon', 'Juniper Salon', 'Personal care & services', 'local', null, {
    ...L,
    'domestic-manufacturing': 0,
    privacy: 1,
    'animal-welfare': 1,
  }),
  fict('copper-kettle-cafe', 'Copper Kettle Café', 'Dining & coffee', 'local', 1, {
    ...L,
    'domestic-manufacturing': 0,
    privacy: 1,
    'animal-welfare': 1,
  }),
  fict(
    'burgerbarn',
    'BurgerBarn',
    'Dining & coffee',
    'major',
    -1,
    { ...M, 'domestic-manufacturing': 0, privacy: -1, 'animal-welfare': -1 },
    'grillco-international',
  ),
  fict('grillco-international', 'Grillco International', 'Restaurant holding', 'major', -1, {
    ...M,
    'domestic-manufacturing': 0,
    privacy: -1,
    'animal-welfare': -1,
  }),

  // ---- real US brands: structure only (public facts), unrated, lean null ----
  real('whole-foods', 'Whole Foods Market', 'Grocery', 'major', 'amazon'),
  real('trader-joes', "Trader Joe's", 'Grocery', 'major', 'aldi-nord'),
  real('kroger', 'Kroger', 'Grocery', 'major'),
  real('safeway', 'Safeway', 'Grocery', 'major', 'albertsons'),
  real('walmart', 'Walmart', 'Retail & grocery', 'major'),
  real('target', 'Target', 'Retail & grocery', 'major'),
  real('costco', 'Costco', 'Retail & grocery', 'major'),
  real('starbucks', 'Starbucks', 'Dining & coffee', 'major'),
  real('mcdonalds', "McDonald's", 'Dining & coffee', 'major'),
  real('chipotle', 'Chipotle', 'Dining & coffee', 'major'),
  real('dunkin', "Dunkin'", 'Dining & coffee', 'major', 'inspire-brands'),
  real('taco-bell', 'Taco Bell', 'Dining & coffee', 'major', 'yum-brands'),
  real('shell', 'Shell', 'Fuel & auto', 'major', 'shell-plc'),
  real('exxonmobil', 'ExxonMobil', 'Fuel & auto', 'major'),
  real('chevron', 'Chevron', 'Fuel & auto', 'major'),
  real('amazon', 'Amazon', 'Retail & household', 'major'),
  real('home-depot', 'The Home Depot', 'Home improvement', 'major'),
  real('lowes', "Lowe's", 'Home improvement', 'major'),
  real('walgreens', 'Walgreens', 'Retail & household', 'major', 'walgreens-boots-alliance'),
  real('cvs-pharmacy', 'CVS Pharmacy', 'Retail & household', 'major', 'cvs-health'),
  real('netflix', 'Netflix', 'Subscriptions & media', 'major'),
  real('spotify', 'Spotify', 'Subscriptions & media', 'major'),
  real('disney-plus', 'Disney+', 'Subscriptions & media', 'major', 'walt-disney-company'),
  real('hulu', 'Hulu', 'Subscriptions & media', 'major', 'walt-disney-company'),
  real('verizon', 'Verizon', 'Subscriptions & media', 'major'),
  real('chase', 'Chase', 'Banking & insurance', 'major', 'jpmorgan-chase'),
  real('bank-of-america', 'Bank of America', 'Banking & insurance', 'major'),
  real('wells-fargo', 'Wells Fargo', 'Banking & insurance', 'major'),
  real('capital-one', 'Capital One', 'Banking & insurance', 'major'),
  real('geico', 'GEICO', 'Banking & insurance', 'major', 'berkshire-hathaway'),
  real('planet-fitness', 'Planet Fitness', 'Personal care & services', 'major'),
  real('ace-hardware', 'Ace Hardware', 'Home improvement', 'regional'),
  // parents referenced above
  real('aldi-nord', 'Aldi Nord', 'Grocery (holding)', 'major'),
  real('albertsons', 'Albertsons Companies', 'Grocery (holding)', 'major'),
  real('inspire-brands', 'Inspire Brands', 'Restaurant holding', 'major'),
  real('yum-brands', 'Yum! Brands', 'Restaurant holding', 'major'),
  real('shell-plc', 'Shell plc', 'Energy (holding)', 'major'),
  real('walgreens-boots-alliance', 'Walgreens Boots Alliance', 'Retail (holding)', 'major'),
  real('cvs-health', 'CVS Health', 'Health & retail (holding)', 'major'),
  real('walt-disney-company', 'The Walt Disney Company', 'Media conglomerate', 'major'),
  real('jpmorgan-chase', 'JPMorgan Chase & Co.', 'Financial holding', 'major'),
  real('berkshire-hathaway', 'Berkshire Hathaway', 'Conglomerate (holding)', 'major'),
];

// integrity checks
const ids = new Set();
for (const c of companies) {
  if (ids.has(c.id)) throw new Error('dup id ' + c.id);
  ids.add(c.id);
}
for (const c of companies) {
  if (c.parentCompanyId && !ids.has(c.parentCompanyId))
    throw new Error('missing parent ' + c.parentCompanyId);
  if (!c.fictional && c.political.leanScore !== null)
    throw new Error('real brand with lean: ' + c.id);
  if (!c.fictional && Object.keys(c.ratings).length)
    throw new Error('real brand with ratings: ' + c.id);
}
writeFileSync(
  new URL('../src/data/companies.sample.json', import.meta.url),
  JSON.stringify(companies, null, 2) + '\n',
);
console.log(
  'wrote',
  companies.length,
  'companies;',
  companies.filter((c) => c.fictional).length,
  'fictional',
);
