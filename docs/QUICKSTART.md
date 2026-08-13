# 快速開始

## 1. 複製模板

在 GitHub 按「Use this template」，建立自己的 repository；或執行：

```bash
git clone https://github.com/NCCUJacky80936/exchange-companion.git
cd exchange-companion
npm install
```

需要 Node.js `22.13` 以上。

## 2. 選擇交換目的地

```bash
npm run setup
npm run doctor
```

設定存在 `config/exchange-profile.json`。你可以重跑初始化，也可以直接編輯後執行 `npm run validate:profile`。

## 3. 開啟網站

```bash
npm run dev
```

瀏覽 `http://localhost:3000/`。未設定雲端時是純本機模式，不需要帳號或 AI 額度；若 `.env.local` 已連接 Supabase，會先看到登入頁，登入並載入該帳號手帳後才進主畫面。新手完成目的地資料後會先看到首頁啟用指南；舊手帳會直接保留在日常控制台。

## 4. 讓 Codex 補齊內容

在 repository 內要求 Codex 使用 `$create-exchange-companion`。Codex 會先確認你願意授權的資料範圍。

正式雲端版第一次連結：

1. 在網站首頁的啟用指南複製 Skill 安裝指令，貼到自己的 Codex 任務。
2. 等 Codex 回報 Skills 已可使用，再回網站下載 `exchange-concierge-connection.json`。
3. 不要打開或分享連結檔；回到同一個 Codex 任務，直接把完整檔案當附件加入。
4. 在網站複製「第一次整理指令」，貼到剛才附檔的 Codex 任務並送出。
5. 只授權你願意提供的精確信箱、檔案、網址、行事曆與日期範圍。
6. Codex 回報已送出提案後，回網站按「檢查提案收件匣」。看到待確認提案即完成。

之後 `$exchange-concierge` 每次先讀雲端最新手帳，再送回待審提案，不必反覆下載 JSON。純本機或連線不可用時，AI 頁仍可下載最新交接檔並匯入回傳 bundle。兩種方式都不會自動套用，必須回到網站審核。

## 5. 上版前

```bash
npm run check
```

通過後再依 `docs/CLOUD.md` 和 `docs/DEPLOYMENT.md` 設定自己的免費雲端與網址。
