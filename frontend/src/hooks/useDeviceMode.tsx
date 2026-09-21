import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type DeviceMode = "auto" | "desktop" | "mobile";

interface DeviceContextValue {
  mode: DeviceMode;
  isMobile: boolean;
  hasTouch: boolean;
  setMode: (mode: DeviceMode) => void;
  toggleMode: () => void;
}

const DeviceContext = createContext<DeviceContextValue | undefined>(undefined);

const STORAGE_KEY = "casino_mdg_device_mode";

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DeviceMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "desktop" || stored === "mobile" || stored === "auto") {
        return stored;
      }
    } catch {
      // Ignore localStorage read errors
    }
    return "auto";
  });

  const [windowIsNarrow, setWindowIsNarrow] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 900;
  });

  const [hasTouch, setHasTouch] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches
    );
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 899px)");
    const handler = (e: MediaQueryListEvent) => {
      setWindowIsNarrow(e.matches);
    };

    setWindowIsNarrow(mediaQuery.matches);
    mediaQuery.addEventListener("change", handler);

    // Update touch capability
    setHasTouch(
      "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches,
    );

    return () => {
      mediaQuery.removeEventListener("change", handler);
    };
  }, []);

  const setMode = (newMode: DeviceMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // Ignore
    }
  };

  const isMobile = useMemo(() => {
    if (mode === "desktop") return false;
    if (mode === "mobile") return true;
    return windowIsNarrow;
  }, [mode, windowIsNarrow]);

  // Sync root element class for CSS selectors (.device-mobile / .device-desktop)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (isMobile) {
      root.classList.add("device-mobile");
      root.classList.remove("device-desktop");
    } else {
      root.classList.add("device-desktop");
      root.classList.remove("device-mobile");
    }
  }, [isMobile]);

  const toggleMode = () => {
    if (isMobile) {
      setMode("desktop");
    } else {
      setMode("mobile");
    }
  };

  const value = useMemo(
    () => ({
      mode,
      isMobile,
      hasTouch,
      setMode,
      toggleMode,
    }),
    [mode, isMobile, hasTouch],
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDeviceMode(): DeviceContextValue {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDeviceMode must be used within a DeviceProvider");
  }
  return context;
}
