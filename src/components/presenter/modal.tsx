'use client';
import { useEffect, useRef } from 'react';

/** Diálogo simples: Esc fecha, foco entra no diálogo, clique fora fecha. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/60 p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-card bg-white p-6 text-navy outline-none">
        <h2 className="title-caps mb-3 text-xl text-brand">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, text, confirmLabel, busy, onConfirm, onClose }: { title: string; text: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-slate">{text}</p>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="btn border-2 border-mist" onClick={onClose}>Cancelar</button>
        <button type="button" disabled={busy} className="btn bg-red-600 text-white hover:bg-red-700" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
