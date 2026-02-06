export interface Memory {
  id: string;
  description: string;
  timestamp: number; // simulation time in minutes from start
  importance: number; // 1-10
  embedding: number[]; // vector for cosine similarity
  type: "observation" | "conversation" | "reflection" | "plan";
  agentId: string;
  metadata?: Record<string, unknown>;
}

export interface Plan {
  description: string;
  startTime: number; // minute of day (0-1440)
  duration: number; // minutes
  location?: string;
  status: "pending" | "active" | "completed" | "interrupted";
}

export interface DailyPlan {
  date: number; // simulation day
  overview: string;
  hourlyBlocks: Plan[];
  currentAction: Plan | null;
}

export interface AgentState {
  id: string;
  name: string;
  description: string; // personality seed
  currentLocation: string;
  position: { x: number; y: number };
  memoryStream: Memory[];
  currentPlan: DailyPlan | null;
  status: "idle" | "walking" | "talking" | "reflecting" | "planning";
  currentConversation: Conversation | null;
  wallet?: string; // Solana pubkey
}

export interface Conversation {
  id: string;
  participants: string[]; // agent IDs
  messages: ConversationMessage[];
  startTime: number;
  endTime?: number;
  location: string;
}

export interface ConversationMessage {
  agentId: string;
  agentName: string;
  content: string;
  timestamp: number;
}

export interface WorldState {
  agents: Map<string, AgentState>;
  conversations: Conversation[];
  currentTime: number; // minutes from simulation start
  currentDay: number;
  locations: Location[];
}

export interface Location {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "building" | "outdoor" | "path";
}

export interface SimulationEvent {
  type: "agent_move" | "conversation_start" | "conversation_end" | "conversation_message" | "reflection" | "plan_update" | "observation";
  data: unknown;
  timestamp: number;
}
