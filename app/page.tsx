"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildMapsUrl,
  canQuickNavigate,
  parseDispatch,
  type ParsedDispatch,
} from "./lib/parse-dispatch";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function getStatusCopy(result: ParsedDispatch) {
  if (result.status === "ready") {
    return { label: "可以導航", detail: "門牌資料完整", tone: "ready" };
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
  const [notice, setNotice] = useState("請先複製派單文字，再按上方按鈕");
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualPasteShouldNavigate, setManualPasteShouldNavigate] =
    useState(false);

  const parseText = useCallback(
    (text: string) => {
      const parsed = parseDispatch(text, defaultCity);
      setRaw(text);
      setResult(parsed);
      return parsed;
    },
    [defaultCity],
  );

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
        await navigator.serviceWorker.ready;

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
              if (canQuickNavigate(sharedResult)) {
                setNotice("地址完整，正在開啟 Google Maps");
                window.location.assign(sharedResult.mapsUrl);
                return;
              }
              setNotice("分享文字需要確認，已停在解析結果");
              window.setTimeout(
                () =>
                  document
                    .getElementById("result-card")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                0,
              );
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
  }, [defaultCity]);

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
      setNotice("這個瀏覽器不允許按鈕讀取剪貼簿，請長按輸入框貼上");
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
      return text;
    } catch {
      setNotice("瀏覽器沒有取得貼上權限，請長按輸入框貼上");
      setShowManualInput(true);
      window.setTimeout(
        () => document.getElementById("dispatch-input")?.focus(),
        0,
      );
      return null;
    }
  }

  async function handleQuickNavigate() {
    const text = await readClipboardText();
    if (!text) {
      setManualPasteShouldNavigate(true);
      return;
    }
    setManualPasteShouldNavigate(false);

    const parsed = parseText(text);
    if (canQuickNavigate(parsed)) {
      setNotice("地址完整，正在開啟 Google Maps");
      window.location.assign(parsed.mapsUrl);
      return;
    }

    setNotice("這筆有需要確認的內容，已先停下來讓你核對");
    window.setTimeout(
      () =>
        document
          .getElementById("result-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function handleManualPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const parsed = parseText(text);
    if (manualPasteShouldNavigate && canQuickNavigate(parsed)) {
      setManualPasteShouldNavigate(false);
      setNotice("地址完整，正在開啟 Google Maps");
      window.location.assign(parsed.mapsUrl);
      return;
    }
    setManualPasteShouldNavigate(false);
    setNotice(
      canQuickNavigate(parsed)
        ? "已貼上並完成解析，尚未開啟地圖"
        : "這筆有需要確認的內容，已先停下來讓你核對",
    );
  }

  function clearAll() {
    setRaw("");
    setResult(parseDispatch("", defaultCity));
    setNotice("已清除，請貼上下一筆派單文字");
    document.getElementById("dispatch-input")?.focus();
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
      status: value.trim().length >= 3 ? "review" : "invalid",
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
          複製派單後點一下，系統會清理代碼並開啟導航；有疑慮才停下確認。
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
            <h2 id="input-title">開始導航</h2>
            {raw && (
              <button className="text-button" onClick={clearAll} type="button">
                清除
              </button>
            )}
          </div>

          <button
            className="quick-button"
            onClick={() => void handleQuickNavigate()}
            type="button"
          >
            <span className="quick-button-icon" aria-hidden="true">
              →
            </span>
            <span>
              <strong>貼上並導航</strong>
              <small>使用剛複製的派單文字</small>
            </span>
          </button>
          <p className="quick-safety">
            補城市、括號異常或地標描述會先停下，避免導錯地點。
          </p>

          {showManualInput || raw ? (
            <div className="manual-input-wrap">
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
                      : "請先複製派單文字，再按上方按鈕",
                  );
                }}
                onPaste={handleManualPaste}
                placeholder="在這裡長按，選擇「貼上」"
                rows={4}
                spellCheck={false}
              />
            </div>
          ) : (
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
              無法自動貼上？改用手動貼上
            </button>
          )}
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
            className="card result-card"
            aria-labelledby="result-title"
          >
          <div className="section-heading result-heading">
            <h2 id="result-title">
              {result.kind === "landmark" ? "要搜尋的地標" : "要導航的地址"}
            </h2>
            <div className={`status-badge ${statusCopy.tone}`}>
              <span>{statusCopy.label}</span>
              <small>{statusCopy.detail}</small>
            </div>
          </div>

          <label className="destination-label" htmlFor="destination-input">
            確認導航目的地
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
            可以先手動修正；內容不會上傳，分享文字讀取後即刪除。
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
            <a className="maps-button" href={result.mapsUrl}>
              <span>開啟 Google Maps</span>
              <span aria-hidden="true">→</span>
            </a>
          ) : (
            <button className="maps-button disabled" disabled type="button">
              請先輸入可導航文字
            </button>
          )}
          <p className="maps-disclosure">
            按下後，只有上方確認過的地址會交給 Google Maps。
          </p>
          </section>
        )}

        <footer>
          <span>內容只在本機解析</span>
          <span>分享文字僅暫存至讀取完成</span>
        </footer>
      </div>
    </main>
  );
}
