import crypto from "crypto";

const AGENTWALLET_API = "https://agentwallet.mcpay.tech/api/wallets";

let username = "";
let apiToken = "";
let walletAddress = "";
let enabled = false;

// Queue for all events (always populated; txHash added when on-chain succeeds)
const eventLog: Array<{ hash: string; type: string; timestamp: number; txHash?: string }> = [];

export function initSolanaLogger() {
  username = process.env.AGENTWALLET_USERNAME || "";
  apiToken = process.env.AGENTWALLET_API_TOKEN || "";
  walletAddress = process.env.AGENTWALLET_SOLANA_ADDRESS || "";

  if (username && apiToken && walletAddress) {
    enabled = true;
    console.log(`Solana logger initialized via AgentWallet. Address: ${walletAddress}`);
  } else {
    console.log("AgentWallet credentials not set, on-chain logging disabled (events logged locally)");
  }
}

export function isLoggerEnabled(): boolean {
  return enabled;
}

export function getEventLog() {
  return eventLog;
}

export function getWalletAddress(): string {
  return walletAddress;
}

export function hashEvent(data: Record<string, unknown>): string {
  const json = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

// Log event on-chain via AgentWallet self-transfer (1 lamport)
// The tx hash on devnet serves as immutable proof of the event
export async function logOnChain(eventHash: string, memo: string): Promise<string | null> {
  const entry = { hash: eventHash, type: memo.split("|")[0], timestamp: Date.now() };
  eventLog.push(entry);

  if (!enabled) return null;

  try {
    const res = await fetch(`${AGENTWALLET_API}/${username}/actions/transfer-solana`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: walletAddress, // self-transfer
        amount: "1", // 1 lamport
        asset: "sol",
        network: "devnet",
      }),
    });

    const data = await res.json();
    if (data.txHash) {
      entry.txHash = data.txHash;
      console.log(`On-chain: ${memo} tx:${data.txHash.slice(0, 16)}...`);
      return data.txHash;
    }
    if (data.error) {
      console.warn(`On-chain log failed: ${JSON.stringify(data.error).slice(0, 80)}`);
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`On-chain log failed: ${msg.slice(0, 80)}`);
    return null;
  }
}

export async function logConversation(
  participants: string[],
  location: string,
  messageCount: number,
  timestamp: number,
): Promise<string | null> {
  const hash = hashEvent({
    type: "conversation",
    participants: participants.sort(),
    location,
    messageCount,
    timestamp,
  });
  return logOnChain(hash, `convo|${participants.join(",")}|${location}|${messageCount}msgs`);
}

export async function logReflection(
  agentId: string,
  insight: string,
  timestamp: number,
): Promise<string | null> {
  const hash = hashEvent({
    type: "reflection",
    agentId,
    insight: insight.slice(0, 100),
    timestamp,
  });
  return logOnChain(hash, `reflect|${agentId}|${insight.slice(0, 40)}`);
}

export async function logPlanCreated(
  agentId: string,
  overview: string,
  day: number,
): Promise<string | null> {
  const hash = hashEvent({ type: "plan", agentId, overview: overview.slice(0, 100), day });
  return logOnChain(hash, `plan|${agentId}|day${day}`);
}
