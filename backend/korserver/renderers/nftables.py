from __future__ import annotations

from pathlib import Path
from typing import Any

from korserver.config.models import AppConfig
from korserver.renderers.base import TemplateRenderer


class NftablesConfigRenderer(TemplateRenderer):
    def render(self, config: AppConfig, outbound_interface: str | None = None) -> str:
        from korserver.services.routing import RoutingService

        # RoutingService.list_routes() merges routing.split.routes (static,
        # from config.yaml) with routes_file (runtime additions via the API/
        # CLI) -- using config.routing.split.routes alone here would silently
        # drop every route added at runtime from the actual firewall rules.
        split_v4_elements = RoutingService(config).list_routes()
        selected_profile = config.upstream.selected_profile()
        upstream_active = config.upstream.enabled and selected_profile is not None
        if outbound_interface is None:
            if upstream_active and selected_profile is not None:
                outbound_interface = config.upstream.profile_interface(selected_profile)
            else:
                outbound_interface = config.routing.main_interface

        context: dict[str, Any] = {
            "config": config,
            "filter_table": f"{config.routing.nft_prefix}_filter",
            "nat_table": f"{config.routing.nft_prefix}_nat",
            "split_v4_elements": split_v4_elements,
            "outbound_interface": outbound_interface,
            # Only marked traffic (full: all client traffic; split: the
            # configured routes/ips/domains) must be forced through the
            # upstream tunnel -- everything else keeps using the host's
            # normal route/masquerade. Meaningless without an actual
            # upstream interface to police, so it's off entirely otherwise.
            "upstream_killswitch": upstream_active and config.routing.mode in ("full", "split"),
            # Split mode only: in full mode "all host traffic via upstream"
            # would also capture the upstream tunnel's own packets and loop.
            "host_split_traffic": (
                config.routing.mode == "split" and config.routing.split.host_traffic
            ),
        }
        return self.render_template("nftables.nft.j2", context)

    def target_path(self, config: AppConfig) -> Path:
        return config.generated_path("nftables.nft")
