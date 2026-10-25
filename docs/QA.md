# Verification record

Performed locally on 25 October 2026. This record distinguishes executed checks from prepared configuration.

| Check | Result |
| --- | --- |
| Backend unit and route tests | 16 passed |
| Ruff check of backend app and tests | Passed |
| Frontend TypeScript no-emit check | Passed |
| Frontend production build | Passed; final JS bundle 645.74 KB / 192.26 KB gzip |
| Frontend ESLint | Passed |
| Dependency install audit | Zero known npm vulnerabilities reported at install time |
| Snapshot SHA-256 recomputation | Matched embedded provenance |
| Native frontend HTTP | 200 |
| API `/health` | 200 with snapshot retrieval timestamp |
| Docker Compose configuration | Valid |
| Docker image build and container startup | Subsequent local Compose logs confirm both images built, backend healthy, and frontend nginx started |
| Live Vercel deployment | Not executed: owner account setup and verification remain |

Final frontend checks were run with Node 24.22.1. Use the supported version documented in the README; the project engine field requires Node 22.13 or later. Backend tests emit a dependency deprecation warning from Starlette's use of an AnyIO alias, with no test failures.

Docker was initially unavailable because of a host startup error. Subsequent Compose output supplied by the project owner on 25 October 2026 confirms successful image builds and startup: backend `/health` returned HTTP 200 and nginx completed initialization. This verifies container startup; the earlier browser checks below used native development servers, not the Docker-served frontend. The container frontend is at `http://localhost:8080`.

## Browser checks

Executed in the in-app browser against the real local API:

- Loaded the daily outlook, selected publication, actual comparison and error chart.
- Opened monthly accuracy and verified displayed totals (MAE 1,996, RMSE 2,499, bias +1,728, 744/1,488 matches) against the Python audit.
- Navigated from the monthly 31 January row to the daily view and verified 1 February delivery.
- Changed the decision cutoff by keyboard to 09:01 and verified selection moved from the 09:30 to the 07:30 publication, with recalculated metrics.
- Observed the loading state while requests were pending.
- Stopped the local API, changed the cutoff, and verified an error state with a retry button; restored the API and verified Retry recovered the daily results.
- Visually checked layout at 390×844 and 1280×900. Mobile controls wrap, metric cards use two columns, and chart points remain visible.
- Browser error log was empty before deliberately testing the stopped API. Expected failed-network logs from that fault test are not application rendering failures.
- Corrected chart marker size and removed an overlapping axis label found during visual review.

The cutoff interaction was checked using keyboard input and verified against the resulting rendered cutoff and publication text. The final screenshot is [dashboard](screenshots/dashboard.png).

Empty/no-match states are covered by backend tests and frontend rendering branches, but were not simulated with fabricated dashboard data in the browser. No full cross-browser, screen-reader, load or hosted-serverless test is claimed. Docker startup passed based on the supplied logs; a separate Docker browser test is not recorded here.
