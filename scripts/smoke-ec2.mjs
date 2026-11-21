import assert from "node:assert/strict";
import { test } from "node:test";

// The CI stack uses Caddy's local CA. NODE_EXTRA_CA_CERTS points to its public
// root certificate so the smoke test verifies TLS and both hostnames.
const primary = "https://finwise.localhost";
const alias = "https://finwise-alias.localhost";
const requestId = "ec2-ci-smoke-123";

function get(base, path, options) {
  return fetch(new URL(path, base), {
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
    ...options,
  });
}

for (const origin of [primary, alias]) {
  test(`${origin} redirects HTTP to the same HTTPS hostname`, async () => {
    const response = await get(origin.replace("https:", "http:"), "/login?next=dashboard");
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `${origin}/login?next=dashboard`);
  });

  test(`${origin} permits credentialed CORS preflights`, async () => {
    const response = await get(primary, "/api/v1/auth/profile", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  });
}

for (const [origin, path] of [[primary, "/login"], [primary, "/register"], [alias, "/chat/local"]]) {
  test(`${origin}${path} serves uncached SPA HTML with security headers`, async () => {
    const response = await get(origin, path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
    assert.match(response.headers.get("cache-control") ?? "", /\bno-cache\b/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(await response.text(), /id="root"/);
  });
}

test("the emitted JavaScript bundle is served with immutable caching", async () => {
  const page = await get(primary, "/login");
  const entry = (await page.text()).match(/src="(\/assets\/[^"]+\.js)"/);
  assert.ok(entry, "Expected the built HTML to reference its JavaScript bundle");
  const bundle = await get(primary, entry[1], { method: "HEAD" });
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get("content-type") ?? "", /javascript/);
  assert.match(bundle.headers.get("cache-control") ?? "", /\bimmutable\b/);
});

test("a missing asset returns 404 instead of the SPA", async () => {
  const response = await get(primary, "/assets/finwise-ci-missing.js");
  assert.equal(response.status, 404);
});

test("request IDs survive the Caddy and nginx hops", async () => {
  const response = await get(alias, "/api/test", { headers: { "X-Request-Id": requestId } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), requestId);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
});

test("the gateway reaches the Python service", async () => {
  const response = await get(primary, "/api/python-health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).python_service.status, "healthy");
});

test("the authentication endpoint issues a secure CSRF cookie", async () => {
  const response = await get(primary, "/api/v1/auth/csrf");
  assert.equal(response.status, 200);
  assert.match((await response.json()).csrf_token, /^[a-f0-9]{64}$/);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("csrf_token="));
  assert.ok(cookie, "Expected a csrf_token cookie");
  assert.match(cookie, /;\s*Secure(?:;|$)/i);
  assert.match(cookie, /;\s*SameSite=Lax(?:;|$)/i);
});

test("a protected profile request requires authentication", async () => {
  const response = await get(primary, "/api/v1/auth/profile");
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /\bno-store\b/);
});

test("an unlisted origin is denied with a traceable client error", async () => {
  const response = await get(primary, "/api/test", {
    headers: { Origin: "https://example.invalid", "X-Request-Id": requestId },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const body = await response.json();
  assert.equal(body.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(body.request_id, requestId);
});

for (const path of ["/api/metrics", "/api/v1/metrics", "/api/v1/metrics/"]) {
  test(`${path} is blocked by the public edge`, async () => {
    const response = await get(primary, path);
    assert.equal(response.status, 404);
  });
}
