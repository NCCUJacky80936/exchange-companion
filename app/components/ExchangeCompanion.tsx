"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Info,
  Luggage,
  Mail,
  LogOut,
  Map as MapIcon,
  Menu,
  Bot,
  PackageCheck,
  Pencil,
  PiggyBank,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  type ChangeEvent,
  type FormEvent,
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { downloadIcs, googleCalendarUrl } from "../lib/calendar";
import { assignedBagWeightBreakdown, bagWeightMap, evaluateBaggageAllowances } from "../lib/baggage";
import { cloudIsConfigured } from "../lib/cloud";
import { phaseMeta } from "../lib/default-data";
import { exchangeCurrencies, exchangeProfile, exchangeTimeZones } from "../lib/profile";
import { limitSidebarNote, notebookCharacterCount, SIDEBAR_NOTE_LIMIT } from "../lib/personalization";
import { pruneProcessedResourceIntake } from "../lib/resource-intake";
import type { HomeAgendaTarget } from "../lib/home-dashboard";
import { markExchangePerformance } from "../lib/performance";
import { loadState, normalizeImportedState, resetState, saveState, validateImport } from "../lib/storage";
import { useExchangeCloud, type ExchangeCloudController } from "../lib/useExchangeCloud";
import AuthGate from "./AuthGate";
import HomeDashboard from "./HomeDashboard";
import OnboardingWizard from "./OnboardingWizard";
import QuickNavigation from "./ui/QuickNavigation";
import type {
  AppState,
  Bag,
  BudgetItem,
  FlightAllowance,
  JourneyView,
  JourneyPhase,
  JourneyTask,
  NavSection,
  PackingDecision,
  PackingItem,
  ResourceItem,
  ResourceIntake,
  TaskChecklistItem,
  TaskRecordEntry,
  TaskStatus,
  TaskTemplateKind,
} from "../lib/types";

const AiConcierge = lazy(() => import("./AiConcierge"));
const TravelPlanner = lazy(() => import("./TravelPlanner"));

function SectionFallback() {
  return <div className="section-fallback" role="status"><span className="brand-stamp">旅</span><strong>正在打開手帳頁面…</strong></div>;
}

function AvatarContent({ state, fallback }: { state: AppState; fallback: string }) {
  const avatarDataUrl = state.personalization?.avatarDataUrl;
  return avatarDataUrl
    ? <Image className="avatar-photo" src={avatarDataUrl} alt="" width={96} height={96} unoptimized />
    : <span aria-hidden="true">{fallback || "A"}</span>;
}

async function createAvatarDataUrl(file: File): Promise<string> {
  if (!/^image\/(?:png|jpeg|webp)$/.test(file.type)) throw new Error("type");
  if (file.size > 8 * 1024 * 1024) throw new Error("size");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new window.Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("image"));
      candidate.src = objectUrl;
    });
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 320, 320);
    return canvas.toDataURL("image/webp", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function GuestTravelShell({ state, setState, cloud }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; cloud: ExchangeCloudController }) {
  const guestState = useMemo<AppState>(() => ({
    ...state,
    tasks: [],
    resources: [],
    resourceIntake: [],
    packingItems: [],
    flightAllowances: [],
    budget: [],
    emergencyContact: "",
    studyEvents: [],
    aiInbox: { sources: [], proposals: [] },
    travelPlans: (state.travelPlans ?? []).filter((plan) => plan.cloud?.published && plan.cloud.permission !== "owner"),
  }), [state]);
  const canEdit = (guestState.travelPlans ?? []).some((plan) => plan.cloud?.permission === "editor");
  const journeyCount = guestState.travelPlans?.length ?? 0;

  return <div className="guest-travel-shell" data-heading-language={guestState.personalization?.headingLanguage ?? "zh-TW"}><header className="guest-travel-topbar"><div className="auth-brand"><span className="brand-stamp">TRIP</span><div><strong>共同旅行手冊</strong><small>{journeyCount > 1 ? `這個帳號可存取 ${journeyCount} 趟旅行` : "只顯示你有權限的旅行"}</small></div></div><div className="guest-access-summary"><span className={`guest-permission-badge ${canEdit ? "editor" : "viewer"}`}>{canEdit ? "受邀編輯者 · 依各旅行權限編輯" : "一般連結 · 只能查看"}</span>{canEdit ? null : <GuestEditorAccess cloud={cloud} />}</div></header><main><Suspense fallback={<SectionFallback />}><TravelPlanner state={guestState} setState={setState} cloud={cloud} /></Suspense></main><QuickNavigation section="travel" plans={guestState.travelPlans ?? []} /></div>;
}

function GuestEditorAccess({ cloud }: { cloud: ExchangeCloudController }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [compact, setCompact] = useState(false);
  const [attentionTick, setAttentionTick] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(() => setCompact(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [attentionTick]);

  const keepOpen = () => {
    setCompact(false);
    setAttentionTick((value) => value + 1);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(false);
    void cloud.requestGuestEditorAccess(email).then(() => setSent(true)).catch(() => setSent(false));
  };

  return <AnimatePresence initial={false} mode="wait">
    {compact ? <motion.button
      key="compact"
      type="button"
      className="guest-editor-compact"
      onClick={keepOpen}
      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    ><Mail size={12} />受邀編輯者？點此驗證</motion.button> : <motion.section
      key="expanded"
      className="guest-editor-access"
      aria-labelledby="guest-editor-title"
      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
    ><div><Mail size={24} /><div><strong id="guest-editor-title">你是受邀的編輯者嗎？</strong><p>輸入被邀請的 Email，我們會寄一封一次性驗證信。點開後直接回到這趟旅行，不需要建立交換手帳或密碼。</p></div></div><form onSubmit={submit}><label><span>受邀 Email</span><input type="email" autoComplete="email" value={email} onFocus={keepOpen} onPointerDown={keepOpen} onChange={(event) => { setEmail(event.target.value); keepOpen(); }} placeholder="name@example.com" required /></label><button className="button primary" disabled={!email || cloud.busy}>{cloud.busy ? "正在寄出…" : "寄給我一次性連結"}</button></form><small role="status">{sent ? "已寄出，請到信箱點擊驗證連結。" : "未列在指定帳戶中的 Email，驗證後仍會保持唯讀。"}</small></motion.section>}
  </AnimatePresence>;
}

const statusMeta: Record<TaskStatus, { label: string; className: string }> = {
  "not-started": { label: "未開始", className: "status-neutral" },
  "in-progress": { label: "進行中", className: "status-blue" },
  waiting: { label: "等待中", className: "status-yellow" },
  done: { label: "已完成", className: "status-green" },
  "not-applicable": { label: "不適用", className: "status-muted" },
};

const decisionMeta: Record<PackingDecision, { label: string; className: string }> = {
  must: { label: "一定帶", className: "tag-terracotta" },
  recommend: { label: "建議帶", className: "tag-blue" },
  "buy-there": { label: "當地買", className: "tag-sage" },
  skip: { label: "不建議帶", className: "tag-gray" },
};

const budgetBasisLabel: Record<BudgetItem["basis"], string> = {
  unset: "待設定",
  estimate: "個人估算",
  confirmed: "已有依據",
};

function resourceGroup(category: string): string {
  if (/簽證|居留|行政|財力|保險/.test(category)) return "申請與行政";
  if (/學校|學業|日曆|選課|課程|考試/.test(category)) return "學校與學業";
  if (/住宿|生活|醫療|緊急/.test(category)) return "住宿與生活";
  if (/交通|航班|飛機|行李|海關/.test(category)) return "交通與行李";
  return "其他";
}

const navItems: Array<{ id: NavSection; label: string; shortLabel: string; doodleIcon: string }> = [
  { id: "home", label: "我的交換", shortLabel: "首頁", doodleIcon: "/images/doodle-icons-v2/home-notebook.webp" },
  { id: "journey", label: "交換旅程", shortLabel: "旅程", doodleIcon: "/images/doodle-icons-v2/journey-route.webp" },
  { id: "travel", label: "旅行規劃", shortLabel: "旅行", doodleIcon: "/images/doodle-icons-v2/travel-suitcase.webp" },
  { id: "ai", label: "AI 幫我整理", shortLabel: "AI", doodleIcon: "/images/doodle-icons-v2/ai-spark.webp" },
  { id: "resources", label: "重要資源", shortLabel: "資源", doodleIcon: "/images/doodle-icons-v2/resources-book.webp" },
  { id: "settings", label: "設定與備份", shortLabel: "設定", doodleIcon: "/images/doodle-icons-v2/settings-backup.webp" },
];
const validSections = new Set<NavSection>(navItems.map((item) => item.id));

function initialSection(): NavSection {
  if (typeof window === "undefined") return "home";
  const params = new URLSearchParams(window.location.search);
  if (params.has("share")) return "travel";
  if (params.get("section") === "packing") return "journey";
  const requested = params.get("section") as NavSection | null;
  return requested && validSections.has(requested) ? requested : "home";
}

function initialJourneyView(): JourneyView {
  if (typeof window === "undefined") return "progress";
  const params = new URLSearchParams(window.location.search);
  return params.get("section") === "packing" || (params.get("section") === "journey" && params.get("view") === "packing")
    ? "packing"
    : "progress";
}

type NavigateToSection = (section: NavSection, journeyView?: JourneyView, options?: { task?: string; trip?: string; inbox?: "open"; guide?: "1"; hash?: string }) => void;

const proposalEntityLabel = {
  journey: "交換基本資料",
  task: "交換任務",
  resource: "資源",
  "resource-intake": "待辨識網址",
  "packing-item": "行李物品",
  bag: "實體行李",
  "flight-allowance": "機票行李規則",
  "budget-item": "基礎預算",
  "study-event": "個人行程",
  "travel-plan": "旅行",
} as const;

const proposalConfidenceLabel = { high: "高可信", medium: "待確認", low: "線索" } as const;

function localAppPreviewEnabled(): boolean {
  const previewBuild = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_EXCHANGE_PREVIEW === "1";
  return previewBuild && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "app";
}

function localOnboardingPreviewEnabled(): boolean {
  const previewBuild = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_EXCHANGE_PREVIEW === "1";
  return previewBuild && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "onboarding";
}

const templateMeta: Record<TaskTemplateKind, { label: string; icon: string }> = {
  general: { label: "一般任務", icon: "/images/doodle-icons-v2/ai-spark.webp" },
  flight: { label: "班機", icon: "/images/doodle-icons-v2/travel-suitcase.webp" },
  course: { label: "選課／學業", icon: "/images/doodle-icons-v2/resources-book.webp" },
  visa: { label: "簽證／居留", icon: "/images/doodle-icons-v2/resources-book.webp" },
  housing: { label: "住宿／入住", icon: "/images/doodle-icons-v2/home-notebook.webp" },
  payment: { label: "付款／費用", icon: "/images/doodle-icons-v2/ai-spark.webp" },
  "school-admin": { label: "學校／行政", icon: "/images/doodle-icons-v2/resources-book.webp" },
};

const emptyTask: JourneyTask = {
  id: "",
  title: "",
  description: "",
  phase: "pre-departure",
  status: "not-started",
  priority: "medium",
  predecessorIds: [],
  notes: "",
  templateKind: "general",
  checklist: [],
  records: [],
};

function formatDate(date?: string): string {
  if (!date) return "尚未設定";
  const [year, month, day] = date.split("-").map(Number);
  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}月${day}日 ${weekday}`;
}

function dayDifference(date: string, referenceDate?: string): number {
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = referenceDate ? new Date(`${referenceDate}T00:00:00`) : new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.ceil((target - start) / 86_400_000);
}

function downloadJson(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exchange-companion-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function TaskModal({
  task,
  tasks,
  onClose,
  onSave,
}: {
  task: JourneyTask;
  tasks: JourneyTask[];
  onClose: () => void;
  onSave: (task: JourneyTask) => void;
}) {
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>(task.checklist ?? []);
  const [records, setRecords] = useState<TaskRecordEntry[]>(task.records ?? []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const predecessor = form.get("predecessor")?.toString() ?? "";
    onSave({
      ...task,
      id: task.id || `task-${Date.now()}`,
      title: form.get("title")?.toString().trim() ?? "",
      description: form.get("description")?.toString().trim() ?? "",
      phase: form.get("phase") as JourneyPhase,
      status: form.get("status") as TaskStatus,
      priority: form.get("priority") as JourneyTask["priority"],
      dueDate: form.get("dueDate")?.toString() || undefined,
      predecessorIds: predecessor ? [predecessor] : [],
      notes: form.get("notes")?.toString().trim() ?? "",
      sourceLabel: form.get("sourceLabel")?.toString().trim() || undefined,
      sourceUrl: form.get("sourceUrl")?.toString().trim() || undefined,
      verifiedAt: form.get("sourceUrl") ? new Date().toISOString().slice(0, 10) : task.verifiedAt,
      templateKind: (form.get("templateKind") as TaskTemplateKind) || "general",
      scheduledAt: form.get("scheduledAt")?.toString() || undefined,
      timeZone: (form.get("timeZone") as JourneyTask["timeZone"]) || undefined,
      location: form.get("location")?.toString().trim() || undefined,
      contactName: form.get("contactName")?.toString().trim() || undefined,
      contactInfo: form.get("contactInfo")?.toString().trim() || undefined,
      referenceNumber: form.get("referenceNumber")?.toString().trim() || undefined,
      cost: form.get("cost") ? Number(form.get("cost")) : undefined,
      currency: form.get("currency")?.toString() || undefined,
      checklist: checklist.filter((item) => item.label.trim()),
      records: records.filter((item) => item.note.trim()),
      result: form.get("result")?.toString().trim() || undefined,
    });
  }

  function addChecklistItem() {
    setChecklist((current) => [...current, { id: `check-${Date.now()}`, label: "", done: false }]);
  }

  function addRecord() {
    setRecords((current) => [
      ...current,
      { id: `record-${Date.now()}`, date: new Date().toISOString().slice(0, 10), note: "" },
    ]);
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className="modal-card paper-card"
        initial={{ opacity: 0, y: 18, rotate: -0.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        exit={{ opacity: 0, y: 10 }}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Journey note</p>
            <h2 id="task-modal-title">{task.id ? "編輯旅程任務" : "新增旅程任務"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X size={20} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-section-heading field-full">
            <Image src={templateMeta[task.templateKind ?? "general"].icon} alt="" width={52} height={52} />
            <div><p className="eyebrow">Personal task record</p><h3>任務內容</h3></div>
          </div>
          <label className="field field-full">
            <span>任務名稱</span>
            <input name="title" defaultValue={task.title} required />
          </label>
          <label className="field field-full">
            <span>說明</span>
            <textarea name="description" defaultValue={task.description} rows={3} required />
          </label>
          <label className="field">
            <span>旅程階段</span>
            <select name="phase" defaultValue={task.phase}>
              {Object.entries(phaseMeta).map(([id, meta]) => (
                <option value={id} key={id}>{meta.number} {meta.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>紀錄類型</span>
            <select name="templateKind" defaultValue={task.templateKind ?? "general"}>
              {Object.entries(templateMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}
            </select>
            <small>未來可由這個類型套用班機、選課等通用模板。</small>
          </label>
          <label className="field">
            <span>狀態</span>
            <select name="status" defaultValue={task.status}>
              {Object.entries(statusMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>期限</span>
            <input type="date" name="dueDate" defaultValue={task.dueDate} />
          </label>
          <label className="field">
            <span>優先度</span>
            <select name="priority" defaultValue={task.priority}>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label className="field">
            <span>實際時間</span>
            <input type="datetime-local" name="scheduledAt" defaultValue={task.scheduledAt} />
          </label>
          <label className="field">
            <span>時區</span>
            <select name="timeZone" defaultValue={task.timeZone ?? exchangeProfile.hostTimeZone}>
              {exchangeTimeZones.map((timeZone) => <option key={timeZone} value={timeZone}>{timeZone === exchangeProfile.hostTimeZone ? exchangeProfile.hostCountry : exchangeProfile.homeCountry}｜{timeZone}</option>)}
            </select>
          </label>
          <label className="field">
            <span>地點</span>
            <input name="location" defaultValue={task.location} placeholder="例如：台北 101 33F" />
          </label>
          <label className="field field-full">
            <span>前置任務</span>
            <select name="predecessor" defaultValue={task.predecessorIds?.[0] ?? ""}>
              <option value="">無</option>
              {tasks.filter((item) => item.id !== task.id).map((item) => (
                <option value={item.id} key={item.id}>{item.title}</option>
              ))}
            </select>
          </label>
          <label className="field field-full">
            <span>私人備註</span>
            <textarea name="notes" defaultValue={task.notes} rows={2} />
          </label>
          <div className="form-section-heading compact field-full">
            <Image src="/images/doodle-icons-v2/resources-book.webp" alt="" width={45} height={45} />
            <div><p className="eyebrow">Details</p><h3>聯絡與費用</h3></div>
          </div>
          <label className="field">
            <span>聯絡人／單位</span>
            <input name="contactName" defaultValue={task.contactName} placeholder="姓名或承辦單位" />
          </label>
          <label className="field">
            <span>聯絡方式</span>
            <input name="contactInfo" defaultValue={task.contactInfo} placeholder="Email、電話或備註" />
          </label>
          <label className="field">
            <span>預約／訂位編號</span>
            <input name="referenceNumber" defaultValue={task.referenceNumber} placeholder="只填適合保存在本機的資料" />
          </label>
          <div className="field">
            <span>費用</span>
            <div className="inline-fields">
              <input type="number" min="0" step="0.01" name="cost" defaultValue={task.cost} placeholder="0" />
              <select name="currency" defaultValue={task.currency ?? exchangeProfile.primaryCurrency} aria-label="幣別">
                {exchangeCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="field field-full repeatable-field">
            <legend>準備清單</legend>
            {checklist.length ? checklist.map((item) => (
              <div className="repeatable-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) => setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry))}
                  aria-label={`完成 ${item.label || "準備項目"}`}
                />
                <input
                  value={item.label}
                  onChange={(event) => setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, label: event.target.value } : entry))}
                  placeholder="例如：攜帶紙本預約確認"
                />
                <button type="button" className="icon-button danger" onClick={() => setChecklist((current) => current.filter((entry) => entry.id !== item.id))} aria-label="刪除準備項目"><X size={16} /></button>
              </div>
            )) : <p className="form-empty-hint">還沒有準備項目。</p>}
            <button type="button" className="mini-add-button" onClick={addChecklistItem}><Plus size={15} />新增準備項目</button>
          </fieldset>
          <fieldset className="field field-full repeatable-field">
            <legend>進度紀錄</legend>
            {records.length ? records.map((entry) => (
              <div className="repeatable-row record-row" key={entry.id}>
                <input
                  type="date"
                  value={entry.date}
                  onChange={(event) => setRecords((current) => current.map((item) => item.id === entry.id ? { ...item, date: event.target.value } : item))}
                  aria-label="紀錄日期"
                />
                <input
                  value={entry.note}
                  onChange={(event) => setRecords((current) => current.map((item) => item.id === entry.id ? { ...item, note: event.target.value } : item))}
                  placeholder="這一天完成或確認了什麼？"
                />
                <button type="button" className="icon-button danger" onClick={() => setRecords((current) => current.filter((item) => item.id !== entry.id))} aria-label="刪除紀錄"><X size={16} /></button>
              </div>
            )) : <p className="form-empty-hint">還沒有進度紀錄。</p>}
            <button type="button" className="mini-add-button" onClick={addRecord}><Plus size={15} />新增一筆紀錄</button>
          </fieldset>
          <label className="field field-full">
            <span>完成結果／事後心得</span>
            <textarea name="result" defaultValue={task.result} rows={3} placeholder="完成後記下實際結果、踩雷或下次要提醒自己的事。" />
          </label>
          <div className="form-section-heading compact field-full">
            <Image src="/images/doodle-icons-v2/journey-route.webp" alt="" width={45} height={45} />
            <div><p className="eyebrow">Reference</p><h3>查核來源</h3></div>
          </div>
          <label className="field">
            <span>來源名稱</span>
            <input name="sourceLabel" defaultValue={task.sourceLabel} placeholder="例如：交換學校國際處" />
          </label>
          <label className="field">
            <span>來源網址</span>
            <input type="url" name="sourceUrl" defaultValue={task.sourceUrl} placeholder="https://" />
          </label>
          <div className="modal-actions field-full">
            <button type="button" className="button secondary" onClick={onClose}>取消</button>
            <button className="button primary" type="submit"><Check size={18} />儲存任務</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function TaskCard({
  task,
  allTasks,
  onStatus,
  onChecklist,
  onEdit,
  onDelete,
}: {
  task: JourneyTask;
  allTasks: JourneyTask[];
  onStatus: (status: TaskStatus) => void;
  onChecklist: (itemId: string, done: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const articleRef = useRef<HTMLElement>(null);
  const blockedBy = (task.predecessorIds ?? [])
    .map((id) => allTasks.find((item) => item.id === id))
    .filter((item): item is JourneyTask => Boolean(item && item.status !== "done" && item.status !== "not-applicable"));
  const overdue = Boolean(task.dueDate && dayDifference(task.dueDate) < 0 && task.status !== "done");
  const checklist = task.checklist ?? [];
  const records = task.records ?? [];
  const completedChecklist = checklist.filter((item) => item.done).length;
  const hasPersonalDetails = Boolean(
    task.scheduledAt || task.location || task.contactName || task.referenceNumber || task.cost || checklist.length || records.length || task.result,
  );

  const toggleRecord = () => {
    const opening = !expanded;
    setExpanded(opening);
    window.setTimeout(() => {
      articleRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (articleRef.current) window.scrollBy({ top: -88, behavior: reduceMotion ? "auto" : "smooth" });
    }, reduceMotion ? 0 : opening ? 260 : 150);
  };

  return (
    <motion.article
      ref={articleRef}
      id={`task-${task.id}`}
      data-task-id={task.id}
      layout
      className={`task-card ${task.status === "done" ? "task-done" : ""}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
    >
      <button
        className={`drawn-check ${task.status === "done" ? "checked" : ""}`}
        onClick={() => onStatus(task.status === "done" ? "not-started" : "done")}
        aria-label={task.status === "done" ? `取消完成 ${task.title}` : `完成 ${task.title}`}
      >
        {task.status === "done" ? <Check size={18} strokeWidth={3} /> : null}
      </button>
      <div className="task-body">
        <div className="task-title-row">
          <Image className="task-doodle-icon" src={(templateMeta[task.templateKind ?? "general"] ?? templateMeta.general).icon} alt="" width={39} height={39} />
          <h3>{task.title}</h3>
          {task.priority === "high" ? <span className="priority-dot" title="高優先度" /> : null}
        </div>
        <p>{task.description}</p>
        {blockedBy.length > 0 ? (
          <div className="blocked-note"><ShieldAlert size={15} />先完成：{blockedBy.map((item) => item.title).join("、")}</div>
        ) : null}
        {task.notes ? <div className="hand-note">↳ {task.notes}</div> : null}
        <div className="task-meta">
          <label className={`status-select ${(statusMeta[task.status] ?? statusMeta["not-started"]).className}`}>
            <span className="sr-only">更新狀態</span>
            <select value={task.status} onChange={(event) => onStatus(event.target.value as TaskStatus)}>
              {Object.entries(statusMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          {task.dueDate ? (
            <span className={`meta-chip ${overdue ? "overdue" : ""}`}><CalendarDays size={14} />{formatDate(task.dueDate)}</span>
          ) : <span className="meta-chip muted"><Clock3 size={14} />待確認日期</span>}
          {task.sourceUrl ? (
            <a className="source-link" href={task.sourceUrl} target="_blank" rel="noreferrer">
              {task.sourceLabel ?? "查看來源"}<ExternalLink size={13} />
            </a>
          ) : null}
          {checklist.length ? <span className="meta-chip checklist-chip"><Check size={14} />{completedChecklist}/{checklist.length} 準備完成</span> : null}
        </div>
        {hasPersonalDetails ? (
          <div className="task-record-wrap">
            <motion.button type="button" className="task-record-toggle" onClick={toggleRecord} aria-expanded={expanded} whileTap={reduceMotion ? undefined : { y: 2 }}>
              <span>{expanded ? "收起個人紀錄" : "展開個人紀錄"}</span><ChevronDown size={15} className={expanded ? "rotated" : ""} />
            </motion.button>
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div className="task-record-panel" initial={reduceMotion ? false : { opacity: 0, height: 0, y: -6 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                  <div className="record-facts">
                    {task.scheduledAt ? <div><span>實際時間</span><strong>{task.scheduledAt.replace("T", " · ")}</strong><small>{task.timeZone ?? exchangeProfile.hostTimeZone}</small></div> : null}
                    {task.location ? <div><span>地點</span><strong>{task.location}</strong></div> : null}
                    {task.contactName ? <div><span>聯絡人／單位</span><strong>{task.contactName}</strong>{task.contactInfo ? <small>{task.contactInfo}</small> : null}</div> : null}
                    {task.referenceNumber ? <div><span>參考編號</span><strong>{task.referenceNumber}</strong></div> : null}
                    {typeof task.cost === "number" ? <div><span>費用</span><strong>{task.currency ?? exchangeProfile.primaryCurrency} {task.cost.toLocaleString()}</strong></div> : null}
                  </div>
                  {checklist.length ? (
                    <div className="record-section">
                      <h4>準備清單</h4>
                      <div className="personal-checklist">
                        {checklist.map((item) => (
                          <label key={item.id} className={item.done ? "done" : ""}>
                            <input type="checkbox" checked={item.done} onChange={(event) => onChecklist(item.id, event.target.checked)} />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {records.length ? (
                    <div className="record-section">
                      <h4>進度紀錄</h4>
                      <ol className="record-timeline">
                        {[...records].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => <li key={entry.id}><time>{entry.date.replaceAll("-", ".")}</time><span>{entry.note}</span></li>)}
                      </ol>
                    </div>
                  ) : null}
                  {task.result ? <div className="result-note"><span>完成後記</span><p>{task.result}</p></div> : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
      </div>
      <div className="task-actions">
        {task.dueDate ? (
          <a className="icon-button" href={googleCalendarUrl(task)} target="_blank" rel="noreferrer" aria-label={`加入行事曆 ${task.title}`}>
            <CalendarDays size={17} />
          </a>
        ) : null}
        <button className="icon-button" onClick={onEdit} aria-label={`編輯 ${task.title}`}><Pencil size={17} /></button>
        <button className="icon-button danger" onClick={onDelete} aria-label={`刪除 ${task.title}`}><Trash2 size={17} /></button>
      </div>
    </motion.article>
  );
}

function Dashboard({ state, setState, cloud, navigate, navigateTarget, todayIso, forceGuide, onCloseGuide }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; cloud: ExchangeCloudController; navigate: NavigateToSection; navigateTarget: (target: HomeAgendaTarget) => void; todayIso: string; forceGuide: boolean; onCloseGuide: () => void }) {
  if (state.homeExperience) return <HomeDashboard state={state} setState={setState} cloud={cloud} todayIso={todayIso} forceGuide={forceGuide} onNavigate={navigateTarget} onCloseGuide={onCloseGuide} />;
  const applicable = state.tasks.filter((task) => task.status !== "not-applicable");
  const done = applicable.filter((task) => task.status === "done").length;
  const progress = Math.round((done / applicable.length) * 100);
  const countdown = state.journey.startDate && todayIso ? dayDifference(state.journey.startDate, todayIso) : null;
  const nextTasks = [...applicable]
    .filter((task) => task.status !== "done")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 3);
  const overdue = todayIso ? applicable.filter((task) => task.dueDate && dayDifference(task.dueDate, todayIso) < 0 && task.status !== "done").length : 0;
  const waiting = applicable.filter((task) => task.status === "waiting").length;
  const monthlyByCurrency = state.budget.filter((item) => item.cadence === "monthly").reduce<Record<string, number>>((totals, item) => ({
    ...totals,
    [item.currency]: (totals[item.currency] ?? 0) + item.amount,
  }), {});
  const monthlySummary = Object.entries(monthlyByCurrency).map(([currency, amount]) => `${currency} ${amount.toLocaleString()}`).join(" + ") || `${exchangeProfile.primaryCurrency} 0`;

  return (
    <div className="page-stack">
      <motion.section className="hero-section" initial="hidden" animate="show">
        <div className="hero-copy">
          <motion.div className="airmail-label" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            EXCHANGE JOURNEY
          </motion.div>
          <motion.p className="eyebrow structural-eyebrow" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.08 } } }}>
            {state.journey.homeCity || "出發地待補"} <ArrowRight size={14} /> {state.journey.hostCity || "目的地待補"}
          </motion.p>
          <motion.h1 variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { delay: 0.14 } } }}>
            嗨 {state.journey.ownerName || "交換生"}，<br />交換準備得怎麼樣？
          </motion.h1>
          <motion.p className="hero-lead" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.22 } } }}>
            把複雜的行政手續、行李和生活準備，整理成今天真的做得完的下一步。
          </motion.p>
          <motion.div className="hero-actions" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.3 } } }}>
            <button className="button primary tag-button" onClick={() => navigate("journey", "progress")}>查看下一步 <ArrowRight size={18} /></button>
            <button className="button text-button" onClick={() => navigate("journey", "packing")}><Luggage size={18} />整理行李</button>
          </motion.div>
        </div>
        <motion.div
          className="hero-art"
          initial={{ opacity: 0, x: 20, rotate: 0.8 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <Image src={exchangeProfile.visual.heroImage} alt={`${exchangeProfile.visual.routeLabel} 的手繪交換旅行行李插畫`} fill priority sizes="(max-width: 820px) 100vw, 56vw" />
          <div className="countdown-ticket">
            <span>DEPARTURE</span>
            <strong>{countdown === null ? "—" : Math.max(0, countdown)}</strong>
            <em>days to go</em>
          </div>
        </motion.div>
        <span className="doodle-star star-one">✦</span>
        <span className="doodle-star star-two">✷</span>
      </motion.section>

      <section className="progress-strip torn-section">
        <div className="progress-copy">
          <p className="eyebrow">Your exchange route</p>
          <h2>從錄取到返國，已走完 {progress}%</h2>
        </div>
        <div className="route-progress" aria-label={`交換準備完成 ${progress}%`}>
          <div className="route-line"><motion.span initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.55 }} /></div>
          <span className="route-origin">{(state.journey.homeCity || "HOME").toUpperCase()}</span>
          <span className="route-plane" style={{ left: `${Math.min(94, Math.max(4, progress))}%` }}>✈</span>
          <span className="route-destination">{(state.journey.hostCity || "DESTINATION").toUpperCase()}</span>
        </div>
        <div className="progress-number"><strong>{done}</strong><span>/ {applicable.length} tasks</span></div>
      </section>

      <section className="dashboard-grid">
        <div className="next-panel paper-card tape-card">
          <div className="section-heading">
            <div><p className="eyebrow">Do these next</p><h2>現在先做這三件事</h2></div>
            <button className="link-button" onClick={() => navigate("journey", "progress")}>全部旅程 <ArrowRight size={15} /></button>
          </div>
          <div className="next-list">
            {nextTasks.map((task, index) => (
              <button className="next-task" key={task.id} onClick={() => navigate("journey", "progress")}>
                <span className="next-number">0{index + 1}</span>
                <span><strong>{task.title}</strong><small>{task.dueDate ? `${formatDate(task.dueDate)} · ${statusMeta[task.status].label}` : statusMeta[task.status].label}</small></span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-side">
          <div className="alert-grid">
            <button className="alert-note yellow" onClick={() => navigate("journey", "progress")}>
              <Clock3 size={23} /><strong>{waiting}</strong><span>等待中的事項</span>
            </button>
            <button className={`alert-note ${overdue ? "red" : "sage"}`} onClick={() => navigate("journey", "progress")}>
              {overdue ? <AlertTriangle size={23} /> : <Check size={23} />}<strong>{overdue}</strong><span>已逾期事項</span>
            </button>
          </div>
          <div className="journey-card paper-card">
            <div className="journey-card-top"><span className="stamp">EX</span><span>MY JOURNEY</span></div>
            <h3>{state.journey.hostSchool || "交換學校待 AI 補齊"}</h3>
            <p>{state.journey.program || "交換計畫尚未設定"}</p>
            <div className="journey-details">
              <span><CalendarDays size={16} />{state.journey.startDate ? state.journey.startDate.replaceAll("-", ".") : "開始日待補"} — {state.journey.endDate ? state.journey.endDate.replaceAll("-", ".") : "結束日待補"}</span>
              <span><MapIcon size={16} />{state.journey.hostCity} · {state.journey.destinations.join("、")}</span>
            </div>
          </div>
          <div className="budget-peek paper-card">
            <PiggyBank size={25} />
            <div><span>每月基礎預算</span><strong>約 {monthlySummary}</strong></div>
            <button className="icon-button" onClick={() => navigate("settings")} aria-label="查看預算"><ArrowRight size={17} /></button>
          </div>
        </div>
      </section>

      <section className="quick-modes">
        <button className="mode-card blue" onClick={() => navigate("journey", "progress")}>
          <span className="mode-icon"><Image src="/images/doodle-icons-v2/home-notebook.webp" alt="" width={58} height={58} /></span>
          <div><p className="eyebrow">Quick mode</p><h3>抵達 72 小時</h3><p>鑰匙、入住、第一晚補給與 Orientation。</p></div>
          <ArrowRight />
        </button>
        <button className="mode-card terracotta" onClick={() => navigate("journey", "progress")}>
          <span className="mode-icon"><Image src="/images/doodle-icons-v2/travel-suitcase.webp" alt="" width={58} height={58} /></span>
          <div><p className="eyebrow">Finish well</p><h3>返國收尾模式</h3><p>退租、註銷、押金、成績單一次收好。</p></div>
          <ArrowRight />
        </button>
      </section>
    </div>
  );
}

function JourneyPage({ state, setState, view, onViewChange, focusTaskId = "" }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; view: JourneyView; onViewChange: (view: JourneyView) => void; focusTaskId?: string }) {
  const [phase, setPhase] = useState<JourneyPhase | "all">("all");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editingTask, setEditingTask] = useState<JourneyTask | null>(null);
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const reduceMotion = useReducedMotion();
  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };

  useEffect(() => {
    if (!focusTaskId) return;
    const timer = window.setTimeout(() => {
      setPhase("all");
      setStatus("all");
      setSearch("");
      window.setTimeout(() => {
        const target = document.getElementById(`task-${focusTaskId}`);
        target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        target?.classList.add("task-deep-linked");
        window.setTimeout(() => target?.classList.remove("task-deep-linked"), 1800);
      }, 80);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTaskId, reduceMotion]);

  const filtered = useMemo(() => state.tasks.filter((task) => {
    const phaseMatch = phase === "all" || task.phase === phase;
    const statusMatch = status === "all" || task.status === status;
    const searchable = [
      task.title,
      task.description,
      task.notes,
      task.location,
      task.contactName,
      task.contactInfo,
      task.referenceNumber,
      task.result,
      ...(task.checklist ?? []).map((item) => item.label),
      ...(task.records ?? []).map((entry) => entry.note),
    ].filter(Boolean).join(" ").toLowerCase();
    const searchMatch = !deferredSearch || searchable.includes(deferredSearch);
    return phaseMatch && statusMatch && searchMatch;
  }), [state.tasks, phase, status, deferredSearch]);

  function updateTask(id: string, patch: Partial<JourneyTask>) {
    setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...patch } : task) }));
  }

  function saveTask(task: JourneyTask) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.some((item) => item.id === task.id)
        ? current.tasks.map((item) => item.id === task.id ? task : item)
        : [...current.tasks, task],
    }));
    setEditingTask(null);
  }

  function deleteTask(id: string) {
    if (!window.confirm("確定要刪除這項任務嗎？")) return;
    setState((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => task.id !== id)
        .map((task) => ({ ...task, predecessorIds: (task.predecessorIds ?? []).filter((predecessor) => predecessor !== id) })),
    }));
  }

  return (
    <div className="page-stack">
      <header className="page-header journey-header">
        <div>
          <p className="eyebrow">One step at a time</p>
          <h1>交換旅程</h1>
          <p>不是另一份長清單，而是把每個前置條件、期限和下一步接起來。</p>
        </div>
      </header>

      <div className="journey-view-tabs" data-view={view} role="tablist" aria-label="交換旅程內容">
        <span className="journey-tab-slider" aria-hidden="true" />
        <motion.button whileTap={reduceMotion ? undefined : { y: 2, scale: 0.995 }} type="button" role="tab" aria-selected={view === "progress"} className={view === "progress" ? "active" : ""} onClick={() => onViewChange("progress")}>
          <span className="journey-tab-label"><Check size={17} />準備進度</span>
        </motion.button>
        <motion.button whileTap={reduceMotion ? undefined : { y: 2, scale: 0.995 }} type="button" role="tab" aria-selected={view === "packing"} className={view === "packing" ? "active" : ""} onClick={() => onViewChange("packing")}>
          <span className="journey-tab-label"><Luggage size={17} />出發行李</span>
        </motion.button>
      </div>

      <AnimatePresence initial={false} mode="wait">
      {view === "progress" ? <motion.div
        key="journey-progress"
        className="journey-view-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.996 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.998 }}
        transition={panelTransition}
      >
      <div className="journey-progress-actions" aria-label="準備進度操作">
        <button className="button secondary" onClick={() => downloadIcs(state.tasks)}><Download size={17} />匯出全部期限</button>
        <button className="button primary" onClick={() => setEditingTask({ ...emptyTask })}><Plus size={18} />新增任務</button>
      </div>

      <div className="phase-tabs" role="tablist" aria-label="旅程階段">
        <motion.button whileTap={reduceMotion ? undefined : { y: 2, scale: 0.98 }} className={phase === "all" ? "active" : ""} onClick={() => setPhase("all")}>全部 <span>{state.tasks.length}</span></motion.button>
        {Object.entries(phaseMeta).map(([id, meta]) => (
          <motion.button whileTap={reduceMotion ? undefined : { y: 2, scale: 0.98 }} key={id} className={phase === id ? "active" : ""} onClick={() => setPhase(id as JourneyPhase)}>
            <small>{meta.number}</small>{meta.label}<span>{state.tasks.filter((task) => task.phase === id).length}</span>
          </motion.button>
        ))}
      </div>

      <div className="toolbar paper-card">
        <label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋任務、備註或關鍵字" /></label>
        <label className="compact-select"><span className="sr-only">狀態篩選</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | "all")}>
          <option value="all">所有狀態</option>{Object.entries(statusMeta).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
        </select><ChevronDown size={15} /></label>
        <span className="result-count">顯示 {filtered.length} 項</span>
      </div>

      <div className="journey-sections">
        {(phase === "all" ? Object.keys(phaseMeta) as JourneyPhase[] : [phase]).map((phaseId) => {
          const phaseTasks = filtered
            .filter((task) => task.phase === phaseId)
            .sort((a, b) => Number(a.status === "done" || a.status === "not-applicable") - Number(b.status === "done" || b.status === "not-applicable"));
          if (phaseTasks.length === 0) return null;
          const completed = phaseTasks.filter((task) => task.status === "done").length;
          const meta = phaseMeta[phaseId];
          return (
            <section className={`phase-section phase-${meta.color}`} key={phaseId}>
              <div className="phase-heading">
                <span className="phase-number">{meta.number}</span>
                <div><p className="eyebrow structural-eyebrow">Chapter {meta.number}</p><h2>{meta.label}</h2></div>
                <span className="phase-progress">{completed} / {phaseTasks.length} 完成</span>
              </div>
              <div className="task-list">
                <AnimatePresence initial={false}>
                  {phaseTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      allTasks={state.tasks}
                      onStatus={(nextStatus) => updateTask(task.id, { status: nextStatus })}
                      onChecklist={(itemId, done) => updateTask(task.id, {
                        checklist: (task.checklist ?? []).map((item) => item.id === itemId ? { ...item, done } : item),
                      })}
                      onEdit={() => setEditingTask(task)}
                      onDelete={() => deleteTask(task.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>
      {filtered.length === 0 ? <div className="empty-state paper-card"><Search size={28} /><h2>沒有符合的任務</h2><p>換個關鍵字或清除篩選條件。</p></div> : null}

      </motion.div> : <motion.div
        key="journey-packing"
        className="journey-view-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.996 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.998 }}
        transition={panelTransition}
      ><PackingPage state={state} setState={setState} embedded /></motion.div>}
      </AnimatePresence>

      <AnimatePresence>{editingTask ? <TaskModal task={editingTask} tasks={state.tasks} onClose={() => setEditingTask(null)} onSave={saveTask} /> : null}</AnimatePresence>
    </div>
  );
}

function PackingPage({ state, setState, embedded = false }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<PackingDecision | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editingPackingItemId, setEditingPackingItemId] = useState("");
  const [showAllowanceForm, setShowAllowanceForm] = useState(false);
  const [showBagForm, setShowBagForm] = useState(false);
  const [allowanceMessage, setAllowanceMessage] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const bagWeights = useMemo(() => bagWeightMap(state.bags, state.packingItems), [state.bags, state.packingItems]);

  const filteredItems = useMemo(() => state.packingItems.filter((item) => {
    const queryMatch = !deferredQuery || `${item.name} ${item.category}`.toLowerCase().includes(deferredQuery);
    return queryMatch && (decision === "all" || item.decision === decision);
  }), [state.packingItems, deferredQuery, decision]);

  const packedCount = state.packingItems.filter((item) => item.packed).length;
  const weightBreakdown = useMemo(() => assignedBagWeightBreakdown(state.bags, state.packingItems), [state.bags, state.packingItems]);
  const knownBagIds = useMemo(() => new Set(state.bags.map((bag) => bag.id)), [state.bags]);
  const unassignedWeight = useMemo(() => state.packingItems
    .filter((item) => !item.bagId || !knownBagIds.has(item.bagId))
    .reduce((sum, item) => sum + item.weightKg * item.quantity, 0), [knownBagIds, state.packingItems]);
  const unassignedCount = state.packingItems.filter((item) => !item.bagId || !knownBagIds.has(item.bagId)).length;
  const flightAllowances = useMemo(() => state.flightAllowances ?? [], [state.flightAllowances]);
  const baggageEvaluation = useMemo(
    () => evaluateBaggageAllowances(state.bags, state.packingItems, flightAllowances),
    [state.bags, state.packingItems, flightAllowances],
  );
  const checkedWeight = baggageEvaluation.checkedWeightKg;
  const strictCheckedLimit = baggageEvaluation.strictCheckedLimitKg;
  const checkedOverLimit = baggageEvaluation.ready && baggageEvaluation.issues.length > 0;
  const categories = [...new Set(filteredItems.map((item) => item.category))];
  const todayIso = new Date().toLocaleDateString("sv-SE", { timeZone: exchangeProfile.homeTimeZone });
  const baggageIsPast = Boolean(state.journey.startDate && state.journey.startDate < todayIso);

  function updateItem(id: string, patch: Partial<PackingItem>) {
    setState((current) => ({ ...current, packingItems: current.packingItems.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const editingItem = state.packingItems.find((item) => item.id === editingPackingItemId);
    const item: PackingItem = {
      id: editingItem?.id ?? `packing-${Date.now()}`,
      name: form.get("name")?.toString().trim() ?? "",
      category: form.get("category")?.toString().trim() || "其他",
      decision: form.get("decision") as PackingDecision,
      bagId: form.get("bagId")?.toString() ?? "",
      quantity: Math.max(1, Number(form.get("quantity")) || 1),
      weightKg: Math.max(0, Number(form.get("weightKg")) || 0),
      packed: editingItem?.packed ?? false,
      notes: form.get("notes")?.toString().trim() || undefined,
    };
    setState((current) => ({ ...current, packingItems: editingItem ? current.packingItems.map((currentItem) => currentItem.id === item.id ? item : currentItem) : [...current.packingItems, item] }));
    event.currentTarget.reset();
    setShowAdd(false);
    setEditingPackingItemId("");
  }

  function deleteItem(id: string) {
    setState((current) => ({ ...current, packingItems: current.packingItems.filter((item) => item.id !== id) }));
  }

  function addAllowance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checkedMode = form.get("checkedMode") as FlightAllowance["checkedMode"];
    const carryOnMode = form.get("carryOnMode") as FlightAllowance["carryOnMode"];
    const personalItemMode = form.get("personalItemMode") as FlightAllowance["personalItemMode"];
    const checkedPieceCount = checkedMode === "piece" ? Math.max(0, Number(form.get("checkedPieceCount")) || 0) : 0;
    const checkedPieceWeightKg = checkedMode === "piece" ? Math.max(0, Number(form.get("checkedPieceWeightKg")) || 0) : 0;
    const checkedTotalWeightKg = checkedMode === "weight" ? Math.max(0, Number(form.get("checkedTotalWeightKg")) || 0) : 0;
    const carryOnPieceCount = carryOnMode === "piece" ? Math.max(0, Number(form.get("carryOnPieceCount")) || 0) : 0;
    const carryOnPieceWeightKg = carryOnMode === "piece" ? Math.max(0, Number(form.get("carryOnPieceWeightKg")) || 0) : 0;
    const personalItemPieceCount = personalItemMode === "piece" ? Math.max(0, Number(form.get("personalItemPieceCount")) || 0) : 0;
    const personalItemPieceWeightKg = personalItemMode === "piece" ? Math.max(0, Number(form.get("personalItemPieceWeightKg")) || 0) : 0;
    const confirmed = form.get("copiedFromTicket") === "on";
    const pieceRuleInvalid = (mode: "piece" | "none" | "unknown", count: number, weight: number) => mode === "piece" && (!Number.isInteger(count) || count <= 0 || weight <= 0);
    if ((checkedMode === "piece" && (!Number.isInteger(checkedPieceCount) || checkedPieceCount <= 0 || checkedPieceWeightKg <= 0))
      || (checkedMode === "weight" && checkedTotalWeightKg <= 0)
      || pieceRuleInvalid(carryOnMode, carryOnPieceCount, carryOnPieceWeightKg)
      || (personalItemMode === "piece" && (!Number.isInteger(personalItemPieceCount) || personalItemPieceCount <= 0))
      || (confirmed && [checkedMode, carryOnMode, personalItemMode].includes("unknown"))) {
      setAllowanceMessage("請依選擇的計算方式填完整數字；若仍有待確認項目，不能標示為已抄自機票。");
      return;
    }
    const allowance: FlightAllowance = {
      id: `flight-allowance-${Date.now()}`,
      label: form.get("label")?.toString().trim() || "本人機票",
      airline: form.get("airline")?.toString().trim() || "航空公司待確認",
      segment: form.get("segment")?.toString().trim() || "航段待確認",
      checkedMode,
      checkedPieceCount,
      checkedPieceWeightKg,
      checkedTotalWeightKg,
      carryOnMode,
      carryOnPieceCount,
      carryOnPieceWeightKg,
      personalItemMode,
      personalItemPieceCount,
      personalItemPieceWeightKg,
      provenance: "manual",
      confirmed,
      sourceLabel: confirmed ? "手動輸入（使用者確認抄自機票）" : "手動輸入（尚未核對）",
      verifiedAt: new Date().toISOString().slice(0, 10),
      notes: form.get("notes")?.toString().trim() ?? "",
    };
    setState((current) => ({ ...current, flightAllowances: [...(current.flightAllowances ?? []), allowance] }));
    event.currentTarget.reset();
    setAllowanceMessage(confirmed ? "已加入手動確認的機票規則。" : "已加入待核對的手動規則；目前不會用它判斷剩餘重量。");
    setShowAllowanceForm(false);
  }

  function addBag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const limitKg = Math.max(0, Number(form.get("limitKg")) || 0);
    const bag: Bag = {
      id: `bag-${Date.now()}`,
      name: form.get("name")?.toString().trim() || "新行李",
      kind: form.get("kind") as Bag["kind"],
      limitKg,
      limitSource: limitKg > 0 ? "manual" : "unconfirmed",
    };
    setState((current) => ({ ...current, bags: [...current.bags, bag] }));
    event.currentTarget.reset();
    setShowBagForm(false);
  }

  function deleteBag(bag: Bag) {
    if (!window.confirm(`刪除「${bag.name}」？其中物品會改為尚未分配。`)) return;
    setState((current) => ({
      ...current,
      bags: current.bags.filter((item) => item.id !== bag.id),
      packingItems: current.packingItems.map((item) => item.bagId === bag.id ? { ...item, bagId: "" } : item),
    }));
  }

  function deleteAllowance(id: string) {
    setState((current) => ({ ...current, flightAllowances: (current.flightAllowances ?? []).filter((item) => item.id !== id) }));
  }

  function allowanceSummary(allowance: FlightAllowance): string {
    const checked = allowance.checkedMode === "piece" && allowance.checkedPieceCount > 0 && allowance.checkedPieceWeightKg > 0
      ? `${allowance.checkedPieceCount} × ${allowance.checkedPieceWeightKg}kg 托運`
      : allowance.checkedMode === "weight" && allowance.checkedTotalWeightKg > 0
        ? `托運合計 ${allowance.checkedTotalWeightKg}kg`
        : allowance.checkedMode === "none" ? "不含托運" : "托運待確認";
    const pieceSummary = (mode: "piece" | "none" | "unknown", count: number, weight: number, label: string) => mode === "piece"
      ? weight > 0 ? `${count} × ${weight}kg ${label}` : `${count} 件${label}（未列獨立重量）`
      : mode === "none" ? `不含${label}` : `${label}待確認`;
    const carry = pieceSummary(allowance.carryOnMode, allowance.carryOnPieceCount, allowance.carryOnPieceWeightKg, "手提");
    const personal = pieceSummary(allowance.personalItemMode, allowance.personalItemPieceCount, allowance.personalItemPieceWeightKg, "個人物品");
    return `${checked} · ${carry} · ${personal}`;
  }

  const allowanceDisclosure = (
    <details className={`flight-allowance-disclosure paper-card ${checkedOverLimit ? "over-limit" : ""} ${baggageIsPast ? "past" : ""}`} open={!baggageEvaluation.ready && !baggageIsPast}>
      <summary>
        <Image src="/images/doodle-icons-v2/travel-suitcase.webp" alt="" width={58} height={58} />
        <div className="flight-allowance-summary-copy">
          <p className="eyebrow">{baggageEvaluation.ready ? "Confirmed personal allowance" : flightAllowances.length ? "Needs ticket confirmation" : "Waiting for your ticket"}</p>
          <h2>{baggageEvaluation.ready ? "已依本人的機票核對所有行李規則" : flightAllowances.length ? "仍有航段或行李類型待確認" : "尚未從本人的機票確認行李額度"}</h2>
          <small>{baggageIsPast ? "這趟去程已結束，規則已收入過去行李" : baggageEvaluation.ready ? `${flightAllowances.length} 組本人機票規則 · 點擊查看` : "展開確認航段與行李額度"}</small>
        </div>
        <div className="flight-allowance-summary-weight"><span>托運箱內</span><strong>{checkedWeight.toFixed(1)} kg</strong></div>
        <ChevronDown className="disclosure-chevron" size={22} aria-hidden="true" />
      </summary>
      <div className="flight-allowance-card-body">
        <div className="flight-allowance-rules">
          {flightAllowances.length ? <div className="allowance-chips">{flightAllowances.map((allowance) => <span key={allowance.id} className={allowance.confirmed ? "confirmed" : "unconfirmed"}><strong>{allowance.airline}</strong><small>{allowance.segment} · {allowance.confirmed ? "已確認" : "待核對"}</small>{allowanceSummary(allowance)}<button type="button" onClick={() => deleteAllowance(allowance.id)} aria-label={`刪除 ${allowance.label}`}><X size={13} /></button></span>)}</div> : null}
          <p>{flightAllowances.length ? "若不同航段或不同訂位的規則不一，配置時以實際適用的較嚴格限制為準；不保存乘客姓名、票號或訂位代碼。" : "請把自己的電子機票或訂位確認單明確授權給 Exchange Concierge；AI 只會提出可審核的航段與額度，不會沿用示範航空公司。你也可以手動填寫。"}</p>
          {baggageEvaluation.issues.length ? <ul className="allowance-issues">{baggageEvaluation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
          <button className="button text-button" type="button" onClick={() => setShowAllowanceForm((value) => !value)}>{showAllowanceForm ? <X size={15} /> : <Plus size={15} />}{showAllowanceForm ? "取消填寫" : "手動新增機票規則"}</button>
        </div>
        <div className="combined-weight">
          <span>托運箱內合計</span>
          <strong>{checkedWeight.toFixed(1)}{baggageEvaluation.ready && strictCheckedLimit !== undefined ? ` / ${strictCheckedLimit} kg` : " kg"}</strong>
          <div className="weight-bar"><motion.span animate={{ width: `${baggageEvaluation.ready && strictCheckedLimit !== undefined ? (strictCheckedLimit > 0 ? Math.min(100, checkedWeight / strictCheckedLimit * 100) : checkedWeight > 0 ? 100 : 0) : 0}%` }} /></div>
          {!baggageEvaluation.ready ? <small>所有適用航段都確認後才判斷剩餘額度</small> : checkedOverLimit ? <em>目前配置違反至少一段行李規則</em> : strictCheckedLimit !== undefined ? <small>托運總量距最嚴格上限 {(strictCheckedLimit - checkedWeight).toFixed(1)}kg；仍需符合每件上限</small> : <small>本人機票規則已確認</small>}
        </div>
      </div>
    </details>
  );

  return (
    <div className="page-stack">
      {!embedded ? <header className="page-header packing-header">
        <div><p className="eyebrow">Pack lighter, live easier</p><h1>行李工作台</h1><p>用實際公斤數分配每件行李，也知道哪些東西到了目的地再買就好。</p></div>
      </header> : <header className="embedded-packing-intro"><div><p className="eyebrow">Long-stay packing</p><h2>一年份的生活，分進真正會帶走的行李</h2><p>這裡只整理交換長住行李；每趟短途旅行的小行李仍留在旅行規劃裡。</p></div>{baggageIsPast ? <span className="past-packing-tag">已成為過去行李</span> : null}</header>}

      {!baggageIsPast ? allowanceDisclosure : null}

      <AnimatePresence>{showAllowanceForm ? <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={(event) => event.target === event.currentTarget && setShowAllowanceForm(false)}><motion.form className="modal-card allowance-form paper-card" onSubmit={addAllowance} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
        <div className="modal-heading field-full"><div><p className="eyebrow">Manual fallback</p><h2>新增本人機票的行李規則</h2></div><button className="icon-button" type="button" onClick={() => setShowAllowanceForm(false)} aria-label="關閉"><X size={20}/></button></div>
        <label className="field"><span>規則名稱</span><input name="label" required placeholder="例如：去程第一張機票" /></label>
        <label className="field"><span>航空公司</span><input name="airline" required placeholder="依機票顯示" /></label>
        <label className="field"><span>適用航段</span><input name="segment" required placeholder="例如：TPE → FRA" /></label>
        <label className="field"><span>托運計算方式</span><select name="checkedMode" defaultValue="unknown"><option value="unknown">待確認</option><option value="piece">計件制</option><option value="weight">計重制</option><option value="none">不含托運</option></select></label>
        <label className="field"><span>托運件數</span><input name="checkedPieceCount" type="number" min="0" step="1" defaultValue="0" /></label>
        <label className="field"><span>每件托運 kg</span><input name="checkedPieceWeightKg" type="number" min="0" step="0.5" defaultValue="0" /></label>
        <label className="field"><span>托運合計 kg</span><input name="checkedTotalWeightKg" type="number" min="0" step="0.5" defaultValue="0" /></label>
        <label className="field"><span>手提狀態</span><select name="carryOnMode" defaultValue="unknown"><option value="unknown">票面未載／待確認</option><option value="piece">包含手提</option><option value="none">不含手提</option></select></label>
        <label className="field"><span>手提件數</span><input name="carryOnPieceCount" type="number" min="0" step="1" defaultValue="0" /></label>
        <label className="field"><span>每件手提 kg</span><input name="carryOnPieceWeightKg" type="number" min="0" step="0.5" defaultValue="0" /></label>
        <label className="field"><span>個人物品狀態</span><select name="personalItemMode" defaultValue="unknown"><option value="unknown">票面未載／待確認</option><option value="piece">包含個人物品</option><option value="none">不含個人物品</option></select></label>
        <label className="field"><span>個人物品件數</span><input name="personalItemPieceCount" type="number" min="0" step="1" defaultValue="0" /></label>
        <label className="field"><span>每件個人物品 kg</span><input name="personalItemPieceWeightKg" type="number" min="0" step="0.5" defaultValue="0" /></label>
        <label className="field field-full confirmation-field"><input name="copiedFromTicket" type="checkbox" /><span>我確認以上每個欄位都抄自自己的機票／訂位確認單</span></label>
        <label className="field field-full"><span>備註（不要填票號或訂位代碼）</span><textarea name="notes" rows={2} /></label>
        <button className="button primary" type="submit"><Plus size={16} />加入本人規則</button>
      </motion.form></motion.div> : null}</AnimatePresence>
      {allowanceMessage ? <p className="settings-message" role="status">{allowanceMessage}</p> : null}

      <section className="packing-summary">
        <div className="summary-sticker terracotta assigned-weight-summary"><Luggage /><div><strong>{weightBreakdown.totalKg.toFixed(1)} kg</strong><span>已分配總重</span></div><dl><div><dt>托運</dt><dd>{weightBreakdown.checkedKg.toFixed(1)} kg</dd></div><div><dt>手提</dt><dd>{weightBreakdown.carryOnKg.toFixed(1)} kg</dd></div><div><dt>個人物品</dt><dd>{weightBreakdown.personalKg.toFixed(1)} kg</dd></div></dl></div>
        <div className="summary-sticker blue"><PackageCheck /><strong>{packedCount} / {state.packingItems.length}</strong><span>已裝入行李</span></div>
        <div className="summary-sticker sage"><Sparkles /><strong>{state.packingItems.filter((item) => item.decision === "buy-there").length}</strong><span>留到當地再買</span></div>
      </section>
      {unassignedCount ? <div className="unassigned-weight-alert" role="status"><AlertTriangle size={19} /><div><strong>{unassignedCount} 項尚未分配</strong><span>共 {unassignedWeight.toFixed(1)} kg，尚未計入上方已分配總重。</span></div></div> : null}

      <div className="bag-section-heading"><div><p className="eyebrow">Physical pieces</p><h2>實際會帶的每一件行李</h2></div><button className="button secondary" type="button" onClick={() => setShowBagForm((value) => !value)}>{showBagForm ? <X size={16} /> : <Plus size={16} />}{showBagForm ? "取消" : "新增一件行李"}</button></div>
      <AnimatePresence>{showBagForm ? <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={(event) => event.target === event.currentTarget && setShowBagForm(false)}><motion.form className="modal-card bag-form paper-card" onSubmit={addBag} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
        <div className="modal-heading field-full"><div><p className="eyebrow">Physical piece</p><h2>新增一件行李</h2></div><button className="icon-button" type="button" onClick={() => setShowBagForm(false)} aria-label="關閉"><X size={20}/></button></div>
        <label className="field"><span>行李名稱</span><input name="name" required placeholder="例如：托運行李 2" /></label>
        <label className="field"><span>類型</span><select name="kind" defaultValue="checked"><option value="checked">托運</option><option value="carry-on">手提</option><option value="personal">個人物品</option></select></label>
        <label className="field"><span>手動上限 kg（可留 0）</span><input name="limitKg" type="number" min="0" step="0.5" defaultValue="0" /></label>
        <button className="button primary" type="submit"><Plus size={16} />加入</button>
      </motion.form></motion.div> : null}</AnimatePresence>
      <section className="bag-grid">
        {state.bags.map((bag, index) => {
          const weight = bagWeights.get(bag.id) ?? 0;
          const percentage = bag.limitKg > 0 ? Math.min(100, (weight / bag.limitKg) * 100) : 0;
          const overweight = bag.limitKg > 0 && weight > bag.limitKg;
          return (
            <motion.article className={`bag-card paper-card ${overweight ? "overweight" : ""}`} key={bag.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
              <div className="bag-handle" />
              <div className="bag-card-top"><span className="bag-kind">{bag.kind === "checked" ? "CHECKED" : bag.kind === "carry-on" ? "CABIN" : "PERSONAL"}</span><div className="bag-card-actions"><Luggage size={21} /><button className="icon-button danger" type="button" onClick={() => deleteBag(bag)} aria-label={`刪除 ${bag.name}`}><Trash2 size={14} /></button></div></div>
              <h3>{bag.name}</h3>
              <div className="weight-row"><strong>{weight.toFixed(1)}</strong><span>/</span><label><input type="number" min="0" step="0.5" value={bag.limitKg} onChange={(event) => setState((current) => ({ ...current, bags: current.bags.map((item) => item.id === bag.id ? { ...item, limitKg: Math.max(0, Number(event.target.value) || 0), limitSource: Number(event.target.value) > 0 ? "manual" : "unconfirmed" } : item) }))} aria-label={`${bag.name} 重量上限`} /> kg</label></div>
              <div className="weight-bar"><motion.span animate={{ width: `${percentage}%` }} /></div>
              <p>{bag.limitKg <= 0 ? "上限尚未依本人機票確認，可直接輸入" : overweight ? `超重 ${(weight - bag.limitKg).toFixed(1)} kg，請重新分配` : `還可放 ${(bag.limitKg - weight).toFixed(1)} kg`}</p>
            </motion.article>
          );
        })}
      </section>

      <AnimatePresence>
        {showAdd ? (() => { const editingItem = state.packingItems.find((item) => item.id === editingPackingItemId); return (
          <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowAdd(false); setEditingPackingItemId(""); } }}><motion.form className="modal-card add-packing-form paper-card" onSubmit={addItem} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
            <div className="modal-heading field-full"><div><p className="eyebrow">Packing item</p><h2>{editingItem ? "編輯行李物品" : "新增行李物品"}</h2></div><button className="icon-button" type="button" onClick={() => { setShowAdd(false); setEditingPackingItemId(""); }} aria-label="關閉"><X size={20}/></button></div>
            <label className="field"><span>物品名稱</span><input name="name" defaultValue={editingItem?.name} required placeholder="例如：登山鞋" /></label>
            <label className="field"><span>分類</span><input name="category" defaultValue={editingItem?.category} required placeholder="衣物、電子、文件…" /></label>
            <label className="field"><span>建議</span><select name="decision" defaultValue={editingItem?.decision ?? "recommend"}>{Object.entries(decisionMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}</select></label>
            <label className="field"><span>放哪裡</span><select name="bagId" defaultValue={editingItem?.bagId ?? ""}><option value="">尚未分配</option>{state.bags.map((bag) => <option value={bag.id} key={bag.id}>{bag.name}</option>)}</select></label>
            <label className="field"><span>單件重量 kg</span><input name="weightKg" type="number" min="0" step="0.01" defaultValue={editingItem?.weightKg ?? 0.2} /></label>
            <label className="field"><span>數量</span><input name="quantity" type="number" min="1" step="1" defaultValue={editingItem?.quantity ?? 1} /></label>
            <label className="field field-full"><span>備註</span><textarea name="notes" rows={2} defaultValue={editingItem?.notes} placeholder="限制、放置位置或不要忘記的原因" /></label>
            <button className="button primary" type="submit"><Check size={18} />{editingItem ? "儲存變更" : "加入清單"}</button>
          </motion.form></motion.div>
        ); })() : null}
      </AnimatePresence>

      <div className="packing-items-heading"><div><p className="eyebrow">Packing inventory</p><h2>物品清單</h2></div><button className="button primary" onClick={() => { setEditingPackingItemId(""); setShowAdd(true); }}><Plus size={18}/>新增物品</button></div>
      <div className="toolbar paper-card">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋行李物品" /></label>
        <div className="filter-pills">
          <button className={decision === "all" ? "active" : ""} onClick={() => setDecision("all")}>全部</button>
          {Object.entries(decisionMeta).map(([id, meta]) => <button className={decision === id ? "active" : ""} onClick={() => setDecision(id as PackingDecision)} key={id}>{meta.label}</button>)}
        </div>
      </div>

      <section className="packing-list paper-card">
        <div className="packing-table-head"><span>完成</span><span>物品</span><span>建議</span><span>數量／重量</span><span>行李位置</span><span /></div>
        {categories.map((category) => (
          <div className="packing-category" key={category}>
            <h2><span>{category}</span><em>{filteredItems.filter((item) => item.category === category).length} {state.personalization?.headingLanguage === "en" ? "items" : "項"}</em></h2>
            {filteredItems.filter((item) => item.category === category).map((item) => (
              <motion.div layout className={`packing-row ${item.packed ? "packed" : ""}`} key={item.id}>
                <button className={`drawn-check ${item.packed ? "checked" : ""}`} onClick={() => updateItem(item.id, { packed: !item.packed })} aria-label={`${item.packed ? "取消" : "標記"}裝入 ${item.name}`}>{item.packed ? <Check size={17} strokeWidth={3} /> : null}</button>
                <div className="packing-name"><strong>{item.name}</strong><small>{item.warning ? <><AlertTriangle size={13} />{item.warning}</> : item.notes}</small></div>
                <select className={`decision-select ${decisionMeta[item.decision].className}`} value={item.decision} onChange={(event) => updateItem(item.id, { decision: event.target.value as PackingDecision })} aria-label={`${item.name} 攜帶建議`}>{Object.entries(decisionMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}</select>
                <div className="quantity-weight"><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} aria-label={`${item.name} 數量`} /><span>×</span><input type="number" min="0" step="0.01" value={item.weightKg} onChange={(event) => updateItem(item.id, { weightKg: Number(event.target.value) })} aria-label={`${item.name} 單件重量`} /><span>kg</span></div>
                <select className="bag-select" value={item.bagId} onChange={(event) => updateItem(item.id, { bagId: event.target.value })} aria-label={`${item.name} 行李位置`}><option value="">未分配</option>{state.bags.map((bag) => <option value={bag.id} key={bag.id}>{bag.name}</option>)}</select>
                <div className="packing-row-actions"><button className="icon-button" onClick={() => { setEditingPackingItemId(item.id); setShowAdd(true); }} aria-label={`編輯 ${item.name}`} title="編輯"><Pencil size={15} /></button><button className="icon-button danger" onClick={() => deleteItem(item.id)} aria-label={`刪除 ${item.name}`} title="刪除"><Trash2 size={16} /></button></div>
              </motion.div>
            ))}
          </div>
        ))}
      </section>

      <aside className="customs-note">
        <ShieldAlert size={28} />
        <div><p className="eyebrow">Before you zip it up</p><h2>海關與航空限制要最後再確認一次</h2><p>藥品、食品、液體、鋰電池與現金的限制會因目的地、物品和航班而不同。本站提供提醒，但請以目的國海關和實際承運航空公司的最新規則為準。</p></div>
      </aside>
      {baggageIsPast ? <section className="past-baggage-section"><div className="past-baggage-heading"><p className="eyebrow">Archived packing</p><h2>過去行李</h2><p>交換出發日已過，去程機票規則自動收合保留在這裡，需要回查時仍可展開。</p></div>{allowanceDisclosure}</section> : null}
    </div>
  );
}

type ResourceIntakeResult = { ok: boolean; message: string };

function ResourceModal({ resource, resourceIntake, onAddResourceUrl, onDeleteResourceIntake, onClose, onSave }: { resource: ResourceItem | null; resourceIntake: ResourceIntake[]; onAddResourceUrl: (url: string, note: string) => ResourceIntakeResult; onDeleteResourceIntake: (id: string) => void; onClose: () => void; onSave: (resource: ResourceItem) => void }) {
  const [resourceType, setResourceType] = useState<ResourceItem["type"]>(resource?.type ?? "official");
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [intakeMessage, setIntakeMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: resource?.id ?? `resource-${Date.now()}`,
      title: form.get("title")?.toString().trim() ?? "",
      description: form.get("description")?.toString().trim() ?? "",
      details: form.get("details")?.toString().trim() ?? "",
      category: form.get("category")?.toString().trim() ?? "一般",
      type: resourceType,
      url: form.get("url")?.toString().trim() ?? "",
      verifiedAt: form.get("verifiedAt")?.toString() || new Date().toISOString().slice(0, 10),
      region: form.get("region")?.toString().trim() || exchangeProfile.hostCountry,
      origin: resource?.origin ?? "manual",
      privacy: resourceType === "personal" ? "private" : form.get("privacy") as ResourceItem["privacy"],
      sourceLabel: form.get("sourceLabel")?.toString().trim() || "手動新增",
      searchTags: form.get("searchTags")?.toString().split(/[,，#\s]+/).map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 20) ?? [],
    });
  }

  function submitIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = onAddResourceUrl(form.get("url")?.toString().trim() ?? "", form.get("note")?.toString().trim() ?? "");
    setIntakeMessage(result.message);
    if (result.ok) event.currentTarget.reset();
  }

  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <motion.div className="modal-card paper-card resource-modal" role="dialog" aria-modal="true" aria-labelledby="resource-modal-title" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
      <div className="modal-heading"><div><p className="eyebrow">Verified bookmark</p><h2 id="resource-modal-title">{resource ? "編輯資源" : mode === "ai" ? "交給 AI 辨識的網址" : "新增資源"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="關閉"><X size={20} /></button></div>
      {!resource ? <div className="resource-modal-mode-switch" role="tablist" aria-label="資源新增方式">
        <button type="button" role="tab" aria-selected={mode === "manual"} className={mode === "manual" ? "active" : ""} onClick={() => { setMode("manual"); setIntakeMessage(""); }}><Pencil size={15} />手動填寫</button>
        <button type="button" role="tab" aria-selected={mode === "ai"} className={mode === "ai" ? "active" : ""} onClick={() => { setMode("ai"); setIntakeMessage(""); }}><Sparkles size={15} />AI 辨識網址{resourceIntake.filter((item) => item.status === "pending").length ? <b>{resourceIntake.filter((item) => item.status === "pending").length}</b> : null}</button>
      </div> : null}
      {mode === "ai" && !resource ? <div className="resource-modal-intake-panel">
        <div className="resource-modal-intake-note"><Sparkles size={19} /><p>網址會先私人保存在手帳，不會立刻公開或直接加入資源庫；Exchange Concierge 會提出可審核的整理結果。已處理的紀錄會在 2 天後自動清除。</p></div>
        <form onSubmit={submitIntake}><label className="field"><span>網址</span><input name="url" type="url" required placeholder="https://…" /></label><label className="field"><span>希望 AI 注意什麼（選填）</span><input name="note" maxLength={1000} placeholder="例如：確認交換生申請期限" /></label><button className="button secondary" type="submit"><Plus size={16} />加入待辨識</button></form>
        {intakeMessage ? <p className="settings-message" role="status">{intakeMessage}</p> : null}
        {resourceIntake.length ? <div className="resource-intake-list">{resourceIntake.map((item) => <div key={item.id}><span className={item.status}>{item.status === "pending" ? "待辨識" : "已處理"}</span><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>{item.note ? <small>{item.note}</small> : null}{item.status === "processed" && item.processedAt ? <small className="resource-intake-expiry">將於 {new Date(Date.parse(item.processedAt) + 2 * 86_400_000).toLocaleString("zh-TW")} 自動清除</small> : null}<button className="icon-button danger" type="button" onClick={() => onDeleteResourceIntake(item.id)} aria-label={`刪除待辨識網址 ${item.url}`}><Trash2 size={15} /></button></div>)}</div> : <p className="resource-modal-intake-empty">目前沒有待辨識網址。</p>}
      </div> : <form className="form-grid" onSubmit={submit}>
        <label className="field field-full"><span>名稱</span><input name="title" defaultValue={resource?.title} required /></label>
        <label className="field field-full"><span>摘要／最重要的重點</span><textarea name="description" rows={3} defaultValue={resource?.description} placeholder="用幾句話說明這份資料能解決什麼問題" required /></label>
        <label className="field field-full"><span>詳細說明</span><textarea name="details" rows={6} defaultValue={resource?.details} placeholder="適用對象、準備資料、操作步驟、期限與需要重新確認的地方" required /></label>
        <label className="field field-full"><span>搜尋關鍵字（不會顯示在卡片上）</span><input name="searchTags" defaultValue={resource?.searchTags?.join("、")} placeholder="例如：飛機、航班、登機箱、手提、托運" /></label>
        <label className="field"><span>分類</span><input name="category" defaultValue={resource?.category} placeholder="簽證、住宿、學業…" required /></label>
        <label className="field"><span>來源類型</span><select name="type" value={resourceType} onChange={(event) => setResourceType(event.target.value as ResourceItem["type"])}><option value="official">官方</option><option value="school">學校</option><option value="city">城市</option><option value="experience">經驗分享</option><option value="personal">個人上傳資料</option></select></label>
        <label className="field field-full"><span>網址{resourceType === "personal" ? "（可留空，不放私人檔案路徑）" : ""}</span><input name="url" type="url" defaultValue={resource?.url} placeholder="https://…" required={resourceType !== "personal"} /></label>
        <label className="field"><span>適用地區</span><input name="region" defaultValue={resource?.region ?? exchangeProfile.hostCountry} required /></label>
        <label className="field"><span>最後查核日</span><input name="verifiedAt" type="date" defaultValue={resource?.verifiedAt ?? new Date().toISOString().slice(0, 10)} required /></label>
        <label className="field"><span>資料來源標籤</span><input name="sourceLabel" defaultValue={resource?.sourceLabel ?? "手動新增"} required /></label>
        <label className="field"><span>隱私</span><select name="privacy" defaultValue={resource?.privacy ?? "private"} disabled={resourceType === "personal"}><option value="private">私人</option><option value="shareable">可另行選擇分享</option></select></label>
        <div className="modal-actions field-full"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" type="submit"><Check size={17} />儲存資源</button></div>
      </form>}
    </motion.div>
  </motion.div>;
}

function ResourcesPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [editingResource, setEditingResource] = useState<ResourceItem | null | undefined>(undefined);
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const categories = ["全部", ...new Set(state.resources.map((resource) => resourceGroup(resource.category)))];
  const filtered = state.resources.filter((resource) => (category === "全部" || resourceGroup(resource.category) === category) && (!deferredQuery || `${resource.title} ${resource.description} ${resource.details ?? ""} ${resource.region} ${resource.sourceLabel} ${(resource.searchTags ?? []).join(" ")}`.toLowerCase().includes(deferredQuery)));
  const typeLabel = { official: "官方", school: "學校", city: "城市", experience: "經驗分享", personal: "個人資料" };
  const latestResourceDate = state.resources.reduce((latest, resource) => resource.verifiedAt > latest ? resource.verifiedAt : latest, "") || exchangeProfile.research.minimumVerifiedDate;

  useEffect(() => {
    setState((current) => pruneProcessedResourceIntake(current));
  }, [setState]);

  function addResourceUrl(rawUrl: string, note: string): ResourceIntakeResult {
    try {
      const url = new URL(rawUrl);
      const blockedParam = /(?:^|[_-])(?:access[_-]?token|api[_-]?key|apikey|auth|key|password|secret|signature|token)(?:$|[_-])/i;
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some((key) => blockedParam.test(key))) throw new Error("unsafe");
      setState((current) => ({
        ...current,
        resourceIntake: [...(current.resourceIntake ?? []), {
          id: `resource-intake-${Date.now()}`,
          url: url.toString(),
          note,
          status: "pending",
          createdAt: new Date().toISOString(),
        }],
      }));
      return { ok: true, message: "網址已加入私人待辨識清單；下次請 Exchange Concierge 整理即可。" };
    } catch {
      return { ok: false, message: "這個網址無法加入。請使用一般 HTTP(S) 網址，並先移除 token、key、簽章或帳密參數。" };
    }
  }

  function deleteResourceIntake(id: string) {
    setState((current) => ({ ...current, resourceIntake: (current.resourceIntake ?? []).filter((item) => item.id !== id) }));
  }

  function saveResource(resource: ResourceItem) {
    setState((current) => ({
      ...current,
      resources: current.resources.some((item) => item.id === resource.id)
        ? current.resources.map((item) => item.id === resource.id ? resource : item)
        : [...current.resources, resource],
    }));
    setEditingResource(undefined);
  }

  function deleteResource(resource: ResourceItem) {
    if (!window.confirm(`刪除「${resource.title}」？`)) return;
    setState((current) => ({ ...current, resources: current.resources.filter((item) => item.id !== resource.id) }));
  }

  return (
    <div className="page-stack">
      <header className="page-header resources-header"><div className="resources-header-copy"><p className="eyebrow">Verified bookmarks</p><div className="resources-title-line"><h1>重要資源庫</h1><span className="resource-update-mark"><small>UPDATE</small><strong>{latestResourceDate.replaceAll("-", ".")}</strong></span><div className="resources-header-tools"><button className="button primary resource-add-button" aria-label="新增資源" onClick={() => setEditingResource(null)}><Plus size={19} /></button></div></div></div></header>
      <div className="toolbar paper-card resource-toolbar">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋簽證、住宿、醫療或交通" /></label>
        <label className="compact-select resource-category-select">
          <span className="sr-only">資源分類</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronDown size={16} />
        </label>
        <div className="filter-pills scroll-pills" aria-label="資源分類">{categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      </div>
      <section className="resource-grid">
        {!filtered.length ? <div className="paper-card empty-state"><Sparkles size={24} /><div><h2>等待加入你的目的地資源</h2><p>請使用專案內的 AI 整理流程，依交換國家、城市與學校查核官方資料；你也可以先手動新增來源。</p></div></div> : null}
        {filtered.map((resource, index) => (
          <motion.article className={`resource-card paper-card resource-${resource.type}`} key={resource.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3) }}>
            <div className="resource-card-top"><div className="resource-badges"><span className={`source-badge ${resource.type}`}>{typeLabel[resource.type]}</span><span className={`source-badge ${resource.privacy}`}>{resource.privacy === "private" ? "私人" : "可分享"}</span></div><div className="resource-card-actions"><button className="icon-button" onClick={() => setEditingResource(resource)} aria-label={`編輯 ${resource.title}`}><Pencil size={16} /></button><button className="icon-button danger" onClick={() => deleteResource(resource)} aria-label={`刪除 ${resource.title}`}><Trash2 size={16} /></button></div></div>
            <span className="resource-category">{resourceGroup(resource.category)} · {resource.category}</span>
            <h2>{resource.title}</h2>
            <div className="resource-summary"><span>{resource.origin === "ai-research" ? "AI 摘要" : "重點摘要"}</span><p>{resource.description}</p>{resource.details ? <p className="resource-summary-detail">{resource.details}</p> : null}</div>
            {resource.details ? <details className="resource-details"><summary>查看詳細說明</summary><p>{resource.details}</p></details> : null}
            <div className="resource-footer"><span><MapIcon size={14} />{resource.region}</span><span><Check size={14} />查核 {resource.verifiedAt.replaceAll("-", ".")}</span><span>{resource.sourceLabel}</span></div>
            {resource.url ? <a className="resource-open-link" href={resource.url} target="_blank" rel="noreferrer">開啟來源 <ExternalLink size={14} /></a> : null}
          </motion.article>
        ))}
      </section>
      <aside className="experience-rule paper-card"><Info size={24} /><div><h2>規定和經驗，不混在一起</h2><p>官方、學校與城市來源用來確認程序；個人經驗只協助補充生活情境與容易遺漏的準備。價格、期限和法律要求一律回到原始官方頁面重新確認。</p></div></aside>
      <AnimatePresence>{editingResource !== undefined ? <ResourceModal resource={editingResource} resourceIntake={state.resourceIntake ?? []} onAddResourceUrl={addResourceUrl} onDeleteResourceIntake={deleteResourceIntake} onClose={() => setEditingResource(undefined)} onSave={saveResource} /> : null}</AnimatePresence>
    </div>
  );
}

function SettingsPage({ state, setState, cloud, onOpenGuide }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; cloud: ExchangeCloudController; onOpenGuide: () => void }) {
  const backupFileInput = useRef<HTMLInputElement>(null);
  const avatarFileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [appearanceMessage, setAppearanceMessage] = useState("");
  const [sidebarNoteDraft, setSidebarNoteDraft] = useState(state.personalization?.sidebarNote ?? "慢慢準備，也正在靠近。");
  const [sidebarNoteIsComposing, setSidebarNoteIsComposing] = useState(false);
  const sidebarNoteComposing = useRef(false);

  useEffect(() => {
    if (!sidebarNoteComposing.current) setSidebarNoteDraft(state.personalization?.sidebarNote ?? "慢慢準備，也正在靠近。");
  }, [state.personalization?.sidebarNote]);

  function updateBudgetItem(id: string, patch: Partial<BudgetItem>) {
    setState((current) => ({
      ...current,
      budget: current.budget.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  function saveSidebarNote(value: string) {
    const sidebarNote = limitSidebarNote(value);
    setSidebarNoteDraft(sidebarNote);
    setState((current) => ({
      ...current,
      personalization: {
        sidebarNote,
        avatarDataUrl: current.personalization?.avatarDataUrl ?? "",
        headingLanguage: current.personalization?.headingLanguage ?? "zh-TW",
      },
    }));
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateImport(parsed)) throw new Error("invalid");
      setState(normalizeImportedState(parsed));
      setMessage("備份已成功還原。所有資料仍只保存在這台裝置。 ");
    } catch {
      setMessage("無法讀取這份備份，請確認它是由本網站匯出的 JSON 檔案。");
    } finally {
      event.target.value = "";
    }
  }

  async function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const avatarDataUrl = await createAvatarDataUrl(file);
      setState((current) => ({
        ...current,
        personalization: {
          sidebarNote: current.personalization?.sidebarNote ?? "慢慢準備，也正在靠近。",
          avatarDataUrl,
          headingLanguage: current.personalization?.headingLanguage ?? "zh-TW",
        },
      }));
      setAppearanceMessage("大頭貼已更新，並會跟著私人手帳備份與同步。");
    } catch {
      setAppearanceMessage("無法使用這張圖片。請選擇 8MB 以下的 JPG、PNG 或 WebP。");
    } finally {
      event.target.value = "";
    }
  }

  function restoreDefault() {
    if (!window.confirm("這會清除目前變更並恢復通用交換模板，確定繼續嗎？")) return;
    setState(resetState());
    setMessage("已恢復通用交換模板。");
  }

  return (
    <div className="page-stack settings-page">
      <header className="page-header settings-header"><div><p className="eyebrow">Keep it yours</p><h1>設定與備份</h1><p>目前資料只在這台裝置；定期匯出備份，就能避免清除瀏覽器資料時遺失。</p></div></header>
      <section className="paper-card settings-card home-guide-settings" id="home-guide"><div className="settings-card-title"><Bot size={23} /><div><p className="eyebrow">AI 使用指南</p><h2>重新打開啟用教學</h2></div></div><p>需要重裝 Skills、重新下載 Codex 連結檔，或想確認第一次整理流程時，可隨時回到指南；不會清除目前資料。</p><button className="button secondary" onClick={onOpenGuide}>打開使用指南 <ArrowRight size={17} /></button></section>
      <section className="paper-card settings-card personalization-card">
        <div className="settings-card-title"><Pencil size={23} /><div><p className="eyebrow">Make it yours</p><h2>手帳外觀</h2></div></div>
        <div className="personalization-layout">
          <div className="avatar-editor">
            <span className="avatar avatar-preview"><AvatarContent state={state} fallback={state.journey.ownerName.slice(0, 1).toUpperCase()} /></span>
            <div><strong>個人大頭貼</strong><p>會顯示在右上角與帳戶資料；圖片只屬於私人手帳。</p><div className="avatar-actions"><button className="button secondary" type="button" onClick={() => avatarFileInput.current?.click()}><Upload size={17} />選擇照片</button>{state.personalization?.avatarDataUrl ? <button className="button text-button" type="button" onClick={() => setState((current) => ({ ...current, personalization: { sidebarNote: current.personalization?.sidebarNote ?? "慢慢準備，也正在靠近。", avatarDataUrl: "", headingLanguage: current.personalization?.headingLanguage ?? "zh-TW" } }))}>移除照片</button> : null}</div></div>
            <input className="sr-only" ref={avatarFileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={updateAvatar} />
          </div>
          <label className="field sidebar-note-editor"><span>側邊手帳短句</span><textarea rows={3} value={sidebarNoteDraft} onCompositionStart={() => { sidebarNoteComposing.current = true; setSidebarNoteIsComposing(true); }} onCompositionEnd={(event) => { sidebarNoteComposing.current = false; setSidebarNoteIsComposing(false); saveSidebarNote(event.currentTarget.value); }} onChange={(event) => { const value = event.target.value; if (sidebarNoteComposing.current) setSidebarNoteDraft(value); else saveSidebarNote(value); }} placeholder="寫一句提醒自己的話" /><small>最多 27 個字；注音選字完成後才會套用限制，不會中斷組字。</small><span className={`sidebar-note-count ${notebookCharacterCount(sidebarNoteDraft) > SIDEBAR_NOTE_LIMIT ? "over" : ""}`} aria-live="polite">{sidebarNoteIsComposing && notebookCharacterCount(sidebarNoteDraft) > SIDEBAR_NOTE_LIMIT ? `選字完成後會保留前 ${SIDEBAR_NOTE_LIMIT} 個字 · ` : ""}{notebookCharacterCount(sidebarNoteDraft)}/{SIDEBAR_NOTE_LIMIT}</span></label>
          <label className="field heading-language-editor"><span>手帳標題語言</span><select value={state.personalization?.headingLanguage ?? "zh-TW"} onChange={(event) => setState((current) => ({ ...current, personalization: { sidebarNote: current.personalization?.sidebarNote ?? "慢慢準備，也正在靠近。", avatarDataUrl: current.personalization?.avatarDataUrl ?? "", headingLanguage: event.target.value === "en" ? "en" : "zh-TW" } }))}><option value="zh-TW">中文（預設）</option><option value="en">English</option></select><small>一次只顯示一種成對標題；表單與規定說明仍保留中文，Chapter、Day、票號等結構標記不受影響。</small></label>
        </div>
        {appearanceMessage ? <p className="settings-message" role="status">{appearanceMessage}</p> : null}
      </section>
      <section className="paper-card settings-card account-card">
        <div className="settings-card-title"><UserRound size={23} /><div><p className="eyebrow">Free account & sync</p><h2>帳戶與手機同步</h2></div></div>
        {!cloud.configured ? <div className="cloud-offline-state"><strong>免費雲端尚未建立</strong><p>現在仍是完整的本機版。所有功能測試完成後才會一次建立並上版，不會在開發中反覆消耗部署額度。</p></div> : cloud.permanentAccount ? <>
          <div className="account-summary"><span className="avatar"><AvatarContent state={state} fallback={cloud.session?.user.email?.slice(0, 1).toUpperCase() || "A"} /></span><div><strong>{String(cloud.session?.user.user_metadata.account_id ?? cloud.session?.user.email ?? "已登入帳戶")}</strong><small>{cloud.privateSyncEnabled ? "私人手帳同步中" : "尚未同步私人手帳"}</small></div></div>
          <div className="backup-actions">{cloud.privateSyncEnabled ? <button className="button secondary" onClick={cloud.disablePrivateSync}>停止同步</button> : <><button className="button primary" disabled={cloud.busy} onClick={() => void cloud.enablePrivateSync("upload-local")}>用這台裝置建立雲端副本</button><button className="button secondary" disabled={cloud.busy} onClick={() => void cloud.enablePrivateSync("use-cloud")}>載入帳戶既有手帳</button></>}<button className="button text-button" onClick={() => void cloud.signOut()}>登出</button></div>
        </> : <p>請先從登入頁建立帳號或登入，才會載入私人手帳。</p>}
        <p className="settings-message" role="status">{cloud.notice}</p>
      </section>
      <section className="settings-grid">
        <div className="paper-card settings-card">
          <div className="settings-card-title"><MapIcon size={23} /><div><p className="eyebrow">Your journey</p><h2>交換基本資料</h2></div></div>
          <div className="form-grid">
            <label className="field"><span>顯示名稱</span><input value={state.journey.ownerName} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, ownerName: event.target.value } }))} /></label>
            <label className="field"><span>旅程名稱</span><input value={state.journey.title} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, title: event.target.value } }))} /></label>
            <label className="field"><span>出發城市</span><input value={state.journey.homeCity} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, homeCity: event.target.value } }))} /></label>
            <label className="field"><span>交換城市</span><input value={state.journey.hostCity} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, hostCity: event.target.value } }))} /></label>
            <label className="field"><span>交換學校</span><input value={state.journey.hostSchool} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, hostSchool: event.target.value } }))} /></label>
            <label className="field"><span>交換計畫／系所</span><input value={state.journey.program} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, program: event.target.value } }))} /></label>
            <label className="field"><span>交換國家</span><input value={state.journey.destinations.join("、")} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, destinations: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) } }))} /></label>
            <label className="field"><span>出發／入住日</span><input type="date" value={state.journey.startDate} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, startDate: event.target.value } }))} /></label>
            <label className="field"><span>交換結束日</span><input type="date" value={state.journey.endDate} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, endDate: event.target.value } }))} /></label>
            <label className="field"><span>Orientation 日期</span><input type="date" value={state.journey.orientationDate} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, orientationDate: event.target.value } }))} /></label>
            <label className="field field-full"><span>緊急聯絡備註（請勿填證件或敏感資訊）</span><textarea rows={3} value={state.emergencyContact} onChange={(event) => setState((current) => ({ ...current, emergencyContact: event.target.value }))} placeholder="例如：家人電話另存於手機緊急聯絡人；保險客服已加入通訊錄。" /></label>
          </div>
        </div>

        <div className="paper-card settings-card backup-card" id="backup-settings">
          <div className="settings-card-title"><FileText size={23} /><div><p className="eyebrow">Local & private</p><h2>資料備份</h2></div></div>
          <p>備份包含本站的任務、行李、預算與設定，不包含父資料夾中的任何私人文件。</p>
          <div className="backup-actions">
            <button className="button primary" onClick={() => downloadJson(state)}><Download size={18} />下載 JSON 備份</button>
            <button className="button secondary" onClick={() => backupFileInput.current?.click()}><Upload size={18} />還原備份</button>
            <input className="sr-only" ref={backupFileInput} type="file" accept="application/json" onChange={importBackup} />
            <button className="button text-danger" onClick={restoreDefault}><RotateCcw size={17} />恢復預設資料</button>
          </div>
          {message ? <div className="settings-message" role="status">{message}</div> : null}
        </div>
      </section>

      <section className="paper-card settings-card budget-card" id="budget-settings">
        <div className="settings-card-title"><PiggyBank size={23} /><div><p className="eyebrow">Money map</p><h2>基礎預算</h2></div></div>
        <div className="budget-table">
          {state.budget.map((item) => (
            <div className="budget-row" key={item.id}>
              <div className="budget-row-main">
                <button className={`drawn-check ${item.paid ? "checked" : ""}`} onClick={() => updateBudgetItem(item.id, { paid: !item.paid })} aria-label={`${item.paid ? "取消" : "標記"}支付 ${item.name}`}>{item.paid ? <Check size={16} /> : null}</button>
                <div className="budget-name"><strong>{item.name}</strong><small className={`budget-basis ${item.basis}`}>{budgetBasisLabel[item.basis]}{item.verifiedAt ? ` · ${item.verifiedAt}` : ""}</small></div>
                <span>{item.cadence === "monthly" ? "每月" : "一次性"}</span>
                <label className="budget-amount"><select value={item.currency} onChange={(event) => updateBudgetItem(item.id, { currency: event.target.value })} aria-label={`${item.name} 幣別`}>{Array.from(new Set([...exchangeCurrencies, item.currency])).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select><input type="number" min="0" step="0.5" value={item.amount} onChange={(event) => updateBudgetItem(item.id, { amount: Number(event.target.value), basis: item.basis === "unset" ? "estimate" : item.basis, sourceLabel: item.sourceLabel || "網站手動輸入", verifiedAt: item.verifiedAt || new Date().toISOString().slice(0, 10) })} aria-label={`${item.name} 金額`} /></label>
              </div>
              <details className="budget-details">
                <summary>依據與備註</summary>
                <div className="budget-detail-grid">
                  <label className="field"><span>金額狀態</span><select value={item.basis} onChange={(event) => updateBudgetItem(item.id, { basis: event.target.value as BudgetItem["basis"] })}><option value="unset">待設定</option><option value="estimate">個人估算</option><option value="confirmed">已有依據</option></select></label>
                  <label className="field"><span>來源標籤</span><input value={item.sourceLabel} onChange={(event) => updateBudgetItem(item.id, { sourceLabel: event.target.value })} placeholder="例如：住宿合約／個人預算" /></label>
                  <label className="field"><span>查核日期</span><input type="date" value={item.verifiedAt} onChange={(event) => updateBudgetItem(item.id, { verifiedAt: event.target.value })} /></label>
                  <label className="field field-full"><span>備註</span><textarea rows={2} value={item.notes} onChange={(event) => updateBudgetItem(item.id, { notes: event.target.value })} placeholder="記錄估算方式、是否含押金，或需要重新確認的地方。" /></label>
                </div>
              </details>
            </div>
          ))}
        </div>
      </section>

      <section className="privacy-card">
        <ShieldAlert size={28} />
        <div><p className="eyebrow">Privacy boundary</p><h2>這個網站刻意不保存什麼？</h2><p>護照、簽證、財力證明、房號、銀行資料、租客入口憑證、醫療文件與個人照片。本站只記錄「是否完成」和你自己輸入的非敏感備註。</p></div>
      </section>

      <section className="v2-note paper-card">
        <span className="tape" /><div><p className="eyebrow structural-eyebrow">V2 · AI first</p><h2>Codex 自動整理已接上</h2><p>AI 會先把信件、授權檔案與最新來源整理成可審核提案；網站仍保留完整手動編輯。旅行可另外分享，私人交換內容永遠不會跟著出去。</p></div><span className="coming-soon">FREE FIRST</span>
      </section>
    </div>
  );
}

export default function ExchangeCompanion({ initialAuthView = "welcome" }: { initialAuthView?: "welcome" | "login" }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [state, setState] = useState<AppState>(() => loadState(!cloudIsConfigured()));
  const [section, setSection] = useState<NavSection>(initialSection);
  const [journeyView, setJourneyView] = useState<JourneyView>(initialJourneyView);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [aiNotificationOpen, setAiNotificationOpen] = useState(false);
  const [aiInboxOpenRequest, setAiInboxOpenRequest] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("inbox") === "open" ? 1 : 0);
  const [focusTaskId, setFocusTaskId] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("task") ?? "" : "");
  const [focusTripId, setFocusTripId] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("trip") ?? "" : "");
  const [homeGuideOpen, setHomeGuideOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("guide") === "1");

  useEffect(() => {
    const timer = window.setTimeout(() => setIsHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const aiNotificationRef = useRef<HTMLDivElement>(null);
  const aiNotificationButtonRef = useRef<HTMLButtonElement>(null);
  const homeRenderMarked = useRef(false);
  const cloud = useExchangeCloud(state, setState);
  const localAppPreview = localAppPreviewEnabled();

  useEffect(() => {
    if (homeRenderMarked.current || !isHydrated || section !== "home" || !state.setupCompleted) return;
    if (cloud.configured && (!cloud.authReady || !cloud.permanentAccount || !cloud.accountDataReady)) return;
    homeRenderMarked.current = true;
    markExchangePerformance("home-render");
  }, [cloud.accountDataReady, cloud.authReady, cloud.configured, cloud.permanentAccount, isHydrated, section, state.setupCompleted]);

  useEffect(() => {
    const alignExpandedDetails = (event: Event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open || !event.isTrusted) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => {
        details.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        window.scrollBy({ top: -88, behavior: reduceMotion ? "auto" : "smooth" });
      }, reduceMotion ? 0 : 240);
    };
    document.addEventListener("toggle", alignExpandedDetails, true);
    return () => document.removeEventListener("toggle", alignExpandedDetails, true);
  }, []);

  const navigateToSection: NavigateToSection = (nextSection, nextJourneyView, options = {}) => {
    if (nextSection === "journey") setJourneyView(nextJourneyView ?? "progress");
    setFocusTaskId(nextSection === "journey" ? options.task ?? "" : "");
    setFocusTripId(nextSection === "travel" ? options.trip ?? "" : "");
    setHomeGuideOpen(nextSection === "home" && options.guide === "1");
    if (nextSection === "ai" && options.inbox === "open") setAiInboxOpenRequest((request) => request + 1);
    setSection(nextSection);
    setMobileMenu(false);
    if (options.hash) {
      const url = new URL(window.location.href);
      url.hash = options.hash;
      window.history.replaceState({}, "", url);
    } else if (window.location.hash) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState({}, "", url);
    }
  };

  const navigateHomeTarget = (target: HomeAgendaTarget) => {
    navigateToSection(target.section, target.section === "journey" ? "progress" : undefined, target);
  };

  useEffect(() => {
    if (isHydrated && (!cloud.configured || (cloud.permanentAccount && cloud.accountDataReady))) saveState(state);
  }, [cloud.accountDataReady, cloud.configured, cloud.permanentAccount, state, isHydrated]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const timer = window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 320);
    return () => window.clearTimeout(timer);
  }, [section]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (section === "home" && homeGuideOpen) url.searchParams.set("section", "home");
    else if (section === "home") url.searchParams.delete("section");
    else url.searchParams.set("section", section);
    if (section === "journey" && journeyView === "packing") url.searchParams.set("view", "packing");
    else url.searchParams.delete("view");
    if (section === "journey" && focusTaskId) url.searchParams.set("task", focusTaskId);
    else url.searchParams.delete("task");
    if (section === "travel" && focusTripId) url.searchParams.set("trip", focusTripId);
    else url.searchParams.delete("trip");
    if (section === "ai" && aiInboxOpenRequest > 0) url.searchParams.set("inbox", "open");
    else url.searchParams.delete("inbox");
    if (section === "home" && homeGuideOpen) url.searchParams.set("guide", "1");
    else url.searchParams.delete("guide");
    window.history.replaceState({}, "", url);
  }, [aiInboxOpenRequest, focusTaskId, focusTripId, homeGuideOpen, journeyView, section]);

  useEffect(() => {
    if (!accountMenuOpen && !aiNotificationOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
      if (!aiNotificationRef.current?.contains(event.target as Node)) setAiNotificationOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (aiNotificationOpen) {
        setAiNotificationOpen(false);
        aiNotificationButtonRef.current?.focus();
      }
      setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen, aiNotificationOpen]);

  if (!isHydrated) {
    return (
      <div className="boot-shell" role="status">
        <span className="brand-stamp">旅</span>
        <strong>交換手帳</strong>
        <p>正在打開「我的交換」…</p>
      </div>
    );
  }

  if (!localAppPreview && cloud.configured && (!cloud.authReady || cloud.shareStatus === "loading")) {
    return <div className="boot-shell" role="status"><span className="brand-stamp">旅</span><strong>交換手帳</strong><p>{cloud.shareStatus === "loading" ? "正在確認旅行分享權限…" : "正在確認登入狀態…"}</p></div>;
  }

  const activeSharedPlan = (state.travelPlans ?? []).find((plan) => plan.id === cloud.sharedPlanId);
  if (cloud.configured && cloud.shareStatus === "active" && activeSharedPlan?.cloud?.permission !== "owner") {
    return <GuestTravelShell state={state} setState={setState} cloud={cloud} />;
  }

  if (localOnboardingPreviewEnabled()) {
    return <OnboardingWizard state={{ ...state, setupCompleted: false }} setState={setState} />;
  }

  if (!localAppPreview && (!cloud.configured || !cloud.permanentAccount || !cloud.accountDataReady)) {
    return <AuthGate cloud={cloud} initialView={initialAuthView} />;
  }

  if (!state.setupCompleted) {
    return <OnboardingWizard state={state} setState={setState} />;
  }

  const currentNav = navItems.find((item) => item.id === section)!;
  const mobileNavItems = navItems.filter((item) => item.id !== "settings");
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayLabel = formatDate(todayIso);
  const pendingProposals = (state.aiInbox?.proposals ?? []).filter((proposal) => proposal.status === "pending");
  const pendingProposalCount = pendingProposals.length;
  const latestPendingProposals = [...pendingProposals]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 3);

  return (
    <div className="app-shell" data-heading-language={state.personalization?.headingLanguage ?? "zh-TW"}>
      <a className="skip-link" href="#main-content">跳到主要內容</a>
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <button className="brand-mark" onClick={() => navigateToSection("home")}>
          <span className="brand-stamp">旅</span>
          <div><strong>交換手帳</strong><small>Exchange Companion</small></div>
        </button>
        <nav aria-label="主要導覽">
          {navItems.map((item) => {
            return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => navigateToSection(item.id)}><Image className="nav-doodle-icon" src={item.doodleIcon} alt="" width={38} height={38} /><span>{item.label}</span>{item.id === "ai" && pendingProposalCount ? <span className="nav-notification-badge" aria-label={`${pendingProposalCount} 個待確認提案`}>{pendingProposalCount}</span> : null}</button>;
          })}
        </nav>
        <div className="sidebar-note">
          <span className="tape" />
          <p className="hand-note">“{state.personalization?.sidebarNote || "慢慢準備，也正在靠近。"}”</p>
          <small>{state.journey.homeCity} → {state.journey.hostCity}</small>
        </div>
        <div className="sidebar-footer"><span>{cloud.privateSyncEnabled ? "FREE CLOUD · PRIVATE" : "LOCAL · PRIVATE"}</span><span>V2.1</span></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="開啟導覽"><Menu /></button>
          <div className="mobile-brand"><span className="brand-stamp">旅</span><strong>{exchangeProfile.appName}</strong></div>
          <div className="topbar-trail"><span>MY EXCHANGE</span><ArrowRight size={14} /><strong>{currentNav.label}</strong></div>
          <div className="topbar-right">
            <span className="today-label">{todayLabel}</span>
            {pendingProposalCount ? <div className="ai-notification-wrap" ref={aiNotificationRef}>
              <button ref={aiNotificationButtonRef} className="ai-notification-ticket" onClick={() => { setAiNotificationOpen((open) => !open); setAccountMenuOpen(false); }} aria-label={`AI 更新，${pendingProposalCount} 個待確認提案`} aria-expanded={aiNotificationOpen} aria-haspopup="dialog" aria-controls="ai-update-popover"><Bot size={17} /><span>AI 更新</span><strong>{pendingProposalCount}</strong></button>
              {aiNotificationOpen ? <div id="ai-update-popover" className="ai-update-popover paper-card" role="dialog" aria-label="待確認的 AI 更新">
                <div className="ai-update-heading"><div><span>NEW NOTES</span><h2>{pendingProposalCount} 筆更新待確認</h2></div><button className="icon-button" type="button" onClick={() => { setAiNotificationOpen(false); aiNotificationButtonRef.current?.focus(); }} aria-label="關閉 AI 更新"><X size={17} /></button></div>
                <div className="ai-update-list">{latestPendingProposals.map((proposal) => <article key={proposal.id}><div><span>{proposalEntityLabel[proposal.entity]}</span><em>{proposalConfidenceLabel[proposal.confidence]}</em></div><strong>{proposal.title}</strong><p>{proposal.summary}</p></article>)}</div>
                <button className="button primary ai-update-all" type="button" onClick={() => { setAiNotificationOpen(false); setAiInboxOpenRequest((request) => request + 1); navigateToSection("ai"); window.setTimeout(() => document.getElementById("ai-proposal-inbox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}>查看全部更新 <ArrowRight size={16} /></button>
              </div> : null}
            </div> : null}
            <div className="account-menu-wrap" ref={accountMenuRef}><button className="avatar avatar-button" onClick={() => { setAccountMenuOpen((open) => !open); setAiNotificationOpen(false); }} aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-controls="account-popover" aria-label="開啟帳戶選單"><AvatarContent state={state} fallback={cloud.session?.user.email?.slice(0, 1).toUpperCase() || state.journey.ownerName.slice(0, 1).toUpperCase() || "A"} /></button>{accountMenuOpen ? <div id="account-popover" className="account-popover paper-card" role="menu"><button role="menuitem" onClick={() => { navigateToSection("settings"); setAccountMenuOpen(false); }}><UserRound size={16}/>個人設定</button><button role="menuitem" onClick={() => { navigateToSection("settings"); setAccountMenuOpen(false); window.setTimeout(() => document.getElementById("backup-settings")?.scrollIntoView({behavior:"smooth"}), 80); }}><Download size={16}/>備份與還原</button><button role="menuitem" onClick={() => { navigateToSection("settings"); setAccountMenuOpen(false); window.setTimeout(() => document.getElementById("budget-settings")?.scrollIntoView({behavior:"smooth"}), 80); }}><WalletCards size={16}/>預算</button><button className="danger" role="menuitem" onClick={() => void cloud.signOut()}><LogOut size={16}/>登出</button></div> : null}</div>
          </div>
        </header>

        <main id="main-content">
          <AnimatePresence initial={false} mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              {section === "home" ? <Dashboard state={state} setState={setState} cloud={cloud} navigate={navigateToSection} navigateTarget={navigateHomeTarget} todayIso={todayIso} forceGuide={homeGuideOpen} onCloseGuide={() => setHomeGuideOpen(false)} /> : null}
              {section === "journey" ? <JourneyPage state={state} setState={setState} view={journeyView} onViewChange={setJourneyView} focusTaskId={focusTaskId} /> : null}
              {section === "travel" ? <Suspense fallback={<SectionFallback />}><TravelPlanner state={state} setState={setState} cloud={cloud} focusTripId={focusTripId} /></Suspense> : null}
              {section === "resources" ? <ResourcesPage state={state} setState={setState} /> : null}
              {section === "ai" ? <Suspense fallback={<SectionFallback />}><AiConcierge key={aiInboxOpenRequest} state={state} setState={setState} cloud={cloud} openInboxRequest={aiInboxOpenRequest} /></Suspense> : null}
              {section === "settings" ? <SettingsPage state={state} setState={setState} cloud={cloud} onOpenGuide={() => navigateToSection("home", undefined, { guide: "1" })} /> : null}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <QuickNavigation key={section} section={section} plans={state.travelPlans ?? []} />

      <nav className="mobile-bottom-nav" aria-label="手機導覽">
        {mobileNavItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { navigateToSection(item.id); setAccountMenuOpen(false); setAiNotificationOpen(false); }}><span className="mobile-nav-icon-wrap"><Image className="nav-doodle-icon" src={item.doodleIcon} alt="" width={34} height={34} />{item.id === "ai" && pendingProposalCount ? <strong className="mobile-nav-badge" aria-label={`${pendingProposalCount} 個待確認提案`}>{pendingProposalCount}</strong> : null}</span><span>{item.shortLabel}</span></button>)}
      </nav>
      {mobileMenu ? <button className="mobile-overlay" onClick={() => setMobileMenu(false)} aria-label="關閉導覽" /> : null}
    </div>
  );
}
