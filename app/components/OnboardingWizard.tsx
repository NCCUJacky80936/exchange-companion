"use client";

import { ArrowRight, CalendarDays, MapPin, School, UserRound } from "lucide-react";
import Image from "next/image";
import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { exchangeCurrencies } from "../lib/profile";
import type { AppState } from "../lib/types";

function moveDate(date: string | undefined, dayDelta: number): string | undefined {
  if (!date) return undefined;
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  value.setUTCDate(value.getUTCDate() + dayDelta);
  return value.toISOString().slice(0, 10);
}

export default function OnboardingWizard({ state, setState }: { state: AppState; setState: Dispatch<SetStateAction<AppState>> }) {
  const [error, setError] = useState("");

  function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") ?? "");
    const endDate = String(form.get("endDate") ?? "");
    if (!startDate || !endDate || endDate < startDate) {
      setError("請確認交換開始與結束日期；結束日期不能早於開始日期。");
      return;
    }
    const oldStart = new Date(`${state.journey.startDate}T12:00:00Z`).getTime();
    const newStart = new Date(`${startDate}T12:00:00Z`).getTime();
    const dayDelta = Math.round((newStart - oldStart) / 86_400_000);
    const currency = String(form.get("currency") ?? "USD").toUpperCase();
    const hostCountry = String(form.get("hostCountry") ?? "").trim();

    setState((current) => ({
      ...current,
      setupCompleted: true,
      journey: {
        ...current.journey,
        ownerName: String(form.get("ownerName") ?? "").trim(),
        homeCity: String(form.get("homeCity") ?? "").trim(),
        hostCity: String(form.get("hostCity") ?? "").trim(),
        hostSchool: String(form.get("hostSchool") ?? "").trim(),
        program: String(form.get("program") ?? "").trim(),
        startDate,
        endDate,
        orientationDate: "",
        destinations: [hostCountry],
      },
      tasks: current.tasks.map((task) => ({
        ...task,
        dueDate: moveDate(task.dueDate, dayDelta),
        scheduledAt: task.scheduledAt ? `${moveDate(task.scheduledAt.slice(0, 10), dayDelta)}${task.scheduledAt.slice(10)}` : undefined,
      })),
      budget: current.budget.map((item) => ({ ...item, currency })),
    }));
  }

  return (
    <main className="auth-shell onboarding-shell">
      <section className="auth-card paper-card onboarding-card" aria-labelledby="onboarding-title">
        <span className="tape" />
        <div className="auth-brand"><span className="brand-stamp">旅</span><div><strong>交換手帳</strong><small>Start your own journey</small></div></div>
        <div className="onboarding-heading">
          <div><p className="eyebrow">First page</p><h1 id="onboarding-title">先告訴我，你要去哪裡交換？</h1><p>這些資料只用來建立你的私人手帳。下一步再把交接檔交給 Exchange Concierge，自動補齊學校規定、任務、資源與行李。</p></div>
          <Image src="/images/exchange-hero-placeholder.svg" alt="通用的手繪交換旅行行李插畫" width={260} height={175} />
        </div>
        <form className="onboarding-form" onSubmit={completeSetup}>
          <label className="field"><span><UserRound size={15} />怎麼稱呼你</span><input name="ownerName" required maxLength={80} placeholder="例如 Austin" /></label>
          <label className="field"><span><MapPin size={15} />從哪個城市出發</span><input name="homeCity" required maxLength={80} placeholder="輸入你的出發城市" /></label>
          <label className="field"><span><MapPin size={15} />交換國家</span><input name="hostCountry" required maxLength={80} placeholder="例如 Japan" /></label>
          <label className="field"><span><MapPin size={15} />交換城市</span><input name="hostCity" required maxLength={80} placeholder="例如 Tokyo" /></label>
          <label className="field field-full"><span><School size={15} />交換學校</span><input name="hostSchool" required maxLength={140} placeholder="輸入學校完整名稱" /></label>
          <label className="field field-full"><span><School size={15} />交換計畫／科系</span><input name="program" required maxLength={140} placeholder="例如 Exchange Program／Design" /></label>
          <label className="field"><span><CalendarDays size={15} />交換開始日</span><input name="startDate" type="date" required /></label>
          <label className="field"><span><CalendarDays size={15} />交換結束日</span><input name="endDate" type="date" required /></label>
          <label className="field"><span>主要預算幣別</span><select name="currency" defaultValue="" required><option value="" disabled>請選擇</option>{exchangeCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
          <div className="onboarding-submit"><button className="button primary" type="submit">建立我的交換手帳<ArrowRight size={18} /></button><small>之後仍可在手帳中修改，AI 不會靜默覆蓋你的手動紀錄。</small></div>
        </form>
        {error ? <p className="auth-alert" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
