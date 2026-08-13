import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隱私與資料使用｜快導",
  description: "快導的本機資料與 Google Analytics 4 使用說明。",
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <article className="privacy-document">
        <Link className="privacy-back" href="/">
          ← 回到快導
        </Link>
        <p className="privacy-eyebrow">資料使用說明</p>
        <h1>隱私與資料使用</h1>
        <p className="privacy-updated">最後更新：2026 年 8 月 13 日</p>

        <section>
          <h2>快導在本機處理的內容</h2>
          <p>
            派單文字、地址、座標、車隊資訊與備註只在你的瀏覽器中解析。最近地址保存在目前裝置的瀏覽器儲存空間，可在首頁清除紀錄；清除瀏覽器網站資料也會一併移除。
          </p>
        </section>

        <section>
          <h2>使用量統計</h2>
          <p>
            正式站使用 Google Analytics 4（GA4）了解整體使用情況，例如頁面開啟、貼上與解析結果類別、開啟地圖按鈕、安裝流程，以及一般瀏覽器或主畫面模式。GA4
            可能使用 Cookie 或裝置識別碼，並處理瀏覽器、裝置與約略區域等資訊。
          </p>
          <p>
            快導不會將派單原文、地址、座標、行程備註、地圖網址或本機地址歷史送到 GA4，也不建立司機帳號或 User-ID。
          </p>
        </section>

        <section>
          <h2>資料保留與你的選擇</h2>
          <p>
            GA4 的事件與使用者層資料目前設定保留 14 個月；Google 的標準彙總報表及平台處理另依 Google 政策。你可以透過瀏覽器封鎖或清除 Cookie、使用追蹤防護，或使用 Google
            提供的停用工具限制統計。停用後不影響快導的派單解析功能。
          </p>
          <p>
            Google 如何處理合作夥伴網站資料，請參閱
            <a
              href="https://policies.google.com/technologies/partner-sites?hl=zh-TW"
              target="_blank"
              rel="noreferrer"
            >
              Google 合作夥伴網站資料使用說明
            </a>
            。
          </p>
        </section>

        <section>
          <h2>聯絡方式</h2>
          <p>
            對快導的資料使用有疑問，可透過
            <a href="https://github.com/exe7203/exe7203.github.io/issues">
              快導 GitHub 專案 Issues
            </a>
            聯絡網站維護者。
          </p>
        </section>
      </article>
    </main>
  );
}
