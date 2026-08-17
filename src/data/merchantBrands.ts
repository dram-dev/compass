/**
 * Card-descriptor knowledge used by the CSV importer (`lib/transactions.ts`).
 *
 * Statement descriptors are abbreviated, prefixed by payment processors and suffixed with store and
 * phone numbers ("TST* JOES PIZZA 4155551212", "SQ *BLUE BOTTLE", "WHOLEFDS MKT 10255"). This table
 * maps the *recognisable stem* of well-known chains to a brand, its default bucket, and the spend
 * category it usually belongs to.
 *
 * Deliberate limits (§10 data integrity):
 *  - `sampleId` points at a shipped sample company only where a real brand already exists in
 *    `companies.sample.json`; the importer then reuses that record (with its provenance and ratings)
 *    instead of inventing one.
 *  - Bucket is a *default*, always editable in the review step. Nothing here asserts a rating or a
 *    political lean, and no lean is ever inferred from a merchant name.
 *  - Anything not listed stays **Unknown** and is offered to the user to classify — never guessed.
 */
import type { BucketId } from '@/engine/types';

export interface BrandRule {
  /** Uppercase stems; a descriptor matches when its normalized form starts with or contains one. */
  stems: string[];
  brand: string;
  bucket: BucketId;
  category: string; // default category id
  sampleId?: string; // id in companies.sample.json when the brand ships as a sample company
}

export const BRAND_RULES: BrandRule[] = [
  // groceries
  {
    stems: ['WHOLEFDS', 'WHOLE FOODS', 'WHOLE FDS'],
    brand: 'Whole Foods Market',
    bucket: 'major',
    category: 'groceries',
    sampleId: 'whole-foods',
  },
  {
    stems: ['TRADER JOE', 'TRADER JOES'],
    brand: "Trader Joe's",
    bucket: 'major',
    category: 'groceries',
    sampleId: 'trader-joes',
  },
  {
    stems: ['KROGER', 'FRED MEYER', 'RALPHS', 'FRYS FOOD', 'KING SOOPERS', 'HARRIS TEETER'],
    brand: 'Kroger',
    bucket: 'major',
    category: 'groceries',
    sampleId: 'kroger',
  },
  {
    stems: ['SAFEWAY', 'ALBERTSONS', 'VONS', 'JEWEL OSCO', 'ACME MARKETS'],
    brand: 'Safeway',
    bucket: 'major',
    category: 'groceries',
    sampleId: 'safeway',
  },
  { stems: ['ALDI'], brand: 'Aldi', bucket: 'major', category: 'groceries' },
  { stems: ['PUBLIX'], brand: 'Publix', bucket: 'major', category: 'groceries' },
  { stems: ['WEGMANS'], brand: 'Wegmans', bucket: 'regional', category: 'groceries' },
  { stems: ['HEB', 'H E B'], brand: 'H-E-B', bucket: 'regional', category: 'groceries' },
  { stems: ['SPROUTS'], brand: 'Sprouts Farmers Market', bucket: 'major', category: 'groceries' },
  { stems: ['SAMS CLUB', 'SAMSCLUB'], brand: "Sam's Club", bucket: 'major', category: 'groceries' },
  {
    stems: ['COSTCO'],
    brand: 'Costco',
    bucket: 'major',
    category: 'groceries',
    sampleId: 'costco',
  },
  {
    stems: ['WALMART', 'WAL MART', 'WM SUPERCENTER', 'WM SUPERC'],
    brand: 'Walmart',
    bucket: 'major',
    category: 'groceries',
    sampleId: 'walmart',
  },
  {
    stems: ['TARGET', 'TGT'],
    brand: 'Target',
    bucket: 'major',
    category: 'retail',
    sampleId: 'target',
  },
  // dining & coffee
  {
    stems: ['STARBUCKS', 'SBUX'],
    brand: 'Starbucks',
    bucket: 'major',
    category: 'dining',
    sampleId: 'starbucks',
  },
  {
    stems: ['DUNKIN', 'DUNKN'],
    brand: "Dunkin'",
    bucket: 'major',
    category: 'dining',
    sampleId: 'dunkin',
  },
  {
    stems: ['MCDONALD', 'MCDONALDS'],
    brand: "McDonald's",
    bucket: 'major',
    category: 'dining',
    sampleId: 'mcdonalds',
  },
  {
    stems: ['CHIPOTLE'],
    brand: 'Chipotle',
    bucket: 'major',
    category: 'dining',
    sampleId: 'chipotle',
  },
  {
    stems: ['TACO BELL', 'TACOBELL'],
    brand: 'Taco Bell',
    bucket: 'major',
    category: 'dining',
    sampleId: 'taco-bell',
  },
  { stems: ['PANERA'], brand: 'Panera Bread', bucket: 'major', category: 'dining' },
  { stems: ['SUBWAY'], brand: 'Subway', bucket: 'major', category: 'dining' },
  {
    stems: ['CHICK FIL A', 'CHICKFILA', 'CHICK-FIL-A'],
    brand: 'Chick-fil-A',
    bucket: 'major',
    category: 'dining',
  },
  { stems: ['WENDY'], brand: "Wendy's", bucket: 'major', category: 'dining' },
  { stems: ['BURGER KING'], brand: 'Burger King', bucket: 'major', category: 'dining' },
  {
    stems: ['DOMINOS', 'PAPA JOHN', 'PIZZA HUT'],
    brand: 'Pizza chain',
    bucket: 'major',
    category: 'dining',
  },
  {
    stems: ['PEETS', 'PEET S COFFEE'],
    brand: "Peet's Coffee",
    bucket: 'major',
    category: 'dining',
  },
  {
    stems: ['DOORDASH', 'UBER EATS', 'UBEREATS', 'GRUBHUB', 'POSTMATES'],
    brand: 'Delivery platform',
    bucket: 'major',
    category: 'dining',
  },
  // fuel & auto
  {
    stems: ['SHELL OIL', 'SHELL SERVICE', 'SHELL '],
    brand: 'Shell',
    bucket: 'major',
    category: 'fuel',
    sampleId: 'shell',
  },
  {
    stems: ['EXXON', 'EXXONMOBIL', 'MOBIL'],
    brand: 'ExxonMobil',
    bucket: 'major',
    category: 'fuel',
    sampleId: 'exxonmobil',
  },
  { stems: ['CHEVRON'], brand: 'Chevron', bucket: 'major', category: 'fuel', sampleId: 'chevron' },
  { stems: ['BP ', 'BP#', 'ARCO'], brand: 'BP', bucket: 'major', category: 'fuel' },
  {
    stems: [
      'SUNOCO',
      'CITGO',
      'MARATHON PETRO',
      'SPEEDWAY',
      'CIRCLE K',
      'WAWA',
      'QUIKTRIP',
      'SHEETZ',
      'RACETRAC',
      'PILOT TRAVEL',
      'LOVES TRAVEL',
    ],
    brand: 'Fuel station chain',
    bucket: 'major',
    category: 'fuel',
  },
  {
    stems: [
      'JIFFY LUBE',
      'VALVOLINE',
      'DISCOUNT TIRE',
      'FIRESTONE',
      'AUTOZONE',
      'OREILLY',
      'ADVANCE AUTO',
      'NAPA AUTO',
    ],
    brand: 'Auto-service chain',
    bucket: 'major',
    category: 'fuel',
  },
  { stems: ['UBER', 'LYFT'], brand: 'Rideshare platform', bucket: 'major', category: 'fuel' },
  // retail & household
  {
    stems: ['AMZN', 'AMAZON'],
    brand: 'Amazon',
    bucket: 'major',
    category: 'retail',
    sampleId: 'amazon',
  },
  {
    stems: ['HOME DEPOT', 'THD', 'HOMEDEPOT'],
    brand: 'The Home Depot',
    bucket: 'major',
    category: 'retail',
    sampleId: 'home-depot',
  },
  {
    stems: ['LOWES', 'LOWE S'],
    brand: "Lowe's",
    bucket: 'major',
    category: 'retail',
    sampleId: 'lowes',
  },
  {
    stems: ['ACE HARDWARE', 'ACE HDWE'],
    brand: 'Ace Hardware',
    bucket: 'regional',
    category: 'retail',
    sampleId: 'ace-hardware',
  },
  { stems: ['BEST BUY', 'BESTBUY'], brand: 'Best Buy', bucket: 'major', category: 'retail' },
  { stems: ['IKEA'], brand: 'IKEA', bucket: 'major', category: 'retail' },
  {
    stems: ['TJ MAXX', 'TJMAXX', 'MARSHALLS', 'HOMEGOODS', 'ROSS STORES', 'ROSS DRESS'],
    brand: 'Off-price retail chain',
    bucket: 'major',
    category: 'retail',
  },
  { stems: ['ETSY'], brand: 'Etsy', bucket: 'major', category: 'retail' },
  { stems: ['EBAY'], brand: 'eBay', bucket: 'major', category: 'retail' },
  {
    stems: ['WALGREEN', 'WALGREENS'],
    brand: 'Walgreens',
    bucket: 'major',
    category: 'personal-care',
    sampleId: 'walgreens',
  },
  {
    stems: ['CVS', 'CVS PHARMACY'],
    brand: 'CVS Pharmacy',
    bucket: 'major',
    category: 'personal-care',
    sampleId: 'cvs-pharmacy',
  },
  // subscriptions & media
  {
    stems: ['NETFLIX'],
    brand: 'Netflix',
    bucket: 'major',
    category: 'subscriptions',
    sampleId: 'netflix',
  },
  {
    stems: ['SPOTIFY'],
    brand: 'Spotify',
    bucket: 'major',
    category: 'subscriptions',
    sampleId: 'spotify',
  },
  {
    stems: ['DISNEY PLUS', 'DISNEYPLUS', 'DISNEY+'],
    brand: 'Disney+',
    bucket: 'major',
    category: 'subscriptions',
    sampleId: 'disney-plus',
  },
  { stems: ['HULU'], brand: 'Hulu', bucket: 'major', category: 'subscriptions', sampleId: 'hulu' },
  {
    stems: ['VERIZON', 'VZWRLSS'],
    brand: 'Verizon',
    bucket: 'major',
    category: 'subscriptions',
    sampleId: 'verizon',
  },
  {
    stems: ['AT T', 'ATT ', 'ATTWIRELESS'],
    brand: 'AT&T',
    bucket: 'major',
    category: 'subscriptions',
  },
  { stems: ['T MOBILE', 'TMOBILE'], brand: 'T-Mobile', bucket: 'major', category: 'subscriptions' },
  { stems: ['COMCAST', 'XFINITY'], brand: 'Comcast', bucket: 'major', category: 'subscriptions' },
  {
    stems: ['APPLE COM BILL', 'APPLE COM', 'ITUNES'],
    brand: 'Apple',
    bucket: 'major',
    category: 'subscriptions',
  },
  {
    stems: ['GOOGLE ', 'YOUTUBEPREMIUM', 'YOUTUBE'],
    brand: 'Google',
    bucket: 'major',
    category: 'subscriptions',
  },
  {
    stems: ['MAX ', 'HBO MAX', 'PARAMOUNT', 'PEACOCK', 'AUDIBLE', 'PATREON', 'SUBSTACK'],
    brand: 'Streaming / media subscription',
    bucket: 'major',
    category: 'subscriptions',
  },
  // banking & insurance
  { stems: ['GEICO'], brand: 'GEICO', bucket: 'major', category: 'banking', sampleId: 'geico' },
  {
    stems: ['STATE FARM', 'PROGRESSIVE', 'ALLSTATE', 'LIBERTY MUTUAL', 'USAA'],
    brand: 'Insurance carrier',
    bucket: 'major',
    category: 'banking',
  },
  {
    stems: ['CHASE', 'JPMORGAN'],
    brand: 'Chase',
    bucket: 'major',
    category: 'banking',
    sampleId: 'chase',
  },
  {
    stems: ['BANK OF AMERICA', 'BKOFAMERICA', 'BOFA'],
    brand: 'Bank of America',
    bucket: 'major',
    category: 'banking',
    sampleId: 'bank-of-america',
  },
  {
    stems: ['WELLS FARGO', 'WF '],
    brand: 'Wells Fargo',
    bucket: 'major',
    category: 'banking',
    sampleId: 'wells-fargo',
  },
  {
    stems: ['CAPITAL ONE', 'CAPITALONE'],
    brand: 'Capital One',
    bucket: 'major',
    category: 'banking',
    sampleId: 'capital-one',
  },
  // personal care & services
  {
    stems: ['PLANET FIT', 'PLANETFITNESS'],
    brand: 'Planet Fitness',
    bucket: 'major',
    category: 'personal-care',
    sampleId: 'planet-fitness',
  },
  {
    stems: ['LA FITNESS', 'ANYTIME FITNESS', 'EQUINOX', 'ORANGETHEORY', 'CLASSPASS', 'PELOTON'],
    brand: 'Fitness chain',
    bucket: 'major',
    category: 'personal-care',
  },
  {
    stems: ['GREAT CLIPS', 'SPORT CLIPS', 'SUPERCUTS'],
    brand: 'Haircut chain',
    bucket: 'major',
    category: 'personal-care',
  },
  {
    stems: ['ULTA', 'SEPHORA'],
    brand: 'Beauty retail chain',
    bucket: 'major',
    category: 'personal-care',
  },
];

/** Processor prefixes and noise stripped before matching (order matters — longest first). */
export const DESCRIPTOR_NOISE: RegExp[] = [
  /^(SQ|TST|SP|PY|IN|POS|PP|EB|WPY|CKE)\s*\*+\s*/i, // Square, Toast, Shopify, PayPal-family
  /^PAYPAL\s*\*+\s*/i,
  /^(VISA|MASTERCARD|MC|AMEX)\s+(DDA|PURCHASE|DEBIT|CREDIT)\s+/i,
  /^(PURCHASE|PAYMENT|POS|DEBIT|CREDIT|CARD)\s+(AUTHORIZED\s+ON\s+)?/i,
  /^(RECURRING|ONLINE|MOBILE|CONTACTLESS)\s+(PAYMENT|PURCHASE|DEBIT)\s*/i,
  /^WWW[. ]/i,
  /\s+#?\d{3,}\b/g, // store numbers
  /\s+\d{2}\/\d{2}(\/\d{2,4})?\b/g, // embedded dates
  /\s+\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/g, // phone numbers
  /\s+[A-Z]{2}\s*$/, // trailing state code
  /\s+(COM|NET|ORG|CO UK|CA)\s*$/i,
  /\s+(LLC|L L C|INC|CORP|CO|LTD|LP|LLP)\s*$/i,
];

/** Rows that are not discretionary spending at all — excluded by default, with counts shown. */
export const EXCLUDE_RULES: { id: string; label: string; re: RegExp }[] = [
  {
    id: 'card-payment',
    label: 'Card / loan payments',
    re: /\b(PAYMENT\s+THANK\s*YOU|AUTOPAY|ONLINE\s+PAYMENT|PMT\s+RECEIVED|CREDIT\s+CARD\s+PAYMENT|LOAN\s+PMT|MORTGAGE)\b/i,
  },
  {
    id: 'transfer',
    label: 'Transfers',
    re: /\b(TRANSFER|XFER|ZELLE|VENMO|CASH\s*APP|WIRE|ACH\s+(CREDIT|DEBIT)|INTERNAL)\b/i,
  },
  { id: 'atm-cash', label: 'ATM / cash', re: /\b(ATM|CASH\s+WITHDRAWAL|CASH\s+ADVANCE)\b/i },
  {
    id: 'income',
    label: 'Income / payroll',
    re: /\b(PAYROLL|DIRECT\s*DEP|DEPOSIT|SALARY|IRS\s+TREAS|REFUND|INTEREST\s+PAID|DIVIDEND)\b/i,
  },
  {
    id: 'fees',
    label: 'Fees & interest',
    re: /\b(ANNUAL\s+(MEMBERSHIP\s+)?FEE|MEMBERSHIP\s+FEE|LATE\s+FEE|OVERDRAFT|INTEREST\s+CHARGE|FINANCE\s+CHARGE|SERVICE\s+CHARGE|FOREIGN\s+TRANS(ACTION)?\s+FEE)\b/i,
  },
  {
    id: 'housing',
    label: 'Rent & housing',
    re: /\b(RENT|LANDLORD|PROPERTY\s+MGMT|HOA|LEASING)\b/i,
  },
  {
    id: 'utilities',
    label: 'Utilities & taxes',
    re: /\b(ELECTRIC|WATER\s+DEPT|UTILITY|UTILITIES|GAS\s+COMPANY|SEWER|CITY\s+OF|COUNTY\s+OF|DMV|TAX)\b/i,
  },
];

/** Category fallbacks for descriptors no brand rule matched (keyword → category id). */
export const CATEGORY_KEYWORDS: { category: string; words: string[] }[] = [
  {
    category: 'groceries',
    words: [
      'MARKET',
      'GROCER',
      'GROCERY',
      'FOODS',
      'FOOD MART',
      'CO OP',
      'COOP',
      'PRODUCE',
      'BUTCHER',
      'FARM',
      'CREAMERY',
      'BODEGA',
    ],
  },
  {
    category: 'dining',
    words: [
      'COFFEE',
      'CAFE',
      'ESPRESSO',
      'ROASTER',
      'BAKERY',
      'PIZZA',
      'PIZZERIA',
      'RESTAURANT',
      'GRILL',
      'KITCHEN',
      'TAQUERIA',
      'TACO',
      'SUSHI',
      'RAMEN',
      'THAI',
      'BBQ',
      'DINER',
      'BISTRO',
      'BREWING',
      'BREWERY',
      'TAPROOM',
      'BAR ',
      'PUB',
      'CANTINA',
      'DELI',
      'JUICE',
      'SMOOTHIE',
      'CATERING',
    ],
  },
  {
    category: 'fuel',
    words: [
      'FUEL',
      'GAS ',
      'GASOLINE',
      'PETRO',
      'SERVICE STATION',
      'AUTO',
      'TIRE',
      'LUBE',
      'CAR WASH',
      'PARKING',
      'GARAGE',
      'TRANSIT',
      'METRO',
      'TOLL',
    ],
  },
  {
    category: 'subscriptions',
    words: [
      'WIRELESS',
      'MOBILE',
      'INTERNET',
      'CABLE',
      'BROADBAND',
      'SUBSCRIPTION',
      'STREAMING',
      'SOFTWARE',
      'CLOUD',
      'DOMAIN',
      'HOSTING',
    ],
  },
  {
    category: 'banking',
    words: ['INSURANCE', 'ASSURANCE', 'BANK', 'CREDIT UNION', 'BROKERAGE', 'FINANCIAL'],
  },
  {
    category: 'personal-care',
    words: [
      'PHARMACY',
      'DRUG',
      'SALON',
      'BARBER',
      'SPA',
      'NAILS',
      'GYM',
      'FITNESS',
      'YOGA',
      'PILATES',
      'CLEANERS',
      'LAUNDRY',
      'DENTAL',
      'DENTIST',
      'CLINIC',
      'MEDICAL',
      'OPTOMETR',
      'VETERINAR',
      'VET ',
      'CHILDCARE',
      'DAYCARE',
    ],
  },
];

/** Everything else lands here. */
export const FALLBACK_CATEGORY = 'retail';
