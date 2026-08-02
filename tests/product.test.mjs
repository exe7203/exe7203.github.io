import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(html, /開始導航/u);
  assert.match(html, /貼上並導航/u);
  assert.match(html, /使用剛複製的派單文字/u);
  assert.match(html, /無法自動貼上？改用手動貼上/u);
  assert.match(html, /manifest\.webmanifest/u);
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
  assert.equal(manifest.icons.length, 2);
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
