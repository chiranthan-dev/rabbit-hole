import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';

export function Icon({ icon, size = 18, color = 'currentColor', stroke = 1.6 }: { icon: IconSvgElement; size?: number; color?: string; stroke?: number }) {
  return <HugeiconsIcon icon={icon} size={size} color={color} strokeWidth={stroke} />;
}

// ---------------- modal ----------------

export function Modal({ open, onClose, children, width }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        {children}
      </div>
    </div>
  );
}

// ---------------- toasts ----------------

interface ToastState {
  items: { id: number; text: string }[];
  push: (text: string) => void;
}
let tid = 0;
export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (text) => {
    const id = ++tid;
    set((s) => ({ items: [...s.items, { id, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3200);
  },
}));
export const toast = (text: string) => useToasts.getState().push(text);

export function Toasts() {
  const items = useToasts((s) => s.items);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------- tabs ----------------

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- range ----------------

export function Range({ value, min, max, step = 1, onChange, ariaLabel }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; ariaLabel?: string }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--fill': `${fill}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="bar">
      <span style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}

/** Small circular progress ring. */
export function Ring({ value, size = 22, stroke = 2.5, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#FF6D29"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty stack">
      <div className="h2" style={{ color: 'white' }}>
        {title}
      </div>
      {children}
    </div>
  );
}
