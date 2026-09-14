from __future__ import annotations

from pathlib import Path

from korserver.config.env import parse_dotenv_file
from korserver.config.loader import load_config


def test_parse_dotenv_file_handles_common_dotenv_syntax(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text(
        """
# comments and empty lines are ignored
export KORSERVER_SERVER__REALM="Corp # VPN"
KORSERVER_SERVER__CN=vpn.example.com # inline comment
KORSERVER_WEB__ADMIN_PASSWORD='hash#kept'
KORSERVER_CERTIFICATES__CA_NAME="Line\\nTwo"
INVALID-KEY=ignored
""",
        encoding="utf-8",
    )

    values = parse_dotenv_file(env_path)

    assert values == {
        "KORSERVER_SERVER__REALM": "Corp # VPN",
        "KORSERVER_SERVER__CN": "vpn.example.com",
        "KORSERVER_WEB__ADMIN_PASSWORD": "hash#kept",
        "KORSERVER_CERTIFICATES__CA_NAME": "Line\nTwo",
    }


def test_env_overrides_yaml_and_dotenv(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    env_path = tmp_path / ".env"
    config_path.write_text(
        """
server:
  port: 443
  dns:
    - 8.8.8.8
web:
  enabled: false
""",
        encoding="utf-8",
    )
    env_path.write_text(
        "KORSERVER_SERVER__PORT=4443\nKORSERVER_WEB__ENABLED=true\n",
        encoding="utf-8",
    )

    config = load_config(
        config_path,
        env_file=env_path,
        environ={
            "KORSERVER_SERVER__DNS": '["1.1.1.1", "9.9.9.9"]',
            "KORSERVER_WEB__ENABLED": "false",
        },
    )

    assert config.server.port == 4443
    assert config.server.dns == ["1.1.1.1", "9.9.9.9"]
    assert config.web.enabled is False


def test_cli_overrides_env(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        environ={"KORSERVER_SERVER__PORT": "4443"},
        cli_overrides={"server": {"port": 10443}},
    )

    assert config.server.port == 10443


def test_numeric_password_env_override_stays_string(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        environ={
            "KORSERVER_WEB__ENABLED": "true",
            "KORSERVER_WEB__ADMIN_PASSWORD": "12345678",
        },
    )

    assert config.web.admin_password == "12345678"
