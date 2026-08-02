import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMapsUrl,
  canQuickNavigate,
  parseDispatch,
} from "../app/lib/parse-dispatch.ts";

test("parses a complete address with multiple prefix parameters", () => {
  const result = parseDispatch(
    "*55/私/17.20/台中市北區興進路205號💣回20",
    "台中市",
  );

  assert.equal(result.query, "台中市北區興進路205號");
  assert.equal(result.status, "ready");
  assert.equal(result.kind, "address");
  assert.deepEqual(result.prefixes, ["*55/", "私/", "17.20/"]);
  assert.deepEqual(result.suffixes, ["💣回20"]);
  assert.deepEqual(result.warnings, []);
  assert.equal(canQuickNavigate(result), true);
});

test("keeps a note, warns about an open parenthesis, and visibly adds the default city", () => {
  const result = parseDispatch(
    "*BB/中區光復路13號（共乘車站💣回20",
    "台中市",
  );

  assert.equal(result.query, "台中市中區光復路13號");
  assert.equal(result.status, "review");
  assert.equal(result.note, "共乘車站");
  assert.deepEqual(result.additions, ["台中市"]);
  assert.deepEqual(result.prefixes, ["*BB/"]);
  assert.deepEqual(result.suffixes, ["💣回20"]);
  assert.match(result.warnings.join(" "), /括號未閉合/u);
  assert.equal(canQuickNavigate(result), false);
});

test("preserves landmark direction text without inventing a street name", () => {
  const result = parseDispatch(
    "*75/台中火車站大智北💣回20",
    "台中市",
  );

  assert.equal(result.query, "台中火車站大智北");
  assert.equal(result.kind, "landmark");
  assert.equal(result.status, "review");
  assert.match(result.warnings.join(" "), /地標／方位描述/u);
  assert.equal(canQuickNavigate(result), false);
});

test("does not add a city unless the setting is enabled", () => {
  const result = parseDispatch("*BB/中區光復路13號💣回20", "");
  assert.equal(result.query, "中區光復路13號");
  assert.deepEqual(result.additions, []);
  assert.equal(canQuickNavigate(result), false);
});

test("does not quick-navigate a door number without city and district context", () => {
  const result = parseDispatch("興進路205號", "台中市");
  assert.equal(result.kind, "address");
  assert.equal(result.status, "review");
  assert.equal(canQuickNavigate(result), false);
  assert.match(result.warnings.join(" "), /缺少明確縣市/u);
});

test("does not quick-navigate an address with no road or locality name", () => {
  const result = parseDispatch("台中市北區205號", "台中市");
  assert.equal(result.kind, "address");
  assert.equal(result.status, "review");
  assert.equal(canQuickNavigate(result), false);
});

test("supports known repeated suffix formats only at the end", () => {
  const result = parseDispatch(
    "77/台中市西屯區臺灣大道三段99號🐟回20🖤回20🐭回20",
    "台中市",
  );
  assert.equal(result.query, "台中市西屯區臺灣大道三段99號");
  assert.deepEqual(result.suffixes, ["🐟回20", "🖤回20", "🐭回20"]);
});

test("supports the documented prefix and signed return-fee formats", () => {
  const cases = ["77/", "1@/", "*WN@/", "W5/"];

  for (const prefix of cases) {
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號百回+20`,
      "台中市",
    );
    assert.equal(result.query, "台中市北區興進路205號");
    assert.deepEqual(result.prefixes, [prefix]);
    assert.deepEqual(result.suffixes, ["百回+20"]);
    assert.equal(canQuickNavigate(result), true);
  }
});

test("builds an encoded Google Maps URL without an API key", () => {
  const url = buildMapsUrl("台中火車站大智北");
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/u);
  assert.match(url, /destination=%E5%8F%B0%E4%B8%AD/u);
  assert.match(url, /travelmode=driving/u);
  assert.doesNotMatch(url, /key=/u);
});

test("never quick-navigates text containing two possible addresses", () => {
  const result = parseDispatch(
    "台中市北區興進路205號 台中市西屯區臺灣大道三段99號",
    "台中市",
  );
  assert.equal(result.status, "review");
  assert.equal(canQuickNavigate(result), false);
  assert.match(result.warnings.join(" "), /多個可能地址/u);
});

test("never quick-navigates an address followed by another number marked as 號", () => {
  const result = parseDispatch(
    "台中市北區興進路205號 車號123號",
    "台中市",
  );
  assert.equal(result.status, "review");
  assert.equal(canQuickNavigate(result), false);
  assert.match(result.warnings.join(" "), /多個可能地址/u);
});

test("keeps a destination note visible before navigation", () => {
  const result = parseDispatch(
    "台中市北區興進路205號（請停後門）",
    "台中市",
  );
  assert.equal(result.query, "台中市北區興進路205號");
  assert.equal(result.note, "請停後門");
  assert.equal(result.status, "review");
  assert.equal(canQuickNavigate(result), false);
});

test("does not remove unknown or timestamp-like prefix text", () => {
  for (const input of [
    "*UNKNOWN/台中市北區興進路205號",
    "09:34/台中市北區興進路205號",
  ]) {
    const result = parseDispatch(input, "台中市");
    assert.deepEqual(result.prefixes, []);
    assert.equal(result.status, "review");
    assert.equal(canQuickNavigate(result), false);
  }
});

test("does not partially remove an unknown joined emoji suffix", () => {
  const input = "台中市北區興進路205號👨‍👩‍👧‍👦回20";
  const result = parseDispatch(input, "台中市");
  assert.equal(result.query, input);
  assert.deepEqual(result.suffixes, []);
  assert.equal(canQuickNavigate(result), false);
});
