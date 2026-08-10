"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  GraduationCap,
  MapPin,
  Pencil,
  Plus,
  Route,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { type Dispatch, type FormEvent, type SetStateAction, useMemo, useState } from "react";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";
import type {
  AppState,
  StudyEvent,
  StudyEventKind,
  TravelActivity,
  TravelActivityKind,
  TravelDay,
  TravelPlan,
} from "../lib/types";
import { DayMapPanel, mapsUrlForActivity, TravelNotesPanel, TravelPackingPanel } from "./TravelTripPanels";

type TripView = "itinerary" | "notes" | "packing";

function ShareTravelModal({ plan, cloud, onPlanPublished, onClose }: { plan: TravelPlan; cloud: ExchangeCloudController; onPlanPublished: (plan: TravelPlan) => void; onClose: () => void }) {
  const [permission, setPermission] = useState<"viewer" | "editor">("viewer");
  const [accessMode, setAccessMode] = useState<"anyone" | "approved_google">("anyone");
  const [approvedEmail, setApprovedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");

  async function publish() {
    try {
      const published = await cloud.publishPlan(plan);
      onPlanPublished(published);
      setMessage("旅行已放上免費雲端；尚未產生任何分享連結。 ");
    } catch {
      setMessage("目前無法建立雲端旅行，本機內容沒有遺失。 ");
    }
  }

  async function createLink() {
    try {
      const result = await cloud.createShare({ plan, permission, accessMode, approvedEmail, expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined });
      setLink(result.url);
      await navigator.clipboard.writeText(result.url);
      setMessage("連結已建立並複製。可隨時撤銷；私人交換資料沒有包含在內。 ");
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes("account") ? "請填入 3–32 字元的手帳帳號代號。" : "連結建立失敗，請確認帳戶與雲端連線。 ");
    }
  }

  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <motion.div className="modal-card share-modal paper-card" role="dialog" aria-modal="true" aria-labelledby="share-travel-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 7 }}>
      <div className="modal-heading"><div><p className="eyebrow">Scoped sharing</p><h2 id="share-travel-title">分享「{plan.title}」</h2></div><button className="icon-button" onClick={onClose} aria-label="關閉"><X size={20} /></button></div>
      {!cloud.configured ? <div className="share-unavailable"><Sparkles size={24} /><div><strong>免費雲端會在最後一次上版時啟用</strong><p>現在先保留匯出與複製摘要；完成全部本機驗證後才建立雲端，避免反覆消耗部署額度。</p></div></div> : !plan.cloud?.published ? <div className="share-publish-step"><p>分享前只會上傳這一趟旅行的行程、地圖、注意事項與旅行行李。簽證、信件、住宿、帳戶、任務進度與私人課表都不會上傳到共編資料。</p><button className="button primary" disabled={cloud.busy} onClick={() => void publish()}><Share2 size={17} />建立這趟旅行的雲端版本</button><small>建立雲端版本不等於公開，下一步才會選擇分享條件。</small></div> : plan.cloud.permission !== "owner" ? <div className="share-unavailable"><Check size={24} /><div><strong>{plan.cloud.permission === "viewer" ? "你目前是唯讀成員" : "你可以編輯這趟旅行"}</strong><p>只有旅行擁有者能建立新的分享連結或指定其他帳號。</p></div></div> : <div className="share-form">
        <label className="field"><span>收到的人可以</span><select value={permission} onChange={(event) => setPermission(event.target.value as "viewer" | "editor")}><option value="viewer">只能查看</option><option value="editor">共同編輯</option></select></label>
        <label className="field"><span>誰能開啟</span><select value={accessMode} onChange={(event) => setAccessMode(event.target.value as "anyone" | "approved_google")}><option value="anyone">拿到連結的任何人（免登入）</option><option value="approved_google">只有指定手帳帳號</option></select></label>
        {accessMode === "approved_google" ? <label className="field field-full"><span>允許的手帳帳號代號</span><input name="approvedAccountId" autoComplete="username" spellCheck={false} value={approvedEmail} onChange={(event) => setApprovedEmail(event.target.value)} placeholder="例如：travel-friend" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}" /><small>對方需先免費建立相同代號的手帳帳號；不會寄送 Email。</small></label> : null}
        <label className="field field-full"><span>連結到期日（可留空）</span><input type="date" value={expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setExpiresAt(event.target.value)} /></label>
        <button className="button primary field-full" disabled={cloud.busy} onClick={() => void createLink()}><Share2 size={17} />建立並複製連結</button>
        {link ? <label className="field field-full"><span>剛建立的連結</span><input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label> : null}
      </div>}
      {message ? <p className="settings-message" role="status">{message}</p> : null}
      <div className="travel-sharing-note"><Sparkles size={16} /><span>分享是明確、限旅行、可預覽且可撤銷；個人衝突檢查仍只看每個人自己的課表。</span></div>
    </motion.div>
  </motion.div>;
}

const activityMeta: Record<TravelActivityKind, { label: string; icon: string; color: string }> = {
  place: { label: "景點", icon: "/images/doodle-icons/resources-safe.png", color: "terracotta" },
  food: { label: "餐廳", icon: "/images/doodle-icons/daily-life-safe.png", color: "yellow" },
  transport: { label: "交通", icon: "/images/doodle-icons/return-safe.png", color: "blue" },
  stay: { label: "住宿", icon: "/images/doodle-icons/arrival-safe.png", color: "sage" },
  note: { label: "備忘", icon: "/images/doodle-icons/documents-safe.png", color: "gray" },
};

const studyEventMeta: Record<StudyEventKind, { label: string; className: string }> = {
  class: { label: "上課", className: "blue" },
  exam: { label: "考試", className: "red" },
  deadline: { label: "期限", className: "yellow" },
  orientation: { label: "學校活動", className: "sage" },
  personal: { label: "不可排程", className: "gray" },
};

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end && result.length < 370) {
    result.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function makeDays(startDate: string, endDate: string, previous: TravelDay[] = []): TravelDay[] {
  const previousByDate = new Map(previous.map((day) => [day.date, day]));
  return enumerateDates(startDate, endDate).map((date, index) => previousByDate.get(date) ?? {
    id: `day-${date}`,
    date,
    title: `第 ${index + 1} 天`,
    activities: [],
  });
}

function formatDate(date: string, includeYear = false): string {
  const [year, month, day] = date.split("-");
  return includeYear ? `${year}.${month}.${day}` : `${Number(month)}月${Number(day)}日`;
}

function formatDateRange(startDate: string, endDate: string): string {
  return `${formatDate(startDate, true)} — ${formatDate(endDate, true)}`;
}

function overlaps(startDate: string, endDate: string, event: StudyEvent): boolean {
  const eventEnd = event.endDate ?? event.startDate;
  if (startDate > eventEnd || endDate < event.startDate) return false;
  if (!event.repeatWeekly) return true;
  const weekday = new Date(`${event.startDate}T12:00:00`).getDay();
  return enumerateDates(startDate > event.startDate ? startDate : event.startDate, endDate < eventEnd ? endDate : eventEnd)
    .some((date) => new Date(`${date}T12:00:00`).getDay() === weekday);
}

function travelDuration(plan: TravelPlan): number {
  return enumerateDates(plan.startDate, plan.endDate).length;
}

function commitmentKey(event: StudyEvent): string {
  const title = event.title.toLowerCase();
  if (title.includes("orientation")) return `${event.startDate}-orientation`;
  if (title.includes("learning agreement") || title.includes("course list")) return `${event.startDate}-learning-agreement`;
  if (title.includes("簽證面談") || (title.includes("visa") && title.includes("appointment"))) return `${event.startDate}-visa-appointment`;
  return `${event.startDate}-${title.replace(/[^\p{L}\p{N}]+/gu, "-")}`;
}

function downloadTravel(plan: TravelPlan): void {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${plan.title.replaceAll(/[^\p{L}\p{N}]+/gu, "-") || "travel-plan"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function TravelModal({ plan, onClose, onSave }: { plan: TravelPlan | null; onClose: () => void; onSave: (plan: TravelPlan) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = form.get("startDate")?.toString() ?? "";
    const endDate = form.get("endDate")?.toString() ?? "";
    if (!startDate || !endDate || endDate < startDate) return;
    const now = new Date().toISOString();
    onSave({
      id: plan?.id ?? `travel-${Date.now()}`,
      kind: "travel",
      title: form.get("title")?.toString().trim() ?? "",
      destinations: (form.get("destinations")?.toString() ?? "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
      startDate,
      endDate,
      travelers: form.get("travelers")?.toString().trim() ?? "",
      budget: Math.max(0, Number(form.get("budget")) || 0),
      currency: form.get("currency") as TravelPlan["currency"],
      notes: form.get("notes")?.toString().trim() ?? "",
      days: makeDays(startDate, endDate, plan?.days),
      travelNotes: plan?.travelNotes ?? [],
      packingItems: plan?.packingItems ?? [],
      createdAt: plan?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div className="modal-card travel-modal paper-card" role="dialog" aria-modal="true" aria-labelledby="travel-modal-title" initial={{ opacity: 0, y: 18, rotate: -0.4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: 8 }}>
        <div className="modal-heading">
          <div><p className="eyebrow">New travel postcard</p><h2 id="travel-modal-title">{plan ? "編輯這趟旅行" : "先把旅行放進手帳"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="關閉"><X size={20} /></button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="field field-full"><span>旅行名稱</span><input name="title" defaultValue={plan?.title} placeholder="例如：聖誕假期去布拉格" required /></label>
          <label className="field field-full"><span>城市／國家</span><input name="destinations" defaultValue={plan?.destinations.join("、")} placeholder="可輸入多個：Prague、Vienna" required /><small>先丟進想去的城市，之後再慢慢補細節。</small></label>
          <label className="field"><span>開始日期</span><input type="date" name="startDate" defaultValue={plan?.startDate} required /></label>
          <label className="field"><span>結束日期</span><input type="date" name="endDate" defaultValue={plan?.endDate} required /></label>
          <label className="field"><span>同行者</span><input name="travelers" defaultValue={plan?.travelers} placeholder="自己、朋友或家人" /></label>
          <div className="field"><span>旅行預算</span><div className="inline-fields"><input aria-label="旅行預算金額" name="budget" type="number" min="0" step="1" defaultValue={plan?.budget ?? 0} /><select name="currency" defaultValue={plan?.currency ?? "EUR"} aria-label="旅行預算幣別"><option value="EUR">EUR</option><option value="TWD">TWD</option></select></div></div>
          <label className="field field-full"><span>旅行想法</span><textarea name="notes" rows={3} defaultValue={plan?.notes} placeholder="想做什麼、從哪裡看到的靈感、一定要吃什麼…" /></label>
          <div className="travel-modal-note field-full"><GraduationCap size={19} /><span>儲存後會自動比對上課、考試、Orientation 與交換期限。</span></div>
          <div className="modal-actions field-full"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" type="submit"><Check size={17} />{plan ? "儲存變更" : "建立旅行"}</button></div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function ActivityForm({ activity, onSave, onCancel }: { activity?: TravelActivity; onSave: (activity: TravelActivity) => void; onCancel?: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: activity?.id ?? `activity-${Date.now()}`,
      time: form.get("time")?.toString() || "09:00",
      title: form.get("title")?.toString().trim() ?? "",
      kind: form.get("kind") as TravelActivityKind,
      location: form.get("location")?.toString().trim() ?? "",
      mapsUrl: form.get("mapsUrl")?.toString().trim() ?? "",
      durationMinutes: Math.max(0, Number(form.get("durationMinutes")) || 0),
      cost: Math.max(0, Number(form.get("cost")) || 0),
      booked: activity?.booked ?? false,
      notes: form.get("notes")?.toString().trim() ?? "",
    });
    if (!activity) event.currentTarget.reset();
  }

  return (
    <form className={`activity-form ${activity ? "editing" : ""}`} onSubmit={submit}>
      <label><span>時間</span><input type="time" name="time" defaultValue={activity?.time ?? "09:00"} required /></label>
      <label className="activity-title-input"><span>要去哪／做什麼</span><input name="title" defaultValue={activity?.title} placeholder="景點、餐廳、火車或住宿" required /></label>
      <label><span>類型</span><select name="kind" defaultValue={activity?.kind ?? "place"}>{Object.entries(activityMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}</select></label>
      <label className="activity-location-input"><span>地址／地點名稱</span><input name="location" defaultValue={activity?.location} placeholder="例如：Milano Centrale" /></label>
      <label className="activity-map-input"><span>Google Maps 分享連結</span><input type="url" name="mapsUrl" defaultValue={activity?.mapsUrl} placeholder="https://maps.app.goo.gl/…" /><small>可從 Google Maps 的「分享」複製連結；沒填時會用地址搜尋。</small></label>
      <label><span>停留分鐘</span><input type="number" name="durationMinutes" min="0" step="5" defaultValue={activity?.durationMinutes ?? 60} /></label>
      <label><span>預估費用</span><input type="number" name="cost" min="0" step="0.01" defaultValue={activity?.cost ?? 0} /></label>
      <label className="activity-notes-input"><span>備註</span><input name="notes" defaultValue={activity?.notes} placeholder="訂位、票券、注意事項…" /></label>
      <div className="activity-form-actions">{onCancel ? <button type="button" className="button text-button" onClick={onCancel}>取消</button> : null}<button className="button primary" type="submit"><Plus size={16} />{activity ? "更新" : "加入當天"}</button></div>
    </form>
  );
}

function StudyCalendar({ events, onAdd, onDelete }: { events: StudyEvent[]; onAdd: (event: StudyEvent) => void; onDelete: (id: string) => void }) {
  const [adding, setAdding] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAdd({
      id: `study-${Date.now()}`,
      title: form.get("title")?.toString().trim() ?? "",
      kind: form.get("kind") as StudyEventKind,
      startDate: form.get("startDate")?.toString() ?? "",
      endDate: form.get("endDate")?.toString() || undefined,
      startTime: form.get("startTime")?.toString() || undefined,
      repeatWeekly: form.get("repeatWeekly") === "on",
      mandatory: form.get("mandatory") === "on",
      notes: "手動加入的不可撞期行程。",
    });
    event.currentTarget.reset();
    setAdding(false);
  }

  return (
    <section className="study-calendar paper-card">
      <div className="study-calendar-heading"><div><p className="eyebrow">Do not overlap</p><h3>學業與交換不可撞期</h3></div><button className="mini-add-button" onClick={() => setAdding((value) => !value)}>{adding ? <X size={15} /> : <Plus size={15} />}{adding ? "取消" : "新增"}</button></div>
      <div className="study-event-list">
        {[...events].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((event) => (
          <div className="study-event" key={event.id}>
            <span className={`study-kind ${studyEventMeta[event.kind].className}`}>{studyEventMeta[event.kind].label}</span>
            <div><strong>{event.title}</strong><small>{formatDate(event.startDate, true)}{event.repeatWeekly ? ` 起每週${event.endDate ? `，至 ${formatDate(event.endDate, true)}` : ""}` : event.endDate ? ` — ${formatDate(event.endDate, true)}` : ""}{event.startTime ? ` · ${event.startTime}` : ""}</small></div>
            <button className="icon-button danger" onClick={() => onDelete(event.id)} aria-label={`刪除 ${event.title}`}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {adding ? (
          <motion.form className="study-event-form" onSubmit={submit} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <input name="title" placeholder="課程、考試或重要期限" aria-label="不可撞期事項名稱" required />
            <select name="kind" defaultValue="class" aria-label="不可撞期事項類型">{Object.entries(studyEventMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}</select>
            <input type="date" name="startDate" aria-label="不可撞期事項日期" required />
            <input type="date" name="endDate" aria-label="不可撞期事項結束日期" />
            <input type="time" name="startTime" aria-label="不可撞期事項時間" />
            <label><input type="checkbox" name="repeatWeekly" />每週重複</label>
            <label><input type="checkbox" name="mandatory" defaultChecked />一定不能撞期</label>
            <button className="button primary" type="submit">加入</button>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export default function TravelPlanner({ state, setState, cloud }: { state: AppState; setState: Dispatch<SetStateAction<AppState>>; cloud: ExchangeCloudController }) {
  const plans = state.travelPlans ?? [];
  const studyEvents = useMemo(() => state.studyEvents ?? [], [state.studyEvents]);
  const [selectedTripId, setSelectedTripId] = useState(plans[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(plans[0]?.days[0]?.date ?? "");
  const [editingPlan, setEditingPlan] = useState<TravelPlan | null | "new">(null);
  const [editingActivityId, setEditingActivityId] = useState("");
  const [copied, setCopied] = useState(false);
  const [tripView, setTripView] = useState<TripView>("itinerary");
  const [sharing, setSharing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState("");

  const selectedPlan = plans.find((plan) => plan.id === selectedTripId) ?? plans[0] ?? null;
  const selectedDay = selectedPlan?.days.find((day) => day.date === selectedDate) ?? selectedPlan?.days[0] ?? null;
  const taskEvents = useMemo<StudyEvent[]>(() => state.tasks
    .filter((task) => task.dueDate && task.status !== "done" && task.status !== "not-applicable")
    .map((task) => ({ id: `task-${task.id}`, title: task.title, kind: "deadline", startDate: task.dueDate!, mandatory: task.priority === "high", notes: task.notes })), [state.tasks]);
  const allBlockingEvents = useMemo(() => {
    const result = new Map<string, StudyEvent>();
    [...studyEvents, ...taskEvents].forEach((event) => {
      const key = commitmentKey(event);
      if (!result.has(key)) result.set(key, event);
    });
    return [...result.values()];
  }, [studyEvents, taskEvents]);
  const conflicts = selectedPlan ? allBlockingEvents.filter((event) => overlaps(selectedPlan.startDate, selectedPlan.endDate, event)) : [];
  const plannedCost = selectedPlan?.days.flatMap((day) => day.activities).reduce((sum, activity) => sum + activity.cost, 0) ?? 0;
  const editable = selectedPlan?.cloud?.permission !== "viewer";

  function savePlan(plan: TravelPlan) {
    setState((current) => ({
      ...current,
      travelPlans: (current.travelPlans ?? []).some((item) => item.id === plan.id)
        ? (current.travelPlans ?? []).map((item) => item.id === plan.id ? plan : item)
        : [...(current.travelPlans ?? []), plan],
    }));
    setSelectedTripId(plan.id);
    setSelectedDate(plan.days[0]?.date ?? "");
    setTripView("itinerary");
    setEditingPlan(null);
  }

  function updatePlan(planId: string, update: (plan: TravelPlan) => TravelPlan) {
    if (!editable) return;
    setState((current) => ({ ...current, travelPlans: (current.travelPlans ?? []).map((plan) => plan.id === planId ? update(plan) : plan) }));
  }

  function saveActivity(activity: TravelActivity) {
    if (!selectedPlan || !selectedDay) return;
    updatePlan(selectedPlan.id, (plan) => ({
      ...plan,
      updatedAt: new Date().toISOString(),
      days: plan.days.map((day) => day.id === selectedDay.id ? {
        ...day,
        activities: (day.activities.some((item) => item.id === activity.id)
          ? day.activities.map((item) => item.id === activity.id ? activity : item)
          : [...day.activities, activity]).sort((a, b) => a.time.localeCompare(b.time)),
      } : day),
    }));
    setEditingActivityId("");
  }

  function deleteActivity(activityId: string) {
    if (!selectedPlan || !selectedDay) return;
    updatePlan(selectedPlan.id, (plan) => ({ ...plan, days: plan.days.map((day) => day.id === selectedDay.id ? { ...day, activities: day.activities.filter((item) => item.id !== activityId) } : day) }));
  }

  function deletePlan(planId: string) {
    const remaining = plans.filter((plan) => plan.id !== planId);
    setState((current) => ({ ...current, travelPlans: remaining }));
    setSelectedTripId(remaining[0]?.id ?? "");
    setSelectedDate(remaining[0]?.days[0]?.date ?? "");
    setDeleteConfirmId("");
  }

  async function copySummary() {
    if (!selectedPlan) return;
    const lines = [
      selectedPlan.title,
      formatDateRange(selectedPlan.startDate, selectedPlan.endDate),
      selectedPlan.destinations.join(" → "),
      ...selectedPlan.days.flatMap((day) => [`\n${formatDate(day.date)} ${day.title}`, ...day.activities.map((item) => `${item.time} ${item.title}${item.location ? `｜${item.location}` : ""}${item.mapsUrl ? `｜${item.mapsUrl}` : ""}`)]),
      ...(selectedPlan.travelNotes.length ? ["\n注意事項", ...selectedPlan.travelNotes.map((note) => `${note.important ? "[重要] " : ""}${note.title}｜${note.details}`)] : []),
      ...(selectedPlan.packingItems.length ? ["\n旅行行李", ...selectedPlan.packingItems.map((item) => `${item.packed ? "[已裝]" : "[未裝]"} ${item.name} × ${item.quantity}`)] : []),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="page-stack travel-page">
      <header className="page-header travel-header">
        <div><p className="eyebrow">Trips around the exchange year</p><h1>旅行規劃</h1><p>先把想去的地方全部丟進來，再慢慢排成每天的路線；系統會先替你守住上課、考試與交換期限。</p></div>
        <button className="button primary" onClick={() => setEditingPlan("new")}><Plus size={18} />新增旅行</button>
      </header>

      {plans.length === 0 ? (
        <div className="travel-empty-layout">
          <motion.section className="travel-empty paper-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="empty-route-art"><Image src="/images/doodle-icons/return-safe.png" alt="飛機繞著地球的手繪旅行圖示" width={180} height={180} /></div>
            <p className="eyebrow">An empty page is a good start</p>
            <h2>還沒有旅行，先留一張空白車票</h2>
            <p>只要先決定「想去哪」和「哪幾天」，住宿、交通、景點與預算都可以之後再補。</p>
            <button className="button primary tag-button" onClick={() => setEditingPlan("new")}><Plus size={18} />新增第一趟旅行</button>
            <div className="empty-steps"><span><strong>01</strong>選城市</span><ChevronRight /><span><strong>02</strong>選日期</span><ChevronRight /><span><strong>03</strong>檢查衝突</span></div>
          </motion.section>
          <StudyCalendar events={studyEvents} onAdd={(event) => setState((current) => ({ ...current, studyEvents: [...(current.studyEvents ?? []), event] }))} onDelete={(id) => setState((current) => ({ ...current, studyEvents: (current.studyEvents ?? []).filter((event) => event.id !== id) }))} />
        </div>
      ) : selectedPlan ? (
        <div className="travel-workspace">
          <aside className="travel-rail">
            <div className="travel-rail-heading"><div><p className="eyebrow">My travel year</p><h2>這一年想去哪</h2></div><span>{plans.length} trips</span></div>
            <div className="trip-card-list">
              {plans.map((plan, index) => {
                const planConflicts = allBlockingEvents.filter((event) => overlaps(plan.startDate, plan.endDate, event));
                return (
                  <button key={plan.id} className={`trip-ticket ${selectedPlan.id === plan.id ? "active" : ""}`} onClick={() => { setSelectedTripId(plan.id); setSelectedDate(plan.days[0]?.date ?? ""); setTripView("itinerary"); }}>
                    <span className="trip-ticket-index">0{index + 1}</span>
                    <div><strong>{plan.title}</strong><small>{formatDateRange(plan.startDate, plan.endDate)}</small><em>{plan.destinations.join(" · ")}</em></div>
                    {planConflicts.length ? <span className="trip-conflict-count"><AlertTriangle size={13} />{planConflicts.length}</span> : <span className="trip-safe"><Check size={13} /></span>}
                  </button>
                );
              })}
            </div>
            <StudyCalendar events={studyEvents} onAdd={(event) => setState((current) => ({ ...current, studyEvents: [...(current.studyEvents ?? []), event] }))} onDelete={(id) => setState((current) => ({ ...current, studyEvents: (current.studyEvents ?? []).filter((event) => event.id !== id) }))} />
          </aside>

          <div className="travel-main">
            <section className="travel-overview paper-card">
              <div className="travel-overview-top"><span className="trip-stamp">TRIP<br />{new Date(selectedPlan.startDate).getFullYear()}</span><div><p className="eyebrow">{travelDuration(selectedPlan)} days · {selectedPlan.travelers || "traveler not set"}</p><h2>{selectedPlan.title}</h2><p>{formatDateRange(selectedPlan.startDate, selectedPlan.endDate)}{selectedPlan.cloud?.published ? ` · ${selectedPlan.cloud.permission === "viewer" ? "唯讀共編" : selectedPlan.cloud.permission === "editor" ? "共同編輯" : "雲端旅行"}` : ""}</p></div>{editable ? <div className="travel-overview-actions"><button className="icon-button" onClick={() => setEditingPlan(selectedPlan)} aria-label="編輯旅行"><Pencil size={16} /></button><button className="icon-button danger" onClick={() => setDeleteConfirmId(selectedPlan.id)} aria-label="刪除旅行"><Trash2 size={16} /></button></div> : null}</div>
              <div className="destination-route">{selectedPlan.destinations.map((destination, index) => <span key={`${destination}-${index}`}><MapPin size={15} /><strong>{destination}</strong>{index < selectedPlan.destinations.length - 1 ? <i /> : null}</span>)}</div>
              {selectedPlan.notes ? <p className="travel-note">“{selectedPlan.notes}”</p> : null}
              <div className="travel-metrics"><div><span>預算</span><strong>{selectedPlan.currency} {selectedPlan.budget.toLocaleString()}</strong></div><div><span>已排費用</span><strong>{selectedPlan.currency} {plannedCost.toLocaleString()}</strong></div><div><span>已排景點</span><strong>{selectedPlan.days.reduce((sum, day) => sum + day.activities.length, 0)}</strong></div></div>
            </section>

            <section className={`conflict-panel ${conflicts.length ? "has-conflict" : "safe"}`}>
              <div className="conflict-icon">{conflicts.length ? <AlertTriangle /> : <GraduationCap />}</div>
              <div><p className="eyebrow">Exchange-aware check</p><h3>{conflicts.length ? `發現 ${conflicts.length} 個可能衝突` : "沒有撞到目前已知的課程與期限"}</h3>{conflicts.length ? <div className="conflict-list">{conflicts.map((event) => <span key={event.id}><strong>{formatDate(event.startDate)}</strong>{event.title}</span>)}</div> : <p>新增上課或考試日期後，每趟旅行都會重新檢查。</p>}</div>
            </section>

            <section className="itinerary-board paper-card">
              <div className="itinerary-heading"><div><p className="eyebrow">Trip handbook</p><h2>{tripView === "itinerary" ? "每日行程" : tripView === "notes" ? "注意事項" : "旅行行李"}</h2></div><div className="share-actions"><button className="button text-button" onClick={copySummary}><Copy size={16} />{copied ? "已複製" : "複製摘要"}</button><button className="button secondary" onClick={() => downloadTravel(selectedPlan)}><Download size={16} />匯出旅行</button><button className="button primary" onClick={() => setSharing(true)}><Share2 size={16} />分享</button></div></div>
              <div className="trip-section-tabs" role="tablist" aria-label="旅行手冊內容">
                <button role="tab" aria-selected={tripView === "itinerary"} className={tripView === "itinerary" ? "active" : ""} onClick={() => setTripView("itinerary")}><Image src="/images/doodle-icons/journey-safe.png" alt="" width={28} height={28} /><span>行程與地圖</span><small>{selectedPlan.days.reduce((sum, day) => sum + day.activities.length, 0)} 個地點</small></button>
                <button role="tab" aria-selected={tripView === "notes"} className={tripView === "notes" ? "active" : ""} onClick={() => setTripView("notes")}><Image src="/images/doodle-icons/documents-safe.png" alt="" width={28} height={28} /><span>注意事項</span><small>{selectedPlan.travelNotes.length} 則提醒</small></button>
                <button role="tab" aria-selected={tripView === "packing"} className={tripView === "packing" ? "active" : ""} onClick={() => setTripView("packing")}><Image src="/images/doodle-icons/packing-complete-balanced.png" alt="" width={28} height={28} /><span>旅行行李</span><small>{selectedPlan.packingItems.filter((item) => item.packed).length}/{selectedPlan.packingItems.length} 已裝</small></button>
              </div>
              {tripView === "itinerary" ? <>
              <div className="day-tabs" role="tablist" aria-label="旅行日期">
                {selectedPlan.days.map((day, index) => <button key={day.id} role="tab" aria-selected={selectedDay?.id === day.id} className={selectedDay?.id === day.id ? "active" : ""} onClick={() => setSelectedDate(day.date)}><small>DAY {index + 1}</small><strong>{formatDate(day.date)}</strong><span>{day.activities.length} stops</span></button>)}
              </div>
              {selectedDay ? (
                <div className="day-plan">
                  <div className="day-plan-title"><div><span>{selectedDay.title}</span><h3>{formatDate(selectedDay.date, true)}</h3></div><p>{selectedDay.activities.length ? "依時間順序排列；先全部加進來，再慢慢調整。" : "今天還是空白的，從交通、住宿或一個最想去的地方開始。"}</p></div>
                  <div className="activity-timeline">
                    {selectedDay.activities.map((activity, index) => {
                      const meta = activityMeta[activity.kind];
                      return (
                        <motion.article layout className="activity-block" key={activity.id}>
                          <div className={`activity-marker ${meta.color}`}><span>{index + 1}</span><Image src={meta.icon} alt="" width={34} height={34} /></div>
                          {editingActivityId === activity.id ? <ActivityForm activity={activity} onSave={saveActivity} onCancel={() => setEditingActivityId("")} /> : <>
                            <div className="activity-time"><strong>{activity.time}</strong><span>{activity.durationMinutes ? `${activity.durationMinutes} min` : "時間未定"}</span></div>
                            <div className="activity-content"><div className="activity-title-row"><h4>{activity.title}</h4><span className={`activity-kind ${meta.color}`}>{meta.label}</span></div>{activity.location ? <p><MapPin size={13} />{activity.location}</p> : null}{activity.notes ? <small>{activity.notes}</small> : null}<a className="activity-map-link" href={mapsUrlForActivity(activity, selectedPlan.destinations)} target="_blank" rel="noreferrer"><MapPin size={13} />Google Maps<ExternalLink size={11} /></a></div>
                            <div className="activity-cost"><span>{activity.cost ? `${selectedPlan.currency} ${activity.cost.toLocaleString()}` : "—"}</span><label><input type="checkbox" checked={activity.booked} onChange={(event) => saveActivity({ ...activity, booked: event.target.checked })} />{activity.booked ? "已訂" : "待確認"}</label></div>
                            <div className="activity-actions"><button className="icon-button" onClick={() => setEditingActivityId(activity.id)} aria-label={`編輯 ${activity.title}`}><Pencil size={15} /></button><button className="icon-button danger" onClick={() => deleteActivity(activity.id)} aria-label={`刪除 ${activity.title}`}><Trash2 size={15} /></button></div>
                          </>}
                        </motion.article>
                      );
                    })}
                  </div>
                  {!selectedDay.activities.length ? <div className="empty-day"><Route size={30} /><strong>這一天還沒有任何安排</strong><span>先把所有想去的地方加進來，再依時間慢慢調整。</span></div> : null}
                  <DayMapPanel activities={selectedDay.activities} destinations={selectedPlan.destinations} />
                  {editable ? <div className="add-activity-panel"><div><p className="eyebrow">Add a stop</p><h3>加入這一天</h3></div><ActivityForm onSave={saveActivity} /></div> : null}
                </div>
              ) : null}</> : null}
              {tripView === "notes" ? <TravelNotesPanel plan={selectedPlan} onUpdate={(plan) => updatePlan(plan.id, () => plan)} /> : null}
              {tripView === "packing" ? <TravelPackingPanel plan={selectedPlan} onUpdate={(plan) => updatePlan(plan.id, () => plan)} /> : null}
              <div className="travel-sharing-note"><Sparkles size={16} /><span>這裡匯出的只有旅行內容，不包含簽證、帳戶、住宿合約或私人交換進度。</span></div>
            </section>
          </div>
        </div>
      ) : null}

      <AnimatePresence>{editingPlan ? <TravelModal plan={editingPlan === "new" ? null : editingPlan} onClose={() => setEditingPlan(null)} onSave={savePlan} /> : null}</AnimatePresence>
      <AnimatePresence>{sharing && selectedPlan ? <ShareTravelModal plan={selectedPlan} cloud={cloud} onPlanPublished={(plan) => setState((current) => ({ ...current, travelPlans: (current.travelPlans ?? []).map((item) => item.id === plan.id ? plan : item) }))} onClose={() => setSharing(false)} /> : null}</AnimatePresence>
      <AnimatePresence>{deleteConfirmId && selectedPlan?.id === deleteConfirmId ? <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setDeleteConfirmId("")}><motion.div className="modal-card delete-travel-modal paper-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-travel-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}><p className="eyebrow">Remove this ticket</p><h2 id="delete-travel-title">刪除「{selectedPlan.title}」？</h2><p>這只會刪除這趟旅行，不會影響交換任務或其他人的個人課表。</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleteConfirmId("")}>保留旅行</button><button className="button text-danger" onClick={() => deletePlan(selectedPlan.id)}><Trash2 size={16} />確認刪除</button></div></motion.div></motion.div> : null}</AnimatePresence>
    </div>
  );
}
