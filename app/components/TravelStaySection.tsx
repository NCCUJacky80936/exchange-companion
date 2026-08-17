"use client";

import { ExternalLink, Hotel, MapPinned, Pencil, Plus, Sheet, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { TravelPlan, TravelReference, TravelReferenceKind, TravelStay } from "../lib/types";

const referenceKinds: Record<TravelReferenceKind, { label: string; icon: typeof MapPinned }> = {
  "map-list": { label: "Google Maps 清單", icon: MapPinned },
  spreadsheet: { label: "Google Sheet", icon: Sheet },
  guide: { label: "攻略／資料", icon: ExternalLink },
  booking: { label: "訂房資料", icon: Hotel },
  other: { label: "其他參考", icon: ExternalLink },
};

function formatStayDate(value: string): string {
  if (!value) return "日期待確認";
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function StayForm({ stay, onSave, onCancel }: { stay?: TravelStay; onSave: (stay: TravelStay) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get("name")?.toString().trim() ?? "";
    onSave({
      id: stay?.id ?? `travel-stay-${Date.now()}`,
      name,
      checkIn: form.get("checkIn")?.toString() ?? "",
      checkOut: form.get("checkOut")?.toString() ?? "",
      area: form.get("area")?.toString().trim() ?? "",
      address: form.get("address")?.toString().trim() ?? "",
      mapsUrl: form.get("mapsUrl")?.toString().trim() ?? "",
      sourceUrl: form.get("sourceUrl")?.toString().trim() ?? "",
      imageUrl: form.get("imageUrl")?.toString().trim() ?? "",
      imageAlt: form.get("imageAlt")?.toString().trim() || `${name} 飯店照片`,
      summary: form.get("summary")?.toString().trim() ?? "",
      highlights: (form.get("highlights")?.toString() ?? "").split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
      notes: form.get("notes")?.toString().trim() ?? "",
    });
  }

  return (
    <form className="travel-stay-form" onSubmit={submit}>
      <label><span>飯店名稱</span><input name="name" defaultValue={stay?.name} required /></label>
      <label><span>入住</span><input type="date" name="checkIn" defaultValue={stay?.checkIn} required /></label>
      <label><span>退房</span><input type="date" name="checkOut" defaultValue={stay?.checkOut} required /></label>
      <label><span>區域</span><input name="area" defaultValue={stay?.area} placeholder="例如：Sukhumvit／Phaya Thai" /></label>
      <label className="field-wide"><span>地址</span><input name="address" defaultValue={stay?.address} /></label>
      <label className="field-wide"><span>簡介</span><textarea name="summary" defaultValue={stay?.summary} rows={2} placeholder="為什麼選這間、適合哪幾天的行程…" required /></label>
      <label className="field-wide"><span>重點（以逗號或換行分隔）</span><textarea name="highlights" defaultValue={stay?.highlights.join("、")} rows={2} placeholder="直通 BTS、可寄放行李、附近餐廳多" /></label>
      <label><span>Google Maps</span><input type="url" name="mapsUrl" defaultValue={stay?.mapsUrl} placeholder="https://maps.app.goo.gl/…" /></label>
      <label><span>官方／訂房來源</span><input type="url" name="sourceUrl" defaultValue={stay?.sourceUrl} placeholder="https://…" /></label>
      <label className="field-wide"><span>照片網址</span><input type="url" name="imageUrl" defaultValue={stay?.imageUrl} placeholder="https://…" /></label>
      <label className="field-wide"><span>照片說明</span><input name="imageAlt" defaultValue={stay?.imageAlt} placeholder="飯店外觀或房間照片" /></label>
      <label className="field-wide"><span>私人備註</span><input name="notes" defaultValue={stay?.notes} placeholder="訂房條件、房型或尚待確認事項" /></label>
      <div className="travel-stay-form-actions field-wide"><button type="button" className="button text-button" onClick={onCancel}>取消</button><button className="button primary" type="submit">儲存住宿</button></div>
    </form>
  );
}

function ReferenceForm({ reference, onSave, onCancel }: { reference?: TravelReference; onSave: (reference: TravelReference) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: reference?.id ?? `travel-reference-${Date.now()}`,
      label: form.get("label")?.toString().trim() ?? "",
      kind: form.get("kind") as TravelReferenceKind,
      url: form.get("url")?.toString().trim() ?? "",
      description: form.get("description")?.toString().trim() ?? "",
    });
  }

  return (
    <form className="travel-reference-form" onSubmit={submit}>
      <label><span>名稱</span><input name="label" defaultValue={reference?.label} required /></label>
      <label><span>類型</span><select name="kind" defaultValue={reference?.kind ?? "other"}>{Object.entries(referenceKinds).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
      <label className="field-wide"><span>網址</span><input type="url" name="url" defaultValue={reference?.url} required /></label>
      <label className="field-wide"><span>說明</span><input name="description" defaultValue={reference?.description} placeholder="裡面整理了什麼、什麼時候會用到" /></label>
      <div className="travel-stay-form-actions field-wide"><button type="button" className="button text-button" onClick={onCancel}>取消</button><button className="button primary" type="submit">儲存參考</button></div>
    </form>
  );
}

function TravelEntryModal({ id, eyebrow, title, onClose, children }: { id: string; eyebrow: string; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div className="modal-card travel-entry-modal paper-card" role="dialog" aria-modal="true" aria-labelledby={id} initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
        <div className="modal-heading"><div><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="關閉"><X size={20} /></button></div>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function TravelStaySection({ plan, onUpdate, readOnly = false }: { plan: TravelPlan; onUpdate: (plan: TravelPlan) => void; readOnly?: boolean }) {
  const stays = plan.stays ?? [];
  const references = plan.references ?? [];
  const [hoveredId, setHoveredId] = useState("");
  const [pinnedId, setPinnedId] = useState("");
  const [editingStayId, setEditingStayId] = useState("");
  const [addingStay, setAddingStay] = useState(false);
  const [editingReferenceId, setEditingReferenceId] = useState("");
  const [addingReference, setAddingReference] = useState(false);
  const editingStay = stays.find((stay) => stay.id === editingStayId);
  const editingReference = references.find((reference) => reference.id === editingReferenceId);

  function saveStay(stay: TravelStay) {
    const next = stays.some((item) => item.id === stay.id) ? stays.map((item) => item.id === stay.id ? stay : item) : [...stays, stay];
    onUpdate({ ...plan, stays: next, updatedAt: new Date().toISOString() });
    setAddingStay(false);
    setEditingStayId("");
  }

  function saveReference(reference: TravelReference) {
    const next = references.some((item) => item.id === reference.id) ? references.map((item) => item.id === reference.id ? reference : item) : [...references, reference];
    onUpdate({ ...plan, references: next, updatedAt: new Date().toISOString() });
    setAddingReference(false);
    setEditingReferenceId("");
  }

  return (
    <section className="travel-base-section" aria-labelledby="travel-stays-title">
      <div className="travel-base-heading">
        <div><p className="eyebrow">Accommodation</p><h3 id="travel-stays-title">住宿</h3><p>先確認每天從哪間住宿出發。滑鼠移入、鍵盤聚焦，或手機點一下飯店，就能先看照片與摘要。</p></div>
        {readOnly ? null : <button className="mini-add-button" onClick={() => { setAddingStay(true); setEditingStayId(""); }}><Plus size={15} />新增飯店</button>}
      </div>
      {stays.length ? <div className="travel-stay-grid">{stays.map((stay, index) => {
        const open = hoveredId === stay.id || pinnedId === stay.id;
        return (
          <article className={`travel-stay-card ${open ? "open" : ""}`} key={stay.id} onMouseEnter={() => setHoveredId(stay.id)} onMouseLeave={() => setHoveredId("")}>
            <button className="travel-stay-summary" type="button" aria-expanded={open} aria-controls={`stay-detail-${stay.id}`} aria-label={open ? `收合 ${stay.name} 詳情` : `查看 ${stay.name} 詳情`} onFocus={() => setHoveredId(stay.id)} onBlur={() => setHoveredId("")} onClick={(event) => { setHoveredId(""); setPinnedId((current) => current === stay.id ? "" : stay.id); event.currentTarget.blur(); }}>
              <span className="stay-index">{String.fromCharCode(65 + index)}</span>
              <span><small>{formatStayDate(stay.checkIn)} — {formatStayDate(stay.checkOut)}</small><strong>{stay.name}</strong><em>{stay.area || "區域待補"}</em></span>
              <Plus className="stay-toggle" size={18} aria-hidden="true" />
            </button>
            <div className="travel-stay-popover" id={`stay-detail-${stay.id}`} aria-hidden={!open}>
              <div className="stay-photo">
                {/* Arbitrary official/user-authorized destination images cannot use a build-time host allowlist. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {stay.imageUrl ? <img src={stay.imageUrl} alt={stay.imageAlt || `${stay.name} 飯店照片`} loading="lazy" referrerPolicy="no-referrer" /> : <Image src="/images/doodle-icons-v2/home-notebook.png" alt="" width={150} height={150} />}
                <span>{index + 1} / {stays.length}</span>
              </div>
              <div className="stay-detail-copy"><p className="eyebrow structural-eyebrow">{stay.area || "Accommodation"}</p><h4>{stay.name}</h4><p>{stay.summary}</p>{stay.highlights.length ? <ul>{stay.highlights.map((item) => <li key={item}>{item}</li>)}</ul> : null}{stay.address ? <small>{stay.address}</small> : null}<div className="stay-detail-links">{stay.mapsUrl ? <a href={stay.mapsUrl} target="_blank" rel="noreferrer"><MapPinned size={14} />Google Maps<ExternalLink size={11} /></a> : null}{stay.sourceUrl ? <a href={stay.sourceUrl} target="_blank" rel="noreferrer">官方資訊<ExternalLink size={11} /></a> : null}</div>{stay.notes ? <p className="stay-private-note">{stay.notes}</p> : null}</div>
              {readOnly ? null : <div className="stay-detail-actions"><button className="icon-button" onClick={() => { setEditingStayId(stay.id); setAddingStay(false); setPinnedId(stay.id); }} aria-label={`編輯 ${stay.name}`}><Pencil size={14} /></button><button className="icon-button danger" onClick={() => onUpdate({ ...plan, stays: stays.filter((item) => item.id !== stay.id), updatedAt: new Date().toISOString() })} aria-label={`刪除 ${stay.name}`}><Trash2 size={14} /></button></div>}
            </div>
          </article>
        );
      })}</div> : <div className="travel-stay-empty"><Image src="/images/doodle-icons-v2/home-notebook.png" alt="" width={70} height={70} /><div><strong>住宿還沒放進這趟旅行</strong><span>先記飯店與入住日期，排每天路線時才不會一直折返。</span></div></div>}

      <div className="travel-reference-desk">
        <div className="travel-reference-heading"><div><p className="eyebrow">Reference desk</p><h4>旅行參考資料</h4><p>收藏清單與共同表格放在住宿後、每日行程前；規劃時不用離開這趟旅行四處找連結。</p></div>{readOnly ? null : <button className="mini-add-button" onClick={() => { setAddingReference(true); setEditingReferenceId(""); }}><Plus size={15} />新增參考</button>}</div>
        {references.length ? <div className="travel-reference-grid">{references.map((reference) => {
          const meta = referenceKinds[reference.kind];
          const Icon = meta.icon;
          return <article key={reference.id}><a href={reference.url} target="_blank" rel="noreferrer"><span><Icon size={19} /></span><div><small>{meta.label}</small><strong>{reference.label}</strong><p>{reference.description}</p></div><ExternalLink size={15} /></a>{readOnly ? null : <div><button className="icon-button" onClick={() => { setEditingReferenceId(reference.id); setAddingReference(false); }} aria-label={`編輯 ${reference.label}`}><Pencil size={13} /></button><button className="icon-button danger" onClick={() => onUpdate({ ...plan, references: references.filter((item) => item.id !== reference.id), updatedAt: new Date().toISOString() })} aria-label={`刪除 ${reference.label}`}><Trash2 size={13} /></button></div>}</article>;
        })}</div> : <p className="travel-reference-empty">尚未加入 Google Maps 清單、Sheet 或其他旅行資料。</p>}
      </div>

      <AnimatePresence>
        {!readOnly && (addingStay || editingStay) ? <TravelEntryModal id="travel-stay-modal-title" eyebrow="Accommodation" title={editingStay ? "編輯住宿" : "新增住宿"} onClose={() => { setAddingStay(false); setEditingStayId(""); }}><StayForm stay={editingStay} onSave={saveStay} onCancel={() => { setAddingStay(false); setEditingStayId(""); }} /></TravelEntryModal> : null}
      </AnimatePresence>
      <AnimatePresence>
        {!readOnly && (addingReference || editingReference) ? <TravelEntryModal id="travel-reference-modal-title" eyebrow="Reference desk" title={editingReference ? "編輯旅行參考" : "新增旅行參考"} onClose={() => { setAddingReference(false); setEditingReferenceId(""); }}><ReferenceForm reference={editingReference} onSave={saveReference} onCancel={() => { setAddingReference(false); setEditingReferenceId(""); }} /></TravelEntryModal> : null}
      </AnimatePresence>
    </section>
  );
}
