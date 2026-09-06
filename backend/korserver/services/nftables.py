from __future__ import annotations

import json
from pathlib import Path

from korserver.config.models import AppConfig
from korserver.renderers.nftables import NftablesConfigRenderer
from korserver.services.command import CommandResult, CommandRunner
from korserver.services.files import FileManager
from korserver.services.policy_routing import PolicyRoutingService
from korserver.services.routing import RoutingTarget


class NftablesService:
    def __init__(
        self,
        config: AppConfig,
        runner: CommandRunner | None = None,
        files: FileManager | None = None,
    ) -> None:
        self.config = config
        self.runner = runner or CommandRunner()
        self.files = files or FileManager()
        self.renderer = NftablesConfigRenderer()

    @property
    def filter_table(self) -> str:
        return f"{self.config.routing.nft_prefix}_filter"

    @property
    def nat_table(self) -> str:
        return f"{self.config.routing.nft_prefix}_nat"

    def render(self, outbound_interface: str | None = None) -> str:
        return self.renderer.render(self.config, outbound_interface)

    @property
    def _targets_state_path(self) -> Path:
        return self.config.system.generated_dir / ".routing_targets.json"

    def apply(
        self,
        *,
        dry_run: bool = False,
        outbound_interface: str | None = None,
    ) -> list[CommandResult]:
        targets, resolved_interface, _ = self.renderer.resolve_targets(
            self.config, outbound_interface
        )
        content = self.render(outbound_interface)
        target = self.renderer.target_path(self.config)
        if dry_run:
            return [
                CommandResult(("nft", "-f", str(target)), 0, content, "", True),
                *self._reassert_policy_routing(targets, resolved_interface, dry_run=True),
            ]
        self.files.atomic_write_text(target, content)
        # A single `nft -f` invocation is one atomic transaction (see the
        # rendered file's own add/delete/redefine comment): either the whole
        # ruleset replaces cleanly, or nothing changes and the previous,
        # still-working tables stay in place. Do not run separate `nft
        # delete table` commands beforehand -- that would leave a window
        # with no kill-switch/NAT at all if the reload then failed.
        results = [
            self.runner.run(["nft", "-f", str(target)], timeout=30, check=False),
        ]
        applied = results[-1]
        # Only touch routing after a successful ruleset load; a failed nft
        # apply should change nothing else.
        policy_results: list[CommandResult] = []
        if applied.ok:
            policy_results = self._reassert_policy_routing(targets, resolved_interface)
            policy_results.extend(self._cleanup_stale_targets(targets))
        if applied.ok and not applied.stdout.strip():
            results[-1] = CommandResult(
                applied.argv,
                applied.returncode,
                (
                    "Applied korserver-owned nftables rules.\n"
                    f"- refreshed inet table: {self.filter_table}\n"
                    f"- refreshed ip NAT table: {self.nat_table}\n"
                    "- VPN client routing, split-routing marks and masquerading now match "
                    "the generated config."
                ),
                applied.stderr,
                applied.dry_run,
            )
        elif not applied.ok:
            results[-1] = self._explain_apply_failure(applied)
        results.extend(policy_results)
        return results

    def _reassert_policy_routing(
        self,
        targets: list[RoutingTarget],
        default_interface: str,
        *,
        dry_run: bool = False,
    ) -> list[CommandResult]:
        """Re-install the fwmark rule/route for every routing target (the
        default bucket, plus any named per-profile target -- see
        RoutingService.list_targets()) alongside every rules refresh.

        Policy routing is normally managed by the upstream connect/switch/
        disconnect lifecycle; a rules refresh outside that lifecycle (panel
        Reload, `korctl nft apply`) used to leave a missing rule missing, so
        marked traffic hit the kill-switch (local sockets get EPERM) even
        with the tunnel up. This used to only reassert the *default* target,
        leaving named per-profile targets stale until the watchdog's next
        tick (or never, if that profile wasn't "connected" yet) -- now every
        target is covered. Applied unconditionally per target, not gated on
        whether that profile is currently detected as connected: harmless
        when a target's tunnel is down (the route add fails, marked traffic
        keeps hitting that target's kill-switch instead of leaking out
        unencrypted), and a manual reload should reassert every target's
        intended routing rather than skip ones whose live state it doesn't
        know.

        `targets`/`default_interface` are the caller's already-resolved
        values (from NftablesConfigRenderer.resolve_targets()) so this uses
        exactly what was just rendered, not a separately recomputed view.
        """
        if not self.config.upstream.enabled:
            return []
        selected = self.config.upstream.selected_profile()
        results: list[CommandResult] = []
        for target in targets:
            if target.name == "default" and selected is None:
                # Nothing selected/active at all -- there's no device for the
                # default bucket's route to point at. Named targets (below)
                # are independent of this and still get reasserted.
                continue
            results.extend(
                PolicyRoutingService(
                    self.config,
                    runner=self.runner,
                    fwmark=target.fwmark,
                    table_id=target.table_id,
                ).apply(target.interface, dry_run=dry_run)
            )
        return results

    def _cleanup_stale_targets(self, current_targets: list[RoutingTarget]) -> list[CommandResult]:
        """Clean up any routing target that no longer exists (a profile's
        `routes`/`domains` were cleared, its `routing_offset` override
        changed, or the profile itself was deleted) but still has a
        leftover `ip rule`/table installed from a previous apply.

        RoutingService.list_targets() only ever describes what SHOULD exist
        right now; without tracking what existed at the *previous* apply, a
        target that disappears between two applies leaks its old
        fwmark/table/ip-rule forever -- silently misrouting or leaking any
        traffic that still happens to carry that stale mark, and wasting a
        routing table entry that could later collide with a new target.
        """
        state_path = self._targets_state_path
        previous: dict[str, dict[str, object]] = {}
        if state_path.exists():
            try:
                previous = json.loads(state_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                previous = {}
        current_names = {target.name for target in current_targets}
        results: list[CommandResult] = []
        for name, info in previous.items():
            if name in current_names:
                continue
            results.extend(
                PolicyRoutingService(
                    self.config,
                    runner=self.runner,
                    fwmark=str(info["fwmark"]),
                    table_id=int(str(info["table_id"])),
                ).cleanup()
            )
        self.files.atomic_write_text(
            state_path,
            json.dumps(
                {t.name: {"fwmark": t.fwmark, "table_id": t.table_id} for t in current_targets},
                indent=2,
            )
            + "\n",
        )
        return results

    def _explain_apply_failure(self, result: CommandResult) -> CommandResult:
        signal_note = ""
        if result.returncode < 0:
            signal_number = abs(result.returncode)
            signal_note = (
                f"\nnft exited from signal {signal_number}. If this works on the host but "
                "fails in the container, the container nft userspace package may be "
                "incompatible with the host kernel/netfilter stack. Run the same command "
                "inside the container to verify it."
            )
        stderr = (
            result.stderr.rstrip()
            or "nft did not print an error message before failing."
        )
        return CommandResult(
            result.argv,
            result.returncode,
            result.stdout,
            f"{stderr}{signal_note}",
            result.dry_run,
        )

    def show(self) -> CommandResult:
        result = self.runner.run(
            ["nft", "list", "table", "inet", self.filter_table],
            timeout=30,
            check=False,
        )
        if result.ok or "no such file" not in result.stderr.lower():
            return result
        return CommandResult(
            result.argv,
            0,
            "project-owned nftables table is not installed yet; run korctl nft apply to create it",
            "",
            result.dry_run,
        )

    def cleanup(self, *, dry_run: bool = False) -> list[CommandResult]:
        return [
            self.runner.run(
                ["nft", "delete", "table", "inet", self.filter_table],
                check=False,
                dry_run=dry_run,
            ),
            self.runner.run(
                ["nft", "delete", "table", "ip", self.nat_table],
                check=False,
                dry_run=dry_run,
            ),
        ]
