import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Context, HonoRequest, RESPONSE_SENT } from "./context.ts";

// ---------------------------------------------------------------------------
// Helpers to create mock IncomingMessage and ServerResponse
// ---------------------------------------------------------------------------

function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): IncomingMessage {
  const { method = "GET", url = "/", headers = {}, body } = options;

  const readable = new Readable({
    read() {
      if (body !== undefined) {
        this.push(typeof body === "string" ? Buffer.from(body) : body);
      }
      this.push(null);
    },
  }) as unknown as IncomingMessage;

  readable.method = method;
  readable.url = url;
  readable.headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );

  return readable;
}

interface MockResponseData {
  statusCode: number;
  headers: Record<string, string | number | readonly string[]>;
  body: string;
  ended: boolean;
}

function createMockResponse(): {
  res: ServerResponse;
  data: MockResponseData;
} {
  const data: MockResponseData = {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
  };

  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      data.headers[name] = value;
    },
    end(chunk?: string) {
      data.statusCode = this.statusCode;
      if (chunk !== undefined) {
        data.body = chunk;
      }
      data.ended = true;
    },
  } as unknown as ServerResponse;

  return { res, data };
}

function makeContext(options: {
  method?: string;
  urlString?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  params?: Record<string, string>;
}): { c: Context; data: MockResponseData } {
  const {
    method = "GET",
    urlString = "http://localhost/",
    headers = {},
    body,
    params = {},
  } = options;

  const raw = createMockRequest({ method, url: urlString, headers, body });
  const { res, data } = createMockResponse();
  const url = new URL(urlString, "http://localhost");
  const c = new Context(raw, res, url, params);
  return { c, data };
}

// ---------------------------------------------------------------------------
// HonoRequest tests
// ---------------------------------------------------------------------------

describe("HonoRequest", () => {
  describe("query()", () => {
    it("extracts a query parameter", () => {
      const { c } = makeContext({
        urlString: "http://localhost/search?q=hello&page=2",
      });
      assert.equal(c.req.query("q"), "hello");
      assert.equal(c.req.query("page"), "2");
    });

    it("returns undefined for missing query parameter", () => {
      const { c } = makeContext({
        urlString: "http://localhost/search?q=hello",
      });
      assert.equal(c.req.query("missing"), undefined);
    });
  });

  describe("param()", () => {
    it("returns route params", () => {
      const { c } = makeContext({
        urlString: "http://localhost/users/42",
        params: { id: "42" },
      });
      assert.equal(c.req.param("id"), "42");
    });

    it("returns undefined for missing param", () => {
      const { c } = makeContext({ params: {} });
      assert.equal(c.req.param("nope"), undefined);
    });
  });

  describe("header()", () => {
    it("returns header value case-insensitively", () => {
      const { c } = makeContext({
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(c.req.header("content-type"), "application/json");
      assert.equal(c.req.header("Content-Type"), "application/json");
      assert.equal(c.req.header("CONTENT-TYPE"), "application/json");
    });

    it("returns undefined for missing header", () => {
      const { c } = makeContext({});
      assert.equal(c.req.header("x-missing"), undefined);
    });
  });

  describe("json()", () => {
    it("parses JSON body", async () => {
      const { c } = makeContext({
        method: "POST",
        body: JSON.stringify({ name: "Alice", age: 30 }),
      });
      const result = await c.req.json();
      assert.deepEqual(result, { name: "Alice", age: 30 });
    });

    it("caches result across multiple calls", async () => {
      const { c } = makeContext({
        method: "POST",
        body: JSON.stringify({ ok: true }),
      });
      const first = await c.req.json();
      const second = await c.req.json();
      assert.deepEqual(first, { ok: true });
      assert.deepEqual(second, { ok: true });
    });
  });

  describe("text()", () => {
    it("reads body as UTF-8 string", async () => {
      const { c } = makeContext({
        method: "POST",
        body: "Hello, world!",
      });
      const result = await c.req.text();
      assert.equal(result, "Hello, world!");
    });

    it("caches result across multiple calls", async () => {
      const { c } = makeContext({ method: "POST", body: "cached" });
      const first = await c.req.text();
      const second = await c.req.text();
      assert.equal(first, "cached");
      assert.equal(second, "cached");
    });
  });

  describe("arrayBuffer()", () => {
    it("reads body as ArrayBuffer", async () => {
      const bodyBytes = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const { c } = makeContext({ method: "POST", body: bodyBytes });
      const ab = await c.req.arrayBuffer();
      assert.ok(ab instanceof ArrayBuffer);
      const view = new Uint8Array(ab);
      assert.deepEqual(Array.from(view), [0x01, 0x02, 0x03, 0x04]);
    });
  });

  describe("url property", () => {
    it("returns the full URL string", () => {
      const { c } = makeContext({
        urlString: "http://localhost/path?key=val",
      });
      assert.equal(c.req.url, "http://localhost/path?key=val");
    });
  });

  describe("method property", () => {
    it("returns the HTTP method in uppercase", () => {
      const { c } = makeContext({ method: "post" });
      assert.equal(c.req.method, "POST");
    });

    it("defaults to GET", () => {
      const raw = createMockRequest({});
      // Force method to undefined to test the default
      raw.method = undefined;
      const { res } = createMockResponse();
      const url = new URL("http://localhost/");
      const c = new Context(raw, res, url, {});
      assert.equal(c.req.method, "GET");
    });
  });

  describe("path property", () => {
    it("returns the URL pathname", () => {
      const { c } = makeContext({
        urlString: "http://localhost/api/users?page=1",
      });
      assert.equal(c.req.path, "/api/users");
    });
  });
});

// ---------------------------------------------------------------------------
// Context response tests
// ---------------------------------------------------------------------------

describe("Context", () => {
  describe("json()", () => {
    it("sets content-type to application/json and stringifies data", () => {
      const { c, data } = makeContext({});
      c.json({ hello: "world" });
      c._flush();
      assert.equal(data.headers["content-type"], "application/json");
      assert.equal(data.body, '{"hello":"world"}');
    });

    it("sets status code when provided", () => {
      const { c, data } = makeContext({});
      c.json({ error: "not found" }, 404);
      c._flush();
      assert.equal(data.statusCode, 404);
    });

    it("sets extra headers when provided", () => {
      const { c, data } = makeContext({});
      c.json({ ok: true }, 200, { "X-Custom": "value" });
      c._flush();
      assert.equal(data.headers["x-custom"], "value");
      assert.equal(data.headers["content-type"], "application/json");
    });

    it("returns RESPONSE_SENT symbol", () => {
      const { c } = makeContext({});
      const result = c.json({ ok: true });
      assert.equal(result, RESPONSE_SENT);
    });
  });

  describe("text()", () => {
    it("sets content-type to text/plain", () => {
      const { c, data } = makeContext({});
      c.text("hello");
      c._flush();
      assert.equal(data.headers["content-type"], "text/plain");
      assert.equal(data.body, "hello");
    });

    it("sets status code when provided", () => {
      const { c, data } = makeContext({});
      c.text("created", 201);
      c._flush();
      assert.equal(data.statusCode, 201);
    });

    it("sets extra headers when provided", () => {
      const { c, data } = makeContext({});
      c.text("ok", 200, { "X-Req-Id": "abc" });
      c._flush();
      assert.equal(data.headers["x-req-id"], "abc");
    });

    it("returns RESPONSE_SENT symbol", () => {
      const { c } = makeContext({});
      const result = c.text("hi");
      assert.equal(result, RESPONSE_SENT);
    });
  });

  describe("html()", () => {
    it("sets content-type to text/html", () => {
      const { c, data } = makeContext({});
      c.html("<h1>Hello</h1>");
      c._flush();
      assert.equal(data.headers["content-type"], "text/html");
      assert.equal(data.body, "<h1>Hello</h1>");
    });

    it("sets status code when provided", () => {
      const { c, data } = makeContext({});
      c.html("<p>Error</p>", 500);
      c._flush();
      assert.equal(data.statusCode, 500);
    });

    it("sets extra headers when provided", () => {
      const { c, data } = makeContext({});
      c.html("<p>hi</p>", 200, { "Cache-Control": "no-store" });
      c._flush();
      assert.equal(data.headers["cache-control"], "no-store");
    });

    it("returns RESPONSE_SENT symbol", () => {
      const { c } = makeContext({});
      const result = c.html("<p>hi</p>");
      assert.equal(result, RESPONSE_SENT);
    });
  });

  describe("redirect()", () => {
    it("sets Location header and defaults to 302", () => {
      const { c, data } = makeContext({});
      c.redirect("https://example.com");
      c._flush();
      assert.equal(data.statusCode, 302);
      assert.equal(data.headers["location"], "https://example.com");
    });

    it("uses custom status code", () => {
      const { c, data } = makeContext({});
      c.redirect("/new-path", 301);
      c._flush();
      assert.equal(data.statusCode, 301);
      assert.equal(data.headers["location"], "/new-path");
    });

    it("returns RESPONSE_SENT symbol", () => {
      const { c } = makeContext({});
      const result = c.redirect("/somewhere");
      assert.equal(result, RESPONSE_SENT);
    });
  });

  describe("header()", () => {
    it("accumulates headers", () => {
      const { c, data } = makeContext({});
      c.header("X-First", "one");
      c.header("X-Second", "two");
      c.text("ok");
      c._flush();
      assert.equal(data.headers["x-first"], "one");
      assert.equal(data.headers["x-second"], "two");
    });

    it("overwrites a header with the same name", () => {
      const { c, data } = makeContext({});
      c.header("X-Value", "old");
      c.header("X-Value", "new");
      c.text("ok");
      c._flush();
      assert.equal(data.headers["x-value"], "new");
    });
  });

  describe("status()", () => {
    it("sets the response status code", () => {
      const { c, data } = makeContext({});
      c.status(418);
      c.text("I'm a teapot");
      c._flush();
      assert.equal(data.statusCode, 418);
    });
  });

  describe("_flush()", () => {
    it("writes status, headers, and body to ServerResponse", () => {
      const { c, data } = makeContext({});
      c.status(201);
      c.header("X-Custom", "yes");
      c.json({ created: true });
      c._flush();

      assert.equal(data.statusCode, 201);
      assert.equal(data.headers["x-custom"], "yes");
      assert.equal(data.headers["content-type"], "application/json");
      assert.equal(data.body, '{"created":true}');
      assert.equal(data.ended, true);
    });

    it("ends the response even without a body", () => {
      const { c, data } = makeContext({});
      c.status(204);
      c._flush();

      assert.equal(data.statusCode, 204);
      assert.equal(data.ended, true);
      assert.equal(data.body, "");
    });
  });

  describe("env.incoming", () => {
    it("exposes the raw IncomingMessage", () => {
      const raw = createMockRequest({ method: "GET", url: "/" });
      const { res } = createMockResponse();
      const url = new URL("http://localhost/");
      const c = new Context(raw, res, url, {});
      assert.equal(c.env.incoming, raw);
    });
  });

  describe("_responseSent", () => {
    it("is false initially", () => {
      const { c } = makeContext({});
      assert.equal(c._responseSent, false);
    });

    it("is true after json()", () => {
      const { c } = makeContext({});
      c.json({});
      assert.equal(c._responseSent, true);
    });

    it("is true after text()", () => {
      const { c } = makeContext({});
      c.text("hi");
      assert.equal(c._responseSent, true);
    });

    it("is true after html()", () => {
      const { c } = makeContext({});
      c.html("<p>hi</p>");
      assert.equal(c._responseSent, true);
    });

    it("is true after redirect()", () => {
      const { c } = makeContext({});
      c.redirect("/other");
      assert.equal(c._responseSent, true);
    });
  });
});
