"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AgentPanel from "./components/AgentPanel";
import ConvoStream from "./components/ConvoStream";
import MetricsPanel from "./components/MetricsPanel";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Native resolution → CSS display at 2x
const NATIVE_W = 480;
const NATIVE_H = 360;
const DISPLAY_W = 960;
const DISPLAY_H = 720;

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

// ─── Kairosoft-Inspired Warm Palette ─────────────────────────────────
const P = {
  // Grass — warm vibrant greens
  grass1: "#5daa38",
  grass2: "#4c9828",
  grass3: "#6dba48",
  grass4: "#3d8820",

  // Paths — warm beige/tan
  path: "#d4b87a",
  pathLight: "#e4c88a",
  pathDark: "#c4a86a",
  pathEdge: "#a08050",

  // Outlines — dark, Kairosoft signature
  outline: "#2a2018",

  // Building roofs — each building gets distinct bright color
  roofBlue: "#4878c8",
  roofRed: "#c85848",
  roofGreen: "#48a868",
  roofPurple: "#8858a8",
  roofOrange: "#d88838",
  roofTeal: "#389888",
  roofBrown: "#987848",
  roofGray: "#788090",

  // Building walls — warm brown
  wallOuter: "#6b5030",
  wallInner: "#7b6040",

  // Floors — light indoor tiles
  floorLight: "#e8dcc8",
  floorWood: "#d8b878",
  floorTile: "#d0d8dc",
  floorCarpet: "#c85858",

  // Furniture (simplified)
  desk: "#8b6838",
  deskTop: "#a88050",
  chair: "#c04848",
  chairAlt: "#4870b0",

  // Trees
  trunk: "#704820",
  canopy1: "#3a9830",
  canopy2: "#2a8820",
  canopyHi: "#58c848",

  // Decorations
  flower1: "#e84848",
  flower2: "#d848a0",
  flower3: "#e8c838",

  // Water
  water: "#4898d0",
  waterHi: "#68b8e8",

  // UI
  white: "#ffffff",
  black: "#000000",
  textDark: "#2a2018",
  bubbleBg: "#ffffff",
  bubbleBorder: "#2a2018",
  shadow: "rgba(0,0,0,0.18)",

  // Doorstep
  doorstep: "#d0b878",
};

// Per-building style
const BSTYLES: Record<string, { roof: string; floor: string }> = {
  "Solana HQ":        { roof: P.roofBlue,   floor: P.floorTile },
  "DRiP Gallery":     { roof: P.roofPurple, floor: P.floorWood },
  "The Colosseum":    { roof: P.roofRed,    floor: P.floorWood },
  "Helius Labs":      { roof: P.roofTeal,   floor: P.floorTile },
  "Dev Hub":          { roof: P.roofGray,   floor: P.floorWood },
  "Learning Center":  { roof: P.roofOrange, floor: P.floorWood },
  "Press Room":       { roof: P.roofGreen,  floor: P.floorCarpet },
  "Validators' Café": { roof: P.roofBrown,  floor: P.floorLight },
};

// Per-agent sprite — distinct looks per personality
interface SpriteStyle {
  hair: string;
  shirt: string;
  skin: string;
  bald?: boolean;       // Mert
  beard?: boolean;      // Mert
  longHair?: boolean;   // Lily (woman)
  glasses?: boolean;    // Austin
}
const AGENT_SPRITES: Record<string, SpriteStyle> = {
  "Anatoly":  { hair: "#2a2a30", shirt: "#40c888", skin: "#f0c8a0" },                          // dark hair, Solana green shirt
  "Raj":      { hair: "#1a1a20", shirt: "#4888dd", skin: "#d8a878" },                          // dark hair, blue shirt, tan
  "Vibhu":    { hair: "#4a3020", shirt: "#e87030", skin: "#d8a878" },                          // brown hair, orange shirt
  "Austin":   { hair: "#c89040", shirt: "#4060c0", skin: "#f0c8a0", glasses: true },           // blonde, blue shirt, glasses
  "Mert":     { hair: "#2a2020", shirt: "#282828", skin: "#d0a070", bald: true, beard: true }, // bald, beard, dark shirt
  "Chase":    { hair: "#604020", shirt: "#8040c0", skin: "#f0c8a0" },                          // brown hair, purple shirt
  "Armani":   { hair: "#1a1a20", shirt: "#e0b040", skin: "#e0b890" },                          // dark hair, gold shirt
  "Lily":     { hair: "#1a1a20", shirt: "#d04888", skin: "#f0c8a0", longHair: true },          // long dark hair, pink shirt
};
const DEFAULT_SPRITE: SpriteStyle = { hair: "#4a3a28", shirt: "#5580c0", skin: "#f0c8a0" };

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

// ─── 1px outline rect (Kairosoft signature) ────────────────────────
function outlineRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

// ─── Grass: warm green tiled background ─────────────────────────────
function drawGrass(ctx: CanvasRenderingContext2D) {
  pr(ctx, 0, 0, NATIVE_W, NATIVE_H, P.grass1);

  // 6x6 tile variation
  for (let ty = 0; ty < NATIVE_H; ty += 6) {
    for (let tx = 0; tx < NATIVE_W; tx += 6) {
      const h = th(tx, ty);
      const checker = ((tx / 6) + (ty / 6)) % 2 === 0;
      if (checker) {
        if (h < 300) pr(ctx, tx, ty, 6, 6, P.grass2);
        else if (h < 500) pr(ctx, tx, ty, 6, 6, P.grass3);
      } else {
        if (h < 200) pr(ctx, tx, ty, 6, 6, P.grass4);
      }

      // Scattered flowers
      if (h > 970) {
        const fc = h > 990 ? P.flower1 : h > 980 ? P.flower2 : P.flower3;
        pr(ctx, tx + (h % 4), ty + ((h >> 3) % 4), 2, 2, fc);
      }
    }
  }
}

// ─── Paths: sandy roads connecting locations ────────────────────────
function drawPaths(ctx: CanvasRenderingContext2D, locations: LocationData[]) {
  const W = 14; // path width at native res
  const half = W / 2;

  const ts = locations.find(l => l.name === "Town Square");
  const hub = ts ? { x: ts.x + ts.width / 2, y: ts.y + ts.height / 2 } : { x: 240, y: 180 };

  for (const loc of locations) {
    const cx = loc.x + loc.width / 2;
    const cy = loc.y + loc.height / 2;

    const yMin = Math.min(hub.y, cy);
    const yMax = Math.max(hub.y, cy);
    drawPathRect(ctx, hub.x - half, yMin - half, W, yMax - yMin + W);

    const xMin = Math.min(hub.x, cx);
    const xMax = Math.max(hub.x, cx);
    drawPathRect(ctx, xMin - half, cy - half, xMax - xMin + W, W);
  }
}

function drawPathRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  pr(ctx, x, y, w, h, P.path);
  // Edge lines
  pr(ctx, x, y, w, 1, P.pathEdge);
  pr(ctx, x, y + h - 1, w, 1, P.pathEdge);
  pr(ctx, x, y, 1, h, P.pathEdge);
  pr(ctx, x + w - 1, y, 1, h, P.pathEdge);
  // Subtle texture
  for (let py = y + 1; py < y + h - 1; py += 6) {
    for (let px = x + 1; px < x + w - 1; px += 6) {
      const v = th(px + 300, py + 300);
      if (v < 150) pr(ctx, px + (v % 3), py + ((v >> 2) % 3), 3, 3, P.pathLight);
      if (v > 850) pr(ctx, px + (v % 3), py + ((v >> 2) % 3), 2, 2, P.pathDark);
    }
  }
}

// ─── Trees: round canopy with trunk ─────────────────────────────────
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Shadow
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Trunk
  pr(ctx, x - 1, y - 4, 3, 7, P.trunk);
  // Canopy
  ctx.fillStyle = P.canopy1;
  ctx.beginPath();
  ctx.arc(x, y - 7, 6, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = P.canopyHi;
  ctx.beginPath();
  ctx.arc(x - 2, y - 9, 3, 0, Math.PI * 2);
  ctx.fill();
  // 1px outline
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y - 7, 6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = P.canopy1;
  ctx.beginPath();
  ctx.arc(x, y - 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.canopyHi;
  ctx.beginPath();
  ctx.arc(x - 1, y - 3, 2, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Decoration positions (scaled for 320x240) ──────────────────────
interface Deco { type: "tree" | "bush"; x: number; y: number }

const DECOS: Deco[] = (() => {
  const d: Deco[] = [];
  // Trees spread around the full 480x360 map
  const treePts: [number, number][] = [
    [105, 90], [115, 200], [170, 195],         // between left buildings
    [345, 25], [345, 90], [345, 180],           // middle column
    [465, 100], [465, 180], [465, 300],         // right edge
    [15, 230], [100, 345], [175, 345],          // bottom left
    [300, 345], [420, 345],                     // bottom right
    [240, 185],                                 // between town square and colosseum
  ];
  for (const [x, y] of treePts) d.push({ type: "tree", x, y });

  // Bushes near buildings
  const bushPts: [number, number][] = [
    [100, 25], [210, 25], [370, 85],
    [100, 145], [170, 115], [280, 115],
    [310, 290], [375, 210],
    [100, 280], [280, 210],
  ];
  for (const [x, y] of bushPts) d.push({ type: "bush", x, y });

  return d;
})();

function drawDecorations(ctx: CanvasRenderingContext2D) {
  for (const d of DECOS) {
    if (d.type === "tree") drawTree(ctx, d.x, d.y);
    else drawBush(ctx, d.x, d.y);
  }
}

// ─── Building: Kairosoft-style colored roof + 1px outline ───────────

function drawBuilding(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h, name } = loc;
  const style = BSTYLES[name] || { roof: P.roofGray, floor: P.floorWood };
  const wallT = 3; // wall thickness at native res

  // Shadow
  ctx.fillStyle = P.shadow;
  ctx.fillRect(x + 2, y + 2, w, h);

  // Colored roof (top strip — 30% of height)
  const roofH = Math.max(4, Math.floor(h * 0.3));
  pr(ctx, x, y, w, roofH, style.roof);
  // Roof shadow stripe
  pr(ctx, x, y + roofH - 2, w, 2, P.outline);

  // Walls
  pr(ctx, x, y + roofH, w, h - roofH, P.wallOuter);
  pr(ctx, x + 1, y + roofH, w - 2, h - roofH - 1, P.wallInner);

  // Floor interior
  pr(ctx, x + wallT, y + roofH, w - wallT * 2, h - roofH - wallT, style.floor);

  // Simple floor texture
  if (style.floor === P.floorTile) {
    // Checkerboard
    for (let fy = y + roofH; fy < y + h - wallT; fy += 4) {
      for (let fx = x + wallT; fx < x + w - wallT; fx += 4) {
        if (((fx - x) / 4 + (fy - y) / 4) % 2 === 0) {
          pr(ctx, fx, fy, 4, 4, "#dce4e8");
        }
      }
    }
  } else if (style.floor === P.floorWood) {
    // Horizontal plank lines
    for (let fy = y + roofH; fy < y + h - wallT; fy += 3) {
      pr(ctx, x + wallT, fy, w - wallT * 2, 1, "#c8a868");
    }
  }

  // Door — gap at bottom center
  const doorW = Math.max(4, Math.floor(w * 0.15));
  const doorX = x + Math.floor(w / 2) - Math.floor(doorW / 2);
  pr(ctx, doorX, y + h - wallT, doorW, wallT, style.floor);
  // Doorstep
  pr(ctx, doorX, y + h, doorW, 2, P.doorstep);

  // Simple interior details per building
  drawBuildingInterior(ctx, loc, style);

  // 1px dark outline (Kairosoft signature)
  outlineRect(ctx, x, y, w, h);

  // Label below building
  drawBuildingLabel(ctx, name, x + w / 2, y + h);
}

function drawBuildingInterior(ctx: CanvasRenderingContext2D, loc: LocationData, style: { roof: string; floor: string }) {
  const { x, y, width: w, height: h, name } = loc;
  const roofH = Math.max(4, Math.floor(h * 0.3));
  const ix = x + 3;
  const iy = y + roofH + 1;
  const iw = w - 6;
  const ih = h - roofH - 3;

  switch (name) {
    case "Solana HQ": {
      // Desks with monitors
      for (let r = 0; r < 2; r++) {
        const dy = iy + 2 + r * 12;
        pr(ctx, ix + 1, dy, iw - 2, 4, P.desk);
        // Monitors
        for (let m = 0; m < Math.min(3, Math.floor(iw / 10)); m++) {
          pr(ctx, ix + 3 + m * 9, dy - 2, 4, 3, "#181828");
          pr(ctx, ix + 4 + m * 9, dy - 1, 2, 1, "#38c888");
        }
      }
      break;
    }
    case "DRiP Gallery": {
      // Art frames on top wall
      const artColors = ["#e03030", "#2060d0", "#30a830", "#e8a018"];
      for (let i = 0; i < Math.min(3, Math.floor(iw / 10)); i++) {
        pr(ctx, ix + 2 + i * 10, iy + 1, 6, 5, P.outline);
        pr(ctx, ix + 3 + i * 10, iy + 2, 4, 3, artColors[i % artColors.length]);
      }
      break;
    }
    case "Validators' Café": {
      // Counter at top
      pr(ctx, ix + 1, iy + 1, iw - 2, 4, P.desk);
      pr(ctx, ix + 2, iy + 2, iw - 4, 2, P.deskTop);
      // Tables
      for (let t = 0; t < 2; t++) {
        const tx2 = ix + 3 + t * Math.floor(iw / 2);
        pr(ctx, tx2, iy + ih - 8, 5, 3, P.desk);
        pr(ctx, tx2 - 2, iy + ih - 6, 2, 2, P.chair);
        pr(ctx, tx2 + 5, iy + ih - 6, 2, 2, P.chairAlt);
      }
      break;
    }
    case "Helius Labs": {
      // Dashboard screen
      pr(ctx, ix + 1, iy + 1, iw - 2, 6, "#141820");
      for (let i = 0; i < Math.min(4, Math.floor(iw / 6)); i++) {
        const bh = 2 + (th(i * 100, 0) % 3);
        pr(ctx, ix + 3 + i * 5, iy + 6 - bh, 3, bh, i % 2 === 0 ? "#38a0d0" : "#58d0a0");
      }
      // Lab bench
      pr(ctx, ix + 2, iy + 10, iw - 4, 3, "#808898");
      break;
    }
    case "Dev Hub": {
      // Long tables with laptops
      for (let r = 0; r < 2; r++) {
        const dy = iy + 2 + r * 12;
        pr(ctx, ix + 2, dy, iw - 4, 4, P.desk);
        for (let l = 0; l < Math.min(3, Math.floor(iw / 10)); l++) {
          pr(ctx, ix + 4 + l * 8, dy + 1, 4, 2, "#303038");
          pr(ctx, ix + 5 + l * 8, dy + 1, 2, 1, "#4080cc");
        }
      }
      break;
    }
    case "Learning Center": {
      // Whiteboard
      pr(ctx, ix + 2, iy + 1, iw - 4, 5, "#f0f0f0");
      pr(ctx, ix + 3, iy + 2, 8, 1, "#3058a0");
      pr(ctx, ix + 3, iy + 4, 6, 1, "#3058a0");
      // Desks
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          pr(ctx, ix + 2 + c * Math.floor(iw / 2), iy + 9 + r * 8, 8, 3, P.desk);
        }
      }
      break;
    }
    case "Press Room": {
      // Podium
      const cx2 = ix + Math.floor(iw / 2);
      pr(ctx, cx2 - 4, iy + 2, 8, 5, P.desk);
      pr(ctx, cx2 - 3, iy + 3, 6, 3, P.deskTop);
      // Chairs
      for (let c = 0; c < Math.min(3, Math.floor(iw / 8)); c++) {
        pr(ctx, ix + 2 + c * 7, iy + ih - 5, 4, 3, P.chair);
      }
      break;
    }
  }
}

function drawBuildingLabel(ctx: CanvasRenderingContext2D, name: string, cx: number, bottomY: number) {
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  const tw = ctx.measureText(name).width + 8;
  // Dark background plate
  pr(ctx, cx - tw / 2, bottomY + 4, tw, 13, "rgba(0,0,0,0.65)");
  // 1px border
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(cx - tw / 2) + 0.5, bottomY + 4.5, tw - 1, 12);
  // White text
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, cx, bottomY + 14);
}

// ─── Outdoor locations ──────────────────────────────────────────────
function drawOutdoor(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h, name } = loc;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (name === "Town Square") {
    // Cobblestone plaza
    for (let ty2 = y; ty2 < y + h; ty2 += 6) {
      for (let tx2 = x; tx2 < x + w; tx2 += 6) {
        const v = th(tx2 + 500, ty2 + 500);
        const offset = (Math.floor((ty2 - y) / 6) % 2) * 3;
        const c = v < 300 ? "#d0b888" : v < 600 ? "#c0a878" : "#dcc898";
        pr(ctx, tx2 + offset, ty2, 6, 6, c);
        pr(ctx, tx2 + offset, ty2, 6, 1, "#a08858");
        pr(ctx, tx2 + offset, ty2, 1, 6, "#a08858");
      }
    }

    // Fountain
    ctx.fillStyle = "#909898";
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.water;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.waterHi;
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    // Center pillar
    pr(ctx, cx - 1, cy - 7, 3, 5, "#808890");
    // Outline
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();

    drawBuildingLabel(ctx, "Town Square", cx, y + h);

  } else if (name === "Consensus Park") {
    // Brighter grass patch
    pr(ctx, x, y, w, h, P.grass3);
    // Flowers
    for (let fy = y + 3; fy < y + h - 3; fy += 7) {
      for (let fx = x + 3; fx < x + w - 3; fx += 7) {
        const v = th(fx + 999, fy + 999);
        if (v < 60) pr(ctx, fx, fy, 2, 2, P.flower1);
        if (v > 940) pr(ctx, fx, fy, 2, 2, P.flower3);
      }
    }

    // Trees
    drawTree(ctx, x + 12, cy - 6);
    drawTree(ctx, x + w - 12, cy - 6);

    // Bench
    pr(ctx, cx - 6, cy + 5, 12, 3, P.trunk);
    pr(ctx, cx - 6, cy + 4, 12, 2, P.trunk);

    // Stone path
    for (let px = x; px < x + w; px += 6) {
      pr(ctx, px, cy - 2, 6, 4, P.path);
    }

    drawBuildingLabel(ctx, "Consensus Park", cx, y + h);
  }
}

// ─── The Colosseum: special circular building ───────────────────────
function drawColosseum(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const cx = loc.x + loc.width / 2;
  const cy = loc.y + loc.height / 2;
  const rx = loc.width / 2;
  const ry = loc.height / 2;

  // Shadow
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 2, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer wall
  ctx.fillStyle = P.roofRed;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring
  ctx.fillStyle = P.wallInner;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 2, ry - 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Seating area
  ctx.fillStyle = "#c0a878";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 4, ry - 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Arena floor
  ctx.fillStyle = "#dcc898";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.4, ry * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Seats (tiny colored pixels)
  const seatColors = [P.chair, P.chairAlt, "#d0a830", "#40a050"];
  for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
    const sr = rx * 0.65;
    const srY = ry * 0.65;
    const sx = cx + Math.cos(angle) * sr;
    const sy = cy + Math.sin(angle) * srY;
    pr(ctx, sx - 1, sy - 1, 2, 2, seatColors[Math.floor(angle * 2) % seatColors.length]);
  }

  // Center podium
  pr(ctx, cx - 2, cy - 1, 4, 3, P.desk);

  // 1px outline
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Archway openings
  pr(ctx, cx - 3, loc.y, 6, 3, "#dcc898");
  pr(ctx, cx - 3, loc.y + loc.height - 3, 6, 3, "#dcc898");

  drawBuildingLabel(ctx, loc.name, cx, loc.y + loc.height);
}

// ─── Building top-down dispatch ─────────────────────────────────────
function drawBuildingTopDown(ctx: CanvasRenderingContext2D, loc: LocationData) {
  if (loc.name === "The Colosseum") {
    drawColosseum(ctx, loc);
  } else {
    drawBuilding(ctx, loc);
  }
}

// ─── Agent Sprite: bigger chibi with distinct features ──────────────
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

  const bob = walking ? (Math.floor(tick / 4) % 2) * -1 : 0;
  const sy = y + bob;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 6, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Selection indicator — bouncing arrow
  if (isSelected) {
    const bounce = Math.sin(tick * 0.2) * 1.5;
    pr(ctx, x - 2, sy - 22 + bounce, 4, 3, "#ffdd00");
    pr(ctx, x - 1, sy - 19 + bounce, 2, 2, "#ffdd00");
    // Outline
    ctx.strokeStyle = "#aa8800";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, sy - 22.5 + bounce, 5, 3);
  }

  // ─── Feet/shoes ───
  if (walking) {
    const step = Math.floor(tick / 4) % 2;
    pr(ctx, x - 3 + (step ? 2 : 0), sy + 3, 2, 2, "#3a2a18");
    pr(ctx, x + 1 + (step ? 0 : 2), sy + 3, 2, 2, "#3a2a18");
  } else {
    pr(ctx, x - 3, sy + 3, 2, 2, "#3a2a18");
    pr(ctx, x + 2, sy + 3, 2, 2, "#3a2a18");
  }

  // ─── Legs ───
  pr(ctx, x - 2, sy + 1, 2, 3, "#404858");
  pr(ctx, x + 1, sy + 1, 2, 3, "#404858");

  // ─── Torso (shirt) — wider for chibi ───
  pr(ctx, x - 4, sy - 4, 8, 6, colors.shirt);
  // Shirt highlight
  pr(ctx, x - 3, sy - 3, 2, 4, "rgba(255,255,255,0.12)");

  // ─── Arms ───
  pr(ctx, x - 5, sy - 3, 2, 5, colors.shirt);
  pr(ctx, x + 4, sy - 3, 2, 5, colors.shirt);
  // Hands
  pr(ctx, x - 5, sy + 2, 2, 1, colors.skin);
  pr(ctx, x + 4, sy + 2, 2, 1, colors.skin);

  // ─── Head (big for chibi — 8px wide, 6px tall) ───
  pr(ctx, x - 4, sy - 10, 8, 6, colors.skin);

  // ─── Eyes ───
  pr(ctx, x - 2, sy - 8, 1, 1, "#202020");
  pr(ctx, x + 2, sy - 8, 1, 1, "#202020");
  // Eye shine
  pr(ctx, x - 2, sy - 9, 1, 1, "#ffffff");
  pr(ctx, x + 2, sy - 9, 1, 1, "#ffffff");

  // ─── Mouth ───
  pr(ctx, x - 1, sy - 6, 2, 1, "#c09870");

  // ─── Hair (depends on character) ───
  if (colors.bald) {
    // Mert: bald head — just skin on top, slightly darker scalp edge
    pr(ctx, x - 4, sy - 11, 8, 2, colors.skin);
    pr(ctx, x - 3, sy - 12, 6, 1, colors.skin);
    // Subtle scalp shadow
    pr(ctx, x - 3, sy - 11, 6, 1, "#c89860");
  } else if (colors.longHair) {
    // Lily: long hair — covers top + falls down sides
    pr(ctx, x - 4, sy - 12, 8, 3, colors.hair);
    pr(ctx, x - 3, sy - 13, 6, 2, colors.hair);
    // Side hair falling down past head
    pr(ctx, x - 5, sy - 11, 2, 8, colors.hair);
    pr(ctx, x + 4, sy - 11, 2, 8, colors.hair);
    // Hair tips going further down
    pr(ctx, x - 5, sy - 3, 1, 3, colors.hair);
    pr(ctx, x + 5, sy - 3, 1, 3, colors.hair);
  } else {
    // Standard short hair
    pr(ctx, x - 4, sy - 12, 8, 3, colors.hair);
    pr(ctx, x - 3, sy - 13, 6, 2, colors.hair);
    // Side tufts
    pr(ctx, x - 5, sy - 11, 1, 3, colors.hair);
    pr(ctx, x + 5, sy - 11, 1, 3, colors.hair);
  }

  // ─── Beard (Mert) ───
  if (colors.beard) {
    pr(ctx, x - 3, sy - 7, 6, 3, "#2a2020");
    pr(ctx, x - 2, sy - 4, 4, 1, "#2a2020");
    // Chin point
    pr(ctx, x - 1, sy - 3, 2, 1, "#2a2020");
  }

  // ─── Glasses (Austin) ───
  if (colors.glasses) {
    pr(ctx, x - 3, sy - 9, 3, 2, "#303030");
    pr(ctx, x + 1, sy - 9, 3, 2, "#303030");
    // Lenses
    pr(ctx, x - 2, sy - 8, 1, 1, "#88bbee");
    pr(ctx, x + 2, sy - 8, 1, 1, "#88bbee");
    // Bridge
    pr(ctx, x, sy - 9, 1, 1, "#303030");
  }

  // ─── 1px outline around full sprite ───
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 1;
  // Body outline
  ctx.strokeRect(x - 4.5, sy - 4.5, 9, 10);
  // Head outline
  ctx.strokeRect(x - 4.5, sy - (colors.bald ? 12 : 13) + 0.5, 9, (colors.bald ? 9 : 10));

  // ─── Name label (readable) ───
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  // Shadow text
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillText(name, x + 0.5, y + 12.5);
  // White text
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, x, y + 12);
}

// ─── Speech Bubble ──────────────────────────────────────────────────
function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  agent: AgentData,
  tick: number,
) {
  if (agent.status !== "talking" && agent.status !== "reflecting" && agent.status !== "planning") return;

  const isThinking = agent.status === "reflecting" || agent.status === "planning";

  const bw = 24;
  const bh = 14;
  const bx = x - bw / 2;
  const by = y - 30;

  pr(ctx, bx, by, bw, bh, P.bubbleBg);
  outlineRect(ctx, bx, by, bw, bh);

  // Pointer triangle
  pr(ctx, x - 2, by + bh, 4, 2, P.bubbleBg);
  pr(ctx, x - 1, by + bh + 2, 2, 1, P.bubbleBg);

  // Dots or status text
  ctx.fillStyle = P.textDark;
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  if (isThinking) {
    const phase = Math.floor(tick / 8) % 4;
    ctx.fillText(".".repeat(phase || 1), x, by + 10);
  } else {
    const phase = Math.floor(tick / 6) % 3;
    ctx.fillText(".".repeat(phase + 1), x, by + 10);
  }
}

// ─── Conversation callout ───────────────────────────────────────────
function drawConvoCallout(
  ctx: CanvasRenderingContext2D,
  convo: ConvoData,
  agents: Record<string, AgentData>,
) {
  if (convo.messages.length === 0) return;

  const a1 = agents[convo.participants[0]];
  const a2 = agents[convo.participants[1]];
  if (!a1 || !a2) return;

  const msg = convo.messages[convo.messages.length - 1];
  const speaker = msg.agentName.split(" ")[0];
  const text = msg.content.slice(0, 30) + (msg.content.length > 30 ? ".." : "");

  const mx = (a1.position.x + a2.position.x) / 2;
  const my = Math.max(a1.position.y, a2.position.y) + 18;

  ctx.font = "8px monospace";
  const lineW = ctx.measureText(`${speaker}: ${text}`).width + 10;
  const boxW = Math.min(lineW, 180);
  const boxH = 14;
  const bx = Math.max(2, Math.min(NATIVE_W - boxW - 2, mx - boxW / 2));
  const by = Math.max(2, Math.min(NATIVE_H - boxH - 2, my));

  pr(ctx, bx, by, boxW, boxH, P.bubbleBg);
  outlineRect(ctx, bx, by, boxW, boxH);

  ctx.fillStyle = P.textDark;
  ctx.font = "8px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${speaker}: ${text}`, bx + 4, by + 10, boxW - 8);
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

  // ─── Draw Pipeline ─────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    tickRef.current++;
    const tick = tickRef.current;

    ctx.imageSmoothingEnabled = false;

    // 1. Grass background
    drawGrass(ctx);

    // 2. Paths
    drawPaths(ctx, world.locations);

    // 3. Decorations
    drawDecorations(ctx);

    // 4. Buildings & outdoor locations
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
          ctx.strokeStyle = "rgba(180,180,200,0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.lineDashOffset = -(tick % 8);
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

    // 7. Speech bubbles
    for (const [, agent] of Object.entries(world.agents)) {
      drawBubble(ctx, agent.position.x, agent.position.y, agent, tick);
    }

    // 8. Conversation callouts
    for (const convo of conversations) {
      drawConvoCallout(ctx, convo, world.agents);
    }

    // 9. Selected agent action tooltip
    if (selectedAgent && world.agents[selectedAgent]?.currentAction) {
      const agent = world.agents[selectedAgent];
      const text = agent.currentAction!.slice(0, 35) + (agent.currentAction!.length > 35 ? ".." : "");
      ctx.font = "8px monospace";
      const tw = ctx.measureText(text).width + 10;
      const tx = Math.max(tw / 2 + 2, Math.min(NATIVE_W - tw / 2 - 2, agent.position.x));
      const ty = agent.position.y + 16;

      pr(ctx, tx - tw / 2, ty, tw, 13, P.bubbleBg);
      outlineRect(ctx, tx - tw / 2, ty, tw, 13);
      ctx.fillStyle = P.textDark;
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(text, tx, ty + 9);
    }

    // 10. Paused overlay
    if (paused) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, NATIVE_W, NATIVE_H);
      pr(ctx, NATIVE_W / 2 - 35, NATIVE_H / 2 - 10, 70, 22, "rgba(0,0,0,0.7)");
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", NATIVE_W / 2, NATIVE_H / 2 + 5);
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
    const scaleX = NATIVE_W / rect.width;
    const scaleY = NATIVE_H / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    for (const [id, agent] of Object.entries(world.agents)) {
      const dx = x - agent.position.x;
      const dy = y - agent.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
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
    <div style={{ display: "flex", height: "100vh", background: "#2a3818" }}>
      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header — warm parchment bar */}
        <div style={{
          padding: "6px 16px",
          background: "#f5edd8",
          borderBottom: "2px solid #c8b080",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "monospace",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 14, color: "#3a2818", fontFamily: "monospace", fontWeight: 700 }}>
              Solana Smallville
            </h1>
            {world && (
              <span style={{ fontSize: 11, color: "#806848", fontFamily: "monospace" }}>
                Day {world.currentDay} | {formatTime(world.currentTime)} | {Object.keys(world.agents).length} agents
              </span>
            )}
            {solPrice && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: solPrice.change !== null && solPrice.change >= 0 ? "#2a8838" : "#c83030",
                fontFamily: "monospace",
              }}>
                SOL ${solPrice.price.toFixed(2)}
                {solPrice.change !== null && (
                  <span style={{ fontSize: 10, marginLeft: 3 }}>
                    {solPrice.change >= 0 ? "+" : ""}{solPrice.change.toFixed(2)}%
                  </span>
                )}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={togglePause}
              style={{
                padding: "3px 8px", fontSize: 10,
                border: "1px solid #a08858", borderRadius: 0,
                background: paused ? "#c84040" : "#f5edd8",
                color: paused ? "#fff" : "#3a2818",
                cursor: "pointer", fontWeight: 600, fontFamily: "monospace",
              }}
            >
              {paused ? "RESUME" : "PAUSE"}
            </button>
            <span style={{ fontSize: 10, color: "#a08858", fontFamily: "monospace" }}>SPD:</span>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                style={{
                  padding: "2px 5px", fontSize: 10,
                  border: "1px solid #a08858", borderRadius: 0,
                  background: speed === s ? "#5a8c3c" : "#f5edd8",
                  color: speed === s ? "#fff" : "#806848",
                  cursor: "pointer", fontWeight: speed === s ? 700 : 400,
                  fontFamily: "monospace",
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Canvas — 320x240 native, displayed at 960x720 */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 8 }}>
          <canvas
            ref={canvasRef}
            width={NATIVE_W}
            height={NATIVE_H}
            onClick={handleCanvasClick}
            style={{
              width: DISPLAY_W,
              height: DISPLAY_H,
              border: "2px solid #a08858",
              cursor: "pointer",
              maxWidth: "100%",
              maxHeight: "100%",
              imageRendering: "pixelated",
            }}
          />
        </div>

        {/* Legend */}
        <div style={{
          padding: "4px 16px",
          borderTop: "1px solid #c8b080",
          background: "#f5edd8",
          display: "flex",
          gap: 12,
          fontSize: 10,
          fontFamily: "monospace",
        }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 3, color: "#806848" }}>
              <div style={{ width: 6, height: 6, backgroundColor: color }} />
              {status}
            </div>
          ))}
          <div style={{ marginLeft: "auto", color: "#a08858", fontSize: 9 }}>
            Click agent to inspect
          </div>
        </div>
      </div>

      {/* Right panel — warm theme */}
      <div style={{
        width: 360,
        borderLeft: "2px solid #c8b080",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#f5edd8",
        fontFamily: "monospace",
      }}>
        <MetricsPanel apiUrl={API_URL} />
        {selectedAgentData ? (
          <AgentPanel agent={selectedAgentData} apiUrl={API_URL} />
        ) : (
          <div style={{ padding: 16, color: "#a08858", fontSize: 12, fontFamily: "monospace" }}>
            Select an agent to view details
          </div>
        )}
        <ConvoStream conversations={conversations} history={convoHistory} />
      </div>
    </div>
  );
}
