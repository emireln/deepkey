import { Heart } from "@phosphor-icons/react";
import { SUPPORT_URL } from "@deepkey/config";
import { t } from "../i18n/index.js";
import { usePlatform } from "../platform/context.js";

export function SupportButton({ variant = "nav" }: { variant?: "nav" | "about" }) {
  const platform = usePlatform();

  function open() {
    platform.openExternal(SUPPORT_URL);
  }

  if (variant === "about") {
    return (
      <button type="button" className="btn support-btn" onClick={open}>
        <Heart size={16} weight="bold" />
        {t("support")}
      </button>
    );
  }

  return (
    <button type="button" className="nav-item support-btn" title={t("support")} onClick={open}>
      <Heart className="nav-icon" size={20} weight="bold" />
      <span className="nav-label">{t("support")}</span>
    </button>
  );
}
