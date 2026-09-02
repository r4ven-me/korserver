from __future__ import annotations

import ipaddress
import re
from pathlib import Path

from korserver.config.models import AppConfig
from korserver.services.files import FileManager

DOMAIN_RE = re.compile(r"^[A-Za-z0-9.-]+$")


class RoutingService:
    def __init__(self, config: AppConfig, files: FileManager | None = None) -> None:
        self.config = config
        self.files = files or FileManager()

    def list_routes(self) -> list[str]:
        return self._merged_file_items(
            self.config.routing.split.routes,
            self.config.routing.split.routes_file,
        )

    def list_domains(self) -> list[str]:
        return self._merged_file_items(
            self.config.routing.split.domains,
            self.config.routing.split.domains_file,
        )

    def add_route(self, cidr_or_ip: str) -> None:
        item = self._normalize_route(cidr_or_ip)
        self._add_line(self.config.routing.split.routes_file, item)

    def delete_route(self, cidr_or_ip: str) -> None:
        item = self._normalize_route(cidr_or_ip)
        self._delete_line(self.config.routing.split.routes_file, item)

    def add_domain(self, domain: str) -> None:
        item = self._normalize_domain(domain)
        self._add_line(self.config.routing.split.domains_file, item)

    def delete_domain(self, domain: str) -> None:
        item = self._normalize_domain(domain)
        self._delete_line(self.config.routing.split.domains_file, item)

    def set_routes(self, items: list[str]) -> None:
        """Replace the whole runtime routes list at once (bulk paste from
        the web UI), instead of one add_route() call per line."""
        normalized = [self._normalize_route(item) for item in items]
        self.files.write_unique_lines(self.config.routing.split.routes_file, normalized)

    def set_domains(self, items: list[str]) -> None:
        """Replace the whole runtime domains list at once (bulk paste from
        the web UI), instead of one add_domain() call per line."""
        normalized = [self._normalize_domain(item) for item in items]
        self.files.write_unique_lines(self.config.routing.split.domains_file, normalized)

    def _merged_file_items(self, configured: list[str], path: Path) -> list[str]:
        merged = [*configured, *self.files.read_lines(path)]
        result: list[str] = []
        seen: set[str] = set()
        for item in merged:
            stripped = item.strip()
            if stripped and not stripped.startswith("#") and stripped not in seen:
                result.append(stripped)
                seen.add(stripped)
        return result

    def _add_line(self, path: Path, item: str) -> None:
        lines = self.files.read_lines(path)
        if item not in [line.strip() for line in lines]:
            self.files.write_unique_lines(path, [*lines, item])

    def _delete_line(self, path: Path, item: str) -> None:
        kept = [line for line in self.files.read_lines(path) if line.strip() != item]
        self.files.write_unique_lines(path, kept)

    def _normalize_route(self, value: str) -> str:
        try:
            if "/" in value:
                return str(ipaddress.ip_network(value, strict=False))
            return str(ipaddress.ip_address(value))
        except ValueError as exc:
            raise ValueError(f"invalid route or IP: {value}") from exc

    def _normalize_domain(self, value: str) -> str:
        domain = value.strip().lower().rstrip(".")
        if not domain or not DOMAIN_RE.match(domain):
            raise ValueError(f"invalid domain: {value}")
        return domain
