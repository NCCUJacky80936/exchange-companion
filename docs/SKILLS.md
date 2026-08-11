# 專案 Skills

repository 內建於 `.agents/skills/`，在支援 project-local skills 的 Codex／agent 環境開啟本專案即可使用，不必全域安裝。

新的 Session 請以 clone 後的 repository 根目錄開啟；這樣三個 project-local Skills 會自動被發現。網站下載的交接 JSON 也會攜帶 repository、Skill 路徑與必要指令；若目前 Session 沒有載入 Skill，Agent 必須先開啟該 repository 與 `SKILL.md`，不能自行猜另一套格式。

## `$create-exchange-companion`

適用：第一次建立個人交換手帳、改目的地、重做視覺、全面驗證、設定免費雲端或部署。

範例：

> 使用 $create-exchange-companion，將這個模板改成我去日本早稻田大學交換的網站。所有資料來源先詢問授權，先完成本機版並驗證，再一次上雲。

## `$exchange-concierge`

適用：抓最新信件／檔案進度、重新查核官方規定、依季節找行李影片、將新證據轉成網站可審核提案。

範例：

> 使用 $exchange-concierge，以網站剛下載的 exchange-concierge-input JSON 為目前進度，只讀取我指定的交換資料夾和學校寄件者，增量整理最近兩週進度，產生可回到網站匯入的提案 JSON，不要直接改網站狀態。

最穩定的入口不是只在對話中說「幫我整理」，而是先到網站 AI 整理頁按「交給 Exchange Concierge 整理」。網站會下載當下完整進度並複製含檔名的指令。Skill 會逐一核對個人旅程、任務、資源、行李與機票、課程／考試、旅行衝突及待辨識網址，最後輸出 `outputs/exchange-companion-import.json`。將該檔匯回網站後，結果才會出現在各分頁。

交接檔的 `state` 是目前進度；`editableSurfaces` 列出可提案更新的細部欄位，包括基礎預算與旅行巢狀資料；`setupSnapshot` 則是第一次建立國家、時區、幣別、文案與視覺時留下的背景，日常整理不會反覆修改。

## `$exchange-email-intake`

適用：需要從目前使用者自己的 Gmail、Outlook、`.mbox` 或 `.eml` 找交換進度時。它會先確認帳號、精確訊息或查詢、寄件者／網域、日期範圍，以及是否可讀附件名稱或內容，再把去敏的證據交給 `$exchange-concierge`。

範例：

> 使用 $exchange-email-intake，只搜尋我目前連接的學校信箱中，最近 30 天由交換學校網域寄來、主旨包含 housing 或 course 的信件；可讀正文與附件名稱，但不要開附件內容。整理後交給 $exchange-concierge。

信箱不綁定模板作者。`$exchange-email-intake` 會優先使用目前使用者在 Codex／agent 環境中自行連接的信箱，第一次執行時確認帳號、寄件者／網域、關鍵字與日期範圍。若沒有 connector，也可授權 Gmail Takeout `.mbox` 或 `.eml` 資料夾。Repository 不提供共用 OAuth client、token 或預設私人帳號。

若希望重複使用相同搜尋範圍，可把 Skill 內的 `assets/email-sources.example.json` 複製到 gitignored 的 `work/email-sources.json` 再填入自己的帳號與 query；不要把真實帳號或查詢設定寫回分發用範例。

## 平台能力

完整流程可能使用環境提供的瀏覽、Gmail／Drive／Calendar、image generation、Supabase 與 site hosting skills。這些屬於使用者的 Codex／平台能力，不會把帳號或憑證打包進 repository。缺少某個 connector 時，Skill 會改用使用者提供的檔案或公開網頁，不應偽造已讀取的內容。
