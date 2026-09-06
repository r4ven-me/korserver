from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from korserver.api.auth import require_admin
from korserver.api.routes_config import apply_config_patch
from korserver.config.models import AppConfig
from korserver.services.command import CommandResult
from korserver.services.config import ConfigService
from korserver.services.nftables import NftablesService
from korserver.services.routing import RoutingService

router = APIRouter(dependencies=[Depends(require_admin)])


class ItemRequest(BaseModel):
    value: str


class ItemsRequest(BaseModel):
    items: list[str]


class DryRunRequest(BaseModel):
    dry_run: bool = False


class RoutingSettingsRequest(BaseModel):
    mode: str
    tunnel_dns: bool = False
    host_traffic: bool = False
    host_mode: str = "full"
    dnsmasq_listen: str | None = None
    dnsmasq_port: int | None = None
    main_interface: str | None = None
    fwmark: str | None = None
    table_id: int | None = None
    nft_prefix: str | None = None


def command_results(
    results: list[CommandResult],
    argv: tuple[str, ...] | None = None,
) -> list[dict[str, object]]:
    return [
        {
            "argv": list(argv or result.argv),
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "dry_run": result.dry_run,
        }
        for result in results
    ]


@router.get("/routes")
def list_routes(request: Request) -> list[str]:
    config: AppConfig = request.app.state.config
    return RoutingService(config).list_routes()


@router.post("/settings")
def save_routing_settings(
    request: Request,
    payload: RoutingSettingsRequest,
) -> dict[str, object]:
    split: dict[str, object] = {
        "tunnel_dns": payload.tunnel_dns,
    }
    if payload.dnsmasq_listen is not None:
        split["dnsmasq_listen"] = payload.dnsmasq_listen
    if payload.dnsmasq_port is not None:
        split["dnsmasq_port"] = payload.dnsmasq_port
    patch: dict[str, object] = {
        "mode": payload.mode,
        "host_traffic": payload.host_traffic,
        "host_mode": payload.host_mode,
        "split": split,
    }
    if payload.main_interface is not None:
        patch["main_interface"] = payload.main_interface
    if payload.fwmark is not None:
        patch["fwmark"] = payload.fwmark
    if payload.table_id is not None:
        patch["table_id"] = payload.table_id
    if payload.nft_prefix is not None:
        patch["nft_prefix"] = payload.nft_prefix
    loaded_config, written = apply_config_patch(request, {"routing": patch})
    return {
        "status": "saved",
        "written": written,
        "routing": loaded_config.routing.model_dump(mode="json"),
    }


@router.post("/routes")
def add_route(
    request: Request,
    payload: ItemRequest,
) -> dict[str, str]:
    config: AppConfig = request.app.state.config
    RoutingService(config).add_route(payload.value)
    return {"status": "added"}


@router.delete("/routes")
def delete_route(
    request: Request,
    payload: ItemRequest,
) -> dict[str, str]:
    config: AppConfig = request.app.state.config
    RoutingService(config).delete_route(payload.value)
    return {"status": "deleted"}


@router.put("/routes")
def set_routes(
    request: Request,
    payload: ItemsRequest,
) -> list[str]:
    config: AppConfig = request.app.state.config
    RoutingService(config).set_routes(payload.items)
    return RoutingService(config).list_routes()


@router.get("/domains")
def list_domains(request: Request) -> list[str]:
    config: AppConfig = request.app.state.config
    return RoutingService(config).list_domains()


@router.post("/domains")
def add_domain(
    request: Request,
    payload: ItemRequest,
) -> dict[str, str]:
    config: AppConfig = request.app.state.config
    RoutingService(config).add_domain(payload.value)
    return {"status": "added"}


@router.delete("/domains")
def delete_domain(
    request: Request,
    payload: ItemRequest,
) -> dict[str, str]:
    config: AppConfig = request.app.state.config
    RoutingService(config).delete_domain(payload.value)
    return {"status": "deleted"}


@router.put("/domains")
def set_domains(
    request: Request,
    payload: ItemsRequest,
) -> list[str]:
    config: AppConfig = request.app.state.config
    RoutingService(config).set_domains(payload.items)
    return RoutingService(config).list_domains()


@router.post("/reload")
def reload_routing(
    request: Request,
    payload: DryRunRequest | None = None,
) -> list[dict[str, object]]:
    config: AppConfig = request.app.state.config
    if not (payload and payload.dry_run):
        ConfigService().write_rendered_files(config)
    return command_results(
        NftablesService(config).apply(dry_run=payload.dry_run if payload else False),
        ("korctl", "routes", "reload"),
    )


@router.get("/nft")
def show_nft(request: Request) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    result = NftablesService(config).show()
    return {
        "argv": ["korctl", "nft", "show"],
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "dry_run": result.dry_run,
    }


@router.post("/nft/apply")
def apply_nft(
    request: Request,
    payload: DryRunRequest | None = None,
) -> list[dict[str, object]]:
    config: AppConfig = request.app.state.config
    return command_results(
        NftablesService(config).apply(dry_run=payload.dry_run if payload else False)
    )


@router.post("/nft/cleanup")
def cleanup_nft(
    request: Request,
    payload: DryRunRequest | None = None,
) -> list[dict[str, object]]:
    config: AppConfig = request.app.state.config
    return command_results(
        NftablesService(config).cleanup(dry_run=payload.dry_run if payload else False),
        ("korctl", "nft", "cleanup"),
    )
