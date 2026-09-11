import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://notebook.example";
const shell = () => new Response('<html><meta name="exchange-public-shell" content="1"><body>public launch</body></html>', { headers: { "Content-Type": "text/html" } });
function worker(fetch) {
  const handlers = {};
  const stores = new Map();
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    const key = (request) => typeof request === "string" ? request : request.url;
    return {
      addAll: async () => {},
      put: async (request, response) => store.set(key(request), response.clone()),
      match: async (request) => store.get(key(request))?.clone(),
    };
  };
  const context = vm.createContext({
    URL, Request, Response, setTimeout, clearTimeout, fetch,
    self: { location: { origin }, addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, registration: {} },
    caches: { open: async (name) => cacheFor(name), keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name), match: async (request) => {
      for (const name of stores.keys()) { const found = await cacheFor(name).match(request); if (found) return found; }
    } },
  });
  vm.runInContext(source, context);
  const event = async (name, fields = {}) => {
    let response;
    const jobs = [];
    handlers[name]({ ...fields, waitUntil: (job) => jobs.push(job), respondWith: (job) => { response = job; } });
    const result = await response;
    await Promise.all(jobs);
    return result;
  };
  return { event, context, cacheFor, stores };
}
const navigation = (path = "/") => ({ method: "GET", url: `${origin}${path}`, mode: "navigate" });

test("only the marked public root HTML can become a launch shell", async () => {
  const w = worker(async () => shell());
  const cache = w.cacheFor("test");
  const rejected = [new Response("login", { headers: { "Content-Type": "text/html" } }), new Response("error", { status: 503 }), new Response('{"private":true}', { headers: { "Content-Type": "application/json" } })];
  const redirected = shell();
  Object.defineProperty(redirected, "redirected", { value: true });
  rejected.push(redirected);
  for (const response of rejected) assert.equal(await w.context.cachePublicShell(cache, response), false);
  assert.equal(await cache.match("/__offline-notebook-shell__"), undefined);
  assert.equal(await w.context.cachePublicShell(cache, shell()), true);
});

test("failed navigation preload falls back to fetch and a 503 uses the public shell", async () => {
  let failing = false;
  let requests = 0;
  const w = worker(async () => { requests++; return failing ? new Response("unavailable", { status: 503 }) : shell(); });
  await w.event("install");
  failing = true;
  const response = await w.event("fetch", { request: navigation(), preloadResponse: Promise.reject(new Error("preload unavailable")) });
  assert.equal(requests, 2);
  assert.match(await response.text(), /public launch/);
});

test("share query navigation cannot overwrite the generic launch shell", async () => {
  const w = worker(async () => new Response("share callback", { headers: { "Content-Type": "text/html" } }));
  await w.context.cachePublicShell(w.cacheFor("exchange-companion-v2-12"), shell());
  await w.event("fetch", { request: navigation("/?share=private-token"), preloadResponse: undefined });
  assert.match(await (await w.cacheFor("exchange-companion-v2-12").match("/__offline-notebook-shell__")).text(), /public launch/);
});

test("activation preserves previous hashed assets and unrelated caches", async () => {
  const w = worker(async () => shell());
  w.cacheFor("another-app"); w.cacheFor("exchange-companion-v2-10"); w.cacheFor("exchange-companion-v2-11");
  await w.event("install"); await w.event("activate");
  assert.deepEqual([...w.stores.keys()], ["another-app", "exchange-companion-v2-11", "exchange-companion-v2-12"]);
});

test("deliberate fresh reload and authentication routes bypass shell fallback", async () => {
  const requests = [];
  const w = worker(async (request) => { requests.push(request); return new Response("fresh"); });
  for (const path of ["/?__fresh=1&share=keep", "/callback?code=keep"]) {
    const request = new Request(`${origin}${path}`);
    Object.defineProperty(request, "mode", { value: "navigate" });
    const response = await w.event("fetch", { request });
    assert.equal(await response.text(), "fresh");
  }
  assert.ok(requests.every((request) => request.cache === "reload"));
  assert.match(requests[0].url, /share=keep/);
});
