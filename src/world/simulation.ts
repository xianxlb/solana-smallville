import { AgentState, WorldState, SimulationEvent, Conversation } from "@/agents/types";
import { PERSONALITIES } from "@/agents/personality-seeds";
import { WORLD_LOCATIONS } from "./locations";
import { getLocationByName, getLocationCenter, moveToward, isAtLocation, randomPositionInLocation } from "./map";
import { generateDailyPlan, getCurrentAction, advancePlan } from "@/agents/planning";
import { perceiveNearbyAgents, observationToMemory } from "@/agents/perception";
import { decideReaction } from "@/agents/reaction";
import { startConversation, generateReply, shouldEndConversation, endConversation, conversationToMemories, isOnCooldown } from "@/agents/conversation";
import { shouldReflect, createMemory } from "@/agents/memory-stream";
import { generateReflections } from "@/agents/reflection";
import { logConversation, logReflection, logPlanCreated } from "@/solana/logger";
import { getWalletAddress } from "@/solana/wallets";

export type EventListener = (event: SimulationEvent) => void;

// These are read lazily (inside methods/constructor) so dotenv has time to load
function getMaxAgents() { return parseInt(process.env.MAX_AGENTS || "8"); }
function getEnableReflections() { return process.env.ENABLE_REFLECTIONS !== "false"; }

export class Simulation {
  world: WorldState;
  private listeners: EventListener[] = [];
  private lastReflectionTime: Map<string, number> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private simulationSpeed = 1; // minutes per tick

  constructor() {
    this.world = {
      agents: new Map(),
      conversations: [],
      currentTime: 480, // 8:00 AM
      currentDay: 1,
      locations: WORLD_LOCATIONS,
    };
    this.initAgents();
  }

  private initAgents() {
    const maxAgents = getMaxAgents();
    const seeds = PERSONALITIES.slice(0, maxAgents);
    console.log(`Initializing ${seeds.length} agents (MAX_AGENTS=${maxAgents})`);
    for (const seed of seeds) {
      const startLoc = WORLD_LOCATIONS[Math.floor(Math.random() * WORLD_LOCATIONS.length)];
      const pos = randomPositionInLocation(startLoc);

      const agent: AgentState = {
        id: seed.id,
        name: seed.name,
        description: seed.description,
        currentLocation: startLoc.name,
        position: pos,
        memoryStream: [],
        currentPlan: null,
        status: "idle",
        currentConversation: null,
        wallet: getWalletAddress(seed.id),
      };

      // Seed initial memory from morning routine
      agent.memoryStream.push(
        createMemory(agent.id, seed.morningRoutine, "observation", this.world.currentTime - 10, 3),
      );

      this.world.agents.set(seed.id, agent);
      this.lastReflectionTime.set(seed.id, this.world.currentTime);
    }
  }

  onEvent(listener: EventListener) {
    this.listeners.push(listener);
  }

  private emit(event: SimulationEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async tick() {
    this.world.currentTime += this.simulationSpeed;

    // Day rollover
    if (this.world.currentTime >= 1440) {
      this.world.currentTime = 480; // reset to 8am
      this.world.currentDay++;
    }

    const minuteOfDay = this.world.currentTime % 1440;

    for (const [id, agent] of this.world.agents) {
      try {
        await this.tickAgent(agent, minuteOfDay);
      } catch (err) {
        console.error(`Error ticking agent ${id}:`, err);
      }
    }
  }

  private async tickAgent(agent: AgentState, minuteOfDay: number) {
    // 1. Generate daily plan if needed
    if (!agent.currentPlan || agent.currentPlan.date !== this.world.currentDay) {
      agent.status = "planning";
      const locationNames = WORLD_LOCATIONS.map((l) => l.name);
      agent.currentPlan = await generateDailyPlan(
        agent,
        this.world.currentTime,
        this.world.currentDay,
        locationNames,
      );
      this.emit({
        type: "plan_update",
        data: { agentId: agent.id, plan: agent.currentPlan },
        timestamp: this.world.currentTime,
      });
      // Log plan creation on-chain
      logPlanCreated(agent.id, agent.currentPlan.overview, this.world.currentDay).catch(() => {});
    }

    // 2. If in conversation, handle conversation turn
    if (agent.currentConversation) {
      await this.handleConversationTurn(agent);
      return; // don't move or perceive during conversation
    }

    // 3. Advance plan
    advancePlan(agent.currentPlan!, minuteOfDay);
    const action = getCurrentAction(agent.currentPlan!, minuteOfDay);

    // 4. Move toward action location
    if (action?.location) {
      const targetLoc = getLocationByName(action.location);
      if (targetLoc) {
        const target = getLocationCenter(targetLoc);
        if (!isAtLocation(agent.position, targetLoc)) {
          agent.status = "walking";
          agent.position = moveToward(agent.position, target, 3);
          this.emit({
            type: "agent_move",
            data: { agentId: agent.id, position: agent.position, targetLocation: action.location },
            timestamp: this.world.currentTime,
          });
        } else {
          agent.currentLocation = targetLoc.name;
          agent.status = "idle";
        }
      }
    }

    // 5. Perceive nearby agents
    const observations = perceiveNearbyAgents(agent, this.world.agents);
    for (const obs of observations) {
      const memory = await observationToMemory(agent, obs, this.world.currentTime);
      agent.memoryStream.push(memory);

      // 6. Decide reaction (skip if on cooldown to avoid repeated convos)
      if (obs.subjectId && isOnCooldown(agent.id, obs.subjectId, this.world.currentTime)) continue;
      const reaction = await decideReaction(agent, obs, this.world.agents, this.world.currentTime);
      if (reaction.type === "start_conversation" && obs.subjectId) {
        const other = this.world.agents.get(reaction.targetAgentId);
        if (other && !other.currentConversation) {
          const convo = startConversation(agent, other, reaction.openingLine, this.world.currentTime);
          this.world.conversations.push(convo);
          this.emit({
            type: "conversation_start",
            data: { conversationId: convo.id, participants: convo.participants, openingLine: reaction.openingLine },
            timestamp: this.world.currentTime,
          });
        }
      }
    }

    // 7. Check reflection trigger (can be disabled to save LLM credits)
    if (!getEnableReflections()) return;
    const lastReflection = this.lastReflectionTime.get(agent.id) || 0;
    if (shouldReflect(agent, lastReflection)) {
      agent.status = "reflecting";
      const reflections = await generateReflections(agent, this.world.currentTime);
      agent.memoryStream.push(...reflections);
      this.lastReflectionTime.set(agent.id, this.world.currentTime);
      for (const r of reflections) {
        this.emit({
          type: "reflection",
          data: { agentId: agent.id, reflection: r.description },
          timestamp: this.world.currentTime,
        });
        // Log reflection on-chain
        logReflection(agent.id, r.description, this.world.currentTime).catch(() => {});
      }
      agent.status = "idle";
    }
  }

  private async handleConversationTurn(agent: AgentState) {
    const convo = agent.currentConversation!;
    const lastMessage = convo.messages[convo.messages.length - 1];

    // Only respond if the last message wasn't from this agent
    if (lastMessage.agentId === agent.id) return;

    // Check if conversation should end
    if (await shouldEndConversation(agent, convo)) {
      const memories = await conversationToMemories(convo, this.world.agents, this.world.currentTime);
      for (const mem of memories) {
        const memAgent = this.world.agents.get(mem.agentId);
        if (memAgent) memAgent.memoryStream.push(mem);
      }
      endConversation(convo, this.world.agents, this.world.currentTime);
      this.emit({
        type: "conversation_end",
        data: { conversationId: convo.id },
        timestamp: this.world.currentTime,
      });
      // Log conversation on-chain
      logConversation(convo.participants, convo.location, convo.messages.length, this.world.currentTime).catch(() => {});
      return;
    }

    // Generate reply
    const reply = await generateReply(agent, convo, this.world.agents, this.world.currentTime);
    convo.messages.push({
      agentId: agent.id,
      agentName: agent.name,
      content: reply,
      timestamp: this.world.currentTime,
    });

    this.emit({
      type: "conversation_message",
      data: { conversationId: convo.id, agentId: agent.id, agentName: agent.name, content: reply },
      timestamp: this.world.currentTime,
    });
  }

  private intervalMs = 2000;
  private paused = false;

  start(intervalMs = 2000) {
    this.intervalMs = intervalMs;
    console.log(`Simulation started. Day ${this.world.currentDay}, Time: ${this.world.currentTime}`);
    this.tickInterval = setInterval(() => {
      if (!this.paused) this.tick();
    }, intervalMs);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    console.log("Simulation stopped.");
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }
  isPaused() { return this.paused; }

  setSpeed(speed: number) {
    this.simulationSpeed = Math.max(1, Math.min(10, speed));
  }

  getSpeed() { return this.simulationSpeed; }

  getWorldSnapshot() {
    const agents: Record<string, unknown> = {};
    for (const [id, agent] of this.world.agents) {
      agents[id] = {
        id: agent.id,
        name: agent.name,
        position: agent.position,
        status: agent.status,
        currentLocation: agent.currentLocation,
        currentAction: agent.currentPlan?.currentAction?.description || null,
        conversationId: agent.currentConversation?.id || null,
        wallet: agent.wallet || null,
        memoryCount: agent.memoryStream.length,
        recentMemories: agent.memoryStream.slice(-5).map((m) => ({
          description: m.description,
          type: m.type,
          importance: m.importance,
        })),
      };
    }
    return {
      currentTime: this.world.currentTime,
      currentDay: this.world.currentDay,
      agents,
      activeConversations: this.world.conversations
        .filter((c) => !c.endTime)
        .map((c) => ({
          id: c.id,
          participants: c.participants,
          messages: c.messages,
          location: c.location,
        })),
      locations: this.world.locations,
    };
  }
}
