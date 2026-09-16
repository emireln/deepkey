import { createContext, createElement, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastHost({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 1400);
  }, []);
  return createElement(
    ToastContext.Provider,
    { value: show },
    children,
    message ? createElement("div", { className: "toast", role: "status" }, message) : null,
  );
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

export function Dialog(props: {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" onClick={props.onCancel} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-title">{props.title}</h2>
        <p>{props.body}</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" className={props.danger ? "btn danger-solid" : "btn primary"} onClick={props.onConfirm}>
            {props.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
