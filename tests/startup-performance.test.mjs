import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, entry, loading, shell, welcome, layout, styles, companion, cloudHook, cloud, storage, pwa, performance] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/AppEntry.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/loading.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/LoadingShell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/PublicWelcome.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/lib/useExchangeCloud.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/lib/cloud.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/PwaRegister.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/lib/performance.ts", import.meta.url), "utf8"),
]);

test("public first paint defers the private notebook bundle and cloud runtime", () => {
  assert.match(page, /<AppEntry \/>/);
  assert.doesNotMatch(page, /ExchangeCompanion/);
  assert.match(entry, /lazy\(loadExchangeCompanion\)/);
  assert.match(entry, /hasPrivateEntryQuery/);
  assert.match(entry, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(entry, /localStorage/);
  assert.match(companion, /!cloud\.authReady/);
  assert.match(cloudHook, /accountLoadGeneration/);
  assert.match(cloudHook, /isCurrentLoad/);
  assert.match(cloudHook, /writePrivateState\(repaired, remote\.revision, "system", currentSession\)/);
  assert.match(cloudHook, /const fresh = resetState\(false\)/);
  assert.match(storage, /export function resetState\(persist = true\)/);
  assert.match(cloud, /assertCurrentSession/);
  assert.match(entry, /markExchangePerformance\("boot-start"\)/);
  assert.match(cloudHook, /markExchangePerformance\("auth-ready"\)/);
  assert.match(cloudHook, /markExchangePerformance\("private-state-ready"\)/);
  assert.match(companion, /markExchangePerformance\("home-render"\)/);
  assert.match(performance, /process\.env\.NODE_ENV === "production"/);
  assert.match(pwa, /addEventListener\("load", register/);
  assert.match(pwa, /requestIdleCallback/);
  assert.match(entry, /dataset\.appEntryReady/);
  assert.match(page, /initial-loading-shell/);
  assert.match(loading, /LoadingShell/);
  assert.doesNotMatch(`${loading}\n${shell}`, /framer-motion|lucide-react|next\/image|Supabase|useExchangeCloud/);
  assert.match(layout, /preload:\s*false/);
  assert.match(layout, /dataset\.privateNotebook/);
  assert.match(layout, /initial-loading-shell/);
  assert.match(layout, /app-entry-boot-visible/);
  assert.match(layout, /env\(safe-area-inset-top\)/);
  assert.match(layout, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(layout, /localStorage\.getItem\("exchange-companion:private-cloud-sync"/);
});

test("the first loading surfaces use system typography while Noto remains available to the app", () => {
  const bodyBlock = styles.match(/body \{[\s\S]*?\n\}/)?.[0] ?? "";
  const bootHeadingBlock = styles.match(/\.boot-shell strong \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(bodyBlock, /font-family:\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont/);
  assert.match(bootHeadingBlock, /font-family:\s*inherit/);
  assert.match(layout, /Noto_Sans_TC/);
  assert.match(layout, /variable:\s*"--font-body"/);
});

test("public artwork uses right-sized direct WebP assets", () => {
  assert.match(welcome, /exchange-hero-clean-720\.webp/);
  assert.match(welcome, /journey-route-160\.webp/);
  assert.match(welcome, /ai-spark-160\.webp/);
  assert.match(welcome, /travel-suitcase-160\.webp/);
  assert.match(welcome, /sizes="\(max-width: 640px\) 70vw, \(max-width: 1024px\) 52vw, 46vw"/);
  assert.match(welcome, /unoptimized/);
  assert.match(companion, /fill priority sizes="\(max-width: 820px\) 100vw, 56vw"/);
  assert.match(styles, /exchange-mark-96\.webp/);
});
