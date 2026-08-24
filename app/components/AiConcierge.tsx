"use client";

import { Check, CloudDownload, Copy, ExternalLink, FileCheck2, Inbox, Link2, LockKeyhole, MessageCircle, Pencil, RefreshCw, RotateCcw, Sparkles, Undo2, Upload, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { applyAiProposal, canApplyAiProposal, canUndoAiProposal, clearDismissedAiProposals, dismissAiProposal, findAiBundleCollisions, importAiBundle, journeyScopeForState, matchesAiJourneyScope, rebaseAiProposal, sensitiveBundleWarnings, undoAiProposal, validateAiImportBundle } from "../lib/ai-import";
import { createExchangeConciergeHandoff } from "../lib/concierge-handoff";
import { buildFirstConciergePrompt } from "../lib/concierge-starter";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";
import type { AiProposal, AppState, TelegramPairingInfo } from "../lib/types";
import MotionDialog from "./ui/MotionDialog";

const entityLabel = {
  journey: "交換基本資料",
  task: "交換任務",
  resource: "資源",
  "resource-intake": "待辨識網址",
  "packing-item": "行李",
  bag: "行李額度",
  "flight-allowance": "本人機票行李規則",
  "budget-item": "基礎預算",
  "study-event": "個人行程",
  "travel-plan": "旅行",
};

const confidenceLabel = { high: "高可信", medium: "待確認", low: "線索" };

function safeTelegramBotUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "t.me" ? url.toString() : "";
  } catch {
    return "";
  }
}

function proposalTarget(state: AppState, proposal: AiProposal): Record<string, unknown> | undefined {
  const items = proposal.entity === "journey" ? [state.journey]
    : proposal.entity === "task" ? state.tasks
    : proposal.entity === "resource" ? state.resources
      : proposal.entity === "resource-intake" ? state.resourceIntake ?? []
        : proposal.entity === "packing-item" ? state.packingItems
        : proposal.entity === "bag" ? state.bags
          : proposal.entity === "flight-allowance" ? state.flightAllowances ?? []
            : proposal.entity === "budget-item" ? state.budget
              : proposal.entity === "study-event" ? state.studyEvents ?? []
                : state.travelPlans ?? [];
  return items.find((item) => item.id === proposal.targetId) as unknown as Record<string, unknown> | undefined;
}

function displayValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function ProposalEditDialog({ proposal, onClose, onAccept }: { proposal: AiProposal; onClose: () => void; onAccept: (update: Pick<AiProposal, "title" | "summary" | "value">) => void }) {
  const [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const value = JSON.parse(form.get("value")?.toString() || "{}") as unknown;
      if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("invalid");
      onAccept({ title: form.get("title")?.toString().trim() || proposal.title, summary: form.get("summary")?.toString().trim() || proposal.summary, value: value as Record<string, unknown> });
    } catch {
      setError("欄位內容必須是有效的 JSON 物件，請修正後再套用。");
    }
  }
  return <MotionDialog id="proposal-edit-dialog-title" eyebrow="Human review" title="修改後接受 AI 提案" onClose={onClose} className="proposal-edit-dialog">
    <form className="form-grid" onSubmit={submit}>
      <label className="field field-full"><span>提案標題</span><input name="title" defaultValue={proposal.title} required /></label>
      <label className="field field-full"><span>摘要</span><textarea name="summary" rows={3} defaultValue={proposal.summary} required /></label>
      <label className="field field-full"><span>要套用的欄位</span><textarea className="proposal-json-editor" name="value" rows={10} defaultValue={JSON.stringify(proposal.value, null, 2)} spellCheck={false} required /><small>保留 JSON 格式；你可以修改值，但不要刪掉必要欄位。</small></label>
      {error ? <p className="form-error field-full" role="alert">{error}</p> : null}
      <div className="modal-actions field-full"><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit"><Check size={16} />儲存並套用</button></div>
    </form>
  </MotionDialog>;
}

export default function AiConcierge({ state, setState, cloud, openInboxRequest = 0 }: { state: AppState; setState: Dispatch<SetStateAction<AppState>>; cloud: ExchangeCloudController; openInboxRequest?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inboxDetailsRef = useRef<HTMLDetailsElement>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedConnectionPrompt, setCopiedConnectionPrompt] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(openInboxRequest > 0);
  const [editingProposal, setEditingProposal] = useState<AiProposal | null>(null);
  const [selectedTelegramConnectionId, setSelectedTelegramConnectionId] = useState("");
  const [telegramPairing, setTelegramPairing] = useState<TelegramPairingInfo | null>(null);
  const [telegramMessage, setTelegramMessage] = useState("");
  const inbox = state.aiInbox ?? { sources: [], proposals: [] };
  const sourceMap = useMemo(() => new Map(inbox.sources.map((source) => [source.id, source])), [inbox.sources]);
  const pending = inbox.proposals.filter((proposal) => proposal.status === "pending");
  const applied = inbox.proposals.filter((proposal) => proposal.status === "applied");
  const dismissedCount = inbox.proposals.filter((proposal) => proposal.status === "dismissed").length;
  const activeConnections = cloud.conciergeConnections.filter((item) => !item.revokedAt);
  const linkedTelegramConnectionId = activeConnections.some((item) => item.id === cloud.telegramLink?.connectionId) ? cloud.telegramLink?.connectionId ?? "" : "";
  const telegramConnectionId = activeConnections.some((item) => item.id === selectedTelegramConnectionId)
    ? selectedTelegramConnectionId
    : linkedTelegramConnectionId || (activeConnections.length === 1 ? activeConnections[0].id : "");
  const selectedTelegramLink = cloud.telegramLink?.connectionId === telegramConnectionId ? cloud.telegramLink : null;
  const telegramPairingBotUrl = telegramPairing ? safeTelegramBotUrl(telegramPairing.botUrl) : "";
  const pendingByEntity = useMemo(() => pending.reduce<Record<string, number>>((counts, proposal) => ({ ...counts, [proposal.entity]: (counts[proposal.entity] ?? 0) + 1 }), {}), [pending]);

  useEffect(() => {
    if (!openInboxRequest) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const focusTimer = window.setTimeout(() => {
      const target = inboxDetailsRef.current;
      target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (target) {
        window.scrollBy({ top: -88, behavior: reduceMotion ? "auto" : "smooth" });
        target.classList.add("attention-target");
      }
    }, reduceMotion ? 0 : 360);
    const clearTimer = window.setTimeout(() => inboxDetailsRef.current?.classList.remove("attention-target"), 2200);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(clearTimer);
    };
  }, [openInboxRequest]);

  async function importBundle(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    let incomingScope = "";
    try {
      if (file.size > 2_000_000) throw new Error("too-large");
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateAiImportBundle(parsed)) throw new Error("invalid");
      incomingScope = parsed.journeyScope;
      if (!matchesAiJourneyScope(state, parsed)) throw new Error("scope-mismatch");
      if (parsed.baseRevision && cloud.privateRevision && parsed.baseRevision !== cloud.privateRevision) throw new Error("revision-mismatch");
      const collisions = findAiBundleCollisions(state, parsed);
      if (collisions.length) throw new Error("collision");
      const warnings = sensitiveBundleWarnings(parsed);
      if (warnings.length && !window.confirm(`這份提案可能包含：${warnings.join("、")}。整份匯入檔會視為私人資料；仍要匯入並逐欄檢查嗎？`)) {
        setMessage("已取消匯入；本機手帳沒有變更。 ");
        return;
      }
      cloud.markNextSaveActor("proposal");
      setState((current) => importAiBundle(current, parsed));
      setMessage(`已匯入 ${parsed.proposals.length} 個 AI 提案，旅程範圍：${parsed.journeyScope}。尚未自動套用。`);
    } catch (error) {
      setMessage(error instanceof Error && error.message === "collision"
        ? "這份檔案含有已存在的來源或提案 ID；為保留審核歷史，請重新產生 run-versioned IDs。"
        : error instanceof Error && error.message === "scope-mismatch"
          ? `旅程識別不一致，未匯入。收到：${incomingScope}。目前：${journeyScopeForState(state)}。請讓 AI 從交接檔的 outputTemplate 重新產生，不能沿用範例或舊輸出。`
          : error instanceof Error && error.message === "revision-mismatch"
            ? "這份提案是依較舊的手帳產生；為保留你後來的手動修改，請讓 Agent 重新讀取最新雲端狀態。"
          : "無法讀取這份提案；請使用 Exchange Concierge 產生並驗證的 JSON。 ");
    } finally {
      event.target.value = "";
    }
  }

  async function prepareHandoff() {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `exchange-concierge-input-${date}.json`;
    const handoff = createExchangeConciergeHandoff(state, new Date().toISOString(), cloud.privateRevision || undefined);
    const blob = new Blob([JSON.stringify(handoff, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    const prompt = `請使用 $exchange-concierge 處理我附上的 ${filename}，並依檔案內 agentContract 與 editableSurfaces 執行。這是網站最新、完整的私人手帳交接檔；目前狀態在 state。開始前必須從檔案內 outputTemplate 建立全新的輸出，或執行 agentContract.initializer；不得沿用 outputs/、tests/fixtures/、範例或舊任務的根欄位，且必須原封不動保留 outputTemplate.journeyScope。請只讀取我另外明確授權的信件、檔案、網址與行事曆；需要搜尋信件時先使用 $exchange-email-intake 確認目前使用者的精確授權範圍。完整檢查任務進度、基礎預算、重要資源、行李、本人機票額度、課程／考試與旅行衝突。處理所有 pending resourceIntake；網址不是只做成資源卡，必須逐一比對任務、預算、行李品項、實體行李、本人航班額度、課程行事曆與旅行計畫，有可執行的新資訊就提出對應欄位更新；若既有資料已涵蓋，也要在 coverage 寫出具體比對，不得只新增資源後直接標記處理完成。每筆資源都要提供可獨立理解的摘要、包含適用對象／準備資料／操作步驟／期限／風險的詳細說明，以及 4–12 個去識別、可供純文字搜尋但不顯示在卡片上的 searchTags。行李經驗影片只作為找漏項的內部靈感，把結果融入 packing-item 提案，不要呈現影片、頻道或宣傳連結。setupSnapshot 是第一次建站的鎖定背景，不要在日常整理時重做國家、幣別、時區、固定文案或圖片。產生 outputs/exchange-companion-import.json 後，必須把同一份 ${filename} 當驗證器第二個參數；驗證通過才可交付。不要直接改網站或覆蓋手動紀錄。最後列出各頁有更新、無新證據與仍待確認的項目。`;
    try { await navigator.clipboard.writeText(prompt); } catch { /* The downloaded handoff remains usable when clipboard permission is blocked. */ }
    setCopied(true);
    setMessage(`已下載 ${filename}，也已準備給 Codex 的完整指令。把檔案附到同一個 Codex 任務即可開始。`);
    window.setTimeout(() => setCopied(false), 2200);
  }

  async function pairConcierge() {
    try {
      const connection = await cloud.createConciergeConnection();
      const blob = new Blob([JSON.stringify(connection, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "exchange-concierge-connection.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("步驟 1 完成：私人連結檔已下載。接著按「2. 複製給 Codex 的指令」，回到 Codex，把連結檔當附件加入後再貼上指令。 ");
    } catch {
      setMessage("目前無法建立 Agent 連結。請確認已登入且私人手帳已完成同步。 ");
    }
  }

  async function copyConnectionPrompt() {
    try {
      await navigator.clipboard.writeText(buildFirstConciergePrompt());
      setCopiedConnectionPrompt(true);
      setMessage("步驟 2 完成：指令已複製。請回到 Codex，先附上剛下載的 exchange-concierge-connection.json，再貼上指令並送出。 ");
      window.setTimeout(() => setCopiedConnectionPrompt(false), 2200);
    } catch {
      setMessage("瀏覽器沒有允許複製。請從首頁重新打開使用指南，或允許剪貼簿權限後再試。 ");
    }
  }

  async function createTelegramPairingCode() {
    if (!telegramConnectionId) return;
    try {
      const pairing = await cloud.createTelegramPairing(telegramConnectionId);
      setTelegramPairing(pairing);
      setTelegramMessage("已產生 10 分鐘內有效的一次性配對碼。請在期限內打開 Bot 完成連結。");
    } catch {
      setTelegramMessage("目前無法產生 Telegram 配對碼。請確認手帳與 Exchange Concierge 都已連線。");
    }
  }

  async function copyTelegramPairingCode() {
    if (!telegramPairing) return;
    try {
      await navigator.clipboard.writeText(telegramPairing.code);
      setTelegramMessage("配對碼已複製。");
    } catch {
      setTelegramMessage("瀏覽器沒有允許複製，請手動輸入配對碼。");
    }
  }

  async function refreshTelegramStatus() {
    if (!telegramConnectionId) return;
    try {
      const link = await cloud.refreshTelegramLink(telegramConnectionId);
      if (link) setTelegramPairing(null);
      setTelegramMessage(link ? "Telegram 已連結。後續訊息只會進入待處理佇列。" : "這個 Concierge 連線尚未配對 Telegram。");
    } catch {
      setTelegramMessage("目前無法查詢 Telegram 連結狀態。");
    }
  }

  async function disconnectTelegram() {
    if (!telegramConnectionId || !selectedTelegramLink) return;
    if (!window.confirm("撤銷 Telegram 連結後，未處理的原文會立即清除，且無法復原。仍要繼續嗎？")) return;
    try {
      await cloud.revokeTelegramLink(telegramConnectionId);
      setTelegramPairing(null);
      setTelegramMessage("Telegram 連結已撤銷，未處理原文已清除。");
    } catch {
      setTelegramMessage("目前無法撤銷 Telegram 連結；現有連結與佇列沒有變更。");
    }
  }

  async function refreshCloudInbox() {
    try {
      const count = await cloud.refreshConciergeInbox();
      setMessage(count ? `已帶回 ${count} 個待確認提案；尚未自動套用。` : "雲端目前沒有新的提案。 ");
    } catch {
      setMessage("目前無法更新提案收件匣；本機紀錄沒有變更。 ");
    }
  }

  function applyAllPending() {
    if (!pending.some((proposal) => canApplyAiProposal(state, proposal, cloud.privateRevision || undefined).valid)) return;
    if (!window.confirm(`要依前置關係一次套用目前可用的提案嗎？仍可在下方逐筆復原；格式或依據不足的項目會留在待確認區。`)) return;
    const proposalIds = pending.map((proposal) => proposal.id);
    cloud.markNextSaveActor("proposal");
    setState((current) => {
      let next = current;
      for (let pass = 0; pass < proposalIds.length; pass += 1) {
        const before = next.aiInbox?.proposals.filter((proposal) => proposal.status === "applied").length ?? 0;
        proposalIds.forEach((id) => { next = applyAiProposal(next, id, cloud.privateRevision || undefined); });
        const after = next.aiInbox?.proposals.filter((proposal) => proposal.status === "applied").length ?? 0;
        if (after === before) break;
      }
      return next;
    });
    setMessage("已依前置關係套用所有可用提案；交換基本資料、任務、基礎預算、資源與行李會同步更新，未通過檢查的項目仍留在待確認區。");
  }

  return (
    <div className="page-stack ai-page">
      <header className="page-header ai-header">
        <div><p className="eyebrow">AI exchange concierge</p><h1>讓 AI 幫我整理</h1><p>Codex 先讀取你授權的資料與最新來源，網站再讓你逐項確認。手動編輯永遠保留，而且會成為下一次整理的依據。</p></div>
      </header>

      <details ref={inboxDetailsRef} id="ai-proposal-inbox" className="proposal-section paper-card ai-inbox-details" open={inboxOpen} onToggle={(event) => setInboxOpen(event.currentTarget.open)}>
        <summary><div><p className="eyebrow">Suggested updates</p><h2>AI 提案收件匣</h2><small>待確認超過 5 天會清除；套用後 7 天未復原也會移除紀錄。</small></div><span className="count-badge">{pending.length}</span></summary>
        <div className="proposal-inbox-body"><div className="section-heading"><div><h2>待確認提案</h2>{pending.length ? <div className="proposal-coverage">{Object.entries(pendingByEntity).map(([entity, count]) => <span key={entity}>{entityLabel[entity as keyof typeof entityLabel]} {count}</span>)}</div> : null}</div><div className="proposal-heading-actions">{dismissedCount ? <button className="button text-button" onClick={() => { cloud.markNextSaveActor("proposal"); setState(clearDismissedAiProposals); }}>清除 {dismissedCount} 個已忽略提案</button> : null}{pending.some((proposal) => canApplyAiProposal(state, proposal, cloud.privateRevision || undefined).valid) ? <button className="button primary batch-apply" onClick={applyAllPending}><Check size={16} />套用全部可用提案</button> : null}</div></div>
        {pending.length ? <div className="proposal-list">{pending.map((proposal) => {
          const sources = proposal.evidenceIds.map((id) => sourceMap.get(id)).filter(Boolean);
          const current = proposalTarget(state, proposal);
          const applicability = canApplyAiProposal(state, proposal, cloud.privateRevision || undefined);
          return (
            <article className="paper-card proposal-card" key={proposal.id}>
              <div className="proposal-top"><div className="proposal-labels"><span className={`confidence ${proposal.confidence}`}>{confidenceLabel[proposal.confidence]}</span><span>{entityLabel[proposal.entity]}</span><span className={proposal.privacy === "private" ? "private" : "shareable"}>{proposal.privacy === "private" ? "私人" : "可分享"}</span></div><span className="proposal-action">{proposal.action === "add" ? "新增" : "更新"}</span></div>
              <h3>{proposal.title}</h3><p>{proposal.summary}</p>
              <div className="proposal-sources">{sources.map((source) => source ? <span key={source.id}><FileCheck2 size={14} />{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={11} /></a> : source.label}<small>{source.capturedAt}</small></span> : null)}</div>
              <details className="proposal-diff"><summary>查看實際欄位變更</summary><div className="proposal-diff-grid">{Object.entries(proposal.value).map(([key, next]) => <div className="proposal-diff-row" key={key}><strong>{key}</strong><div><small>目前</small><pre>{proposal.action === "add" ? "（新增項目）" : displayValue(current?.[key])}</pre></div><div><small>套用後</small><pre>{displayValue(next)}</pre></div></div>)}</div><p><LockKeyhole size={14} />整份匯入檔都應視為私人工作資料；「可分享」只代表套用後的通用內容有資格被另外選入分享。</p></details>
              {!applicability.valid ? <div className="proposal-invalid"><LockKeyhole size={15} /><span>{applicability.reason}</span>{proposal.baseRevision !== undefined && cloud.privateRevision > 0 && proposal.baseRevision !== cloud.privateRevision ? <button className="button text-button" onClick={() => {
                if (!window.confirm("請先確認上方「實際欄位變更」。要以目前手帳內容作為新的比對基準嗎？這一步只會更新提案基準，不會套用欄位。")) return;
                cloud.markNextSaveActor("proposal");
                setState((currentState) => rebaseAiProposal(currentState, proposal.id, cloud.privateRevision));
                setMessage("已用目前手帳重新核對這筆提案；確認差異後即可套用。");
              }}><RefreshCw size={14} />以目前手帳重新核對</button> : null}</div> : null}
              <div className="proposal-actions"><button className="button secondary" onClick={() => { cloud.markNextSaveActor("proposal"); setState((current) => dismissAiProposal(current, proposal.id)); }}><X size={16} />忽略</button><button className="button secondary" disabled={!applicability.valid} onClick={() => setEditingProposal(proposal)}><Pencil size={16} />修改後接受</button><button className="button primary" disabled={!applicability.valid} onClick={() => { cloud.markNextSaveActor("proposal"); setState((current) => applyAiProposal(current, proposal.id, cloud.privateRevision || undefined)); }}><Check size={16} />直接套用</button></div>
            </article>
          );
        })}</div> : <div className="paper-card proposal-empty"><RotateCcw size={27} /><h3>目前沒有等待確認的更新</h3><p>手動修改可以照常使用。下次讓 Codex 整理時，它會以你現在的紀錄為準。</p></div>}
      {applied.length ? <section className="applied-proposals"><div><p className="eyebrow">Applied history</p><h2>已套用，可以復原</h2></div><div>{applied.map((proposal) => {
        const undo = canUndoAiProposal(state, proposal);
        return <div className="applied-proposal-row" key={proposal.id}><span><Check size={15} /></span><div><strong>{proposal.title}</strong><small>{undo.valid ? (proposal.appliedAt ? new Date(proposal.appliedAt).toLocaleString("zh-TW") : "已套用") : undo.reason}</small></div><button className="button text-button" disabled={!undo.valid} title={undo.reason} onClick={() => { cloud.markNextSaveActor("proposal"); setState((current) => undoAiProposal(current, proposal.id)); }}><Undo2 size={15} />復原</button></div>;
      })}</div></section> : null}</div>
      </details>

      <article className="paper-card ai-telegram-card">
        <div className="ai-card-heading"><MessageCircle size={24} /><div><p className="eyebrow">Telegram inbox</p><h2>用 Telegram 丟給 AI 整理</h2></div></div>
        <p>只接收私人一對一文字訊息，並等你的 Codex 排程整理成待確認提案。Telegram 不會直接修改手帳。</p>
        <label className="field"><span>要授權的 Exchange Concierge 連線</span><select value={telegramConnectionId} disabled={!activeConnections.length || cloud.busy} onChange={(event) => {
          const connectionId = event.currentTarget.value;
          setSelectedTelegramConnectionId(connectionId);
          setTelegramPairing(null);
          setTelegramMessage("");
          void cloud.refreshTelegramLink(connectionId).catch(() => setTelegramMessage("目前無法查詢這個 Telegram 連結狀態。"));
        }}>{activeConnections.length ? <>{activeConnections.length > 1 && !telegramConnectionId ? <option value="" disabled>請選擇要授權的連線</option> : null}{activeConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label}</option>)}</> : <option value="">請先建立 Exchange Concierge 連線</option>}</select></label>
        {selectedTelegramLink ? <div className="ai-connections"><span><strong>已連結 @{selectedTelegramLink.botUsername.replace(/^@/, "")}</strong><small>{selectedTelegramLink.lastReceivedAt ? `最後收件：${new Date(selectedTelegramLink.lastReceivedAt).toLocaleString("zh-TW")}` : `連結時間：${new Date(selectedTelegramLink.linkedAt).toLocaleString("zh-TW")}`} · 待處理 {selectedTelegramLink.queuedCount} 則</small></span></div> : null}
        {telegramPairing?.connectionId === telegramConnectionId ? <div className="ai-connections"><span><strong>配對碼：<code>{telegramPairing.code}</code></strong><small>有效至 {new Date(telegramPairing.expiresAt).toLocaleString("zh-TW")}</small></span><div className="ai-connected-actions"><button type="button" className="button secondary" disabled={cloud.busy} onClick={() => void copyTelegramPairingCode()}><Copy size={16} />複製配對碼</button>{telegramPairingBotUrl ? <a className="button primary" href={telegramPairingBotUrl} target="_blank" rel="noreferrer">打開 @{telegramPairing.botUsername.replace(/^@/, "")}<ExternalLink size={14} /></a> : null}</div></div> : null}
        <div className="ai-connected-actions">
          {!selectedTelegramLink ? <button type="button" className="button primary" disabled={!telegramConnectionId || cloud.busy} onClick={() => void createTelegramPairingCode()}><Link2 size={16} />產生 10 分鐘配對碼</button> : null}
          <button type="button" className="button secondary" disabled={!telegramConnectionId || cloud.busy} onClick={() => void refreshTelegramStatus()}><RefreshCw size={16} />更新狀態</button>
          {selectedTelegramLink ? <button type="button" className="button text-button danger" disabled={cloud.busy} onClick={() => void disconnectTelegram()}><X size={16} />撤銷 Telegram</button> : null}
        </div>
        {telegramMessage ? <p className="settings-message" role="status">{telegramMessage}</p> : null}
      </article>

      <section className={`ai-workflow-grid ${activeConnections.length ? "has-connection" : ""}`}>
        {activeConnections.length ? <article className="paper-card ai-connected-card">
          <div className="ai-card-heading"><Link2 size={22}/><div><p className="eyebrow">Connected agent</p><h2>已連結 Exchange Concierge</h2></div></div>
          <p>{activeConnections[0].lastUsedAt ? `最近使用：${new Date(activeConnections[0].lastUsedAt).toLocaleString("zh-TW")}` : "連結已建立，尚未第一次使用。"} 每週巡檢會整理信件與新文件；你在 Codex 新增狀態時則立即推送。網站會自動收取提案。</p>
          <div className="ai-connected-actions"><button className="button secondary" disabled={cloud.busy} onClick={() => void refreshCloudInbox()}><RefreshCw size={16}/>更新收件匣</button><button className="button text-button danger" disabled={cloud.busy} onClick={() => void cloud.revokeConciergeConnection(activeConnections[0].id)}><X size={16}/>撤銷連結</button></div>
        </article> : <article className="paper-card ai-start-card">
          <span className="tape" />
          <div className="ai-card-heading"><Sparkles size={25} /><div><p className="eyebrow">Free AI workflow</p><h2>從 Codex 開始整理</h2></div></div>
          <p>第一次連結只做一次。照下面順序完成；私人連結檔不要打開、不要把內容貼成文字，也不要上傳 GitHub。</p>
          <ol className="ai-steps ai-first-link-steps"><li><strong>1</strong><span><b>下載私人連結檔</b><small>檔名是 exchange-concierge-connection.json。</small></span></li><li><strong>2</strong><span><b>複製給 Codex 的指令</b><small>回到自己的 Codex 任務，把連結檔當附件加入，再貼上指令。</small></span></li><li><strong>3</strong><span><b>回答 Codex 的授權問題</b><small>只開放你願意提供的信箱、資料夾、網址與日期範圍。</small></span></li><li><strong>4</strong><span><b>回網站檢查提案</b><small>看到「待確認提案」才算完成；網站不會自動套用。</small></span></li></ol>
          <p className="ai-after-link-note"><strong>連結成功後：</strong>每週巡檢會整理已授權信件與新增文件；對話中新狀態立即產生待審提案，網站會自動收件。</p>
          <div className="ai-primary-actions"><button className="button primary" disabled={!cloud.permanentAccount || cloud.privateRevision < 1 || cloud.busy} onClick={() => void pairConcierge()}><Link2 size={17} />1. 下載私人連結檔</button><button className="button secondary" onClick={() => void copyConnectionPrompt()}><Copy size={17} />{copiedConnectionPrompt ? "指令已複製" : "2. 複製給 Codex 的指令"}</button><button className="button secondary" disabled={!cloud.permanentAccount || cloud.busy} onClick={() => void refreshCloudInbox()}><RefreshCw size={17} />4. 檢查提案收件匣</button></div>
          <details className="ai-offline-fallback"><summary>離線備援：下載／匯入 JSON</summary><p>只有無法連線雲端或需要攜帶完整資料到另一個環境時才使用。</p><button className="button text-button" onClick={() => void prepareHandoff()}><CloudDownload size={17} />{copied ? "交接檔與指令已準備" : "下載最新交接 JSON"}</button></details>
        </article>}

        <article className="paper-card ai-import-card">
          <div className="ai-card-heading"><Inbox size={25} /><div><p className="eyebrow">Review inbox</p><h2>AI 提案收件匣</h2></div></div>
          <p>雲端提案只會進入待確認區。你會先看到來源、日期、可信度與實際欄位差異，再決定要不要更新手帳。</p>
          <p className="ai-scope"><strong>目前旅程範圍</strong><span>{journeyScopeForState(state)}</span>{inbox.journeyScope ? <small>最近匯入：{inbox.journeyScope}</small> : null}</p>
          <button className="button secondary" onClick={() => inputRef.current?.click()}><Upload size={17} />選擇提案 JSON</button>
          <input ref={inputRef} className="sr-only" type="file" accept="application/json" onChange={importBundle} />
          <div className="ai-privacy-note"><LockKeyhole size={18} /><span>簽證、財力、住址、帳戶與信件內容一律保持私人；AI 不會把它們加入旅行分享。</span></div>
          {message ? <p className="settings-message" role="status">{message}</p> : null}
        </article>
      </section>

      <AnimatePresence>{editingProposal ? <ProposalEditDialog proposal={editingProposal} onClose={() => setEditingProposal(null)} onAccept={(update) => {
        const editedProposal = { ...editingProposal, ...update, userEditedAt: new Date().toISOString() };
        const previewState = { ...state, aiInbox: state.aiInbox ? { ...state.aiInbox, proposals: state.aiInbox.proposals.map((proposal) => proposal.id === editedProposal.id ? editedProposal : proposal) } : state.aiInbox };
        const applicability = canApplyAiProposal(previewState, editedProposal, cloud.privateRevision || undefined);
        if (!applicability.valid) {
          setMessage(`修改內容尚不能套用：${applicability.reason || "請保留必要欄位並再試一次。"}`);
          return;
        }
        cloud.markNextSaveActor("proposal");
        setState((current) => {
          const next = { ...current, aiInbox: current.aiInbox ? { ...current.aiInbox, proposals: current.aiInbox.proposals.map((proposal) => proposal.id === editedProposal.id ? editedProposal : proposal) } : current.aiInbox };
          return applyAiProposal(next, editedProposal.id, cloud.privateRevision || undefined);
        });
        setEditingProposal(null);
        setMessage("已保留你的修改並套用；原始來源與可復原紀錄仍在。");
      }} /> : null}</AnimatePresence>

    </div>
  );
}
