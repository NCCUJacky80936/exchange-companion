"use client";

import { X } from "lucide-react";
import { usePresence } from "framer-motion";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  const [isPresent, safeToRemove] = usePresence();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    if (isPresent) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Keep the modal in the top layer until its CSS exit finishes, including
    // browsers without discrete display/overlay transitions.
    let cancelled = false;
    const animations = dialog.getAnimations({ subtree: true });
    const timer = window.setTimeout(finish, 500);
    function finish() {
      if (cancelled) return;
      cancelled = true;
      window.clearTimeout(timer);
      dialog?.close();
      safeToRemove?.();
    }
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [isPresent, safeToRemove]);

  const outside = (event: React.PointerEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };

  return <dialog ref={dialogRef} className={`modal-card paper-card motion-dialog ${className}`}
    role={alert ? "alertdialog" : undefined} aria-labelledby={id}
    data-closing={!isPresent ? "" : undefined}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClose={(event) => { if (isPresent && !event.currentTarget.open) onClose(); }}
    onPointerDown={(event) => { pressedOutside.current = event.target === event.currentTarget && outside(event); }}
    onPointerUp={(event) => {
      if (pressedOutside.current && event.target === event.currentTarget && outside(event)) onClose();
      pressedOutside.current = false;
    }}
  >
    <div className="modal-heading">
      <div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h2 id={id}>{title}</h2></div>
      {/* Native modal opening needs a predictable, non-destructive initial focus. */}
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <button className="icon-button" type="button" autoFocus onClick={onClose} aria-label="關閉視窗" title="關閉"><X size={20} aria-hidden="true" /></button>
    </div>
    {children}
  </dialog>;
}
