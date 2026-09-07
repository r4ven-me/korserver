from __future__ import annotations

from pathlib import Path
from typing import Any

from korserver.config.models import AppConfig
from korserver.renderers.base import TemplateRenderer
from korserver.services.routing import RoutingTarget


class NftablesConfigRenderer(TemplateRenderer):
    def resolve_targets(
        self, config: AppConfig, outbound_interface: str | None = None
    ) -> tuple[list[RoutingTarget], str, bool]:
        """The default target (whichever profile is active, governed by
        routing.mode) plus one target per profile with its own explicit
        routes/domains -- each gets its own fwmark/table/set so several
        profiles can carry different traffic simultaneously. See
        RoutingService.list_targets().

        Also returns the resolved outbound_interface and upstream_active
        flag so render() doesn't need to recompute them, and so callers that
        only need the target list (e.g. NftablesService's stale-target
        cleanup) can get exactly what render() would use without
        duplicating this resolution logic.
        """
        from korserver.services.routing import RoutingService

        selected_profile = config.upstream.selected_profile()
        upstream_active = config.upstream.enabled and selected_profile is not None
        if outbound_interface is None:
            if upstream_active and selected_profile is not None:
                outbound_interface = config.upstream.profile_interface(selected_profile)
            else:
                outbound_interface = config.routing.main_interface

        targets = RoutingService(config).list_targets(default_interface=outbound_interface)
        return targets, outbound_interface, upstream_active

    def render(self, config: AppConfig, outbound_interface: str | None = None) -> str:
        from korserver.services.routing import RoutingService

        targets, outbound_interface, upstream_active = self.resolve_targets(
            config, outbound_interface
        )
        host_split_active = config.routing.host_traffic and config.routing.host_mode == "split"
        routing_service = RoutingService(config)

        context: dict[str, Any] = {
            "config": config,
            "filter_table": f"{config.routing.nft_prefix}_filter",
            "nat_table": f"{config.routing.nft_prefix}_nat",
            "targets": targets,
            "outbound_interface": outbound_interface,
            # Only marked traffic (full: all client traffic; split: the
            # configured routes/ips/domains) must be forced through the
            # upstream tunnel -- everything else keeps using the host's
            # normal route/masquerade. Meaningless without an actual
            # upstream interface to police, so it's off entirely otherwise.
            # Host traffic (below) only ever follows the default target.
            "upstream_killswitch": upstream_active,
            # Whether the default target's own client-facing marking rule
            # (mode: full/split) is rendered at all -- off leaves clients on
            # plain host NAT (relying only on explicit per-profile
            # targeting) even though the default target's set stays
            # populated (used by its own killswitch/masquerade context).
            "client_traffic_enabled": config.routing.client_traffic,
            # Independent of the client-facing `mode`: host_mode picks
            # full/split for the HOST's own traffic on its own terms, off
            # its own separate routing.host_split routes/domains -- NOT
            # shared with the client-facing default target's set.
            "host_traffic_enabled": config.routing.host_traffic,
            "host_mode": config.routing.host_mode,
            "host_split_routes": routing_service.list_host_routes() if host_split_active else [],
            "host_split_domains": (
                routing_service.list_host_domains() if host_split_active else []
            ),
        }
        return self.render_template("nftables.nft.j2", context)

    def target_path(self, config: AppConfig) -> Path:
        return config.generated_path("nftables.nft")
