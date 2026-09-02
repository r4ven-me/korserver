from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from korserver.api.app import create_app
from korserver.config.models import AppConfig
from korserver.services.audit import AuditService


def _config(tmp_path: Path) -> AppConfig:
    return AppConfig.model_validate(
        {
            "system": {
                "data_dir": tmp_path / "data",
                "generated_dir": tmp_path / "generated",
                "log_dir": tmp_path / "logs",
                "secrets_dir": tmp_path / "secrets",
            },
            "web": {"admin_password": "secret"},
        }
    )


def test_audit_service_writes_restrictive_json_lines(tmp_path: Path) -> None:
    service = AuditService(_config(tmp_path))

    service.record(
        actor="admin",
        action="POST /api/config/render",
        outcome="success",
        source_ip="127.0.0.1",
    )

    path = tmp_path / "logs" / "audit.jsonl"
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["actor"] == "admin"
    assert payload["action"] == "POST /api/config/render"
    assert path.stat().st_mode & 0o777 == 0o600


def test_mutating_api_request_is_audited_without_credentials(tmp_path: Path) -> None:
    config = _config(tmp_path)
    client = TestClient(create_app(config))

    response = client.post("/api/config/render", auth=("admin", "secret"))

    assert response.status_code == 200
    content = (tmp_path / "logs" / "audit.jsonl").read_text(encoding="utf-8")
    assert '"actor":"admin"' in content
    assert '"action":"POST /api/config/render"' in content
    assert "secret" not in content
