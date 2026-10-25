import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import "./style.css";

type Metrics = {
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  matched: number;
  expected: number;
  forecasts: number;
  actuals: number;
  coverage: number;
  forecast_match_coverage: number | null;
};
type Interval = {
  start: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  published: string | null;
  conflict: boolean;
};
type Provenance = {
  retrieved_at: string;
  sha256: string;
  quality: Record<
    string,
    { invalid: number; duplicates: number; null_values: number }
  >;
};
type Day = {
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  timezone: string;
  intervals: Interval[];
  metrics: Metrics;
  publication_min: string | null;
  publication_max: string | null;
  publication_count: number;
  provenance: Provenance;
};
type Month = {
  days: Omit<Day, "intervals">[];
  metrics: Metrics;
  label: string;
  provenance: Provenance;
};
const number = (n: number | null, digits = 0) =>
  n === null
    ? "—"
    : n.toLocaleString("en-GB", { maximumFractionDigits: digits });
const clock = (s: string) =>
  new Date(s).toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  });
const stamp = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unavailable";
const dateLabel = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const API =
  (import.meta as ImportMeta & { env: Record<string, string> }).env
    .VITE_API_BASE_URL || "";

function useData<T>(path: string) {
  const [state, setState] = useState<{
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    let active = true;
    setState({ data: null, error: null, loading: true });
    fetch(API + path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body.detail === "string"
              ? body.detail
              : `Request failed (${response.status}).`,
          );
        }
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (active)
          setState({
            data: null,
            error:
              error.name === "AbortError"
                ? "The request timed out. Please retry."
                : error.message,
            loading: false,
          });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [path, retry]);
  return { ...state, retry: () => setRetry((n) => n + 1) };
}

function MetricCards({ metrics: m }: { metrics: Metrics }) {
  return (
    <div className="metrics">
      <article>
        <span>Mean absolute error</span>
        <strong>
          {number(m.mae)} <small>MW</small>
        </strong>
        <p>Typical magnitude of the error</p>
      </article>
      <article>
        <span>Root mean square error</span>
        <strong>
          {number(m.rmse)} <small>MW</small>
        </strong>
        <p>Gives larger misses more weight</p>
      </article>
      <article>
        <span>Mean bias</span>
        <strong>
          {m.bias !== null && m.bias > 0 ? "+" : ""}
          {number(m.bias)} <small>MW</small>
        </strong>
        <p>
          {m.bias === null
            ? "No matched observations"
            : m.bias >= 0
              ? "Positive means overforecasting"
              : "Negative means underforecasting"}
        </p>
      </article>
      <article>
        <span>Matched coverage</span>
        <strong>
          {number(m.coverage * 100, 1)}
          <small>%</small>
        </strong>
        <p>
          {m.matched} / {m.expected} half-hour target slots
        </p>
      </article>
    </div>
  );
}

function GenerationChart({
  rows,
  actual = false,
}: {
  rows: Interval[];
  actual?: boolean;
}) {
  // Keep the entire 30-minute grid; null forecast slots stay gaps. Dots avoid implying interpolation.
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        actual
          ? "Forecast points and actual wind generation in MW, matched by target time"
          : "Wind forecast points available before the decision cutoff in MW"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 12, right: 18, bottom: 10, left: 10 }}
        >
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#e2e8e4"
          />
          <XAxis
            dataKey="start"
            tickFormatter={clock}
            interval={7}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={62}
            tickFormatter={(v) => number(v)}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            labelFormatter={(v) => `${stamp(String(v))} · Europe/London`}
            formatter={(v, name) => [
              `${number(typeof v === "number" ? v : null)} MW`,
              name,
            ]}
          />
          <Legend verticalAlign="top" height={38} />
          {actual && (
            <Line
              type="linear"
              dataKey="actual"
              name="Actual · half-hour average"
              stroke="#527aaa"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          )}
          <Line
            dataKey="forecast"
            name="Forecast · published target (MW)"
            stroke="#147d68"
            strokeWidth={0}
            dot={{ r: 3, fill: "#147d68", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            legendType="circle"
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ErrorChart({ rows }: { rows: Interval[] }) {
  return (
    <div
      className="chart small"
      role="img"
      aria-label="Forecast minus actual error in MW"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 10, right: 18 }}>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 5"
            stroke="#e2e8e4"
          />
          <XAxis
            dataKey="start"
            tickFormatter={clock}
            interval={9}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width={62}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(v) => stamp(String(v))}
            formatter={(v) => [
              `${number(typeof v === "number" ? v : null)} MW`,
              "Forecast − actual",
            ]}
          />
          <ReferenceLine y={0} stroke="#6d7e79" />
          <Bar dataKey="error" radius={[3, 3, 0, 0]}>
            {rows.map((r) => (
              <Cell
                key={r.start}
                fill={(r.error ?? 0) >= 0 ? "#b16a32" : "#527aaa"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function App() {
  const [date, setDate] = useState("2026-01-01");
  const [cutoff, setCutoff] = useState("09:50");
  const [tab, setTab] = useState<"day" | "month">("day");
  const daily = useData<Day>(`/api/day?decision_date=${date}&cutoff=${cutoff}`);
  const monthly = useData<Month>(`/api/month?cutoff=${cutoff}`);
  const active = tab === "day" ? daily : monthly;
  const day = daily.data;
  const provenance = active.data?.provenance;
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brandmark">≋</span> Wind Ledger
        </a>
        <div className="header-right">
          <span className="status-dot" /> ELEXON INSIGHTS{" "}
          <span className="divider">/</span> JANUARY 2026
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">GB WIND GENERATION · DECISION REPLAY</div>
            <h1>A clearer view of tomorrow’s wind.</h1>
            <p>
              Reconstruct what was forecast before a buying decision.
              <br className="desktop" /> Then explore how it compared with
              generation delivered.
            </p>
          </div>
          <span className="outline-badge">
            Historical pilot <span>↗</span>
          </span>
        </div>
        <section className="controls" aria-label="Decision settings">
          <label>
            Decision date
            <input
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={date}
              onChange={(e) => {
                if (
                  e.target.value >= "2026-01-01" &&
                  e.target.value <= "2026-01-31"
                )
                  setDate(e.target.value);
              }}
            />
          </label>
          <span className="arrow">→</span>
          <div className="delivery">
            <span>Next-day delivery</span>
            <strong>
              {dateLabel(
                new Date(Date.parse(date + "T00:00:00Z") + 86400000)
                  .toISOString()
                  .slice(0, 10),
              )}
            </strong>
          </div>
          <div className="control-divider" />
          <label>
            Decision cutoff
            <input
              type="time"
              value={cutoff}
              onChange={(e) => {
                if (e.target.value) setCutoff(e.target.value);
              }}
            />
          </label>
          <div className="timezone">
            <strong>Europe/London</strong>
            <span>GMT · UTC+00:00 in January</span>
          </div>
        </section>
        <p className="cutoff-note">
          All decision times: Europe/London (GMT). Default 09:50 follows the
          N2EX gate closure assumption. Change it to replay another decision
          time.
        </p>
        <nav className="tabs" aria-label="Analysis view">
          <button
            className={tab === "day" ? "selected" : ""}
            onClick={() => setTab("day")}
          >
            Daily decision <span>01</span>
          </button>
          <button
            className={tab === "month" ? "selected" : ""}
            onClick={() => setTab("month")}
          >
            Monthly accuracy <span>31 days</span>
          </button>
        </nav>
        {active.loading && (
          <div className="message loading" role="status">
            <span className="spinner" /> Reconstructing eligible forecasts…
          </div>
        )}
        {active.error && (
          <div className="message error" role="alert">
            <h2>We couldn’t load the analysis</h2>
            <p>{active.error}</p>
            <button onClick={active.retry}>Retry request</button>
          </div>
        )}
        {!active.loading && !active.error && active.data && (
          <>
            <div className="notice">
              <span className="info-icon">i</span>
              <p>
                <strong>Read these as matched-time diagnostics.</strong> WINDFOR
                targets are hourly in this snapshot; FUELHH actuals are
                half-hour averages. We match exact timestamps only, leave gaps,
                and do not interpolate. These metrics are not a complete,
                like-for-like energy forecast evaluation.
              </p>
            </div>
            {tab === "day" && day && (
              <>
                <section className="panel forecast-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow green">
                        01 / AVAILABLE AT THE DECISION
                      </div>
                      <h2>Next-day wind outlook</h2>
                      <p>
                        {dateLabel(day.delivery_date)} · forecasts published by{" "}
                        {stamp(day.cutoff)} GMT
                      </p>
                    </div>
                    <span className="pill">
                      {day.metrics.forecasts} forecast points
                    </span>
                  </div>
                  {day.metrics.forecasts ? (
                    <GenerationChart rows={day.intervals} />
                  ) : (
                    <div className="message">
                      No eligible forecasts for this cutoff. Try a later cutoff;
                      no values have been filled.
                    </div>
                  )}
                  <div className="panel-footer">
                    <span>
                      Selected publications{" "}
                      <strong>
                        {stamp(day.publication_min)}
                        {day.publication_max !== day.publication_min
                          ? ` – ${stamp(day.publication_max)}`
                          : ""}{" "}
                        GMT
                      </strong>
                    </span>
                    <span>
                      {day.publication_count} revision time
                      {day.publication_count === 1 ? "" : "s"} · dots are
                      published targets
                    </span>
                  </div>
                </section>
                <div className="section-title">
                  <div>
                    <div className="eyebrow">02 / RETROSPECTIVE REVIEW</div>
                    <h2>How did the forecast compare?</h2>
                  </div>
                  <span className="retrospective">
                    Actuals were not known at the decision
                  </span>
                </div>
                <MetricCards metrics={day.metrics} />
                {day.metrics.matched < day.metrics.expected && (
                  <p className="coverage-note">
                    Partial half-hour coverage: {day.metrics.actuals} actuals,{" "}
                    {day.metrics.forecasts} forecasts, {day.metrics.matched}{" "}
                    matches.{" "}
                    {number(
                      day.metrics.forecast_match_coverage === null
                        ? null
                        : day.metrics.forecast_match_coverage * 100,
                      1,
                    )}
                    % of available forecast points have an actual. The hourly
                    forecast grid normally limits half-hour coverage to 50%.
                  </p>
                )}
                {!day.metrics.matched && (
                  <div className="message">
                    No matched pairs. Error metrics are unavailable, not zero.
                  </div>
                )}
                <div className="chart-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Forecast & actual</h2>
                        <p>Same target timestamps · MW</p>
                      </div>
                    </div>
                    <GenerationChart rows={day.intervals} actual />
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Where the forecast missed</h2>
                        <p>Forecast − actual · MW</p>
                      </div>
                    </div>
                    <ErrorChart rows={day.intervals} />
                    <div className="error-key">
                      <span>● Overforecast</span>
                      <span>● Underforecast</span>
                    </div>
                  </section>
                </div>
                <details className="panel interval-table">
                  <summary>
                    Inspect all 48 target slots and selected publications
                  </summary>
                  <div className="table-scroll">
                    <table>
                      <caption>
                        Delivery {day.delivery_date}. Times shown in
                        Europe/London. A dash means missing.
                      </caption>
                      <thead>
                        <tr>
                          <th>Target</th>
                          <th>Forecast MW</th>
                          <th>Actual MW</th>
                          <th>Error MW</th>
                          <th>Publication GMT</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.intervals.map((r) => (
                          <tr key={r.start}>
                            <td>{clock(r.start)}</td>
                            <td>{number(r.forecast)}</td>
                            <td>{number(r.actual)}</td>
                            <td>{number(r.error)}</td>
                            <td>{stamp(r.published)}</td>
                            <td>
                              {r.conflict
                                ? "Conflicting duplicate"
                                : r.error !== null
                                  ? "Matched"
                                  : "Unmatched"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
            {tab === "month" && monthly.data && (
              <>
                <div className="section-title">
                  <div>
                    <div className="eyebrow">
                      RETROSPECTIVE · ALL JANUARY DECISIONS
                    </div>
                    <h2>A month of forecast performance</h2>
                    <p>
                      2 January–1 February deliveries. Each day uses its own{" "}
                      {cutoff} GMT cutoff.
                    </p>
                  </div>
                </div>
                <MetricCards metrics={monthly.data.metrics} />
                <p className="coverage-note">
                  Month statistics pool matched pairs; they are not averages of
                  daily statistics or information available at an earlier
                  January decision.
                </p>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Daily mean absolute error</h2>
                      <p>Decision date · select a bar to inspect that day</p>
                    </div>
                  </div>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthly.data.days.map((d) => ({
                          ...d,
                          ...d.metrics,
                        }))}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 5" />
                        <XAxis
                          dataKey="decision_date"
                          tickFormatter={(v) => v.slice(8)}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis width={65} />
                        <Tooltip
                          labelFormatter={(v) => `Decision ${String(v)}`}
                          formatter={(v) => [
                            `${number(typeof v === "number" ? v : null)} MW`,
                            "MAE",
                          ]}
                        />
                        <Bar
                          dataKey="mae"
                          fill="#147d68"
                          radius={[4, 4, 0, 0]}
                          onClick={(_, index) => {
                            setDate(monthly.data!.days[index].decision_date);
                            setTab("day");
                          }}
                          cursor="pointer"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <caption>
                        Daily results. Open a decision using the date link.
                      </caption>
                      <thead>
                        <tr>
                          <th>Decision</th>
                          <th>Delivery</th>
                          <th>MAE MW</th>
                          <th>RMSE MW</th>
                          <th>Bias MW</th>
                          <th>Matched slots</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthly.data.days.map((d) => (
                          <tr key={d.decision_date}>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setDate(d.decision_date);
                                  setTab("day");
                                }}
                              >
                                {d.decision_date}
                              </button>
                            </td>
                            <td>{d.delivery_date}</td>
                            <td>{number(d.metrics.mae)}</td>
                            <td>{number(d.metrics.rmse)}</td>
                            <td>{number(d.metrics.bias)}</td>
                            <td>
                              {d.metrics.matched} / {d.metrics.expected}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
        <section className="method">
          <div>
            <div className="eyebrow">BEHIND THE NUMBERS</div>
            <h2>Simple rules. Visible limitations.</h2>
            <p>
              This is a national wind forecast review, not a purchasing
              recommendation. Demand, portfolio exposure and prices are outside
              this pilot.
            </p>
          </div>
          <div>
            <h3>No hindsight in forecast selection</h3>
            <p>
              For each target, select the latest publication at or before the
              decision cutoff. Actuals are the latest retrieved outturn, used
              only for retrospective review.
            </p>
            <h3>Errors in MW, never disguised as energy</h3>
            <p>
              MAE is mean absolute error. RMSE is the square root of mean
              squared error. Bias is mean forecast minus actual. All use matched
              pairs only, including zero actuals; no MAPE or energy totals.
            </p>
          </div>
          <div>
            <h3>Coverage matters</h3>
            <p>
              Coverage is matched timestamps divided by 48 half-hour slots per
              delivery day. Hourly forecast targets leave half-hour gaps. No
              forward filling, averaging or interpolation is applied.
            </p>
            <h3>A bounded view of GB wind</h3>
            <p>
              WINDFOR covers wind visible to the system operator with
              operational metering; this is not all UK wind. Timing, measurement
              basis and curtailment can affect the comparison. A seven-day
              publication lookback precedes January.
            </p>
          </div>
        </section>
        <footer>
          <span className="footer-brand">≋ Wind Ledger</span>
          <div>
            {provenance ? (
              <>
                Real Elexon snapshot · retrieved{" "}
                {stamp(provenance.retrieved_at)} GMT
                <br />
                <span>
                  Snapshot {provenance.sha256.slice(0, 12)} · no live refresh on
                  page load
                </span>
              </>
            ) : (
              "Elexon Insights · historical snapshot"
            )}
            <br />
            <a
              href="https://bmrs.elexon.co.uk/api-documentation"
              target="_blank"
              rel="noreferrer"
            >
              Data documentation ↗
            </a>{" "}
            ·{" "}
            <a
              href="https://www.northsealink.com/en/trade-with-us/register"
              target="_blank"
              rel="noreferrer"
            >
              Cutoff source ↗
            </a>
          </div>
          <span>JAN 2026 / PILOT</span>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
