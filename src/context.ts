import type { IncomingMessage, ServerResponse } from "node:http";

// Sentinel returned by response methods so `return c.json(...)` works
const RESPONSE_SENT = Symbol("response_sent");
export type ResponseSentinel = typeof RESPONSE_SENT;

export { RESPONSE_SENT };

/**
 * Hono-compatible request wrapper around Node's IncomingMessage.
 */
export class HonoRequest {
  private _raw: IncomingMessage;
  private _url: URL;
  private _params: Record<string, string>;
  private _bodyBuffer: Buffer | null = null;
  private _bodyPromise: Promise<Buffer> | null = null;

  constructor(
    raw: IncomingMessage,
    url: URL,
    params: Record<string, string>,
  ) {
    this._raw = raw;
    this._url = url;
    this._params = params;
  }

  /** Extract a query parameter by name. */
  query(name: string): string | undefined {
    return this._url.searchParams.get(name) ?? undefined;
  }

  /** Return a route parameter by name. */
  param(name: string): string {
    return this._params[name];
  }

  /** Return a request header value (case-insensitive). */
  header(name: string): string | undefined {
    const val = this._raw.headers[name.toLowerCase()];
    if (Array.isArray(val)) {
      return val.join(", ");
    }
    return val ?? undefined;
  }

  /** Parse the request body as JSON. Lazy, cached. */
  async json<T = any>(): Promise<T> {
    const body = await this.text();
    return JSON.parse(body);
  }

  /** Read the request body as a UTF-8 string. Lazy, cached. */
  async text(): Promise<string> {
    const buf = await this._readBody();
    return buf.toString("utf-8");
  }

  /** Read the request body as an ArrayBuffer. Lazy, cached. */
  async arrayBuffer(): Promise<ArrayBuffer> {
    const buf = await this._readBody();
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
  }

  /** Full URL string. */
  get url(): string {
    return this._url.href;
  }

  /** HTTP method (uppercase). */
  get method(): string {
    return (this._raw.method ?? "GET").toUpperCase();
  }

  /** URL pathname. */
  get path(): string {
    return this._url.pathname;
  }

  /**
   * Lazily read and cache the raw body from IncomingMessage.
   * Subsequent calls return the same Buffer.
   */
  private _readBody(): Promise<Buffer> {
    if (this._bodyBuffer !== null) {
      return Promise.resolve(this._bodyBuffer);
    }

    if (this._bodyPromise !== null) {
      return this._bodyPromise;
    }

    this._bodyPromise = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      this._raw.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      this._raw.on("end", () => {
        this._bodyBuffer = Buffer.concat(chunks);
        resolve(this._bodyBuffer);
      });
      this._raw.on("error", reject);
    });

    return this._bodyPromise;
  }
}

/**
 * Hono-compatible context object passed to route handlers.
 * Wraps Node's IncomingMessage and ServerResponse.
 */
export class Context {
  req: HonoRequest;
  env: { incoming: IncomingMessage };

  private _res: ServerResponse;
  private _statusCode: number = 200;
  private _headers: Map<string, string> = new Map();
  private _body: string | null = null;
  private _sent: boolean = false;

  constructor(
    raw: IncomingMessage,
    res: ServerResponse,
    url: URL,
    params: Record<string, string>,
  ) {
    this.req = new HonoRequest(raw, url, params);
    this.env = { incoming: raw };
    this._res = res;
  }

  /**
   * Send a JSON response.
   * Sets content-type to application/json and JSON.stringifies the data.
   */
  json(
    data: any,
    status?: number,
    headers?: Record<string, string>,
  ): ResponseSentinel {
    if (status !== undefined) {
      this._statusCode = status;
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this._headers.set(k.toLowerCase(), v);
      }
    }
    this._headers.set("content-type", "application/json");
    this._body = JSON.stringify(data);
    this._sent = true;
    return RESPONSE_SENT;
  }

  /**
   * Send a plain text response.
   * Sets content-type to text/plain.
   */
  text(
    str: string,
    status?: number,
    headers?: Record<string, string>,
  ): ResponseSentinel {
    if (status !== undefined) {
      this._statusCode = status;
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this._headers.set(k.toLowerCase(), v);
      }
    }
    this._headers.set("content-type", "text/plain");
    this._body = str;
    this._sent = true;
    return RESPONSE_SENT;
  }

  /**
   * Send an HTML response.
   * Sets content-type to text/html.
   */
  html(
    str: string,
    status?: number,
    headers?: Record<string, string>,
  ): ResponseSentinel {
    if (status !== undefined) {
      this._statusCode = status;
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this._headers.set(k.toLowerCase(), v);
      }
    }
    this._headers.set("content-type", "text/html");
    this._body = str;
    this._sent = true;
    return RESPONSE_SENT;
  }

  /**
   * Send a redirect response.
   * Defaults to 302 if no status is provided.
   */
  redirect(url: string, status?: number): ResponseSentinel {
    this._statusCode = status ?? 302;
    this._headers.set("location", url);
    this._body = null;
    this._sent = true;
    return RESPONSE_SENT;
  }

  /** Accumulate a response header. */
  header(name: string, value: string): void {
    this._headers.set(name.toLowerCase(), value);
  }

  /** Set the response status code. */
  status(code: number): void {
    this._statusCode = code;
  }

  /**
   * Internal: flush accumulated response state to the actual ServerResponse.
   * Called by the framework after the handler chain completes.
   */
  _flush(): void {
    this._res.statusCode = this._statusCode;

    for (const [name, value] of this._headers) {
      this._res.setHeader(name, value);
    }

    if (this._body !== null) {
      this._res.end(this._body);
    } else {
      this._res.end();
    }
  }

  /** Internal: check if a response method has been called. */
  get _responseSent(): boolean {
    return this._sent;
  }
}
