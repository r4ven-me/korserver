# Changelog

## [Unreleased]

### Added

- Independent host-traffic routing: `routing.host_traffic`/`routing.host_mode`
  (`full`/`split`) route the server host's own traffic through upstream, decided
  separately from the client-facing `routing.mode`.
- Per-upstream-profile targeted routes/domains: any `upstream.profiles[]` entry can list
  its own `routes`/`domains` to route CLIENT traffic through that profile's tunnel
  specifically, regardless of which profile is active -- each gets its own
  fwmark/table/kill-switch and nftables set. Gated by a new `route_clients_enabled`
  toggle. Configurable from the Upstream tab's profile editor ("Client routes"/"Client
  domains").
- `upstream.profiles[].route_host_enabled`/`host_routes`/`host_domains`: the same idea for
  the HOST's own traffic through a specific profile, on its own independent toggle and
  route/domain lists -- a profile can carry client traffic, host traffic, or both, on
  entirely different lists. New "Host routes"/"Host domains" fields in the profile editor.
- `upstream.profiles[].routing_offset`: an optional explicit override for a profile's
  fwmark/table_id offset, for when the default (derived from the profile's position in
  `upstream.profiles`) needs to be pinned.
- `upstream.connect_on_boot`: toggle (in the Upstream settings dialog) for whether the
  watchdog dials the selected profile on its own the first time it sees it down after the
  server starts, or waits for an admin to connect manually first.
- Structured GUI control for `upstream.check_settle_seconds` (previously YAML-only).
- `routing.split.routes_files`/`routes_urls` and `domains_files`/`domains_urls`: static,
  admin-configured external sources for split routes/domains, the same shape as
  `internal_dns`'s `blocklist_files`/`blocklist_urls` -- korserver reads/fetches and
  caches them, merged in alongside the inline lists and the existing runtime-editable
  routes/domains files. New GUI fields and "Validate URL"/"Download & apply" actions in
  the Upstream settings dialog.
- `routing.client_traffic`: toggle for whether a connected client's traffic is routed
  through Upstream by default at all (governed by `routing.mode`) -- off leaves clients on
  plain host NAT even with Upstream enabled, relying only on explicit per-profile
  targeting. Defaults on for upgrade compatibility.
- `routing.host_split`: a routes/domains list (inline, runtime-editable file, static
  files, URLs -- same shape as `routing.split`) dedicated to the HOST's own traffic under
  `routing.host_mode: split`, entirely separate from the client-facing `routing.split`
  list it used to silently share. New "Host routes"/"Host domains" fields and their own
  file/URL sources in the Upstream settings dialog, under "This host's own traffic".

### Changed

- The Upstream tab now shows only a plain profile list (same look as the Users/Sessions
  tables), with the default (active) profile always first, then any profile with a live
  connection (showing its internal/external IP), then the rest in the order they were
  added. Each row has Connect/Disconnect and Make default actions; switching the default
  profile away from the current one now asks for confirmation.
- Server-side routing settings (Mode, Host traffic, Host mode, the Routes/Domains lists
  and their file/URL sources, and the Advanced main_interface/fwmark/table id/nftables
  prefix block) moved out of the Upstream tab entirely and into the existing Upstream
  "Settings" dialog, alongside check host/failover/connect-on-boot -- one popup for every
  upstream-wide setting, saved together. They're disabled in that dialog while
  `upstream.enabled` is false, since they have no effect until Upstream is turned on.
- The nftables Show/Reload/Apply/Cleanup panel is no longer duplicated on the Upstream
  tab -- use the Dashboard's existing "Render configs"/"Apply firewall/NAT" actions (or
  `korctl nft`/`korctl routes reload` from the CLI) for manual re-application.

### Fixed

- Toggle switches and the Save button in the Upstream profile/settings dialogs no longer
  sit slightly out of line with the input fields and each other in their row.
- The Certificate/Key/PKCS#12 fields in the upstream profile editor no longer force the
  whole dialog to scroll horizontally -- each now takes its own full-width row instead of
  being squeezed into a narrow shared column.
- A new upstream profile no longer defaults to "Turn on Upstream (all profiles)" and
  "This profile enabled" both checked -- every toggle starts off, opt-in. Editing an
  existing profile also no longer always shows Upstream-enabled as checked regardless of
  its real state, which could silently re-enable Upstream globally on an unrelated edit
  while it was deliberately turned off. The two toggles are also relabeled ("Turn on
  Upstream (all profiles)" / "This profile enabled") with clearer tooltips, since their
  difference (global vs. this one profile) was easy to confuse.
- VPN clients could connect successfully but get no network access at all through the
  tunnel on a Docker host whose `ip filter` FORWARD chain defaults to policy drop (recent
  Docker/Moby releases) and only accepts docker0-related traffic: under
  `network_mode: host`, the VPN client's forwarded traffic is unrelated to docker0 and
  fell through that drop policy regardless of korserver's own (separate table) rules.
  `korctl nft apply` now also ensures a compatibility accept rule in Docker's own
  `DOCKER-USER` chain (the interoperability hook Docker itself documents for this),
  scoped to the VPN client subnet; a no-op on non-Docker hosts.

### Removed

- `routing.mode: direct`. Upstream routing is now always `full` or `split` once
  `upstream.enabled` is true; there is no "off" mode to opt out of NAT/routing management
  for it.

### Fixed

- Clients no longer lose network access when upstream routing isn't configured: they
  always get NAT through the host by default now, and `routing.mode` only affects the
  upstream connection itself instead of gating NAT for everyone.
- Saving or editing an upstream profile no longer force-switches the active profile --
  only the very first profile ever saved is auto-selected.
- `korctl nft apply`/the panel's Reload no longer risk a window with no kill-switch and
  no NAT at all if the ruleset reload fails: the table delete/redefine is now one atomic
  `nft -f` transaction instead of separate delete-then-load commands.
- A named upstream-profile routing target's fwmark/table_id no longer shifts when an
  unrelated profile's `routes`/`domains` change -- it's now derived from that profile's
  fixed position in `upstream.profiles` (or a new explicit `routing_offset` override),
  and a target that disappears (routes cleared, profile removed) now has its old
  `ip rule`/table cleaned up instead of leaking it forever.
- A reload outside the connect/switch/disconnect lifecycle now reasserts routing for
  every profile's named target, not just the default bucket; previously named targets
  could go stale until the next watchdog tick.
- `switch_profile`/`connect`/`disconnect`/`recover`/`enforce_profile_enablement`/
  `ensure_policy_routing` are now serialized with a cross-process lock, so a manual
  switch/connect/disconnect from the API/CLI can no longer interleave with a concurrent
  watchdog tick and misroute marked traffic.
- `routing.fwmark`/`table_id` (and a profile's derived per-target values) now reject `0`
  and the kernel-reserved table IDs `253`/`254`/`255`, and two upstream profile names
  that collide once normalized for their nftables set name are now rejected at config
  validation time instead of breaking the whole ruleset load.
- `upstream.profiles[].name` is now validated to a short identifier, closing a
  path-traversal gap where a crafted profile name could write decoded
  `cert_file_base64`/`key_file_base64` content outside the secrets directory.
- A username or group name of exactly `.` or `..` is now rejected: their per-user/
  per-group config paths append no filename suffix, so either would have resolved to
  the config directory itself or its parent.
- Certificate/OTP/route/domain revocation and enable/disable operations
  (`revoked.pem`, `users.oath`, `routes.txt`/`domains.txt`) are now serialized with a
  lock, matching the existing `ocpasswd` protection -- concurrent requests (e.g. two
  admin browser tabs) could previously lose one write to another.
- Generated CA/server/user private keys are now explicitly `chmod`'d to `0600` right
  after creation, instead of relying only on the containing directory's `0700` mode.
- A failure writing `audit.jsonl` (disk full, permissions, a read-only mount) no longer
  turns an already-successful mutating request into an unhandled 500 with no indication
  the action actually succeeded.
- Stale documentation/examples fixed for accuracy: `docs/architecture.md`'s backend
  package tree, `docs/features.md`'s GUI page list, `examples/config.middle-server.yaml`'s
  camouflage secret (now uses the dedicated `camouflage_secret` field instead of an
  inline `port` suffix), and `config.example.yaml`'s missing `admin_totp_*` keys.

### Security

- Mutating requests authenticated via HTTP Basic (not just cookie sessions) are now
  rejected when their `Origin`/`Referer` names a different host -- previously only the
  cookie-session path checked a CSRF token, leaving every mutating endpoint exploitable
  from a third-party page against an admin who had ever used Basic Auth in a browser.
- A wrong admin TOTP code during login now counts toward the same lockout as a wrong
  password; previously the 6-digit code could be brute-forced with unlimited attempts
  once an attacker had the password.
- Admin sessions now expire after a fixed multiple of `web.session_lifetime` regardless
  of activity, instead of sliding forever on every use -- bounding how long a
  leaked/stolen session cookie stays valid.
- Documented that `web.trusted_proxies` also governs login rate-limiting and the
  unauthenticated `/api/client/routing` endpoint's IP-based identification, not just the
  admin panel -- only list a proxy that strictly overwrites `X-Forwarded-For`.
- Fixed a plaintext leak of `upstream.profiles[].camouflage_secret` (a shared credential
  for the *upstream* server) through `GET /api/config`, `POST /api/upstream/settings`,
  and every other endpoint that calls `AppConfig.model_dump_safe()`: it was incorrectly
  exempted from masking by the same key-name carve-out meant only for the unrelated
  `server.camouflage.secret` ocserv.conf directive text. `/api/upstream/*` and
  `/api/identity/*` responses now mask every write-only/secret field through the
  centralized `is_secret_key()` check instead of a hand-picked exclude list, so a future
  secret-like field is covered automatically.
