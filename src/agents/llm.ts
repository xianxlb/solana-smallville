import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

// Simple queue to rate limit Claude API calls
// Sonnet 4.5 has generous limits but we don't want 8 agents hammering at once
const queue: Array<() => Promise<void>> = [];
let running = 0;
const MAX_CONCURRENT = 3;
const MIN_DELAY_MS = 200;

export async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const execute = async () => {
      running++;
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        running--;
        setTimeout(() => {
          const next = queue.shift();
          if (next) next();
        }, MIN_DELAY_MS);
      }
    };

    if (running < MAX_CONCURRENT) {
      execute();
    } else {
      queue.push(execute);
    }
  });
}

export async function chatCompletion(
  systemPrompt: string | undefined,
  userMessage: string,
  maxTokens: number = 500,
  model: string = "claude-sonnet-4-5-20250929",
): Promise<string> {
  return rateLimitedCall(async () => {
    const response = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: userMessage }],
    });
    return response.content[0].type === "text" ? response.content[0].text.trim() : "";
  });
}
