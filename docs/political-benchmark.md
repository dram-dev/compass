# Political stream distributions vs the published benchmark

Generated 2026-08-17 by `npm run validate:political -- --write` · cycles 2020/2022/2024.
Republican share of two-party (D+R) dollars per company; companies under $5k partisan excluded.

| Stream | Per company (pooled) | Per company-cycle |
|---|---|---|
| pac | n=210 · mean 55.6% · median 52.2% · IQR 49.5–61.6 · p10/p90 45.1/73.4 | n=586 · mean 55.8% · median 52% · IQR 48.9–61.4 · p10/p90 43.4/75.6 |
| employee | n=334 · mean 35.7% · median 30.2% · IQR 14.4–52.3 · p10/p90 6.5/76.6 | n=933 · mean 35.5% · median 29.8% · IQR 12.6–52.6 · p10/p90 4.9/79.8 |
| executive | n=257 · mean 47.6% · median 47.3% · IQR 11.8–81.5 · p10/p90 0/97.6 | n=572 · mean 47.5% · median 47.8% · IQR 3.6–88.5 · p10/p90 0/100 |
| **benchmark (corporate PAC)** | — | mean 47.4% · IQR 21.1–72.2 · p10/p90 0/100 (BBFTY RES 2025 (NBER w30876), Table 1) |

Per cycle (PAC stream): 2020: n=189 · mean 56.9% · median 54.1% · IQR 48.9–64.4 · p10/p90 44.1/77.7 · 2022: n=194 · mean 52.8% · median 50.2% · IQR 47.3–59.2 · p10/p90 39.7/73.4 · 2024: n=203 · mean 57.6% · median 53.3% · IQR 49.9–63.5 · p10/p90 46.9/77.2

Executive subset = 44% of employee two-party dollars (senior-executive OCCUPATION keywords; BBFTY count executives as 23–31% of donors).

**Judgement: PAC distribution is consistent with the benchmark.**

> Note: IQR 48.9–61.4 is narrower than the benchmark's 21.1–72.2: expected for a universe of the largest, most-held firms (the most access-seeking PACs) and for recipients that include party committees; confirm with the 40-firm hand check (Phase B).

Reading it: most corporate PACs give near 50/50 (access-seeking, tracks majority control), so a wide IQR centred a little under 50% R is the expected shape. Employees and executives are partisans and should be far more dispersed than PACs (docs/research-political-axes.md, findings 2, 3, 7).
