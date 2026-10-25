"""Run from backend: python -m app.refresh. Writes atomically after ALL requests succeed."""

import hashlib
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

from .elexon import fetch
from .normalize import normalize

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "snapshot.json"


def main():
    rows = {"WINDFOR": [], "FUELHH": []}
    requests = []
    with httpx.Client(timeout=45, headers={"Accept": "application/json"}) as client:
        # Seven surrounding publication days guard the first decision's lookback.
        for offset in range(38):
            day = date(2025, 12, 25) + timedelta(days=offset)
            params = {
                "publishDateTimeFrom": f"{day}T00:00:00Z",
                "publishDateTimeTo": f"{day + timedelta(days=1)}T00:00:00Z",
            }
            data, url = fetch(client, "WINDFOR", params)
            rows["WINDFOR"].extend(data)
            requests.append({"url": url, "rows": len(data)})
            print(f"WINDFOR {day}: {len(data)}", flush=True)
        for offset in range(31):
            day = date(2026, 1, 2) + timedelta(days=offset)
            data, url = fetch(
                client,
                "FUELHH",
                {
                    "settlementDateFrom": str(day),
                    "settlementDateTo": str(day),
                    "fuelType": "WIND",
                },
            )
            rows["FUELHH"].extend(r for r in data if r.get("fuelType") == "WIND")
            requests.append({"url": url, "rows": len(data)})
            print(f"FUELHH {day}: {len(data)}", flush=True)
    # Preserve all revisions, deduplicate overlapping request boundaries only.
    for dataset in rows:
        rows[dataset] = list(
            {json.dumps(r, sort_keys=True): r for r in rows[dataset]}.values()
        )
    quality = {dataset: normalize(data, dataset)[1] for dataset, data in rows.items()}
    if any(q["invalid"] for q in quality.values()):
        raise ValueError(f"Invalid source rows; previous snapshot preserved: {quality}")
    if not all(rows.values()):
        raise ValueError("Empty dataset; previous snapshot preserved")
    payload = {
        "provenance": {
            "source": "Elexon Insights Solution",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "forecast_publications": "2025-12-25 through 2026-02-01 (boundary may be inclusive)",
            "delivery_dates": "2026-01-02 through 2026-02-01",
            "requests": requests,
            "quality": quality,
            "sha256": hashlib.sha256(
                json.dumps(rows, sort_keys=True).encode()
            ).hexdigest(),
        },
        **rows,
    }
    path = Path(os.environ.get("SNAPSHOT_PATH", DEFAULT_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)
    print(f"Saved {path}")


if __name__ == "__main__":
    main()
