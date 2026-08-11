# 免費雲端設定

雲端是選配；沒設定時網站仍可完整本機使用。免費方案的額度與條款可能改變，建立前請查看供應商當下方案。

## Supabase

1. 建立自己名下的新 Supabase project。
2. 連結本 repository 的 `supabase/` 設定。
3. 套用 `supabase/migrations/20260809163742_exchange_cloud_collaboration.sql`。
4. 將自己的網站網址加入 Auth site URL／redirect allowlist。
5. 複製 `.env.example` 為 `.env.local`，只填 public URL 與 publishable key。
6. 測試建立帳號、登入、私人同步、登出、旅行唯讀／共編連結、指定帳號、到期與撤銷。

啟用雲端後，網站採 login-first：未登入時只顯示登入／建立帳號頁，完成帳號手帳載入後才進私人主畫面。若帳號還沒有雲端手帳，系統會建立一份乾淨的私人手帳，不沿用上一位使用者的 localStorage。持有旅行分享連結的匿名訪客是唯一例外，而且只能看到該趟旅行；私人交換進度不會先載入再隱藏。

不要把 database password、service-role key、access token 或 `.env.local` 提交到 GitHub。

目前免費手帳帳號不依賴 Email，也沒有忘記密碼流程。若自行加入 Email 或 OAuth，必須另外完成寄信、redirect、帳號恢復與隱私測試。
