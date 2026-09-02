from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from korserver.config.loader import load_config
from korserver.config.models import AppConfig
from korserver.renderers.nftables import NftablesConfigRenderer
from korserver.services.command import CommandResult, CommandRunner
from korserver.services.nftables import NftablesService


class MissingNftRunner(CommandRunner):
    def run(
        self,
        argv: Sequence[str],
        *,
        timeout: int = 30,
        input_text: str | None = None,
        env: dict[str, str] | None = None,
        check: bool = True,
        dry_run: bool = False,
        extra_secrets: Sequence[str] | None = None,
    ) -> CommandResult:
        return CommandResult(tuple(argv), 1, "", "Error: No such file or directory", dry_run)


class SuccessfulNftRunner(CommandRunner):
    def run(
        self,
        argv: Sequence[str],
        *,
        timeout: int = 30,
        input_text: str | None = None,
        env: dict[str, str] | None = None,
        check: bool = True,
        dry_run: bool = False,
        extra_secrets: Sequence[str] | None = None,
    ) -> CommandResult:
        del timeout, input_text, env, check, extra_secrets
        return CommandResult(tuple(argv), 0, "", "", dry_run)


class CrashingNftRunner(CommandRunner):
    def run(
        self,
        argv: Sequence[str],
        *,
        timeout: int = 30,
        input_text: str | None = None,
        env: dict[str, str] | None = None,
        check: bool = True,
        dry_run: bool = False,
        extra_secrets: Sequence[str] | None = None,
    ) -> CommandResult:
        del timeout, input_text, env, check, extra_secrets
        if tuple(argv[:2]) == ("nft", "-f"):
            return CommandResult(tuple(argv), -11, "", "", dry_run)
        return CommandResult(tuple(argv), 0, "", "", dry_run)


def test_nftables_render_does_not_flush_global_ruleset(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {
                "mode": "split",
                "split": {"routes": ["192.168.25.0/24", "10.20.30.40"]},
            }
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "flush ruleset" not in rendered.lower()
    assert "table inet korserver_filter" in rendered
    assert "192.168.25.0/24" in rendered
    assert "10.20.30.40" in rendered


def test_split_sets_use_auto_merge_for_overlapping_intervals(tmp_path: Path) -> None:
    # Regression test: without auto-merge, nft rejects the entire ruleset
    # with "Error: conflicting intervals specified" as soon as the routes
    # list contains overlapping CIDRs (e.g. 5.28.192.0/18 alongside
    # 5.28.192.0/21) -- which real-world pasted lists routinely do -- or
    # when dnsmasq's nftset= tries to add an IP already covered by a
    # listed interval.
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {
                "mode": "split",
                "split": {"routes": ["5.28.192.0/18", "5.28.192.0/21"]},
            }
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    v4_set, v6_set = rendered.split("set split_v6")
    assert "auto-merge" in v4_set
    assert "auto-merge" in v6_set


def test_nftables_render_includes_routes_added_at_runtime(tmp_path: Path) -> None:
    # Regression test: split_v4_elements used to read routing.split.routes
    # directly, silently ignoring anything added via the API/CLI at runtime
    # (which is stored in routes_file, not the static config list) -- so a
    # route added through the web UI never actually reached the firewall.
    routes_file = tmp_path / "routes.txt"
    routes_file.write_text("10.99.0.0/16\n", encoding="utf-8")
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {
                "mode": "split",
                "split": {"routes_file": str(routes_file)},
            }
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "10.99.0.0/16" in rendered


def test_nftables_auto_interface_still_masquerades_clients(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={"routing": {"mode": "full", "main_interface": "auto"}},
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert f"ip saddr {config.server.ipv4_network} masquerade" in rendered


def _upstream_profile() -> dict[str, object]:
    return {
        "name": "primary",
        "server": "vpn.example.com",
        "auth_type": "password",
        "username": "user",
    }


def test_split_mode_with_upstream_masquerades_unmarked_traffic_normally(
    tmp_path: Path,
) -> None:
    # Regression test: split mode used to scope the ENTIRE client-subnet
    # masquerade rule to the upstream oifname, meaning any traffic that
    # wasn't in the split list (i.e. destined for the ordinary internet,
    # not upstream) never matched any masquerade rule at all once upstream
    # was enabled -- it left with a private VPN-subnet source address and
    # was effectively undeliverable.
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "split", "split": {"routes": ["192.168.25.0/24"]}},
            "upstream": {"enabled": True, "profiles": [_upstream_profile()]},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert (
        f"ip saddr {config.server.ipv4_network} meta mark != {config.routing.fwmark} "
        "masquerade" in rendered
    )


def test_full_mode_with_upstream_adds_killswitch_drop(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full"},
            "upstream": {"enabled": True, "profiles": [_upstream_profile()]},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert (
        f'meta mark {config.routing.fwmark} oifname != "oc-middle0" counter drop' in rendered
    )
    assert (
        f'ip saddr {config.server.ipv4_network} meta mark {config.routing.fwmark} '
        'oifname "oc-middle0" masquerade' in rendered
    )


def test_killswitch_absent_when_upstream_disabled(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={"routing": {"mode": "full"}},
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "drop" not in rendered


def test_killswitch_absent_in_direct_mode_even_with_upstream(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "direct"},
            "upstream": {"enabled": True, "profiles": [_upstream_profile()]},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "drop" not in rendered
    assert "masquerade" not in rendered


def test_host_traffic_adds_output_marking_and_killswitch(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {
                "mode": "split",
                "split": {"host_traffic": True, "routes": ["192.168.25.0/24"]},
            },
            "upstream": {"enabled": True, "profiles": [_upstream_profile()]},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "type route hook output priority mangle" in rendered
    assert (
        f"ct direction original ip daddr != {config.server.ipv4_network} "
        f"ip daddr @split_v4 counter meta mark set {config.routing.fwmark}" in rendered
    )
    # The host kill-switch must be a postrouting chain: an output-hook
    # filter chain shares nf_hook_state with the route chain and still sees
    # the pre-reroute oifname, dropping ALL marked host traffic.
    assert "type filter hook postrouting priority filter" in rendered
    assert "type filter hook output" not in rendered
    assert 'oifname "lo" accept' in rendered
    # Host-originated packets keep their uplink source address through the
    # fwmark re-route; without this masquerade replies never come back.
    assert (
        f'meta mark {config.routing.fwmark} oifname "oc-middle0" counter masquerade'
        in rendered
    )


def test_host_traffic_output_chain_absent_by_default(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "split", "split": {"routes": ["192.168.25.0/24"]}},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "hook output" not in rendered


def test_host_traffic_ignored_outside_split_mode(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full", "split": {"host_traffic": True}},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "hook output" not in rendered


def test_nft_show_is_informational_in_direct_mode_when_table_is_missing() -> None:
    result = NftablesService(
        AppConfig.model_validate({"routing": {"mode": "direct"}}),
        runner=MissingNftRunner(),
    ).show()

    assert result.returncode == 0
    assert "direct routing mode" in result.stdout
    assert result.stderr == ""


def test_nft_show_guides_apply_when_managed_tables_are_needed() -> None:
    result = NftablesService(
        AppConfig.model_validate({"routing": {"mode": "split"}}),
        runner=MissingNftRunner(),
    ).show()

    assert result.returncode == 0
    assert "not installed yet" in result.stdout
    assert "korctl nft apply" in result.stdout
    assert result.stderr == ""


def test_nft_apply_explains_successful_empty_nft_output(tmp_path: Path) -> None:
    config = AppConfig.model_validate(
        {
            "system": {"generated_dir": tmp_path},
            "routing": {"mode": "full"},
        }
    )

    results = NftablesService(config, runner=SuccessfulNftRunner()).apply()

    assert results[-1].returncode == 0
    assert "Applied korserver-owned nftables rules" in results[-1].stdout
    assert "masquerading" in results[-1].stdout


class RecordingRunner(CommandRunner):
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def run(  # type: ignore[override]
        self,
        argv: Sequence[str],
        **kwargs: object,
    ) -> CommandResult:
        self.calls.append(list(argv))
        return CommandResult(tuple(argv), 0, "", "", bool(kwargs.get("dry_run", False)))


def test_nft_apply_reasserts_policy_routing_when_upstream_active(tmp_path: Path) -> None:
    # Regression test: the fwmark rule/route used to be installed only by
    # the upstream connect/switch lifecycle, so a rules refresh (panel
    # Reload, korctl nft apply) after the rule went missing left marked
    # traffic hitting the kill-switch -- local sockets got EPERM even with
    # the tunnel up.
    config = AppConfig.model_validate(
        {
            "system": {"generated_dir": tmp_path},
            "routing": {"mode": "split"},
            "upstream": {"enabled": True, "profiles": [_upstream_profile()]},
        }
    )
    runner = RecordingRunner()

    NftablesService(config, runner=runner).apply()

    assert [
        "ip", "rule", "add", "fwmark", config.routing.fwmark,
        "table", "1201", "priority", "100",
    ] in runner.calls
    assert [
        "ip", "route", "replace", "default", "dev", "oc-middle0", "table", "1201",
    ] in runner.calls


def test_nft_apply_leaves_routing_alone_without_upstream(tmp_path: Path) -> None:
    config = AppConfig.model_validate(
        {
            "system": {"generated_dir": tmp_path},
            "routing": {"mode": "split"},
        }
    )
    runner = RecordingRunner()

    NftablesService(config, runner=runner).apply()

    assert not [call for call in runner.calls if call[0] == "ip"]


def test_nft_apply_returns_crash_as_command_result(tmp_path: Path) -> None:
    config = AppConfig.model_validate(
        {
            "system": {"generated_dir": tmp_path},
            "routing": {"mode": "full"},
        }
    )

    results = NftablesService(config, runner=CrashingNftRunner()).apply()

    assert results[-1].returncode == -11
    assert "signal 11" in results[-1].stderr
    assert "inside the container" in results[-1].stderr
