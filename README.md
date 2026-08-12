# 快導｜派單文字導航助手

手機優先的派單文字導航工具。將已知前碼、尾碼與備註拆開，整理出目的地後先讓使用者確認，再自行開啟 Google Maps 路線。

正式網址：<https://exe7203.github.io/>

## 目前功能

- 按右下角一次讀取剪貼簿並即時解析；瀏覽器封鎖時才顯示手動備援
- 只從字串開頭、結尾移除白名單格式
- 顯示移除前碼、尾碼、保留備註與系統補字
- 完整門牌、地標搜尋詞與可疑文字分級提示
- 可選擇是否將缺少縣市的門牌補為台中市
- 地址可修改後再開啟 Google Maps
- 解析後地址保留在目前裝置，清除輸入後仍可再次帶入或查看地圖
- PWA 主畫面安裝、離線應用外殼、首訪資源暖快取與 Android 分享接收設定
- 原始派單內容只在瀏覽器本機處理；歷史只保存清理後的地址，不保存派單原文

## 本機執行

```powershell
npm install
npm run dev
```

## 驗證

```powershell
npm test
```

## 產生 GitHub Pages 版本

```powershell
npm run build:static
```

靜態網站會輸出至 `docs/`。

解析規則集中在 `app/lib/parse-dispatch.ts`，新增派單格式時應同時補上 `tests/parser.test.mjs` 的案例。
