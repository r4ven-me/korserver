import { expect, type Page, test } from "@playwright/test";

const commandResult = {
  argv: ["korctl", "server", "status"],
  returncode: 0,
  stdout: "ocserv RUNNING\n",
  stderr: "",
  dry_run: false
};

type MockOptions = {
  terminalEnabled?: boolean;
  users?: Array<{
    username: string;
    disabled: boolean;
    certificate_exists: boolean;
    p12_exists: boolean;
  }>;
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
  routingMode?: "direct" | "full" | "split";
};

async function mockApi(page: Page, options: MockOptions = {}) {
  let authenticated = false;
  let serverState = options.initialServerState ?? "running";
  const users = options.users ?? [];
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
      "/api/users": method === "GET" ? users : commandResult,
      "/api/users/otp": otpRecords,
      "/api/sessions": sessions,
      "/api/routing/routes":
        method === "GET" ? routes : JSON.parse(route.request().postData() ?? "{}").items ?? [],
      "/api/routing/domains":
        method === "GET" ? domains : JSON.parse(route.request().postData() ?? "{}").items ?? [],
      "/api/routing/settings": { status: "ok" },
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
        enabled: false,
        active_profile: null,
        interface: "oc-middle0",
        connected: false,
        local_ip: null,
        remote: null,
        connections: []
      },
      "/api/upstream": [],
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
    ["Upstream", "Status"],
    ["Internal DNS", "Internal DNS"],
    ["Web / API", "Web / API panel"],
    ["Advanced", "Persistent YAML"]
  ] as const) {
    await page.getByRole("button", { name: pill, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  // Server-side routing settings (formerly their own "Routing" pill) now
  // live inside the Upstream section, right below its Status/Profiles.
  await page.getByRole("button", { name: "Upstream", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Server-side routing", exact: true })
  ).toBeVisible();
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
