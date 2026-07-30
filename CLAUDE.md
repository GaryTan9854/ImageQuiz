# ImageQuiz — CLAUDE.md

**Image Quiz Machine 圖片抽考機**：使用者上傳「已命名好資料夾」的圖庫，網站自動變成看圖辨識抽考。
來源是 Gary 提供的單檔 `Image_Quiz_v3.html`（完成度已高），**以 Parasitology 的網頁風格為基底**重寫成 visadelab app。

## 部署
- **MBA** = 開發（`~/Documents/ImageQuiz/`）。**MBP** = production（`gary@192.168.1.11`），PM2 `imagequiz`，**port 3025**，`~/imagequiz-dist`。
- URL: <https://imagequiz.visadelab.xyz>（Cloudflare tunnel ingress → 127.0.0.1:3025）。也從 MedTech portal 進入。
- Deploy: `cd ~/Documents/ImageQuiz && ./deploy.sh`。零依賴 node:http（+ node:sqlite 只用來記瀏覽次數）。無 build step。

## 資料完全在瀏覽器端
- 圖片**不上傳伺服器**：`<input webkitdirectory>` 讀進來 → `URL.createObjectURL` 顯示 → 存 IndexedDB（`imagequiz` / stores `images`+`meta`）。
- 因此下次再開網站會**自動還原上次的圖庫**（首頁顯示圖庫名與張數，可一鍵清除）。
- 空間不足（quota）時 catch 住，只是這次不記住，功能照常。
- server.js 沒有任何上傳 API，也沒有登入 —— 要控管請走 Cloudflare Zero Trust。

## 資料夾規則（public/js/app.js `parseFiles`）
上傳最外層資料夾後，**第一層一律丟掉**（那是你選的根目錄名），剩下：
| 剩餘層數 | 解讀 |
|---|---|
| ≥3（`分類/答案/…/檔名`） | `rest[0]`=分類、`rest[1]`=答案 |
| 2（`答案/檔名`） | 分類=「未分類」、`rest[0]`=答案 |
| 1（`檔名`） | 分類=「未分類」、答案=檔名去副檔名與尾端編號 |
- 過濾 `.` 開頭隱藏檔（`.DS_Store`、`._01.jpg`）與 `__MACOSX`。
- 支援 jpg/png/gif/webp/bmp/tiff/avif/svg；**HEIC/HEIF 只有 Safari 解得開**，其他瀏覽器會顯示「讀不出來」提示（建議先用 sips 轉 JPEG）。

## 三個畫面（hash 路由 `#home` / `#setup` / `#browse` / `#quiz`）
- **首頁**：三張大卡（上傳／瀏覽／抽考），沒圖庫時後兩張 disabled；下方顯示目前圖庫狀態＋清除鈕。
- **瀏覽**：左側分類清單、右側依「答案」分組的縮圖牆；點縮圖開 lightbox（← → 換圖、ESC 關）。
- **抽考**：勾選分類範圍 + 題數（10/20/30/無限）→ 四選一。干擾選項**優先取同分類的其他答案**，不足才從其他已勾選分類補（維持鑑別度）。答完顯示成績與答錯回顧（含縮圖、你的答案 vs 正解）。

## 鍵盤導覽（Gary 系統最重要原則）
- `TunaCursor`（copy 自 TunaVocab）：所有可操作元素標 `data-cursor`，↑↓←→ 幾何移動、Enter 觸發、ESC 走堆疊。
- 抽考另加 **1~4 直選**（`app.js` 尾端 capture-phase keydown）。答題後游標自動移到「下一題」。
- Lightbox 開著時 ← → 換圖（capture 攔截，`stopImmediatePropagation` 不讓 TunaCursor 搶走方向鍵）。

## 架構
```
server.js            # node:http：/api/health、/api/visit（node:sqlite ~/db/imagequiz）、靜態檔 + SPA fallback
public/index.html    # 殼：topbar（主題切換）+ 四個 <section class="view">
public/js/app.js     # IndexedDB + 解析資料夾 + 路由 + 瀏覽 + lightbox + 抽考
public/js/tunacursor.js
public/css/style.css # 直接沿用 Parasitology 的 CSS 變數與深/淺色切換
```

## 待辦
- [ ] GitHub private repo `GaryTan9854/ImageQuiz` + remote。
- [ ] 「輸入答案」模式（Parasitology 有；這裡目前只有四選一）。
- [ ] 答錯的題目加權重考（間隔複習）。
- [ ] 匯出／匯入圖庫（讓同學共用同一份題庫，不必各自上傳）。
