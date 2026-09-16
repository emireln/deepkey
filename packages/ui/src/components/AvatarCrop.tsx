import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/index.js";
import { Button } from "./controls.js";

const VIEW = 280;
const OUT = 256;

export function AvatarCrop({
  src,
  onCancel,
  onConfirm,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setReady(true);
    };
    img.onerror = () => setFailed(true);
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const cover = Math.max(VIEW / size.w, VIEW / size.h);
  const scale = cover * zoom;
  const dw = size.w * scale;
  const dh = size.h * scale;
  const maxPanX = Math.max(0, (dw - VIEW) / 2);
  const maxPanY = Math.max(0, (dh - VIEW) / 2);
  const panX = Math.min(maxPanX, Math.max(-maxPanX, pan.x));
  const panY = Math.min(maxPanY, Math.max(-maxPanY, pan.y));
  const left = VIEW / 2 + panX - dw / 2;
  const top = VIEW / 2 + panY - dh / 2;

  function confirm() {
    const source = imgRef.current;
    if (!source) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#141516";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const sx = -left / scale;
    const sy = -top / scale;
    const sw = VIEW / scale;
    const sh = VIEW / scale;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, OUT, OUT);
    onConfirm(canvas.toDataURL("image/jpeg", 0.9));
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel} role="presentation">
      <div
        className="dialog crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="crop-title">{t("cropAvatar")}</h2>
        <p>{t("dragToReposition")}</p>
        {failed ? <p className="error-text">{t("avatarFailed")}</p> : null}
        <div
          className={`crop-stage${drag ? " is-dragging" : ""}`}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            setDrag({ x: e.clientX, y: e.clientY, panX, panY });
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            setPan({
              x: drag.panX + (e.clientX - drag.x),
              y: drag.panY + (e.clientY - drag.y),
            });
          }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          {ready ? (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ width: dw, height: dh, left, top }}
            />
          ) : null}
        </div>
        <label className="field-label" htmlFor="avatar-zoom">
          {t("zoom")}
        </label>
        <input
          id="avatar-zoom"
          className="crop-zoom"
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          disabled={!ready}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
        <div className="dialog-actions">
          <Button onClick={onCancel}>{t("cancel")}</Button>
          <Button variant="primary" disabled={!ready || failed} onClick={confirm}>
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
