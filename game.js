const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const HIDE = {
  interactionRange: 110,
};

const hideActionButton = document.getElementById("hide-action");

let survivorIsHidden = false;
let activeHidingSpot = null;

const keys = new Set();
let screen = { width: 0, height: 0 };
let lastTime = performance.now();

const doors = buildDoors(rooms);

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
  return x >= rect.x + radius && x <= rect.x + rect.w - radius && y >= rect.y + radius && y <= rect.y + rect.h - radius;
}

function pointInsideOpenDoorWithRadius(x, y, radius, door) {
  if (door.orientation === "vertical") {
    return x >= door.x - radius && x <= door.x + door.w + radius && y >= door.y + radius && y <= door.y + door.h - radius;
  }

  return x >= door.x + radius && x <= door.x + door.w - radius && y >= door.y - radius && y <= door.y + door.h + radius;
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

function updateHideActionButton() {
  const { spot, distance } = nearestHidingSpotFor(player);
  const canInteract = survivorIsHidden || (spot && distance <= HIDE.interactionRange);

  hideActionButton.hidden = !canInteract;
  hideActionButton.textContent = survivorIsHidden ? "Unhide" : "Hide";
  hideActionButton.setAttribute("aria-label", survivorIsHidden ? "Unhide from hiding place" : "Hide in nearby hiding place");
}

function toggleHideState() {
  if (survivorIsHidden) {
    survivorIsHidden = false;
    activeHidingSpot = null;
    updateHideActionButton();
    return;
  }

  const { spot, distance } = nearestHidingSpotFor(player);
  if (spot && distance <= HIDE.interactionRange) {
    activeHidingSpot = spot;
    player.x = spot.x + spot.w * 0.5;
    player.y = spot.y + spot.h * 0.5;
    survivorIsHidden = true;
    updateHideActionButton();
  }
}

function moveSurvivor(deltaSeconds) {
  if (survivorIsHidden) {
    return;
  }

  let dx = 0;
  let dy = 0;

  if (keys.has("w") || keys.has("W")) dy -= 1;
  if (keys.has("s") || keys.has("S")) dy += 1;
  if (keys.has("a") || keys.has("A")) dx -= 1;
  if (keys.has("d") || keys.has("D")) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy) || 1;
    const distance = player.speed * deltaSeconds;
    moveEntity(player, (dx / length) * distance, (dy / length) * distance);
  }
}

function moveHunter(deltaSeconds) {
  void deltaSeconds;
}

function moveHunterWithKeys(deltaSeconds) {
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
  backdrop.addColorStop(0, "#11161d");
  backdrop.addColorStop(0.45, "#0b0f15");
  backdrop.addColorStop(1, "#080a0d");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const glow = ctx.createRadialGradient(WORLD.width * 0.28, WORLD.height * 0.24, 0, WORLD.width * 0.28, WORLD.height * 0.24, WORLD.width * 0.92);
  glow.addColorStop(0, "rgba(99, 112, 132, 0.08)");
  glow.addColorStop(0.35, "rgba(99, 112, 132, 0.03)");
  glow.addColorStop(1, "rgba(99, 112, 132, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const floorSheen = ctx.createRadialGradient(WORLD.width * 0.45, WORLD.height * 0.38, 0, WORLD.width * 0.45, WORLD.height * 0.38, WORLD.width * 0.92);
  floorSheen.addColorStop(0, "rgba(255, 255, 255, 0.025)");
  floorSheen.addColorStop(0.5, "rgba(255, 255, 255, 0.012)");
  floorSheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = floorSheen;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.007)";
  for (let i = 0; i < 160; i += 1) {
    const x = (i * 173) % WORLD.width;
    const y = (i * 311) % WORLD.height;
    ctx.fillRect(x, y, 2, 2);
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
  const wallThickness = 4;
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

  for (const door of doors) {
    if (door.isOpen) {
      drawWithDepth(() => {
        drawMaterialRect(door.x, door.y, door.w, door.h, { top: "rgba(46, 92, 57, 0.35)", mid: "rgba(44, 147, 71, 0.34)", bottom: "rgba(22, 52, 31, 0.38)" }, { border: "rgba(149, 236, 161, 0.75)", borderWidth: 2, gloss: "rgba(255,255,255,0.10)" });
      }, "rgba(0, 0, 0, 0.22)", 3, 4, 5);
    } else {
      drawWithDepth(() => {
        drawMaterialRect(door.x, door.y, door.w, door.h, { top: "#7d1f1f", mid: "#b02222", bottom: "#431010" }, { border: "rgba(255, 228, 181, 0.45)", borderWidth: 2, gloss: "rgba(255,255,255,0.12)" });
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillRect(door.x + 6, door.y + 5, door.w - 12, 4);
      }, "rgba(0, 0, 0, 0.30)", 4, 5, 5);
    }
  }

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
    drawWithDepth(() => drawDecoration(decoration), "rgba(0, 0, 0, 0.22)", 3, 4, 5);
  }

  for (const spot of hidingSpots) {
    drawWithDepth(() => drawHidingSpot(spot), "rgba(0, 0, 0, 0.24)", 4, 5, 6);
  }

  ctx.restore();
}

function drawCharacter(entity, cam) {
  const x = entity.x - cam.x;
  const y = entity.y - cam.y;
  const hidden = entity === player && survivorIsHidden;
  const radius = hidden ? entity.radius * 0.84 : entity.radius;

  drawGroundShadow(x - radius, y + radius * 0.16, radius * 2, radius * 0.9, 0.24);

  drawWithDepth(() => {
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.arc(x + 4, y + 5, radius, 0, Math.PI * 2);
    ctx.fill();

    const bodyGradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.25, x, y, radius);
    bodyGradient.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    bodyGradient.addColorStop(0.35, entity.color);
    bodyGradient.addColorStop(1, "rgba(0, 0, 0, 0.28)");

    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.3, radius * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }, "rgba(0, 0, 0, 0.26)", 2, 4, 5);

  ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
  ctx.beginPath();
  ctx.arc(x - radius * 0.25, y - radius * 0.28, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawFog(elapsedSeconds) {
  ctx.save();
  const particles = 22;
  for (let i = 0; i < particles; i += 1) {
    const t = elapsedSeconds * 0.07 + i * 0.39;
    const x = (Math.sin(t * 1.23) * 0.5 + 0.5) * screen.width;
    const y = (Math.cos(t * 0.9) * 0.5 + 0.5) * screen.height;
    const r = 70 + ((i * 43) % 160);

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(194, 209, 226, 0.04)");
    g.addColorStop(1, "rgba(194, 209, 226, 0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVignette(viewport) {
  const gradient = ctx.createRadialGradient(viewport.x + viewport.w / 2, viewport.y + viewport.h / 2, Math.min(viewport.w, viewport.h) * 0.2, viewport.x + viewport.w / 2, viewport.y + viewport.h / 2, Math.max(viewport.w, viewport.h) * 0.7);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.78)");

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

function renderViewport(viewport, focusEntity, label, labelColor, elapsedSeconds, threatIntensity = 0) {
  const cam = cameraFor(focusEntity, viewport);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
  ctx.clip();

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  drawWorldGrid(cam, viewport);
  drawRooms(cam);
  drawHidingSpots(cam);
  drawCharacter(hunter, cam);
  drawCharacter(player, cam);
  drawFog(elapsedSeconds);
  drawVignette({ x: 0, y: 0, w: viewport.w, h: viewport.h });
  if (focusEntity === hunter) {
    const distance = Math.hypot(hunter.x - player.x, hunter.y - player.y);
    const intensity = clamp(1 - distance / 1400, 0, 1);
    drawThreatOverlay({ x: 0, y: 0, w: viewport.w, h: viewport.h }, intensity);
  } else {
    const distance = Math.hypot(hunter.x - player.x, hunter.y - player.y);
    const intensity = clamp(1 - distance / 1400, 0, 1);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.35 + intensity * 0.55})`;
    ctx.fillRect(0, 0, viewport.w, viewport.h);
  }
  ctx.restore();

  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(viewport.x, viewport.y, viewport.w, 26);
  ctx.fillStyle = labelColor;
  ctx.font = "18px Cinzel";
  ctx.fillText(label, viewport.x + 14, viewport.y + 19);

  ctx.restore();
}

function frame(now) {
  const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05);
  const elapsedSeconds = now / 1000;
  lastTime = now;

  updateHideActionButton();
  moveSurvivor(deltaSeconds);
  moveHunterWithKeys(deltaSeconds);

  const dividerWidth = 8;
  const leftWidth = Math.floor((screen.width - dividerWidth) / 2);
  const rightWidth = screen.width - leftWidth - dividerWidth;
  const leftViewport = { x: 0, y: 0, w: leftWidth, h: screen.height };
  const rightViewport = { x: leftWidth + dividerWidth, y: 0, w: rightWidth, h: screen.height };

  ctx.clearRect(0, 0, screen.width, screen.height);
  renderViewport(leftViewport, player, "Survivor", "rgba(195, 226, 255, 0.92)", elapsedSeconds);
  renderViewport(rightViewport, hunter, "Hunter", "rgba(255, 178, 178, 0.92)", elapsedSeconds);

  ctx.fillStyle = "rgba(5, 7, 10, 0.94)";
  ctx.fillRect(leftWidth, 0, dividerWidth, screen.height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
  ctx.fillRect(leftWidth + 2, 0, 4, screen.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, screen.width, 1);
  ctx.fillRect(0, screen.height - 1, screen.width, 1);

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
hideActionButton.addEventListener("click", toggleHideState);

resize();
requestAnimationFrame(frame);