# Changelog

## [Unreleased]

### Added

- Independent host-traffic routing: `routing.host_traffic`/`routing.host_mode`
  (`full`/`split`) route the server host's own traffic through upstream, decided
  separately from the client-facing `routing.mode`.
- Per-upstream-profile targeted routes/domains: any `upstream.profiles[]` entry can list
  its own `routes`/`domains` to route through that profile's tunnel specifically,
  regardless of which profile is active -- each gets its own fwmark/table/kill-switch and
  nftables set. Configurable from the Upstream tab's profile editor ("Target
  routes"/"Target domains").
- `upstream.profiles[].routing_offset`: an optional explicit override for a profile's
  fwmark/table_id offset, for when the default (derived from the profile's position in
  `upstream.profiles`) needs to be pinned.
- Structured GUI control for `upstream.check_settle_seconds` (previously YAML-only).

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
