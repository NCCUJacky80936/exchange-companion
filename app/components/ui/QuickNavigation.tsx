"use client";

import { ArrowUp, ChevronUp, MapPin, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { NavSection, TravelPlan } from "../../lib/types";

export default function QuickNavigation({ section, plans }: { section: NavSection; plans: TravelPlan[] }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const goTop = () => { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); setOpen(false); };
  const goTrip = (plan: TravelPlan) => {
    window.dispatchEvent(new CustomEvent("exchange:quick-travel", { detail: { planId: plan.id } }));
    setOpen(false);
  };

  return <div className={`quick-navigation ${open ? "open" : ""}`}>
    <AnimatePresence initial={false} mode="popLayout">
      {open ? <motion.div key="menu" className="quick-navigation-menu" role="menu" aria-label="快速導航"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.72, y: 22, borderRadius: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 18 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.76, y: 18, borderRadius: 28 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 36, mass: 0.72 }}
      >
        <div className="quick-navigation-heading"><span>快速前往</span><button className="icon-button" onClick={() => setOpen(false)} aria-label="收合快速導航"><X size={16} /></button></div>
        <button role="menuitem" onClick={goTop}><ArrowUp size={16} /><span>回到最上方</span></button>
        {section === "travel" ? plans.map((plan, index) => <button role="menuitem" key={plan.id} onClick={() => goTrip(plan)}><MapPin size={15} /><span><small>{String(index + 1).padStart(2, "0")}</small>{plan.title}</span></button>) : null}
      </motion.div> : <motion.button key="trigger" className="quick-navigation-trigger" onClick={() => setOpen(true)} aria-expanded="false" aria-haspopup="menu" aria-label="開啟快速導航"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.84 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 32 }}
      ><ChevronUp size={21} /><span>快速前往</span></motion.button>}
    </AnimatePresence>
  </div>;
}
