import Anthropic from "@anthropic-ai/sdk";
import { AgentState, Memory } from "./types";
import { retrieveMemories } from "./memory-stream";
import { Observation } from "./perception";

const anthropic = new Anthropic();

export type ReactionDecision =
  | { type: "continue" }
  | { type: "start_conversation"; targetAgentId: string; openingLine: string }
  | { type: "change_activity"; newActivity: string; newLocation: string };

export async function decideReaction(
  agent: AgentState,
  observation: Observation,
  allAgents: Map<string, AgentState>,
  currentTime: number,
): Promise<ReactionDecision> {
  // Only consider reacting to nearby agents
  if (observation.type !== "agent_nearby" || !observation.subjectId) {
    return { type: "continue" };
  }

  // Don't initiate if already in conversation
  if (agent.currentConversation) {
    return { type: "continue" };
  }

  const otherAgent = allAgents.get(observation.subjectId);
  if (!otherAgent || otherAgent.currentConversation) {
    return { type: "continue" };
  }

  // Retrieve memories about this agent
  const memories = retrieveMemories(
    agent,
    `${otherAgent.name} conversation interaction`,
    currentTime,
    5,
  );

  const memoryContext = memories.length > 0
    ? `Your memories involving ${otherAgent.name}:\n${memories.map((m) => `- ${m.description}`).join("\n")}`
    : `You don't have many memories of ${otherAgent.name} yet.`;

  const currentActivity = agent.currentPlan?.currentAction?.description || "walking around";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `You are ${agent.name}. ${agent.description}

You just noticed ${otherAgent.name} nearby. ${otherAgent.description}

${memoryContext}

You are currently: ${currentActivity}

Should you start a conversation with ${otherAgent.name}? Consider your personality, current activity, and history.

Respond in JSON:
- If yes: {"react": true, "opening": "your opening line to them"}
- If no: {"react": false}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : '{"react": false}';
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { react: false };

  if (parsed.react) {
    return {
      type: "start_conversation",
      targetAgentId: observation.subjectId,
      openingLine: parsed.opening || `Hey ${otherAgent.name}!`,
    };
  }

  return { type: "continue" };
}
