"use client";

import { ArrowRight, Check, ChevronDown, Sparkles } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { groupAiUpdates, markAiUpdatesRead, selectAiUpdates, targetForUpdate, updateArea, updateStatus, type UpdatePeriod, type UpdateScope } from "../lib/ai-updates";
import type { HomeAgendaTarget } from "../lib/home-dashboard";
import type { AppState } from "../lib/types";

const periods: { id: UpdatePeriod; label: string }[] = [{ id: "unread", label: "上次查看後" }, { id: "today", label: "今天" }, { id: "week", label: "近 7 天" }, { id: "all", label: "全部紀錄" }];
function safeUrl(url?: string): string | undefined {
  try { return url && ["https:", "http:"].includes(new URL(url).protocol) ? url : undefined; } catch { return undefined; }
}
function dateLabel(value: string): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "較早的更新";
}

export default function AiUpdateDigest({ state, setState, scope = "home", onNavigate }: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  scope?: UpdateScope;
  onNavigate: (target: HomeAgendaTarget) => void;
}) {
  const [period, setPeriod] = useState<UpdatePeriod>("unread");
  const [expanded, setExpanded] = useState(scope === "home" || scope === "ai");
  const [showAll, setShowAll] = useState(false);
  const entries = selectAiUpdates(state, scope, period);
  const unread = selectAiUpdates(state, scope, "unread").length;
  const groups = groupAiUpdates(entries);
  const pending = entries.filter((entry) => entry.status === "pending" || entry.status === "reverted").length;
  const applied = entries.filter((entry) => entry.status === "applied").length;
  const sources = new Map(entries.flatMap((entry) => entry.sources).map((source) => [source.id, source]));
  const areas = [...new Set(entries.map((entry) => updateArea[entry.entity]))];
  const compact = scope !== "home" && scope !== "ai";
  const hasHistory = selectAiUpdates(state, scope, "all").length > 0;
  if (compact && !hasHistory) return null;

  return <section className={`ai-digest paper-card ${compact ? "ai-digest-compact" : ""}`} aria-labelledby={`digest-title-${scope}`}>
    <div className="ai-digest-heading">
      <div className="ai-digest-title"><Sparkles size={22} /><div><p className="eyebrow">{compact ? "這一頁的變動" : "依 AI 提案整理"}</p><h2 id={`digest-title-${scope}`}>{compact ? "相關更新" : "AI 更新總覽"}{unread > 0 ? <span className="ai-digest-unread">{unread} 筆未讀</span> : null}</h2></div></div>
      <button className="button text-button" aria-expanded={expanded} aria-controls={`digest-content-${scope}`} onClick={() => setExpanded((value) => !value)}>{expanded ? "收合" : "查看更新"}<ChevronDown size={17} className={expanded ? "digest-chevron-open" : ""} /></button>
    </div>
    {expanded ? <div id={`digest-content-${scope}`}>
      <div className="ai-digest-toolbar"><div className="ai-digest-periods" role="group" aria-label="更新期間">{periods.map((item) => <button key={item.id} aria-pressed={period === item.id} onClick={() => { setPeriod(item.id); setShowAll(false); }}>{item.label}</button>)}</div>{unread > 0 ? <button className="button text-button" onClick={() => { setState((current) => markAiUpdatesRead(current, scope)); if (period === "unread") setPeriod("week"); if (compact) setExpanded(false); }}><Check size={15} />{compact ? "標記本頁已讀" : "全部標記已讀"}</button> : null}</div>
      {entries.length ? <>
        <p className="ai-digest-summary">{groups.length} 件事有新資訊，涉及{areas.join("、")}。{sources.size ? `共 ${sources.size} 個來源。` : ""}</p>
        <div className="ai-digest-counts"><span className="pending">{pending} 待確認</span><span className="applied">{applied} 已套用</span>{entries.length - pending - applied > 0 ? <span>{entries.length - pending - applied} 已略過或到期</span> : null}</div>
        <div className="ai-digest-groups">{(showAll ? groups : groups.slice(0, compact ? 2 : 3)).map((group) => <details className="ai-digest-group" key={`${group[0].entity}-${group[0].targetId ?? group[0].id}`}>
          <summary><span className="ai-digest-area">{updateArea[group[0].entity]}</span><span className="ai-digest-group-copy"><strong>{group[0].title}</strong><span>{group[0].summary}</span></span><span className={`ai-digest-status ${group[0].status}`}>{group.length > 1 ? `${group.length} 筆更新` : updateStatus[group[0].status]}</span><ChevronDown size={16} /></summary>
          <div className="ai-digest-details">{group.map((entry) => {
            const target = targetForUpdate(entry, state);
            return <article key={entry.id}>
              <div className="ai-digest-entry-heading"><strong>{entry.action === "add" ? "新增" : "修改"} · {entry.title}</strong><span className={`ai-digest-status ${entry.status}`}>{updateStatus[entry.status]}</span></div>
              <p>{entry.summary}</p>
              <small>{dateLabel(entry.updatedAt)}{entry.status === "pending" || entry.status === "reverted" ? " · 確認後才會更新手帳" : entry.status === "applied" ? " · 以下為當時套用的內容" : " · 未套用到手帳"}</small>
              {entry.changes.length ? <dl className="ai-digest-changes">{entry.changes.map((change, index) => <div key={`${change.field}-${index}`}><dt>{change.field}</dt><dd>{entry.action === "update" ? <><span className="ai-digest-before">{change.before ?? "未保留舊值"}</span><ArrowRight size={14} aria-label="改為" /></> : null}<span>{change.after}</span></dd></div>)}</dl> : null}
              {entry.sources.length ? <div className="ai-digest-sources"><strong>來源</strong>{entry.sources.map((source) => <span key={source.id}>{safeUrl(source.url) ? <a href={safeUrl(source.url)} target="_blank" rel="noreferrer">{source.label}</a> : source.label}{source.capturedAt ? <small> · {source.capturedAt.slice(0, 10)}</small> : null}</span>)}</div> : <small>此筆舊紀錄未保留來源</small>}
              {target ? <button className="button text-button" onClick={() => onNavigate(target)}>{entry.status === "pending" || entry.status === "reverted" ? "前往確認" : "查看所在位置"}<ArrowRight size={15} /></button> : null}
            </article>;
          })}</div>
        </details>)}</div>
        {groups.length > (compact ? 2 : 3) ? <button className="button text-button ai-digest-more" onClick={() => setShowAll((value) => !value)}>{showAll ? "收起更多更新" : `查看全部 ${groups.length} 件事`}<ChevronDown size={16} /></button> : null}
      </> : <div className="ai-digest-empty"><Check size={21} /><div><strong>{period === "unread" ? "目前沒有未讀更新" : period === "today" ? "今天還沒有新更新" : "這段期間沒有更新紀錄"}</strong><p>{hasHistory ? "可以切換期間，回看來源與變動內容。" : "AI 整理信件、文件或事項後，這裡會彙整新資訊與待確認內容。"}</p></div></div>}
      <p className="ai-digest-footnote">保留最近最多 300 筆精簡摘要，內容較多時筆數會減少；提案到期後仍可回看。更早已清除的紀錄無法回補。</p>
    </div> : <p className="ai-digest-collapsed">{unread ? `${unread} 筆相關更新尚未查看` : "相關更新已讀，可展開回看紀錄。"}</p>}
  </section>;
}
