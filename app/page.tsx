"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMapsUrl,
  canQuickNavigate,
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

export default function Home() {
  const [defaultCity, setDefaultCity] = useState("台中市");
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState(() => parseDispatch("", "台中市"));
  const [notice, setNotice] = useState("請先複製派單文字，再按右下角的「貼」");
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [clipboardBlocked, setClipboardBlocked] = useState(false);
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
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
    };
    window.addEventListener("beforeinstallprompt", installHandler);

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
    setIsReadingClipboard(true);
    try {
      const text = await readClipboardText();
      if (!text) return;

      const parsed = parseText(text);
      rememberAddress(parsed);
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
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
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
            <p className="eyebrow">文字導航助手</p>
            <h1>快導</h1>
          </div>
          <span className="privacy-pill">本機解析</span>
        </div>
        <p className="header-copy">
          複製派單後點一下，系統會清理代碼並顯示路線；確認後再開始導航。
        </p>
        {!isStandalone && (
          <div className="install-row">
          {installPrompt ? (
            <button className="install-button" onClick={() => void installApp()}>
              ＋ 安裝快導
            </button>
          ) : isIos ? (
            <span className="install-state">iPhone 可由分享選單加入主畫面</span>
          ) : (
            <span className="install-state">可由瀏覽器選單加入主畫面</span>
          )}
          </div>
        )}
      </header>

      <div className="content-stack">
        <section className="card input-card" aria-labelledby="input-title">
          <div className="section-heading">
            <h2 id="input-title">查看路線</h2>
            {raw && (
              <button className="text-button" onClick={clearAll} type="button">
                清除目前內容
              </button>
            )}
          </div>

          <div className="paste-guidance" id="paste-button-help">
            <strong>按一次，直接貼上並解析</strong>
            <span>先複製派單文字，再按右下角的「貼」；不會自動開導航。</span>
          </div>

          <button
            className="quick-button"
            onClick={() => void handleQuickNavigate()}
            type="button"
            aria-describedby="paste-button-help"
            title="貼上剪貼簿並解析地址"
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
          <p className="quick-safety">
            補城市、括號異常或地標描述會先停下，避免導錯地點。
          </p>

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
                      : "請先複製派單文字，再按右下角的「貼」",
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
          <p className="notice" role="status" aria-live="polite">
            {notice}
          </p>

          <details className="settings-panel">
            <summary>導航設定</summary>
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
                : result.kind === "landmark"
                  ? "要搜尋的地標"
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
            aria-describedby="destination-help"
          />
          <p id="destination-help" className="helper-text">
            可以先手動修正；Google Maps 只會收到你按下按鈕時確認的目的地。
          </p>

          {result.warnings.length > 0 && (
            <div className="warning-panel" role="alert">
              <strong>導航前請確認</strong>
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
                  <span className="change-label">保留備註</span>
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
                  <span className="change-label">移除尾碼</span>
                  <div className="chips removed">
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
              <a
                className="maps-button"
                href={result.mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span>只在 Google Maps 顯示路線</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          ) : (
            <button className="maps-button disabled" disabled type="button">
              請先輸入可導航文字
            </button>
          )}
          <p className="maps-disclosure">
            按下後只顯示路線，由你在 Google Maps 內決定是否開始導航。
          </p>
          </section>
        )}

        {addressHistory.length > 0 && (
          <section
            className="card history-card"
            aria-labelledby="history-title"
          >
            <div className="section-heading history-heading">
              <div>
                <h2 id="history-title">最近貼上的地址</h2>
                <p>共 {addressHistory.length} 筆，只保留在這台裝置</p>
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
                    <a
                      className="history-map-button"
                      href={buildMapsUrl(entry.address)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`在 Google Maps 顯示 ${entry.address} 的路線`}
                    >
                      地圖
                    </a>
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

        <footer>
          <span>內容只在本機解析</span>
          <span>最近地址只保留在這台裝置</span>
        </footer>
      </div>
    </main>
  );
}
