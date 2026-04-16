import type { IncomingMessage, ServerResponse } from "node:http";
import { Context } from "./context.ts";
import { compilePath, matchRoute } from "./router.ts";
import type { Route, CompiledRoute } from "./router.ts";

export type Handler = (
  c: Context,
  next: () => Promise<void>,
) => any | Promise<any>;

export type ErrorHandler = (
  error: Error & { status?: number },
  c: Context,
) => any | Promise<any>;

export type NotFoundHandler = (c: Context) => any | Promise<any>;

interface MiddlewareEntry {
  compiled: CompiledRoute | null; // null = matches all paths
  handler: Handler;
}

export class App {
  private _routes: Route[] = [];
  private _middleware: MiddlewareEntry[] = [];
  private _notFoundHandler: NotFoundHandler | null = null;
  private _errorHandler: ErrorHandler | null = null;

  get(path: string, handler: Handler): this {
    return this._addRoute("GET", path, handler);
  }

  post(path: string, handler: Handler): this {
    return this._addRoute("POST", path, handler);
  }

  put(path: string, handler: Handler): this {
    return this._addRoute("PUT", path, handler);
  }

  patch(path: string, handler: Handler): this {
    return this._addRoute("PATCH", path, handler);
  }

  delete(path: string, handler: Handler): this {
    return this._addRoute("DELETE", path, handler);
  }

  all(path: string, handler: Handler): this {
    return this._addRoute("ALL", path, handler);
  }

  use(pathOrHandler: string | Handler, handler?: Handler): this {
    if (typeof pathOrHandler === "function") {
      this._middleware.push({ compiled: null, handler: pathOrHandler });
    } else {
      if (!handler) {
        throw new Error("Handler is required when path is specified");
      }
      this._middleware.push({
        compiled: compilePath(pathOrHandler),
        handler,
      });
    }
    return this;
  }

  notFound(handler: NotFoundHandler): this {
    this._notFoundHandler = handler;
    return this;
  }

  onError(handler: ErrorHandler): this {
    this._errorHandler = handler;
    return this;
  }

  /**
   * The main request handler. Passed to serve() as `fetch`.
   * Bound to this instance so it can be destructured.
   */
  fetch = (req: IncomingMessage, res: ServerResponse): void => {
    this._handleRequest(req, res).catch((err) => {
      console.error("Unhandled error in request handler:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  };

  private async _handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    const rawUrl = req.url ?? "/";
    const host = req.headers.host ?? "localhost";
    const url = new URL(rawUrl, `http://${host}`);
    const pathname = url.pathname;

    // Find the matching route
    const match = matchRoute(method, pathname, this._routes);
    const params = match?.params ?? {};
    const c = new Context(req, res, url, params);

    try {
      // Collect middleware that applies to this path
      const applicableMiddleware = this._middleware.filter((mw) => {
        if (!mw.compiled) return true;
        return mw.compiled.pattern.test(pathname);
      });

      // Build the handler chain: middleware + route handler (or notFound)
      const routeHandler: Handler | null = match
        ? (match.route.handler as Handler)
        : null;

      let index = 0;
      const next = async (): Promise<void> => {
        if (index < applicableMiddleware.length) {
          const mw = applicableMiddleware[index++];
          await mw.handler(c, next);
        } else if (routeHandler) {
          await routeHandler(c, async () => {});
        } else if (this._notFoundHandler) {
          await this._notFoundHandler(c);
        } else {
          c.text("Not Found", 404);
        }
      };

      await next();
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err));
      if (this._errorHandler) {
        try {
          await this._errorHandler(error as Error & { status?: number }, c);
        } catch (handlerErr) {
          console.error("Error in error handler:", handlerErr);
          if (!res.headersSent) {
            c.text("Internal Server Error", 500);
          }
        }
      } else {
        console.error("Unhandled error:", error);
        c.text("Internal Server Error", 500);
      }
    }

    // Flush the response to the actual ServerResponse
    if (!res.headersSent) {
      c._flush();
    }
  }

  private _addRoute(method: string, path: string, handler: Handler): this {
    this._routes.push({
      method,
      path,
      compiled: compilePath(path),
      handler,
    });
    return this;
  }
}
