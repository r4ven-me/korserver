from __future__ import annotations

from korserver.config.models import AppConfig
from korserver.renderers.nftables import NftablesConfigRenderer
from korserver.services.command import CommandResult, CommandRunner
from korserver.services.files import FileManager
from korserver.services.policy_routing import PolicyRoutingService


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

    def apply(
        self,
        *,
        dry_run: bool = False,
        outbound_interface: str | None = None,
    ) -> list[CommandResult]:
        content = self.render(outbound_interface)
        target = self.renderer.target_path(self.config)
        if dry_run:
            return [
                CommandResult(
                    ("nft", "delete", "table", "inet", self.filter_table),
                    0,
                    "",
                    "",
                    True,
                ),
                CommandResult(("nft", "delete", "table", "ip", self.nat_table), 0, "", "", True),
                CommandResult(("nft", "-f", str(target)), 0, content, "", True),
                *self._reassert_policy_routing(outbound_interface, dry_run=True),
            ]
        self.files.atomic_write_text(target, content)
        results = [
            self.runner.run(["nft", "delete", "table", "inet", self.filter_table], check=False),
            self.runner.run(["nft", "delete", "table", "ip", self.nat_table], check=False),
            self.runner.run(["nft", "-f", str(target)], timeout=30, check=False),
        ]
        applied = results[-1]
        # Only touch routing after a successful ruleset load; a failed nft
        # apply should change nothing else.
        policy_results = self._reassert_policy_routing(outbound_interface) if applied.ok else []
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
        self, outbound_interface: str | None, *, dry_run: bool = False
    ) -> list[CommandResult]:
        """Re-install the fwmark rule/route alongside every rules refresh.

        Policy routing is normally managed by the upstream connect/switch/
        disconnect lifecycle; a rules refresh outside that lifecycle (panel
        Reload, `korctl nft apply`) used to leave a missing rule missing, so
        marked traffic hit the kill-switch (local sockets get EPERM) even
        with the tunnel up. Harmless when the tunnel is down: the route add
        fails, marked traffic keeps hitting the kill-switch instead of
        leaking out unencrypted.
        """
        selected = self.config.upstream.selected_profile()
        if (
            self.config.routing.mode not in ("full", "split")
            or not self.config.upstream.enabled
            or selected is None
        ):
            return []
        device = outbound_interface or self.config.upstream.profile_interface(selected)
        return PolicyRoutingService(self.config, runner=self.runner).apply(
            device, dry_run=dry_run
        )

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
        if self.config.routing.mode == "direct":
            return CommandResult(
                result.argv,
                0,
                "project-owned nftables table is not active in direct routing mode",
                "",
                result.dry_run,
            )
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
