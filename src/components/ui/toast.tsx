import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Toast = { id: number; tone: 'success' | 'error'; message: string; action?: { label: string; onClick: () => void } };
type Ctx = { show: (t: Omit<Toast, 'id'>) => void };

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      // A toast with a button (like "New order … View") stays until dismissed or pushed out by
      // newer ones, so nobody has to race a timer to use it.
      if (!t.action) setTimeout(() => dismiss(id), t.tone === 'error' ? 8000 : 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Screen readers: confirmations are announced politely, problems straight away. */}
      <div role="status" aria-live="polite" className="sr-only">
        {toasts.filter((t) => t.tone === 'success').at(-1)?.message}
      </div>
      <div role="alert" className="sr-only">
        {toasts.filter((t) => t.tone === 'error').at(-1)?.message}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[10px] border bg-ink px-4 py-3 text-[15px] text-paper shadow-[var(--shadow-float)]',
              'animate-[toast-in_180ms_var(--ease-out)]',
            )}
          >
            {t.tone === 'success' ? (
              <CircleCheck size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#8fd3b0]" aria-hidden />
            ) : (
              <CircleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#f2a49d]" aria-hidden />
            )}
            <p className="flex-1">{t.message}</p>
            {t.action && (
              <button
                className="font-semibold underline underline-offset-4"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="-my-1.5 -mr-2 rounded p-2 text-paper/70 hover:text-paper" aria-label="Dismiss">
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.show;
}
