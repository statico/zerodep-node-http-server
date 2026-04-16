import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compilePath,
  matchRoute,
  type CompiledRoute,
  type Route,
} from "./router.ts";

// ---------------------------------------------------------------------------
// Helper to build a Route for testing
// ---------------------------------------------------------------------------
function makeRoute(
  method: string,
  path: string,
  handler: Function = () => {},
): Route {
  return {
    method,
    path,
    compiled: compilePath(path),
    handler,
  };
}

// ===========================================================================
// compilePath
// ===========================================================================

describe("compilePath", () => {
  it("compiles a simple static path", () => {
    const c = compilePath("/hello");
    assert.ok(c.pattern.test("/hello"));
    assert.ok(!c.pattern.test("/hello/"));
    assert.ok(!c.pattern.test("/other"));
    assert.deepStrictEqual(c.paramNames, []);
  });

  it("compiles the root path /", () => {
    const c = compilePath("/");
    assert.ok(c.pattern.test("/"));
    assert.ok(!c.pattern.test("/anything"));
  });

  it("compiles a single :param segment", () => {
    const c = compilePath("/users/:id");
    assert.deepStrictEqual(c.paramNames, ["id"]);
    const m = c.pattern.exec("/users/42");
    assert.ok(m);
    assert.equal(m!.groups!.id, "42");
    assert.ok(!c.pattern.test("/users/"));
    assert.ok(!c.pattern.test("/users/42/extra"));
  });

  it("compiles multiple :param segments", () => {
    const c = compilePath("/:org/:repo");
    assert.deepStrictEqual(c.paramNames, ["org", "repo"]);
    const m = c.pattern.exec("/acme/widgets");
    assert.ok(m);
    assert.equal(m!.groups!.org, "acme");
    assert.equal(m!.groups!.repo, "widgets");
  });

  it("compiles a path mixing literal and param segments", () => {
    const c = compilePath("/api/users/:userId/posts/:postId");
    assert.deepStrictEqual(c.paramNames, ["userId", "postId"]);
    const m = c.pattern.exec("/api/users/7/posts/99");
    assert.ok(m);
    assert.equal(m!.groups!.userId, "7");
    assert.equal(m!.groups!.postId, "99");
    assert.ok(!c.pattern.test("/api/users/7"));
  });

  it("compiles a wildcard path /files/*", () => {
    const c = compilePath("/files/*");
    assert.deepStrictEqual(c.paramNames, []);
    assert.ok(c.pattern.test("/files/"));
    assert.ok(c.pattern.test("/files/a/b/c.txt"));
    const m = c.pattern.exec("/files/deep/nested/path");
    assert.ok(m);
    assert.equal(m![1], "deep/nested/path");
  });

  it("compiles the catch-all /* pattern", () => {
    const c = compilePath("/*");
    assert.ok(c.pattern.test("/"));
    assert.ok(c.pattern.test("/anything"));
    assert.ok(c.pattern.test("/deep/nested/path"));
  });

  it("escapes regex-special characters in literal segments", () => {
    const c = compilePath("/api/v1.0");
    // The dot should be escaped — only "/api/v1.0" matches, not "/api/v1X0"
    assert.ok(c.pattern.test("/api/v1.0"));
    assert.ok(!c.pattern.test("/api/v1X0"));
  });

  it("escapes parentheses and brackets in literal segments", () => {
    const c = compilePath("/path/(group)/[bracket]");
    assert.ok(c.pattern.test("/path/(group)/[bracket]"));
    assert.ok(!c.pattern.test("/path/group/bracket"));
  });
});

// ===========================================================================
// matchRoute
// ===========================================================================

describe("matchRoute", () => {
  it("matches a simple static route", () => {
    const routes = [makeRoute("GET", "/health")];
    const result = matchRoute("GET", "/health", routes);
    assert.ok(result);
    assert.equal(result!.route.path, "/health");
    assert.deepStrictEqual(result!.params, {});
  });

  it("returns null when nothing matches", () => {
    const routes = [makeRoute("GET", "/health")];
    assert.equal(matchRoute("GET", "/missing", routes), null);
  });

  it("returns null when method does not match", () => {
    const routes = [makeRoute("POST", "/data")];
    assert.equal(matchRoute("GET", "/data", routes), null);
  });

  it("matches exact method (case insensitive input)", () => {
    const routes = [makeRoute("GET", "/items")];
    const result = matchRoute("get", "/items", routes);
    assert.ok(result);
    assert.equal(result!.route.path, "/items");
  });

  it('matches routes registered with method "ALL"', () => {
    const routes = [makeRoute("ALL", "/middleware")];

    const get = matchRoute("GET", "/middleware", routes);
    assert.ok(get);
    const post = matchRoute("POST", "/middleware", routes);
    assert.ok(post);
    const del = matchRoute("DELETE", "/middleware", routes);
    assert.ok(del);
  });

  it("extracts path params", () => {
    const routes = [makeRoute("GET", "/users/:id")];
    const result = matchRoute("GET", "/users/42", routes);
    assert.ok(result);
    assert.deepStrictEqual(result!.params, { id: "42" });
  });

  it("extracts multiple path params", () => {
    const routes = [makeRoute("GET", "/:org/:repo/issues/:num")];
    const result = matchRoute("GET", "/acme/widgets/issues/123", routes);
    assert.ok(result);
    assert.deepStrictEqual(result!.params, {
      org: "acme",
      repo: "widgets",
      num: "123",
    });
  });

  it("matches wildcard routes", () => {
    const routes = [makeRoute("GET", "/static/*")];
    const result = matchRoute("GET", "/static/css/main.css", routes);
    assert.ok(result);
    assert.deepStrictEqual(result!.params, {});
  });

  it("matches the catch-all /* for any path", () => {
    const routes = [makeRoute("ALL", "/*")];
    assert.ok(matchRoute("GET", "/", routes));
    assert.ok(matchRoute("POST", "/any/thing", routes));
  });

  describe("first-match-wins ordering", () => {
    it("returns the first matching route when multiple could match", () => {
      const handlerA = () => "A";
      const handlerB = () => "B";
      const routes = [
        makeRoute("GET", "/items/:id"),
        makeRoute("GET", "/items/:slug"),
      ];
      routes[0].handler = handlerA;
      routes[1].handler = handlerB;

      const result = matchRoute("GET", "/items/foo", routes);
      assert.ok(result);
      assert.equal(result!.route.handler, handlerA);
    });

    it("prefers a specific route registered before a wildcard", () => {
      const specific = makeRoute("GET", "/files/readme");
      const wildcard = makeRoute("GET", "/files/*");
      const routes = [specific, wildcard];

      const result = matchRoute("GET", "/files/readme", routes);
      assert.ok(result);
      assert.equal(result!.route, specific);
    });

    it("falls through to wildcard when specific route does not match", () => {
      const specific = makeRoute("GET", "/files/readme");
      const wildcard = makeRoute("GET", "/files/*");
      const routes = [specific, wildcard];

      const result = matchRoute("GET", "/files/other.txt", routes);
      assert.ok(result);
      assert.equal(result!.route, wildcard);
    });
  });

  it("distinguishes between methods on the same path", () => {
    const getHandler = () => "get";
    const postHandler = () => "post";
    const routes = [
      { ...makeRoute("GET", "/resource"), handler: getHandler },
      { ...makeRoute("POST", "/resource"), handler: postHandler },
    ];

    const getResult = matchRoute("GET", "/resource", routes);
    assert.ok(getResult);
    assert.equal(getResult!.route.handler, getHandler);

    const postResult = matchRoute("POST", "/resource", routes);
    assert.ok(postResult);
    assert.equal(postResult!.route.handler, postHandler);
  });

  it("does not partially match paths", () => {
    const routes = [makeRoute("GET", "/api")];
    assert.equal(matchRoute("GET", "/api/extra", routes), null);
    assert.equal(matchRoute("GET", "/ap", routes), null);
  });
});
