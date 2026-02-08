"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AgentPanel from "./components/AgentPanel";
import ConvoStream from "./components/ConvoStream";

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

// ─── Smallville Paper Palette (bright, warm, lime-green world) ──────
const P = {
  // Grass — bright lime greens matching the paper
  grass1: "#7ec850",
  grass2: "#6cb840",
  grass3: "#8cd860",
  grass4: "#5caa38",
  grassFlower1: "#e85858",
  grassFlower2: "#d848a0",
  grassFlower3: "#c868d0",

  // Paths — wide sandy beige
  path: "#d8c890",
  pathLight: "#e8d8a0",
  pathDark: "#c0b078",
  pathEdge: "#b8a468",

  // Building exteriors (top-down: walls seen from above)
  wallOuter: "#a89078",
  wallInner: "#d8c8a8",
  wallDark: "#887060",

  // Building interiors (floor visible from above)
  floorWood: "#d8b880",
  floorTile: "#c8d0d0",
  floorCarpet: "#b08888",

  // Furniture
  desk: "#a08050",
  deskTop: "#c8a870",
  chair: "#c05040",
  chairAlt: "#4080c0",
  bookshelf: "#805028",
  bookColors: ["#c04040", "#4080c0", "#40a040", "#c0a030", "#8040a0"],
  bed: "#e0d0c0",
  counter: "#b09060",
  table: "#a88050",

  // Roof colors per building
  roofGray: "#808890",
  roofBrown: "#907050",
  roofBlue: "#5878a8",
  roofRed: "#a85848",
  roofTeal: "#508880",

  // Trees & foliage
  trunk: "#806030",
  trunkDark: "#604020",
  canopy1: "#308830",
  canopy2: "#289028",
  canopy3: "#389838",
  canopyHighlight: "#58b848",
  canopyShadow: "#1a6820",

  // Water
  water: "#58a8d8",
  waterLight: "#78c8e8",

  // UI
  white: "#ffffff",
  black: "#000000",
  textDark: "#303030",
  bubbleBg: "#ffffff",
  bubbleBorder: "#404040",
  shadow: "rgba(0,0,0,0.15)",
};

// Per-building style
const BSTYLES: Record<string, { roof: string; floor: string; furniture: string }> = {
  "Solana HQ":        { roof: P.roofBlue,  floor: P.floorTile,   furniture: "office" },
  "DRiP Gallery":     { roof: P.roofGray,  floor: P.floorWood,   furniture: "gallery" },
  "The Colosseum":    { roof: P.roofRed,   floor: P.floorWood,   furniture: "arena" },
  "Helius Labs":      { roof: P.roofTeal,  floor: P.floorTile,   furniture: "lab" },
  "Dev Hub":          { roof: P.roofGray,  floor: P.floorWood,   furniture: "office" },
  "Learning Center":  { roof: P.roofBrown, floor: P.floorWood,   furniture: "classroom" },
  "Press Room":       { roof: P.roofBlue,  floor: P.floorCarpet, furniture: "press" },
  "Validators' Café": { roof: P.roofBrown, floor: P.floorWood,   furniture: "cafe" },
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

// ─── Grass: bright lime-green tiled background ─────────────────────
function drawGrass(ctx: CanvasRenderingContext2D) {
  // Base fill
  pr(ctx, 0, 0, 800, 600, P.grass1);

  // 8x8 tile variation for texture
  for (let ty = 0; ty < 75; ty++) {
    for (let tx = 0; tx < 100; tx++) {
      const h = th(tx, ty);
      if (h < 180) pr(ctx, tx * 8, ty * 8, 8, 8, P.grass2);
      else if (h < 280) pr(ctx, tx * 8, ty * 8, 8, 8, P.grass3);
      else if (h < 340) pr(ctx, tx * 8, ty * 8, 8, 8, P.grass4);

      // Scattered tiny details
      if (h > 950) {
        // Small flowers (like in paper — tiny red/pink dots in grass)
        const fc = h > 975 ? P.grassFlower1 : h > 965 ? P.grassFlower2 : P.grassFlower3;
        pr(ctx, tx * 8 + (h % 5), ty * 8 + ((h >> 3) % 5), 2, 2, fc);
      }
      // Tiny dark grass tufts
      if (h > 900 && h <= 950) {
        pr(ctx, tx * 8 + (h % 6), ty * 8 + ((h >> 2) % 6), 1, 2, P.grass4);
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

function drawPathRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pathW: number) {
  // Main path fill
  pr(ctx, x, y, w, h, P.path);
  // Edge darkening (1px borders)
  pr(ctx, x, y, w, 1, P.pathEdge);
  pr(ctx, x, y + h - 1, w, 1, P.pathEdge);
  pr(ctx, x, y, 1, h, P.pathEdge);
  pr(ctx, x + w - 1, y, 1, h, P.pathEdge);
  // Subtle texture
  for (let py = y; py < y + h; py += 8) {
    for (let px = x; px < x + w; px += 8) {
      const v = th(px + 300, py + 300);
      if (v < 150) pr(ctx, px + (v % 5), py + ((v >> 2) % 5), 2, 2, P.pathLight);
      if (v > 850) pr(ctx, px + (v % 4), py + ((v >> 2) % 4), 2, 1, P.pathDark);
    }
  }
}

// ─── Trees: round canopy like the paper ─────────────────────────────
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number = 1) {
  const s = size;
  // Shadow on ground
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trunk
  pr(ctx, x - 2 * s, y - 6 * s, 4 * s, 10 * s, P.trunk);
  pr(ctx, x - 1 * s, y - 6 * s, 2 * s, 10 * s, P.trunkDark);

  // Canopy — layered circles (from back to front for depth)
  const drawCanopyCircle = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Back shadow layer
  drawCanopyCircle(x + 2 * s, y - 10 * s, 11 * s, P.canopyShadow);
  // Main canopy
  drawCanopyCircle(x, y - 12 * s, 11 * s, P.canopy1);
  drawCanopyCircle(x - 4 * s, y - 14 * s, 8 * s, P.canopy2);
  drawCanopyCircle(x + 5 * s, y - 14 * s, 7 * s, P.canopy3);
  // Highlight
  drawCanopyCircle(x - 2 * s, y - 16 * s, 5 * s, P.canopyHighlight);
}

function drawSmallTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawTree(ctx, x, y, 0.6);
}

// ─── Bush: small round shrub ────────────────────────────────────────
function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = P.canopy1;
  ctx.beginPath();
  ctx.ellipse(x, y - 3, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.canopyHighlight;
  ctx.beginPath();
  ctx.ellipse(x - 1, y - 5, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
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

// Helper: draw a standard rectangular building shell (wall + floor + door)
function drawBuildingShell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, roofColor: string, floorColor: string) {
  const wallT = 4;
  // Shadow
  ctx.fillStyle = P.shadow;
  ctx.fillRect(x + 3, y + 3, w, h);
  // Roof border
  pr(ctx, x - 2, y - 2, w + 4, h + 4, roofColor);
  // Outer wall
  pr(ctx, x, y, w, h, P.wallOuter);
  // Inner floor
  pr(ctx, x + wallT, y + wallT, w - wallT * 2, h - wallT * 2, floorColor);
  // Floor texture
  for (let fy = y + wallT; fy < y + h - wallT; fy += 6) {
    for (let fx = x + wallT; fx < x + w - wallT; fx += 6) {
      const v = th(fx + 700, fy + 700);
      if (v < 150) { ctx.fillStyle = "rgba(0,0,0,0.04)"; ctx.fillRect(fx, fy, 6, 1); }
      if (v > 850) { ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(fx, fy, 1, 6); }
    }
  }
  // Door
  const doorX = x + Math.floor(w / 2) - 6;
  pr(ctx, doorX, y + h - wallT, 12, wallT, floorColor);
  pr(ctx, doorX, y + h, 12, 3, P.pathDark);
}

function drawBuildingLabel(ctx: CanvasRenderingContext2D, name: string, cx: number, bottomY: number) {
  ctx.fillStyle = P.textDark;
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, cx, bottomY + 14);
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
  ctx.ellipse(cx + 3, cy + 3, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer wall (stone-colored ellipse)
  ctx.fillStyle = "#c8b898";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer wall border arches
  ctx.strokeStyle = "#a89878";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner seating tiers (concentric ellipses)
  const tiers = [
    { rx: rx * 0.85, ry: ry * 0.85, color: "#b8a888" },
    { rx: rx * 0.7, ry: ry * 0.7, color: "#c8b898" },
    { rx: rx * 0.55, ry: ry * 0.55, color: "#a89070" },
  ];
  for (const tier of tiers) {
    ctx.fillStyle = tier.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, tier.rx, tier.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#988868";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, tier.rx, tier.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Seats (small colored rectangles along tiers)
  const seatColors = [P.chair, P.chairAlt, "#d0a840", "#50a050"];
  for (let angle = 0; angle < Math.PI * 2; angle += 0.35) {
    for (let tierIdx = 0; tierIdx < 2; tierIdx++) {
      const sr = rx * (0.6 + tierIdx * 0.15);
      const srY = ry * (0.6 + tierIdx * 0.15);
      const sx = cx + Math.cos(angle) * sr - 2;
      const sy = cy + Math.sin(angle) * srY - 2;
      pr(ctx, sx, sy, 4, 3, seatColors[(tierIdx + Math.floor(angle * 3)) % seatColors.length]);
    }
  }

  // Central arena floor (sand/dirt)
  ctx.fillStyle = "#d8c8a0";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.38, ry * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  // Central podium
  pr(ctx, cx - 6, cy - 4, 12, 8, P.desk);
  pr(ctx, cx - 4, cy - 2, 8, 4, P.deskTop);

  // Archway openings (N, S, E, W gaps in outer wall)
  const archColor = "#d8c8a0";
  pr(ctx, cx - 6, loc.y - 1, 12, 6, archColor); // North
  pr(ctx, cx - 6, loc.y + loc.height - 5, 12, 6, archColor); // South
  pr(ctx, loc.x - 1, cy - 5, 6, 10, archColor); // West
  pr(ctx, loc.x + loc.width - 5, cy - 5, 6, 10, archColor); // East

  drawBuildingLabel(ctx, loc.name, cx, loc.y + loc.height);
}

// ─── DRiP Gallery: art gallery with paintings on walls ──────────────
function drawGallery(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, "#706878", P.floorWood);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;

  // Art frames along top wall (colorful paintings)
  const artColors = ["#e04040", "#2868d0", "#40b040", "#e8a020", "#a040c0", "#e07020", "#20b0b0"];
  for (let i = 0; i < Math.min(5, Math.floor(iw / 20)); i++) {
    const ax = ix + 4 + i * 20;
    pr(ctx, ax, iy + 1, 14, 12, "#d8d0c0"); // frame
    pr(ctx, ax + 2, iy + 3, 10, 8, artColors[i % artColors.length]); // painting
    // Frame detail
    ctx.strokeStyle = "#a09880";
    ctx.lineWidth = 1;
    ctx.strokeRect(ax, iy + 1, 14, 12);
  }

  // Art frames along bottom wall
  for (let i = 0; i < Math.min(5, Math.floor(iw / 20)); i++) {
    const ax = ix + 4 + i * 20;
    pr(ctx, ax, iy + ih - 14, 14, 12, "#d8d0c0");
    pr(ctx, ax + 2, iy + ih - 12, 10, 8, artColors[(i + 3) % artColors.length]);
    ctx.strokeStyle = "#a09880";
    ctx.lineWidth = 1;
    ctx.strokeRect(ax, iy + ih - 14, 14, 12);
  }

  // Central viewing benches
  pr(ctx, ix + iw / 2 - 12, iy + ih / 2 - 2, 24, 5, "#808080");
  pr(ctx, ix + iw / 2 - 8, iy + ih / 2 + 8, 16, 5, "#808080");

  // Sculpture pedestal
  pr(ctx, ix + iw - 16, iy + ih / 2 - 6, 10, 10, "#d0c8c0");
  pr(ctx, ix + iw - 14, iy + ih / 2 - 8, 6, 4, "#a090b0"); // sculpture

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Validators' Café: cozy café with counter, tables, chairs ───────
function drawCafe(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBrown, P.floorWood);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;

  // Long counter along top wall with stools
  pr(ctx, ix + 2, iy + 2, iw - 4, 10, P.counter);
  pr(ctx, ix + 3, iy + 3, iw - 6, 8, "#c8a870"); // counter top
  // Coffee machine on counter
  pr(ctx, ix + 4, iy + 2, 6, 6, "#484848");
  pr(ctx, ix + 5, iy + 3, 4, 2, "#c04020"); // red light
  // Bar stools
  for (let i = 0; i < Math.min(4, Math.floor(iw / 18)); i++) {
    const sx = ix + 14 + i * 16;
    ctx.fillStyle = "#806040";
    ctx.beginPath();
    ctx.arc(sx, iy + 16, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Round tables with chairs
  const tables: [number, number][] = [
    [ix + 8, iy + ih / 2 + 2],
    [ix + iw / 2 - 4, iy + ih / 2 + 2],
    [ix + iw - 18, iy + ih / 2 + 2],
  ];
  for (const [tx, ty] of tables) {
    // Round table
    ctx.fillStyle = P.table;
    ctx.beginPath();
    ctx.arc(tx + 5, ty + 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.deskTop;
    ctx.beginPath();
    ctx.arc(tx + 5, ty + 3, 4, 0, Math.PI * 2);
    ctx.fill();
    // Cup on table
    pr(ctx, tx + 3, ty + 1, 3, 3, "#f0f0f0");
    // Chairs
    pr(ctx, tx - 3, ty + 1, 3, 3, P.chair);
    pr(ctx, tx + 10, ty + 1, 3, 3, P.chairAlt);
  }

  // Menu board on left wall
  pr(ctx, ix + 1, iy + 14, 8, 12, "#303030");
  pr(ctx, ix + 2, iy + 15, 6, 10, "#404040");
  // Menu text lines
  for (let l = 0; l < 3; l++) {
    pr(ctx, ix + 3, iy + 17 + l * 3, 4, 1, "#f0f0f0");
  }

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Solana HQ: modern office with server racks and monitors ────────
function drawSolanaHQ(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBlue, P.floorTile);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;
  const wallT = 3;

  // Room divider (vertical) — left = main office, right = server room
  const divX = ix + Math.floor(iw * 0.6);
  pr(ctx, divX, iy, wallT, ih, P.wallInner);

  // Left room: desks with monitors
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const dx = ix + 4 + c * 30;
      const dy = iy + 6 + r * 26;
      pr(ctx, dx, dy, 22, 10, P.desk);
      pr(ctx, dx + 1, dy + 1, 20, 8, P.deskTop);
      // Monitor
      pr(ctx, dx + 6, dy - 2, 10, 5, "#203040");
      pr(ctx, dx + 7, dy - 1, 8, 3, "#40c890"); // Solana green screen
      // Chair
      pr(ctx, dx + 7, dy + 12, 6, 5, P.chairAlt);
    }
  }

  // Right room: server racks (Solana green LEDs)
  const srx = divX + wallT + 4;
  for (let r = 0; r < Math.min(4, Math.floor(ih / 22)); r++) {
    const sy = iy + 4 + r * 20;
    pr(ctx, srx, sy, iw - (divX - ix) - wallT - 8, 14, "#404850"); // rack
    // LED indicator lights
    for (let led = 0; led < 4; led++) {
      pr(ctx, srx + 3 + led * 6, sy + 3, 3, 2, "#40e890");
      pr(ctx, srx + 3 + led * 6, sy + 7, 3, 2, "#40c870");
    }
  }

  // Solana logo hint (green diamond in lobby area)
  pr(ctx, ix + iw / 4 - 2, iy + ih - 10, 6, 6, "#40c890");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Helius Labs: tech lab with dashboards and equipment ────────────
function drawHeliusLabs(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofTeal, P.floorTile);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;

  // Large dashboard screens along top wall
  pr(ctx, ix + 2, iy + 2, iw - 4, 14, "#182028"); // screen panel
  // Dashboard visualizations (colored bars / graphs)
  for (let i = 0; i < 6; i++) {
    const bh = 4 + (th(i * 100, 0) % 8);
    pr(ctx, ix + 6 + i * 14, iy + 14 - bh, 8, bh, i % 2 === 0 ? "#40a0d0" : "#60d0a0");
  }

  // Lab benches
  for (let r = 0; r < 2; r++) {
    const dy = iy + 22 + r * 24;
    pr(ctx, ix + 4, dy, iw - 8, 8, "#889098"); // metal bench
    // Equipment on bench
    for (let m = 0; m < Math.min(3, Math.floor(iw / 28)); m++) {
      pr(ctx, ix + 8 + m * 26, dy - 3, 8, 5, "#203040");
      pr(ctx, ix + 9 + m * 26, dy - 2, 6, 3, "#40a080"); // screen
    }
    // Chairs
    pr(ctx, ix + 10, dy + 10, 5, 4, P.chairAlt);
    pr(ctx, ix + iw - 20, dy + 10, 5, 4, P.chairAlt);
  }

  // Server rack in corner
  pr(ctx, ix + iw - 14, iy + ih - 18, 10, 16, "#404850");
  pr(ctx, ix + iw - 12, iy + ih - 16, 2, 2, "#40e890");
  pr(ctx, ix + iw - 12, iy + ih - 12, 2, 2, "#e84040");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Dev Hub: open workspace with laptop stations ───────────────────
function drawDevHub(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofGray, P.floorWood);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;

  // Long communal tables
  for (let r = 0; r < Math.min(3, Math.floor(ih / 28)); r++) {
    const dy = iy + 6 + r * 28;
    pr(ctx, ix + 4, dy, iw - 8, 10, P.desk);
    pr(ctx, ix + 5, dy + 1, iw - 10, 8, P.deskTop);
    // Laptops on table
    for (let l = 0; l < Math.min(4, Math.floor(iw / 24)); l++) {
      const lx = ix + 10 + l * 22;
      pr(ctx, lx, dy + 1, 8, 5, "#383838"); // laptop
      pr(ctx, lx + 1, dy + 2, 6, 3, "#4888cc"); // screen
    }
    // Chairs on both sides
    for (let c = 0; c < Math.min(3, Math.floor(iw / 28)); c++) {
      pr(ctx, ix + 8 + c * 24, dy - 5, 5, 4, P.chair);
      pr(ctx, ix + 8 + c * 24, dy + 12, 5, 4, P.chairAlt);
    }
  }

  // Whiteboard on left wall
  pr(ctx, ix + 1, iy + 4, 3, ih - 8, "#e8e8e8");
  // Sticky notes
  pr(ctx, ix + 1, iy + 8, 2, 2, "#f0e040");
  pr(ctx, ix + 1, iy + 14, 2, 2, "#40c0f0");
  pr(ctx, ix + 1, iy + 20, 2, 2, "#f08080");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Learning Center: classroom with rows and whiteboard ────────────
function drawLearningCenter(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBrown, P.floorWood);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;

  // Big whiteboard at top
  pr(ctx, ix + 4, iy + 2, iw - 8, 12, "#e8e8e8");
  pr(ctx, ix + 6, iy + 3, iw - 12, 10, "#f8f8f8");
  // Writing on whiteboard
  for (let l = 0; l < 3; l++) {
    pr(ctx, ix + 10, iy + 5 + l * 3, 20 + (l * 5), 1, "#4060a0");
  }

  // Student desks in rows facing whiteboard
  for (let r = 0; r < Math.min(3, Math.floor((ih - 18) / 20)); r++) {
    for (let c = 0; c < Math.min(3, Math.floor(iw / 28)); c++) {
      const dx = ix + 6 + c * 28;
      const dy = iy + 20 + r * 22;
      pr(ctx, dx, dy, 20, 8, P.desk);
      pr(ctx, dx + 6, dy + 10, 6, 4, P.chairAlt);
    }
  }

  // Bookshelf on right wall
  pr(ctx, ix + iw - 10, iy + 16, 8, ih - 20, P.bookshelf);
  for (let b = 0; b < Math.min(5, Math.floor((ih - 20) / 8)); b++) {
    pr(ctx, ix + iw - 9, iy + 18 + b * 8, 6, 5, P.bookColors[b % P.bookColors.length]);
  }

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Press Room: podium with press chairs ───────────────────────────
function drawPressRoom(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofBlue, P.floorCarpet);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;
  const cx2 = ix + iw / 2;

  // Podium at top
  pr(ctx, cx2 - 10, iy + 2, 20, 12, P.desk);
  pr(ctx, cx2 - 8, iy + 3, 16, 10, P.deskTop);
  // Microphone
  pr(ctx, cx2, iy + 1, 2, 4, "#505050");

  // Backdrop / banner
  pr(ctx, ix + 2, iy + 1, iw - 4, 3, "#3060a0");

  // Press chairs in rows
  for (let r = 0; r < Math.min(2, Math.floor((ih - 20) / 14)); r++) {
    for (let c = 0; c < Math.min(3, Math.floor(iw / 18)); c++) {
      pr(ctx, ix + 4 + c * 18, iy + 20 + r * 14, 10, 6, P.chair);
    }
  }

  // Camera on tripod in back corner
  pr(ctx, ix + iw - 10, iy + ih - 10, 6, 6, "#404040");
  pr(ctx, ix + iw - 8, iy + ih - 12, 2, 4, "#505050");

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Generic building fallback ──────────────────────────────────────
function drawGenericBuilding(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  drawBuildingShell(ctx, x, y, w, h, P.roofGray, P.floorWood);

  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;
  // Generic furniture
  pr(ctx, ix + 4, iy + 4, iw - 8, 8, P.desk);
  pr(ctx, ix + iw / 2 - 3, iy + 14, 6, 4, P.chair);

  drawBuildingLabel(ctx, loc.name, x + w / 2, y + h);
}

// ─── Outdoor locations ─────────────────────────────────────────────
function drawOutdoor(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (loc.name === "Town Square") {
    // Cobblestone plaza — sandy/gray tiles
    for (let ty2 = y; ty2 < y + h; ty2 += 8) {
      for (let tx2 = x; tx2 < x + w; tx2 += 8) {
        const v = th(tx2 + 500, ty2 + 500);
        const offset = ((ty2 / 8) % 2) * 4; // brick offset pattern
        const c = v < 300 ? "#c8b898" : v < 600 ? "#b8a888" : "#d0c0a0";
        pr(ctx, tx2 + offset, ty2, 8, 8, c);
        pr(ctx, tx2 + offset, ty2, 8, 1, "#a89878"); // grout line
        pr(ctx, tx2 + offset, ty2, 1, 8, "#a89878");
      }
    }

    // Fountain in center
    ctx.fillStyle = "#8898a8";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.water;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.waterLight;
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy - 2, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Fountain center spout
    pr(ctx, cx - 2, cy - 10, 4, 8, "#909898");

    ctx.fillStyle = P.textDark;
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Town Square", cx, y + h + 14);

  } else if (loc.name === "Consensus Park") {
    // Slightly different grass
    pr(ctx, x, y, w, h, P.grass3);
    // Small flower patches
    for (let fy = y + 4; fy < y + h - 4; fy += 12) {
      for (let fx = x + 4; fx < x + w - 4; fx += 12) {
        const v = th(fx + 999, fy + 999);
        if (v < 100) pr(ctx, fx, fy, 3, 3, P.grassFlower1);
        if (v > 900) pr(ctx, fx, fy, 2, 2, P.grassFlower3);
      }
    }

    // Park trees
    drawSmallTree(ctx, x + 16, cy - 8);
    drawSmallTree(ctx, x + w - 16, cy - 8);
    drawSmallTree(ctx, cx, y + 14);

    // Bench
    pr(ctx, cx - 10, cy + 8, 20, 4, P.trunk);
    pr(ctx, cx - 12, cy + 8, 2, 6, P.trunkDark);
    pr(ctx, cx + 10, cy + 8, 2, 6, P.trunkDark);

    // Winding path through park
    pr(ctx, x, cy - 4, w, 8, P.path);

    ctx.fillStyle = P.textDark;
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Consensus Park", cx, y + h + 14);
  }
}

// ─── Agent Sprite: small top-down character like the paper ──────────
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

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Selection indicator — bouncing triangle
  if (isSelected) {
    const bounce = Math.sin(tick * 0.2) * 2;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x, sy - 18 + bounce);
    ctx.lineTo(x - 3, sy - 22 + bounce);
    ctx.lineTo(x + 3, sy - 22 + bounce);
    ctx.fill();
  }

  // Body (top-down oval shape like paper)
  // Legs/feet
  if (walking) {
    const step = Math.floor(tick / 4) % 2;
    pr(ctx, x - 2 + (step ? 1 : -1), sy + 1, 2, 3, "#4a4060");
    pr(ctx, x + (step ? -1 : 1), sy + 1, 2, 3, "#4a4060");
  } else {
    pr(ctx, x - 2, sy + 1, 2, 3, "#4a4060");
    pr(ctx, x, sy + 1, 2, 3, "#4a4060");
  }

  // Torso (shirt)
  pr(ctx, x - 3, sy - 3, 6, 5, colors.shirt);

  // Head (skin circle)
  ctx.fillStyle = "#f0c8a0";
  ctx.beginPath();
  ctx.arc(x, sy - 6, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = colors.hair;
  ctx.beginPath();
  ctx.arc(x, sy - 7.5, 3.5, Math.PI, Math.PI * 2);
  ctx.fill();
  // Side hair
  pr(ctx, x - 4, sy - 8, 1, 3, colors.hair);
  pr(ctx, x + 3, sy - 8, 1, 3, colors.hair);
}

// ─── Speech Bubble: white rounded rect with "XX: emoji" ────────────
// Exactly like the paper's style
function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  agent: AgentData,
  tick: number,
) {
  if (agent.status !== "talking" && agent.status !== "reflecting" && agent.status !== "planning") return;

  const initials = agent.name.split(" ").map(w => w[0]).join("").slice(0, 2);
  const isThinking = agent.status === "reflecting" || agent.status === "planning";

  // Bubble dimensions
  const bw = 48;
  const bh = 18;
  const bx = x - bw / 2;
  const by = y - 28;

  // Bubble background with rounded corners
  ctx.fillStyle = P.bubbleBg;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.strokeStyle = P.bubbleBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.stroke();

  // Pointer triangle
  ctx.fillStyle = P.bubbleBg;
  ctx.beginPath();
  ctx.moveTo(x - 3, by + bh);
  ctx.lineTo(x, by + bh + 5);
  ctx.lineTo(x + 3, by + bh);
  ctx.fill();
  ctx.strokeStyle = P.bubbleBorder;
  ctx.beginPath();
  ctx.moveTo(x - 3, by + bh);
  ctx.lineTo(x, by + bh + 5);
  ctx.lineTo(x + 3, by + bh);
  ctx.stroke();
  // Cover the gap at top of triangle
  pr(ctx, x - 3, by + bh - 1, 7, 2, P.bubbleBg);

  // Text: "XX: ..." like the paper
  ctx.fillStyle = P.textDark;
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "left";

  if (isThinking) {
    ctx.fillText(`${initials}:`, bx + 5, by + 13);
    // Animated dots
    const phase = Math.floor(tick / 8) % 4;
    const dots = ".".repeat(phase);
    ctx.fillText(dots, bx + 24, by + 13);
  } else {
    // Speech icon
    ctx.fillText(`${initials}: `, bx + 5, by + 13);
    // Small speech emoji
    ctx.font = "10px sans-serif";
    ctx.fillText("💬", bx + 28, by + 13);
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
    <div style={{ display: "flex", height: "100vh", background: "#3a5a28" }}>
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
