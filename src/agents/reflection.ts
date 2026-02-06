import Anthropic from "@anthropic-ai/sdk";
import { AgentState, Memory } from "./types";
import { retrieveMemories, createMemory, scoreImportance } from "./memory-stream";

const anthropic = new Anthropic();

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

  const questionsResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are ${agent.name}. ${agent.description}

Given your recent experiences:
${memoryContext}

What are the 3 most salient high-level questions you can answer about your recent experiences? Respond with just the 3 questions, one per line.`,
      },
    ],
  });

  const questionsText =
    questionsResponse.content[0].type === "text" ? questionsResponse.content[0].text : "";
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

    const insightResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are ${agent.name}. Based on these memories:\n${context}\n\nAnswer this question with a concise insight (1-2 sentences): ${question}`,
        },
      ],
    });

    const insight =
      insightResponse.content[0].type === "text"
        ? insightResponse.content[0].text.trim()
        : "I need more time to think about this.";

    const importance = await scoreImportance(insight);
    reflections.push(createMemory(agent.id, insight, "reflection", currentTime, importance));
  }

  return reflections;
}
