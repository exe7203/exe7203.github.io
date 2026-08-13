"use client";

import { useEffect } from "react";
import {
  GA_MEASUREMENT_ID,
  getLaunchMode,
  isAnalyticsEnabled,
  trackAnalyticsEvent,
} from "./lib/analytics";

const scriptId = "quicknav-google-analytics";

export default function GoogleAnalytics() {
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (window.quicknavAnalyticsInitialized) return;

    window.quicknavAnalyticsInitialized = true;

    window.dataLayer = window.dataLayer ?? [];
    window.gtag =
      window.gtag ??
      ((...args: unknown[]) => {
        window.dataLayer?.push(args);
      });
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
      ignore_referrer: true,
      page_location: `${window.location.origin}/`,
      page_title: "快導",
      send_page_view: true,
    });

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
      document.head.appendChild(script);
    }

    trackAnalyticsEvent({
      name: "app_launch",
      params: { launch_mode: getLaunchMode() },
    });
  }, []);

  return null;
}
