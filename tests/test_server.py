from __future__ import annotations

from pathlib import Path
from typing import Any

from korserver.config.models import AppConfig
from korserver.services.server import ServerService
from korserver.services.supervisor_rpc import SupervisorRpcError


class FakeRpcClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, ...]] = []
        self.all_process_info: list[dict[str, Any]] = []
        self.fail_stop_with: str | None = None

    def start_process(self, name: str) -> None:
        self.calls.append(("startProcess", name))

    def stop_process(self, name: str) -> None:
        self.calls.append(("stopProcess", name))
        if self.fail_stop_with:
            raise SupervisorRpcError(self.fail_stop_with)

    def signal_process(self, name: str, signal_name: str) -> None:
        self.calls.append(("signalProcess", name, signal_name))

    def get_process_info(self, name: str) -> dict[str, Any]:
        self.calls.append(("getProcessInfo", name))
        return {"name": name, "statename": "RUNNING", "description": "pid 1, uptime 0:00:01"}

    def get_all_process_info(self) -> list[dict[str, Any]]:
        self.calls.append(("getAllProcessInfo",))
        return self.all_process_info


def test_server_start_stop_restart_use_supervisor_rpc(tmp_path: Path) -> None:
    config = AppConfig.model_validate(
        {
            "system": {
                "generated_dir": tmp_path,
                "data_dir": tmp_path,
                "secrets_dir": tmp_path / "secrets",
            }
        }
    )
    rpc = FakeRpcClient()
    service = ServerService(config, rpc_client=rpc)

    service.start(dry_run=True)
    assert rpc.calls == []

    service.stop()
    service.restart()

    assert rpc.calls == [
        ("stopProcess", "ocserv"),
        ("stopProcess", "ocserv"),
        ("startProcess", "ocserv"),
    ]


def test_server_restart_ignores_not_running_fault(tmp_path: Path) -> None:
    config = AppConfig.model_validate(
        {
            "system": {
                "generated_dir": tmp_path,
                "data_dir": tmp_path,
                "secrets_dir": tmp_path / "secrets",
            }
        }
    )
    rpc = FakeRpcClient()
    rpc.fail_stop_with = "NOT_RUNNING"
    service = ServerService(config, rpc_client=rpc)

    result = service.restart()

    assert result.ok
    assert rpc.calls == [("stopProcess", "ocserv"), ("startProcess", "ocserv")]


def test_server_reload_signals_hup(tmp_path: Path) -> None:
    config = AppConfig.model_validate({"system": {"generated_dir": tmp_path}})
    rpc = FakeRpcClient()
    service = ServerService(config, rpc_client=rpc)

    result = service.reload()

    assert result.ok
    assert rpc.calls == [("signalProcess", "ocserv", "HUP")]


def test_server_processes_report_managed_processes_only(tmp_path: Path) -> None:
    config = AppConfig.model_validate({"system": {"generated_dir": tmp_path}})
    rpc = FakeRpcClient()
    rpc.all_process_info = [
        {"name": "api", "statename": "RUNNING", "description": "pid 1, uptime 0:00:01"},
        {"name": "ocserv", "statename": "RUNNING", "description": "pid 2, uptime 0:00:01"},
    ]
    service = ServerService(config, rpc_client=rpc)

    processes = service.processes()

    assert [(item.name, item.state) for item in processes] == [
        ("api", "RUNNING"),
        ("ocserv", "RUNNING"),
        ("dnsmasq", "DISABLED"),
        ("certbot-renew", "DISABLED"),
        ("upstream-watchdog", "DISABLED"),
    ]


def test_server_status_reports_rpc_failure(tmp_path: Path) -> None:
    config = AppConfig.model_validate({"system": {"generated_dir": tmp_path}})

    class BrokenRpcClient(FakeRpcClient):
        def get_all_process_info(self) -> list[dict[str, Any]]:
            raise SupervisorRpcError(
                "cannot reach supervisord: [Errno 2] No such file or directory"
            )

    service = ServerService(config, rpc_client=BrokenRpcClient())

    result = service.status()

    assert not result.ok
    assert "cannot reach supervisord" in result.stderr
