'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  action?: ToastAction;
  duration?: number;
  tone?: 'neutral' | 'error';
}

interface ToastState extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // Без провайдера тост просто не показывается — вызывающий код не падает
  return ctx ?? { show: () => undefined };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback((message: string, options?: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++seq.current;
    setToast({ id, message, ...options });
    timer.current = setTimeout(() => {
      setToast(current => (current && current.id === id ? null : current));
    }, options?.duration ?? (options?.action ? 6000 : 3000));
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm animate-slide-up"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
            maxWidth: 'min(calc(100vw - 32px), 420px)',
            background: toast.tone === 'error' ? 'var(--red)' : 'var(--text)',
            color: '#fff',
          }}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action?.onClick(); dismiss(); }}
              className="font-medium flex-shrink-0 underline underline-offset-2"
              style={{ color: '#fff' }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
