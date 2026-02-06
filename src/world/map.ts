import { Location, AgentState } from "@/agents/types";
import { WORLD_LOCATIONS } from "./locations";

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;
export const TILE_SIZE = 16;

export function getLocationAt(x: number, y: number): Location | null {
  for (const loc of WORLD_LOCATIONS) {
    if (x >= loc.x && x <= loc.x + loc.width && y >= loc.y && y <= loc.y + loc.height) {
      return loc;
    }
  }
  return null;
}

export function getLocationByName(name: string): Location | null {
  return WORLD_LOCATIONS.find((l) => l.name === name || l.id === name) || null;
}

export function getLocationCenter(loc: Location): { x: number; y: number } {
  return {
    x: loc.x + loc.width / 2,
    y: loc.y + loc.height / 2,
  };
}

// Simple pathfinding: move toward target in a straight line
// (Good enough for MVP — agents walk directly to destinations)
export function moveToward(
  current: { x: number; y: number },
  target: { x: number; y: number },
  speed: number = 2,
): { x: number; y: number } {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < speed) {
    return { ...target };
  }

  return {
    x: current.x + (dx / dist) * speed,
    y: current.y + (dy / dist) * speed,
  };
}

export function isAtLocation(pos: { x: number; y: number }, loc: Location, threshold = 10): boolean {
  const center = getLocationCenter(loc);
  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  return Math.sqrt(dx * dx + dy * dy) < threshold;
}

export function randomPositionInLocation(loc: Location): { x: number; y: number } {
  return {
    x: loc.x + Math.random() * loc.width,
    y: loc.y + Math.random() * loc.height,
  };
}
