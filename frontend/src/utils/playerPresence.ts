/**
 * A seat, cached participant or missing field is not evidence of a live socket.
 * Only the authoritative explicit true is a confirmed connection.
 */
export function isConfirmedConnection(value: unknown): boolean {
  return value === true;
}
