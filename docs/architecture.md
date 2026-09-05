# Target architecture

## Layers

1. Configuration layer
   - Load defaults.
   - Load YAML config.
   - Load `.env`.
   - Apply environment variable overrides.
   - Apply CLI flag overrides.
   - Validate with Pydantic.

2. Domain layer
   - Users.
   - Certificates.
   - OTP.
   - Sessions.
   - Server runtime.
   - Upstream profiles.
   - Routing profiles.
   - DNS/domain sets.
   - Firewall/nftables state.

3. Service layer
   - `ConfigService`.
   - `OcservConfigRenderer`.
   - `UserService`.
   - `CertificateService`.
   - `OtpService`.
   - `SessionService`.
   - `UpstreamService`.
   - `RoutingService`.
   - `DnsmasqService`.
   - `NftablesService`.
   - `DiagnosticsService`.
   - `LogService`.

4. Infrastructure layer
   - Safe command runner.
   - File manager with atomic writes.
   - Secret masker.
   - Process supervisor adapter.
   - Systemd/supervisord/s6 adapter if needed.

5. Interface layer
   - CLI.
   - REST API.
   - Optional Web GUI.

## Backend package proposal

```text
korserver/
├── __init__.py
├── main.py
├── cli.py
├── api/
│   ├── app.py
│   ├── auth.py
│   ├── routes_users.py
│   ├── routes_sessions.py
│   ├── routes_config.py
│   ├── routes_routing.py
│   ├── routes_upstream.py
│   └── routes_diagnostics.py
├── config/
│   ├── defaults.py
│   ├── loader.py
│   ├── env.py
│   └── models.py
├── services/
│   ├── command.py
│   ├── files.py
│   ├── ocserv.py
│   ├── users.py
│   ├── certificates.py
│   ├── otp.py
│   ├── sessions.py
│   ├── upstream.py
│   ├── routing.py
│   ├── dnsmasq.py
│   ├── nftables.py
│   └── diagnostics.py
├── renderers/
│   ├── ocserv.py
│   ├── dnsmasq.py
│   ├── nftables.py
│   └── supervisor.py
└── schemas/
```

## Runtime modes

### Normal VPN server mode

- ocserv accepts user connections directly.
- traffic can be direct, NATed through host interface, or routed according to config.

### Middle-server mode

- ocserv accepts user connections.
- korserver also runs OpenConnect client connections to upstream private ocserv
  servers (`upstream.*`), each daemonized (`--background --pid-file`) once
  connected so the request that started it returns promptly instead of blocking
  for the whole session (`UpstreamService.connect()`).
- several profiles can be **connected simultaneously**: each profile gets its
  own tunnel device (explicit `profiles[].interface`, or derived -- the first
  profile inherits the top-level `upstream.interface`, later ones get
  `oc-up<N>`) and its own pid file. Exactly one profile is *active*: the
  nftables `oifname` match and the policy-route device point at its tunnel.
  Switching the active profile (`korctl upstream switch` / the panel's Switch
  button) only re-points those redirection rules -- connections stay up.
- how the *server's own* egress for that VPN client traffic is routed (as opposed
  to what ocserv pushes to clients themselves, which is `server.routes`/`no_routes`,
  independent of this) is `routing.mode`, one web section ("Upstream", merged
  with the former standalone "Routing" tab so the two aren't presented as
  unrelated features):
  - `direct`: korserver does not manage NAT/routing for the VPN subnet at all;
  - `full`: all VPN client traffic is marked and forced through the upstream
    interface via a dedicated policy-routing table (`ip rule`/`ip route`,
    `routing.fwmark`/`routing.table_id`); an nftables `forward` rule drops any
    marked packet that doesn't leave via that interface, i.e. a kill switch --
    if upstream is down, traffic is blocked rather than leaking out the host's
    own connection;
  - `split`: only `routing.split.routes` (CIDRs -- a single host is just a
    /32) and domain-resolved addresses (fed into an nftables set by
    dnsmasq's `nftset=`) are marked and subject to the same
    forced-routing/kill-switch treatment; everything else is masqueraded
    normally through the host, unaffected.
  - In `full`/`split`, VPN clients should be pointed at this server's own
    dnsmasq (`routing.split.dnsmasq_listen`, via `split.tunnel_dns`) so
    split-DNS domain resolution feeds the same nftables set; clients doing
    their *own* split routing/DNS locally instead just point their own
    resolver at this server's VPN address.
  - `routing.split.host_traffic` extends split mode to the **server host's own
    traffic**: an nftables `output` chain (`type route hook output`) marks
    host-originated packets whose destination is in the split sets, so they hit
    the same fwmark policy route (and, with upstream enabled, the same
    kill-switch via a `postrouting` filter chain — postrouting on purpose: an
    output-hook filter chain shares its nf_hook_state with the route chain
    and still sees the pre-reroute oifname, so it would drop every marked
    host packet even with the tunnel up). Only connections the
    host itself initiated are marked (`ct direction original`) — replies to
    inbound connections (SSH, the panel, ocserv sessions) keep their normal
    route. Marked host traffic is additionally masqueraded to the upstream
    tunnel address: locally originated packets pick their source address
    *before* the fwmark re-route (same reason korclient masquerades its own
    tunnel egress), so without it they would enter the tunnel with the uplink
    source and replies would never return — this also silently kills dnsmasq's
    own queries to an upstream DNS reached through the tunnel, draining the
    domain-fed split sets. For domain masks to apply to the host too, point the host's
    resolver at `routing.split.dnsmasq_listen` (the address already sits on
    `lo`, see "Listen address lifecycle"): `nameserver 10.10.10.1` in
    `/etc/resolv.conf`. This replaces the tempting-but-broken pattern of
    connecting the host to its own ocserv as a client: such a session's sync
    requests to `/api/client/routing` arrive over loopback with a non-tunnel
    source address and fail the VPN-session check. Split mode only: in full
    mode "all host traffic via upstream" would also capture the upstream
    tunnel's own packets and loop. Caveat: split routes/domains must not
    cover the upstream server's own address, or the tunnel carrier traffic
    itself gets marked into the tunnel. **Requires `network_mode: host`** — the
    project's `compose.yaml` uses it by default precisely for this and to drop
    an extra NAT hop for VPN traffic in general (see README's Quick Start), not
    as an opt-in for this one feature. Under the bridge network + port mapping
    this replaced, every mechanism named above (upstream tunnels, nftables
    rules, the fwmark table, dnsmasq's listen address) exists only inside the
    container's own network namespace — VPN clients still work, but the host's
    packets never traverse the container's netfilter, so the feature silently
    does nothing for the host and `ip route show table <id>` on the host stays
    empty.
  - In full/split the upstream openconnect runs with a minimal
    interface-only vpnc-script (`templates/vpnc-script-korserver`, installed
    into generated_dir on connect): the fwmark policy routing owns all
    tunnel egress, so upstream-pushed routes/DNS must not touch the
    namespace's routing table or resolv.conf — under `network_mode: host`
    the distribution vpnc-script would hijack the host's default route.
    Direct mode keeps the distribution script and its full route/DNS
    handling.
- `upstream.check_interval`/`check_threshold`/`failover` drive a supervised
  watchdog (`[program:upstream-watchdog]`, `korctl upstream watch`) that pings
  the active profile's `check_host` **through the tunnel interface**
  (`ping -I`; a host that also answers via the uplink would otherwise report
  healthy forever while the tunnel is dead) — or just checks the process is
  alive if unset. On every healthy tick it also re-asserts the fwmark
  rule/route (`PolicyRoutingService.ensure()`, add-only, no del/add churn):
  the kernel purges the fwmark table's route whenever the tunnel device
  bounces, e.g. during openconnect's own internal reconnect. After
  `check_threshold` consecutive failures, it recovers: the
  active profile is redialed first, then -- if `failover` is enabled and more
  than one profile exists -- the next profiles in list order, cycling. A
  standby profile whose tunnel is already up is adopted by just switching the
  redirection rules to it, no dialing (`UpstreamService.recover()`).

## Internal DNS

`internal_dns` turns the VPN server itself into the DNS server for connected clients:

- ocserv pushes the project-owned dnsmasq listen address (`routing.split.dnsmasq_listen`,
  which must be inside `server.ipv4_network`) to clients instead of `server.dns`, plus
  `tunnel-all-dns = true` so blocking cannot be bypassed;
- dnsmasq forwards queries to the resolvers configured in `server.dns`;
- blocked domains answer with `0.0.0.0` (Pi-hole style), rendered into
  `generated/dnsmasq-blocklist.conf` from three merged sources:
  1. `internal_dns.blocklist_domains` — inline list in the config (GUI textarea);
  2. `internal_dns.blocklist_files` — any number of local text files (hosts or
     plain-domain format);
  3. `internal_dns.blocklist_urls` — any number of HTTP(S) lists, each downloaded on
     demand (`korctl internal-dns refresh --url <url>` or the panel's per-URL
     "Download & apply" button), validated (scheme, size cap, per-line domain parsing)
     and cached individually under `data_dir/internal-dns/urls/` before use.

The same dnsmasq instance also serves split-DNS domains when `routing.mode: split` with
`split.tunnel_dns: true` is active — both features compose; enabling either one starts the
`dnsmasq` supervisor program and switches the client DNS to the VPN server
(`AppConfig.dns_tunnel_active()` / `client_dns_servers()`).

### Listen address lifecycle (runtime-dependent)

ocserv never assigns the VPN gateway IP to any host interface: it creates one
point-to-point tun device (`vpnsN`) per client, and per-client `/32` routes appear only
while clients are connected — so the absence of a `10.10.10.0/24` route on the host is
normal, and a bare dnsmasq would fail with "cannot assign requested address". The
supervisor therefore starts dnsmasq through `korctl internal-dns run`, which first runs
the idempotent `ip addr replace <listen>/32 dev lo` and then execs dnsmasq in the
foreground. With the address on `lo`, client DNS packets arriving via `vpnsN` are
delivered locally instead of following the default route out of the main interface
(requires `NET_ADMIN`, works with `network_mode: host`). `korctl internal-dns
ensure-listen [--dry-run]` runs the same step manually.

## Client routing sync

`GET /api/client/routing` is the only endpoint without admin authentication:
it serves connected VPN clients (the korclient sync loop). The caller is
identified by its VPN session — the request must originate from an address
inside `server.ipv4_network` that occtl reports as an active session — and
receives only its own effective routing (server `routes`/`search_domains`,
the user's config-per-group files, the per-user config) plus a version hash.
korclient polls it through the tunnel and applies changes live without
reconnecting.

## Control surfaces

CLI is the primary control surface and must always work.

API and Web GUI are optional and disabled by default. When enabled, GUI uses backend API only.

## Config ⇄ GUI parity

The web panel's "Config" tab has a raw YAML editor (validate/save/render/diff against
`config.yaml` directly). That editor is a fallback and power-user escape hatch — it exists so
the panel is never blocked on a missing feature, not so individual settings only need to be
discoverable there. The actual goal is that **every config knob in `AppConfig`
(`backend/korserver/config/models.py`) has a matching structured control** somewhere in the
panel (a labeled input, checkbox or select bound to that specific field), grouped to mirror
`config.yaml`'s own section layout: VPN server behavior and accepted auth methods live under
the "Server (VPN)" / "Authentication methods" panels (Config tab), the admin web panel's own
settings live under "Web / API panel", `system`/`cli` under "General", `identity`/`certificates`
live in their own dedicated tabs, and `routing` lives inside the "Upstream" tab (not its own
tab) since routing.mode's full/split behavior only means anything in terms of the upstream
connection it forces traffic through -- keeping them apart read as two unrelated features.

When a new field is added to `AppConfig`, add its GUI control in the same change:

- Backend: extend (or add) a small typed Pydantic request model next to the relevant router
  and patch the config through `apply_config_patch()` in `backend/korserver/api/routes_config.py`
  — every settings-save endpoint in the codebase already goes through this one helper
  (`deep_merge` into the YAML, re-validate, write, optionally re-render). Don't invent a second
  mechanism.
- Frontend: add a draft `useState` initialized from the loaded config (see the `read*Draft`
  helpers in `frontend/src/main.tsx`, e.g. `readServerSettingsDraft`), a bound input/checkbox/
  select in the relevant view, and a save handler that calls the new endpoint through
  `runAction` (for consistent busy-state/notice/error handling).

Exceptions that intentionally stay YAML-only, because a form control would be actively
misleading or unsafe:

- deploy-time paths fixed via `.env`/volume mounts at container start
  (`system.data_dir`/`log_dir`/`generated_dir`/`secrets_dir`,
  `identity.config_per_group_dir`/`config_per_user_dir`,
  `web.tls_cert`/`tls_key`/`static_dir`) — editing these live would desync the running
  process from its actual mounted volumes;
- `advanced.raw_ocserv_options` — a free-form list/mapping escape hatch by design;
- `web.admin_password`/`admin_password_hash` — belongs behind a dedicated change-password
  flow, not a plain-text field in a general settings dump.
