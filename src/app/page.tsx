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

// ─── Pixel Art Palette ───────────────────────────────────────────────
const PALETTE = {
  grassLight: "#5a8c3c",
  grassMid: "#4a7a30",
  grassDark: "#3d6b28",
  grassAccent: "#6b9e48",
  dirtLight: "#c4a46a",
  dirtMid: "#a88b52",
  dirtDark: "#8c7240",
  dirtSpeckle: "#b89858",
  wallCream: "#f0deb8",
  wallShadow: "#d4c49c",
  roofDefault: "#8b4513",
  doorBrown: "#6b3410",
  windowBlue: "#88c8e8",
  windowShine: "#b8e8ff",
  waterBlue: "#4898d0",
  waterLight: "#68b8e8",
  foliageGreen: "#2d8030",
  foliageDark: "#1a5c20",
  trunkBrown: "#6b4420",
  flowerRed: "#e84040",
  flowerYellow: "#f0d030",
  flowerPink: "#f080a0",
  signWood: "#a07838",
  textDark: "#2a1a08",
  textLight: "#f0e8d0",
  parchment: "#f5e6c8",
  parchmentBorder: "#c8a870",
  bubbleWhite: "#fffffa",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "#4ade80",
  walking: "#60a5fa",
  talking: "#f472b6",
  reflecting: "#c084fc",
  planning: "#fbbf24",
};

const BUILDING_STYLES: Record<string, { roof: string; accent: string }> = {
  "Solana HQ": { roof: "#3060c0", accent: "#50e8a0" },
  "DRiP Gallery": { roof: "#a040c0", accent: "#f0c0ff" },
  "The Colosseum": { roof: "#c04040", accent: "#f0c040" },
  "Helius Labs": { roof: "#3080a0", accent: "#80e0ff" },
  "Dev Hub": { roof: "#505060", accent: "#80ff80" },
  "Learning Center": { roof: "#a06030", accent: "#f0d080" },
  "Press Room": { roof: "#606060", accent: "#e0e0e0" },
  "Validators' Café": { roof: "#804020", accent: "#f0a060" },
};

const AGENT_COLORS: Record<string, { hair: string; shirt: string }> = {
  "Anatoly": { hair: "#2a2a30", shirt: "#50e8a0" },
  "Raj": { hair: "#1a1a20", shirt: "#4488dd" },
  "Vibhu": { hair: "#3a2a20", shirt: "#f07030" },
  "Austin": { hair: "#c89040", shirt: "#4060c0" },
  "Mert": { hair: "#2a2020", shirt: "#e04060" },
  "Chase": { hair: "#604020", shirt: "#8040c0" },
  "Armani": { hair: "#1a1a20", shirt: "#f0c040" },
  "Frank": { hair: "#808080", shirt: "#306050" },
};

const DEFAULT_AGENT_COLOR = { hair: "#4a3a28", shirt: "#5580c0" };

// Dirt paths connecting locations (L-shaped segments: [x1,y1, cornerX,cornerY, x2,y2])
const PATH_SEGMENTS: [number, number, number, number, number, number][] = [
  // Town Square to surrounding buildings
  [400, 300, 400, 180, 200, 180],   // Town Square → top left area
  [400, 300, 400, 180, 600, 180],   // Town Square → top right area
  [400, 300, 400, 420, 200, 420],   // Town Square → bottom left
  [400, 300, 400, 420, 600, 420],   // Town Square → bottom right
  [400, 300, 200, 300, 200, 300],   // Town Square → left
  [400, 300, 600, 300, 600, 300],   // Town Square → right
  [400, 300, 400, 100, 400, 100],   // Town Square → top
  [400, 300, 400, 500, 400, 500],   // Town Square → bottom
];

interface Decoration {
  type: "tree" | "bush" | "flower";
  x: number;
  y: number;
  variant: number;
}

// Procedurally placed decorations around the map
const DECORATIONS: Decoration[] = (() => {
  const decs: Decoration[] = [];
  const hash = (x: number, y: number) => ((x * 7919 + y * 6271) & 0xffff) / 0xffff;

  // Scatter trees around edges and gaps
  const treePositions = [
    [30, 30], [70, 50], [120, 20], [730, 30], [760, 60], [680, 25],
    [20, 560], [60, 540], [740, 550], [770, 570], [690, 560],
    [15, 200], [25, 350], [775, 200], [770, 380],
    [300, 15], [500, 15], [300, 575], [500, 580],
    [150, 100], [650, 100], [150, 500], [650, 500],
    [50, 150], [50, 450], [750, 150], [750, 450],
  ];
  for (const [x, y] of treePositions) {
    decs.push({ type: "tree", x, y, variant: Math.floor(hash(x, y) * 3) });
  }

  // Bushes near buildings
  const bushPositions = [
    [170, 210], [280, 160], [520, 160], [630, 210],
    [170, 440], [280, 480], [520, 480], [630, 440],
    [100, 290], [700, 290], [340, 100], [460, 100],
    [340, 520], [460, 520],
  ];
  for (const [x, y] of bushPositions) {
    decs.push({ type: "bush", x, y, variant: Math.floor(hash(x, y) * 2) });
  }

  // Flowers scattered
  const flowerPositions = [
    [90, 130], [710, 130], [90, 470], [710, 470],
    [250, 250], [550, 250], [250, 350], [550, 350],
    [180, 310], [620, 310], [400, 140], [400, 460],
    [320, 230], [480, 370], [350, 380], [450, 220],
  ];
  for (const [x, y] of flowerPositions) {
    decs.push({ type: "flower", x, y, variant: Math.floor(hash(x, y) * 3) });
  }

  return decs;
})();

// ─── Pixel Drawing Helpers ───────────────────────────────────────────

function drawPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function tileHash(tx: number, ty: number): number {
  return ((tx * 2654435761 + ty * 40503) >>> 0) % 100;
}

function drawGrassBackground(ctx: CanvasRenderingContext2D) {
  // Base grass fill
  drawPixelRect(ctx, 0, 0, 800, 600, PALETTE.grassMid);

  // 8x8 tile variation
  for (let ty = 0; ty < 75; ty++) {
    for (let tx = 0; tx < 100; tx++) {
      const h = tileHash(tx, ty);
      if (h < 20) {
        drawPixelRect(ctx, tx * 8, ty * 8, 8, 8, PALETTE.grassLight);
      } else if (h < 35) {
        drawPixelRect(ctx, tx * 8, ty * 8, 8, 8, PALETTE.grassDark);
      } else if (h < 42) {
        drawPixelRect(ctx, tx * 8, ty * 8, 8, 8, PALETTE.grassAccent);
      }
      // Tiny grass blade details
      if (h > 90) {
        const bx = tx * 8 + (h % 6);
        const by = ty * 8 + ((h * 3) % 6);
        drawPixelRect(ctx, bx, by, 1, 2, PALETTE.grassDark);
      }
    }
  }
}

function drawDirtPaths(ctx: CanvasRenderingContext2D) {
  const pathWidth = 12;
  const half = pathWidth / 2;

  for (const [x1, y1, cx, cy, x2, y2] of PATH_SEGMENTS) {
    // Horizontal segment from (x1 → cx)
    if (x1 !== cx) {
      const minX = Math.min(x1, cx) - half;
      const maxX = Math.max(x1, cx) + half;
      drawPixelRect(ctx, minX, y1 - half, maxX - minX, pathWidth, PALETTE.dirtMid);
      // Top/bottom texture lines
      for (let px = minX; px < maxX; px += 8) {
        const h = tileHash(px, y1);
        if (h < 30) drawPixelRect(ctx, px, y1 - half, 4, 2, PALETTE.dirtLight);
        if (h > 70) drawPixelRect(ctx, px, y1 + half - 2, 3, 2, PALETTE.dirtDark);
        if (h > 40 && h < 50) drawPixelRect(ctx, px + 2, y1 - 1, 2, 2, PALETTE.dirtSpeckle);
      }
    }

    // Vertical segment from (cy → y2) or (y1 → cy)
    const vy1 = Math.min(y1, cy, y2);
    const vy2 = Math.max(y1, cy, y2);
    if (vy1 !== vy2) {
      const vx = (x1 !== cx) ? cx : x1;
      drawPixelRect(ctx, vx - half, vy1 - half, pathWidth, vy2 - vy1 + pathWidth, PALETTE.dirtMid);
      for (let py = vy1; py < vy2; py += 8) {
        const h = tileHash(vx, py);
        if (h < 30) drawPixelRect(ctx, vx - half, py, 2, 4, PALETTE.dirtLight);
        if (h > 70) drawPixelRect(ctx, vx + half - 2, py, 2, 3, PALETTE.dirtDark);
        if (h > 40 && h < 50) drawPixelRect(ctx, vx - 1, py + 2, 2, 2, PALETTE.dirtSpeckle);
      }
    }

    // Horizontal segment from (cx → x2)
    if (cx !== x2) {
      const minX = Math.min(cx, x2) - half;
      const maxX = Math.max(cx, x2) + half;
      drawPixelRect(ctx, minX, cy - half, maxX - minX, pathWidth, PALETTE.dirtMid);
      for (let px = minX; px < maxX; px += 8) {
        const h = tileHash(px, cy + 100);
        if (h < 30) drawPixelRect(ctx, px, cy - half, 4, 2, PALETTE.dirtLight);
        if (h > 70) drawPixelRect(ctx, px, cy + half - 2, 3, 2, PALETTE.dirtDark);
      }
    }
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  // Trunk
  drawPixelRect(ctx, x - 2, y - 4, 4, 8, PALETTE.trunkBrown);
  // Foliage (3 layers for roundish canopy)
  const fg = variant === 0 ? PALETTE.foliageGreen : variant === 1 ? PALETTE.foliageDark : "#3a9040";
  drawPixelRect(ctx, x - 8, y - 12, 16, 6, fg);
  drawPixelRect(ctx, x - 10, y - 18, 20, 8, fg);
  drawPixelRect(ctx, x - 6, y - 22, 12, 6, fg);
  // Highlights
  drawPixelRect(ctx, x - 4, y - 20, 4, 2, PALETTE.grassAccent);
  drawPixelRect(ctx, x + 2, y - 16, 3, 2, PALETTE.grassLight);
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  const color = variant === 0 ? PALETTE.foliageGreen : "#4a9838";
  drawPixelRect(ctx, x - 6, y - 4, 12, 6, color);
  drawPixelRect(ctx, x - 8, y - 2, 16, 4, color);
  // Highlight
  drawPixelRect(ctx, x - 2, y - 4, 4, 2, PALETTE.grassAccent);
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  // Stem
  drawPixelRect(ctx, x, y - 2, 1, 4, PALETTE.foliageGreen);
  // Petals
  const colors = [PALETTE.flowerRed, PALETTE.flowerYellow, PALETTE.flowerPink];
  const c = colors[variant % 3];
  drawPixelRect(ctx, x - 1, y - 4, 3, 3, c);
  // Center
  drawPixelRect(ctx, x, y - 3, 1, 1, PALETTE.flowerYellow);
}

function drawDecorations(ctx: CanvasRenderingContext2D) {
  for (const dec of DECORATIONS) {
    switch (dec.type) {
      case "tree":
        drawTree(ctx, dec.x, dec.y, dec.variant);
        break;
      case "bush":
        drawBush(ctx, dec.x, dec.y, dec.variant);
        break;
      case "flower":
        drawFlower(ctx, dec.x, dec.y, dec.variant);
        break;
    }
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const style = BUILDING_STYLES[loc.name] || { roof: PALETTE.roofDefault, accent: PALETTE.wallCream };
  const { x, y, width: w, height: h } = loc;

  // Wall
  drawPixelRect(ctx, x + 2, y + 10, w - 4, h - 12, PALETTE.wallCream);
  // Wall shadow (right + bottom)
  drawPixelRect(ctx, x + w - 4, y + 10, 2, h - 12, PALETTE.wallShadow);
  drawPixelRect(ctx, x + 2, y + h - 4, w - 4, 2, PALETTE.wallShadow);

  // Roof (triangular-ish using stacked rects)
  const roofH = 14;
  for (let i = 0; i < roofH; i += 2) {
    const inset = Math.floor(i * 0.8);
    drawPixelRect(ctx, x - 2 + inset, y + roofH - i - 2, w + 4 - inset * 2, 2, style.roof);
  }
  // Roof edge highlight
  drawPixelRect(ctx, x - 2, y + roofH - 2, w + 4, 2, style.accent);

  // Door
  const doorX = x + Math.floor(w / 2) - 4;
  const doorY = y + h - 14;
  drawPixelRect(ctx, doorX, doorY, 8, 12, PALETTE.doorBrown);
  drawPixelRect(ctx, doorX + 5, doorY + 5, 2, 2, PALETTE.flowerYellow); // doorknob

  // Windows (2 windows flanking door)
  const winY = y + 18;
  if (w >= 60) {
    // Left window
    drawPixelRect(ctx, x + 10, winY, 10, 8, PALETTE.windowBlue);
    drawPixelRect(ctx, x + 10, winY, 10, 2, PALETTE.windowShine);
    drawPixelRect(ctx, x + 14, winY, 2, 8, PALETTE.wallCream); // mullion
    // Right window
    drawPixelRect(ctx, x + w - 22, winY, 10, 8, PALETTE.windowBlue);
    drawPixelRect(ctx, x + w - 22, winY, 10, 2, PALETTE.windowShine);
    drawPixelRect(ctx, x + w - 18, winY, 2, 8, PALETTE.wallCream);
  }

  // Sign (name below building)
  const cx = x + w / 2;
  ctx.fillStyle = PALETTE.signWood;
  const signW = Math.min(w - 8, ctx.measureText(loc.name).width + 12);
  drawPixelRect(ctx, cx - signW / 2, y + h + 2, signW, 12, PALETTE.signWood);
  ctx.fillStyle = PALETTE.textLight;
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(loc.name, cx, y + h + 11);
}

function drawOutdoorLocation(ctx: CanvasRenderingContext2D, loc: LocationData) {
  const { x, y, width: w, height: h } = loc;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (loc.name === "Town Square") {
    // Cobblestone area
    for (let ty = y; ty < y + h; ty += 8) {
      for (let tx = x; tx < x + w; tx += 8) {
        const th = tileHash(tx + 500, ty + 500);
        const c = th < 40 ? "#a09080" : th < 70 ? "#908070" : "#b0a090";
        drawPixelRect(ctx, tx, ty, 8, 8, c);
        // Gaps between cobblestones
        drawPixelRect(ctx, tx, ty, 8, 1, PALETTE.dirtDark);
        drawPixelRect(ctx, tx, ty, 1, 8, PALETTE.dirtDark);
      }
    }
    // Fountain (center)
    drawPixelRect(ctx, cx - 10, cy - 8, 20, 16, "#708898");  // basin
    drawPixelRect(ctx, cx - 12, cy + 4, 24, 4, "#607888");   // base
    drawPixelRect(ctx, cx - 2, cy - 14, 4, 10, "#809098");   // spout
    // Water
    drawPixelRect(ctx, cx - 8, cy - 4, 16, 8, PALETTE.waterBlue);
    drawPixelRect(ctx, cx - 4, cy - 2, 8, 4, PALETTE.waterLight);

    // Sign
    ctx.fillStyle = PALETTE.signWood;
    drawPixelRect(ctx, cx - 30, y + h + 2, 60, 12, PALETTE.signWood);
    ctx.fillStyle = PALETTE.textLight;
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Town Square", cx, y + h + 11);
  } else if (loc.name === "Consensus Park") {
    // Slightly lighter grass patch
    drawPixelRect(ctx, x, y, w, h, PALETTE.grassLight);
    // Border detail
    for (let px = x; px < x + w; px += 6) {
      drawPixelRect(ctx, px, y, 4, 2, PALETTE.grassAccent);
      drawPixelRect(ctx, px, y + h - 2, 4, 2, PALETTE.grassAccent);
    }
    // Trees in park
    drawTree(ctx, x + 14, cy - 6, 0);
    drawTree(ctx, x + w - 14, cy - 6, 1);
    drawTree(ctx, cx, y + 10, 2);
    // Bench
    drawPixelRect(ctx, cx - 8, cy + 4, 16, 3, PALETTE.trunkBrown);
    drawPixelRect(ctx, cx - 10, cy + 7, 2, 4, PALETTE.trunkBrown);
    drawPixelRect(ctx, cx + 8, cy + 7, 2, 4, PALETTE.trunkBrown);

    // Sign
    drawPixelRect(ctx, cx - 36, y + h + 2, 72, 12, PALETTE.signWood);
    ctx.fillStyle = PALETTE.textLight;
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Consensus Park", cx, y + h + 11);
  } else {
    // Generic outdoor area
    drawPixelRect(ctx, x, y, w, h, PALETTE.grassLight);
    ctx.fillStyle = PALETTE.signWood;
    const signW = Math.min(w, ctx.measureText(loc.name).width + 12);
    drawPixelRect(ctx, cx - signW / 2, y + h + 2, signW, 12, PALETTE.signWood);
    ctx.fillStyle = PALETTE.textLight;
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(loc.name, cx, y + h + 11);
  }
}

function drawPixelSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  agent: AgentData,
  tick: number,
  isSelected: boolean
) {
  const firstName = agent.name.split(" ")[0];
  const colors = AGENT_COLORS[firstName] || DEFAULT_AGENT_COLOR;
  const isWalking = agent.status === "walking";
  const isTalking = agent.status === "talking";

  // Walk animation: bob up/down every other frame
  const bob = isWalking ? (Math.floor(tick / 4) % 2) * -1 : 0;
  const sy = y + bob; // sprite y with bob

  // Selection bouncing arrow above head
  if (isSelected) {
    const arrowBob = Math.floor(Math.sin(tick * 0.2) * 3);
    drawPixelRect(ctx, x - 2, sy - 24 + arrowBob, 4, 4, "#fff");
    drawPixelRect(ctx, x - 1, sy - 20 + arrowBob, 2, 2, "#fff");
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Legs (2x4 each) ──
  const legSpread = isWalking ? (Math.floor(tick / 4) % 2 === 0 ? 1 : -1) : 0;
  drawPixelRect(ctx, x - 3 - legSpread, sy + 2, 2, 5, "#3a3a60");  // left leg
  drawPixelRect(ctx, x + 1 + legSpread, sy + 2, 2, 5, "#3a3a60");  // right leg
  // Shoes
  drawPixelRect(ctx, x - 4 - legSpread, sy + 6, 3, 2, "#2a2020");
  drawPixelRect(ctx, x + 1 + legSpread, sy + 6, 3, 2, "#2a2020");

  // ── Body (shirt) 8x6 ──
  drawPixelRect(ctx, x - 4, sy - 4, 8, 6, colors.shirt);
  // Shirt shade
  drawPixelRect(ctx, x + 2, sy - 3, 2, 4, mixColor(colors.shirt, "#000000", 0.2));

  // Arms
  if (isTalking) {
    // One arm raised when talking
    const armUp = Math.floor(tick / 6) % 2;
    drawPixelRect(ctx, x - 6, sy - 3 + (armUp ? -2 : 0), 2, 4, colors.shirt);
    drawPixelRect(ctx, x + 4, sy - 3 + (armUp ? 0 : -2), 2, 4, colors.shirt);
    // Hands
    drawPixelRect(ctx, x - 6, sy - 3 + (armUp ? -2 : 0) - 1, 2, 2, "#e8b888");
    drawPixelRect(ctx, x + 4, sy - 3 + (armUp ? 0 : -2) - 1, 2, 2, "#e8b888");
  } else {
    drawPixelRect(ctx, x - 6, sy - 3, 2, 5, colors.shirt);
    drawPixelRect(ctx, x + 4, sy - 3, 2, 5, colors.shirt);
    // Hands
    drawPixelRect(ctx, x - 6, sy + 1, 2, 2, "#e8b888");
    drawPixelRect(ctx, x + 4, sy + 1, 2, 2, "#e8b888");
  }

  // ── Head (6x6 skin) ──
  drawPixelRect(ctx, x - 3, sy - 10, 6, 6, "#e8b888");
  // Eyes (2 pixels)
  drawPixelRect(ctx, x - 2, sy - 8, 1, 1, "#2a1a08");
  drawPixelRect(ctx, x + 1, sy - 8, 1, 1, "#2a1a08");
  // Mouth
  if (isTalking && Math.floor(tick / 4) % 2 === 0) {
    drawPixelRect(ctx, x - 1, sy - 6, 2, 1, "#c06060"); // open mouth
  }

  // ── Hair (on top of head) ──
  drawPixelRect(ctx, x - 3, sy - 12, 6, 3, colors.hair);
  drawPixelRect(ctx, x - 4, sy - 11, 1, 3, colors.hair); // side hair left
  drawPixelRect(ctx, x + 3, sy - 11, 1, 3, colors.hair); // side hair right

  // ── Name label ──
  ctx.fillStyle = "#000000a0";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(firstName, x + 1, sy - 15);
  ctx.fillStyle = isSelected ? "#ffffff" : PALETTE.textLight;
  ctx.fillText(firstName, x, sy - 16);
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  initial: string,
  status: string,
  tick: number
) {
  // Only show for active states
  if (status !== "talking" && status !== "reflecting") return;

  const bubbleY = y - 32;
  const isReflecting = status === "reflecting";
  const dots = isReflecting;

  // Bubble body
  drawPixelRect(ctx, x - 12, bubbleY - 8, 24, 12, PALETTE.bubbleWhite);
  // Pointer
  drawPixelRect(ctx, x - 2, bubbleY + 4, 4, 3, PALETTE.bubbleWhite);
  // Border (1px)
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 12, bubbleY - 8, 24, 12);

  if (dots) {
    // Thinking dots animation
    const dotPhase = Math.floor(tick / 6) % 3;
    for (let i = 0; i < 3; i++) {
      const alpha = i === dotPhase ? 1 : 0.3;
      ctx.fillStyle = `rgba(80,80,80,${alpha})`;
      drawPixelRect(ctx, x - 6 + i * 6, bubbleY - 4, 3, 3, ctx.fillStyle);
    }
  } else {
    // Agent initial + speech icon
    ctx.fillStyle = PALETTE.textDark;
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(initial + "~", x, bubbleY + 1);
  }
}

function drawConversationCallout(
  ctx: CanvasRenderingContext2D,
  convo: ConvoData,
  agents: Record<string, AgentData>
) {
  if (convo.messages.length === 0) return;
  const lastMsg = convo.messages[convo.messages.length - 1];

  // Find midpoint between participants
  const a1 = agents[convo.participants[0]];
  const a2 = agents[convo.participants[1]];
  if (!a1 || !a2) return;

  const mx = (a1.position.x + a2.position.x) / 2;
  const my = Math.min(a1.position.y, a2.position.y) - 50;

  const text = lastMsg.content.slice(0, 45) + (lastMsg.content.length > 45 ? "..." : "");
  const speaker = lastMsg.agentName.split(" ")[0];
  const fullText = `${speaker}: ${text}`;

  ctx.font = "7px monospace";
  const tw = Math.min(ctx.measureText(fullText).width + 16, 200);
  const boxX = Math.max(4, Math.min(796 - tw, mx - tw / 2));
  const boxY = Math.max(4, my - 8);

  // Parchment background
  drawPixelRect(ctx, boxX, boxY, tw, 16, PALETTE.parchment);
  // Border
  ctx.strokeStyle = PALETTE.parchmentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, tw, 16);

  // Text
  ctx.fillStyle = PALETTE.textDark;
  ctx.font = "7px monospace";
  ctx.textAlign = "left";
  ctx.fillText(fullText, boxX + 4, boxY + 11, tw - 8);
}

// Simple color mixing helper
function mixColor(c1: string, c2: string, t: number): string {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Component ───────────────────────────────────────────────────────

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

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
          // Refresh world state and conversation history
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

    // Initial fetch
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

  // Draw world on canvas — pixel art pipeline
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    tickRef.current++;
    const tick = tickRef.current;

    // Disable image smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false;

    // ─── 1. Grass Background ───
    drawGrassBackground(ctx);

    // ─── 2. Dirt Paths ───
    drawDirtPaths(ctx);

    // ─── 3. Decorations ───
    drawDecorations(ctx);

    // ─── 4. Buildings & Outdoor Locations ───
    for (const loc of world.locations) {
      const isOutdoor = loc.type !== "building";
      if (isOutdoor) {
        drawOutdoorLocation(ctx, loc);
      } else {
        drawBuilding(ctx, loc);
      }
    }

    // ─── 5. Conversation Connector Dots ───
    for (const convo of conversations) {
      if (convo.participants.length >= 2) {
        const a1 = world.agents[convo.participants[0]];
        const a2 = world.agents[convo.participants[1]];
        if (a1 && a2) {
          // Dotted path between talking agents
          const dx = a2.position.x - a1.position.x;
          const dy = a2.position.y - a1.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const steps = Math.floor(dist / 8);
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = a1.position.x + dx * t;
            const py = a1.position.y + dy * t;
            // Animate: shift which dots are visible
            if ((i + Math.floor(tick / 3)) % 3 === 0) {
              drawPixelRect(ctx, px - 1, py - 1, 3, 3, "#f472b680");
            }
          }
        }
      }
    }

    // ─── 6. Agent Sprites ───
    for (const [id, agent] of Object.entries(world.agents)) {
      const isSelected = id === selectedAgent;
      drawPixelSprite(ctx, agent.position.x, agent.position.y, agent, tick, isSelected);
    }

    // ─── 7. Speech Bubbles ───
    for (const [, agent] of Object.entries(world.agents)) {
      if (agent.status === "talking" || agent.status === "reflecting") {
        drawSpeechBubble(ctx, agent.position.x, agent.position.y, agent.name[0], agent.status, tick);
      }
    }

    // ─── 8. Conversation Callout Text ───
    for (const convo of conversations) {
      drawConversationCallout(ctx, convo, world.agents);
    }

    // ─── 9. Selected Agent Action Tooltip ───
    if (selectedAgent && world.agents[selectedAgent]?.currentAction) {
      const agent = world.agents[selectedAgent];
      const text = agent.currentAction!.slice(0, 50) + (agent.currentAction!.length > 50 ? "..." : "");
      ctx.font = "8px monospace";
      const tw = ctx.measureText(text).width + 16;
      const tx = Math.max(tw / 2 + 2, Math.min(798 - tw / 2, agent.position.x));
      const ty = agent.position.y + 14;

      // Pixel-style tooltip box
      drawPixelRect(ctx, tx - tw / 2, ty, tw, 14, PALETTE.parchment);
      ctx.strokeStyle = PALETTE.parchmentBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx - tw / 2, ty, tw, 14);
      ctx.fillStyle = PALETTE.textDark;
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(text, tx, ty + 10);
    }

    // ─── 10. Paused Overlay ───
    if (paused) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, 800, 600);
      // Pixel-style pause text
      drawPixelRect(ctx, 330, 276, 140, 28, "rgba(0,0,0,0.6)");
      ctx.fillStyle = PALETTE.textLight;
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("|| PAUSED", 400, 296);
    }
  }, [world, selectedAgent, conversations, paused]);

  useEffect(() => {
    draw();
    const interval = setInterval(draw, 80); // ~12fps for smooth animations
    return () => clearInterval(interval);
  }, [draw]);

  // Handle click on canvas to select agent
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
    <div style={{ display: "flex", height: "100vh", background: "#2a3a20" }}>
      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: "10px 16px",
          borderBottom: "2px solid #805830",
          background: "linear-gradient(to right, #3a2a18, #4a3620, #3a2a18)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 18, color: PALETTE.textLight, fontFamily: "monospace", letterSpacing: 1 }}>
              Solana Smallville
            </h1>
            {world && (
              <span style={{ fontSize: 13, color: "#c8b898", fontFamily: "monospace" }}>
                Day {world.currentDay} | {formatTime(world.currentTime)} | {Object.keys(world.agents).length} agents
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={togglePause}
              style={{
                padding: "4px 12px", fontSize: 12, fontFamily: "monospace",
                border: "2px solid #805830", borderRadius: 2,
                background: paused ? "#802020" : "#4a3620",
                color: PALETTE.textLight, cursor: "pointer",
              }}
            >
              {paused ? "▶ Resume" : "|| Pause"}
            </button>
            <span style={{ fontSize: 11, color: "#a09070", fontFamily: "monospace" }}>Speed:</span>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                style={{
                  padding: "3px 8px", fontSize: 11, fontFamily: "monospace",
                  border: "2px solid #805830", borderRadius: 2,
                  background: speed === s ? "#805830" : "transparent",
                  color: speed === s ? PALETTE.textLight : "#a09070",
                  cursor: "pointer",
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 12 }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onClick={handleCanvasClick}
            style={{
              border: "3px solid #805830",
              borderRadius: 2,
              cursor: "pointer",
              maxWidth: "100%",
              maxHeight: "100%",
              imageRendering: "pixelated",
            }}
          />
        </div>

        {/* Legend */}
        <div style={{
          padding: "6px 16px",
          borderTop: "2px solid #805830",
          background: "#3a2a18",
          display: "flex",
          gap: 16,
          fontSize: 11,
          fontFamily: "monospace",
        }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 4, color: "#c8b898" }}>
              <div style={{ width: 8, height: 8, backgroundColor: color }} />
              {status}
            </div>
          ))}
          <div style={{ marginLeft: "auto", color: "#a09070", fontSize: 10, fontFamily: "monospace" }}>
            Click an agent to inspect
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 380, borderLeft: "2px solid #805830", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0a0a0a" }}>
        {selectedAgentData ? (
          <AgentPanel agent={selectedAgentData} apiUrl={API_URL} />
        ) : (
          <div style={{ padding: 16, color: "#475569", fontSize: 13 }}>
            Select an agent to view details
          </div>
        )}
        <ConvoStream conversations={conversations} history={convoHistory} />
      </div>
    </div>
  );
}
