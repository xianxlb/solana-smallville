import { chatCompletion } from "./llm";
import { AgentState, DailyPlan, Plan } from "./types";
import { retrieveMemories } from "./memory-stream";

export async function generateDailyPlan(
  agent: AgentState,
  currentTime: number,
  dayNumber: number,
  locationNames: string[],
): Promise<DailyPlan> {
  const recentMemories = retrieveMemories(
    agent,
    "What have I been doing recently? What are my goals?",
    currentTime,
    15,
  );

  const memoryContext = recentMemories
    .map((m) => `- [${m.type}] ${m.description}`)
    .join("\n");

  const text = await chatCompletion(
    `You are ${agent.name}. ${agent.description}`,
    `Today is Day ${dayNumber} in Solana Smallville. Available locations: ${locationNames.join(", ")}.

Your recent memories:
${memoryContext}

Generate a daily plan with 6-8 activities for today. Each activity should include:
- A brief description
- Start time (as minute of day, 0-1440, starting from 480 = 8am)
- Duration in minutes (15-120)
- Location name (must be from the available locations list)

Also provide a 1-sentence overview of your day.

Respond in JSON format:
{
  "overview": "...",
  "activities": [
    {"description": "...", "startTime": 480, "duration": 60, "location": "..."},
    ...
  ]
}`,
    1000,
  );
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { overview: "Explore the town", activities: [] };
  } catch {
    console.warn(`[${agent.name}] Failed to parse plan JSON, using fallback`);
    parsed = { overview: "Explore the town", activities: [] };
  }

  const hourlyBlocks: Plan[] = (parsed.activities || []).map((a: Record<string, unknown>) => ({
    description: a.description as string,
    startTime: a.startTime as number,
    duration: a.duration as number,
    location: a.location as string,
    status: "pending" as const,
  }));

  return {
    date: dayNumber,
    overview: parsed.overview || "A day in Solana Smallville",
    hourlyBlocks,
    currentAction: hourlyBlocks[0] || null,
  };
}

export function getCurrentAction(plan: DailyPlan, minuteOfDay: number): Plan | null {
  for (const block of plan.hourlyBlocks) {
    if (
      block.status !== "completed" &&
      minuteOfDay >= block.startTime &&
      minuteOfDay < block.startTime + block.duration
    ) {
      return block;
    }
  }
  // Find next pending action
  for (const block of plan.hourlyBlocks) {
    if (block.status === "pending" && block.startTime > minuteOfDay) {
      return block;
    }
  }
  return null;
}

export function advancePlan(plan: DailyPlan, minuteOfDay: number): void {
  for (const block of plan.hourlyBlocks) {
    if (block.status === "active" && minuteOfDay >= block.startTime + block.duration) {
      block.status = "completed";
    }
  }
  const next = getCurrentAction(plan, minuteOfDay);
  if (next && next.status === "pending" && minuteOfDay >= next.startTime) {
    next.status = "active";
    plan.currentAction = next;
  }
}
