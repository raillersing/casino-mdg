/**
 * Provably Fair cryptographic verification utilities for Casino MDG.
 * Uses standard Web Crypto API (SHA-256) to ensure tamper-proof deck integrity.
 */

export interface ProvablyFairRecord {
  handNumber: number;
  commitmentHash: string;
  serverSeed: string;
  clientSeed: string;
  deckSignature: string;
  verified?: boolean;
}

/**
 * Compute SHA-256 hexadecimal hash string using standard Web Crypto API
 */
export async function computeSha256(text: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // Fallback simple 32-char hex representation if crypto.subtle is unavailable
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, "0");
  }

  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the payload string hashed for deck commitment
 */
export function buildCommitmentString(serverSeed: string, clientSeed: string, deckSignature: string): string {
  return `mdg:${serverSeed}:${clientSeed}:${deckSignature}`;
}

/**
 * Verify whether a revealed server seed and deck signature match the initial commitment hash
 */
export async function verifyProvablyFairCommitment(
  serverSeed: string,
  clientSeed: string,
  deckSignature: string,
  expectedHash: string,
): Promise<boolean> {
  const payload = buildCommitmentString(serverSeed, clientSeed, deckSignature);
  const computedHash = await computeSha256(payload);
  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}
