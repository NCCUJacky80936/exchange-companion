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

不要把 database password、service-role key、access token 或 `.env.local` 提交到 GitHub。

AI 頁面下載的 `exchange-concierge-connection.json` 也是私人憑證，只能放在已由 Git 忽略的 `work/`。它不包含 Supabase server secret，權限限制為讀取該帳號目前旅程的最新狀態與提交 pending proposal；不能套用提案或直接寫入手帳。網站每次儲存都會增加 revision，舊 Agent 結果會因版本衝突被拒絕。

目前免費手帳帳號不依賴 Email，也沒有忘記密碼流程。若自行加入 Email 或 OAuth，必須另外完成寄信、redirect、帳號恢復與隱私測試。
