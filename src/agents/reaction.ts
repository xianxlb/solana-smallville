import { chatCompletion } from "./llm";
import { AgentState } from "./types";
import { retrieveMemories } from "./memory-stream";
import { Observation } from "./perception";

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
  if (observation.type !== "agent_nearby" || !observation.subjectId) {
    return { type: "continue" };
  }

  if (agent.currentConversation) {
    return { type: "continue" };
  }

  const otherAgent = allAgents.get(observation.subjectId);
  if (!otherAgent || otherAgent.currentConversation) {
    return { type: "continue" };
  }

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

  const text = await chatCompletion(
    `You are ${agent.name}. ${agent.description}`,
    `You just noticed ${otherAgent.name} nearby. ${otherAgent.description}

${memoryContext}

You are currently: ${currentActivity}

Should you start a conversation with ${otherAgent.name}? Consider your personality, current activity, and history.

Respond in JSON:
- If yes: {"react": true, "opening": "your opening line to them"}
- If no: {"react": false}`,
    200,
  );

  try {
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { react: false };

    if (parsed.react) {
      return {
        type: "start_conversation",
        targetAgentId: observation.subjectId,
        openingLine: parsed.opening || `Hey ${otherAgent.name}!`,
      };
    }
  } catch {
    // JSON parse failed, continue
  }

  return { type: "continue" };
}
