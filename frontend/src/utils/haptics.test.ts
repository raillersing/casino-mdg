import { describe, it, expect, vi, beforeEach } from "vitest";
import { haptics } from "./haptics";

describe("Haptics Tactile Utility", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: () => null,
    };
    // Attach to globalThis.localStorage
    Object.defineProperty(globalThis, "localStorage", {
      value: storageMock,
      configurable: true,
      writable: true,
    });
  });

  it("reports correctly whether navigator.vibrate is supported", () => {
    const supported = haptics.isSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("defaults to enabled when no preference is set in storage", () => {
    // When vibrate is mocked as supported
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    expect(haptics.isEnabled()).toBe(true);
  });

  it("can be toggled off and on in localStorage", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });

    haptics.setEnabled(false);
    expect(globalThis.localStorage.getItem("casino_haptics_enabled")).toBe("false");
    expect(haptics.isEnabled()).toBe(false);

    haptics.setEnabled(true);
    expect(globalThis.localStorage.getItem("casino_haptics_enabled")).toBe("true");
    expect(haptics.isEnabled()).toBe(true);
  });

  it("triggers haptic patterns without throwing errors", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });
    haptics.setEnabled(true);

    haptics.lightTick();
    expect(vibrateMock).toHaveBeenCalledWith(15);

    haptics.cardDeal();
    expect(vibrateMock).toHaveBeenCalledWith([15, 30, 15]);

    haptics.betPlaced();
    expect(vibrateMock).toHaveBeenCalledWith(35);

    haptics.actionTurnAlert();
    expect(vibrateMock).toHaveBeenCalledWith([80, 50, 80]);

    haptics.winCelebration();
    expect(vibrateMock).toHaveBeenCalledWith([60, 40, 100, 50, 180]);

    haptics.fold();
    expect(vibrateMock).toHaveBeenCalledWith(45);
  });
});
