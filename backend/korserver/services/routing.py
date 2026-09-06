from __future__ import annotations

import ipaddress
import re
import threading
from dataclasses import dataclass
from pathlib import Path

from korserver.config.models import AppConfig, UpstreamProfileConfig, profile_safe_name
from korserver.services.external_lists import (
    ExternalListCache,
    ExternalListFetchResult,
    parse_list_text,
)
from korserver.services.files import FileManager

DOMAIN_RE = re.compile(r"^[A-Za-z0-9.-]+$")
_FETCH_USER_AGENT = "korserver-routing/1.0"

# Serializes the read-modify-write cycle on routes.txt/domains.txt, the same
# hazard users.py's _PASSWD_REWRITE_LOCK protects against for ocpasswd: two
# concurrent route/domain edits (e.g. two admin browser tabs) would
# otherwise each read the same original file and the last write would
# silently discard the other's change.
_ROUTING_FILE_REWRITE_LOCK = threading.Lock()


@dataclass(frozen=True)
class RoutingTarget:
    """One fwmark/table/kill-switch worth of routing: either the "default"
    bucket (whichever profile is active, governed by routing.mode) or one
    profile with its own explicit routes/domains, which always gets that
    traffic regardless of which profile is currently active."""

    name: str
    fwmark: str
    table_id: int
    interface: str
    set_v4: str
    set_v6: str
    mode: str  # "full" or "split" -- only the default target can be "full"
    routes: list[str]
    domains: list[str]
    # Whether this target's own profile is actually expected to be
    # connected right now (enabled profiles are kept dialed by the watchdog
    # regardless of being active) -- gates the kill-switch/masquerade rules
    # the same way upstream_active already did for the single-target case.
    killswitch: bool
    profile: UpstreamProfileConfig | None


class RoutingService:
    def __init__(self, config: AppConfig, files: FileManager | None = None) -> None:
        self.config = config
        self.files = files or FileManager()
        self.route_urls = ExternalListCache(
            config.system.data_dir / "routing" / "route-urls",
            self.files,
            user_agent=_FETCH_USER_AGENT,
        )
        self.domain_urls = ExternalListCache(
            config.system.data_dir / "routing" / "domain-urls",
            self.files,
            user_agent=_FETCH_USER_AGENT,
        )

    def list_routes(self) -> list[str]:
        return self._merge_unique(
            self.config.routing.split.routes,
            self.files.read_lines(self.config.routing.split.routes_file),
            self.all_file_routes(),
            self.all_url_cache_routes(),
        )

    def list_domains(self) -> list[str]:
        return self._merge_unique(
            self.config.routing.split.domains,
            self.files.read_lines(self.config.routing.split.domains_file),
            self.all_file_domains(),
            self.all_url_cache_domains(),
        )

    def file_routes(self, path: Path) -> list[str]:
        # Tolerant (skips malformed lines instead of raising), unlike
        # add_route()/set_routes(): a statically configured file
        # (admin-managed, possibly hand-edited or third-party) shouldn't
        # have a single bad line invalidate the rest -- same philosophy as
        # internal_dns's blocklist file/URL parsing.
        text = "\n".join(self.files.read_lines(path))
        return parse_list_text(text, normalize=self._normalize_route).items

    def all_file_routes(self) -> list[str]:
        merged: list[str] = []
        for path in self.config.routing.split.routes_files:
            merged.extend(self.file_routes(path))
        return merged

    def file_domains(self, path: Path) -> list[str]:
        text = "\n".join(self.files.read_lines(path))
        return parse_list_text(text, normalize=self._normalize_domain).items

    def all_file_domains(self) -> list[str]:
        merged: list[str] = []
        for path in self.config.routing.split.domains_files:
            merged.extend(self.file_domains(path))
        return merged

    def url_cache_routes(self, url: str) -> list[str]:
        return self.route_urls.cached_items(url, normalize=self._normalize_route)

    def all_url_cache_routes(self) -> list[str]:
        merged: list[str] = []
        for url in self.config.routing.split.routes_urls:
            merged.extend(self.url_cache_routes(url))
        return merged

    def url_cache_domains(self, url: str) -> list[str]:
        return self.domain_urls.cached_items(url, normalize=self._normalize_domain)

    def all_url_cache_domains(self) -> list[str]:
        merged: list[str] = []
        for url in self.config.routing.split.domains_urls:
            merged.extend(self.url_cache_domains(url))
        return merged

    def routes_files_status(self) -> list[dict[str, object]]:
        return [
            {"path": str(path), "exists": path.exists(), "count": len(self.file_routes(path))}
            for path in self.config.routing.split.routes_files
        ]

    def domains_files_status(self) -> list[dict[str, object]]:
        return [
            {"path": str(path), "exists": path.exists(), "count": len(self.file_domains(path))}
            for path in self.config.routing.split.domains_files
        ]

    def routes_urls_status(self) -> list[dict[str, object]]:
        return [
            {
                "url": url,
                "count": len(self.url_cache_routes(url)),
                "meta": self.route_urls.meta(url),
            }
            for url in self.config.routing.split.routes_urls
        ]

    def domains_urls_status(self) -> list[dict[str, object]]:
        return [
            {
                "url": url,
                "count": len(self.url_cache_domains(url)),
                "meta": self.domain_urls.meta(url),
            }
            for url in self.config.routing.split.domains_urls
        ]

    def refresh_route_url(self, url: str, *, preview: bool = False) -> ExternalListFetchResult:
        if url not in self.config.routing.split.routes_urls:
            raise ValueError(f"routing.split.routes_urls does not contain: {url}")
        return self.route_urls.refresh(url, normalize=self._normalize_route, preview=preview)

    def refresh_domain_url(self, url: str, *, preview: bool = False) -> ExternalListFetchResult:
        if url not in self.config.routing.split.domains_urls:
            raise ValueError(f"routing.split.domains_urls does not contain: {url}")
        return self.domain_urls.refresh(url, normalize=self._normalize_domain, preview=preview)

    def list_targets(self, *, default_interface: str) -> list[RoutingTarget]:
        """Every routing target that needs its own nftables set/fwmark/table:
        the default bucket first, then one per profile that has its own
        routes/domains assigned. `default_interface` is the caller's already-
        resolved outbound interface for the default bucket (the active
        profile's tunnel device, or routing.main_interface without one) --
        kept a parameter rather than recomputed here so callers that pass an
        explicit override (e.g. NftablesConfigRenderer.render's own
        outbound_interface argument) keep working exactly as before.
        """
        config = self.config
        upstream_active = config.upstream.enabled and config.upstream.selected_profile() is not None
        targets = [
            RoutingTarget(
                name="default",
                fwmark=config.routing.fwmark,
                table_id=config.routing.table_id,
                interface=default_interface,
                set_v4="split_v4",
                set_v6="split_v6",
                mode=config.routing.mode,
                routes=self.list_routes(),
                domains=self.list_domains() if config.routing.mode == "split" else [],
                killswitch=upstream_active,
                profile=config.upstream.selected_profile(),
            )
        ]
        # Named per-profile targets only exist at all when upstream is
        # globally enabled -- targeting a specific profile is meaningless
        # otherwise, and this keeps the "upstream disabled -> everything is
        # inert, clients just get plain NAT" invariant from Phase 1 exactly
        # true without a maze of per-target fallback branches. Once a target
        # exists, its kill-switch is unconditional (not gated on this one
        # profile's own `enabled`): it was explicitly assigned traffic, so a
        # disabled profile blocks that traffic rather than silently leaking
        # it out the host's own connection -- the same philosophy as the
        # default target's kill-switch, just without a "no upstream at all"
        # fallback state to also account for.
        if config.upstream.enabled:
            base_fwmark = int(config.routing.fwmark, 0)
            # Zero-pad to the same width as the configured fwmark (e.g.
            # "0x0c01" -> 4 hex digits) purely for readable, consistent
            # output in the generated file -- the numeric value is what
            # actually matters to nftables/ip rule.
            fwmark_width = len(config.routing.fwmark) - 2
            for profile in config.upstream.profiles:
                if not profile.routes and not profile.domains:
                    continue
                # Derived from this profile's own fixed position in
                # upstream.profiles (or its explicit routing_offset
                # override), NOT from a running count of profiles that
                # currently have routes/domains -- see
                # UpstreamConfig.profile_routing_offset(). That keeps this
                # profile's fwmark/table stable even when another profile's
                # routes/domains are added, removed, or reordered.
                offset = config.upstream.profile_routing_offset(profile)
                safe_name = profile_safe_name(profile.name)
                targets.append(
                    RoutingTarget(
                        name=profile.name,
                        fwmark=f"0x{base_fwmark + offset:0{fwmark_width}x}",
                        table_id=config.routing.table_id + offset,
                        interface=config.upstream.profile_interface(profile),
                        set_v4=f"split_v4_{safe_name}",
                        set_v6=f"split_v6_{safe_name}",
                        mode="split",
                        routes=profile.routes,
                        domains=profile.domains,
                        killswitch=True,
                        profile=profile,
                    )
                )
        return targets

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
        with _ROUTING_FILE_REWRITE_LOCK:
            self.files.write_unique_lines(self.config.routing.split.routes_file, normalized)

    def set_domains(self, items: list[str]) -> None:
        """Replace the whole runtime domains list at once (bulk paste from
        the web UI), instead of one add_domain() call per line."""
        normalized = [self._normalize_domain(item) for item in items]
        with _ROUTING_FILE_REWRITE_LOCK:
            self.files.write_unique_lines(self.config.routing.split.domains_file, normalized)

    def _merge_unique(self, *sources: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for source in sources:
            for item in source:
                stripped = item.strip()
                if stripped and not stripped.startswith("#") and stripped not in seen:
                    result.append(stripped)
                    seen.add(stripped)
        return result

    def _add_line(self, path: Path, item: str) -> None:
        with _ROUTING_FILE_REWRITE_LOCK:
            lines = self.files.read_lines(path)
            if item not in [line.strip() for line in lines]:
                self.files.write_unique_lines(path, [*lines, item])

    def _delete_line(self, path: Path, item: str) -> None:
        with _ROUTING_FILE_REWRITE_LOCK:
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
