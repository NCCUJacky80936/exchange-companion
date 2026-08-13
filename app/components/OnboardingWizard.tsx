"use client";

import { ArrowLeft, ArrowRight, CalendarDays, MapPin, School, UserRound } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { exchangeCurrencies } from "../lib/profile";
import type { AppState } from "../lib/types";

type Draft = { ownerName: string; homeCity: string; hostCountry: string; hostCity: string; hostSchool: string; program: string; startDate: string; endDate: string; currency: string };

function dayDistance(from: string, to: string): number {
  const fromTime = Date.parse(`${from}T12:00:00Z`);
  const toTime = Date.parse(`${to}T12:00:00Z`);
  return Math.round((toTime - fromTime) / 86_400_000);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function OnboardingWizard({ state, setState }: { state: AppState; setState: Dispatch<SetStateAction<AppState>> }) {
  const [step, setStep] = useState<2 | 3>(2);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>({ ownerName: "", homeCity: "", hostCountry: "", hostCity: "", hostSchool: "", program: "", startDate: "", endDate: "", currency: state.budget[0]?.currency || "USD" });
  const update = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  function goDetails(event: FormEvent) {
    event.preventDefault();
    if (!draft.hostCountry.trim() || !draft.hostCity.trim()) { setError("交換國家與城市是建立手帳唯一必填的目的地資料。"); return; }
    setError(""); setStep(3);
  }

  function complete(skipOptional = false) {
    if (!draft.hostCountry.trim() || !draft.hostCity.trim()) return;
    if (!skipOptional && draft.startDate && draft.endDate && draft.endDate < draft.startDate) { setError("交換結束日期不能早於開始日期。"); return; }
    setState((current) => {
      const startDate = skipOptional ? "" : draft.startDate;
      const endDate = skipOptional ? "" : draft.endDate;
      const offset = startDate && current.journey.startDate ? dayDistance(current.journey.startDate, startDate) : 0;
      const endOffset = endDate && current.journey.endDate ? dayDistance(current.journey.endDate, endDate) : offset;
      return {
        ...current,
        setupCompleted: true,
        homeExperience: {
          mode: "activation",
          workflow: "undecided",
          tutorialVersion: 1,
        },
        journey: { ...current.journey, ownerName: draft.ownerName.trim(), homeCity: draft.homeCity.trim(), hostCity: draft.hostCity.trim(), hostSchool: skipOptional ? "" : draft.hostSchool.trim(), program: skipOptional ? "" : draft.program.trim(), startDate, endDate, orientationDate: "", destinations: [draft.hostCountry.trim()] },
        tasks: current.tasks.map((task) => ({
          ...task,
          dueDate: !startDate || (task.phase === "return" && !endDate)
            ? undefined
            : task.dueDate ? shiftDate(task.dueDate, task.phase === "return" ? endOffset : offset) : undefined,
          scheduledAt: undefined,
        })),
        budget: current.budget.map((item) => ({ ...item, currency: draft.currency || item.currency })),
      };
    });
  }

  return <main className="auth-shell onboarding-shell"><section className="auth-card paper-card onboarding-card" aria-labelledby="onboarding-title"><span className="tape" /><div className="auth-brand"><span className="brand-stamp">旅</span><div><strong>交換手帳</strong><small>Almost ready</small></div></div><div className="onboarding-progress"><span className="done">✓ 帳號</span><span className={step === 2 ? "active" : "done"}>2 目的地</span><span className={step === 3 ? "active" : ""}>3 交換細節</span></div>
    <div className="onboarding-heading"><div><p className="eyebrow structural-eyebrow">Step {step} of 3</p><h1 id="onboarding-title">{step === 2 ? "你要去哪裡交換？" : "先放入你已經知道的資料"}</h1><p>{step === 2 ? "只有交換國家與城市必填，其餘資料可以交給 AI Agent 之後補齊。" : "學校、科系、日期與幣別都可以略過；進入手帳後仍能手動修改或請 Agent 查證。"}</p></div><Image src="/images/exchange-hero-placeholder.svg" alt="通用的手繪交換旅行行李插畫" width={260} height={175} /></div>
    {step === 2 ? <form className="onboarding-form" onSubmit={goDetails}><label className="field"><span><MapPin size={15} />交換國家 *</span><input value={draft.hostCountry} onChange={(e) => update("hostCountry", e.target.value)} placeholder="例如 Japan" required /></label><label className="field"><span><MapPin size={15} />交換城市 *</span><input value={draft.hostCity} onChange={(e) => update("hostCity", e.target.value)} placeholder="例如 Tokyo" required /></label><label className="field"><span><UserRound size={15} />怎麼稱呼你（選填）</span><input value={draft.ownerName} onChange={(e) => update("ownerName", e.target.value)} /></label><label className="field"><span><MapPin size={15} />從哪個城市出發（選填）</span><input value={draft.homeCity} onChange={(e) => update("homeCity", e.target.value)} /></label><div className="onboarding-submit"><button className="button primary" type="submit">下一步<ArrowRight size={18} /></button><small>國家與城市會決定後續要查找的簽證、學校與生活規則。</small></div></form>
      : <form className="onboarding-form" onSubmit={(e) => { e.preventDefault(); complete(false); }}><label className="field field-full"><span><School size={15} />交換學校（選填）</span><input value={draft.hostSchool} onChange={(e) => update("hostSchool", e.target.value)} /></label><label className="field field-full"><span><School size={15} />交換計畫／科系（選填）</span><input value={draft.program} onChange={(e) => update("program", e.target.value)} /></label><label className="field"><span><CalendarDays size={15} />開始日（選填）</span><input type="date" value={draft.startDate} onChange={(e) => update("startDate", e.target.value)} /></label><label className="field"><span><CalendarDays size={15} />結束日（選填）</span><input type="date" value={draft.endDate} onChange={(e) => update("endDate", e.target.value)} /></label><label className="field"><span>主要預算幣別（選填）</span><select value={draft.currency} onChange={(e) => update("currency", e.target.value)}>{exchangeCurrencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label><div className="onboarding-submit onboarding-final-actions"><button className="button text-button" type="button" onClick={() => setStep(2)}><ArrowLeft size={16} />上一步</button><div><button className="button secondary" type="button" onClick={() => complete(true)}>先略過，交給 AI 補齊</button><button className="button primary" type="submit">完成並進入手帳<ArrowRight size={18} /></button></div></div></form>}
    {error ? <p className="auth-alert" role="alert">{error}</p> : null}
  </section></main>;
}
