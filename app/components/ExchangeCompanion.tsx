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
  HeartPulse,
  Info,
  Luggage,
  Map as MapIcon,
  Menu,
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
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
  useSyncExternalStore,
} from "react";
import { downloadIcs, googleCalendarUrl } from "../lib/calendar";
import { phaseMeta } from "../lib/default-data";
import { loadState, normalizeImportedState, resetState, saveState, validateImport } from "../lib/storage";
import { useExchangeCloud, type ExchangeCloudController } from "../lib/useExchangeCloud";
import type {
  AppState,
  JourneyPhase,
  JourneyTask,
  NavSection,
  PackingDecision,
  PackingItem,
  TaskChecklistItem,
  TaskRecordEntry,
  TaskStatus,
  TaskTemplateKind,
} from "../lib/types";

const AiConcierge = lazy(() => import("./AiConcierge"));
const TravelPlanner = lazy(() => import("./TravelPlanner"));

function SectionFallback() {
  return <div className="section-fallback" role="status"><span className="brand-stamp">DE</span><strong>正在打開手帳頁面…</strong></div>;
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
  "buy-there": { label: "德國買", className: "tag-sage" },
  skip: { label: "不建議帶", className: "tag-gray" },
};

const navItems: Array<{ id: NavSection; label: string; shortLabel: string; doodleIcon: string }> = [
  { id: "home", label: "我的交換", shortLabel: "首頁", doodleIcon: "/images/doodle-icons/home-safe.png" },
  { id: "journey", label: "交換旅程", shortLabel: "旅程", doodleIcon: "/images/doodle-icons/journey-safe.png" },
  { id: "travel", label: "旅行規劃", shortLabel: "旅行", doodleIcon: "/images/doodle-icons/return-safe.png" },
  { id: "packing", label: "行李工作台", shortLabel: "行李", doodleIcon: "/images/doodle-icons/packing-complete-balanced.png" },
  { id: "resources", label: "重要資源", shortLabel: "資源", doodleIcon: "/images/doodle-icons/resources-safe.png" },
  { id: "ai", label: "AI 幫我整理", shortLabel: "AI", doodleIcon: "/images/doodle-icons/documents-safe.png" },
  { id: "settings", label: "設定與備份", shortLabel: "設定", doodleIcon: "/images/doodle-icons/passport-safe.png" },
];
const validSections = new Set<NavSection>(navItems.map((item) => item.id));

function initialSection(): NavSection {
  if (typeof window === "undefined") return "home";
  const params = new URLSearchParams(window.location.search);
  if (params.has("share")) return "travel";
  const requested = params.get("section") as NavSection | null;
  return requested && validSections.has(requested) ? requested : "home";
}

const templateMeta: Record<TaskTemplateKind, { label: string; icon: string }> = {
  general: { label: "一般任務", icon: "/images/doodle-icons/documents-safe.png" },
  flight: { label: "班機", icon: "/images/doodle-icons/return-safe.png" },
  course: { label: "選課／學業", icon: "/images/doodle-icons/resources-safe.png" },
  visa: { label: "簽證／居留", icon: "/images/doodle-icons/passport-safe.png" },
  housing: { label: "住宿／入住", icon: "/images/doodle-icons/arrival-safe.png" },
  payment: { label: "付款／費用", icon: "/images/doodle-icons/documents-safe.png" },
  "school-admin": { label: "學校／行政", icon: "/images/doodle-icons/daily-life-safe.png" },
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

function subscribeHydration() {
  return () => undefined;
}

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
      currency: (form.get("currency") as "EUR" | "TWD") || undefined,
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
            <select name="timeZone" defaultValue={task.timeZone ?? "Europe/Berlin"}>
              <option value="Europe/Berlin">德國｜Europe/Berlin</option>
              <option value="Asia/Taipei">台灣｜Asia/Taipei</option>
            </select>
          </label>
          <label className="field">
            <span>地點</span>
            <input name="location" defaultValue={task.location} placeholder="例如：台北 101 33F" />
          </label>
          <label className="field field-full">
            <span>前置任務</span>
            <select name="predecessor" defaultValue={task.predecessorIds[0] ?? ""}>
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
            <Image src="/images/doodle-icons/documents-safe.png" alt="" width={45} height={45} />
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
              <select name="currency" defaultValue={task.currency ?? "EUR"} aria-label="幣別">
                <option value="EUR">EUR</option>
                <option value="TWD">TWD</option>
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
            <Image src="/images/doodle-icons/passport-safe.png" alt="" width={45} height={45} />
            <div><p className="eyebrow">Reference</p><h3>查核來源</h3></div>
          </div>
          <label className="field">
            <span>來源名稱</span>
            <input name="sourceLabel" defaultValue={task.sourceLabel} placeholder="例如：HdM" />
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
  const blockedBy = task.predecessorIds
    .map((id) => allTasks.find((item) => item.id === id))
    .filter((item): item is JourneyTask => Boolean(item && item.status !== "done" && item.status !== "not-applicable"));
  const overdue = Boolean(task.dueDate && dayDifference(task.dueDate) < 0 && task.status !== "done");
  const checklist = task.checklist ?? [];
  const records = task.records ?? [];
  const completedChecklist = checklist.filter((item) => item.done).length;
  const hasPersonalDetails = Boolean(
    task.scheduledAt || task.location || task.contactName || task.referenceNumber || task.cost || checklist.length || records.length || task.result,
  );

  return (
    <motion.article
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
          <Image className="task-doodle-icon" src={templateMeta[task.templateKind ?? "general"].icon} alt="" width={39} height={39} />
          <h3>{task.title}</h3>
          {task.priority === "high" ? <span className="priority-dot" title="高優先度" /> : null}
        </div>
        <p>{task.description}</p>
        {blockedBy.length > 0 ? (
          <div className="blocked-note"><ShieldAlert size={15} />先完成：{blockedBy.map((item) => item.title).join("、")}</div>
        ) : null}
        {task.notes ? <div className="hand-note">↳ {task.notes}</div> : null}
        <div className="task-meta">
          <label className={`status-select ${statusMeta[task.status].className}`}>
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
            <button type="button" className="task-record-toggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
              <span>{expanded ? "收起個人紀錄" : "展開個人紀錄"}</span><ChevronDown size={15} className={expanded ? "rotated" : ""} />
            </button>
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div className="task-record-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <div className="record-facts">
                    {task.scheduledAt ? <div><span>實際時間</span><strong>{task.scheduledAt.replace("T", " · ")}</strong><small>{task.timeZone === "Asia/Taipei" ? "台灣時間" : "德國時間"}</small></div> : null}
                    {task.location ? <div><span>地點</span><strong>{task.location}</strong></div> : null}
                    {task.contactName ? <div><span>聯絡人／單位</span><strong>{task.contactName}</strong>{task.contactInfo ? <small>{task.contactInfo}</small> : null}</div> : null}
                    {task.referenceNumber ? <div><span>參考編號</span><strong>{task.referenceNumber}</strong></div> : null}
                    {typeof task.cost === "number" ? <div><span>費用</span><strong>{task.currency ?? "EUR"} {task.cost.toLocaleString()}</strong></div> : null}
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

function Dashboard({ state, setSection, todayIso }: { state: AppState; setSection: (section: NavSection) => void; todayIso: string }) {
  const applicable = state.tasks.filter((task) => task.status !== "not-applicable");
  const done = applicable.filter((task) => task.status === "done").length;
  const progress = Math.round((done / applicable.length) * 100);
  const countdown = todayIso ? dayDifference(state.journey.startDate, todayIso) : null;
  const nextTasks = [...applicable]
    .filter((task) => task.status !== "done")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 3);
  const overdue = todayIso ? applicable.filter((task) => task.dueDate && dayDifference(task.dueDate, todayIso) < 0 && task.status !== "done").length : 0;
  const waiting = applicable.filter((task) => task.status === "waiting").length;
  const monthly = state.budget.filter((item) => item.cadence === "monthly").reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="page-stack">
      <motion.section className="hero-section" initial="hidden" animate="show">
        <div className="hero-copy">
          <motion.div className="airmail-label" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            EXCHANGE JOURNEY
          </motion.div>
          <motion.p className="eyebrow" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.08 } } }}>
            {state.journey.homeCity} <ArrowRight size={14} /> {state.journey.hostCity}
          </motion.p>
          <motion.h1 variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { delay: 0.14 } } }}>
            嗨 {state.journey.ownerName || "交換生"}，<br />交換準備得怎麼樣？
          </motion.h1>
          <motion.p className="hero-lead" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.22 } } }}>
            把複雜的行政手續、行李和生活準備，整理成今天真的做得完的下一步。
          </motion.p>
          <motion.div className="hero-actions" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.3 } } }}>
            <button className="button primary tag-button" onClick={() => setSection("journey")}>查看下一步 <ArrowRight size={18} /></button>
            <button className="button text-button" onClick={() => setSection("packing")}><Luggage size={18} />整理行李</button>
          </motion.div>
        </div>
        <motion.div
          className="hero-art"
          initial={{ opacity: 0, x: 20, rotate: 0.8 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <Image src="/images/taipei-stuttgart-hero.png" alt="台灣到德國的手繪交換旅行行李插畫" fill priority sizes="(max-width: 820px) 100vw, 56vw" />
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
          <span className="route-origin">{state.journey.homeCity.toUpperCase()}</span>
          <span className="route-plane" style={{ left: `${Math.min(94, Math.max(4, progress))}%` }}>✈</span>
          <span className="route-destination">{state.journey.hostCity.toUpperCase()}</span>
        </div>
        <div className="progress-number"><strong>{done}</strong><span>/ {applicable.length} tasks</span></div>
      </section>

      <section className="dashboard-grid">
        <div className="next-panel paper-card tape-card">
          <div className="section-heading">
            <div><p className="eyebrow">Do these next</p><h2>現在先做這三件事</h2></div>
            <button className="link-button" onClick={() => setSection("journey")}>全部旅程 <ArrowRight size={15} /></button>
          </div>
          <div className="next-list">
            {nextTasks.map((task, index) => (
              <button className="next-task" key={task.id} onClick={() => setSection("journey")}>
                <span className="next-number">0{index + 1}</span>
                <span><strong>{task.title}</strong><small>{task.dueDate ? `${formatDate(task.dueDate)} · ${statusMeta[task.status].label}` : statusMeta[task.status].label}</small></span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-side">
          <div className="alert-grid">
            <button className="alert-note yellow" onClick={() => setSection("journey")}>
              <Clock3 size={23} /><strong>{waiting}</strong><span>等待中的事項</span>
            </button>
            <button className={`alert-note ${overdue ? "red" : "sage"}`} onClick={() => setSection("journey")}>
              {overdue ? <AlertTriangle size={23} /> : <Check size={23} />}<strong>{overdue}</strong><span>已逾期事項</span>
            </button>
          </div>
          <div className="journey-card paper-card">
            <div className="journey-card-top"><span className="stamp">EX</span><span>MY JOURNEY</span></div>
            <h3>{state.journey.hostSchool}</h3>
            <p>{state.journey.program}</p>
            <div className="journey-details">
              <span><CalendarDays size={16} />{state.journey.startDate.replaceAll("-", ".")} — {state.journey.endDate.replaceAll("-", ".")}</span>
              <span><MapIcon size={16} />{state.journey.hostCity} · {state.journey.destinations.join("、")}</span>
            </div>
          </div>
          <div className="budget-peek paper-card">
            <PiggyBank size={25} />
            <div><span>每月基礎預算</span><strong>約 €{monthly.toLocaleString()}</strong></div>
            <button className="icon-button" onClick={() => setSection("settings")} aria-label="查看預算"><ArrowRight size={17} /></button>
          </div>
        </div>
      </section>

      <section className="quick-modes">
        <button className="mode-card blue" onClick={() => setSection("journey")}>
          <span className="mode-icon"><Image src="/images/doodle-icons/arrival-safe.png" alt="" width={58} height={58} /></span>
          <div><p className="eyebrow">Quick mode</p><h3>抵達 72 小時</h3><p>鑰匙、入住、第一晚補給與 Orientation。</p></div>
          <ArrowRight />
        </button>
        <button className="mode-card terracotta" onClick={() => setSection("journey")}>
          <span className="mode-icon"><Image src="/images/doodle-icons/return-safe.png" alt="" width={58} height={58} /></span>
          <div><p className="eyebrow">Finish well</p><h3>返國收尾模式</h3><p>退租、註銷、押金、成績單一次收好。</p></div>
          <ArrowRight />
        </button>
      </section>
    </div>
  );
}

function JourneyPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [phase, setPhase] = useState<JourneyPhase | "all">("all");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editingTask, setEditingTask] = useState<JourneyTask | null>(null);
  const deferredSearch = useDeferredValue(search.toLowerCase());

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
        .map((task) => ({ ...task, predecessorIds: task.predecessorIds.filter((predecessor) => predecessor !== id) })),
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
        <div className="page-header-actions">
          <button className="button secondary" onClick={() => downloadIcs(state.tasks)}><Download size={17} />匯出全部期限</button>
          <button className="button primary" onClick={() => setEditingTask({ ...emptyTask })}><Plus size={18} />新增任務</button>
        </div>
      </header>

      <div className="phase-tabs" role="tablist" aria-label="旅程階段">
        <button className={phase === "all" ? "active" : ""} onClick={() => setPhase("all")}>全部 <span>{state.tasks.length}</span></button>
        {Object.entries(phaseMeta).map(([id, meta]) => (
          <button key={id} className={phase === id ? "active" : ""} onClick={() => setPhase(id as JourneyPhase)}>
            <small>{meta.number}</small>{meta.label}<span>{state.tasks.filter((task) => task.phase === id).length}</span>
          </button>
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
          const phaseTasks = filtered.filter((task) => task.phase === phaseId);
          if (phaseTasks.length === 0) return null;
          const completed = phaseTasks.filter((task) => task.status === "done").length;
          const meta = phaseMeta[phaseId];
          return (
            <section className={`phase-section phase-${meta.color}`} key={phaseId}>
              <div className="phase-heading">
                <span className="phase-number">{meta.number}</span>
                <div><p className="eyebrow">Chapter {meta.number}</p><h2>{meta.label}</h2></div>
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

      <AnimatePresence>{editingTask ? <TaskModal task={editingTask} tasks={state.tasks} onClose={() => setEditingTask(null)} onSave={saveTask} /> : null}</AnimatePresence>
    </div>
  );
}

function PackingPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<PackingDecision | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const bagWeights = useMemo(() => new Map(state.bags.map((bag) => [bag.id, state.packingItems
    .filter((item) => item.bagId === bag.id)
    .reduce((sum, item) => sum + item.weightKg * item.quantity, 0)])), [state.bags, state.packingItems]);

  const filteredItems = useMemo(() => state.packingItems.filter((item) => {
    const queryMatch = !deferredQuery || `${item.name} ${item.category}`.toLowerCase().includes(deferredQuery);
    return queryMatch && (decision === "all" || item.decision === decision);
  }), [state.packingItems, deferredQuery, decision]);

  const packedCount = state.packingItems.filter((item) => item.packed).length;
  const totalWeight = [...bagWeights.values()].reduce((sum, weight) => sum + weight, 0);
  const checkedWeight = state.bags
    .filter((bag) => bag.kind === "checked")
    .reduce((sum, bag) => sum + (bagWeights.get(bag.id) ?? 0), 0);
  const categories = [...new Set(filteredItems.map((item) => item.category))];

  function updateItem(id: string, patch: Partial<PackingItem>) {
    setState((current) => ({ ...current, packingItems: current.packingItems.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item: PackingItem = {
      id: `packing-${Date.now()}`,
      name: form.get("name")?.toString().trim() ?? "",
      category: form.get("category")?.toString().trim() || "其他",
      decision: form.get("decision") as PackingDecision,
      bagId: form.get("bagId")?.toString() ?? "",
      quantity: Math.max(1, Number(form.get("quantity")) || 1),
      weightKg: Math.max(0, Number(form.get("weightKg")) || 0),
      packed: false,
    };
    setState((current) => ({ ...current, packingItems: [...current.packingItems, item] }));
    event.currentTarget.reset();
    setShowAdd(false);
  }

  function deleteItem(id: string) {
    setState((current) => ({ ...current, packingItems: current.packingItems.filter((item) => item.id !== id) }));
  }

  return (
    <div className="page-stack">
      <header className="page-header packing-header">
        <div><p className="eyebrow">Pack lighter, live easier</p><h1>行李工作台</h1><p>用實際公斤數分配每件行李，也知道哪些東西到了德國再買就好。</p></div>
        <button className="button primary" onClick={() => setShowAdd((value) => !value)}>{showAdd ? <X size={18} /> : <Plus size={18} />}{showAdd ? "取消新增" : "新增物品"}</button>
      </header>

      <section className={`flight-allowance-card paper-card ${checkedWeight > 40 ? "over-limit" : ""}`}>
        <Image src="/images/doodle-icons/packing-complete-balanced.png" alt="" width={78} height={78} />
        <div>
          <p className="eyebrow">Confirmed itinerary allowance</p>
          <h2>這趟航程要同時符合兩段行李規則</h2>
          <div className="allowance-chips">
            <span><strong>EVA</strong> 2 × 23kg 托運 · 7kg 手提</span>
            <span><strong>Turkish</strong> 托運合計 40kg · 8kg 手提</span>
          </div>
          <p>安全配置：兩件托運各不超過 23kg，合計不超過 40kg；手提以較嚴格的 7kg 為準。</p>
        </div>
        <div className="combined-weight">
          <span>兩件托運合計</span>
          <strong>{checkedWeight.toFixed(1)} / 40 kg</strong>
          <div className="weight-bar"><motion.span animate={{ width: `${Math.min(100, checkedWeight / 40 * 100)}%` }} /></div>
          {checkedWeight > 40 ? <em>超出 Turkish 額度 {(checkedWeight - 40).toFixed(1)}kg</em> : <small>還可分配 {(40 - checkedWeight).toFixed(1)}kg</small>}
        </div>
      </section>

      <section className="packing-summary">
        <div className="summary-sticker terracotta"><Luggage /><strong>{totalWeight.toFixed(1)} kg</strong><span>目前已分配重量</span></div>
        <div className="summary-sticker blue"><PackageCheck /><strong>{packedCount} / {state.packingItems.length}</strong><span>已裝入行李</span></div>
        <div className="summary-sticker sage"><Sparkles /><strong>{state.packingItems.filter((item) => item.decision === "buy-there").length}</strong><span>留到德國再買</span></div>
      </section>

      <section className="bag-grid">
        {state.bags.map((bag, index) => {
          const weight = bagWeights.get(bag.id) ?? 0;
          const percentage = Math.min(100, (weight / bag.limitKg) * 100);
          const overweight = weight > bag.limitKg;
          return (
            <motion.article className={`bag-card paper-card ${overweight ? "overweight" : ""}`} key={bag.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
              <div className="bag-handle" />
              <div className="bag-card-top"><span className="bag-kind">{bag.kind === "checked" ? "CHECKED" : bag.kind === "carry-on" ? "CABIN" : "PERSONAL"}</span><Luggage size={21} /></div>
              <h3>{bag.name}</h3>
              <div className="weight-row"><strong>{weight.toFixed(1)}</strong><span>/</span><label><input type="number" min="0.5" step="0.5" value={bag.limitKg} onChange={(event) => setState((current) => ({ ...current, bags: current.bags.map((item) => item.id === bag.id ? { ...item, limitKg: Number(event.target.value) } : item) }))} aria-label={`${bag.name} 重量上限`} /> kg</label></div>
              <div className="weight-bar"><motion.span animate={{ width: `${percentage}%` }} /></div>
              <p>{overweight ? `超重 ${(weight - bag.limitKg).toFixed(1)} kg，請重新分配` : `還可放 ${(bag.limitKg - weight).toFixed(1)} kg`}</p>
            </motion.article>
          );
        })}
      </section>

      <AnimatePresence>
        {showAdd ? (
          <motion.form className="add-packing-form paper-card" onSubmit={addItem} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="form-title"><span className="tape" /><div><p className="eyebrow">Add to the list</p><h2>新增行李物品</h2></div></div>
            <label className="field"><span>物品名稱</span><input name="name" required placeholder="例如：登山鞋" /></label>
            <label className="field"><span>分類</span><input name="category" required placeholder="衣物、電子、文件…" /></label>
            <label className="field"><span>建議</span><select name="decision" defaultValue="recommend">{Object.entries(decisionMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}</select></label>
            <label className="field"><span>放哪裡</span><select name="bagId" defaultValue=""><option value="">尚未分配</option>{state.bags.map((bag) => <option value={bag.id} key={bag.id}>{bag.name}</option>)}</select></label>
            <label className="field"><span>單件重量 kg</span><input name="weightKg" type="number" min="0" step="0.01" defaultValue="0.2" /></label>
            <label className="field"><span>數量</span><input name="quantity" type="number" min="1" step="1" defaultValue="1" /></label>
            <button className="button primary" type="submit"><Plus size={18} />加入清單</button>
          </motion.form>
        ) : null}
      </AnimatePresence>

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
            <h2><span>{category}</span><em>{filteredItems.filter((item) => item.category === category).length} items</em></h2>
            {filteredItems.filter((item) => item.category === category).map((item) => (
              <motion.div layout className={`packing-row ${item.packed ? "packed" : ""}`} key={item.id}>
                <button className={`drawn-check ${item.packed ? "checked" : ""}`} onClick={() => updateItem(item.id, { packed: !item.packed })} aria-label={`${item.packed ? "取消" : "標記"}裝入 ${item.name}`}>{item.packed ? <Check size={17} strokeWidth={3} /> : null}</button>
                <div className="packing-name"><strong>{item.name}</strong><small>{item.warning ? <><AlertTriangle size={13} />{item.warning}</> : null}</small></div>
                <select className={`decision-select ${decisionMeta[item.decision].className}`} value={item.decision} onChange={(event) => updateItem(item.id, { decision: event.target.value as PackingDecision })} aria-label={`${item.name} 攜帶建議`}>{Object.entries(decisionMeta).map(([id, meta]) => <option value={id} key={id}>{meta.label}</option>)}</select>
                <div className="quantity-weight"><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} aria-label={`${item.name} 數量`} /><span>×</span><input type="number" min="0" step="0.01" value={item.weightKg} onChange={(event) => updateItem(item.id, { weightKg: Number(event.target.value) })} aria-label={`${item.name} 單件重量`} /><span>kg</span></div>
                <select className="bag-select" value={item.bagId} onChange={(event) => updateItem(item.id, { bagId: event.target.value })} aria-label={`${item.name} 行李位置`}><option value="">未分配</option>{state.bags.map((bag) => <option value={bag.id} key={bag.id}>{bag.name}</option>)}</select>
                <button className="icon-button danger" onClick={() => deleteItem(item.id)} aria-label={`刪除 ${item.name}`}><Trash2 size={16} /></button>
              </motion.div>
            ))}
          </div>
        ))}
      </section>

      <aside className="customs-note">
        <ShieldAlert size={28} />
        <div><p className="eyebrow">Before you zip it up</p><h2>海關與航空限制要最後再確認一次</h2><p>藥品、食品、液體、鋰電池與現金的限制會因物品和航班而不同。本站提供提醒，但請以德國海關和實際承運航空公司的最新規則為準。</p></div>
      </aside>
    </div>
  );
}

function ResourcesPage({ state }: { state: AppState }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const categories = ["全部", ...new Set(state.resources.map((resource) => resource.category))];
  const filtered = state.resources.filter((resource) => (category === "全部" || resource.category === category) && (!deferredQuery || `${resource.title} ${resource.description} ${resource.region}`.toLowerCase().includes(deferredQuery)));
  const typeLabel = { official: "官方", school: "學校", city: "城市", experience: "經驗分享" };

  return (
    <div className="page-stack">
      <header className="page-header resources-header"><div><p className="eyebrow">Verified bookmarks</p><h1>重要資源庫</h1><p>把規定、學校流程與經驗分享分開；每個會變動的資訊都留下查核日期。</p></div><div className="resource-stamp"><span>LAST CHECKED</span><strong>2026.08</strong></div></header>
      <div className="toolbar paper-card resource-toolbar">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋簽證、住宿、醫療或交通" /></label>
        <div className="filter-pills scroll-pills">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      </div>
      <section className="resource-grid">
        {filtered.map((resource, index) => (
          <motion.a className={`resource-card paper-card resource-${resource.type}`} href={resource.url} target="_blank" rel="noreferrer" key={resource.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3) }}>
            <div className="resource-card-top"><span className={`source-badge ${resource.type}`}>{typeLabel[resource.type]}</span><ExternalLink size={17} /></div>
            <span className="resource-category">{resource.category}</span>
            <h2>{resource.title}</h2>
            <p>{resource.description}</p>
            <div className="resource-footer"><span><MapIcon size={14} />{resource.region}</span><span><Check size={14} />查核 {resource.verifiedAt.replaceAll("-", ".")}</span></div>
          </motion.a>
        ))}
      </section>
      <aside className="experience-rule paper-card"><Info size={24} /><div><h2>規定和經驗，不混在一起</h2><p>官方、學校與城市來源用來確認程序；YouTube 等經驗分享只協助理解生活情境。價格、期限和法律要求一律回到原始官方頁面重新確認。</p></div></aside>
    </div>
  );
}

function SettingsPage({ state, setState, cloud }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; cloud: ExchangeCloudController }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountPassword, setAccountPassword] = useState("");

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

  function restoreDefault() {
    if (!window.confirm("這會清除目前變更並恢復通用交換模板，確定繼續嗎？")) return;
    setState(resetState());
    setMessage("已恢復通用交換模板。");
  }

  return (
    <div className="page-stack">
      <header className="page-header settings-header"><div><p className="eyebrow">Keep it yours</p><h1>設定與備份</h1><p>目前資料只在這台裝置；定期匯出備份，就能避免清除瀏覽器資料時遺失。</p></div></header>
      <section className="paper-card settings-card account-card">
        <div className="settings-card-title"><UserRound size={23} /><div><p className="eyebrow">Free account & sync</p><h2>帳戶與手機同步</h2></div></div>
        {!cloud.configured ? <div className="cloud-offline-state"><strong>免費雲端尚未建立</strong><p>現在仍是完整的本機版。所有功能測試完成後才會一次建立並上版，不會在開發中反覆消耗部署額度。</p></div> : cloud.permanentAccount ? <>
          <div className="account-summary"><span className="avatar">{cloud.session?.user.email?.slice(0, 1).toUpperCase() || "A"}</span><div><strong>{String(cloud.session?.user.user_metadata.account_id ?? cloud.session?.user.email ?? "已登入帳戶")}</strong><small>{cloud.privateSyncEnabled ? "私人手帳同步中" : "尚未同步私人手帳"}</small></div></div>
          <div className="backup-actions">{cloud.privateSyncEnabled ? <button className="button secondary" onClick={cloud.disablePrivateSync}>停止同步</button> : <><button className="button primary" disabled={cloud.busy} onClick={() => void cloud.enablePrivateSync("upload-local")}>用這台裝置建立雲端副本</button><button className="button secondary" disabled={cloud.busy} onClick={() => void cloud.enablePrivateSync("use-cloud")}>載入帳戶既有手帳</button></>}<button className="button text-button" onClick={() => void cloud.signOut()}>登出</button></div>
        </> : <>
          <p>不登入也能開啟「任何人可用」的旅行分享。若要跨手機同步私人手帳，或開啟只限指定帳號的連結，請建立免費手帳帳號。</p>
          <div className="account-login-actions">
            <div className="email-login"><input name="accountId" autoComplete="username" spellCheck={false} value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="帳號代號，例如 travel-austin" aria-label="手帳帳號代號" /><input type="password" name="accountPassword" autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} placeholder="密碼至少 8 字元" aria-label="手帳帳號密碼" /><button className="button primary" disabled={!accountId || accountPassword.length < 8 || cloud.busy} onClick={() => void cloud.accountSignIn(accountId, accountPassword)}>登入</button><button className="button secondary" disabled={!accountId || accountPassword.length < 8 || cloud.busy} onClick={() => void cloud.createAccount(accountId, accountPassword)}>建立免費帳號</button></div>
            <small>不需 Email、不會產生寄信費用。請自行保存密碼；目前沒有忘記密碼功能。</small>
            <details className="admin-email-login"><summary>已移轉的管理者手帳</summary><p>只有專案成員信箱能使用這個入口。</p><div className="email-login"><input type="email" name="loginEmail" autoComplete="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="專案 Gmail" aria-label="管理者 Email 登入信箱" /><button className="button secondary" disabled={!email || cloud.busy} onClick={() => void cloud.emailSignIn(email)}>寄管理者登入連結</button></div></details>
          </div>
        </>}
        <p className="settings-message" role="status">{cloud.notice}</p>
      </section>
      <section className="settings-grid">
        <div className="paper-card settings-card">
          <div className="settings-card-title"><MapIcon size={23} /><div><p className="eyebrow">Your journey</p><h2>交換基本資料</h2></div></div>
          <div className="form-grid">
            <label className="field"><span>顯示名稱</span><input value={state.journey.ownerName} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, ownerName: event.target.value } }))} /></label>
            <label className="field"><span>交換學校</span><input value={state.journey.hostSchool} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, hostSchool: event.target.value } }))} /></label>
            <label className="field"><span>出發／入住日</span><input type="date" value={state.journey.startDate} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, startDate: event.target.value } }))} /></label>
            <label className="field"><span>交換結束日</span><input type="date" value={state.journey.endDate} onChange={(event) => setState((current) => ({ ...current, journey: { ...current.journey, endDate: event.target.value } }))} /></label>
            <label className="field field-full"><span>緊急聯絡備註（請勿填證件或敏感資訊）</span><textarea rows={3} value={state.emergencyContact} onChange={(event) => setState((current) => ({ ...current, emergencyContact: event.target.value }))} placeholder="例如：家人電話另存於手機緊急聯絡人；TK 保險客服已加入通訊錄。" /></label>
          </div>
        </div>

        <div className="paper-card settings-card backup-card">
          <div className="settings-card-title"><FileText size={23} /><div><p className="eyebrow">Local & private</p><h2>資料備份</h2></div></div>
          <p>備份包含本站的任務、行李、預算與設定，不包含父資料夾中的任何私人文件。</p>
          <div className="backup-actions">
            <button className="button primary" onClick={() => downloadJson(state)}><Download size={18} />下載 JSON 備份</button>
            <button className="button secondary" onClick={() => fileInput.current?.click()}><Upload size={18} />還原備份</button>
            <input className="sr-only" ref={fileInput} type="file" accept="application/json" onChange={importBackup} />
            <button className="button text-danger" onClick={restoreDefault}><RotateCcw size={17} />恢復預設資料</button>
          </div>
          {message ? <div className="settings-message" role="status">{message}</div> : null}
        </div>
      </section>

      <section className="paper-card settings-card budget-card">
        <div className="settings-card-title"><PiggyBank size={23} /><div><p className="eyebrow">Money map</p><h2>基礎預算</h2></div></div>
        <div className="budget-table">
          {state.budget.map((item) => (
            <div className="budget-row" key={item.id}>
              <button className={`drawn-check ${item.paid ? "checked" : ""}`} onClick={() => setState((current) => ({ ...current, budget: current.budget.map((budget) => budget.id === item.id ? { ...budget, paid: !budget.paid } : budget) }))} aria-label={`${item.paid ? "取消" : "標記"}支付 ${item.name}`}>{item.paid ? <Check size={16} /> : null}</button>
              <strong>{item.name}</strong>
              <span>{item.cadence === "monthly" ? "每月" : "一次性"}</span>
              <label>€ <input type="number" min="0" step="0.5" value={item.amount} onChange={(event) => setState((current) => ({ ...current, budget: current.budget.map((budget) => budget.id === item.id ? { ...budget, amount: Number(event.target.value) } : budget) }))} aria-label={`${item.name} 金額`} /></label>
            </div>
          ))}
        </div>
      </section>

      <section className="privacy-card">
        <ShieldAlert size={28} />
        <div><p className="eyebrow">Privacy boundary</p><h2>這個網站刻意不保存什麼？</h2><p>護照、簽證、財力證明、房號、銀行資料、租客入口憑證、醫療文件與個人照片。本站只記錄「是否完成」和你自己輸入的非敏感備註。</p></div>
      </section>

      <section className="v2-note paper-card">
        <span className="tape" /><div><p className="eyebrow">V2 · AI first</p><h2>Codex 自動整理已接上</h2><p>AI 會先把信件、授權檔案與最新來源整理成可審核提案；網站仍保留完整手動編輯。旅行可另外分享，私人交換內容永遠不會跟著出去。</p></div><span className="coming-soon">FREE FIRST</span>
      </section>
    </div>
  );
}

export default function ExchangeCompanion() {
  const isHydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [state, setState] = useState<AppState>(() => loadState());
  const [section, setSection] = useState<NavSection>(initialSection);
  const [mobileMenu, setMobileMenu] = useState(false);
  const cloud = useExchangeCloud(state, setState);

  useEffect(() => {
    if (isHydrated) saveState(state);
  }, [state, isHydrated]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const url = new URL(window.location.href);
    if (section === "home") url.searchParams.delete("section");
    else url.searchParams.set("section", section);
    window.history.replaceState({}, "", url);
  }, [section]);

  if (!isHydrated) {
    return (
      <div className="boot-shell" role="status">
        <span className="brand-stamp">DE</span>
        <strong>交換手帳</strong>
        <p>正在打開「我的交換」…</p>
      </div>
    );
  }

  const currentNav = navItems.find((item) => item.id === section)!;
  const mobileNavItems = navItems.filter((item) => item.id !== "settings" && item.id !== "ai");
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayLabel = formatDate(todayIso);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要內容</a>
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <button className="brand-mark" onClick={() => setSection("home")}>
          <span className="brand-stamp">DE</span>
          <div><strong>交換手帳</strong><small>Exchange Companion</small></div>
        </button>
        <nav aria-label="主要導覽">
          {navItems.map((item) => {
            return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setMobileMenu(false); }}><Image className="nav-doodle-icon" src={item.doodleIcon} alt="" width={38} height={38} /><span>{item.label}</span></button>;
          })}
        </nav>
        <div className="sidebar-note">
          <span className="tape" />
          <p className="hand-note">“慢慢準備，<br />也正在靠近。”</p>
          <small>{state.journey.homeCity} → {state.journey.hostCity}</small>
        </div>
        <div className="sidebar-footer"><span>{cloud.privateSyncEnabled ? "FREE CLOUD · PRIVATE" : "LOCAL · PRIVATE"}</span><span>V2.1</span></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="開啟導覽"><Menu /></button>
          <div className="mobile-brand"><span className="brand-stamp">DE</span><strong>交換手帳</strong></div>
          <div className="topbar-trail"><span>MY EXCHANGE</span><ArrowRight size={14} /><strong>{currentNav.label}</strong></div>
          <div className="topbar-right"><span className="today-label">{todayLabel}</span><button className="emergency-button" onClick={() => setSection("resources")}><HeartPulse size={17} />緊急資訊</button><button className="avatar avatar-button" onClick={() => setSection("settings")} aria-label="開啟帳戶與設定">{cloud.session?.user.email?.slice(0, 1).toUpperCase() || state.journey.ownerName.slice(0, 1).toUpperCase() || "A"}</button></div>
        </header>

        <main id="main-content">
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              {section === "home" ? <Dashboard state={state} setSection={setSection} todayIso={todayIso} /> : null}
              {section === "journey" ? <JourneyPage state={state} setState={setState} /> : null}
              {section === "travel" ? <Suspense fallback={<SectionFallback />}><TravelPlanner state={state} setState={setState} cloud={cloud} /></Suspense> : null}
              {section === "packing" ? <PackingPage state={state} setState={setState} /> : null}
              {section === "resources" ? <ResourcesPage state={state} /> : null}
              {section === "ai" ? <Suspense fallback={<SectionFallback />}><AiConcierge state={state} setState={setState} /></Suspense> : null}
              {section === "settings" ? <SettingsPage state={state} setState={setState} cloud={cloud} /> : null}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="手機導覽">
        {mobileNavItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><Image className="nav-doodle-icon" src={item.doodleIcon} alt="" width={34} height={34} /><span>{item.shortLabel}</span></button>)}
      </nav>
      {mobileMenu ? <button className="mobile-overlay" onClick={() => setMobileMenu(false)} aria-label="關閉導覽" /> : null}
    </div>
  );
}
