from __future__ import annotations

from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from korserver.api.app import create_app


def _client(config_path: Path, tmp_path: Path) -> TestClient:
    config_path.write_text(
        f"""
system:
  data_dir: {tmp_path}/data
  log_dir: {tmp_path}/logs
  generated_dir: {tmp_path}/generated
  secrets_dir: {tmp_path}/secrets
web:
  enabled: true
  admin_password: secret
auth:
  password:
    enabled: true
routing:
  split:
    routes_file: {tmp_path}/routes.txt
    domains_file: {tmp_path}/domains.txt
""",
        encoding="utf-8",
    )
    return TestClient(create_app(config_path=config_path))


def test_routing_settings_saves_new_fields(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/routing/settings",
        auth=("admin", "secret"),
        json={
            "mode": "full",
            "main_interface": "eth0",
            "fwmark": "0x1234",
            "table_id": 1500,
            "nft_prefix": "korvus",
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["routing"]["main_interface"] == "eth0"
    assert saved["routing"]["fwmark"] == "0x1234"
    assert saved["routing"]["table_id"] == 1500
    assert saved["routing"]["nft_prefix"] == "korvus"


def test_routing_settings_saves_host_traffic_flag(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/routing/settings",
        auth=("admin", "secret"),
        json={
            "mode": "split",
            "tunnel_dns": True,
            "host_traffic": True,
            "host_mode": "full",
        },
    )

    assert response.status_code == 200
    assert response.json()["routing"]["host_traffic"] is True
    assert response.json()["routing"]["host_mode"] == "full"
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["routing"]["host_traffic"] is True
    assert saved["routing"]["host_mode"] == "full"


def test_routing_routes_bulk_set_replaces_the_whole_list(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    client.post("/api/routing/routes", auth=("admin", "secret"), json={"value": "10.1.0.0/16"})

    response = client.put(
        "/api/routing/routes",
        auth=("admin", "secret"),
        json={"items": ["10.20.0.0/16", "203.0.113.5"]},
    )

    assert response.status_code == 200
    assert response.json() == ["10.20.0.0/16", "203.0.113.5"]
    assert client.get("/api/routing/routes", auth=("admin", "secret")).json() == [
        "10.20.0.0/16",
        "203.0.113.5",
    ]


def test_routing_routes_bulk_set_rejects_invalid_entries_without_saving_anything(
    tmp_path: Path,
) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)
    client.post("/api/routing/routes", auth=("admin", "secret"), json={"value": "10.1.0.0/16"})

    response = client.put(
        "/api/routing/routes",
        auth=("admin", "secret"),
        json={"items": ["10.20.0.0/16", "not-a-route"]},
    )

    assert response.status_code == 400
    assert client.get("/api/routing/routes", auth=("admin", "secret")).json() == ["10.1.0.0/16"]


def test_routing_domains_bulk_set_replaces_the_whole_list(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.put(
        "/api/routing/domains",
        auth=("admin", "secret"),
        json={"items": ["corp.example.com", "internal.example"]},
    )

    assert response.status_code == 200
    assert response.json() == ["corp.example.com", "internal.example"]
