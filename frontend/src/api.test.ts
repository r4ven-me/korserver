import { afterEach, describe, expect, it, vi } from "vitest";

import {
  login,
  saveRoutingSettings,
  saveUpstreamProfile,
  setCsrfToken,
  writeRenderedConfig,
  type UpstreamProfileDraft
} from "./api";

afterEach(() => {
  setCsrfToken(null);
  vi.unstubAllGlobals();
});

describe("browser API authentication", () => {
  it("uses a same-origin cookie login without an Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          username: "admin",
          csrf_token: "csrf-value"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await login("admin", "secret");

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(path).toBe("/api/auth/login");
    expect(init.credentials).toBe("same-origin");
    expect(headers.has("Authorization")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
      username: "admin",
      password: "secret"
    });
  });

  it("adds the CSRF header to mutating requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ written: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("csrf-value");

    await writeRenderedConfig("session");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(headers.get("X-Korserver-CSRF")).toBe("csrf-value");
  });
});

const upstreamProfileDraft: UpstreamProfileDraft = {
  name: "finance",
  server: "finance.example.com",
  port: "443",
  interface: "oc-finance",
  auth_type: "password",
  trusted_cert: false,
  username: "user",
  password: "",
  cert_file: "",
  cert_file_base64: "",
  key_file: "",
  key_file_base64: "",
  cert_pass: "",
  server_cert_pin: "",
  check_host: "",
  camouflage_secret: "",
  route_clients_enabled: false,
  routes: "",
  domains: "",
  route_host_enabled: false,
  host_routes: "",
  host_domains: "",
  enable: true,
  enabled: true
};

describe("saveUpstreamProfile", () => {
  it("splits the newline/comma-separated routes and domains textareas into arrays", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "saved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveUpstreamProfile("session", {
      ...upstreamProfileDraft,
      routes: "10.50.0.0/16, 10.60.0.0/16\n10.70.0.0/16",
      domains: "internal.example.com,\ncorp.example.com"
    });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/upstream/profiles");
    const sent = JSON.parse(String(init.body));
    expect(sent.routes).toEqual(["10.50.0.0/16", "10.60.0.0/16", "10.70.0.0/16"]);
    expect(sent.domains).toEqual(["internal.example.com", "corp.example.com"]);
  });

  it("splits the host routes/domains textareas the same way as the client ones", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "saved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveUpstreamProfile("session", {
      ...upstreamProfileDraft,
      route_host_enabled: true,
      host_routes: "10.90.0.0/16, 10.91.0.0/16",
      host_domains: "finance-internal.corp"
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(sent.host_routes).toEqual(["10.90.0.0/16", "10.91.0.0/16"]);
    expect(sent.host_domains).toEqual(["finance-internal.corp"]);
  });

  it("sends an empty array, not a list with a blank string, for an empty textarea", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "saved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveUpstreamProfile("session", upstreamProfileDraft);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(sent.routes).toEqual([]);
    expect(sent.domains).toEqual([]);
  });
});

describe("saveRoutingSettings", () => {
  it("sends host_traffic/host_mode alongside the rest of the routing payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "saved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveRoutingSettings("session", {
      mode: "split",
      tunnel_dns: true,
      host_traffic: true,
      host_mode: "split",
      dnsmasq_listen: "10.10.10.1",
      dnsmasq_port: 53,
      main_interface: "auto",
      fwmark: "0x0c01",
      table_id: 1201,
      nft_prefix: "korserver",
      routes_files: [],
      routes_urls: [],
      domains_files: [],
      domains_urls: []
    });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/routing/settings");
    const sent = JSON.parse(String(init.body));
    expect(sent.host_traffic).toBe(true);
    expect(sent.host_mode).toBe("split");
  });
});
