import { expect, type Page, test } from "@playwright/test";

const commandResult = {
  argv: ["korctl", "server", "status"],
  returncode: 0,
  stdout: "ocserv RUNNING\n",
  stderr: "",
  dry_run: false
};

type MockUser = {
  username: string;
  disabled: boolean;
  certificate_exists: boolean;
  p12_exists: boolean;
  groups?: string[];
};

type MockOptions = {
  terminalEnabled?: boolean;
  users?: MockUser[];
  // Returned starting from the second GET /api/users onward, to simulate
  // membership changing out-of-band (CLI, another admin session) between the
  // initial page load and a later re-fetch.
  usersAfterFirstFetch?: MockUser[];
  groups?: Array<{ name: string; config_exists: boolean; has_settings: boolean }>;
  otpRecords?: Array<{ username: string; enabled: boolean }>;
  sessions?: Array<{
    username: string;
    vpn_ip: string | null;
    real_ip: string | null;
    device: string | null;
    rx: string | null;
    tx: string | null;
    rx_rate: string | null;
    tx_rate: string | null;
    duration_seconds: number | null;
  }>;
  routes?: string[];
  domains?: string[];
  mutations?: Array<{ method: string; path: string; csrf: string | null; body: string | null }>;
  initialServerState?: "running" | "stopped";
  routingMode?: "full" | "split";
  upstreamEnabled?: boolean;
  upstreamProfiles?: Array<Record<string, unknown>>;
  upstreamStatus?: Record<string, unknown>;
};

async function mockApi(page: Page, options: MockOptions = {}) {
  let authenticated = false;
  let serverState = options.initialServerState ?? "running";
  let userFetchCount = 0;
  const users = options.users ?? [];
  const groups = options.groups ?? [];
  const otpRecords = options.otpRecords ?? [];
  const sessions = options.sessions ?? [];
  const routes = options.routes ?? [];
  const domains = options.domains ?? [];
  const mutations = options.mutations ?? [];
  await page.route("**/healthz", (route) =>
    route.fulfill({ json: { status: "ok", version: "0.1.0" } })
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/auth/login") {
      authenticated = true;
      await route.fulfill({
        json: { authenticated: true, username: "admin", csrf_token: "csrf" }
      });
      return;
    }
    if (path === "/api/auth/me") {
      await route.fulfill({
        status: authenticated ? 200 : 401,
        json: authenticated
          ? { authenticated: true, username: "admin", csrf_token: "csrf" }
          : { detail: "authentication required" }
      });
      return;
    }
    if (method !== "GET") {
      mutations.push({
        method,
        path,
        csrf: route.request().headers()["x-korserver-csrf"] ?? null,
        body: route.request().postData()
      });
    }
    if (path === "/api/server/start") {
      serverState = "running";
    }
    if (path === "/api/server/stop") {
      serverState = "stopped";
    }
    if (path === "/api/users" && method === "GET") {
      userFetchCount += 1;
    }
    const currentUsers =
      userFetchCount <= 1 || !options.usersAfterFirstFetch ? users : options.usersAfterFirstFetch;
    const serverStatus = {
      ...commandResult,
      stdout: serverState === "running" ? "ocserv RUNNING\n" : "ocserv STOPPED\n"
    };
    const responses: Record<string, unknown> = {
      "/api/server/status": serverStatus,
      "/api/server/processes": [],
      "/api/server/start": commandResult,
      "/api/server/stop": commandResult,
      "/api/server/reload": commandResult,
      "/api/users": method === "GET" ? currentUsers : commandResult,
      "/api/groups": groups,
      "/api/users/otp": otpRecords,
      "/api/sessions": sessions,
      "/api/routing/routes":
        method === "GET" ? routes : JSON.parse(route.request().postData() ?? "{}").items ?? [],
      "/api/routing/domains":
        method === "GET" ? domains : JSON.parse(route.request().postData() ?? "{}").items ?? [],
      "/api/routing/settings": { status: "ok" },
      "/api/routing/routes/status": { files: [], urls: [] },
      "/api/routing/domains/status": { files: [], urls: [] },
      "/api/routing/routes/refresh": {
        status: "refreshed",
        url: "",
        total_lines: 0,
        valid: 0,
        skipped: 0,
        sample: [],
        saved: true,
        written: []
      },
      "/api/routing/domains/refresh": {
        status: "refreshed",
        url: "",
        total_lines: 0,
        valid: 0,
        skipped: 0,
        sample: [],
        saved: true,
        written: []
      },
      "/api/routing/reload": [commandResult],
      "/api/routing/nft": commandResult,
      "/api/routing/nft/apply": [commandResult],
      "/api/routing/nft/cleanup": [commandResult],
      "/api/internal-dns/status": {
        enabled: false,
        listen: "10.10.10.1",
        port: 53,
        client_dns: ["1.1.1.1", "8.8.8.8"],
        blocklist_domains: [],
        blocklist_files: [],
        blocklist_urls: [],
        total: 0,
        cache_size: 150,
        log_queries: false,
        local_records: []
      },
      "/api/internal-dns/settings": { status: "saved" },
      "/api/upstream/status": {
        enabled: options.upstreamEnabled ?? false,
        active_profile: null,
        interface: "oc-middle0",
        connected: false,
        local_ip: null,
        remote: null,
        connections: [],
        ...options.upstreamStatus
      },
      "/api/upstream": options.upstreamProfiles ?? [],
      "/api/upstream/settings": { status: "ok" },
      "/api/upstream/profiles": { status: "ok" },
      "/api/upstream/connect": commandResult,
      "/api/upstream/disconnect": commandResult,
      "/api/identity": {
        auth: {
          enabled: false,
          connector: "pam",
          pam: { service: "ocserv", gid_min: null },
          radius: {
            config_file: "/etc/radiusclient/radiusclient.conf",
            groupconfig: true,
            nas_identifier: null,
            group_separator: "semicolon"
          }
        },
        oidc_providers: [],
        group_policies: [],
        config_per_group_dir: null,
        select_group_by_url: false,
        default_select_group: null,
        default_group_config: null
      },
      "/api/config": {
        routing: { mode: options.routingMode ?? "full", split: {} },
        web: { terminal_enabled: options.terminalEnabled ?? false }
      },
      "/api/config/source": {
        path: "/etc/korserver/config.yaml",
        exists: true,
        content: "web:\n  enabled: true\n"
      },
      "/api/config/render": {},
      "/api/config/source/validate": {},
      "/api/config/diff": { diff: "" },
      "/api/auth/totp/status": { enabled: false },
      "/api/diagnostics": {},
      "/api/diagnostics/software": [],
      "/api/diagnostics/interface-stats": { interface: null, rx_bytes: null, tx_bytes: null },
      "/api/logs/files": [],
      "/api/logs/rotation": {
        enabled: false,
        max_size_mb: 50,
        max_age: 0,
        max_age_unit: "days",
        keep_files: 5
      },
      "/api/certificates": {
        mode: "auto",
        active: {
          server_cert: "",
          server_key: "",
          ca_cert: "",
          server_cert_exists: true,
          server_key_exists: true,
          ca_cert_exists: true
        },
        authority: {
          ca_cert: "",
          ca_key: "",
          ca_cert_exists: true,
          ca_key_exists: true
        },
        external: {
          server_cert: "",
          server_key: "",
          ca_cert: "",
          server_cert_exists: false,
          server_key_exists: false,
          ca_cert_exists: false
        },
        letsencrypt: {
          enabled: false,
          email: null,
          domains: [],
          renew_reload: true,
          auto_renew_enabled: true,
          auto_renew_interval: 7,
          auto_renew_interval_unit: "days",
          http01_address: null,
          http01_port: 80,
          paths: null
        },
        certbot_available: true
      }
    };
    if (/^\/api\/users\/[^/]+$/.test(path) && method === "DELETE") {
      await route.fulfill({ json: commandResult });
      return;
    }
    if (/^\/api\/users\/[^/]+\/(password|enable|disable|cert|p12)$/.test(path)) {
      await route.fulfill({
        json: path.endsWith("/cert") && method === "POST" ? { results: [commandResult] } : commandResult
      });
      return;
    }
    if (/^\/api\/users\/[^/]+\/otp$/.test(path)) {
      await route.fulfill({ json: { status: "ok" } });
      return;
    }
    if (/^\/api\/sessions\/[^/]+\/kick$/.test(path)) {
      await route.fulfill({ json: commandResult });
      return;
    }
    await route.fulfill({ json: responses[path] ?? { status: "ok" } });
  });
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("logs in and opens every standard management section", async ({ page }) => {
  await mockApi(page);
  await signIn(page);

  for (const section of ["Users", "Sessions", "Diagnostics", "Logs", "Dashboard"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Terminal", exact: true })).toHaveCount(0);
});

test("Config hub exposes every config sub-section behind its own sub-nav pill", async ({
  page
}) => {
  await mockApi(page);
  await signIn(page);

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Config", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Routing", exact: true })
  ).toHaveCount(0);

  for (const [pill, heading] of [
    ["System", "General"],
    ["Server", "Server (VPN)"],
    ["Authentication", "Authentication methods"],
    ["Certificates", "Authority certificates"],
    ["Identity", "OIDC connector"],
    ["Upstream", "Profiles"],
    ["Internal DNS", "Internal DNS"],
    ["Web / API", "Web / API panel"],
    ["Advanced", "Persistent YAML"]
  ] as const) {
    await page.getByRole("button", { name: pill, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  // Server-side routing settings (formerly their own "Routing" pill) now
  // live inside the Upstream section, right below its Profiles list.
  await page.getByRole("button", { name: "Upstream", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Server-side routing", exact: true })
  ).toBeVisible();
});

test("server-side routing controls are inert until Upstream is enabled", async ({ page }) => {
  // Regression test: routing.mode/host_traffic/host_mode and the Routes/
  // Domains lists have no effect at all while upstream.enabled is false
  // (clients just get plain NAT through the host regardless) -- the panel
  // used to leave them fully interactive anyway, inviting an admin to
  // "set" something that silently does nothing.
  await mockApi(page, { upstreamEnabled: false });
  await signIn(page);

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: "Upstream", exact: true }).click();
  const routingPanel = page
    .getByRole("heading", { name: "Server-side routing", exact: true })
    .locator("../..");

  // Not getByLabel("Mode"): same select accessible-name-concatenation quirk
  // as "Host mode" below (label text + currently selected option text).
  await expect(
    routingPanel.locator("label").filter({ hasText: "Mode" }).first().locator("select")
  ).toBeDisabled();
  await expect(
    routingPanel.locator("label").filter({ hasText: "Route this host" }).locator("input")
  ).toBeDisabled();
  // Host mode only appears once Host traffic is checked -- it can't be, so
  // it isn't rendered at all while Upstream is off.
  await expect(
    routingPanel.locator("label").filter({ hasText: "Host mode" }).locator("select")
  ).toHaveCount(0);
  // Infrastructure settings that matter regardless of Upstream (plain NAT
  // through the host uses main_interface/fwmark/table_id/nft_prefix too)
  // live under the collapsed "Advanced" details and stay editable.
  await routingPanel.getByText("Advanced (rarely changed)").click();
  await expect(routingPanel.getByLabel("Main interface", { exact: true })).toBeEnabled();
  await expect(routingPanel.getByLabel("fwmark", { exact: true })).toBeEnabled();
});

test("shows the lazy xterm view only when terminal access is enabled", async ({ page }) => {
  await mockApi(page, { terminalEnabled: true });
  await signIn(page);

  await page.getByRole("button", { name: "Terminal", exact: true }).click();

  await expect(page.locator(".xterm-host .xterm")).toBeVisible();
  await expect(page.getByText("Root shell inside the running container")).toBeVisible();
});

test("core management buttons call expected API endpoints with CSRF", async ({ page }) => {
  const mutations: MockOptions["mutations"] = [];
  await mockApi(page, {
    mutations,
    users: [{ username: "alice", disabled: false, certificate_exists: true, p12_exists: false }],
    sessions: [
      {
        username: "alice",
        vpn_ip: "10.10.10.10",
        real_ip: "198.51.100.10",
        device: "vpns0",
        rx: "1 MiB",
        tx: "2 MiB",
        rx_rate: "10 bytes/sec",
        tx_rate: "20 bytes/sec",
        duration_seconds: 3600
      }
    ],
    routes: ["10.20.0.0/16"],
    domains: ["internal.example"],
    routingMode: "split",
    upstreamEnabled: true,
    initialServerState: "stopped"
  });
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Render configs", exact: true }).click();
  await page.getByRole("button", { name: "Apply firewall/NAT", exact: true }).click();

  await page.getByRole("button", { name: "Users", exact: true }).click();
  await page.getByLabel("Username").fill("bob");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Delete user", exact: true }).click();

  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Kick session", exact: true }).click();

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: "Upstream", exact: true }).click();
  const routesPanel = page.getByRole("heading", { name: "Routes", exact: true }).locator("../..");
  await routesPanel.locator("textarea").fill("10.30.0.0/16\n203.0.113.9");
  await routesPanel.getByRole("button", { name: "Save", exact: true }).click();

  const observed = mutations.map(({ method, path, csrf }) => ({ method, path, csrf }));
  expect(observed).toEqual(
    expect.arrayContaining([
      { method: "POST", path: "/api/server/start", csrf: "csrf" },
      { method: "POST", path: "/api/server/stop", csrf: "csrf" },
      { method: "POST", path: "/api/config/render", csrf: "csrf" },
      { method: "POST", path: "/api/routing/nft/apply", csrf: "csrf" },
      { method: "POST", path: "/api/users", csrf: "csrf" },
      { method: "DELETE", path: "/api/users/alice", csrf: "csrf" },
      { method: "POST", path: "/api/sessions/alice/kick", csrf: "csrf" },
      { method: "PUT", path: "/api/routing/routes", csrf: "csrf" }
    ])
  );
});

test("group membership dialogs fetch fresh data instead of trusting stale state", async ({
  page
}) => {
  // Regression test: state.users is only ever refreshed after an action taken
  // through this panel, so membership changed out-of-band (CLI, another admin
  // session, or just a tab left open) used to render wrong until some
  // unrelated reload happened to refresh it. Both membership dialogs must
  // re-fetch /api/users at open time instead of reading the cached snapshot.
  await mockApi(page, {
    users: [
      {
        username: "alice",
        disabled: false,
        certificate_exists: false,
        p12_exists: false,
        groups: ["devops"]
      }
    ],
    // Every fetch after the initial page load (i.e. the ones triggered by
    // opening a membership dialog) says alice is no longer in "devops" --
    // simulating a change made outside this tab.
    usersAfterFirstFetch: [
      { username: "alice", disabled: false, certificate_exists: false, p12_exists: false, groups: [] }
    ],
    groups: [{ name: "devops", config_exists: true, has_settings: true }]
  });

  await signIn(page);

  await page.getByLabel("Primary").getByRole("button", { name: "Groups", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Groups", exact: true })).toBeVisible();
  await page.getByRole("table").getByRole("button", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "devops members" })).toBeVisible();
  const aliceRow = page.locator(".group-choice", { hasText: "alice" });
  await expect(aliceRow.locator("input[type=checkbox]")).not.toBeChecked();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Users", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  await page.getByRole("table").getByRole("button", { name: "Groups" }).click();
  await expect(page.getByRole("heading", { name: "alice groups" })).toBeVisible();
  const devopsRow = page.locator(".group-choice", { hasText: "devops" });
  await expect(devopsRow.locator("input[type=checkbox]")).not.toBeChecked();
});

test("creating an upstream profile sends its target routes/domains as arrays", async ({
  page
}) => {
  // Regression test: the "Target routes"/"Target domains" fields (per-profile
  // targeted routing) and the request payload's routes/domains
  // CSV/newline-splitting were previously only covered at the unit level
  // (api.test.ts), never through the actual profile-editor UI.
  const mutations: MockOptions["mutations"] = [];
  await mockApi(page, { mutations });
  await signIn(page);

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: "Upstream", exact: true }).click();
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New upstream profile" })).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("finance");
  await page.getByLabel("Server", { exact: true }).fill("finance.example.com");
  await page.getByLabel("Username", { exact: true }).fill("finance-user");
  await page.getByLabel("Password", { exact: true }).fill("finance-pass");
  await page.getByLabel("Route client traffic through this profile", { exact: true }).check();
  await page.getByLabel("Client routes", { exact: true }).fill("10.50.0.0/16, 10.60.0.0/16");
  await page
    .getByLabel("Client domains", { exact: true })
    .fill("internal.example.com\ncorp.example.com");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();

  await expect(page.getByRole("heading", { name: "New upstream profile" })).toHaveCount(0);
  const saved = mutations.find(
    (mutation) => mutation.method === "POST" && mutation.path === "/api/upstream/profiles"
  );
  expect(saved).toBeDefined();
  const payload = JSON.parse(saved?.body ?? "{}");
  expect(payload.name).toBe("finance");
  expect(payload.routes).toEqual(["10.50.0.0/16", "10.60.0.0/16"]);
  expect(payload.domains).toEqual(["internal.example.com", "corp.example.com"]);
});

test("creating an upstream profile can also target host traffic on its own route/domain lists", async ({
  page
}) => {
  const mutations: MockOptions["mutations"] = [];
  await mockApi(page, { mutations });
  await signIn(page);

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: "Upstream", exact: true }).click();
  await page.getByRole("button", { name: "Create profile", exact: true }).click();

  await page.getByLabel("Name", { exact: true }).fill("finance");
  await page.getByLabel("Server", { exact: true }).fill("finance.example.com");
  await page.getByLabel("Username", { exact: true }).fill("finance-user");
  await page.getByLabel("Password", { exact: true }).fill("finance-pass");
  // Client routing left off -- only host routing is exercised here.
  await page.getByLabel("Route host traffic through this profile", { exact: true }).check();
  await page.getByLabel("Host routes", { exact: true }).fill("10.90.0.0/16");
  await page.getByLabel("Host domains", { exact: true }).fill("finance-internal.corp");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();

  await expect(page.getByRole("heading", { name: "New upstream profile" })).toHaveCount(0);
  const saved = mutations.find(
    (mutation) => mutation.method === "POST" && mutation.path === "/api/upstream/profiles"
  );
  expect(saved).toBeDefined();
  const payload = JSON.parse(saved?.body ?? "{}");
  expect(payload.route_host_enabled).toBe(true);
  expect(payload.host_routes).toEqual(["10.90.0.0/16"]);
  expect(payload.host_domains).toEqual(["finance-internal.corp"]);
  // route_clients_enabled left at its default draft state (false, since
  // this profile never had the client toggle checked).
  expect(payload.route_clients_enabled).toBe(false);
});

test("profile cards list the default profile first, then connected profiles, then the rest in order", async ({
  page
}) => {
  await mockApi(page, {
    upstreamEnabled: true,
    upstreamProfiles: [
      {
        name: "bravo",
        server: "bravo.example.com",
        port: "443",
        auth_type: "password",
        username: "user",
        enabled: true
      },
      {
        name: "alpha",
        server: "alpha.example.com",
        port: "443",
        auth_type: "password",
        username: "user",
        enabled: true
      },
      {
        name: "charlie",
        server: "charlie.example.com",
        port: "443",
        auth_type: "password",
        username: "user",
        enabled: true
      }
    ],
    upstreamStatus: {
      active_profile: "alpha",
      connections: [
        { profile: "bravo", interface: "oc-up1", connected: false, local_ip: null, remote: null },
        {
          profile: "alpha",
          interface: "oc-middle0",
          connected: false,
          local_ip: null,
          remote: null
        },
        {
          profile: "charlie",
          interface: "oc-up2",
          connected: true,
          local_ip: "10.10.10.5",
          remote: "203.0.113.9:443"
        }
      ]
    }
  });
  await signIn(page);

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: "Upstream", exact: true }).click();

  const names = await page
    .locator(".profile-card-name > span:first-child")
    .allTextContents();
  // alpha is the configured default (rank 0), charlie is connected despite
  // not being default (rank 1), bravo is neither (rank 2, added 1st but
  // still last since sort is by rank, not insertion order, across groups).
  expect(names).toEqual(["alpha", "charlie", "bravo"]);

  const charlieCard = page.locator(".profile-card", { hasText: "charlie" });
  await expect(charlieCard.getByText("Internal IP: 10.10.10.5")).toBeVisible();
  await expect(charlieCard.getByText("External IP: 203.0.113.9:443")).toBeVisible();
  const alphaCard = page.locator(".profile-card", { hasText: "alpha" });
  await expect(alphaCard.locator(".pill", { hasText: "Default" })).toBeVisible();
});

test("making a different profile default asks for confirmation before switching", async ({
  page
}) => {
  const mutations: MockOptions["mutations"] = [];
  await mockApi(page, {
    mutations,
    upstreamEnabled: true,
    upstreamProfiles: [
      {
        name: "alpha",
        server: "alpha.example.com",
        port: "443",
        auth_type: "password",
        username: "user",
        enabled: true
      },
      {
        name: "bravo",
        server: "bravo.example.com",
        port: "443",
        auth_type: "password",
        username: "user",
        enabled: true
      }
    ],
    upstreamStatus: { active_profile: "alpha", connections: [] }
  });
  await signIn(page);

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: "Upstream", exact: true }).click();

  let dialogMessage = "";
  page.once("dialog", (dialog) => {
    dialogMessage = dialog.message();
    void dialog.accept();
  });
  await page
    .locator(".profile-card", { hasText: "bravo" })
    .getByRole("button", { name: "Make default", exact: true })
    .click();

  expect(dialogMessage).toContain("bravo");
  const saved = mutations.find(
    (mutation) => mutation.method === "POST" && mutation.path === "/api/upstream/switch"
  );
  expect(saved).toBeDefined();
  expect(JSON.parse(saved?.body ?? "{}").profile).toBe("bravo");
});

test("toggling host-traffic routing sends host_traffic/host_mode to the API", async ({
  page
}) => {
  const mutations: MockOptions["mutations"] = [];
  await mockApi(page, { mutations, upstreamEnabled: true });
  await signIn(page);

  await page.getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: "Upstream", exact: true }).click();
  const routingPanel = page
    .getByRole("heading", { name: "Server-side routing", exact: true })
    .locator("../..");
  await routingPanel
    .locator("label")
    .filter({ hasText: "Route this host" })
    .locator("input")
    .check();
  // Not getByLabel: this <select>'s computed accessible name concatenates
  // the label text with its own currently-selected option ("Host
  // modeFull (all host traffic)"), so an exact label match never hits.
  await routingPanel
    .locator("label")
    .filter({ hasText: "Host mode" })
    .locator("select")
    .selectOption("split");
  await routingPanel.getByRole("button", { name: "Save", exact: true }).click();

  const saved = mutations.find(
    (mutation) => mutation.method === "POST" && mutation.path === "/api/routing/settings"
  );
  expect(saved).toBeDefined();
  const payload = JSON.parse(saved?.body ?? "{}");
  expect(payload.host_traffic).toBe(true);
  expect(payload.host_mode).toBe("split");
});
