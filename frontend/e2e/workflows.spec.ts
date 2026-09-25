import { expect, type Page, test } from "@playwright/test";

import { type MockOptions, mockApi, signIn } from "./fixtures";

type Mutations = NonNullable<MockOptions["mutations"]>;

async function mutationBody(mutations: Mutations, path: string): Promise<Record<string, unknown>> {
  await expect.poll(() => mutations.some((entry) => entry.path === path)).toBe(true);
  const entry = [...mutations].reverse().find((item) => item.path === path);
  return JSON.parse(entry?.body ?? "{}") as Record<string, unknown>;
}

async function openConfigSection(page: Page, pill: string) {
  await page.getByLabel("Primary").getByRole("button", { name: "Config", exact: true }).click();
  await page.getByRole("button", { name: pill, exact: true }).click();
}

test("system, server and web settings hydrate from the loaded config and save it back", async ({
  page
}) => {
  const mutations: Mutations = [];
  await mockApi(page, {
    mutations,
    config: {
      server: { port: 8443, cn: "vpn.corp.example", dns: ["10.0.0.53"] },
      web: { enabled: true, terminal_enabled: false, admin_user: "root-admin", session_lifetime: 3600 },
      system: { timezone: "Europe/Moscow", project_name: "corp-vpn" }
    }
  });
  await signIn(page);

  await openConfigSection(page, "Server");
  await expect(page.getByLabel("Common name")).toHaveValue("vpn.corp.example");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  expect(await mutationBody(mutations, "/api/server/settings")).toMatchObject({
    port: 8443,
    cn: "vpn.corp.example",
    dns: ["10.0.0.53"]
  });

  await page.getByRole("button", { name: "Web / API", exact: true }).click();
  await page.getByText("Administrator & sessions", { exact: true }).click();
  await expect(page.getByLabel("Admin username")).toHaveValue("root-admin");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  expect(await mutationBody(mutations, "/api/web-config/settings")).toMatchObject({
    admin_user: "root-admin",
    session_lifetime: 3600
  });

  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.getByLabel("Project name")).toHaveValue("corp-vpn");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  expect(await mutationBody(mutations, "/api/config/general-settings")).toMatchObject({
    timezone: "Europe/Moscow",
    project_name: "corp-vpn"
  });
});

test("Let's Encrypt settings hydrate from certificate status and save", async ({ page }) => {
  const mutations: Mutations = [];
  await mockApi(page, {
    mutations,
    letsEncrypt: {
      enabled: true,
      email: "ops@example.com",
      domains: ["vpn.example.com"],
      auto_renew_interval: 3
    }
  });
  await signIn(page);

  await openConfigSection(page, "Certificates");
  await page.getByRole("tab", { name: "Let's Encrypt", exact: true }).click();
  await expect(page.getByLabel("Email")).toHaveValue("ops@example.com");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  expect(await mutationBody(mutations, "/api/certificates/letsencrypt/settings")).toMatchObject({
    email: "ops@example.com",
    domains: ["vpn.example.com"],
    auto_renew_interval: 3
  });
});

test("identity group-selection settings save the edited draft", async ({ page }) => {
  const mutations: Mutations = [];
  await mockApi(page, { mutations });
  await signIn(page);

  await openConfigSection(page, "Identity · Experimental");
  await page.getByRole("tab", { name: "Group selection", exact: true }).click();
  await page.getByLabel("Select group by URL").check();
  await page.getByLabel("Default select group").fill("devops");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  expect(await mutationBody(mutations, "/api/identity/settings")).toMatchObject({
    select_group_by_url: true,
    default_select_group: "devops"
  });
});

test("persistent YAML editor validates and saves the edited source", async ({ page }) => {
  const mutations: Mutations = [];
  await mockApi(page, { mutations });
  await signIn(page);

  await openConfigSection(page, "Advanced");
  const editor = page.locator("textarea").first();
  await expect(editor).toHaveValue("web:\n  enabled: true\n");
  await editor.fill("web:\n  enabled: false\n");
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  expect(await mutationBody(mutations, "/api/config/source/validate")).toEqual({
    content: "web:\n  enabled: false\n"
  });
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  expect(await mutationBody(mutations, "/api/config/source")).toMatchObject({
    content: "web:\n  enabled: false\n"
  });
});

test("logs view loads the selected file and saves rotation settings", async ({ page }) => {
  const mutations: Mutations = [];
  await mockApi(page, { mutations, logFiles: [{ name: "api.log", size: 10 }] });
  await signIn(page);

  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByText("log line one")).toBeVisible();

  await page.locator("label.switch", { hasText: "Enabled" }).locator("input").check();
  await page.locator("label", { hasText: "Max size" }).locator("input").fill("20");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await mutationBody(mutations, "/api/logs/rotation")).toMatchObject({
    enabled: true,
    max_size_mb: 20
  });
});

test("per-user and per-group config dialogs save through their own endpoints", async ({
  page
}) => {
  const mutations: Mutations = [];
  await mockApi(page, {
    mutations,
    users: [{ username: "alice", disabled: false, certificate_exists: false, p12_exists: false }]
  });
  await signIn(page);

  await page.getByRole("button", { name: "Users", exact: true }).click();
  await page.getByRole("button", { name: "Per-user config", exact: true }).click();
  const userDialog = page.getByRole("dialog");
  await expect(userDialog.getByRole("heading", { name: "alice config" })).toBeVisible();
  await userDialog.getByLabel("Hostname").fill("alice-laptop");
  await userDialog.getByRole("button", { name: "Save", exact: true }).click();
  expect(await mutationBody(mutations, "/api/users/alice/config")).toMatchObject({
    hostname: "alice-laptop"
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByLabel("Primary").getByRole("button", { name: "Groups", exact: true }).click();
  await page.getByLabel("Group name").fill("qa");
  await page.getByRole("button", { name: "Create config", exact: true }).click();
  const groupDialog = page.getByRole("dialog");
  await expect(groupDialog.getByRole("heading", { name: "qa group config" })).toBeVisible();
  await groupDialog.getByLabel("Hostname").fill("qa-host");
  await groupDialog.getByRole("button", { name: "Save", exact: true }).click();
  expect(await mutationBody(mutations, "/api/groups/qa/config")).toMatchObject({
    hostname: "qa-host"
  });
});

test("dashboard reload/restart and Upstream settings use hydrated values", async ({ page }) => {
  const mutations: Mutations = [];
  await mockApi(page, {
    mutations,
    config: { upstream: { check_interval: 11, check_threshold: 4 } }
  });
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);

  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect.poll(() => mutations.some((entry) => entry.path === "/api/server/reload")).toBe(true);
  await page.getByRole("button", { name: "Restart ocserv", exact: true }).click();
  await expect.poll(() => mutations.some((entry) => entry.path === "/api/server/restart")).toBe(
    true
  );

  await openConfigSection(page, "Upstream");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).last().click();
  expect(await mutationBody(mutations, "/api/upstream/settings")).toMatchObject({
    interface: "oc-middle0",
    check_interval: 11,
    check_threshold: 4
  });
});
