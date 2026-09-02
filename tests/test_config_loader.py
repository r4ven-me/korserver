from __future__ import annotations

from pathlib import Path

from korserver.config.loader import load_config


def test_load_config_defaults_when_file_is_missing(tmp_path: Path) -> None:
    config = load_config(tmp_path / "missing.yaml", environ={})

    assert config.server.port == 443
    assert config.web.enabled is False
    assert config.routing.mode == "full"
    assert config.system.log_rotation.enabled is False
    assert config.certificates.letsencrypt.auto_renew_interval == 7
    assert config.certificates.letsencrypt.auto_renew_interval_unit == "days"


def test_legacy_auto_renew_interval_hours_still_loads(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
certificates:
  letsencrypt:
    auto_renew_interval_hours: 36
""",
        encoding="utf-8",
    )

    le = load_config(config_path, environ={}).certificates.letsencrypt

    assert le.auto_renew_interval == 36
    assert le.auto_renew_interval_unit == "hours"
    assert le.auto_renew_interval_seconds == 36 * 3600


def test_auto_renew_interval_units_convert_to_seconds(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
certificates:
  letsencrypt:
    auto_renew_interval: 2
    auto_renew_interval_unit: months
""",
        encoding="utf-8",
    )

    le = load_config(config_path, environ={}).certificates.letsencrypt

    assert le.auto_renew_interval_seconds == 2 * 30 * 86400


def test_secret_refs_resolve_from_dotenv(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    env_path = tmp_path / ".env"
    config_path.write_text(
        """
web:
  admin_password: "${SECRET:ADMIN_PASSWORD}"
""",
        encoding="utf-8",
    )
    env_path.write_text("ADMIN_PASSWORD=from-dotenv\n", encoding="utf-8")

    config = load_config(config_path, env_file=env_path, environ={})

    assert config.web.admin_password == "from-dotenv"


def test_single_segment_korserver_secret_name_is_not_treated_as_override(
    tmp_path: Path,
) -> None:
    config_path = tmp_path / "config.yaml"
    env_path = tmp_path / ".env"
    config_path.write_text(
        """
web:
  admin_password: "${SECRET:KORSERVER_ADMIN_PASSWORD}"
""",
        encoding="utf-8",
    )
    env_path.write_text("KORSERVER_ADMIN_PASSWORD=from-dotenv\n", encoding="utf-8")

    config = load_config(config_path, env_file=env_path, environ={})

    assert config.web.admin_password == "from-dotenv"
