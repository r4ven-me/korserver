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


def test_host_traffic_split_mode_adds_output_marking_and_killswitch(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {
                "mode": "split",
                "host_traffic": True,
                "host_mode": "split",
                "split": {"routes": ["192.168.25.0/24"]},
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


def test_host_traffic_works_independent_of_client_mode(tmp_path: Path) -> None:
    # Regression test: host_traffic used to be hard-wired to only work
    # alongside client mode=split. It's independent now -- host_mode picks
    # full/split for the host's own traffic on its own terms.
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full", "host_traffic": True, "host_mode": "split"},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "hook output" in rendered


def test_host_mode_full_marks_all_host_traffic_unconditionally(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full", "host_traffic": True, "host_mode": "full"},
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert (
        f"ct direction original ip daddr != {config.server.ipv4_network} "
        f"counter meta mark set {config.routing.fwmark}" in rendered
    )
    assert f"ct direction original ip6 counter meta mark set {config.routing.fwmark}" in rendered
    # Full mode must not also emit the split-set-scoped rule.
    assert "@split_v4 counter meta mark" not in rendered


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


def test_nft_apply_reasserts_named_target_policy_routing_too(tmp_path: Path) -> None:
    # Regression test: _reassert_policy_routing() used to only reassert the
    # DEFAULT target's ip rule/route on a manual reload (panel Reload,
    # korctl nft apply), leaving named per-profile targets stale until the
    # watchdog's next tick -- so a named target's traffic could hit its own
    # kill-switch after a reload even though its tunnel was already up.
    config = AppConfig.model_validate(
        {
            "system": {"generated_dir": tmp_path},
            "routing": {"mode": "full", "fwmark": "0x0c01", "table_id": 1201},
            "upstream": {
                "enabled": True,
                "profiles": [
                    _upstream_profile(),
                    _profile_with_target(
                        "finance", interface="oc-finance", routes=["10.50.0.0/16"]
                    ),
                ],
            },
        }
    )
    runner = RecordingRunner()

    NftablesService(config, runner=runner).apply()

    # finance is the 2nd configured profile -> offset 2 -> fwmark 0x0c03,
    # table 1203 (see UpstreamConfig.profile_routing_offset()).
    assert [
        "ip", "rule", "add", "fwmark", "0x0c03", "table", "1203", "priority", "100",
    ] in runner.calls
    assert [
        "ip", "route", "replace", "default", "dev", "oc-finance", "table", "1203",
    ] in runner.calls


def test_nft_apply_reasserts_named_targets_even_without_a_selected_profile(
    tmp_path: Path,
) -> None:
    # Regression test: the old early-return ("no selected profile -> return
    # [] entirely") skipped named targets too, even though a named target's
    # routing is independent of which profile (if any) is active/selected.
    # The profile is disabled so selected_profile() falls back to None
    # (there's no other enabled profile to pick) while its named target
    # (unconditional kill-switch, see RoutingService.list_targets()) still
    # needs its own routing reasserted.
    config = AppConfig.model_validate(
        {
            "system": {"generated_dir": tmp_path},
            "routing": {"mode": "full", "fwmark": "0x0c01", "table_id": 1201},
            "upstream": {
                "enabled": True,
                "profiles": [
                    _profile_with_target(
                        "finance",
                        interface="oc-finance",
                        routes=["10.50.0.0/16"],
                        enabled=False,
                    ),
                ],
            },
        }
    )
    runner = RecordingRunner()

    assert config.upstream.selected_profile() is None
    NftablesService(config, runner=runner).apply()

    assert [
        "ip", "route", "replace", "default", "dev", "oc-finance", "table", "1202",
    ] in runner.calls


def test_nft_apply_cleans_up_target_that_disappeared(tmp_path: Path) -> None:
    # Regression test: a profile's routes/domains being cleared (or the
    # profile removed entirely) used to leave its old fwmark/table/ip-rule
    # installed forever -- RoutingService.list_targets() only ever describes
    # what SHOULD exist right now, with no memory of the previous apply.
    base = {
        "system": {"generated_dir": tmp_path},
        "routing": {"mode": "full", "fwmark": "0x0c01", "table_id": 1201},
    }
    with_target = AppConfig.model_validate(
        {
            **base,
            "upstream": {
                "enabled": True,
                "profiles": [
                    _profile_with_target(
                        "finance", interface="oc-finance", routes=["10.50.0.0/16"]
                    ),
                ],
            },
        }
    )
    NftablesService(with_target, runner=RecordingRunner()).apply()

    # finance keeps existing but loses its own routes/domains -> its named
    # target (fwmark 0x0c02 / table 1202, offset 1 as the only profile) no
    # longer exists.
    without_target = AppConfig.model_validate(
        {
            **base,
            "upstream": {
                "enabled": True,
                "profiles": [_profile_with_target("finance", interface="oc-finance")],
            },
        }
    )
    runner = RecordingRunner()

    NftablesService(without_target, runner=runner).apply()

    assert [
        "ip", "rule", "del", "fwmark", "0x0c02", "table", "1202", "priority", "100",
    ] in runner.calls
    assert ["ip", "route", "flush", "table", "1202"] in runner.calls


def test_nft_apply_does_not_clean_up_targets_still_present(tmp_path: Path) -> None:
    config = AppConfig.model_validate(
        {
            "system": {"generated_dir": tmp_path},
            "routing": {"mode": "full", "fwmark": "0x0c01", "table_id": 1201},
            "upstream": {
                "enabled": True,
                "profiles": [
                    _profile_with_target(
                        "finance", interface="oc-finance", routes=["10.50.0.0/16"]
                    ),
                ],
            },
        }
    )
    NftablesService(config, runner=RecordingRunner()).apply()
    runner = RecordingRunner()

    NftablesService(config, runner=runner).apply()

    # "ip route flush table <N>" only ever comes from cleanup(); a normal
    # reassert only ever does "ip rule del" (as part of apply()'s own
    # idempotent delete-then-add) and "ip route replace", never a flush --
    # so its absence here proves no stale-target cleanup ran for a target
    # that's still present.
    assert not [call for call in runner.calls if call[:3] == ["ip", "route", "flush"]]


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


def _profile_with_target(name: str, **overrides: object) -> dict[str, object]:
    return {
        "name": name,
        "server": f"{name}.example.com",
        "auth_type": "password",
        "username": "user",
        **overrides,
    }


def test_profile_with_routes_gets_its_own_fwmark_table_and_killswitch(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full", "fwmark": "0x0c01"},
            "upstream": {
                "enabled": True,
                "profiles": [
                    _profile_with_target("primary"),
                    _profile_with_target(
                        "finance", interface="oc-finance", routes=["10.50.0.0/16"]
                    ),
                ],
            },
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    # A distinct set, fwmark and kill-switch drop for the named target.
    # finance is the 2nd configured profile (primary is 1st), so its
    # routing offset is 2 (derived from list position, not from a count of
    # profiles with routes) -> fwmark 0x0c01 + 2 = 0x0c03.
    assert "set split_v4_finance" in rendered
    assert "10.50.0.0/16" in rendered
    assert "ip daddr @split_v4_finance counter meta mark set 0x0c03" in rendered
    assert 'meta mark 0x0c03 oifname != "oc-finance" counter drop' in rendered
    assert (
        f"ip saddr {config.server.ipv4_network} meta mark 0x0c03 "
        'oifname "oc-finance" masquerade' in rendered
    )
    # The default target (mode=full, no explicit routes) is untouched and
    # keeps its own fwmark.
    assert f"ip saddr {config.server.ipv4_network} counter meta mark set 0x0c01" in rendered


def test_two_targeted_profiles_get_distinct_fwmarks_and_tables(tmp_path: Path) -> None:
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full", "fwmark": "0x0c01", "table_id": 1201},
            "upstream": {
                "enabled": True,
                "profiles": [
                    _profile_with_target("a", interface="oc-a", routes=["10.1.0.0/16"]),
                    _profile_with_target("b", interface="oc-b", routes=["10.2.0.0/16"]),
                ],
            },
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "ip daddr @split_v4_a counter meta mark set 0x0c02" in rendered
    assert "ip daddr @split_v4_b counter meta mark set 0x0c03" in rendered
    assert 'meta mark 0x0c02 oifname != "oc-a" counter drop' in rendered
    assert 'meta mark 0x0c03 oifname != "oc-b" counter drop' in rendered


def test_targeted_profile_routes_ignored_entirely_without_upstream_enabled(
    tmp_path: Path,
) -> None:
    # Regression test: targeting a specific profile is meaningless if
    # upstream isn't even turned on -- the target (and its set/fwmark/rules)
    # must not be rendered at all, keeping "upstream disabled -> everything
    # is inert" true without a maze of per-target fallback branches.
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full"},
            "upstream": {
                "enabled": False,
                "profiles": [
                    _profile_with_target("finance", routes=["10.50.0.0/16"]),
                ],
            },
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert "split_v4_finance" not in rendered
    assert "10.50.0.0/16" not in rendered
    # Clients still get plain NAT (Phase 1 behavior), unaffected.
    assert f"ip saddr {config.server.ipv4_network} masquerade" in rendered


def test_targeted_profile_killswitch_applies_even_when_that_profile_is_disabled(
    tmp_path: Path,
) -> None:
    # A disabled *targeted* profile still blocks its assigned traffic rather
    # than silently leaking it out the host's own connection -- upstream
    # itself is on, so this specific channel being down is exactly what the
    # kill-switch exists for.
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full"},
            "upstream": {
                "enabled": True,
                "profiles": [
                    _profile_with_target(
                        "finance", interface="oc-finance", enabled=False, routes=["10.50.0.0/16"]
                    ),
                ],
            },
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    assert 'meta mark 0x0c02 oifname != "oc-finance" counter drop' in rendered


def test_targeted_profile_mark_overrides_default_full_mode_for_its_own_routes(
    tmp_path: Path,
) -> None:
    # Rendering order matters: the default's blanket full-mode mark must be
    # written first so a named target's more specific rule (for the same
    # traffic) is written after and wins via "meta mark set" overwrite.
    config = load_config(
        tmp_path / "missing.yaml",
        cli_overrides={
            "routing": {"mode": "full", "fwmark": "0x0c01"},
            "upstream": {
                "enabled": True,
                "profiles": [
                    _profile_with_target("primary"),
                    _profile_with_target(
                        "finance", interface="oc-finance", routes=["10.50.0.0/16"]
                    ),
                ],
            },
        },
        environ={},
    )

    rendered = NftablesConfigRenderer().render(config)

    # finance is the 2nd configured profile -> offset 2 -> fwmark 0x0c03.
    default_rule_pos = rendered.index("counter meta mark set 0x0c01")
    finance_rule_pos = rendered.index("counter meta mark set 0x0c03")
    assert default_rule_pos < finance_rule_pos


def test_list_targets_returns_only_default_without_any_profiles(tmp_path: Path) -> None:
    from korserver.services.routing import RoutingService

    config = load_config(tmp_path / "missing.yaml", environ={})

    targets = RoutingService(config).list_targets(default_interface="auto")

    assert [target.name for target in targets] == ["default"]
