# 快導｜派單文字導航助手

手機優先的派單文字導航工具。將已知前碼、尾碼與備註拆開，完整門牌可直接開啟 Google Maps，有疑慮的內容則先讓使用者確認。

正式網址：<https://exe7203.github.io/>

## 目前功能

- 貼上或手動輸入派單文字並即時解析
- 只從字串開頭、結尾移除白名單格式
- 顯示移除前碼、尾碼、保留備註與系統補字
- 完整門牌、地標搜尋詞與可疑文字分級提示
- 可選擇是否將缺少縣市的門牌補為台中市
- 地址可修改後再開啟 Google Maps
- PWA 主畫面安裝、離線應用外殼與 Android 分享接收設定
- 原始派單內容只在瀏覽器本機處理，不保存歷史

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
