# ✨ Discord Message Toolkit & Forward Manager

**為 Discord 注入強大的懸停工具列、社群網址轉換、媒體下載、進階轉發與蟲洞捷徑的全方位增強腳本。**

---

> 💡 **Overview**
> 本腳本旨在極大化 Discord 的操作效率與分享體驗。透過無縫整合的 UI，提供單鍵複製特定格式、修復社群媒體嵌入預覽（Twitter/X、Instagram、Pixiv 等）、一鍵打包下載媒體檔案，以及引入「蟲洞」跨頻道快速發送與進階轉發面板等次要強大輔助功能。

## 🎛 UI 進入點 (UI Entry Points)

安裝腳本後，您可以在 Discord 的不同介面角落找到專屬的整合按鈕。

| 圖示 | 功能名稱 | 描述說明 |
| --- | --- | --- |
| **⠿** | **訊息懸停工具列** | 滑鼠懸停於任意訊息右上角出現，提供複製、轉換、下載等核心操作。 |
| **📋** | **進階轉發面板** | 點擊 Discord 原生「轉發」按鈕後，於彈出視窗上方新增釘選頻道與模糊搜尋列。 |
| **😀** | **表情與 GIF 管理器** | 位於原生 Emoji/GIF 選擇器內，提供準心選取（Target Mode）與收藏庫功能。 |
| **🌀** | **蟲洞 (Wormhole)** | 預設停靠於頂部導航欄或輸入框上方，提供跨頻道快速跳轉與直接發送訊息捷徑。 |

*These icons act as the primary entry points for the script's features.*

---

## 🚀 Core Features

### 🛠️ 訊息複製與提取 (Message Utility)

提供多種實用的複製格式，精準提取訊息中的關鍵內容。

* **純文字與媒體網址**：一鍵提取純文字或隱藏於訊息中的圖片/影片直連。
* **乾淨連結 (Clean Link)**：自動去除網址中多餘的追蹤參數。
* **隱藏與 Markdown 格式**：支援快速將內容包裹為暴雷隱藏或 Markdown 格式。

```css
/* * 示意用結構程式碼：格式化輸出結構
 *
 * [Markdown 輸出格式]
 * [{text}]({url})
 *
 * [Spoiler 隱藏輸出格式]
 * || {text} ||
 */

```

### 🔁 社群網址自動轉換 (URL Conversion)

修復 Discord 對部分社群平台無法正確展開預覽的問題。

* **Twitter / X**：支援轉換為 `vxtwitter`, `fixupx` 等格式。
* **Instagram & Bilibili**：轉換為 `kkinstagram`, `FX Bilibili` 以顯示完整媒體預覽。
* **Pixiv**：轉換至 `phixiv` 讓插圖直接於對話中可見。
* **一鍵批次轉換**：偵測訊息內所有同類網址並一次替換。

### ⬇️ 媒體下載器 (Media Downloader)

* **單鍵下載**：快速下載該則訊息內附帶的所有圖片與影片。
* **ZIP 批次打包**：將多個媒體檔案自動打包為一個 `.zip` 檔案進行下載，省去逐一右鍵存檔的麻煩。

### 📋 進階轉發管理 (Forwarding Manager)

強化 Discord 原生的轉發視窗，提升多頻道管理效率。

* **頻道與用戶釘選 (★/👤)**：將常用轉發目標加入最愛，置頂顯示。
* **兩段式精準搜尋**：修復 Discord 轉發面板的搜尋 Bug，確保轉發目標無誤。
* **模糊搜尋 (⏎)**：支援輸入前綴快速匹配變動頻繁的頻道名稱。

### 🌀 蟲洞捷徑與 API 發送 (Wormhole)

打破頻道間的切換壁壘，建立專屬的傳送門。

* **單擊跳轉**：將常用的頻道 URL 建立為蟲洞，點擊立即飛躍。
* **跨頻道發送 (Shift+Click)**：免切換頻道，直接於當前畫面呼出輸入框傳送訊息至目標頻道。
* **API 隱匿模式 (彩蛋/實驗性)**：透過 Discord REST API 直接在背景發送訊息，無需跳頁且支援圖片剪貼簿。

---

## ⚠️ 實驗性功能與注意事項

* **API 發送模式風險**：蟲洞的「方案 B (API 模式)」會於背景攔截並使用使用者的 User Token 來呼叫 Discord API。此舉嚴格來說違反 Discord 服務條款 (ToS)，請自行評估風險。腳本已確保 Token 僅存於記憶體，重整即毀，絕不寫入磁碟或外傳。
* **網址轉換安全性**：`vxtwitter`, `kkinstagram` 等服務皆依賴第三方開源 API 提供媒體預覽，若您對第三方服務有疑慮，請避免點擊轉換選項。
* **DOM 依賴性**：本腳本高度依賴 Discord 當前的網頁 DOM 結構，若 Discord 官方進行大規模 UI 更新，部分功能（如懸停工具列或選單插入）可能暫時失效。

---

## ⚙️ Additional Features

* **自定義字串面板 (Custom Strings)**：允許使用者儲存常用的問候語、指令或文字模板，支援單擊複製或長按直接注入輸入框。
* **Observer 健康檢查**：內建 MutationObserver 狀態監控模組，可透過 Tampermonkey 選單隨時檢查監聽器是否正常運作，確保系統效能穩定。
* **設定匯出/匯入**：提供 JSON 格式的全域設定備份功能，方便在不同瀏覽器或裝置間無縫同步您的自訂蟲洞、收藏庫與介面配置。

---

## ⭐ Support the Project

If you feel this script is helpful to you, please consider visiting my GitHub repository to give it a ⭐.

[https://github.com/Startanuki07](https://github.com/Startanuki07)
