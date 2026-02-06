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

  const memoryContext = recentMemories
    .map((m) => `- ${m.description}`)
    .join("\n");

  const questionsText = await chatCompletion(
    `You are ${agent.name}. ${agent.description}`,
    `Given your recent experiences:\n${memoryContext}\n\nWhat are the 3 most salient high-level questions you can answer about your recent experiences? Respond with just the 3 questions, one per line.`,
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
      `You are ${agent.name}. ${agent.description}`,
      `Based on these memories:\n${context}\n\nAnswer this question with a concise insight (1-2 sentences): ${question}`,
      200,
    );

    const importance = await scoreImportance(insight || "I need more time to think about this.");
    reflections.push(createMemory(agent.id, insight || "I need more time to think about this.", "reflection", currentTime, importance));
  }

  return reflections;
}
