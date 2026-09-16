import { useEffect, useState } from "react";
import { initials } from "../lib/format.js";

export function UserAvatar({
  src,
  label,
  size,
}: {
  src?: string | null;
  label: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const photo = Boolean(src) && !broken;
  return (
    <span
      className="avatar"
      style={size ? { width: size, height: size, fontSize: Math.round(size * 0.31) } : undefined}
    >
      {photo ? <img src={src ?? ""} alt="" onError={() => setBroken(true)} /> : initials(label || "DK")}
    </span>
  );
}
