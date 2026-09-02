from __future__ import annotations

from pathlib import Path

import pytest

from korserver.config.models import AppConfig
from korserver.services.routing import RoutingService


def _config(tmp_path: Path) -> AppConfig:
    return AppConfig.model_validate(
        {
            "routing": {
                "split": {
                    "routes_file": str(tmp_path / "routes.txt"),
                    "domains_file": str(tmp_path / "domains.txt"),
                }
            }
        }
    )


def test_set_routes_replaces_the_whole_file(tmp_path: Path) -> None:
    service = RoutingService(_config(tmp_path))
    service.add_route("10.1.0.0/16")

    service.set_routes(["10.20.0.0/16", "203.0.113.5"])

    assert service.list_routes() == ["10.20.0.0/16", "203.0.113.5"]


def test_set_routes_normalizes_cidr_and_bare_ips(tmp_path: Path) -> None:
    service = RoutingService(_config(tmp_path))

    service.set_routes(["203.0.113.5", "10.20.0.0/16"])

    assert service.list_routes() == ["203.0.113.5", "10.20.0.0/16"]


def test_set_routes_deduplicates(tmp_path: Path) -> None:
    service = RoutingService(_config(tmp_path))

    service.set_routes(["10.20.0.0/16", "10.20.0.0/16"])

    assert service.list_routes() == ["10.20.0.0/16"]


def test_set_routes_rejects_invalid_entry_and_leaves_existing_list_untouched(
    tmp_path: Path,
) -> None:
    service = RoutingService(_config(tmp_path))
    service.set_routes(["10.20.0.0/16"])

    with pytest.raises(ValueError, match="invalid route or IP"):
        service.set_routes(["not-a-route"])

    assert service.list_routes() == ["10.20.0.0/16"]


def test_set_domains_replaces_the_whole_file(tmp_path: Path) -> None:
    service = RoutingService(_config(tmp_path))
    service.add_domain("old.example.com")

    service.set_domains(["corp.example.com", "internal.example"])

    assert service.list_domains() == ["corp.example.com", "internal.example"]


def test_set_domains_rejects_invalid_entry(tmp_path: Path) -> None:
    service = RoutingService(_config(tmp_path))

    with pytest.raises(ValueError, match="invalid domain"):
        service.set_domains(["not a domain!"])
