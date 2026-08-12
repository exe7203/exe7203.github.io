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

test("keeps two-character landmark shorthand available for manual map search", () => {
  const result = parseDispatch("*TG/巨六🐟回20", "台中市");

  assert.equal(result.query, "巨六");
  assert.equal(result.status, "review");
  assert.equal(result.kind, "unknown");
  assert.equal(canQuickNavigate(result), false);
  assert.match(result.mapsUrl, /destination=%E5%B7%A8%E5%85%AD/u);
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

test("accepts the complete documented numeric star-prefix range", () => {
  const validPrefixes = [
    "*1/",
    "*1.1/",
    "*1.9/",
    "*2/",
    "*2.9/",
    "*99999/",
    "*99999.9/",
    "*0858/",
  ];

  for (const prefix of validPrefixes) {
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號`,
      "台中市",
    );
    assert.equal(result.query, "台中市北區興進路205號", prefix);
    assert.deepEqual(result.prefixes, [prefix], prefix);
    assert.equal(canQuickNavigate(result), true, prefix);
  }
});

test("rejects out-of-range or malformed numeric star-prefixes", () => {
  const invalidPrefixes = [
    "*0/",
    "*00000/",
    "*100000/",
    "*1.0/",
    "*1.10/",
    "*1./",
    "*-1/",
  ];

  for (const prefix of invalidPrefixes) {
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號`,
      "台中市",
    );
    assert.deepEqual(result.prefixes, [], prefix);
    assert.equal(result.query.startsWith(prefix), true, prefix);
    assert.equal(canQuickNavigate(result), false, prefix);
  }
});

test("supports structural dispatch codes found in the supplied samples", () => {
  const prefixes = [
    "*19@/",
    "*W23.2/",
    "*W嫣/",
    "*店ᴛ/",
    "*@/",
    "*TG/",
    "*w30/",
  ];

  for (const prefix of prefixes) {
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號🐟回20`,
      "台中市",
    );
    assert.equal(result.query, "台中市北區興進路205號", prefix);
    assert.deepEqual(result.prefixes, [prefix], prefix);
    assert.deepEqual(result.suffixes, ["🐟回20"], prefix);
    assert.equal(canQuickNavigate(result), true, prefix);
  }
});

test("supports W, W1 through W99 as unstarred head codes", () => {
  for (const code of ["W", "W1", "W6", "W99", "w30"]) {
    const prefix = `${code}/`;
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號`,
      "台中市",
    );
    assert.deepEqual(result.prefixes, [prefix], prefix);
    assert.equal(result.query, "台中市北區興進路205號", prefix);
  }

  for (const code of ["W0", "W100", "WX"]) {
    const prefix = `${code}/`;
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號`,
      "台中市",
    );
    assert.deepEqual(result.prefixes, [], prefix);
    assert.equal(result.query.startsWith(prefix), true, prefix);
  }
});

test("supports every valid minute in 12-hour-looking and 24-hour time formats", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 1) {
      const paddedHour = String(hour).padStart(2, "0");
      const paddedMinute = String(minute).padStart(2, "0");
      const timeCodes = new Set([
        `${hour}:${paddedMinute}`,
        `${paddedHour}:${paddedMinute}`,
        `${hour}.${paddedMinute}`,
        `${paddedHour}.${paddedMinute}`,
      ]);

      for (const timeCode of timeCodes) {
        const input = `*55/${timeCode}/台中市北區興進路205號`;
        const result = parseDispatch(input, "台中市");
        assert.equal(result.query, "台中市北區興進路205號", input);
        assert.deepEqual(result.prefixes, ["*55/", `${timeCode}/`], input);
        assert.equal(canQuickNavigate(result), true, input);
      }
    }
  }
});

test("removes attached time codes after known prefixes", () => {
  const cases = [
    {
      input: "*WE1/5:50崇德金麗都🐟回20",
      query: "崇德金麗都",
      prefixes: ["*WE1/", "5:50"],
    },
    {
      input: "*109/斯/04.00/海七🐟回20",
      query: "海七",
      prefixes: ["*109/", "斯/", "04.00/"],
    },
    {
      input: "*W35/霏/1.10東區建功街74號🌿回20",
      query: "台中市東區建功街74號",
      prefixes: ["*W35/", "霏/", "1.10"],
    },
  ];

  for (const sample of cases) {
    const result = parseDispatch(sample.input, "台中市");
    assert.equal(result.query, sample.query, sample.input);
    assert.deepEqual(result.prefixes, sample.prefixes, sample.input);
  }
});

test("does not remove invalid time-like text", () => {
  for (const timeCode of ["24:00", "23:60", "1:5"]) {
    const result = parseDispatch(
      `*55/${timeCode}/台中市北區興進路205號`,
      "台中市",
    );
    assert.deepEqual(result.prefixes, ["*55/"], timeCode);
    assert.equal(result.query.startsWith(`${timeCode}/`), true, timeCode);
    assert.equal(canQuickNavigate(result), false, timeCode);
  }
});

test("removes each documented emoji return suffix", () => {
  const emojis = ["🐟", "💣", "🖤", "🦈", "🐶", "🐭", "🍪", "🌿", "💛", "🍅", "🐒"];

  for (const emoji of emojis) {
    for (const ending of ["回20", "百回"]) {
      const suffix = `${emoji}${ending}`;
      const result = parseDispatch(
        `*55/台中市北區興進路205號${suffix}`,
        "台中市",
      );
      assert.equal(result.query, "台中市北區興進路205號", suffix);
      assert.deepEqual(result.suffixes, [suffix], suffix);
      assert.equal(canQuickNavigate(result), true, suffix);
    }
  }
});

test("keeps irregular customer instructions visible instead of deleting them", () => {
  const samples = [
    {
      input: "*55/台中市北區興進路205號🐭回20 +50自取",
      note: "+50自取",
    },
    {
      input: "*55/台中市北區興進路205號🐭回20 客下街口 +50自取",
      note: "客下街口 +50自取",
    },
    {
      input: "*55/台中市北區興進路205號🐭回20 無煙車",
      note: "無煙車",
    },
    {
      input: "*55/台中市北區興進路205號 後車廂空",
      note: "後車廂空",
    },
  ];

  for (const sample of samples) {
    const result = parseDispatch(sample.input, "台中市");
    assert.equal(result.query, "台中市北區興進路205號", sample.input);
    assert.equal(result.note, sample.note, sample.input);
    assert.equal(result.status, "review", sample.input);
    assert.equal(canQuickNavigate(result), false, sample.input);
  }
});

test("handles address-only samples with numeric and W head codes", () => {
  for (const prefix of ["*15720/", "*W6/"]) {
    const result = parseDispatch(
      `${prefix}北屯區陳平路117巷48弄5號`,
      "台中市",
    );
    assert.equal(result.query, "台中市北屯區陳平路117巷48弄5號", prefix);
    assert.deepEqual(result.prefixes, [prefix], prefix);
    assert.deepEqual(result.additions, ["台中市"], prefix);
    assert.equal(result.status, "review", prefix);
  }
});

test("separates a clear trailing passenger note after one door number", () => {
  const result = parseDispatch(
    "*9205/福誠路100號 大城仰雲 後門停UNIQLO坐副駕 轉街口 不要女司機",
    "台中市",
  );
  assert.equal(result.query, "福誠路100號");
  assert.equal(
    result.note,
    "大城仰雲 後門停UNIQLO坐副駕 轉街口 不要女司機",
  );
  assert.equal(result.status, "review");
  assert.equal(canQuickNavigate(result), false);
});

test("navigates a valid DMS coordinate pair and removes known metadata", () => {
  const result = parseDispatch(
    "*8926/24°10'17.6\"N 120°39'07.3\"E🐟回20",
    "台中市",
  );
  assert.equal(result.query, "24°10'17.6\"N 120°39'07.3\"E");
  assert.equal(result.kind, "coordinates");
  assert.equal(result.status, "ready");
  assert.deepEqual(result.prefixes, ["*8926/"]);
  assert.deepEqual(result.suffixes, ["🐟回20"]);
  assert.equal(canQuickNavigate(result), true);
});

test("keeps coordinate context visible for review", () => {
  const result = parseDispatch(
    "*8926/西屯 24°10′17.6″N 120°39′07.3″E🐟回20",
    "台中市",
  );
  assert.equal(result.query, "24°10′17.6″N 120°39′07.3″E");
  assert.equal(result.kind, "coordinates");
  assert.equal(result.note, "西屯");
  assert.equal(result.status, "review");
  assert.equal(canQuickNavigate(result), false);
});

test("rejects invalid or multiple DMS coordinate pairs", () => {
  const invalid = parseDispatch(
    "24°60'00.0\"N 120°39'07.3\"E",
    "台中市",
  );
  assert.equal(invalid.status, "review");
  assert.equal(canQuickNavigate(invalid), false);
  assert.match(invalid.warnings.join(" "), /座標格式超出/u);

  const multiple = parseDispatch(
    "24°10'17.6\"N 120°39'07.3\"E 24°11'00.0\"N 120°40'00.0\"E",
    "台中市",
  );
  assert.equal(multiple.status, "review");
  assert.equal(canQuickNavigate(multiple), false);
  assert.match(multiple.warnings.join(" "), /多組座標/u);
});

test("does not prepend Taichung to a different named city", () => {
  const result = parseDispatch("員林市浮圳路一段182之一號", "台中市");
  assert.equal(result.query, "員林市浮圳路一段182之一號");
  assert.deepEqual(result.additions, []);
});

test("builds an encoded Google Maps URL without an API key", () => {
  const url = buildMapsUrl("台中火車站大智北");
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/u);
  assert.match(url, /destination=%E5%8F%B0%E4%B8%AD/u);
  assert.match(url, /travelmode=driving/u);
  assert.doesNotMatch(url, /dir_action=navigate/u);
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

test("does not remove unstructured text or invalid time-like prefix text", () => {
  for (const input of [
    "UNKNOWN/台中市北區興進路205號",
    "24:00/台中市北區興進路205號",
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
