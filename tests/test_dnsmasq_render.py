from __future__ import annotations

from pathlib import Path

from korserver.config.loader import load_config
from korserver.renderers.dnsmasq import DnsmasqConfigRenderer


def test_dnsmasq_render_contains_domain_nftset(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {
                "mode": "split",
                "split": {
                    "tunnel_dns": True,
                    "domains": ["example.com"],
                    "dnsmasq_listen": "10.10.10.1",
                },
            }
        },
        environ={},
    )

    rendered = DnsmasqConfigRenderer().render(config)

    assert "listen-address=10.10.10.1" in rendered
    assert "nftset=/example.com/4#inet#korserver_filter#split_v4" in rendered


def test_dnsmasq_render_includes_domains_from_domains_file(tmp_path: Path) -> None:
    domains_file = tmp_path / "domains.txt"
    domains_file.write_text("panel-added.example\n", encoding="utf-8")
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {
                "mode": "split",
                "split": {
                    "tunnel_dns": True,
                    "domains": ["example.com"],
                    "domains_file": str(domains_file),
                },
            }
        },
        environ={},
    )

    rendered = DnsmasqConfigRenderer().render(config)

    assert "server=/example.com/1.1.1.1" in rendered
    assert "server=/panel-added.example/1.1.1.1" in rendered
    assert "nftset=/panel-added.example/4#inet#korserver_filter#split_v4" in rendered


def test_dnsmasq_render_includes_cache_size_and_log_queries(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={"internal_dns": {"cache_size": 500, "log_queries": True}},
        environ={},
    )

    rendered = DnsmasqConfigRenderer().render(config)

    assert "cache-size=500" in rendered
    assert "log-queries" in rendered


def test_dnsmasq_render_omits_log_queries_by_default(tmp_path: Path) -> None:
    config = load_config(tmp_path / "missing.yaml", environ={})

    rendered = DnsmasqConfigRenderer().render(config)

    assert "cache-size=150" in rendered
    assert "log-queries" not in rendered


def test_dnsmasq_render_filters_own_listen_address_from_upstreams(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "server": {"dns": ["10.10.10.1", "1.1.1.1"]},
            "routing": {
                "mode": "split",
                "split": {
                    "tunnel_dns": True,
                    "domains": ["corp.example.com"],
                    "dnsmasq_listen": "10.10.10.1",
                },
            },
        },
        environ={},
    )

    rendered = DnsmasqConfigRenderer().render(config)

    assert "server=10.10.10.1" not in rendered
    assert "server=1.1.1.1" in rendered
    assert "server=/corp.example.com/1.1.1.1" in rendered


def test_dnsmasq_render_hardening_options(tmp_path: Path) -> None:
    config = load_config(tmp_path / "missing.yaml", environ={})

    rendered = DnsmasqConfigRenderer().render(config)

    assert "no-negcache" in rendered
    assert "no-resolv" in rendered


def test_dnsmasq_render_includes_local_records(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "internal_dns": {
                "local_records": ["nas.corp.local 10.11.11.5", "printer 10.11.11.6"]
            }
        },
        environ={},
    )

    rendered = DnsmasqConfigRenderer().render(config)

    assert "address=/nas.corp.local/10.11.11.5" in rendered
    assert "address=/printer/10.11.11.6" in rendered
