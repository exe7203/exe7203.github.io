import assert from "node:assert/strict";
import test from "node:test";
import {
  GA_MEASUREMENT_ID,
  GA_ORIGIN,
  getLaunchMode,
  isAnalyticsEnabled,
  trackAnalyticsEvent,
} from "../app/lib/analytics.ts";

function withMockWindow(mockWindow, callback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });

  try {
    return callback();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "window", previous);
    } else {
      delete globalThis.window;
    }
  }
}

test("GA4 is tied to the exact formal QuickNav origin and a valid measurement ID", () => {
  assert.equal(GA_ORIGIN, "https://exe7203.github.io");
  assert.match(GA_MEASUREMENT_ID, /^G-[A-Z0-9]{10}$/u);
  assert.equal(isAnalyticsEnabled(), false);
});

test("local previews and blocked analytics remain no-op", () => {
  const calls = [];
  withMockWindow(
    {
      location: { origin: "http://127.0.0.1:8123" },
      matchMedia: () => ({ matches: false }),
      navigator: {},
      gtag: (...args) => calls.push(args),
    },
    () => {
      assert.equal(isAnalyticsEnabled(), false);
      assert.doesNotThrow(() =>
        trackAnalyticsEvent({
          name: "dispatch_paste_click",
          params: { launch_mode: "browser" },
        }),
      );
    },
  );

  assert.deepEqual(calls, []);

  withMockWindow(
    {
      location: { origin: "http://exe7203.github.io" },
      matchMedia: () => ({ matches: false }),
      navigator: {},
      gtag: (...args) => calls.push(args),
    },
    () => {
      assert.equal(isAnalyticsEnabled(), false);
      trackAnalyticsEvent({
        name: "dispatch_paste_click",
        params: { launch_mode: "browser" },
      });
    },
  );

  assert.deepEqual(calls, []);

  withMockWindow(
    {
      location: { origin: GA_ORIGIN },
      matchMedia: () => ({ matches: false }),
      navigator: {},
    },
    () => {
      assert.doesNotThrow(() =>
        trackAnalyticsEvent({
          name: "dispatch_paste_click",
          params: { launch_mode: "browser" },
        }),
      );
    },
  );
});

test("formal-site events only contain low-cardinality usage fields", () => {
  const calls = [];
  withMockWindow(
    {
      location: { origin: GA_ORIGIN },
      matchMedia: () => ({ matches: false }),
      navigator: {},
      gtag: (...args) => calls.push(args),
    },
    () => {
      trackAnalyticsEvent({
        name: "dispatch_parse_result",
        params: {
          parse_source: "clipboard",
          parse_status: "review",
          query_kind: "address",
          maps_mode: "search",
        },
      });
    },
  );

  assert.deepEqual(calls, [
    [
      "event",
      "dispatch_parse_result",
      {
        parse_source: "clipboard",
        parse_status: "review",
        query_kind: "address",
        maps_mode: "search",
      },
    ],
  ]);

  const serialized = JSON.stringify(calls);
  assert.doesNotMatch(
    serialized,
    /派單|地址|座標|民權街|24\.\d+|maps\/dir|maps\/search/iu,
  );
});

test("standalone launch detection uses browser display signals", () => {
  withMockWindow(
    {
      location: { origin: GA_ORIGIN },
      matchMedia: () => ({ matches: true }),
      navigator: {},
    },
    () => assert.equal(getLaunchMode(), "standalone"),
  );

  withMockWindow(
    {
      location: { origin: GA_ORIGIN },
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    },
    () => assert.equal(getLaunchMode(), "standalone"),
  );

  withMockWindow(
    {
      location: { origin: GA_ORIGIN },
      matchMedia: () => ({ matches: false }),
      navigator: {},
    },
    () => assert.equal(getLaunchMode(), "browser"),
  );
});
