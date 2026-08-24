"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  GraduationCap,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Route,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { type CSSProperties, type Dispatch, type FormEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import type { ExchangeCloudController } from "../lib/useExchangeCloud";
import type {
  AppState,
  StudyEvent,
  StudyEventKind,
  TravelActivity,
  TravelActivityKind,
  TravelDay,
  TravelPlan,
  TravelSharingSettings,
} from "../lib/types";
import { exchangeCurrencies, exchangeProfile } from "../lib/profile";
import { localDateKey, sortTravelPlansForDisplay, travelTemporalStatus } from "../lib/travel-sort";
import { DayMapPanel, mapsUrlForActivity, TravelNotesPanel, TravelPackingPanel } from "./TravelTripPanels";
import { TravelStaySection } from "./TravelStaySection";
import MotionDialog from "./ui/MotionDialog";

type TripView = "itinerary" | "notes" | "packing";

function ShareTravelModal({ plan, cloud, onPlanPublished, onClose }: { plan: TravelPlan; cloud: ExchangeCloudController; onPlanPublished: (plan: TravelPlan) => void; onClose: () => void }) {
  const [settings, setSettings] = useState<TravelSharingSettings | null>(null);
  const [linkAccess, setLinkAccess] = useState<"off" | "viewer" | "editor">("off");
  const [memberAccount, setMemberAccount] = useState("");
  const [memberPermission, setMemberPermission] = useState<"viewer" | "editor">("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [sharingAction, setSharingAction] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!plan.cloud?.published || plan.cloud.permission !== "owner") return;
    let active = true;
    void cloud.loadTravelSharing(plan).then((next) => {
      if (!active) return;
      setSettings(next);
      setLinkAccess(next.link.enabled ? next.link.permission : "off");
      setExpiresAt(next.link.expiresAt?.slice(0, 10) ?? "");
    }).catch((error) => {
      console.error("[travel-share] settings load failed", error);
      if (active) setMessage("目前無法讀取分享設定，本機旅行不受影響。 ");
    });
    return () => { active = false; };
    // The cloud controller reflects global busy state; only the selected cloud trip should reload this modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.cloud?.cloudPlanId, plan.cloud?.permission, plan.cloud?.published]);

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setMessage("正在建立雲端旅行…");
    try {
      const published = await cloud.publishPlan(plan);
      onPlanPublished(published);
      setMessage("旅行已放上免費雲端；尚未產生任何分享連結。 ");
    } catch (error) {
      const cloudError = error as { code?: string; status?: number; message?: string; details?: string; hint?: string };
      console.error("[travel-share] publish failed", JSON.stringify({ code: cloudError.code, status: cloudError.status, message: cloudError.message, details: cloudError.details, hint: cloudError.hint }));
      setMessage("目前無法建立雲端旅行，本機內容沒有遺失。 ");
    } finally {
      setPublishing(false);
    }
  }

  async function saveLinkSettings() {
    if (!settings || sharingAction) return;
    setSharingAction("link");
    setMessage("正在更新固定連結權限…");
    try {
      const next = await cloud.updateTravelLink(plan, {
        enabled: linkAccess !== "off",
        permission: linkAccess === "editor" ? "editor" : linkAccess === "viewer" ? "viewer" : settings.link.permission,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      });
      setSettings((current) => current ? { ...current, link: next } : current);
      setMessage(next.enabled ? `固定連結已改成${next.permission === "editor" ? "可以編輯" : "只能查看"}；網址沒有改變。 ` : "固定連結已關閉；網址保留，之後重新開啟仍是同一個。 ");
    } catch (error) {
      const cloudError = error as { code?: string; status?: number; message?: string; details?: string; hint?: string };
      console.error("[travel-share] link update failed", JSON.stringify({ code: cloudError.code, status: cloudError.status, message: cloudError.message, details: cloudError.details, hint: cloudError.hint }));
      setMessage("固定連結權限更新失敗，原設定沒有改變。 ");
    } finally {
      setSharingAction("");
    }
  }

  async function copyStableLink() {
    if (!settings) return;
    await navigator.clipboard.writeText(settings.link.url);
    setMessage("固定連結已複製。之後調整權限時不需要重新傳網址。 ");
  }

  async function addMember() {
    if (!memberAccount.trim() || sharingAction) return;
    setSharingAction("member-add");
    try {
      const members = await cloud.upsertTravelMember(plan, memberAccount, memberPermission);
      setSettings((current) => current ? { ...current, members } : current);
      setMemberAccount("");
      setMessage("指定帳戶已加入；他的權限與固定連結分開管理。 ");
    } catch (error) {
      console.error("[travel-share] member add failed", error);
      setMessage("無法加入這個帳戶。請確認 Email 或舊版手帳帳號代號。 ");
    } finally {
      setSharingAction("");
    }
  }

  async function changeMember(memberId: string, permission: "viewer" | "editor") {
    if (sharingAction) return;
    setSharingAction(`member-${memberId}`);
    try {
      const members = await cloud.updateTravelMember(plan, memberId, permission);
      setSettings((current) => current ? { ...current, members } : current);
      setMessage("指定帳戶權限已更新。 ");
    } catch (error) {
      console.error("[travel-share] member update failed", error);
      setMessage("指定帳戶權限更新失敗。 ");
    } finally {
      setSharingAction("");
    }
  }

  async function deleteMember(memberId: string) {
    if (sharingAction) return;
    setSharingAction(`member-${memberId}`);
    try {
      const members = await cloud.removeTravelMember(plan, memberId);
      setSettings((current) => current ? { ...current, members } : current);
      setMessage("已移除指定帳戶；固定連結設定沒有改變。 ");
    } catch (error) {
      console.error("[travel-share] member removal failed", error);
      setMessage("目前無法移除這個帳戶。 ");
    } finally {
      setSharingAction("");
    }
  }

  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <motion.div className="modal-card share-modal paper-card" role="dialog" aria-modal="true" aria-labelledby="share-travel-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 7 }}>
      <div className="modal-heading"><div><p className="eyebrow">Scoped sharing</p><h2 id="share-travel-title">分享「{plan.title}」</h2></div><button className="icon-button" onClick={onClose} aria-label="關閉"><X size={20} /></button></div>
      {!cloud.configured ? <div className="share-unavailable"><Sparkles size={24} /><div><strong>免費雲端會在最後一次上版時啟用</strong><p>現在先保留匯出與複製摘要；完成全部本機驗證後才建立雲端，避免反覆消耗部署額度。</p></div></div> : !plan.cloud?.published ? <div className="share-publish-step"><p>分享前只會上傳這一趟旅行的行程、地圖、注意事項與旅行行李。簽證、信件、住宿、帳戶、任務進度與私人課表都不會上傳到共編資料。</p><button className="button primary" disabled={publishing || cloud.busy} onClick={() => void publish()}><Share2 size={17} />{publishing ? "正在建立雲端旅行…" : "建立這趟旅行的雲端版本"}</button><small>建立雲端版本不等於公開，下一步才會設定連結與指定帳戶。</small></div> : plan.cloud.permission !== "owner" ? <div className="share-unavailable"><Check size={24} /><div><strong>{plan.cloud.permission === "viewer" ? "你目前是唯讀成員" : "你可以編輯這趟旅行"}</strong><p>只有旅行擁有者能調整分享連結與指定帳戶。</p></div></div> : !settings ? <div className="share-unavailable"><Sparkles size={24} /><div><strong>正在讀取分享設定</strong><p>固定連結與指定帳戶會分開顯示。</p></div></div> : <div className="sharing-control-stack">
        <section className="sharing-control-section">
          <div className="sharing-control-heading"><div><p className="eyebrow">General access</p><h3>固定連結</h3></div><span className={`sharing-status ${settings.link.enabled ? "active" : "off"}`}>{settings.link.enabled ? "已開啟" : "已關閉"}</span></div>
          <p>這趟旅行只有這一個連結。這裡決定一般訪客的權限；改成唯讀或可編輯時，網址保持不變並立即套用。</p>
          <div className="stable-link-row"><input readOnly value={settings.link.url} onFocus={(event) => event.currentTarget.select()} /><button className="button secondary" onClick={() => void copyStableLink()}><Copy size={16} />複製連結</button></div>
          <div className="sharing-link-controls">
            <label className="field"><span>連結權限</span><select value={linkAccess} onChange={(event) => setLinkAccess(event.target.value as "off" | "viewer" | "editor")}><option value="off">關閉連結</option><option value="viewer">拿到連結的人只能查看</option><option value="editor">拿到連結的人可以編輯</option></select></label>
            <label className="field"><span>到期日（可留空）</span><input type="date" value={expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setExpiresAt(event.target.value)} /></label>
            <button className="button primary" disabled={Boolean(sharingAction)} onClick={() => void saveLinkSettings()}>{sharingAction === "link" ? "正在儲存…" : "儲存連結設定"}</button>
          </div>
        </section>
        <section className="sharing-control-section">
          <div className="sharing-control-heading"><div><p className="eyebrow">People with access</p><h3>指定帳戶</h3></div><span>{settings.members.length} 人</span></div>
          <p>指定帳戶會覆蓋一般連結權限。受邀者開啟上方同一網址後，按「我是受邀的編輯者嗎？」並用這裡登記的 Email 收一次性驗證信；不需要建立交換手帳。</p>
          <div className="member-add-row"><label className="field"><span>Email 或舊版手帳帳號代號</span><input value={memberAccount} onChange={(event) => setMemberAccount(event.target.value)} placeholder="friend@example.com" /></label><label className="field"><span>權限</span><select value={memberPermission} onChange={(event) => setMemberPermission(event.target.value as "viewer" | "editor")}><option value="viewer">只能查看</option><option value="editor">可以編輯</option></select></label><button className="button secondary" disabled={!memberAccount.trim() || Boolean(sharingAction)} onClick={() => void addMember()}><Plus size={16} />加入</button></div>
          {settings.members.length ? <div className="sharing-member-list">{settings.members.map((member) => <div className="sharing-member-row" key={member.id}><div><strong>{member.account}</strong><small>指定帳戶</small></div><select aria-label={`調整 ${member.account} 權限`} value={member.permission} disabled={Boolean(sharingAction)} onChange={(event) => void changeMember(member.id, event.target.value as "viewer" | "editor")}><option value="viewer">只能查看</option><option value="editor">可以編輯</option></select><button className="icon-button danger" disabled={Boolean(sharingAction)} onClick={() => void deleteMember(member.id)} aria-label={`移除 ${member.account}`}><Trash2 size={15} /></button></div>)}</div> : <div className="sharing-empty-members">尚未加入指定帳戶。</div>}
        </section>
      </div>}
      {message ? <p className="settings-message" role="status">{message}</p> : null}
      <div className="travel-sharing-note"><Sparkles size={16} /><span>分享是明確、限旅行、可預覽且可撤銷；個人衝突檢查仍只看每個人自己的課表。</span></div>
    </motion.div>
  </motion.div>;
}

const activityMeta: Record<TravelActivityKind, { label: string; icon: string; color: string }> = {
  place: { label: "景點", icon: "/images/doodle-icons-v2/journey-route.png", color: "terracotta" },
  food: { label: "餐廳", icon: "/images/doodle-icons-v2/home-notebook.png", color: "yellow" },
  transport: { label: "交通", icon: "/images/doodle-icons-v2/travel-suitcase.png", color: "blue" },
  stay: { label: "住宿", icon: "/images/doodle-icons-v2/home-notebook.png", color: "sage" },
  note: { label: "備忘", icon: "/images/doodle-icons-v2/resources-book.png", color: "gray" },
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
  const [title, setTitle] = useState(plan?.title ?? "");
  const titleLength = Array.from(title).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = form.get("startDate")?.toString() ?? "";
    const endDate = form.get("endDate")?.toString() ?? "";
    if (!title.trim() || titleLength > 10 || !startDate || !endDate || endDate < startDate) return;
    const now = new Date().toISOString();
    onSave({
      id: plan?.id ?? `travel-${Date.now()}`,
      kind: "travel",
      title: title.trim(),
      destinations: (form.get("destinations")?.toString() ?? "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
      startDate,
      endDate,
      travelers: form.get("travelers")?.toString().trim() ?? "",
      budget: Math.max(0, Number(form.get("budget")) || 0),
      currency: form.get("currency") as TravelPlan["currency"],
      notes: form.get("notes")?.toString().trim() ?? "",
      days: makeDays(startDate, endDate, plan?.days),
      stays: plan?.stays ?? [],
      references: plan?.references ?? [],
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
          <label className="field field-full"><span>旅行名稱</span><input name="title" value={title} maxLength={10} aria-describedby="travel-title-limit" aria-invalid={titleLength > 10} onChange={(event) => setTitle(Array.from(event.target.value).slice(0, 10).join(""))} placeholder="例如：聖誕假期去布拉格" required /><small id="travel-title-limit">{titleLength}/10 個字，會完整顯示在旅行車票上。</small></label>
          <label className="field field-full"><span>城市／國家</span><input name="destinations" defaultValue={plan?.destinations.join("、")} placeholder="可輸入多個：Prague、Vienna" required /><small>先丟進想去的城市，之後再慢慢補細節。</small></label>
          <label className="field"><span>開始日期</span><input type="date" name="startDate" defaultValue={plan?.startDate} required /></label>
          <label className="field"><span>結束日期</span><input type="date" name="endDate" defaultValue={plan?.endDate} required /></label>
          <label className="field"><span>同行者</span><input name="travelers" defaultValue={plan?.travelers} placeholder="自己、朋友或家人" /></label>
          <div className="field"><span>旅行預算</span><div className="inline-fields"><input aria-label="旅行預算金額" name="budget" type="number" min="0" step="1" defaultValue={plan?.budget ?? 0} /><select name="currency" defaultValue={plan?.currency ?? exchangeProfile.primaryCurrency} aria-label="旅行預算幣別">{exchangeCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></div></div>
          <label className="field field-full"><span>旅行想法</span><textarea name="notes" rows={3} defaultValue={plan?.notes} placeholder="想做什麼、從哪裡看到的靈感、一定要吃什麼…" /></label>
          <div className="travel-modal-note field-full"><GraduationCap size={19} /><span>儲存後會自動比對上課、考試、Orientation 與交換期限。</span></div>
          <div className="modal-actions field-full"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={!title.trim() || titleLength > 10}><Check size={17} />{plan ? "儲存變更" : "建立旅行"}</button></div>
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

function ActivityModal({ day, activity, onSave, onClose }: { day: TravelDay; activity?: TravelActivity; onSave: (activity: TravelActivity) => void; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div className="modal-card travel-entry-modal activity-entry-modal paper-card" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title" initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
        <div className="modal-heading"><div><p className="eyebrow">{activity ? "Edit a stop" : "Add a stop"} · {day.title}</p><h2 id="activity-modal-title">{activity ? "編輯行程" : `加入 ${formatDate(day.date, true)}`}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="關閉"><X size={20} /></button></div>
        <p className="travel-entry-modal-hint">先記下時間、地點和 Google Maps；儲存後會依時間自動排進這一天。</p>
        <ActivityForm activity={activity} onSave={onSave} onCancel={onClose} />
      </motion.div>
    </motion.div>
  );
}

function StudyEventDialog({ event, course, onSave, onClose }: { event?: StudyEvent; course: boolean; onSave: (event: StudyEvent) => void; onClose: () => void }) {
  function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    onSave({
      id: event?.id ?? `study-${Date.now()}`,
      title: form.get("title")?.toString().trim() ?? "",
      kind: course ? "class" : form.get("kind") as StudyEventKind,
      startDate: form.get("startDate")?.toString() ?? "",
      endDate: form.get("endDate")?.toString() || undefined,
      startTime: form.get("startTime")?.toString() || undefined,
      endTime: form.get("endTime")?.toString() || undefined,
      repeatWeekly: course || form.get("repeatWeekly") === "on",
      mandatory: form.get("mandatory") === "on",
      location: form.get("location")?.toString().trim() || undefined,
      classroom: form.get("classroom")?.toString().trim() || undefined,
      teacher: form.get("teacher")?.toString().trim() || undefined,
      semester: form.get("semester")?.toString().trim() || undefined,
      weekday: course ? Number(form.get("weekday")) as StudyEvent["weekday"] : undefined,
      notes: form.get("notes")?.toString().trim() || (course ? "手動加入的課程。" : "手動加入的不可撞期行程。"),
    });
  }
  return <MotionDialog id="study-event-dialog-title" eyebrow={course ? "Course schedule" : "Do not overlap"} title={event ? (course ? "編輯課程" : "編輯不可撞期事項") : (course ? "新增課程" : "新增不可撞期事項")} onClose={onClose} className="study-event-dialog">
    <form className="form-grid study-event-modal-form" onSubmit={submit}>
      <label className="field field-full"><span>{course ? "課程名稱" : "事項名稱"}</span><input name="title" defaultValue={event?.title} placeholder={course ? "例如：Integrated Product Design" : "課程、考試或重要期限"} required /></label>
      {!course ? <label className="field"><span>類型</span><select name="kind" defaultValue={event?.kind ?? "deadline"}>{Object.entries(studyEventMeta).filter(([id]) => id !== "class").map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}</select></label> : null}
      {course ? <label className="field"><span>每週星期</span><select name="weekday" defaultValue={event?.weekday ?? ""} required><option value="" disabled>選擇星期</option>{["一", "二", "三", "四", "五"].map((day, index) => <option value={index + 1} key={day}>星期{day}</option>)}</select></label> : null}
      <label className="field"><span>{course ? "Semester / Term" : "學期／期間（選填）"}</span><input name="semester" defaultValue={event?.semester} placeholder="WiSe 2026/27" /></label>
      <label className="field"><span>開始日期</span><input type="date" name="startDate" defaultValue={event?.startDate} required /></label>
      <label className="field"><span>結束日期</span><input type="date" name="endDate" defaultValue={event?.endDate} /></label>
      <label className="field"><span>開始時間</span><input type="time" name="startTime" defaultValue={event?.startTime} required={course} /></label>
      <label className="field"><span>結束時間</span><input type="time" name="endTime" defaultValue={event?.endTime} required={course} /></label>
      {course ? <><label className="field"><span>地點</span><input name="location" defaultValue={event?.location} placeholder="HdM Nobelstraße" /></label><label className="field"><span>教室</span><input name="classroom" defaultValue={event?.classroom} /></label><label className="field"><span>教師</span><input name="teacher" defaultValue={event?.teacher} /></label></> : null}
      <label className="field field-full"><span>備註</span><textarea name="notes" rows={3} defaultValue={event?.notes} /></label>
      <label className="field confirmation-field"><input type="checkbox" name="mandatory" defaultChecked={event?.mandatory ?? true} /><span>一定不能撞期</span></label>
      {!course ? <label className="field confirmation-field"><input type="checkbox" name="repeatWeekly" defaultChecked={event?.repeatWeekly} /><span>每週重複</span></label> : null}
      <div className="modal-actions field-full"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" type="submit"><Check size={16} />儲存</button></div>
    </form>
  </MotionDialog>;
}

const courseWeekdays = ["一", "二", "三", "四", "五"] as const;
const courseGridStartHour = 8;
const courseGridEndHour = 20;
const courseHourHeight = 58;

function timeToMinutes(value?: string): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function CourseTimetable({ events, onEdit, onDelete }: { events: StudyEvent[]; onEdit: (event: StudyEvent) => void; onDelete: (event: StudyEvent) => void }) {
  const [activeCourseId, setActiveCourseId] = useState("");
  const placed = events.filter((event) => event.weekday && timeToMinutes(event.startTime) !== null);
  const unplaced = events.filter((event) => !event.weekday || timeToMinutes(event.startTime) === null);
  const hourCount = courseGridEndHour - courseGridStartHour;
  const timetableStyle = { "--course-hour-height": `${courseHourHeight}px`, "--course-hour-count": hourCount } as CSSProperties;

  return <div className="course-timetable-wrap">
    <div className="course-timetable-scroll" role="region" aria-label="週一到週五課表，可水平捲動">
      <div className="course-timetable" style={timetableStyle}>
        <div className="course-timetable-header"><span>時間</span>{courseWeekdays.map((day) => <strong key={day}>星期{day}</strong>)}</div>
        <div className="course-timetable-body">
          <div className="course-time-axis" aria-hidden="true">{Array.from({ length: hourCount + 1 }, (_, index) => <span key={index}>{String(courseGridStartHour + index).padStart(2, "0")}:00</span>)}</div>
          <div className="course-day-columns">
            {courseWeekdays.map((day, dayIndex) => <div className="course-day-column" aria-label={`星期${day}`} key={day}>
              {placed.filter((event) => event.weekday === dayIndex + 1).map((event, courseIndex) => {
                const start = timeToMinutes(event.startTime) ?? courseGridStartHour * 60;
                const end = timeToMinutes(event.endTime) ?? start + 60;
                const top = Math.max(0, (start - courseGridStartHour * 60) / 60 * courseHourHeight);
                const height = Math.max(44, (Math.max(end, start + 30) - start) / 60 * courseHourHeight);
                return <article className={`course-slot tone-${(dayIndex + courseIndex) % 4} ${activeCourseId === event.id ? "actions-open" : ""}`} style={{ top, height }} key={event.id}>
                  <div><strong>{event.title}</strong><small>{event.startTime}–{event.endTime || "未定"}{event.classroom ? ` · ${event.classroom}` : event.location ? ` · ${event.location}` : ""}</small></div>
                  <button className="course-slot-more" onClick={() => setActiveCourseId((current) => current === event.id ? "" : event.id)} aria-label={`${activeCourseId === event.id ? "收合" : "開啟"} ${event.title} 操作`} aria-expanded={activeCourseId === event.id}><MoreHorizontal size={14} /></button>
                  <div className="course-slot-actions"><button className="icon-button" onClick={() => onEdit(event)} aria-label={`編輯 ${event.title}`} title="編輯"><Pencil size={13} /></button><button className="icon-button danger" onClick={() => onDelete(event)} aria-label={`刪除 ${event.title}`} title="刪除"><Trash2 size={13} /></button></div>
                </article>;
              })}
            </div>)}
          </div>
        </div>
      </div>
    </div>
    {unplaced.length ? <div className="course-unplaced"><div className="course-unplaced-heading"><strong>尚未排入每週時間格</strong><span>補上星期與時間後，課程就會自動放進上方課表。</span></div><div className="study-event-list">{unplaced.map((item) => <div className="study-event" key={item.id}><span className={`study-kind ${studyEventMeta[item.kind].className}`}>{studyEventMeta[item.kind].label}</span><div><strong>{item.title}</strong><small>{formatDate(item.startDate, true)}{item.endDate ? ` — ${formatDate(item.endDate, true)}` : ""}</small></div><div className="study-event-actions"><button className="icon-button" onClick={() => onEdit(item)} aria-label={`編輯 ${item.title}`} title="編輯"><Pencil size={14} /></button><button className="icon-button danger" onClick={() => onDelete(item)} aria-label={`刪除 ${item.title}`} title="刪除"><Trash2 size={14} /></button></div></div>)}</div></div> : null}
  </div>;
}

function AcademicSection({ title, eyebrow, emptyTitle, emptyCopy, course, events, onSave, onDelete }: { title: string; eyebrow: string; emptyTitle: string; emptyCopy: string; course: boolean; events: StudyEvent[]; onSave: (event: StudyEvent) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState<StudyEvent | null | "new">(null);
  const [deleting, setDeleting] = useState<StudyEvent | null>(null);
  const close = () => setEditing(null);
  return <section className={`study-calendar academic-section paper-card ${course ? "course-schedule" : "academic-conflicts"}`}>
    <div className="study-calendar-heading"><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div><button className="mini-add-button" onClick={() => setEditing("new")}><Plus size={15} />新增</button></div>
    {events.length && course ? <CourseTimetable events={events} onEdit={setEditing} onDelete={setDeleting} /> : events.length ? <div className="study-event-list">{[...events].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((item) => <div className="study-event" key={item.id}>
      <span className={`study-kind ${studyEventMeta[item.kind].className}`}>{studyEventMeta[item.kind].label}</span>
      <div><strong>{item.title}</strong><small>{formatDate(item.startDate, true)}{item.repeatWeekly ? ` 起每週${item.endDate ? `，至 ${formatDate(item.endDate, true)}` : ""}` : item.endDate ? ` — ${formatDate(item.endDate, true)}` : ""}{item.startTime ? ` · ${item.startTime}${item.endTime ? `–${item.endTime}` : ""}` : ""}{item.classroom ? ` · ${item.classroom}` : item.location ? ` · ${item.location}` : ""}</small></div>
      <div className="study-event-actions"><button className="icon-button" onClick={() => setEditing(item)} aria-label={`編輯 ${item.title}`} title="編輯"><Pencil size={14} /></button><button className="icon-button danger" onClick={() => setDeleting(item)} aria-label={`刪除 ${item.title}`} title="刪除"><Trash2 size={14} /></button></div>
    </div>)}</div> : <div className="academic-empty"><GraduationCap size={26} /><div><strong>{emptyTitle}</strong><span>{emptyCopy}</span></div><button className="button secondary" onClick={() => setEditing("new")}><Plus size={15} />{course ? "新增課程" : "新增事項"}</button></div>}
    <AnimatePresence>{editing ? <StudyEventDialog event={editing === "new" ? undefined : editing} course={course} onClose={close} onSave={(item) => { onSave(item); close(); }} /> : null}</AnimatePresence>
    <AnimatePresence>{deleting ? <MotionDialog id="delete-study-event-title" eyebrow="Confirm deletion" title={`刪除「${deleting.title}」？`} onClose={() => setDeleting(null)} alert className="confirm-dialog"><p>刪除後，旅行撞期檢查也會立即更新。</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(null)}>取消</button><button className="button text-danger" onClick={() => { onDelete(deleting.id); setDeleting(null); }}><Trash2 size={15} />確認刪除</button></div></MotionDialog> : null}</AnimatePresence>
  </section>;
}

export default function TravelPlanner({ state, setState, cloud, focusTripId = "" }: { state: AppState; setState: Dispatch<SetStateAction<AppState>>; cloud: ExchangeCloudController; focusTripId?: string }) {
  const reduceMotion = useReducedMotion();
  const plans = useMemo(() => state.travelPlans ?? [], [state.travelPlans]);
  const today = localDateKey();
  const sortedPlans = useMemo(() => sortTravelPlansForDisplay(plans, today), [plans, today]);
  const studyEvents = useMemo(() => state.studyEvents ?? [], [state.studyEvents]);
  const [selectedTripId, setSelectedTripId] = useState(sortedPlans[0]?.id ?? "");
  const [expandedTripId, setExpandedTripId] = useState("");
  const [selectedDate, setSelectedDate] = useState(sortedPlans[0]?.days[0]?.date ?? "");
  const [editingPlan, setEditingPlan] = useState<TravelPlan | null | "new">(null);
  const [editingActivityId, setEditingActivityId] = useState("");
  const [addingActivity, setAddingActivity] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tripView, setTripView] = useState<TripView>("itinerary");
  const [sharing, setSharing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState("");
  const [tripActionsOpen, setTripActionsOpen] = useState(false);
  const [spotlightTripId, setSpotlightTripId] = useState("");
  const tripActionsRef = useRef<HTMLDivElement>(null);
  const accordionScrollTimer = useRef(0);

  const selectedPlan = sortedPlans.find((plan) => plan.id === selectedTripId) ?? sortedPlans[0] ?? null;
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
  const sharedView = cloud.shareStatus === "active";

  useEffect(() => {
    if (!focusTripId || !sortedPlans.some((plan) => plan.id === focusTripId)) return;
    const plan = sortedPlans.find((item) => item.id === focusTripId)!;
    const openTimer = window.setTimeout(() => {
      setSelectedTripId(plan.id);
      setExpandedTripId(plan.id);
      setSelectedDate(plan.days[0]?.date ?? "");
      setSpotlightTripId(plan.id);
    }, 0);
    const scrollTimer = window.setTimeout(() => {
      const target = document.getElementById(`trip-conflict-${plan.id}`) ?? document.getElementById(`trip-${plan.id}`);
      target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (target) window.scrollBy({ top: -88, behavior: reduceMotion ? "auto" : "smooth" });
    }, reduceMotion ? 80 : 430);
    const clearTimer = window.setTimeout(() => setSpotlightTripId((value) => value === plan.id ? "" : value), 2200);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusTripId, reduceMotion, sortedPlans]);

  useEffect(() => {
    if (!tripActionsOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!tripActionsRef.current?.contains(event.target as Node)) setTripActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTripActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tripActionsOpen]);

  useEffect(() => {
    const openFromQuickNavigation = (event: Event) => {
      const planId = (event as CustomEvent<{ planId?: string }>).detail?.planId;
      const plan = sortedPlans.find((item) => item.id === planId);
      if (plan) toggleTrip(plan);
    };
    window.addEventListener("exchange:quick-travel", openFromQuickNavigation);
    return () => window.removeEventListener("exchange:quick-travel", openFromQuickNavigation);
  });

  function savePlan(plan: TravelPlan) {
    setState((current) => ({
      ...current,
      travelPlans: (current.travelPlans ?? []).some((item) => item.id === plan.id)
        ? (current.travelPlans ?? []).map((item) => item.id === plan.id ? plan : item)
        : [...(current.travelPlans ?? []), plan],
    }));
    setSelectedTripId(plan.id);
    setTripActionsOpen(false);
    setExpandedTripId("");
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
    setAddingActivity(false);
  }

  function deleteActivity(activityId: string) {
    if (!selectedPlan || !selectedDay) return;
    updatePlan(selectedPlan.id, (plan) => ({ ...plan, days: plan.days.map((day) => day.id === selectedDay.id ? { ...day, activities: day.activities.filter((item) => item.id !== activityId) } : day) }));
  }

  function deletePlan(planId: string) {
    const remaining = plans.filter((plan) => plan.id !== planId);
    const nextPlan = sortTravelPlansForDisplay(remaining, today)[0];
    setState((current) => ({ ...current, travelPlans: remaining }));
    setSelectedTripId(nextPlan?.id ?? "");
    setExpandedTripId("");
    setSelectedDate(nextPlan?.days[0]?.date ?? "");
    setDeleteConfirmId("");
  }

  function toggleTrip(plan: TravelPlan) {
    const opening = expandedTripId !== plan.id;
    setSelectedTripId(plan.id);
    setTripActionsOpen(false);
    setSelectedDate(plan.days[0]?.date ?? "");
    setTripView("itinerary");
    setExpandedTripId(opening ? plan.id : "");
    window.clearTimeout(accordionScrollTimer.current);
    accordionScrollTimer.current = window.setTimeout(() => {
      const current = document.getElementById(`trip-${plan.id}`);
      if (!current) return;
      const headerOffset = window.innerWidth <= 820 ? 76 : 88;
      const top = Math.max(0, window.scrollY + current.getBoundingClientRect().top - headerOffset);
      window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
    }, reduceMotion ? 0 : 360);
  }

  async function copySummary() {
    if (!selectedPlan) return;
    const lines = [
      selectedPlan.title,
      formatDateRange(selectedPlan.startDate, selectedPlan.endDate),
      selectedPlan.destinations.join(" → "),
      ...((selectedPlan.stays ?? []).length ? ["\n住宿", ...(selectedPlan.stays ?? []).map((stay) => `${stay.name}｜${stay.checkIn}–${stay.checkOut}${stay.mapsUrl ? `｜${stay.mapsUrl}` : ""}`)] : []),
      ...((selectedPlan.references ?? []).length ? ["\n旅行參考資料", ...(selectedPlan.references ?? []).map((reference) => `${reference.label}｜${reference.url}`)] : []),
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
        {sharedView ? null : <button className="button primary travel-add-button" onClick={() => setEditingPlan("new")} aria-label="新增旅行"><Plus size={19} /></button>}
      </header>

      {plans.length === 0 ? (
        <div className="travel-empty-layout travel-empty-layout-single">
          <motion.section className="travel-empty paper-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="empty-route-art"><Image src="/images/doodle-icons-v2/travel-suitcase.png" alt="手繪旅行行李圖示" width={180} height={180} /></div>
            <p className="eyebrow">An empty page is a good start</p>
            <h2>還沒有旅行，先留一張空白車票</h2>
            <p>只要先決定「想去哪」和「哪幾天」，住宿、交通、景點與預算都可以之後再補。</p>
            <button className="button primary tag-button" onClick={() => setEditingPlan("new")}><Plus size={18} />新增第一趟旅行</button>
            <div className="empty-steps"><span><strong>01</strong>選城市</span><ChevronRight /><span><strong>02</strong>選日期</span><ChevronRight /><span><strong>03</strong>檢查衝突</span></div>
          </motion.section>
        </div>
      ) : selectedPlan ? (
        <>
        <div className="travel-workspace travel-accordion-workspace">
          <section className="travel-rail travel-accordion" aria-labelledby="travel-year-title">
                <div className="travel-rail-heading"><div><p id="travel-year-title" className="eyebrow">My travel year</p></div><span>{plans.length} trips</span></div>
            <div className="trip-card-list trip-accordion-list">
              {sortedPlans.map((plan, index) => {
                const planConflicts = allBlockingEvents.filter((event) => overlaps(plan.startDate, plan.endDate, event));
                const temporalStatus = travelTemporalStatus(plan, today);
                const expanded = selectedPlan.id === plan.id && expandedTripId === plan.id;
                return (
                  <motion.article layout="position" id={`trip-${plan.id}`} key={plan.id} className={`trip-accordion-item ${temporalStatus} ${expanded ? "expanded" : "collapsed"} ${spotlightTripId === plan.id ? "trip-attention" : ""}`}>
                  <motion.button
                    className={`trip-ticket ${expanded ? "active" : ""}`}
                    aria-expanded={expanded}
                    aria-controls={`trip-panel-${plan.id}`}
                    whileTap={reduceMotion ? undefined : { y: 2, scale: 0.995 }}
                    transition={{ type: "spring", stiffness: 520, damping: 32 }}
                    onClick={() => toggleTrip(plan)}
                  >
                    <span className="trip-ticket-index">0{index + 1}</span>
                    <div className="trip-ticket-copy"><strong>{plan.title}</strong><small>{formatDateRange(plan.startDate, plan.endDate)}</small><em>{plan.destinations.join(" · ")}</em></div>
                    <span className="trip-ticket-end"><span className="trip-time-label">{temporalStatus === "past" ? "已結束" : temporalStatus === "ongoing" ? "旅途中" : "即將出發"}</span>{planConflicts.length ? <span className="trip-conflict-count"><AlertTriangle size={13} />{planConflicts.length}</span> : <span className="trip-safe"><Check size={13} /></span>}<span className="trip-accordion-chevron"><ChevronDown size={19} /></span></span>
                  </motion.button>
                  <AnimatePresence initial={false}>
                  {expanded ? <motion.div id={`trip-panel-${plan.id}`} className="trip-accordion-panel" initial={reduceMotion ? false : { height: 0, opacity: 0, y: -8 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -5 }} transition={reduceMotion ? { duration: 0 } : { height: { duration: 0.32, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2 }, y: { type: "spring", stiffness: 430, damping: 34 } }}>
                  <div className="travel-overview-actions trip-cover-actions"><div className="travel-action-menu" ref={tripActionsRef}><button className={`icon-button ${tripActionsOpen ? "active" : ""}`} onClick={() => setTripActionsOpen((open) => !open)} aria-expanded={tripActionsOpen} aria-haspopup="menu" aria-controls={`travel-actions-${selectedPlan.id}`} aria-label="更多旅行操作"><MoreHorizontal size={18} /></button>{tripActionsOpen ? <div id={`travel-actions-${selectedPlan.id}`} className="travel-action-popover paper-card" role="menu"><button role="menuitem" onClick={() => { void copySummary(); setTripActionsOpen(false); }}><Copy size={15} />{copied ? "已複製摘要" : "複製摘要"}</button><button role="menuitem" onClick={() => { downloadTravel(selectedPlan); setTripActionsOpen(false); }}><Download size={15} />匯出旅行</button><button role="menuitem" onClick={() => { setSharing(true); setTripActionsOpen(false); }}><Share2 size={15} />分享與共編</button></div> : null}</div>{editable ? <><button className="icon-button" onClick={() => setEditingPlan(selectedPlan)} aria-label="編輯旅行"><Pencil size={16} /></button><button className="icon-button danger" onClick={() => setDeleteConfirmId(selectedPlan.id)} aria-label="刪除旅行"><Trash2 size={16} /></button></> : null}</div>
                  <div className="travel-main">
            <section className="travel-overview paper-card">
              <div className="destination-route">{selectedPlan.destinations.map((destination, index) => <span key={`${destination}-${index}`}><MapPin size={15} /><strong>{destination}</strong>{index < selectedPlan.destinations.length - 1 ? <i /> : null}</span>)}</div>
              {selectedPlan.notes ? <p className="travel-note">“{selectedPlan.notes}”</p> : null}
              <div className="travel-metrics"><div><span>預算</span><strong>{selectedPlan.currency} {selectedPlan.budget.toLocaleString()}</strong></div><div><span>已排費用</span><strong>{selectedPlan.currency} {plannedCost.toLocaleString()}</strong></div><div><span>已排景點</span><strong>{selectedPlan.days.reduce((sum, day) => sum + day.activities.length, 0)}</strong></div></div>
            </section>

            <motion.section
              id={`trip-conflict-${selectedPlan.id}`}
              className={`conflict-panel ${conflicts.length ? "has-conflict" : "safe"} ${spotlightTripId === selectedPlan.id ? "attention-target" : ""}`}
              animate={spotlightTripId === selectedPlan.id && !reduceMotion ? { y: [0, -7, 2, 0], scale: [1, 1.018, 0.998, 1] } : { y: 0, scale: 1 }}
              transition={{ duration: 0.68, times: [0, 0.3, 0.72, 1], ease: "easeOut" }}
            >
              <div className="conflict-icon">{conflicts.length ? <AlertTriangle /> : <GraduationCap />}</div>
              <div><p className="eyebrow">Exchange-aware check</p><h3>{conflicts.length ? `發現 ${conflicts.length} 個可能衝突` : "沒有撞到目前已知的課程與期限"}</h3>{conflicts.length ? <div className="conflict-list">{conflicts.map((event) => <span key={event.id}><strong>{formatDate(event.startDate)}</strong>{event.title}</span>)}</div> : <p>新增上課或考試日期後，每趟旅行都會重新檢查。</p>}</div>
            </motion.section>

            <section className="itinerary-board paper-card">
              <div className="itinerary-heading"><div><p className="eyebrow">Trip handbook</p><h2>{tripView === "itinerary" ? "行程與地圖" : tripView === "notes" ? "注意事項" : "旅行行李"}</h2></div></div>
              <div className="trip-section-tabs" role="tablist" aria-label="旅行手冊內容">
                <motion.button whileTap={reduceMotion ? undefined : { y: 2 }} role="tab" aria-selected={tripView === "itinerary"} className={tripView === "itinerary" ? "active" : ""} onClick={() => setTripView("itinerary")}><Image src="/images/doodle-icons-v2/journey-route.png" alt="" width={28} height={28} /><span>行程與地圖</span><small>{selectedPlan.days.reduce((sum, day) => sum + day.activities.length, 0)} 個地點</small></motion.button>
                <motion.button whileTap={reduceMotion ? undefined : { y: 2 }} role="tab" aria-selected={tripView === "notes"} className={tripView === "notes" ? "active" : ""} onClick={() => setTripView("notes")}><Image src="/images/doodle-icons-v2/resources-book.png" alt="" width={28} height={28} /><span>注意事項</span><small>{selectedPlan.travelNotes.length} 則提醒</small></motion.button>
                <motion.button whileTap={reduceMotion ? undefined : { y: 2 }} role="tab" aria-selected={tripView === "packing"} className={tripView === "packing" ? "active" : ""} onClick={() => setTripView("packing")}><Image src="/images/doodle-icons-v2/travel-suitcase.png" alt="" width={28} height={28} /><span>旅行行李</span><small>{selectedPlan.packingItems.filter((item) => item.packed).length}/{selectedPlan.packingItems.length} 已裝</small></motion.button>
              </div>
              {tripView === "itinerary" ? <>
              <TravelStaySection plan={selectedPlan} readOnly={!editable} onUpdate={(plan) => updatePlan(plan.id, () => plan)} />
              <div className="daily-itinerary-heading"><div><p className="eyebrow">Daily itinerary</p><h3>每日行程</h3></div><span>{selectedPlan.days.length} 天</span></div>
              <div className={`day-tabs ${selectedPlan.days.length <= 4 ? "few-days" : "many-days"}`} role="tablist" aria-label="旅行日期">
                {selectedPlan.days.map((day, index) => <motion.button whileTap={reduceMotion ? undefined : { y: 2 }} key={day.id} role="tab" aria-selected={selectedDay?.id === day.id} className={selectedDay?.id === day.id ? "active" : ""} onClick={() => setSelectedDate(day.date)}><small>DAY {index + 1}</small><strong>{formatDate(day.date)}</strong><span>{day.activities.length} stops</span></motion.button>)}
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
                          <>
                            <div className="activity-time"><strong>{activity.time}</strong><span>{activity.durationMinutes ? `${activity.durationMinutes} min` : "時間未定"}</span></div>
                            <div className="activity-content"><div className="activity-title-row"><h4>{activity.title}</h4><span className={`activity-kind ${meta.color}`}>{meta.label}</span></div>{activity.location ? <p><MapPin size={13} />{activity.location}</p> : null}{activity.notes ? <small>{activity.notes}</small> : null}<a className="activity-map-link" href={mapsUrlForActivity(activity, selectedPlan.destinations)} target="_blank" rel="noreferrer"><MapPin size={13} />Google Maps<ExternalLink size={11} /></a></div>
                            <div className="activity-cost"><span>{activity.cost ? `${selectedPlan.currency} ${activity.cost.toLocaleString()}` : "—"}</span><label><input type="checkbox" checked={activity.booked} disabled={!editable} onChange={(event) => saveActivity({ ...activity, booked: event.target.checked })} />{activity.booked ? "已訂" : "待確認"}</label></div>
                            {editable ? <div className="activity-actions"><button className="icon-button" onClick={() => setEditingActivityId(activity.id)} aria-label={`編輯 ${activity.title}`}><Pencil size={15} /></button><button className="icon-button danger" onClick={() => deleteActivity(activity.id)} aria-label={`刪除 ${activity.title}`}><Trash2 size={15} /></button></div> : null}
                          </>
                        </motion.article>
                      );
                    })}
                  </div>
                  {!selectedDay.activities.length ? <div className="empty-day"><Route size={30} /><strong>這一天還沒有任何安排</strong><span>先把所有想去的地方加進來，再依時間慢慢調整。</span></div> : null}
                  <DayMapPanel activities={selectedDay.activities} destinations={selectedPlan.destinations} />
                  {editable ? <div className="add-activity-trigger"><div><p className="eyebrow">Add a stop</p><h3>還想去哪裡？</h3><span>新增後會依時間自動排進 {selectedDay.title}。</span></div><button className="button primary" type="button" onClick={() => setAddingActivity(true)}><Plus size={17} />加入這一天</button></div> : null}
                </div>
              ) : null}</> : null}
              {tripView === "notes" ? <TravelNotesPanel plan={selectedPlan} readOnly={!editable} onUpdate={(plan) => updatePlan(plan.id, () => plan)} /> : null}
              {tripView === "packing" ? <TravelPackingPanel plan={selectedPlan} readOnly={!editable} onUpdate={(plan) => updatePlan(plan.id, () => plan)} /> : null}
              <div className="travel-sharing-note"><Sparkles size={16} /><span>這裡匯出的只有旅行內容，不包含簽證、帳戶、住宿合約或私人交換進度。</span></div>
            </section>
          </div>
                  </motion.div> : null}
                  </AnimatePresence>
                  </motion.article>
                );
              })}
            </div>
          </section>
        </div>
        </>
      ) : null}

      {sharedView ? null : <div className="travel-calendar-bottom academic-planner-stack">
        <AcademicSection title="課表" eyebrow="Course schedule" emptyTitle="還沒有課表" emptyCopy="新增課程後，就可以一起查看旅行與上課時間是否衝突。" course events={studyEvents.filter((event) => event.kind === "class")} onSave={(event) => setState((current) => ({ ...current, studyEvents: (current.studyEvents ?? []).some((item) => item.id === event.id) ? (current.studyEvents ?? []).map((item) => item.id === event.id ? event : item) : [...(current.studyEvents ?? []), event] }))} onDelete={(id) => setState((current) => ({ ...current, studyEvents: (current.studyEvents ?? []).filter((event) => event.id !== id) }))} />
        <AcademicSection title="學業與交換不可撞期" eyebrow="Do not overlap" emptyTitle="目前沒有其他不可撞期事項" emptyCopy="考試、Orientation 與重要期限會顯示在這裡。" course={false} events={studyEvents.filter((event) => event.kind !== "class")} onSave={(event) => setState((current) => ({ ...current, studyEvents: (current.studyEvents ?? []).some((item) => item.id === event.id) ? (current.studyEvents ?? []).map((item) => item.id === event.id ? event : item) : [...(current.studyEvents ?? []), event] }))} onDelete={(id) => setState((current) => ({ ...current, studyEvents: (current.studyEvents ?? []).filter((event) => event.id !== id) }))} />
      </div>}

      <AnimatePresence>{editingPlan ? <TravelModal plan={editingPlan === "new" ? null : editingPlan} onClose={() => setEditingPlan(null)} onSave={savePlan} /> : null}</AnimatePresence>
      <AnimatePresence>{(addingActivity || editingActivityId) && selectedDay ? <ActivityModal day={selectedDay} activity={selectedDay.activities.find((item) => item.id === editingActivityId)} onSave={saveActivity} onClose={() => { setAddingActivity(false); setEditingActivityId(""); }} /> : null}</AnimatePresence>
      <AnimatePresence>{sharing && selectedPlan ? <ShareTravelModal plan={selectedPlan} cloud={cloud} onPlanPublished={(plan) => setState((current) => ({ ...current, travelPlans: (current.travelPlans ?? []).map((item) => item.id === plan.id ? plan : item) }))} onClose={() => setSharing(false)} /> : null}</AnimatePresence>
      <AnimatePresence>{deleteConfirmId && selectedPlan?.id === deleteConfirmId ? <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setDeleteConfirmId("")}><motion.div className="modal-card delete-travel-modal paper-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-travel-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}><p className="eyebrow">Remove this ticket</p><h2 id="delete-travel-title">刪除「{selectedPlan.title}」？</h2><p>這只會刪除這趟旅行，不會影響交換任務或其他人的個人課表。</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleteConfirmId("")}>保留旅行</button><button className="button text-danger" onClick={() => deletePlan(selectedPlan.id)}><Trash2 size={16} />確認刪除</button></div></motion.div></motion.div> : null}</AnimatePresence>
    </div>
  );
}
