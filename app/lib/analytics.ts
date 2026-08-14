export const GA_MEASUREMENT_ID = "G-FXY385FDWN";
export const GA_ORIGIN = "https://exe7203.github.io";

if (!/^G-[A-Z0-9]{10}$/u.test(GA_MEASUREMENT_ID)) {
  throw new Error("Invalid GA4 measurement ID");
}

export type LaunchMode = "browser" | "standalone";
export type ParseSource = "clipboard" | "manual_paste" | "share_target";
export type InstallStage =
  | "prompt_available"
  | "button_click"
  | "prompt_accepted"
  | "prompt_dismissed"
  | "appinstalled_signal";

type AnalyticsEvent =
  | {
      name: "app_launch";
      params: { launch_mode: LaunchMode };
    }
  | {
      name: "dispatch_paste_click";
      params: { launch_mode: LaunchMode };
    }
  | {
      name: "dispatch_parse_result";
      params: {
        parse_source: ParseSource;
        parse_status: "ready" | "review" | "invalid";
        query_kind: "address" | "landmark" | "coordinates" | "unknown";
        maps_mode: "directions" | "search";
      };
    }
  | {
      name: "maps_open_click";
      params: {
        entry_point: "current_result" | "history";
        launch_mode: LaunchMode;
        maps_mode: "directions" | "search";
        parse_status: "ready" | "review" | "invalid" | "history";
        query_kind: "address" | "landmark" | "coordinates" | "unknown" | "history";
      };
    }
  | {
      name: "pwa_install_flow";
      params: { install_stage: InstallStage; launch_mode: LaunchMode };
    };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    quicknavAnalyticsInitialized?: boolean;
  }
}

type Gtag = (...args: unknown[]) => void;

export function createGtagQueue(dataLayer: unknown[]): Gtag {
  return function gtag() {
    // Google Tag requires the native Arguments object, not a rest-parameter array.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
}

export function queueAnalyticsInitialization(gtag: Gtag): void {
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    ignore_referrer: true,
    page_location: `${GA_ORIGIN}/`,
    page_title: "快導",
    send_page_view: true,
  });
}

export function isAnalyticsEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.origin === GA_ORIGIN
  );
}

export function getLaunchMode(): LaunchMode {
  if (typeof window === "undefined") return "browser";

  const standalone =
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return standalone ? "standalone" : "browser";
}

export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  if (!isAnalyticsEnabled() || typeof window.gtag !== "function") return;
  window.gtag("event", event.name, event.params);
}
