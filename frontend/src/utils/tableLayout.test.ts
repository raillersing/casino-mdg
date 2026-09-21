import { describe, expect, it } from "vitest";
import { getSeatPosition } from "./tableLayout";

describe("tableLayout getSeatPosition", () => {
  it("places single opponent at top center for heads-up", () => {
    const pos = getSeatPosition(0, 1, true);
    expect(pos).toEqual({ left: "50%", top: "13%" });
  });

  it("places 3 opponents symmetrically for 4-player games", () => {
    const left = getSeatPosition(0, 3, true);
    const top = getSeatPosition(1, 3, true);
    const right = getSeatPosition(2, 3, true);

    expect(left).toEqual({ left: "14%", top: "45%" });
    expect(top).toEqual({ left: "50%", top: "13%" });
    expect(right).toEqual({ left: "86%", top: "45%" });
  });

  it("places 5 opponents without overlap for 6-max table", () => {
    const positions = Array.from({ length: 5 }, (_, i) =>
      getSeatPosition(i, 5, true),
    );

    // Verify all 5 positions are unique
    const uniqueLefts = new Set(positions.map((p) => p.left));
    expect(uniqueLefts.size).toBe(5);

    // Verify horizontal symmetry: seat 0 matches seat 4, seat 1 matches seat 3
    const p0Left = parseFloat(positions[0].left);
    const p4Left = parseFloat(positions[4].left);
    expect(p0Left + p4Left).toBeCloseTo(100, 0);

    const p1Left = parseFloat(positions[1].left);
    const p3Left = parseFloat(positions[3].left);
    expect(p1Left + p3Left).toBeCloseTo(100, 0);

    // Seat 2 is top center
    expect(positions[2].left).toBe("50.0%");
  });

  it("places 8 opponents without overlap for 9-max full ring table", () => {
    const positions = Array.from({ length: 8 }, (_, i) =>
      getSeatPosition(i, 8, true),
    );

    expect(positions.length).toBe(8);

    // Parse numeric coordinates
    const parsed = positions.map((p) => ({
      x: parseFloat(p.left),
      y: parseFloat(p.top),
    }));

    // Verify no two seats are on top of each other (minimum Euclidean distance in % space > 10%)
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const dist = Math.hypot(
          parsed[i].x - parsed[j].x,
          parsed[i].y - parsed[j].y,
        );
        expect(dist).toBeGreaterThan(12);
      }
    }

    // Verify all seats stay inside table boundaries (5% to 95% horizontally, 10% to 80% vertically)
    for (const p of parsed) {
      expect(p.x).toBeGreaterThan(8);
      expect(p.x).toBeLessThan(92);
      expect(p.y).toBeGreaterThan(10);
      expect(p.y).toBeLessThan(75);
    }
  });

  it("distributes all players in 360 circle for spectator mode", () => {
    const positions = Array.from({ length: 9 }, (_, i) =>
      getSeatPosition(i, 9, false),
    );
    expect(positions.length).toBe(9);

    // Check all seats stay within table margins
    for (const pos of positions) {
      const x = parseFloat(pos.left);
      const y = parseFloat(pos.top);
      expect(x).toBeGreaterThan(5);
      expect(x).toBeLessThan(95);
      expect(y).toBeGreaterThan(5);
      expect(y).toBeLessThan(85);
    }
  });
});
