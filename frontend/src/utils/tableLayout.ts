/**
 * Computes radial/elliptical seat coordinates for 2-player Heads-Up,
 * 4-player Belote/Rami, 6-max Poker, and 9-max Full Ring tables.
 */
export interface SeatCoordinates {
  left: string;
  top: string;
}

export function getSeatPosition(
  index: number,
  total: number,
  isSeated: boolean,
): SeatCoordinates {
  const rx = total > 5 ? 39 : 41;
  const ry = total > 5 ? 33 : 34;
  const centerX = 50;
  const centerY = 45;

  if (!isSeated) {
    // Spectator view: all players distributed evenly around full 360° ellipse
    const angle = Math.PI / 2 + (index / Math.max(1, total)) * 2 * Math.PI;
    return {
      left: `${(centerX + rx * Math.cos(angle)).toFixed(1)}%`,
      top: `${(centerY + ry * Math.sin(angle)).toFixed(1)}%`,
    };
  }

  // Seated player: Hero is at bottom center (90° / PI/2).
  // Opponents are distributed along a horseshoe arc around the table.
  if (total === 1) {
    return { left: "50%", top: "13%" };
  }
  if (total === 2) {
    const twoPlayerSeats = [
      { left: "22%", top: "25%" },
      { left: "78%", top: "25%" },
    ];
    return twoPlayerSeats[index] ?? { left: "50%", top: "13%" };
  }
  if (total === 3) {
    const threePlayerSeats = [
      { left: "14%", top: "45%" },
      { left: "50%", top: "13%" },
      { left: "86%", top: "45%" },
    ];
    return threePlayerSeats[index] ?? { left: "50%", top: "13%" };
  }

  // 4 to 8 opponents (for 5 to 9 players total):
  // Symmetrically sweep clockwise around the top from bottom-left to bottom-right.
  // Center is top (-90° / -Math.PI / 2).
  const sweepAngle = (145 * Math.PI) / 180; // 145° on each side of top center
  const fraction = (index / Math.max(1, total - 1)) * 2 - 1; // -1 to +1
  const angle = -Math.PI / 2 + fraction * sweepAngle;

  return {
    left: `${(centerX + rx * Math.cos(angle)).toFixed(1)}%`,
    top: `${(centerY + ry * Math.sin(angle)).toFixed(1)}%`,
  };
}
