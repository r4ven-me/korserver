# Configuration model

Main config path:

```text
/etc/korserver/config.yaml
```

Default data paths:

```text
/etc/korserver/config.yaml
/var/lib/korserver/
/var/lib/korserver/secrets/
/var/lib/korserver/certs/
/var/lib/korserver/generated/
/var/log/korserver/
```

## Precedence

1. CLI flags.
2. Environment variables.
3. `.env` file.
4. YAML config.
5. Application defaults.

## Environment variable mapping

Use prefix:

```text
KORSERVER_
```

Nested keys are joined with `__`:

```text
server.port -> KORSERVER_SERVER__PORT
web.enabled -> KORSERVER_WEB__ENABLED
routing.split.tunnel_dns -> KORSERVER_ROUTING__SPLIT__TUNNEL_DNS
```

Lists can be overridden as JSON:

```text
KORSERVER_SERVER__DNS='["8.8.8.8", "1.1.1.1"]'
```

`.env` files support plain `KEY=value`, optional `export KEY=value`, single or double quoted
values, and inline comments after unquoted values:

```dotenv
export KORSERVER_SERVER__REALM="Corp # VPN"
KORSERVER_SERVER__CN=vpn.example.com # comment
```

Secret references:

```yaml
password: "${SECRET:ADMIN_PASSWORD}"
```

The loader must resolve this from environment variables without logging the value.

## Validation

Validate:

- required paths;
- port ranges;
- CIDR validity;
- route overlap;
- VPN subnet not equal to upstream private subnet;
- domain syntax;
- files readable/writable depending on operation;
- mode compatibility.

## Config rendering

Generated files must be written into a generated directory, e.g.:

```text
/var/lib/korserver/generated/ocserv.conf
/var/lib/korserver/generated/dnsmasq.conf
/var/lib/korserver/generated/nftables.nft
/var/lib/korserver/generated/supervisor.conf
```

Write atomically:

1. render to temp file;
2. fsync if practical;
3. validate syntax where possible;
4. rename into place.
