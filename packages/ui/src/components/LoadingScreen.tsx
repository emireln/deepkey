import { OrbGrid } from "./OrbGrid.js";
import { t } from "../i18n/index.js";

export function LoadingScreen() {
  return (
    <div className="auth-screen loading-screen" role="status" aria-live="polite" aria-label={t("loading")}>
      <OrbGrid
        width={200}
        height={200}
        dotColor="#F4F1EA"
        accentColor="#B3B3B3"
        density={300}
        dotSize={179}
        speed={75}
        spinTurns={1}
        ball={{ tilt: 0, turn: 0, spread: 100 }}
        pointer={{ drag: 0, damping: 20 }}
      />
    </div>
  );
}
