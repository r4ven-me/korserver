# Korvus Server

Korvus Server (`korserver`) - Python-first платформа управления OpenConnect/ocserv VPN в Docker.
Проект рассчитан на два режима:

- обычный OpenConnect VPN server на базе `ocserv`;
- middle-server режим, где контейнер дополнительно поднимает исходящее подключение
  `openconnect` к закрытому контуру и маршрутизирует выбранный трафик клиентов.

CLI является основным интерфейсом и работает всегда. Web API/GUI опциональны и по
умолчанию выключены.

## Возможности

- typed Python backend: FastAPI, Typer, Pydantic v2, Jinja2;
- YAML-first конфигурация;
- переопределения через `.env` и переменные окружения;
- приоритет настроек: CLI overrides -> environment -> `.env` -> YAML -> defaults;
- генерация `ocserv.conf`, `dnsmasq.conf`, `nftables.nft`, `supervisor.conf`;
- idempotent runtime initialization: недостающие конфиги и auto-сертификаты создаются
  при старте контейнера;
- atomic writes для generated files и secret/runtime файлов;
- централизованная маскировка секретов в CLI/API/log-related выводах;
- управление пользователями, паролями, сертификатами, PKCS#12, OTP;
- команды для sessions, upstream profiles, split routes/domains, nftables и диагностики;
- multi-stage Dockerfile с frontend/backend test stages;
- compose-файл с `/dev/net/tun`, `NET_ADMIN`, `NET_RAW` и persistent volumes.

## Korvus Client

В директории [`korclient/`](korclient/README.md) находится сопутствующий проект клиента:
OpenConnect-клиент в Docker с двумя режимами — full tunnel и split routing. Списки
маршрутов (`route =`) и доменов (`split-dns =`) задаются централизованно в веб-панели
korserver (per-user / per-group конфиги ocserv) и доставляются клиенту стандартным
AnyConnect-хендшейком при подключении; отдельный сервис синхронизации не требуется.
Сборка и публикация: `make client-docker-build`, `make client-docker-release`.

## Требования

Для Docker-запуска нужен Linux-хост с:

- Docker Engine и Docker Compose plugin;
- доступным `/dev/net/tun`;
- правом запускать контейнеры с `NET_ADMIN` и `NET_RAW`;
- свободными портами `443/tcp` и `443/udp`, если используется стандартный VPN-порт.

Проверка TUN на хосте:

```bash
test -c /dev/net/tun && echo "tun ok"
```

Rootless Docker обычно не подходит для полноценной VPN-сетевой части.

## Быстрый Старт

Соберите образ, подготовьте конфиги и запустите контейнер:

```bash
make docker-build
mkdir -p config data logs
cp config.example.yaml config/config.yaml
cp .env.example .env
docker compose up -d
```

Проверьте состояние:

```bash
docker compose ps
docker compose logs -f korserver
docker compose exec korserver korctl server status
```

Ожидаемые признаки успешного старта:

- контейнер в состоянии `healthy` или `running`;
- в логах есть `ocserv entered RUNNING state`;
- `korctl server status` показывает `ocserv RUNNING`;
- `ocserv` слушает `0.0.0.0:443` по TCP и UDP.

Проверка слушающих портов внутри контейнера:

```bash
docker compose exec korserver sh -lc 'ss -lntup | grep 443'
```

Default `compose.yaml` публикует только VPN-порты. Web API/GUI отключены и порт `8443`
не публикуется, поэтому `curl 127.0.0.1:8443` в обычном режиме не является проверкой
VPN-сервера. Для проверки Web используйте отдельный override из раздела "Web API И GUI".

Остановка:

```bash
docker compose down
```

Полное удаление runtime данных вручную не выполняется проектом автоматически. Если нужно
начать с нуля, удаляйте локальные volume-директории явно:

```bash
docker compose down
rm -rf data logs
```

## Структура Директорий

Основные файлы:

- `backend/korserver/` - Python package, CLI, API, config models, services, renderers;
- `frontend/` - Vite/React/TypeScript GUI source;
- `templates/` - Jinja2 templates для generated system configs;
- `tests/` - pytest coverage;
- `docs/` - дополнительные заметки по архитектуре, безопасности, сети и Docker;
- `examples/` - минимальная, полная и middle-server конфигурации;
- `Dockerfile` - frontend/backend test stages и runtime image;
- `compose.yaml` - production-like запуск контейнера;
- `config.example.yaml` - основной пример YAML-конфига;
- `.env.example` - пример env overrides и secret values;
- `Makefile` - локальные и Docker-команды проверки.

Runtime volumes при `docker compose up`:

- `./config:/etc/korserver` - пользовательская конфигурация;
- `./data:/var/lib/korserver` - generated configs, secrets, certs, route/domain files;
- `./logs:/var/log/korserver` - runtime logs.

Важные runtime пути внутри контейнера:

- `/etc/korserver/config.yaml` - основной YAML config;
- `/var/lib/korserver/generated/ocserv.conf` - rendered ocserv config;
- `/var/lib/korserver/generated/supervisor.conf` - rendered supervisor config;
- `/var/lib/korserver/secrets/ocpasswd` - password auth database;
- `/var/lib/korserver/secrets/users.oath` - OTP users file;
- `/var/lib/korserver/certs/` - CA/server/user certificates;
- `/var/log/korserver/` - application/supervisor logs.

## Сборка И Проверки

CI-friendly проверки:

```bash
make docker-test
make docker-build
make docker-cli-check
```

`make docker-test` собирает два test stage:

- `frontend-test`: `npm ci`, `npm audit --audit-level=moderate`, production build;
- `backend-test`: install `.[dev]`, `ruff`, `mypy`, `pytest`, dry-run render.

Локальная разработка backend:

```bash
python -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
make check
make render
```

Локальная сборка frontend:

```bash
make frontend-build
make frontend-audit
```

## Конфигурация

Основной файл - YAML:

```bash
cp config.example.yaml config/config.yaml
```

Минимальный рабочий VPN config:

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

Проверка YAML без записи файлов:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config validate
```

Просмотр rendered конфигов без записи:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config render --dry-run
```

Запись rendered конфигов:

```bash
docker compose exec korserver korctl config render
```

Diff между текущими generated файлами и новым render:

```bash
docker compose exec korserver korctl config diff
```

## Env Overrides И Secrets

Любое поле YAML можно переопределить переменной окружения с префиксом `KORSERVER_`.
Это совместимый runtime namespace, оставленный от ранней версии проекта: публичная
утилита называется `korctl`, а продукт - Korvus Server.
Вложенность задается через двойное подчеркивание:

```env
KORSERVER_SERVER__PORT=4443
KORSERVER_SERVER__DNS='["1.1.1.1", "9.9.9.9"]'
KORSERVER_WEB__ENABLED=false
```

Списки передаются JSON-строкой.

Переменные `KORSERVER_*` без `__` не считаются config overrides. Их можно использовать как
обычные secret values, например `KORSERVER_ADMIN_PASSWORD` для `${SECRET:KORSERVER_ADMIN_PASSWORD}`.

`.env` поддерживает обычный `KEY=value`, необязательный префикс `export`, quoted values и
inline-комментарии после unquoted values:

```env
export KORSERVER_SERVER__REALM="Corp # VPN"
KORSERVER_SERVER__CN=vpn.example.com # comment
```

Секреты можно хранить в `.env` и ссылаться на них из YAML через `${SECRET:NAME}`:

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

Секреты не должны попадать в README, issue, shell history и логи. CLI/API маскируют
известные secret values и строки вида `password=...`, `token=...`, `secret=...`.

## Управление Korvus Server

Статус:

```bash
docker compose exec korserver korctl server status
```

Reload `ocserv` через `korctl`:

```bash
docker compose exec korserver korctl server reload
```

Dry-run reload:

```bash
docker compose exec korserver korctl server reload --dry-run
```

`reload` отправляет `SIGHUP` в `ocserv`. Этого достаточно для части изменений, но не все
параметры ocserv применяются через HUP. Если после render/reload поведение не изменилось,
выполните полный restart только процесса `ocserv` без перезапуска контейнера:

```bash
docker compose exec korserver korctl server restart
docker compose exec korserver korctl server restart --dry-run
```

Остановить managed processes внутри контейнера:

```bash
docker compose exec korserver korctl server stop
```

Управление отдельными runtime-процессами supervisor через основную утилиту:

```bash
docker compose exec korserver korctl server process list
docker compose exec korserver korctl server process restart dnsmasq
docker compose exec korserver korctl server process status certbot-renew
```

Обычно для эксплуатации лучше управлять контейнером через Compose:

```bash
docker compose restart korserver
docker compose logs -f korserver
```

## Пользователи И Пароли

Создать пользователя password-auth:

```bash
docker compose exec korserver korctl user create alice
```

CLI спросит пароль интерактивно и не выведет его в терминал.

Список пользователей:

```bash
docker compose exec korserver korctl user list
```

Сменить пароль:

```bash
docker compose exec korserver korctl user passwd alice
```

Отключить/включить пользователя:

```bash
docker compose exec korserver korctl user disable alice
docker compose exec korserver korctl user enable alice
```

Удалить пользователя:

```bash
docker compose exec korserver korctl user delete alice
```

Без интерактивного подтверждения:

```bash
docker compose exec korserver korctl user delete alice --yes
```

После изменения пользователей обычно достаточно reload:

```bash
docker compose exec korserver korctl server reload
```

## Сертификаты И PKCS#12

В режиме:

```yaml
certificates:
  mode: auto
```

контейнер при первом старте создает CA и server certificate, если их еще нет.

Для серверного TLS-сертификата доступны три практических сценария:

- `auto`: локальный CA и server certificate создаются внутри persistent volume;
- ручная загрузка через GUI: файлы сохраняются в `data/certs/external/`, конфиг переключается на `certificates.mode: external`;
- Let's Encrypt через GUI или CLI: используется `certbot certonly --standalone`, активные пути переключаются на persistent `data/certbot/config/live/<domain>/`.

Для Let's Encrypt HTTP-01 порт `80/tcp` должен быть доступен извне и указывать на контейнер.
Если `certificates.letsencrypt.enabled: true`, Korvus Server пытается получить сертификат
при старте до запуска `ocserv`, чтобы первый VPN/Web TLS startup уже мог использовать
валидную цепочку. Ошибка certbot при старте логируется и не должна уронить контейнер:
смотрите `/var/log/korserver/startup.log` и `/var/log/korserver/certbot/letsencrypt.log`.
После ручной загрузки, выпуска или renew панель рендерит актуальный `ocserv.conf` и может
сразу выполнить reload или restart `ocserv`.

Пути:

- CA: `data/certs/ca.crt`, `data/certs/ca.key`;
- server cert/key: `data/certs/server.crt`, `data/certs/server.key`;
- external server cert/key/chain: `data/certs/external/server.crt`, `server.key`, `ca.crt`;
- user certs: `data/certs/users/<username>.crt`, `.key`, `.p12`.

Включение certificate auth:

```yaml
auth:
  password:
    enabled: true
  certificate:
    enabled: true
```

Создать клиентский сертификат:

```bash
docker compose exec korserver korctl user cert create alice
```

Создать PKCS#12 bundle:

```bash
docker compose exec korserver korctl user p12 create alice
```

Команда поддерживает passphrase через `--passphrase VALUE`. Не передавайте реальный
passphrase через shell history на production-хосте; для теста можно использовать временное
значение, а в эксплуатации лучше подключить безопасный ввод/secret wrapper.

```bash
docker compose exec korserver korctl user p12 create alice --passphrase "$KORSERVER_P12_PASSPHRASE"
```

Apple-compatible PKCS#12:

```bash
docker compose exec korserver korctl user p12 create alice --apple-compatible
```

Отозвать сертификат и сгенерировать CRL:

```bash
docker compose exec korserver korctl user cert revoke alice
```

## OTP

Включите OTP в YAML:

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

`enabled` включает управление OTP-секретами в CLI/API/GUI. `ocserv_oath_auth` добавляет
`auth = "oath[...]"` в `ocserv.conf`; включайте его только если ваша сборка `ocserv`
поддерживает OATH backend, иначе сервер не сможет стартовать.

Включить OTP для пользователя:

```bash
docker compose exec korserver korctl user otp enable alice
```

Показать QR в терминале:

```bash
docker compose exec korserver korctl user otp show-qr alice
```

Отключить OTP:

```bash
docker compose exec korserver korctl user otp disable alice
```

OTP secrets хранятся в `data/secrets/users.oath`.

## OIDC / Identity

ocserv не умеет нативный browser redirect OIDC flow для VPN-клиентов. Korvus Server
добавляет identity-модель для Keycloak/authentik-подобных IdP, генерирует ocserv
`config-per-group` и подключает реальную VPN-аутентификацию через PAM или RADIUS bridge.
Используйте PAM/RADIUS integration или outpost/proxy, который возвращает совместимые
с ocserv users/groups.

Пример YAML:

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

GUI: вкладка `Identity` управляет connector settings, OIDC providers и group policies.
API/GUI не возвращают `client_secret`; храните его через `${SECRET:OIDC_CLIENT_SECRET}`.

## Sessions

Список активных сессий через `occtl`:

```bash
docker compose exec korserver korctl sessions list
```

Отключить пользователя:

```bash
docker compose exec korserver korctl sessions kick alice
```

Dry-run:

```bash
docker compose exec korserver korctl sessions kick alice --dry-run
```

## Routing, Firewall/NAT, Split Routes И Domains

Этот раздел управляет тем, как **сам сервер** отправляет трафик VPN-клиентов дальше —
не тем, что ocserv пушит клиентам (это отдельные `server.routes`/`no_routes`). Сервер
может выходить в сеть просто через хост, а может — через upstream-туннель (см.
"Middle-Server Режим" ниже); режимы решают, что именно из этого происходит. В вебе
эти настройки живут во вкладке "Upstream" (не отдельной вкладкой), потому что имеют
смысл только вместе.

Режимы:

- `direct` - Korvus Server не управляет NAT/forwarding правилами вообще;
- `full` - весь трафик VPN-клиентов помечается и форсируется через upstream-интерфейс
  отдельной policy-routing таблицей; если upstream включён, но недоступен — трафик
  блокируется firewall-правилом (kill-switch), а не утекает напрямую с хоста;
- `split` - тем же способом форсируются только перечисленные ниже routes/domains;
  остальной трафик NAT'ится через хост как обычно.

Без активного upstream (`upstream.enabled: false`) `full`/`split` просто NAT'ят
VPN-подсеть через `main_interface` (или через любой интерфейс, если `main_interface:
auto`) — no kill-switch, обычный masquerade.

Пример split config:

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

Отдельного списка "ips" нет — одиночный хост это просто маршрут с маской /32
(`10.11.11.1` эквивалентно `10.11.11.1/32`), `routes` принимает и то, и другое.

Команды routes:

```bash
docker compose exec korserver korctl routes list
docker compose exec korserver korctl routes add 192.168.25.0/24
docker compose exec korserver korctl routes delete 192.168.25.0/24
docker compose exec korserver korctl routes reload --dry-run
```

Команды domains:

```bash
docker compose exec korserver korctl domains list
docker compose exec korserver korctl domains add corp.example.com
docker compose exec korserver korctl domains delete corp.example.com
docker compose exec korserver korctl domains reload --dry-run
```

`routes add/delete` и `domains add/delete` работают с runtime files:

- `data/routes.txt`;
- `data/domains.txt`.

Опасные сетевые изменения проверяйте через dry-run:

```bash
docker compose exec korserver korctl nft apply --dry-run
docker compose exec korserver korctl nft cleanup --dry-run
```

Применить firewall/NAT rules:

```bash
docker compose exec korserver korctl nft apply
```

Эта команда рендерит project-owned nftables state из текущего конфига и применяет его
через `nft -f /var/lib/korserver/generated/nftables.nft`. Она не делает глобальный
`flush ruleset` и не управляет чужими firewall-правилами. В GUI та же операция называется
`Apply firewall/NAT`.

Показать nftables state:

```bash
docker compose exec korserver korctl nft show
```

Очистить project-owned nftables state:

```bash
docker compose exec korserver korctl nft cleanup
```

Проект генерирует только project-owned tables с prefix из `routing.nft_prefix` и не делает
глобальный `flush ruleset`. Если `nft apply` внутри контейнера завершается `returncode: -11`
или `signal 11`, а та же команда работает на хосте, это обычно несовместимость userspace
пакета `nft` в образе с kernel/netfilter stack хоста. Проверьте ровно ту же команду внутри
контейнера:

```bash
docker compose exec korserver nft -f /var/lib/korserver/generated/nftables.nft
docker compose exec korserver nft --version
uname -r
```

В таком случае лечится не конфигом Korvus Server, а обновлением/заменой nftables userspace
в образе или подбором базового образа, совместимого с ядром хоста.

## Middle-Server Режим

Middle-server режим нужен, когда клиенты подключаются к этому VPN-серверу, а доступ к
закрытому контуру идет через исходящий OpenConnect tunnel из контейнера.

Базовый пример:

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
  profiles:
    - name: private-main
      server: private.example.com
      port: "443/?secretWord"
      auth_type: password
      username: middle-user
      password: "${SECRET:PRIVATE_MAIN_PASSWORD}"
      check_host: 10.11.11.1

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

Положите secret в `.env`:

```env
PRIVATE_MAIN_PASSWORD=change-me
```

Проверить профили:

```bash
docker compose exec korserver korctl upstream list
docker compose exec korserver korctl upstream status
```

Переключить active profile:

```bash
docker compose exec korserver korctl upstream switch private-main
```

Подключить/отключить active upstream (openconnect демонизируется после успешного
подключения, команда возвращается сразу, не дожидаясь разрыва туннеля):

```bash
docker compose exec korserver korctl upstream connect --dry-run
docker compose exec korserver korctl upstream connect
docker compose exec korserver korctl upstream disconnect
```

`routing.mode: split` (как в примере выше) реально форсирует перечисленные
routes/domains через upstream-интерфейс отдельной policy-routing таблицей
(`routing.fwmark`/`routing.table_id`) и включает kill-switch: если upstream
недоступен, этот трафик не пойдет напрямую с хоста, а будет заблокирован
firewall-правилом, а не утечет мимо туннеля. `mode: full` — то же самое, но
для всего трафика клиентов; `mode: direct` отключает эту логику полностью.
Несколько профилей могут быть подключены **одновременно**: у каждого свой
tunnel-интерфейс (`profiles[].interface`; без него первый профиль наследует
`upstream.interface`, следующие получают `oc-up<N>`) и свой pid-файл. Активен
всегда ровно один — правила перенаправления (nftables oifname + policy route)
указывают на его туннель. Переключение активного профиля (`korctl upstream
switch` / кнопка Switch в панели) только переставляет эти правила, само
соединение не трогается:

```bash
docker compose exec korserver korctl upstream connect backup   # standby-туннель
docker compose exec korserver korctl upstream switch backup    # мгновенный переход
```

`upstream.check_interval`/`check_threshold`/`failover` управляют отдельным
supervisor-процессом `korctl upstream watch`: он пингует `check_host` активного
профиля и после `check_threshold` неудач сначала переподключается к тому же
профилю, а если `failover: true` и профилей несколько — по очереди пробует
следующие; уже подключённый standby-профиль подхватывается простым
переключением правил, без набора соединения.

Middle-server routing, reconnect/failover и end-to-end доступ к закрытому контуру всё
равно зависят от реальной сети, upstream сервера и nftables/policy-routing на
хосте/в контейнере (`NET_ADMIN` обязателен). Перед production включением проверьте
это на стенде.

## Web API И GUI

Web отключен по умолчанию:

```yaml
web:
  enabled: false
```

В default `compose.yaml` порт `8443` не публикуется. Это сделано намеренно: CLI остается
основным интерфейсом, а Web не должен случайно открываться наружу.

Для локальной проверки Web API/GUI используйте override:

```bash
docker compose -f compose.yaml -f compose.web.yaml up --build -d
curl -kfsS https://127.0.0.1:8443/healthz
```

`compose.web.yaml` включает Web, заставляет Uvicorn слушать `0.0.0.0` внутри контейнера
по HTTPS и публикует порт только на loopback хоста: `127.0.0.1:8443`. По умолчанию
используется auto-сертификат `korserver`; браузер предупредит о частном CA, пока этот CA
не добавлен в доверенные или не настроен публичный сертификат.

Если `curl 127.0.0.1:8443` подключается, а затем получает `Recv failure: Connection reset
by peer`, почти наверняка порт опубликован Docker-ом, но API внутри контейнера слушает
`127.0.0.1:8443`. Для доступа с хоста выставьте:

```env
KORSERVER_WEB__ENABLED=true
KORSERVER_WEB__LISTEN=0.0.0.0
KORSERVER_WEB__TLS=true
```

Если включить `web.enabled: true`, supervisor запустит Uvicorn API и отдачу static
frontend из `/usr/share/korserver/frontend`, если frontend build присутствует в образе.

Health endpoint изнутри контейнера:

```bash
docker compose exec korserver curl -kfsS https://127.0.0.1:8443/healthz
```

GUI отправляет пароль только в login endpoint и получает короткоживущую
`HttpOnly`/`SameSite=Strict` cookie-сессию. Изменяющие запросы дополнительно защищены
CSRF-токеном. HTTP Basic остаётся доступен для внешних API-клиентов и диагностики.
Настройте:

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

Создать scrypt-хеш без передачи пароля через аргументы командной строки:

```bash
docker compose run --rm --entrypoint korctl korserver web hash-password
```

Поле `admin_password` оставлено для bootstrap и совместимости, но для production
предпочтительно `admin_password_hash`.

Для TLS-терминирующего reverse proxy отключите встроенный TLS и явно разрешите
внутренний HTTP:

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

Прокси должен подключаться к этому loopback/private endpoint и публиковать только HTTPS.
Не открывайте HTTP Web API наружу.

Если proxy находится в Docker-сети, укажите CIDR этой сети, например
`172.18.0.0/16`. Тогда Uvicorn будет принимать `X-Forwarded-For` и
`X-Forwarded-Proto` только от доверенного proxy. Не используйте широкий диапазон
без необходимости.

`session_cookie_secure` оставляйте включённым и за HTTPS reverse proxy. Отключать его
допустимо только для изолированной локальной HTTP-разработки.

Compose-override для такого режима:

```bash
docker compose -f compose.yaml -f compose.proxy.yaml up -d
```

В Docker override API слушает `0.0.0.0` внутри контейнера, но порт публикуется
только на `127.0.0.1` хоста. Если reverse proxy передаёт `X-Forwarded-*`, задайте
доверенный источник через переменную, например:

```env
KORSERVER_WEB__TRUSTED_PROXIES='["172.18.0.1"]'
```

Интерактивный root-терминал отключён по умолчанию. Для контролируемого включения:

```yaml
web:
  terminal_enabled: true
  terminal_idle_timeout: 900
  terminal_max_sessions: 2
```

Открытие и закрытие терминальных сессий, а также изменяющие API-запросы записываются
в `/var/log/korserver/audit.jsonl`. Тела запросов, пароли и токены туда не попадают.

GUI `korpanel` после включения Web открывается на `https://127.0.0.1:8443/`. Статическая оболочка
может загрузиться без credentials, но данные и любые действия недоступны без логина.
Это полноценный интерфейс управления поверх тех же backend-сервисов, что и CLI:

- Dashboard: start/stop/reload/restart `ocserv`, runtime-процессы supervisor, DNS/firewall/log/config
  status, запись generated config, apply firewall/NAT;
- Users: создание/удаление, enable/disable, смена пароля, OTP enable/disable, OTP QR,
  выпуск/revoke сертификата, PKCS#12 export/download, passphrase и Apple-compatible режим;
- Sessions: список активных сессий через `occtl` и kick пользователя;
- Upstream (включает бывшую отдельную вкладку Routing): статус, список/создание/редактирование/
  удаление profiles, switch active profile, connect/disconnect, check host + auto-reconnect/
  failover settings; server-side routing mode (direct/full/split) с kill-switch, routes/domains/
  split IPs add/delete, reload, nft show/apply/cleanup;
- Config: редактирование persistent `/etc/korserver/config.yaml`, validate YAML,
  сохранение с atomic write, rendered files, diff и запись rendered files;
- Diagnostics: runtime probes с разделением ok/warning/error;
- Logs: tail файлов из configured log directory, включая вложенные логи вроде
  `certbot/letsencrypt.log`, с ручной подгрузкой и live-режимом в GUI.
- Terminal: интерактивная runtime `/bin/bash` PTY-сессия через WebSocket ticket,
  выполняется внутри уже запущенного контейнера и отображается через xterm.js с
  поддержкой ANSI, cursor control, resize и полноэкранных TUI-программ.

В верхней панели GUI есть глобальный `Dry-run` переключатель для опасных runtime-команд
и кнопка переключения светлой/темной темы. Цветовая схема близка к Nord palette.

Frontend-проверки:

```bash
make frontend-test
make frontend-e2e
make frontend-build
make frontend-audit
```

Vitest проверяет cookie/CSRF API flow. Код xterm.js загружается отдельным lazy chunk
только при открытии включённой вкладки Terminal.

Playwright smoke-тест входит в каждый раздел панели и проверяет условное отображение
терминала с mocked API. В окружениях без bundled Chromium можно указать:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium make frontend-e2e
```

## Подключение Клиента

После старта сервера и создания пользователя можно подключиться OpenConnect-клиентом:

```bash
openconnect --protocol=anyconnect vpn.example.com
```

Если порт нестандартный:

```bash
openconnect --protocol=anyconnect vpn.example.com:4443
```

Для проверки с хоста, где запущен Docker и опубликован `443`, можно использовать адрес
хоста или DNS-имя, которое указывает на хост.

Если используется auto CA, клиенту может потребоваться доверить `data/certs/ca.crt` или
явно принять self-signed цепочку в тестовой среде.

## Diagnostics И Logs

Диагностика без выполнения опасных действий:

```bash
docker compose exec korserver korctl diagnose --dry-run
```

Диагностика runtime:

```bash
docker compose exec korserver korctl diagnose
```

Логи Docker:

```bash
docker compose logs -f korserver
```

Логи через CLI:

```bash
docker compose exec korserver korctl logs api.log --lines 100
docker compose exec korserver korctl logs supervisord.log --lines 100
docker compose exec korserver korctl logs certbot/letsencrypt.log --lines 100
```

Проверка generated файлов:

```bash
docker compose exec korserver ls -la /var/lib/korserver/generated
docker compose exec korserver sed -n '1,160p' /var/lib/korserver/generated/ocserv.conf
```

Проверка процессов:

```bash
docker compose exec korserver korctl server process list
docker compose exec korserver pgrep -a ocserv
```

## Security Notes

- Не коммитьте `.env`, `data/`, `logs/`, private keys, PKCS#12 и generated secrets.
- Не передавайте пароли через shell arguments в production, если это попадет в history.
- CLI prompts для паролей скрывают ввод.
- Render/diff/API output маскирует секреты, но секретные файлы на volume остаются вашей
  ответственностью.
- `data/certs/ca.key` - ключевой секрет всей auto-CA. Храните backup отдельно и защищенно.
- `nft apply` и `nft cleanup` влияют на сетевые правила контейнера. Сначала используйте
  `--dry-run`.
- GUI Terminal открывает интерактивную shell-сессию внутри контейнера через одноразовый
  WebSocket ticket, выданный admin API. Не публикуйте Web API наружу без TLS, сильного
  пароля и сетевого ограничения доступа.
- Проект не удаляет пользовательские файлы без явной команды.

## Troubleshooting

Контейнер unhealthy:

```bash
docker compose ps
docker compose logs --tail=200 korserver
docker compose exec korserver korctl server status
```

Нет `/dev/net/tun`:

```bash
test -c /dev/net/tun
sudo modprobe tun
```

Порт 443 занят:

```bash
ss -lntup | grep ':443'
```

Смените port mapping и `server.port`, например:

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

Ошибки в YAML/env:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config validate
```

Посмотреть, какой конфиг реально будет сгенерирован:

```bash
docker compose run --rm --entrypoint korctl korserver \
  --config /etc/korserver/config.yaml config render --dry-run
```

Проверить, создан ли control socket для `occtl`:

```bash
docker compose exec korserver sh -lc 'ls -l /var/lib/korserver/generated/occtl.sock && occtl -s /var/lib/korserver/generated/occtl.sock show status'
```

Проверить внутренний worker IPC socket ocserv:

```bash
docker compose exec korserver sh -lc 'find /var/lib/korserver/generated -maxdepth 1 -type s -name "ocserv.sock*" -print'
```

Проверить сертификаты:

```bash
docker compose exec korserver ls -la /var/lib/korserver/certs
```

## Проверенный Runtime Smoke

Для текущей версии был выполнен Docker smoke test с `/dev/net/tun`, `NET_ADMIN` и
`NET_RAW`:

- final image `korserver:latest` собирается;
- контейнер становится healthy;
- `supervisorctl` показывает `ocserv RUNNING`;
- `korctl server status` работает внутри runtime image;
- auto CA/server certificates создаются;
- `occtl.sock` и `ocserv.sock.*` создаются в generated directory;
- `ocserv` слушает `443/tcp` и `443/udp`.

Остаются deployment-specific проверки:

- подключение реального OpenConnect клиента;
- upstream OpenConnect tunnel в middle-server режиме;
- nftables apply/cleanup в вашей сетевой среде;
- fwmark policy routing и split DNS для ваших доменов/сетей;
- end-to-end доступ клиента к закрытому контуру.

## Полезные Команды

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
