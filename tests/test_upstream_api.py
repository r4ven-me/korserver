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
""",
        encoding="utf-8",
    )
    return TestClient(create_app(config_path=config_path))


def test_upstream_settings_saves_failover_fields(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/settings",
        auth=("admin", "secret"),
        json={
            "enabled": False,
            "check_interval": 10,
            "check_threshold": 5,
            "failover": True,
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["check_interval"] == 10
    assert saved["upstream"]["check_threshold"] == 5
    assert saved["upstream"]["failover"] is True


def test_upstream_profile_saves_cert_pass_but_never_returns_it(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
            "cert_pass": "super-secret",
            "server_cert_pin": "pin-sha256:abc123",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "super-secret" not in str(payload)
    assert payload["profiles"][0]["server_cert_pin"] == "pin-sha256:abc123"
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["cert_pass"] == "super-secret"


def test_upstream_profile_edit_without_secrets_preserves_them(tmp_path: Path) -> None:
    # Regression test: editing a profile via the UI can never re-send a
    # write-only secret (the GET response never returns it), so omitting it
    # must keep the previously saved value instead of wiping it out.
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
            "cert_pass": "super-secret",
        },
    )

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
            "check_host": "1.1.1.1",
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["cert_pass"] == "super-secret"
    assert saved["upstream"]["profiles"][0]["check_host"] == "1.1.1.1"


def test_upstream_profile_saves_camouflage_secret_but_never_returns_it(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "password",
            "username": "user",
            "password": "pw",
            "camouflage_secret": "camo-secret",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "camo-secret" not in str(payload)
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["camouflage_secret"] == "camo-secret"


def test_upstream_profile_edit_without_camouflage_secret_preserves_it(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "password",
            "username": "user",
            "password": "pw",
            "camouflage_secret": "camo-secret",
        },
    )

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "password",
            "username": "user",
            "check_host": "1.1.1.1",
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["camouflage_secret"] == "camo-secret"


def test_upstream_profile_edit_can_switch_cert_source_from_path_to_base64(
    tmp_path: Path,
) -> None:
    # Explicitly switching source modes must not be treated as "left blank":
    # providing cert_file_base64 drops the old cert_file path.
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
        },
    )

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file_base64": "aGVsbG8=",
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["cert_file_base64"] == "aGVsbG8="
    assert saved["upstream"]["profiles"][0].get("cert_file") is None


def test_delete_upstream_profile(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
        },
    )

    response = client.delete("/api/upstream/profiles/primary", auth=("admin", "secret"))

    assert response.status_code == 200
    assert response.json()["profiles"] == []
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"] == []
    assert saved["upstream"]["active_profile"] is None
    assert saved["upstream"]["enabled"] is False


def test_delete_upstream_profile_reassigns_active_profile(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    for name in ("primary", "backup"):
        client.post(
            "/api/upstream/profiles",
            auth=("admin", "secret"),
            json={
                "name": name,
                "server": "vpn.upstream.example.com",
                "auth_type": "p12",
                "cert_file": "/certs/client.p12",
            },
        )

    response = client.delete("/api/upstream/profiles/backup", auth=("admin", "secret"))

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert [item["name"] for item in saved["upstream"]["profiles"]] == ["primary"]
    assert saved["upstream"]["active_profile"] == "primary"


def test_set_profile_enabled_persists_the_flag(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)
    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
        },
    )

    response = client.post(
        "/api/upstream/profiles/primary/enabled",
        auth=("admin", "secret"),
        json={"enabled": False},
    )

    assert response.status_code == 200
    assert response.json()["profiles"][0]["enabled"] is False
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["enabled"] is False


def test_set_profile_enabled_does_not_touch_other_profiles(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)
    for name in ("primary", "backup"):
        client.post(
            "/api/upstream/profiles",
            auth=("admin", "secret"),
            json={
                "name": name,
                "server": "vpn.upstream.example.com",
                "auth_type": "p12",
                "cert_file": "/certs/client.p12",
            },
        )

    response = client.post(
        "/api/upstream/profiles/backup/enabled",
        auth=("admin", "secret"),
        json={"enabled": False},
    )

    assert response.status_code == 200
    by_name = {item["name"]: item["enabled"] for item in response.json()["profiles"]}
    assert by_name == {"primary": True, "backup": False}


def test_set_profile_enabled_rejects_unknown_profile(tmp_path: Path) -> None:
    client = _client(tmp_path / "config.yaml", tmp_path)

    response = client.post(
        "/api/upstream/profiles/ghost/enabled",
        auth=("admin", "secret"),
        json={"enabled": False},
    )

    assert response.status_code == 404


def test_upstream_status_reports_not_connected_by_default(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.get("/api/upstream/status", auth=("admin", "secret"))

    assert response.status_code == 200
    assert response.json()["connected"] is False


def test_upstream_disconnect_is_a_noop_when_not_connected(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post("/api/upstream/disconnect", auth=("admin", "secret"))

    assert response.status_code == 200
    assert response.json()["stdout"] == "not connected"


def test_upstream_profile_connect_endpoint_dry_run(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)
    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "backup",
            "server": "backup.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
            "interface": "oc-backup0",
        },
    )

    response = client.post(
        "/api/upstream/profiles/backup/connect",
        auth=("admin", "secret"),
        json={"dry_run": True},
    )

    assert response.status_code == 200
    assert response.json()["dry_run"] is True

    profiles = client.get("/api/upstream", auth=("admin", "secret")).json()
    assert profiles[0]["interface"] == "oc-backup0"


def test_upstream_profile_disconnect_endpoint_noop(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)
    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "backup",
            "server": "backup.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
        },
    )

    response = client.post(
        "/api/upstream/profiles/backup/disconnect", auth=("admin", "secret")
    )

    assert response.status_code == 200
    assert response.json()["stdout"] == "not connected"


def test_upstream_status_includes_connections_list(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)
    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.example.com",
            "auth_type": "p12",
            "cert_file": "/certs/client.p12",
        },
    )

    payload = client.get("/api/upstream/status", auth=("admin", "secret")).json()

    assert payload["connected"] is False
    assert payload["local_ip"] is None
    assert payload["connections"][0]["profile"] == "primary"
    assert payload["connections"][0]["connected"] is False
