import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

type Handler = (c: any, next: () => Promise<void>) => Promise<any> | any;

export interface ServeStaticOptions {
  root: string;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

export function serveStatic(options: ServeStaticOptions): Handler {
  const root = options.root;

  return async (c, next) => {
    const reqPath = c.req.path;

    // Prevent path traversal
    if (reqPath.includes("..")) {
      c.status(403);
      return c.text("Forbidden", 403);
    }

    // Strip leading slash and join with root
    const relativePath = reqPath.replace(/^\/+/, "");
    const filePath = join(root, relativePath);

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        await next();
        return;
      }

      const content = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      c.header("Content-Type", contentType);
      c._body = content;
      c._statusCode = 200;
      c._responseSent = true;
    } catch {
      // File doesn't exist or can't be read — fall through
      await next();
    }
  };
}
