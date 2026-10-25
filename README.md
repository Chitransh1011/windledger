# Wind Ledger

A small React and Python dashboard for replaying the wind forecasts available to a GB day-ahead purchasing team, then reviewing their accuracy retrospectively. The pilot covers **decisions from 1–31 January 2026**, with **deliveries from 2 January–1 February 2026**.

**Live application: NOT DEPLOYED — replace with the verified public Vercel frontend URL before submission.**

This product does not forecast demand, train a model, recommend trades, or calculate the utility's exact purchase quantity. National wind generation is not the utility's own renewable allocation.

## What it does

- Replays the latest eligible forecast for each next-day target using a configurable Europe/London decision cutoff.
- Separates decision-time forecast information from actuals and errors shown retrospectively.
- Shows forecast points, actuals, signed errors, MAE, RMSE, bias, and explicit coverage denominators.
- Reconstructs every January decision independently for a monthly comparison.
- Exposes selected publication times and an interval-level audit table.
- Handles missing data, conflicting duplicates, zero actuals, loading, timeout and API error states.
- Uses a bundled **real Elexon snapshot**, with retrieval provenance and a repeatable refresh command. No synthetic dashboard data.

## Important finding: these series are not directly equivalent

The actual downloaded WINDFOR data has **hourly target timestamps**. FUELHH has **48 half-hour average MW values per day**. The app matches **exact timestamps only**: an hourly forecast at 10:00 is compared with the FUELHH half-hour beginning 10:00. It does not compare it with an interpolated 10:30 forecast or silently average actuals into hours.

This is a **matched-time diagnostic**, not a verified like-for-like hourly energy forecast evaluation. Target spacing alone does not establish that a forecast represents an hourly average. Elexon's older interface documentation describes WINDFOR as a peak forecast; the current stream schema does not establish averaging duration. Both series are in MW, but their measurement basis and covered population may differ. Operational constraints and curtailment can also affect outturn. The app makes no causal claim about errors and shows no MWh totals.

At 09:50, the bundled snapshot gives:

| Metric | Result |
| --- | ---: |
| MAE | 1,995.57 MW |
| RMSE | 2,498.82 MW |
| Mean bias (forecast − actual) | +1,727.98 MW |
| Exact matched timestamps | 744 |
| Half-hour target coverage | 744 / 1,488 = 50% |
| Matches among available forecasts | 744 / 744 = 100% |

Positive bias means overforecasting; negative means underforecasting. These are **whole-period retrospective results**, not information available on 1 January. See [data research](docs/DATA.md) and the reproducible [audit](docs/evidence/audit.json).

## Architecture and directories

```text
frontend/                React + TypeScript + Vite, Recharts, plain CSS
  src/main.tsx           Controls, API state, charts, audit tables, methodology
  src/style.css          Responsive layout and accessible focus styling
  Dockerfile             Build static assets, serve with nginx
  nginx.conf             Same-origin /api proxy for Docker
backend/
  app/elexon.py          Elexon HTTP access, timeout and bounded retries
  app/refresh.py         Historical fetch, validation, atomic snapshot replacement
  app/normalize.py       Timestamp/value validation and exact deduplication
  app/analysis.py        Cutoff selection, matching and pure metric functions
  app/main.py            FastAPI routes, validation, bounded in-process cache
  app/audit.py           Reproducible coverage and findings report
  data/snapshot.json    Real data with source URLs, retrieval timestamp and hash
  tests/                 Focused unit and route tests, synthetic fixtures only
  index.py               Vercel FastAPI entry point
docs/                    Data research and verification record
docs/evidence/           Official API schema, real samples, generated audit
compose.yaml             Local frontend/backend orchestration
```

The browser calls FastAPI; FastAPI loads the snapshot once per process and performs analysis in Python. Elexon is accessed only by the explicit refresh command. There is no database, authentication, queue or background service.

## Start with Docker

Requirements: Docker Desktop with its Linux container engine running, or Docker Engine with Compose.

```sh
docker compose up --build
```

Open **http://localhost:8080**. API documentation: **http://localhost:8000/docs**. The real snapshot is included, so first startup does not require Elexon access. `docker compose down` stops the services. The frontend's nginx sends `/api` requests to the backend service.

## Start without Docker

Use Python 3.12 and Node **22.13+** (or Node 24). Frontend verification used Node 24.

From the repository root, on Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements-dev.txt
cd backend
..\.venv\Scripts\python -m uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to port 8000. On macOS/Linux use `.venv/bin/python` in place of `.venv\Scripts\python` and `../.venv/bin/python` from backend.

## Environment variables

| Variable | Where | Default / purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Frontend build | Empty: use same-origin `/api`. Set to the Vercel backend HTTPS origin, without a trailing slash, for deployment. This is public configuration, never a secret. |
| `ALLOWED_ORIGINS` | Backend runtime | `http://localhost:5173,http://localhost:8080`; comma-separated frontend origins for CORS. Set the exact deployed frontend origin. |
| `SNAPSHOT_PATH` | Backend / refresh | Optional snapshot file path; defaults to `backend/data/snapshot.json`. Leave unset on Vercel. |

Examples are in each directory's `.env.example`. Backend variables must be exported or set in hosting settings; Python does not automatically read `.env`. Vite reads `.env.local`. No API key is needed for the public Elexon endpoints. No secrets are included.

## Refresh and provenance

From `backend/`:

```powershell
..\.venv\Scripts\python -m app.refresh
..\.venv\Scripts\python -m app.audit
```

The refresh performs 38 daily WINDFOR publication queries (25 December through 31 January, upper boundary 1 February) and 31 daily FUELHH settlement queries (2 January through 1 February). Only WIND actuals are retained. Daily requests keep responses small. A 45-second request timeout and at most three attempts handle transport errors, HTTP 429 and selected server failures. Other HTTP errors fail immediately.

Every request URL and row count, UTC retrieval time, covered date ranges, validation counters and SHA-256 of the dataset payload are embedded in the snapshot. It preserves all revisions, removing exact duplicates only. Refresh replaces the file atomically after all requests succeed and validation passes. On failure the previous snapshot stays intact. Empty *days* are allowed and displayed as missing; an entirely empty dataset is rejected.

**Restart the API after refreshing** to clear process caches. Rebuild Docker images or redeploy Vercel to include the updated file. Runtime writes are not needed on Vercel: its filesystem is not used as persistent storage. The seven-day lookback is a bounded pilot assumption, not a claim that no older forecast could ever exist. All default-cutoff targets in this snapshot have same-day publications, so lookback truncation does not affect the reported default results.

The bundled snapshot was retrieved **25 October 2026 at 08:30 UTC**, contains **22,192 forecasts and 1,488 actuals**, and has no invalid or null measurements after exact deduplication. Historical availability for this window is empirically verified; no claim is made about the provider's full archive retention.

## Decision and metric rules

The configurable default is **09:50 Europe/London** on the decision date, based on [North Sea Link's N2EX gate closure information](https://www.northsealink.com/en/trade-with-us/register). This is an explicit N2EX-oriented replay assumption, not a universal UK market cutoff. An operational team should allow time before its auction gate closes. The source was checked on 25 October 2026; it is not an archived proof of every January market rule.

All stored datetimes must be timezone aware and are normalized to UTC. Delivery-day boundaries are constructed in Europe/London. January is GMT (UTC+00:00). The date range is validated server-side. A 31 January decision maps to 1 February delivery.

For each delivery target:

1. Keep forecast publications at or before that day's cutoff (equality is included).
2. Select the latest publication **per target**, not a globally latest revision.
3. Select the latest retrieved actual per target, independently of the decision cutoff, for retrospective comparison only.
4. Equal-time conflicting values are missing, not averaged or selected by response ordering. A latest null does not fall back silently to an older revision.
5. Compute an error only if both selected values exist: `e = forecast − actual`.

For `n` matched errors: `MAE = sum(abs(e))/n`, `RMSE = sqrt(sum(e²)/n)`, `bias = sum(e)/n`. If `n=0`, metrics are null. Zero actual generation remains valid. MAPE is omitted because small or zero denominators make it misleading. Coverage divides `n` by the expected half-hour slots; a second ratio measures matches among available forecasts. Monthly metrics pool all errors after reconstructing each daily cutoff, rather than averaging daily RMSEs.

## Tests and verification

From backend: `python -m pytest -q` and `python -m ruff check app tests` using the virtual environment. From frontend: `npm run build`, `npm run typecheck`, and `npm run lint`.

Recorded verification for this delivery:

- 16 backend tests passed: cutoff leakage, latest per target, equality at cutoff, month boundary, UTC normalization, DST boundary calculation, duplicates/conflicts, null revisions, missing records, zero actuals, manual metric examples, monthly reconstruction, route validation, missing snapshot and network retries.
- Backend Ruff passed.
- Frontend TypeScript/production build and ESLint passed. Vite reports a non-fatal large charting bundle warning (~192 KB gzip for the main JS bundle).
- `npm install` audit reported zero known vulnerabilities at install time; this is not a permanent security guarantee.
- Compose configuration validation passed. Subsequent local Compose logs confirm both images built, the backend became healthy with HTTP 200 from `/health`, and frontend nginx started. The Docker frontend is served on **http://localhost:8080**, not port 5173. See [QA](docs/QA.md) for verification scope.
- Native frontend HTTP and API health checks passed. Browser verification details are in [QA](docs/QA.md).

## Vercel deployment

Use **two Vercel projects from the same repository**, one for each directory. Vercel supports [FastAPI as a Python Function](https://vercel.com/docs/frameworks/backend/fastapi) and [Vite frontend builds](https://vercel.com/docs/frameworks/frontend/vite). This avoids relying on beta multi-service hosting. **Vercel does not run this Compose setup.** Docker is for local reproducibility; Vercel builds and hosts each project natively.

1. Create a public repository with an anonymous/random name as required by the challenge.
2. In Vercel, import the repository. Set Root Directory to `backend`, framework FastAPI, Python 3.12 where selectable. `index.py` exposes `app`; `requirements.txt` provides runtime dependencies. The tracked `data/snapshot.json` must be included. Do not add a runtime fetch/build refresh command.
3. Deploy the backend. Verify its public `/health`, `/docs`, `/api/day?decision_date=2026-01-31&cutoff=09:50` and `/api/month?cutoff=09:50` URLs. The snapshot is small (~3 MB), small enough to bundle with this pilot; verify the current plan limits during deployment.
4. Import the repository as a second project. Set Root Directory to `frontend`, framework Vite, Node 22 or 24, install `npm ci`, build `npm run build`, output `dist`.
5. Set frontend `VITE_API_BASE_URL=https://YOUR-BACKEND.vercel.app` before building.
6. Set backend `ALLOWED_ORIGINS=https://YOUR-FRONTEND.vercel.app`, then redeploy the backend. Include additional exact preview origins only if needed.
7. Verify frontend data, both tabs, date/cutoff controls and the 31 January boundary. Check browser network requests for CORS errors. If backend `/health` returns 503, confirm the snapshot is in the deployed bundle.
8. Ensure each submitted URL is accessible without your Vercel login; review Deployment Protection settings for the intended public sample. Check all links in an incognito browser.
9. Replace the live URL placeholder above only after a verified deployment. Do not claim a deployment from configuration alone.

A Vercel account and repository connection are required. Deployment configuration is prepared; live bundling and routing remain to be verified after deployment.

## Tradeoffs and next steps

- Fixed historical month; no automatic freshness or arbitrary-date exploration.
- Exact target matching is transparent but cannot resolve forecast averaging/peak semantics or population differences. Resolve those with Elexon before presenting the errors as operational forecast quality.
- A published timestamp is a proxy for information availability; network/dissemination latency is not reconstructed.
- Current retrieved actuals may contain revisions made after delivery; they were not known at the decision time.
- No uncertainty bands or purchase-volume recommendations from this limited dataset.
- Snapshot is loaded separately in each serverless process. This is small enough for a pilot; no distributed cache is required.
- No frontend automated browser suite; focused browser checks and TypeScript/lint supplement backend tests.
- Google Fonts are optional visual enhancement; system sans-serif fallback works offline.
- Chart code is kept in one frontend entry file to keep the pilot straightforward, with pure Python analytical modules separately testable.

## AI assistance disclosure

OpenAI Codex assisted with source research, application implementation, tests, styling, debugging and documentation. No AI-generated measurements were used in the dashboard. Small synthetic inputs appear only in automated tests.

## Supporting documentation

- [Data sources, matching assumptions and findings](docs/DATA.md)
- [Testing and verification record](docs/QA.md)
