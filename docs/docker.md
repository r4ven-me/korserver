# Docker runtime notes

## Image contents

The runtime image includes:

- Debian trixie slim base image;
- Python runtime;
- backend package;
- CLI executable `korctl`;
- optional frontend static build;
- ocserv;
- openconnect client;
- occtl;
- ocpasswd;
- certtool;
- oath-toolkit/oathtool;
- qrencode;
- dnsmasq;
- nftables;
- iproute2;
- ca-certificates;
- curl or wget for healthchecks.

## ocserv and nftables compatibility

`ocserv`, `openconnect`, `nftables`, `iproute2` and helper utilities run inside the
container, but network operations are executed against the host kernel namespace when
`network_mode: host` is used. If `nft -f /var/lib/korserver/generated/nftables.nft`
segfaults inside the container with signal 11 while the same rules work on the host,
the likely cause is a userspace/kernel netfilter compatibility issue. Verify the exact
command inside the container before debugging Korvus Server rendering. Korvus Server uses
Debian trixie for the runtime image so the bundled `nft` userspace is newer than the
old bookworm package set.

## Volumes

Suggested volumes:

```yaml
volumes:
  - ./config:/etc/korserver
  - ./data:/var/lib/korserver
  - ./logs:/var/log/korserver
```

## Compose service

The compose file grants the minimum runtime capabilities needed for ocserv and nftables:

```yaml
cap_add:
  - NET_ADMIN
  - NET_RAW
devices:
  - /dev/net/tun:/dev/net/tun
ports:
  - "443:443/tcp"
  - "443:443/udp"
env_file:
  - .env
volumes:
  - ./config:/etc/korserver
  - ./data:/var/lib/korserver
  - ./logs:/var/log/korserver
restart: unless-stopped
```

## Entrypoint

The Python entrypoint:

1. load config;
2. validate config;
3. render generated configs;
4. initialize missing CA/server cert only if configured;
5. attempt startup Let's Encrypt issuance when enabled;
6. apply project-owned nftables state;
7. render supervisor config and start managed processes;
8. start API/GUI only if enabled;
9. keep logs visible through Docker logs.

Avoid a large Bash entrypoint. Prefer Python orchestration or a real supervisor.

Startup Let's Encrypt failures are logged to `/var/log/korserver/startup.log` and
`/var/log/korserver/certbot/letsencrypt.log`; they should not make the container crash-loop.
