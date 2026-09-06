from __future__ import annotations

from pathlib import Path
from typing import Any

from korserver.config.models import AppConfig
from korserver.renderers.base import TemplateRenderer


class DnsmasqConfigRenderer(TemplateRenderer):
    def render(self, config: AppConfig) -> str:
        from korserver.services.internal_dns import InternalDnsService
        from korserver.services.routing import RoutingService

        split_dns_active = config.routing.mode == "split" and config.routing.split.tunnel_dns
        # server.dns doubles as "DNS pushed to clients" and "dnsmasq upstreams";
        # when tunnel_dns is on, configs often list the dnsmasq address itself
        # there (that IS the client DNS). dnsmasq silently ignores upstreams on
        # a local interface, which would leave split-domain masks pointing at a
        # dropped server — so keep only real upstreams.
        listen = config.routing.split.dnsmasq_listen
        upstream_dns = [dns for dns in config.server.dns if dns != listen]
        local_records = [
            {"host": host, "ip": ip}
            for host, ip in (record.split() for record in config.internal_dns.local_records)
        ]
        # Named per-profile targets: resolved via the normal upstream DNS
        # (no server=/domain/... override, unlike split_dns_active below --
        # that override is specifically for routing.split's own tunnel_dns
        # toggle), just fed into that target's own nftables set so matching
        # traffic gets marked and routed to its assigned profile.
        targets = RoutingService(config).list_targets(
            default_interface=config.routing.main_interface
        )
        named_targets_with_domains = [
            target for target in targets if target.name != "default" and target.domains
        ]
        context: dict[str, Any] = {
            "config": config,
            "upstream_dns": upstream_dns,
            "filter_table": f"{config.routing.nft_prefix}_filter",
            "split_v4_set": "split_v4",
            "split_v6_set": "split_v6",
            "split_dns_active": split_dns_active,
            "split_domains": RoutingService(config).list_domains() if split_dns_active else [],
            "named_targets_with_domains": named_targets_with_domains,
            "blocklist_conf": InternalDnsService(config).blocklist_conf_path(),
            "local_records": local_records,
        }
        return self.render_template("dnsmasq.conf.j2", context)

    def target_path(self, config: AppConfig) -> Path:
        return config.generated_path("dnsmasq.conf")
