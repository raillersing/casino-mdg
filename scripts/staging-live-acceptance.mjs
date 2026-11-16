#!/usr/bin/env node
/**
 * Explicitly opt-in staging acceptance: real REST admission + engine WebSockets,
 * NO real-money bets, NO production URL, NO use of production credentials.
 * Requires Node 22+ and four independent staging test accounts.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const GAMES = ["belote", "ludo", "domino", "rami", "poker"];
const STAGING_IDENTITY = "/__staging__/identity";

export function validateStagingUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname) ||
    !url.port ||
    ["80", "443"].includes(url.port) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use an explicit loopback staging URL with a nonstandard port.");
  }
  return url;
}

export function validateStagingIdentity(identity) {
  if (
    !identity ||
    identity.environment !== "staging" ||
    identity.application !== "casino-mdg"
  ) {
    throw new Error("Staging identity mismatch: refusing any mutation.");
  }
  return true;
}

function bearer(token) {
  return { Authorization: "Bearer " + token };
}

async function api(base, path, { token, method = "GET", body, expected } = {}) {
  const url = new URL(path, base);
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? bearer(token) : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Never include body content (could contain credentials) in test errors.
  }
  if (expected !== undefined && ![].concat(expected).includes(response.status)) {
    throw new Error(method + " " + url.pathname + ": HTTP " + response.status);
  }
  return { status: response.status, data };
}

function decodeIdentity(token) {
  try {
    const body = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return String(body.sub ?? body.user_id ?? body.userId ?? "");
  } catch {
    throw new Error("A supplied test token is not a parseable JWT.");
  }
}

function engineSession(base, admissionToken, tableId, gameType) {
  if (typeof WebSocket !== "function") {
    throw new Error("This check requires Node 22+ with a global WebSocket.");
  }
  const url = new URL("/ws", base);
  url.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", admissionToken);
  const ws = new WebSocket(url.toString());
  const promise = new Promise((resolveState, rejectState) => {
    const timer = setTimeout(() => {
      rejectState(new Error("No authoritative engine state after 25 seconds."));
      ws.close();
    }, 25000);
    function stop() {
      clearTimeout(timer);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
    }
    function fail(message) {
      stop();
      rejectState(new Error(message));
    }
    function onOpen() {
      const timestamp = new Date().toISOString();
      ws.send(
        JSON.stringify({
          type: "join",
          table_id: tableId,
          payload: { game_type: gameType, role: "player" },
          sequence: 0,
          timestamp,
        }),
      );
      ws.send(JSON.stringify({ type: "sync", table_id: tableId, sequence: 0, timestamp }));
    }
    function onMessage(event) {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === "error") {
        fail("Engine rejected an authorized admission for " + gameType);
      } else if (
        message.type === "state" &&
        message.table_id === tableId &&
        message.payload &&
        typeof message.payload.game_state === "object"
      ) {
        stop();
        resolveState(true);
      }
    }
    function onError() {
      fail("WebSocket failed for " + gameType);
    }
    function onClose() {
      fail("WebSocket closed before an engine state was observed.");
    }
    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
  });
  return { ws, state: promise };
}

async function main() {
  if (process.env.STAGING_ACCEPTANCE_CONFIRM !== "yes-create-free-test-tables") {
    throw new Error("Set STAGING_ACCEPTANCE_CONFIRM=yes-create-free-test-tables explicitly.");
  }
  const base = validateStagingUrl(process.env.STAGING_BASE_URL || "");
  const tokens = [1, 2, 3, 4].map((n) => process.env["STAGING_TOKEN_" + n] || "");
  if (tokens.some((v) => !v)) throw new Error("Four distinct staging test JWTs are required.");
  const subjects = tokens.map(decodeIdentity);
  if (subjects.some((v) => !v) || new Set(subjects).size !== tokens.length) {
    throw new Error("All four test tokens must represent distinct staging accounts.");
  }

  const identity = await api(base, STAGING_IDENTITY, { expected: 200 });
  validateStagingIdentity(identity.data); // Mandatory BEFORE any write.
  await api(base, "/api/v1/ping/", { expected: 200 });
  const capabilityResponse = await api(base, "/api/v1/games/table-capabilities/", {
    expected: 200,
  });
  const capabilities = capabilityResponse.data?.games;
  if (!capabilities || GAMES.some((game) => !capabilities[game]?.players?.length)) {
    throw new Error("Server did not provide the five game capacity contracts.");
  }

  const cleanup = [];
  const sockets = [];
  const results = [];
  const unique = Date.now().toString(36);
  try {
    for (const game of GAMES) {
      const capacities = capabilities[game].players;
      const targetPlayers = Math.min(...capacities);
      if (!Number.isInteger(targetPlayers) || targetPlayers < 2 || targetPlayers > 4) {
        throw new Error("Unsupported test-account count for " + game);
      }
      // Only free tables: never pass nonzero stake, buy-in or payment data.
      const created = await api(base, "/api/v1/games/tables/", {
        token: tokens[0],
        method: "POST",
        expected: 201,
        body: {
          name: "Acceptance " + game + " " + unique,
          game_type: game,
          max_players: targetPlayers,
          stake_amount: 0,
          turn_duration: 30,
          rules_config: {},
          is_private: false,
          buy_in: 0,
        },
      });
      const tableId = created.data?.table_id;
      assert.ok(tableId, "Create response missing table_id for " + game);
      cleanup.push({ tableId, tokens: [tokens[0]] });
      assert.equal(Number(created.data?.table?.stake_amount ?? created.data?.stake_amount), 0);
      const admissions = [created.data.admission_token];
      const seatIndexes = [created.data.seat_index];
      for (let index = 1; index < targetPlayers; index++) {
        const joined = await api(base, "/api/v1/games/tables/" + tableId + "/join/", {
          token: tokens[index],
          method: "POST",
          expected: [200, 201],
          body: { buy_in: 0 },
        });
        assert.equal(joined.data?.table_id, tableId);
        assert.ok(joined.data?.admission_token, "Missing admission ticket");
        admissions.push(joined.data.admission_token);
        seatIndexes.push(joined.data.seat_index);
        cleanup.at(-1).tokens.push(tokens[index]);
      }
      assert.equal(new Set(seatIndexes).size, targetPlayers, "Duplicate seats");
      for (let index = 0; index < targetPlayers; index++) {
        const admission = await api(base, "/api/v1/games/tables/" + tableId + "/admission/", {
          token: tokens[index],
          method: "POST",
          expected: 200,
          body: {},
        });
        assert.equal(admission.data?.role, "player");
        assert.ok(admission.data?.admission_token);
        admissions[index] = admission.data.admission_token;
      }
      const connections = admissions.map((ticket) =>
        engineSession(base, ticket, tableId, game),
      );
      sockets.push(...connections.map((connection) => connection.ws));
      await Promise.all(connections.map((connection) => connection.state));
      for (const connection of connections) connection.ws.close();
      results.push({ game, players: targetPlayers, http_admission: "pass", engine_state: "observed" });
    }

    // A private table must not become discoverable to an unauthorised user.
    const game = "ludo";
    const privateCreate = await api(base, "/api/v1/games/tables/", {
      token: tokens[0],
      method: "POST",
      expected: 201,
      body: {
        name: "Acceptance private " + unique,
        game_type: game,
        max_players: 2,
        stake_amount: 0,
        turn_duration: 30,
        rules_config: {},
        is_private: true,
        buy_in: 0,
      },
    });
    const privateId = privateCreate.data?.table_id;
    assert.ok(privateId);
    cleanup.push({ tableId: privateId, tokens: [tokens[0]] });
    const invitationCode = privateCreate.data?.access_code;
    assert.ok(invitationCode, "Creator cannot retrieve invitation code");
    const outsiderList = await api(base, "/api/v1/games/tables/", {
      token: tokens[1],
      expected: 200,
    });
    assert.equal(
      outsiderList.data.results.some((table) => table.id === privateId),
      false,
      "Private table leaked into an outsider's list",
    );
    await api(base, "/api/v1/games/tables/" + privateId + "/join/", {
      token: tokens[1],
      method: "POST",
      expected: 403,
      body: {},
    });
    const invited = await api(base, "/api/v1/games/tables/" + privateId + "/join/", {
      token: tokens[1],
      method: "POST",
      expected: [200, 201],
      body: { access_code: invitationCode, buy_in: 0 },
    });
    assert.equal(invited.data?.table_id, privateId);
    cleanup.at(-1).tokens.push(tokens[1]);
    results.push({ game: "private_ludo", code_protection: "pass" });
    console.log(JSON.stringify({
      environment: "staging",
      executed_at: new Date().toISOString(),
      status: "HTTP_AND_ENGINE_STATE_CHECKS_PASSED",
      results,
      note: "No complete played games, payments, mobile accessibility or release approval inferred.",
    }, null, 2));
  } finally {
    for (const ws of sockets) {
      try { ws.close(); } catch { /* best effort */ }
    }
    for (const item of cleanup.reverse()) {
      for (const token of item.tokens.reverse()) {
        try {
          await api(base, "/api/v1/games/tables/" + item.tableId + "/leave/", {
            token, method: "POST", body: {}, expected: 200,
          });
        } catch {
          console.error("Staging cleanup needs review (no credentials logged).");
        }
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Staging acceptance failed: " + error.message);
    process.exitCode = 1;
  });
}
