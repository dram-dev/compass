# Statement CSV import

`src/lib/csv.ts` + `src/lib/transactions.ts` + `src/components/CsvImportPanel.tsx`.
Reachable from **Wizard step 4** ("Import CSV") and **Data sources → Import a statement CSV**.

The importer exists to remove typing, not to make judgements it cannot support. It derives dollars and
categories automatically, recognises well-known chains, and then **asks** about everything it could not
identify. Nothing is applied without a preview, and nothing leaves the device.

## Privacy

The file is read with `File.text()` in the page, parsed in memory, and dropped as soon as the totals
are computed. There is no upload, no server, and no analytics; only the monthly figures you press
**Apply** on are written to `localStorage`. Row-level transactions are never stored — not in the plan
state, not in the JSON export.

## Pipeline

| Step | What happens | Where |
|---|---|---|
| 1. Parse | Delimiter sniffing (`,` `;` tab `|`), RFC 4180 quoting, BOM/CRLF, title/account preamble lines skipped and the real header found | `csv.ts` |
| 2. Map columns | Header patterns for date / description / amount / debit / credit / category; "Transaction Date" wins over "Post Date". Falls back to sniffing the data: the column that parses as dates, the numeric column with the most distinct non-integer values, the longest text column | `detectColumns` |
| 3. Read values | `$1,234.56`, `(12.34)`, `1.234,56` (EU), trailing `-`; ISO / `M/D/Y` / `D.M.Y` / `15 Feb 2026` dates, with `day > 12` disambiguating | `parseAmount`, `parseDate` |
| 4. Sign convention | Detected per file: purchases are negative in Chase/Amex exports and positive in others, so the **dominant sign becomes spending** and the other side is treated as credits. Separate Debit/Credit columns are used directly when present | `toTransactions` |
| 5. Exclude non-spending | Card/loan payments, transfers (Zelle, Venmo), ATM/cash, income and payroll, fees and interest, rent, utilities and taxes — judged from the **descriptor only**, with counts and dollars reported back | `EXCLUDE_RULES` |
| 6. Normalise the descriptor | Strip processor prefixes (`SQ *`, `TST*`, `PAYPAL *`), store numbers, embedded dates, phone numbers, order/reference ids, trailing state codes and legal suffixes | `normalizeDescriptor` |
| 7. Match the merchant | Brand rules first (they carry a default bucket and category), then an exact/prefix match against companies already in the app (sample, imported pack, user). Grouping is by **brand** so `AMZN Mktp US*2H45R9OL3` and `AMZN Mktp US*1K92LM4Q1` are one merchant | `matchMerchant` |
| 8. Categorise | Brand rule → bank's own category column → descriptor keywords → `retail` | `categoryFor` |
| 9. Scale to a month | Spending rows' date span ÷ 30.44, rounded to the nearest half month, never below 1. Editable in the UI, because a statement's coverage is a judgement call | `monthsCovered` |
| 10. Review | Unrecognised merchants listed largest first with a category select and Local/Regional/Major/? buttons, plus skip; then a per-category preview of monthly dollars and the bucket split | `CsvImportPanel` |
| 11. Apply | `applyTransactionImport` sets `monthlySpend` and the `current` allocation (midpoints ±4) for **only** the categories in the import, names matched companies inside their bucket, creates `user` companies for merchants you classified, and re-derives targets if you had not customised them | `useCompassStore` |

## What it deliberately does not do

- **It never guesses local vs. major.** A merchant that matches no brand rule and no existing company
  stays **Unknown** and is offered for classification. Unknown dollars flow into the Unknown bucket and
  are reported as unassessed — never hidden, never redistributed (§10).
- **It never infers a political lean or a rating from a merchant name.** Merchants you classify become
  `user` companies with no ratings; matched chains reuse the shipped sample record with its existing
  provenance, which stays visible and overridable.
- **It does not consult the bank's category column for exclusions.** Chase files a Verizon phone bill
  under "Bills & Utilities"; excluding on that basis would silently drop a subscription the app should
  score. The column is only a categorisation hint.
- **It stores no transactions.** Re-importing is cheap; keeping a copy of someone's statement is not
  the app's business.

## Supported shapes (tested)

`src/lib/fixtures/statements.ts` holds redacted-shape fixtures exercised by `transactions.test.ts`:

- **Chase credit card** — negative purchases, own Category column, Transaction/Post date pair.
- **Capital One** — separate Debit/Credit columns, ISO dates, `Card No.` column.
- **European bank** — semicolons, `D.M.Y` dates, comma decimals, account preamble.
- **Bare export** — `date,merchant,amount` with positive amounts and no conventions.

Anything with a description column and either an amount or debit/credit columns should work; if the
importer cannot find those, it says so and applies nothing.
