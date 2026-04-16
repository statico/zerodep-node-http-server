import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { secureHeaders } from "./secure-headers.ts";

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

describe("secureHeaders middleware", () => {
  it("sets default security headers", async () => {
    const middleware = secureHeaders();
    const c = createMockContext();
    await middleware(c, noop);

    assert.equal(c._headers["X-Content-Type-Options"], "nosniff");
    assert.equal(c._headers["X-Frame-Options"], "SAMEORIGIN");
    assert.equal(c._headers["Referrer-Policy"], "no-referrer");
  });

  it("calls next before setting headers", async () => {
    const middleware = secureHeaders();
    const c = createMockContext();
    let nextCalledAt = 0;
    let headersSetAt = 0;

    const origHeader = c.header.bind(c);
    c.header = (name: string, value: string) => {
      if (headersSetAt === 0) headersSetAt = Date.now();
      origHeader(name, value);
    };

    await middleware(c, async () => {
      nextCalledAt = Date.now();
    });

    assert.ok(nextCalledAt > 0, "next should have been called");
    assert.ok(
      headersSetAt >= nextCalledAt,
      "headers should be set after next()",
    );
  });

  it("sets custom referrer policy", async () => {
    const middleware = secureHeaders({
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(
      c._headers["Referrer-Policy"],
      "strict-origin-when-cross-origin",
    );
  });

  it("sets custom X-Frame-Options", async () => {
    const middleware = secureHeaders({ xFrameOptions: "DENY" });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["X-Frame-Options"], "DENY");
  });

  it("sets custom X-Content-Type-Options", async () => {
    const middleware = secureHeaders({ xContentTypeOptions: "nosniff" });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["X-Content-Type-Options"], "nosniff");
  });

  it("sets Strict-Transport-Security when provided", async () => {
    const middleware = secureHeaders({
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
    });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(
      c._headers["Strict-Transport-Security"],
      "max-age=31536000; includeSubDomains",
    );
  });

  it("does not set Strict-Transport-Security by default", async () => {
    const middleware = secureHeaders();
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Strict-Transport-Security"], undefined);
  });

  it("serializes a single CSP directive", async () => {
    const middleware = secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
      },
    });
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Content-Security-Policy"], "default-src 'self'");
  });

  it("serializes multiple CSP directives", async () => {
    const middleware = secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    });
    const c = createMockContext();
    await middleware(c, noop);

    const csp = c._headers["Content-Security-Policy"];
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"));
    assert.ok(csp.includes("img-src 'self' data: https:"));

    // Directives should be separated by "; "
    const parts = csp.split("; ");
    assert.equal(parts.length, 3);
  });

  it("converts camelCase directive names to kebab-case", async () => {
    const middleware = secureHeaders({
      contentSecurityPolicy: {
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    });
    const c = createMockContext();
    await middleware(c, noop);

    const csp = c._headers["Content-Security-Policy"];
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.ok(csp.includes("form-action 'self'"));
    assert.ok(csp.includes("base-uri 'self'"));
  });

  it("does not set CSP header when not configured", async () => {
    const middleware = secureHeaders();
    const c = createMockContext();
    await middleware(c, noop);
    assert.equal(c._headers["Content-Security-Policy"], undefined);
  });
});
