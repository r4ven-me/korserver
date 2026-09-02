from __future__ import annotations

from fastapi.testclient import TestClient

from korserver.api.app import create_app
from korserver.config.models import AppConfig


def test_terminal_session_requires_admin_auth() -> None:
    config = AppConfig.model_validate(
        {"web": {"admin_password": "secret", "terminal_enabled": True}}
    )
    client = TestClient(create_app(config))

    response = client.post("/api/terminal/sessions", json={"cwd": "/", "rows": 30, "cols": 100})

    assert response.status_code == 401


def test_terminal_session_returns_one_time_ticket() -> None:
    config = AppConfig.model_validate(
        {"web": {"admin_password": "secret", "terminal_enabled": True}}
    )
    client = TestClient(create_app(config))

    response = client.post(
        "/api/terminal/sessions",
        auth=("admin", "secret"),
        json={"cwd": "/", "rows": 30, "cols": 100},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["cwd"] == "/"
    assert isinstance(payload["token"], str)
    assert len(payload["token"]) > 20


def test_terminal_is_disabled_by_default() -> None:
    config = AppConfig.model_validate({"web": {"admin_password": "secret"}})
    client = TestClient(create_app(config))

    response = client.post(
        "/api/terminal/sessions",
        auth=("admin", "secret"),
        json={"cwd": "/", "rows": 30, "cols": 100},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "web terminal is disabled"
