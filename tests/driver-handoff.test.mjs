import assert from "node:assert/strict";
import test from "node:test";
import {
  DRIVER_APP_LINK_ORIGIN,
  DRIVER_APP_LINK_PATH,
  MAX_DESTINATION_UTF8_BYTES,
  MAX_DISPATCH_UTF8_BYTES,
  MAX_HANDOFF_URL_LENGTH,
  buildDriverHandoff,
} from "../app/lib/driver-handoff.ts";

test("builds an official HTTPS handoff and preserves the complete raw dispatch", () => {
  const raw = "  *55/台中市北區興進路205號 %2F A+B & 客下街口\n第二行  ";
  const destination = "台中市北區興進路205號";
  const result = buildDriverHandoff(raw, destination);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const appLink = new URL(result.appLinkUrl);
  assert.equal(appLink.origin, DRIVER_APP_LINK_ORIGIN);
  assert.equal(appLink.pathname, DRIVER_APP_LINK_PATH);
  assert.equal(appLink.search, "");
  const fragment = new URLSearchParams(appLink.hash.slice(1));
  assert.equal(fragment.get("v"), "1");
  assert.equal(fragment.get("dispatch"), raw);
  assert.equal(fragment.get("destination"), destination);
  assert.match(result.appLinkUrl, /%252F/u);
  assert.doesNotMatch(result.appLinkUrl, /%25252F/u);
  assert.ok(result.appLinkUrl.length <= MAX_HANDOFF_URL_LENGTH);

  const fallback = new URL(result.schemeFallbackUrl);
  assert.equal(fallback.protocol, "quicknav:");
  assert.equal(fallback.hostname, "dispatch");
  assert.equal(fallback.searchParams.get("dispatch"), raw);
  assert.equal(fallback.hash, "");
});

test("rejects empty and oversized handoffs without truncating them", () => {
  assert.deepEqual(buildDriverHandoff("   ", "台中站"), {
    ok: false,
    reason: "empty",
    message: "請先確認派單原文與目的地",
  });
  assert.deepEqual(buildDriverHandoff("原始\0派單", "台中站"), {
    ok: false,
    reason: "unsafe-control",
    message: "派單含有無法安全交接的控制字元",
  });

  const longDispatch = "a".repeat(MAX_DISPATCH_UTF8_BYTES + 1);
  assert.equal(
    buildDriverHandoff(longDispatch, "台中站").ok,
    false,
  );

  const longDestination = "b".repeat(MAX_DESTINATION_UTF8_BYTES + 1);
  assert.equal(
    buildDriverHandoff("原始派單", longDestination).ok,
    false,
  );

  const encodedUrlTooLong = buildDriverHandoff(
    "a".repeat(MAX_HANDOFF_URL_LENGTH),
    "台中站",
  );
  assert.deepEqual(encodedUrlTooLong, {
    ok: false,
    reason: "encoded-url-too-long",
    message: "派單內容編碼後過長，請改在司機端貼上",
  });
});
