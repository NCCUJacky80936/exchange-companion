"use client";

import { AlertTriangle, ArrowRight, Bot, ChevronLeft, ChevronRight, Clock3, MapPin, ShieldCheck, WalletCards } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { phaseMeta } from "../lib/default-data";
import { buildHomeAgenda, buildHomeBulletins, summarizeHomeBudget, type HomeAgendaItem, type HomeAgendaTarget } from "../lib/home-dashboard";
import type { AppState } from "../lib/types";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";
import HomeActivationGuide from "./HomeActivationGuide";
import FloatingSurface from "./ui/FloatingSurface";

const sourceLabel: Record<HomeAgendaItem["source"], string> = { task: "任務", study: "行事曆", travel: "旅行", journey: "交換節點" };

function daysBetween(target: string, today: string): number | null {
  if (!target || !today) return null;
  return Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

function shiftMonth(month: string, amount: number): string {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return value.toISOString().slice(0, 7);
}

function HomeMonthCalendar({ state, today, onNavigate }: { state: AppState; today: string; onNavigate: (target: HomeAgendaTarget) => void }) {
  const rootRef = useRef<HTMLElement>(null);
  const activeAnchorRef = useRef<HTMLElement | null>(null);
  const hoverOpenedDateRef = useRef("");
  const hoverCloseTimerRef = useRef<number | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [activeDate, setActiveDate] = useState("");
  const monthStart = `${month}-01`;
  const first = new Date(`${monthStart}T12:00:00Z`);
  const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1, 12));
  const monthDays = Math.round((nextMonth.getTime() - first.getTime()) / 86_400_000);
  const items = useMemo(() => buildHomeAgenda(state, monthStart, monthDays), [monthDays, monthStart, state]);
  const byDate = useMemo(() => {
    const result = new Map<string, HomeAgendaItem[]>();
    items.forEach((item) => result.set(item.date, [...(result.get(item.date) ?? []), item]));
    return result;
  }, [items]);
  const leading = first.getUTCDay();
  const cellCount = Math.max(35, Math.ceil((leading + monthDays) / 7) * 7);
  const activeItems = activeDate ? byDate.get(activeDate) ?? [] : [];
  const activeDay = activeDate ? Number(activeDate.slice(-2)) : 0;

  const cancelHoverClose = () => {
    if (hoverCloseTimerRef.current === null) return;
    window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  };
  const closeCalendar = () => {
    cancelHoverClose();
    hoverOpenedDateRef.current = "";
    setActiveDate("");
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseTimerRef.current = window.setTimeout(closeCalendar, 160);
  };

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".home-calendar-date:not(:disabled)") && !target.closest(".home-calendar-popover")) {
        hoverOpenedDateRef.current = "";
        setActiveDate("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeCalendar(); };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      if (hoverCloseTimerRef.current !== null) window.clearTimeout(hoverCloseTimerRef.current);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
    // Calendar close helpers intentionally stay scoped to this mounted calendar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <section ref={rootRef} className="home-agenda-board home-calendar-board paper-card" aria-labelledby="home-calendar-title">
    <div className="section-heading home-calendar-heading">
      <div><p className="eyebrow">Exchange calendar</p><h2 id="home-calendar-title">{first.getUTCFullYear()} 年 {first.getUTCMonth() + 1} 月</h2></div>
      <div className="home-calendar-nav" aria-label="切換月份">
        <button className="icon-button" onClick={() => { setMonth((value) => shiftMonth(value, -1)); setActiveDate(""); }} aria-label="上一個月"><ChevronLeft /></button>
        <button className="home-calendar-today" onClick={() => { setMonth(today.slice(0, 7)); setActiveDate(""); }}>今天</button>
        <button className="icon-button" onClick={() => { setMonth((value) => shiftMonth(value, 1)); setActiveDate(""); }} aria-label="下一個月"><ChevronRight /></button>
      </div>
    </div>
    <div className="home-calendar-legend" aria-label="行程類型">
      {Object.entries(sourceLabel).map(([source, label]) => <span key={source} className={`source-${source}`}><i />{label}</span>)}
    </div>
    <div className="home-month-weekdays" aria-hidden="true">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="home-month-grid home-inline-month-grid">
      {Array.from({ length: cellCount }).map((_, cellIndex) => {
        const day = cellIndex - leading + 1;
        if (day < 1 || day > monthDays) return <span className="home-month-empty" key={`empty-${cellIndex}`} />;
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const dayItems = byDate.get(date) ?? [];
        const active = activeDate === date;
        const row = Math.floor(cellIndex / 7);
        const column = cellIndex % 7;
        return <div
          className={`home-month-day ${date === today ? "today" : ""} ${active ? "active" : ""} row-${row} column-${column}`}
          key={date}
          onMouseEnter={(event) => { if (!dayItems.length) return; cancelHoverClose(); activeAnchorRef.current = event.currentTarget.querySelector("button"); hoverOpenedDateRef.current = date; setActiveDate(date); }}
          onMouseLeave={scheduleHoverClose}
        >
          <button className="home-calendar-date" aria-expanded={active} disabled={!dayItems.length} onClick={(event) => {
            activeAnchorRef.current = event.currentTarget;
            setActiveDate((current) => {
              if (current === date && hoverOpenedDateRef.current !== date) return "";
              hoverOpenedDateRef.current = "";
              return date;
            });
          }}>
            <strong>{day}</strong>
            {dayItems.length ? <span className="home-calendar-dots" aria-label={`${dayItems.length} 個行程`}>{dayItems.slice(0, 4).map((item) => <i key={item.id} className={`source-${item.source}`} />)}{dayItems.length > 4 ? <small>+{dayItems.length - 4}</small> : null}</span> : null}
          </button>
        </div>;
      })}
    </div>
    <FloatingSurface open={Boolean(activeDate && activeItems.length)} anchorRef={activeAnchorRef} onClose={closeCalendar} prefer="top" label={`${first.getUTCMonth() + 1} 月 ${activeDay} 日行程`} className="home-calendar-popover">
      <div className="home-calendar-popover-content" onMouseEnter={cancelHoverClose} onMouseLeave={scheduleHoverClose}>
        <strong>{first.getUTCMonth() + 1} 月 {activeDay} 日</strong>
        {activeItems.map((item) => <button key={item.id} className={`source-${item.source}`} onClick={() => { closeCalendar(); onNavigate(item.target); }}><i /><span><b>{item.title}</b><small>{item.time ? `${item.time} · ` : ""}{item.detail}</small></span><ChevronRight /></button>)}
      </div>
    </FloatingSurface>
  </section>;
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
  const applicable = state.tasks.filter((task) => task.status !== "not-applicable");
  const done = applicable.filter((task) => task.status === "done").length;
  const progress = applicable.length ? Math.round((done / applicable.length) * 100) : 0;
  const countdown = daysBetween(state.journey.startDate, todayIso);
  const agentConnected = cloud.conciergeConnectionsReady
    ? cloud.conciergeConnections.some((connection) => !connection.revokedAt)
    : null;
  const bulletins = useMemo(() => buildHomeBulletins(state, todayIso, agentConnected), [agentConnected, state, todayIso]);
  const budget = useMemo(() => summarizeHomeBudget(state.budget), [state.budget]);
  const nextTask = [...applicable].filter((task) => task.status !== "done").sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"))[0];
  const currentPhase = nextTask ? phaseMeta[nextTask.phase].label : "全部準備已完成";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [forceGuide, state.homeExperience?.mode]);

  if (state.homeExperience?.mode === "activation" || forceGuide) return <HomeActivationGuide state={state} setState={setState} cloud={cloud} forced={forceGuide && state.homeExperience?.mode !== "activation"} onClose={onCloseGuide} />;

  return <div className="page-stack home-dashboard">
    <section className="home-status-strip paper-card">
      <div className="home-status-copy"><p className="eyebrow">今天的交換手帳</p><h1>嗨，{state.journey.ownerName || "交換生"}</h1><div className="home-route"><MapPin size={17} /><strong>{state.journey.homeCity || "出發地待補"}</strong><ArrowRight size={16} /><strong>{state.journey.hostCity || "目的地待補"}</strong></div></div>
      <div className="home-status-progress"><span><strong>{progress}%</strong>總進度</span><div className="home-status-progress-bar" aria-label={`交換準備完成 ${progress}%`}><i style={{ width: `${progress}%` }} /></div><small>{done} / {applicable.length} 項完成</small></div>
      <div className="home-status-countdown"><span>{countdown !== null && countdown >= 0 ? "距離出發" : "交換旅程"}</span><strong>{countdown === null ? "—" : countdown >= 0 ? countdown : Math.abs(countdown)}</strong><small>{countdown !== null && countdown < 0 ? "天前出發" : "天"}</small></div>
      <div className="home-status-art"><Image src="/images/exchange-hero-clean.webp" alt="手繪交換旅行路線插畫" width={440} height={220} /></div>
    </section>

    <div className="home-daily-grid">
      <HomeMonthCalendar state={state} today={todayIso} onNavigate={onNavigate} />

      <aside className={`home-bulletin-board paper-card ${bulletins.length ? "has-items" : "safe"}`}>
        <div className="section-heading"><div><p className="eyebrow">風險與提醒</p><h2>交換佈告欄</h2></div><span className="home-bulletin-count">{bulletins.length}</span></div>
        <div className="home-bulletin-list">
          {bulletins.length ? bulletins.map((item) => <button key={item.id} className={`home-bulletin-item ${item.tone}`} disabled={!item.target} onClick={() => item.target && onNavigate(item.target)}>{item.tone === "danger" ? <AlertTriangle /> : item.tone === "safe" ? <ShieldCheck /> : item.priority === 3 ? <Bot /> : <Clock3 />}<span><strong>{item.title}</strong><small>{item.summary}</small></span>{item.target ? <ChevronRight size={16} /> : null}</button>) : <div className="home-safe-state"><ShieldCheck /><div><strong>目前沒有需要立刻處理的風險</strong><span>新增期限、課表或旅行後，佈告欄會持續幫你檢查。</span></div></div>}
          {Array.from({ length: Math.max(0, 3 - Math.max(1, bulletins.length)) }).map((_, index) => <div className="home-bulletin-empty" key={`empty-${index}`} aria-hidden="true"><span>這裡目前沒有更多通知</span></div>)}
        </div>
      </aside>
    </div>

    <section className="home-core-grid">
      <button className="home-core-card journey paper-card" onClick={() => onNavigate({ section: "journey", task: nextTask?.id })}><div className="home-core-icon"><Image src="/images/doodle-icons-v2/journey-route.webp" alt="" width={60} height={60} /></div><div><p className="eyebrow">交換旅程</p><h2>{progress}% 已完成</h2><p>目前階段：{currentPhase}</p><span>{nextTask ? `下一個里程碑 · ${nextTask.title}${nextTask.dueDate ? ` · ${nextTask.dueDate}` : ""}` : "所有目前適用任務都已完成"}</span></div><ArrowRight /></button>
      <button className="home-core-card budget paper-card" onClick={() => onNavigate({ section: "settings", hash: "budget-settings" })}><div className="home-core-icon"><Image src="/images/doodle-icons-v2/resources-book.webp" alt="" width={60} height={60} /></div><div><p className="eyebrow">基礎預算</p><h2>每月與落地費用</h2><div className="home-budget-lines"><span><strong>每月</strong>{budget.monthly.length ? budget.monthly.map((item) => `${item.currency} ${item.amount.toLocaleString()}`).join(" · ") : "尚未設定"}</span><span><strong>一次性</strong>{budget.once.length ? budget.once.map((item) => `${item.currency} ${item.amount.toLocaleString()}`).join(" · ") : "尚未設定"}</span></div><small>{budget.basisCounts.confirmed} 已確認 · {budget.basisCounts.estimate} 估算 · {budget.basisCounts.unset} 待填</small></div><WalletCards /></button>
    </section>

    <button className="home-guide-link" onClick={() => onNavigate({ section: "home", guide: "1" })}>不知道怎麼讓 AI 更新手帳？重新打開使用指南 <ArrowRight size={15} /></button>

  </div>;
}
