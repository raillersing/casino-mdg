import ws from 'k6/ws';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Prometheus/k6 metrics for 10,000 CCU Scale & Chaos Testing
const wsConnections = new Counter('ws_connections_total');
const wsMsgsReceived = new Counter('ws_msgs_received_total');
const wsMsgsSent = new Counter('ws_msgs_sent_total');
const wsErrors = new Rate('ws_errors_rate');
const wsActionLatency = new Trend('ws_action_latency_ms');
const wsConnectLatency = new Trend('ws_connect_latency_ms');
const wsFailoverRejoins = new Counter('ws_failover_rejoins_total');

export const options = {
  scenarios: {
    r2_10k_ccu_scale: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 2000 },  // Phase 1: 2,000 CCU warm-up
        { duration: '45s', target: 5000 },  // Phase 2: 5,000 CCU scale
        { duration: '60s', target: 10000 }, // Phase 3: 10,000 CCU peak load
        { duration: '120s', target: 10000 }, // Phase 4: 10,000 CCU steady plateau
        { duration: '30s', target: 0 },     // Phase 5: graceful ramp down
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    ws_errors_rate: ['rate<0.01'],        // Error rate strictly below 1%
    ws_action_latency_ms: ['p(95)<50'],   // 95% of action processing under 50ms
    ws_connect_latency_ms: ['p(95)<100'], // 95% of handshakes under 100ms
  },
};

const JWT_SECRET = __ENV.JWT_SECRET || 'change-me-in-production';
// Support multiple engine nodes for distributed load balancing: "node-1:8080,node-2:8080"
const WS_HOSTS = (__ENV.WS_HOSTS || __ENV.WS_HOST || 'game-engine:8080').split(',');
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
    exp: now + 7200,
  }));
  const sig = hmacB64url(JWT_SECRET, `${header}.${payload}`);
  return `${header}.${payload}.${sig}`;
}

// 10,000 CCU distribution across ~1,945 active tables
function assignTableAndSeat(vu) {
  const v = (vu % 10000) + 1; // 1 to 10,000
  if (v <= 4000) {
    // 445 tables of Poker 9-max (seats 0..8)
    const tIdx = Math.floor((v - 1) / 9) + 1;
    const seat = (v - 1) % 9;
    return { tableId: `r2-${RUN_ID}-p9-t${tIdx}`, gameType: 'poker', seat: seat, maxPlayers: 9 };
  } else if (v <= 7000) {
    // 500 tables of Poker 6-max (seats 0..5)
    const offset = v - 4001;
    const tIdx = Math.floor(offset / 6) + 1;
    const seat = offset % 6;
    return { tableId: `r2-${RUN_ID}-p6-t${tIdx}`, gameType: 'poker', seat: seat, maxPlayers: 6 };
  } else if (v <= 8000) {
    // 500 tables of Poker Heads-Up (seats 0..1)
    const offset = v - 7001;
    const tIdx = Math.floor(offset / 2) + 1;
    const seat = offset % 2;
    return { tableId: `r2-${RUN_ID}-p2-t${tIdx}`, gameType: 'poker', seat: seat, maxPlayers: 2 };
  } else if (v <= 9000) {
    // 250 tables of Belote 4 (seats 0..3)
    const offset = v - 8001;
    const tIdx = Math.floor(offset / 4) + 1;
    const seat = offset % 4;
    return { tableId: `r2-${RUN_ID}-belote-t${tIdx}`, gameType: 'belote', seat: seat, maxPlayers: 4 };
  } else {
    // 250 tables of Rami 4 (seats 0..3)
    const offset = v - 9001;
    const tIdx = Math.floor(offset / 4) + 1;
    const seat = offset % 4;
    return { tableId: `r2-${RUN_ID}-rami-t${tIdx}`, gameType: 'rami', seat: seat, maxPlayers: 4 };
  }
}

export default function () {
  const playerId = `vu-10k-${__VU}`;
  const config = assignTableAndSeat(__VU);
  const token = generateAdmissionToken(playerId, config.tableId, config.seat);

  // Round-robin host selection across distributed engine nodes
  const hostIndex = __VU % WS_HOSTS.length;
  const targetHost = WS_HOSTS[hostIndex].trim();
  const url = `ws://${targetHost}/ws?token=${token}`;

  let currentSeq = 0;
  let inFlight = false;
  let actionSentAt = 0;
  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    wsConnections.add(1);
    wsConnectLatency.add(Date.now() - connectStart);

    socket.on('open', function () {
      const joinMsg = {
        type: 'join',
        table_id: config.tableId,
        payload: {
          game_type: config.gameType,
          name: `Joueur-10k-${__VU}`,
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
          if (inFlight && actionSentAt > 0) {
            wsActionLatency.add(Date.now() - actionSentAt);
            actionSentAt = 0;
          }
          inFlight = false;
        }

        if (msg.type === 'error') {
          wsErrors.add(1);
        } else {
          wsErrors.add(0);
          if (msg.type === 'state') {
            const gs = msg.payload && msg.payload.game_state;
            const seatedCount = msg.payload && msg.payload.players ? Object.keys(msg.payload.players).length : 0;

            if (seatedCount >= config.maxPlayers && gs && gs.current_player_id === playerId && !inFlight) {
              inFlight = true;
              actionSentAt = Date.now();
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

    // Chaos simulation: 5% of users experience transient disconnect at 10s and rejoin to test failover
    if (__VU % 20 === 0) {
      socket.setTimeout(function () {
        wsFailoverRejoins.add(1);
        socket.close();
      }, 10000);
    } else {
      socket.setTimeout(function () {
        socket.close();
      }, 45000);
    }
  });

  check(res, { 'WebSocket connected successfully': (r) => r && r.status === 101 });
  sleep(1);
}
