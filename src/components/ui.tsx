'use client';
import { X, ArrowUpRight, Dumbbell } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { completion, formatDate, statusLabel, type WorkoutSession } from '@/lib/domain';
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Dumbbell size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
    >
      <span style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}
export function SessionCard({
  session,
  today,
  onOpen,
}: {
  session: WorkoutSession;
  today: string;
  onOpen: (id: string) => void;
}) {
  const c = completion([session]);
  return (
    <button className="session-card" onClick={() => onOpen(session.id)}>
      <span className="session-icon">
        <Dumbbell size={21} />
      </span>
      <span className="session-info">
        <span className="eyebrow">
          {formatDate(session.date, { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <strong>{session.title}</strong>
        <span className="muted">
          {c.completed}/{c.total} exercises · {statusLabel(session, today)}
        </span>
      </span>
      <span className="session-trailing">
        <span>{c.percent === null ? '—' : `${c.percent}%`}</span>
        <ArrowUpRight size={19} />
      </span>
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="row between">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
