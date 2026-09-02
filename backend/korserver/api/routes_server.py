from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from korserver.api.auth import require_admin
from korserver.api.routes_config import apply_config_patch
from korserver.config.models import AppConfig
from korserver.services.command import CommandResult
from korserver.services.server import ServerService

router = APIRouter(dependencies=[Depends(require_admin)])


class DryRunRequest(BaseModel):
    dry_run: bool = False


class ProcessActionRequest(BaseModel):
    action: str
    process: str
    dry_run: bool = False


class CamouflageSettings(BaseModel):
    enabled: bool = False
    secret: str | None = None
    realm: str = "Hidden service"


class ServerSettingsRequest(BaseModel):
    enabled: bool = True
    listen: str = "0.0.0.0"
    port: int = Field(default=443, ge=1, le=65535)
    udp_enabled: bool = True
    device: str = "vpns"
    cn: str = "vpn.example.com"
    realm: str = "Korvus VPN Server"
    ipv4_network: str = "10.10.10.0/24"
    dns: list[str] = Field(default_factory=list)
    search_domains: list[str] = Field(default_factory=list)
    routes: list[str] = Field(default_factory=list)
    no_routes: list[str] = Field(default_factory=list)
    max_clients: int = Field(default=128, ge=1)
    max_same_clients: int = Field(default=2, ge=1)
    keepalive: int = Field(default=32400, ge=0)
    compression: bool = False
    cisco_client_compat: bool = True
    camouflage: CamouflageSettings = Field(default_factory=CamouflageSettings)
    connect_script: str | None = None
    disconnect_script: str | None = None
    debug_level: int = Field(default=1, ge=0, le=9)
    reload: bool = True


class AuthMethodsSettingsRequest(BaseModel):
    password_enabled: bool = True
    certificate_enabled: bool = False
    otp_enabled: bool = False
    otp_ocserv_oath_auth: bool = False
    otp_issuer: str = "Korvus Server"
    otp_send_by_email: bool = False
    otp_send_by_telegram: bool = False


def command_result(result: CommandResult, argv: tuple[str, ...] | None = None) -> dict[str, object]:
    return {
        "argv": list(argv or result.argv),
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "dry_run": result.dry_run,
    }


@router.post("/settings")
def save_server_settings(
    request: Request,
    payload: ServerSettingsRequest,
) -> dict[str, object]:
    patch = payload.model_dump(exclude={"reload"})
    loaded_config, written = apply_config_patch(request, {"server": patch})
    # Rewriting ocserv.conf alone does not make the *running* ocserv process
    # pick up the change (e.g. max-same-clients, debug_level) -- without a
    # reload, the server keeps enforcing whatever was last loaded, silently
    # diverging from what the panel shows as saved.
    reload_result = ServerService(loaded_config).reload() if payload.reload else None
    return {
        "status": "saved",
        "written": written,
        "server": loaded_config.model_dump_safe()["server"],
        "reload": command_result(reload_result, ("korctl", "server", "reload"))
        if reload_result
        else None,
    }


@router.post("/auth-settings")
def save_auth_methods_settings(
    request: Request,
    payload: AuthMethodsSettingsRequest,
) -> dict[str, object]:
    patch = {
        "password": {"enabled": payload.password_enabled},
        "certificate": {"enabled": payload.certificate_enabled},
        "otp": {
            "enabled": payload.otp_enabled,
            "ocserv_oath_auth": payload.otp_ocserv_oath_auth,
            "issuer": payload.otp_issuer,
            "send_by_email": payload.otp_send_by_email,
            "send_by_telegram": payload.otp_send_by_telegram,
        },
    }
    loaded_config, written = apply_config_patch(request, {"auth": patch})
    return {
        "status": "saved",
        "written": written,
        "auth": loaded_config.model_dump_safe()["auth"],
    }


@router.get("/status")
def status(request: Request) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    return command_result(ServerService(config).status(), ("korctl", "server", "status"))


@router.get("/processes")
def processes(request: Request) -> list[dict[str, str]]:
    config: AppConfig = request.app.state.config
    return [process.__dict__ for process in ServerService(config).processes()]


@router.post("/reload")
def reload_server(request: Request, payload: DryRunRequest | None = None) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    return command_result(
        ServerService(config).reload(dry_run=payload.dry_run if payload else False),
        ("korctl", "server", "reload"),
    )


@router.post("/restart")
def restart_server(request: Request, payload: DryRunRequest | None = None) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    return command_result(
        ServerService(config).restart(dry_run=payload.dry_run if payload else False),
        ("korctl", "server", "restart"),
    )


@router.post("/start")
def start_server(request: Request, payload: DryRunRequest | None = None) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    return command_result(
        ServerService(config).start(dry_run=payload.dry_run if payload else False),
        ("korctl", "server", "start"),
    )


@router.post("/stop")
def stop_server(request: Request, payload: DryRunRequest | None = None) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    return command_result(
        ServerService(config).stop(dry_run=payload.dry_run if payload else False),
        ("korctl", "server", "stop"),
    )


@router.post("/process")
def process_action(request: Request, payload: ProcessActionRequest) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    try:
        result = ServerService(config).process_action(
            payload.action,
            payload.process,
            dry_run=payload.dry_run,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return command_result(
        result,
        ("korctl", "server", "process", payload.action, payload.process),
    )
