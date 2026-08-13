"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMapsUrl,
  canQuickNavigate,
  getMapsMode,
  parseDispatch,
  type ParsedDispatch,
} from "./lib/parse-dispatch";
import {
  ADDRESS_HISTORY_LIMIT,
  ADDRESS_HISTORY_STORAGE_KEY,
  addAddressHistoryEntry,
  type AddressHistoryEntry,
  readAddressHistory,
  removeAddressHistoryEntry,
  serializeAddressHistory,
} from "./lib/address-history";
import {
  getLaunchMode,
  trackAnalyticsEvent,
  type ParseSource,
} from "./lib/analytics";
import {
  PASTE_SIDE_STORAGE_KEY,
  readPasteSidePreference,
  type PasteSide,
} from "./lib/paste-side";
import Link from "next/link";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function warmAppResources(registration: ServiceWorkerRegistration) {
  const urls = Array.from(
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
      'script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]',
    ),
  )
    .map((element) =>
      element instanceof HTMLScriptElement ? element.src : element.href,
    )
    .filter((value) => {
      try {
        return new URL(value, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    });

  registration.active?.postMessage({
    type: "CACHE_APP_ASSETS",
    urls: [...new Set(urls)],
  });
}

function formatHistoryTime(savedAt: number) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(savedAt));
}

function getStatusCopy(result: ParsedDispatch) {
  if (result.status === "ready") {
    return {
      label: "可以導航",
      detail: result.kind === "coordinates" ? "座標資料完整" : "門牌資料完整",
      tone: "ready",
    };
  }
  if (result.status === "invalid") {
    return { label: "無法導航", detail: "請補上地址", tone: "invalid" };
  }
  return { label: "需要確認", detail: "請核對地圖結果", tone: "review" };
}

function trackParsedDispatch(source: ParseSource, result: ParsedDispatch) {
  trackAnalyticsEvent({
    name: "dispatch_parse_result",
    params: {
      parse_source: source,
      parse_status: result.status,
      query_kind: result.kind,
      maps_mode: result.mapsMode,
    },
  });
}

function openMapsUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function Home() {
  const [defaultCity, setDefaultCity] = useState("台中市");
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState(() => parseDispatch("", "台中市"));
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [clipboardBlocked, setClipboardBlocked] = useState(false);
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
  const [pasteSide, setPasteSide] = useState<PasteSide>("right");
  const [addressHistory, setAddressHistory] = useState<AddressHistoryEntry[]>([]);
  const historyReadyRef = useRef(false);
  const resultCardRef = useRef<HTMLElement>(null);

  const parseText = useCallback(
    (text: string) => {
      const parsed = parseDispatch(text, defaultCity);
      setRaw(text);
      setResult(parsed);
      return parsed;
    },
    [defaultCity],
  );

  const rememberAddress = useCallback((parsed: ParsedDispatch) => {
    if (parsed.status === "invalid" || parsed.query.trim().length < 2) return;
    setAddressHistory((current) =>
      addAddressHistoryEntry(current, parsed.query),
    );
  }, []);

  const revealResult = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resultCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }, []);

  useEffect(() => {
    const restoreHistoryTimer = window.setTimeout(() => {
      let storedHistory: AddressHistoryEntry[] = [];
      try {
        storedHistory = readAddressHistory(
          window.localStorage.getItem(ADDRESS_HISTORY_STORAGE_KEY),
        );
      } catch {
        // The app remains usable if this browser blocks device-local storage.
      }

      setAddressHistory((current) => {
        if (current.length === 0) return storedHistory;
        const currentIds = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...storedHistory.filter((item) => !currentIds.has(item.id)),
        ].slice(0, ADDRESS_HISTORY_LIMIT);
      });
      historyReadyRef.current = true;
    }, 0);

    return () => window.clearTimeout(restoreHistoryTimer);
  }, []);

  useEffect(() => {
    if (!historyReadyRef.current) return;
    try {
      window.localStorage.setItem(
        ADDRESS_HISTORY_STORAGE_KEY,
        serializeAddressHistory(addressHistory),
      );
    } catch {
      // Parsing and navigation still work when private browsing blocks storage.
    }
  }, [addressHistory]);

  useEffect(() => {
    const restorePasteSideTimer = window.setTimeout(() => {
      try {
        setPasteSide(
          readPasteSidePreference(
            window.localStorage.getItem(PASTE_SIDE_STORAGE_KEY),
          ),
        );
      } catch {
        // The right-side default remains available when storage is blocked.
      }
    }, 0);

    return () => window.clearTimeout(restorePasteSideTimer);
  }, []);

  useEffect(() => {
    let restoreCityTimer: number | undefined;
    const savedCity = window.localStorage.getItem("quicknav-default-city");
    if (savedCity !== null && savedCity !== defaultCity) {
      restoreCityTimer = window.setTimeout(() => {
        setDefaultCity(savedCity);
      }, 0);
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    const environmentTimer = window.setTimeout(() => {
      setIsStandalone(standalone);
      setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    }, 0);

    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      trackAnalyticsEvent({
        name: "pwa_install_flow",
        params: {
          install_stage: "prompt_available",
          launch_mode: getLaunchMode(),
        },
      });
    };
    const installedHandler = () => {
      trackAnalyticsEvent({
        name: "pwa_install_flow",
        params: {
          install_stage: "appinstalled_signal",
          launch_mode: getLaunchMode(),
        },
      });
    };
    window.addEventListener("beforeinstallprompt", installHandler);
    window.addEventListener("appinstalled", installedHandler);

    async function preparePwa() {
      if (!("serviceWorker" in navigator)) return;
      try {
        await navigator.serviceWorker.register("/sw.js");
        const readyRegistration = await navigator.serviceWorker.ready;
        warmAppResources(readyRegistration);

        if (new URLSearchParams(window.location.search).has("share-target")) {
          const response = await fetch("/__shared_text__", {
            cache: "no-store",
          });
          if (response.ok) {
            const payload = (await response.json()) as { text?: string };
            if (payload.text?.trim()) {
              const sharedResult = parseDispatch(
                payload.text,
                savedCity ?? defaultCity,
              );
              setRaw(payload.text);
              setResult(sharedResult);
              rememberAddress(sharedResult);
              trackParsedDispatch("share_target", sharedResult);
              if (canQuickNavigate(sharedResult)) {
                setNotice("地址完整，請確認後開啟 Google Maps");
              } else {
                setNotice("分享文字需要確認，已停在解析結果");
              }
              revealResult();
            }
          }
          window.history.replaceState({}, "", "/");
        }
      } catch {
        setNotice("目前可正常解析；離線安裝功能稍後再試");
      }
    }

    void preparePwa();
    return () => {
      if (restoreCityTimer !== undefined) {
        window.clearTimeout(restoreCityTimer);
      }
      if (environmentTimer !== undefined) {
        window.clearTimeout(environmentTimer);
      }
      window.removeEventListener("beforeinstallprompt", installHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [defaultCity, rememberAddress, revealResult]);

  const statusCopy = useMemo(() => getStatusCopy(result), [result]);
  const hasChanges =
    result.prefixes.length > 0 ||
    result.suffixes.length > 0 ||
    Boolean(result.note) ||
    result.additions.length > 0;

  function handleCityChange(city: string) {
    setDefaultCity(city);
    window.localStorage.setItem("quicknav-default-city", city);
    setResult(parseDispatch(raw, city));
    setNotice(city ? `預設城市已設為${city}` : "已關閉自動補城市");
  }

  function handlePasteSideChange(side: PasteSide) {
    setPasteSide(side);
    try {
      window.localStorage.setItem(PASTE_SIDE_STORAGE_KEY, side);
    } catch {
      // The current selection still works when storage is blocked.
    }
    setNotice(`貼鍵已移到${side === "left" ? "左側" : "右側"}`);
  }

  async function readClipboardText(): Promise<string | null> {
    if (!navigator.clipboard?.readText) {
      setClipboardBlocked(true);
      setNotice("這個瀏覽器封鎖一鍵貼上，已開啟手動備援輸入框");
      setShowManualInput(true);
      window.setTimeout(
        () => document.getElementById("dispatch-input")?.focus(),
        0,
      );
      return null;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setNotice("剪貼簿目前沒有文字");
        return null;
      }
      setClipboardBlocked(false);
      return text;
    } catch {
      setClipboardBlocked(true);
      setNotice("瀏覽器沒有授權一鍵貼上，已開啟手動備援輸入框");
      setShowManualInput(true);
      window.setTimeout(
        () => document.getElementById("dispatch-input")?.focus(),
        0,
      );
      return null;
    }
  }

  async function handleQuickNavigate() {
    if (isReadingClipboard) return;
    trackAnalyticsEvent({
      name: "dispatch_paste_click",
      params: { launch_mode: getLaunchMode() },
    });
    setIsReadingClipboard(true);
    try {
      const text = await readClipboardText();
      if (!text) return;

      const parsed = parseText(text);
      rememberAddress(parsed);
      trackParsedDispatch("clipboard", parsed);
      setShowManualInput(false);
      if (canQuickNavigate(parsed)) {
        setNotice("已一鍵貼上並解析完成，請確認後開啟 Google Maps");
      } else {
        setNotice("已一鍵貼上；這筆有需要確認的內容，請先核對");
      }
      revealResult();
    } finally {
      setIsReadingClipboard(false);
    }
  }

  function handleManualPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const parsed = parseText(text);
    rememberAddress(parsed);
    trackParsedDispatch("manual_paste", parsed);
    setNotice(
      canQuickNavigate(parsed)
        ? "已貼上並完成解析，請確認後開啟 Google Maps"
        : "這筆有需要確認的內容，請先核對",
    );
    revealResult();
  }

  function clearAll() {
    setRaw("");
    setResult(parseDispatch("", defaultCity));
    setShowManualInput(false);
    setClipboardBlocked(false);
    setNotice("已清除目前內容；最近地址仍保留");
  }

  function loadHistoryEntry(entry: AddressHistoryEntry) {
    const parsed = parseDispatch(entry.address, defaultCity);
    setRaw(entry.address);
    setResult(parsed);
    setShowManualInput(false);
    setClipboardBlocked(false);
    setNotice("已帶入最近地址，尚未開啟地圖");
    revealResult();
  }

  function deleteHistoryEntry(id: string) {
    setAddressHistory((current) => removeAddressHistoryEntry(current, id));
    setNotice("已刪除這筆地址紀錄");
  }

  function clearAddressHistory() {
    setAddressHistory([]);
    setNotice("最近地址已全部清除，目前解析內容不受影響");
  }

  async function installApp() {
    if (!installPrompt) return;
    trackAnalyticsEvent({
      name: "pwa_install_flow",
      params: {
        install_stage: "button_click",
        launch_mode: getLaunchMode(),
      },
    });
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    trackAnalyticsEvent({
      name: "pwa_install_flow",
      params: {
        install_stage:
          choice.outcome === "accepted"
            ? "prompt_accepted"
            : "prompt_dismissed",
        launch_mode: getLaunchMode(),
      },
    });
    if (choice.outcome === "accepted") {
      setNotice("已開始安裝到主畫面");
      setIsStandalone(true);
    }
    setInstallPrompt(null);
  }

  function editDestination(value: string) {
    setResult((current) => ({
      ...current,
      query: value,
      mapsMode: getMapsMode(value),
      mapsUrl: buildMapsUrl(value),
      status: value.trim().length >= 2 ? "review" : "invalid",
    }));
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1>快導</h1>
          </div>
        </div>
        <div className="handedness-row">
          <div
            className="handedness-control"
            role="group"
            aria-label="貼上按鈕位置"
          >
            <span className="handedness-label">貼鍵</span>
            <button
              className="handedness-option"
              type="button"
              aria-pressed={pasteSide === "left"}
              onClick={() => handlePasteSideChange("left")}
            >
              左手
            </button>
            <button
              className="handedness-option"
              type="button"
              aria-pressed={pasteSide === "right"}
              onClick={() => handlePasteSideChange("right")}
            >
              右手
            </button>
          </div>
        </div>
        {!isStandalone && installPrompt && (
          <div className="install-row">
            <button className="install-button" onClick={() => void installApp()}>
              ＋ 安裝快導
            </button>
          </div>
        )}
      </header>

      <div className="content-stack">
        <section className="card input-card" aria-labelledby="input-title">
          <div className="section-heading">
            <h2 id="input-title">貼上派單</h2>
            {raw && (
              <button className="text-button" onClick={clearAll} type="button">
                清除目前內容
              </button>
            )}
          </div>

          <div className="paste-guidance" id="paste-button-help">
            <strong>複製派單文字後，按下方「貼」</strong>
          </div>

          <button
            className="quick-button"
            data-side={pasteSide}
            onClick={() => void handleQuickNavigate()}
            type="button"
            aria-describedby="paste-button-help"
            title={`位於${pasteSide === "left" ? "左下角" : "右下角"}；貼上剪貼簿並解析地址`}
            disabled={isReadingClipboard}
          >
            <span className="quick-button-icon" aria-hidden="true">
              貼
            </span>
            <span className="quick-button-copy">
              <strong>{isReadingClipboard ? "正在貼上" : "一鍵貼上解析"}</strong>
              <small>按一次就讀取剛複製的派單文字</small>
            </span>
          </button>
          {showManualInput ? (
            <div className="manual-input-wrap">
              {clipboardBlocked && (
                <p className="clipboard-limit" role="alert">
                  目前瀏覽器不讓網頁直接讀取剪貼簿。這是瀏覽器限制；你可以在下方長按貼上，或改用手機 Chrome／Safari 開啟快導。
                </p>
              )}
              <label htmlFor="dispatch-input">手動貼上派單文字</label>
              <textarea
                id="dispatch-input"
                aria-label="派單原始文字"
                value={raw}
                onChange={(event) => {
                  parseText(event.target.value);
                  setNotice(
                    event.target.value.trim()
                      ? "已解析輸入內容，請確認下方結果"
                      : "請先複製派單文字，再按下方的「貼」",
                  );
                }}
                onPaste={handleManualPaste}
                placeholder="在這裡長按，選擇「貼上」"
                rows={4}
                spellCheck={false}
              />
              <button
                className="manual-close-button"
                type="button"
                onClick={() => {
                  setShowManualInput(false);
                  setClipboardBlocked(false);
                }}
              >
                收合手動輸入
              </button>
            </div>
          ) : raw ? (
            <button
              className="manual-paste-button"
              type="button"
              onClick={() => {
                setShowManualInput(true);
                window.setTimeout(
                  () => document.getElementById("dispatch-input")?.focus(),
                  0,
                );
              }}
            >
              查看或修改原始文字
            </button>
          ) : null}
          {notice && (
            <p className="notice" role="status" aria-live="polite">
              {notice}
            </p>
          )}

          <details className="settings-panel">
            <summary>設定</summary>
            <div className="setting-row">
              <label htmlFor="default-city">地址缺少縣市時</label>
              <select
                id="default-city"
                value={defaultCity}
                onChange={(event) => handleCityChange(event.target.value)}
              >
                <option value="台中市">補上台中市</option>
                <option value="">不要自動補上</option>
              </select>
            </div>
            {!isStandalone && !installPrompt && (
              <p className="install-help">
                {isIos
                  ? "iPhone 可由分享選單加入主畫面"
                  : "可由瀏覽器選單加入主畫面"}
              </p>
            )}
            <p className="install-help">
              僅統計使用事件；派單、地址與座標不會送出
            </p>
          </details>
        </section>

        {raw.trim() && (
          <section
            id="result-card"
            ref={resultCardRef}
            className="card result-card"
            aria-labelledby="result-title"
          >
          <div className="section-heading result-heading">
            <h2 id="result-title">
              {result.kind === "coordinates"
                ? "要導航的座標"
                : result.mapsMode === "search"
                  ? "要搜尋的地點"
                  : "要導航的地址"}
            </h2>
            <div className={`status-badge ${statusCopy.tone}`}>
              <span>{statusCopy.label}</span>
              <small>{statusCopy.detail}</small>
            </div>
          </div>

          <label className="destination-label" htmlFor="destination-input">
            確認目的地
          </label>
          <textarea
            id="destination-input"
            className="destination-input"
            value={result.query}
            onChange={(event) => editDestination(event.target.value)}
            rows={2}
          />

          {result.warnings.length > 0 && (
            <div className="warning-panel" role="alert">
              <strong>請確認地點</strong>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {hasChanges && (
            <div className="changes-panel">
              <h3>解析異動</h3>
              {result.additions.length > 0 && (
                <div className="change-row">
                  <span className="change-label">系統補上</span>
                  <div className="chips additions">
                    {result.additions.map((addition) => (
                      <span key={addition}>{addition}</span>
                    ))}
                  </div>
                </div>
              )}
              {result.note && (
                <div className="change-row">
                  <span className="change-label">行程備註</span>
                  <div className="chips notes">
                    <span>{result.note}</span>
                  </div>
                </div>
              )}
              {result.prefixes.length > 0 && (
                <div className="change-row">
                  <span className="change-label">移除前碼</span>
                  <div className="chips removed">
                    {result.prefixes.map((prefix) => (
                      <span key={prefix}>{prefix}</span>
                    ))}
                  </div>
                </div>
              )}
              {result.suffixes.length > 0 && (
                <div className="change-row">
                  <span className="change-label">車隊資訊</span>
                  <div className="chips metadata">
                    {result.suffixes.map((suffix) => (
                      <span key={suffix}>{suffix}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.status !== "invalid" ? (
            <div className="result-actions">
              <button
                className="maps-button"
                type="button"
                onClick={() => {
                  trackAnalyticsEvent({
                    name: "maps_open_click",
                    params: {
                      entry_point: "current_result",
                      launch_mode: getLaunchMode(),
                      maps_mode: result.mapsMode,
                      parse_status: result.status,
                      query_kind: result.kind,
                    },
                  });
                  openMapsUrl(result.mapsUrl);
                }}
              >
                <span>
                  {result.mapsMode === "search" ? "查看相似地點" : "查看路線"}
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          ) : (
            <button className="maps-button disabled" disabled type="button">
              請先輸入可導航文字
            </button>
          )}
          </section>
        )}

        {addressHistory.length > 0 && (
          <section
            className="card history-card"
            aria-labelledby="history-title"
          >
            <div className="section-heading history-heading">
              <div>
                <h2 id="history-title">最近地址</h2>
                <p>{addressHistory.length} 筆 · 本機保存</p>
              </div>
              <button
                className="text-button"
                onClick={clearAddressHistory}
                type="button"
              >
                清除紀錄
              </button>
            </div>
            <ol className="history-list">
              {addressHistory.map((entry) => (
                <li key={entry.id}>
                  <button
                    className="history-address"
                    type="button"
                    onClick={() => loadHistoryEntry(entry)}
                  >
                    <strong>{entry.address}</strong>
                    <small>{formatHistoryTime(entry.savedAt)} · 點一下帶回確認</small>
                  </button>
                  <div className="history-actions">
                    <button
                      className="history-map-button"
                      type="button"
                      onClick={() => {
                        trackAnalyticsEvent({
                          name: "maps_open_click",
                          params: {
                            entry_point: "history",
                            launch_mode: getLaunchMode(),
                            maps_mode: getMapsMode(entry.address),
                            parse_status: "history",
                            query_kind: "history",
                          },
                        });
                        openMapsUrl(buildMapsUrl(entry.address));
                      }}
                      aria-label={`在 Google Maps 查看 ${entry.address}`}
                    >
                      地圖
                    </button>
                    <button
                      className="history-delete-button"
                      type="button"
                      onClick={() => deleteHistoryEntry(entry.id)}
                      aria-label={`刪除 ${entry.address} 的紀錄`}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="site-footer">
          <Link href="/privacy/">隱私與資料使用</Link>
        </footer>
      </div>
    </main>
  );
}
