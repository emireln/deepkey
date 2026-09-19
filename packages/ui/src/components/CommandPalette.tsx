import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { itemSecret, type CommandId } from "@deepkey/vault-core";
import { useVault } from "../state/vault.js";
import { t } from "../i18n/index.js";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { engine, lock, copySecret } = useVault();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const hits = useMemo(() => engine.search(q), [engine, q, open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((n) => Math.min(hits.length - 1, n + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((n) => Math.max(0, n - 1));
      }
      if (e.key === "Enter") {
        const hit = hits[active];
        if (!hit) return;
        if ((e.metaKey || e.ctrlKey) && hit.kind === "item") {
          e.preventDefault();
          copyItem(hit.id);
          return;
        }
        go(hit.id, hit.kind);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hits, active]);

  if (!open) return null;

  function copyItem(id: string) {
    const item = engine.getItem(id);
    const secret = item ? itemSecret(item) : null;
    if (!secret) {
      go(id, "item");
      return;
    }
    onClose();
    void copySecret(secret);
  }

  function go(id: string, kind: string) {
    onClose();
    if (kind === "command") {
      const map: Record<CommandId, string | (() => void)> = {
        "new-secret": "/new",
        "new-project": "/projects?new=1",
        "import-env": "/env/import",
        "compare-env": "/env?compare=1",
        lock: () => lock(),
        generator: "/generator",
        settings: "/settings",
      };
      const target = map[id as CommandId];
      if (typeof target === "function") target();
      else if (target) navigate(target);
      return;
    }
    if (kind === "item") navigate(`/vault/${id}`);
    if (kind === "project") navigate(`/projects/${id}`);
    if (kind === "environment") navigate(`/env`);
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <MagnifyingGlass size={18} weight="bold" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("paletteHint")} />
        </div>
        <div className="palette-list">
          {hits.map((hit, i) => (
            <button
              type="button"
              key={`${hit.kind}-${hit.id}`}
              className={`palette-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(hit.id, hit.kind)}
            >
              <span>{hit.title}</span>
              <span className="cell-muted">{hit.kind === "item" ? `${hit.subtitle} · ${t("copyValue")}` : hit.subtitle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
