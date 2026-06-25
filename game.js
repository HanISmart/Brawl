const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("start-screen");
const stepName = document.getElementById("step-name");
const stepMenu = document.getElementById("step-menu");
const stepCreate = document.getElementById("step-create");
const stepCreated = document.getElementById("step-created");
const stepJoin = document.getElementById("step-join");
const playerNameInput = document.getElementById("player-name");
const createConfigSelect = document.getElementById("create-config");
const joinCodeInput = document.getElementById("join-code");
const createdRoomCode = document.getElementById("created-room-code");
const lobbyGreeting = document.getElementById("lobby-greeting");
const lobbyError = document.getElementById("lobby-error");
const lobbyBackButton = document.getElementById("lobby-back");
const openCreateButton = document.getElementById("open-create");
const openJoinButton = document.getElementById("open-join");
const startCreatedRoomButton = document.getElementById("start-created-room");
const lobbySubtitle = document.getElementById("lobby-subtitle");
const roomLobbyStatus = document.getElementById("room-lobby-status");
const roomLobbySetup = document.getElementById("room-lobby-setup");
const roomLobbyCapacity = document.getElementById("room-lobby-capacity");
const roomPlayerList = document.getElementById("room-player-list");
const hud = document.getElementById("hud");
const hudTitle = document.getElementById("hud-title");
const hudRoom = document.getElementById("hud-room");
const hudControls = document.getElementById("hud-controls");
const hudBackButton = document.getElementById("hud-back-button");
const hideIndicator = document.getElementById("hide-indicator");

const HIDE = {
  interactionRange: 110,
  transitionSeconds: 0.28,
  revealRange: 160,
};

const DOOR_ANIMATION = {
  transitionSeconds: 0.2,
  openClearance: 0.9,
};

const FOOTSTEP = {
  lifetime: 3,
  spacing: 34,
  sideOffset: 10,
  length: 16,
  width: 7,
};

const LIGHT = {
  direction: { x: -0.72, y: -0.38 },
  shadowLength: 34,
  ambient: 0.2,
};

const WALL_THICKNESS = 4;

const RUN = {
  minDistance: 0.35,
  blendIn: 9,
  blendOut: 7,
  phaseBase: 5.6,
  phaseSpeedScale: 0.021,
};

const KILL = {
  extraRange: 10,
};

const DEFAULT_PLAYER_NAME = "Survivor";
const NET = {
  sendRateSeconds: 0.05,
  killRange: 60,
  minMoveDelta: 0.2,
};

const ROOM_CONFIGS = {
  h3s6: { label: "3 Hunter / 6 Survivor", hunters: 3, survivors: 6 },
  h2s5: { label: "2 Hunter / 5 Survivor", hunters: 2, survivors: 5 },
  h1s4: { label: "1 Hunter / 4 Survivor", hunters: 1, survivors: 4 },
};

const MATCH_TIMER = {
  durationSeconds: 60,
};

let survivorIsHidden = false;
let survivorHideBlend = 0;
let survivorHideTarget = 0;
let survivorHideTransitioning = false;
let survivorIsDead = false;
let survivorIsEscaped = false;
const survivorFootsteps = [];
let footstepDistanceSinceLast = 0;
let nextFootIsLeft = true;

const runAnimation = {
  survivor: { phase: 0, blend: 0, prevX: player.x, prevY: player.y, dirX: 0, dirY: 1, facingSign: 1 },
  hunter: { phase: 0, blend: 0, prevX: hunter.x, prevY: hunter.y, dirX: 0, dirY: 1, facingSign: 1 },
};

const keys = new Set();
let screen = { width: 0, height: 0 };
let lastTime = performance.now();
let gameStarted = false;
let survivorName = DEFAULT_PLAYER_NAME;
let localPlayerRole = "survivor";
let activeRoomCode = "";
let activeRoomConfig = ROOM_CONFIGS.h1s4;
let socket = null;
let socketReady = false;
let socketPlayerId = "";
let roomPlayers = [];
let primaryRivalId = "";
let pendingRoomAction = null;
let lastNetworkSendAt = 0;
let lastSentState = null;
let hasAppliedInitialSpawn = false;
let matchWinner = null;
let roomStarted = false;
let roomOwnerId = "";
let matchTimeRemaining = MATCH_TIMER.durationSeconds;
let frontDoorOpen = false;
let frontDoorOpenProgress = 0;
let survivorEscapedCount = 0;
let survivorEscapesNeeded = 1;

let survivorHideMessage = "";
let survivorHideMessageTime = 0;
let killAnimations = []; // Array of { x, y, progress, duration }
let hunterHitAnimations = []; // Array of { x, y, angle, progress, duration }

const doors = buildDoors(rooms);
const frontDoor = buildFrontDoor();

function buildFrontDoor() {
  const foyer = rooms.find((room) => room.name === "Foyer") || rooms[0];
  const width = Math.min(340, foyer.w * 0.52);
  const depth = 92;
  const x = foyer.x + foyer.w * 0.5 - width * 0.5;
  const y = foyer.y - (depth - DOOR.wallGap) * 0.5;

  return {
    orientation: "horizontal",
    x,
    y,
    w: width,
    h: depth,
    isOpen: false,
    openProgress: 0,
    hingeSide: 1,
    escapeZone: {
      x: x - 28,
      y: foyer.y - 150,
      w: width + 56,
      h: 145,
    },
  };
}

function rectsOverlap(a, b, padding = 0) {
  return a.x < b.x + b.w + padding
    && a.x + a.w > b.x - padding
    && a.y < b.y + b.h + padding
    && a.y + a.h > b.y - padding;
}

function findRoomForDecoration(decoration) {
  for (const room of rooms) {
    if (
      decoration.x >= room.x
      && decoration.y >= room.y
      && decoration.x + decoration.w <= room.x + room.w
      && decoration.y + decoration.h <= room.y + room.h
    ) {
      return room;
    }
  }

  return null;
}

function keepWallItemsOffDoors() {
  const step = 8;
  const wallInset = 8;
  const overlapPadding = 6;
  const blockedDoors = [...doors, frontDoor];
  const wallItems = [
    ...roomDecorations.filter((item) => item.style === "window"),
    ...hidingSpots.filter((item) => item.style === "curtain"),
  ];

  for (const decoration of wallItems) {
    const room = findRoomForDecoration(decoration);
    if (!room) {
      continue;
    }

    const overlapsDoor = () => blockedDoors.some((door) => rectsOverlap(decoration, door, overlapPadding));
    if (!overlapsDoor()) {
      continue;
    }

    const distanceToTop = Math.abs(decoration.y - room.y);
    const distanceToBottom = Math.abs((decoration.y + decoration.h) - (room.y + room.h));
    const distanceToLeft = Math.abs(decoration.x - room.x);
    const distanceToRight = Math.abs((decoration.x + decoration.w) - (room.x + room.w));
    const wallDistance = Math.min(distanceToTop, distanceToBottom, distanceToLeft, distanceToRight);
    const onHorizontalWall = wallDistance === distanceToTop || wallDistance === distanceToBottom;

    const originalX = decoration.x;
    const originalY = decoration.y;

    if (onHorizontalWall) {
      const minX = room.x + wallInset;
      const maxX = room.x + room.w - decoration.w - wallInset;

      for (let offset = step; offset <= room.w; offset += step) {
        const candidates = [originalX - offset, originalX + offset];
        for (const candidate of candidates) {
          decoration.x = clamp(candidate, minX, maxX);
          if (!overlapsDoor()) {
            break;
          }
        }

        if (!overlapsDoor()) {
          break;
        }
      }
    } else {
      const minY = room.y + wallInset;
      const maxY = room.y + room.h - decoration.h - wallInset;

      for (let offset = step; offset <= room.h; offset += step) {
        const candidates = [originalY - offset, originalY + offset];
        for (const candidate of candidates) {
          decoration.y = clamp(candidate, minY, maxY);
          if (!overlapsDoor()) {
            break;
          }
        }

        if (!overlapsDoor()) {
          break;
        }
      }
    }
  }
}

keepWallItemsOffDoors();

function sanitizePlayerName(rawName) {
  const cleaned = rawName.trim().slice(0, 24);
  return cleaned || DEFAULT_PLAYER_NAME;
}

function sanitizeRoomCode(rawCode) {
  return rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function sendSocketMessage(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateRoomLobbyUI(room = {}) {
  if (!roomLobbyStatus || !roomPlayerList) {
    return;
  }

  const hunterCount = Number(room.hunterCount || 0);
  const survivorCount = Number(room.survivorCount || 0);
  const needHunters = Number(activeRoomConfig.hunters || 0);
  const needSurvivors = Number(activeRoomConfig.survivors || 0);
  const isFull = Boolean(room.isFull);
  const isOwner = Boolean(roomOwnerId && socketPlayerId && roomOwnerId === socketPlayerId);

  if (roomStarted) {
    roomLobbyStatus.textContent = "Match is starting...";
  } else if (isFull) {
    roomLobbyStatus.textContent = "Room is full. Auto-starting match...";
  } else {
    roomLobbyStatus.textContent = "Waiting for players...";
  }

  if (roomLobbySetup) {
    roomLobbySetup.textContent = `Setup: ${activeRoomConfig.label}`;
  }

  if (roomLobbyCapacity) {
    roomLobbyCapacity.textContent = `Hunters ${hunterCount}/${needHunters} | Survivors ${survivorCount}/${needSurvivors}`;
  }

  const rows = roomPlayers
    .map((entry) => {
      const roleLabel = entry.role === "hunter" ? "Hunter" : "Survivor";
      const hostLabel = entry.id === roomOwnerId ? " (Host)" : "";
      const selfLabel = entry.id === socketPlayerId ? " (You)" : "";
      return `<div class="room-player-row"><span>${escapeHtml(entry.name)}${hostLabel}${selfLabel}</span><span class="room-role-badge">${roleLabel}</span></div>`;
    })
    .join("");

  roomPlayerList.innerHTML = rows || '<div class="room-player-row"><span>No players yet</span><span class="room-role-badge">-</span></div>';

  if (startCreatedRoomButton) {
    const canShowStart = isOwner && !roomStarted;
    startCreatedRoomButton.classList.toggle("is-hidden", !canShowStart);
    startCreatedRoomButton.disabled = roomStarted;
    startCreatedRoomButton.textContent = roomStarted ? "Starting..." : "Start Match";
  }
}

function maybeStartWhenRoomReady() {
  if (roomStarted && !gameStarted) {
    startGame();
  }
}

function applyRoomSnapshot(room) {
  roomPlayers = Array.isArray(room?.players) ? room.players : [];
  matchWinner = room?.winner === "hunter"
    ? "hunter"
    : (room?.winner === "survivor" ? "survivor" : null);
  roomStarted = Boolean(room?.started);
  roomOwnerId = String(room?.ownerId || "");
  frontDoorOpen = Boolean(room?.frontDoorOpen);
  if (Number.isFinite(room?.timerRemaining)) {
    matchTimeRemaining = Math.max(0, Number(room.timerRemaining));
  }
  survivorEscapedCount = Number(room?.survivorEscapedCount || 0);
  survivorEscapesNeeded = Math.max(1, Number(room?.survivorEscapesNeeded || 1));

  if (room?.code) {
    activeRoomCode = room.code;
  }

  if (room?.configId && ROOM_CONFIGS[room.configId]) {
    activeRoomConfig = ROOM_CONFIGS[room.configId];
  }

  const rivals = roomPlayers.filter((entry) => entry.id !== socketPlayerId && entry.role !== localPlayerRole);
  primaryRivalId = rivals[0]?.id || "";

  if (!gameStarted) {
    applyInitialSpawnFromRoom();
    updateRoomLobbyUI(room);
    maybeStartWhenRoomReady();
  }

  if (hudRoom && gameStarted && activeRoomCode) {
    hudRoom.textContent = `Room ${activeRoomCode} | Setup: ${activeRoomConfig.label} | Players: ${roomPlayers.length}`;
  }
}

function applyInitialSpawnFromRoom() {
  if (hasAppliedInitialSpawn || !socketPlayerId) {
    return;
  }

  const self = roomPlayers.find((entry) => entry.id === socketPlayerId);
  if (!self) {
    return;
  }

  const localEntity = getLocalEntity();
  localEntity.x = self.x;
  localEntity.y = self.y;

  if (localPlayerRole === "survivor") {
    survivorIsHidden = Boolean(self.hidden);
    survivorIsDead = Boolean(self.dead);
    survivorIsEscaped = Boolean(self.escaped);
    if (survivorIsDead) {
      survivorHideBlend = 0;
    }
  }

  hasAppliedInitialSpawn = true;
}

function handleSocketMessage(message) {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "welcome") {
    socketPlayerId = String(message.playerId || "");
    return;
  }

  if (message.type === "roomJoined") {
    if (message.selfId) {
      socketPlayerId = String(message.selfId);
    }

    applyRoomSnapshot(message.room);

    if (pendingRoomAction?.resolve) {
      pendingRoomAction.resolve(message.room);
      pendingRoomAction = null;
    }
    return;
  }

  if (message.type === "roomState") {
    applyRoomSnapshot(message.room);
    return;
  }

  if (message.type === "roomError") {
    const errorMessage = String(message.message || "Room action failed.");
    setLobbyError(errorMessage);
    if (pendingRoomAction?.reject) {
      pendingRoomAction.reject(new Error(errorMessage));
      pendingRoomAction = null;
    }
  }
}

function ensureSocketConnection() {
  if (socket && socketReady && socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  const connectToUrl = (url) => new Promise((resolve, reject) => {
    const candidate = new WebSocket(url);
    let settled = false;

    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      candidate.close();
      reject(new Error("Could not connect to game server."));
    }, 4500);

    candidate.addEventListener("open", () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      resolve(candidate);
    }, { once: true });

    candidate.addEventListener("error", () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      candidate.close();
      reject(new Error("WebSocket connection error."));
    }, { once: true });
  });

  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const params = new URLSearchParams(window.location.search);
    const forced = (params.get("ws") || params.get("server") || "").trim();

    const normalizeCandidates = () => {
      if (!forced) {
        const host = window.location.host || "localhost:5500";
        return [`${protocol}://${host}/ws`, `${protocol}://${host}`];
      }

      if (/^wss?:\/\//i.test(forced)) {
        const base = forced.replace(/\/$/, "");
        return [base, `${base}/ws`];
      }

      if (/^https?:\/\//i.test(forced)) {
        const parsed = new URL(forced);
        const wsProto = parsed.protocol === "https:" ? "wss:" : "ws:";
        const origin = `${wsProto}//${parsed.host}`;
        return [`${origin}/ws`, origin];
      }

      const host = forced;
      return [`${protocol}://${host}/ws`, `${protocol}://${host}`];
    };

    const candidates = normalizeCandidates();

    if (socket && socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }

    const tryConnect = async () => {
      let lastError = null;

      for (const url of candidates) {
        try {
          const connected = await connectToUrl(url);
          socket = connected;
          socketReady = true;

          socket.addEventListener("close", () => {
            socketReady = false;
            if (gameStarted && hudRoom) {
              hudRoom.textContent = `Room ${activeRoomCode || "-"} | Disconnected`;
            }
          });

          socket.addEventListener("message", (event) => {
            try {
              const parsed = JSON.parse(event.data);
              handleSocketMessage(parsed);
            } catch {
              setLobbyError("Received invalid server data.");
            }
          });

          resolve();
          return;
        } catch (error) {
          lastError = error;
        }
      }

      socketReady = false;
      const defaultMessage = "Could not connect to game server. Open the game from the host machine URL and run npm start there. You can also pass ?server=HOST:PORT in the URL.";
      reject(lastError || new Error(defaultMessage));
    };

    tryConnect();
  });
}

function performRoomAction(payload) {
  return new Promise((resolve, reject) => {
    pendingRoomAction = { resolve, reject };
    sendSocketMessage(payload);

    window.setTimeout(() => {
      if (!pendingRoomAction) {
        return;
      }

      pendingRoomAction = null;
      reject(new Error("Server timeout. Try again."));
    }, 7000);
  });
}

function setLobbyError(message = "") {
  if (!lobbyError) {
    return;
  }

  lobbyError.textContent = message;
  lobbyError.classList.toggle("is-hidden", message.length === 0);
}

function showLobbyStep(stepId) {
  const allSteps = [stepName, stepMenu, stepCreate, stepCreated, stepJoin];
  for (const step of allSteps) {
    if (!step) {
      continue;
    }

    step.classList.toggle("is-hidden", step.id !== stepId);
  }

  if (lobbyBackButton) {
    const canGoBack = stepId === "step-create" || stepId === "step-join";
    lobbyBackButton.classList.toggle("is-hidden", !canGoBack);
  }
}

function readSelectedRole(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked?.value === "hunter" ? "hunter" : "survivor";
}

function prepareLobbyMenu() {
  if (lobbyGreeting) {
    lobbyGreeting.textContent = `Welcome, ${survivorName}. Create a room or join a room with a code.`;
  }

  if (lobbySubtitle) {
    lobbySubtitle.textContent = "Select how you want to play.";
  }

  setLobbyError("");
  showLobbyStep("step-menu");
}

function returnToNameEntry() {
  // Stop the game
  gameStarted = false;
  matchWinner = null;
  roomStarted = false;

  // Disconnect socket if connected
  if (socket) {
    socket.close();
    socket = null;
    socketReady = false;
    socketPlayerId = "";
  }

  // Reset game state
  survivorIsHidden = false;
  survivorHideBlend = 0;
  survivorHideTarget = 0;
  survivorHideTransitioning = false;
  survivorIsDead = false;
  survivorIsEscaped = false;
  survivorFootsteps.length = 0;
  footstepDistanceSinceLast = 0;
  nextFootIsLeft = true;
  survivorHideMessage = "";
  survivorHideMessageTime = 0;
  killAnimations.length = 0;
  hunterHitAnimations.length = 0;

  // Reset room state
  activeRoomCode = "";
  activeRoomConfig = ROOM_CONFIGS.h1s4;
  roomPlayers.length = 0;
  primaryRivalId = "";
  roomOwnerId = "";
  hasAppliedInitialSpawn = false;
  matchTimeRemaining = MATCH_TIMER.durationSeconds;
  frontDoorOpen = false;
  frontDoorOpenProgress = 0;
  survivorEscapedCount = 0;
  survivorEscapesNeeded = 1;

  // Reset player positions
  player.x = 540;
  player.y = 440;
  hunter.x = 4300;
  hunter.y = 2550;

  // Hide game UI and show start screen
  if (hud) {
    hud.classList.add("is-hidden");
  }

  if (startScreen) {
    startScreen.classList.remove("is-hidden");
  }

  // Reset lobby UI
  playerNameInput.value = "";
  setLobbyError("");
  showLobbyStep("step-name");
}

async function createRoomFromLobby() {
  const configId = createConfigSelect?.value || "h1s4";
  const role = readSelectedRole("createRole");

  try {
    await ensureSocketConnection();
    localPlayerRole = role;
    const room = await performRoomAction({
      type: "createRoom",
      configId,
      role,
      name: survivorName,
    });

    applyRoomSnapshot(room);
  } catch (error) {
    setLobbyError(error.message || "Could not create room.");
    return;
  }

  localPlayerRole = role;

  if (createdRoomCode) {
    createdRoomCode.textContent = activeRoomCode || "------";
  }

  updateRoomLobbyUI({
    hunterCount: roomPlayers.filter((entry) => entry.role === "hunter").length,
    survivorCount: roomPlayers.filter((entry) => entry.role === "survivor").length,
    isFull: false,
  });

  setLobbyError("");
  showLobbyStep("step-created");
  maybeStartWhenRoomReady();
}

async function joinRoomFromLobby() {
  const requestedCode = sanitizeRoomCode(joinCodeInput?.value || "");
  const role = readSelectedRole("joinRole");

  if (!requestedCode) {
    setLobbyError("Enter a valid room code first.");
    return;
  }

  try {
    await ensureSocketConnection();
    localPlayerRole = role;
    const room = await performRoomAction({
      type: "joinRoom",
      code: requestedCode,
      role,
      name: survivorName,
    });
    applyRoomSnapshot(room);
  } catch (error) {
    setLobbyError(error.message || "Could not join room.");
    return;
  }

  if (createdRoomCode) {
    createdRoomCode.textContent = activeRoomCode || requestedCode;
  }

  updateRoomLobbyUI({
    hunterCount: roomPlayers.filter((entry) => entry.role === "hunter").length,
    survivorCount: roomPlayers.filter((entry) => entry.role === "survivor").length,
    isFull: false,
  });

  setLobbyError("");
  showLobbyStep("step-created");
  maybeStartWhenRoomReady();
}

function startGame() {
  if (gameStarted) {
    return;
  }

  if (activeRoomCode && !roomStarted) {
    return;
  }

  if (!activeRoomCode) {
    activeRoomCode = "LOCAL";
  }

  applyInitialSpawnFromRoom();

  const roleTitle = localPlayerRole === "hunter" ? "Hunter" : "Survivor";
  if (hudTitle) {
    hudTitle.textContent = `Brawl: House of Shadows - ${survivorName} (${roleTitle})`;
  }

  if (hudRoom) {
    hudRoom.textContent = `Room ${activeRoomCode} | Setup: ${activeRoomConfig.label} | Players: ${roomPlayers.length || 1}`;
  }

  if (hudControls) {
    hudControls.textContent = localPlayerRole === "hunter"
      ? "Hunter controls: Arrow Keys move. Press 0 to kill when in range."
      : "Survivor controls: WASD move. E open door. F close door. Q hide. Front door unlocks at 0:00.";
  }

  if (hud) {
    hud.classList.remove("is-hidden");
  }

  if (startScreen) {
    startScreen.classList.add("is-hidden");
  }

  if (socketReady && roomStarted) {
    matchTimeRemaining = Math.max(0, matchTimeRemaining);
    frontDoorOpen = frontDoorOpen || matchTimeRemaining <= 0;
    survivorEscapesNeeded = Math.max(1, survivorEscapesNeeded);
  } else {
    matchTimeRemaining = MATCH_TIMER.durationSeconds;
    frontDoorOpen = false;
    survivorEscapedCount = 0;
    survivorEscapesNeeded = 1;
  }
  frontDoorOpenProgress = frontDoorOpen ? 1 : 0;
  lastTime = performance.now();
  gameStarted = true;
}

function resize() {
  screen.width = window.innerWidth;
  screen.height = window.innerHeight;

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(screen.width * ratio);
  canvas.height = Math.floor(screen.height * ratio);

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function spansOverlap(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return { start, end, size: end - start };
}

function mergeRanges(ranges) {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function buildDoors(roomList) {
  const generatedDoors = [];

  for (let i = 0; i < roomList.length; i += 1) {
    for (let j = i + 1; j < roomList.length; j += 1) {
      const a = roomList[i];
      const b = roomList[j];

      const aRightToBLeft = Math.abs(a.x + a.w - b.x) <= DOOR.wallGap;
      const bRightToALeft = Math.abs(b.x + b.w - a.x) <= DOOR.wallGap;

      if (aRightToBLeft || bRightToALeft) {
        const left = a.x < b.x ? a : b;
        const right = left === a ? b : a;
        const overlap = spansOverlap(left.y, left.y + left.h, right.y, right.y + right.h);

        if (overlap.size > DOOR.verticalHeight + 40) {
          const y = overlap.start + overlap.size * 0.5 - DOOR.verticalHeight * 0.5;
          generatedDoors.push({
            a: left.name,
            b: right.name,
            orientation: "vertical",
            x: left.x + left.w - (DOOR.verticalDepth - DOOR.wallGap) * 0.5,
            y,
            w: DOOR.verticalDepth,
            h: DOOR.verticalHeight,
            isOpen: true,
            openProgress: 1,
            hingeSide: (i + j) % 2 === 0 ? 1 : -1,
          });
        }
      }

      const aBottomToBTop = Math.abs(a.y + a.h - b.y) <= DOOR.wallGap;
      const bBottomToATop = Math.abs(b.y + b.h - a.y) <= DOOR.wallGap;

      if (aBottomToBTop || bBottomToATop) {
        const top = a.y < b.y ? a : b;
        const bottom = top === a ? b : a;
        const overlap = spansOverlap(top.x, top.x + top.w, bottom.x, bottom.x + bottom.w);

        if (overlap.size > DOOR.horizontalWidth + 40) {
          const x = overlap.start + overlap.size * 0.5 - DOOR.horizontalWidth * 0.5;
          generatedDoors.push({
            a: top.name,
            b: bottom.name,
            orientation: "horizontal",
            x,
            y: top.y + top.h - (DOOR.horizontalDepth - DOOR.wallGap) * 0.5,
            w: DOOR.horizontalWidth,
            h: DOOR.horizontalDepth,
            isOpen: true,
            openProgress: 1,
            hingeSide: (i + j) % 2 === 0 ? 1 : -1,
          });
        }
      }
    }
  }

  return generatedDoors;
}

function pointInsideRectWithRadius(x, y, radius, rect) {
  return x >= rect.x + radius && x <= rect.x + rect.w - radius && y >= rect.y + radius && y <= rect.y + rect.h - radius;
}

function pointInsideOpenDoorWithRadius(x, y, radius, door) {
  const openProgress = Number.isFinite(door.openProgress) ? door.openProgress : (door.isOpen ? 1 : 0);
  if (openProgress < DOOR_ANIMATION.openClearance) {
    return false;
  }

  if (door.orientation === "vertical") {
    return x >= door.x - radius && x <= door.x + door.w + radius && y >= door.y + radius && y <= door.y + door.h - radius;
  }

  return x >= door.x + radius && x <= door.x + door.w - radius && y >= door.y - radius && y <= door.y + door.h + radius;
}

function pointInsideFrontDoorEscapeZoneWithRadius(x, y, radius) {
  const zone = frontDoor.escapeZone;
  return x >= zone.x + radius
    && x <= zone.x + zone.w - radius
    && y >= zone.y + radius
    && y <= zone.y + zone.h - radius;
}

function canOccupy(entity, x, y) {
  const minX = entity.radius + 4;
  const minY = entity.radius + 4;
  const maxX = WORLD.width - entity.radius - 4;
  const maxY = WORLD.height - entity.radius - 4;

  if (x < minX || x > maxX || y < minY || y > maxY) {
    return false;
  }

  for (const room of rooms) {
    if (pointInsideRectWithRadius(x, y, entity.radius, room)) {
      return true;
    }
  }

  for (const door of doors) {
    if (door.isOpen && pointInsideOpenDoorWithRadius(x, y, entity.radius, door)) {
      return true;
    }
  }

  if (entity === player && localPlayerRole === "survivor" && frontDoorOpen) {
    if (pointInsideOpenDoorWithRadius(x, y, entity.radius, frontDoor)) {
      return true;
    }

    if (pointInsideFrontDoorEscapeZoneWithRadius(x, y, entity.radius)) {
      return true;
    }
  }

  return false;
}

function moveEntity(entity, moveX, moveY) {
  const maxAxis = Math.max(Math.abs(moveX), Math.abs(moveY));
  const steps = Math.max(1, Math.ceil(maxAxis / 18));
  const stepX = moveX / steps;
  const stepY = moveY / steps;

  for (let i = 0; i < steps; i += 1) {
    const nextX = entity.x + stepX;
    if (canOccupy(entity, nextX, entity.y)) {
      entity.x = nextX;
    }

    const nextY = entity.y + stepY;
    if (canOccupy(entity, entity.x, nextY)) {
      entity.y = nextY;
    }
  }
}

function distanceToDoor(entity, door) {
  const nearestX = clamp(entity.x, door.x, door.x + door.w);
  const nearestY = clamp(entity.y, door.y, door.y + door.h);
  return Math.hypot(entity.x - nearestX, entity.y - nearestY);
}

function distanceToRect(entity, rect) {
  const nearestX = clamp(entity.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(entity.y, rect.y, rect.y + rect.h);
  return Math.hypot(entity.x - nearestX, entity.y - nearestY);
}

function nearestDoorFor(entity) {
  let bestDoor = null;
  let bestDistance = Infinity;

  for (const door of doors) {
    const distance = distanceToDoor(entity, door);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDoor = door;
    }
  }

  return { door: bestDoor, distance: bestDistance };
}

function nearestHidingSpotFor(entity) {
  let bestSpot = null;
  let bestDistance = Infinity;

  for (const spot of hidingSpots) {
    const distance = distanceToRect(entity, spot);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSpot = spot;
    }
  }

  return { spot: bestSpot, distance: bestDistance };
}

function interactDoor(entity, shouldOpen) {
  const { door, distance } = nearestDoorFor(entity);
  if (!door || distance > DOOR.interactionRange) {
    return;
  }

  door.isOpen = shouldOpen;
}

function autoOpenDoorFor(entity, range = 90) {
  const { door, distance } = nearestDoorFor(entity);
  if (door && !door.isOpen && distance <= range) {
    door.isOpen = true;
  }
}

function updateDoorAnimations(deltaSeconds) {
  const speed = 1 / DOOR_ANIMATION.transitionSeconds;

  for (const door of doors) {
    if (!Number.isFinite(door.openProgress)) {
      door.openProgress = door.isOpen ? 1 : 0;
    }

    const target = door.isOpen ? 1 : 0;
    if (door.openProgress < target) {
      door.openProgress = Math.min(target, door.openProgress + deltaSeconds * speed);
    } else if (door.openProgress > target) {
      door.openProgress = Math.max(target, door.openProgress - deltaSeconds * speed);
    }
  }

  frontDoor.isOpen = frontDoorOpen;
  const frontSpeed = 1 / DOOR_ANIMATION.transitionSeconds;
  const frontTarget = frontDoorOpen ? 1 : 0;
  if (frontDoorOpenProgress < frontTarget) {
    frontDoorOpenProgress = Math.min(frontTarget, frontDoorOpenProgress + deltaSeconds * frontSpeed);
  } else if (frontDoorOpenProgress > frontTarget) {
    frontDoorOpenProgress = Math.max(frontTarget, frontDoorOpenProgress - deltaSeconds * frontSpeed);
  }
  frontDoor.openProgress = frontDoorOpenProgress;
}

function maybeEscapeFromFrontDoor() {
  if (localPlayerRole !== "survivor" || survivorIsDead || survivorIsEscaped || !frontDoorOpen) {
    return;
  }

  if (!pointInsideFrontDoorEscapeZoneWithRadius(player.x, player.y, player.radius)) {
    return;
  }

  if (!socketReady) {
    survivorIsEscaped = true;
    const needEscapes = 1;
    survivorEscapedCount = Math.max(survivorEscapedCount, 1);
    survivorEscapesNeeded = needEscapes;
    matchWinner = survivorEscapedCount >= survivorEscapesNeeded ? "survivor" : "hunter";
  }
}

function toggleHideState() {
  if (survivorIsDead) {
    return;
  }

  if (survivorIsHidden || survivorHideTransitioning) {
    return;
  }

  const { spot, distance } = nearestHidingSpotFor(player);
  if (!spot || distance > HIDE.interactionRange) {
    return;
  }

  player.x = spot.x + spot.w * 0.5;
  player.y = spot.y + spot.h * 0.5;
  survivorIsHidden = true;
  survivorHideTarget = 1;
  survivorHideBlend = 0;
  survivorHideTransitioning = true;
  survivorHideMessage = "You are now HIDDEN";
  survivorHideMessageTime = 2; // 2 seconds

  if (socketReady && gameStarted && localPlayerRole === "survivor") {
    const nowSeconds = performance.now() / 1000;
    lastNetworkSendAt = nowSeconds;
    lastSentState = {
      x: player.x,
      y: player.y,
      hidden: true,
      dead: false,
    };

    sendSocketMessage({
      type: "playerUpdate",
      x: player.x,
      y: player.y,
      hidden: true,
      dead: false,
    });
  }
}

function revealFromHide(message = "You are now VISIBLE") {
  if (!survivorIsHidden || survivorIsDead || survivorHideTransitioning) {
    return;
  }

  survivorHideTarget = 0;
  survivorHideTransitioning = true;
  survivorHideMessage = message;
  survivorHideMessageTime = 2;

  if (socketReady && gameStarted && localPlayerRole === "survivor") {
    const nowSeconds = performance.now() / 1000;
    lastNetworkSendAt = nowSeconds;
    lastSentState = {
      x: player.x,
      y: player.y,
      hidden: false,
      dead: false,
    };

    sendSocketMessage({
      type: "playerUpdate",
      x: player.x,
      y: player.y,
      hidden: false,
      dead: false,
    });
  }
}

function maybeAutoRevealWhenHunterNearby() {
  if (!gameStarted || localPlayerRole !== "survivor" || survivorIsDead || !survivorIsHidden || survivorHideTransitioning) {
    return;
  }

  const distanceToHunter = Math.hypot(hunter.x - player.x, hunter.y - player.y);
  if (distanceToHunter > HIDE.revealRange) {
    return;
  }

  revealFromHide("You are appearing");
}

function updateHideAnimation(deltaSeconds) {
  const speed = 1 / HIDE.transitionSeconds;

  if (survivorHideBlend < survivorHideTarget) {
    survivorHideBlend = Math.min(survivorHideTarget, survivorHideBlend + deltaSeconds * speed);
  } else if (survivorHideBlend > survivorHideTarget) {
    survivorHideBlend = Math.max(survivorHideTarget, survivorHideBlend - deltaSeconds * speed);
  }

  if (survivorHideBlend <= 0.01 && survivorHideTarget === 0) {
    survivorHideBlend = 0;
    survivorIsHidden = false;
    survivorHideTransitioning = false;
  } else if (survivorHideBlend >= 0.99 && survivorHideTarget === 1) {
    survivorHideBlend = 1;
    survivorIsHidden = true;
    survivorHideTransitioning = false;
  } else {
    survivorHideTransitioning = Math.abs(survivorHideBlend - survivorHideTarget) > 0.01;
  }
}

function updateEntityRunAnimation(entity, state, deltaSeconds) {
  const movedDistance = Math.hypot(entity.x - state.prevX, entity.y - state.prevY);
  const movedSpeed = deltaSeconds > 0 ? movedDistance / deltaSeconds : 0;
  const isMoving = movedDistance > RUN.minDistance;
  const shouldAutoFace = entity !== player;

  if (isMoving) {
    const targetDirX = (entity.x - state.prevX) / movedDistance;
    const targetDirY = (entity.y - state.prevY) / movedDistance;
    const rotateLerp = clamp(deltaSeconds * 12, 0, 1);
    state.dirX += (targetDirX - state.dirX) * rotateLerp;
    state.dirY += (targetDirY - state.dirY) * rotateLerp;

    if (shouldAutoFace && Math.abs(targetDirX) > 0.14) {
      state.facingSign = targetDirX < 0 ? -1 : 1;
    }

    const dirLength = Math.hypot(state.dirX, state.dirY) || 1;
    state.dirX /= dirLength;
    state.dirY /= dirLength;
  }

  if (isMoving) {
    state.blend = clamp(state.blend + deltaSeconds * RUN.blendIn, 0, 1);
  } else {
    state.blend = clamp(state.blend - deltaSeconds * RUN.blendOut, 0, 1);
  }

  state.phase += (RUN.phaseBase + movedSpeed * RUN.phaseSpeedScale) * deltaSeconds * state.blend;
  state.prevX = entity.x;
  state.prevY = entity.y;
}

function moveSurvivor(deltaSeconds) {
  if (localPlayerRole !== "survivor") {
    return;
  }

  if (matchWinner) {
    return;
  }

  if (survivorIsDead) {
    return;
  }

  if (survivorIsEscaped) {
    return;
  }

  const wantsMove = keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD");

  if (survivorIsHidden || survivorHideTransitioning) {
    if (wantsMove) {
      revealFromHide();
    }

    return;
  }

  let dx = 0;
  let dy = 0;

  if (keys.has("KeyW")) dy -= 1;
  if (keys.has("KeyS")) dy += 1;
  if (keys.has("KeyA")) dx -= 1;
  if (keys.has("KeyD")) dx += 1;

  if (dx < 0) {
    runAnimation.survivor.facingSign = 1;
  } else if (dx > 0) {
    runAnimation.survivor.facingSign = -1;
  }

  if (dx !== 0 || dy !== 0) {
    const beforeX = player.x;
    const beforeY = player.y;
    const length = Math.hypot(dx, dy) || 1;
    const distance = player.speed * deltaSeconds;
    moveEntity(player, (dx / length) * distance, (dy / length) * distance);

    const movedX = player.x - beforeX;
    const movedY = player.y - beforeY;
    const movedDistance = Math.hypot(movedX, movedY);

    if (movedDistance > 0.01) {
      const directionX = movedX / movedDistance;
      const directionY = movedY / movedDistance;
      const perpendicularX = -directionY;
      const perpendicularY = directionX;
      const directionAngle = Math.atan2(directionY, directionX);

      footstepDistanceSinceLast += movedDistance;

      while (footstepDistanceSinceLast >= FOOTSTEP.spacing) {
        footstepDistanceSinceLast -= FOOTSTEP.spacing;

        const sideSign = nextFootIsLeft ? -1 : 1;
        survivorFootsteps.push({
          x: player.x + perpendicularX * FOOTSTEP.sideOffset * sideSign,
          y: player.y + perpendicularY * FOOTSTEP.sideOffset * sideSign,
          angle: directionAngle,
          bornAt: performance.now() / 1000,
        });
        nextFootIsLeft = !nextFootIsLeft;
      }
    }
  }

  maybeEscapeFromFrontDoor();
}

function updateFootsteps(nowSeconds) {
  while (survivorFootsteps.length > 0 && nowSeconds - survivorFootsteps[0].bornAt > FOOTSTEP.lifetime) {
    survivorFootsteps.shift();
  }
}

function drawFootsteps(cam, nowSeconds) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const step of survivorFootsteps) {
    const age = nowSeconds - step.bornAt;
    if (age < 0 || age > FOOTSTEP.lifetime) {
      continue;
    }

    const life = 1 - age / FOOTSTEP.lifetime;
    const alpha = life * 0.45;

    ctx.save();
    ctx.translate(step.x, step.y);
    ctx.rotate(step.angle);

    ctx.fillStyle = `rgba(28, 33, 40, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, FOOTSTEP.length * 0.5, FOOTSTEP.width, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(220, 230, 244, ${alpha * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(-2, -1, FOOTSTEP.length * 0.22, FOOTSTEP.width * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

function moveHunter(deltaSeconds) {
  void deltaSeconds;
}

function moveHunterWithKeys(deltaSeconds) {
  if (localPlayerRole !== "hunter") {
    return false;
  }

  if (matchWinner) {
    return false;
  }

  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowUp")) dy -= 1;
  if (keys.has("ArrowDown")) dy += 1;
  if (keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("ArrowRight")) dx += 1;

  if (dx === 0 && dy === 0) {
    return false;
  }

  const length = Math.hypot(dx, dy) || 1;
  const distance = hunter.speed * deltaSeconds;
  moveEntity(hunter, (dx / length) * distance, (dy / length) * distance);
  autoOpenDoorFor(hunter);
  return true;
}

function tryHunterKill() {
  const rival = roomPlayers.find((entry) => entry.id === primaryRivalId);
  if (!rival || rival.role !== "survivor" || rival.dead || rival.escaped) {
    return false;
  }

  const killRange = NET.killRange;
  const distance = Math.hypot(hunter.x - rival.x, hunter.y - rival.y);
  if (distance > killRange) {
    return false;
  }

  const angle = Math.atan2(rival.y - hunter.y, rival.x - hunter.x);
  hunterHitAnimations.push({
    x: hunter.x,
    y: hunter.y,
    angle,
    progress: 0,
    duration: 0.22,
  });

  sendSocketMessage({ type: "attemptKill", targetId: rival.id });
  return true;
}

function drawHunterHitAnimations(cam) {
  if (hunterHitAnimations.length === 0) {
    return;
  }

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const anim of hunterHitAnimations) {
    const progress = Math.min(anim.progress, 1);
    const ease = 1 - Math.pow(1 - progress, 2);
    const swing = -0.8 + ease * 1.5;
    const reach = 34 + ease * 20;
    const alpha = 1 - progress;

    ctx.save();
    ctx.translate(anim.x, anim.y);
    ctx.rotate(anim.angle + swing);

    ctx.strokeStyle = `rgba(255, 215, 130, ${0.2 * alpha})`;
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(reach, 0);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 90, 90, ${0.88 * alpha})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(reach, 0);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 255, 255, ${0.32 * alpha})`;
    ctx.beginPath();
    ctx.arc(reach, 0, 5 + progress * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

function updateHideIndicator() {
  if (!gameStarted || localPlayerRole !== "survivor" || survivorIsDead || survivorIsHidden || survivorIsEscaped) {
    if (hideIndicator) {
      hideIndicator.classList.add("is-hidden");
    }
    return;
  }

  const { spot, distance } = nearestHidingSpotFor(player);
  const canHide = spot && distance <= HIDE.interactionRange;

  if (hideIndicator) {
    hideIndicator.classList.toggle("is-hidden", !canHide);
  }
}

function getLocalEntity() {
  return localPlayerRole === "hunter" ? hunter : player;
}

function getRemotePlayers() {
  return roomPlayers.filter((entry) => entry.id !== socketPlayerId);
}

function applyNetworkStateToWorld() {
  const self = roomPlayers.find((entry) => entry.id === socketPlayerId);
  if (self && localPlayerRole === "survivor") {
    const wasDead = survivorIsDead;
    survivorIsHidden = Boolean(self.hidden);
    survivorIsDead = Boolean(self.dead);
    survivorIsEscaped = Boolean(self.escaped);
    if (survivorIsHidden && !survivorHideTransitioning) {
      survivorHideBlend = 1;
    }
    if (!wasDead && survivorIsDead) {
      survivorHideBlend = 0;
      survivorHideTarget = 0;
      survivorHideTransitioning = false;
    }
  }

  const rivals = getRemotePlayers().filter((entry) => entry.role !== localPlayerRole);
  const primaryRival = rivals.find((entry) => entry.id === primaryRivalId) || rivals[0] || null;
  primaryRivalId = primaryRival?.id || "";

  if (!primaryRival) {
    return;
  }

  if (localPlayerRole === "hunter") {
    player.x = primaryRival.x;
    player.y = primaryRival.y;
    survivorIsHidden = Boolean(primaryRival.hidden);
    survivorIsDead = Boolean(primaryRival.dead);
    survivorIsEscaped = Boolean(primaryRival.escaped);
    if (survivorIsHidden && !survivorHideTransitioning) {
      survivorHideBlend = 1;
    }
    if (survivorIsDead) {
      survivorHideBlend = 0;
      survivorHideTarget = 0;
      survivorHideTransitioning = false;
    }
  } else {
    hunter.x = primaryRival.x;
    hunter.y = primaryRival.y;
  }
}

function syncLocalPlayerToRoom(elapsedSeconds) {
  if (!socketReady || !gameStarted) {
    return;
  }

  if (matchWinner) {
    return;
  }

  if (elapsedSeconds - lastNetworkSendAt < NET.sendRateSeconds) {
    return;
  }

  const localEntity = getLocalEntity();
  const nextState = {
    x: localEntity.x,
    y: localEntity.y,
    hidden: localPlayerRole === "survivor" ? survivorIsHidden : false,
    dead: localPlayerRole === "survivor" ? survivorIsDead : false,
    escaped: localPlayerRole === "survivor" ? survivorIsEscaped : false,
  };

  if (lastSentState) {
    const movedDistance = Math.hypot(nextState.x - lastSentState.x, nextState.y - lastSentState.y);
    const changed = movedDistance >= NET.minMoveDelta
      || nextState.hidden !== lastSentState.hidden
      || nextState.dead !== lastSentState.dead
      || nextState.escaped !== lastSentState.escaped;

    if (!changed) {
      return;
    }
  }

  lastNetworkSendAt = elapsedSeconds;
  lastSentState = { ...nextState };

  sendSocketMessage({
    type: "playerUpdate",
    x: nextState.x,
    y: nextState.y,
    hidden: nextState.hidden,
    dead: nextState.dead,
    escaped: nextState.escaped,
  });
}

function drawRemotePlayers(cam) {
  const remotePlayers = getRemotePlayers();
  if (remotePlayers.length === 0) {
    return;
  }

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const remote of remotePlayers) {
    if (remote.role === "survivor" && remote.escaped) {
      continue;
    }

    if (remote.id === primaryRivalId) {
      continue;
    }

    const remoteEntity = {
      x: remote.x,
      y: remote.y,
      radius: remote.role === "hunter" ? hunter.radius : player.radius,
    };

    drawCharacter(remoteEntity, cam, { phase: 0, blend: 0, facingSign: 1 }, {
      role: remote.role,
      hideBlend: remote.role === "survivor" && remote.hidden ? 1 : 0,
      isDead: remote.role === "survivor" && remote.dead,
      isEscaped: remote.role === "survivor" && remote.escaped,
    });
  }

  ctx.restore();
}

function drawCharacterNameTag(name, x, y, role) {
  const isHunter = role === "hunter";
  const radius = isHunter ? hunter.radius : player.radius;
  const topGap = isHunter ? 13 : 11;

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "12px Special Elite";

  const label = String(name || (isHunter ? "Hunter" : "Survivor"));
  const textWidth = ctx.measureText(label).width;
  const tagX = x;
  const tagY = y - radius - topGap;

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(tagX - textWidth * 0.5 - 7, tagY - 11, textWidth + 14, 16);

  ctx.fillStyle = isHunter ? "rgba(255, 196, 196, 0.95)" : "rgba(210, 232, 255, 0.95)";
  ctx.fillText(label, tagX, tagY + 1);
  ctx.restore();
}

function drawAllNameTags(cam) {
  if (!gameStarted) {
    return;
  }

  if (localPlayerRole === "survivor" && survivorIsHidden) {
    return;
  }

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  if (!roomPlayers.length) {
    drawCharacterNameTag(survivorName, getLocalEntity().x, getLocalEntity().y, localPlayerRole);
    ctx.restore();
    return;
  }

  const taggedIds = new Set();
  for (const entry of roomPlayers) {
    if (taggedIds.has(entry.id)) {
      continue;
    }

    if (entry.role === "survivor" && entry.hidden) {
      continue;
    }

    if (entry.role === "survivor" && entry.escaped) {
      continue;
    }

    taggedIds.add(entry.id);

    let x = entry.x;
    let y = entry.y;

    if (entry.id === socketPlayerId) {
      const selfEntity = getLocalEntity();
      x = selfEntity.x;
      y = selfEntity.y;
    } else if (entry.id === primaryRivalId) {
      if (localPlayerRole === "hunter") {
        x = player.x;
        y = player.y;
      } else {
        x = hunter.x;
        y = hunter.y;
      }
    }

    drawCharacterNameTag(entry.name, x, y, entry.role);
  }

  ctx.restore();
}

function cameraFor(entity, viewport) {
  const halfW = viewport.w * 0.5;
  const halfH = viewport.h * 0.5;

  return {
    x: clamp(entity.x - halfW, 0, WORLD.width - viewport.w),
    y: clamp(entity.y - halfH, 0, WORLD.height - viewport.h),
  };
}

function drawWorldGrid(cam, viewport) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  const backdrop = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  backdrop.addColorStop(0, "#0d1118");
  backdrop.addColorStop(0.46, "#080b11");
  backdrop.addColorStop(1, "#05070b");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const glow = ctx.createRadialGradient(WORLD.width * 0.28, WORLD.height * 0.24, 0, WORLD.width * 0.28, WORLD.height * 0.24, WORLD.width * 0.92);
  glow.addColorStop(0, "rgba(72, 88, 112, 0.06)");
  glow.addColorStop(0.35, "rgba(72, 88, 112, 0.02)");
  glow.addColorStop(1, "rgba(72, 88, 112, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const bloodMist = ctx.createRadialGradient(WORLD.width * 0.62, WORLD.height * 0.72, 0, WORLD.width * 0.62, WORLD.height * 0.72, WORLD.width * 0.96);
  bloodMist.addColorStop(0, "rgba(86, 12, 14, 0.11)");
  bloodMist.addColorStop(0.5, "rgba(55, 8, 10, 0.05)");
  bloodMist.addColorStop(1, "rgba(40, 5, 7, 0)");
  ctx.fillStyle = bloodMist;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const floorSheen = ctx.createRadialGradient(WORLD.width * 0.45, WORLD.height * 0.38, 0, WORLD.width * 0.45, WORLD.height * 0.38, WORLD.width * 0.92);
  floorSheen.addColorStop(0, "rgba(255, 255, 255, 0.018)");
  floorSheen.addColorStop(0.5, "rgba(255, 255, 255, 0.008)");
  floorSheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = floorSheen;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.007)";
  for (let i = 0; i < 160; i += 1) {
    const x = (i * 173) % WORLD.width;
    const y = (i * 311) % WORLD.height;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.009)";
  ctx.lineWidth = 1;
  for (let y = 0; y <= WORLD.height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
  for (let x = 0; x <= WORLD.width; x += 220) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + WORLD.height * 0.08, WORLD.height);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  for (let i = 0; i < 12; i += 1) {
    const sx = (i * 421) % WORLD.width;
    const sy = (i * 263) % WORLD.height;
    const sw = 180 + (i % 4) * 70;
    const sh = 40 + (i % 3) * 22;
    ctx.fillRect(sx, sy, sw, sh);
  }

  ctx.restore();
}

function drawGroundShadow(x, y, w, h, alpha = 0.28) {
  const gradient = ctx.createRadialGradient(x + w * 0.5, y + h * 0.55, 0, x + w * 0.5, y + h * 0.55, Math.max(w, h) * 0.75);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.55, w * 0.5, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawProjectedShadowRect(x, y, w, h, height = 36, alpha = 0.2) {
  const dx = -LIGHT.direction.x * LIGHT.shadowLength * (height / 36);
  const dy = -LIGHT.direction.y * LIGHT.shadowLength * (height / 36);

  ctx.save();
  const shadow = ctx.createLinearGradient(x + w * 0.5, y + h, x + w * 0.5 + dx, y + h + dy);
  shadow.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shadow;

  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w + dx, y + h + dy);
  ctx.lineTo(x + dx, y + h + dy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWithDepth(drawFn, shadowColor = "rgba(0, 0, 0, 0.28)", offsetX = 4, offsetY = 6, blur = 7) {
  ctx.save();
  ctx.shadowColor = shadowColor;
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
  ctx.shadowBlur = blur;
  drawFn();
  ctx.restore();
}

function drawMaterialRect(x, y, w, h, colors, options = {}) {
  const depth = Math.max(2, Math.min(options.depth ?? 8, Math.min(w, h) * 0.12));
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, colors.top);
  gradient.addColorStop(0.52, colors.mid || colors.top);
  gradient.addColorStop(1, colors.bottom);

  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  if (depth > 0) {
    ctx.fillStyle = options.sideRight || "rgba(0, 0, 0, 0.20)";
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + depth, y + depth * 0.45);
    ctx.lineTo(x + w + depth, y + h + depth * 0.45);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = options.sideBottom || "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w + depth, y + h + depth * 0.45);
    ctx.lineTo(x + depth, y + h + depth * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  if (options.gloss !== false) {
    ctx.fillStyle = options.gloss || "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(x + 2, y + 2, Math.max(0, w - 4), Math.max(0, h * 0.16));

    const directionalSpecular = ctx.createLinearGradient(
      x,
      y,
      x + -LIGHT.direction.x * w,
      y + -LIGHT.direction.y * h
    );
    directionalSpecular.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    directionalSpecular.addColorStop(0.45, "rgba(255, 255, 255, 0.05)");
    directionalSpecular.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = directionalSpecular;
    ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
  }

  if (options.rim !== false) {
    ctx.fillStyle = options.rim || "rgba(255, 255, 255, 0.03)";
    ctx.fillRect(x + 1, y + 1, 2, Math.max(0, h - 2));
    ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), 2);
  }

  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = options.borderWidth || 2;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
  }
}

function drawInsetPanel(x, y, w, h, colors, options = {}) {
  drawMaterialRect(x, y, w, h, colors, { ...options, depth: options.depth ?? 7 });

  const inset = options.inset ?? 8;
  if (w > inset * 2 && h > inset * 2) {
    ctx.fillStyle = options.innerFill || "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  }
}

function drawWallSegment(startX, startY, width, height) {
  if (width > 0 && height > 0) {
    ctx.fillRect(startX, startY, width, height);
  }
}

function drawWallSegment3D(startX, startY, width, height, orientation, room) {
  if (width <= 0 || height <= 0) {
    return;
  }

  const depth = 12;
  const faceColor = "rgba(229, 214, 194, 0.28)";
  const topColor = "rgba(255, 245, 230, 0.18)";
  const sideColor = "rgba(57, 46, 36, 0.34)";
  const shadowColor = "rgba(0, 0, 0, 0.18)";

  ctx.fillStyle = shadowColor;
  if (orientation === "horizontal") {
    ctx.fillRect(startX, startY + height, width, depth);
    ctx.fillRect(startX, startY, width, height);

    ctx.fillStyle = topColor;
    ctx.fillRect(startX, startY - depth, width, depth);

    ctx.fillStyle = sideColor;
    ctx.fillRect(startX, startY - depth, 4, height + depth);
    ctx.fillRect(startX + width - 4, startY - depth, 4, height + depth);
  } else {
    ctx.fillRect(startX + width, startY, depth, height);
    ctx.fillRect(startX, startY, width, height);

    ctx.fillStyle = topColor;
    ctx.fillRect(startX - depth, startY, depth, height);

    ctx.fillStyle = sideColor;
    ctx.fillRect(startX - depth, startY, width + depth, 4);
    ctx.fillRect(startX - depth, startY + height - 4, width + depth, 4);
  }

  ctx.fillStyle = faceColor;
  ctx.fillRect(startX, startY, width, height);

  if (room) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    if (orientation === "horizontal") {
      ctx.fillRect(startX, startY, width, 2);
    } else {
      ctx.fillRect(startX, startY, 2, height);
    }
  }
}

function drawRoomWalls(room) {
  const wallThickness = WALL_THICKNESS;
  const wallFaceY = room.y - 1;
  const wallFaceX = room.x - 1;
  const horizontalGaps = { top: [], bottom: [] };
  const verticalGaps = { left: [], right: [] };

  for (const door of doors) {
    if (door.orientation === "horizontal") {
      if (door.a === room.name) {
        horizontalGaps.bottom.push({ start: door.x, end: door.x + door.w });
      } else if (door.b === room.name) {
        horizontalGaps.top.push({ start: door.x, end: door.x + door.w });
      }
    }

    if (door.orientation === "vertical") {
      if (door.a === room.name) {
        verticalGaps.right.push({ start: door.y, end: door.y + door.h });
      } else if (door.b === room.name) {
        verticalGaps.left.push({ start: door.y, end: door.y + door.h });
      }
    }
  }

  const topWallRanges = mergeRanges(horizontalGaps.top);
  const bottomWallRanges = mergeRanges(horizontalGaps.bottom);
  const leftWallRanges = mergeRanges(verticalGaps.left);
  const rightWallRanges = mergeRanges(verticalGaps.right);

  let cursor = room.x;
  for (const gap of topWallRanges) {
    const gapStart = clamp(gap.start, room.x, room.x + room.w);
    const gapEnd = clamp(gap.end, room.x, room.x + room.w);
    drawWallSegment3D(cursor, wallFaceY, gapStart - cursor, wallThickness, "horizontal", room);
    cursor = Math.max(cursor, gapEnd);
  }
  drawWallSegment3D(cursor, wallFaceY, room.x + room.w - cursor, wallThickness, "horizontal", room);

  cursor = room.x;
  for (const gap of bottomWallRanges) {
    const gapStart = clamp(gap.start, room.x, room.x + room.w);
    const gapEnd = clamp(gap.end, room.x, room.x + room.w);
    drawWallSegment3D(cursor, room.y + room.h - wallThickness, gapStart - cursor, wallThickness, "horizontal", room);
    cursor = Math.max(cursor, gapEnd);
  }
  drawWallSegment3D(cursor, room.y + room.h - wallThickness, room.x + room.w - cursor, wallThickness, "horizontal", room);

  cursor = room.y;
  for (const gap of leftWallRanges) {
    const gapStart = clamp(gap.start, room.y, room.y + room.h);
    const gapEnd = clamp(gap.end, room.y, room.y + room.h);
    drawWallSegment3D(wallFaceX, cursor, wallThickness, gapStart - cursor, "vertical", room);
    cursor = Math.max(cursor, gapEnd);
  }
  drawWallSegment3D(wallFaceX, cursor, wallThickness, room.y + room.h - cursor, "vertical", room);

  cursor = room.y;
  for (const gap of rightWallRanges) {
    const gapStart = clamp(gap.start, room.y, room.y + room.h);
    const gapEnd = clamp(gap.end, room.y, room.y + room.h);
    drawWallSegment3D(room.x + room.w - wallThickness, cursor, wallThickness, gapStart - cursor, "vertical", room);
    cursor = Math.max(cursor, gapEnd);
  }
  drawWallSegment3D(room.x + room.w - wallThickness, cursor, wallThickness, room.y + room.h - cursor, "vertical", room);
}

function drawRoomLight(room) {
  const light = ctx.createRadialGradient(room.x + room.w * 0.36, room.y + room.h * 0.22, 0, room.x + room.w * 0.36, room.y + room.h * 0.22, Math.max(room.w, room.h) * 0.72);
  light.addColorStop(0, "rgba(255, 245, 225, 0.08)");
  light.addColorStop(0.4, "rgba(220, 234, 248, 0.04)");
  light.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = light;
  ctx.fillRect(room.x, room.y, room.w, room.h);

  const shadow = ctx.createLinearGradient(room.x, room.y, room.x + room.w, room.y + room.h);
  shadow.addColorStop(0, "rgba(0, 0, 0, 0.05)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  ctx.fillStyle = shadow;
  ctx.fillRect(room.x, room.y, room.w, room.h);
}

function drawRooms(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const room of rooms) {
    const gradient = ctx.createLinearGradient(room.x, room.y, room.x + room.w, room.y + room.h);
    gradient.addColorStop(0, room.mood);
    gradient.addColorStop(1, "#0f131a");

    drawWithDepth(() => {
      ctx.fillStyle = gradient;
      ctx.fillRect(room.x, room.y, room.w, room.h);
      drawRoomLight(room);
      ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
      ctx.fillRect(room.x + 10, room.y + 10, room.w - 20, Math.max(0, room.h * 0.06));
      ctx.fillStyle = "rgba(0, 0, 0, 0.10)";
      ctx.fillRect(room.x + 10, room.y + room.h - 16, room.w - 20, 6);
      ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
      ctx.fillRect(room.x + 6, room.y + 6, room.w - 12, Math.max(0, room.h * 0.10));
      drawRoomWalls(room);
    }, "rgba(0, 0, 0, 0.24)", 5, 8, 8);
  }

  const frontOpen = Number.isFinite(frontDoorOpenProgress) ? frontDoorOpenProgress : (frontDoorOpen ? 1 : 0);
  const frontEased = 1 - Math.pow(1 - frontOpen, 2);
  const frontVisualY = frontDoor.y + (frontDoor.h - WALL_THICKNESS) * 0.5;

  drawWithDepth(() => {
    drawMaterialRect(frontDoor.x, frontVisualY, frontDoor.w, WALL_THICKNESS, { top: "#121922", mid: "#0f151d", bottom: "#0a0f16" }, { border: "rgba(255, 236, 206, 0.3)", borderWidth: 1.6, gloss: "rgba(255,255,255,0.05)" });

    const panelH = 44;
    const closedY = frontVisualY - panelH + 1;
    const openedY = frontVisualY - panelH - 36;
    const panelY = closedY + (openedY - closedY) * frontEased;
    drawMaterialRect(frontDoor.x + 3, panelY, frontDoor.w - 6, panelH, { top: "#6f1a1a", mid: "#9b1f1f", bottom: "#4b1212" }, { border: "rgba(255, 221, 184, 0.55)", borderWidth: 2, gloss: "rgba(255,255,255,0.12)" });

    if (!frontDoorOpen) {
      const lockW = 110;
      const lockH = 9;
      const lockX = frontDoor.x + frontDoor.w * 0.5 - lockW * 0.5;
      const lockY = panelY + panelH * 0.5 - lockH * 0.5;
      drawMaterialRect(lockX, lockY, lockW, lockH, { top: "#4f5a6a", mid: "#7c8b9f", bottom: "#394251" }, { border: "rgba(229, 236, 246, 0.55)", borderWidth: 1.4, gloss: "rgba(255,255,255,0.18)" });
    } else {
      const glow = ctx.createRadialGradient(frontDoor.x + frontDoor.w * 0.5, frontVisualY + 1, 0, frontDoor.x + frontDoor.w * 0.5, frontVisualY + 1, frontDoor.w * 0.65);
      glow.addColorStop(0, "rgba(140, 232, 168, 0.24)");
      glow.addColorStop(1, "rgba(140, 232, 168, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(frontDoor.x - 30, frontVisualY - 40, frontDoor.w + 60, 80);
    }
  }, "rgba(0, 0, 0, 0.34)", 4, 5, 6);

  for (const door of doors) {
    const openProgress = Number.isFinite(door.openProgress) ? door.openProgress : (door.isOpen ? 1 : 0);
    const easedOpen = 1 - Math.pow(1 - openProgress, 2);
    const visualX = door.orientation === "vertical"
      ? door.x + (door.w - WALL_THICKNESS) * 0.5
      : door.x;
    const visualY = door.orientation === "horizontal"
      ? door.y + (door.h - WALL_THICKNESS) * 0.5
      : door.y;
    const visualW = door.orientation === "vertical" ? WALL_THICKNESS : door.w;
    const visualH = door.orientation === "horizontal" ? WALL_THICKNESS : door.h;

    drawWithDepth(() => {
      drawMaterialRect(visualX, visualY, visualW, visualH, { top: "#1f262f", mid: "#1a212a", bottom: "#11161e" }, { border: "rgba(255, 235, 205, 0.24)", borderWidth: 1.4, gloss: "rgba(255,255,255,0.05)" });

      if (easedOpen > 0.02) {
        const passageAlpha = 0.24 + easedOpen * 0.22;
        drawMaterialRect(visualX + 1, visualY + 1, Math.max(0, visualW - 2), Math.max(0, visualH - 2), {
          top: `rgba(44, 84, 56, ${passageAlpha})`,
          mid: `rgba(34, 118, 66, ${passageAlpha})`,
          bottom: `rgba(18, 44, 30, ${passageAlpha})`,
        }, { border: "rgba(149, 236, 161, 0.68)", borderWidth: 1.6, gloss: "rgba(255,255,255,0.10)" });
      }

      const panelFactor = 1 - easedOpen * 0.88;
      if (panelFactor > 0.08) {
        if (door.orientation === "vertical") {
          const panelW = Math.max(1, visualW * panelFactor);
          const panelX = door.hingeSide > 0 ? visualX : visualX + (visualW - panelW);
          drawMaterialRect(panelX, visualY, panelW, visualH, { top: "#7d1f1f", mid: "#b02222", bottom: "#431010" }, { border: "rgba(255, 228, 181, 0.45)", borderWidth: 2, gloss: "rgba(255,255,255,0.12)" });
          ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
          ctx.fillRect(panelX + 1, visualY + 1, Math.max(0, panelW - 2), 1);
        } else {
          const panelH = Math.max(1, visualH * panelFactor);
          const panelY = door.hingeSide > 0 ? visualY : visualY + (visualH - panelH);
          drawMaterialRect(visualX, panelY, visualW, panelH, { top: "#7d1f1f", mid: "#b02222", bottom: "#431010" }, { border: "rgba(255, 228, 181, 0.45)", borderWidth: 2, gloss: "rgba(255,255,255,0.12)" });
          ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
          ctx.fillRect(visualX + 1, panelY + 1, Math.max(0, visualW - 2), 1);
        }
      }
    }, "rgba(0, 0, 0, 0.30)", 4, 5, 5);
  }

  ctx.restore();
}

function drawAmbientOcclusion(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const room of rooms) {
    const edgeFade = 32;

    const top = ctx.createLinearGradient(room.x, room.y, room.x, room.y + edgeFade);
    top.addColorStop(0, "rgba(0, 0, 0, 0.24)");
    top.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = top;
    ctx.fillRect(room.x, room.y, room.w, edgeFade);

    const left = ctx.createLinearGradient(room.x, room.y, room.x + edgeFade, room.y);
    left.addColorStop(0, "rgba(0, 0, 0, 0.18)");
    left.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = left;
    ctx.fillRect(room.x, room.y, edgeFade, room.h);

    const corner = ctx.createRadialGradient(room.x + 22, room.y + 22, 0, room.x + 22, room.y + 22, 86);
    corner.addColorStop(0, "rgba(0, 0, 0, 0.24)");
    corner.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = corner;
    ctx.fillRect(room.x, room.y, 90, 90);
  }

  ctx.restore();
}

function drawDecorationLightSources(cam, elapsedSeconds) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const decoration of roomDecorations) {
    if (decoration.style === "lamp") {
      const pulse = 0.92 + Math.sin(elapsedSeconds * 3.1 + decoration.x * 0.01) * 0.08;
      const cx = decoration.x + decoration.w * 0.5;
      const cy = decoration.y + decoration.h * 0.3;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 210);
      glow.addColorStop(0, `rgba(246, 210, 130, ${0.22 * pulse})`);
      glow.addColorStop(0.55, `rgba(170, 120, 52, ${0.12 * pulse})`);
      glow.addColorStop(1, "rgba(120, 60, 20, 0)");

      ctx.fillStyle = glow;
      ctx.fillRect(cx - 220, cy - 220, 440, 440);
    }

    if (decoration.style === "window") {
      const beamX = decoration.x + decoration.w * 0.5;
      const beamY = decoration.y + decoration.h;
      const beamLength = Math.max(260, decoration.w * 2.4);
      const beamWidth = Math.max(140, decoration.w * 1.4);

      ctx.save();
      ctx.translate(beamX, beamY);
      ctx.rotate(0.2);

      const beam = ctx.createLinearGradient(0, 0, beamLength, 0);
      beam.addColorStop(0, "rgba(178, 214, 238, 0.12)");
      beam.addColorStop(0.55, "rgba(120, 162, 190, 0.07)");
      beam.addColorStop(1, "rgba(60, 90, 120, 0)");
      ctx.fillStyle = beam;

      ctx.beginPath();
      ctx.moveTo(0, -beamWidth * 0.42);
      ctx.lineTo(beamLength, -beamWidth * 0.12);
      ctx.lineTo(beamLength, beamWidth * 0.12);
      ctx.lineTo(0, beamWidth * 0.42);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  ctx.restore();
}

function drawDepthHaze(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  const haze = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  haze.addColorStop(0, "rgba(190, 210, 228, 0.02)");
  haze.addColorStop(0.5, "rgba(120, 148, 172, 0.06)");
  haze.addColorStop(1, "rgba(34, 42, 54, 0.14)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.restore();
}

function drawHidingSpot(spot) {
  if (spot.style === "bed") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.22);
    drawMaterialRect(spot.x, spot.y, spot.w, spot.h, { top: "#5a3a3a", mid: "#3e2a2a", bottom: "#221616" }, { border: "rgba(236, 220, 205, 0.16)", borderWidth: 2, gloss: "rgba(255,255,255,0.05)" });
    ctx.fillStyle = "#231818";
    ctx.fillRect(spot.x + 18, spot.y + 12, spot.w - 36, spot.h - 34);
  } else if (spot.style === "locker") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.22);
    drawInsetPanel(spot.x, spot.y, spot.w, spot.h, { top: "#4b5a62", mid: "#2f3a41", bottom: "#1f262b" }, { border: "rgba(198, 213, 220, 0.25)", borderWidth: 2, inset: 9, innerFill: "rgba(12, 18, 22, 0.18)" });
    ctx.strokeStyle = "rgba(95, 111, 120, 0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(spot.x + 9, spot.y + 14, spot.w - 18, spot.h - 24);
  } else if (spot.style === "cabinet") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.22);
    drawInsetPanel(spot.x, spot.y, spot.w, spot.h, { top: "#5d4a41", mid: "#42332d", bottom: "#241b16" }, { border: "rgba(214, 197, 180, 0.15)", borderWidth: 2, inset: 10, innerFill: "rgba(14, 10, 8, 0.16)" });
    ctx.fillStyle = "#261d18";
    ctx.fillRect(spot.x + 12, spot.y + 10, spot.w - 24, spot.h - 20);
  } else if (spot.style === "sofa") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.22);
    drawMaterialRect(spot.x, spot.y + 28, spot.w, spot.h - 28, { top: "#415260", mid: "#2d3a44", bottom: "#182027" }, { border: "rgba(210, 225, 236, 0.12)", borderWidth: 2, gloss: "rgba(255,255,255,0.07)" });
    drawMaterialRect(spot.x + 14, spot.y, spot.w - 28, 42, { top: "#5a707d", mid: "#415260", bottom: "#25313b" }, { border: "rgba(235, 240, 244, 0.10)", borderWidth: 1, gloss: "rgba(255,255,255,0.10)" });
  } else if (spot.style === "shelf") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.18);
    drawInsetPanel(spot.x, spot.y, spot.w, spot.h, { top: "#433124", mid: "#2a2018", bottom: "#150f0b" }, { border: "rgba(208, 188, 165, 0.14)", borderWidth: 2, inset: 7, innerFill: "rgba(8, 6, 4, 0.12)" });
    ctx.fillStyle = "#4a392b";
    for (let i = 1; i < 4; i += 1) {
      ctx.fillRect(spot.x + 8, spot.y + i * (spot.h / 4), spot.w - 16, 5);
    }
  } else if (spot.style === "crates") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.2);
    drawInsetPanel(spot.x, spot.y, spot.w, spot.h, { top: "#72552f", mid: "#5b462c", bottom: "#382613" }, { border: "rgba(226, 204, 166, 0.12)", borderWidth: 2, inset: 8, innerFill: "rgba(17, 11, 6, 0.10)" });
    ctx.fillStyle = "#3c2d1a";
    ctx.fillRect(spot.x + 10, spot.y + 10, spot.w - 20, spot.h - 20);
  } else if (spot.style === "bin") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.2);
    drawInsetPanel(spot.x, spot.y, spot.w, spot.h, { top: "#59636a", mid: "#3a4045", bottom: "#252a2e" }, { border: "rgba(221, 231, 236, 0.16)", borderWidth: 2, inset: 8, innerFill: "rgba(12, 14, 15, 0.12)" });
    ctx.fillStyle = "#59636a";
    ctx.fillRect(spot.x + 10, spot.y + 8, spot.w - 20, 18);
  } else if (spot.style === "dresser") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.22);
    drawInsetPanel(spot.x, spot.y, spot.w, spot.h, { top: "#5c403c", mid: "#46312f", bottom: "#251918" }, { border: "rgba(216, 196, 183, 0.14)", borderWidth: 2, inset: 10, innerFill: "rgba(14, 9, 8, 0.16)" });
    ctx.fillStyle = "#2b1d1b";
    ctx.fillRect(spot.x + 12, spot.y + 12, spot.w - 24, spot.h - 24);
  } else if (spot.style === "chair") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.18);
    drawMaterialRect(spot.x + 18, spot.y + 20, spot.w - 36, spot.h - 20, { top: "#6c403a", mid: "#4e2d2a", bottom: "#271514" }, { border: "rgba(227, 206, 197, 0.12)", borderWidth: 2, gloss: "rgba(255,255,255,0.06)" });
    drawMaterialRect(spot.x + 26, spot.y, spot.w - 52, 32, { top: "#53302d", mid: "#3a201e", bottom: "#1d100f" }, { border: "rgba(235, 221, 214, 0.10)", borderWidth: 1, gloss: "rgba(255,255,255,0.08)" });
  } else if (spot.style === "wardrobe") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.22);
    drawInsetPanel(spot.x, spot.y, spot.w, spot.h, { top: "#60493f", mid: "#45342d", bottom: "#251915" }, { border: "rgba(223, 204, 181, 0.14)", borderWidth: 2, inset: 9, innerFill: "rgba(11, 8, 6, 0.12)" });
    ctx.fillStyle = "#2f221b";
    ctx.fillRect(spot.x + 10, spot.y + 12, spot.w - 20, spot.h - 24);
  } else if (spot.style === "curtain") {
    drawGroundShadow(spot.x, spot.y, spot.w, spot.h, 0.12);
    drawMaterialRect(spot.x, spot.y, spot.w, spot.h, { top: "#6c1414", mid: "#4f1010", bottom: "#230606" }, { border: "rgba(243, 210, 190, 0.10)", borderWidth: 1, gloss: "rgba(255,255,255,0.04)" });
  }
}

function drawDecoration(decoration) {
  if (decoration.style === "rug") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.18);
    drawMaterialRect(decoration.x, decoration.y, decoration.w, decoration.h, { top: "#6a4d2d", mid: "#564026", bottom: "#332615" }, { border: "rgba(231, 211, 175, 0.22)", borderWidth: 2, gloss: "rgba(255,255,255,0.05)" });
    ctx.strokeStyle = "rgba(231, 211, 175, 0.24)";
    ctx.lineWidth = 2;
    ctx.strokeRect(decoration.x + 3, decoration.y + 3, decoration.w - 6, decoration.h - 6);
  } else if (decoration.style === "mirror") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.12);
    drawInsetPanel(decoration.x, decoration.y, decoration.w, decoration.h, { top: "#8b9aa3", mid: "#7a8a92", bottom: "#4f5a61" }, { border: "rgba(227, 238, 242, 0.22)", borderWidth: 2, inset: 6, innerFill: "rgba(210, 226, 232, 0.9)" });
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.fillRect(decoration.x + 7, decoration.y + 7, decoration.w - 14, 2);
  } else if (decoration.style === "window") {
    const frameDepth = Math.max(6, Math.min(16, decoration.h * 0.36));
    const sillHeight = Math.max(5, decoration.h * 0.22);

    drawGroundShadow(decoration.x, decoration.y + decoration.h - 2, decoration.w, sillHeight + 10, 0.24);
    drawMaterialRect(
      decoration.x,
      decoration.y,
      decoration.w,
      decoration.h,
      { top: "#3a4350", mid: "#252d37", bottom: "#171c24" },
      { border: "rgba(196, 212, 226, 0.30)", borderWidth: 2, gloss: "rgba(255,255,255,0.06)", depth: frameDepth }
    );

    ctx.fillStyle = "rgba(105, 121, 136, 0.52)";
    ctx.fillRect(decoration.x + 4, decoration.y + 4, decoration.w - 8, decoration.h - 10);

    ctx.fillStyle = "rgba(18, 24, 31, 0.90)";
    ctx.fillRect(decoration.x + 8, decoration.y + 8, decoration.w - 16, decoration.h - 18);

    ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
    ctx.fillRect(decoration.x + 8, decoration.y + 8, decoration.w - 16, 3);
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(decoration.x + 8, decoration.y + decoration.h - 15, decoration.w - 16, 4);

    ctx.strokeStyle = "rgba(232, 241, 247, 0.34)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(decoration.x + decoration.w * 0.5, decoration.y + 8);
    ctx.lineTo(decoration.x + decoration.w * 0.5, decoration.y + decoration.h - 18);
    ctx.moveTo(decoration.x + 8, decoration.y + decoration.h * 0.5);
    ctx.lineTo(decoration.x + decoration.w - 8, decoration.y + decoration.h * 0.5);
    ctx.stroke();

    const glass = ctx.createLinearGradient(decoration.x, decoration.y, decoration.x, decoration.y + decoration.h - 10);
    glass.addColorStop(0, "rgba(187, 221, 244, 0.34)");
    glass.addColorStop(0.45, "rgba(118, 162, 199, 0.18)");
    glass.addColorStop(1, "rgba(23, 34, 46, 0.36)");
    ctx.fillStyle = glass;
    ctx.fillRect(decoration.x + 10, decoration.y + 10, decoration.w - 20, decoration.h - 20);

    ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
    ctx.fillRect(decoration.x + 12, decoration.y + 12, 2, decoration.h - 24);
    ctx.fillRect(decoration.x + 12, decoration.y + 12, decoration.w - 24, 2);

    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(decoration.x + 12, decoration.y + decoration.h - 16, decoration.w - 24, 4);

    ctx.fillStyle = "rgba(96, 67, 38, 0.98)";
    ctx.fillRect(decoration.x - 2, decoration.y + decoration.h - 4, decoration.w + 4, sillHeight);
    ctx.fillStyle = "rgba(255, 245, 232, 0.14)";
    ctx.fillRect(decoration.x - 1, decoration.y + decoration.h - 4, decoration.w + 2, 2);

    ctx.strokeStyle = "rgba(22, 25, 31, 0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(decoration.x + 9, decoration.y + 9, decoration.w - 18, decoration.h - 19);
  } else if (decoration.style === "lamp") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.16);
    drawMaterialRect(decoration.x + decoration.w * 0.35, decoration.y + decoration.h * 0.55, decoration.w * 0.3, decoration.h * 0.4, { top: "#5a4a2c", mid: "#3d3223", bottom: "#241c13" }, { border: "rgba(255,255,255,0.10)", borderWidth: 1, gloss: "rgba(255,255,255,0.04)" });
    drawMaterialRect(decoration.x, decoration.y, decoration.w, decoration.h * 0.5, { top: "#f1db9d", mid: "#d7be7e", bottom: "#9a742d" }, { border: "rgba(255, 246, 206, 0.18)", borderWidth: 1, gloss: "rgba(255,255,255,0.16)" });
  } else if (decoration.style === "painting") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.12);
    drawMaterialRect(decoration.x, decoration.y, decoration.w, decoration.h, { top: "#61461f", mid: "#4e3924", bottom: "#2d2013" }, { border: "rgba(249, 230, 186, 0.18)", borderWidth: 2, gloss: "rgba(255,255,255,0.05)" });
    ctx.fillStyle = "#7b5c3b";
    ctx.fillRect(decoration.x + 5, decoration.y + 5, decoration.w - 10, decoration.h - 10);
  } else if (decoration.style === "statue") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.18);
    drawMaterialRect(decoration.x + decoration.w * 0.2, decoration.y, decoration.w * 0.6, decoration.h, { top: "#8c9093", mid: "#6f7275", bottom: "#505356" }, { border: "rgba(244, 244, 244, 0.16)", borderWidth: 1, gloss: "rgba(255,255,255,0.10)" });
    ctx.fillStyle = "#8c8f93";
    ctx.fillRect(decoration.x + decoration.w * 0.28, decoration.y + decoration.h * 0.12, decoration.w * 0.44, decoration.h * 0.76);
  } else if (decoration.style === "table") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.14);
    drawMaterialRect(decoration.x, decoration.y, decoration.w, decoration.h * 0.45, { top: "#5a3d31", mid: "#3d2a1f", bottom: "#221712" }, { border: "rgba(219, 197, 172, 0.16)", borderWidth: 2, gloss: "rgba(255,255,255,0.05)" });
    ctx.fillStyle = "#2a1e17";
    ctx.fillRect(decoration.x + decoration.w * 0.08, decoration.y + decoration.h * 0.45, 5, decoration.h * 0.55);
    ctx.fillRect(decoration.x + decoration.w * 0.84, decoration.y + decoration.h * 0.45, 5, decoration.h * 0.55);
  } else if (decoration.style === "barrel") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.16);
    drawMaterialRect(decoration.x, decoration.y, decoration.w, decoration.h, { top: "#6f522e", mid: "#553d22", bottom: "#332210" }, { border: "rgba(230, 208, 173, 0.14)", borderWidth: 2, gloss: "rgba(255,255,255,0.05)" });
    ctx.fillStyle = "#2b1b0e";
    ctx.fillRect(decoration.x + 4, decoration.y + decoration.h * 0.3, decoration.w - 8, 4);
    ctx.fillRect(decoration.x + 4, decoration.y + decoration.h * 0.62, decoration.w - 8, 4);
  } else if (decoration.style === "trunk") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.16);
    drawInsetPanel(decoration.x, decoration.y, decoration.w, decoration.h, { top: "#604234", mid: "#4a3528", bottom: "#281b15" }, { border: "rgba(220, 197, 180, 0.14)", borderWidth: 2, inset: 6, innerFill: "rgba(13, 8, 6, 0.14)" });
    ctx.fillStyle = "#2c1f17";
    ctx.fillRect(decoration.x + 6, decoration.y + 6, decoration.w - 12, decoration.h - 12);
  } else if (decoration.style === "pipe") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.08);
    const pipeWidth = Math.max(4, decoration.h * 0.6);
    ctx.strokeStyle = "#2f363c";
    ctx.lineWidth = pipeWidth + 3;
    ctx.beginPath();
    ctx.moveTo(decoration.x, decoration.y + decoration.h * 0.5);
    ctx.lineTo(decoration.x + decoration.w, decoration.y + decoration.h * 0.5);
    ctx.stroke();
    ctx.strokeStyle = "#6a7076";
    ctx.lineWidth = pipeWidth;
    ctx.beginPath();
    ctx.moveTo(decoration.x, decoration.y + decoration.h * 0.5);
    ctx.lineTo(decoration.x + decoration.w, decoration.y + decoration.h * 0.5);
    ctx.stroke();
  } else if (decoration.style === "basket") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.16);
    drawMaterialRect(decoration.x, decoration.y, decoration.w, decoration.h, { top: "#88643c", mid: "#6a4f2f", bottom: "#41301c" }, { border: "rgba(238, 223, 196, 0.10)", borderWidth: 2, gloss: "rgba(255,255,255,0.05)" });
    ctx.fillStyle = "#8b6a40";
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(decoration.x, decoration.y + (i + 1) * (decoration.h / 4), decoration.w, 2);
    }
  } else if (decoration.style === "sink") {
    drawGroundShadow(decoration.x, decoration.y, decoration.w, decoration.h, 0.12);
    drawInsetPanel(decoration.x, decoration.y, decoration.w, decoration.h, { top: "#7e8b91", mid: "#627077", bottom: "#3c464b" }, { border: "rgba(234, 240, 243, 0.16)", borderWidth: 2, inset: 6, innerFill: "rgba(231, 239, 242, 0.84)" });
    ctx.fillStyle = "#d0d7db";
    ctx.fillRect(decoration.x + 6, decoration.y + 6, decoration.w - 12, decoration.h - 12);
  }
}

function drawHidingSpots(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const decoration of roomDecorations) {
    const shadowHeight = clamp(decoration.h * 0.38, 18, 86);
    drawProjectedShadowRect(decoration.x, decoration.y, decoration.w, decoration.h, shadowHeight, 0.17);
    drawWithDepth(() => drawDecoration(decoration), "rgba(0, 0, 0, 0.22)", 3, 4, 5);
  }

  for (const spot of hidingSpots) {
    const shadowHeight = clamp(spot.h * 0.34, 16, 76);
    drawProjectedShadowRect(spot.x, spot.y, spot.w, spot.h, shadowHeight, 0.16);
    drawWithDepth(() => drawHidingSpot(spot), "rgba(0, 0, 0, 0.24)", 4, 5, 6);
  }

  ctx.restore();
}

function drawHidingSpotHighlight(cam) {
  if (localPlayerRole !== "survivor" || survivorIsDead || survivorIsHidden) {
    return;
  }

  const { spot, distance } = nearestHidingSpotFor(player);
  if (!spot || distance > HIDE.interactionRange) {
    return;
  }

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  // Draw glowing aura around the hiding spot
  const glowRadius = Math.max(spot.w, spot.h) * 0.6 + 15;
  const glow = ctx.createRadialGradient(
    spot.x + spot.w * 0.5,
    spot.y + spot.h * 0.5,
    Math.max(spot.w, spot.h) * 0.3,
    spot.x + spot.w * 0.5,
    spot.y + spot.h * 0.5,
    glowRadius
  );
  glow.addColorStop(0, "rgba(100, 200, 255, 0.4)");
  glow.addColorStop(0.6, "rgba(100, 200, 255, 0.1)");
  glow.addColorStop(1, "rgba(100, 200, 255, 0)");

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(
    spot.x + spot.w * 0.5,
    spot.y + spot.h * 0.5,
    glowRadius,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Draw border highlight
  ctx.strokeStyle = "rgba(150, 220, 255, 0.6)";
  ctx.lineWidth = 3;
  ctx.strokeRect(spot.x - 3, spot.y - 3, spot.w + 6, spot.h + 6);

  ctx.restore();
}

function drawCharacter(entity, cam, runState, appearance = {}) {
  const role = appearance.role || (entity === player ? "survivor" : "hunter");
  const isSurvivor = role === "survivor";
  const hideBlend = isSurvivor ? (appearance.hideBlend ?? survivorHideBlend) : 0;
  const isDead = isSurvivor ? (appearance.isDead ?? survivorIsDead) : false;
  const isEscaped = isSurvivor ? (appearance.isEscaped ?? survivorIsEscaped) : false;
  const runPhase = runState?.phase || 0;
  const runBlend = runState?.blend || 0;
  const facingSign = isSurvivor ? runState?.facingSign || 1 : 1;

  if (isSurvivor && hideBlend >= 0.995) {
    return;
  }

  if (isSurvivor && isEscaped) {
    return;
  }

  const x = entity.x - cam.x;
  const radius = isSurvivor ? entity.radius * (1 - hideBlend * 0.28) : entity.radius;
  const stride = Math.sin(runPhase);
  const cadence = Math.sin(runPhase * 2);
  const runBob = (0.34 + Math.abs(cadence) * 0.66) * radius * 0.052 * runBlend;
  const y = entity.y - cam.y - runBob;
  const alpha = isSurvivor ? 1 - hideBlend * 0.95 : 1;
  const facingAngle = 0;

  if (isSurvivor && isDead) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.44, radius * 0.92, radius * 0.33, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y + radius * 0.1);
    ctx.rotate(0.18 * facingSign);
    const bodyGradient = ctx.createLinearGradient(-radius * 0.62, 0, radius * 0.62, 0);
    bodyGradient.addColorStop(0, "#8f5332");
    bodyGradient.addColorStop(1, "#b56a44");
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.7, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#efc19c";
    ctx.beginPath();
    ctx.ellipse(radius * 0.68, -radius * 0.02, radius * 0.2, radius * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4b3527";
    ctx.beginPath();
    ctx.ellipse(radius * 0.73, -radius * 0.11, radius * 0.22, radius * 0.13, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  const leftArmStride = -stride;
  const rightArmStride = stride;
  const leftLegStride = stride;
  const rightLegStride = -stride;
  const leftLegLift = Math.max(0, -leftLegStride) * radius * 0.2 * runBlend;
  const rightLegLift = Math.max(0, -rightLegStride) * radius * 0.2 * runBlend;
  const torsoRoll = 0;
  const hipShift = stride * radius * 0.028 * runBlend;

  const shadowOffsetX = -LIGHT.direction.x * LIGHT.shadowLength;
  const shadowOffsetY = -LIGHT.direction.y * LIGHT.shadowLength;

  ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
  ctx.beginPath();
  ctx.ellipse(x + shadowOffsetX, y + shadowOffsetY + radius * 0.32, radius * 0.95, radius * 0.45, Math.atan2(shadowOffsetY, shadowOffsetX), 0, Math.PI * 2);
  ctx.fill();

  drawGroundShadow(x - radius, y + radius * 0.16, radius * 2, radius * 0.9, 0.24);

  const shirtTop = "#ce7d51";
  const shirtBottom = "#a85f39";
  const pantsTop = "#8a7a6a";
  const pantsBottom = "#665a4e";
  const sleeveColor = "#c06f45";
  const skinColor = "#efc19c";
  const hairColor = "#4b3527";
  const shoeColor = "#6d4428";

  drawWithDepth(() => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facingAngle);
    ctx.scale(facingSign, 1);
    ctx.translate(hipShift, 0);
    ctx.rotate(torsoRoll);

    const shoulderY = -radius * 0.42;
    const torsoCenterY = -radius * 0.08;
    const hipY = radius * 0.28;
    const headY = -radius * 0.86;
    const armTopY = shoulderY + radius * 0.08;
    const armLength = radius * 0.52;
    const armWidth = radius * 0.14;
    const legTopY = hipY;
    const legLength = radius * 0.56;
    const legWidth = radius * 0.17;

    const leftArmX = -radius * 0.4 + leftArmStride * radius * 0.17 * runBlend;
    const rightArmX = radius * 0.4 + rightArmStride * radius * 0.17 * runBlend;
    const leftArmY = armTopY + Math.max(0, leftArmStride) * radius * 0.08 * runBlend;
    const rightArmY = armTopY + Math.max(0, rightArmStride) * radius * 0.08 * runBlend;

    const leftLegX = -radius * 0.2 + leftLegStride * radius * 0.28 * runBlend;
    const rightLegX = radius * 0.2 + rightLegStride * radius * 0.28 * runBlend;
    const leftLegY = legTopY - leftLegLift;
    const rightLegY = legTopY - rightLegLift;
    const leftLegLength = legLength - leftLegLift * 0.34;
    const rightLegLength = legLength - rightLegLift * 0.34;

    if (!isSurvivor) {
      const coatGradient = ctx.createLinearGradient(0, shoulderY - radius * 0.12, 0, hipY + radius * 0.56);
      coatGradient.addColorStop(0, "#3a3c43");
      coatGradient.addColorStop(0.45, "#2b2d33");
      coatGradient.addColorStop(1, "#17191d");
      ctx.fillStyle = coatGradient;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.52, shoulderY - radius * 0.02);
      ctx.lineTo(radius * 0.52, shoulderY - radius * 0.02);
      ctx.lineTo(radius * 0.44, hipY + radius * 0.56);
      ctx.lineTo(radius * 0.12, hipY + radius * 0.42);
      ctx.lineTo(0, hipY + radius * 0.56);
      ctx.lineTo(-radius * 0.12, hipY + radius * 0.42);
      ctx.lineTo(-radius * 0.44, hipY + radius * 0.56);
      ctx.closePath();
      ctx.fill();

      const apronGradient = ctx.createLinearGradient(0, shoulderY - radius * 0.02, 0, hipY + radius * 0.48);
      apronGradient.addColorStop(0, "#65735f");
      apronGradient.addColorStop(1, "#3f4a3c");
      ctx.fillStyle = apronGradient;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.28, shoulderY + radius * 0.05);
      ctx.lineTo(radius * 0.28, shoulderY + radius * 0.05);
      ctx.lineTo(radius * 0.22, hipY + radius * 0.48);
      ctx.lineTo(-radius * 0.22, hipY + radius * 0.48);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
      ctx.fillRect(-radius * 0.18, shoulderY + radius * 0.10, radius * 0.08, radius * 0.32);

      ctx.fillStyle = "#212328";
      ctx.fillRect(leftArmX - armWidth * 0.55, leftArmY - radius * 0.04, armWidth, armLength + radius * 0.08);
      ctx.fillRect(rightArmX - armWidth * 0.55, rightArmY - radius * 0.04, armWidth, armLength + radius * 0.08);

      ctx.fillStyle = "#1b1d22";
      ctx.fillRect(leftLegX - legWidth * 0.52, leftLegY, legWidth, leftLegLength);
      ctx.fillRect(rightLegX - legWidth * 0.52, rightLegY, legWidth, rightLegLength);

      ctx.fillStyle = "#2b2e35";
      ctx.beginPath();
      ctx.ellipse(leftLegX, leftLegY + leftLegLength + radius * 0.06, radius * 0.17, radius * 0.10, -0.08, 0, Math.PI * 2);
      ctx.ellipse(rightLegX, rightLegY + rightLegLength + radius * 0.06, radius * 0.17, radius * 0.10, 0.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#252830";
      ctx.beginPath();
      ctx.ellipse(0, headY, radius * 0.34, radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#4b3e2f";
      ctx.beginPath();
      ctx.moveTo(-radius * 0.56, headY - radius * 0.09);
      ctx.lineTo(radius * 0.56, headY - radius * 0.09);
      ctx.lineTo(radius * 0.42, headY + radius * 0.02);
      ctx.lineTo(-radius * 0.42, headY + radius * 0.02);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#5d4d3a";
      ctx.beginPath();
      ctx.ellipse(0, headY - radius * 0.2, radius * 0.33, radius * 0.16, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ff2ecf";
      ctx.beginPath();
      ctx.arc(-radius * 0.12, headY - radius * 0.02, radius * 0.07, 0, Math.PI * 2);
      ctx.arc(radius * 0.12, headY - radius * 0.02, radius * 0.07, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 120, 230, 0.38)";
      ctx.beginPath();
      ctx.arc(-radius * 0.12, headY - radius * 0.02, radius * 0.12, 0, Math.PI * 2);
      ctx.arc(radius * 0.12, headY - radius * 0.02, radius * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#4a3d2f";
      ctx.lineWidth = radius * 0.08;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.72, hipY + radius * 0.08);
      ctx.lineTo(radius * 0.7, hipY + radius * 0.34);
      ctx.stroke();
    } else {
      const backpackGradient = ctx.createLinearGradient(0, shoulderY - radius * 0.12, 0, hipY + radius * 0.46);
      backpackGradient.addColorStop(0, "#9b8663");
      backpackGradient.addColorStop(1, "#6f5f45");
      ctx.fillStyle = backpackGradient;
      ctx.beginPath();
      ctx.ellipse(radius * 0.42, torsoCenterY + radius * 0.02, radius * 0.3, radius * 0.48, 0.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#798083";
      ctx.beginPath();
      ctx.ellipse(radius * 0.58, shoulderY - radius * 0.2, radius * 0.28, radius * 0.14, 0.1, 0, Math.PI * 2);
      ctx.fill();

      const shirtGradient = ctx.createLinearGradient(0, shoulderY, 0, hipY + radius * 0.12);
      shirtGradient.addColorStop(0, shirtTop);
      shirtGradient.addColorStop(1, shirtBottom);
      ctx.fillStyle = shirtGradient;
      ctx.beginPath();
      ctx.ellipse(0, torsoCenterY, radius * 0.42, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#d3c29f";
      ctx.beginPath();
      ctx.moveTo(-radius * 0.42, shoulderY + radius * 0.02);
      ctx.lineTo(radius * 0.32, shoulderY - radius * 0.07);
      ctx.lineTo(radius * 0.38, torsoCenterY + radius * 0.06);
      ctx.lineTo(-radius * 0.34, torsoCenterY + radius * 0.19);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#856b4b";
      ctx.fillRect(-radius * 0.22, torsoCenterY - radius * 0.04, radius * 0.44, radius * 0.08);

      ctx.fillStyle = "#8f7958";
      for (let i = -1; i <= 1; i += 1) {
        ctx.fillRect(i * radius * 0.12 - radius * 0.03, torsoCenterY - radius * 0.035, radius * 0.06, radius * 0.06);
      }

      ctx.fillStyle = "#7f6949";
      ctx.fillRect(-radius * 0.33, shoulderY + radius * 0.02, radius * 0.07, radius * 0.62);
      ctx.fillRect(radius * 0.26, shoulderY + radius * 0.02, radius * 0.07, radius * 0.62);

      ctx.fillStyle = sleeveColor;
      ctx.fillRect(leftArmX - armWidth * 0.5, leftArmY, armWidth, armLength);
      ctx.fillRect(rightArmX - armWidth * 0.5, rightArmY, armWidth, armLength);

      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.arc(leftArmX, leftArmY + armLength, radius * 0.1, 0, Math.PI * 2);
      ctx.arc(rightArmX, rightArmY + armLength, radius * 0.1, 0, Math.PI * 2);
      ctx.fill();

      const pantsGradient = ctx.createLinearGradient(0, legTopY, 0, legTopY + legLength + radius * 0.16);
      pantsGradient.addColorStop(0, pantsTop);
      pantsGradient.addColorStop(1, pantsBottom);
      ctx.fillStyle = pantsGradient;
      ctx.fillRect(leftLegX - legWidth * 0.5, leftLegY, legWidth, leftLegLength);
      ctx.fillRect(rightLegX - legWidth * 0.5, rightLegY, legWidth, rightLegLength);

      ctx.fillStyle = "#8f8a7d";
      ctx.fillRect(leftLegX - legWidth * 0.34, leftLegY + leftLegLength * 0.58, legWidth * 0.68, radius * 0.09);
      ctx.fillRect(rightLegX - legWidth * 0.34, rightLegY + rightLegLength * 0.58, legWidth * 0.68, radius * 0.09);

      ctx.fillStyle = shoeColor;
      ctx.beginPath();
      ctx.ellipse(leftLegX, leftLegY + leftLegLength + radius * 0.06, radius * 0.17, radius * 0.1, -0.08, 0, Math.PI * 2);
      ctx.ellipse(rightLegX, rightLegY + rightLegLength + radius * 0.06, radius * 0.17, radius * 0.1, 0.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = skinColor;
      ctx.fillRect(-radius * 0.1, -radius * 0.64, radius * 0.2, radius * 0.1);

      const headGradient = ctx.createRadialGradient(-radius * 0.1, headY - radius * 0.1, radius * 0.06, 0, headY, radius * 0.34);
      headGradient.addColorStop(0, "rgba(255, 228, 202, 0.95)");
      headGradient.addColorStop(1, skinColor);
      ctx.fillStyle = headGradient;
      ctx.beginPath();
      ctx.ellipse(0, headY, radius * 0.34, radius * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.ellipse(0, headY - radius * 0.15, radius * 0.34, radius * 0.22, 0, Math.PI * 1.01, Math.PI * 1.99);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-radius * 0.28, headY - radius * 0.04);
      ctx.lineTo(-radius * 0.34, headY + radius * 0.08);
      ctx.lineTo(-radius * 0.2, headY + radius * 0.03);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(radius * 0.28, headY - radius * 0.04);
      ctx.lineTo(radius * 0.34, headY + radius * 0.08);
      ctx.lineTo(radius * 0.2, headY + radius * 0.03);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#c6ac84";
      ctx.beginPath();
      ctx.moveTo(-radius * 0.34, headY - radius * 0.2);
      ctx.lineTo(radius * 0.34, headY - radius * 0.2);
      ctx.lineTo(radius * 0.26, headY - radius * 0.03);
      ctx.lineTo(-radius * 0.26, headY - radius * 0.03);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#6d5b45";
      ctx.fillRect(-radius * 0.12, headY - radius * 0.17, radius * 0.24, radius * 0.06);

      ctx.fillStyle = "#2a1b18";
      ctx.beginPath();
      ctx.arc(-radius * 0.11, headY - radius * 0.02, radius * 0.03, 0, Math.PI * 2);
      ctx.arc(radius * 0.11, headY - radius * 0.02, radius * 0.03, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(120, 64, 52, 0.65)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, headY + radius * 0.1, radius * 0.08, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.beginPath();
      ctx.arc(-radius * 0.1, headY - radius * 0.2, radius * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, "rgba(0, 0, 0, 0.26)", 2, 4, 5);

  if (isSurvivor && hideBlend > 0.06) {
    const pulse = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * (1.2 + hideBlend * 0.9));
    pulse.addColorStop(0, `rgba(196, 224, 255, ${0.15 * (1 - hideBlend)})`);
    pulse.addColorStop(1, "rgba(196, 224, 255, 0)");
    ctx.fillStyle = pulse;
    ctx.beginPath();
    ctx.arc(x, y, radius * (1.2 + hideBlend * 0.9), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFog(elapsedSeconds) {
  ctx.save();
  const particles = 34;
  for (let i = 0; i < particles; i += 1) {
    const t = elapsedSeconds * 0.085 + i * 0.39;
    const x = (Math.sin(t * 1.23) * 0.5 + 0.5) * screen.width;
    const y = (Math.cos(t * 0.9) * 0.5 + 0.5) * screen.height;
    const r = 90 + ((i * 43) % 210);

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(176, 192, 212, 0.05)");
    g.addColorStop(0.6, "rgba(134, 68, 75, 0.026)");
    g.addColorStop(1, "rgba(90, 32, 36, 0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const lowDrift = ctx.createLinearGradient(0, 0, 0, screen.height);
  lowDrift.addColorStop(0, "rgba(12, 16, 24, 0.04)");
  lowDrift.addColorStop(0.6, "rgba(16, 10, 14, 0.10)");
  lowDrift.addColorStop(1, "rgba(26, 8, 10, 0.16)");
  ctx.fillStyle = lowDrift;
  ctx.fillRect(0, 0, screen.width, screen.height);

  ctx.restore();
}

function drawFilmGrain(viewport, elapsedSeconds) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ffffff";

  const jitter = Math.floor(elapsedSeconds * 60) % 97;
  for (let i = 0; i < 180; i += 1) {
    const x = viewport.x + ((i * 97 + jitter * 37) % viewport.w);
    const y = viewport.y + ((i * 53 + jitter * 19) % viewport.h);
    ctx.fillRect(x, y, 1, 1);
  }

  ctx.restore();
}

function drawKillAnimations(cam) {
  if (killAnimations.length === 0) {
    return;
  }

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const anim of killAnimations) {
    const progress = Math.min(anim.progress, 1);
    
    // Red expanding burst
    ctx.fillStyle = `rgba(200, 50, 50, ${(1 - progress) * 0.8})`;
    ctx.beginPath();
    ctx.arc(anim.x, anim.y, 20 + progress * 60, 0, Math.PI * 2);
    ctx.fill();
    
    // Slash lines
    ctx.strokeStyle = `rgba(220, 80, 80, ${(1 - progress) * 0.9})`;
    ctx.lineWidth = 3 + progress * 2;
    ctx.lineCap = "round";
    
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI / 2) * i + progress * Math.PI;
      const length = 30 + progress * 50;
      const x1 = anim.x + Math.cos(angle) * 10;
      const y1 = anim.y + Math.sin(angle) * 10;
      const x2 = anim.x + Math.cos(angle) * (10 + length);
      const y2 = anim.y + Math.sin(angle) * (10 + length);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawVignette(viewport) {
  const gradient = ctx.createRadialGradient(viewport.x + viewport.w / 2, viewport.y + viewport.h / 2, Math.min(viewport.w, viewport.h) * 0.2, viewport.x + viewport.w / 2, viewport.y + viewport.h / 2, Math.max(viewport.w, viewport.h) * 0.7);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.06)");
  gradient.addColorStop(0.62, "rgba(0, 0, 0, 0.42)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.88)");

  ctx.fillStyle = gradient;
  ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
}

function drawThreatOverlay(viewport, intensity) {
  if (intensity <= 0) {
    return;
  }

  const redWash = ctx.createRadialGradient(
    viewport.x + viewport.w * 0.52,
    viewport.y + viewport.h * 0.42,
    0,
    viewport.x + viewport.w * 0.52,
    viewport.y + viewport.h * 0.42,
    Math.max(viewport.w, viewport.h) * 1.0
  );
  redWash.addColorStop(0, `rgba(200, 35, 35, ${0.02 + intensity * 0.65})`);
  redWash.addColorStop(0.45, `rgba(140, 20, 20, ${0.01 + intensity * 0.52})`);
  redWash.addColorStop(1, "rgba(60, 0, 0, 0)");

  ctx.fillStyle = redWash;
  ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);

  ctx.fillStyle = `rgba(160, 10, 10, ${0.02 + intensity * 0.48})`;
  ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
}

function drawCornerProximityGlow(viewport, intensity, cornerColor) {
  if (intensity <= 0) {
    return;
  }

  const radius = Math.max(viewport.w, viewport.h) * (0.2 + intensity * 0.42);
  const corners = [
    { x: viewport.x, y: viewport.y },
    { x: viewport.x + viewport.w, y: viewport.y },
    { x: viewport.x, y: viewport.y + viewport.h },
    { x: viewport.x + viewport.w, y: viewport.y + viewport.h },
  ];

  for (const corner of corners) {
    const glow = ctx.createRadialGradient(corner.x, corner.y, 0, corner.x, corner.y, radius);
    glow.addColorStop(0, `rgba(${cornerColor}, ${0.04 + intensity * 0.38})`);
    glow.addColorStop(0.58, `rgba(${cornerColor}, ${0.03 + intensity * 0.22})`);
    glow.addColorStop(1, `rgba(${cornerColor}, 0)`);

    ctx.fillStyle = glow;
    ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
  }
}

function renderViewport(viewport, focusEntity, label, labelColor, elapsedSeconds, threatIntensity = 0) {
  void threatIntensity;
  const cam = cameraFor(focusEntity, viewport);
  const distance = Math.hypot(hunter.x - player.x, hunter.y - player.y);
  const proximityIntensity = clamp(1 - distance / 1400, 0, 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
  ctx.clip();

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  drawWorldGrid(cam, viewport);
  drawRooms(cam);
  drawAmbientOcclusion(cam);
  drawHidingSpots(cam);
  drawHidingSpotHighlight(cam);
  drawDepthHaze(cam);
  drawFootsteps(cam, elapsedSeconds);
  drawDecorationLightSources(cam, elapsedSeconds);
  drawRemotePlayers(cam);
  drawHunterHitAnimations(cam);
  drawCharacter(hunter, cam, runAnimation.hunter);
  drawCharacter(player, cam, runAnimation.survivor);
  drawKillAnimations(cam);
  drawAllNameTags(cam);
  drawFog(elapsedSeconds);
  const dreadPulse = 0.16 + Math.sin(elapsedSeconds * 0.85) * 0.04;
  drawThreatOverlay({ x: 0, y: 0, w: viewport.w, h: viewport.h }, clamp(proximityIntensity * 0.5 + dreadPulse, 0, 0.75));
  drawVignette({ x: 0, y: 0, w: viewport.w, h: viewport.h });
  if (focusEntity !== hunter) {
    drawCornerProximityGlow({ x: 0, y: 0, w: viewport.w, h: viewport.h }, proximityIntensity, "198, 44, 44");
  }
  drawFilmGrain({ x: 0, y: 0, w: viewport.w, h: viewport.h }, elapsedSeconds);
  ctx.restore();

  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(viewport.x, viewport.y, viewport.w, 26);
  ctx.fillStyle = labelColor;
  ctx.font = "18px Cinzel";
  ctx.fillText(label, viewport.x + 14, viewport.y + 19);

  // Display survivor hide status message at top center
  if (localPlayerRole === "survivor" && survivorHideMessage) {
    ctx.save();
    ctx.font = "bold 18px Cinzel";
    ctx.textAlign = "center";
    const textWidth = ctx.measureText(survivorHideMessage).width;
    const messageX = viewport.x + viewport.w * 0.5;
    const messageY = viewport.y + 50;
    
    // Blue background for hiding messages
    const bgColor = survivorHideMessage.includes("HIDDEN") 
      ? "rgba(30, 100, 150, 0.85)" 
      : "rgba(100, 100, 150, 0.85)";
    ctx.fillStyle = bgColor;
    ctx.fillRect(messageX - textWidth * 0.5 - 14, messageY - 18, textWidth + 28, 32);
    
    // Cyan text
    ctx.fillStyle = "rgba(100, 255, 255, 1)";
    ctx.fillText(survivorHideMessage, messageX, messageY + 6);
    
    ctx.restore();
  }

  ctx.restore();
}

function formatMatchTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function drawMatchTimer() {
  const label = `Time ${formatMatchTime(matchTimeRemaining)}`;
  const status = frontDoorOpen ? "Front Door: OPEN" : "Front Door: LOCKED";
  const escapesLabel = `Escaped ${survivorEscapedCount}/${survivorEscapesNeeded}`;

  ctx.save();
  ctx.font = "700 24px Cinzel";
  ctx.textAlign = "right";
  const textWidth = Math.max(
    ctx.measureText(label).width,
    ctx.measureText(status).width,
    ctx.measureText(escapesLabel).width
  );
  const panelW = textWidth + 28;
  const panelH = 66;
  const panelX = screen.width - panelW - 18;
  const panelY = screen.height - panelH - 18;

  ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
  ctx.fillRect(panelX, panelY, panelW, panelH);

  ctx.strokeStyle = "rgba(255, 236, 206, 0.42)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

  const danger = matchTimeRemaining <= 10;
  ctx.fillStyle = danger ? "rgba(255, 138, 138, 0.96)" : "rgba(240, 228, 212, 0.96)";
  ctx.fillText(label, screen.width - 30, panelY + 24);

  ctx.font = "700 14px Special Elite";
  ctx.fillStyle = frontDoorOpen ? "rgba(160, 246, 184, 0.95)" : "rgba(255, 206, 150, 0.95)";
  ctx.fillText(status, screen.width - 30, panelY + 42);

  ctx.fillStyle = "rgba(216, 226, 236, 0.92)";
  ctx.fillText(escapesLabel, screen.width - 30, panelY + 58);
  ctx.restore();
}

function frame(now) {
  const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05);
  const elapsedSeconds = now / 1000;
  lastTime = now;

  if (!gameStarted) {
    ctx.clearRect(0, 0, screen.width, screen.height);
    requestAnimationFrame(frame);
    return;
  }

  applyNetworkStateToWorld();

  if (matchTimeRemaining > 0 && !matchWinner) {
    matchTimeRemaining = Math.max(0, matchTimeRemaining - deltaSeconds);
  }

  if (!frontDoorOpen && matchTimeRemaining <= 0) {
    frontDoorOpen = true;
  }

  updateDoorAnimations(deltaSeconds);
  updateHideAnimation(deltaSeconds);
  updateFootsteps(elapsedSeconds);
  maybeAutoRevealWhenHunterNearby();
  
  // Update survivor hide message timer
  if (survivorHideMessageTime > 0 && elapsedSeconds > survivorHideMessageTime) {
    survivorHideMessage = "";
    survivorHideMessageTime = 0;
  }
  
  // Update kill animations
  for (let i = killAnimations.length - 1; i >= 0; i -= 1) {
    killAnimations[i].progress += deltaSeconds / killAnimations[i].duration;
    if (killAnimations[i].progress > 1) {
      killAnimations.splice(i, 1);
    }
  }

  for (let i = hunterHitAnimations.length - 1; i >= 0; i -= 1) {
    hunterHitAnimations[i].progress += deltaSeconds / hunterHitAnimations[i].duration;
    if (hunterHitAnimations[i].progress > 1) {
      hunterHitAnimations.splice(i, 1);
    }
  }
  
  updateHideIndicator();
  
  if (localPlayerRole === "hunter") {
    moveHunterWithKeys(deltaSeconds);
  } else {
    moveSurvivor(deltaSeconds);
  }
  updateEntityRunAnimation(player, runAnimation.survivor, deltaSeconds);
  updateEntityRunAnimation(hunter, runAnimation.hunter, deltaSeconds);
  syncLocalPlayerToRoom(elapsedSeconds);

  const viewport = { x: 0, y: 0, w: screen.width, h: screen.height };
  const focusEntity = localPlayerRole === "hunter" ? hunter : player;
  const viewportLabel = localPlayerRole === "hunter"
    ? `${survivorName} - Hunter`
    : `${survivorName} - Survivor`;
  const labelColor = localPlayerRole === "hunter"
    ? "rgba(255, 178, 178, 0.92)"
    : "rgba(195, 226, 255, 0.92)";

  ctx.clearRect(0, 0, screen.width, screen.height);
  renderViewport(viewport, focusEntity, viewportLabel, labelColor, elapsedSeconds);
  drawMatchTimer();

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, screen.width, 1);
  ctx.fillRect(0, screen.height - 1, screen.width, 1);

  if (survivorIsDead) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, screen.height * 0.42 - 32, screen.width, 58);
    ctx.fillStyle = "rgba(255, 112, 112, 0.96)";
    ctx.font = "700 34px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText("SURVIVOR KILLED", screen.width * 0.5, screen.height * 0.42 + 8);
    ctx.textAlign = "start";
  }

  if (matchWinner === "hunter") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    ctx.fillRect(0, screen.height * 0.32, screen.width, 84);
    ctx.fillStyle = "rgba(255, 186, 186, 0.96)";
    ctx.font = "700 40px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText("HUNTERS WIN", screen.width * 0.5, screen.height * 0.32 + 54);
    ctx.textAlign = "start";
  }

  if (matchWinner === "survivor") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    ctx.fillRect(0, screen.height * 0.32, screen.width, 84);
    ctx.fillStyle = "rgba(174, 245, 194, 0.96)";
    ctx.font = "700 40px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText("SURVIVORS ESCAPED", screen.width * 0.5, screen.height * 0.32 + 54);
    ctx.textAlign = "start";
  }

  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (!gameStarted) {
    return;
  }

  if (matchWinner) {
    return;
  }

  keys.add(event.code);

  if (event.repeat) {
    return;
  }

  if (localPlayerRole === "survivor" && event.code === "KeyE") {
    interactDoor(player, true);
  }

  if (localPlayerRole === "survivor" && event.code === "KeyF") {
    interactDoor(player, false);
  }

  if (localPlayerRole === "survivor" && event.code === "KeyQ") {
    toggleHideState();
  }

  if (localPlayerRole === "survivor" && (event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD") && survivorIsHidden) {
    revealFromHide();
  }

  if (localPlayerRole === "hunter" && (event.code === "Digit0" || event.code === "Numpad0")) {
    tryHunterKill();
  }
});

window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
  }
});
window.addEventListener("resize", resize);

if (stepName) {
  stepName.addEventListener("submit", (event) => {
    event.preventDefault();
    survivorName = sanitizePlayerName(playerNameInput?.value || "");
    prepareLobbyMenu();
  });
}

if (openCreateButton) {
  openCreateButton.addEventListener("click", () => {
    setLobbyError("");
    showLobbyStep("step-create");
  });
}

if (openJoinButton) {
  openJoinButton.addEventListener("click", () => {
    setLobbyError("");
    showLobbyStep("step-join");
    if (joinCodeInput) {
      joinCodeInput.focus();
    }
  });
}

if (stepCreate) {
  stepCreate.addEventListener("submit", (event) => {
    event.preventDefault();
    createRoomFromLobby();
  });
}

if (startCreatedRoomButton) {
  startCreatedRoomButton.addEventListener("click", () => {
    sendSocketMessage({ type: "startMatch" });
  });
}

if (stepJoin) {
  stepJoin.addEventListener("submit", (event) => {
    event.preventDefault();
    joinRoomFromLobby();
  });
}

if (lobbyBackButton) {
  lobbyBackButton.addEventListener("click", () => {
    setLobbyError("");
    showLobbyStep("step-menu");
  });
}

if (hudBackButton) {
  hudBackButton.addEventListener("click", () => {
    returnToNameEntry();
  });
}

if (playerNameInput) {
  playerNameInput.focus();
}

showLobbyStep("step-name");

resize();
requestAnimationFrame(frame);