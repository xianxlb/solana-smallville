import { AgentState, Location, Memory } from "./types";
import { createMemory, scoreImportance } from "./memory-stream";

const PROXIMITY_THRESHOLD = 80; // pixels — triggers awareness of nearby agents

export interface Observation {
  type: "agent_nearby" | "entered_location" | "left_location";
  description: string;
  subjectId?: string; // nearby agent ID
  locationId?: string;
}

export function perceiveNearbyAgents(
  agent: AgentState,
  allAgents: Map<string, AgentState>,
): Observation[] {
  const observations: Observation[] = [];
  for (const [id, other] of allAgents) {
    if (id === agent.id) continue;
    if (other.currentConversation) continue; // don't interrupt conversations

    const dx = agent.position.x - other.position.x;
    const dy = agent.position.y - other.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < PROXIMITY_THRESHOLD) {
      observations.push({
        type: "agent_nearby",
        description: `${agent.name} noticed ${other.name} nearby at ${other.currentLocation}.`,
        subjectId: other.id,
      });
    }
  }
  return observations;
}

export function perceiveLocation(
  agent: AgentState,
  locations: Location[],
  previousLocation: string | null,
): Observation | null {
  for (const loc of locations) {
    const inBounds =
      agent.position.x >= loc.x &&
      agent.position.x <= loc.x + loc.width &&
      agent.position.y >= loc.y &&
      agent.position.y <= loc.y + loc.height;

    if (inBounds && loc.id !== previousLocation) {
      return {
        type: "entered_location",
        description: `${agent.name} entered ${loc.name}. ${loc.description}`,
        locationId: loc.id,
      };
    }
  }

  if (previousLocation) {
    const prevLoc = locations.find((l) => l.id === previousLocation);
    if (prevLoc) {
      const stillIn =
        agent.position.x >= prevLoc.x &&
        agent.position.x <= prevLoc.x + prevLoc.width &&
        agent.position.y >= prevLoc.y &&
        agent.position.y <= prevLoc.y + prevLoc.height;
      if (!stillIn) {
        return {
          type: "left_location",
          description: `${agent.name} left ${prevLoc.name}.`,
          locationId: previousLocation,
        };
      }
    }
  }

  return null;
}

export async function observationToMemory(
  agent: AgentState,
  obs: Observation,
  currentTime: number,
): Promise<Memory> {
  // Quick heuristic: agent encounters are more important than location changes
  const importance =
    obs.type === "agent_nearby" ? 5 : obs.type === "entered_location" ? 3 : 2;
  return createMemory(agent.id, obs.description, "observation", currentTime, importance);
}
