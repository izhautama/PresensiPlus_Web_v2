import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./Icon";

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/\s+/g, "-");
  return <span className={`badge badge-${key}`}><span className="badge-dot" />{status}</span>;
}

export function Modal({ title, subtitle, onClose, children, width = 480 }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.modal-close)")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="form-modal" style={{ width: `min(${width}px, 100%)` }} role="dialog" aria-modal="true" aria-label={title} ref={ref} onMouseDown={(e) => e.stopPropagation()}>
        <div className="form-modal-head">
          <div><p>{title}</p>{subtitle && <span>{subtitle}</span>}</div>
          <button className="modal-close" onClick={onClose} aria-label="Tutup"><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {children}
      {error ? <span className="form-error">{error}</span> : hint ? <span className="form-hint">{hint}</span> : null}
    </label>
  );
}

export function Empty({ icon = "file", title, text }: { icon?: Parameters<typeof Icon>[0]["name"]; title: string; text?: string }) {
  return (
    <div className="empty-state">
      <span className="stat-icon green"><Icon name={icon} /></span>
      <p>{title}</p>
      {text && <span>{text}</span>}
    </div>
  );
}

export function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className={`spinner ${dark ? "spinner-dark" : ""}`} />;
}
