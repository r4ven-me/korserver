from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from korserver.api.auth import require_admin
from korserver.api.routes_config import apply_config_patch
from korserver.config.models import AppConfig
from korserver.services.internal_dns import InternalDnsService

router = APIRouter(dependencies=[Depends(require_admin)])


class InternalDnsSettingsRequest(BaseModel):
    enabled: bool = False
    blocklist_domains: list[str] = Field(default_factory=list)
    blocklist_files: list[str] = Field(default_factory=list)
    blocklist_urls: list[str] = Field(default_factory=list)
    cache_size: int = 150
    log_queries: bool = False
    local_records: list[str] = Field(default_factory=list)


class BlocklistRefreshRequest(BaseModel):
    url: str
    preview: bool = False


@router.get("/status")
def internal_dns_status(request: Request) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    return InternalDnsService(config).status()


@router.get("/blocklist")
def internal_dns_blocklist(
    request: Request,
    limit: int = Query(default=1000, ge=1, le=100000),
) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    merged = InternalDnsService(config).merged_blocklist()
    return {"total": len(merged), "domains": merged[:limit]}


@router.post("/settings")
def save_internal_dns_settings(
    request: Request,
    payload: InternalDnsSettingsRequest,
) -> dict[str, object]:
    patch = {
        "internal_dns": {
            "enabled": payload.enabled,
            "blocklist_domains": payload.blocklist_domains,
            "blocklist_files": payload.blocklist_files,
            "blocklist_urls": payload.blocklist_urls,
            "cache_size": payload.cache_size,
            "log_queries": payload.log_queries,
            "local_records": payload.local_records,
        }
    }
    loaded_config, written = apply_config_patch(request, patch)
    return {
        "status": "saved",
        "written": written,
        "internal_dns": InternalDnsService(loaded_config).status(),
    }


@router.post("/blocklist/refresh")
def refresh_blocklist(
    request: Request,
    payload: BlocklistRefreshRequest,
) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    if payload.url not in config.internal_dns.blocklist_urls:
        raise HTTPException(
            status_code=400,
            detail="url is not one of the saved internal_dns.blocklist_urls; save it first",
        )
    result = InternalDnsService(config).refresh_url_blocklist(payload.url, preview=payload.preview)
    written: list[str] = []
    if result.saved and config.internal_dns.enabled:
        from korserver.services.config import ConfigService

        written = [str(path) for path in ConfigService().write_rendered_files(config)]
    return {
        "status": "previewed" if payload.preview else "refreshed",
        "url": result.url,
        "total_lines": result.total_lines,
        "valid": result.valid,
        "skipped": result.skipped,
        "sample": result.sample,
        "saved": result.saved,
        "written": written,
    }
