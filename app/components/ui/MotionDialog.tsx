"use client";

import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useEffect, useRef } from "react";

export default function MotionDialog({ id, eyebrow, title, children, onClose, className = "", alert = false }: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  alert?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? [])];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [onClose]);

  return <motion.div
    className="modal-backdrop motion-dialog-backdrop"
    initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reduceMotion ? 0 : 0.18 }}
    onMouseDown={(event) => event.target === event.currentTarget && onClose()}
  >
    <motion.div ref={dialogRef} className={`modal-card paper-card motion-dialog ${className}`} role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={id}
      initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.975, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, scale: 0.99, filter: "blur(2px)" }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 430, damping: 34, mass: 0.72 }}
    >
      <div className="modal-heading">
        <div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h2 id={id}>{title}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="關閉視窗" title="關閉"><X size={20} /></button>
      </div>
      {children}
    </motion.div>
  </motion.div>;
}
