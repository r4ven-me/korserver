from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from korserver.api.app import create_app
from korserver.services import internal_dns


def _client(config_path: Path, tmp_path: Path, extra: str = "") -> TestClient:
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
{extra}""",
        encoding="utf-8",
    )
    return TestClient(create_app(config_path=config_path))


def test_internal_dns_status_defaults(tmp_path: Path) -> None:
    client = _client(tmp_path / "config.yaml", tmp_path)

    response = client.get("/api/internal-dns/status", auth=("admin", "secret"))

    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False
    assert payload["client_dns"] == ["1.1.1.1", "8.8.8.8"]
    assert payload["total"] == 0


def test_internal_dns_settings_enable_switches_client_dns(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/internal-dns/settings",
        auth=("admin", "secret"),
        json={
            "enabled": True,
            "blocklist_domains": ["Ads.Example.COM"],
            "blocklist_urls": ["https://lists.example.com/hosts.txt"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["internal_dns"]["enabled"] is True
    assert payload["internal_dns"]["client_dns"] == ["10.10.10.1"]
    assert payload["internal_dns"]["blocklist_domains"] == ["ads.example.com"]

    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["internal_dns"]["enabled"] is True
    assert saved["internal_dns"]["blocklist_urls"] == ["https://lists.example.com/hosts.txt"]

    generated_dnsmasq = tmp_path / "generated" / "dnsmasq.conf"
    assert generated_dnsmasq.exists()
    assert "dnsmasq-blocklist.conf" in generated_dnsmasq.read_text(encoding="utf-8")
    blocklist_conf = tmp_path / "generated" / "dnsmasq-blocklist.conf"
    assert "address=/ads.example.com/0.0.0.0" in blocklist_conf.read_text(encoding="utf-8")

    ocserv_conf = (tmp_path / "generated" / "ocserv.conf").read_text(encoding="utf-8")
    assert "dns = 10.10.10.1" in ocserv_conf


def test_internal_dns_settings_saves_cache_size_log_queries_and_local_records(
    tmp_path: Path,
) -> None:
    config_path = tmp_path / "config.yaml"
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/internal-dns/settings",
        auth=("admin", "secret"),
        json={
            "enabled": False,
            "cache_size": 1000,
            "log_queries": True,
            "local_records": ["nas.corp.local 10.11.11.5"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["internal_dns"]["cache_size"] == 1000
    assert payload["internal_dns"]["log_queries"] is True
    assert payload["internal_dns"]["local_records"] == ["nas.corp.local 10.11.11.5"]

    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["internal_dns"]["cache_size"] == 1000
    assert saved["internal_dns"]["log_queries"] is True
    assert saved["internal_dns"]["local_records"] == ["nas.corp.local 10.11.11.5"]


def test_internal_dns_settings_rejects_bad_url(tmp_path: Path) -> None:
    client = _client(tmp_path / "config.yaml", tmp_path)

    response = client.post(
        "/api/internal-dns/settings",
        auth=("admin", "secret"),
        json={"enabled": False, "blocklist_urls": ["ftp://lists.example.com/x"]},
    )

    assert response.status_code == 400
    assert "HTTP(S)" in response.json()["detail"]


def test_internal_dns_settings_rejects_invalid_domains(tmp_path: Path) -> None:
    client = _client(tmp_path / "config.yaml", tmp_path)

    response = client.post(
        "/api/internal-dns/settings",
        auth=("admin", "secret"),
        json={"enabled": False, "blocklist_domains": ["not a domain"]},
    )

    assert response.status_code == 400


def test_internal_dns_refresh_preview_and_apply(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config_path = tmp_path / "config.yaml"
    url = "https://lists.example.com/hosts.txt"
    client = _client(
        config_path,
        tmp_path,
        extra=f"""
internal_dns:
  enabled: true
  blocklist_urls:
    - {url}
""",
    )
    monkeypatch.setattr(
        internal_dns,
        "_fetch_blocklist_text",
        lambda url: "0.0.0.0 ads.example.com\n0.0.0.0 tracker.example.net\nbad line here\n",
    )

    preview = client.post(
        "/api/internal-dns/blocklist/refresh",
        auth=("admin", "secret"),
        json={"url": url, "preview": True},
    )
    assert preview.status_code == 200
    body = preview.json()
    assert body["status"] == "previewed"
    assert body["valid"] == 2
    assert body["skipped"] == 1
    assert body["saved"] is False
    assert body["sample"] == ["ads.example.com", "tracker.example.net"]

    applied = client.post(
        "/api/internal-dns/blocklist/refresh",
        auth=("admin", "secret"),
        json={"url": url},
    )
    assert applied.status_code == 200
    assert applied.json()["saved"] is True
    blocklist_conf = tmp_path / "generated" / "dnsmasq-blocklist.conf"
    content = blocklist_conf.read_text(encoding="utf-8")
    assert "address=/ads.example.com/0.0.0.0" in content
    assert "address=/tracker.example.net/0.0.0.0" in content

    listing = client.get("/api/internal-dns/blocklist?limit=1", auth=("admin", "secret"))
    assert listing.status_code == 200
    assert listing.json()["total"] == 2
    assert len(listing.json()["domains"]) == 1


def test_internal_dns_refresh_without_url_fails(tmp_path: Path) -> None:
    client = _client(tmp_path / "config.yaml", tmp_path)

    response = client.post(
        "/api/internal-dns/blocklist/refresh",
        auth=("admin", "secret"),
        json={},
    )

    assert response.status_code == 422


def test_internal_dns_refresh_rejects_url_not_saved(tmp_path: Path) -> None:
    client = _client(tmp_path / "config.yaml", tmp_path)

    response = client.post(
        "/api/internal-dns/blocklist/refresh",
        auth=("admin", "secret"),
        json={"url": "https://unsaved.example.com/hosts.txt"},
    )

    assert response.status_code == 400
    assert "not one of the saved" in response.json()["detail"]


def test_internal_dns_status_lists_multiple_files_and_urls(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    blocklist_file = tmp_path / "extra.txt"
    blocklist_file.write_text("extra.example.com\n", encoding="utf-8")
    client = _client(config_path, tmp_path)

    response = client.post(
        "/api/internal-dns/settings",
        auth=("admin", "secret"),
        json={
            "enabled": True,
            "blocklist_files": [str(blocklist_file)],
            "blocklist_urls": [
                "https://lists.example.com/a.txt",
                "https://lists.example.com/b.txt",
            ],
        },
    )
    assert response.status_code == 200

    status = client.get("/api/internal-dns/status", auth=("admin", "secret"))
    assert status.status_code == 200
    payload = status.json()
    assert len(payload["blocklist_files"]) == 1
    assert payload["blocklist_files"][0]["path"] == str(blocklist_file)
    assert payload["blocklist_files"][0]["exists"] is True
    assert payload["blocklist_files"][0]["count"] == 1
    assert [entry["url"] for entry in payload["blocklist_urls"]] == [
        "https://lists.example.com/a.txt",
        "https://lists.example.com/b.txt",
    ]
    assert all(entry["count"] == 0 for entry in payload["blocklist_urls"])
    assert all(entry["meta"] is None for entry in payload["blocklist_urls"])


def test_internal_dns_settings_deletes_last_entry_migrated_from_legacy_field(
    tmp_path: Path,
) -> None:
    """Regression test: a config saved back when only the singular
    `blocklist_file`/`blocklist_url` fields existed still has that legacy
    key sitting in the YAML file (the migrate_singular_blocklist_fields
    validator only folds it into blocklist_files/urls in memory -- it never
    scrubs the source key from what apply_config_patch writes back to
    disk). Deleting every entry down to that last, legacy-sourced one and
    saving an empty list used to resurrect it on the very next load: the
    validator sees the legacy key still present and an empty (falsy)
    blocklist_files, and folds it right back in."""
    config_path = tmp_path / "config.yaml"
    client = _client(
        config_path,
        tmp_path,
        extra=(
            "internal_dns:\n"
            "  enabled: true\n"
            "  blocklist_file: /legacy/blocklist.txt\n"
            "  blocklist_files: [/legacy/blocklist.txt]\n"
        ),
    )

    response = client.post(
        "/api/internal-dns/settings",
        auth=("admin", "secret"),
        json={"enabled": True, "blocklist_files": []},
    )
    assert response.status_code == 200
    assert response.json()["internal_dns"]["blocklist_files"] == []

    status = client.get("/api/internal-dns/status", auth=("admin", "secret"))
    assert status.json()["blocklist_files"] == []

    # The legacy key is nulled out (not necessarily removed), which is
    # enough to stop the migration validator from resurrecting it.
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert raw["internal_dns"].get("blocklist_file") is None


def test_internal_dns_requires_auth(tmp_path: Path) -> None:
    client = _client(tmp_path / "config.yaml", tmp_path)
    assert client.get("/api/internal-dns/status").status_code == 401
