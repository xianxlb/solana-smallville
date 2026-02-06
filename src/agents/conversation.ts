import Anthropic from "@anthropic-ai/sdk";
import { AgentState, Conversation, ConversationMessage, Memory } from "./types";
import { retrieveMemories, createMemory, scoreImportance } from "./memory-stream";

const anthropic = new Anthropic();

let convoCounter = 0;

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

  // Retrieve relevant memories
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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `You are ${respondent.name}. ${respondent.description}

You are having a conversation with ${otherName} at ${conversation.location}.

Your relevant memories:
${memoryContext}

Conversation so far:
${convoHistory}

Respond in character as ${respondent.name}. Keep your response to 1-3 sentences. Be natural and stay true to your personality.`,
      },
    ],
  });

  return response.content[0].type === "text"
    ? response.content[0].text.trim()
    : "...";
}

export async function shouldEndConversation(
  agent: AgentState,
  conversation: Conversation,
): Promise<boolean> {
  // End after 5-8 exchanges or if conversation has been going on too long
  if (conversation.messages.length >= 8) return true;
  if (conversation.messages.length < 4) return false;

  // 30% chance to end each turn after 4 messages
  return Math.random() < 0.3;
}

export function endConversation(
  conversation: Conversation,
  allAgents: Map<string, AgentState>,
  currentTime: number,
): void {
  conversation.endTime = currentTime;
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
  const summary = conversation.messages
    .map((m) => `${m.agentName}: ${m.content}`)
    .join("\n");

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
