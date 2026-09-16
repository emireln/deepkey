import { useEffect, useRef, type CSSProperties } from "react";

const MAX_DPR = 2;
const TAU = Math.PI * 2;
const PERIOD = 5;
const BASE_SPREAD = 0.28;
const PERSPECTIVE = 3.5;
const DEPTH_SIZE = 1;
const DEPTH_FADE = 1;
const MIN_RADIUS = 0.6;
const MAX_DOTS = 1024;

type Dot = [number, number, number, number?, number?, string?];
type Emit = (x: number, y: number, r: number, a: number, col: string) => void;
type RGBA = [number, number, number, number];

type Params = {
  n: number;
  sp: number;
  ds: number;
  yw: number;
  sn: number;
  pc: number;
  t: number;
  dot: string;
  acc: string;
};

type Ball = { spread?: number; turn?: number; tilt?: number };
type Pointer = { drag?: number; damping?: number };

export interface OrbGridProps {
  style?: CSSProperties;
  width?: number;
  height?: number;
  dotColor?: string;
  accentColor?: string;
  density?: number;
  dotSize?: number;
  speed?: number;
  spinTurns?: number;
  ball?: Ball;
  pointer?: Pointer;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clampN(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}

function dotsCbrt(base: number, n: number): number {
  const v = Math.round(base * Math.pow(n, 1 / 3));
  return v < 1 ? 1 : v;
}

function spin(p: Dot, yaw: number, pitch: number): Dot {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  const rx = x * ca - z * sa;
  let rz = x * sa + z * ca;
  const co = Math.cos(pitch);
  const so = Math.sin(pitch);
  const ry = y * co - rz * so;
  rz = y * so + rz * co;
  return [rx, ry, rz, p[3], p[4], p[5]];
}

function frame(t: number, P: Params, out: Dot[]): void {
  const k = 0.5 - 0.5 * Math.cos(TAU * t);
  const m = dotsCbrt(2, P.n);
  for (let x = -m; x <= m; x += 1) {
    for (let y = -m; y <= m; y += 1) {
      for (let z = -m; z <= m; z += 1) {
        const px = (x / m) * 0.62;
        const py = (y / m) * 0.62;
        const pz = (z / m) * 0.62;
        const len = Math.hypot(px, py, pz);
        const ux = len < 1e-6 ? px : px / len;
        const uy = len < 1e-6 ? py : py / len;
        const uz = len < 1e-6 ? pz : pz / len;
        const corner = Math.abs(x) === m && Math.abs(y) === m && Math.abs(z) === m;
        out.push(
          spin(
            [
              px + (ux - px) * k,
              py + (uy - py) * k,
              pz + (uz - pz) * k,
              corner ? 1.3 : 0.8,
              0.9,
              corner ? P.acc : P.dot,
            ],
            TAU * t,
            0.42,
          ),
        );
      }
    }
  }
}

function project(pts: Dot[], size: number, P: Params, emit: Emit): void {
  const c = size / 2;
  const R = size * BASE_SPREAD * P.sp;
  const pv = PERSPECTIVE;
  const yaw = P.yw + TAU * P.sn * P.t;
  const list: Array<[number, number, number, number, string, number]> = [];
  for (const p of pts) {
    const q = spin(p, yaw, P.pc);
    const z = q[2];
    const s = pv / (pv - z);
    const f = clamp01((z + 1.1) / 2.2);
    list.push([
      c + q[0] * R * s,
      c + q[1] * R * s,
      P.ds * (0.4 + 1.6 * DEPTH_SIZE * f) * s * (q[3] === undefined ? 1 : q[3]),
      (0.07 + 0.93 * Math.pow(f, 1.55 * DEPTH_FADE)) * (q[4] === undefined ? 1 : q[4]),
      q[5] || P.dot,
      z,
    ]);
  }
  list.sort((a, b) => (a[5] ?? 0) - (b[5] ?? 0));
  for (const d of list) {
    emit(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0, d[4] ?? P.dot);
  }
}

const fitCache = new Map<string, number>();

function autoFit(size: number, P: Params, restYaw: number, restPitch: number): number {
  const key = `${size}/${P.n}/${P.sp}/${restYaw}/${restPitch}/${P.sn}`;
  const hit = fitCache.get(key);
  if (hit !== undefined) return hit;
  const half = size / 2;
  let ext = 0;
  const probe: Params = { ...P, ds: 1, dot: "#fff", acc: "#fff", t: 0, yw: restYaw, pc: restPitch };
  const emit: Emit = (x, y, r, a) => {
    if (a <= 0.05 || r <= 0.15) return;
    ext = Math.max(ext, Math.abs(x - half) + 0.5 * r, Math.abs(y - half) + 0.5 * r);
  };
  for (let k = 0; k < 20; k += 1) {
    probe.t = k / 20;
    const out: Dot[] = [];
    frame(probe.t, probe, out);
    project(out, size, probe, emit);
  }
  const fit = ext > 1 ? Math.max(0.55, Math.min(1.7, (0.415 * size) / ext)) : 1;
  fitCache.set(key, fit);
  return fit;
}

function dotScaleFor(size: number): number {
  if (size <= 46) return 0.4;
  if (size <= 190) return 0.4 + ((size - 46) / 144) * 0.6;
  if (size <= 340) return 1 + ((size - 190) / 150) * 0.55;
  return 1.55;
}

function parseColor(input: string | undefined, fb: RGBA): RGBA {
  if (!input) return fb;
  const str = input.trim();
  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const a = hex[0] ?? "0";
      const b = hex[1] ?? "0";
      const c = hex[2] ?? "0";
      const d = hex[3];
      hex = a + a + b + b + c + c + (d ? d + d : "");
    }
    if (hex.length >= 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length >= 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b, a];
    }
    return fb;
  }
  const m = str.match(/[\d.]+/g);
  if (m && m.length >= 3) {
    return [
      Math.min(255, Number.parseFloat(m[0] ?? "0")),
      Math.min(255, Number.parseFloat(m[1] ?? "0")),
      Math.min(255, Number.parseFloat(m[2] ?? "0")),
      m.length >= 4 ? Math.min(1, Number.parseFloat(m[3] ?? "1")) : 1,
    ];
  }
  return fb;
}

function css(c: RGBA): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3]})`;
}

export function OrbGrid({
  style,
  width,
  height,
  dotColor = "#F4F1EA",
  accentColor = "#B3B3B3",
  density = 300,
  dotSize = 179,
  speed = 75,
  spinTurns = 1,
  ball,
  pointer,
}: OrbGridProps) {
  const ball_ = { spread: 100, turn: 0, tilt: 0, ...ball };
  const pointer_ = { drag: 0, damping: 20, ...pointer };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  sizeRef.current = { w: num(width, 0), h: num(height, 0) };

  const vRef = useRef({
    dot: dotColor,
    acc: accentColor,
    speed: clampN(num(speed, 50), -100, 100) / 50,
    density: clampN(num(density, 100), 20, 300) / 100,
    dotSize: clampN(num(dotSize, 100), 20, 300) / 100,
    spinTurns: Math.round(clampN(num(spinTurns, 1), -3, 3)),
    drag: clampN(num(pointer_.drag, 0), 0, 300) / 100,
    damping: clampN(num(pointer_.damping, 20), 1, 100),
    spread: clampN(num(ball_.spread, 100), 40, 180) / 100,
    turn: (clampN(num(ball_.turn, 0), -180, 180) * Math.PI) / 180,
    tilt: (clampN(num(ball_.tilt, 0), -90, 90) * Math.PI) / 180,
  });
  vRef.current = {
    dot: dotColor,
    acc: accentColor,
    speed: clampN(num(speed, 50), -100, 100) / 50,
    density: clampN(num(density, 100), 20, 300) / 100,
    dotSize: clampN(num(dotSize, 100), 20, 300) / 100,
    spinTurns: Math.round(clampN(num(spinTurns, 1), -3, 3)),
    drag: clampN(num(pointer_.drag, 0), 0, 300) / 100,
    damping: clampN(num(pointer_.damping, 20), 1, 100),
    spread: clampN(num(ball_.spread, 100), 40, 180) / 100,
    turn: (clampN(num(ball_.turn, 0), -180, 180) * Math.PI) / 180,
    tilt: (clampN(num(ball_.tilt, 0), -90, 90) * Math.PI) / 180,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drag = { active: false, lx: 0, ly: 0, lt: 0, yaw: 0, pitch: 0, vx: 0, vy: 0 };
    let raf = 0;
    let last = performance.now();
    let phase = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const v = vRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cw = sizeRef.current.w || canvas.clientWidth || 120;
      const ch = sizeRef.current.h || canvas.clientHeight || 120;
      const bw = Math.max(1, Math.round(cw * dpr));
      const bh = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      if (!reduce) {
        phase = (phase + (dt * v.speed) / PERIOD) % 1;
        if (phase < 0) phase += 1;
      }

      const size = Math.max(4, Math.min(cw, ch));
      const bx = (cw - size) / 2;
      const by = (ch - size) / 2;
      const dotCol = css(parseColor(v.dot, [244, 241, 234, 1]));
      const accCol = css(parseColor(v.acc, [179, 179, 179, 1]));

      if (!drag.active) {
        const decay = Math.exp(-v.damping * 0.12 * dt);
        drag.yaw += drag.vx * dt;
        drag.pitch += drag.vy * dt;
        drag.vx *= decay;
        drag.vy *= decay;
      }
      const restPitch = v.tilt;
      drag.pitch = clampN(drag.pitch, -Math.PI / 2 - restPitch, Math.PI / 2 - restPitch);

      const P: Params = {
        n: v.density,
        sp: v.spread,
        ds: dotScaleFor(size) * v.dotSize,
        yw: v.turn + drag.yaw,
        sn: v.spinTurns,
        pc: restPitch + drag.pitch,
        t: phase,
        dot: dotCol,
        acc: accCol,
      };

      const fit = autoFit(size, P, v.turn, restPitch);
      const half = size / 2;
      const out: Dot[] = [];
      frame(phase, P, out);
      let drawn = 0;
      project(out, size, P, (x, y, r, a, col) => {
        if (drawn >= MAX_DOTS) return;
        const rr = r * (0.55 + 0.45 * fit);
        if (rr <= 0.05 || a <= 0.004) return;
        const cx = bx + half + (x - half) * fit;
        const cy = by + half + (y - half) * fit;
        let dr = rr;
        let da = Math.min(1, a);
        if (dr < MIN_RADIUS) {
          da *= (dr / MIN_RADIUS) * (dr / MIN_RADIUS);
          dr = MIN_RADIUS;
        }
        ctx.globalAlpha = da;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, dr, 0, TAU);
        ctx.fill();
        drawn += 1;
      });
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(render);
    };

    const onDown = (e: PointerEvent) => {
      if (vRef.current.drag <= 0) return;
      drag.active = true;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      drag.lt = performance.now();
      drag.vx = 0;
      drag.vy = 0;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.active) return;
      const k = (vRef.current.drag * TAU) / Math.max(1, canvas.clientWidth || 120);
      const dx = (e.clientX - drag.lx) * k;
      const dy = (e.clientY - drag.ly) * k;
      const now2 = performance.now();
      const span = Math.max(1, now2 - drag.lt);
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      drag.lt = now2;
      drag.yaw -= dx;
      drag.pitch += dy;
      drag.vx = (-dx / span) * 1000;
      drag.vy = (dy / span) * 1000;
    };
    const onUp = () => {
      drag.active = false;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div
      className="orb-grid"
      style={{
        position: "relative",
        overflow: "hidden",
        minWidth: 24,
        minHeight: 24,
        width: typeof width === "number" && width > 0 ? width : "100%",
        height: typeof height === "number" && height > 0 ? height : "100%",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: pointer_.drag > 0 ? "none" : "auto",
        }}
      />
    </div>
  );
}
