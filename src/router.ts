export interface CompiledRoute {
  pattern: RegExp;
  paramNames: string[];
}

export interface Route {
  method: string; // uppercase: "GET", "POST", etc. or "ALL"
  path: string; // original path pattern
  compiled: CompiledRoute;
  handler: Function;
}

/**
 * Compile a URL path pattern into a RegExp and extract parameter names.
 *
 * - `:param` segments become named capture groups
 * - `*` wildcard at the end matches anything (greedy)
 * - Literal segments are escaped for regex safety
 */
export function compilePath(path: string): CompiledRoute {
  const paramNames: string[] = [];

  // Handle the catch-all "/*" and "*" patterns (matches everything)
  if (path === "/*" || path === "*") {
    return { pattern: /^\/(.*)$/, paramNames: [] };
  }

  const segments = path.split("/");
  // The first element is always "" because paths start with "/"
  let regexStr = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (i === 0) {
      // Leading empty string from the split — skip, we'll prepend ^ later
      continue;
    }

    if (seg === "*") {
      // Wildcard — must be the last segment. Match anything remaining.
      regexStr += "/(.*)";
    } else if (seg.startsWith(":")) {
      const paramName = seg.slice(1);
      paramNames.push(paramName);
      regexStr += `/(?<${paramName}>[^/]+)`;
    } else {
      // Literal segment — escape regex-special characters
      regexStr += "/" + escapeRegex(seg);
    }
  }

  // If the path was just "/", regexStr is empty at this point
  if (regexStr === "") {
    regexStr = "/";
  }

  return {
    pattern: new RegExp(`^${regexStr}$`),
    paramNames,
  };
}

/**
 * Match an incoming request against the routes array (linear scan, first match wins).
 *
 * Returns the matched route and extracted path params, or null.
 */
export function matchRoute(
  method: string,
  pathname: string,
  routes: Route[],
): { route: Route; params: Record<string, string> } | null {
  const upperMethod = method.toUpperCase();

  for (const route of routes) {
    // Method must match exactly or route must accept ALL methods
    if (route.method !== "ALL" && route.method !== upperMethod) {
      continue;
    }

    const match = route.compiled.pattern.exec(pathname);
    if (!match) {
      continue;
    }

    // Build params from named capture groups
    const params: Record<string, string> = {};
    if (match.groups) {
      for (const name of route.compiled.paramNames) {
        if (match.groups[name] !== undefined) {
          params[name] = match.groups[name];
        }
      }
    }

    return { route, params };
  }

  return null;
}

/**
 * Escape special regex characters in a literal string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
