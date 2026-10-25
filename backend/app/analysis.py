"""Pure functions: cutoff selection, exact-time matching, and error statistics."""

from datetime import date, datetime, time, timedelta, timezone
from math import sqrt
from zoneinfo import ZoneInfo

from .normalize import Record

LONDON = ZoneInfo("Europe/London")


def decision_window(day: date, cutoff: time):
    decision = datetime.combine(day, cutoff, LONDON).astimezone(timezone.utc)
    start = datetime.combine(day + timedelta(days=1), time.min, LONDON).astimezone(
        timezone.utc
    )
    end = datetime.combine(day + timedelta(days=2), time.min, LONDON).astimezone(
        timezone.utc
    )
    return decision, start, end


def latest(records: list[Record], cutoff: datetime | None = None):
    """Conflicting values at the latest publication are missing, never arbitrarily chosen."""
    groups = {}
    for record in records:
        if cutoff is not None and record.published > cutoff:
            continue
        previous = groups.get(record.start)
        if previous is None or record.published > previous[0]:
            groups[record.start] = (record.published, {record.generation})
        elif record.published == previous[0]:
            previous[1].add(record.generation)
    return {
        start: (
            published,
            next(iter(values)) if len(values) == 1 else None,
            len(values) > 1,
        )
        for start, (published, values) in groups.items()
    }


def metrics(intervals: list[dict]):
    errors = [r["error"] for r in intervals if r["error"] is not None]
    n = len(errors)
    forecasts = sum(r["forecast"] is not None for r in intervals)
    return {
        "mae": sum(abs(e) for e in errors) / n if n else None,
        "rmse": sqrt(sum(e * e for e in errors) / n) if n else None,
        "bias": sum(errors) / n if n else None,
        "matched": n,
        "expected": len(intervals),
        "forecasts": forecasts,
        "actuals": sum(r["actual"] is not None for r in intervals),
        "coverage": n / len(intervals) if intervals else 0,
        "forecast_match_coverage": n / forecasts if forecasts else None,
    }


def analyze_day(
    day: date, cutoff: time, forecasts: list[Record], actuals: list[Record]
):
    decision, start, end = decision_window(day, cutoff)
    chosen = latest([r for r in forecasts if start <= r.start < end], decision)
    outturn = latest([r for r in actuals if start <= r.start < end])
    intervals = []
    target = start
    while target < end:
        f = chosen.get(target)
        a = outturn.get(target)
        forecast, actual = f[1] if f else None, a[1] if a else None
        intervals.append(
            {
                "start": target.isoformat(),
                "forecast": forecast,
                "actual": actual,
                "published": f[0].isoformat() if f else None,
                "conflict": bool((f and f[2]) or (a and a[2])),
                "error": forecast - actual
                if forecast is not None and actual is not None
                else None,
            }
        )
        target += timedelta(minutes=30)
    publications = sorted(
        {r["published"] for r in intervals if r["forecast"] is not None}
    )
    return {
        "decision_date": day.isoformat(),
        "delivery_date": start.astimezone(LONDON).date().isoformat(),
        "cutoff": decision.isoformat(),
        "timezone": "Europe/London",
        "intervals": intervals,
        "publication_min": publications[0] if publications else None,
        "publication_max": publications[-1] if publications else None,
        "publication_count": len(publications),
        "metrics": metrics(intervals),
    }


def analyze_month(cutoff: time, forecasts, actuals):
    days = [
        analyze_day(date(2026, 1, day), cutoff, forecasts, actuals)
        for day in range(1, 32)
    ]
    return {
        "days": [{k: v for k, v in day.items() if k != "intervals"} for day in days],
        "metrics": metrics([r for day in days for r in day["intervals"]]),
        "label": "Retrospective: January decisions, 2 January–1 February deliveries",
    }
