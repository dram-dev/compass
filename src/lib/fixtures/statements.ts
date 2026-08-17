/** Realistic export shapes from common US card/bank downloads, for the importer tests. */

/** Chase credit card: purchases are NEGATIVE, has its own Category column, Post Date second. */
export const CHASE = `Transaction Date,Post Date,Description,Category,Type,Amount,Memo
02/28/2026,03/01/2026,WHOLEFDS MKT 10255,Groceries,Sale,-84.19,
02/27/2026,02/28/2026,SQ *BLUE BOTTLE COFFEE,Food & Drink,Sale,-6.75,
02/26/2026,02/27/2026,STARBUCKS STORE 08213,Food & Drink,Sale,-5.45,
02/25/2026,02/26/2026,SHELL OIL 57442136703,Gas,Sale,-52.10,
02/24/2026,02/25/2026,AMZN Mktp US*2H45R9OL3,Shopping,Sale,-31.99,
02/20/2026,02/21/2026,TST* JOES PIZZA 4155551212,Food & Drink,Sale,-28.50,
02/18/2026,02/19/2026,NETFLIX.COM,Entertainment,Sale,-15.49,
02/15/2026,02/16/2026,Payment Thank You - Web,,Payment,1250.00,
02/14/2026,02/15/2026,TRADER JOE S #182,Groceries,Sale,-62.44,
02/10/2026,02/11/2026,RIVERBEND FARMERS MARKET,Groceries,Sale,-40.00,
01/30/2026,01/31/2026,WHOLEFDS MKT 10255,Groceries,Sale,-91.02,
01/28/2026,01/29/2026,GREEN FIELDS COOP,Groceries,Sale,-55.31,
01/22/2026,01/23/2026,HOME DEPOT #6142,Home,Sale,-127.83,
01/19/2026,01/20/2026,JUNIPER SALON,Personal,Sale,-65.00,
01/15/2026,01/16/2026,AMZN Mktp US*1K92LM4Q1,Shopping,Sale,-18.47,
01/12/2026,01/13/2026,SQ *COPPER KETTLE CAFE,Food & Drink,Sale,-11.25,
01/05/2026,01/06/2026,VZWRLSS*APOCC VISB,Bills & Utilities,Sale,-90.00,
12/30/2025,12/31/2025,COSTCO WHSE #0442,Groceries,Sale,-210.55,
12/22/2025,12/23/2025,CHIPOTLE 1834,Food & Drink,Sale,-14.80,
12/15/2025,12/16/2025,ANNUAL MEMBERSHIP FEE,Fees,Fee,-95.00,`;

/** Capital One: separate Debit/Credit columns, ISO dates, "Card No." column. */
export const CAPITAL_ONE = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-02-27,2026-02-28,1234,KROGER #0455,Grocery,72.18,
2026-02-24,2026-02-25,1234,SBUX STORE 44012,Dining,4.95,
2026-02-20,2026-02-21,1234,CHEVRON 00201456,Gas/Automotive,44.00,
2026-02-14,2026-02-15,1234,CAPITAL ONE AUTOPAY PYMT,Payment/Credit,,600.00
2026-02-11,2026-02-12,1234,MERCHANDISE RETURN WALMART,Merchandise,,23.10
2026-02-09,2026-02-10,1234,WM SUPERCENTER #2201,Merchandise,118.32,
2026-01-30,2026-01-31,1234,PLANET FIT CLUB FEES,Health,24.99,
2026-01-25,2026-01-26,1234,CVS/PHARMACY #04412,Health,32.40,
2026-01-18,2026-01-19,1234,LOWES #01783,Home,88.10,
2026-01-11,2026-01-12,1234,SPOTIFY USA,Entertainment,11.99,`;

/** European-style bank export: semicolons, D.M.Y dates, comma decimals, preamble lines. */
export const EU_BANK = `Account statement
IBAN;DE02120300000000202051
;;;;
Datum;Beschreibung;Betrag;Saldo
28.02.2026;ALDI SUED SAGT DANKE;-43,17;1.204,55
26.02.2026;DM DROGERIEMARKT;-18,90;1.247,72
24.02.2026;IKEA DEUTSCHLAND;-129,00;1.266,62
20.02.2026;LOHN FEBRUAR;2.400,00;1.395,62`;

/** Minimal three-column export with no header conventions at all. */
export const BARE = `date,merchant,amount
2026-02-01,BLUE BOTTLE COFFEE,6.75
2026-02-02,LOCAL HARDWARE STORE,42.10
2026-02-03,UNKNOWN VENDOR XYZ,15.00`;
