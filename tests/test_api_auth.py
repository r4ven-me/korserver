from __future__ import annotations

from fastapi.testclient import TestClient

from korserver.api.app import create_app
from korserver.config.models import AppConfig
from korserver.services.password_hash import hash_password


def _client() -> TestClient:
    config = AppConfig.model_validate({"web": {"admin_password": "secret"}})
    return TestClient(create_app(config))


def test_protected_api_requires_basic_auth() -> None:
    response = _client().get("/api/config")

    assert response.status_code == 401
    assert "www-authenticate" not in response.headers
    assert response.json()["detail"] == "authentication required"


def test_invalid_credentials_do_not_trigger_browser_basic_prompt() -> None:
    response = _client().get("/api/config", auth=("admin", "wrong"))

    assert response.status_code == 401
    assert "www-authenticate" not in response.headers
    assert response.json()["detail"] == "invalid credentials"


def test_protected_api_accepts_valid_basic_auth() -> None:
    response = _client().get("/api/config", auth=("admin", "secret"))

    assert response.status_code == 200
    assert response.json()["web"]["admin_password"] == "***"


def test_auth_me_returns_authenticated_identity() -> None:
    response = _client().get("/api/auth/me", auth=("admin", "secret"))

    assert response.status_code == 200
    assert response.json() == {
        "authenticated": True,
        "username": "admin",
        "csrf_token": None,
    }


def test_cookie_session_requires_csrf_for_mutations() -> None:
    client = TestClient(
        create_app(AppConfig.model_validate({"web": {"admin_password": "secret"}})),
        base_url="https://testserver",
    )
    login_response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "secret"},
    )
    csrf_token = login_response.json()["csrf_token"]

    rejected = client.post("/api/config/render")
    accepted = client.post(
        "/api/config/render",
        headers={"X-Korserver-CSRF": csrf_token},
    )

    assert login_response.status_code == 200
    assert login_response.cookies.get("korserver_session")
    assert rejected.status_code == 403
    assert accepted.status_code == 200


def test_protected_api_accepts_hashed_admin_password() -> None:
    config = AppConfig.model_validate(
        {"web": {"admin_password_hash": hash_password("secret")}}
    )
    response = TestClient(create_app(config)).get("/api/config", auth=("admin", "secret"))

    assert response.status_code == 200
