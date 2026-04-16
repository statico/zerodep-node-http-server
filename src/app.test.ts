import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { App } from "./app.ts";
import { serve } from "./serve.ts";

/** Start the app on a random port, return the base URL and a close function. */
function startApp(app: App): Promise<{ base: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app.fetch);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        base: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("App routing", () => {
  it("handles a simple GET route", async () => {
    const app = new App();
    app.get("/hello", (c) => c.text("world"));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/hello`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "world");
      assert.equal(res.headers.get("content-type"), "text/plain");
    } finally {
      await close();
    }
  });

  it("handles POST routes", async () => {
    const app = new App();
    app.post("/submit", async (c) => {
      const body = await c.req.json();
      return c.json({ received: body.name });
    });
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data, { received: "test" });
    } finally {
      await close();
    }
  });

  it("handles path parameters", async () => {
    const app = new App();
    app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/users/42`);
      const data = await res.json();
      assert.deepEqual(data, { id: "42" });
    } finally {
      await close();
    }
  });

  it("handles query parameters", async () => {
    const app = new App();
    app.get("/search", (c) => c.json({ q: c.req.query("q") }));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/search?q=hello`);
      const data = await res.json();
      assert.deepEqual(data, { q: "hello" });
    } finally {
      await close();
    }
  });

  it("returns 404 for unmatched routes", async () => {
    const app = new App();
    app.get("/exists", (c) => c.text("yes"));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/nope`);
      assert.equal(res.status, 404);
    } finally {
      await close();
    }
  });

  it("uses custom notFound handler", async () => {
    const app = new App();
    app.notFound((c) => c.json({ error: "custom 404" }, 404));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/missing`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.deepEqual(data, { error: "custom 404" });
    } finally {
      await close();
    }
  });

  it("uses custom onError handler", async () => {
    const app = new App();
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    app.onError((err, c) => c.json({ error: err.message }, 500));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/boom`);
      assert.equal(res.status, 500);
      const data = await res.json();
      assert.deepEqual(data, { error: "kaboom" });
    } finally {
      await close();
    }
  });

  it("uses error.status if available", async () => {
    const app = new App();
    app.get("/forbidden", () => {
      const err = new Error("Forbidden") as Error & { status: number };
      err.status = 403;
      throw err;
    });
    app.onError((err, c) => c.json({ error: err.message }, err.status || 500));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/forbidden`);
      assert.equal(res.status, 403);
    } finally {
      await close();
    }
  });

  it("handles c.redirect()", async () => {
    const app = new App();
    app.get("/old", (c) => c.redirect("/new", 302));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/old`, { redirect: "manual" });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("location"), "/new");
    } finally {
      await close();
    }
  });

  it("handles c.html()", async () => {
    const app = new App();
    app.get("/page", (c) => c.html("<h1>Hello</h1>"));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/page`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "text/html");
      assert.equal(await res.text(), "<h1>Hello</h1>");
    } finally {
      await close();
    }
  });

  it("handles c.header() for custom response headers", async () => {
    const app = new App();
    app.get("/custom", (c) => {
      c.header("X-Custom", "value");
      return c.text("ok");
    });
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/custom`);
      assert.equal(res.headers.get("x-custom"), "value");
    } finally {
      await close();
    }
  });

  it("exposes c.env.incoming for raw request access", async () => {
    const app = new App();
    app.get("/env", (c) => {
      const addr = c.env.incoming.socket?.remoteAddress;
      return c.json({ hasSocket: !!addr });
    });
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/env`);
      const data = await res.json();
      assert.equal(data.hasSocket, true);
    } finally {
      await close();
    }
  });

  it("handles c.req.arrayBuffer() for raw body", async () => {
    const app = new App();
    app.post("/raw", async (c) => {
      const buf = await c.req.arrayBuffer();
      return c.json({ bytes: buf.byteLength });
    });
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/raw`, {
        method: "POST",
        body: "hello world",
      });
      const data = await res.json();
      assert.equal(data.bytes, 11);
    } finally {
      await close();
    }
  });
});

describe("App middleware", () => {
  it("runs global middleware before route handler", async () => {
    const order: string[] = [];
    const app = new App();
    app.use(async (c, next) => {
      order.push("mw-before");
      await next();
      order.push("mw-after");
    });
    app.get("/", (c) => {
      order.push("handler");
      return c.text("ok");
    });
    const { base, close } = await startApp(app);
    try {
      await fetch(base);
      assert.deepEqual(order, ["mw-before", "handler", "mw-after"]);
    } finally {
      await close();
    }
  });

  it("runs multiple middleware in order", async () => {
    const order: string[] = [];
    const app = new App();
    app.use(async (c, next) => {
      order.push("a");
      await next();
    });
    app.use(async (c, next) => {
      order.push("b");
      await next();
    });
    app.get("/", (c) => {
      order.push("handler");
      return c.text("ok");
    });
    const { base, close } = await startApp(app);
    try {
      await fetch(base);
      assert.deepEqual(order, ["a", "b", "handler"]);
    } finally {
      await close();
    }
  });

  it("middleware can short-circuit (skip next)", async () => {
    const app = new App();
    app.use(async (c, next) => {
      return c.text("blocked", 403);
    });
    app.get("/", (c) => c.text("should not reach"));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(base);
      assert.equal(res.status, 403);
      assert.equal(await res.text(), "blocked");
    } finally {
      await close();
    }
  });

  it("path-scoped middleware only runs on matching paths", async () => {
    const order: string[] = [];
    const app = new App();
    app.use("/api/*", async (c, next) => {
      order.push("api-mw");
      await next();
    });
    app.get("/", (c) => {
      order.push("root");
      return c.text("root");
    });
    app.get("/api/data", (c) => {
      order.push("api");
      return c.text("api");
    });
    const { base, close } = await startApp(app);
    try {
      await fetch(base);
      assert.deepEqual(order, ["root"]);
      order.length = 0;
      await fetch(`${base}/api/data`);
      assert.deepEqual(order, ["api-mw", "api"]);
    } finally {
      await close();
    }
  });

  it("middleware can set headers on the response", async () => {
    const app = new App();
    app.use(async (c, next) => {
      await next();
      c.header("X-From-Middleware", "yes");
    });
    app.get("/", (c) => c.text("ok"));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(base);
      assert.equal(res.headers.get("x-from-middleware"), "yes");
    } finally {
      await close();
    }
  });
});

describe("App method routing", () => {
  it("does not match wrong HTTP method", async () => {
    const app = new App();
    app.post("/only-post", (c) => c.text("posted"));
    const { base, close } = await startApp(app);
    try {
      const res = await fetch(`${base}/only-post`);
      assert.equal(res.status, 404);
    } finally {
      await close();
    }
  });

  it("app.all() matches any method", async () => {
    const app = new App();
    app.all("/any", (c) => c.text(`method: ${c.req.method}`));
    const { base, close } = await startApp(app);
    try {
      const get = await fetch(`${base}/any`);
      assert.equal(await get.text(), "method: GET");
      const post = await fetch(`${base}/any`, { method: "POST" });
      assert.equal(await post.text(), "method: POST");
    } finally {
      await close();
    }
  });
});

describe("serve()", () => {
  it("starts a server and calls the callback", async () => {
    const app = new App();
    app.get("/", (c) => c.text("served"));

    const { server, info } = await new Promise<{
      server: http.Server;
      info: { port: number; address: string };
    }>((resolve) => {
      const s = serve(
        { fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
        (i) => {
          // port: 0 tells the OS to pick a free port; read it back
          const addr = s.address() as { port: number };
          resolve({ server: s, info: { port: addr.port, address: i.address } });
        },
      );
    });

    try {
      const res = await fetch(`http://127.0.0.1:${info.port}`);
      assert.equal(await res.text(), "served");
      assert.equal(info.address, "127.0.0.1");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
