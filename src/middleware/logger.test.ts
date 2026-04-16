import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { logger } from "./logger.ts";

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

describe("logger middleware", () => {
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    logs = [];
    origLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.join(" "));
    };
  });

  afterEach(() => {
    console.log = origLog;
  });

  it("logs request and response lines", async () => {
    const middleware = logger();
    const c = createMockContext({ method: "GET", path: "/hello" });
    await middleware(c, async () => {});

    assert.equal(logs.length, 2);
    assert.equal(logs[0], "<-- GET /hello");
    assert.ok(logs[1].startsWith("--> GET /hello 200"));
  });

  it("includes status code in response log", async () => {
    const middleware = logger();
    const c = createMockContext({ method: "POST", path: "/data" });
    c._statusCode = 201;
    await middleware(c, async () => {
      c._statusCode = 201;
    });

    assert.ok(logs[1].includes("201"));
  });

  it("includes timing in response log", async () => {
    const middleware = logger();
    const c = createMockContext({ method: "GET", path: "/" });
    await middleware(c, async () => {
      // Small delay to ensure timing > 0 or = 0
    });

    // The response log should end with a timing like "0ms" or "1ms"
    assert.match(logs[1], /\d+ms$/);
  });

  it("logs correct method and path", async () => {
    const middleware = logger();
    const c = createMockContext({ method: "DELETE", path: "/users/42" });
    await middleware(c, async () => {});

    assert.equal(logs[0], "<-- DELETE /users/42");
    assert.ok(logs[1].startsWith("--> DELETE /users/42"));
  });

  it("shows status set during handler execution", async () => {
    const middleware = logger();
    const c = createMockContext({ method: "GET", path: "/not-found" });
    await middleware(c, async () => {
      c._statusCode = 404;
    });

    assert.ok(logs[1].includes("404"));
  });
});
