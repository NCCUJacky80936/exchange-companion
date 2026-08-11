# 架構

## 可替換設定

`config/exchange-profile.json` 控制網站名稱、使用者、出發地、交換國家／城市／學校、計畫、日期、時區、幣別、語言、圖片路徑與研究新鮮度。Schema 位於同資料夾。

## 資料層

- `app/lib/default-data.ts`：依 profile 產生通用旅程與相對期限。
- `app/lib/storage.ts`：localStorage、備份與還原。
- `app/lib/ai-import.ts`：AI 提案匯入、套用、忽略與復原。
- `app/lib/concierge-handoff.ts`：產生自我說明的 AI 交接檔；`state` 是當下資料，`editableSurfaces` 是完整欄位地圖，`setupSnapshot` 是第一次建站後鎖定的幣別／時區／文案／視覺背景。
- `app/lib/cloud.ts`：選配 Supabase 私人同步與旅行分享。
- `app/lib/types.ts`：網站與 import bundle 的共用 entity 定義。

## 自動化層

- `$create-exchange-companion`：完整製作／部署 orchestrator。
- `$exchange-concierge`：證據與 current-state reconciliation。
- `$exchange-email-intake`：只讀目前使用者明確授權的信件範圍，將去敏證據交給 Concierge。
- `scripts/`：初始化、profile、Skill、隱私與環境檢查。

公開網站不內建固定付費 AI 呼叫。Codex 在使用者授權的工作環境完成研究與整理，網站只接收可審核提案，避免把私密來源或例行 token 成本綁進公開產品。
