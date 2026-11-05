import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webNotifications } from "./notifications";

describe("webNotifications utility", () => {
  const originalNotification = globalThis.Notification;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
  });

  it("reports correctly if notification is supported", () => {
    // In node environment without mock, check result
    const supported = webNotifications.isSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("handles permission request gracefully when Notification is not available", async () => {
    // @ts-expect-error Mocking missing Notification
    delete globalThis.Notification;
    const perm = await webNotifications.requestPermission();
    expect(perm).toBe("denied");
  });

  it("requests permission when Notification is supported", async () => {
    const mockRequest = vi.fn().mockResolvedValue("granted");
    // @ts-expect-error Mocking Notification constructor
    globalThis.Notification = {
      requestPermission: mockRequest,
      permission: "default",
    };

    const perm = await webNotifications.requestPermission();
    expect(mockRequest).toHaveBeenCalled();
    expect(perm).toBe("granted");
  });

  it("does not send notification if permission is denied", () => {
    // @ts-expect-error Mocking Notification
    globalThis.Notification = {
      permission: "denied",
      requestPermission: vi.fn(),
    };

    const sent = webNotifications.send("Test Title");
    expect(sent).toBe(false);
  });

  it("sends notification successfully when permission is granted", () => {
    const mockConstructor = vi.fn();
    // @ts-expect-error Mocking Notification
    globalThis.Notification = Object.assign(mockConstructor, {
      permission: "granted",
      requestPermission: vi.fn(),
    });

    const sent = webNotifications.send("♠ C'est votre tour !", {
      body: "À vous de jouer",
    });
    expect(sent).toBe(true);
    expect(mockConstructor).toHaveBeenCalledWith(
      "♠ C'est votre tour !",
      expect.objectContaining({
        body: "À vous de jouer",
      }),
    );
  });
});
