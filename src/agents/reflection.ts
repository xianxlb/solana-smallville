import { chatCompletion } from "./llm";
import { AgentState, Memory } from "./types";
import { retrieveMemories, createMemory, scoreImportance } from "./memory-stream";

export async function generateReflections(
  agent: AgentState,
  currentTime: number,
): Promise<Memory[]> {
  // Step 1: Ask what are the most salient questions
  const recentMemories = retrieveMemories(
    agent,
    "What are my most important recent experiences?",
    currentTime,
    20,
  );

  if (recentMemories.length < 5) return []; // not enough to reflect on

  const memoryContext = recentMemories
    .map((m) => `- ${m.description}`)
    .join("\n");

  const systemPrompt = `You are ${agent.name}, living in Solana Smallville. ${agent.description}

IMPORTANT: You are fully immersed in this world. Your memories are real experiences. Never break character, never say "these memories don't actually" or question the format. Simply reflect on your experiences naturally as ${agent.name} would.`;

  const questionsText = await chatCompletion(
    systemPrompt,
    `Here are your recent experiences:\n${memoryContext}\n\nWhat are the 3 most important questions you find yourself thinking about based on these experiences? Respond with just the 3 questions, one per line.`,
    300,
  );

  const questions = questionsText
    .split("\n")
    .map((q) => q.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((q) => q.length > 0)
    .slice(0, 3);

  // Step 2: For each question, retrieve relevant memories and generate insight
  const reflections: Memory[] = [];

  for (const question of questions) {
    const relevantMemories = retrieveMemories(agent, question, currentTime, 10);
    const context = relevantMemories.map((m) => `- ${m.description}`).join("\n");

    const insight = await chatCompletion(
      systemPrompt,
      `Reflecting on your experiences:\n${context}\n\nAs ${agent.name}, what is your insight about: ${question}\n\nRespond with a concise 1-2 sentence insight in first person. Stay fully in character.`,
      200,
    );

    const importance = await scoreImportance(insight || "I need more time to think about this.");
    reflections.push(createMemory(agent.id, insight || "I need more time to think about this.", "reflection", currentTime, importance));
  }

  return reflections;
}
