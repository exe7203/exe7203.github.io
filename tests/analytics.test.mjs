import assert from "node:assert/strict";
import test from "node:test";
import {
  GA_MEASUREMENT_ID,
  GA_ORIGIN,
  createGtagQueue,
  getLaunchMode,
  isAnalyticsEnabled,
  queueAnalyticsInitialization,
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

test("queued GA4 initialization and custom events use Google's Arguments shape", () => {
  const dataLayer = [];

  withMockWindow(
    {
      location: { origin: GA_ORIGIN },
      matchMedia: () => ({ matches: false }),
      navigator: {},
      dataLayer,
      gtag: createGtagQueue(dataLayer),
    },
    () => {
      queueAnalyticsInitialization(window.gtag);
      trackAnalyticsEvent({
        name: "dispatch_paste_click",
        params: { launch_mode: "browser" },
      });
    },
  );

  assert.equal(dataLayer.length, 3);
  for (const command of dataLayer) {
    assert.equal(Object.prototype.toString.call(command), "[object Arguments]");
    assert.equal(Array.isArray(command), false);
  }

  const [jsCommand, configCommand, eventCommand] = dataLayer.map((command) =>
    Array.from(command),
  );
  assert.equal(jsCommand[0], "js");
  assert.ok(jsCommand[1] instanceof Date);
  assert.deepEqual(configCommand, [
    "config",
    GA_MEASUREMENT_ID,
    {
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
      ignore_referrer: true,
      page_location: `${GA_ORIGIN}/`,
      page_title: "快導",
      send_page_view: true,
    },
  ]);
  assert.deepEqual(eventCommand, [
    "event",
    "dispatch_paste_click",
    { launch_mode: "browser" },
  ]);
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

test("automatic map opening is recorded without destination content", () => {
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
        name: "maps_open_click",
        params: {
          entry_point: "auto_paste",
          launch_mode: "browser",
          maps_mode: "directions",
          parse_status: "review",
          query_kind: "address",
        },
      });
    },
  );

  assert.deepEqual(calls, [
    [
      "event",
      "maps_open_click",
      {
        entry_point: "auto_paste",
        launch_mode: "browser",
        maps_mode: "directions",
        parse_status: "review",
        query_kind: "address",
      },
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /地址|座標|maps\/dir|maps\/search/iu);
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
