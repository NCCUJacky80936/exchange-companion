# 免費雲端設定

雲端是選配；沒設定時網站仍可完整本機使用。免費方案的額度與條款可能改變，建立前請查看供應商當下方案。

## Supabase

1. 建立自己名下的新 Supabase project。
2. 連結本 repository 的 `supabase/` 設定。
3. 依時間順序套用 `supabase/migrations/` 內的所有 migration。
4. 部署 `exchange-concierge-sync` Edge Function（`verify_jwt = false` 是刻意設定；Function 會自行區分使用者 JWT 與可撤銷 Agent token）。一定要先套用 migration，讓後端 rate-limit RPC 存在，再發布 Function。
5. 將自己的網站網址加入 Auth site URL／redirect allowlist。
6. 複製 `.env.example` 為 `.env.local`，填入 `PUBLIC_SITE_URL`、Supabase public URL 與 publishable key。`PUBLIC_SITE_URL` 用來產生 canonical、robots 與 sitemap；請填正式站的 origin，不要加路徑。
7. 測試建立帳號、登入、私人版本同步、Agent 首次連結／撤銷／過期／版本衝突、提案收件匣，以及旅行唯讀／共編連結、指定帳號、到期與撤銷。

啟用雲端後，網站採 login-first：未登入時只顯示登入／建立帳號頁，完成帳號手帳載入後才進私人主畫面。若帳號還沒有雲端手帳，系統會建立一份乾淨的私人手帳，不沿用上一位使用者的 localStorage。持有旅行分享連結的匿名訪客是唯一例外，而且只能看到該趟旅行；私人交換進度不會先載入再隱藏。

### 正式環境安全設定

- Auth 密碼至少 8 個字元，包含英文字母與數字；啟用 secure password change。`supabase/config.toml` 是本機／新專案基準，既有正式 project 仍要到 Dashboard 核對。
- 保留 Auth、匿名登入與資料 API 的速率限制。公開註冊若遭濫用，再加 Turnstile／hCaptcha；CAPTCHA secret 只能存在 Supabase Auth 設定。
- Supabase TOTP MFA API 可免費使用，但模板目前未實作 end-user MFA 畫面。若要儲存更敏感內容，應先完成 enrollment、challenge、verify 與 AAL2 RLS；專案擁有者自己的 Supabase／GitHub 帳號則應立即開啟 MFA。
- Leaked-password protection 是 Supabase 付費功能，免費方案不能假裝已啟用；以強密碼、rate limit、MFA 與最小資料原則降低風險。
- 瀏覽器只走 HTTPS Data API，不使用 Postgres connection string。若正式後端有固定出口 IP，再設定 Database Network Restrictions；不要把 `0.0.0.0/0` 當成完成安全設定。
- 開發與正式環境使用不同 Supabase project、redirect allowlist、Secrets 與 Telegram Bot。測試不可對正式資料執行 reset、seed 或破壞性 migration。

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
     EXCHANGE_COMPANION_ALLOWED_ORIGINS="<選填：以逗號分隔的 preview／staging origins>" \
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

`EXCHANGE_COMPANION_URL` 同時是正式網站連結與瀏覽器 CORS 白名單。只填 origin，例如 `https://planner.example.com`；不要使用 `*`。Agent 的 server-to-server request 沒有 Origin，仍必須通過 Bearer token、scope、到期、revision 與每 5 分鐘 120 次的 rate limit。

不要把 database password、service-role key、access token 或 `.env.local` 提交到 GitHub。

AI 頁面下載的 `exchange-concierge-connection.json` 也是私人憑證，只能放在已由 Git 忽略的 `work/`。它不包含 Supabase server secret，權限限制為讀取該帳號目前旅程的最新狀態與提交 pending proposal；不能套用提案或直接寫入手帳。網站每次儲存都會增加 revision，舊 Agent 結果會因版本衝突被拒絕。

目前模板已有 Email＋密碼登入，但尚未提供忘記密碼與 end-user MFA 流程。正式公開註冊前，必須完成可信任 SMTP、Email confirmation、密碼重設、redirect allowlist、帳號恢復與隱私測試；若未完成，應限制為受控測試帳號。

完整驗收請依 [資安上線檢查表](SECURITY-CHECKLIST.md) 執行，尤其要用兩個測試帳號驗證 IDOR、匿名旅行分享、錯誤 Origin、超大 body、重複 request 與撤銷後存取。
