"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom";

export default function FloatingSurface({ open, anchorRef, onClose, children, className = "", label, prefer = "auto", role = "dialog" }: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label: string;
  prefer?: Placement | "auto";
  role?: "dialog" | "menu";
}) {
  const reduceMotion = useReducedMotion();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280, placement: "bottom" as Placement, ready: false });

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchor = anchorRef.current;
        const surface = surfaceRef.current;
        if (!anchor || !surface) return;
        const margin = 10;
        const gap = 7;
        const anchorRect = anchor.getBoundingClientRect();
        const surfaceRect = surface.getBoundingClientRect();
        const below = window.innerHeight - anchorRect.bottom - margin;
        const above = anchorRect.top - margin;
        const placement: Placement = prefer === "top"
          ? (above >= Math.min(surfaceRect.height, 260) || above > below ? "top" : "bottom")
          : prefer === "bottom"
            ? (below >= Math.min(surfaceRect.height, 260) || below >= above ? "bottom" : "top")
            : (below >= surfaceRect.height || below >= above ? "bottom" : "top");
        const maxLeft = Math.max(margin, window.innerWidth - surfaceRect.width - margin);
        const left = Math.min(maxLeft, Math.max(margin, anchorRect.left + anchorRect.width / 2 - surfaceRect.width / 2));
        const rawTop = placement === "bottom" ? anchorRect.bottom + gap : anchorRect.top - surfaceRect.height - gap;
        const top = Math.min(window.innerHeight - surfaceRect.height - margin, Math.max(margin, rawTop));
        setPosition({ top, left, width: surfaceRect.width, placement, ready: true });
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    if (surfaceRef.current) observer.observe(surfaceRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchorRef, open, prefer]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose, open]);

  if (!mounted) return null;
  return createPortal(<AnimatePresence>
    {open ? <motion.div ref={surfaceRef} className={`viewport-floating-surface paper-card ${className}`} role={role} aria-label={label} data-placement={position.placement}
      style={{ position: "fixed", top: position.top, left: position.left, visibility: position.ready ? "visible" : "hidden" }}
      initial={reduceMotion ? false : { opacity: 0, y: position.placement === "top" ? 7 : -7, scale: 0.965, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: position.placement === "top" ? 4 : -4, scale: 0.985 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >{children}</motion.div> : null}
  </AnimatePresence>, document.body);
}
