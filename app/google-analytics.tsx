"use client";

import { useEffect } from "react";
import {
  GA_MEASUREMENT_ID,
  createGtagQueue,
  getLaunchMode,
  isAnalyticsEnabled,
  queueAnalyticsInitialization,
  trackAnalyticsEvent,
} from "./lib/analytics";

const scriptId = "quicknav-google-analytics";

export default function GoogleAnalytics() {
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (window.quicknavAnalyticsInitialized) return;

    window.quicknavAnalyticsInitialized = true;

    window.dataLayer = window.dataLayer ?? [];
    window.gtag = window.gtag ?? createGtagQueue(window.dataLayer);
    queueAnalyticsInitialization(window.gtag);

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
