"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AgentPanel from "./components/AgentPanel";
import ConvoStream from "./components/ConvoStream";
import MetricsPanel from "./components/MetricsPanel";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface AgentData {
  id: string;
  name: string;
  position: { x: number; y: number };
  status: string;
  currentLocation: string;
  currentAction: string | null;
  conversationId: string | null;
  memoryCount: number;
  recentMemories: { description: string; type: string; importance: number }[];
}

interface LocationData {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

interface ConvoMessage {
  agentId: string;
  agentName: string;
  content: string;
  timestamp: number;
}

interface ConvoData {
  id: string;
  participants: string[];
  messages: ConvoMessage[];
  location: string;
  startTime?: number;
  endTime?: number;
}

interface WorldSnapshot {
  currentTime: number;
  currentDay: number;
  agents: Record<string, AgentData>;
  activeConversations: ConvoData[];
  locations: LocationData[];
}

// ─── 16-bit JRPG Palette (bright, saturated, pixel-art town) ────────
const P = {
  // Grass — bright saturated greens
  grass1: "#38b830",
  grass2: "#2ca828",
  grass3: "#48c840",
  grass4: "#209820",
  grassFlower1: "#f04848",
  grassFlower2: "#e838a0",
  grassFlower3: "#d058d8",

  // Paths — warm sandy beige
  path: "#e0c880",
  pathLight: "#f0d898",
  pathDark: "#c8a860",
  pathEdge: "#b09050",

  // Building walls — thick dark brown (JRPG style)
  wallOuter: "#5a3a20",
  wallInner: "#6b4a28",
  wallDark: "#402810",

  // Building interiors (floor visible from above)
  floorWood: "#d8a860",
  floorWoodLight: "#e8c078",
  floorWoodDark: "#c89848",
  floorTile: "#b8c8d0",
  floorTileLight: "#c8d8e0",
  floorCarpet: "#c04848",
  floorCarpetLight: "#d06060",

  // Furniture
  desk: "#906838",
  deskTop: "#b88850",
  chair: "#c04030",
  chairAlt: "#3070b8",
  bookshelf: "#5a3018",
  bookColors: ["#d83030", "#3070d0", "#30a030", "#d8a020", "#9030b0", "#e06020"],
  bed: "#e8d8c8",
  bedSheet: "#90b8e0",
  counter: "#a07848",
  table: "#986838",
  rug: "#b04040",
  rugLight: "#c86060",
  plant: "#30a030",
  plantPot: "#c08040",

  // Roof colors per building (visible as eave border)
  roofGray: "#687080",
  roofBrown: "#785838",
  roofBlue: "#4068a0",
  roofRed: "#a04838",
  roofTeal: "#387868",

  // Trees & foliage — pom-pom style
  trunk: "#704820",
  trunkDark: "#503010",
  canopy1: "#20a020",
  canopy2: "#189818",
  canopy3: "#28a828",
  canopyHighlight: "#48c838",
  canopyShadow: "#106010",

  // Water
  water: "#4898d0",
  waterLight: "#68b8e8",
  waterDark: "#3080b0",

  // UI
  white: "#ffffff",
  black: "#000000",
  textDark: "#202020",
  bubbleBg: "#ffffff",
  bubbleBorder: "#303030",
  shadow: "rgba(0,0,0,0.22)",

  // Doorstep
  doorstep: "#d0b878",
};

// Per-building style
const BSTYLES: Record<string, { roof: string; floor: string; furniture: string }> = {
  "Solana HQ":        { roof: P.roofBlue,  floor: P.floorTile,     furniture: "office" },
  "DRiP Gallery":     { roof: P.roofGray,  floor: P.floorWood,     furniture: "gallery" },
  "The Colosseum":    { roof: P.roofRed,   floor: P.floorWood,     furniture: "arena" },
  "Helius Labs":      { roof: P.roofTeal,  floor: P.floorTile,     furniture: "lab" },
  "Dev Hub":          { roof: P.roofGray,  floor: P.floorWood,     furniture: "office" },
  "Learning Center":  { roof: P.roofBrown, floor: P.floorWood,     furniture: "classroom" },
  "Press Room":       { roof: P.roofBlue,  floor: P.floorCarpet,   furniture: "press" },
  "Validators' Café": { roof: P.roofBrown, floor: P.floorWood,     furniture: "cafe" },
};

// Per-agent sprite color (hair + shirt) — tiny top-down characters
const AGENT_SPRITES: Record<string, { hair: string; shirt: string }> = {
  "Anatoly":  { hair: "#2a2a30", shirt: "#40c888" },
  "Raj":      { hair: "#1a1a20", shirt: "#4888dd" },
  "Vibhu":    { hair: "#4a3020", shirt: "#e87030" },
  "Austin":   { hair: "#c89040", shirt: "#4060c0" },
  "Mert":     { hair: "#2a2020", shirt: "#d84060" },
  "Chase":    { hair: "#604020", shirt: "#8040c0" },
  "Armani":   { hair: "#1a1a20", shirt: "#e0b040" },
  "Frank":    { hair: "#888888", shirt: "#3a6850" },
};
const DEFAULT_SPRITE = { hair: "#4a3a28", shirt: "#5580c0" };

const STATUS_COLORS: Record<string, string> = {
  idle: "#4ade80",
  walking: "#60a5fa",
  talking: "#f472b6",
  reflecting: "#c084fc",
  planning: "#fbbf24",
};

// ─── Deterministic hash for tile variation ──────────────────────────
function th(x: number, y: number): number {
  return ((x * 2654435761 + y * 40503) >>> 0) % 1000;
}

// ─── Pixel rect helper ─────────────────────────────────────────────
function pr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// ─── Grass: bright saturated JRPG tiled background ──────────────────
function drawGrass(ctx: CanvasRenderingContext2D) {
  // Base fill — bright green
  pr(ctx, 0, 0, 800, 600, P.grass1);

  // 8x8 tile variation for texture (checkerboard-ish like JRPG)
  for (let ty = 0; ty < 75; ty++) {
    for (let tx = 0; tx < 100; tx++) {
      const h = th(tx, ty);
      // Alternating tile pattern for JRPG look
      const checker = (tx + ty) % 2 === 0;
      if (checker) {
        if (h < 300) pr(ctx, tx * 8, ty * 8, 8, 8, P.grass2);
        else if (h < 500) pr(ctx, tx * 8, ty * 8, 8, 8, P.grass3);
      } else {
        if (h < 200) pr(ctx, tx * 8, ty * 8, 8, 8, P.grass4);
      }

      // Scattered tiny flowers
      if (h > 960) {
        const fc = h > 985 ? P.grassFlower1 : h > 975 ? P.grassFlower2 : P.grassFlower3;
        pr(ctx, tx * 8 + (h % 5), ty * 8 + ((h >> 3) % 5), 2, 2, fc);
      }
      // Tiny grass detail tufts
      if (h > 920 && h <= 960) {
        pr(ctx, tx * 8 + (h % 6), ty * 8 + ((h >> 2) % 6), 2, 3, P.grass4);
      }
    }
  }
}

// ─── Paths: wide sandy roads connecting locations ───────────────────
// The paper uses wide (~24px) sandy paths forming a road network
function drawPaths(ctx: CanvasRenderingContext2D, locations: LocationData[]) {
  const W = 24; // path width — wide like the paper
  const half = W / 2;

  // Find Town Square center as hub
  const ts = locations.find(l => l.name === "Town Square");
  const hub = ts ? { x: ts.x + ts.width / 2, y: ts.y + ts.height / 2 } : { x: 400, y: 240 };

  // Draw paths from hub to each location (L-shaped via hub)
  for (const loc of locations) {
    const cx = loc.x + loc.width / 2;
    const cy = loc.y + loc.height / 2;

    // Vertical segment from hub.y to loc center y, at hub.x
    const yMin = Math.min(hub.y, cy);
    const yMax = Math.max(hub.y, cy);
    drawPathRect(ctx, hub.x - half, yMin - half, W, yMax - yMin + W, W);

    // Horizontal segment from hub.x to loc center x, at cy
    const xMin = Math.min(hub.x, cx);
    const xMax = Math.max(hub.x, cx);
    drawPathRect(ctx, xMin - half, cy - half, xMax - xMin + W, W, W);
  }

  // Extra connecting paths between nearby buildings
  const conn = [
    ["Solana HQ", "Helius Labs"],
    ["Solana HQ", "Press Room"],
    ["The Colosseum", "Learning Center"],
    ["Dev Hub", "Validators' Café"],
  ];
  for (const [a, b] of conn) {
    const la = locations.find(l => l.name === a);
    const lb = locations.find(l => l.name === b);
    if (la && lb) {
      const ax = la.x + la.width / 2, ay = la.y + la.height / 2;
      const bx = lb.x + lb.width / 2, by = lb.y + lb.height / 2;
      // Horizontal then vertical
      drawPathRect(ctx, Math.min(ax, bx) - half, ay - half, Math.abs(bx - ax) + W, W, W);
      drawPathRect(ctx, bx - half, Math.min(ay, by) - half, W, Math.abs(by - ay) + W, W);
    }
  }
}

function drawPathRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _pathW: number) {
  // Main path fill
  pr(ctx, x, y, w, h, P.path);
  // Edge darkening (2px borders for JRPG crisp look)
  pr(ctx, x, y, w, 2, P.pathEdge);
  pr(ctx, x, y + h - 2, w, 2, P.pathEdge);
  pr(ctx, x, y, 2, h, P.pathEdge);
  pr(ctx, x + w - 2, y, 2, h, P.pathEdge);
  // Sandy texture variation
  for (let py = y + 2; py < y + h - 2; py += 8) {
    for (let px = x + 2; px < x + w - 2; px += 8) {
      const v = th(px + 300, py + 300);
      if (v < 200) pr(ctx, px + (v % 5), py + ((v >> 2) % 5), 3, 3, P.pathLight);
      if (v > 800) pr(ctx, px + (v % 4), py + ((v >> 2) % 4), 2, 2, P.pathDark);
    }
  }
}

// ─── Trees: pom-pom style round canopy with visible trunk ───────────
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number = 1) {
  const s = size;
  // Shadow on ground (darker, more visible)
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 5 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Visible trunk (taller, like JRPG trees)
  pr(ctx, x - 3 * s, y - 8 * s, 6 * s, 14 * s, P.trunk);
  pr(ctx, x - 2 * s, y - 8 * s, 4 * s, 14 * s, P.trunkDark);
  // Trunk highlight
  pr(ctx, x - 1 * s, y - 6 * s, 2 * s, 10 * s, P.trunk);

  // Canopy — big round pom-pom (single large circle + smaller bumps)
  const drawPom = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Shadow underneath canopy
  drawPom(x + 1 * s, y - 12 * s, 14 * s, P.canopyShadow);
  // Main big pom-pom
  drawPom(x, y - 14 * s, 14 * s, P.canopy1);
  // Bumpy top poms
  drawPom(x - 6 * s, y - 18 * s, 8 * s, P.canopy2);
  drawPom(x + 6 * s, y - 18 * s, 7 * s, P.canopy3);
  drawPom(x, y - 20 * s, 8 * s, P.canopy2);
  // Highlights (bright spots on top)
  drawPom(x - 3 * s, y - 20 * s, 5 * s, P.canopyHighlight);
  drawPom(x + 4 * s, y - 16 * s, 4 * s, P.canopyHighlight);
}

function drawSmallTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawTree(ctx, x, y, 0.55);
}

// ─── Bush: small round pom-pom shrub ────────────────────────────────
function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main bush body
  ctx.fillStyle = P.canopy1;
  ctx.beginPath();
  ctx.arc(x, y - 3, 8, 0, Math.PI * 2);
  ctx.fill();
  // Top bump
  ctx.fillStyle = P.canopy3;
  ctx.beginPath();
  ctx.arc(x - 2, y - 6, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.canopyHighlight;
  ctx.beginPath();
  ctx.arc(x + 2, y - 5, 4, 0, Math.PI * 2);
  ctx.fill();
  // Tiny flower on bush
  const v = th(Math.round(x), Math.round(y));
  if (v < 300) {
    pr(ctx, x - 1, y - 7, 2, 2, P.grassFlower1);
  }
}

// ─── Scatter decoration positions ───────────────────────────────────
interface Deco { type: "tree" | "smalltree" | "bush"; x: number; y: number }

const DECOS: Deco[] = (() => {
  const d: Deco[] = [];
  // Trees around map edges
  const treePts: [number, number][] = [
    [25, 40], [65, 30], [15, 90], [90, 60],
    [730, 30], [760, 55], [780, 90], [700, 45],
    [20, 530], [55, 560], [90, 545], [740, 540], [770, 565], [695, 555],
    [15, 180], [30, 330], [20, 440],
    [775, 180], [770, 350], [780, 470],
    [310, 15], [520, 10], [620, 15],
    [200, 575], [400, 580], [580, 575],
  ];
  for (const [x, y] of treePts) d.push({ type: "tree", x, y });

  // Small trees near paths
  const stPts: [number, number][] = [
    [160, 195], [275, 145], [335, 95], [560, 95],
    [745, 200], [745, 410], [160, 370], [275, 460],
    [440, 470], [630, 455], [335, 355],
  ];
  for (const [x, y] of stPts) d.push({ type: "smalltree", x, y });

  // Bushes near buildings
  const bushPts: [number, number][] = [
    [95, 115], [225, 105], [555, 95], [725, 105],
    [95, 395], [225, 500], [445, 440], [605, 415],
    [595, 305], [250, 295], [455, 195],
  ];
  for (const [x, y] of bushPts) d.push({ type: "bush", x, y });

  return d;
})();

function drawDecorations(ctx: CanvasRenderingContext2D) {
  for (const d of DECOS) {
    if (d.type === "tree") drawTree(ctx, d.x, d.y);
    else if (d.type === "smalltree") drawSmallTree(ctx, d.x, d.y);
    else drawBush(ctx, d.x, d.y);
  }
}

// ─── Buildings: each themed to its real-world counterpart ───────────

function drawBuildingTopDown(ctx: CanvasRenderingContext2D, loc: LocationData) {
  // Dispatch to themed renderer
  switch (loc.name) {
    case "The Colosseum": return drawColosseum(ctx, loc);
    case "DRiP Gallery": return drawGallery(ctx, loc);
    case "Validators' Café": return drawCafe(ctx, loc);
    case "Solana HQ": return drawSolanaHQ(ctx, loc);
    case "Helius Labs": return drawHeliusLabs(ctx, loc);
    case "Dev Hub": return drawDevHub(ctx, loc);
    case "Learning Center": return drawLearningCenter(ctx, loc);
    case "Press Room": return drawPressRoom(ctx, loc);
    default: return drawGenericBuilding(ctx, loc);
  }
}

// Helper: draw a standard rectangular building shell (thick dark walls + floor + door)
function drawBuildingShell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, roofColor: string, floorColor: string) {
  const wallT = 6; // Thick dark brown walls (JRPG style)
  // Shadow
  ctx.fillStyle = P.shadow;
  ctx.fillRect(x + 4, y + 4, w, h);
  // Outer wall — thick dark brown
  pr(ctx, x, y, w, h, P.wallOuter);
  // Inner wall highlight
  pr(ctx, x + 1, y + 1, w - 2, h - 2, P.wallInner);
  // Inner dark wall
  pr(ctx, x + 2, y + 2, w - 4, h - 4, P.wallOuter);
  // Inner floor
  pr(ctx, x + wallT, y + wallT, w - wallT * 2, h - wallT * 2, floorColor);

  // Wood plank floor pattern (horizontal lines)
  const isWood = floorColor === P.floorWood;
  const isTile = floorColor === P.floorTile;
  const isCarpet = floorColor === P.floorCarpet;
  const ix = x + wallT, iy = y + wallT, iw = w - wallT * 2, ih = h - wallT * 2;

  if (isWood) {
    // Horizontal plank lines
    for (let fy = iy; fy < iy + ih; fy += 6) {
      pr(ctx, ix, fy, iw, 1, P.floorWoodDark);
      // Alternating light/dark planks
      if ((fy - iy) % 12 < 6) {
        pr(ctx, ix, fy + 1, iw, 5, P.floorWoodLight);
      }
      // Knot detail
      const v = th(fy * 7, 123);
      if (v < 100) pr(ctx, ix + (v % iw), fy + 2, 2, 2, P.floorWoodDark);
    }
  } else if (isTile) {
    // Checkerboard tile pattern
    for (let fy = iy; fy < iy + ih; fy += 8) {
      for (let fx = ix; fx < ix + iw; fx += 8) {
        if (((fx - ix) / 8 + (fy - iy) / 8) % 2 === 0) {
          pr(ctx, fx, fy, 8, 8, P.floorTileLight);
        }
        // Grout lines
        pr(ctx, fx, fy, 8, 1, "#a0b0b8");
        pr(ctx, fx, fy, 1, 8, "#a0b0b8");
      }
    }
  } else if (isCarpet) {
    // Carpet with border pattern
    pr(ctx, ix + 2, iy + 2, iw - 4, ih - 4, P.floorCarpetLight);
    pr(ctx, ix + 4, iy + 4, iw - 8, ih - 8, P.floorCarpet);
  }

  // Door — gap in bottom wall with doorstep
  const doorX = x + Math.floor(w / 2) - 7;
  pr(ctx, doorX, y + h - wallT, 14, wallT, floorColor);
  // Doorstep (stone/beige step outside)
  pr(ctx, doorX - 1, y + h, 16, 4, P.doorstep);
  pr(ctx, doorX, y + h + 1, 14, 2, P.pathLight);
}

function drawBuildingLabel(ctx: CanvasRenderingContext2D, name: string, cx: number, bottomY: number) {
  ctx.font = "bold 8px sans-serif";
  const tw = ctx.measureText(name).width + 8;
  // Background plate
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2, bottomY + 7, tw, 13, 2);
  ctx.fill();
  // Text
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(name, cx, bottomY + 17);
}

// ─── The Colosseum: circular arena with tiered seating ──────────────
function drawColosseum(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const cx = loc.x + loc.width / 2;
  const cy = loc.y + loc.height / 2;
  const rx = loc.width / 2;
  const ry = loc.height / 2;

  // Shadow
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + 4, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer wall (thick dark brown like buildings)
  ctx.fillStyle = P.wallOuter;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner wall ring
  ctx.fillStyle = P.wallInner;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 2, ry - 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Seating area (stone)
  ctx.fillStyle = "#c0a878";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 6, ry - 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner seating tiers
  const tiers = [
    { rx: rx * 0.75, ry: ry * 0.75, color: "#b09868" },
    { rx: rx * 0.6, ry: ry * 0.6, color: "#c8b080" },
  ];
  for (const tier of tiers) {
    ctx.fillStyle = tier.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, tier.rx, tier.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Seats (pixel-art colored blocks)
  const seatColors = [P.chair, P.chairAlt, "#d0a830", "#40a050"];
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    for (let tierIdx = 0; tierIdx < 2; tierIdx++) {
      const sr = rx * (0.55 + tierIdx * 0.15);
      const srY = ry * (0.55 + tierIdx * 0.15);
      const sx = cx + Math.cos(angle) * sr - 2;
      const sy = cy + Math.sin(angle) * srY - 2;
      pr(ctx, sx, sy, 4, 3, seatColors[(tierIdx + Math.floor(angle * 3)) % seatColors.length]);
    }
  }

  // Central arena floor (sand)
  ctx.fillStyle = "#dcc898";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.35, ry * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Central podium
  pr(ctx, cx - 6, cy - 4, 12, 8, P.desk);
  pr(ctx, cx - 4, cy - 2, 8, 4, P.deskTop);

  // Archway openings (gaps in thick wall)
  const archColor = "#dcc898";
  pr(ctx, cx - 7, loc.y - 1, 14, 8, archColor);
  pr(ctx, cx - 7, loc.y + loc.height - 7, 14, 8, archColor);
  pr(ctx, loc.x - 1, cy - 6, 8, 12, archColor);
  pr(ctx, loc.x + loc.width - 7, cy - 6, 8, 12, archColor);

  drawBuildingLabel(ctx, loc.name, cx, loc.y + loc.height);
}

// ─── DRiP Gallery: art gallery with paintings on walls ──────────────
function drawGallery(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofGray, P.floorWood);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;

  // Art frames along top wall (colorful pixel-art paintings)
  const artColors = ["#e03030", "#2060d0", "#30a830", "#e8a018", "#9030b0", "#e06818"];
  for (let i = 0; i < Math.min(4, Math.floor(iw / 22)); i++) {
    const ax = ix + 4 + i * 22;
    pr(ctx, ax, iy + 1, 16, 14, P.wallDark); // frame border
    pr(ctx, ax + 1, iy + 2, 14, 12, "#d8d0c0"); // frame mat
    pr(ctx, ax + 2, iy + 3, 12, 10, artColors[i % artColors.length]); // painting
    // Painting detail (simple pixel shapes)
    pr(ctx, ax + 5, iy + 5, 4, 4, "rgba(255,255,255,0.3)");
  }

  // Art frames along bottom wall
  for (let i = 0; i < Math.min(4, Math.floor(iw / 22)); i++) {
    const ax = ix + 4 + i * 22;
    pr(ctx, ax, iy + ih - 16, 16, 14, P.wallDark);
    pr(ctx, ax + 1, iy + ih - 15, 14, 12, "#d8d0c0");
    pr(ctx, ax + 2, iy + ih - 14, 12, 10, artColors[(i + 3) % artColors.length]);
  }

  // Central viewing bench
  pr(ctx, ix + iw / 2 - 10, iy + ih / 2, 20, 4, "#686868");
  pr(ctx, ix + iw / 2 - 8, iy + ih / 2 + 1, 16, 2, "#888888");

  // Potted plant in corner
  pr(ctx, ix + iw - 8, iy + 2, 6, 4, P.plantPot);
  pr(ctx, ix + iw - 7, iy - 2, 4, 4, P.plant);
  pr(ctx, ix + iw - 9, iy - 4, 2, 3, P.plant);

  // Sculpture pedestal
  pr(ctx, ix + 2, iy + ih / 2 - 4, 8, 8, "#c8c0b8");
  pr(ctx, ix + 3, iy + ih / 2 - 7, 6, 4, "#a090b8");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Validators' Café: cozy café with counter, tables, chairs ───────
function drawCafe(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBrown, P.floorWood);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;

  // Long counter along top wall
  pr(ctx, ix + 2, iy + 2, iw - 4, 12, P.counter);
  pr(ctx, ix + 3, iy + 3, iw - 6, 10, P.deskTop);
  // Coffee machine
  pr(ctx, ix + 4, iy + 3, 8, 8, "#383838");
  pr(ctx, ix + 5, iy + 4, 6, 4, "#c03020"); // red panel
  pr(ctx, ix + 6, iy + 5, 4, 2, "#f0a020"); // light
  // Cups on counter
  pr(ctx, ix + 16, iy + 5, 3, 4, "#f0f0f0");
  pr(ctx, ix + 22, iy + 5, 3, 4, "#e0d0b0");

  // Bar stools
  for (let i = 0; i < Math.min(3, Math.floor(iw / 20)); i++) {
    const sx = ix + 14 + i * 18;
    ctx.fillStyle = P.trunk;
    ctx.beginPath();
    ctx.arc(sx, iy + 18, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Round tables with chairs
  const tables: [number, number][] = [
    [ix + 6, iy + ih / 2 + 4],
    [ix + iw / 2 - 4, iy + ih / 2 + 4],
    [ix + iw - 16, iy + ih / 2 + 4],
  ];
  for (const [tx, ty] of tables) {
    ctx.fillStyle = P.table;
    ctx.beginPath();
    ctx.arc(tx + 5, ty + 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.deskTop;
    ctx.beginPath();
    ctx.arc(tx + 5, ty + 3, 4, 0, Math.PI * 2);
    ctx.fill();
    // Cup on table
    pr(ctx, tx + 3, ty, 3, 3, "#f0f0f0");
    // Chairs (pixel rectangles)
    pr(ctx, tx - 4, ty, 4, 4, P.chair);
    pr(ctx, tx + 11, ty, 4, 4, P.chairAlt);
  }

  // Rug under tables
  pr(ctx, ix + 2, iy + ih / 2 - 2, iw - 4, ih / 2 - 2, P.rug);
  pr(ctx, ix + 3, iy + ih / 2 - 1, iw - 6, ih / 2 - 4, P.rugLight);

  // Menu board on left wall
  pr(ctx, ix + 1, iy + 14, 8, 14, "#282828");
  for (let l = 0; l < 4; l++) {
    pr(ctx, ix + 2, iy + 16 + l * 3, 6, 1, "#e8e8e8");
  }

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Solana HQ: modern office with server racks and monitors ────────
function drawSolanaHQ(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBlue, P.floorTile);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;

  // Room divider (vertical wall)
  const divX = ix + Math.floor(iw * 0.6);
  pr(ctx, divX, iy, 4, ih, P.wallOuter);
  pr(ctx, divX + 1, iy, 2, ih, P.wallInner);

  // Left room: desks with monitors
  for (let r = 0; r < Math.min(3, Math.floor(ih / 28)); r++) {
    for (let c = 0; c < 2; c++) {
      const dx = ix + 4 + c * 28;
      const dy = iy + 6 + r * 26;
      pr(ctx, dx, dy, 22, 10, P.desk);
      pr(ctx, dx + 1, dy + 1, 20, 8, P.deskTop);
      // Monitor (pixel art)
      pr(ctx, dx + 6, dy - 3, 10, 6, "#181820");
      pr(ctx, dx + 7, dy - 2, 8, 4, "#38c888"); // Solana green screen
      // Monitor stand
      pr(ctx, dx + 10, dy + 3, 2, 2, "#303030");
      // Chair
      pr(ctx, dx + 7, dy + 12, 6, 5, P.chairAlt);
    }
  }

  // Right room: server racks
  const srx = divX + 8;
  const srw = iw - (divX - ix) - 12;
  for (let r = 0; r < Math.min(3, Math.floor(ih / 24)); r++) {
    const sy = iy + 4 + r * 22;
    pr(ctx, srx, sy, srw, 16, "#383848"); // rack body
    pr(ctx, srx + 1, sy + 1, srw - 2, 14, "#404858"); // rack front
    // LED rows
    for (let led = 0; led < Math.min(4, Math.floor(srw / 7)); led++) {
      pr(ctx, srx + 3 + led * 6, sy + 3, 3, 2, "#38e888");
      pr(ctx, srx + 3 + led * 6, sy + 7, 3, 2, "#38c868");
      pr(ctx, srx + 3 + led * 6, sy + 11, 3, 2, "#38e888");
    }
  }

  // Solana logo hint (green diamond)
  pr(ctx, ix + iw / 4 - 3, iy + ih - 10, 8, 8, "#38c888");
  pr(ctx, ix + iw / 4 - 1, iy + ih - 8, 4, 4, "#48e8a0");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Helius Labs: tech lab with dashboards and equipment ────────────
function drawHeliusLabs(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofTeal, P.floorTile);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;

  // Large dashboard screens along top wall
  pr(ctx, ix + 2, iy + 2, iw - 4, 16, "#141820"); // screen panel
  pr(ctx, ix + 3, iy + 3, iw - 6, 14, "#1a2028"); // screen surface
  // Bar chart visualization
  for (let i = 0; i < Math.min(6, Math.floor(iw / 14)); i++) {
    const bh = 4 + (th(i * 100, 0) % 9);
    pr(ctx, ix + 6 + i * 13, iy + 15 - bh, 8, bh, i % 2 === 0 ? "#38a0d0" : "#58d0a0");
  }

  // Lab benches with equipment
  for (let r = 0; r < Math.min(2, Math.floor((ih - 20) / 26)); r++) {
    const dy = iy + 24 + r * 26;
    pr(ctx, ix + 4, dy, iw - 8, 10, "#808898"); // metal bench
    pr(ctx, ix + 5, dy + 1, iw - 10, 8, "#909aa8"); // bench top
    // Equipment (monitors on bench)
    for (let m = 0; m < Math.min(3, Math.floor(iw / 28)); m++) {
      pr(ctx, ix + 8 + m * 26, dy - 4, 10, 6, "#181828");
      pr(ctx, ix + 9 + m * 26, dy - 3, 8, 4, "#38a078");
    }
    // Chairs
    pr(ctx, ix + 10, dy + 12, 5, 5, P.chairAlt);
    pr(ctx, ix + iw - 20, dy + 12, 5, 5, P.chairAlt);
  }

  // Server rack in corner
  pr(ctx, ix + iw - 14, iy + ih - 20, 12, 18, "#383848");
  pr(ctx, ix + iw - 12, iy + ih - 18, 2, 2, "#38e888");
  pr(ctx, ix + iw - 12, iy + ih - 14, 2, 2, "#e83838");
  pr(ctx, ix + iw - 8, iy + ih - 18, 2, 2, "#38e888");

  // Potted plant
  pr(ctx, ix + 2, iy + ih - 8, 6, 4, P.plantPot);
  pr(ctx, ix + 3, iy + ih - 12, 4, 5, P.plant);

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Dev Hub: open workspace with laptop stations ───────────────────
function drawDevHub(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofGray, P.floorWood);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;

  // Long communal tables
  for (let r = 0; r < Math.min(3, Math.floor(ih / 28)); r++) {
    const dy = iy + 6 + r * 28;
    pr(ctx, ix + 4, dy, iw - 8, 10, P.desk);
    pr(ctx, ix + 5, dy + 1, iw - 10, 8, P.deskTop);
    // Laptops on table (pixel art)
    for (let l = 0; l < Math.min(3, Math.floor(iw / 26)); l++) {
      const lx = ix + 10 + l * 24;
      pr(ctx, lx, dy + 1, 10, 6, "#303038"); // laptop base
      pr(ctx, lx + 1, dy + 2, 8, 4, "#4080cc"); // screen
      pr(ctx, lx + 3, dy + 3, 4, 2, "#60a0e0"); // screen glare
    }
    // Chairs on both sides
    for (let c = 0; c < Math.min(3, Math.floor(iw / 28)); c++) {
      pr(ctx, ix + 8 + c * 24, dy - 6, 5, 5, P.chair);
      pr(ctx, ix + 8 + c * 24, dy + 12, 5, 5, P.chairAlt);
    }
  }

  // Whiteboard on left wall
  pr(ctx, ix + 1, iy + 2, 4, ih - 4, "#e8e8e8");
  pr(ctx, ix + 1, iy + 3, 3, ih - 6, "#f4f4f4");
  // Sticky notes (pixel squares)
  pr(ctx, ix + 1, iy + 6, 3, 3, "#f0e040");
  pr(ctx, ix + 1, iy + 12, 3, 3, "#40c0f0");
  pr(ctx, ix + 1, iy + 18, 3, 3, "#f08080");
  pr(ctx, ix + 1, iy + 24, 3, 3, "#80e080");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Learning Center: classroom with rows and whiteboard ────────────
function drawLearningCenter(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBrown, P.floorWood);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;

  // Big whiteboard at top
  pr(ctx, ix + 4, iy + 2, iw - 8, 14, "#d8d8d8"); // frame
  pr(ctx, ix + 5, iy + 3, iw - 10, 12, "#f0f0f0"); // board surface
  // Writing on whiteboard (pixel art scribbles)
  for (let l = 0; l < 3; l++) {
    pr(ctx, ix + 8, iy + 5 + l * 4, 18 + (l * 6), 1, "#3058a0");
  }
  // Red circle diagram
  pr(ctx, ix + iw - 20, iy + 5, 8, 8, "#d03030");

  // Student desks in rows
  for (let r = 0; r < Math.min(3, Math.floor((ih - 22) / 22)); r++) {
    for (let c = 0; c < Math.min(3, Math.floor(iw / 28)); c++) {
      const dx = ix + 6 + c * 28;
      const dy = iy + 22 + r * 22;
      pr(ctx, dx, dy, 20, 8, P.desk);
      pr(ctx, dx + 1, dy + 1, 18, 6, P.deskTop);
      pr(ctx, dx + 6, dy + 10, 6, 5, P.chairAlt);
    }
  }

  // Bookshelf on right wall (with colored books)
  pr(ctx, ix + iw - 10, iy + 18, 8, ih - 22, P.bookshelf);
  for (let b = 0; b < Math.min(6, Math.floor((ih - 22) / 7)); b++) {
    pr(ctx, ix + iw - 9, iy + 20 + b * 7, 6, 5, P.bookColors[b % P.bookColors.length]);
  }

  // Potted plant near door
  pr(ctx, ix + iw - 10, iy + ih - 8, 6, 4, P.plantPot);
  pr(ctx, ix + iw - 9, iy + ih - 12, 4, 5, P.plant);

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Press Room: podium with press chairs ───────────────────────────
function drawPressRoom(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBlue, P.floorCarpet);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;
  const cx2 = ix + iw / 2;

  // Backdrop banner (blue with lighter stripe)
  pr(ctx, ix + 2, iy + 1, iw - 4, 4, "#2858a0");
  pr(ctx, ix + 4, iy + 2, iw - 8, 2, "#3870c0");

  // Podium at top
  pr(ctx, cx2 - 12, iy + 5, 24, 14, P.desk);
  pr(ctx, cx2 - 10, iy + 6, 20, 12, P.deskTop);
  // Microphone
  pr(ctx, cx2 - 1, iy + 3, 2, 5, "#484848");
  pr(ctx, cx2 - 2, iy + 2, 4, 2, "#585858");

  // Press chairs in rows
  for (let r = 0; r < Math.min(2, Math.floor((ih - 24) / 14)); r++) {
    for (let c = 0; c < Math.min(3, Math.floor(iw / 18)); c++) {
      pr(ctx, ix + 4 + c * 18, iy + 24 + r * 14, 10, 7, P.chair);
      pr(ctx, ix + 5 + c * 18, iy + 25 + r * 14, 8, 5, "#d05848");
    }
  }

  // Camera on tripod
  pr(ctx, ix + iw - 10, iy + ih - 12, 8, 8, "#383838");
  pr(ctx, ix + iw - 8, iy + ih - 14, 2, 4, "#484848"); // lens
  // Tripod legs
  pr(ctx, ix + iw - 10, iy + ih - 4, 2, 4, "#505050");
  pr(ctx, ix + iw - 4, iy + ih - 4, 2, 4, "#505050");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Generic building fallback ──────────────────────────────────────
function drawGenericBuilding(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofGray, P.floorWood);

  const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;
  // Generic furniture
  pr(ctx, ix + 4, iy + 4, iw - 8, 8, P.desk);
  pr(ctx, ix + 5, iy + 5, iw - 10, 6, P.deskTop);
  pr(ctx, ix + iw / 2 - 3, iy + 14, 6, 5, P.chair);

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Outdoor locations ─────────────────────────────────────────────
function drawOutdoor(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (loc.name === "Town Square") {
    // Cobblestone plaza — neat brick pattern (JRPG style)
    for (let ty2 = y; ty2 < y + h; ty2 += 8) {
      for (let tx2 = x; tx2 < x + w; tx2 += 8) {
        const v = th(tx2 + 500, ty2 + 500);
        const offset = (Math.floor((ty2 - y) / 8) % 2) * 4;
        const c = v < 300 ? "#d0b888" : v < 600 ? "#c0a878" : "#dcc898";
        pr(ctx, tx2 + offset, ty2, 8, 8, c);
        // Grout lines
        pr(ctx, tx2 + offset, ty2, 8, 1, "#a08858");
        pr(ctx, tx2 + offset, ty2, 1, 8, "#a08858");
      }
    }

    // Fountain in center (stone circle with water)
    // Outer stone ring
    ctx.fillStyle = "#909898";
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    // Inner stone
    ctx.fillStyle = "#a8a8b0";
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    // Water
    ctx.fillStyle = P.water;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    // Water highlight
    ctx.fillStyle = P.waterLight;
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 3, 6, 0, Math.PI * 2);
    ctx.fill();
    // Center pillar
    pr(ctx, cx - 2, cy - 12, 4, 10, "#808890");
    pr(ctx, cx - 3, cy - 14, 6, 3, "#909898");
    // Water splash particles
    pr(ctx, cx - 5, cy - 8, 2, 2, P.waterLight);
    pr(ctx, cx + 4, cy - 6, 2, 2, P.waterLight);

    drawBuildingLabel(ctx, "Town Square", cx, y + h);

  } else if (loc.name === "Consensus Park") {
    // Slightly brighter grass
    pr(ctx, x, y, w, h, P.grass3);
    // Small flower patches
    for (let fy = y + 4; fy < y + h - 4; fy += 10) {
      for (let fx = x + 4; fx < x + w - 4; fx += 10) {
        const v = th(fx + 999, fy + 999);
        if (v < 80) pr(ctx, fx, fy, 3, 3, P.grassFlower1);
        if (v > 920) pr(ctx, fx, fy, 3, 3, P.grassFlower3);
        if (v > 800 && v < 830) pr(ctx, fx, fy, 2, 2, "#ffee44"); // yellow flowers
      }
    }

    // Park trees
    drawSmallTree(ctx, x + 16, cy - 8);
    drawSmallTree(ctx, x + w - 16, cy - 8);
    drawSmallTree(ctx, cx, y + 14);

    // Bench (wooden, pixel art)
    pr(ctx, cx - 12, cy + 8, 24, 3, P.trunk);
    pr(ctx, cx - 12, cy + 5, 2, 3, P.trunkDark); // leg
    pr(ctx, cx + 10, cy + 5, 2, 3, P.trunkDark); // leg
    pr(ctx, cx - 12, cy + 11, 2, 3, P.trunkDark); // back leg
    pr(ctx, cx + 10, cy + 11, 2, 3, P.trunkDark);
    // Bench back
    pr(ctx, cx - 12, cy + 4, 24, 2, P.trunk);

    // Stone path through park
    for (let px = x; px < x + w; px += 8) {
      const v = th(px + 400, cy);
      const c = v < 500 ? P.path : P.pathLight;
      pr(ctx, px, cy - 4, 8, 8, c);
    }

    drawBuildingLabel(ctx, "Consensus Park", cx, y + h);
  }
}

// ─── Agent Sprite: chibi character (larger, more detailed) ──────────
function drawAgent(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  agent: AgentData,
  tick: number,
  isSelected: boolean,
) {
  const name = agent.name.split(" ")[0];
  const colors = AGENT_SPRITES[name] || DEFAULT_SPRITE;
  const walking = agent.status === "walking";

  // Walk bob
  const bob = walking ? (Math.floor(tick / 4) % 2) * -1 : 0;
  const sy = y + bob;

  // Shadow (bigger for chibi)
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + 7, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Selection indicator — bouncing triangle
  if (isSelected) {
    const bounce = Math.sin(tick * 0.2) * 2;
    ctx.fillStyle = "#ffdd00";
    ctx.beginPath();
    ctx.moveTo(x, sy - 26 + bounce);
    ctx.lineTo(x - 4, sy - 31 + bounce);
    ctx.lineTo(x + 4, sy - 31 + bounce);
    ctx.fill();
    // Arrow outline
    ctx.strokeStyle = "#aa8800";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, sy - 26 + bounce);
    ctx.lineTo(x - 4, sy - 31 + bounce);
    ctx.lineTo(x + 4, sy - 31 + bounce);
    ctx.closePath();
    ctx.stroke();
  }

  // Feet/shoes
  if (walking) {
    const step = Math.floor(tick / 4) % 2;
    pr(ctx, x - 3 + (step ? 2 : -1), sy + 3, 3, 3, "#3a2a18");
    pr(ctx, x + 1 + (step ? -1 : 2), sy + 3, 3, 3, "#3a2a18");
  } else {
    pr(ctx, x - 3, sy + 3, 3, 3, "#3a2a18");
    pr(ctx, x + 1, sy + 3, 3, 3, "#3a2a18");
  }

  // Legs
  pr(ctx, x - 2, sy + 1, 2, 4, "#404858");
  pr(ctx, x + 1, sy + 1, 2, 4, "#404858");

  // Torso (shirt) — wider for chibi
  pr(ctx, x - 5, sy - 5, 10, 7, colors.shirt);
  // Shirt highlight
  pr(ctx, x - 4, sy - 4, 3, 5, "rgba(255,255,255,0.15)");

  // Arms
  pr(ctx, x - 6, sy - 4, 2, 5, colors.shirt);
  pr(ctx, x + 5, sy - 4, 2, 5, colors.shirt);
  // Hands (skin)
  pr(ctx, x - 6, sy + 1, 2, 2, "#f0c8a0");
  pr(ctx, x + 5, sy + 1, 2, 2, "#f0c8a0");

  // Head (skin — larger for chibi proportions)
  ctx.fillStyle = "#f0c8a0";
  ctx.beginPath();
  ctx.arc(x, sy - 10, 5.5, 0, Math.PI * 2);
  ctx.fill();
  // Head outline
  ctx.strokeStyle = "#c09870";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(x, sy - 10, 5.5, 0, Math.PI * 2);
  ctx.stroke();

  // Eyes (tiny dots — chibi style)
  pr(ctx, x - 2, sy - 10, 2, 2, "#202020");
  pr(ctx, x + 1, sy - 10, 2, 2, "#202020");
  // Eye shine
  pr(ctx, x - 2, sy - 11, 1, 1, "#ffffff");
  pr(ctx, x + 1, sy - 11, 1, 1, "#ffffff");

  // Hair (bigger, covers top of head)
  ctx.fillStyle = colors.hair;
  ctx.beginPath();
  ctx.arc(x, sy - 12, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  // Side hair tufts
  pr(ctx, x - 6, sy - 13, 2, 5, colors.hair);
  pr(ctx, x + 5, sy - 13, 2, 5, colors.hair);
  // Top hair
  pr(ctx, x - 4, sy - 16, 8, 3, colors.hair);

  // Name label below (JRPG style)
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.font = "bold 7px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, x, y + 14);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, x - 0.5, y + 13.5);
}

// ─── Speech Bubble: white rounded with "..." text (JRPG style) ──────
function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  agent: AgentData,
  tick: number,
) {
  if (agent.status !== "talking" && agent.status !== "reflecting" && agent.status !== "planning") return;

  const isThinking = agent.status === "reflecting" || agent.status === "planning";

  // Bubble dimensions — slightly larger for chibi
  const bw = 32;
  const bh = 16;
  const bx = x - bw / 2;
  const by = y - 36;

  // White rounded bubble (JRPG style)
  ctx.fillStyle = P.bubbleBg;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.fill();
  ctx.strokeStyle = P.bubbleBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.stroke();

  // Pointer triangle
  ctx.fillStyle = P.bubbleBg;
  ctx.beginPath();
  ctx.moveTo(x - 4, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 4, by + bh);
  ctx.fill();
  ctx.strokeStyle = P.bubbleBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 4, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 4, by + bh);
  ctx.stroke();
  // Cover gap
  pr(ctx, x - 4, by + bh - 1, 9, 2, P.bubbleBg);

  // Text: "..." animated dots (clean JRPG style)
  ctx.fillStyle = P.textDark;
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";

  if (isThinking) {
    const phase = Math.floor(tick / 8) % 4;
    const dots = ".".repeat(phase || 1);
    ctx.fillText(dots, x, by + 12);
  } else {
    // Talking — animated dots or speech indicator
    const phase = Math.floor(tick / 6) % 3;
    const dots = ".".repeat(phase + 1);
    ctx.fillText(dots, x, by + 12);
  }
}

// ─── Conversation callout: white box with dialogue ─────────────────
function drawConvoCallout(
  ctx: CanvasRenderingContext2D,
  convo: ConvoData,
  agents: Record<string, AgentData>,
) {
  if (convo.messages.length === 0) return;

  const a1 = agents[convo.participants[0]];
  const a2 = agents[convo.participants[1]];
  if (!a1 || !a2) return;

  // Show last 2 messages
  const msgs = convo.messages.slice(-2);
  const lines: string[] = [];
  for (const m of msgs) {
    const speaker = m.agentName.split(" ")[0];
    const text = m.content.slice(0, 40) + (m.content.length > 40 ? "..." : "");
    lines.push(`[${speaker}]: ${text}`);
  }

  // Position — below the midpoint
  const mx = (a1.position.x + a2.position.x) / 2;
  const my = Math.max(a1.position.y, a2.position.y) + 20;

  ctx.font = "8px sans-serif";
  const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = Math.min(maxLineW + 16, 220);
  const boxH = lines.length * 13 + 10;
  const bx = Math.max(4, Math.min(796 - boxW, mx - boxW / 2));
  const by = Math.max(4, Math.min(596 - boxH, my));

  // White box with border
  ctx.fillStyle = P.bubbleBg;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 3);
  ctx.fill();
  ctx.strokeStyle = P.bubbleBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 3);
  ctx.stroke();

  // Lines connector to agents
  ctx.strokeStyle = "#a0a0a0";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(bx + boxW / 2, by);
  ctx.lineTo(mx, my - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // Text
  ctx.fillStyle = P.textDark;
  ctx.font = "8px sans-serif";
  ctx.textAlign = "left";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + 6, by + 12 + i * 13, boxW - 12);
  }
}

// ─── Utility ────────────────────────────────────────────────────────

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ─── Component ──────────────────────────────────────────────────────

export default function Home() {
  const [world, setWorld] = useState<WorldSnapshot | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvoData[]>([]);
  const [convoHistory, setConvoHistory] = useState<ConvoData[]>([]);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [solPrice, setSolPrice] = useState<{ price: number; change: number | null } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tickRef = useRef(0);

  // Connect WebSocket
  useEffect(() => {
    let ws: WebSocket;
    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "world_snapshot") {
          setWorld(data.data);
          setConversations(data.data.activeConversations || []);
        } else if (data.type === "price_update") {
          setSolPrice({ price: data.data.price, change: data.data.change });
        } else if (
          data.type === "conversation_start" ||
          data.type === "conversation_message" ||
          data.type === "conversation_end"
        ) {
          fetch(`${API_URL}/api/world`)
            .then((r) => r.json())
            .then((w) => {
              setWorld(w);
              setConversations(w.activeConversations || []);
            });
          fetch(`${API_URL}/api/conversations/all`)
            .then((r) => r.json())
            .then(setConvoHistory);
        }
      };

      ws.onclose = () => {
        setTimeout(connect, 3000);
      };
    }

    connect();

    fetch(`${API_URL}/api/world`)
      .then((r) => r.json())
      .then((w) => {
        setWorld(w);
        setConversations(w.activeConversations || []);
      })
      .catch(console.error);
    fetch(`${API_URL}/api/conversations/all`)
      .then((r) => r.json())
      .then(setConvoHistory)
      .catch(console.error);
    fetch(`${API_URL}/api/sim/status`)
      .then((r) => r.json())
      .then((s) => { setPaused(s.paused); setSpeed(s.speed); })
      .catch(console.error);

    return () => ws?.close();
  }, []);

  // ─── Draw Pipeline (painter's algorithm matching paper) ───────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    tickRef.current++;
    const tick = tickRef.current;

    ctx.imageSmoothingEnabled = false;

    // 1. Bright green grass background
    drawGrass(ctx);

    // 2. Sandy paths connecting locations
    drawPaths(ctx, world.locations);

    // 3. Decorations (trees, bushes)
    drawDecorations(ctx);

    // 4. Buildings (top-down with interiors) & outdoor locations
    for (const loc of world.locations) {
      if (loc.type === "outdoor") {
        drawOutdoor(ctx, loc);
      } else {
        drawBuildingTopDown(ctx, loc);
      }
    }

    // 5. Conversation connector lines
    for (const convo of conversations) {
      if (convo.participants.length >= 2) {
        const a1 = world.agents[convo.participants[0]];
        const a2 = world.agents[convo.participants[1]];
        if (a1 && a2) {
          ctx.strokeStyle = "rgba(180,180,200,0.5)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -(tick % 16);
          ctx.beginPath();
          ctx.moveTo(a1.position.x, a1.position.y);
          ctx.lineTo(a2.position.x, a2.position.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // 6. Agent sprites
    for (const [id, agent] of Object.entries(world.agents)) {
      drawAgent(ctx, agent.position.x, agent.position.y, agent, tick, id === selectedAgent);
    }

    // 7. Speech bubbles (on top of agents)
    for (const [, agent] of Object.entries(world.agents)) {
      drawBubble(ctx, agent.position.x, agent.position.y, agent, tick);
    }

    // 8. Conversation callout text boxes
    for (const convo of conversations) {
      drawConvoCallout(ctx, convo, world.agents);
    }

    // 9. Selected agent action tooltip
    if (selectedAgent && world.agents[selectedAgent]?.currentAction) {
      const agent = world.agents[selectedAgent];
      const text = agent.currentAction!.slice(0, 50) + (agent.currentAction!.length > 50 ? "..." : "");
      ctx.font = "9px sans-serif";
      const tw = ctx.measureText(text).width + 14;
      const tx = Math.max(tw / 2 + 2, Math.min(798 - tw / 2, agent.position.x));
      const ty = agent.position.y + 12;

      ctx.fillStyle = P.bubbleBg;
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, ty, tw, 16, 3);
      ctx.fill();
      ctx.strokeStyle = P.bubbleBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, ty, tw, 16, 3);
      ctx.stroke();
      ctx.fillStyle = P.textDark;
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, tx, ty + 12);
    }

    // 10. Paused overlay
    if (paused) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(330, 272, 140, 36, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", 400, 297);
    }
  }, [world, selectedAgent, conversations, paused]);

  useEffect(() => {
    draw();
    const interval = setInterval(draw, 80);
    return () => clearInterval(interval);
  }, [draw]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!world) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    for (const [id, agent] of Object.entries(world.agents)) {
      const dx = x - agent.position.x;
      const dy = y - agent.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < 15) {
        setSelectedAgent(id);
        return;
      }
    }
    setSelectedAgent(null);
  };

  const togglePause = async () => {
    const endpoint = paused ? "resume" : "pause";
    await fetch(`${API_URL}/api/sim/${endpoint}`, { method: "POST" });
    setPaused(!paused);
  };

  const changeSpeed = async (newSpeed: number) => {
    await fetch(`${API_URL}/api/sim/speed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed: newSpeed }),
    });
    setSpeed(newSpeed);
  };

  const selectedAgentData = selectedAgent && world ? world.agents[selectedAgent] : null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1a3818" }}>
      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: "8px 16px",
          background: "#f5f0e8",
          borderBottom: "2px solid #c8b898",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 16, color: "#3a3020", fontFamily: "sans-serif", fontWeight: 700 }}>
              Solana Smallville
            </h1>
            {world && (
              <span style={{ fontSize: 12, color: "#807060" }}>
                Day {world.currentDay} &middot; {formatTime(world.currentTime)} &middot; {Object.keys(world.agents).length} agents
              </span>
            )}
            {solPrice && (
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: solPrice.change !== null && solPrice.change >= 0 ? "#16a34a" : "#dc2626",
                fontFamily: "sans-serif",
              }}>
                SOL: ${solPrice.price.toFixed(2)}
                {solPrice.change !== null && (
                  <span style={{ fontSize: 10, marginLeft: 3 }}>
                    {solPrice.change >= 0 ? "+" : ""}{solPrice.change.toFixed(2)}%
                  </span>
                )}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={togglePause}
              style={{
                padding: "4px 10px", fontSize: 11,
                border: "1px solid #c8b898", borderRadius: 3,
                background: paused ? "#d04040" : "#fff",
                color: paused ? "#fff" : "#3a3020",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <span style={{ fontSize: 10, color: "#a09080" }}>Speed:</span>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                style={{
                  padding: "2px 7px", fontSize: 10,
                  border: "1px solid #c8b898", borderRadius: 3,
                  background: speed === s ? "#5a8c3c" : "#fff",
                  color: speed === s ? "#fff" : "#807060",
                  cursor: "pointer", fontWeight: speed === s ? 700 : 400,
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 8 }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onClick={handleCanvasClick}
            style={{
              border: "2px solid #c8b898",
              borderRadius: 4,
              cursor: "pointer",
              maxWidth: "100%",
              maxHeight: "100%",
              imageRendering: "pixelated",
            }}
          />
        </div>

        {/* Legend */}
        <div style={{
          padding: "5px 16px",
          borderTop: "1px solid #c8b898",
          background: "#f5f0e8",
          display: "flex",
          gap: 14,
          fontSize: 10,
        }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 3, color: "#807060" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: color }} />
              {status}
            </div>
          ))}
          <div style={{ marginLeft: "auto", color: "#a09080", fontSize: 9 }}>
            Click agent to inspect
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 380, borderLeft: "2px solid #c8b898", display: "flex", flexDirection: "column", overflow: "hidden", background: "#1a1a1a" }}>
        <MetricsPanel apiUrl={API_URL} />
        {selectedAgentData ? (
          <AgentPanel agent={selectedAgentData} apiUrl={API_URL} />
        ) : (
          <div style={{ padding: 16, color: "#606060", fontSize: 13 }}>
            Select an agent to view details
          </div>
        )}
        <ConvoStream conversations={conversations} history={convoHistory} />
      </div>
    </div>
  );
}
