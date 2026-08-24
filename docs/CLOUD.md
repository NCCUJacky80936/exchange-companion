# 免費雲端設定

雲端是選配；沒設定時網站仍可完整本機使用。免費方案的額度與條款可能改變，建立前請查看供應商當下方案。

## Supabase

1. 建立自己名下的新 Supabase project。
2. 連結本 repository 的 `supabase/` 設定。
3. 依時間順序套用 `supabase/migrations/` 內的所有 migration。
4. 部署 `exchange-concierge-sync` Edge Function（`verify_jwt = false` 是刻意設定；Function 會自行區分使用者 JWT 與可撤銷 Agent token）。
5. 將自己的網站網址加入 Auth site URL／redirect allowlist。
6. 複製 `.env.example` 為 `.env.local`，只填 public URL 與 publishable key。
7. 測試建立帳號、登入、私人版本同步、Agent 首次連結／撤銷／過期／版本衝突、提案收件匣，以及旅行唯讀／共編連結、指定帳號、到期與撤銷。

啟用雲端後，網站採 login-first：未登入時只顯示登入／建立帳號頁，完成帳號手帳載入後才進私人主畫面。若帳號還沒有雲端手帳，系統會建立一份乾淨的私人手帳，不沿用上一位使用者的 localStorage。持有旅行分享連結的匿名訪客是唯一例外，而且只能看到該趟旅行；私人交換進度不會先載入再隱藏。

## Telegram Concierge（選配）

若想在 Telegram 透過自然語言即時傳送筆記並轉為待審提案，可啟用專屬 Telegram Bot：

1. 向 Telegram `@BotFather` 發送 `/newbot` 建立機器人，取得 `TELEGRAM_BOT_TOKEN` 與使用者名稱。
2. 部署兩個 Edge Functions：
   ```bash
   npx supabase functions deploy exchange-concierge-sync --no-verify-jwt
   npx supabase functions deploy telegram-concierge-webhook --no-verify-jwt
   ```
3. 設定 Supabase 後端 Secrets（請勿將 Token 寫入前端或 Git）：
   ```bash
   npx supabase secrets set \
     TELEGRAM_BOT_TOKEN="<你的_BOT_TOKEN>" \
     TELEGRAM_BOT_USERNAME="<你的_BOT_USERNAME>" \
     EXCHANGE_COMPANION_URL="<你的手帳網站正式網址>" \
     TELEGRAM_WEBHOOK_SECRET="<隨機產生的高強度密鑰字串>"
   ```
4. 向 Telegram 註冊 Webhook：
   ```bash
   curl -X POST "https://api.telegram.org/bot<你的_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/telegram-concierge-webhook","secret_token":"<你的_TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message"]}'
   ```
5. 登入手帳網站前往 AI 頁面，點選「產生配對碼」，在 Telegram 傳送 `/start <配對碼>` 完成綁定。

所有 Telegram 訊息一律只進入 `pending` 提案收件匣，不會直接修改手帳內容。

不要把 database password、service-role key、access token 或 `.env.local` 提交到 GitHub。

AI 頁面下載的 `exchange-concierge-connection.json` 也是私人憑證，只能放在已由 Git 忽略的 `work/`。它不包含 Supabase server secret，權限限制為讀取該帳號目前旅程的最新狀態與提交 pending proposal；不能套用提案或直接寫入手帳。網站每次儲存都會增加 revision，舊 Agent 結果會因版本衝突被拒絕。

目前免費手帳帳號不依賴 Email，也沒有忘記密碼流程。若自行加入 Email 或 OAuth，必須另外完成寄信、redirect、帳號恢復與隱私測試。
