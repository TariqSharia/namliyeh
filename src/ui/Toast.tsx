import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';

type ToastData = { id: number; message: string; undo?: () => Promise<void> | void };

const ToastContext = createContext<(message: string, undo?: ToastData['undo']) => void>(() => {});

/** Every action shows what happened and offers Undo for a few seconds, so a wrong tap is never scary. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const t = useT();

  const show = useCallback((message: string, undo?: ToastData['undo']) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), message, undo });
    timer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 2500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-area" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                className="toast-undo"
                onClick={async () => {
                  const undo = toast.undo;
                  setToast(null);
                  await undo?.();
                  show(t('undone'));
                }}
              >
                {t('undo')}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
