import { createContext, useContext } from "react";
import type { PlatformAdapter } from "./types.js";

export const PlatformContext = createContext<PlatformAdapter | null>(null);

export function usePlatform(): PlatformAdapter {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("Platform is not available.");
  return value;
}
