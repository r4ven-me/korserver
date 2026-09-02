from __future__ import annotations

from fastapi.testclient import TestClient

from korserver.api.app import create_app
from korserver.config.models import AppConfig


def test_user_config_validation_error_is_readable() -> None:
    config = AppConfig.model_validate(
        {
            "web": {"admin_password": "secret"},
            "system": {"data_dir": "/tmp/korserver-test"},
        }
    )
    client = TestClient(create_app(config=config))

    response = client.put(
        "/api/users/alice/config",
        json={"dns": ["not-an-ip"]},
        auth=("admin", "secret"),
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail[0]["loc"] == ["body", "dns"]
    assert "valid IP" in detail[0]["msg"] or "address" in detail[0]["msg"]
