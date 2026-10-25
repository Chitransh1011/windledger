# Data verification and analytical scope

Checked 25 October 2026 against the official Elexon OpenAPI schema and real HTTP responses. Source documentation pages are client-rendered; the schema is the authoritative machine-readable contract used here.

## Sources

- [Official OpenAPI schema](https://data.elexon.co.uk/swagger/v1/swagger.json), retained in `evidence/elexon-openapi.json`.
- [WINDFOR stream documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream).
- [FUELHH stream documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream).
- [Elexon developer portal](https://developer.data.elexon.co.uk/): public APIs, no API key; dataset endpoints retain superseded publications.
- [Wind endpoint description](https://bmrs.elexon.co.uk/api-documentation/endpoint/forecast/generation/wind/latest): wind farms visible to the system operator with operational metering.
- [Elexon interface documentation, WINDFOR peak terminology](https://www.elexon.co.uk/bsc/documents/groups/isg/2022-meetings-isg/253-may/isg253-04b-cp1562-neta-idd-part-1-redline-text-v49/): historical terminology is a reason not to assume the current target value is an hourly average. It is not used to override observed 2026 timestamp spacing.
- [North Sea Link's N2EX timing](https://www.northsealink.com/en/trade-with-us/register): 09:50 UK time. Chosen assumption, configurable and not universal.

## Verified HTTP contract

Base URL: `https://data.elexon.co.uk/bmrs/api/v1` (different from the documentation host).

`GET /datasets/WINDFOR/stream?publishDateTimeFrom=2026-01-01T00:00:00Z&publishDateTimeTo=2026-01-02T00:00:00Z`

Returns a top-level JSON **array**. The parameters filter **publication time**, not target time. Omitting them would retrieve the latest forecast and invalidate this exercise. Each record has `dataset`, `publishTime`, `startTime`, `generation`. The 1 January sample has 584 records, eight publications and hourly targets extending beyond the publication day. The app never uses the processed `/latest` endpoint for replay.

`GET /datasets/FUELHH/stream?settlementDateFrom=2026-01-02&settlementDateTo=2026-01-02&fuelType=WIND`

Returns an array with 48 WIND records, including settlement date/period, `publishTime`, `startTime`, `generation`. The same start/end settlement date includes that day. The schema says settlement-date parameters cannot be combined with publication-date parameters. `fuelType` is also checked locally. Elexon describes generation as average MW over 30 minutes for Great Britain.

The stream schemas do not document a reliable inclusivity guarantee for all publication boundaries. Adjacent daily queries may overlap; exact deduplication handles that without dropping revisions. Local selection always applies an inclusive `publishTime <= cutoff` rule and explicit `[delivery_start, delivery_end)` target filtering.

Real response excerpts (full samples are in `evidence/`):

```json
{"dataset":"WINDFOR","publishTime":"2026-01-01T22:30:00Z","startTime":"2026-01-02T00:00:00Z","generation":18811}
```

The full response is retained in the sample file. FUELHH's final 2 January interval is:

```json
{"dataset":"FUELHH","publishTime":"2026-01-03T00:00:00Z","startTime":"2026-01-02T23:30:00Z","settlementDate":"2026-01-02","settlementPeriod":48,"fuelType":"WIND","generation":14202}
```

## Observed coverage

The retained audit reports 22,192 forecast rows, publication times from 25 December 02:30 to 31 January 22:30 UTC, and target times extending through 2 February 21:00 UTC. Forecast targets have minute `00` exclusively and 60-minute spacing. All 1,488 WIND actuals from 2 January 00:00 to 1 February 23:30 have 30-minute spacing. See `evidence/audit.json` for exact extrema and fingerprint.

At 09:50 every delivery day has 24 eligible hourly targets, all published at 09:30 on its decision date, and 48 actuals. Only 24 exact-time comparisons are made daily. No unknown 10:30 forecast is inferred from 10:00 and 11:00. The exact-time comparison uses the 10:00–10:30 actual average, not the average of 10:00–11:00. An hourly target does not establish an hourly averaging duration. These distinctions are visible in the app and prevent false claims of full-day energy accuracy.

The oldest date supported by the full Elexon archive was not determined. The complete period required for this pilot and its seven-day preceding publication window were actually retrieved. Empty/missing intervals remain possible in other refreshes and cutoff configurations.

## Findings at the default assumption

The month has MAE 1,995.57 MW, RMSE 2,498.82 MW and bias +1,727.98 MW on 744 pairs. The lowest daily MAE is 750.04 MW for the 18 January decision (19 January delivery). The highest is 5,328.96 MW for the 27 January decision (28 January delivery). The latter's matched errors are all positive. These observations do not prove why the discrepancy occurred; no weather, curtailment, demand or market-price data was analyzed.

These are retrospective diagnostics of the two requested Elexon datasets. Do not present the bias as a calibrated correction, confidence interval, or purchase recommendation.
