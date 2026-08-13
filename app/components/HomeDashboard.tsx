"use client";

import { AlertTriangle, ArrowRight, Bot, CalendarDays, Check, ChevronRight, Clock3, MapPin, PiggyBank, ShieldCheck, WalletCards, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { phaseMeta } from "../lib/default-data";
import { buildHomeAgenda, buildHomeBulletins, shiftHomeDate, summarizeHomeBudget, type HomeAgendaItem, type HomeAgendaTarget } from "../lib/home-dashboard";
import type { AppState } from "../lib/types";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";
import HomeActivationGuide from "./HomeActivationGuide";

const sourceLabel: Record<HomeAgendaItem["source"], string> = { task: "任務", study: "行事曆", travel: "旅行", journey: "交換節點" };

function formatCompactDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()} ${["日", "一", "二", "三", "四", "五", "六"][value.getUTCDay()]}`;
}

function daysBetween(target: string, today: string): number | null {
  if (!target || !today) return null;
  return Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

function MonthAgendaModal({ state, today, onClose, onNavigate }: { state: AppState; today: string; onClose: () => void; onNavigate: (target: HomeAgendaTarget) => void }) {
  const reduceMotion = useReducedMotion();
  const closeButton = useRef<HTMLButtonElement>(null);
  const monthStart = `${today.slice(0, 7)}-01`;
  const first = new Date(`${monthStart}T12:00:00Z`);
  const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1, 12));
  const monthDays = Math.round((nextMonth.getTime() - first.getTime()) / 86_400_000);
  const items = buildHomeAgenda(state, monthStart, monthDays);
  const byDate = new Map<string, HomeAgendaItem[]>();
  items.forEach((item) => byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]));
  const leading = first.getUTCDay();

  useEffect(() => {
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <motion.div className="modal-backdrop home-month-backdrop" role="presentation" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section className="modal-card home-month-modal paper-card" role="dialog" aria-modal="true" aria-labelledby="home-month-title" initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.99 }}>
      <div className="modal-heading"><div><p className="eyebrow">整月交換行事曆</p><h2 id="home-month-title">{first.getUTCFullYear()} 年 {first.getUTCMonth() + 1} 月</h2></div><button ref={closeButton} className="icon-button" onClick={onClose} aria-label="關閉整月行事曆"><X /></button></div>
      <div className="home-month-weekdays" aria-hidden="true">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="home-month-grid">{Array.from({ length: leading }).map((_, index) => <span className="home-month-empty" key={`empty-${index}`} />)}{Array.from({ length: monthDays }).map((_, index) => {
        const day = index + 1;
        const date = `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
        const dayItems = byDate.get(date) ?? [];
        return <div className={`home-month-day ${date === today ? "today" : ""}`} key={date}><strong>{day}</strong><div>{dayItems.slice(0, 3).map((item) => <button key={item.id} className={`source-${item.source}`} onClick={() => { onNavigate(item.target); onClose(); }}>{item.title}</button>)}{dayItems.length > 3 ? <small>＋{dayItems.length - 3}</small> : null}</div></div>;
      })}</div>
    </motion.section>
  </motion.div>;
}

export default function HomeDashboard({ state, setState, cloud, todayIso, forceGuide, onNavigate, onCloseGuide }: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  cloud: ExchangeCloudController;
  todayIso: string;
  forceGuide: boolean;
  onNavigate: (target: HomeAgendaTarget) => void;
  onCloseGuide: () => void;
}) {
  const [monthOpen, setMonthOpen] = useState(false);
  const applicable = state.tasks.filter((task) => task.status !== "not-applicable");
  const done = applicable.filter((task) => task.status === "done").length;
  const progress = applicable.length ? Math.round((done / applicable.length) * 100) : 0;
  const countdown = daysBetween(state.journey.startDate, todayIso);
  const agenda = useMemo(() => buildHomeAgenda(state, todayIso), [state, todayIso]);
  const agentConnected = cloud.conciergeConnections.some((connection) => !connection.revokedAt);
  const bulletins = useMemo(() => buildHomeBulletins(state, todayIso, agentConnected), [agentConnected, state, todayIso]);
  const budget = useMemo(() => summarizeHomeBudget(state.budget), [state.budget]);
  const nextTask = [...applicable].filter((task) => task.status !== "done").sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"))[0];
  const currentPhase = nextTask ? phaseMeta[nextTask.phase].label : "全部準備已完成";
  const firstWeekEnd = shiftHomeDate(todayIso, 6);
  const firstWeek = agenda.filter((item) => item.date <= firstWeekEnd);
  const secondWeek = agenda.filter((item) => item.date > firstWeekEnd);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [forceGuide, state.homeExperience?.mode]);

  if (state.homeExperience?.mode === "activation" || forceGuide) return <HomeActivationGuide state={state} setState={setState} cloud={cloud} forced={forceGuide && state.homeExperience?.mode !== "activation"} onClose={onCloseGuide} />;

  const agendaColumn = (title: string, items: HomeAgendaItem[]) => <section className="home-week-column"><div className="home-week-heading"><CalendarDays size={18} /><strong>{title}</strong><span>{items.length}</span></div>{items.length ? <div className="home-agenda-list">{items.map((item) => <button className={`home-agenda-item source-${item.source} ${item.completed ? "completed" : ""}`} key={item.id} onClick={() => onNavigate(item.target)}><span className="home-agenda-date">{formatCompactDate(item.date)}{item.time ? <small>{item.time}</small> : null}</span><span className="home-agenda-copy"><strong>{item.title}</strong><small>{sourceLabel[item.source]} · {item.detail}</small></span><ChevronRight size={16} /></button>)}</div> : <p className="home-agenda-empty">這一週目前沒有安排，可以放心留白。</p>}</section>;

  return <div className="page-stack home-dashboard">
    <section className="home-status-strip paper-card">
      <div className="home-status-copy"><p className="eyebrow">今天的交換手帳</p><h1>嗨，{state.journey.ownerName || "交換生"}</h1><div className="home-route"><MapPin size={17} /><strong>{state.journey.homeCity || "出發地待補"}</strong><ArrowRight size={16} /><strong>{state.journey.hostCity || "目的地待補"}</strong></div></div>
      <div className="home-status-progress"><span><strong>{progress}%</strong>總進度</span><div className="home-status-progress-bar" aria-label={`交換準備完成 ${progress}%`}><i style={{ width: `${progress}%` }} /></div><small>{done} / {applicable.length} 項完成</small></div>
      <div className="home-status-countdown"><span>{countdown !== null && countdown >= 0 ? "距離出發" : "交換旅程"}</span><strong>{countdown === null ? "—" : countdown >= 0 ? countdown : Math.abs(countdown)}</strong><small>{countdown !== null && countdown < 0 ? "天前出發" : "天"}</small></div>
      <div className="home-status-art"><Image src="/images/exchange-hero-placeholder.svg" alt="通用的手繪交換旅行插畫" fill sizes="180px" /></div>
    </section>

    <div className="home-daily-grid">
      <section className="home-agenda-board paper-card">
        <div className="section-heading"><div><p className="eyebrow">接下來 14 天</p><h2>兩週行程軸</h2></div><button className="button secondary home-month-button" onClick={() => setMonthOpen(true)}><CalendarDays size={17} />查看整月</button></div>
        <div className="home-weeks">{agendaColumn("本週", firstWeek)}{agendaColumn("下週", secondWeek)}</div>
      </section>

      <aside className={`home-bulletin-board paper-card ${bulletins.length ? "has-items" : "safe"}`}>
        <div className="section-heading"><div><p className="eyebrow">風險與提醒</p><h2>交換佈告欄</h2></div><span className="home-bulletin-count">{bulletins.length}</span></div>
        {bulletins.length ? <div className="home-bulletin-list">{bulletins.map((item) => <button key={item.id} className={`home-bulletin-item ${item.tone}`} disabled={!item.target} onClick={() => item.target && onNavigate(item.target)}>{item.tone === "danger" ? <AlertTriangle /> : item.tone === "safe" ? <ShieldCheck /> : item.priority === 3 ? <Bot /> : <Clock3 />}<span><strong>{item.title}</strong><small>{item.summary}</small></span>{item.target ? <ChevronRight size={16} /> : null}</button>)}</div> : <div className="home-safe-state"><ShieldCheck /><div><strong>目前沒有需要立刻處理的風險</strong><span>新增期限、課表或旅行後，佈告欄會持續幫你檢查。</span></div></div>}
      </aside>
    </div>

    <section className="home-core-grid">
      <button className="home-core-card journey paper-card" onClick={() => onNavigate({ section: "journey" })}><div className="home-core-icon"><Check /></div><div><p className="eyebrow">交換旅程</p><h2>{progress}% 已完成</h2><p>目前階段：{currentPhase}</p><span>{nextTask ? `下一個里程碑 · ${nextTask.title}${nextTask.dueDate ? ` · ${nextTask.dueDate}` : ""}` : "所有目前適用任務都已完成"}</span></div><ArrowRight /></button>
      <button className="home-core-card budget paper-card" onClick={() => onNavigate({ section: "settings", hash: "budget-settings" })}><div className="home-core-icon"><PiggyBank /></div><div><p className="eyebrow">基礎預算</p><h2>每月與落地費用</h2><div className="home-budget-lines"><span><strong>每月</strong>{budget.monthly.length ? budget.monthly.map((item) => `${item.currency} ${item.amount.toLocaleString()}`).join(" · ") : "尚未設定"}</span><span><strong>一次性</strong>{budget.once.length ? budget.once.map((item) => `${item.currency} ${item.amount.toLocaleString()}`).join(" · ") : "尚未設定"}</span></div><small>{budget.basisCounts.confirmed} 已確認 · {budget.basisCounts.estimate} 估算 · {budget.basisCounts.unset} 待填</small></div><WalletCards /></button>
    </section>

    <button className="home-guide-link" onClick={() => onNavigate({ section: "home", guide: "1" })}>不知道怎麼讓 AI 更新手帳？重新打開使用指南 <ArrowRight size={15} /></button>

    <AnimatePresence>{monthOpen ? <MonthAgendaModal state={state} today={todayIso} onClose={() => setMonthOpen(false)} onNavigate={onNavigate} /> : null}</AnimatePresence>
  </div>;
}
