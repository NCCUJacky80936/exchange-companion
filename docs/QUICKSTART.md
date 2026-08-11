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

瀏覽 `http://localhost:3000/`。未設定雲端時是純本機模式，不需要帳號或 AI 額度；若 `.env.local` 已連接 Supabase，會先看到登入頁，登入並載入該帳號手帳後才進主畫面。

## 4. 讓 Codex 補齊內容

在 repository 內要求 Codex 使用 `$create-exchange-companion`。Codex 會先確認你願意授權的資料範圍。之後到網站的 AI 整理頁下載最新交接檔並複製指令，交給 `$exchange-concierge` 產生可匯入的提案。提案不會自動套用，必須回到網站審核。

## 5. 上版前

```bash
npm run check
```

通過後再依 `docs/CLOUD.md` 和 `docs/DEPLOYMENT.md` 設定自己的免費雲端與網址。
