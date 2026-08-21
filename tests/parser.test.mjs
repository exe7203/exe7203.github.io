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
  assert.equal(result.mapsMode, "directions");
  assert.equal(new URL(result.mapsUrl).pathname, "/maps/dir/");
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
  assert.equal(result.mapsMode, "directions");
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
  assert.equal(result.mapsMode, "search");
  assert.equal(canQuickNavigate(result), false);
});

test("keeps two-character landmark shorthand available for manual map search", () => {
  const result = parseDispatch("*TG/巨六🐟回20", "台中市");

  assert.equal(result.query, "巨六");
  assert.equal(result.status, "review");
  assert.equal(result.kind, "unknown");
  assert.equal(canQuickNavigate(result), false);
  assert.equal(result.mapsMode, "search");
  assert.match(result.mapsUrl, /query=%E5%B7%A8%E5%85%AD/u);
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
  assert.match(result.warnings.join(" "), /缺少縣市或行政區/u);
});

test("searches ambiguous dispatch addresses without letting directions choose a city", () => {
  const result = parseDispatch("*16/民權街1號💣回20", "台中市");
  const url = new URL(result.mapsUrl);

  assert.equal(result.query, "民權街1號");
  assert.deepEqual(result.prefixes, ["*16/"]);
  assert.deepEqual(result.suffixes, ["💣回20"]);
  assert.equal(result.kind, "address");
  assert.equal(result.status, "review");
  assert.equal(result.mapsMode, "search");
  assert.equal(url.pathname, "/maps/search/");
  assert.equal(url.searchParams.get("query"), "民權街1號");
  assert.equal(url.searchParams.has("destination"), false);
  assert.equal(url.searchParams.has("travelmode"), false);
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

test("supports the explicit unstarred fleet head-code ranges", () => {
  const validPrefixes = [
    "@1/",
    "00/",
    "配/",
    "法/",
    "安/",
    "北/",
    ...Array.from({ length: 999 }, (_, index) => `${index + 1}/`),
    ...Array.from({ length: 100 }, (_, index) => `W${index + 1}/`),
  ];

  for (const prefix of validPrefixes) {
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號`,
      "台中市",
    );
    assert.equal(result.query, "台中市北區興進路205號", prefix);
    assert.deepEqual(result.prefixes, [prefix], prefix);
    assert.equal(result.status, "ready", prefix);
    assert.equal(result.mapsMode, "directions", prefix);
    assert.equal(canQuickNavigate(result), true, prefix);
  }

  for (const prefix of [
    "0/",
    "01/",
    "000/",
    "1000/",
    "W0/",
    "W101/",
    "@2/",
    "未知/",
  ]) {
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號`,
      "台中市",
    );
    assert.deepEqual(result.prefixes, [], prefix);
    assert.equal(result.query.startsWith(prefix), true, prefix);
    assert.equal(canQuickNavigate(result), false, prefix);
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

test("supports W, W1 through W100 as unstarred head codes", () => {
  for (const code of ["W", "W1", "W6", "W99", "W100", "w30"]) {
    const prefix = `${code}/`;
    const result = parseDispatch(
      `${prefix}台中市北區興進路205號`,
      "台中市",
    );
    assert.deepEqual(result.prefixes, [prefix], prefix);
    assert.equal(result.query, "台中市北區興進路205號", prefix);
  }

  for (const code of ["W0", "W101", "WX"]) {
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

test("removes an unstarred numeric dispatch code only before a valid clock and address", () => {
  const result = parseDispatch(
    "32/ 17:20 后里區大興路202號",
    "台中市",
  );

  assert.equal(result.query, "台中市后里區大興路202號");
  assert.deepEqual(result.prefixes, ["32/", "17:20"]);
  assert.deepEqual(result.additions, ["台中市"]);
  assert.equal(result.kind, "address");
  assert.equal(result.status, "review");
  assert.equal(result.mapsMode, "directions");
  assert.equal(canQuickNavigate(result), false);
  assert.equal(
    new URL(result.mapsUrl).searchParams.get("destination"),
    "台中市后里區大興路202號",
  );
});

test("removes return-dispatch markers after an unstarred fleet code", () => {
  const cases = [
    { input: "1/回/大里新和路62號 ⬇️彰化 💚百回+20🔫50錶", marker: "回/" },
    { input: "1/回派/大里新和路62號 ⬇️彰化 💚百回+20🔫50錶", marker: "回派/" },
    { input: "1/回派 大里新和路62號 ⬇️彰化 💚百回+20🔫50錶", marker: "回派 " },
    { input: "1/回 大里新和路62號 ⬇️彰化 💚百回+20🔫50錶", marker: "回 " },
    { input: "1/回派&#x20;大里新和路62號 ⬇️彰化 💚百回+20🔫50錶", marker: "回派 " },
  ];

  for (const { input, marker } of cases) {
    const result = parseDispatch(input, "台中市");
    assert.equal(result.query, "台中市大里區新和路62號", input);
    assert.deepEqual(result.prefixes, ["1/", marker], input);
    assert.deepEqual(result.suffixes, ["💚百回+20", "🔫50錶"], input);
    assert.deepEqual(result.additions, ["台中市"], input);
    assert.equal(result.mapsMode, "directions", input);
    assert.equal(canQuickNavigate(result), false, input);
  }
});

test("does not mistake unrelated text for a return-dispatch marker", () => {
  const result = parseDispatch("1/不變", "台中市");
  assert.equal(result.query, "1/不變");
  assert.deepEqual(result.prefixes, []);
  assert.equal(result.status, "review");
});

test("removes the guarded numeric dispatch code when a known suffix follows the address", () => {
  const result = parseDispatch(
    "32/17:20 后里區大興路202號💣回20",
    "台中市",
  );

  assert.equal(result.query, "台中市后里區大興路202號");
  assert.deepEqual(result.prefixes, ["32/", "17:20"]);
  assert.deepEqual(result.suffixes, ["💣回20"]);
  assert.equal(result.status, "review");
  assert.equal(result.mapsMode, "directions");
  assert.equal(canQuickNavigate(result), false);
});

test("keeps an unstarred numeric slash when the clock or address guard is incomplete", () => {
  for (const input of [
    "32/24:00 后里區大興路202號",
    "32/25:20 后里區大興路202號",
    "32/17:20",
    "32/17:20 稍等",
    "32/17:20 台中火車站",
    "32/17:20 后里區大興路",
  ]) {
    const result = parseDispatch(input, "台中市");
    assert.deepEqual(result.prefixes, [], input);
    assert.equal(result.query, input, input);
    assert.equal(result.status, "review", input);
    assert.equal(result.mapsMode, "search", input);
    assert.equal(canQuickNavigate(result), false, input);
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

test("removes each explicit fleet suffix without adding it to the destination", () => {
  const cases = [
    {
      suffix: "💚百回+20🔫50錶",
      expected: ["💚百回+20", "🔫50錶"],
    },
    {
      suffix: "💚百回+50🔫50錶",
      expected: ["💚百回+50", "🔫50錶"],
    },
    {
      suffix: "🟢免百回 幫救🔫50錶",
      expected: ["🟢免百回 幫救", "🔫50錶"],
    },
    {
      suffix: "🔴70錶 全免回傭❗",
      expected: ["🔴70錶 全免回傭❗"],
    },
  ];

  for (const sample of cases) {
    const result = parseDispatch(
      `@1/台中市北區興進路205號 ${sample.suffix}`,
      "台中市",
    );
    assert.equal(result.query, "台中市北區興進路205號", sample.suffix);
    assert.deepEqual(result.suffixes, sample.expected, sample.suffix);
    assert.equal(result.note, null, sample.suffix);
    assert.equal(result.status, "ready", sample.suffix);
    assert.equal(canQuickNavigate(result), true, sample.suffix);
  }
});

test("parses the four supplied LINE dispatch rows", () => {
  const cases = [
    {
      input: "23:36 政 143/文心路四段823 💚百回+20🔫50錶",
      query: "文心路四段823",
      prefixes: ["143/"],
      suffixes: ["💚百回+20", "🔫50錶"],
      note: null,
      additions: [],
      mapsMode: "search",
      warning: /疑似缺少.*號/u,
    },
    {
      input: "23:36 政 1/真善美 東區東英路195號 💚百回+20🔫50錶",
      query: "台中市東區東英路195號",
      prefixes: ["1/"],
      suffixes: ["💚百回+20", "🔫50錶"],
      note: "真善美",
      additions: ["台中市"],
      mapsMode: "directions",
      warning: null,
    },
    {
      input: "23:36 政 64/北區青島東街7號 💚百回+20🔫50錶",
      query: "台中市北區青島東街7號",
      prefixes: ["64/"],
      suffixes: ["💚百回+20", "🔫50錶"],
      note: null,
      additions: ["台中市"],
      mapsMode: "directions",
      warning: null,
    },
    {
      input: "23:36 政 W5/北區青島東街7號 💚百回+20🔫50錶",
      query: "台中市北區青島東街7號",
      prefixes: ["W5/"],
      suffixes: ["💚百回+20", "🔫50錶"],
      note: null,
      additions: ["台中市"],
      mapsMode: "directions",
      warning: null,
    },
  ];

  for (const sample of cases) {
    const result = parseDispatch(sample.input, "台中市");
    assert.equal(result.query, sample.query, sample.input);
    assert.deepEqual(result.prefixes, sample.prefixes, sample.input);
    assert.deepEqual(result.suffixes, sample.suffixes, sample.input);
    assert.equal(result.note, sample.note, sample.input);
    assert.deepEqual(result.additions, sample.additions, sample.input);
    assert.equal(result.kind, "address", sample.input);
    assert.equal(result.status, "review", sample.input);
    assert.equal(result.mapsMode, sample.mapsMode, sample.input);
    assert.equal(canQuickNavigate(result), false, sample.input);
    if (sample.warning) {
      assert.match(result.warnings.join(" "), sample.warning, sample.input);
    }
  }
});

test("removes a LINE envelope before trusted landmark and alias prefixes", () => {
  const cases = [
    {
      input: "16:38 政 *75/台中火車站大智北💣回20",
      query: "台中火車站大智北",
      prefix: "*75/",
      suffixes: ["💣回20"],
      kind: "landmark",
    },
    {
      input: "16:38 政 *TG/巨六",
      query: "巨六",
      prefix: "*TG/",
      suffixes: [],
      kind: "unknown",
    },
  ];

  for (const sample of cases) {
    const result = parseDispatch(sample.input, "台中市");
    assert.equal(result.query, sample.query, sample.input);
    assert.deepEqual(result.prefixes, [sample.prefix], sample.input);
    assert.deepEqual(result.suffixes, sample.suffixes, sample.input);
    assert.equal(result.kind, sample.kind, sample.input);
    assert.equal(result.status, "review", sample.input);
    assert.equal(result.mapsMode, "search", sample.input);
    assert.equal(canQuickNavigate(result), false, sample.input);
  }
});

test("rejects LINE chat noise and recalled messages with an empty destination", () => {
  for (const input of [
    "23:36 政已收回訊息",
    "已收回訊息",
    "撤回訊息",
    "23:36 政 越大車隊",
    "23:37 政 不然車隊本身後勤會負荷不來",
  ]) {
    const result = parseDispatch(input, "台中市");
    assert.equal(result.query, "", input);
    assert.deepEqual(result.prefixes, [], input);
    assert.deepEqual(result.suffixes, [], input);
    assert.equal(result.status, "invalid", input);
    assert.equal(result.mapsMode, "search", input);
    assert.equal(canQuickNavigate(result), false, input);
  }
});

test("does not accept an invalid LINE clock or a row containing multiple addresses", () => {
  for (const input of [
    "25:20 政 64/北區青島東街7號 💚百回+20🔫50錶",
    "23:36 政 64/台中市北區興進路205號 台中市西屯區臺灣大道三段99號 💚百回+20🔫50錶",
  ]) {
    const result = parseDispatch(input, "台中市");
    assert.equal(result.status, "review", input);
    assert.equal(result.mapsMode, "search", input);
    assert.equal(canQuickNavigate(result), false, input);
  }
});

test("fails closed when pasted text contains more than one valid dispatch row", () => {
  const inputs = [
    [
      "23:36 政 64/北區青島東街7號 💚百回+20🔫50錶",
      "23:37 政 W5/北區青島東街7號 💚百回+20🔫50錶",
    ].join("\n"),
    [
      "台中市北區興進路205號 💚百回+20🔫50錶",
      "台中市西屯區臺灣大道三段99號 💚百回+20🔫50錶",
    ].join("\n"),
  ];

  for (const input of inputs) {
    const result = parseDispatch(input, "台中市");
    assert.equal(result.query, "", input);
    assert.deepEqual(result.prefixes, [], input);
    assert.deepEqual(result.suffixes, [], input);
    assert.equal(result.status, "invalid", input);
    assert.equal(result.mapsMode, "search", input);
    assert.equal(canQuickNavigate(result), false, input);
    assert.match(result.warnings.join(" "), /一次貼上一筆/u, input);
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
  assert.equal(result.mapsMode, "directions");
  assert.equal(new URL(result.mapsUrl).pathname, "/maps/dir/");
  assert.deepEqual(result.prefixes, ["*8926/"]);
  assert.deepEqual(result.suffixes, ["🐟回20"]);
  assert.equal(canQuickNavigate(result), true);
});

test("parses the second fleet direct-fare coordinate payload", () => {
  const result = parseDispatch(
    "1/苗栗(24.3718263, 120.9674298) 直1500 💚百回+20🔫50錶",
    "台中市",
  );

  assert.equal(result.query, "24.3718263,120.9674298");
  assert.equal(result.kind, "coordinates");
  assert.equal(result.status, "review");
  assert.deepEqual(result.prefixes, ["1/"]);
  assert.deepEqual(result.suffixes, ["💚百回+20", "🔫50錶"]);
  assert.equal(result.note, "苗栗；直1500");
  assert.deepEqual(result.additions, []);
  assert.match(result.warnings.join(" "), /備註/u);
  assert.equal(result.mapsMode, "directions");
  assert.equal(
    new URL(result.mapsUrl).searchParams.get("destination"),
    "24.3718263,120.9674298",
  );
  assert.equal(canQuickNavigate(result), false);
});

test("parses the second fleet highway coordinate payload", () => {
  const result = parseDispatch(
    "154/霧峰(24.0229133, 120.6793830)走國道⬇️太平 💚百回+20🔫50錶",
    "台中市",
  );

  assert.equal(result.query, "24.0229133,120.6793830");
  assert.equal(result.kind, "coordinates");
  assert.equal(result.status, "review");
  assert.deepEqual(result.prefixes, ["154/"]);
  assert.deepEqual(result.suffixes, ["💚百回+20", "🔫50錶"]);
  assert.equal(result.note, "霧峰；走國道⬇️太平");
  assert.deepEqual(result.additions, []);
  assert.match(result.warnings.join(" "), /備註/u);
  assert.equal(result.mapsMode, "directions");
  assert.equal(
    new URL(result.mapsUrl).searchParams.get("destination"),
    "24.0229133,120.6793830",
  );
  assert.equal(canQuickNavigate(result), false);
});

test("keeps a normalized decimal coordinate navigable when loaded from history", () => {
  for (const coordinate of [
    "24.3718263,120.9674298",
    "24.0229133,120.6793830",
  ]) {
    const result = parseDispatch(coordinate, "台中市");
    assert.equal(result.query, coordinate);
    assert.equal(result.kind, "coordinates");
    assert.equal(result.status, "ready");
    assert.equal(result.mapsMode, "directions");
    assert.equal(canQuickNavigate(result), true);
  }

  assert.equal(
    new URL(buildMapsUrl("(24.0229133, 120.6793830)")).pathname,
    "/maps/dir/",
  );
});

test("does not treat an ordinary numeric slash as a second-fleet prefix", () => {
  const ordinaryAddress = parseDispatch("1/2巷3號", "台中市");
  assert.deepEqual(ordinaryAddress.prefixes, []);
  assert.equal(ordinaryAddress.query, "1/2巷3號");
  assert.equal(canQuickNavigate(ordinaryAddress), false);

  const addressWithCoordinateNote = parseDispatch(
    "1/2巷3號 (24.3718263, 120.9674298)",
    "台中市",
  );
  assert.deepEqual(addressWithCoordinateNote.prefixes, []);
  assert.equal(addressWithCoordinateNote.query, "1/2巷3號");
  assert.equal(
    addressWithCoordinateNote.note,
    "24.3718263, 120.9674298",
  );
  assert.equal(canQuickNavigate(addressWithCoordinateNote), false);

  const repeatedNumericSlash = parseDispatch(
    "1/2/苗栗(24.3718263, 120.9674298)",
    "台中市",
  );
  assert.deepEqual(repeatedNumericSlash.prefixes, []);
  assert.equal(repeatedNumericSlash.query, "24.3718263,120.9674298");
  assert.equal(repeatedNumericSlash.note?.startsWith("1/2/苗栗"), true);
  assert.equal(canQuickNavigate(repeatedNumericSlash), false);
});

test("rejects multiple, out-of-bounds, or swapped decimal coordinates", () => {
  const multiple = parseDispatch(
    "1/苗栗(24.3718263, 120.9674298) (24.0229133, 120.6793830)",
    "台中市",
  );
  assert.deepEqual(multiple.prefixes, []);
  assert.equal(multiple.mapsMode, "search");
  assert.equal(canQuickNavigate(multiple), false);
  assert.match(multiple.warnings.join(" "), /多組座標/u);

  for (const input of [
    "1/苗栗(91.0001, 120.9674298)",
    "1/苗栗(120.9674298, 24.3718263)",
  ]) {
    const result = parseDispatch(input, "台中市");
    assert.deepEqual(result.prefixes, [], input);
    assert.equal(result.mapsMode, "search", input);
    assert.equal(canQuickNavigate(result), false, input);
    assert.match(result.warnings.join(" "), /座標格式超出/u, input);
  }
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

test("builds Google Maps search for ambiguous text and directions for a full address", () => {
  const searchUrl = new URL(buildMapsUrl("台中火車站大智北"));
  assert.equal(searchUrl.pathname, "/maps/search/");
  assert.equal(searchUrl.searchParams.get("query"), "台中火車站大智北");
  assert.equal(searchUrl.searchParams.has("destination"), false);
  assert.equal(searchUrl.searchParams.has("key"), false);

  const directionsUrl = new URL(buildMapsUrl("台中市北區興進路205號"));
  assert.equal(directionsUrl.pathname, "/maps/dir/");
  assert.equal(
    directionsUrl.searchParams.get("destination"),
    "台中市北區興進路205號",
  );
  assert.equal(directionsUrl.searchParams.get("travelmode"), "driving");
  assert.equal(directionsUrl.searchParams.has("dir_action"), false);
  assert.equal(directionsUrl.searchParams.has("key"), false);
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
