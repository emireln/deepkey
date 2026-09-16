import { Copy, Eye, EyeSlash } from "@phosphor-icons/react";
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { t } from "../i18n/index.js";
import { mask } from "../lib/format.js";

export function Button({
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "icon" }) {
  const cls =
    variant === "primary"
      ? "btn primary"
      : variant === "ghost"
        ? "btn ghost"
        : variant === "danger"
          ? "btn danger"
          : variant === "icon"
            ? "btn icon"
            : "btn";
  return <button type="button" {...props} className={`${cls} ${props.className ?? ""}`} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  const { mono, className, ...rest } = props;
  return <input className={`input${mono ? " mono" : ""} ${className ?? ""}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`select ${props.className ?? ""}`} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  const { mono, className, ...rest } = props;
  return <textarea className={`textarea${mono ? " mono" : ""} ${className ?? ""}`} {...rest} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export function SecretField(props: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  revealMs: number;
  onCopy: (value: string) => void;
  label?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const id = window.setTimeout(() => setRevealed(false), props.revealMs);
    return () => window.clearTimeout(id);
  }, [revealed, props.revealMs, props.value]);

  return (
    <div className="field">
      {props.label ? <span className="field-label">{props.label}</span> : null}
      <div className="secret-line">
        <Input
          mono
          readOnly={props.readOnly}
          value={revealed ? props.value : mask(props.value)}
          onChange={props.onChange && revealed ? (e) => props.onChange?.(e.target.value) : undefined}
        />
        <Button variant="icon" aria-label={revealed ? t("hide") : t("reveal")} onClick={() => setRevealed((v) => !v)}>
          {revealed ? <EyeSlash size={18} /> : <Eye size={18} />}
        </Button>
        <Button variant="icon" aria-label={t("copy")} onClick={() => props.onCopy(props.value)}>
          <Copy size={18} />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {actions ? <div className="split" style={{ justifyContent: "center", marginTop: 16 }}>{actions}</div> : null}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="checkline">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
