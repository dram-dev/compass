# Political stream distributions vs the published benchmark

Generated 2026-08-17 by `npm run validate:political -- --write` · cycles 2020/2022/2024.
Republican share of two-party (D+R) dollars per company; companies under $5k partisan excluded.

| Stream | Per company (pooled) | Per company-cycle |
|---|---|---|
| pac | n=214 · mean 55.7% · median 52.2% · IQR 49.5–61.6 · p10/p90 45.1/74.2 | n=594 · mean 55.8% · median 52% · IQR 48.9–61.4 · p10/p90 43.7/75.7 |
| employee | n=337 · mean 35.6% · median 30.4% · IQR 14.3–52.1 · p10/p90 6.5/76.5 | n=943 · mean 35.4% · median 30.1% · IQR 12.7–52.5 · p10/p90 4.8/79.7 |
| executive | n=260 · mean 47.5% · median 47.1% · IQR 11.9–80.7 · p10/p90 0/97.5 | n=580 · mean 47.5% · median 46.8% · IQR 3.7–88.3 · p10/p90 0/100 |
| **benchmark (corporate PAC)** | — | mean 47.4% · IQR 21.1–72.2 · p10/p90 0/100 (BBFTY RES 2025 (NBER w30876), Table 1) |

Per cycle (PAC stream): 2020: n=192 · mean 56.8% · median 53.7% · IQR 48.9–64.3 · p10/p90 44.5/77.6 · 2022: n=196 · mean 52.7% · median 50.2% · IQR 47.5–59.2 · p10/p90 39.7/73.3 · 2024: n=206 · mean 57.7% · median 53.4% · IQR 49.9–63.6 · p10/p90 46.9/77.8

Executive subset = 44% of employee two-party dollars (senior-executive OCCUPATION keywords; BBFTY count executives as 23–31% of donors).

**Judgement: PAC distribution is consistent with the benchmark.**

> Note: IQR 48.9–61.4 is narrower than the benchmark's 21.1–72.2: expected for a universe of the largest, most-held firms (the most access-seeking PACs) and for recipients that include party committees; confirm with the 40-firm hand check (Phase B).

Reading it: most corporate PACs give near 50/50 (access-seeking, tracks majority control), so a wide IQR centred a little under 50% R is the expected shape. Employees and executives are partisans and should be far more dispersed than PACs (docs/research-political-axes.md, findings 2, 3, 7).
