import { createContext } from "react";
export type DeviceMode = "auto" | "desktop" | "mobile";

export interface DeviceContextValue {
  mode: DeviceMode;
  isMobile: boolean;
  hasTouch: boolean;
  setMode: (mode: DeviceMode) => void;
  toggleMode: () => void;
}

export const DeviceContext = createContext<DeviceContextValue | undefined>(
  undefined,
);
