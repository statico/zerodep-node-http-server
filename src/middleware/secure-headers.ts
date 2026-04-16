type Handler = (c: any, next: () => Promise<void>) => Promise<any> | any;

export interface ContentSecurityPolicyOptions {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  connectSrc?: string[];
  fontSrc?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  frameSrc?: string[];
  childSrc?: string[];
  formAction?: string[];
  frameAncestors?: string[];
  baseUri?: string[];
}

export interface SecureHeadersOptions {
  contentSecurityPolicy?: ContentSecurityPolicyOptions;
  referrerPolicy?: string;
  xContentTypeOptions?: string;
  xFrameOptions?: string;
  strictTransportSecurity?: string;
}

/**
 * Convert a camelCase string to kebab-case.
 * E.g. "defaultSrc" -> "default-src"
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (ch) => "-" + ch.toLowerCase());
}

/**
 * Serialize a ContentSecurityPolicyOptions object into a CSP header value.
 */
function serializeCSP(csp: ContentSecurityPolicyOptions): string {
  const directives: string[] = [];

  for (const [key, values] of Object.entries(csp)) {
    if (values && (values as string[]).length > 0) {
      const directiveName = camelToKebab(key);
      directives.push(`${directiveName} ${(values as string[]).join(" ")}`);
    }
  }

  return directives.join("; ");
}

export function secureHeaders(options?: SecureHeadersOptions): Handler {
  const opts = options || {};

  return async (c, next) => {
    await next();

    c.header(
      "X-Content-Type-Options",
      opts.xContentTypeOptions ?? "nosniff",
    );
    c.header("X-Frame-Options", opts.xFrameOptions ?? "SAMEORIGIN");
    c.header("Referrer-Policy", opts.referrerPolicy ?? "no-referrer");

    if (opts.strictTransportSecurity) {
      c.header("Strict-Transport-Security", opts.strictTransportSecurity);
    }

    if (opts.contentSecurityPolicy) {
      const cspValue = serializeCSP(opts.contentSecurityPolicy);
      if (cspValue) {
        c.header("Content-Security-Policy", cspValue);
      }
    }
  };
}
