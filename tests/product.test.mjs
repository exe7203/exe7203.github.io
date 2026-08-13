import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Script } from "node:vm";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the production navigation assistant with an empty start state", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/iu);

  const html = await response.text();
  assert.match(html, /<title>快導｜派單文字導航助手<\/title>/u);
  assert.match(html, /貼上派單/u);
  assert.match(html, /一鍵貼上解析/u);
  assert.match(html, /複製派單文字後，按右下角「貼」/u);
  assert.match(html, /本機處理/u);
  assert.match(html, /按一次就讀取剛複製的派單文字/u);
  assert.match(html, /manifest\.webmanifest/u);
  assert.doesNotMatch(
    html,
    /手動貼上派單文字|司機端開始跳錶|確認後再開始導航/u,
  );
  assert.doesNotMatch(
    html,
    /codex-preview|react-loading-skeleton|直接測試這三種格式|第一版測試工具|已載入第一筆範例|台中市北區興進路205號/u,
  );
});

test("manifest uses standalone mode and a private POST share target", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  );

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.share_target.method, "POST");
  assert.equal(manifest.share_target.params.text, "text");
  assert.equal(manifest.background_color, "#090a0c");
  assert.equal(manifest.theme_color, "#090a0c");
  assert.equal(manifest.icons.length, 2);
});

test("the interface uses the compact silver-black visual system", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(styles, /--canvas: #090a0c/u);
  assert.match(styles, /color-scheme: dark/u);
  assert.match(styles, /linear-gradient\(145deg, #f5f6f7/u);
  assert.doesNotMatch(pageSource, /header-copy|quick-safety|<footer>/u);
});

test("share-target text is one-time and expires from local cache", async () => {
  const serviceWorker = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );

  assert.match(serviceWorker, /SHARE_MAX_AGE_MS = 5 \* 60 \* 1000/u);
  assert.match(serviceWorker, /storedAt: Date\.now\(\)/u);
  assert.match(serviceWorker, /await cache\.delete\(key\)/u);
  assert.match(serviceWorker, /deleteStaleSharedText/u);
});

test("the first online visit asks the service worker to warm same-origin app assets", async () => {
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const serviceWorker = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /warmAppResources\(readyRegistration\)/u);
  assert.match(pageSource, /type: "CACHE_APP_ASSETS"/u);
  assert.match(serviceWorker, /cacheAppAssets\(event\.data\.urls\)/u);
  assert.match(serviceWorker, /url\?\.origin === self\.location\.origin/u);
  assert.match(serviceWorker, /Promise\.allSettled/u);
});

test("pasted destinations are kept locally after the current input is cleared", async () => {
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const historySource = await readFile(
    new URL("../app/lib/address-history.ts", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /rememberAddress\(parsed\)/u);
  assert.match(pageSource, /已清除目前內容；最近地址仍保留/u);
  assert.match(pageSource, /最近地址/u);
  assert.match(pageSource, /href=\{buildMapsUrl\(entry\.address\)\}/u);
  assert.match(pageSource, /target="_blank"/u);
  assert.match(historySource, /quicknav-address-history-v1/u);
  assert.doesNotMatch(historySource, /raw:/u);
});

test("one button reads and parses the clipboard while manual input stays an error fallback", async () => {
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /const text = await readClipboardText\(\)/u);
  assert.match(pageSource, /const parsed = parseText\(text\)/u);
  assert.match(pageSource, /setShowManualInput\(true\)/u);
  assert.match(pageSource, /瀏覽器沒有授權一鍵貼上/u);
  assert.doesNotMatch(pageSource, /manualPasteShouldNavigate/u);
});

test("ambiguous destinations search for similar places while full addresses keep directions", async () => {
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /result\.mapsMode === "search"/u);
  assert.match(pageSource, /查看相似地點/u);
  assert.match(pageSource, /查看路線/u);
  assert.match(pageSource, /mapsMode: getMapsMode\(value\)/u);
  assert.doesNotMatch(pageSource, /只在 Google Maps 顯示路線/u);
});

test("the driver-app handoff remains available in source while its home-page block is hidden", async () => {
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const handoffSource = await readFile(
    new URL("../app/lib/driver-handoff.ts", import.meta.url),
    "utf8",
  );

  assert.match(handoffSource, /https:\/\/exe7203\.github\.io/u);
  assert.match(handoffSource, /\/driver\/dispatch/u);
  assert.doesNotMatch(pageSource, /buildDriverHandoff|開啟司機端開始跳錶/u);
  assert.doesNotMatch(pageSource, /window\.location\.assign/u);
});

test("the App Link browser fallback remains useful without the driver app", async () => {
  const fallback = await readFile(
    new URL("../public/driver/dispatch/index.html", import.meta.url),
    "utf8",
  );

  assert.match(fallback, /再試一次開啟司機端/u);
  assert.match(fallback, /改用 Google Maps 查看路線/u);
  assert.match(fallback, /返回快導重新確認/u);
  assert.match(fallback, /如果仍停在此頁/u);
  assert.match(fallback, /window\.location\.hash/u);
  assert.match(fallback, /fragmentParams/u);
  assert.match(fallback, /legacyQueryParams/u);
  assert.match(fallback, /MAX_HANDOFF_URL_LENGTH = 2048/u);
  assert.match(fallback, /不會隨此頁的 HTTP 請求送到網站伺服器/u);
  assert.match(fallback, /getAll\("dispatch"\)/u);
  assert.match(fallback, /handoffLocked/u);
  const inlineScript = fallback.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Script(inlineScript));
});
