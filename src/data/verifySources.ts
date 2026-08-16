/** Real, external verification sources (spec §10.2). Opened in a new tab only on user click. */
export const VERIFY_SOURCES = [
  {
    id: 'opensecrets',
    label: 'OpenSecrets',
    url: 'https://www.opensecrets.org/orgs/all-profiles',
    blurb: 'Organization profiles: PAC and employee contributions, lobbying, by cycle.',
  },
  {
    id: 'fec',
    label: 'FEC.gov',
    url: 'https://www.fec.gov/data/',
    blurb: 'Primary-source federal campaign finance filings.',
  },
  {
    id: 'goodsuniteus',
    label: 'Goods Unite Us',
    url: 'https://www.goodsuniteus.com/',
    blurb: 'Brand and parent-company political-donation summaries.',
  },
] as const;

export type VerifySourceId = (typeof VERIFY_SOURCES)[number]['id'];
