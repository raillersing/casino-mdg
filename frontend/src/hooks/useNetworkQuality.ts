import { useEffect, useState, useCallback, useRef } from "react";

export type NetworkQualityLevel = "good" | "fair" | "poor" | "offline";

export interface NetworkQualityState {
  isOnline: boolean;
  latencyMs: number | null;
  effectiveType: string;
  quality: NetworkQualityLevel;
  lastChecked: number;
  jitter: number;
  samples: number[];
  downlink: number | null;
  isTesting: boolean;
}

export function useNetworkQuality(pollIntervalMs = 12000) {
  const [samples, setSamples] = useState<number[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [state, setState] = useState<Omit<NetworkQualityState, "samples" | "jitter" | "isTesting">>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    latencyMs: null,
    effectiveType: typeof navigator !== "undefined" ? ((navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType || "4g") : "4g",
    quality: "good",
    lastChecked: Date.now(),
    downlink: typeof navigator !== "undefined" ? ((navigator as unknown as { connection?: { downlink?: number } }).connection?.downlink || null) : null,
  });

  const isCheckingRef = useRef(false);

  const measurePing = useCallback(async () => {
    if (typeof window === "undefined" || isCheckingRef.current) return;
    if (!navigator.onLine) {
      setState((prev) => ({
        ...prev,
        isOnline: false,
        latencyMs: null,
        quality: "offline",
        lastChecked: Date.now(),
      }));
      return;
    }

    isCheckingRef.current = true;
    setIsTesting(true);
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch("/api/v1/ping/", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const duration = Math.round(performance.now() - start);
        const navConn = typeof navigator !== "undefined" ? (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number } }).connection : undefined;
        const effType = navConn?.effectiveType || "4g";
        const dl = navConn?.downlink ?? null;

        let quality: NetworkQualityLevel = "good";
        if (duration >= 350) quality = "poor";
        else if (duration >= 150) quality = "fair";

        setSamples((prev) => [...prev.slice(-4), duration]);
        setState({
          isOnline: true,
          latencyMs: duration,
          effectiveType: effType,
          downlink: dl,
          quality,
          lastChecked: Date.now(),
        });
      } else {
        setState((prev) => ({
          ...prev,
          isOnline: true,
          latencyMs: 999,
          quality: "poor",
          lastChecked: Date.now(),
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        isOnline: false,
        latencyMs: null,
        quality: "offline",
        lastChecked: Date.now(),
      }));
    } finally {
      isCheckingRef.current = false;
      setIsTesting(false);
    }
  }, []);

  const jitter = samples.length >= 2
    ? Math.round(
        samples.slice(1).reduce((acc, curr, idx) => acc + Math.abs(curr - samples[idx]), 0) /
          (samples.length - 1),
      )
    : 0;

  useEffect(() => {
    const handleOnline = () => {
      void measurePing();
    };
    const handleOffline = () => {
      setState((prev) => ({
        ...prev,
        isOnline: false,
        latencyMs: null,
        quality: "offline",
        lastChecked: Date.now(),
      }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial ping measurement
    void measurePing();

    const interval = setInterval(() => {
      void measurePing();
    }, pollIntervalMs);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [measurePing, pollIntervalMs]);

  return { ...state, samples, jitter, isTesting, refresh: measurePing };
}
