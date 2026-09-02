from __future__ import annotations

import base64
import secrets
import threading
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from korserver.services.password_hash import verify_password

SESSION_COOKIE = "korserver_session"


@dataclass(frozen=True)
class BasicCredentials:
    username: str
    password: str


@dataclass
class AdminSession:
    username: str
    csrf_token: str
    expires_at: float


class AuthSessionRegistry:
    def __init__(self, lifetime_seconds: int = 3600) -> None:
        self._lifetime_seconds = lifetime_seconds
        self._sessions: dict[str, AdminSession] = {}
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def create(self, username: str) -> tuple[str, AdminSession]:
        with self._lock:
            self._prune()
            token = secrets.token_urlsafe(48)
            session = AdminSession(
                username=username,
                csrf_token=secrets.token_urlsafe(32),
                expires_at=time.monotonic() + self._lifetime_seconds,
            )
            self._sessions[token] = session
            return token, session

    def get(self, token: str) -> AdminSession | None:
        with self._lock:
            self._prune()
            session = self._sessions.get(token)
            if session is not None:
                session.expires_at = time.monotonic() + self._lifetime_seconds
            return session

    def revoke(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)

    def login_allowed(self, source: str, limit: int = 5, window_seconds: int = 300) -> bool:
        with self._lock:
            cutoff = time.monotonic() - window_seconds
            attempts = [item for item in self._failures.get(source, []) if item >= cutoff]
            self._failures[source] = attempts
            return len(attempts) < limit

    def record_failure(self, source: str) -> None:
        with self._lock:
            self._failures.setdefault(source, []).append(time.monotonic())

    def clear_failures(self, source: str) -> None:
        with self._lock:
            self._failures.pop(source, None)

    def _prune(self) -> None:
        now = time.monotonic()
        expired = [token for token, session in self._sessions.items() if session.expires_at <= now]
        for token in expired:
            self._sessions.pop(token, None)


def auth_registry(request: Request) -> AuthSessionRegistry:
    registry = getattr(request.app.state, "auth_sessions", None)
    if not isinstance(registry, AuthSessionRegistry):
        registry = AuthSessionRegistry(request.app.state.config.web.session_lifetime)
        request.app.state.auth_sessions = registry
    return registry


def authenticate_password(request: Request, username: str, password: str) -> None:
    config = request.app.state.config
    expected_password = config.web.admin_password
    expected_hash = config.web.admin_password_hash
    if expected_password is None and expected_hash is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin password is not configured",
        )
    source = request.client.host if request.client else "unknown"
    registry = auth_registry(request)
    if not registry.login_allowed(source):
        raise HTTPException(status_code=429, detail="too many failed login attempts")
    password_matches = (
        verify_password(password, expected_hash)
        if expected_hash is not None
        else expected_password is not None
        and secrets.compare_digest(password, expected_password)
    )
    if not (secrets.compare_digest(username, config.web.admin_user) and password_matches):
        registry.record_failure(source)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )
    registry.clear_failures(source)


def require_admin(request: Request) -> None:
    session_token = request.cookies.get(SESSION_COOKIE)
    if session_token:
        session = auth_registry(request).get(session_token)
        if session is not None:
            if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
                csrf_token = request.headers.get("x-korserver-csrf", "")
                if not secrets.compare_digest(csrf_token, session.csrf_token):
                    raise HTTPException(status_code=403, detail="CSRF validation failed")
            request.state.admin_username = session.username
            request.state.admin_session = session
            return

    credentials = parse_basic_authorization(request.headers.get("authorization"))
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )
    authenticate_password(request, credentials.username, credentials.password)
    request.state.admin_username = credentials.username


def parse_basic_authorization(value: str | None) -> BasicCredentials | None:
    if not value:
        return None
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "basic" or not token:
        return None
    try:
        decoded = base64.b64decode(token, validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None
    username, separator, password = decoded.partition(":")
    if not separator:
        return None
    return BasicCredentials(username=username, password=password)


def admin_identity(request: Request) -> dict[str, object]:
    config = request.app.state.config
    session = getattr(request.state, "admin_session", None)
    return {
        "authenticated": True,
        "username": getattr(request.state, "admin_username", config.web.admin_user),
        "csrf_token": session.csrf_token if isinstance(session, AdminSession) else None,
    }
