import { createContext, createElement, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n/index.js";
import { Button, Field, Input } from "./controls.js";

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
          <Button onClick={props.onCancel}>{t("cancel")}</Button>
          <Button variant={props.danger ? "danger-solid" : "primary"} onClick={props.onConfirm}>
            {props.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PasswordPrompt(props: {
  title: string;
  body: string;
  confirm: string;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (password: string) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await props.onConfirm(password);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={props.onCancel} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="pw-dlg-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="pw-dlg-title">{props.title}</h2>
        <p>{props.body}</p>
        <Field label={t("confirmMaster")}>
          <Input
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password) void submit();
            }}
          />
        </Field>
        {props.error ? <p className="error-text">{props.error}</p> : null}
        <div className="dialog-actions">
          <Button onClick={props.onCancel}>{t("cancel")}</Button>
          <Button variant="primary" disabled={!password || busy} onClick={() => void submit()}>
            {props.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}
