"use client";

import { Check, Copy, ExternalLink, FileCheck2, Inbox, LockKeyhole, RotateCcw, Sparkles, Undo2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { applyAiProposal, clearDismissedAiProposals, dismissAiProposal, importAiBundle, undoAiProposal, validateAiImportBundle } from "../lib/ai-import";
import type { AppState } from "../lib/types";

const entityLabel = {
  task: "交換任務",
  resource: "資源",
  "packing-item": "行李",
  "study-event": "個人行程",
  "travel-plan": "旅行",
};

const confidenceLabel = { high: "高可信", medium: "待確認", low: "線索" };

export default function AiConcierge({ state, setState }: { state: AppState; setState: Dispatch<SetStateAction<AppState>> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const inbox = state.aiInbox ?? { sources: [], proposals: [] };
  const sourceMap = useMemo(() => new Map(inbox.sources.map((source) => [source.id, source])), [inbox.sources]);
  const pending = inbox.proposals.filter((proposal) => proposal.status === "pending");
  const applied = inbox.proposals.filter((proposal) => proposal.status === "applied");
  const dismissedCount = inbox.proposals.filter((proposal) => proposal.status === "dismissed").length;

  async function importBundle(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateAiImportBundle(parsed)) throw new Error("invalid");
      setState((current) => importAiBundle(current, parsed));
      setMessage(`已匯入 ${parsed.proposals.length} 個 AI 提案，尚未自動套用。`);
    } catch {
      setMessage("無法讀取這份提案；請使用 Exchange Concierge 產生的 JSON。 ");
    } finally {
      event.target.value = "";
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText("請使用 exchange-concierge Skill，整理我授權的交換資料與最新官方來源，產生 Exchange Companion 可匯入的提案檔；先不要直接套用。 ");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
          <p>公開網站不內建付費模型。請在這個專案執行 Exchange Concierge，Codex 會整理信件、檔案與官方來源，最後產生一份不含原始敏感文件的提案檔。</p>
          <ol className="ai-steps"><li><strong>1</strong><span>指定可讀的資料與信箱範圍</span></li><li><strong>2</strong><span>AI 查核、比對並標示可信度</span></li><li><strong>3</strong><span>回到網站逐項套用或忽略</span></li></ol>
          <button className="button primary" onClick={copyPrompt}><Copy size={17} />{copied ? "已複製啟動指令" : "複製給 Codex 的指令"}</button>
        </article>

        <article className="paper-card ai-import-card">
          <div className="ai-card-heading"><Inbox size={25} /><div><p className="eyebrow">Review inbox</p><h2>匯入 AI 提案</h2></div></div>
          <p>匯入不等於套用。你會先看到來源、日期、可信度與分享範圍，再決定要不要更新手帳。</p>
          <button className="button secondary" onClick={() => inputRef.current?.click()}><Upload size={17} />選擇提案 JSON</button>
          <input ref={inputRef} className="sr-only" type="file" accept="application/json" onChange={importBundle} />
          <div className="ai-privacy-note"><LockKeyhole size={18} /><span>簽證、財力、住址、帳戶與信件內容一律保持私人；AI 不會把它們加入旅行分享。</span></div>
          {message ? <p className="settings-message" role="status">{message}</p> : null}
        </article>
      </section>

      <section className="proposal-section">
        <div className="section-heading"><div><p className="eyebrow">Suggested updates</p><h2>待確認提案</h2></div><div className="proposal-heading-actions">{dismissedCount ? <button className="button text-button" onClick={() => setState(clearDismissedAiProposals)}>清除 {dismissedCount} 個已忽略提案</button> : null}<span className="count-badge">{pending.length}</span></div></div>
        {pending.length ? <div className="proposal-list">{pending.map((proposal) => {
          const sources = proposal.evidenceIds.map((id) => sourceMap.get(id)).filter(Boolean);
          return (
            <article className="paper-card proposal-card" key={proposal.id}>
              <div className="proposal-top"><div className="proposal-labels"><span className={`confidence ${proposal.confidence}`}>{confidenceLabel[proposal.confidence]}</span><span>{entityLabel[proposal.entity]}</span><span className={proposal.privacy === "private" ? "private" : "shareable"}>{proposal.privacy === "private" ? "私人" : "可分享"}</span></div><span className="proposal-action">{proposal.action === "add" ? "新增" : "更新"}</span></div>
              <h3>{proposal.title}</h3><p>{proposal.summary}</p>
              <div className="proposal-sources">{sources.map((source) => source ? <span key={source.id}><FileCheck2 size={14} />{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={11} /></a> : source.label}<small>{source.capturedAt}</small></span> : null)}</div>
              <div className="proposal-actions"><button className="button secondary" onClick={() => setState((current) => dismissAiProposal(current, proposal.id))}><X size={16} />忽略</button><button className="button primary" onClick={() => setState((current) => applyAiProposal(current, proposal.id))}><Check size={16} />套用到手帳</button></div>
            </article>
          );
        })}</div> : <div className="paper-card proposal-empty"><RotateCcw size={27} /><h3>目前沒有等待確認的更新</h3><p>手動修改可以照常使用。下次讓 Codex 整理時，它會以你現在的紀錄為準。</p></div>}
      </section>
      {applied.length ? <section className="applied-proposals paper-card"><div><p className="eyebrow">Applied history</p><h2>已套用，可以復原</h2></div><div>{applied.map((proposal) => <div className="applied-proposal-row" key={proposal.id}><span><Check size={15} /></span><div><strong>{proposal.title}</strong><small>{proposal.appliedAt ? new Date(proposal.appliedAt).toLocaleString("zh-TW") : "已套用"}</small></div><button className="button text-button" onClick={() => setState((current) => undoAiProposal(current, proposal.id))}><Undo2 size={15} />復原</button></div>)}</div></section> : null}
    </div>
  );
}
