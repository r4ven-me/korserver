# Korvus Server

Korvus Server (`korserver`) is a Python-first management platform for OpenConnect/ocserv
VPN in Docker. The project supports two modes:

- a regular OpenConnect VPN server built on `ocserv`;
- middle-server mode, where the container additionally dials an outbound `openconnect`
  connection into a private network and routes selected client traffic through it.

The CLI is the primary interface and always works. The Web API/GUI are optional and
disabled by default.

## Features

- typed Python backend: FastAPI, Typer, Pydantic v2, Jinja2;
- YAML-first configuration;
- overrides via `.env` and environment variables;
- settings precedence: CLI overrides -> environment -> `.env` -> YAML -> defaults;
- generates `ocserv.conf`, `dnsmasq.conf`, `nftables.nft`, `supervisor.conf`;
- idempotent runtime initialization: missing configs and auto-certificates are created
  on container start;
- atomic writes for generated files and secret/runtime files;
- centralized secret masking in CLI/API/log-related output;
- manages users, passwords, certificates, PKCS#12, OTP;
- commands for sessions, upstream profiles, split routes/domains, nftables and
  diagnostics;
- multi-stage Dockerfile with frontend/backend test stages;
- compose file with `/dev/net/tun`, `NET_ADMIN`, `NET_RAW` and persistent volumes.

## Korvus Client

[Korvus Client](https://github.com/r4ven-me/korclient) is the companion client project,
in its own repository: an OpenConnect client in Docker with two modes - full tunnel and
split routing. Route (`route =`) and domain (`split-dns =`) lists are configured
centrally in the korserver web panel (per-user / per-group ocserv configs) and delivered
to the client through the standard AnyConnect handshake on connect; no separate sync
service is required.

## Requirements

Running in Docker requires a Linux host with:

- Docker Engine and the Docker Compose plugin;
- `/dev/net/tun` available;
- permission to run containers with `NET_ADMIN` and `NET_RAW`;
- free ports `443/tcp` and `443/udp` if using the standard VPN port.

Check TUN on the host:

```bash
test -c /dev/net/tun && echo "tun ok"
```

Rootless Docker generally isn't suitable for the full VPN networking stack.

## Quick Start

Build the image, prepare the configs and start the container:

```bash
make docker-build
mkdir -p config data logs
cp config.example.yaml config/config.yaml
cp .env.example .env
docker compose up -d
```

`compose.yaml` runs with `network_mode: host` - this is the target, recommended deployment
scheme, not just a performance tweak for special cases. The container uses the host's
network interfaces directly instead of Docker's bridge/NAT, which removes an extra
`docker-proxy` hop for VPN client traffic and lets the host itself participate in split
routing (`routing.split.host_traffic`) and use the built-in `dnsmasq` as its own
resolver - neither is possible under the default bridge network, since host packets
never traverse the container's netfilter there. Two things worth knowing: `nft` rules
are applied directly to the host's netfilter in this mode (not an isolated namespace),
so the image's `nftables` userspace version (built on Debian) should match the host
kernel - a Debian host avoids the issue entirely; and `korserver` only ever creates its
own project-owned tables (prefixed with `routing.nft_prefix`, no global `flush
ruleset`), so it doesn't touch unrelated host rules. The `devices:` list also maps
`/dev/vhost-net` - an optional accelerated TUN path that `openconnect` (including the
Upstream/middle-server outbound tunnel) can use if the host supports the `vhost_net`
kernel module; if it's missing, `openconnect` silently falls back to a plain `tun`, only
logging a harmless `Failed to open /dev/vhost-net`.

Check the status:

```bash
docker compose ps
docker compose logs -f korserver
docker compose exec korserver korctl server status
```

Expected signs of a successful start:

- the container is `healthy` or `running`;
- the logs contain `ocserv entered RUNNING state`;
- `korctl server status` shows `ocserv RUNNING`;
- `ocserv` listens on `0.0.0.0:443` over TCP and UDP.

Check listening ports inside the container:

```bash
docker compose exec korserver sh -lc 'ss -lntup | grep 443'
```

Under `network_mode: host` there's no Docker port-publishing step at all - whatever the
container binds to, the host has directly. The Web API/GUI are simply disabled
(`web.enabled: false`) by default, so `curl 127.0.0.1:8443` isn't a valid check of the
VPN server under normal operation. To check the Web component, use the separate override
described in "Web API and GUI".

Stop:

```bash
docker compose down
```

The project never deletes runtime data automatically. To start fresh, remove the local
volume directories explicitly:

```bash
docker compose down
rm -rf data logs
```

## Directory Structure

Key files:

- `backend/korserver/` - Python package, CLI, API, config models, services, renderers;
- `frontend/` - Vite/React/TypeScript GUI source;
- `templates/` - Jinja2 templates for generated system configs;
- `tests/` - pytest coverage;
- `docs/` - additional notes on architecture, security, networking and Docker;
- `examples/` - minimal, full and middle-server configurations;
- `Dockerfile` - frontend/backend test stages and the runtime image;
- `compose.yaml` - production-like container startup;
- `config.example.yaml` - main example YAML config;
- `.env.example` - example env overrides and secret values;
- `Makefile` - local and Docker check commands.

Runtime volumes for `docker compose up`:

- `./config:/etc/korserver` - user configuration;
- `./data:/var/lib/korserver` - generated configs, secrets, certs, route/domain files;
- `./logs:/var/log/korserver` - runtime logs.

Key runtime paths inside the container:

- `/etc/korserver/config.yaml` - main YAML config;
- `/var/lib/korserver/generated/ocserv.conf` - rendered ocserv config;
- `/var/lib/korserver/generated/supervisor.conf` - rendered supervisor config;
- `/var/lib/korserver/secrets/ocpasswd` - password auth database;
- `/var/lib/korserver/secrets/users.oath` - OTP users file;
- `/var/lib/korserver/certs/` - CA/server/user certificates;
- `/var/log/korserver/` - application/supervisor logs.

## Build and Checks

CI-friendly checks:

```bash
make docker-test
make docker-build
make docker-cli-check
```

`make docker-test` builds two test stages:

- `frontend-test`: `npm ci`, `npm audit --audit-level=moderate`, production build;
- `backend-test`: install `.[dev]`, `ruff`, `mypy`, `pytest`, dry-run render.

Local backend development:

```bash
python -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
make check
make render
```

Local frontend build:

```bash
make frontend-build
make frontend-audit
```

## Configuration

The main file is YAML:

```bash
cp config.example.yaml config/config.yaml
```

Minimal working VPN config:

```yaml
system:
  data_dir: /var/lib/korserver
  log_dir: /var/log/korserver
  generated_dir: /var/lib/korserver/generated
  secrets_dir: /var/lib/korserver/secrets

server:
  enabled: true
  listen: 0.0.0.0
  port: 443
  udp_enabled: true
  device: vpns
  cn: vpn.example.com
  ipv4_network: 10.10.10.0/24
  dns:
    - 1.1.1.1
    - 8.8.8.8

certificates:
  mode: auto
  letsencrypt:
    enabled: false
    email: null
    domains: []
    renew_reload: true
    auto_renew_enabled: true
    auto_renew_interval: 7
    auto_renew_interval_unit: days # hours | days | weeks | months

auth:
  password:
    enabled: true
  certificate:
    enabled: false
  otp:
    enabled: false
    ocserv_oath_auth: false

routing:
  mode: full

upstream:
  enabled: false

web:
  enabled: false
```

Validate the YAML without writing files:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config validate
```

Preview rendered configs without writing:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config render --dry-run
```

Write the rendered configs:

```bash
docker compose exec korserver korctl config render
```

Diff between the current generated files and a fresh render:

```bash
docker compose exec korserver korctl config diff
```

### Exhaustive Configuration Reference

Every top-level field `AppConfig` knows about, in one file - also available as
`examples/config.full.yaml`. Useful as a copy-paste base, or just to see what exists
beyond the minimal example above. Values are illustrative, not defaults; anything you
omit falls back to the real default in `backend/korserver/config/models.py`. It was
validated as-is with `korctl config validate` and `korctl config render --dry-run`
(after exporting the referenced `${SECRET:...}` names).

```yaml
system:
  timezone: Europe/Moscow
  data_dir: /var/lib/korserver
  log_dir: /var/log/korserver
  generated_dir: /var/lib/korserver/generated
  secrets_dir: /var/lib/korserver/secrets
  log_level: info # debug | info | warning | error
  project_name: korserver
  log_rotation:
    enabled: false
    max_size_mb: 50
    max_age: 0
    max_age_unit: days # hours | days | weeks | months
    keep_files: 5

server:
  enabled: true
  listen: 0.0.0.0
  port: 443
  udp_enabled: true
  device: vpns
  cn: vpn.example.com
  realm: Korvus Server
  ipv4_network: 10.10.10.0/24
  dns:
    - 10.10.10.1
    - 1.1.1.1
  search_domains:
    - corp.example.com
  routes:
    - 192.168.25.0/24
  no_routes: []
  max_clients: 128
  max_same_clients: 2
  keepalive: 32400
  compression: false
  cisco_client_compat: true
  debug_level: 2
  connect_script: null
  disconnect_script: null
  camouflage:
    enabled: true
    secret: secretWord
    realm: Hidden service

certificates:
  mode: auto # auto | external
  ca_name: Example Internal CA
  server_cert: null
  server_key: null
  ca_cert: null
  letsencrypt:
    enabled: false
    email: admin@example.com
    domains:
      - vpn.example.com
    renew_reload: true
    auto_renew_enabled: true
    auto_renew_interval: 7
    auto_renew_interval_unit: days # hours | days | weeks | months
    http01_address: null
    http01_port: 80

auth:
  password:
    enabled: true
  certificate:
    enabled: true
  otp:
    enabled: true
    ocserv_oath_auth: false
    issuer: Korvus Server
    send_by_email: false
    send_by_telegram: false
  # Experimental: the OIDC/PAM-RADIUS auth bridge hasn't been verified against
  # a real IdP in production. See "OIDC / Identity" before relying on it.
  oidc:
    enabled: true
    connector: pam # pam | radius
    pam:
      service: ocserv-oidc
      gid_min: 1000
    radius:
      config_file: /etc/radiusclient/radiusclient.conf
      groupconfig: true
      nas_identifier: korserver
      group_separator: semicolon # semicolon | comma

identity:
  config_per_group_dir: /var/lib/korserver/generated/config-per-group
  config_per_user_dir: null
  default_group_config: null
  select_group_by_url: true
  default_select_group: devops
  # Same experimental status as auth.oidc above.
  oidc_providers:
    - name: keycloak
      issuer_url: https://sso.example.com/realms/vpn
      client_id: korserver-vpn
      client_secret: "${SECRET:OIDC_CLIENT_SECRET}"
      scopes:
        - openid
        - profile
        - email
      username_claim: preferred_username
      groups_claim: groups
      allowed_groups:
        - devops
        - finance
  group_policies:
    - name: devops
      display_name: DevOps
      routes:
        - 10.20.0.0/16
      dns:
        - 10.10.10.1
      split_dns:
        - corp.example.com
      max_same_clients: 4
    - name: finance
      display_name: Finance
      routes:
        - 10.30.0.0/16
      no_routes:
        - 10.20.99.0/24
      session_timeout: 28800

upstream:
  enabled: true
  interface: oc-middle0
  check_interval: 5
  check_threshold: 3
  check_settle_seconds: 15
  failover: true
  profiles:
    - name: private-main
      server: private.example.com
      port: "443"
      # Only if the upstream ocserv itself has camouflage enabled; appended
      # as "/?secret" after host:port, same as server.camouflage.secret on
      # this server's own side. Optional -- omit for a plain upstream.
      camouflage_secret: "${SECRET:PRIVATE_MAIN_CAMOUFLAGE_SECRET}"
      auth_type: p12 # password | cert | p12
      trusted_cert: true
      cert_file: /var/lib/korserver/secrets/private-main.p12
      # Alternative to cert_file/key_file: paste the file itself, Base64-encoded,
      # so it never has to exist on disk outside korserver's own secrets_dir:
      # cert_file_base64: "${SECRET:PRIVATE_MAIN_P12_BASE64}"
      cert_pass: "${SECRET:PRIVATE_MAIN_P12_PASSWORD}"
      check_host: 10.11.11.1
    - name: private-backup
      server: backup.example.com
      port: "443"
      auth_type: password
      username: middle-user
      password: "${SECRET:PRIVATE_BACKUP_PASSWORD}"
      trusted_cert: false
      server_cert_pin: ""
      check_host: 10.12.12.1

routing:
  mode: split # direct | full | split
  main_interface: auto
  fwmark: "0x0c01"
  table_id: 1201
  nft_prefix: korserver
  split:
    tunnel_dns: true
    host_traffic: false
    dnsmasq_listen: 10.10.10.1
    dnsmasq_port: 53
    routes_file: /var/lib/korserver/routes.txt
    domains_file: /var/lib/korserver/domains.txt
    routes:
      - 192.168.25.0/24
      - 10.20.0.0/16
    domains:
      - example.com
      - corp.example.com

internal_dns:
  enabled: true
  blocklist_domains:
    - ads.example.com
    - tracker.example.net
  blocklist_files:
    - /var/lib/korserver/blocklist.txt
  blocklist_urls:
    - https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
    - https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/multi-onlydomains.txt
  cache_size: 150
  log_queries: false
  local_records:
    - "nas.corp.local 10.11.11.5"

web:
  enabled: false
  listen: 127.0.0.1
  port: 8443
  tls: true
  tls_cert: null
  tls_key: null
  allow_insecure_http: false
  trusted_proxies: []
  admin_user: admin
  admin_password: null
  admin_password_hash: "${SECRET:KORSERVER_ADMIN_PASSWORD_HASH}"
  static_dir: /usr/share/korserver/frontend # container-internal, rarely changed
  terminal_enabled: false
  terminal_idle_timeout: 900
  terminal_max_sessions: 2
  session_lifetime: 43200
  session_cookie_secure: true
  admin_totp_enabled: false
  admin_totp_secret: null

cli:
  enabled: true

advanced:
  raw_ocserv_options:
    auth-timeout: 240
```

Section by section, beyond what's already covered in depth elsewhere in this README:

- `system` - runtime paths and log level/rotation; `project_name` feeds the ocserv
  `device` name prefix and the default nftables table prefix.
- `server` - `connect_script`/`disconnect_script` are optional host-side hooks ocserv
  runs on client connect/disconnect (absolute paths inside the container); `camouflage`
  makes `ocserv` masquerade as a plain web service until the connecting client's URL
  includes `?<camouflage.secret>`, defeating simple active probing.
- `certificates` - see "Certificates and PKCS#12" for `mode`/Let's Encrypt in depth.
- `auth` - password/certificate/OTP are covered in "Users and Passwords"/"OTP"; `oidc`
  is the experimental PAM/RADIUS bridge, covered next.
- `identity` - OIDC providers and group policies, covered in "OIDC / Identity"
  (**experimental, not verified against a real IdP in production** - see that section).
- `upstream` - middle-server outbound profiles, covered in "Middle-Server Mode";
  `cert_file_base64`/`key_file_base64` let a profile's client certificate/key travel
  as a `.env` secret instead of a mounted file, the same pattern Korvus Client uses.
- `routing` - server-side policy routing/kill-switch, covered in "Routing,
  Firewall/NAT, Split Routes and Domains".
- `internal_dns` - the built-in blocking resolver; unlisted here beyond the minimal
  example, but every field is self-explanatory from its name (domains/files/URLs to
  block, DNS cache size, query logging, local A-record overrides).
- `web` - the panel, covered in depth in "Web API and GUI"; `tls_cert`/`tls_key` (both
  required together, or both left `null` for the auto-generated certificate) let you
  bring your own certificate for the panel independent of the VPN's own certificates;
  `admin_totp_*` is managed entirely through the panel's own two-factor setup flow, not
  meant to be hand-written - `admin_totp_secret` only exists here because it has to live
  somewhere once you enable it.
- `cli` - `enabled: false` would disable the CLI, which contradicts the project's
  "CLI is always the primary interface" principle; there's essentially no good reason to
  set this.
- `advanced.raw_ocserv_options` - an escape hatch straight into `ocserv.conf`: a mapping
  renders as `key = value` lines (`null` value for a bare flag), a list renders each
  entry verbatim as-is, for any directive the typed config doesn't model yet.

## Env Overrides and Secrets

Any YAML field can be overridden with an environment variable prefixed with
`KORSERVER_`. This is a compatibility runtime namespace kept from an earlier version of
the project: the public utility is called `korctl`, while the product is Korvus Server.
Nesting is expressed with a double underscore:

```env
KORSERVER_SERVER__PORT=4443
KORSERVER_SERVER__DNS='["1.1.1.1", "9.9.9.9"]'
KORSERVER_WEB__ENABLED=false
```

Lists are passed as a JSON string.

`KORSERVER_*` variables without `__` aren't treated as config overrides. You can use
them as plain secret values, e.g. `KORSERVER_ADMIN_PASSWORD` for
`${SECRET:KORSERVER_ADMIN_PASSWORD}`.

`.env` supports plain `KEY=value`, an optional `export` prefix, quoted values and
inline comments after unquoted values:

```env
export KORSERVER_SERVER__REALM="Corp # VPN"
KORSERVER_SERVER__CN=vpn.example.com # comment
```

Secrets can be kept in `.env` and referenced from YAML with `${SECRET:NAME}`:

```yaml
upstream:
  profiles:
    - name: private-main
      server: private.example.com
      username: middle-user
      password: "${SECRET:PRIVATE_MAIN_PASSWORD}"
```

`.env`:

```env
PRIVATE_MAIN_PASSWORD=change-me
```

Secrets must never end up in the README, issues, shell history or logs. The CLI/API
mask known secret values and strings like `password=...`, `token=...`, `secret=...`.

## Managing Korvus Server

Status:

```bash
docker compose exec korserver korctl server status
```

Reload `ocserv` via `korctl`:

```bash
docker compose exec korserver korctl server reload
```

Dry-run reload:

```bash
docker compose exec korserver korctl server reload --dry-run
```

`reload` sends `SIGHUP` to `ocserv`. That's enough for some changes, but not every
ocserv setting is applied via HUP. If behavior doesn't change after render/reload,
fully restart just the `ocserv` process without restarting the container:

```bash
docker compose exec korserver korctl server restart
docker compose exec korserver korctl server restart --dry-run
```

Stop the managed processes inside the container:

```bash
docker compose exec korserver korctl server stop
```

Manage individual supervisor runtime processes through the main utility:

```bash
docker compose exec korserver korctl server process list
docker compose exec korserver korctl server process restart dnsmasq
docker compose exec korserver korctl server process status certbot-renew
```

For day-to-day operation it's usually better to manage the container through Compose:

```bash
docker compose restart korserver
docker compose logs -f korserver
```

## Users and Passwords

Create a password-auth user:

```bash
docker compose exec korserver korctl user create alice
```

The CLI prompts for the password interactively and never echoes it.

List users:

```bash
docker compose exec korserver korctl user list
```

Change a password:

```bash
docker compose exec korserver korctl user passwd alice
```

Disable/enable a user:

```bash
docker compose exec korserver korctl user disable alice
docker compose exec korserver korctl user enable alice
```

Delete a user:

```bash
docker compose exec korserver korctl user delete alice
```

Without an interactive confirmation:

```bash
docker compose exec korserver korctl user delete alice --yes
```

A reload is usually enough after changing users:

```bash
docker compose exec korserver korctl server reload
```

## Certificates and PKCS#12

In:

```yaml
certificates:
  mode: auto
```

the container creates a CA and server certificate on first start if they don't already
exist.

Three practical scenarios are available for the server TLS certificate:

- `auto`: a local CA and server certificate are created inside the persistent volume;
- manual upload through the GUI: files are saved to `data/certs/external/`, the config
  switches to `certificates.mode: external`;
- Let's Encrypt through the GUI or CLI: uses `certbot certonly --standalone`, the active
  paths switch to the persistent `data/certbot/config/live/<domain>/`.

For Let's Encrypt, HTTP-01 port `80/tcp` must be reachable from outside and point at the
container. If `certificates.letsencrypt.enabled: true`, Korvus Server tries to obtain a
certificate on startup before `ocserv` starts, so the first VPN/Web TLS startup can
already use a valid chain. A certbot error at startup is logged and shouldn't crash the
container: see `/var/log/korserver/startup.log` and
`/var/log/korserver/certbot/letsencrypt.log`. After a manual upload, issue or renew, the
panel renders an up-to-date `ocserv.conf` and can immediately reload or restart
`ocserv`.

Paths:

- CA: `data/certs/ca.crt`, `data/certs/ca.key`;
- server cert/key: `data/certs/server.crt`, `data/certs/server.key`;
- external server cert/key/chain: `data/certs/external/server.crt`, `server.key`,
  `ca.crt`;
- user certs: `data/certs/users/<username>.crt`, `.key`, `.p12`.

Enable certificate auth:

```yaml
auth:
  password:
    enabled: true
  certificate:
    enabled: true
```

Create a client certificate:

```bash
docker compose exec korserver korctl user cert create alice
```

Create a PKCS#12 bundle:

```bash
docker compose exec korserver korctl user p12 create alice
```

The command supports a passphrase via `--passphrase VALUE`. Don't pass a real
passphrase through shell history on a production host; a temporary value is fine for
testing, and production should use a secure input/secret wrapper instead.

```bash
docker compose exec korserver korctl user p12 create alice --passphrase "$KORSERVER_P12_PASSPHRASE"
```

Apple-compatible PKCS#12:

```bash
docker compose exec korserver korctl user p12 create alice --apple-compatible
```

Revoke a certificate and generate a CRL:

```bash
docker compose exec korserver korctl user cert revoke alice
```

## OTP

Enable OTP in YAML:

```yaml
auth:
  password:
    enabled: true
  certificate:
    enabled: false
  otp:
    enabled: true
    ocserv_oath_auth: false
    issuer: Korvus Server
```

`enabled` turns on OTP secret management in the CLI/API/GUI. `ocserv_oath_auth` adds
`auth = "oath[...]"` to `ocserv.conf`; only enable it if your `ocserv` build supports
the OATH backend, otherwise the server won't be able to start.

Enable OTP for a user:

```bash
docker compose exec korserver korctl user otp enable alice
```

Show the QR code in the terminal:

```bash
docker compose exec korserver korctl user otp show-qr alice
```

Disable OTP:

```bash
docker compose exec korserver korctl user otp disable alice
```

OTP secrets are stored in `data/secrets/users.oath`.

## OIDC / Identity

**Experimental.** This feature is implemented and covered by unit tests, but hasn't been
verified end-to-end against a real IdP in production, and doesn't have the same
real-world mileage as the rest of the project. Treat it as a starting point to adapt and
test thoroughly against your own Keycloak/Authentik/RADIUS setup before relying on it,
not as a drop-in.

`ocserv` has no native browser-redirect OIDC flow for VPN clients. Korvus Server adds
an identity model for Keycloak/Authentik-like IdPs, generates ocserv `config-per-group`
files and hooks up real VPN authentication through a PAM or RADIUS bridge. Use a
PAM/RADIUS integration, or an outpost/proxy that returns ocserv-compatible users/groups.

Example YAML:

```yaml
auth:
  password:
    enabled: false
  oidc:
    enabled: true
    connector: pam
    pam:
      service: ocserv-oidc

identity:
  config_per_group_dir: /var/lib/korserver/generated/config-per-group
  select_group_by_url: true
  default_select_group: devops
  oidc_providers:
    - name: keycloak
      issuer_url: https://sso.example.com/realms/vpn
      client_id: korserver-vpn
      client_secret: "${SECRET:OIDC_CLIENT_SECRET}"
      username_claim: preferred_username
      groups_claim: groups
      allowed_groups:
        - devops
        - finance
  group_policies:
    - name: devops
      display_name: DevOps
      routes:
        - 10.20.0.0/16
      dns:
        - 10.10.10.1
      split_dns:
        - corp.example.com
      max_same_clients: 4
```

CLI:

```bash
korctl identity status
korctl identity oidc settings --enabled --connector pam --pam-service ocserv-oidc
korctl identity oidc provider-set keycloak \
  --issuer-url https://sso.example.com/realms/vpn \
  --client-id korserver-vpn
korctl identity group set --file group-devops.yaml
```

GUI: the `Identity` tab manages connector settings, OIDC providers and group policies.
The API/GUI never return `client_secret`; keep it in `${SECRET:OIDC_CLIENT_SECRET}`.

## Sessions

List active sessions via `occtl`:

```bash
docker compose exec korserver korctl sessions list
```

Kick a user:

```bash
docker compose exec korserver korctl sessions kick alice
```

Dry-run:

```bash
docker compose exec korserver korctl sessions kick alice --dry-run
```

## Routing, Firewall/NAT, Split Routes and Domains

This section controls how **the server itself** sends VPN client traffic onward - not
what ocserv pushes to clients (that's the separate `server.routes`/`no_routes`). The
server can just exit through the host, or through an upstream tunnel (see "Middle-Server
Mode" below); the modes decide which of these actually happens. In the web panel these
settings live under the "Upstream" tab (not a tab of their own), because they only mean
anything together.

Modes:

- `direct` - Korvus Server doesn't manage any NAT/forwarding rules at all;
- `full` - all VPN client traffic is marked and forced through the upstream interface
  via a dedicated policy-routing table; if upstream is enabled but unreachable, that
  traffic is blocked by a firewall rule (kill-switch) instead of leaking out directly
  from the host;
- `split` - only the routes/domains listed below are forced the same way; everything
  else is NAT'd through the host as usual.

Without an active upstream (`upstream.enabled: false`), `full`/`split` simply NAT the
VPN subnet through `main_interface` (or any interface, if `main_interface: auto`) - no
kill-switch, just plain masquerading.

Example split config:

```yaml
routing:
  mode: split
  main_interface: auto
  fwmark: "0x0c01"
  table_id: 1201
  nft_prefix: korserver
  split:
    tunnel_dns: true
    dnsmasq_listen: 10.10.10.1
    routes:
      - 192.168.25.0/24
      - 10.20.0.0/16
      - 10.11.11.1
    domains:
      - corp.example.com
```

There's no separate "ips" list - a single host is just a route with a /32 mask
(`10.11.11.1` is equivalent to `10.11.11.1/32`), `routes` accepts both.

Route commands:

```bash
docker compose exec korserver korctl routes list
docker compose exec korserver korctl routes add 192.168.25.0/24
docker compose exec korserver korctl routes delete 192.168.25.0/24
docker compose exec korserver korctl routes reload --dry-run
```

Domain commands:

```bash
docker compose exec korserver korctl domains list
docker compose exec korserver korctl domains add corp.example.com
docker compose exec korserver korctl domains delete corp.example.com
docker compose exec korserver korctl domains reload --dry-run
```

`routes add/delete` and `domains add/delete` work on runtime files:

- `data/routes.txt`;
- `data/domains.txt`.

Check risky network changes with dry-run first:

```bash
docker compose exec korserver korctl nft apply --dry-run
docker compose exec korserver korctl nft cleanup --dry-run
```

Apply firewall/NAT rules:

```bash
docker compose exec korserver korctl nft apply
```

This command renders the project-owned nftables state from the current config and
applies it via `nft -f /var/lib/korserver/generated/nftables.nft`. It never does a
global `flush ruleset` and never manages anyone else's firewall rules. In the GUI the
same operation is called `Apply firewall/NAT`.

Show the nftables state:

```bash
docker compose exec korserver korctl nft show
```

Clean up the project-owned nftables state:

```bash
docker compose exec korserver korctl nft cleanup
```

The project only generates project-owned tables with the prefix from
`routing.nft_prefix` and never does a global `flush ruleset`. If `nft apply` inside the
container fails with `returncode: -11`/`signal 11` while the same command works on the
host, that's usually a mismatch between the image's `nft` userspace package and the
host's kernel/netfilter stack. Check the exact same command inside the container:

```bash
docker compose exec korserver nft -f /var/lib/korserver/generated/nftables.nft
docker compose exec korserver nft --version
uname -r
```

In that case the fix isn't a Korvus Server config change but updating/replacing the
nftables userspace in the image, or picking a base image compatible with the host's
kernel.

## Middle-Server Mode

Middle-server mode is for when clients connect to this VPN server, and access to a
private network goes through an outbound OpenConnect tunnel from the container.

Basic example:

```yaml
server:
  enabled: true
  listen: 0.0.0.0
  port: 443
  udp_enabled: true
  device: vpns
  cn: vpn.example.com
  ipv4_network: 10.10.10.0/24
  dns:
    - 10.10.10.1
    - 1.1.1.1

auth:
  password:
    enabled: true
  certificate:
    enabled: true
  otp:
    enabled: true
    ocserv_oath_auth: false

upstream:
  enabled: true
  interface: oc-middle0
  active_profile: private-main
  check_interval: 5
  check_threshold: 3
  check_settle_seconds: 15
  failover: true
  profiles:
    - name: private-main
      server: private.example.com
      port: "443"
      auth_type: password
      username: middle-user
      password: "${SECRET:PRIVATE_MAIN_PASSWORD}"
      check_host: 10.11.11.1
      # Optional: if the upstream server also uses ocserv's camouflage
      # feature, the client appends it as a "?secret" query, not part of
      # `port` itself.
      # camouflage_secret: "${SECRET:PRIVATE_MAIN_CAMOUFLAGE_SECRET}"

routing:
  mode: split
  main_interface: auto
  fwmark: "0x0c01"
  table_id: 1201
  nft_prefix: korserver
  split:
    tunnel_dns: true
    dnsmasq_listen: 10.10.10.1
    routes:
      - 192.168.25.0/24
      - 10.20.0.0/16
    domains:
      - corp.example.com
```

Put the secret in `.env`:

```env
PRIVATE_MAIN_PASSWORD=change-me
```

Check the profiles:

```bash
docker compose exec korserver korctl upstream list
docker compose exec korserver korctl upstream status
```

Switch the active profile:

```bash
docker compose exec korserver korctl upstream switch private-main
```

Connect/disconnect the active upstream (openconnect daemonizes after a successful
connect, the command returns immediately without waiting for the tunnel to drop):

```bash
docker compose exec korserver korctl upstream connect --dry-run
docker compose exec korserver korctl upstream connect
docker compose exec korserver korctl upstream disconnect
```

`routing.mode: split` (as in the example above) really forces the listed routes/domains
through the upstream interface via a dedicated policy-routing table
(`routing.fwmark`/`routing.table_id`) and turns on the kill-switch: if upstream is
unreachable, that traffic won't go out directly from the host, it will be blocked by a
firewall rule instead of leaking past the tunnel. `mode: full` does the same thing but
for all client traffic; `mode: direct` disables this logic entirely. Several profiles
can be connected **at the same time**: each has its own tunnel interface
(`profiles[].interface`; without one, the first profile inherits `upstream.interface`,
the next ones get `oc-up<N>`) and its own pid file. Exactly one is always active - the
redirection rules (nftables oifname + policy route) point at its tunnel. Switching the
active profile (`korctl upstream switch` / the Switch button in the panel) only
repoints these rules, the connection itself isn't touched:

```bash
docker compose exec korserver korctl upstream connect backup   # dial a standby tunnel
docker compose exec korserver korctl upstream switch backup    # instant switch-over
```

`upstream.check_interval`/`check_threshold`/`failover` drive a separate supervisor
process, `korctl upstream watch`: it pings the active profile's `check_host` and, after
`check_threshold` failures, first reconnects to the same profile, then - if `failover:
true` and there's more than one profile - tries the next ones in turn; an already
connected standby profile is picked up by simply switching the redirection rules,
without dialing. `upstream.check_settle_seconds` is a grace window after a successful
reconnect during which health-check failures aren't counted yet, so a tunnel that just
came back up (routing/DPD still settling) can't immediately trigger another reconnect
before it had a chance to prove itself.

Middle-server routing, reconnect/failover and end-to-end access to the private network
still depend on the real network, the upstream server, and nftables/policy-routing on
the host/in the container (`NET_ADMIN` is required). Verify this on a test setup before
enabling it in production.

## Web API and GUI

Web is disabled by default:

```yaml
web:
  enabled: false
```

Web stays off by default. This is intentional: the CLI stays the primary interface, and
Web shouldn't accidentally become reachable without a deliberate, explicit config
change.

For a local Web API/GUI check, use the override:

```bash
docker compose -f compose.yaml -f compose.web.yaml up --build -d
curl -kfsS https://127.0.0.1:8443/healthz
```

`compose.web.yaml` enables Web and makes Uvicorn listen on `127.0.0.1` inside the
container over HTTPS. Since the base `compose.yaml` runs with `network_mode: host`,
that's the real host loopback directly - no Docker port publishing is needed or used,
and nothing about Web is reachable from outside the host. The `korserver`
auto-certificate is used by default; the browser will warn about a private CA until
that CA is trusted or a public certificate is configured.

If you enable `web.enabled: true`, supervisor starts the Uvicorn API and serves the
static frontend from `/usr/share/korserver/frontend`, if a frontend build is present in
the image.

Health endpoint from inside the container:

```bash
docker compose exec korserver curl -kfsS https://127.0.0.1:8443/healthz
```

The GUI only sends the password to the login endpoint and gets back a short-lived
`HttpOnly`/`SameSite=Strict` cookie session. Mutating requests are additionally
protected by a CSRF token. HTTP Basic remains available for external API clients and
diagnostics. Configure:

```yaml
web:
  enabled: true
  listen: 0.0.0.0
  port: 8443
  tls: true
  admin_user: admin
  admin_password_hash: "${SECRET:KORSERVER_ADMIN_PASSWORD_HASH}"
  session_lifetime: 3600
  session_cookie_secure: true
  terminal_enabled: false
```

`.env`:

```env
KORSERVER_ADMIN_PASSWORD_HASH=change-me
```

Generate a scrypt hash without passing a password through command-line arguments:

```bash
docker compose run --rm --entrypoint korctl korserver web hash-password
```

The `admin_password` field is kept for bootstrap and compatibility, but
`admin_password_hash` is preferred for production.

For a TLS-terminating reverse proxy, disable the built-in TLS and explicitly allow
internal HTTP:

```yaml
web:
  enabled: true
  listen: 127.0.0.1
  port: 8443
  tls: false
  allow_insecure_http: true
  trusted_proxies:
    - 127.0.0.1
```

The proxy should connect to this loopback/private endpoint and only publish HTTPS.
Don't expose the HTTP Web API directly.

Since `compose.yaml` runs with `network_mode: host`, `korserver` has no bridge-network
IP of its own for a separate proxy container to reach by a Docker network CIDR - the
proxy needs to reach it via the host's own `127.0.0.1`, which means running the proxy
with `network_mode: host` too (or natively on the host, outside Docker entirely).
Uvicorn will then only accept `X-Forwarded-For` and `X-Forwarded-Proto` from the trusted
proxy source. Don't widen `trusted_proxies` beyond what you actually need.

Keep `session_cookie_secure` enabled behind an HTTPS reverse proxy too. Only disable it
for isolated local HTTP development.

Compose override for this setup:

```bash
docker compose -f compose.yaml -f compose.proxy.yaml up -d
```

In the Docker override, the API listens on `127.0.0.1` inside the container - the real
host loopback, since networking is shared - which is also the address a host-networked
reverse proxy will present as its own source, matching the default
`trusted_proxies: [127.0.0.1]` above.

The interactive root terminal is disabled by default. To enable it in a controlled way:

```yaml
web:
  terminal_enabled: true
  terminal_idle_timeout: 900
  terminal_max_sessions: 2
```

Opening and closing terminal sessions, as well as mutating API requests, are logged to
`/var/log/korserver/audit.jsonl`. Request bodies, passwords and tokens never end up
there.

The `korpanel` GUI opens at `https://127.0.0.1:8443/` once Web is enabled. The static
shell can load without credentials, but no data or actions are available without
logging in. It's a full management interface over the same backend services as the
CLI:

- Dashboard: start/stop/reload/restart `ocserv`, supervisor runtime processes,
  DNS/firewall/log/config status, writing the generated config, apply firewall/NAT;
- Users: create/delete, enable/disable, change password, OTP enable/disable, OTP QR,
  issue/revoke certificate, PKCS#12 export/download, passphrase and Apple-compatible
  mode;
- Sessions: list of active sessions via `occtl` and kicking a user;
- Upstream (includes the former separate Routing tab): status, list/create/edit/delete
  profiles, switch active profile, connect/disconnect, check host + auto-reconnect/
  failover settings; server-side routing mode (direct/full/split) with kill-switch,
  routes/domains/split IPs add/delete, reload, nft show/apply/cleanup;
- Config: edit the persistent `/etc/korserver/config.yaml`, validate YAML, save with an
  atomic write, rendered files, diff and write rendered files;
- Diagnostics: runtime probes split into ok/warning/error;
- Logs: tail files from the configured log directory, including nested logs like
  `certbot/letsencrypt.log`, with manual loading and a live mode in the GUI;
- Terminal: an interactive runtime `/bin/bash` PTY session over a WebSocket ticket,
  running inside the already-started container and rendered via xterm.js with support
  for ANSI, cursor control, resize and full-screen TUI programs.

The top of the GUI has a global `Dry-run` toggle for risky runtime commands and a
light/dark theme switch. The color scheme is close to the Nord palette.

Frontend checks:

```bash
make frontend-test
make frontend-e2e
make frontend-build
make frontend-audit
```

Vitest checks the cookie/CSRF API flow. The xterm.js code loads as a separate lazy
chunk only when the enabled Terminal tab is opened.

A Playwright smoke test walks every section of the panel and checks the conditional
rendering of the terminal with a mocked API. In environments without a bundled
Chromium, you can set:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium make frontend-e2e
```

## Connecting a Client

After the server has started and a user has been created, you can connect with an
OpenConnect client:

```bash
openconnect --protocol=anyconnect vpn.example.com
```

If using a non-standard port:

```bash
openconnect --protocol=anyconnect vpn.example.com:4443
```

To test from the host running Docker with `443` published, you can use the host's
address or a DNS name pointing at the host.

If using the auto CA, the client may need to trust `data/certs/ca.crt` or explicitly
accept the self-signed chain in a test environment.

## Diagnostics and Logs

Diagnostics without running any risky actions:

```bash
docker compose exec korserver korctl diagnose --dry-run
```

Runtime diagnostics:

```bash
docker compose exec korserver korctl diagnose
```

Docker logs:

```bash
docker compose logs -f korserver
```

Logs via the CLI:

```bash
docker compose exec korserver korctl logs api.log --lines 100
docker compose exec korserver korctl logs supervisord.log --lines 100
docker compose exec korserver korctl logs certbot/letsencrypt.log --lines 100
```

Check the generated files:

```bash
docker compose exec korserver ls -la /var/lib/korserver/generated
docker compose exec korserver sed -n '1,160p' /var/lib/korserver/generated/ocserv.conf
```

Check processes:

```bash
docker compose exec korserver korctl server process list
docker compose exec korserver pgrep -a ocserv
```

## Security Notes

- Don't commit `.env`, `data/`, `logs/`, private keys, PKCS#12 or generated secrets.
- Don't pass passwords via shell arguments in production if that ends up in history.
- CLI prompts for passwords hide the input.
- Render/diff/API output masks secrets, but secret files on the volume remain your own
  responsibility.
- `data/certs/ca.key` is the one key secret behind the whole auto-CA. Keep a separate,
  protected backup of it.
- `nft apply` and `nft cleanup` affect the container's network rules. Use `--dry-run`
  first.
- The GUI Terminal opens an interactive shell session inside the container via a
  one-time WebSocket ticket issued by the admin API. Don't expose the Web API without
  TLS, a strong password and network access restrictions.
- The project never deletes user files without an explicit command.

## Troubleshooting

Container unhealthy:

```bash
docker compose ps
docker compose logs --tail=200 korserver
docker compose exec korserver korctl server status
```

No `/dev/net/tun`:

```bash
test -c /dev/net/tun
sudo modprobe tun
```

Port 443 in use:

```bash
ss -lntup | grep ':443'
```

Change the port mapping and `server.port`, e.g.:

```yaml
server:
  port: 4443
```

`compose.yaml`:

```yaml
ports:
  - "4443:4443/tcp"
  - "4443:4443/udp"
```

Errors in YAML/env:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config validate
```

See what config would actually be generated:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config render --dry-run
```

Check whether the `occtl` control socket was created:

```bash
docker compose exec korserver sh -lc 'ls -l /var/lib/korserver/generated/occtl.sock && occtl -s /var/lib/korserver/generated/occtl.sock show status'
```

Check the internal ocserv worker IPC socket:

```bash
docker compose exec korserver sh -lc 'find /var/lib/korserver/generated -maxdepth 1 -type s -name "ocserv.sock*" -print'
```

Check the certificates:

```bash
docker compose exec korserver ls -la /var/lib/korserver/certs
```

## Verified Runtime Smoke Test

For the current version, a Docker smoke test was performed with `/dev/net/tun`,
`NET_ADMIN` and `NET_RAW`:

- the final `korserver:latest` image builds;
- the container becomes healthy;
- `supervisorctl` shows `ocserv RUNNING`;
- `korctl server status` works inside the runtime image;
- the auto CA/server certificates are created;
- `occtl.sock` and `ocserv.sock.*` are created in the generated directory;
- `ocserv` listens on `443/tcp` and `443/udp`.

Deployment-specific checks remain:

- connecting a real OpenConnect client;
- the upstream OpenConnect tunnel in middle-server mode;
- nftables apply/cleanup in your network environment;
- fwmark policy routing and split DNS for your domains/networks;
- end-to-end client access to the private network.

## Useful Commands

```bash
# Build and test
make docker-test
make docker-build

# Start
mkdir -p config data logs
cp config.example.yaml config/config.yaml
cp .env.example .env
docker compose up -d

# Status
docker compose ps
docker compose logs -f korserver
docker compose exec korserver korctl server status

# Optional local Web check
docker compose -f compose.yaml -f compose.web.yaml up --build -d
curl -kfsS https://127.0.0.1:8443/healthz

# Config
docker compose exec korserver korctl config validate
docker compose exec korserver korctl config render --dry-run
docker compose exec korserver korctl config diff

# Users
docker compose exec korserver korctl user create alice
docker compose exec korserver korctl user list
docker compose exec korserver korctl user passwd alice

# Certs and OTP
docker compose exec korserver korctl user cert create alice
docker compose exec korserver korctl user p12 create alice
docker compose exec korserver korctl user otp enable alice
docker compose exec korserver korctl user otp show-qr alice

# Network
docker compose exec korserver korctl nft apply --dry-run
docker compose exec korserver korctl diagnose --dry-run

# Stop
docker compose down
```

## License

Korvus Server is licensed under the [GNU General Public License v3.0](LICENSE) or
later.

## Author

Ivan Cherniy - [r4ven.me](https://r4ven.me) - [github.com/r4ven-me/korserver](https://github.com/r4ven-me/korserver)
