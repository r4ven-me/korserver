from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from korserver.api.auth import require_admin
from korserver.api.routes_users import command_result
from korserver.config.models import AppConfig
from korserver.services.command import CommandResult
from korserver.services.groups import GroupConfigService
from korserver.services.users import UserConfig

router = APIRouter(dependencies=[Depends(require_admin)])


class GroupConfigRequest(UserConfig):
    pass


@router.get("")
def list_groups(request: Request) -> list[dict[str, object]]:
    config: AppConfig = request.app.state.config
    return [record.__dict__ for record in GroupConfigService(config).list_groups()]


@router.get("/{name}/config")
def get_group_config(request: Request, name: str) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    try:
        group_config = GroupConfigService(config).read_group_config(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return group_config.model_dump(mode="json")


@router.put("/{name}/config")
def save_group_config(
    request: Request,
    name: str,
    payload: GroupConfigRequest,
) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    try:
        result = GroupConfigService(config).save_group_config(name, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return command_result(result, ("korctl", "identity", "group", "config", "save", name))


@router.delete("/{name}/config")
def delete_group_config(request: Request, name: str) -> dict[str, object]:
    config: AppConfig = request.app.state.config
    try:
        deleted = GroupConfigService(config).delete_group_config(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return command_result(
        CommandResult(
            ("korctl", "identity", "group", "config", "delete", name),
            0,
            f"deleted: {str(deleted).lower()}\n",
            "",
            False,
        )
    )
