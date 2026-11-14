import { describe, expect, it } from "vitest";
import { isConfirmedConnection } from "./playerPresence";

describe("confirmed multiplayer presence", () => {
  it("requires an explicit true, never infers it from a reserved seat", () => {
    expect(isConfirmedConnection(true)).toBe(true);
    expect(isConfirmedConnection(false)).toBe(false);
    expect(isConfirmedConnection(undefined)).toBe(false);
    expect(isConfirmedConnection(null)).toBe(false);
    expect(isConfirmedConnection(1)).toBe(false);
    expect(isConfirmedConnection("true")).toBe(false);
  });
});
