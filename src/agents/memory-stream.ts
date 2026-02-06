import Anthropic from "@anthropic-ai/sdk";
import { Memory, AgentState } from "./types";

const anthropic = new Anthropic();

// Simple embedding using Claude — returns a normalized vector
// For MVP, we use a hash-based pseudo-embedding for speed,
// and fall back to LLM for importance scoring
export function pseudoEmbed(text: string): number[] {
  const dim = 64;
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dim] += text.charCodeAt(i);
  }
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

export async function scoreImportance(description: string): Promise<number> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: `On a scale of 1 to 10, where 1 is entirely mundane (e.g., brushing teeth, walking) and 10 is extremely poignant or life-changing (e.g., a breakup, major achievement), rate the importance of the following memory. Respond with ONLY a number.\n\nMemory: "${description}"`,
      },
    ],
  });
  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "5";
  const score = parseInt(text, 10);
  return isNaN(score) ? 5 : Math.max(1, Math.min(10, score));
}

export function createMemory(
  agentId: string,
  description: string,
  type: Memory["type"],
  timestamp: number,
  importance: number,
): Memory {
  return {
    id: `${agentId}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    description,
    timestamp,
    importance,
    embedding: pseudoEmbed(description),
    type,
    agentId,
  };
}

// Retrieve top-k memories using the Smallville scoring formula:
// score = α * recency + β * importance + γ * relevance
export function retrieveMemories(
  agent: AgentState,
  query: string,
  currentTime: number,
  k: number = 10,
  weights = { recency: 1.0, importance: 1.0, relevance: 1.0 },
): Memory[] {
  const queryEmb = pseudoEmbed(query);
  const decayRate = 0.995; // per-minute decay

  const scored = agent.memoryStream.map((mem) => {
    const minutesAgo = currentTime - mem.timestamp;
    const recency = Math.pow(decayRate, minutesAgo);
    const importance = mem.importance / 10; // normalize to 0-1
    const relevance = cosineSimilarity(queryEmb, mem.embedding);

    const score =
      weights.recency * recency +
      weights.importance * importance +
      weights.relevance * relevance;

    return { memory: mem, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.memory);
}

// Check if reflection should be triggered (accumulated importance > threshold)
export function shouldReflect(agent: AgentState, lastReflectionTime: number): boolean {
  const recentMemories = agent.memoryStream.filter(
    (m) => m.timestamp > lastReflectionTime && m.type !== "reflection",
  );
  const totalImportance = recentMemories.reduce((sum, m) => sum + m.importance, 0);
  return totalImportance >= 50; // threshold from paper
}
