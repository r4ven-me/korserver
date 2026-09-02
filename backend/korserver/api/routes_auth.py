from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from korserver.api.auth import (
    SESSION_COOKIE,
    admin_identity,
    auth_registry,
    authenticate_password,
    require_admin,
)
from korserver.api.routes_config import apply_config_patch
from korserver.services.admin_totp import AdminTotpService

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str
    totp_code: str | None = None


@router.post("/login")
def login(request: Request, response: Response, payload: LoginRequest) -> dict[str, object]:
    authenticate_password(request, payload.username, payload.password)
    config = request.app.state.config
    if config.web.admin_totp_enabled:
        secret = config.web.admin_totp_secret
        if not payload.totp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="totp_code_required"
            )
        if secret is None or not AdminTotpService(config).verify_code(secret, payload.totp_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_totp_code"
            )
    token, session = auth_registry(request).create(payload.username)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=config.web.session_lifetime,
        httponly=True,
        secure=config.web.session_cookie_secure,
        samesite="strict",
        path="/",
    )
    request.state.admin_username = payload.username
    request.state.admin_session = session
    return admin_identity(request)


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        auth_registry(request).revoke(token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"authenticated": False}


@router.get("/me")
def me(
    request: Request,
    _: Annotated[None, Depends(require_admin)],
) -> dict[str, object]:
    return admin_identity(request)


class TotpConfirmRequest(BaseModel):
    secret: str
    code: str


@router.get("/totp/status")
def totp_status(
    request: Request,
    _: Annotated[None, Depends(require_admin)],
) -> dict[str, object]:
    config = request.app.state.config
    return {"enabled": config.web.admin_totp_enabled}


@router.post("/totp/setup")
def totp_setup(
    request: Request,
    _: Annotated[None, Depends(require_admin)],
) -> dict[str, object]:
    config = request.app.state.config
    service = AdminTotpService(config)
    secret = service.generate_secret()
    qr = service.qr_svg(secret)
    return {
        "secret": secret,
        "otpauth_uri": service.otpauth_uri(secret),
        "qr_svg": qr.stdout if qr.ok else None,
    }


@router.post("/totp/confirm")
def totp_confirm(
    request: Request,
    payload: TotpConfirmRequest,
    _: Annotated[None, Depends(require_admin)],
) -> dict[str, object]:
    config = request.app.state.config
    service = AdminTotpService(config)
    if not service.verify_code(payload.secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_totp_code")
    apply_config_patch(
        request,
        {"web": {"admin_totp_enabled": True, "admin_totp_secret": payload.secret}},
        write_rendered=False,
    )
    return {"status": "enabled"}


@router.post("/totp/disable")
def totp_disable(
    request: Request,
    _: Annotated[None, Depends(require_admin)],
) -> dict[str, object]:
    apply_config_patch(
        request,
        {"web": {"admin_totp_enabled": False, "admin_totp_secret": None}},
        write_rendered=False,
    )
    return {"status": "disabled"}
