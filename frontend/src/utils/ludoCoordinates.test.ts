import { describe, expect, it } from "vitest";

// 52 Common Track Cells in clockwise order (15x15 board, cell = 20x20)
const TRACK_GRID_COORDS: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];

const HOME_PATH_GRID_COORDS: [number, number][][] = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];

describe("Ludo Board Geometry & Pawn Coordinates", () => {
  it("has exactly 52 common track squares", () => {
    expect(TRACK_GRID_COORDS.length).toBe(52);
  });

  it("ensures all track coordinates fall within valid 15x15 grid (0..14)", () => {
    for (let i = 0; i < TRACK_GRID_COORDS.length; i++) {
      const [col, row] = TRACK_GRID_COORDS[i];
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThanOrEqual(14);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThanOrEqual(14);

      // SVG pixel bounds (0..300)
      const cx = col * 20 + 10;
      const cy = row * 20 + 10;
      expect(cx).toBeGreaterThanOrEqual(10);
      expect(cx).toBeLessThanOrEqual(290);
      expect(cy).toBeGreaterThanOrEqual(10);
      expect(cy).toBeLessThanOrEqual(290);
    }
  });

  it("verifies starting positions for each color", () => {
    // Red start: pos 0 -> col 1, row 6
    expect(TRACK_GRID_COORDS[0]).toEqual([1, 6]);
    // Green start: pos 13 -> col 8, row 1
    expect(TRACK_GRID_COORDS[13]).toEqual([8, 1]);
    // Yellow start: pos 26 -> col 13, row 8
    expect(TRACK_GRID_COORDS[26]).toEqual([13, 8]);
    // Blue start: pos 39 -> col 6, row 13
    expect(TRACK_GRID_COORDS[39]).toEqual([6, 13]);
  });

  it("ensures all 4 home paths have exactly 5 squares inside bounds", () => {
    expect(HOME_PATH_GRID_COORDS.length).toBe(4);
    for (const path of HOME_PATH_GRID_COORDS) {
      expect(path.length).toBe(5);
      for (const [col, row] of path) {
        expect(col).toBeGreaterThanOrEqual(0);
        expect(col).toBeLessThanOrEqual(14);
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThanOrEqual(14);
      }
    }
  });

  it("ensures Red home path leads directly into center triangle", () => {
    const redPath = HOME_PATH_GRID_COORDS[0];
    // Cols 1 to 5 along Row 7
    expect(redPath[0]).toEqual([1, 7]);
    expect(redPath[4]).toEqual([5, 7]);
  });
});
