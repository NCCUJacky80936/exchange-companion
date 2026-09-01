# Security Policy

## 私下回報漏洞

請從這個 repository 的 **Security → Report a vulnerability** 私下回報。不要在公開 issue、討論區或截圖中貼出交換文件、Email、token、住址、帳戶、財力、簽證、健康或訂位資料。

回報時請提供受影響版本、重現步驟、預期與實際結果，以及已去識別化的證據。若疑似 secret 外洩，請先撤銷或輪替 credential，再進行後續調查；不要把 secret 本身附在訊息裡。

目前只維護 `main` 的最新版本。舊 fork 應先更新至最新 commit，再確認問題是否仍可重現。

## 安全邊界

- 瀏覽器完全不可信。私人資料的所有權由 Supabase RLS、後端查詢條件與 scoped RPC 共同檢查，不以「前端沒有顯示按鈕」代替授權。
- 前端只能取得 Supabase URL 與 publishable key。Service-role、database password、Telegram Bot Token、Webhook Secret 與 Agent token 不得放進 `NEXT_PUBLIC_*`、前端 bundle 或 Git。
- Exchange Concierge 與 Telegram 只能建立 `pending` 提案，不能直接套用手帳內容；連線可撤銷、會到期，更新使用 revision 防止覆蓋較新的狀態。
- 旅行分享與私人交換手帳分開；知道或修改物件 ID 不代表有權讀取、修改或刪除資料。
- Edge Functions 採精確 CORS 白名單、request body 上限、型別驗證與每個帳號／連線的 rate limit。Telegram Webhook 另以 secret token、私人對話限制、單次文字上限、冪等 update ID 與佇列上限防護。

## 已知限制

純本機模式會把手帳以未加密 JSON 儲存在瀏覽器 `localStorage`。它適合一般行前整理，不是密碼保管箱；同一個瀏覽器環境中的惡意程式碼或取得裝置存取權的人可能讀到內容。請勿記錄密碼、API key、護照或身分證號、完整卡號、訂位代碼、健康文件與精確住址。

完整威脅模型、上線門檻與模擬攻擊步驟請見 [資安上線檢查表](docs/SECURITY-CHECKLIST.md)。
