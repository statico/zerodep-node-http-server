type Handler = (c: any, next: () => Promise<void>) => Promise<any> | any;

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => string | undefined);
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
  exposeHeaders?: string[];
}

const DEFAULT_METHODS = ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"];

export function cors(options?: CorsOptions): Handler {
  const opts = options || {};
  const originOpt = opts.origin ?? "*";
  const methods = opts.methods ?? DEFAULT_METHODS;

  return async (c, next) => {
    const requestOrigin = c.req.header("origin") || "";

    // Resolve the allowed origin value
    let allowedOrigin: string | undefined;

    if (typeof originOpt === "function") {
      allowedOrigin = originOpt(requestOrigin);
    } else if (Array.isArray(originOpt)) {
      if (originOpt.includes(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
      // If not in array, don't set origin header
    } else {
      allowedOrigin = originOpt;
    }

    if (allowedOrigin !== undefined) {
      c.header("Access-Control-Allow-Origin", allowedOrigin);
    }

    c.header("Access-Control-Allow-Methods", methods.join(", "));

    if (opts.credentials) {
      c.header("Access-Control-Allow-Credentials", "true");
    }

    if (opts.maxAge !== undefined) {
      c.header("Access-Control-Max-Age", String(opts.maxAge));
    }

    if (opts.exposeHeaders && opts.exposeHeaders.length > 0) {
      c.header("Access-Control-Expose-Headers", opts.exposeHeaders.join(", "));
    }

    // Determine allowed headers
    if (opts.headers && opts.headers.length > 0) {
      c.header("Access-Control-Allow-Headers", opts.headers.join(", "));
    } else {
      // Mirror the request's Access-Control-Request-Headers
      const requestHeaders = c.req.header("access-control-request-headers");
      if (requestHeaders) {
        c.header("Access-Control-Allow-Headers", requestHeaders);
      }
    }

    // Preflight
    if (c.req.method === "OPTIONS") {
      return c.text("", 204);
    }

    await next();
  };
}
