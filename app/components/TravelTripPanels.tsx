"use client";

import { Check, ExternalLink, Pencil, Plus, Route, ShieldAlert, Trash2 } from "lucide-react";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { type FormEvent, useMemo, useState } from "react";
import type { TravelActivity, TravelNote, TravelNoteCategory, TravelPackingItem, TravelPlan } from "../lib/types";
import MotionDialog from "./ui/MotionDialog";

const noteMeta: Record<TravelNoteCategory, { label: string; className: string }> = {
  transport: { label: "交通", className: "blue" },
  booking: { label: "預約", className: "yellow" },
  safety: { label: "安全", className: "red" },
  food: { label: "餐飲", className: "terracotta" },
  shopping: { label: "購物", className: "sage" },
  general: { label: "一般", className: "gray" },
};

function isGoogleMapsUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return host === "maps.app.goo.gl" || host === "goo.gl" || host.includes("google.");
  } catch {
    return false;
  }
}

function activityQuery(activity: TravelActivity, destinations: string[]): string {
  return [activity.location || activity.title, destinations.at(-1)].filter(Boolean).join(", ");
}

export function mapsUrlForActivity(activity: TravelActivity, destinations: string[]): string {
  if (activity.mapsUrl && isGoogleMapsUrl(activity.mapsUrl)) return activity.mapsUrl;
  const query = activityQuery(activity, destinations);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function directionsUrl(activities: TravelActivity[], destinations: string[]): string | null {
  const stops = activities
    .filter((activity) => activity.kind !== "note")
    .map((activity) => activityQuery(activity, destinations))
    .filter(Boolean);
  if (stops.length < 2) return null;
  const params = new URLSearchParams({
    api: "1",
    origin: stops[0],
    destination: stops.at(-1) ?? stops[0],
    travelmode: "transit",
  });
  if (stops.length > 2) params.set("waypoints", stops.slice(1, -1).slice(0, 8).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function DayMapPanel({ activities, destinations }: { activities: TravelActivity[]; destinations: string[] }) {
  const mappable = activities.filter((activity) => activity.kind !== "note");
  const routeUrl = directionsUrl(mappable, destinations);
  if (!mappable.length) return null;

  return (
    <section className="day-map-panel">
      <div className="day-map-heading">
        <div className="day-map-icon"><Image src="/images/doodle-icons-v2/journey-route.png" alt="" width={46} height={46} /></div>
        <div><p className="eyebrow">Google Maps</p><h3>今天的地點</h3><p>地址會保留在手帳裡；點擊後才會開啟 Google Maps。</p></div>
        {routeUrl ? <a className="button secondary map-route-button" href={routeUrl} target="_blank" rel="noreferrer"><Route size={16} />依順序開啟路線</a> : null}
      </div>
      <div className="day-map-stops">
        {mappable.map((activity, index) => (
          <a key={activity.id} href={mapsUrlForActivity(activity, destinations)} target="_blank" rel="noreferrer">
            <span>{index + 1}</span><div><strong>{activity.title}</strong><small>{activity.location || "使用地點名稱搜尋"}</small></div><ExternalLink size={14} />
          </a>
        ))}
      </div>
    </section>
  );
}

function NoteForm({ note, onSave, onCancel }: { note?: TravelNote; onSave: (note: TravelNote) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: note?.id ?? `travel-note-${Date.now()}`,
      title: form.get("title")?.toString().trim() ?? "",
      details: form.get("details")?.toString().trim() ?? "",
      category: form.get("category") as TravelNoteCategory,
      important: form.get("important") === "on",
      date: form.get("date")?.toString() || undefined,
      priority: (form.get("priority")?.toString() || "medium") as TravelNote["priority"],
    });
  }

  return (
    <form className="trip-extra-form" onSubmit={submit}>
      <label><span>標題</span><input name="title" defaultValue={note?.title} placeholder="例如：最後一班車" required /></label>
      <label><span>分類</span><select name="category" defaultValue={note?.category ?? "general"}>{Object.entries(noteMeta).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>
      <label><span>日期（選填）</span><input type="date" name="date" defaultValue={note?.date} /></label>
      <label><span>優先程度</span><select name="priority" defaultValue={note?.priority ?? "medium"}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
      <label className="field-wide"><span>詳細內容</span><textarea name="details" defaultValue={note?.details} rows={3} placeholder="營業時間、票券規定、安全提醒或備案…" required /></label>
      <label className="trip-checkbox"><input type="checkbox" name="important" defaultChecked={note?.important} />標成重要提醒</label>
      <div className="trip-extra-form-actions"><button type="button" className="button text-button" onClick={onCancel}>取消</button><button type="submit" className="button primary"><Check size={16} />儲存提醒</button></div>
    </form>
  );
}

export function TravelNotesPanel({ plan, onUpdate, readOnly = false }: { plan: TravelPlan; onUpdate: (plan: TravelPlan) => void; readOnly?: boolean }) {
  const [editingId, setEditingId] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  function save(note: TravelNote) {
    const current = plan.travelNotes ?? [];
    onUpdate({ ...plan, updatedAt: new Date().toISOString(), travelNotes: current.some((item) => item.id === note.id) ? current.map((item) => item.id === note.id ? note : item) : [...current, note] });
    setAdding(false);
    setEditingId("");
  }

  const notes = [...(plan.travelNotes ?? [])].sort((a, b) => Number(b.important) - Number(a.important));
  return (
    <div className="trip-extra-panel">
      <div className="trip-extra-intro"><div><p className="eyebrow">Things worth remembering</p><h3>注意事項與備案</h3><p>像 Italy Trip 一樣，把交通、訂位、安全與緊急處置留在同一趟旅行裡。</p></div>{readOnly ? null : <button className="button primary" onClick={() => { setAdding(true); setEditingId(""); }}><Plus size={16} />新增提醒</button>}</div>
      <AnimatePresence>{!readOnly && (adding || editingId) ? <MotionDialog id="travel-note-dialog-title" eyebrow="Travel note" title={editingId ? "編輯注意事項" : "新增注意事項"} onClose={() => { setAdding(false); setEditingId(""); }} className="travel-note-dialog"><NoteForm note={notes.find((note) => note.id === editingId)} onSave={save} onCancel={() => { setAdding(false); setEditingId(""); }} /></MotionDialog> : null}</AnimatePresence>
      <AnimatePresence>{deleteId ? <MotionDialog id="travel-note-delete-title" eyebrow="Confirm deletion" title="刪除這則注意事項？" onClose={() => setDeleteId("")} className="compact-confirm-dialog"><p>刪除後不會影響其他旅行內容。</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleteId("")}>取消</button><button className="button text-danger" onClick={() => { onUpdate({ ...plan, travelNotes: notes.filter((item) => item.id !== deleteId) }); setDeleteId(""); }}><Trash2 size={16} />確認刪除</button></div></MotionDialog> : null}</AnimatePresence>
      {notes.length ? <div className="trip-note-grid">{notes.map((note) => (
        <article className={`trip-note-card ${note.important ? "important" : ""}`} key={note.id}>
          <div className="trip-note-top"><span className={`trip-note-category ${noteMeta[note.category].className}`}>{noteMeta[note.category].label}</span>{note.important ? <span className="important-label"><ShieldAlert size={13} />重要</span> : null}</div>
          <h4>{note.title}</h4><p>{note.details}</p>
          {readOnly ? null : <div className="trip-note-actions"><button className="icon-button" onClick={() => { setEditingId(note.id); setAdding(false); }} aria-label={`編輯 ${note.title}`}><Pencil size={14} /></button><button className="icon-button danger" onClick={() => setDeleteId(note.id)} aria-label={`刪除 ${note.title}`}><Trash2 size={14} /></button></div>}
        </article>
      ))}</div> : <div className="trip-extra-empty"><Image src="/images/doodle-icons-v2/resources-book.png" alt="" width={72} height={72} /><strong>還沒有旅行提醒</strong><span>想到需要預約、避開或特別小心的事，就先記在這裡。</span></div>}
    </div>
  );
}

function PackingForm({ item, onSave, onCancel }: { item?: TravelPackingItem; onSave: (item: TravelPackingItem) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: item?.id ?? `travel-pack-${Date.now()}`,
      name: form.get("name")?.toString().trim() ?? "",
      category: form.get("category")?.toString().trim() || "其他",
      quantity: Math.max(1, Number(form.get("quantity")) || 1),
      packed: item?.packed ?? false,
      notes: form.get("notes")?.toString().trim() ?? "",
    });
  }

  return (
    <form className="trip-extra-form packing-extra-form" onSubmit={submit}>
      <label><span>物品</span><input name="name" defaultValue={item?.name} placeholder="例如：小背包" required /></label>
      <label><span>分類</span><input name="category" defaultValue={item?.category} placeholder="證件、衣物、電子…" /></label>
      <label><span>數量</span><input type="number" min="1" name="quantity" defaultValue={item?.quantity ?? 1} /></label>
      <label className="field-wide"><span>備註</span><input name="notes" defaultValue={item?.notes} placeholder="放哪裡、限制或不要忘記的原因" /></label>
      <div className="trip-extra-form-actions"><button type="button" className="button text-button" onClick={onCancel}>取消</button><button type="submit" className="button primary"><Check size={16} />儲存物品</button></div>
    </form>
  );
}

export function TravelPackingPanel({ plan, onUpdate, readOnly = false }: { plan: TravelPlan; onUpdate: (plan: TravelPlan) => void; readOnly?: boolean }) {
  const [editingId, setEditingId] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const items = useMemo(() => plan.packingItems ?? [], [plan.packingItems]);
  const packedCount = items.filter((item) => item.packed).length;
  const groups = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);

  function save(item: TravelPackingItem) {
    onUpdate({ ...plan, updatedAt: new Date().toISOString(), packingItems: items.some((current) => current.id === item.id) ? items.map((current) => current.id === item.id ? item : current) : [...items, item] });
    setAdding(false);
    setEditingId("");
  }

  function toggle(item: TravelPackingItem) {
    onUpdate({ ...plan, updatedAt: new Date().toISOString(), packingItems: items.map((current) => current.id === item.id ? { ...current, packed: !current.packed } : current) });
  }

  return (
    <div className="trip-extra-panel">
      <div className="trip-extra-intro"><div><p className="eyebrow">Pack for this trip only</p><h3>這趟旅行的小行李</h3><p>這份清單只屬於這趟旅行，不會改動交換旅程的主要行李工作台。</p></div>{readOnly ? null : <button className="button primary" onClick={() => { setAdding(true); setEditingId(""); }}><Plus size={16} />新增物品</button>}</div>
      <div className="trip-pack-progress"><div><span style={{ width: `${items.length ? (packedCount / items.length) * 100 : 0}%` }} /></div><strong>{packedCount} / {items.length}</strong><small>已裝進旅行包</small></div>
      <AnimatePresence>{!readOnly && (adding || editingId) ? <MotionDialog id="travel-packing-dialog-title" eyebrow="Trip packing" title={editingId ? "編輯旅行物品" : "新增旅行物品"} onClose={() => { setAdding(false); setEditingId(""); }} className="travel-packing-dialog"><PackingForm item={items.find((item) => item.id === editingId)} onSave={save} onCancel={() => { setAdding(false); setEditingId(""); }} /></MotionDialog> : null}</AnimatePresence>
      <AnimatePresence>{deleteId ? <MotionDialog id="travel-packing-delete-title" eyebrow="Confirm deletion" title="刪除這個旅行物品？" onClose={() => setDeleteId("")} className="compact-confirm-dialog"><p>物品會從這趟旅行的清單移除。</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleteId("")}>取消</button><button className="button text-danger" onClick={() => { onUpdate({ ...plan, packingItems: items.filter((item) => item.id !== deleteId) }); setDeleteId(""); }}><Trash2 size={16} />確認刪除</button></div></MotionDialog> : null}</AnimatePresence>
      {items.length ? <div className="trip-pack-groups">{groups.map((group) => <section key={group}><h4>{group}<span>{items.filter((item) => item.category === group).length}</span></h4>{items.filter((item) => item.category === group).map((item) => (
        <div className={`trip-pack-row ${item.packed ? "packed" : ""}`} key={item.id}>
          <button className={`drawn-check ${item.packed ? "checked" : ""}`} onClick={() => toggle(item)} aria-label={`${item.packed ? "取消" : "標記"}裝入 ${item.name}`} disabled={readOnly}>{item.packed ? <Check size={16} strokeWidth={3} /> : null}</button>
          <div><strong>{item.name}</strong>{item.notes ? <small>{item.notes}</small> : null}</div><span>× {item.quantity}</span>
          {readOnly ? null : <><button className="icon-button" onClick={() => { setEditingId(item.id); setAdding(false); }} aria-label={`編輯 ${item.name}`}><Pencil size={14} /></button><button className="icon-button danger" onClick={() => setDeleteId(item.id)} aria-label={`刪除 ${item.name}`}><Trash2 size={14} /></button></>}
        </div>
      ))}</section>)}</div> : <div className="trip-extra-empty"><Image src="/images/doodle-icons-v2/travel-suitcase.png" alt="" width={72} height={72} /><strong>旅行包還是空的</strong><span>這裡適合放週末小旅行的證件、衣物、藥品和充電用品。</span></div>}
    </div>
  );
}
