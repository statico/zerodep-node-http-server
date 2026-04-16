import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cors } from "./cors.ts";

function createMockContext(overrides: any = {}) {
  const headers: Record<string, string> = {};
  const ctx: any = {
    req: {
      method: overrides.method || "GET",
      path: overrides.path || "/",
      url: overrides.url || "http://localhost/",
      header: (name: string) =>
        (overrides.reqHeaders || {})[name.toLowerCase()],
      ...overrides.req,
    },
    header: (name: string, value: string) => {
      headers[name] = value;
    },
    text: (str: string, status?: number) => {
      ctx._body = str;
      ctx._statusCode = status || 200;
      ctx._responseSent = true;
      return Symbol("sent");
    },
    json: (data: any, status?: number) => {
      ctx._body = data;
      ctx._statusCode = status || 200;
      ctx._responseSent = true;
      return Symbol("sent");
    },
    status: (code: number) => {
      ctx._statusCode = code;
    },
    _statusCode: 200,
    _responseSent: false,
    _headers: headers,
  };
  return ctx;
}

const noop = async () => {};

describe("cors middleware", () => {
  it("sets wildcard origin by default", async () => {
    const middleware = cors();
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Allow-Origin"], "*");
  });

  it("sets custom origin string", async () => {
    const middleware = cors({ origin: "https://example.com" });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(
      c._headers["Access-Control-Allow-Origin"],
      "https://example.com",
    );
  });

  it("allows origin from array when it matches", async () => {
    const middleware = cors({
      origin: ["https://a.com", "https://b.com"],
    });
    const c = createMockContext({
      reqHeaders: { origin: "https://b.com" },
    });
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Allow-Origin"], "https://b.com");
  });

  it("does not set origin header when array does not match", async () => {
    const middleware = cors({
      origin: ["https://a.com", "https://b.com"],
    });
    const c = createMockContext({
      reqHeaders: { origin: "https://evil.com" },
    });
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Allow-Origin"], undefined);
  });

  it("calls origin function to resolve allowed origin", async () => {
    const middleware = cors({
      origin: (origin: string) =>
        origin.endsWith(".example.com") ? origin : undefined,
    });

    const c1 = createMockContext({
      reqHeaders: { origin: "https://app.example.com" },
    });
    await middleware(c1, noop);
    assert.equal(
      c1._headers["Access-Control-Allow-Origin"],
      "https://app.example.com",
    );

    const c2 = createMockContext({
      reqHeaders: { origin: "https://evil.com" },
    });
    await middleware(c2, noop);
    assert.equal(c2._headers["Access-Control-Allow-Origin"], undefined);
  });

  it("returns 204 for OPTIONS preflight and does not call next", async () => {
    const middleware = cors();
    const c = createMockContext({ method: "OPTIONS" });
    let nextCalled = false;
    await middleware(c, async () => {
      nextCalled = true;
    });
    assert.equal(c._statusCode, 204);
    assert.equal(c._body, "");
    assert.equal(nextCalled, false);
  });

  it("calls next for non-OPTIONS requests", async () => {
    const middleware = cors();
    const c = createMockContext({ method: "GET" });
    let nextCalled = false;
    await middleware(c, async () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it("sets credentials header when enabled", async () => {
    const middleware = cors({ credentials: true });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Allow-Credentials"], "true");
  });

  it("does not set credentials header by default", async () => {
    const middleware = cors();
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Allow-Credentials"], undefined);
  });

  it("sets custom methods", async () => {
    const middleware = cors({ methods: ["GET", "POST"] });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Allow-Methods"], "GET, POST");
  });

  it("sets default methods", async () => {
    const middleware = cors();
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(
      c._headers["Access-Control-Allow-Methods"],
      "GET, HEAD, PUT, POST, DELETE, PATCH",
    );
  });

  it("mirrors Access-Control-Request-Headers when headers option not set", async () => {
    const middleware = cors();
    const c = createMockContext({
      reqHeaders: {
        "access-control-request-headers": "X-Custom, Authorization",
      },
    });
    await middleware(c, noop);
    assert.equal(
      c._headers["Access-Control-Allow-Headers"],
      "X-Custom, Authorization",
    );
  });

  it("uses headers option instead of mirroring when provided", async () => {
    const middleware = cors({ headers: ["Content-Type", "Authorization"] });
    const c = createMockContext({
      reqHeaders: {
        "access-control-request-headers": "X-Custom",
      },
    });
    await middleware(c, noop);
    assert.equal(
      c._headers["Access-Control-Allow-Headers"],
      "Content-Type, Authorization",
    );
  });

  it("sets maxAge header", async () => {
    const middleware = cors({ maxAge: 3600 });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Max-Age"], "3600");
  });

  it("sets expose headers", async () => {
    const middleware = cors({ exposeHeaders: ["X-Total-Count"] });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Access-Control-Expose-Headers"], "X-Total-Count");
  });
});
