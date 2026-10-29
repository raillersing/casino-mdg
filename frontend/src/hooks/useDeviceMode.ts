import { useContext } from "react";
import { DeviceContext, type DeviceContextValue } from "./deviceContext";
export function useDeviceMode(): DeviceContextValue {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDeviceMode must be used within a DeviceProvider");
  }
  return context;
}
