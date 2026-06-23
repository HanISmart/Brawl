const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WORLD = {
  width: 5000,
  height: 3200,
  unitPerMeter: 140,
};

const player = {
  role: "Survivor",
  x: 540,
  y: 440,
  speed: 420,
  radius: 22,
  color: "#c6e2ff",
};

const hunter = {
  role: "Hunter",
  x: 4300,
  y: 2550,
  speed: 190,
  radius: 28,
  color: "#8d2424",
  patrolAngle: 0,
};

const rooms = [
  { name: "Foyer", x: 120, y: 120, w: 900, h: 760, mood: "#1b2028" },
  { name: "Grand Hall", x: 1020, y: 120, w: 1400, h: 760, mood: "#161c24" },
  { name: "Bedroom A", x: 2500, y: 120, w: 930, h: 760, mood: "#1a1f26" },
  { name: "Bedroom B", x: 3450, y: 120, w: 1200, h: 760, mood: "#141821" },
  { name: "Library", x: 120, y: 900, w: 1250, h: 970, mood: "#171d24" },
  { name: "Dining", x: 1390, y: 900, w: 1030, h: 970, mood: "#171922" },
  { name: "Storage", x: 2440, y: 900, w: 1010, h: 970, mood: "#17151f" },
  { name: "Attic Steps", x: 3470, y: 900, w: 1180, h: 970, mood: "#131922" },
  { name: "Basement Entry", x: 120, y: 1890, w: 1620, h: 1150, mood: "#13161d" },
  { name: "Laundry", x: 1760, y: 1890, w: 960, h: 1150, mood: "#18141e" },
  { name: "Master Suite", x: 2740, y: 1890, w: 1910, h: 1150, mood: "#151821" },
];

const DOOR = {
  wallGap: 30,
  horizontalWidth: 180,
  horizontalDepth: 100,
  verticalHeight: 180,
  verticalDepth: 100,
  interactionRange: 220,
};

const doors = buildDoors(rooms);

const hidingSpots = [
  { type: "Under Bed", x: 2760, y: 370, w: 200, h: 110, style: "bed" },
  { type: "Locker", x: 2270, y: 1210, w: 110, h: 250, style: "locker" },
  { type: "Behind Curtain", x: 4490, y: 390, w: 130, h: 260, style: "curtain" },
  { type: "Under Bed", x: 3820, y: 2490, w: 220, h: 120, style: "bed" },
  { type: "Locker", x: 1540, y: 2490, w: 110, h: 260, style: "locker" },
  { type: "Behind Curtain", x: 250, y: 2410, w: 140, h: 270, style: "curtain" },
];

const keys = new Set();
let screen = { width: 0, height: 0 };
let lastTime = performance.now();

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
          });
        }
      }
    }
  }

  return generatedDoors;
}

function pointInsideRectWithRadius(x, y, radius, rect) {
  return (
    x >= rect.x + radius &&
    x <= rect.x + rect.w - radius &&
    y >= rect.y + radius &&
    y <= rect.y + rect.h - radius
  );
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
    if (door.isOpen && pointInsideRectWithRadius(x, y, entity.radius, door)) {
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

function nearestDoorFor(entity) {
  let bestDoor = null;
  let bestDistance = Infinity;

  for (const door of doors) {
    const d = distanceToDoor(entity, door);
    if (d < bestDistance) {
      bestDistance = d;
      bestDoor = door;
    }
  }

  return { door: bestDoor, distance: bestDistance };
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

function moveSurvivor(deltaSeconds) {
  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    const distance = player.speed * deltaSeconds;
    const moveX = (dx / len) * distance;
    const moveY = (dy / len) * distance;
    moveEntity(player, moveX, moveY);
  }
}

function moveHunter(deltaSeconds, elapsedSeconds) {
  hunter.patrolAngle += deltaSeconds * 0.65;
  const targetX = 2500 + Math.cos(hunter.patrolAngle + elapsedSeconds * 0.09) * 1900;
  const targetY = 1600 + Math.sin(hunter.patrolAngle * 1.28 + elapsedSeconds * 0.11) * 1200;

  const vx = targetX - hunter.x;
  const vy = targetY - hunter.y;
  const len = Math.hypot(vx, vy) || 1;

  autoOpenDoorFor(hunter);
  moveEntity(hunter, (vx / len) * hunter.speed * deltaSeconds, (vy / len) * hunter.speed * deltaSeconds);
}

function camera() {
  const halfW = screen.width * 0.5;
  const halfH = screen.height * 0.5;

  return {
    x: clamp(player.x - halfW, 0, WORLD.width - screen.width),
    y: clamp(player.y - halfH, 0, WORLD.height - screen.height),
  };
}

function drawWorldGrid(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  ctx.fillStyle = "#0a0d12";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.strokeStyle = "rgba(181, 195, 218, 0.04)";
  ctx.lineWidth = 1;

  const step = 140;
  for (let x = 0; x <= WORLD.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, WORLD.height);
    ctx.stroke();
  }

  for (let y = 0; y <= WORLD.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WORLD.width, y + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

function drawRooms(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const room of rooms) {
    const gradient = ctx.createLinearGradient(room.x, room.y, room.x + room.w, room.y + room.h);
    gradient.addColorStop(0, room.mood);
    gradient.addColorStop(1, "#0f131a");

    ctx.fillStyle = gradient;
    ctx.fillRect(room.x, room.y, room.w, room.h);

    ctx.strokeStyle = "rgba(229, 214, 194, 0.24)";
    ctx.lineWidth = 4;
    ctx.strokeRect(room.x, room.y, room.w, room.h);

    ctx.fillStyle = "rgba(223, 213, 198, 0.75)";
    ctx.font = "26px Cinzel";
    ctx.fillText(room.name, room.x + 22, room.y + 40);
  }

  for (const door of doors) {
    ctx.fillStyle = door.isOpen ? "#2fa64a" : "#b02222";
    ctx.fillRect(door.x, door.y, door.w, door.h);

    ctx.strokeStyle = "rgba(255, 228, 181, 0.38)";
    ctx.lineWidth = 2;
    ctx.strokeRect(door.x + 1, door.y + 1, door.w - 2, door.h - 2);

    ctx.fillStyle = "rgba(248, 219, 177, 0.5)";
    ctx.font = "14px Special Elite";
    ctx.fillText(door.isOpen ? "Open" : "Closed", door.x + 10, door.y + 18);
  }

  ctx.restore();
}

function drawHidingSpot(spot) {
  if (spot.style === "bed") {
    ctx.fillStyle = "#3e2a2a";
    ctx.fillRect(spot.x, spot.y, spot.w, spot.h);
    ctx.fillStyle = "#231818";
    ctx.fillRect(spot.x + 18, spot.y + 12, spot.w - 36, spot.h - 34);
  }

  if (spot.style === "locker") {
    ctx.fillStyle = "#2f3a41";
    ctx.fillRect(spot.x, spot.y, spot.w, spot.h);
    ctx.strokeStyle = "#5f6f78";
    ctx.lineWidth = 3;
    ctx.strokeRect(spot.x + 9, spot.y + 14, spot.w - 18, spot.h - 24);
  }

  if (spot.style === "curtain") {
    ctx.fillStyle = "#4f1010";
    ctx.fillRect(spot.x, spot.y, spot.w, spot.h);
    ctx.fillStyle = "rgba(104, 16, 16, 0.42)";
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(spot.x + i * (spot.w / 5), spot.y, 6, spot.h);
    }
  }

  ctx.fillStyle = "rgba(228, 211, 190, 0.8)";
  ctx.font = "18px Special Elite";
  ctx.fillText(spot.type, spot.x + 6, spot.y - 10);
}

function drawHidingSpots(cam) {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const spot of hidingSpots) {
    drawHidingSpot(spot);
  }

  ctx.restore();
}

function drawCharacter(entity, cam) {
  const x = entity.x - cam.x;
  const y = entity.y - cam.y;

  ctx.fillStyle = entity.color;
  ctx.beginPath();
  ctx.arc(x, y, entity.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(229, 221, 210, 0.9)";
  ctx.font = "17px Cinzel";
  ctx.fillText(entity.role, x - entity.radius, y - entity.radius - 8);
}

function drawFog(elapsedSeconds) {
  ctx.save();
  const particles = 30;
  for (let i = 0; i < particles; i += 1) {
    const t = elapsedSeconds * 0.07 + i * 0.39;
    const x = (Math.sin(t * 1.23) * 0.5 + 0.5) * screen.width;
    const y = (Math.cos(t * 0.9) * 0.5 + 0.5) * screen.height;
    const r = 70 + ((i * 43) % 160);

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(194, 209, 226, 0.06)");
    g.addColorStop(1, "rgba(194, 209, 226, 0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(
    screen.width / 2,
    screen.height / 2,
    Math.min(screen.width, screen.height) * 0.2,
    screen.width / 2,
    screen.height / 2,
    Math.max(screen.width, screen.height) * 0.7
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.82)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, screen.width, screen.height);
}

function drawScaleInfo(cam) {
  ctx.save();
  ctx.fillStyle = "rgba(232, 221, 207, 0.75)";
  ctx.font = "14px Special Elite";
  const roomX = Math.floor((player.x / WORLD.unitPerMeter) * 10) / 10;
  const roomY = Math.floor((player.y / WORLD.unitPerMeter) * 10) / 10;
  ctx.fillText(`Position: ${roomX}m, ${roomY}m`, 20, screen.height - 24);
  ctx.fillText(`Camera: ${Math.floor(cam.x)}, ${Math.floor(cam.y)}`, 20, screen.height - 44);
  ctx.restore();
}

function frame(now) {
  const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05);
  const elapsedSeconds = now / 1000;
  lastTime = now;

  moveSurvivor(deltaSeconds);
  moveHunter(deltaSeconds, elapsedSeconds);

  const cam = camera();

  ctx.clearRect(0, 0, screen.width, screen.height);
  drawWorldGrid(cam);
  drawRooms(cam);
  drawHidingSpots(cam);
  drawCharacter(hunter, cam);
  drawCharacter(player, cam);
  drawFog(elapsedSeconds);
  drawVignette();
  drawScaleInfo(cam);

  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key);

  if (event.repeat) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "e") {
    interactDoor(player, true);
  }

  if (key === "f") {
    interactDoor(player, false);
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("resize", resize);

resize();
requestAnimationFrame(frame);
