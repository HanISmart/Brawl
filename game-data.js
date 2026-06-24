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
  speed: 460,
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

const ROOM_CONTENT = {
  Foyer: {
    hidingSpots: [
      { type: "Wardrobe", style: "wardrobe", x: 0.04, y: 0.16, w: 0.16, h: 0.34 },
      { type: "Cabinet", style: "cabinet", x: 0.78, y: 0.16, w: 0.16, h: 0.24 },
      { type: "Curtain", style: "curtain", x: 0.38, y: 0, w: 0.22, h: 0.16 },
      { type: "Armchair", style: "chair", x: 0.40, y: 0.60, w: 0.16, h: 0.16 },
    ],
    decorations: [
      { type: "Rug", style: "rug", x: 0.32, y: 0.58, w: 0.30, h: 0.12 },
      { type: "Mirror", style: "mirror", x: 0.54, y: 0.18, w: 0.10, h: 0.18 },
      { type: "Window", style: "window", x: 0.40, y: 0, w: 0.18, h: 0.08 },
    ],
  },
  "Grand Hall": {
    hidingSpots: [
      { type: "Sofa", style: "sofa", x: 0.06, y: 0.62, w: 0.24, h: 0.14 },
      { type: "Cabinet", style: "cabinet", x: 0.78, y: 0.16, w: 0.12, h: 0.24 },
      { type: "Curtain", style: "curtain", x: 0.43, y: 0, w: 0.18, h: 0.16 },
      { type: "Armchair", style: "chair", x: 0.54, y: 0.62, w: 0.14, h: 0.16 },
    ],
    decorations: [
      { type: "Painting", style: "painting", x: 0.20, y: 0.18, w: 0.16, h: 0.12 },
      { type: "Statue", style: "statue", x: 0.80, y: 0.60, w: 0.08, h: 0.18 },
      { type: "Window", style: "window", x: 0.46, y: 0, w: 0.14, h: 0.08 },
    ],
  },
  "Bedroom A": {
    hidingSpots: [
      { type: "Under Bed", style: "bed", x: 0.08, y: 0.14, w: 0.30, h: 0.16 },
      { type: "Wardrobe", style: "wardrobe", x: 0.72, y: 0.14, w: 0.16, h: 0.34 },
      { type: "Curtain", style: "curtain", x: 0.42, y: 0, w: 0.18, h: 0.16 },
      { type: "Dresser", style: "dresser", x: 0.52, y: 0.62, w: 0.16, h: 0.22 },
    ],
    decorations: [
      { type: "Lamp", style: "lamp", x: 0.14, y: 0.62, w: 0.08, h: 0.16 },
      { type: "Rug", style: "rug", x: 0.30, y: 0.56, w: 0.36, h: 0.14 },
      { type: "Window", style: "window", x: 0.45, y: 0, w: 0.14, h: 0.08 },
    ],
  },
  "Bedroom B": {
    hidingSpots: [
      { type: "Under Bed", style: "bed", x: 0.10, y: 0.14, w: 0.28, h: 0.16 },
      { type: "Wardrobe", style: "wardrobe", x: 0.72, y: 0.14, w: 0.14, h: 0.32 },
      { type: "Curtain", style: "curtain", x: 0.44, y: 0, w: 0.18, h: 0.16 },
      { type: "Chair", style: "chair", x: 0.54, y: 0.64, w: 0.13, h: 0.16 },
    ],
    decorations: [
      { type: "Mirror", style: "mirror", x: 0.22, y: 0.24, w: 0.10, h: 0.16 },
      { type: "Table", style: "table", x: 0.50, y: 0.56, w: 0.18, h: 0.12 },
      { type: "Window", style: "window", x: 0.47, y: 0, w: 0.14, h: 0.08 },
    ],
  },
  Library: {
    hidingSpots: [
      { type: "Bookshelf", style: "shelf", x: 0.04, y: 0.14, w: 0.16, h: 0.46 },
      { type: "Cabinet", style: "cabinet", x: 0.78, y: 0.16, w: 0.12, h: 0.26 },
      { type: "Curtain", style: "curtain", x: 0.42, y: 0, w: 0.18, h: 0.16 },
      { type: "Armchair", style: "chair", x: 0.46, y: 0.64, w: 0.14, h: 0.16 },
    ],
    decorations: [
      { type: "Table", style: "table", x: 0.34, y: 0.58, w: 0.20, h: 0.12 },
      { type: "Lamp", style: "lamp", x: 0.14, y: 0.62, w: 0.08, h: 0.16 },
      { type: "Window", style: "window", x: 0.45, y: 0, w: 0.14, h: 0.08 },
    ],
  },
  Dining: {
    hidingSpots: [
      { type: "Cabinet", style: "cabinet", x: 0.06, y: 0.16, w: 0.16, h: 0.24 },
      { type: "Chair", style: "chair", x: 0.36, y: 0.60, w: 0.12, h: 0.16 },
      { type: "Curtain", style: "curtain", x: 0.70, y: 0, w: 0.16, h: 0.16 },
      { type: "Sofa", style: "sofa", x: 0.52, y: 0.64, w: 0.20, h: 0.12 },
    ],
    decorations: [
      { type: "Table", style: "table", x: 0.28, y: 0.34, w: 0.28, h: 0.12 },
      { type: "Rug", style: "rug", x: 0.24, y: 0.64, w: 0.38, h: 0.10 },
      { type: "Window", style: "window", x: 0.73, y: 0, w: 0.14, h: 0.08 },
    ],
  },
  Storage: {
    hidingSpots: [
      { type: "Crates", style: "crates", x: 0.06, y: 0.16, w: 0.18, h: 0.18 },
      { type: "Locker", style: "locker", x: 0.78, y: 0.14, w: 0.10, h: 0.30 },
      { type: "Bin", style: "bin", x: 0.42, y: 0.60, w: 0.12, h: 0.18 },
      { type: "Shelf", style: "shelf", x: 0.24, y: 0.62, w: 0.14, h: 0.24 },
    ],
    decorations: [
      { type: "Barrel", style: "barrel", x: 0.58, y: 0.58, w: 0.10, h: 0.16 },
      { type: "Trunk", style: "trunk", x: 0.34, y: 0.26, w: 0.16, h: 0.12 },
    ],
  },
  "Attic Steps": {
    hidingSpots: [
      { type: "Wardrobe", style: "wardrobe", x: 0.06, y: 0.16, w: 0.14, h: 0.32 },
      { type: "Curtain", style: "curtain", x: 0.48, y: 0.04, w: 0.14, h: 0.26 },
      { type: "Shelf", style: "shelf", x: 0.76, y: 0.16, w: 0.12, h: 0.38 },
      { type: "Chair", style: "chair", x: 0.32, y: 0.64, w: 0.12, h: 0.15 },
    ],
    decorations: [
      { type: "Lantern", style: "lamp", x: 0.18, y: 0.24, w: 0.08, h: 0.16 },
      { type: "Trunk", style: "trunk", x: 0.56, y: 0.58, w: 0.16, h: 0.12 },
      { type: "Window", style: "window", x: 0.48, y: 0, w: 0.12, h: 0.08 },
    ],
  },
  "Basement Entry": {
    hidingSpots: [
      { type: "Crates", style: "crates", x: 0.06, y: 0.16, w: 0.14, h: 0.18 },
      { type: "Locker", style: "locker", x: 0.80, y: 0.14, w: 0.10, h: 0.30 },
      { type: "Bin", style: "bin", x: 0.42, y: 0.60, w: 0.10, h: 0.18 },
      { type: "Curtain", style: "curtain", x: 0.50, y: 0, w: 0.18, h: 0.16 },
    ],
    decorations: [
      { type: "Barrel", style: "barrel", x: 0.24, y: 0.64, w: 0.10, h: 0.16 },
      { type: "Pipe", style: "pipe", x: 0.52, y: 0.34, w: 0.22, h: 0.06 },
      { type: "Window", style: "window", x: 0.52, y: 0, w: 0.14, h: 0.08 },
    ],
  },
  Laundry: {
    hidingSpots: [
      { type: "Laundry Bin", style: "bin", x: 0.10, y: 0.16, w: 0.12, h: 0.18 },
      { type: "Locker", style: "locker", x: 0.78, y: 0.14, w: 0.10, h: 0.30 },
      { type: "Curtain", style: "curtain", x: 0.44, y: 0, w: 0.18, h: 0.16 },
      { type: "Cabinet", style: "cabinet", x: 0.30, y: 0.62, w: 0.14, h: 0.20 },
    ],
    decorations: [
      { type: "Basket", style: "basket", x: 0.18, y: 0.62, w: 0.10, h: 0.12 },
      { type: "Sink", style: "sink", x: 0.54, y: 0.58, w: 0.16, h: 0.12 },
      { type: "Window", style: "window", x: 0.47, y: 0, w: 0.14, h: 0.08 },
    ],
  },
  "Master Suite": {
    hidingSpots: [
      { type: "Under Bed", style: "bed", x: 0.10, y: 0.14, w: 0.28, h: 0.16 },
      { type: "Wardrobe", style: "wardrobe", x: 0.74, y: 0.14, w: 0.14, h: 0.34 },
      { type: "Curtain", style: "curtain", x: 0.42, y: 0, w: 0.20, h: 0.16 },
      { type: "Dresser", style: "dresser", x: 0.52, y: 0.62, w: 0.16, h: 0.22 },
    ],
    decorations: [
      { type: "Mirror", style: "mirror", x: 0.22, y: 0.22, w: 0.10, h: 0.18 },
      { type: "Rug", style: "rug", x: 0.32, y: 0.56, w: 0.30, h: 0.14 },
      { type: "Window", style: "window", x: 0.45, y: 0, w: 0.16, h: 0.08 },
    ],
  },
};

function buildRoomItem(room, item) {
  return {
    type: item.type,
    style: item.style,
    x: room.x + room.w * item.x,
    y: room.y + room.h * item.y,
    w: room.w * item.w,
    h: room.h * item.h,
  };
}

const hidingSpots = [];
const roomDecorations = [];

for (const room of rooms) {
  const content = ROOM_CONTENT[room.name];
  if (!content) {
    continue;
  }

  hidingSpots.push(...content.hidingSpots.map((item) => buildRoomItem(room, item)));
  roomDecorations.push(...content.decorations.map((item) => buildRoomItem(room, item)));
}
