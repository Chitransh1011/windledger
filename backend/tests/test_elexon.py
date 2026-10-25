import httpx
import pytest
from app.elexon import fetch


def test_bounded_retries(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503)

    monkeypatch.setattr("app.elexon.time.sleep", lambda _: None)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            fetch(client, "WINDFOR", {})
    assert len(calls) == 3


def test_bad_request_not_retried():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(400)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            fetch(client, "WINDFOR", {})
    assert len(calls) == 1


def test_rejects_wrong_response_shape():
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"data": []}))
    ) as client:
        with pytest.raises(ValueError):
            fetch(client, "WINDFOR", {})
