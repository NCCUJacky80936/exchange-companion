import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CloudAuthStartupTimeoutError,
  shouldApplyCloudAuthEvent,
  shouldApplyCloudAuthStartupResult,
  withCloudAuthStartupTimeout,
} from "../app/lib/cloud";

test("cloud auth startup timeout resolves successful work unchanged", async () => {
  assert.equal(await withCloudAuthStartupTimeout(Promise.resolve("session"), 50), "session");
});

test("cloud auth startup timeout bounds a stalled client or session lookup", async () => {
  const stalled = new Promise<never>(() => undefined);
  await assert.rejects(
    withCloudAuthStartupTimeout(stalled, 5),
    (error) => error instanceof CloudAuthStartupTimeoutError && error.message === "cloud_auth_startup_timeout",
  );
});

test("normal startup restores only an existing session while share startup may create an anonymous session", async () => {
  const hook = await readFile(new URL("../app/lib/useExchangeCloud.ts", import.meta.url), "utf8");
  assert.match(hook, /hasShareToken \? ensureCloudSession\(\) : getExistingCloudSession\(\)/);
  assert.match(hook, /authError: "timeout" \| "unavailable" \| null/);
  assert.match(hook, /retryAuth: \(\) => void/);
});

test("auth coordination ignores failed initial null events but accepts later recovery", () => {
  assert.equal(shouldApplyCloudAuthEvent("INITIAL_SESSION", null), false);
  assert.equal(shouldApplyCloudAuthEvent("SIGNED_OUT", null), true);
  assert.equal(shouldApplyCloudAuthEvent("SIGNED_IN", { user: { id: "user-1" } } as never), true);
});

test("a stale startup lookup cannot overwrite a newer attempt or auth event", () => {
  assert.equal(shouldApplyCloudAuthStartupResult(2, 2, 4, 4), true);
  assert.equal(shouldApplyCloudAuthStartupResult(1, 2, 4, 4), false);
  assert.equal(shouldApplyCloudAuthStartupResult(2, 2, 4, 5), false);
});
