# @statico/zerodep-node-http-server

A zero-dependency, TypeScript-first HTTP server built on `node:http` with a [Hono](https://hono.dev/)-compatible API.

## Why?

Hono is great, but it's a dependency — and dependencies have vulnerabilities. This package was created to replace Hono in several small projects that only used its basic routing, middleware, and context APIs. Rather than track Hono CVEs, we wrote a minimal replacement that uses only Node.js built-in modules.

If you need Hono's full feature set (validators, RPC, streaming, multi-runtime support), use Hono. If you need simple routing with middleware for a Node.js server and want zero third-party dependencies, this might be for you.

## Features

- Zero runtime dependencies — only `node:http`, `node:fs`, `node:path`, `node:crypto`
- TypeScript-first with full type declarations
- Hono-compatible API — migrate by changing imports
- Built-in middleware: CORS, secure headers (CSP), logger, static file serving
- Path parameters (`:id`) and wildcards (`*`)
- Async middleware with onion model (`await next()`)
- Lazy body parsing (JSON, text, ArrayBuffer)

## Install

```bash
npm install @statico/zerodep-node-http-server
```

Requires Node.js >= 22.

## Quick Start

```ts
import { App, serve } from "@statico/zerodep-node-http-server";

const app = new App();

app.get("/", (c) => c.text("Hello!"));

app.get("/users/:id", (c) => {
  return c.json({ id: c.req.param("id") });
});

app.post("/submit", async (c) => {
  const body = await c.req.json();
  return c.json({ received: body });
});

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Listening on port ${info.port}`);
});
```

## API

### App

```ts
const app = new App();

// Route methods
app.get(path, handler);
app.post(path, handler);
app.put(path, handler);
app.patch(path, handler);
app.delete(path, handler);
app.all(path, handler);

// Middleware
app.use(handler);            // global
app.use("/api/*", handler);  // path-scoped

// Error handling
app.notFound((c) => c.text("Not found", 404));
app.onError((err, c) => c.json({ error: err.message }, 500));
```

### Context

Route handlers receive a `Context` object:

```ts
// Request
c.req.query("name")       // query parameter
c.req.param("id")         // path parameter
c.req.header("x-foo")     // request header (case-insensitive)
await c.req.json()         // parse body as JSON
await c.req.text()         // body as string
await c.req.arrayBuffer()  // raw body
c.req.url                  // full URL string
c.req.method               // HTTP method
c.req.path                 // URL pathname

// Response
c.json({ ok: true })               // JSON response
c.json({ error: "bad" }, 400)      // with status code
c.text("hello")                    // plain text
c.html("<h1>Hi</h1>")             // HTML
c.redirect("/other", 302)          // redirect
c.header("X-Custom", "value")      // set response header

// Node.js access
c.env.incoming                      // raw IncomingMessage
c.env.incoming.socket.remoteAddress // client IP
```

### Middleware

```ts
import {
  cors,
  secureHeaders,
  logger,
  serveStatic,
} from "@statico/zerodep-node-http-server";

// CORS
app.use(cors());
app.use(cors({ origin: "https://example.com" }));
app.use(cors({ origin: ["https://a.com", "https://b.com"] }));

// Security headers with CSP
app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "https://cdn.example.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
    referrerPolicy: "unsafe-url",
  })
);

// Request logging
app.use(logger());

// Static files
app.use(serveStatic({ root: "./public" }));
```

### Custom Middleware

```ts
app.use(async (c, next) => {
  const start = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} - ${Date.now() - start}ms`);
});
```

### serve()

```ts
import { serve } from "@statico/zerodep-node-http-server";

serve({ fetch: app.fetch, port: 3000, hostname: "0.0.0.0" }, (info) => {
  console.log(`Listening on http://${info.address}:${info.port}`);
});
```

## Migrating from Hono

1. Install: `npm install @statico/zerodep-node-http-server`
2. Uninstall: `npm uninstall hono @hono/node-server`
3. Replace imports:

| Before | After |
|--------|-------|
| `import { Hono } from "hono"` | `import { App } from "@statico/zerodep-node-http-server"` |
| `import { serve } from "@hono/node-server"` | `import { serve } from "@statico/zerodep-node-http-server"` |
| `import { cors } from "hono/cors"` | `import { cors } from "@statico/zerodep-node-http-server"` |
| `import { secureHeaders } from "hono/secure-headers"` | `import { secureHeaders } from "@statico/zerodep-node-http-server"` |
| `import { logger } from "hono/logger"` | `import { logger } from "@statico/zerodep-node-http-server"` |
| `import { serveStatic } from "@hono/node-server/serve-static"` | `import { serveStatic } from "@statico/zerodep-node-http-server"` |
| `import type { Context } from "hono"` | `import type { Context } from "@statico/zerodep-node-http-server"` |

4. Rename `new Hono()` to `new App()`
5. Everything else (routes, handlers, context API) stays the same.

## License

MIT

---

Built with [Claude Code](https://claude.ai/code) by Anthropic. Created to eliminate third-party HTTP framework dependencies from a set of small Node.js projects, replacing Hono with a minimal, zero-dependency alternative that provides only the features actually needed.
