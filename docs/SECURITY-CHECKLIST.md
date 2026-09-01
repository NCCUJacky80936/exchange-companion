# 資安上線檢查表

「功能會動」不代表「可以上線」。這份清單是 Exchange Companion 模板的 release gate：只要有 High／Critical 風險、未驗證的資料權限或外洩的 secret，就先停止部署。

## 先跑自動檢查

```bash
npm run security:check
npm run audit:production
npm run check
```

- `security:check` 會掃描常見憑證、公開環境變數、RLS、CORS、輸入上限、rate limit 與網站安全標頭。
- `audit:production` 檢查正式環境 npm dependencies 的 High／Critical 已知漏洞。
- `check` 會重跑完整 build、lint、單元測試與 rendered HTML 測試。
- GitHub 另外以 secret scanning、push protection、Dependabot 與 CodeQL 持續檢查；工具沒有發現問題，不等於人工驗收可以省略。

## 一、哪些東西被偷會出大事？

### Secret 與付費服務

- 只允許 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 進前端。Publishable key 不是授權機制，真正的資料權限仍靠 RLS。
- `SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_SECRET_KEYS`、database password、Telegram Bot Token、Webhook Secret 與 `exchange-concierge-connection.json` 只放在後端 secret store 或 gitignored `work/`。
- 不要把正式 `.env`、匯出的 Auth 使用者、資料庫 dump 或真實交換文件加入 template。
- 目前專案沒有 OpenAI、Claude、金流或其他按次付費 API，因此 API 扣款上限目前為「不適用」。未來若新增付費服務，必須先完成後端代理、每位使用者與每個 IP 的 rate limit、每日／每月硬上限、用量警報與供應商 spend cap，才可上線。

### PII 與瀏覽器儲存

- `localStorage` 未加密，只能放一般待辦、預算摘要、行李與去識別化行程。
- 不保存密碼、API key、護照或身分證號、完整卡號、銀行資料、健康文件、訂位代碼、房號與精確住址。
- AI 提案只保留必要摘要、來源標籤、日期與可信度；原始 Email、附件與證件留在原系統。
- 上線前以無痕視窗、不同瀏覽器 profile 與登出狀態確認私人內容沒有出現在 HTML、快取、分享 payload、log 或錯誤訊息。

## 二、誰能碰哪些資料？

- 每一張 `public` table 都啟用 RLS；權限規則檢查 `auth.uid()`、永久帳號狀態與旅行成員／分享授權。
- `concierge_*`、`telegram_*` 與 rate-limit table 對 `anon`、`authenticated` 採 deny-all，只允許 server-only role。
- Edge Function 查詢私人資料時同時綁定使用者 ID 與連線 ID，不能只相信 request 裡的物件 ID。
- 新 table、view、sequence 與 function 採 deny-by-default；建立 migration 時要明確 GRANT，不能沿用 public schema 的寬鬆預設。
- 匿名 Auth 只用於兌換旅行分享連結，不能讀取 profile、私人手帳或 Concierge 資料。

必測的 IDOR 情境：

1. 使用者 A 登入後，把 `user_id`、`plan_id`、`connection_id`、`runId` 改成使用者 B 的值。
2. 對讀取、更新、刪除與 RPC 各測一次。
3. 預期結果只能是空集合、`401`、`403` 或 `404`；使用者 B 的資料與 revision 不得改變。
4. 登出或匿名旅行訪客重跑同一組測試，確認只能看到已授權的單趟旅行白名單欄位。

`supabase/tests/production_boundaries.test.sql` 與 Telegram 的 pgTAP 測試會固定這些規則。部署 migration 後仍要在 staging 以兩個測試帳號重跑，不能只依賴前端畫面。

## 三、哪一段是你管不到的？

- 不信任按鈕是否顯示、React state、localStorage、query string、價格、權限旗標或前端驗證結果。
- Auth、所有權、scope、revision、提案狀態與 rate limit 都由 Supabase Auth、RLS、RPC 或 Edge Function 重新驗證。
- Service-role 永不進瀏覽器；Edge Function 回應採 `Cache-Control: no-store`，避免私人 JSON 被中介快取。
- 目前沒有計費、扣點或付款流程。未來若加入，金額、折扣、餘額、冪等鍵與交易狀態全部在後端計算及寫入。

## 四、哪些規則絕對不能被打破？

- 只接受 `application/json`，在 JSON parsing 前先檢查 byte size；私人 state、旅行 payload 與提案 bundle 的資料庫上限都是 2 MiB。
- 對 action、欄位白名單、字串長度、enum、URL、日期、整數範圍與陣列數量逐項驗證。不要直接把任意物件展開進資料庫。
- Telegram 只接受私人一對一訊息、4096 個 Unicode 字元以內；update ID 冪等，未解佇列每個連線最多 50 筆。
- Concierge 每個永久帳號或 Agent 連線每 5 分鐘最多 120 次請求，版本衝突不能靜默覆蓋。
- 使用 React 文字節點呈現使用者內容，不使用未消毒的 HTML；新增 `dangerouslySetInnerHTML` 時必須說明固定來源與 escaping。

## 五、外面有哪些門是開著的？

- 正式站只公開網站本身、Supabase HTTPS Data API／Auth 與兩個必要 Edge Functions。不要公開測試 API、debug route、管理介面、資料庫密碼或 Swagger 文件。
- 網站回應包含 CSP、`nosniff`、禁止 iframe、Referrer Policy、Permissions Policy 與 HTTPS HSTS。
- `exchange-concierge-sync` 只回應 `EXCHANGE_COMPANION_URL` 及 `EXCHANGE_COMPANION_ALLOWED_ORIGINS` 的精確 Origin；禁止 `*`，沒有 Origin 的已驗證 Agent request 仍可使用。
- 瀏覽器應透過 Supabase Data API，不要連到 Postgres `5432`／pooler，也不要把 connection string 放進前端。若後端有固定出口 IP，再於正式 Supabase 專案設定 Database Network Restrictions。
- 開發與正式環境使用不同 Supabase project、Auth redirect、Telegram Bot／Webhook Secret 與資料。不要拿正式資料庫跑測試或 migration reset。

## 修補與驗證順序

1. **Scan & identify**：跑本地 gate、GitHub CodeQL／Dependabot／secret scanning，並查看 Supabase Security Advisor。
2. **Understand risk**：先處理 secret 外洩、未授權存取、跨帳號 IDOR 與可遠端執行程式碼等 High／Critical 問題。
3. **Patch & isolate**：secret 移到後端、縮小 GRANT／RLS／CORS、補輸入邊界，且不以刪資料或重建 production 代替修補。
4. **Verify & guardrail**：用無 Token、錯 Token、過期 Token、另一位使用者 ID、超大 body、錯誤 Content-Type、重複 request 與不允許的 Origin 實測。

## 免費方案的現實邊界

- Supabase TOTP MFA API 可免費使用，但這個模板目前還沒有 end-user MFA enrollment／challenge UI；若要承載更敏感資料，應先補完流程與 AAL2 後端政策。專案擁有者自己的 GitHub、Supabase 與 Cloudflare 帳號應立即啟用 MFA。
- Supabase leaked-password protection 目前只在 Pro 以上提供；免費部署用 8 字元以上且含英文字母、數字的密碼、登入 rate limit 與可選 CAPTCHA 補強，但不能把它寫成「等同 leaked-password protection」。
- 免費額度與供應商條款會變動。每次 release 重新確認方案、用量與警報；不要因目前沒有帳單就假設永遠不會產生成本。
