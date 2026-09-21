import ws from 'k6/ws';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Prometheus/k6 metrics
const wsConnections = new Counter('ws_connections_total');
const wsMsgsReceived = new Counter('ws_msgs_received_total');
const wsMsgsSent = new Counter('ws_msgs_sent_total');
const wsErrors = new Rate('ws_errors_rate');
const wsActionLatency = new Trend('ws_action_latency_ms');

export const options = {
  scenarios: {
    r1_500_ccu: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // Ramp up to 100 CCU
        { duration: '15s', target: 300 },  // Ramp up to 300 CCU
        { duration: '20s', target: 500 },  // Ramp up to 500 CCU
        { duration: '30s', target: 500 },  // Hold 500 CCU steady
        { duration: '10s', target: 0 },    // Ramp down to 0
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ws_errors_rate: ['rate<0.01'],        // Less than 1% errors
    ws_action_latency_ms: ['p(95)<100'],  // 95% of action processing under 100ms
  },
};

const JWT_SECRET = __ENV.JWT_SECRET || 'change-me-in-production';
const WS_HOST = __ENV.WS_HOST || 'game-engine:8080';
const RUN_ID = __ENV.RUN_ID || Math.floor(Date.now() / 1000).toString();

function b64url(str) {
  return encoding.b64encode(str, "rawurl");
}

function hmacB64url(secret, data) {
  const b64 = crypto.hmac("sha256", secret, data, "base64");
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateAdmissionToken(sub, tableId, seatId) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: sub,
    name: "Player-" + sub,
    table_id: tableId,
    seat_id: seatId,
    role: "player",
    type: "admission",
    iat: now,
    exp: now + 3600,
  }));
  const sig = hmacB64url(JWT_SECRET, `${header}.${payload}`);
  return `${header}.${payload}.${sig}`;
}

function assignTableAndSeat(vu) {
  const v = vu % 500 + 1; // 1 to 500
  if (v <= 180) {
    // 20 tables of 9-max (seats 0..8)
    const tIdx = Math.floor((v - 1) / 9) + 1;
    const seat = (v - 1) % 9;
    return { tableId: `bench-${RUN_ID}-p9-t${tIdx}`, gameType: 'poker', seat: seat, maxPlayers: 9 };
  } else if (v <= 330) {
    // 25 tables of 6-max (seats 0..5)
    const offset = v - 181;
    const tIdx = Math.floor(offset / 6) + 1;
    const seat = offset % 6;
    return { tableId: `bench-${RUN_ID}-p6-t${tIdx}`, gameType: 'poker', seat: seat, maxPlayers: 6 };
  } else if (v <= 380) {
    // 25 tables of 2-max heads up (seats 0..1)
    const offset = v - 331;
    const tIdx = Math.floor(offset / 2) + 1;
    const seat = offset % 2;
    return { tableId: `bench-${RUN_ID}-p2-t${tIdx}`, gameType: 'poker', seat: seat, maxPlayers: 2 };
  } else if (v <= 440) {
    // 15 tables of Belote 4 (seats 0..3)
    const offset = v - 381;
    const tIdx = Math.floor(offset / 4) + 1;
    const seat = offset % 4;
    return { tableId: `bench-${RUN_ID}-belote-t${tIdx}`, gameType: 'belote', seat: seat, maxPlayers: 4 };
  } else {
    // 15 tables of Rami 4 (seats 0..3)
    const offset = v - 441;
    const tIdx = Math.floor(offset / 4) + 1;
    const seat = offset % 4;
    return { tableId: `bench-${RUN_ID}-rami-t${tIdx}`, gameType: 'rami', seat: seat, maxPlayers: 4 };
  }
}

export default function () {
  const playerId = `vu-${__VU}`;
  const config = assignTableAndSeat(__VU);
  const token = generateAdmissionToken(playerId, config.tableId, config.seat);
  const url = `ws://${WS_HOST}/ws?token=${token}`;

  let joined = false;
  let currentSeq = 0;
  let inFlight = false;

  const res = ws.connect(url, {}, function (socket) {
    wsConnections.add(1);

    socket.on('open', function () {
      // Send join table
      const joinMsg = {
        type: 'join',
        table_id: config.tableId,
        payload: {
          game_type: config.gameType,
          name: `Joueur-${__VU}`,
          seat: config.seat,
          max_players: config.maxPlayers,
        },
      };
      socket.send(JSON.stringify(joinMsg));
      wsMsgsSent.add(1);
    });

    socket.on('message', function (data) {
      wsMsgsReceived.add(1);
      try {
        const msg = JSON.parse(data);
        if (msg.sequence) {
          currentSeq = msg.sequence;
        }

        if (msg.type === 'action' || msg.type === 'state') {
          inFlight = false;
        }

        if (msg.type === 'error') {
          console.log('WS ERROR:', JSON.stringify(msg.payload));
          wsErrors.add(1);
        } else {
          wsErrors.add(0);
          if (msg.type === 'state') {
            joined = true;
            const gs = msg.payload && msg.payload.game_state;
            const seatedCount = msg.payload && msg.payload.players ? Object.keys(msg.payload.players).length : 0;
            // If table is fully seated and Hero has action, send move
            if (seatedCount >= config.maxPlayers && gs && gs.current_player_id === playerId && !inFlight) {
              inFlight = true;
              const startAction = Date.now();
              let action = 'check';
              let payload = null;

            if (config.gameType === 'poker') {
              const allowed = gs.allowed_actions || [];
              if (allowed.includes('check')) action = 'check';
              else if (allowed.includes('call')) action = 'call';
              else if (allowed.includes('fold')) action = 'fold';
            } else if (config.gameType === 'belote') {
              if (gs.phase === 'bidding') action = 'pass';
              else if (gs.phase === 'playing') {
                action = 'play_card';
                // Pick first card if available
                const myHand = (gs.players && gs.players[config.seat] && gs.players[config.seat].hand) || [];
                if (myHand.length > 0) {
                  payload = { card: { suit: myHand[0].suit, rank: myHand[0].rank } };
                }
              }
            } else if (config.gameType === 'rami') {
              action = 'draw';
            }

            socket.send(JSON.stringify({
              type: 'action',
              table_id: config.tableId,
              action: action,
              payload: payload,
              sequence: currentSeq,
            }));
            wsMsgsSent.add(1);
            wsActionLatency.add(Date.now() - startAction);
          }
        }
      }
    } catch (e) {
      wsErrors.add(1);
    }
    });

    socket.on('error', function (e) {
      wsErrors.add(1);
    });

    // Keep session alive for 25s with periodic heartbeat / active play
    socket.setTimeout(function () {
      socket.close();
    }, 25000);
  });

  check(res, { 'WebSocket connected successfully': (r) => r && r.status === 101 });
  sleep(1);
}
