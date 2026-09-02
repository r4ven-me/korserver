import { afterEach, describe, expect, it, vi } from "vitest";

import { login, setCsrfToken, writeRenderedConfig } from "./api";

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
