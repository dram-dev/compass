# Compass community data-pack schema (v1)

A data pack is a JSON file that adds or overrides company records — for third-party or self-researched
datasets. Import it from **Data → Community data packs**. Every imported record is stamped
`provenance: 'imported'` with the pack's `source` string, shown on its badge everywhere in the app.
Your own edits (provenance `user`) always win over imported values; imported values win over the
shipped sample set.

Compass never fetches packs from the network — you download the file yourself and import it locally.

## File shape

```json
{
  "schema": "compass-data-pack",
  "version": 1,
  "source": "My Town Co-op research group, 2026-05",
  "sourceUrl": "https://example.org/methodology",
  "notes": "Optional free text shown in the import summary.",
  "principles": [
    { "id": "local-economy", "label": "Local economy" }
  ],
  "companies": [
    {
      "id": "example-grocer",
      "name": "Example Grocer",
      "parentCompanyId": "example-holdings",
      "sector": "Grocery",
      "bucketDefault": "major",
      "political": {
        "leanScore": null,
        "confidence": "low",
        "sourceHint": "FEC filings 2023–24 via OpenSecrets org search; verify before acting."
      },
      "ratings": { "local-economy": -1, "labor": 0, "environment": 1 }
    }
  ]
}
```

## Fields

| Field | Required | Rules |
|---|---|---|
| `schema` | yes | Must be the string `compass-data-pack`. |
| `version` | yes | Integer; this build reads `1`. |
| `source` | yes | Non-empty string; shown on every badge as `Imported · <source>`. |
| `sourceUrl` | no | URL to methodology; shown in the import summary. |
| `notes` | no | Free text. |
| `principles` | no | Declares any non-library principle ids used in `ratings`, so the app can offer them in the wizard. `id` (kebab-case) and `label` required. |
| `companies[]` | yes | 1–5000 records. |
| `companies[].id` | yes | Kebab-case string, unique within the pack. Colliding with a sample id **overrides** that sample record. |
| `companies[].name` | yes | Non-empty. |
| `companies[].parentCompanyId` | no | Must resolve to a record in the pack or in the sample set. |
| `companies[].sector` | no | Free text; default `Unspecified`. |
| `companies[].bucketDefault` | yes | One of `local`, `regional`, `major`, `unknown`. |
| `companies[].political.leanScore` | no | `null` or a number in `[-2, 2]`. Sign convention: negative = conservative/Republican-leaning giving, positive = progressive/Democratic-leaning giving (see ASSUMPTIONS #17). Missing → `null` (Unknown). |
| `companies[].political.confidence` | no | `low` (default), `med`, or `high`. |
| `companies[].political.sourceHint` | no | How to verify; default points to OpenSecrets / FEC / Goods Unite Us. |
| `companies[].ratings` | no | Map of principle id → number in `[-2, 2]`. Missing principles fall back to bucket defaults at scoring time. |

## Rejections

The importer rejects the whole file (nothing is partially loaded) with a specific message when:
- the JSON is malformed or the top level isn't an object;
- `schema`/`version` don't match, or `source` is missing;
- any company lacks `id`, `name`, or a valid `bucketDefault`;
- any `leanScore` or rating is outside `[-2, 2]`;
- `parentCompanyId` doesn't resolve;
- ids repeat within the pack.

## Ethics reminder

Do not publish packs that assert specific dollar figures or donation amounts as facts inside
`sourceHint`; keep leans coarse, cite the primary source, and date your research. Compass shows a
verification link next to every imported record regardless.
