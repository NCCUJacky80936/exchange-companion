import assert from "node:assert/strict";
import test from "node:test";

import { resolvePublicBaseUrl } from "../app/lib/public-site";
import { allowedCorsOrigins, corsHeadersForRequest, readJsonBodyWithLimit } from "../supabase/functions/_shared/http";

test("allows only exact configured browser origins while preserving server-to-server access", () => {
  const allowedOrigins = allowedCorsOrigins(
    "https://exchange.example/",
    "https://preview.example, http://localhost:3000, javascript:alert(1)",
  );
  const allowed = corsHeadersForRequest(new Request("https://api.example/", {
    headers: { Origin: "https://exchange.example" },
  }), allowedOrigins);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://exchange.example");

  const lookalike = corsHeadersForRequest(new Request("https://api.example/", {
    headers: { Origin: "https://exchange.example.attacker.invalid" },
  }), allowedOrigins);
  assert.equal(lookalike.allowed, false);
  assert.equal(lookalike.headers.get("Access-Control-Allow-Origin"), null);

  const serverRequest = corsHeadersForRequest(new Request("https://api.example/"), allowedOrigins);
  assert.equal(serverRequest.allowed, true);
  assert.equal(serverRequest.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects oversized, malformed, or incorrectly typed JSON before parsing", async () => {
  const valid = new Request("https://api.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readJsonBodyWithLimit(valid, 128), { ok: true });

  const oversized = new Request("https://api.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(128) }),
  });
  await assert.rejects(readJsonBodyWithLimit(oversized, 64), /body_too_large/);

  const wrongType = new Request("https://api.example/", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  await assert.rejects(readJsonBodyWithLimit(wrongType), /unsupported_media_type/);

  let streamCancelled = false;
  let pullCount = 0;
  const chunked = new Request("https://api.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream({
      pull(controller) {
        pullCount += 1;
        if (pullCount <= 20) controller.enqueue(new Uint8Array(32));
        else controller.close();
      },
      cancel() {
        streamCancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(readJsonBodyWithLimit(chunked, 64), /body_too_large/);
  assert.equal(streamCancelled, true);
});

test("does not trust an arbitrary Host header for canonical metadata", () => {
  assert.equal(resolvePublicBaseUrl({ forwardedHost: "planner.chatgpt.site", forwardedProto: "https" }).origin, "https://planner.chatgpt.site");
  assert.equal(resolvePublicBaseUrl({ forwardedHost: "planner.chatgpt.site.attacker.invalid", forwardedProto: "https" }).origin, "http://localhost:3000");
  assert.equal(resolvePublicBaseUrl({ forwardedHost: "evil.invalid/path", forwardedProto: "https" }).origin, "http://localhost:3000");
  assert.equal(resolvePublicBaseUrl({ forwardedHost: "localhost:99999", forwardedProto: "http" }).origin, "http://localhost:3000");
  assert.equal(resolvePublicBaseUrl({ configuredUrl: "https://exchange.example/app", forwardedHost: "evil.invalid" }).toString(), "https://exchange.example/");
});
