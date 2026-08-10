'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  title, description, confirmLabel = 'Удалить', cancelLabel = 'Отмена',
  danger = true, onConfirm, onClose,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 360 }} role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className="text-base font-semibold mb-2">{title}</h2>
        {description && (
          <div className="text-sm mb-5" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {description}
          </div>
        )}
        <div className="flex gap-2">
          <button ref={cancelRef} className="btn-ghost flex-1" onClick={onClose}>{cancelLabel}</button>
          <button
            className="btn-primary flex-1"
            style={danger ? { background: 'var(--red)' } : undefined}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
