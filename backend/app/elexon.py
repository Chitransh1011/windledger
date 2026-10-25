"""Network boundary. Only the refresh command calls Elexon."""

import time
import httpx

BASE = "https://data.elexon.co.uk/bmrs/api/v1"


def fetch(client: httpx.Client, dataset: str, params: dict) -> tuple[list, str]:
    url = f"{BASE}/datasets/{dataset}/stream"
    for attempt in range(3):
        try:
            response = client.get(url, params=params)
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list):
                raise ValueError("Elexon stream must return a JSON array")
            return rows, str(response.url)
        except (httpx.TransportError, httpx.HTTPStatusError) as error:
            retryable = not isinstance(
                error, httpx.HTTPStatusError
            ) or error.response.status_code in (429, 500, 502, 503, 504)
            if not retryable or attempt == 2:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("Unreachable")
