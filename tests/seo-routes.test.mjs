import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function render(path) {
  return worker.fetch(
    new Request(`https://exchange-companion.example${path}`, {
      headers: {
        "x-forwarded-host": "exchange-companion.example",
        "x-forwarded-proto": "https",
      },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("publishes a search-crawler policy without opting into model training", async () => {
  const response = await render("/robots.txt");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/i);
  const body = await response.text();
  assert.match(body, /User-Agent: OAI-SearchBot/i);
  assert.match(body, /User-Agent: ChatGPT-User/i);
  assert.match(body, /User-Agent: GPTBot[\s\S]*Disallow: \//i);
  assert.match(body, /Sitemap: https:\/\/exchange-companion\.example\/sitemap\.xml/i);
});

test("publishes only the public landing page in the sitemap", async () => {
  const response = await render("/sitemap.xml");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/xml/i);
  const body = await response.text();
  assert.match(body, /<loc>https:\/\/exchange-companion\.example\/?<\/loc>/i);
  assert.equal((body.match(/<url>/g) ?? []).length, 1);
  assert.doesNotMatch(body, /share|auth|resources/i);
});
