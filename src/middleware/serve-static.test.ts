import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serveStatic } from "./serve-static.ts";

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

describe("serveStatic middleware", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "serve-static-test-"));
    await writeFile(join(tmpDir, "index.html"), "<h1>Hello</h1>");
    await writeFile(join(tmpDir, "style.css"), "body { color: red; }");
    await writeFile(join(tmpDir, "app.js"), "console.log('hi');");
    await writeFile(join(tmpDir, "data.json"), '{"key":"value"}');
    await writeFile(join(tmpDir, "readme.txt"), "Hello world");
    await mkdir(join(tmpDir, "sub"));
    await writeFile(join(tmpDir, "sub", "page.html"), "<p>Sub</p>");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("serves an existing HTML file with correct Content-Type", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/index.html" });
    let nextCalled = false;
    await middleware(c, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(c._headers["Content-Type"], "text/html");
    assert.equal(c._statusCode, 200);
    assert.ok(Buffer.isBuffer(c._body));
    assert.equal(c._body.toString(), "<h1>Hello</h1>");
  });

  it("serves a CSS file with correct Content-Type", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/style.css" });
    await middleware(c, async () => {});

    assert.equal(c._headers["Content-Type"], "text/css");
    assert.equal(c._body.toString(), "body { color: red; }");
  });

  it("serves a JS file with correct Content-Type", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/app.js" });
    await middleware(c, async () => {});

    assert.equal(c._headers["Content-Type"], "application/javascript");
  });

  it("serves a JSON file with correct Content-Type", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/data.json" });
    await middleware(c, async () => {});

    assert.equal(c._headers["Content-Type"], "application/json");
  });

  it("serves a text file with correct Content-Type", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/readme.txt" });
    await middleware(c, async () => {});

    assert.equal(c._headers["Content-Type"], "text/plain");
  });

  it("serves files in subdirectories", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/sub/page.html" });
    await middleware(c, async () => {});

    assert.equal(c._headers["Content-Type"], "text/html");
    assert.equal(c._body.toString(), "<p>Sub</p>");
  });

  it("calls next for missing files (fall through)", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/nonexistent.html" });
    let nextCalled = false;
    await middleware(c, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(c._headers["Content-Type"], undefined);
  });

  it("blocks path traversal with ..", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/../../../etc/passwd" });
    let nextCalled = false;
    await middleware(c, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(c._statusCode, 403);
  });

  it("blocks path traversal with encoded ..", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/sub/../../etc/passwd" });
    let nextCalled = false;
    await middleware(c, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(c._statusCode, 403);
  });

  it("calls next when path is a directory", async () => {
    const middleware = serveStatic({ root: tmpDir });
    const c = createMockContext({ path: "/sub" });
    let nextCalled = false;
    await middleware(c, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });
});
