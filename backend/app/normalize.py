"""Strict input validation; missing measurements never become zero."""

from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite


def timestamp(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamp must include a timezone")
    return result.astimezone(timezone.utc)


@dataclass(frozen=True)
class Record:
    start: datetime
    published: datetime
    generation: float | None


def normalize(rows: list[dict], dataset: str) -> tuple[list[Record], dict]:
    records = set()
    quality = {"invalid": 0, "duplicates": 0, "null_values": 0}
    for row in rows:
        if dataset == "FUELHH" and row.get("fuelType") != "WIND":
            continue
        try:
            if row.get("dataset") != dataset:
                raise ValueError("Unexpected dataset")
            value = row["generation"]
            if value is not None:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise ValueError("Invalid measurement")
                value = float(value)
                if not isfinite(value) or value < 0:
                    raise ValueError("Invalid measurement")
            record = Record(
                timestamp(row["startTime"]), timestamp(row["publishTime"]), value
            )
            if (
                record.start.minute not in (0, 30)
                or record.start.second
                or record.start.microsecond
            ):
                raise ValueError("Unexpected target grid")
            if record in records:
                quality["duplicates"] += 1
            else:
                records.add(record)
                quality["null_values"] += value is None
        except (ValueError, KeyError, TypeError, AttributeError):
            quality["invalid"] += 1
    return sorted(records, key=lambda r: (r.start, r.published)), quality
