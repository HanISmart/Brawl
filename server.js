const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 5500);

const ROOM_CONFIGS = {
  h3s6: { label: "3 Hunter / 6 Survivor", hunters: 3, survivors: 6 },
  h2s5: { label: "2 Hunter / 5 Survivor", hunters: 2, survivors: 5 },
  h1s4: { label: "1 Hunter / 4 Survivor", hunters: 1, survivors: 4 },
};

const MATCH_DURATION_SECONDS = 60;
const FRONT_DOOR_ESCAPE_ZONE = {
  x: 410,
  y: 20,
  w: 320,
  h: 120,
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const clients = new Map();
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sanitizeName(rawName) {
  const cleaned = String(rawName || "").trim().slice(0, 24);
  return cleaned || "Player";
}

function sanitizeRole(rawRole) {
  return rawRole === "hunter" ? "hunter" : "survivor";
}

function sanitizeRoomCode(rawCode) {
  return String(rawCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateRoomCode() {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += charset[Math.floor(Math.random() * charset.length)];
    }

    if (!rooms.has(code)) {
      return code;
    }
  }

  return `R${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function spawnForRole(role, roleIndex) {
  if (role === "hunter") {
    return { x: 4300 + roleIndex * 38, y: 2550 + roleIndex * 36 };
  }

  return { x: 540 + roleIndex * 32, y: 440 + roleIndex * 28 };
}

function roleCount(players, role) {
  let count = 0;
  for (const player of players.values()) {
    if (player.role === role) {
      count += 1;
    }
  }
  return count;
}

function roomIsFull(room) {
  const hunters = roleCount(room.players, "hunter");
  const survivors = roleCount(room.players, "survivor");
  return hunters === room.config.hunters && survivors === room.config.survivors;
}

function getRoomRemainingSeconds(room) {
  if (!room.started || !room.startedAt) {
    return MATCH_DURATION_SECONDS;
  }

  const elapsedSeconds = (Date.now() - room.startedAt) / 1000;
  return Math.max(0, MATCH_DURATION_SECONDS - elapsedSeconds);
}

function isFrontDoorOpen(room) {
  return getRoomRemainingSeconds(room) <= 0;
}

function isInsideFrontDoorEscapeZone(player) {
  return player.x >= FRONT_DOOR_ESCAPE_ZONE.x
    && player.x <= FRONT_DOOR_ESCAPE_ZONE.x + FRONT_DOOR_ESCAPE_ZONE.w
    && player.y >= FRONT_DOOR_ESCAPE_ZONE.y
    && player.y <= FRONT_DOOR_ESCAPE_ZONE.y + FRONT_DOOR_ESCAPE_ZONE.h;
}

function requiredEscapesForWin(survivorCount) {
  return Math.ceil(survivorCount / 2);
}

function evaluateRoomWinner(room) {
  if (room.winner) {
    return;
  }

  const survivors = Array.from(room.players.values()).filter((player) => player.role === "survivor");
  if (survivors.length === 0) {
    return;
  }

  const escapedCount = survivors.filter((player) => player.escaped).length;
  const deadCount = survivors.filter((player) => player.dead).length;
  const aliveNotEscapedCount = survivors.filter((player) => !player.dead && !player.escaped).length;
  const neededEscapes = requiredEscapesForWin(survivors.length);

  if (escapedCount >= neededEscapes) {
    room.winner = "survivor";
    return;
  }

  if (aliveNotEscapedCount + escapedCount < neededEscapes) {
    room.winner = "hunter";
    return;
  }

  const allResolved = survivors.every((player) => player.dead || player.escaped);
  if (allResolved) {
    room.winner = escapedCount >= neededEscapes ? "survivor" : "hunter";
  }
}

function startRoomMatch(room) {
  if (room.started) {
    return;
  }

  room.started = true;
  room.startedAt = Date.now();
}

function maybeAutoStartRoom(room) {
  if (room.started || room.winner) {
    return;
  }

  if (roomIsFull(room)) {
    startRoomMatch(room);
  }
}

function roomSnapshot(room) {
  const survivors = Array.from(room.players.values()).filter((player) => player.role === "survivor");
  const aliveSurvivors = survivors.filter((player) => !player.dead && !player.escaped);
  const escapedSurvivors = survivors.filter((player) => player.escaped);
  const timerRemaining = getRoomRemainingSeconds(room);
  const neededEscapes = requiredEscapesForWin(survivors.length);

  return {
    code: room.code,
    configId: room.configId,
    configLabel: room.config.label,
    ownerId: room.ownerId,
    started: Boolean(room.started),
    isFull: roomIsFull(room),
    hunterCount: roleCount(room.players, "hunter"),
    survivorCount: roleCount(room.players, "survivor"),
    winner: room.winner || null,
    timerRemaining,
    frontDoorOpen: isFrontDoorOpen(room),
    survivorAliveCount: aliveSurvivors.length,
    survivorTotalCount: survivors.length,
    survivorEscapedCount: escapedSurvivors.length,
    survivorEscapesNeeded: neededEscapes,
    players: Array.from(room.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      x: player.x,
      y: player.y,
      hidden: player.hidden,
      dead: player.dead,
      escaped: Boolean(player.escaped),
    })),
  };
}

function broadcastRoomState(room) {
  evaluateRoomWinner(room);
  const payload = { type: "roomState", room: roomSnapshot(room) };

  for (const player of room.players.values()) {
    send(player.ws, payload);
  }
}

function removePlayerFromRoom(clientInfo) {
  const roomCode = clientInfo.roomCode;
  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  room.players.delete(clientInfo.playerId);

  if (!room.started && room.ownerId === clientInfo.playerId) {
    const nextHost = room.players.values().next().value;
    room.ownerId = nextHost ? nextHost.id : null;
  }

  if (room.players.size === 0) {
    rooms.delete(roomCode);
  } else {
    broadcastRoomState(room);
  }
}

function ensureRoleCapacity(room, role) {
  const maxCount = role === "hunter" ? room.config.hunters : room.config.survivors;
  const currentCount = roleCount(room.players, role);
  return currentCount < maxCount;
}

function addPlayerToRoom(clientInfo, room, role, name) {
  if (room.started) {
    return { ok: false, message: "Match already started. You cannot join now." };
  }

  if (room.winner) {
    return { ok: false, message: "Match already ended in this room." };
  }

  if (!ensureRoleCapacity(room, role)) {
    return { ok: false, message: `${role === "hunter" ? "Hunter" : "Survivor"} slots are full in this room.` };
  }

  const roleIndex = roleCount(room.players, role);
  const spawn = spawnForRole(role, roleIndex);
  const player = {
    id: clientInfo.playerId,
    ws: clientInfo.ws,
    name,
    role,
    x: spawn.x,
    y: spawn.y,
    hidden: false,
    dead: false,
    escaped: false,
  };

  room.players.set(player.id, player);
  clientInfo.roomCode = room.code;

  maybeAutoStartRoom(room);
  return { ok: true };
}

function handleCreateRoom(clientInfo, message) {
  if (clientInfo.roomCode) {
    send(clientInfo.ws, { type: "roomError", message: "You are already in a room." });
    return;
  }

  const configId = message.configId && ROOM_CONFIGS[message.configId] ? message.configId : "h1s4";
  const role = sanitizeRole(message.role);
  const name = sanitizeName(message.name);
  const roomCode = generateRoomCode();

  const room = {
    code: roomCode,
    configId,
    config: ROOM_CONFIGS[configId],
    ownerId: clientInfo.playerId,
    players: new Map(),
    started: false,
    startedAt: null,
    winner: null,
  };

  rooms.set(roomCode, room);

  const result = addPlayerToRoom(clientInfo, room, role, name);
  if (!result.ok) {
    rooms.delete(roomCode);
    send(clientInfo.ws, { type: "roomError", message: result.message });
    return;
  }

  send(clientInfo.ws, { type: "roomJoined", room: roomSnapshot(room), selfId: clientInfo.playerId });
  broadcastRoomState(room);
}

function handleJoinRoom(clientInfo, message) {
  if (clientInfo.roomCode) {
    send(clientInfo.ws, { type: "roomError", message: "You are already in a room." });
    return;
  }

  const roomCode = sanitizeRoomCode(message.code);
  if (!roomCode) {
    send(clientInfo.ws, { type: "roomError", message: "Room code is required." });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    send(clientInfo.ws, { type: "roomError", message: "Room not found." });
    return;
  }

  const role = sanitizeRole(message.role);
  const name = sanitizeName(message.name);

  const result = addPlayerToRoom(clientInfo, room, role, name);
  if (!result.ok) {
    send(clientInfo.ws, { type: "roomError", message: result.message });
    return;
  }

  send(clientInfo.ws, { type: "roomJoined", room: roomSnapshot(room), selfId: clientInfo.playerId });
  broadcastRoomState(room);
}

function handlePlayerUpdate(clientInfo, message) {
  const room = rooms.get(clientInfo.roomCode);
  if (!room) {
    return;
  }

  if (room.winner) {
    return;
  }

  if (!room.started) {
    return;
  }

  const player = room.players.get(clientInfo.playerId);
  if (!player) {
    return;
  }

  if (typeof message.x === "number" && Number.isFinite(message.x)) {
    player.x = Math.max(0, Math.min(5000, message.x));
  }

  if (typeof message.y === "number" && Number.isFinite(message.y)) {
    player.y = Math.max(0, Math.min(3200, message.y));
  }

  if (player.role === "survivor") {
    if (player.escaped) {
      player.hidden = false;
      player.dead = false;
      broadcastRoomState(room);
      return;
    }

    player.hidden = Boolean(message.hidden);
    player.dead = Boolean(message.dead);

    if (!player.dead && isFrontDoorOpen(room) && isInsideFrontDoorEscapeZone(player)) {
      player.escaped = true;
      player.hidden = false;
    }
  } else {
    player.hidden = false;
    player.dead = false;
  }

  evaluateRoomWinner(room);
  broadcastRoomState(room);
}

function handleAttemptKill(clientInfo, message) {
  const room = rooms.get(clientInfo.roomCode);
  if (!room) {
    return;
  }

  if (room.winner) {
    return;
  }

  if (!room.started) {
    return;
  }

  const attacker = room.players.get(clientInfo.playerId);
  if (!attacker || attacker.role !== "hunter") {
    return;
  }

  const targetId = String(message.targetId || "");
  const target = room.players.get(targetId);
  if (!target || target.role !== "survivor" || target.dead || target.escaped) {
    return;
  }

  const killRange = 60;
  const distance = Math.hypot(attacker.x - target.x, attacker.y - target.y);
  if (distance > killRange) {
    return;
  }

  target.dead = true;
  target.hidden = false;
  target.escaped = false;

  evaluateRoomWinner(room);

  broadcastRoomState(room);
}

function handleStartMatch(clientInfo) {
  const room = rooms.get(clientInfo.roomCode);
  if (!room) {
    return;
  }

  if (room.winner) {
    send(clientInfo.ws, { type: "roomError", message: "This match has already ended." });
    return;
  }

  if (room.started) {
    broadcastRoomState(room);
    return;
  }

  if (room.ownerId !== clientInfo.playerId) {
    send(clientInfo.ws, { type: "roomError", message: "Only the room host can manually start the match." });
    return;
  }

  startRoomMatch(room);
  broadcastRoomState(room);
}

function handleClientMessage(clientInfo, rawData) {
  let message;

  try {
    message = JSON.parse(rawData.toString("utf8"));
  } catch {
    send(clientInfo.ws, { type: "roomError", message: "Invalid message format." });
    return;
  }

  if (!message || typeof message.type !== "string") {
    send(clientInfo.ws, { type: "roomError", message: "Missing message type." });
    return;
  }

  if (message.type === "createRoom") {
    handleCreateRoom(clientInfo, message);
    return;
  }

  if (message.type === "joinRoom") {
    handleJoinRoom(clientInfo, message);
    return;
  }

  if (message.type === "playerUpdate") {
    handlePlayerUpdate(clientInfo, message);
    return;
  }

  if (message.type === "attemptKill") {
    handleAttemptKill(clientInfo, message);
    return;
  }

  if (message.type === "startMatch") {
    handleStartMatch(clientInfo);
    return;
  }

  send(clientInfo.ws, { type: "roomError", message: "Unknown message type." });
}

function serveStaticFile(reqPath, res) {
  const parsedPath = new URL(reqPath || "/", "http://localhost").pathname;
  const normalized = parsedPath === "/" ? "/index.html" : decodeURIComponent(parsedPath);
  const safePath = path.normalize(normalized).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(process.cwd(), safePath);

  if (!filePath.startsWith(process.cwd())) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  serveStaticFile(req.url || "/", res);
});

const wsServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let pathname = "/";

  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    pathname = "/";
  }

  if (pathname !== "/" && pathname !== "/ws") {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(req, socket, head, (ws) => {
    wsServer.emit("connection", ws, req);
  });
});

wsServer.on("connection", (ws) => {
  const clientInfo = {
    ws,
    playerId: generateId("p"),
    roomCode: null,
  };

  clients.set(ws, clientInfo);
  send(ws, { type: "welcome", playerId: clientInfo.playerId });

  ws.on("message", (rawData) => {
    handleClientMessage(clientInfo, rawData);
  });

  ws.on("close", () => {
    removePlayerFromRoom(clientInfo);
    clients.delete(ws);
  });

  ws.on("error", () => {
    removePlayerFromRoom(clientInfo);
    clients.delete(ws);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Brawl server running at http://${HOST}:${PORT}`);
});
