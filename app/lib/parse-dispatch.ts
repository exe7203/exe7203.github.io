export type ParseStatus = "ready" | "review" | "invalid";
export type QueryKind = "address" | "landmark" | "unknown";

export interface ParsedDispatch {
  raw: string;
  query: string;
  status: ParseStatus;
  kind: QueryKind;
  prefixes: string[];
  suffixes: string[];
  note: string | null;
  additions: string[];
  warnings: string[];
  mapsUrl: string;
}

const literalPrefixCodes = new Set([
  "私",
  "77",
  "1@",
  "W5",
  "*55",
  "*BB",
  "*75",
  "*WN@",
  "17.20",
]);
const cityOrCounty =
  /^(?:基隆|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)(?:縣|市)/u;
const districtStart = /^[\p{Script=Han}]{1,3}(?:區|鄉|鎮|市)/u;
const completeDoorNumber = /\d+(?:之\d+)?號(?:\d+樓)?$/u;
const fullQuickAddress =
  /^(?:基隆|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)(?:縣|市)[\p{Script=Han}]{1,3}(?:區|鄉|鎮|市).*(?:路|街|道|段|巷|弄|村|里|鄰).*\d+(?:之\d+)?號(?:\d+樓)?$/u;
const cityOrCountyAnywhere =
  /(?:基隆|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)(?:縣|市)/gu;
const doorNumberAnywhere = /\d+(?:之\d+)?號/gu;
const landmarkWords =
  /(車站|高鐵|捷運|機場|醫院|診所|飯店|旅館|公園|學校|大學|百貨|市場|門市|超商)/u;
const suffixAtEnd = /((?:百|🐟|🖤|🐭|💣)回[+-]?\d+)\s*$/u;

function isKnownPrefix(segment: string): boolean {
  return literalPrefixCodes.has(segment);
}

function peelPrefixes(input: string): {
  remaining: string;
  prefixes: string[];
} {
  let remaining = input;
  const prefixes: string[] = [];

  while (remaining.includes("/")) {
    const slash = remaining.indexOf("/");
    const segment = remaining.slice(0, slash).trim();
    if (!segment || !isKnownPrefix(segment)) break;
    prefixes.push(`${segment}/`);
    remaining = remaining.slice(slash + 1).trimStart();
  }

  return { remaining, prefixes };
}

function peelSuffixes(input: string): {
  remaining: string;
  suffixes: string[];
} {
  let remaining = input;
  const suffixes: string[] = [];

  while (true) {
    const match = remaining.match(suffixAtEnd);
    if (!match || match.index === undefined) break;
    suffixes.unshift(match[1]);
    remaining = remaining.slice(0, match.index).trimEnd();
  }

  return { remaining, suffixes };
}

function splitTrailingNote(input: string): {
  remaining: string;
  note: string | null;
  unclosed: boolean;
} {
  const match = input.match(/([（(])([^）)]*)([）)])?$/u);
  if (!match || match.index === undefined) {
    return { remaining: input, note: null, unclosed: false };
  }

  const before = input.slice(0, match.index).trimEnd();
  if (!completeDoorNumber.test(before)) {
    return { remaining: input, note: null, unclosed: false };
  }

  return {
    remaining: before,
    note: match[2].trim() || null,
    unclosed: !match[3],
  };
}

export function buildMapsUrl(query: string): string {
  const destination = encodeURIComponent(query.trim());
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving&dir_action=navigate`;
}

export function canQuickNavigate(result: ParsedDispatch): boolean {
  return (
    result.status === "ready" &&
    result.kind === "address" &&
    result.warnings.length === 0 &&
    result.query.trim().length >= 3
  );
}

export function parseDispatch(
  rawInput: string,
  defaultCity = "台中市",
): ParsedDispatch {
  const raw = rawInput.replace(/\r\n?/gu, "\n").trim();
  const warnings: string[] = [];
  const additions: string[] = [];

  if (!raw) {
    return {
      raw,
      query: "",
      status: "invalid",
      kind: "unknown",
      prefixes: [],
      suffixes: [],
      note: null,
      additions,
      warnings: ["尚未貼上派單文字"],
      mapsUrl: buildMapsUrl(""),
    };
  }

  const prefixResult = peelPrefixes(raw);
  const suffixResult = peelSuffixes(prefixResult.remaining);
  const noteResult = splitTrailingNote(suffixResult.remaining);
  let query = noteResult.remaining.replace(/\s+/gu, " ").trim();

  if (
    defaultCity &&
    !cityOrCounty.test(query) &&
    districtStart.test(query) &&
    completeDoorNumber.test(query)
  ) {
    query = `${defaultCity}${query}`;
    additions.push(defaultCity);
    warnings.push(`已依預設城市補上「${defaultCity}」`);
  }

  if (noteResult.unclosed) {
    warnings.push("原文括號未閉合，括號內容已保留為備註");
  }

  if (noteResult.note) {
    warnings.push("原文含有上下車或位置備註，請確認後再導航");
  }

  const cityCount = query.match(cityOrCountyAnywhere)?.length ?? 0;
  const doorNumberCount = query.match(doorNumberAnywhere)?.length ?? 0;
  if (cityCount > 1 || doorNumberCount > 1) {
    warnings.push("偵測到多個可能地址，請選擇或修改成單一目的地");
  }

  let kind: QueryKind = "unknown";
  let status: ParseStatus = "review";

  if (completeDoorNumber.test(query)) {
    kind = "address";
    if (fullQuickAddress.test(query) && warnings.length === 0) {
      status = "ready";
    } else {
      status = "review";
      if (!fullQuickAddress.test(query)) {
        warnings.push(
          "地址缺少明確縣市、行政區或道路名稱，快速模式將先停下確認",
        );
      }
    }
  } else if (landmarkWords.test(query)) {
    kind = "landmark";
    warnings.push("這是地標／方位描述，請先確認 Google Maps 搜尋結果");
  } else if (query.length < 3) {
    status = "invalid";
    warnings.push("找不到足以導航的地址或地標");
  } else {
    warnings.push("不像完整門牌，請修改或確認後再開啟地圖");
  }

  return {
    raw,
    query,
    status,
    kind,
    prefixes: prefixResult.prefixes,
    suffixes: suffixResult.suffixes,
    note: noteResult.note,
    additions,
    warnings,
    mapsUrl: buildMapsUrl(query),
  };
}
