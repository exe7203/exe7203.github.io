export type ParseStatus = "ready" | "review" | "invalid";
export type QueryKind = "address" | "landmark" | "coordinates" | "unknown";
export type MapsMode = "directions" | "search";

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
  mapsMode: MapsMode;
  mapsUrl: string;
}

const literalPrefixCodes = new Set([
  "私",
  "斯",
  "代價",
  "跑腿",
  "回",
  "Yo",
  "安",
  "霏",
  "蜜蜂",
  "澤",
  "@",
  "@1",
  "00",
  "配",
  "法",
  "北",
  "77",
  "1@",
]);
const numericLikeStarBody = /^[+-]?[\d.]+$/u;
const numericStarBody = /^(\d{1,5})(?:\.([1-9]))?$/u;
const structuredStarBody = /^[^*/\s]{1,16}$/u;
const wPrefixCode = /^W(?:[1-9]\d?|100)?$/iu;
const clockPrefixCode = /^(?:[01]?\d|2[0-3])[:：.．][0-5]\d$/u;
const leadingClockPrefix =
  /^\s*((?:[01]?\d|2[0-3])[:：.．][0-5]\d)(\/|\s*)/u;
const cityOrCounty =
  /^(?:基隆|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)(?:縣|市)/u;
const taichungDistrictStart =
  /^(?:北屯|西屯|南屯|太平|大里|霧峰|烏日|豐原|后里|石岡|東勢|和平|新社|潭子|大雅|神岡|大肚|沙鹿|龍井|梧棲|清水|大甲|外埔|大安|中|東|南|西|北)區/u;
const doorNumberSource = String.raw`\d+(?:(?:之|-)\d+)?號(?:\d+樓)?`;
const completeDoorNumber = new RegExp(`${doorNumberSource}$`, "u");
const roadAddressWithDoorNumber = new RegExp(
  String.raw`^[\p{Script=Han}]{1,20}(?:路|街|道)(?:[一二三四五六七八九十百\d]{1,3}段)?\d{1,5}(?:(?:之|-)\d{1,3})?號(?:\d+樓)?$`,
  "u",
);
const roadAddressMissingDoorNumber =
  /^[\p{Script=Han}]{1,20}(?:路|街|道)(?:[一二三四五六七八九十百\d]{1,3}段)?\d{1,5}(?:(?:之|-)\d{1,3})?$/u;
const fullQuickAddress =
  /^(?:基隆|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)(?:縣|市)[\p{Script=Han}]{1,3}(?:區|鄉|鎮|市).*(?:路|街|道|段|巷|弄|村|里|鄰).*\d+(?:(?:之|-)\d+)?號(?:\d+樓)?$/u;
const cityOrCountyAnywhere =
  /(?:基隆|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)(?:縣|市)/gu;
const doorNumberAnywhere = new RegExp(doorNumberSource, "gu");
const landmarkWords =
  /(車站|高鐵|捷運|機場|醫院|診所|飯店|旅館|會館|公園|學校|大學|幼兒園|百貨|市場|門市|超商|全聯|全家|萊爾富|康是美|7-ELEVEN|KTV)/iu;
const knownSuffixSource =
  "(?:🟢免百回\\s+幫救|🔴70錶\\s+全免回傭❗|💚百回(?:[+-]\\d+)?|🔫\\d+錶|(?:🐟|💣|🖤|🦈|🐶|🐭|🍪|🌿|💛|🍅|🐒)(?:回20|百回)|百回(?:[+-]\\d+)?)";
const dmsPairSource = String.raw`(\d{1,2})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)['"″]\s*([NS])\s*[,，]?\s*(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)['"″]\s*([EW])`;
const decimalPairSource = String.raw`(?:\(\s*([+-]?\d{1,3}\.\d+)\s*[,，]\s*([+-]?\d{1,3}\.\d+)\s*\)|([+-]?\d{1,3}\.\d+)\s*[,，]\s*([+-]?\d{1,3}\.\d+))`;

interface CoordinateMatch {
  text: string;
  normalized: string;
  index: number;
  length: number;
  valid: boolean;
  count: number;
  format: "dms" | "decimal";
  parenthesized: boolean;
}

function isStructuredStarPrefix(segment: string): boolean {
  if (!segment.startsWith("*")) return false;

  const body = segment.slice(1);
  if (!structuredStarBody.test(body)) return false;

  if (numericLikeStarBody.test(body)) {
    const match = body.match(numericStarBody);
    if (!match) return false;
    const value = Number(match[1]);
    return value >= 1 && value <= 99999;
  }

  return true;
}

function isKnownPrefix(segment: string): boolean {
  return (
    literalPrefixCodes.has(segment) ||
    isStructuredStarPrefix(segment) ||
    wPrefixCode.test(segment) ||
    clockPrefixCode.test(segment)
  );
}

function peelPrefixes(
  input: string,
  allowShortNumericPrefix = false,
): {
  remaining: string;
  prefixes: string[];
} {
  let remaining = input;
  const prefixes: string[] = [];
  let shortNumericPrefixAvailable = allowShortNumericPrefix;

  const inlineDispatch = remaining.match(/^\s*(\*回派)\s+/u);
  if (inlineDispatch) {
    prefixes.push(`${inlineDispatch[1]} `);
    remaining = remaining.slice(inlineDispatch[0].length).trimStart();
  }

  while (remaining.includes("/")) {
    const slash = remaining.indexOf("/");
    const segment = remaining.slice(0, slash).trim();
    const isShortNumericPrefix =
      shortNumericPrefixAvailable && /^[1-9]\d{0,2}$/u.test(segment);
    if (!segment || (!isKnownPrefix(segment) && !isShortNumericPrefix)) break;
    prefixes.push(`${segment}/`);
    remaining = remaining.slice(slash + 1).trimStart();
    if (isShortNumericPrefix) shortNumericPrefixAvailable = false;
  }

  return { remaining, prefixes };
}

function peelLeadingClock(input: string): {
  remaining: string;
  prefix: string | null;
} {
  const match = input.match(leadingClockPrefix);
  if (!match) return { remaining: input, prefix: null };

  const remaining = input.slice(match[0].length).trimStart();
  if (!remaining) return { remaining: input, prefix: null };

  return {
    remaining,
    prefix: `${match[1]}${match[2] === "/" ? "/" : ""}`,
  };
}

function peelSuffixes(input: string): {
  remaining: string;
  suffixes: string[];
  note: string | null;
} {
  const matches = [
    ...input.matchAll(new RegExp(knownSuffixSource, "gu")),
  ];
  const first = matches[0];
  if (!first || first.index === undefined) {
    return { remaining: input, suffixes: [], note: null };
  }

  const metadata = input.slice(first.index);
  const suffixes = [
    ...metadata.matchAll(new RegExp(knownSuffixSource, "gu")),
  ].map((match) => match[0]);
  const note = metadata
    .replace(new RegExp(knownSuffixSource, "gu"), " ")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    remaining: input.slice(0, first.index).trimEnd(),
    suffixes,
    note: note || null,
  };
}

function splitTrailingNote(input: string): {
  remaining: string;
  note: string | null;
  unclosed: boolean;
} {
  const doorNumbers = [
    ...input.matchAll(new RegExp(doorNumberSource, "gu")),
  ];
  if (doorNumbers.length !== 1 || doorNumbers[0].index === undefined) {
    return { remaining: input, note: null, unclosed: false };
  }

  const doorNumber = doorNumbers[0];
  const end = doorNumber.index + doorNumber[0].length;
  const trailing = input.slice(end);
  if (!trailing.trim() || !/^(?:\s+|[（(])/u.test(trailing)) {
    return { remaining: input, note: null, unclosed: false };
  }

  const trimmed = trailing.trim();
  const parenthetical = trimmed.match(/^([（(])([^）)]*)([）)])?$/u);

  return {
    remaining: input.slice(0, end).trimEnd(),
    note: (parenthetical ? parenthetical[2] : trimmed).trim() || null,
    unclosed: Boolean(parenthetical && !parenthetical[3]),
  };
}

function mergeNotes(...notes: Array<string | null>): string | null {
  const values = notes.map((note) => note?.trim()).filter(Boolean) as string[];
  return values.length > 0 ? values.join("；") : null;
}

function isStandaloneAddressWithDoorNumber(input: string): boolean {
  const normalized = input.replace(/\s+/gu, " ").trim();
  const cityCount = normalized.match(cityOrCountyAnywhere)?.length ?? 0;
  const doorNumberCount = normalized.match(doorNumberAnywhere)?.length ?? 0;

  return (
    completeDoorNumber.test(normalized) &&
    cityCount <= 1 &&
    doorNumberCount === 1 &&
    (cityOrCounty.test(normalized) ||
      taichungDistrictStart.test(normalized) ||
      roadAddressWithDoorNumber.test(normalized))
  );
}

function splitLeadingAddressNote(input: string): {
  remaining: string;
  note: string | null;
} {
  const normalized = input.replace(/\s+/gu, " ").trim();
  const match = normalized.match(/^([\p{Script=Han}]{1,12})\s+(.+)$/u);
  if (!match) return { remaining: input, note: null };

  const label = match[1];
  const destination = match[2];
  if (
    cityOrCounty.test(label) ||
    taichungDistrictStart.test(label) ||
    !isStandaloneAddressWithDoorNumber(destination)
  ) {
    return { remaining: input, note: null };
  }

  return { remaining: destination, note: label };
}

function findDmsCoordinates(input: string): CoordinateMatch | null {
  const matches = [...input.matchAll(new RegExp(dmsPairSource, "giu"))];
  if (matches.length === 0) return null;

  const first = matches[0];
  const latitudeDegrees = Number(first[1]);
  const latitudeMinutes = Number(first[2]);
  const latitudeSeconds = Number(first[3]);
  const longitudeDegrees = Number(first[5]);
  const longitudeMinutes = Number(first[6]);
  const longitudeSeconds = Number(first[7]);
  const latitudeValid =
    latitudeDegrees <= 90 &&
    latitudeMinutes < 60 &&
    latitudeSeconds < 60 &&
    (latitudeDegrees < 90 ||
      (latitudeMinutes === 0 && latitudeSeconds === 0));
  const longitudeValid =
    longitudeDegrees <= 180 &&
    longitudeMinutes < 60 &&
    longitudeSeconds < 60 &&
    (longitudeDegrees < 180 ||
      (longitudeMinutes === 0 && longitudeSeconds === 0));

  return {
    text: first[0].replace(/\s+/gu, " ").trim(),
    normalized: first[0].replace(/\s+/gu, " ").trim(),
    index: first.index ?? 0,
    length: first[0].length,
    valid: latitudeValid && longitudeValid,
    count: matches.length,
    format: "dms",
    parenthesized: false,
  };
}

function findDecimalCoordinates(input: string): CoordinateMatch | null {
  const matches = [
    ...input.matchAll(new RegExp(decimalPairSource, "gu")),
  ];
  const first = matches[0];
  if (!first) return null;

  const latitudeText = first[1] ?? first[3];
  const longitudeText = first[2] ?? first[4];
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  return {
    text: first[0].trim(),
    normalized: `${latitudeText},${longitudeText}`,
    index: first.index ?? 0,
    length: first[0].length,
    valid,
    count: matches.length,
    format: "decimal",
    parenthesized: first[1] !== undefined,
  };
}

function findCoordinates(input: string): CoordinateMatch | null {
  const dms = findDmsCoordinates(input);
  const decimal = findDecimalCoordinates(input);
  const count = (dms?.count ?? 0) + (decimal?.count ?? 0);
  if (count === 0) return null;

  const candidates = [dms, decimal]
    .filter((candidate): candidate is CoordinateMatch => Boolean(candidate))
    .sort((left, right) => left.index - right.index);

  return { ...candidates[0], count };
}

function getDispatchDestinationCandidate(input: string): string {
  const suffixResult = peelSuffixes(input);
  const trailingNoteResult = splitTrailingNote(suffixResult.remaining);
  const leadingNoteResult = splitLeadingAddressNote(
    trailingNoteResult.remaining,
  );
  return leadingNoteResult.remaining.replace(/\s+/gu, " ").trim();
}

function isClearAddressDestination(input: string): boolean {
  const destination = getDispatchDestinationCandidate(input);
  return (
    isStandaloneAddressWithDoorNumber(destination) ||
    roadAddressMissingDoorNumber.test(destination)
  );
}

function isClearDispatchDestination(input: string): boolean {
  const destination = getDispatchDestinationCandidate(input);
  const coordinates = findCoordinates(destination);
  const hasSingleValidCoordinate = Boolean(
    coordinates && coordinates.valid && coordinates.count === 1,
  );

  return (
    hasSingleValidCoordinate ||
    isStandaloneAddressWithDoorNumber(destination) ||
    roadAddressMissingDoorNumber.test(destination)
  );
}

function hasUnstarredNumericPrefixFollowedByDestination(
  input: string,
): boolean {
  const match = input.match(/^\s*[1-9]\d{0,2}\/\s*(.+)$/u);
  return Boolean(match && isClearAddressDestination(match[1]));
}

function hasSingleValidParenthesizedDecimalCoordinate(input: string): boolean {
  const fleetPrefix = input.match(
    /^\s*[1-9]\d{0,2}\/\p{Script=Han}{1,4}(?=\s*\()/u,
  );
  if (!fleetPrefix) return false;

  const decimal = findDecimalCoordinates(input);
  return Boolean(
    decimal &&
      decimal.valid &&
      decimal.count === 1 &&
      decimal.parenthesized &&
      input.slice(fleetPrefix[0].length, decimal.index).trim() === "" &&
      !findDmsCoordinates(input),
  );
}

function hasNumericDispatchPrefixFollowedByClockAndAddress(
  input: string,
): boolean {
  const numericPrefix = input.match(/^\s*[1-9]\d{0,2}\/\s*/u);
  if (!numericPrefix) return false;

  const afterPrefix = input.slice(numericPrefix[0].length);
  const clock = afterPrefix.match(leadingClockPrefix);
  if (!clock) return false;

  const destinationWithSuffix = afterPrefix
    .slice(clock[0].length)
    .replace(/\s+/gu, " ")
    .trim();
  const destination = peelSuffixes(destinationWithSuffix).remaining;

  return (
    completeDoorNumber.test(destination) &&
    (cityOrCounty.test(destination) || taichungDistrictStart.test(destination))
  );
}

function canPeelUnstarredNumericPrefix(input: string): boolean {
  return (
    hasSingleValidParenthesizedDecimalCoordinate(input) ||
    hasNumericDispatchPrefixFollowedByClockAndAddress(input) ||
    hasUnstarredNumericPrefixFollowedByDestination(input)
  );
}

function hasClearPrefixedDispatchPayload(input: string): boolean {
  const prefixResult = peelPrefixes(
    input,
    canPeelUnstarredNumericPrefix(input),
  );
  if (prefixResult.prefixes.length === 0) return false;

  const clockResult = peelLeadingClock(prefixResult.remaining);
  return isClearDispatchDestination(clockResult.remaining);
}

function hasTrustedPrefixedPayload(input: string): boolean {
  const prefixResult = peelPrefixes(input, false);
  if (prefixResult.prefixes.length === 0) return false;

  const clockResult = peelLeadingClock(prefixResult.remaining);
  return clockResult.remaining.trim().length >= 2;
}

function matchLineEnvelope(input: string): {
  payload: string;
  sender: string;
} | null {
  const match = input.match(
    /^\s*(?:[01]?\d|2[0-3])[:：][0-5]\d\s+([^\s/]{1,20})\s+(.+)$/u,
  );
  if (!match) return null;

  const sender = match[1];
  if (cityOrCounty.test(sender) || taichungDistrictStart.test(sender)) {
    return null;
  }

  return { sender, payload: match[2].trim() };
}

function peelLineEnvelope(input: string): {
  remaining: string;
  stripped: boolean;
} {
  const envelope = matchLineEnvelope(input);
  if (
    !envelope ||
    (!hasClearPrefixedDispatchPayload(envelope.payload) &&
      !hasTrustedPrefixedPayload(envelope.payload))
  ) {
    return { remaining: input, stripped: false };
  }

  return { remaining: envelope.payload, stripped: true };
}

function isLineRecall(input: string): boolean {
  return (
    /^\s*(?:已)?(?:收回|撤回)訊息\s*$/u.test(input) ||
    /^\s*(?:[01]?\d|2[0-3])[:：][0-5]\d\s+\S{0,20}(?:已)?(?:收回|撤回)訊息\s*$/u.test(
      input,
    )
  );
}

function isLineChatNoise(input: string): boolean {
  const envelope = matchLineEnvelope(input);
  return Boolean(envelope && !envelope.payload.includes("/"));
}

function countClearDispatchRows(input: string): number {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const envelopeResult = peelLineEnvelope(line);
      return (
        envelopeResult.stripped ||
        hasClearPrefixedDispatchPayload(line) ||
        isClearDispatchDestination(line)
      );
    }).length;
}

export function getMapsMode(query: string): MapsMode {
  const normalized = query.replace(/\s+/gu, " ").trim();
  const coordinates = findCoordinates(normalized);
  const isSingleCoordinate = Boolean(
    coordinates &&
      coordinates.valid &&
      coordinates.count === 1 &&
      coordinates.index === 0 &&
      coordinates.length === normalized.length,
  );
  const cityCount = normalized.match(cityOrCountyAnywhere)?.length ?? 0;
  const doorNumberCount = normalized.match(doorNumberAnywhere)?.length ?? 0;
  const isSingleFullAddress =
    fullQuickAddress.test(normalized) &&
    cityCount === 1 &&
    doorNumberCount === 1;

  return isSingleCoordinate || isSingleFullAddress ? "directions" : "search";
}

export function buildMapsUrl(query: string): string {
  const normalized = query.trim();
  const encodedQuery = encodeURIComponent(normalized);

  if (getMapsMode(normalized) === "directions") {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodedQuery}&travelmode=driving`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
}

function buildInvalidResult(raw: string, warning: string): ParsedDispatch {
  return {
    raw,
    query: "",
    status: "invalid",
    kind: "unknown",
    prefixes: [],
    suffixes: [],
    note: null,
    additions: [],
    warnings: [warning],
    mapsMode: "search",
    mapsUrl: buildMapsUrl(""),
  };
}

export function canQuickNavigate(result: ParsedDispatch): boolean {
  return (
    result.status === "ready" &&
    (result.kind === "address" || result.kind === "coordinates") &&
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
    return buildInvalidResult(raw, "尚未貼上派單文字");
  }

  if (isLineRecall(raw)) {
    return buildInvalidResult(raw, "這是已收回／撤回的 LINE 訊息");
  }

  if (isLineChatNoise(raw)) {
    return buildInvalidResult(raw, "這段 LINE 文字不像派單地址");
  }

  if (countClearDispatchRows(raw) > 1) {
    return buildInvalidResult(raw, "偵測到多筆派單，請一次貼上一筆");
  }

  const envelopeResult = peelLineEnvelope(raw);
  const dispatchInput = envelopeResult.remaining;
  const prefixResult = peelPrefixes(
    dispatchInput,
    canPeelUnstarredNumericPrefix(dispatchInput),
  );
  const clockResult = peelLeadingClock(prefixResult.remaining);
  const prefixes = clockResult.prefix
    ? [...prefixResult.prefixes, clockResult.prefix]
    : prefixResult.prefixes;
  const suffixResult = peelSuffixes(clockResult.remaining);
  const noteResult = splitTrailingNote(suffixResult.remaining);
  const leadingNoteResult = splitLeadingAddressNote(noteResult.remaining);
  let note = mergeNotes(
    leadingNoteResult.note,
    noteResult.note,
    suffixResult.note,
  );
  let query = leadingNoteResult.remaining.replace(/\s+/gu, " ").trim();
  const suspectedMissingDoorNumber =
    roadAddressMissingDoorNumber.test(query);

  const coordinates = findCoordinates(query);
  let coordinateReady = false;
  if (coordinates) {
    if (coordinates.count > 1) {
      warnings.push("偵測到多組座標，請選擇單一目的地");
    } else if (!coordinates.valid) {
      warnings.push("座標格式超出可導航範圍，請確認數值");
    } else {
      const coordinateEnd = coordinates.index + coordinates.length;
      const contextBefore = query
        .slice(0, coordinates.index)
        .replace(/\s+/gu, " ")
        .trim();
      const contextAfter = query
        .slice(coordinateEnd)
        .replace(/\s+/gu, " ")
        .trim();
      query = coordinates.normalized;
      note =
        coordinates.format === "decimal"
          ? mergeNotes(contextBefore || null, contextAfter || null, note)
          : mergeNotes(
              `${contextBefore} ${contextAfter}`.trim() || null,
              note,
            );
      coordinateReady = true;
    }
  }

  if (
    !coordinateReady &&
    defaultCity &&
    !cityOrCounty.test(query) &&
    taichungDistrictStart.test(query) &&
    completeDoorNumber.test(query)
  ) {
    query = `${defaultCity}${query}`;
    additions.push(defaultCity);
    warnings.push(`已依預設城市補上「${defaultCity}」`);
  }

  if (noteResult.unclosed) {
    warnings.push("原文括號未閉合，括號內容已保留為備註");
  }

  if (note) {
    warnings.push("原文含有上下車或位置備註，請確認後再導航");
  }

  const cityCount = query.match(cityOrCountyAnywhere)?.length ?? 0;
  const doorNumberCount = query.match(doorNumberAnywhere)?.length ?? 0;
  if (cityCount > 1 || doorNumberCount > 1) {
    warnings.push("偵測到多個可能地址，請選擇或修改成單一目的地");
  }

  let kind: QueryKind = "unknown";
  let status: ParseStatus = "review";

  if (coordinateReady) {
    kind = "coordinates";
    status = warnings.length === 0 ? "ready" : "review";
  } else if (completeDoorNumber.test(query)) {
    kind = "address";
    if (fullQuickAddress.test(query) && warnings.length === 0) {
      status = "ready";
    } else {
      status = "review";
      if (!fullQuickAddress.test(query)) {
        warnings.push(
          "地址缺少縣市或行政區，將改為搜尋相似地點",
        );
      }
    }
  } else if (suspectedMissingDoorNumber) {
    kind = "address";
    warnings.push("地址疑似缺少「號」，請確認完整門牌");
  } else if (landmarkWords.test(query)) {
    kind = "landmark";
    warnings.push("這是地標／方位描述，請先確認 Google Maps 搜尋結果");
  } else if (query.length < 2) {
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
    prefixes,
    suffixes: suffixResult.suffixes,
    note,
    additions,
    warnings,
    mapsMode: getMapsMode(query),
    mapsUrl: buildMapsUrl(query),
  };
}
