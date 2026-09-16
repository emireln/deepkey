import { Minus, Square, X } from "@phosphor-icons/react";
import { Logo } from "./Logo.js";
import { t } from "../i18n/index.js";
import { usePlatform } from "../platform/context.js";
import { useEffect, useState } from "react";

export function Titlebar() {
  const platform = usePlatform();
  const [max, setMax] = useState(false);
  useEffect(() => {
    platform.window?.isMaximized().then(setMax);
  }, [platform]);
  if (platform.kind !== "desktop" || !platform.window) return null;
  return (
    <header className={`titlebar ${platform.os}`}>
      <div className="titlebar-left">
        <Logo size={16} />
        <span className="brand-word titlebar-word">{t("app")}</span>
      </div>
      <div className="titlebar-center" />
      <div className="titlebar-right">
        {platform.os !== "mac" ? (
          <>
            <button type="button" className="win-btn" aria-label={t("minimize")} onClick={() => platform.window?.minimize()}>
              <Minus size={12} />
            </button>
            <button
              type="button"
              className="win-btn"
              aria-label={t("maximize")}
              onClick={() => {
                platform.window?.maximize();
                setMax((v) => !v);
              }}
            >
              {max ? <Square size={10} /> : <Square size={11} />}
            </button>
            <button type="button" className="win-btn close" aria-label={t("close")} onClick={() => platform.window?.close()}>
              <X size={12} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
