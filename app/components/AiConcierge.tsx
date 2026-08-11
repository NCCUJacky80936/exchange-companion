"use client";

import { Check, Copy, ExternalLink, FileCheck2, Inbox, LockKeyhole, RotateCcw, Sparkles, Undo2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { applyAiProposal, canApplyAiProposal, canUndoAiProposal, clearDismissedAiProposals, dismissAiProposal, findAiBundleCollisions, importAiBundle, journeyScopeForState, matchesAiJourneyScope, sensitiveBundleWarnings, undoAiProposal, validateAiImportBundle } from "../lib/ai-import";
import { createExchangeConciergeHandoff } from "../lib/concierge-handoff";
import type { AiProposal, AppState } from "../lib/types";

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

export default function AiConcierge({ state, setState }: { state: AppState; setState: Dispatch<SetStateAction<AppState>> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const inbox = state.aiInbox ?? { sources: [], proposals: [] };
  const sourceMap = useMemo(() => new Map(inbox.sources.map((source) => [source.id, source])), [inbox.sources]);
  const pending = inbox.proposals.filter((proposal) => proposal.status === "pending");
  const applied = inbox.proposals.filter((proposal) => proposal.status === "applied");
  const dismissedCount = inbox.proposals.filter((proposal) => proposal.status === "dismissed").length;
  const pendingByEntity = useMemo(() => pending.reduce<Record<string, number>>((counts, proposal) => ({ ...counts, [proposal.entity]: (counts[proposal.entity] ?? 0) + 1 }), {}), [pending]);

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
      const collisions = findAiBundleCollisions(state, parsed);
      if (collisions.length) throw new Error("collision");
      const warnings = sensitiveBundleWarnings(parsed);
      if (warnings.length && !window.confirm(`這份提案可能包含：${warnings.join("、")}。整份匯入檔會視為私人資料；仍要匯入並逐欄檢查嗎？`)) {
        setMessage("已取消匯入；本機手帳沒有變更。 ");
        return;
      }
      setState((current) => importAiBundle(current, parsed));
      setMessage(`已匯入 ${parsed.proposals.length} 個 AI 提案，旅程範圍：${parsed.journeyScope}。尚未自動套用。`);
    } catch (error) {
      setMessage(error instanceof Error && error.message === "collision"
        ? "這份檔案含有已存在的來源或提案 ID；為保留審核歷史，請重新產生 run-versioned IDs。"
        : error instanceof Error && error.message === "scope-mismatch"
          ? `旅程識別不一致，未匯入。收到：${incomingScope}。目前：${journeyScopeForState(state)}。請讓 AI 從交接檔的 outputTemplate 重新產生，不能沿用範例或舊輸出。`
          : "無法讀取這份提案；請使用 Exchange Concierge 產生並驗證的 JSON。 ");
    } finally {
      event.target.value = "";
    }
  }

  async function prepareHandoff() {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `exchange-concierge-input-${date}.json`;
    const handoff = createExchangeConciergeHandoff(state);
    const blob = new Blob([JSON.stringify(handoff, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    const prompt = `請使用 $exchange-concierge 處理我附上的 ${filename}，並依檔案內 agentContract 與 editableSurfaces 執行。這是網站最新、完整的私人手帳交接檔；目前狀態在 state。開始前必須從檔案內 outputTemplate 建立全新的輸出，或執行 agentContract.initializer；不得沿用 outputs/、tests/fixtures/、範例或舊任務的根欄位，且必須原封不動保留 outputTemplate.journeyScope。請只讀取我另外明確授權的信件、檔案、網址與行事曆；需要搜尋信件時先使用 $exchange-email-intake 確認目前使用者的精確授權範圍。完整檢查任務進度、基礎預算、重要資源、行李、本人機票額度、課程／考試與旅行衝突。處理所有 pending resourceIntake；每筆資源都要提供精簡摘要與包含適用對象、準備資料、操作步驟、期限及風險的詳細說明。行李經驗影片只作為找漏項的內部靈感，把結果融入 packing-item 提案，不要呈現影片、頻道或宣傳連結。setupSnapshot 是第一次建站的鎖定背景，不要在日常整理時重做國家、幣別、時區、固定文案或圖片。產生 outputs/exchange-companion-import.json 後，必須把同一份 ${filename} 當驗證器第二個參數；驗證通過才可交付。不要直接改網站或覆蓋手動紀錄。最後列出各頁有更新、無新證據與仍待確認的項目。`;
    try { await navigator.clipboard.writeText(prompt); } catch { /* The downloaded handoff remains usable when clipboard permission is blocked. */ }
    setCopied(true);
    setMessage(`已下載 ${filename}，也已準備給 Codex 的完整指令。把檔案附到同一個 Codex 任務即可開始。`);
    window.setTimeout(() => setCopied(false), 2200);
  }

  function applyAllPending() {
    if (!pending.some((proposal) => canApplyAiProposal(state, proposal).valid)) return;
    if (!window.confirm(`要依前置關係一次套用目前可用的提案嗎？仍可在下方逐筆復原；格式或依據不足的項目會留在待確認區。`)) return;
    const proposalIds = pending.map((proposal) => proposal.id);
    setState((current) => {
      let next = current;
      for (let pass = 0; pass < proposalIds.length; pass += 1) {
        const before = next.aiInbox?.proposals.filter((proposal) => proposal.status === "applied").length ?? 0;
        proposalIds.forEach((id) => { next = applyAiProposal(next, id); });
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
        <Image src="/images/doodle-icons/documents-safe.png" alt="手繪文件與行政資料圖示" width={112} height={112} />
      </header>

      <section className="ai-workflow-grid">
        <article className="paper-card ai-start-card">
          <span className="tape" />
          <div className="ai-card-heading"><Sparkles size={25} /><div><p className="eyebrow">Free AI workflow</p><h2>從 Codex 開始整理</h2></div></div>
          <p>公開網站不內建付費模型。這個按鈕會下載自我說明的私人交接檔，包含目前進度、基礎預算、旅行巢狀欄位與 Skill 入口；第一次建站的國家、幣別和視覺只作為鎖定背景，不會每次重做。</p>
          <ol className="ai-steps"><li><strong>1</strong><span>下載最新手帳交接檔並附給 Codex</span></li><li><strong>2</strong><span>Exchange Concierge 查核授權資料與最新來源</span></li><li><strong>3</strong><span>把產生的提案 JSON 匯回網站審閱</span></li></ol>
          <button className="button primary" onClick={() => void prepareHandoff()}><Copy size={17} />{copied ? "交接檔與指令已準備" : "準備給 Codex 的整理包"}</button>
        </article>

        <article className="paper-card ai-import-card">
          <div className="ai-card-heading"><Inbox size={25} /><div><p className="eyebrow">Review inbox</p><h2>匯入 AI 提案</h2></div></div>
          <p>匯入不等於套用。你會先看到來源、日期、可信度與分享範圍，再決定要不要更新手帳。</p>
          <p className="ai-scope"><strong>目前旅程範圍</strong><span>{journeyScopeForState(state)}</span>{inbox.journeyScope ? <small>最近匯入：{inbox.journeyScope}</small> : null}</p>
          <button className="button secondary" onClick={() => inputRef.current?.click()}><Upload size={17} />選擇提案 JSON</button>
          <input ref={inputRef} className="sr-only" type="file" accept="application/json" onChange={importBundle} />
          <div className="ai-privacy-note"><LockKeyhole size={18} /><span>簽證、財力、住址、帳戶與信件內容一律保持私人；AI 不會把它們加入旅行分享。</span></div>
          {message ? <p className="settings-message" role="status">{message}</p> : null}
        </article>
      </section>

      <section className="proposal-section">
        <div className="section-heading"><div><p className="eyebrow">Suggested updates</p><h2>待確認提案</h2>{pending.length ? <div className="proposal-coverage">{Object.entries(pendingByEntity).map(([entity, count]) => <span key={entity}>{entityLabel[entity as keyof typeof entityLabel]} {count}</span>)}</div> : null}</div><div className="proposal-heading-actions">{dismissedCount ? <button className="button text-button" onClick={() => setState(clearDismissedAiProposals)}>清除 {dismissedCount} 個已忽略提案</button> : null}{pending.some((proposal) => canApplyAiProposal(state, proposal).valid) ? <button className="button primary batch-apply" onClick={applyAllPending}><Check size={16} />套用全部可用提案</button> : null}<span className="count-badge">{pending.length}</span></div></div>
        {pending.length ? <div className="proposal-list">{pending.map((proposal) => {
          const sources = proposal.evidenceIds.map((id) => sourceMap.get(id)).filter(Boolean);
          const current = proposalTarget(state, proposal);
          const applicability = canApplyAiProposal(state, proposal);
          return (
            <article className="paper-card proposal-card" key={proposal.id}>
              <div className="proposal-top"><div className="proposal-labels"><span className={`confidence ${proposal.confidence}`}>{confidenceLabel[proposal.confidence]}</span><span>{entityLabel[proposal.entity]}</span><span className={proposal.privacy === "private" ? "private" : "shareable"}>{proposal.privacy === "private" ? "私人" : "可分享"}</span></div><span className="proposal-action">{proposal.action === "add" ? "新增" : "更新"}</span></div>
              <h3>{proposal.title}</h3><p>{proposal.summary}</p>
              <div className="proposal-sources">{sources.map((source) => source ? <span key={source.id}><FileCheck2 size={14} />{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={11} /></a> : source.label}<small>{source.capturedAt}</small></span> : null)}</div>
              <details className="proposal-diff"><summary>查看實際欄位變更</summary><div className="proposal-diff-grid">{Object.entries(proposal.value).map(([key, next]) => <div className="proposal-diff-row" key={key}><strong>{key}</strong><div><small>目前</small><pre>{proposal.action === "add" ? "（新增項目）" : displayValue(current?.[key])}</pre></div><div><small>套用後</small><pre>{displayValue(next)}</pre></div></div>)}</div><p><LockKeyhole size={14} />整份匯入檔都應視為私人工作資料；「可分享」只代表套用後的通用內容有資格被另外選入分享。</p></details>
              {!applicability.valid ? <p className="proposal-invalid"><LockKeyhole size={15} />{applicability.reason}</p> : null}
              <div className="proposal-actions"><button className="button secondary" onClick={() => setState((current) => dismissAiProposal(current, proposal.id))}><X size={16} />忽略</button><button className="button primary" disabled={!applicability.valid} onClick={() => setState((current) => applyAiProposal(current, proposal.id))}><Check size={16} />套用到手帳</button></div>
            </article>
          );
        })}</div> : <div className="paper-card proposal-empty"><RotateCcw size={27} /><h3>目前沒有等待確認的更新</h3><p>手動修改可以照常使用。下次讓 Codex 整理時，它會以你現在的紀錄為準。</p></div>}
      </section>
      {applied.length ? <section className="applied-proposals paper-card"><div><p className="eyebrow">Applied history</p><h2>已套用，可以復原</h2></div><div>{applied.map((proposal) => {
        const undo = canUndoAiProposal(state, proposal);
        return <div className="applied-proposal-row" key={proposal.id}><span><Check size={15} /></span><div><strong>{proposal.title}</strong><small>{undo.valid ? (proposal.appliedAt ? new Date(proposal.appliedAt).toLocaleString("zh-TW") : "已套用") : undo.reason}</small></div><button className="button text-button" disabled={!undo.valid} title={undo.reason} onClick={() => setState((current) => undoAiProposal(current, proposal.id))}><Undo2 size={15} />復原</button></div>;
      })}</div></section> : null}
    </div>
  );
}
