import { describe, it, expect } from "vitest";
import {
  computeSha256,
  buildCommitmentString,
  verifyProvablyFairCommitment,
} from "./provablyFair";

describe("Provably Fair SHA-256 Engine", () => {
  it("computes standard SHA-256 hash correctly", async () => {
    // Standard empty string SHA-256 hash
    const emptyHash = await computeSha256("");
    expect(emptyHash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("builds canonical commitment string with mdg prefix", () => {
    const commitment = buildCommitmentString(
      "server123",
      "client456",
      "A♠,K♥,Q♦",
    );
    expect(commitment).toBe("mdg:server123:client456:A♠,K♥,Q♦");
  });

  it("verifies commitment when seed and deck signature are genuine", async () => {
    const serverSeed = "server_secret_key_892";
    const clientSeed = "client_public_seed_441";
    const deckSignature = "A♠,K♥,Q♦,J♣,10♠";

    const payload = buildCommitmentString(
      serverSeed,
      clientSeed,
      deckSignature,
    );
    const validHash = await computeSha256(payload);

    const isValid = await verifyProvablyFairCommitment(
      serverSeed,
      clientSeed,
      deckSignature,
      validHash,
    );
    expect(isValid).toBe(true);
  });

  it("detects tampering when deck or seeds are altered", async () => {
    const serverSeed = "server_secret_key_892";
    const clientSeed = "client_public_seed_441";
    const originalDeck = "A♠,K♥,Q♦,J♣,10♠";
    const tamperedDeck = "2♣,3♦,4♥,5♠,6♠";

    const payload = buildCommitmentString(serverSeed, clientSeed, originalDeck);
    const originalHash = await computeSha256(payload);

    // Try to verify with tampered deck
    const isTampered = await verifyProvablyFairCommitment(
      serverSeed,
      clientSeed,
      tamperedDeck,
      originalHash,
    );
    expect(isTampered).toBe(false);
  });
});
