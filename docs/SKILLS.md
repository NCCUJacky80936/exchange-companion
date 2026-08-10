# 專案 Skills

repository 內建於 `.agents/skills/`，在支援 project-local skills 的 Codex／agent 環境開啟本專案即可使用，不必全域安裝。

## `$create-exchange-companion`

適用：第一次建立個人交換手帳、改目的地、重做視覺、全面驗證、設定免費雲端或部署。

範例：

> 使用 $create-exchange-companion，將這個模板改成我去日本早稻田大學交換的網站。所有資料來源先詢問授權，先完成本機版並驗證，再一次上雲。

## `$exchange-concierge`

適用：抓最新信件／檔案進度、重新查核官方規定、依季節找行李影片、將新證據轉成網站可審核提案。

範例：

> 使用 $exchange-concierge，只讀取我指定的交換資料夾和學校寄件者，增量整理最近兩週進度，產生提案 JSON，不要直接改網站狀態。

信箱不綁定模板作者。Skill 會優先使用目前使用者在 Codex／agent 環境中自行連接的 Gmail，第一次執行時確認帳號、寄件者／網域、關鍵字與日期範圍。若沒有 Gmail connector，也可授權 Gmail Takeout `.mbox` 或 `.eml` 資料夾。Repository 不提供共用 OAuth client、token 或預設私人帳號。

若希望重複使用相同搜尋範圍，可把 Skill 內的 `assets/email-sources.example.json` 複製到 gitignored 的 `work/email-sources.json` 再填入自己的帳號與 query；不要把真實帳號或查詢設定寫回分發用範例。

## 平台能力

完整流程可能使用環境提供的瀏覽、Gmail／Drive／Calendar、image generation、Supabase 與 site hosting skills。這些屬於使用者的 Codex／平台能力，不會把帳號或憑證打包進 repository。缺少某個 connector 時，Skill 會改用使用者提供的檔案或公開網頁，不應偽造已讀取的內容。
