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


def test_upstream_settings_saves_check_settle_seconds(tmp_path: Path) -> None:
    # check_settle_seconds previously had no GUI/API control at all -- an
    # admin could only change it by hand-editing the raw YAML tab, per
    # AGENTS.md's "every AppConfig field needs a structured control" rule.
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/settings",
        auth=("admin", "secret"),
        json={"enabled": False, "check_settle_seconds": 30},
    )

    assert response.status_code == 200
    assert response.json()["upstream"]["check_settle_seconds"] == 30
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["check_settle_seconds"] == 30


def test_upstream_settings_saves_connect_on_boot(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/settings",
        auth=("admin", "secret"),
        json={"enabled": False, "connect_on_boot": False},
    )

    assert response.status_code == 200
    assert response.json()["upstream"]["connect_on_boot"] is False
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["connect_on_boot"] is False


def test_upstream_profile_saves_host_routing_fields(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "finance",
            "server": "vpn.example.com",
            "auth_type": "password",
            "username": "user",
            "password": "secret",
            "route_clients_enabled": False,
            "route_host_enabled": True,
            "host_routes": ["10.90.0.0/16"],
            "host_domains": ["finance-internal.corp"],
            "enable": True,
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    profile = saved["upstream"]["profiles"][0]
    assert profile["route_clients_enabled"] is False
    assert profile["route_host_enabled"] is True
    assert profile["host_routes"] == ["10.90.0.0/16"]
    assert profile["host_domains"] == ["finance-internal.corp"]


def test_upstream_settings_response_masks_profile_camouflage_secret(tmp_path: Path) -> None:
    # Regression test: this endpoint's response used its own separate
    # exclude set (password/cert_pass/cert_file_base64/key_file_base64)
    # that never included camouflage_secret, leaking it in plaintext here
    # even after the other /api/upstream/* endpoints were fixed.
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
        "/api/upstream/settings",
        auth=("admin", "secret"),
        json={"enabled": True, "check_interval": 10},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "camo-secret" not in str(payload)
    assert payload["upstream"]["profiles"][0]["camouflage_secret"] == "***"


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


def test_upstream_profile_response_masks_base64_cert_and_key_material(tmp_path: Path) -> None:
    # cert_file_base64/key_file_base64 don't match is_secret_key()'s generic
    # name pattern (password/token/secret/etc.) at all, so _safe_profile_dump()
    # needs an explicit override for them alongside the generic check.
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.upstream.example.com",
            "auth_type": "p12",
            "cert_file_base64": "aGVsbG8=",
            "key_file_base64": "d29ybGQ=",
        },
    )

    assert response.status_code == 200
    profile = response.json()["profiles"][0]
    assert profile["cert_file_base64"] == "***"
    assert profile["key_file_base64"] == "***"
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["cert_file_base64"] == "aGVsbG8="
    assert saved["upstream"]["profiles"][0]["key_file_base64"] == "d29ybGQ="


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


def test_upstream_profile_saves_routes_and_domains(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "finance",
            "server": "finance.example.com",
            "auth_type": "password",
            "username": "user",
            "routes": ["10.50.0.0/16"],
            "domains": ["finance-internal.corp"],
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["profiles"][0]["routes"] == ["10.50.0.0/16"]
    assert saved["upstream"]["profiles"][0]["domains"] == ["finance-internal.corp"]


def test_editing_an_existing_profile_does_not_change_the_active_one(tmp_path: Path) -> None:
    # Regression test: adding routes/domains to a profile (making it a named
    # target) is unrelated to which profile is active/default -- saving the
    # edit form for it must not silently steer active_profile away from
    # whatever the admin already had selected.
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)
    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "primary",
            "server": "vpn.example.com",
            "auth_type": "password",
            "username": "u",
        },
    )
    client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "finance",
            "server": "finance.example.com",
            "auth_type": "password",
            "username": "u",
        },
    )
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["active_profile"] == "primary"

    response = client.post(
        "/api/upstream/profiles",
        auth=("admin", "secret"),
        json={
            "name": "finance",
            "server": "finance.example.com",
            "auth_type": "password",
            "username": "u",
            "routes": ["10.50.0.0/16"],
        },
    )

    assert response.status_code == 200
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["upstream"]["active_profile"] == "primary"
    assert saved["upstream"]["profiles"][1]["routes"] == ["10.50.0.0/16"]
