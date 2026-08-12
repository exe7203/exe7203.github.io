export const DRIVER_APP_LINK_ORIGIN = "https://exe7203.github.io";
export const DRIVER_APP_LINK_PATH = "/driver/dispatch";
export const MAX_DISPATCH_UTF8_BYTES = 4096;
export const MAX_DESTINATION_UTF8_BYTES = 1024;
/**
 * Conservative ceiling shared with Google Maps URLs and browser/App Link
 * handoffs. Keeping the fully encoded URL at or below 2,048 characters avoids
 * browser, intent, proxy, and navigation-provider truncation.
 */
export const MAX_HANDOFF_URL_LENGTH = 2048;

export type DriverHandoffResult =
  | {
      ok: true;
      appLinkUrl: string;
      schemeFallbackUrl: string;
    }
  | {
      ok: false;
      reason:
        | "empty"
        | "unsafe-control"
        | "dispatch-too-long"
        | "destination-too-long"
        | "encoded-url-too-long";
      message: string;
    };

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function buildQueryUrl(
  base: string,
  rawDispatch: string,
  destination: string,
): string {
  const url = new URL(base);
  url.searchParams.set("v", "1");
  url.searchParams.set("dispatch", rawDispatch);
  url.searchParams.set("destination", destination);
  return url.toString();
}

function buildFragmentUrl(
  base: string,
  rawDispatch: string,
  destination: string,
): string {
  const url = new URL(base);
  const fragment = new URLSearchParams();
  fragment.set("v", "1");
  fragment.set("dispatch", rawDispatch);
  fragment.set("destination", destination);
  // Fragments are delivered to the Android intent and browser fallback, but
  // are not part of the HTTP request sent to the hosting server.
  url.hash = fragment.toString();
  return url.toString();
}

/**
 * Builds both handoff routes from the original, unmodified dispatch text. The
 * HTTPS App Link carries private payload in its URI fragment so an unverified
 * or uninstalled-app browser fallback does not send it in the HTTP request.
 * The custom scheme keeps its existing query format for compatibility.
 * URLSearchParams performs the single required encoding pass; callers must not
 * pre-encode either value.
 */
export function buildDriverHandoff(
  rawDispatch: string,
  destination: string,
): DriverHandoffResult {
  if (!rawDispatch.trim() || !destination.trim()) {
    return {
      ok: false,
      reason: "empty",
      message: "請先確認派單原文與目的地",
    };
  }

  if (rawDispatch.includes("\0") || destination.includes("\0")) {
    return {
      ok: false,
      reason: "unsafe-control",
      message: "派單含有無法安全交接的控制字元",
    };
  }

  if (utf8Length(rawDispatch) > MAX_DISPATCH_UTF8_BYTES) {
    return {
      ok: false,
      reason: "dispatch-too-long",
      message: "派單原文過長，請改在司機端貼上",
    };
  }

  if (utf8Length(destination) > MAX_DESTINATION_UTF8_BYTES) {
    return {
      ok: false,
      reason: "destination-too-long",
      message: "目的地內容過長，請縮短後再交給司機端",
    };
  }

  const appLinkUrl = buildFragmentUrl(
    `${DRIVER_APP_LINK_ORIGIN}${DRIVER_APP_LINK_PATH}`,
    rawDispatch,
    destination,
  );
  const schemeFallbackUrl = buildQueryUrl(
    "quicknav://dispatch",
    rawDispatch,
    destination,
  );
  if (
    appLinkUrl.length > MAX_HANDOFF_URL_LENGTH ||
    schemeFallbackUrl.length > MAX_HANDOFF_URL_LENGTH
  ) {
    return {
      ok: false,
      reason: "encoded-url-too-long",
      message: "派單內容編碼後過長，請改在司機端貼上",
    };
  }

  return {
    ok: true,
    appLinkUrl,
    schemeFallbackUrl,
  };
}
