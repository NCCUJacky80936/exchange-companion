export const EXCHANGE_COMPANION_REPOSITORY = "https://github.com/NCCUJacky80936/exchange-companion";

export function buildSkillInstallPrompt(): string {
  return `請使用 $skill-installer，從公開 repository ${EXCHANGE_COMPANION_REPOSITORY} 一次安裝下列 GitHub 路徑：\n- .agents/skills/create-exchange-companion（$create-exchange-companion）\n- .agents/skills/exchange-concierge（$exchange-concierge）\n- .agents/skills/exchange-email-intake（$exchange-email-intake）\n\n請依 Skill Installer 的 GitHub repo/path 流程執行；若目的地已存在，不要覆蓋，先回報目前版本與差異。安裝完成後只回報實際可用的 Skill 名稱與位置，並提醒我從下一個 Codex turn 開始使用。不要搜尋、讀取或上傳我的私人信件、文件、token 或 connection 檔；這一步只安裝公開指令。`;
}

export function buildFirstConciergePrompt(): string {
  return `請使用 $exchange-concierge 連接我的交換手帳。我會另外附上 exchange-concierge-connection.json；它是私人憑證，請只存放在不會提交到 Git 的私人工作區，不要在回覆中貼出 token。\n\n開始前先讀取手帳最新狀態，列出你需要我明確授權的信件帳號與精確搜尋範圍、檔案／資料夾、網址及行事曆。若要讀信，先使用 $exchange-email-intake，且不得擴大我同意的帳號、寄件者、關鍵字或日期範圍。完成後把所有變更送回網站的待確認提案，不要直接套用或覆蓋手動紀錄；若證據不足就保留待確認。第一次整理至少檢查任務進度、基礎預算、重要資源、行李、本人機票額度、課程／考試與旅行衝突。`;
}
