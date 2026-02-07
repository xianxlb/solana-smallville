import { chatCompletion } from "./llm";
import { AgentState, Conversation, Memory } from "./types";
import { retrieveMemories, createMemory, scoreImportance } from "./memory-stream";

let convoCounter = 0;

// Track cooldowns: "agentA-agentB" => lastConvoEndTime
const conversationCooldowns = new Map<string, number>();
const COOLDOWN_MINUTES = 30; // min sim-minutes between conversations with same agent

function cooldownKey(a: string, b: string): string {
  return [a, b].sort().join("-");
}

export function isOnCooldown(agentId: string, otherId: string, currentTime: number): boolean {
  const key = cooldownKey(agentId, otherId);
  const lastEnd = conversationCooldowns.get(key);
  if (!lastEnd) return false;
  return (currentTime - lastEnd) < COOLDOWN_MINUTES;
}

function setCooldown(agentId: string, otherId: string, currentTime: number): void {
  conversationCooldowns.set(cooldownKey(agentId, otherId), currentTime);
}

export function startConversation(
  agent1: AgentState,
  agent2: AgentState,
  openingLine: string,
  currentTime: number,
): Conversation {
  const convo: Conversation = {
    id: `convo-${++convoCounter}`,
    participants: [agent1.id, agent2.id],
    messages: [
      {
        agentId: agent1.id,
        agentName: agent1.name,
        content: openingLine,
        timestamp: currentTime,
      },
    ],
    startTime: currentTime,
    location: agent1.currentLocation,
  };
  agent1.currentConversation = convo;
  agent2.currentConversation = convo;
  agent1.status = "talking";
  agent2.status = "talking";
  return convo;
}

export async function generateReply(
  respondent: AgentState,
  conversation: Conversation,
  allAgents: Map<string, AgentState>,
  currentTime: number,
): Promise<string> {
  const otherParticipantId = conversation.participants.find((id) => id !== respondent.id)!;
  const otherAgent = allAgents.get(otherParticipantId);
  const otherName = otherAgent?.name || "someone";

  const topicHints = conversation.messages
    .slice(-3)
    .map((m) => m.content)
    .join(" ");
  const memories = retrieveMemories(respondent, `${otherName} ${topicHints}`, currentTime, 8);

  const memoryContext = memories
    .map((m) => `- ${m.description}`)
    .join("\n");

  const convoHistory = conversation.messages
    .map((m) => `${m.agentName}: ${m.content}`)
    .join("\n");

  const reply = await chatCompletion(
    `You are ${respondent.name}. ${respondent.description}`,
    `You are having a conversation with ${otherName} at ${conversation.location}.

Your relevant memories:
${memoryContext}

Conversation so far:
${convoHistory}

Respond in character as ${respondent.name}. Keep your response to 1-3 sentences. Be natural and stay true to your personality.`,
    200,
  );

  return reply || "...";
}

export async function shouldEndConversation(
  _agent: AgentState,
  conversation: Conversation,
): Promise<boolean> {
  if (conversation.messages.length >= 8) return true;
  if (conversation.messages.length < 4) return false;
  return Math.random() < 0.3;
}

export function endConversation(
  conversation: Conversation,
  allAgents: Map<string, AgentState>,
  currentTime: number,
): void {
  conversation.endTime = currentTime;
  // Set cooldown between participants
  if (conversation.participants.length === 2) {
    setCooldown(conversation.participants[0], conversation.participants[1], currentTime);
  }
  for (const participantId of conversation.participants) {
    const agent = allAgents.get(participantId);
    if (agent) {
      agent.currentConversation = null;
      agent.status = "idle";
    }
  }
}

export async function conversationToMemories(
  conversation: Conversation,
  allAgents: Map<string, AgentState>,
  currentTime: number,
): Promise<Memory[]> {
  const memories: Memory[] = [];

  for (const participantId of conversation.participants) {
    const agent = allAgents.get(participantId);
    if (!agent) continue;

    const otherNames = conversation.participants
      .filter((id) => id !== participantId)
      .map((id) => allAgents.get(id)?.name || "someone");

    const description = `Had a conversation with ${otherNames.join(" and ")} at ${conversation.location} about: ${conversation.messages.slice(0, 2).map((m) => m.content).join(" ")}`;

    const importance = await scoreImportance(description);
    memories.push(createMemory(participantId, description, "conversation", currentTime, importance));
  }

  return memories;
}
