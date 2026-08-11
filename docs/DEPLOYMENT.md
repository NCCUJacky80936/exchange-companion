# 部署

## Gate

```bash
npm run check
```

並實際檢查 `390×844`、`768×1024`、`1440×900`。確認 `.openai/hosting.json` 沒有別人的 `project_id`，`supabase/config.toml` 沒有別人的正式網址。

## Codex Sites

如果環境提供 Sites hosting，請 Codex 使用 `$create-exchange-companion` 完成最後驗證並建立一個屬於你的新站點。第一次部署後取得的 project binding 只留在自己的部署環境，不要提交到公開模板。

`NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 雖由 Sites 保存，但也必須在 production build 當下提供給前端打包。更新既有站點時，先讀取該站目前的環境設定，再只在建置程序中傳入；不要寫入 `.env`、Git 或公開模板。完成部署後必須用全新瀏覽器狀態確認第一個畫面是登入／建立帳號，而不是本機主畫面。

正式發布包一律使用 `npm run build:production`；它會在缺少公開 Supabase 設定，或設定沒有真正進入前端檔案時中止，避免發布出看得到登入頁、卻無法送出登入的版本。

若正式站顯示「免費雲端尚未建立」或登入按鈕停用，應視為建置失敗並停止發布；不要把這種降級畫面當成可接受的正式版本。

## Cloudflare Workers

正式站若啟用 Agent 雲端連結，先把 `supabase/migrations/` 套用到自己的 Supabase 專案，再部署 `exchange-concierge-sync` Edge Function。這個 Function 使用 Supabase 自動提供的 server-side secret，不能把 secret 寫入前端環境或 Git：

```bash
npx supabase db push
npx supabase functions deploy exchange-concierge-sync --no-verify-jwt
```

Edge Function 會自行驗證登入者或可撤銷的 Agent token；Agent token 只能讀取一趟旅程的最新版本並提交 pending proposals。

第一次使用 Wrangler 時，先登入自己的 Cloudflare 帳號：

```bash
npx wrangler login
```

若帳號底下有多個 Cloudflare account，先將目標帳號的 ID 設為本機／部署環境的 `CLOUDFLARE_ACCOUNT_ID`，或在自己的 Wrangler 設定加入 `account_id`；不要把個人帳號 ID 寫回公開模板。

```bash
npm run deploy:preflight
npm run deploy:cloudflare
```

第一個指令只確認目前登入的 Cloudflare 帳號；第二個會重新執行全部檢查、production build，然後部署 `dist/server/wrangler.json`。部署前請先確認當下免費方案與帳號額度。

## 其他 hosting

也可部署到相容的 Cloudflare Workers 環境。若改用其他平台，先確認 Vinext／Worker build 支援、環境變數、PWA、SPA／RSC routes 與分享連結的重整行為。

部署完成後，重新測試首頁、設定、旅行分享、手機安裝與社群預覽。記錄 public URL 與被驗證的 Git commit。
