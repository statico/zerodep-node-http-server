import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ServeOptions {
  fetch: (req: IncomingMessage, res: ServerResponse) => void;
  port?: number;
  hostname?: string;
}

export interface ServeInfo {
  port: number;
  address: string;
}

export function serve(
  options: ServeOptions,
  callback?: (info: ServeInfo) => void,
): http.Server {
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? "0.0.0.0";

  const server = http.createServer(options.fetch);

  server.listen(port, hostname, () => {
    if (callback) {
      const addr = server.address();
      const actualPort =
        addr && typeof addr === "object" ? addr.port : port;
      callback({ port: actualPort, address: hostname });
    }
  });

  return server;
}
