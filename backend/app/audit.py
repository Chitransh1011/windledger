"""Reproduce the data audit and numerical findings from the bundled real snapshot."""

import json
from collections import Counter
from datetime import time

from .analysis import analyze_month
from .main import snapshot


def main():
    forecasts, actuals, provenance = snapshot()
    month = analyze_month(time(9, 50), forecasts, actuals)
    report = {
        "retrieved_at": provenance["retrieved_at"],
        "sha256": provenance["sha256"],
        "quality": provenance["quality"],
        "metrics_at_0950": month["metrics"],
    }
    for name, rows in (("WINDFOR", forecasts), ("FUELHH", actuals)):
        targets = sorted({r.start for r in rows})
        report[name] = {
            "records": len(rows),
            "target_min": min(targets).isoformat(),
            "target_max": max(targets).isoformat(),
            "publication_min": min(r.published for r in rows).isoformat(),
            "publication_max": max(r.published for r in rows).isoformat(),
            "target_minutes": sorted({r.start.minute for r in rows}),
            "target_spacing_minutes": dict(
                Counter(
                    int((b - a).total_seconds() / 60)
                    for a, b in zip(targets, targets[1:])
                )
            ),
        }
    ranked = sorted(month["days"], key=lambda d: d["metrics"]["mae"] or 0)
    report["lowest_daily_mae"] = ranked[0]
    report["highest_daily_mae"] = ranked[-1]
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
